// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { onDeviceCallSchema } from '../../shared/onDeviceCall';
import { runIdentification } from '../../server/identify/pipeline';
import { createMockProviders } from '../../server/providers/mock/mockProviders';
import { parseIdentifyForm } from '../../server/validation/upload';
import { buildIdentifyForm } from '../../src/lib/api';
import { createBirdnetClient, OnDeviceError } from '../../src/features/listen/birdnet/client';
import { frameCount, melKernel } from '../../src/features/listen/birdnet/melSpec';
import { toOnDeviceCall } from '../../src/features/listen/birdnet/onDevice';
import {
  createBirdnetHandler,
  ModelNotDownloadedError,
  type BirdnetModel,
  type BirdnetReply,
  type BirdnetRequest,
} from '../../src/features/listen/birdnet/protocol';
import type { BirdnetLabel } from '../../src/features/listen/birdnet/scores';

const SR = 48_000;

describe('BirdNET spectrogram kernel', () => {
  it('equals Hann window → real part of the DFT → mel filterbank', () => {
    const N = 16;
    const bins = N / 2 + 1;
    const mels = 3;
    const fb = Array.from({ length: bins }, (_, j) =>
      Array.from({ length: mels }, (_, m) => ((j * 7 + m * 3) % 5) / 5),
    );
    const frame = Array.from({ length: N }, (_, n) => Math.sin(n * 1.3) + 0.2 * Math.cos(n * 0.4));
    const kernel = melKernel(N, fb);
    for (let m = 0; m < mels; m++) {
      // Direct: windowed frame, real DFT bins, then the filterbank.
      let expected = 0;
      for (let j = 0; j < bins; j++) {
        let re = 0;
        for (let n = 0; n < N; n++) {
          const hann = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / N);
          re += hann * frame[n] * Math.cos((2 * Math.PI * j * n) / N);
        }
        expected += re * fb[j][m];
      }
      let got = 0;
      for (let n = 0; n < N; n++) got += frame[n] * kernel[n * mels + m];
      expect(got).toBeCloseTo(expected, 5);
    }
  });

  it('gives both of v2.4’s spectrograms 511 frames per 3 s window', () => {
    expect(frameCount(144_000, 2048, 278)).toBe(511);
    expect(frameCount(144_000, 1024, 280)).toBe(511);
    expect(() => melKernel(16, [[1]])).toThrow(RangeError);
  });
});

const labels: BirdnetLabel[] = [
  { scientificName: 'Cardinalis cardinalis', commonName: 'Northern Cardinal', notSpecies: false },
  { scientificName: 'Turdus merula', commonName: 'Eurasian Blackbird', notSpecies: false },
  { scientificName: 'Dog', commonName: 'Dog', notSpecies: true },
];

/** A fake model: the cardinal sings throughout; a blackbird in the first window of each batch. */
function fakeModel(overrides: Partial<BirdnetModel> = {}) {
  const predict = vi.fn(async (batch: Float32Array, windows: number) => {
    expect(batch.length).toBe(windows * 144_000);
    return Array.from({ length: windows }, (_, i) =>
      Float32Array.from([0.8, i === 0 ? 0.9 : 0.01, 0.05]),
    );
  });
  const geo = vi.fn(async () => Float32Array.from([0.5, 0.01, 1]));
  return { backend: 'fake', labels, predict, geo, ...overrides } satisfies BirdnetModel;
}

const identify = (seconds: number, extra: Partial<BirdnetRequest> = {}): BirdnetRequest =>
  ({
    id: 2,
    type: 'identify',
    samples: new Float32Array(Math.round(seconds * SR)),
    sampleRate: SR,
    ...extra,
  }) as BirdnetRequest;

