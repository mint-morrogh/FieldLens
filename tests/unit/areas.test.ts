import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AREA_MILESTONES,
  areaMilestones,
  countryMilestones,
  exploredAreas,
  exploredCountries,
  formatArea,
  milestoneProgress,
  exploredRegions,
  regionMilestones,
  regionNames,
  type CountryLookup,
  type RegionLookup,
} from '../../src/features/journal/areas';
import { countryOf } from '../../src/features/journal/countries';
import {
  createRegionLookup,
  loadRegionOf,
  type AdminTopology,
} from '../../src/features/journal/regions';
import { find } from './journalRecord';

const day = (d: number) => new Date(2026, 5, d, 12);

describe('explored areas', () => {
  it('counts one area per ~11 km cell, from confident finds only', () => {
    const areas = exploredAreas([
      find('A b', day(3), { locationLabel: '46.2°N, 63.1°W' }),
      find('C d', day(1), { locationLabel: '46.2°N, 63.1°W' }),
      find('E f', day(2), { locationLabel: '45.9°N, 64.0°W' }),
      find('G h', day(4), { locationLabel: '44.6°N, 63.6°W', band: 'low' }),
      find('I j', day(5)), // no location
      find('K l', day(6), { locationLabel: '10.0°N, 10.0°E', category: 'other' }),
    ]);
    expect(areas.map((a) => a.label)).toEqual(['46.2°N, 63.1°W', '45.9°N, 64°W']);
    expect(areas[0]).toMatchObject({
      finds: 2,
      firstFound: day(1).toISOString(),
      lastFound: day(3).toISOString(),
      latitude: 46.2,
      longitude: -63.1,
    });
  });

  it('can include every place with a find, for choosing a patch', () => {
    const records = [find('G h', day(4), { locationLabel: '44.6°N, 63.6°W', band: 'low' })];
    expect(exploredAreas(records)).toHaveLength(0);
    expect(exploredAreas(records, { confirmedOnly: false })).toHaveLength(1);
  });

  it('formats areas like the stored labels', () => {
    expect(formatArea({ latitude: -33.9, longitude: 151.2 })).toBe('33.9°S, 151.2°E');
  });

  it('tracks milestones with the date each was reached', () => {
    const dates = Array.from({ length: 6 }, (_, i) => day(10 - i).toISOString());
    const p = milestoneProgress(dates, AREA_MILESTONES);
    expect(p.count).toBe(6);
    expect(p.last).toBe(5);
    expect(p.next).toBe(10);
    expect(p.progress).toBeCloseTo(1 / 5);
    expect(p.milestones[0]).toEqual({ need: 1, reachedAt: day(5).toISOString() });
    expect(p.milestones[1]).toEqual({ need: 5, reachedAt: day(9).toISOString() });
    expect(p.milestones[2].reachedAt).toBeUndefined();

    const none = areaMilestones([]);
    expect(none).toMatchObject({ count: 0, next: 1, last: undefined, progress: 0 });
    const all = milestoneProgress(
      Array.from({ length: 120 }, (_, i) => String(i).padStart(3, '0')),
      AREA_MILESTONES,
    );
    expect(all).toMatchObject({ next: undefined, last: 100, progress: 1 });
  });

  it('lists countries in the order first explored', () => {
    const lookup: CountryLookup = (lat) =>
      lat > 45 ? { id: '124', name: 'Canada' } : lat > 0 ? { id: '840', name: 'USA' } : undefined;
    const areas = exploredAreas([
      find('A b', day(1), { locationLabel: '46.2°N, 63.1°W' }),
      find('C d', day(2), { locationLabel: '40.0°N, 75.0°W' }),
      find('E f', day(3), { locationLabel: '47.0°N, 70.0°W' }),
      find('G h', day(4), { locationLabel: '10.0°S, 30.0°W' }), // open sea
    ]);
    const countries = exploredCountries(areas, lookup);
    expect(countries).toEqual([
      { id: '124', name: 'Canada', firstFound: day(1).toISOString() },
      { id: '840', name: 'USA', firstFound: day(2).toISOString() },
    ]);
    expect(countryMilestones(countries)).toMatchObject({ count: 2, last: 2, next: 3 });
  });
});

describe('offline country lookup', () => {
  it('finds the country for inland and coastal cells, and nothing mid-ocean', () => {
    expect(countryOf(46.2, -63.1)?.name).toBe('Canada'); // Charlottetown, PEI
    expect(countryOf(33.9, 151.2)).toBeUndefined(); // wrong hemisphere: the sea off Japan
    expect(countryOf(-33.9, 151.2)?.name).toBe('Australia'); // Sydney, on the coast
    expect(countryOf(48.9, 2.3)?.name).toBe('France');
    expect(countryOf(0, -30)).toBeUndefined();
  });
});

