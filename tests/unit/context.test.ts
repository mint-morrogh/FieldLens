// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { CONTEXT, RANKING } from '../../shared/config';
import type { ElevationEvidence, OccurrenceEvidence, OrganismCategory } from '../../shared/types';
import type { ProviderCandidate } from '../../server/providers/types';
import { MemoryCache } from '../../server/cache/cache';
import { buildEvidence, seasonSpan } from '../../server/identify/evidence';
import { runIdentification } from '../../server/identify/pipeline';
import { createMockProviders } from '../../server/providers/mock/mockProviders';
import {
  GbifClient,
  GbifOccurrenceProvider,
  elevationBand,
} from '../../server/providers/gbif/gbif';
import {
  OpenMeteoElevationProvider,
  elevationGrid,
  sampleSummary,
} from '../../server/providers/elevation/openMeteo';
import {
  activityOf,
  dayPhase,
  elevationFactor,
  sunAltitude,
  tiltFit,
  tiltTieBreak,
  timeOfDayFactor,
} from '../../server/ranking/context';
import {
  DeterministicGeoReranker,
  monthSeasonSupport,
  outOfSeasonFactor,
} from '../../server/ranking/reranker';
import { parseIdentifyForm } from '../../server/validation/upload';

const reranker = new DeterministicGeoReranker();

const occurrence = (extra: Partial<OccurrenceEvidence> = {}): OccurrenceEvidence => ({
  source: 'GBIF',
  radiusCounts: [
    { radiusKm: 5, count: 60 },
    { radiusKm: 25, count: 60 },
    { radiusKm: 100, count: 60 },
  ],
  ...extra,
});

const candidate = (
  scientificName: string,
  visual: number,
  category: OrganismCategory = 'bird',
  extra: Partial<ProviderCandidate & { occurrence?: OccurrenceEvidence }> = {},
): ProviderCandidate & { occurrence?: OccurrenceEvidence } => ({
  id: scientificName,
  category,
  scientificName,
  taxonKeys: {},
  visualConfidence: visual,
  source: { identification: 'test' },
  links: [],
  ...extra,
});

const HALIFAX = { latitude: 44.65, longitude: -63.57 };

