/**
 * The page's side of the BirdNET worker: starts it on first use, matches replies to requests,
 * and times out. The worker (and TF.js with it) is only fetched when this is first called.
 */
import type {
  BirdnetErrorCode,
  BirdnetReply,
  BirdnetRequest,
  OnDeviceIdentification,
} from './protocol';
import { birdnetWeek } from './scores';

export class OnDeviceError extends Error {
  constructor(
    readonly code: BirdnetErrorCode | 'timeout' | 'unavailable',
    message: string,
  ) {
    super(message);
    this.name = 'OnDeviceError';
  }
}

type WorkerLike = Pick<Worker, 'postMessage' | 'terminate'> & {
  onmessage: ((e: MessageEvent<BirdnetReply>) => void) | null;
  onerror: ((e: ErrorEvent) => void) | null;
};

/** Distributive Omit, so each request variant keeps its own fields. */
type RequestBody = BirdnetRequest extends infer R
  ? R extends unknown
    ? Omit<R, 'id'>
    : never
  : never;

export type BirdnetClient = {
  /** Loads the model and compiles it, so the next identification is quick. */
  load(timeoutMs?: number): Promise<{ backend: string; ms: number }>;
  identify(
    samples: Float32Array,
    options: {
      sampleRate: number;
      location?: { latitude: number; longitude: number };
      capturedAt: Date;
      k?: number;
      timeoutMs?: number;
    },
  ): Promise<OnDeviceIdentification>;
  terminate(): void;
};

/** First load reads ~82 MB from the cache and compiles shaders; phones can take a while. */
const LOAD_TIMEOUT_MS = 60_000;
const IDENTIFY_TIMEOUT_MS = 90_000;

export function createBirdnetClient(
  createWorker: () => WorkerLike = () =>
    new Worker(new URL('./birdnetWorker.ts', import.meta.url), { type: 'module', name: 'birdnet' }),
): BirdnetClient {
  let worker: WorkerLike | undefined;
  let nextId = 1;
  const pending = new Map<
    number,
    {
      resolve: (r: BirdnetReply) => void;
      reject: (e: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  const failAll = (error: Error) => {
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
  };

  const terminate = () => {
    worker?.terminate();
    worker = undefined;
    failAll(new OnDeviceError('unavailable', 'The on-device model was stopped.'));
  };

  const getWorker = (): WorkerLike => {
    if (worker) return worker;
    const w = createWorker();
    w.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      clearTimeout(p.timer);
      p.resolve(e.data);
    };
    w.onerror = (e) => {
      // A crashed worker (e.g. the script failed to load) can't answer anything: start over.
      e.preventDefault?.();
      terminate();
    };
    worker = w;
    return w;
  };

  const send = (body: RequestBody, timeoutMs: number, transfer: Transferable[] = []) =>
    new Promise<BirdnetReply>((resolve, reject) => {
      const id = nextId++;
      const w = getWorker();
      const timer = setTimeout(() => {
        pending.delete(id);
        // A stuck model (e.g. a GPU hang) won't recover; the next call starts a fresh worker.
        terminate();
        reject(new OnDeviceError('timeout', 'Identifying on this device took too long.'));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        w.postMessage({ ...body, id } as BirdnetRequest, transfer);
      } catch (e) {
        pending.delete(id);
        clearTimeout(timer);
        reject(new OnDeviceError('unavailable', e instanceof Error ? e.message : String(e)));
      }
    });

  const unwrap = (reply: BirdnetReply) => {
    if (reply.type === 'error') throw new OnDeviceError(reply.code, reply.message);
    return reply;
  };

  return {
    async load(timeoutMs = LOAD_TIMEOUT_MS) {
      const reply = unwrap(await send({ type: 'load' }, timeoutMs));
      if (reply.type !== 'loaded') throw new OnDeviceError('failed', 'Unexpected reply.');
      return { backend: reply.backend, ms: reply.ms };
    },
    async identify(
      samples,
      { sampleRate, location, capturedAt, k, timeoutMs = IDENTIFY_TIMEOUT_MS },
    ) {
      // Copy, so the caller's buffer isn't detached by the transfer.
      const copy = samples.slice();
      const reply = unwrap(
        await send(
          {
            type: 'identify',
            samples: copy,
            sampleRate,
            location: location && { latitude: location.latitude, longitude: location.longitude },
            week: birdnetWeek(capturedAt),
            k,
          },
          timeoutMs,
          [copy.buffer],
        ),
      );
      if (reply.type !== 'result') throw new OnDeviceError('failed', 'Unexpected reply.');
      return reply.result;
    },
    terminate,
  };
}

let shared: BirdnetClient | undefined;

/** The app's single BirdNET worker. */
export function birdnetClient(): BirdnetClient {
  return (shared ??= createBirdnetClient());
}

/** Stops the worker and frees its memory (e.g. when the model is removed). */
export function stopBirdnet(): void {
  shared?.terminate();
  shared = undefined;
}
