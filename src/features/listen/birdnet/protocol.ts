/**
 * The message protocol between the page and the BirdNET worker, and the worker's logic with
 * the model abstracted away, so it can be tested with a fake model and no TF.js.
 *
 * Processing matches the Hugging Face Space (`identify_audio` in hf-space/birdnet_audio.py):
 * mono 48 kHz, 3 s windows with a 1.5 s hop and a zero-padded tail, per-window probabilities,
 * species ranked by the mean over windows, best window as `score`, the location model's
 * 0.03 filter, and noise classes held back (see ./audioWindows.ts and ./scores.ts).
 */
import { BIRDNET_V24, frameWindows, resample, toBatch } from './audioWindows';
import { rankDetections, type BirdnetLabel, type OnDeviceResponse } from './scores';

/** The Space reads at most 30 s; the app records at most 15 s. */
export const MAX_SECONDS = 30;
/** Same as the Space's MIN_SECONDS. */
export const MIN_SECONDS = 1;
/** Windows per model call: bounds GPU memory on phones (one window is 144,000 samples). */
export const BATCH_WINDOWS = 4;

export type BirdnetRequest =
  | { id: number; type: 'load' }
  | {
      id: number;
      type: 'identify';
      /** Mono samples in [-1, 1]. Resampled to 48 kHz if `sampleRate` differs. */
      samples: Float32Array;
      sampleRate: number;
      location?: { latitude: number; longitude: number };
      /** BirdNET's 48-week year (see `birdnetWeek`), for the location model. */
      week?: number;
      /** How many species to return (the server asks the Space for `CANDIDATES.maxCandidates`). */
      k?: number;
    };

export type OnDeviceIdentification = OnDeviceResponse & {
  /** Length of the audio analysed. */
  seconds: number;
  backend: string;
  /** Inference time, excluding loading the model. */
  ms: number;
};

export type BirdnetErrorCode = 'not_downloaded' | 'too_short' | 'failed';

export type BirdnetReply =
  | { id: number; type: 'loaded'; backend: string; ms: number }
  | { id: number; type: 'result'; result: OnDeviceIdentification }
  | { id: number; type: 'error'; code: BirdnetErrorCode; message: string };

/** What the worker needs from a loaded model (TF.js in the app, a fake in tests). */
export interface BirdnetModel {
  readonly backend: string;
  readonly labels: readonly BirdnetLabel[];
  /**
   * Class probabilities (after the model's own sigmoid) for `windows` windows packed in
   * `batch` ([windows × 144,000]), one row per window.
   */
  predict(batch: Float32Array, windows: number): Promise<Float32Array[]>;
  /** The location model's occurrence scores for [lat, lon, week] (week -1 = all year). */
  geo(latitude: number, longitude: number, week?: number): Promise<Float32Array>;
}

/** Thrown by a model loader when the files aren't in the cache. */
export class ModelNotDownloadedError extends Error {
  constructor() {
    super('The BirdNET model isn’t downloaded on this device.');
    this.name = 'ModelNotDownloadedError';
  }
}

class TooShortError extends Error {}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * The worker's message handler. The model is loaded once, on the first message, and reused;
 * a failed load is retried on the next message.
 */
export function createBirdnetHandler(
  loadModel: () => Promise<BirdnetModel>,
): (request: BirdnetRequest) => Promise<BirdnetReply> {
  let model: Promise<BirdnetModel> | undefined;
  const geoCache = new Map<string, Float32Array>();

  const getModel = () => {
    model ??= loadModel().catch((e: unknown) => {
      model = undefined;
      throw e;
    });
    return model;
  };

  const geo = async (m: BirdnetModel, lat: number, lon: number, week?: number) => {
    const key = `${lat.toFixed(2)},${lon.toFixed(2)},${week ?? -1}`;
    let scores = geoCache.get(key);
    if (!scores) {
      scores = await m.geo(lat, lon, week);
      if (geoCache.size > 16) geoCache.clear();
      geoCache.set(key, scores);
    }
    return scores;
  };

  return async (request) => {
    const { id } = request;
    try {
      const started = now();
      const m = await getModel();
      if (request.type === 'load') {
        return { id, type: 'loaded', backend: m.backend, ms: Math.round(now() - started) };
      }
      const inferStart = now();
      const { windowSamples, sampleRate } = BIRDNET_V24;
      let samples =
        request.sampleRate === sampleRate
          ? request.samples
          : resample(request.samples, request.sampleRate, sampleRate);
      samples = samples.subarray(0, MAX_SECONDS * sampleRate);
      if (samples.length < MIN_SECONDS * sampleRate) throw new TooShortError();
      const windows = frameWindows(samples, BIRDNET_V24);
      const probs: Float32Array[] = [];
      for (let i = 0; i < windows.length; i += BATCH_WINDOWS) {
        const part = windows.slice(i, i + BATCH_WINDOWS);
        const rows = await m.predict(toBatch(part, windowSamples), part.length);
        if (rows.length !== part.length)
          throw new Error('The model returned the wrong batch size.');
        probs.push(...rows);
      }
      const { location, week } = request;
      const geoScores = location
        ? await geo(m, location.latitude, location.longitude, week)
        : undefined;
      const ranked = rankDetections(probs, m.labels, { geo: geoScores, k: request.k });
      return {
        id,
        type: 'result',
        result: {
          ...ranked,
          seconds: Math.round((samples.length / sampleRate) * 10) / 10,
          backend: m.backend,
          ms: Math.round(now() - inferStart),
        },
      };
    } catch (e) {
      if (e instanceof ModelNotDownloadedError) {
        return { id, type: 'error', code: 'not_downloaded', message: e.message };
      }
      if (e instanceof TooShortError) {
        return { id, type: 'error', code: 'too_short', message: 'Recording too short.' };
      }
      return {
        id,
        type: 'error',
        code: 'failed',
        message: e instanceof Error ? e.message : String(e),
      };
    }
  };
}
