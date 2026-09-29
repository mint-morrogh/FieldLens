/**
 * The only module that talks to the FieldLens API. Components call these
 * functions; they never fetch providers directly.
 */
import { apiErrorSchema, healthResponseSchema, identifyResponseSchema } from '../../shared/schemas';
import type { OnDeviceCall } from '../../shared/onDeviceCall';
import type {
  ApiErrorCode,
  ApproxLocation,
  FeatureId,
  HealthResponse,
  IdentifyResponse,
  IdentifyTarget,
  StageEvent,
  TiltBucket,
} from '../../shared/types';
import { getMockScenario } from './mockScenario';

export type ClientErrorCode = ApiErrorCode | 'offline' | 'network' | 'bad_response' | 'aborted';

export class ClientError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ClientError';
  }
}

export type IdentifyRequest = {
  observationId: string;
  category: IdentifyTarget;
  images: { blob: Blob; feature: FeatureId }[];
  /** Calls: a short mono WAV recording, identified instead of photos. */
  audio?: Blob;
  /** Calls identified on the device: BirdNET's result, sent instead of the recording. */
  birdnet?: OnDeviceCall;
  location?: ApproxLocation;
  /** "photo" when the position came from the photo's own GPS rather than the device. */
  locationSource?: 'photo';
  capturedAt: Date;
  /**
   * Where `capturedAt` came from, so the local hour can be sent: "device" = the phone clock
   * at capture (camera, live, calls); "photo" = an EXIF date, whose time zone is unknown, so
   * the hour is marked approximate. Omitted when the capture time isn't known.
   */
  timeSource?: 'device' | 'photo';
  /** Which way the camera pointed when the photo was taken (camera photos only). */
  tilt?: TiltBucket;
};

/** Wall-clock hour of a date on this device, e.g. 21.5 for 9:30 pm. */
export function localHourOf(date: Date): number {
  return Math.round((date.getHours() + date.getMinutes() / 60) * 100) / 100;
}

export type IdentifyOptions = {
  onUploadProgress?: (fraction: number) => void;
  /** Live pipeline progress, streamed by the server as each stage happens. */
  onStage?: (event: StageEvent) => void;
  signal?: AbortSignal;
};

export function buildIdentifyForm(
  req: IdentifyRequest,
  mockScenario = getMockScenario(),
): FormData {
  const form = new FormData();
  form.append('category', req.category);
  form.append('observationId', req.observationId);
  form.append('capturedAt', req.capturedAt.toISOString());
  if (req.timeSource && !Number.isNaN(req.capturedAt.getTime())) {
    form.append('localHour', String(localHourOf(req.capturedAt)));
    if (req.timeSource === 'photo') form.append('localHourApprox', '1');
  }
  if (req.tilt) form.append('tilt', req.tilt);
  req.images.forEach((img, i) => {
    form.append('images', img.blob, `photo-${i + 1}.jpg`);
    form.append('features', img.feature);
  });
  if (req.birdnet) form.append('birdnet', JSON.stringify(req.birdnet));
  else if (req.audio) form.append('audio', req.audio, 'call.wav');
  if (req.location) {
    form.append('latitude', String(req.location.latitude));
    form.append('longitude', String(req.location.longitude));
    if (req.locationSource) form.append('locationSource', req.locationSource);
  }
  if (mockScenario) form.append('mockScenario', mockScenario);
  return form;
}
function parseError(status: number, body: unknown): ClientError {
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    return new ClientError(
      parsed.data.error.code as ClientErrorCode,
      parsed.data.error.message,
      parsed.data.error.retryAfterSeconds,
    );
  }
  if (status === 429)
    return new ClientError(
      'rate_limited',
      'Too many requests. Please wait a moment and try again.',
    );
  if (status === 404)
    return new ClientError(
      'not_configured',
      'The identification service could not be reached on this deployment.',
    );
  return new ClientError('internal_error', 'Something went wrong. Please try again.');
}

/**
 * Parses complete NDJSON lines from a growing response body.
 * Returns the parsed lines and how many characters were consumed.
 */