describe('time of day', () => {
  it('computes the sun altitude', () => {
    // June solstice, noon at Greenwich on the equator: 90° − 23.44°.
    expect(sunAltitude(new Date('2026-06-21T12:00:00Z'), 0, 0)).toBeCloseTo(66.6, 0);
    expect(sunAltitude(new Date('2026-06-21T00:00:00Z'), 51.5, 0)).toBeLessThan(-10);
  });

  it('classifies day, night and twilight, and needs a local hour', () => {
    const base = { location: HALIFAX };
    // 12:00 in Halifax (UTC−3 in summer) = 15:00 UTC.
    expect(dayPhase({ ...base, capturedAt: new Date('2026-07-01T15:00:00Z'), localHour: 12 })).toBe(
      'day',
    );
    expect(dayPhase({ ...base, capturedAt: new Date('2026-07-02T04:00:00Z'), localHour: 1 })).toBe(
      'night',
    );
    // Just after sunset (~21:00 local): twilight, which is neutral.
    expect(
      dayPhase({ ...base, capturedAt: new Date('2026-07-02T00:30:00Z'), localHour: 21.5 }),
    ).toBe('twilight');
    // Old clients send no hour: no effect.
    expect(dayPhase({ ...base, capturedAt: new Date('2026-07-01T15:00:00Z') })).toBeUndefined();
  });

  it('estimates solar time from longitude when the hour is approximate', () => {
    // A library photo: the instant is untrusted (here: nonsense), the local hour is 13:00.
    const wrongInstant = new Date('2026-07-01T02:00:00Z');
    expect(
      dayPhase({ capturedAt: wrongInstant, localHour: 13, approximate: true, location: HALIFAX }),
    ).toBe('day');
    const winter = new Date('2026-01-15T20:00:00Z');
    expect(
      dayPhase({ capturedAt: winter, localHour: 2, approximate: true, location: HALIFAX }),
    ).toBe('night');
  });

  it('falls back to hour bands without a location', () => {
    const at = new Date('2026-07-01T12:00:00Z');
    expect(dayPhase({ capturedAt: at, localHour: 13 })).toBe('day');
    expect(dayPhase({ capturedAt: at, localHour: 23.5 })).toBe('night');
    expect(dayPhase({ capturedAt: at, localHour: 2 })).toBe('night');
    expect(dayPhase({ capturedAt: at, localHour: 6 })).toBe('twilight');
    expect(dayPhase({ capturedAt: at, localHour: 19 })).toBe('twilight');
  });

  it('reads activity from EltonTraits and butterfly families only', () => {
    expect(activityOf({ scientificName: 'Strix varia', category: 'bird' })).toBe('nocturnal');
    expect(activityOf({ scientificName: 'Turdus migratorius', category: 'bird' })).toBe('diurnal');
    expect(activityOf({ scientificName: 'Procyon lotor', category: 'mammal' })).toBe('nocturnal');
    expect(activityOf({ scientificName: 'Sciurus carolinensis', category: 'mammal' })).toBe(
      'diurnal',
    );
    expect(
      activityOf({ scientificName: 'Danaus plexippus', category: 'insect', family: 'Nymphalidae' }),
    ).toBe('diurnal');
    // Moths, unknown species and plants: no data, no effect.
    expect(
      activityOf({ scientificName: 'Actias luna', category: 'insect', family: 'Saturniidae' }),
    ).toBeUndefined();
    expect(activityOf({ scientificName: 'Nonexistent bird', category: 'bird' })).toBeUndefined();
    expect(activityOf({ scientificName: 'Acer rubrum', category: 'plant' })).toBeUndefined();
  });

  it('is capped, weaker for nocturnal animals by day, and neutral at twilight', () => {
    const robin = { scientificName: 'Turdus migratorius', category: 'bird' as const };
    const owl = { scientificName: 'Strix varia', category: 'bird' as const };
    expect(timeOfDayFactor(robin, 'night')).toBeCloseTo(1 - CONTEXT.timeOfDayCap);
    expect(timeOfDayFactor(owl, 'day')).toBeCloseTo(1 - CONTEXT.timeOfDayCap / 2);
    expect(timeOfDayFactor(owl, 'night')).toBe(1);
    expect(timeOfDayFactor(robin, 'twilight')).toBeUndefined();
    expect(timeOfDayFactor(robin, undefined)).toBeUndefined();
    // Approximate hour: weaker still.
    expect(timeOfDayFactor(robin, 'night', true)!).toBeGreaterThan(1 - CONTEXT.timeOfDayCap);
  });

  it('lets a nocturnal species edge ahead of a close diurnal one at night', async () => {
    const candidates = [
      candidate('Turdus migratorius', 0.6),
      candidate('Strix varia', 0.58),
      candidate('Acer rubrum', 0.2, 'plant'),
    ];
    const byDay = await reranker.rerank({
      candidates,
      locationUsed: false,
      capturedAt: new Date(),
      context: { phase: 'day' },
    });
    expect(byDay[0].scientificName).toBe('Turdus migratorius');
    const atNight = await reranker.rerank({
      candidates,
      locationUsed: false,
      capturedAt: new Date(),
      context: { phase: 'night' },
    });
    expect(atNight.map((c) => c.scientificName)).toEqual([
      'Strix varia',
      'Turdus migratorius',
      'Acer rubrum',
    ]);
    const robin = atNight[1];
    expect(robin.nudges?.timeOfDay).toBeCloseTo(0.95);
    expect(robin.finalConfidence).toBeCloseTo(0.6 * 0.95);
    // No data: untouched.
    expect(atNight[2].finalConfidence).toBe(0.2);
    expect(atNight[2].nudges).toBeUndefined();
    // Far apart: time of day can't overturn a clear visual match.
    const clear = await reranker.rerank({
      candidates: [candidate('Turdus migratorius', 0.8), candidate('Strix varia', 0.6)],
      locationUsed: false,
      capturedAt: new Date(),
      context: { phase: 'night' },
    });
    expect(clear[0].scientificName).toBe('Turdus migratorius');
  });
});

