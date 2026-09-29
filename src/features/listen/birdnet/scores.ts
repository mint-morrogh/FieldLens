/**
 * Turns BirdNET's per-window outputs into the same result shape the Hugging Face Space
 * returns (`BirdnetResponse` in server/providers/birdnet/birdnet.ts), so an on-device run
 * feeds the existing candidate/ranking code unchanged. Mirrors `identify_audio` in
 * hf-space/birdnet_audio.py. (The TF.js model ends in its own sigmoid, so `sigmoid` here is
 * only needed for exports that output logits, like the Space's TFLite model.)
 */

export type BirdnetLabel = {
  scientificName: string;
  commonName: string;
  /** "Dog_Dog", "Human vocal_Human vocal", "Engine_Engine"…: sounds that aren't species. */
  notSpecies: boolean;
};

export type OnDeviceResult = {
  name: string;
  common: string;
  score: number;
  mean: number;
  segments: number;
  of: number;
};

export type OnDeviceResponse = { results: OnDeviceResult[]; sound: string | null };

/** BirdNET-Analyzer's default location-filter threshold (same as the Space). */
export const GEO_THRESHOLD = 0.03;

/** Parses a BirdNET v2.4 labels file: one "Scientific name_Common Name" per line. */
export function parseLabels(text: string): BirdnetLabel[] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim())
    .map((line) => {
      const at = line.indexOf('_');
      const scientificName = (at < 0 ? line : line.slice(0, at)).trim();
      const commonName = (at < 0 ? line : line.slice(at + 1)).trim();
      return { scientificName, commonName, notSpecies: scientificName === commonName };
    });
}

/** Logistic sigmoid, clipped like the Space so extreme logits don't overflow. */
export function sigmoid(logit: number): number {
  const x = Math.max(-20, Math.min(20, logit));
  return 1 / (1 + Math.exp(-x));
}

/** BirdNET's 48-week year: four "weeks" per month (days 1–7, 8–14, 15–21, 22–end). */
export function birdnetWeek(date: Date): number {
  return date.getUTCMonth() * 4 + Math.min(4, Math.floor((date.getUTCDate() - 1) / 7) + 1);
}

/** Input for BirdNET's location ("meta") model: [lat, lon, week], week -1 for year-round. */
export function geoInput(latitude: number, longitude: number, week?: number): Float32Array {
  const w = week && week >= 1 && week <= 48 ? week : -1;
  return Float32Array.from([latitude, longitude, w]);
}

/**
 * Ranks species over all windows. `probs` holds one row of class probabilities per window
 * (after the sigmoid). Species are ordered by their mean over windows (the bird singing
 * throughout); `score` is the best window. With `geo` (the location model's output), species
 * not expected there that week are dropped. `sound` names a non-species class that's louder
 * than every bird.
 */
export function rankDetections(
  probs: readonly Float32Array[],
  labels: readonly BirdnetLabel[],
  options: { geo?: Float32Array; k?: number; minScore?: number; geoThreshold?: number } = {},
): OnDeviceResponse {
  const { geo, k = 5, minScore = 0.1, geoThreshold = GEO_THRESHOLD } = options;
  const classes = labels.length;
  const frames = probs.length;
  if (frames === 0) return { results: [], sound: null };
  const best = new Float32Array(classes);
  const mean = new Float32Array(classes);
  const hits = new Uint16Array(classes);
  for (const row of probs) {
    if (row.length !== classes) throw new RangeError('Scores and labels differ in length');
    for (let i = 0; i < classes; i++) {
      const p = row[i];
      if (p > best[i]) best[i] = p;
      mean[i] += p / frames;
      if (p >= minScore) hits[i]++;
    }
  }

  let other = -1;
  for (let i = 0; i < classes; i++) {
    if (labels[i].notSpecies && (other < 0 || mean[i] > mean[other])) other = i;
  }

  const keep = (i: number) =>
    !labels[i].notSpecies && (!geo || (geo[i] ?? 0) >= geoThreshold) && best[i] >= minScore;
  const order: number[] = [];
  for (let i = 0; i < classes; i++) if (keep(i)) order.push(i);
  order.sort((a, b) => mean[b] - mean[a]);
  order.length = Math.min(order.length, k);

  const round = (x: number) => Math.round(x * 10_000) / 10_000;
  const sound =
    other >= 0 && best[other] >= 0.5 && (order.length === 0 || mean[other] > mean[order[0]])
      ? labels[other].commonName
      : null;
  return {
    results: order.map((i) => ({
      name: labels[i].scientificName,
      common: labels[i].commonName,
      score: round(best[i]),
      mean: round(mean[i]),
      segments: hits[i],
      of: frames,
    })),
    sound,
  };
}
