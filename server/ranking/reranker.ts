import { RANKING } from '../../shared/config.js';
import type {
  ContextNudges,
  DayPhase,
  OccurrenceEvidence,
  OrganismCandidate,
  TiltBucket,
} from '../../shared/types.js';
import type { ProviderCandidate } from '../providers/types.js';
import { elevationFactor, tiltFit, tiltTieBreak, timeOfDayFactor } from './context.js';

export type RankingContext = {
  /** Day, night or twilight at the capture place and time. */
  phase?: DayPhase;
  /** The capture hour is approximate (library photo), so time of day counts for less. */
  approximateTime?: boolean;
  tilt?: TiltBucket;
};

export type RerankInput = {
  candidates: (ProviderCandidate & { occurrence?: OccurrenceEvidence })[];
  /** Whether location was available AND occurrence evidence could be looked up. */
  locationUsed: boolean;
  capturedAt: Date;
  context?: RankingContext;
};

export type RerankedCandidate = OrganismCandidate;

export interface CandidateReranker {
  readonly name: string;
  rerank(input: RerankInput): Promise<RerankedCandidate[]>;
}

type RankingConfig = typeof RANKING;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/**
 * Geographic support in [0, 1] from GBIF record counts at increasing radii.
 * - Records within a small radius count more than records far away.
 * - More records → more support, with diminishing (log) returns.
 * - No records at all yields a small non-zero floor: absence of records is
 *   weak evidence (under-reporting, cultivation, new populations…).
 */
export function geographicSupport(
  evidence: OccurrenceEvidence,
  config: RankingConfig = RANKING,
): number {
  const nearest = evidence.radiusCounts.find((r) => r.count > 0);
  if (!nearest) return config.geoSupportWhenAbsent;
  const radiusFactor = config.radiusFactors[nearest.radiusKm] ?? 0.75;
  const countComponent = Math.min(
    1,
    Math.log10(1 + nearest.count) / Math.log10(1 + config.geoCountSaturation),
  );
  return clamp01(radiusFactor * (0.5 + 0.5 * countComponent));
}

/**
 * Seasonal support in [0, 1]: share of local records falling within ±window
 * months of the capture month, relative to a uniform distribution.
 * Returns undefined when there are too few records to judge.
 */
export function seasonalSupport(
  monthCounts: number[] | undefined,
  capturedAt: Date,
  config: RankingConfig = RANKING,
): number | undefined {
  if (!monthCounts || monthCounts.length !== 12) return undefined;
  const total = monthCounts.reduce((a, b) => a + b, 0);
  if (total < config.seasonMinRecords) return undefined;
  const month = capturedAt.getUTCMonth();
  const w = config.seasonWindowMonths;
  let inWindow = 0;
  for (let offset = -w; offset <= w; offset++) inWindow += monthCounts[(month + offset + 12) % 12];
  const expectedShare = (2 * w + 1) / 12;
  return clamp01(inWindow / total / expectedShare);
}

/**
 * Seasonal support from local month distributions only (not eBird's recent reports):
 * flowering records for photos of flowers when there are enough, otherwise all records.
 */
export function monthSeasonSupport(
  occurrence: OccurrenceEvidence | undefined,
  capturedAt: Date,
  config: RankingConfig = RANKING,
): { support: number; basis: 'flowering' | 'records' } | undefined {
  const flowering = seasonalSupport(occurrence?.floweringMonthCounts, capturedAt, config);
  if (flowering !== undefined) return { support: flowering, basis: 'flowering' };
  const records = seasonalSupport(occurrence?.monthCounts, capturedAt, config);
  return records !== undefined ? { support: records, basis: 'records' } : undefined;
}

/** Extra multiplier for out-of-season matches: 1 in season, down to 1 − maxPenalty at zero support. */
export function outOfSeasonFactor(
  support: number | undefined,
  config: RankingConfig = RANKING,
): number | undefined {
  if (support === undefined) return undefined;
  const { threshold, maxPenalty } = config.outOfSeason;
  if (support >= threshold) return 1;
  return 1 - maxPenalty * (1 - support / threshold);
}

/**
 * finalConfidence = visual × adjustment, where
 *   adjustment = (wV + wG·geo + wS·season) / (wV + wG + wS)
 * over the factors that are actually available.
 *
 * Properties (all covered by tests):
 * - finalConfidence ≤ visualConfidence: local commonness can never turn a weak
 *   image match into a strong identification — it can only *reduce* confidence
 *   when evidence is missing or contrary.
 * - With full geographic and seasonal support, finalConfidence = visual.
 * - Without location, finalConfidence = visual.
 * - With no local records the penalty is bounded (≈11% with default weights).
 */