describe('provinces & states', () => {
  const regionOf = createRegionLookup(
    JSON.parse(
      readFileSync(
        path.join(
          path.dirname(fileURLToPath(import.meta.url)),
          '../../src/assets/admin1.topo.json',
        ),
        'utf8',
      ),
    ) as AdminTopology,
  );

  it.each([
    [44.6, -63.6, 'Nova Scotia', 'CA'], // Halifax
    [45.1, -64.9, 'Nova Scotia', 'CA'], // Annapolis Valley
    [46.2, -63.1, 'Prince Edward Island', 'CA'], // Charlottetown
    [46.4, -63.5, 'Prince Edward Island', 'CA'],
    [43.7, -79.4, 'Ontario', 'CA'], // Toronto
    [45.4, -75.7, 'Ontario', 'CA'], // Ottawa
    [46.8, -71.2, 'Quebec', 'CA'], // Quebec City
    [45.5, -73.6, 'Quebec', 'CA'], // Montreal
    [49.3, -123.1, 'British Columbia', 'CA'], // Vancouver
    [50.7, -120.3, 'British Columbia', 'CA'], // Kamloops
    [34.1, -118.2, 'California', 'US'], // Los Angeles
    [37.8, -122.4, 'California', 'US'], // San Francisco
    [40.78, -73.97, 'New York', 'US'], // Central Park
    [42.7, -73.8, 'New York', 'US'], // Albany
    [30.3, -97.7, 'Texas', 'US'], // Austin
    [48.1, 11.6, 'Bavaria', 'DE'], // Munich
    [-33.9, 151.2, 'New South Wales', 'AU'], // Sydney, on the coast
    [-27.5, 153.0, 'Queensland', 'AU'], // Brisbane
    [55.9, -3.2, 'Scotland', 'GB'], // Edinburgh: the UK is split into its four nations
    [51.5, -0.1, 'England', 'GB'], // London
    [48.9, 2.3, 'Île-de-France', 'FR'], // Paris: French regions, not departments
    [48.9, -110.0, 'Montana', 'US'], // just south of the 49th parallel
    [49.1, -100.0, 'Manitoba', 'CA'], // just north of it
  ])('finds %s, %s in %s', (lat, lon, name, country) => {
    expect(regionOf(lat, lon)).toMatchObject({ name, country });
  });

  it('finds nothing mid-ocean', () => {
    expect(regionOf(0, -30)).toBeUndefined();
    expect(regionOf(35, -140)).toBeUndefined();
  });

  it('lists regions in the order first explored, from confident finds only', () => {
    const areas = exploredAreas([
      find('A b', day(1), { locationLabel: '46.2°N, 63.1°W' }), // PEI
      find('C d', day(2), { locationLabel: '44.6°N, 63.6°W' }), // Nova Scotia
      find('E f', day(3), { locationLabel: '46.4°N, 63.5°W' }), // PEI again
      find('G h', day(4), { locationLabel: '45.5°N, 73.6°W', band: 'low' }), // Quebec, unsure
      find('I j', day(5), { locationLabel: '0°N, 30°W' }), // open sea
    ]);
    const regions = exploredRegions(areas, regionOf);
    expect(regions.map((r) => r.name)).toEqual(['Prince Edward Island', 'Nova Scotia']);
    expect(regions[0].firstFound).toBe(day(1).toISOString());
    expect(regionMilestones(regions)).toMatchObject({ count: 2, last: 2, next: 3 });
  });

  it('adds the country only where two regions share a name', () => {
    expect(
      regionNames([
        { id: 'IND-1', name: 'Punjab', country: 'IN' },
        { id: 'PAK-1', name: 'Punjab', country: 'PK' },
        { id: 'CAN-685', name: 'Nova Scotia', country: 'CA' },
      ]),
    ).toEqual(['Punjab (IN)', 'Punjab (PK)', 'Nova Scotia']);
  });

  it('uses the same milestone steps with a lookup stub', () => {
    const lookup: RegionLookup = (lat) => ({ id: String(lat), name: String(lat), country: 'X' });
    const areas = exploredAreas(
      [1, 2, 3, 4, 5].map((d) => find('A b', day(d), { locationLabel: `${d}.0°N, 10.0°E` })),
    );
    expect(regionMilestones(exploredRegions(areas, lookup))).toMatchObject({
      count: 5,
      last: 5,
      next: 10,
    });
  });
});

describe('loading the region outlines', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('rejects when the download fails, and tries again next time', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError('offline'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(loadRegionOf()).rejects.toThrow('offline');
    fetchMock.mockResolvedValue(new Response('nope', { status: 404 }));
    await expect(loadRegionOf()).rejects.toThrow('HTTP 404');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