describe('BirdNET worker protocol', () => {
  it('loads the model once and reports the backend', async () => {
    const model = fakeModel();
    const load = vi.fn(async () => model);
    const handle = createBirdnetHandler(load);
    expect(await handle({ id: 1, type: 'load' })).toMatchObject({
      id: 1,
      type: 'loaded',
      backend: 'fake',
    });
    await handle(identify(5));
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('frames like the Space, batches windows and ranks by the mean', async () => {
    const model = fakeModel();
    const handle = createBirdnetHandler(async () => model);
    const reply = await handle(identify(10, { k: 5 }));
    expect(reply.type).toBe('result');
    if (reply.type !== 'result') return;
    // 10 s → windows at 0, 1.5 … 7.5 s: six, sent as 4 + 2.
    expect(model.predict.mock.calls.map((c) => c[1])).toEqual([4, 2]);
    expect(reply.result.results.map((r) => r.common)).toEqual([
      'Northern Cardinal',
      'Eurasian Blackbird',
    ]);
    expect(reply.result.results[0]).toMatchObject({ score: 0.8, mean: 0.8, segments: 6, of: 6 });
    expect(reply.result).toMatchObject({ seconds: 10, backend: 'fake', sound: null });
    expect(model.geo).not.toHaveBeenCalled();
  });

  it('applies the location model (cached per place and week)', async () => {
    const model = fakeModel();
    const handle = createBirdnetHandler(async () => model);
    const location = { latitude: 51.5, longitude: -0.12 };
    const first = await handle(identify(4, { location, week: 15 }));
    await handle(identify(4, { location, week: 15 }));
    expect(model.geo).toHaveBeenCalledTimes(1);
    expect(model.geo).toHaveBeenCalledWith(51.5, -0.12, 15);
    // The blackbird scores 0.01 on the location model, under the 0.03 cut-off.
    expect(first.type === 'result' && first.result.results.map((r) => r.common)).toEqual([
      'Northern Cardinal',
    ]);
  });

  it('resamples other rates to 48 kHz', async () => {
    const model = fakeModel();
    const handle = createBirdnetHandler(async () => model);
    const reply = await handle(
      identify(0, { samples: new Float32Array(6 * 16_000), sampleRate: 16_000 }),
    );
    expect(reply.type === 'result' && reply.result.seconds).toBe(6);
  });

  it('reports errors with codes, and retries a failed load', async () => {
    const load = vi
      .fn<() => Promise<BirdnetModel>>()
      .mockRejectedValueOnce(new ModelNotDownloadedError())
      .mockRejectedValueOnce(new Error('WebGL lost'))
      .mockResolvedValue(fakeModel());
    const handle = createBirdnetHandler(load);
    expect(await handle(identify(5))).toMatchObject({ type: 'error', code: 'not_downloaded' });
    expect(await handle(identify(5))).toMatchObject({
      type: 'error',
      code: 'failed',
      message: 'WebGL lost',
    });
    expect(await handle(identify(0.5))).toMatchObject({ type: 'error', code: 'too_short' });
    expect((await handle(identify(5))).type).toBe('result');
  });
});

/** A fake worker running the real handler in-process. */
function fakeWorker(handle: (r: BirdnetRequest) => Promise<BirdnetReply>, delay = 0) {
  const worker = {
    onmessage: null as ((e: MessageEvent<BirdnetReply>) => void) | null,
    onerror: null as ((e: ErrorEvent) => void) | null,
    terminated: false,
    transfers: [] as Transferable[][],
    postMessage(message: BirdnetRequest, transfer: Transferable[] = []) {
      worker.transfers.push(transfer);
      void handle(message).then((reply) =>
        setTimeout(() => worker.onmessage?.({ data: reply } as MessageEvent<BirdnetReply>), delay),
      );
    },
    terminate() {
      worker.terminated = true;
    },
  };
  return worker;
}

describe('BirdNET worker client', () => {
  afterEach(() => vi.useRealTimers());

  it('sends a copy of the audio with the week, and returns the result', async () => {
    const model = fakeModel();
    const handler = createBirdnetHandler(async () => model);
    const seen: BirdnetRequest[] = [];
    const worker = fakeWorker(async (r) => (seen.push(r), handler(r)));
    const client = createBirdnetClient(() => worker);
    const samples = new Float32Array(5 * SR);
    const result = await client.identify(samples, {
      sampleRate: SR,
      capturedAt: new Date('2026-05-15T12:00:00Z'),
      location: { latitude: 42.4, longitude: -76.5 },
      k: 5,
    });
    expect(result.results[0].name).toBe('Cardinalis cardinalis');
    expect(seen[0]).toMatchObject({ type: 'identify', week: 19, sampleRate: SR, k: 5 });
    expect(worker.transfers[0]).toHaveLength(1);
    expect(samples.length).toBe(5 * SR); // the caller's buffer isn't detached
  });

  it('turns error replies into OnDeviceError', async () => {
    const handler = createBirdnetHandler(async () => {
      throw new ModelNotDownloadedError();
    });
    const client = createBirdnetClient(() => fakeWorker(handler));
    await expect(client.load()).rejects.toMatchObject({
      name: 'OnDeviceError',
      code: 'not_downloaded',
    });
  });

  it('times out, stops the stuck worker and starts a fresh one next time', async () => {
    vi.useFakeTimers();
    const model = fakeModel();
    const handler = createBirdnetHandler(async () => model);
    const workers: ReturnType<typeof fakeWorker>[] = [];
    const client = createBirdnetClient(() => {
      workers.push(fakeWorker(handler, 10_000));
      return workers.at(-1)!;
    });
    const pending = client.load(1_000);
    const check = expect(pending).rejects.toBeInstanceOf(OnDeviceError);
    await vi.advanceTimersByTimeAsync(1_000);
    await check;
    expect(workers[0].terminated).toBe(true);
    const next = client.load(20_000);
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(next).resolves.toMatchObject({ backend: 'fake' });
    expect(workers).toHaveLength(2);
  });
});

describe('On-device results on the server', () => {
  const onDevice = () =>
    toOnDeviceCall({
      results: [
        {
          name: 'Cardinalis cardinalis',
          common: 'Northern Cardinal',
          score: 0.91,
          mean: 0.6,
          segments: 5,
          of: 6,
        },
      ],
      sound: null,
      seconds: 9.5,
      backend: 'webgl',
      ms: 300,
    });

  it('sends the result instead of the recording', () => {
    const form = buildIdentifyForm(
      {
        observationId: 'o1',
        category: 'bird',
        images: [],
        audio: new Blob(['x']),
        birdnet: onDevice(),
        capturedAt: new Date('2026-05-15T12:00:00Z'),
      },
      undefined,
    );
    expect(form.get('audio')).toBeNull();
    expect(onDeviceCallSchema.parse(JSON.parse(form.get('birdnet') as string))).toEqual(onDevice());
  });

  it('parses it as a call, and rejects malformed results', async () => {
    const form = (value: string) => {
      const f = new FormData();
      f.append('category', 'bird');
      f.append('birdnet', value);
      return f;
    };
    const input = await parseIdentifyForm(form(JSON.stringify(onDevice())));
    expect(input.audio).toMatchObject({ seconds: 9.5, onDevice: onDevice() });
    expect(input.images).toEqual([]);
    for (const bad of [
      'not json',
      JSON.stringify({ ...onDevice(), model: 'other' }),
      JSON.stringify({ ...onDevice(), results: [{ name: '<script>', score: 2, mean: 0 }] }),
      JSON.stringify({ ...onDevice(), seconds: 600 }),
    ]) {
      await expect(parseIdentifyForm(form(bad))).rejects.toMatchObject({
        code: 'invalid_request',
      });
    }
  });

  it('enriches it without the Space, crediting BirdNET on the device', async () => {
    const providers = { ...createMockProviders('high'), audio: undefined };
    const result = await runIdentification(
      {
        observationId: 'o',
        category: 'bird',
        images: [],
        audio: {
          data: new Uint8Array(0),
          mimeType: 'audio/wav',
          seconds: 9.5,
          onDevice: onDevice(),
        },
        location: { latitude: 42.44, longitude: -76.5 },
        capturedAt: new Date('2026-05-15T12:00:00Z'),
      },
      { providers },
    );
    expect(result.call).toBe(true);
    expect(result.candidates[0].scientificName).toBe('Cardinalis cardinalis');
    expect(result.attribution.some((a) => /on this device/.test(a.text))).toBe(true);
  });
});