describe('seasonality', () => {
  const summer = [0, 0, 0, 0, 2, 20, 40, 30, 5, 0, 0, 0];

  it('adds a capped out-of-season penalty below the threshold', () => {
    expect(outOfSeasonFactor(undefined)).toBeUndefined();
    expect(outOfSeasonFactor(1)).toBe(1);
    expect(outOfSeasonFactor(RANKING.outOfSeason.threshold)).toBe(1);
    expect(outOfSeasonFactor(0)).toBeCloseTo(1 - RANKING.outOfSeason.maxPenalty);
    expect(outOfSeasonFactor(RANKING.outOfSeason.threshold / 2)).toBeCloseTo(
      1 - RANKING.outOfSeason.maxPenalty / 2,
    );
  });

  it('prefers flowering records and falls back to all records', () => {
    const jan = new Date('2026-01-15T12:00:00Z');
    expect(monthSeasonSupport(occurrence({ monthCounts: summer }), jan)).toEqual({
      support: 0,
      basis: 'records',
    });
    expect(
      monthSeasonSupport(
        occurrence({
          monthCounts: summer,
          floweringMonthCounts: [20, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 20],
        }),
        jan,
      )?.basis,
    ).toBe('flowering');
    expect(monthSeasonSupport(occurrence(), jan)).toBeUndefined();
  });

  it('ranks an out-of-season match below a close in-season one, within the cap', async () => {
    const yearRound = [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5];
    const ranked = await reranker.rerank({
      locationUsed: true,
      capturedAt: new Date('2026-01-15T12:00:00Z'),
      candidates: [
        candidate('Summer only', 0.62, 'plant', {
          occurrence: occurrence({ monthCounts: summer }),
        }),
        candidate('All year', 0.58, 'plant', {
          occurrence: occurrence({ monthCounts: yearRound }),
        }),
      ],
    });
    expect(ranked.map((c) => c.scientificName)).toEqual(['All year', 'Summer only']);
    const summerOnly = ranked[1];
    expect(summerOnly.nudges?.season).toBeCloseTo(1 - RANKING.outOfSeason.maxPenalty);
    // Season weight (5%) plus the out-of-season cap (10%): never more than ~15% off.
    expect(summerOnly.finalConfidence).toBeGreaterThanOrEqual(0.62 * 0.95 * 0.9 - 1e-9);
    expect(ranked[0].nudges).toBeUndefined();
  });

  it('describes the season in words', () => {
    expect(seasonSpan([0, 0, 0, 10, 30, 20, 0, 0, 0, 0, 0, 0])).toBe('Apr–Jun');
    expect(seasonSpan([30, 20, 0, 0, 0, 0, 0, 0, 0, 0, 0, 25])).toBe('Dec–Feb');
    expect(seasonSpan([0, 0, 20, 20, 0, 0, 0, 0, 20, 20, 0, 0])).toBe('Mar–Apr, Sep–Oct');
    expect(seasonSpan([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5])).toBe('all year');
    expect(seasonSpan([1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])).toBeUndefined();
  });

  it('shows out-of-season and in-season evidence on the result', async () => {
    const [top] = await reranker.rerank({
      locationUsed: true,
      capturedAt: new Date('2026-01-15T12:00:00Z'),
      candidates: [
        candidate('Summer only', 0.62, 'plant', {
          occurrence: occurrence({ monthCounts: summer }),
        }),
      ],
    });
    const base = {
      category: 'plant' as const,
      band: 'medium' as const,
      imageCount: 1,
      features: [],
      locationProvided: true,
      occurrenceStatus: 'ok' as const,
    };
    const out = buildEvidence({
      ...base,
      candidates: [top],
      capturedAt: new Date('2026-01-15T12:00:00Z'),
    });
    expect(out.uncertainties.map((u) => u.text)).toContain(
      'Rarely recorded near you in January (mostly Jun–Sep)',
    );
    const flowering = buildEvidence({
      ...base,
      candidates: [
        {
          ...top,
          occurrence: occurrence({ floweringMonthCounts: [0, 0, 0, 10, 30, 20, 0, 0, 0, 0, 0, 0] }),
        },
      ],
      capturedAt: new Date('2026-05-10T12:00:00Z'),
    });
    expect(flowering.supports.map((s) => s.text)).toContain('In season: flowers here Apr–Jun');
  });
});

