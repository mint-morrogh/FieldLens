import { describe, expect, it, vi } from 'vitest';
import { MemoryCache } from '../../server/cache/cache';
import { handleNearbyFamilies, handleWhatsOut } from '../../server/http/nearbyHandlers';
import { readEnv } from '../../server/lib/env';
import { RateLimiter } from '../../server/lib/rateLimit';
import { GbifClient } from '../../server/providers/gbif/gbif';
import { NearbyService, WHATS_OUT, pickPeaks } from '../../server/providers/gbif/nearby';
import type { ReferencePhotoProvider } from '../../server/safety/lookalikePhotos';

const env = readEnv({});
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

function facet(counts: [number, number][], total?: number) {
  return {
    count: total ?? counts.reduce((sum, [, c]) => sum + c, 0),
    facets: [
      { field: 'SPECIES_KEY', counts: counts.map(([k, c]) => ({ name: String(k), count: c })) },
    ],
  };
}

/** A fake GBIF answering by path and query, recording every URL. */
function fakeGbif(route: (url: URL) => unknown) {
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const body = route(url);
    return body === undefined ? new Response('{}', { status: 500 }) : ok(body);
  });
  const cache = new MemoryCache();
  const client = new GbifClient(cache, fetchImpl as unknown as typeof fetch);
  return { fetchImpl, cache, client };
}

