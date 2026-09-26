// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RANKING } from '../../shared/config';
import {
  DeterministicGeoReranker,
  computeFinalConfidence,
  geographicSupport,
  seasonalSupport,
} from '../../server/ranking/reranker';
import type { OccurrenceEvidence } from '../../shared/types';
import type { ProviderCandidate } from '../../server/providers/types';

const evidence = (
  c5: number,
  c25: number,
  c100: number,
  monthCounts?: number[],
): OccurrenceEvidence => ({
  source: 'GBIF',
  radiusCounts: [
    { radiusKm: 5, count: c5 },
    { radiusKm: 25, count: c25 },
    { radiusKm: 100, count: c100 },
  ],
  monthCounts,
});

const candidate = (
  name: string,
  visual: number,
  occurrence?: OccurrenceEvidence,
): ProviderCandidate & { occurrence?: OccurrenceEvidence } => ({
  id: name,
  category: 'plant',
  scientificName: name,
  taxonKeys: {},
  visualConfidence: visual,
  source: { identification: 'test' },
  links: [],
  occurrence,
});

describe('geographicSupport', () => {
  it('gives a bounded floor (not zero) when there are no records', () => {
    expect(geographicSupport(evidence(0, 0, 0))).toBe(RANKING.geoSupportWhenAbsent);
  });
  it('increases with record count and closeness', () => {
    const near = geographicSupport(evidence(50, 50, 50));
    const far = geographicSupport(evidence(0, 0, 50));
    const few = geographicSupport(evidence(1, 1, 1));
    expect(near).toBeGreaterThan(far);
    expect(near).toBeGreaterThan(few);
    expect(near).toBeLessThanOrEqual(1);
    expect(few).toBeGreaterThan(RANKING.geoSupportWhenAbsent);
  });
  it('saturates at the configured count', () => {
    expect(geographicSupport(evidence(5000, 0, 0))).toBe(1);
  });
});

describe('seasonalSupport', () => {
  const summer = [0, 0, 0, 0, 5, 20, 40, 30, 5, 0, 0, 0];
  it('is undefined when records are too sparse', () => {
    expect(
      seasonalSupport([0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0], new Date('2026-07-01')),
    ).toBeUndefined();
    expect(seasonalSupport(undefined, new Date())).toBeUndefined();
  });
  it('is high in season and low out of season', () => {
    expect(seasonalSupport(summer, new Date('2026-07-15T12:00:00Z'))).toBe(1);
    expect(seasonalSupport(summer, new Date('2026-01-15T12:00:00Z'))).toBe(0);
  });
  it('wraps around the year boundary', () => {
    const winter = [30, 10, 0, 0, 0, 0, 0, 0, 0, 0, 0, 30];
    expect(seasonalSupport(winter, new Date('2026-12-20T12:00:00Z'))).toBe(1);
  });
});

describe('computeFinalConfidence', () => {
  it('equals visual confidence when no location evidence exists', () => {
    expect(computeFinalConfidence(0.73, undefined, undefined)).toBeCloseTo(0.73);
  });
  it('never exceeds visual confidence', () => {
    for (const v of [0.05, 0.3, 0.6, 0.95]) {
      expect(computeFinalConfidence(v, 1, 1)).toBeLessThanOrEqual(v + 1e-9);
    }
  });
  it('cannot turn a weak image match into a high-confidence one', () => {
    expect(computeFinalConfidence(0.2, 1, 1)).toBeLessThan(0.55);
  });
  it('applies a bounded penalty when there are no nearby records', () => {
    const final = computeFinalConfidence(0.9, RANKING.geoSupportWhenAbsent, undefined);
    expect(final).toBeLessThan(0.9);
    expect(final).toBeGreaterThan(0.9 * 0.85);
  });
  it('uses the no-season weights when seasonal data is missing', () => {
    // visual 0.8 + geo 0.2 → adjustment = (0.8 + 0.2 * 0.5) / 1.0
    expect(computeFinalConfidence(1, 0.5, undefined)).toBeCloseTo(0.9);
    // visual 0.8 + geo 0.15 + season 0.05 → (0.8 + 0.075 + 0.05) / 1.0
    expect(computeFinalConfidence(1, 0.5, 1)).toBeCloseTo(0.925);
  });
});

describe('DeterministicGeoReranker', () => {
  const reranker = new DeterministicGeoReranker();
  it('reorders close candidates using geographic evidence', async () => {
    const ranked = await reranker.rerank({
      locationUsed: true,
      capturedAt: new Date('2026-07-01'),
      candidates: [
        candidate('A', 0.4, evidence(0, 0, 0)),
        candidate('B', 0.38, evidence(100, 400, 900)),
      ],
    });
    expect(ranked.map((c) => c.scientificName)).toEqual(['B', 'A']);
    expect(ranked[0].geographicSupport).toBe(1);
  });
  it('does not let local commonness overturn a large visual lead', async () => {
    const ranked = await reranker.rerank({
      locationUsed: true,
      capturedAt: new Date(),
      candidates: [
        candidate('Rare', 0.9, evidence(0, 0, 0)),
        candidate('Common', 0.1, evidence(999, 999, 999)),
      ],
    });
    expect(ranked[0].scientificName).toBe('Rare');
  });
  it('keeps provider order and visual scores when location is not used', async () => {
    const ranked = await reranker.rerank({
      locationUsed: false,
      capturedAt: new Date(),
      candidates: [candidate('A', 0.5, evidence(0, 0, 0)), candidate('B', 0.5, evidence(9, 9, 9))],
    });
    expect(ranked.map((c) => c.scientificName)).toEqual(['A', 'B']);
    expect(ranked[0].finalConfidence).toBe(0.5);
    expect(ranked[0].geographicSupport).toBeUndefined();
  });
});
