import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAllLocalData } from '../../src/features/history/historyStore';
import {
  HOME_PATCH_KEY,
  clearHomePatch,
  loadHomePatch,
  patchCell,
  patchLabel,
  patchSummary,
  saveHomePatch,
  seasonOf,
} from '../../src/features/journal/patch';
import { coarseLocationLabel } from '../../shared/geo';
import { find } from './journalRecord';

const HOME = '46.2°N, 63.1°W';
const AWAY = '45.9°N, 64.0°W';
const patch = { latitude: 46.2, longitude: -63.1 };

describe('home patch storage', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('saves, loads and clears the patch under a fieldlens. key', () => {
    expect(HOME_PATCH_KEY.startsWith('fieldlens.')).toBe(true);
    expect(loadHomePatch()).toBeUndefined();
    expect(saveHomePatch({ ...patch, name: '  Cottage  ' })).toBe(true);
    expect(loadHomePatch()).toEqual({ ...patch, name: 'Cottage' });
    saveHomePatch({ ...patch, name: '   ' });
    expect(loadHomePatch()).toEqual(patch);
    clearHomePatch();
    expect(loadHomePatch()).toBeUndefined();
  });

  it('is wiped with the rest of the local data', async () => {
    saveHomePatch(patch);
    await clearAllLocalData();
    expect(loadHomePatch()).toBeUndefined();
  });

  it('ignores damaged values', () => {
    localStorage.setItem(HOME_PATCH_KEY, '{not json');
    expect(loadHomePatch()).toBeUndefined();
    localStorage.setItem(HOME_PATCH_KEY, JSON.stringify({ latitude: 'x', longitude: 1 }));
    expect(loadHomePatch()).toBeUndefined();
    localStorage.setItem(HOME_PATCH_KEY, JSON.stringify({ latitude: 200, longitude: 1 }));
    expect(loadHomePatch()).toBeUndefined();
  });

  it('copes when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(loadHomePatch()).toBeUndefined();
    expect(saveHomePatch(patch)).toBe(false);
    expect(() => clearHomePatch()).not.toThrow();
  });

  it('labels a patch by its name, else its area', () => {
    expect(patchLabel({ ...patch, name: 'Home' })).toBe('Home');
    expect(patchLabel(patch)).toBe('Area near 46.2°N, 63.1°W');
  });
});

describe('seasons', () => {
  it('uses meteorological seasons, flipped south of the equator', () => {
    expect(seasonOf(0, 46)).toBe('winter');
    expect(seasonOf(3, 46)).toBe('spring');
    expect(seasonOf(6, 46)).toBe('summer');
    expect(seasonOf(9, 46)).toBe('autumn');
    expect(seasonOf(11, 46)).toBe('winter');
    expect(seasonOf(0, -33.9)).toBe('summer');
    expect(seasonOf(6, -33.9)).toBe('winter');
  });
});

describe('patch summary', () => {
  const records = [
    find('Acer rubrum', new Date(2025, 9, 1, 12), { locationLabel: HOME }),
    find('Acer rubrum', new Date(2026, 3, 1, 12), { locationLabel: HOME }),
    find('Acer rubrum', new Date(2026, 9, 3, 12), { locationLabel: HOME }),
    find('Amanita muscaria', new Date(2026, 9, 2, 12), {
      locationLabel: HOME,
      category: 'fungus',
      commonName: 'fly agaric',
    }),
    find('Turdus migratorius', new Date(2026, 3, 5, 12), { locationLabel: HOME, category: 'bird' }),
    find('Picea glauca', new Date(2026, 5, 1, 12), { locationLabel: AWAY }),
    find('Vulpes vulpes', new Date(2026, 6, 1, 12), {
      locationLabel: HOME,
      category: 'mammal',
      band: 'low',
    }),
  ];

  it('lists species found at the patch, most found first, from confident finds', () => {
    const s = patchSummary(records, patch);
    expect(s.finds).toBe(5);
    expect(s.species.map((x) => x.scientificName)).toEqual([
      'Acer rubrum',
      'Amanita muscaria',
      'Turdus migratorius',
    ]);
    expect(s.species[0]).toMatchObject({
      finds: 3,
      months: [3, 9],
      firstSeen: new Date(2025, 9, 1, 12).toISOString(),
      lastSeen: new Date(2026, 9, 3, 12).toISOString(),
    });
    expect(s.firstVisit).toBe(new Date(2025, 9, 1, 12).toISOString());
    expect(s.lastVisit).toBe(new Date(2026, 9, 3, 12).toISOString());
  });

  it('shows how the patch changes through the months and seasons', () => {
    const s = patchSummary(records, patch);
    expect(s.months[3]).toBe(2); // maple and robin in April
    expect(s.months[9]).toBe(2); // maple and fly agaric in October (both years together)
    expect(s.months[6]).toBe(0); // the fox was low confidence
    expect(s.seasons).toEqual([
      { season: 'spring', species: 2 },
      { season: 'summer', species: 0 },
      { season: 'autumn', species: 2 },
      { season: 'winter', species: 0 },
    ]);
  });

  it('is empty for a patch with no confident finds', () => {
    const s = patchSummary(records, { latitude: 1, longitude: 1 });
    expect(s).toMatchObject({ finds: 0, species: [], firstVisit: undefined });
    expect(s.months.every((m) => m === 0)).toBe(true);
  });
});

describe('patch set by address or current location', () => {
  beforeEach(() => localStorage.clear());

  it('stores only the ~11 km cell, never the precise point', () => {
    saveHomePatch({ latitude: 46.23526, longitude: -63.12654, name: 'Home' });
    expect(loadHomePatch()).toEqual({ ...patch, name: 'Home' });
    expect(localStorage.getItem(HOME_PATCH_KEY)).not.toMatch(/235|126/);
  });

  it('lines up with the cells finds are labelled with', () => {
    const records = [
      find('Acer rubrum', new Date(2026, 3, 1, 12), { locationLabel: HOME }),
      find('Picea glauca', new Date(2026, 5, 1, 12), { locationLabel: AWAY }),
    ];
    // A geocoded address in Charlottetown, and a 2-decimal "current location" there.
    for (const point of [
      { latitude: 46.23526, longitude: -63.12654 },
      { latitude: 46.2, longitude: -63.1 },
      { latitude: 46.24, longitude: -63.13 },
    ]) {
      saveHomePatch(point);
      const s = patchSummary(records, loadHomePatch()!);
      expect(s.species.map((x) => x.scientificName)).toEqual(['Acer rubrum']);
    }
  });

  it('rounds halfway points the way find labels do (west and south too)', () => {
    for (const point of [
      { latitude: 46.25, longitude: -63.15 },
      { latitude: -33.85, longitude: 151.25 },
      { latitude: -0.04, longitude: -0.05 },
      { latitude: 45.95, longitude: -64.05 },
    ]) {
      const label = coarseLocationLabel(point);
      const records = [find('Acer rubrum', new Date(2026, 3, 1, 12), { locationLabel: label })];
      expect(patchSummary(records, patchCell(point)).finds).toBe(1);
      saveHomePatch(point);
      expect(patchSummary(records, loadHomePatch()!).finds).toBe(1);
    }
  });
});