function familiesRequest(body: unknown) {
  return new Request('http://x/api/nearby-families', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('nearby family counts', () => {
  const route = (url: URL) => {
    if (url.pathname.endsWith('/species/match')) {
      const name = url.searchParams.get('name');
      if (name === 'Sapindaceae')
        return { usageKey: 6657, rank: 'FAMILY', matchType: 'EXACT', status: 'ACCEPTED' };
      if (name === 'Acer') return { usageKey: 3189834, rank: 'GENUS', matchType: 'EXACT' };
      return { matchType: 'NONE' };
    }
    if (url.pathname.endsWith('/occurrence/search')) {
      const key = url.searchParams.get('taxonKey');
      if (key === '6657')
        return facet([
          [1, 50],
          [2, 20],
          [3, 1],
        ]);
      if (key === '3189834') return facet([[1, 50]]);
    }
    return undefined;
  };

  it('counts distinct species within 50 km of a rounded cell', async () => {
    const { fetchImpl, client } = fakeGbif(route);
    const service = new NearbyService(client);
    const res = await handleNearbyFamilies(
      familiesRequest({
        latitude: 46.2371,
        longitude: -63.1311,
        taxa: [
          { name: 'Sapindaceae', rank: 'family', group: 'plant' },
          { name: 'Acer', rank: 'genus', group: 'plant' },
          { name: 'Nonexistia', rank: 'family', group: 'plant' },
        ],
      }),
      { env, service, limiter: new RateLimiter(100, 1000) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.radiusKm).toBe(50);
    expect(body.results).toEqual([
      { name: 'Sapindaceae', rank: 'family', species: 3 },
      { name: 'Acer', rank: 'genus', species: 1 },
    ]);
    const searches = fetchImpl.mock.calls
      .map(([u]) => new URL(String(u)))
      .filter((u) => u.pathname.endsWith('/occurrence/search'));
    // Only the ~11 km cell leaves the server, never the precise coordinates.
    for (const u of searches) {
      expect(u.searchParams.get('geoDistance')).toBe('46.2,-63.1,50km');
      expect(u.searchParams.get('facet')).toBe('speciesKey');
    }
    const match = fetchImpl.mock.calls
      .map(([u]) => new URL(String(u)))
      .find((u) => u.searchParams.get('name') === 'Sapindaceae');
    expect(match?.searchParams.get('rank')).toBe('FAMILY');
    expect(match?.searchParams.get('kingdom')).toBe('Plantae');
  });

  it('caches per cell and taxon', async () => {
    const { fetchImpl, client } = fakeGbif(route);
    const service = new NearbyService(client);
    const req = {
      latitude: 46.21,
      longitude: -63.12,
      taxa: [{ name: 'Sapindaceae', rank: 'family' as const, group: 'plant' as const }],
    };
    await service.familyCounts(req);
    const calls = fetchImpl.mock.calls.length;
    await service.familyCounts({ ...req, latitude: 46.24 }); // same 0.1° cell
    expect(fetchImpl.mock.calls.length).toBe(calls);
  });

  it('rejects bad input and wrong methods', async () => {
    const opts = { env, service: new NearbyService(fakeGbif(route).client) };
    expect((await handleNearbyFamilies(familiesRequest({ latitude: 200 }), opts)).status).toBe(400);
    expect(
      (
        await handleNearbyFamilies(
          familiesRequest({
            latitude: 1,
            longitude: 1,
            taxa: [{ name: 'a b; drop', rank: 'family', group: 'plant' }],
          }),
          opts,
        )
      ).status,
    ).toBe(400);
    expect(
      (await handleNearbyFamilies(new Request('http://x/api/nearby-families'), opts)).status,
    ).toBe(405);
  });

  it('rate limits', async () => {
    const limiter = new RateLimiter(1, 60_000);
    const opts = { env, service: new NearbyService(fakeGbif(route).client), limiter };
    const body = {
      latitude: 1,
      longitude: 1,
      taxa: [{ name: 'Acer', rank: 'genus', group: 'plant' }],
    };
    expect((await handleNearbyFamilies(familiesRequest(body), opts)).status).toBe(200);
    expect((await handleNearbyFamilies(familiesRequest(body), opts)).status).toBe(429);
  });

  it('answers with sample data in mock mode, without network', async () => {
    const res = await handleNearbyFamilies(
      familiesRequest({
        latitude: 1,
        longitude: 1,
        taxa: [{ name: 'Acer', rank: 'genus', group: 'plant' }],
      }),
      { env: readEnv({ USE_MOCK_API: 'true' }) },
    );
    expect((await res.json()).results[0].species).toBeGreaterThan(0);
  });
});

describe('pickPeaks', () => {
  it('keeps species whose month share is well above the group’s own', () => {
    // The group logs 10% of its records this month.
    const month = facet(
      [
        [1, 40], // 40 of 100 all-time: 4× the group's share
        [2, 30], // 30 of 300: 1×, logged all year
        [3, 3], // 3 of 3: at its peak but too few records
      ],
      100,
    );
    const all = facet(
      [
        [1, 100],
        [2, 300],
        [3, 3],
      ],
      1000,
    );
    const peaks = pickPeaks(month, all);
    expect(peaks.map((p) => p.key)).toEqual([1]);
    expect(WHATS_OUT.minMonthRecords).toBeGreaterThan(3);
  });
  it('is empty without data', () => {
    expect(pickPeaks({ count: 0 }, { count: 0 })).toEqual([]);
  });
});

describe("what's out now", () => {
  const species: Record<string, unknown> = {
    '101': {
      key: 101,
      canonicalName: 'Solidago canadensis',
      rank: 'SPECIES',
      vernacularName: 'Canada goldenrod',
    },
    '201': { key: 201, canonicalName: 'Amanita muscaria', rank: 'SPECIES' },
  };
  const route = (url: URL) => {
    const m = url.pathname.match(/\/species\/(\d+)$/);
    if (m) return species[m[1]];
    if (!url.pathname.endsWith('/occurrence/search')) return undefined;
    const taxon = url.searchParams.get('taxonKey');
    const hasMonth = url.searchParams.has('month');
    if (taxon === '6') return hasMonth ? facet([[101, 40]], 100) : facet([[101, 50]], 1000);
    if (taxon === '5') return hasMonth ? facet([[201, 20]], 50) : facet([[201, 25]], 500);
    if (taxon === '212') return undefined; // birds fail: left out, not fatal
    return hasMonth ? facet([], 0) : facet([], 0);
  };

  it('returns peak species per group with names and photos', async () => {
    const { client, fetchImpl } = fakeGbif(route);
    const photos: ReferencePhotoProvider = {
      name: 'test',
      getReferencePhoto: async (t) =>
        t.scientificName === 'Solidago canadensis'
          ? { url: 'https://img/1.jpg', source: 'iNaturalist', author: 'A', license: 'CC BY' }
          : undefined,
    };
    const service = new NearbyService(client, photos, new MemoryCache());
    const res = await handleWhatsOut(
      new Request('http://x/api/whats-out?lat=46.237&lon=-63.131&month=9'),
      { env, service, limiter: new RateLimiter(100, 1000) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.month).toBe(9);
    expect(body.species).toEqual([
      {
        scientificName: 'Solidago canadensis',
        commonName: 'Canada goldenrod',
        group: 'plant',
        gbifKey: 101,
        url: 'https://www.gbif.org/species/101',
        photo: { url: 'https://img/1.jpg', source: 'iNaturalist', author: 'A', license: 'CC BY' },
      },
      {
        scientificName: 'Amanita muscaria',
        group: 'fungus',
        gbifKey: 201,
        url: 'https://www.gbif.org/species/201',
      },
    ]);
    const monthCalls = fetchImpl.mock.calls
      .map(([u]) => new URL(String(u)))
      .filter((u) => u.searchParams.get('month') === '9');
    expect(monthCalls.length).toBeGreaterThan(0);
    for (const u of monthCalls) expect(u.searchParams.get('geoDistance')).toBe('46.2,-63.1,50km');

    // The finished list is cached per cell and month.
    const before = fetchImpl.mock.calls.length;
    await service.whatsOut({ latitude: 46.21, longitude: -63.14 }, 9);
    expect(fetchImpl.mock.calls.length).toBe(before);
  });

  it('does not cache a total outage', async () => {
    let down = true;
    const { client } = fakeGbif((url) => (down ? undefined : route(url)));
    const service = new NearbyService(client, undefined, new MemoryCache());
    await expect(service.whatsOut({ latitude: 1, longitude: 1 }, 9)).rejects.toThrow();
    down = false;
    expect((await service.whatsOut({ latitude: 1, longitude: 1 }, 9)).species.length).toBe(2);
  });

  it('validates location and month', async () => {
    const opts = { env, service: new NearbyService(fakeGbif(route).client) };
    const status = async (q: string) =>
      (await handleWhatsOut(new Request(`http://x/api/whats-out?${q}`), opts)).status;
    expect(await status('lat=1')).toBe(400);
    expect(await status('lat=1&lon=1&month=13')).toBe(400);
    expect(await status('lat=95&lon=1&month=3')).toBe(400);
  });
});