export function computeFinalConfidence(
  visual: number,
  geo: number | undefined,
  season: number | undefined,
  config: RankingConfig = RANKING,
  weights: { visual: number; geo: number; season: number } = season !== undefined
    ? config.weightsWithSeason
    : config.weightsWithoutSeason,
): number {
  let numerator = weights.visual;
  let denominator = weights.visual;
  if (geo !== undefined) {
    numerator += weights.geo * geo;
    denominator += weights.geo;
  }
  if (season !== undefined && weights.season > 0) {
    numerator += weights.season * season;
    denominator += weights.season;
  }
  return clamp01(visual * (numerator / denominator));
}

export class DeterministicGeoReranker implements CandidateReranker {
  readonly name = 'DeterministicGeoReranker';
  constructor(private readonly config: RankingConfig = RANKING) {}

  async rerank(input: RerankInput): Promise<RerankedCandidate[]> {
    const ctx = input.context ?? {};
    const scored = input.candidates.map((candidate, originalIndex) => {
      const visual = clamp01(candidate.visualConfidence);
      const geo =
        input.locationUsed && candidate.occurrence
          ? geographicSupport(candidate.occurrence, this.config)
          : undefined;
      // Flowering records are the sharper signal for a photo of a flower; fall back to all
      // records when there are too few flowering ones to judge.
      const recent = geo !== undefined ? candidate.occurrence?.recentlyReported : undefined;
      const season =
        recent !== undefined
          ? recent
            ? 1
            : 0
          : geo !== undefined
            ? (seasonalSupport(
                candidate.occurrence?.floweringMonthCounts,
                input.capturedAt,
                this.config,
              ) ??
              seasonalSupport(candidate.occurrence?.monthCounts, input.capturedAt, this.config))
            : undefined;
      const range = geo !== undefined ? candidate.occurrence?.range : undefined;
      const rangeFactor = range
        ? this.config.rangeFactors[candidate.category === 'plant' ? 'plant' : 'animal'][range]
        : 1;
      // Soft context nudges, each capped and each absent when there's no data for it.
      const nudges: ContextNudges = {};
      const seasonFactor =
        geo !== undefined
          ? outOfSeasonFactor(
              monthSeasonSupport(candidate.occurrence, input.capturedAt, this.config)?.support,
              this.config,
            )
          : undefined;
      if (seasonFactor !== undefined && seasonFactor < 1) nudges.season = seasonFactor;
      const timeFactor = timeOfDayFactor(candidate, ctx.phase, ctx.approximateTime);
      if (timeFactor !== undefined && timeFactor < 1) nudges.timeOfDay = timeFactor;
      const elevation = elevationFactor(
        candidate.category,
        geo !== undefined ? candidate.occurrence?.elevation : undefined,
      );
      if (elevation !== undefined && elevation < 1) nudges.elevation = elevation;
      const finalConfidence =
        computeFinalConfidence(
          visual,
          geo,
          season,
          this.config,
          recent !== undefined ? this.config.weightsWithRecentSightings : undefined,
        ) *
        rangeFactor *
        (nudges.season ?? 1) *
        (nudges.timeOfDay ?? 1) *
        (nudges.elevation ?? 1);
      const result: RerankedCandidate = {
        ...candidate,
        visualConfidence: visual,
        geographicSupport: geo,
        seasonalSupport: season,
        finalConfidence,
        ...(Object.keys(nudges).length > 0 && { nudges }),
      };
      return { result, originalIndex };
    });
    // Camera tilt: a tie-breaker between close candidates only, never more.
    if (ctx.tilt && ctx.tilt !== 'level') {
      const fits = scored.map((s) => tiltFit(s.result, ctx.tilt));
      const factors = tiltTieBreak(
        scored.map((s) => s.result.finalConfidence),
        fits,
      );
      factors.forEach((f, i) => {
        if (f === undefined) return;
        const r = scored[i].result;
        scored[i].result = {
          ...r,
          finalConfidence: r.finalConfidence * f,
          nudges: { ...r.nudges, tilt: f },
        };
      });
    }
    // Stable sort: ties keep the provider's order.
    scored.sort(
      (a, b) =>
        b.result.finalConfidence - a.result.finalConfidence || a.originalIndex - b.originalIndex,
    );
    return scored.map((s) => s.result);
  }
}
