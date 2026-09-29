import { describe, expect, it, vi } from 'vitest';
import { coarseLocationLabel, labelCell } from '../../shared/geo';
import { handleGeocode } from '../../server/http/geocodeHandlers';
import { MemoryCache } from '../../server/cache/cache';
import { readEnv } from '../../server/lib/env';
import { RateLimiter } from '../../server/lib/rateLimit';
import {
  GEOCODE_USER_AGENT,
  GeocodeService,
  MOCK_GEOCODE,
  NOMINATIM_INTERVAL_MS,
  nominatimLabel,
  parseNominatim,
  parseOpenMeteo,
} from '../../server/providers/geocode/geocode';
import { parseLocationLabel } from '../../src/features/journal/journal';

const env = readEnv({});
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

const HOUSE = {
  lat: '46.23526',
  lon: '-63.12654',
  name: '',
  addresstype: 'building',
  address: {
    house_number: '12',
    road: 'Queen Street',
    city: 'Charlottetown',
    state: 'Prince Edward Island',
    postcode: 'C1A 4A2',
    country: 'Canada',
  },
};
const PARK = {
  lat: '44.3833',
  lon: '-65.2167',
  name: 'Kejimkujik National Park',
  addresstype: 'national_park',
  address: { county: 'Annapolis County', state: 'Nova Scotia', country: 'Canada' },
};
const OPEN_METEO = {
  results: [
    {
      name: 'Charlottetown',
      latitude: 46.23525,
      longitude: -63.12671,
      admin1: 'Prince Edward Island',
      country: 'Canada',
    },
  ],
};

function service(route: (url: URL) => Response | Promise<Response>, now = () => 0) {
  const fetchImpl = vi.fn(async (input: string | URL | Request, _init?: RequestInit) =>
    route(new URL(String(input))),
  );
  const sleep = vi.fn(async () => undefined);
  const svc = new GeocodeService({
    cache: new MemoryCache(),
    fetchImpl: fetchImpl as unknown as typeof fetch,
    now,
    sleep,
  });
  return { svc, fetchImpl, sleep };
}

const req = (q: string, ip = '1.2.3.4') =>
  new Request(`http://x/api/geocode?${new URLSearchParams({ q })}`, {
    headers: { 'x-forwarded-for': ip },
  });

describe('geocode labels and rounding', () => {
  it('keeps the town, region and country, never the street address', () => {
    expect(nominatimLabel(HOUSE)).toBe('Charlottetown, Prince Edward Island, Canada');
    expect(nominatimLabel(PARK)).toBe(
      'Kejimkujik National Park, Annapolis County, Nova Scotia, Canada',
    );
    const [r] = parseNominatim([HOUSE]);
    expect(JSON.stringify(r)).not.toMatch(/Queen|12|C1A/);
  });

  it('rounds coordinates to the ~11 km journal cell', () => {
    expect(parseNominatim([HOUSE, PARK])).toEqual([
      { label: 'Charlottetown, Prince Edward Island, Canada', latitude: 46.2, longitude: -63.1 },
      {
        label: 'Kejimkujik National Park, Annapolis County, Nova Scotia, Canada',
        latitude: 44.4,
        longitude: -65.2,
      },
    ]);
    expect(parseOpenMeteo(OPEN_METEO)).toEqual([
      { label: 'Charlottetown, Prince Edward Island, Canada', latitude: 46.2, longitude: -63.1 },
    ]);
  });

  it('drops duplicates, bad coordinates and caps at five', () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      ...HOUSE,
      address: { ...HOUSE.address, city: `Town ${i}` },
    }));
    expect(parseNominatim([HOUSE, HOUSE, { ...HOUSE, lat: 'x' }])).toHaveLength(1);
    expect(parseNominatim(many)).toHaveLength(5);
    expect(parseNominatim({})).toEqual([]);
    expect(parseOpenMeteo({})).toEqual([]);
  });

  it('snaps to the same cell a find made at that point is labelled with', () => {
    const points = [
      { latitude: 46.23526, longitude: -63.12654 },
      { latitude: -33.8688, longitude: 151.2093 },
      { latitude: 46.25, longitude: -63.15 },
      { latitude: 46.249, longitude: -63.149 },
      { latitude: -0.04, longitude: -0.04 },
      { latitude: 0.049, longitude: 179.96 },
    ];
    for (let i = 0; i < 500; i++) {
      points.push({ latitude: Math.random() * 180 - 90, longitude: Math.random() * 360 - 180 });
    }
    for (const p of points) {
      const cell = labelCell(p);
      const fromLabel = parseLocationLabel(coarseLocationLabel(labelCell(p)))!;
      const findLabel = parseLocationLabel(
        coarseLocationLabel({
          latitude: Math.round(p.latitude * 100) / 100,
          longitude: Math.round(p.longitude * 100) / 100,
        }),
      )!;
      expect(`${cell.latitude},${cell.longitude}`).toBe(
        `${findLabel.latitude},${findLabel.longitude}`,
      );
      expect(`${cell.latitude},${cell.longitude}`).toBe(
        `${fromLabel.latitude},${fromLabel.longitude}`,
      );
    }
  });
});

