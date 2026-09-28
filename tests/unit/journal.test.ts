import { describe, expect, it } from 'vitest';
import type { ObservationRecord } from '../../src/features/history/historyStore';
import {
  groupOf,
  journalPins,
  parseLocationLabel,
  rankFor,
  speciesEntries,
} from '../../src/features/journal/journal';

let n = 0;
function record(
  scientificName: string,
  over: Partial<ObservationRecord> & { band?: 'high' | 'medium' | 'low' } = {},
): ObservationRecord {
  n++;
  return {
    id: `r${n}`,
    schemaVersion: 1,
    createdAt: new Date(Date.UTC(2026, 8, n)).toISOString(),
    category: 'plant',
    top: { scientificName, finalConfidence: 0.9, band: over.band ?? 'high' },
    imagesCount: 1,
    result: {} as ObservationRecord['result'],
    ...over,
  };
}

describe('field journal', () => {
  it('maps specific categories to the picker groups', () => {
    expect(groupOf('insect')).toBe('bug');
    expect(groupOf('arachnid')).toBe('bug');
    expect(groupOf('amphibian')).toBe('herp');
    expect(groupOf('mammal')).toBe('mammal');
    expect(groupOf('other')).toBeUndefined();
  });

  it('collects one entry per species with every sighting, newest first', () => {
    const entries = speciesEntries([
      record('Acer rubrum'),
      record('Acer rubrum'),
      record('Vulpes vulpes', { category: 'mammal', band: 'low' }),
    ]);
    const maple = entries.find((e) => e.scientificName === 'Acer rubrum')!;
    expect(maple.records).toHaveLength(2);
    expect(maple.records[0].createdAt > maple.records[1].createdAt).toBe(true);
    expect(maple.firstSeen).toBe(maple.records[1].createdAt);
    const fox = entries.find((e) => e.scientificName === 'Vulpes vulpes')!;
    expect(fox.confirmed).toBe(false);
  });

  it('ranks by confident species plus a bonus per group; unconfirmed finds don’t count', () => {
    const rank = rankFor(
      speciesEntries([
        record('Acer rubrum'),
        record('Acer saccharum', { band: 'medium' }),
        record('Vulpes vulpes', { category: 'mammal' }),
        record('Picea glauca', { band: 'low' }),
      ]),
    );
    expect(rank.species).toBe(3);
    expect(rank.groups).toBe(2);
    expect(rank.points).toBe(3 + 2 * 5);
    expect(rank.name).toBe('Observer');
    expect(rank.next?.name).toBe('Tracker');
    expect(rank.progress).toBeCloseTo((13 - 5) / (15 - 5));
    expect(rankFor([]).name).toBe('Wanderer');
  });

  it('turns the stored ~11 km labels into pins, one per place', () => {
    expect(parseLocationLabel('46.2°N, 63.1°W')).toEqual({ latitude: 46.2, longitude: -63.1 });
    expect(parseLocationLabel('33.9°S, 151.2°E')).toEqual({ latitude: -33.9, longitude: 151.2 });
    expect(parseLocationLabel(undefined)).toBeUndefined();
    const pins = journalPins([
      record('A b', { locationLabel: '46.2°N, 63.1°W' }),
      record('C d', { locationLabel: '46.2°N, 63.1°W' }),
      record('E f', { locationLabel: '45.9°N, 64.0°W' }),
      record('G h'),
    ]);
    expect(pins).toHaveLength(2);
    expect(pins.find((p) => p.latitude === 46.2)?.count).toBe(2);
  });
});
