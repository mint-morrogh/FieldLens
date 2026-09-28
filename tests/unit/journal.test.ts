import { describe, expect, it } from 'vitest';
import type { ObservationRecord } from '../../src/features/history/historyStore';
import {
  familyTrees,
  partsOf,
  seasonOf,
  speciesPage,
  groupOf,
  isNocturnal,
  journalStamps,
  POINTS_PER_SHARP_EYE,
  seasonalWheel,
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

  it('groups species into family trees, falling back to the genus', () => {
    const withFamily = (name: string, family?: string) =>
      record(name, {
        result: { candidates: [{ genus: name.split(' ')[0], family }] } as never,
      });
    const trees = familyTrees(
      speciesEntries([
        withFamily('Acer rubrum', 'Sapindaceae'),
        withFamily('Acer saccharum', 'Sapindaceae'),
        withFamily('Aesculus glabra', 'Sapindaceae'),
        withFamily('Picea glauca'),
      ]),
    );
    expect(trees[0]).toMatchObject({ name: 'Sapindaceae', rank: 'family' });
    expect(trees[0].genera).toEqual([
      { name: 'Acer', count: 2 },
      { name: 'Aesculus', count: 1 },
    ]);
    expect(trees[1]).toMatchObject({ name: 'Picea', rank: 'genus' });
  });

  it('fills the seasonal wheel by local month and group', () => {
    const wheel = seasonalWheel([
      record('A b', { createdAt: new Date(2026, 0, 15, 12).toISOString() }),
      record('C d', { createdAt: new Date(2026, 0, 20, 12).toISOString() }),
      record('E f', { category: 'fungus', createdAt: new Date(2026, 9, 3, 12).toISOString() }),
    ]);
    expect(wheel.map((w) => w.group)).toEqual(['plant', 'fungus']);
    expect(wheel[0].months[0]).toBe(2);
    expect(wheel[1].months[9]).toBe(1);
  });

  it('reads nocturnal activity from the sourced facts', () => {
    const active = (value: string) =>
      record('X y', {
        result: { speciesInfo: { facts: [{ label: 'Active', value, source: 'x' }] } } as never,
      });
    expect(isNocturnal(active('At night'))).toBe(true);
    expect(isNocturnal(active('At dawn and dusk and at night'))).toBe(true);
    expect(isNocturnal(active('By day and at night'))).toBe(false);
    expect(isNocturnal(record('X y'))).toBe(false);
  });

  it('earns stamps from confident finds only', () => {
    const at = (h: number, day = 1) => new Date(2026, 5, day, h).toISOString();
    const stamps = journalStamps([
      record('Early bird', { createdAt: at(6), band: 'low' }),
      record('Vulpes vulpes', {
        category: 'mammal',
        createdAt: at(10, 2),
        result: { sign: 'track' } as never,
      }),
      ...['a', 'b', 'c', 'd', 'e'].map((s, i) =>
        record(`Amanita ${s}`, { category: 'fungus', createdAt: at(12, 3 + i) }),
      ),
    ]);
    const byId = (id: string) => stamps.find((s) => s.id === id)!;
    expect(byId('first-light').earnedAt).toBeUndefined(); // the early find was low confidence
    expect(byId('tracker').earnedAt).toBe(at(10, 2));
    expect(byId('mycologist')).toMatchObject({ progress: { have: 5, need: 10 } });
    expect(byId('five-groups').progress).toEqual({ have: 2, need: 5 });
    const family = stamps.find((s) => s.id === 'family' && s.earnedAt);
    expect(family).toMatchObject({ name: 'Amanita', earnedAt: at(12, 7) });
  });

  it('reads the photographed parts, including tracks and droppings', () => {
    expect(
      partsOf(record('A b', { result: { features: ['flower', 'auto', 'leaf'] } as never })),
    ).toEqual(['flower', 'leaf']);
    expect(
      partsOf(record('A b', { result: { features: ['auto'], sign: 'track' } as never })),
    ).toEqual(['track']);
    expect(partsOf(record('A b'))).toEqual([]);
  });

  it('flips seasons for the southern hemisphere', () => {
    const july = new Date(2026, 6, 10, 12).toISOString();
    expect(seasonOf(record('A b', { createdAt: july, locationLabel: '46.2°N, 63.1°W' }))).toBe(
      'summer',
    );
    expect(seasonOf(record('A b', { createdAt: july, locationLabel: '33.9°S, 151.2°E' }))).toBe(
      'winter',
    );
    expect(seasonOf(record('A b', { createdAt: july }))).toBe('summer');
  });

  it('fills in a species page from its sightings', () => {
    const [entry] = speciesEntries([
      record('Acer rubrum', {
        createdAt: new Date(2026, 3, 20, 12).toISOString(),
        locationLabel: '46.2°N, 63.1°W',
        result: { features: ['flower'] } as never,
      }),
      record('Acer rubrum', {
        createdAt: new Date(2026, 9, 5, 12).toISOString(),
        locationLabel: '45.9°N, 64.0°W',
        result: { features: ['leaf'] } as never,
      }),
    ]);
    const page = speciesPage(entry);
    expect(page.seasons).toEqual(['spring', 'autumn']);
    expect(page.places).toHaveLength(2);
    expect(page.months[3]).toBe(1);
    expect(page.parts.filter((p) => p.have).map((p) => p.id)).toEqual(['flower', 'leaf']);
    expect(page.parts.some((p) => p.id === 'bark' && !p.have)).toBe(true);
    const done = Object.fromEntries(page.milestones.map((m) => [m.id, m.done]));
    expect(done).toMatchObject({
      first: true,
      three: false,
      seasons: true,
      places: true,
      parts: false,
    });
    expect(page.completion).toBeCloseTo(4 / 6);
  });

  it('gives a point for each extra part of a confident species', () => {
    const base = rankFor(speciesEntries([record('Acer rubrum')])).points;
    const withParts = rankFor(
      speciesEntries([
        record('Acer rubrum', { result: { features: ['flower'] } as never }),
        record('Acer rubrum', { result: { features: ['leaf', 'bark'] } as never }),
      ]),
    ).points;
    expect(withParts - base).toBe(2);
  });

  it('counts trees for the Canopy stamp only when "Tree" was chosen', () => {
    const stamps = journalStamps([
      record('Acer rubrum', { result: { requestedTarget: 'tree' } as never }),
      record('Trillium grandiflorum'),
    ]);
    expect(stamps.find((s) => s.id === 'canopy')?.progress).toEqual({ have: 1, need: 10 });
  });
  it('adds sharp-eye points for confident finds only', () => {
    const base = rankFor(speciesEntries([record('Acer rubrum')])).points;
    const sharp = rankFor(
      speciesEntries([
        record('Acer rubrum', { sharpEye: true }),
        record('Picea glauca', { sharpEye: true, band: 'low' }),
      ]),
    ).points;
    expect(sharp - base).toBe(POINTS_PER_SHARP_EYE);
  });

  it('earns Sharp Eye from the first confident sharp-eye find', () => {
    const records = [
      record('Picea glauca', { sharpEye: true, band: 'low' }),
      record('Acer rubrum', { sharpEye: true }),
    ];
    const sharp = journalStamps(records).find((s) => s.id === 'sharp-eye')!;
    expect(sharp.earnedAt).toBe(records[1].createdAt);
    const none = journalStamps([record('Acer rubrum')]).find((s) => s.id === 'sharp-eye');
    expect(none?.earnedAt).toBeUndefined();
  });

  it('earns Called It for a guess that named a confident find, with progress toward ten', () => {
    const exact = { text: 'red maple', result: 'exact' as const };
    const records = [
      record('Picea glauca', { band: 'low', guess: exact }),
      record('Acer rubrum', { guess: { text: 'acer', result: 'close' } }),
      record('Quercus rubra', { guess: exact }),
      record('Betula papyrifera', { guess: { group: 'plant', result: 'group' } }),
      record('Tilia americana', { guess: { text: 'oak', result: 'miss' } }),
    ];
    const stamps = journalStamps(records);
    const called = stamps.find((s) => s.id === 'called-it')!;
    // The low-confidence guess doesn't count; the genus-level one does.
    expect(called.earnedAt).toBe(records[1].createdAt);
    expect(called.note).toBe('2 called so far');
    expect(stamps.find((s) => s.id === 'called-ten')?.progress).toEqual({ have: 2, need: 10 });
  });

  it('shows the guessing stamps only with Name it first on or after a guess', () => {
    const plain = [record('Acer rubrum')];
    expect(journalStamps(plain).some((s) => s.id === 'called-it')).toBe(false);
    expect(journalStamps(plain, { nameItFirst: true }).some((s) => s.id === 'called-it')).toBe(
      true,
    );
  });
});