describe('elevation', () => {
  const site = { centerM: 1800, minM: 1500, maxM: 2100 };
  const ev = (withElevation: number, inBand: number): ElevationEvidence => ({
    site,
    bandM: elevationBand(site),
    recordsWithElevation: withElevation,
    recordsInBand: inBand,
  });

  it('widens the band around the local terrain', () => {
    expect(elevationBand(site)).toEqual([1250, 2350]);
  });

  it('nudges down only with enough records, only for groups where it matters, capped', () => {
    expect(elevationFactor('plant', ev(100, 0))).toBeCloseTo(1 - CONTEXT.elevationCap);
    expect(elevationFactor('insect', ev(100, 30))).toBe(1);
    expect(elevationFactor('bird', ev(100, 1))).toBeGreaterThan(1 - CONTEXT.elevationCap);
    // Too few records with an elevation: ignored.
    expect(elevationFactor('plant', ev(5, 0))).toBeUndefined();
    // Groups where elevation says little: ignored.
    expect(elevationFactor('mammal', ev(100, 0))).toBeUndefined();
    expect(elevationFactor('fungus', ev(100, 0))).toBeUndefined();
    expect(elevationFactor('plant', undefined)).toBeUndefined();
  });

  it('moves a lowland look-alike below an alpine species at altitude', async () => {
    const ranked = await reranker.rerank({
      locationUsed: true,
      capturedAt: new Date('2026-07-15T12:00:00Z'),
      candidates: [
        candidate('Lowland', 0.6, 'plant', { occurrence: occurrence({ elevation: ev(200, 0) }) }),
        candidate('Alpine', 0.57, 'plant', { occurrence: occurrence({ elevation: ev(80, 60) }) }),
      ],
    });
    expect(ranked.map((c) => c.scientificName)).toEqual(['Alpine', 'Lowland']);
    expect(ranked[1].nudges?.elevation).toBeCloseTo(0.92);
    const evidence = buildEvidence({
      category: 'plant',
      candidates: ranked.slice(1),
      band: 'medium',
      imageCount: 1,
      features: [],
      locationProvided: true,
      occurrenceStatus: 'ok',
    });
    expect(evidence.uncertainties.map((u) => u.text)).toContain(
      'Few nearby records at this elevation (about 1,800 m)',
    );
  });

  it('samples a 3 × 3 grid in the ~11 km cell, caches it, and tolerates junk', async () => {
    expect(elevationGrid({ latitude: 46.2382, longitude: -63.1312 })).toEqual({
      latitude: 46.2,
      longitude: -63.1,
    });
    expect(sampleSummary([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual({ centerM: 5, minM: 1, maxM: 9 });
    expect(sampleSummary([1, 2])).toBeUndefined();
    expect(sampleSummary('nope')).toBeUndefined();

    const fetchImpl = vi.fn(
      async () =>
        new Response(JSON.stringify({ elevation: [10, 20, 30, 40, 50, 60, 70, 80, 90] }), {
          headers: { 'content-type': 'application/json' },
        }),
    );
    const provider = new OpenMeteoElevationProvider(new MemoryCache(), fetchImpl as typeof fetch);
    const a = await provider.getElevation({ latitude: 46.24, longitude: -63.13 });
    const b = await provider.getElevation({ latitude: 46.21, longitude: -63.09 });
    expect(a).toEqual({ centerM: 50, minM: 10, maxM: 90 });
    expect(b).toEqual(a);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown[])[0]));
    expect(url.origin + url.pathname).toBe('https://api.open-meteo.com/v1/elevation');
    // Only points derived from the coarse cell are sent, never the request coordinates.
    expect(new Set(url.searchParams.get('latitude')?.split(','))).toEqual(
      new Set(['46.16', '46.20', '46.24']),
    );
    expect(url.searchParams.get('longitude')?.split(',')).toHaveLength(9);

    const failing = new OpenMeteoElevationProvider(new MemoryCache(), (async () => {
      throw new Error('offline');
    }) as typeof fetch);
    await expect(failing.getElevation(HALIFAX)).rejects.toBeDefined();
  });

  it('counts GBIF records at the site elevation only when asked', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (input: string | URL) => {
      const url = new URL(String(input));
      urls.push(url.search);
      const elevation = url.searchParams.get('elevation');
      const count = elevation === '-1000,9000' ? 40 : elevation ? 4 : 120;
      return new Response(JSON.stringify({ count, facets: [] }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;
    const provider = new GbifOccurrenceProvider(new GbifClient(new MemoryCache(), fetchImpl));
    const taxon = { scientificName: 'X', category: 'plant' as const, gbifKey: 42 };
    const plain = await provider.getOccurrenceEvidence(taxon, HALIFAX, new Date());
    expect(plain.elevation).toBeUndefined();
    expect(urls.some((u) => u.includes('elevation'))).toBe(false);
    const withElevation = await provider.getOccurrenceEvidence(taxon, HALIFAX, new Date(), {
      elevation: site,
    });
    expect(withElevation.elevation).toEqual({
      site,
      bandM: [1250, 2350],
      recordsWithElevation: 40,
      recordsInBand: 4,
    });
  });

  it('keeps identifying when the elevation lookup fails', async () => {
    const providers = {
      ...createMockProviders('high'),
      elevation: {
        name: 'Open-Meteo',
        getElevation: vi.fn(async () => {
          throw new Error('down');
        }),
      },
    };
    const result = await runIdentification(
      {
        observationId: 'o',
        category: 'plant',
        images: [
          { data: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg', feature: 'leaf' },
        ],
        location: HALIFAX,
        capturedAt: new Date('2026-09-20T12:00:00Z'),
        localHour: 9,
      },
      { providers },
    );
    expect(providers.elevation.getElevation).toHaveBeenCalled();
    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.attribution.some((a) => a.provider === 'Open-Meteo')).toBe(false);
  });
});

describe('camera tilt', () => {
  it('reads fit from EltonTraits foraging strata; unknown groups are neutral', () => {
    const flicker = { scientificName: 'Colaptes auratus', category: 'bird' as const }; // G100
    const nuthatch = { scientificName: 'Sitta carolinensis', category: 'bird' as const };
    expect(tiltFit(flicker, 'down')).toBe(1);
    expect(tiltFit(flicker, 'up')).toBe(-1);
    expect(tiltFit(nuthatch, 'up')).toBe(1);
    expect(tiltFit({ scientificName: 'Sciurus carolinensis', category: 'mammal' }, 'up')).toBe(1);
    expect(tiltFit({ scientificName: 'Amanita muscaria', category: 'fungus' }, 'down')).toBe(1);
    expect(tiltFit({ scientificName: 'Acer rubrum', category: 'plant' }, 'up')).toBe(0);
    expect(tiltFit(flicker, 'level')).toBe(0);
    expect(tiltFit(flicker, undefined)).toBe(0);
  });

  it('only breaks near-ties', () => {
    expect(tiltTieBreak([0.5, 0.49], [-1, 1])).toEqual([1 - CONTEXT.tiltTieMargin, undefined]);
    expect(tiltTieBreak([0.5, 0.4], [-1, 1])).toEqual([undefined, undefined]);
    expect(tiltTieBreak([0.5, 0.49], [0, 0])).toEqual([undefined, undefined]);
  });

  it('flips close candidates, never distant ones, and says so', async () => {
    const close = await reranker.rerank({
      candidates: [candidate('Colaptes auratus', 0.5), candidate('Sitta carolinensis', 0.49)],
      locationUsed: false,
      capturedAt: new Date(),
      context: { tilt: 'up' },
    });
    expect(close.map((c) => c.scientificName)).toEqual(['Sitta carolinensis', 'Colaptes auratus']);
    expect(close[1].nudges?.tilt).toBeCloseTo(0.97);
    const evidence = buildEvidence({
      category: 'bird',
      candidates: close,
      band: 'low',
      imageCount: 1,
      features: [],
      locationProvided: false,
      occurrenceStatus: 'skipped',
      tilt: 'up',
    });
    expect(evidence.supports.map((s) => s.text)).toContain(
      'Camera pointing up used to separate close matches',
    );
    const distant = await reranker.rerank({
      candidates: [candidate('Colaptes auratus', 0.7), candidate('Sitta carolinensis', 0.4)],
      locationUsed: false,
      capturedAt: new Date(),
      context: { tilt: 'up' },
    });
    expect(distant[0].scientificName).toBe('Colaptes auratus');
    expect(distant[0].finalConfidence).toBe(0.7);
    expect(distant.every((c) => c.nudges === undefined)).toBe(true);
  });
});

describe('request fields', () => {
  const JPEG = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0,
    0, 11, 8, 0, 200, 1, 44, 3, 1, 0x22, 0,
  ]);
  const form = (fields: Record<string, string>) => {
    const f = new FormData();
    f.append('images', new Blob([JPEG as BlobPart], { type: 'image/jpeg' }), 'x');
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    return f;
  };

  it('parses local hour and tilt', async () => {
    const parsed = await parseIdentifyForm(
      form({ localHour: '21.5', localHourApprox: '1', tilt: 'down' }),
    );
    expect(parsed).toMatchObject({ localHour: 21.5, localHourApprox: true, tilt: 'down' });
  });

  it('works for old clients and drops malformed hints instead of failing', async () => {
    const old = await parseIdentifyForm(form({}));
    expect(old.localHour).toBeUndefined();
    expect(old.tilt).toBeUndefined();
    const junk = await parseIdentifyForm(form({ localHour: '99', tilt: 'sideways' }));
    expect(junk.localHour).toBeUndefined();
    expect(junk.tilt).toBeUndefined();
    const exact = await parseIdentifyForm(form({ localHour: '7' }));
    expect(exact).toMatchObject({ localHour: 7, localHourApprox: false });
  });
});
