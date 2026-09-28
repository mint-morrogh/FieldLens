// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  BIRDNET_V24,
  BIRDNET_V3_PREVIEW,
  WindowChunker,
  frameWindows,
  resample,
  toBatch,
  toMono,
} from '../../src/features/listen/birdnet/audioWindows';
import {
  birdnetWeek as clientWeek,
  geoInput,
  parseLabels,
  rankDetections,
  sigmoid,
} from '../../src/features/listen/birdnet/scores';
import { birdnetWeek as serverWeek } from '../../server/providers/birdnet/birdnet';

const SR = BIRDNET_V24.sampleRate;
const tone = (hz: number, rate: number, seconds: number) =>
  Float32Array.from({ length: Math.round(rate * seconds) }, (_, i) =>
    Math.sin((2 * Math.PI * hz * i) / rate),
  );
const rms = (x: Float32Array, from = 0, to = x.length) => {
  let s = 0;
  for (let i = from; i < to; i++) s += x[i] * x[i];
  return Math.sqrt(s / (to - from));
};
/** Window starts the Space uses (`_segments` in hf-space/birdnet_audio.py). */
const spaceStarts = (n: number, seg = 144_000, hop = 72_000) => {
  const starts: number[] = [];
  for (let s = 0; s < Math.max(1, n - seg + hop); s += hop) starts.push(s);
  return starts;
};

describe('BirdNET audio windows', () => {
  it('downmixes to mono by averaging channels', () => {
    const mono = toMono([Float32Array.from([1, 0, -1]), Float32Array.from([0, 0, 1])]);
    expect(Array.from(mono)).toEqual([0.5, 0, 0]);
  });

  it.each([0.5, 3, 4.2, 5, 9.99, 10, 15])('frames %s s the same way as the Space', (seconds) => {
    const n = Math.round(seconds * SR);
    const windows = frameWindows(new Float32Array(n));
    expect(windows.map((w) => Math.round(w.start * SR))).toEqual(spaceStarts(n));
    for (const w of windows) {
      expect(w.samples.length).toBe(BIRDNET_V24.windowSamples);
      expect(w.filled).toBe(Math.min(BIRDNET_V24.windowSamples, n - Math.round(w.start * SR)));
    }
  });

  it('streams windows as soon as they are complete, matching the batch framing', () => {
    const audio = Float32Array.from({ length: 7 * SR }, (_, i) => ((i * 7919) % 1000) / 1000 - 0.5);
    const chunker = new WindowChunker();
    const streamed = [];
    const emittedAfter: number[] = [];
    for (let at = 0; at < audio.length; at += 2048) {
      streamed.push(...chunker.push(audio.subarray(at, at + 2048)));
      emittedAfter.push(streamed.length);
    }
    // The first window appears once 3 s have arrived.
    expect(emittedAfter[Math.floor((3 * SR) / 2048) - 1]).toBe(0);
    expect(emittedAfter[Math.ceil((3 * SR) / 2048)]).toBe(1);
    streamed.push(...chunker.flush());
    const batch = frameWindows(audio);
    expect(streamed.map((w) => w.start)).toEqual(batch.map((w) => w.start));
    const same = (a: Float32Array, b: Float32Array) =>
      a.length === b.length && a.every((v, i) => v === b[i]);
    expect(streamed.every((w, i) => same(w.samples, batch[i].samples))).toBe(true);
    // Window 2 starts at 3 s (two hops of 1.5 s).
    expect(batch[2].samples[0]).toBe(audio[3 * SR]);
    expect(batch[2].samples[BIRDNET_V24.windowSamples - 1]).toBe(audio[6 * SR - 1]);
  });

  it('zero-pads the trailing window and packs a model batch', () => {
    const windows = frameWindows(new Float32Array(4 * SR).fill(1));
    expect(windows).toHaveLength(2);
    expect(windows[1].filled).toBe(2.5 * SR);
    expect(windows[1].samples[2.5 * SR - 1]).toBe(1);
    expect(windows[1].samples[2.5 * SR]).toBe(0);
    const batch = toBatch(windows, BIRDNET_V24.windowSamples);
    expect(batch.length).toBe(2 * BIRDNET_V24.windowSamples);
  });

  it('supports the V3 preview config (32 kHz)', () => {
    const windows = frameWindows(new Float32Array(6 * 32_000), BIRDNET_V3_PREVIEW);
    expect(windows.map((w) => w.start)).toEqual([0, 1.5, 3]);
  });
});

