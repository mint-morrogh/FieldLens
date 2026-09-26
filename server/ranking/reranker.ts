import { RANKING } from '../../shared/config.js';
import type { OccurrenceEvidence, OrganismCandidate } from '../../shared/types.js';
import type { ProviderCandidate } from '../providers/types.js';

export type RerankInput = {
  candidates: (ProviderCandidate & { occurrence?: OccurrenceEvidence })[];
  /** Whether location was available AND occurrence evidence could be looked up. */
  locationUsed: boolean;
  capturedAt: Date;
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
): number {
  const weights = season !== undefined ? config.weightsWithSeason : config.weightsWithoutSeason;
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
    const scored = input.candidates.map((candidate, originalIndex) => {
      const visual = clamp01(candidate.visualConfidence);
      const geo =
        input.locationUsed && candidate.occurrence
          ? geographicSupport(candidate.occurrence, this.config)
          : undefined;
      const season =
        geo !== undefined
          ? seasonalSupport(candidate.occurrence?.monthCounts, input.capturedAt, this.config)
          : undefined;
      const finalConfidence = computeFinalConfidence(visual, geo, season, this.config);
      const result: RerankedCandidate = {
        ...candidate,
        visualConfidence: visual,
        geographicSupport: geo,
        seasonalSupport: season,
        finalConfidence,
      };
      return { result, originalIndex };
    });
    // Stable sort: ties keep the provider's order.
    scored.sort(
      (a, b) =>
        b.result.finalConfidence - a.result.finalConfidence || a.originalIndex - b.originalIndex,
    );
    return scored.map((s) => s.result);
  }
}
