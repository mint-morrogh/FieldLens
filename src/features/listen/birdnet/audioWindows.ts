/**
 * Audio front end for running BirdNET on the device (prototype, not wired into the UI).
 * See docs/research/birdnet-browser.md.
 *
 * BirdNET takes raw mono samples; the spectrogram is computed inside the model. This module
 * only gets the samples into shape: mono, the model's sample rate, and fixed-length windows
 * with overlap. It's pure TypeScript with no Web Audio dependency, so it runs in a worker
 * and in unit tests.
 */

export type BirdnetWindowConfig = {
  /** Sample rate the model expects. */
  sampleRate: number;
  /** Window length in samples. */
  windowSamples: number;
  /** Step between window starts in samples (window minus overlap). */
  hopSamples: number;
  /** A trailing partial window shorter than this is dropped (unless it's the only one). */
  minSamples: number;
};

/**
 * BirdNET v2.4: 3 s at 48 kHz, 1.5 s overlap, trailing windows under 1 s dropped.
 * Matches `_segments` in hf-space/birdnet_audio.py, so on-device and Space results line up.
 */
export const BIRDNET_V24: BirdnetWindowConfig = {
  sampleRate: 48_000,
  windowSamples: 144_000,
  hopSamples: 72_000,
  minSamples: 48_000,
};

/** BirdNET+ V3.0 developer preview: 32 kHz input; 3 s windows are the demo's default. */
export const BIRDNET_V3_PREVIEW: BirdnetWindowConfig = {
  sampleRate: 32_000,
  windowSamples: 96_000,
  hopSamples: 48_000,
  minSamples: 32_000,
};

/** Averages channels into one. A single channel is returned as-is (not copied). */
export function toMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const n = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i] += c[i];
  for (let i = 0; i < n; i++) out[i] /= channels.length;
  return out;
}

/** sin(πx)/(πx). */
function sinc(x: number): number {
  if (x === 0) return 1;
  const p = Math.PI * x;
  return Math.sin(p) / p;
}

/**
 * Band-limited resampling with a Blackman-windowed sinc. When downsampling, the cutoff drops
 * to just below the new Nyquist frequency, so tones above it are removed rather than folded
 * back into the birdsong band. Output length is round(n * to / from).
 *
 * In the app, Web Audio normally does this (an AudioContext or OfflineAudioContext created at
 * the model's rate); this is the fallback for browsers that ignore the requested rate.
 */
export function resample(
  input: Float32Array,
  fromRate: number,
  toRate: number,
  zeroCrossings = 16,
): Float32Array {
  if (!(fromRate > 0) || !(toRate > 0)) throw new RangeError('Sample rates must be positive');
  if (fromRate === toRate) return input.slice();
  const ratio = toRate / fromRate;
  const outLength = Math.round(input.length * ratio);
  const out = new Float32Array(outLength);
  if (input.length === 0) return out;
  // Cutoff relative to the input's Nyquist frequency, with a little room for the transition band.
  const cutoff = Math.min(1, ratio) * 0.95;
  const half = Math.ceil(zeroCrossings / cutoff);
  const last = input.length - 1;
  for (let j = 0; j < outLength; j++) {
    const t = j / ratio;
    const centre = Math.floor(t);
    let acc = 0;
    let weight = 0;
    for (let i = centre - half + 1; i <= centre + half; i++) {
      const d = t - i;
      if (Math.abs(d) >= half) continue;
      const w =
        0.42 + 0.5 * Math.cos((Math.PI * d) / half) + 0.08 * Math.cos((2 * Math.PI * d) / half);
      const h = cutoff * sinc(cutoff * d) * w;
      // Clamp at the edges so the ends don't fade towards zero.
      acc += input[i < 0 ? 0 : i > last ? last : i] * h;
      weight += h;
    }
    out[j] = weight !== 0 ? acc / weight : 0;
  }
  return out;
}

export type AudioWindow = {
  /** Window start, in seconds from the start of the recording. */
  start: number;
  /** Exactly `windowSamples` long; a trailing partial window is zero-padded. */
  samples: Float32Array;
  /** How many samples are real audio rather than padding. */
  filled: number;
};

/**
 * Streaming window framer for live listening: push mic samples (already mono, at the model's
 * rate) as they arrive and get back each window as soon as it's complete. `flush()` returns
 * the trailing partial window(s) when recording stops. Only the samples still needed for a
 * future window are kept, so memory stays at about one window.
 */
export class WindowChunker {
  private buffer: Float32Array;
  private length = 0;
  /** Absolute sample index of buffer[0], which is always the next window's start. */
  private offset = 0;
  private total = 0;
  private emitted = 0;

  constructor(private readonly config: BirdnetWindowConfig = BIRDNET_V24) {
    if (config.hopSamples <= 0 || config.hopSamples > config.windowSamples) {
      throw new RangeError('hopSamples must be between 1 and windowSamples');
    }
    this.buffer = new Float32Array(config.windowSamples * 2);
  }

  /** Total samples pushed so far. */
  get samplesSeen(): number {
    return this.total;
  }

  push(samples: Float32Array): AudioWindow[] {
    this.append(samples);
    const { windowSamples, hopSamples, sampleRate } = this.config;
    const out: AudioWindow[] = [];
    while (this.length >= windowSamples) {
      out.push({
        start: this.offset / sampleRate,
        samples: this.buffer.slice(0, windowSamples),
        filled: windowSamples,
      });
      this.emitted++;
      this.drop(hopSamples);
    }
    return out;
  }

  /** The remaining partial windows, zero-padded. Resets the chunker. */
  flush(): AudioWindow[] {
    const { windowSamples, hopSamples, minSamples, sampleRate } = this.config;
    const out: AudioWindow[] = [];
    // Same rule as the Space: window starts run while start < total - window + hop.
    const end = Math.max(1, this.total - windowSamples + hopSamples);
    while (this.offset < end && (this.length > 0 || this.emitted === 0)) {
      const filled = Math.min(this.length, windowSamples);
      if (filled < minSamples && this.emitted > 0) break;
      const samples = new Float32Array(windowSamples);
      samples.set(this.buffer.subarray(0, filled));
      out.push({ start: this.offset / sampleRate, samples, filled });
      this.emitted++;
      this.drop(hopSamples);
    }
    this.reset();
    return out;
  }

  reset(): void {
    this.length = this.offset = this.total = this.emitted = 0;
  }

  private append(samples: Float32Array): void {
    if (this.length + samples.length > this.buffer.length) {
      const grown = new Float32Array(
        Math.max(this.buffer.length * 2, this.length + samples.length),
      );
      grown.set(this.buffer.subarray(0, this.length));
      this.buffer = grown;
    }
    this.buffer.set(samples, this.length);
    this.length += samples.length;
    this.total += samples.length;
  }

  private drop(n: number): void {
    const k = Math.min(n, this.length);
    this.buffer.copyWithin(0, k, this.length);
    this.length -= k;
    this.offset += n;
  }
}

/** Frames a whole recording into windows (the batch equivalent of `WindowChunker`). */
export function frameWindows(
  samples: Float32Array,
  config: BirdnetWindowConfig = BIRDNET_V24,
): AudioWindow[] {
  const chunker = new WindowChunker(config);
  return [...chunker.push(samples), ...chunker.flush()];
}

/** Packs windows into one [windows × windowSamples] buffer, the model's batch input. */
export function toBatch(windows: readonly AudioWindow[], windowSamples: number): Float32Array {
  const batch = new Float32Array(windows.length * windowSamples);
  windows.forEach((w, i) => batch.set(w.samples.subarray(0, windowSamples), i * windowSamples));
  return batch;
}
