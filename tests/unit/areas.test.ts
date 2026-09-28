import { describe, expect, it } from 'vitest';
import {
  AREA_MILESTONES,
  areaMilestones,
  countryMilestones,
  exploredAreas,
  exploredCountries,
  formatArea,
  milestoneProgress,
  type CountryLookup,
} from '../../src/features/journal/areas';
import { countryOf } from '../../src/features/journal/countries';
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