describe('geocode service', () => {
  it('asks Nominatim with an identifying User-Agent and caches the answer', async () => {
    const { svc, fetchImpl } = service(() => ok([HOUSE]));
    const first = await svc.search('12 Queen Street, Charlottetown');
    const again = await svc.search('  12 queen   STREET, charlottetown ');
    expect(first).toEqual({
      results: [
        { label: 'Charlottetown, Prince Edward Island, Canada', latitude: 46.2, longitude: -63.1 },
      ],
      source: 'openstreetmap',
    });
    expect(again).toEqual(first);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    const u = new URL(String(url));
    expect(u.hostname).toBe('nominatim.openstreetmap.org');
    expect(u.searchParams.get('format')).toBe('jsonv2');
    expect(u.searchParams.get('limit')).toBe('5');
    expect(u.searchParams.get('addressdetails')).toBe('1');
    expect((init?.headers as Record<string, string>)['User-Agent']).toBe(GEOCODE_USER_AGENT);
  });

  it('spaces Nominatim requests at least a second apart', async () => {
    let clock = 0;
    const { svc, fetchImpl, sleep } = service(
      () => ok([HOUSE]),
      () => clock,
    );
    sleep.mockImplementation(async (ms: number) => {
      clock += ms;
    });
    await Promise.all([svc.search('one'), svc.search('two'), svc.search('three')]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep.mock.calls.every(([ms]) => ms === NOMINATIM_INTERVAL_MS)).toBe(true);
    expect(clock).toBe(2 * NOMINATIM_INTERVAL_MS);
  });

  it('falls back to Open-Meteo place names when Nominatim fails', async () => {
    const { svc, fetchImpl } = service((url) =>
      url.hostname.startsWith('nominatim') ? new Response('busy', { status: 503 }) : ok(OPEN_METEO),
    );
    const r = await svc.search('Charlottetown');
    expect(r.source).toBe('open-meteo');
    expect(r.results[0]).toEqual({
      label: 'Charlottetown, Prince Edward Island, Canada',
      latitude: 46.2,
      longitude: -63.1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports unavailable when both fail, and does not cache failures', async () => {
    const { svc, fetchImpl } = service(() => new Response('x', { status: 500 }));
    await expect(svc.search('Charlottetown')).rejects.toMatchObject({
      code: 'provider_unavailable',
    });
    await expect(svc.search('Charlottetown')).rejects.toBeTruthy();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});

describe('GET /api/geocode', () => {
  it('returns rounded results without logging the query', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { svc } = service(() => ok([HOUSE]));
    const res = await handleGeocode(req('12 Queen Street, Charlottetown'), { env, service: svc });
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const body = (await res.json()) as { results: unknown[] };
    expect(body.results).toEqual([
      { label: 'Charlottetown, Prince Edward Island, Canada', latitude: 46.2, longitude: -63.1 },
    ]);
    for (const call of info.mock.calls) expect(String(call[0])).not.toMatch(/Queen/i);
    info.mockRestore();
  });

  it('rejects empty or overlong queries and other methods', async () => {
    const { svc, fetchImpl } = service(() => ok([]));
    expect((await handleGeocode(req(' '), { env, service: svc })).status).toBe(400);
    expect((await handleGeocode(req('x'.repeat(201)), { env, service: svc })).status).toBe(400);
    const post = new Request('http://x/api/geocode?q=abc', { method: 'POST' });
    expect((await handleGeocode(post, { env, service: svc })).status).toBe(405);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rate limits each client', async () => {
    const { svc } = service(() => ok([]));
    const limiter = new RateLimiter(1, 60_000);
    expect((await handleGeocode(req('abc'), { env, service: svc, limiter })).status).toBe(200);
    const limited = await handleGeocode(req('abd'), { env, service: svc, limiter });
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
    expect(
      (await handleGeocode(req('abd', '5.6.7.8'), { env, service: svc, limiter })).status,
    ).toBe(200);
  });

  it('answers canned results in mock mode without the network', async () => {
    const { svc, fetchImpl } = service(() => ok([HOUSE]));
    const res = await handleGeocode(req('anywhere'), {
      env: readEnv({ USE_MOCK_API: '1' }),
      service: svc,
    });
    expect(await res.json()).toEqual(MOCK_GEOCODE);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