describe('resampling', () => {
  it('keeps a 3 kHz tone when going from 44.1 to 48 kHz', () => {
    const out = resample(tone(3000, 44_100, 0.2), 44_100, 48_000);
    expect(out.length).toBe(9600);
    const expected = tone(3000, 48_000, 0.2);
    let err = 0;
    for (let i = 500; i < out.length - 500; i++)
      err = Math.max(err, Math.abs(out[i] - expected[i]));
    expect(err).toBeLessThan(0.01);
  });

  it('removes tones above the new Nyquist frequency instead of aliasing them', () => {
    const kept = resample(tone(4000, 48_000, 0.1), 48_000, 32_000);
    const removed = resample(tone(20_000, 48_000, 0.1), 48_000, 32_000);
    expect(rms(kept, 200, kept.length - 200)).toBeGreaterThan(0.65);
    expect(rms(removed, 200, removed.length - 200)).toBeLessThan(0.01);
  });

  it('passes silence, DC and same-rate audio through', () => {
    expect(Array.from(resample(new Float32Array(10).fill(0.25), 16_000, 48_000))).toEqual(
      new Array(30).fill(0.25).map((v) => expect.closeTo(v, 6)),
    );
    const same = Float32Array.from([1, 2, 3]);
    expect(resample(same, SR, SR)).toEqual(same);
    expect(resample(new Float32Array(0), 44_100, 48_000).length).toBe(0);
  });
});

describe('BirdNET scores', () => {
  const labels = parseLabels(
    [
      'Cardinalis cardinalis_Northern Cardinal',
      'Cyanocitta cristata_Blue Jay',
      'Turdus migratorius_American Robin',
      'Human vocal_Human vocal',
    ].join('\n'),
  );

  it('parses labels and spots non-species sounds', () => {
    expect(labels[0]).toEqual({
      scientificName: 'Cardinalis cardinalis',
      commonName: 'Northern Cardinal',
      notSpecies: false,
    });
    expect(labels[3].notSpecies).toBe(true);
  });

  it('ranks by the mean over windows, reports the best window, and drops noise classes', () => {
    const probs = [
      Float32Array.from([0.9, 0.05, 0.4, 0.2]),
      Float32Array.from([0.1, 0.05, 0.5, 0.1]),
      Float32Array.from([0.05, 0.05, 0.45, 0.1]),
    ];
    const { results, sound } = rankDetections(probs, labels);
    expect(results.map((r) => r.common)).toEqual(['American Robin', 'Northern Cardinal']);
    expect(results[1]).toMatchObject({ score: 0.9, segments: 2, of: 3 });
    expect(sound).toBeNull();
  });

  it('applies the location model and names a louder non-bird sound', () => {
    const probs = [Float32Array.from([0.6, 0.3, 0.1, 0.95])];
    const geo = Float32Array.from([0.5, 0.01, 0.5, 1]);
    const { results, sound } = rankDetections(probs, labels, { geo });
    expect(results.map((r) => r.name)).toEqual(['Cardinalis cardinalis', 'Turdus migratorius']);
    expect(sound).toBe('Human vocal');
  });

  it('matches the server week numbering and builds the location-model input', () => {
    for (const d of ['2026-01-01', '2026-01-08', '2026-02-28', '2026-12-31']) {
      expect(clientWeek(new Date(d))).toBe(serverWeek(new Date(d)));
    }
    expect(Array.from(geoInput(46.2, -63.1, 0))).toEqual([
      expect.closeTo(46.2, 4),
      expect.closeTo(-63.1, 4),
      -1,
    ]);
    expect(sigmoid(0)).toBe(0.5);
    expect(sigmoid(1000)).toBeCloseTo(1);
  });
});