export function readNdjson(text: string, from: number): { lines: unknown[]; next: number } {
  const lines: unknown[] = [];
  let next = from;
  let newline = text.indexOf('\n', next);
  while (newline !== -1) {
    const raw = text.slice(next, newline).trim();
    if (raw) {
      try {
        lines.push(JSON.parse(raw));
      } catch {
        /* ignore a malformed line; the final result line is validated separately */
      }
    }
    next = newline + 1;
    newline = text.indexOf('\n', next);
  }
  return { lines, next };
}

function isStageLine(line: unknown): line is { type: 'stage' } & StageEvent {
  return typeof line === 'object' && line !== null && (line as { type?: unknown }).type === 'stage';
}

/**
 * Upload with progress (XHR, since fetch cannot report upload progress), then
 * read the streamed NDJSON response so each pipeline stage can be shown live.
 * A plain JSON body (errors before processing starts) is handled too.
 */
export function identify(
  req: IdentifyRequest,
  options: IdentifyOptions = {},
): Promise<IdentifyResponse> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.reject(new ClientError('offline', 'You’re offline.'));
  }
  const form = buildIdentifyForm(req);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/identify');
    xhr.setRequestHeader('Accept', 'application/x-ndjson, application/json');
    xhr.responseType = 'text';
    xhr.timeout = 60_000;
    let consumed = 0;
    const isStream = () =>
      (xhr.getResponseHeader('content-type') ?? '').includes('application/x-ndjson');
    const drain = () => {
      if (!isStream()) return [];
      const { lines, next } = readNdjson(xhr.responseText, consumed);
      consumed = next;
      for (const line of lines) if (isStageLine(line)) options.onStage?.(line);
      return lines;
    };
    const finalLines: unknown[] = [];

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) options.onUploadProgress?.(e.loaded / e.total);
    };
    xhr.upload.onload = () => options.onUploadProgress?.(1);
    xhr.onprogress = () => finalLines.push(...drain());
    xhr.onerror = () =>
      reject(
        navigator.onLine === false
          ? new ClientError('offline', 'You’re offline.')
          : new ClientError(
              'network',
              'We couldn’t reach FieldLens. Check your connection and try again.',
            ),
      );
    xhr.ontimeout = () =>
      reject(new ClientError('provider_timeout', 'This is taking too long. Please try again.'));
    xhr.onabort = () => reject(new ClientError('aborted', 'Cancelled.'));
    xhr.onload = () => {
      let body: unknown;
      if (isStream()) {
        // Flush any trailing line without a newline, then use the final result/error line.
        finalLines.push(...drain());
        const tail = xhr.responseText.slice(consumed).trim();
        if (tail) finalLines.push(...readNdjson(tail + '\n', 0).lines);
        const last = finalLines
          .filter((l): l is { type: string } => typeof l === 'object' && l !== null)
          .reverse()
          .find((l) => l.type === 'result' || l.type === 'error');
        if (!last) {
          reject(new ClientError('bad_response', 'The response ended early. Please try again.'));
          return;
        }
        if (last.type === 'error') {
          const e = last as unknown as { status?: number; error: unknown };
          reject(parseError(e.status ?? 500, { error: e.error }));
          return;
        }
        body = (last as unknown as { result: unknown }).result;
      } else {
        try {
          body = JSON.parse(xhr.responseText);
        } catch {
          reject(parseError(xhr.status, undefined));
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(parseError(xhr.status, body));
          return;
        }
      }
      const parsed = identifyResponseSchema.safeParse(body);
      if (!parsed.success) {
        reject(
          new ClientError('bad_response', 'We received an unexpected response. Please try again.'),
        );
        return;
      }
      resolve(parsed.data);
    };
    options.signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

export async function getHealth(): Promise<HealthResponse | undefined> {
  try {
    const res = await fetch('/api/health', { headers: { Accept: 'application/json' } });
    if (!res.ok) return undefined;
    const parsed = healthResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
