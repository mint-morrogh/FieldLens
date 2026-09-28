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
import { EbirdRecentProvider } from '../../server/providers/ebird/ebird';
import { MemoryCache } from '../../server/cache/cache';
import {
  HuggingFaceRangeProvider,
  RANGE_RESOLUTION,
  decodeShard,
} from '../../server/providers/ranges/ranges';
import { cellToParent, gridDisk, latLngToCell } from 'h3-js';

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
  it('judges a flower photo by flowering months when there are enough records', async () => {
    const yearRound = Array(12).fill(20);
    // Bloodroot: recorded all year, but only flowering in April.
    const bloodroot = {
      ...evidence(5, 20, 80, yearRound),
      floweringMonthCounts: [0, 0, 1, 129, 3, 0, 0, 0, 0, 0, 0, 0],
    };
    const [inSeptember] = await reranker.rerank({
      locationUsed: true,
      capturedAt: new Date('2026-09-15T12:00:00Z'),
      candidates: [candidate('Sanguinaria canadensis', 0.6, bloodroot)],
    });
    expect(inSeptember.seasonalSupport).toBe(0);
    const [inApril] = await reranker.rerank({
      locationUsed: true,
      capturedAt: new Date('2026-04-15T12:00:00Z'),
      candidates: [candidate('Sanguinaria canadensis', 0.6, bloodroot)],
    });
    expect(inApril.seasonalSupport).toBe(1);
    // Too few flowering records: fall back to all records.
    const [sparse] = await reranker.rerank({
      locationUsed: true,
      capturedAt: new Date('2026-09-15T12:00:00Z'),
      candidates: [
        candidate('X', 0.6, {
          ...evidence(5, 20, 80, yearRound),
          floweringMonthCounts: [0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
        }),
      ],
    });
    expect(sparse.seasonalSupport).toBe(1);
  });
  it('uses recent eBird reports as bounded seasonal evidence for birds', async () => {
    const seen = { ...evidence(5, 20, 80), recentlyReported: true };
    const unseen = { ...evidence(5, 20, 80), recentlyReported: false };
    const ranked = await reranker.rerank({
      locationUsed: true,
      capturedAt: new Date('2026-09-15T12:00:00Z'),
      candidates: [candidate('Gone south', 0.5, unseen), candidate('Still here', 0.48, seen)],
    });
    expect(ranked.map((c) => c.scientificName)).toEqual(['Still here', 'Gone south']);
    const gone = ranked[1];
    expect(gone.seasonalSupport).toBe(0);
    // Never more than the season weight (10%) off the geographic score.
    expect(gone.finalConfidence).toBeGreaterThanOrEqual(
      (0.5 * 0.9 * (0.8 + 0.1 * gone.geographicSupport!)) / 0.9,
    );
    expect(ranked[0].finalConfidence).toBeLessThanOrEqual(0.48);
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

describe('EbirdRecentProvider', () => {
  const location = { latitude: 42.44, longitude: -76.5 };
  const reply = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ sciName: `Avis species${i}`, comName: `Bird ${i}` }));

  it('sends the key in a header and returns lower-cased names', async () => {
    let seen: Request | undefined;
    const fetchImpl = (async (url: string, init: RequestInit) => {
      seen = new Request(url, init);
      return Response.json([
        ...reply(40),
        { sciName: 'Cardinalis cardinalis', comName: 'Northern Cardinal' },
      ]);
    }) as typeof fetch;
    const birds = await new EbirdRecentProvider('k3y', new MemoryCache(), fetchImpl).getRecentBirds(
      location,
    );
    expect(seen!.headers.get('X-eBirdApiToken')).toBe('k3y');
    expect(seen!.url).toContain('dist=50');
    expect(seen!.url).not.toContain('k3y');
    expect(birds!.scientificNames.has('cardinalis cardinalis')).toBe(true);
    expect(birds!.commonNames.has('northern cardinal')).toBe(true);
  });

  it('says nothing for barely birded areas', async () => {
    const fetchImpl = (async () => Response.json(reply(5))) as unknown as typeof fetch;
    const birds = await new EbirdRecentProvider('k', new MemoryCache(), fetchImpl).getRecentBirds(
      location,
    );
    expect(birds).toBeUndefined();
  });
});

