import { describe, expect, it } from 'vitest';
import { MIN_YEAR_FINDS, reviewYears, yearInReview } from '../../src/features/journal/yearReview';
import { find } from './journalRecord';

const PLACE_A = '46.2°N, 63.1°W';
const PLACE_B = '45.9°N, 64.0°W';

const records = [
  // 2025: plants only
  find('Acer rubrum', new Date(2025, 4, 1, 12), { family: 'Sapindaceae' }),
  find('Picea glauca', new Date(2025, 4, 2, 12)),
  // 2026
  find('Acer rubrum', new Date(2026, 3, 10, 9), { family: 'Sapindaceae', locationLabel: PLACE_A }),
  find('Acer saccharum', new Date(2026, 3, 10, 15), {
    family: 'Sapindaceae',
    locationLabel: PLACE_A,
  }),
  find('Aesculus glabra', new Date(2026, 8, 3, 12), {
    family: 'Sapindaceae',
    locationLabel: PLACE_B,
  }),
  find('Amanita muscaria', new Date(2026, 8, 5, 12), {
    category: 'fungus',
    commonName: 'fly agaric',
    family: 'Amanitaceae',
    locationLabel: PLACE_B,
  }),
  find('Boletus edulis', new Date(2026, 8, 20, 12), {
    category: 'fungus',
    family: 'Boletaceae',
    locationLabel: PLACE_B,
  }),
  find('Turdus migratorius', new Date(2026, 8, 21, 12), {
    category: 'bird',
    family: 'Turdidae',
    locationLabel: PLACE_A,
  }),
  find('Vulpes vulpes', new Date(2026, 8, 22, 12), { category: 'mammal', band: 'low' }),
  // A new year's eve find stays in its own (local) year.
  find('Cornus sericea', new Date(2026, 11, 31, 23, 30)),
];

describe('year in review', () => {
  it('offers years with enough confident finds, newest first', () => {
    expect(reviewYears(records)).toEqual([2026]);
    expect(reviewYears(records, 2)).toEqual([2026, 2025]);
    expect(MIN_YEAR_FINDS).toBeGreaterThan(1);
  });

  it('sums up the year from confident finds', () => {
    const r = yearInReview(records, 2026);
    expect(r.year).toBe(2026);
    expect(r.finds).toBe(7); // the low-confidence fox is left out
    expect(r.species).toBe(7);
    expect(r.newSpecies).toBe(6); // the red maple was first seen in 2025
    expect(r.fieldDays).toBe(6);
    expect(r.months[3]).toBe(2);
    expect(r.months[8]).toBe(4);
    expect(r.months[11]).toBe(1);
    expect(r.busiestMonth).toEqual({ month: 8, finds: 4 });
  });

  it('lists the first find in each group, flagging first-ever ones', () => {
    const r = yearInReview(records, 2026);
    expect(r.groupFirsts.map((f) => f.group)).toEqual(['plant', 'fungus', 'bird']);
    expect(r.groupFirsts[0]).toMatchObject({ scientificName: 'Acer rubrum', lifeFirst: false });
    expect(r.groupFirsts[1]).toMatchObject({
      scientificName: 'Amanita muscaria',
      commonName: 'fly agaric',
      lifeFirst: true,
      date: new Date(2026, 8, 5, 12).toISOString(),
    });
    expect(r.newGroups).toEqual(['fungus', 'bird']);
  });

  it('picks the favourite place and the top family', () => {
    const r = yearInReview(records, 2026);
    // Three finds in each place: the tie goes to the one found first.
    expect(r.favouritePlace).toEqual({ key: '46.2,-63.1', label: PLACE_A, finds: 3 });
    expect(r.topFamily).toEqual({
      name: 'Sapindaceae',
      rank: 'family',
      group: 'plant',
      species: 3,
    });
  });

  it('handles a year without finds or places', () => {
    const empty = yearInReview(records, 2020);
    expect(empty).toMatchObject({ finds: 0, species: 0, groupFirsts: [], newGroups: [] });
    expect(empty.busiestMonth).toBeUndefined();
    expect(empty.favouritePlace).toBeUndefined();
    expect(empty.topFamily).toBeUndefined();
    const y2025 = yearInReview(records, 2025);
    expect(y2025.favouritePlace).toBeUndefined();
    expect(y2025.newGroups).toEqual(['plant']);
    expect(y2025.topFamily).toMatchObject({ species: 1 });
  });
});