describe('species ranges', () => {
  const varint = (n: number) => {
    const out: number[] = [];
    do {
      let byte = n & 0x7f;
      n = Math.floor(n / 128);
      if (n > 0) byte |= 0x80;
      out.push(byte);
    } while (n > 0);
    return out;
  };
  const shard = (records: [string, number[]][]) => {
    const parts: number[] = [];
    for (const [cell, ids] of records) {
      const head = new DataView(new ArrayBuffer(12));
      head.setBigUint64(0, BigInt(`0x${cell}`), true);
      head.setUint32(8, ids.length, true);
      parts.push(...new Uint8Array(head.buffer));
      ids.forEach((id, i) => parts.push(...varint(i === 0 ? id : id - ids[i - 1])));
    }
    return new Uint8Array(parts);
  };

  it('decodes delta-encoded ids for the wanted cells only', () => {
    const bytes = shard([
      ['842aa4bffffffff', [3, 47219, 1_000_000]],
      ['842aa45ffffffff', [8]],
    ]);
    const cells = decodeShard(bytes, new Set(['842aa4bffffffff']));
    expect([...cells.get('842aa4bffffffff')!]).toEqual([3, 47219, 1_000_000]);
    expect(cells.has('842aa45ffffffff')).toBe(false);
  });

  it('reports in, near and out of range, and leaves out species without a map', async () => {
    const here = latLngToCell(42.44, -76.5, RANGE_RESOLUTION);
    const neighbour = gridDisk(here, 1).find((c) => c !== here)!;
    const files: Record<string, unknown> = {
      'taxa/ac.json': { 'acer rubrum': 47727, 'acer campestre': 54799 },
      'taxa/ma.json': { 'macropus giganteus': 42998 },
    };
    const shards = new Map<string, [string, number[]][]>();
    for (const [cell, ids] of [
      [here, [47727]],
      [neighbour, [54799]],
    ] as [string, number[]][]) {
      const parent = cellToParent(cell, 2);
      shards.set(parent, [...(shards.get(parent) ?? []), [cell, ids]]);
    }
    const fetchImpl = (async (url: string) => {
      const path = url.split('/resolve/main/')[1];
      const cells = path.startsWith('shards/') && shards.get(path.slice(7, -4));
      if (cells) return new Response(shard(cells.sort()));
      return path in files ? Response.json(files[path]) : new Response('', { status: 404 });
    }) as typeof fetch;
    const status = await new HuggingFaceRangeProvider('o/r', 't', fetchImpl).getRangeStatus(
      ['Acer rubrum', 'Acer campestre', 'Macropus giganteus', 'Unmapped thing'],
      { latitude: 42.44, longitude: -76.5 },
    );
    expect(Object.fromEntries(status)).toEqual({
      'acer rubrum': 'in',
      'acer campestre': 'near',
      'macropus giganteus': 'out',
    });
  });

  it('applies a capped penalty, softer for plants, never a boost', async () => {
    const reranker = new DeterministicGeoReranker();
    const ev = (range?: 'in' | 'near' | 'out') => ({ ...evidence(5, 20, 80), range });
    const [inRange] = await reranker.rerank({
      locationUsed: true,
      capturedAt: new Date(),
      candidates: [candidate('A', 0.6, ev('in'))],
    });
    const [outPlant] = await reranker.rerank({
      locationUsed: true,
      capturedAt: new Date(),
      candidates: [candidate('A', 0.6, ev('out'))],
    });
    const [outAnimal] = await reranker.rerank({
      locationUsed: true,
      capturedAt: new Date(),
      candidates: [{ ...candidate('A', 0.6, ev('out')), category: 'mammal' }],
    });
    expect(inRange.finalConfidence).toBeLessThanOrEqual(0.6);
    expect(outPlant.finalConfidence).toBeCloseTo(inRange.finalConfidence * 0.9);
    expect(outAnimal.finalConfidence).toBeCloseTo(inRange.finalConfidence * 0.75);
  });
});
