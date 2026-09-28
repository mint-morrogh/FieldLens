import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WhatsOutSpecies } from '../../shared/nearby';
import { familyTrees, journalStamps, speciesEntries } from '../../src/features/journal/journal';
import {
  dismissWhatsOut,
  isWhatsOutDismissed,
  localDateKey,
  nearbyLabel,
  nearbyLocation,
  nearbyTaxa,
  pickWhatsOut,
  toNearbyCounts,
  whatsOutCopy,
  withNearbyNotes,
} from '../../src/features/journal/nearby';
import { coarseLocation, getNearbyFamilyCounts, getWhatsOut } from '../../src/lib/nearby';
import { find } from './journalRecord';

const day = (d: number) => new Date(2026, 8, d, 12);

const maples = [
  find('Acer rubrum', day(1), { family: 'Sapindaceae' }),
  find('Acer saccharum', day(2), { family: 'Sapindaceae' }),
  find('Acer negundo', day(3), { family: 'Sapindaceae' }),
];

describe('recorded near you', () => {
  const trees = familyTrees(speciesEntries(maples));
  const counts = toNearbyCounts({
    radiusKm: 50,
    results: [{ name: 'Sapindaceae', rank: 'family', species: 12 }],
    source: 'GBIF',
  });

  it('labels a family with its nearby species count', () => {
    expect(nearbyLabel(trees[0], counts)).toBe('3 of 12 recorded near you');
    expect(nearbyLabel(trees[0], undefined)).toBeUndefined();
  });

  it('never shows fewer species nearby than you have found', () => {
    const few = toNearbyCounts({
      radiusKm: 50,
      results: [{ name: 'Sapindaceae', rank: 'family', species: 2, capped: false }],
      source: 'GBIF',
    });
    expect(nearbyLabel(trees[0], few)).toBe('3 of 3 recorded near you');
  });

  it('adds the count to the family stamp', () => {
    const stamps = withNearbyNotes(journalStamps(maples), trees, counts);
    const family = stamps.find((s) => s.id === 'family');
    expect(family?.note).toBe('Sapindaceae: 3 of 12 recorded near you');
    // Without counts, stamps are untouched.
    expect(withNearbyNotes(journalStamps(maples), trees, undefined).find((s) => s.note)).toBe(
      undefined,
    );
  });

  it('asks about the biggest families, with valid names only', () => {
    expect(nearbyTaxa(trees)).toEqual([{ name: 'Sapindaceae', rank: 'family', group: 'plant' }]);
  });

  it('uses the device location, else the most recent find', () => {
    const records = [
      find('A a', day(1), { locationLabel: '10.0°N, 20.0°E' }),
      find('B b', day(5), { locationLabel: '46.2°N, 63.1°W' }),
      find('C c', day(9)),
    ];
    expect(nearbyLocation({ latitude: 1, longitude: 2 }, records)).toEqual({
      latitude: 1,
      longitude: 2,
    });
    expect(nearbyLocation(undefined, records)).toEqual({ latitude: 46.2, longitude: -63.1 });
    expect(nearbyLocation(undefined, [])).toBeUndefined();
  });
});

describe("what's out now", () => {
  const goldenrod: WhatsOutSpecies = {
    scientificName: 'Solidago canadensis',
    commonName: 'Canada goldenrod',
    group: 'plant',
  };
  const agaric: WhatsOutSpecies = { scientificName: 'Amanita muscaria', group: 'fungus' };
  const monarch: WhatsOutSpecies = {
    scientificName: 'Danaus plexippus',
    commonName: 'monarch',
    group: 'bug',
  };

  it('is the same all day and prefers groups you log', () => {
    const entries = speciesEntries(maples); // plants only
    const a = pickWhatsOut([agaric, goldenrod, monarch], entries, '2026-09-28');
    expect(a?.species).toBe(goldenrod);
    expect(pickWhatsOut([agaric, goldenrod, monarch], entries, '2026-09-28')).toEqual(a);
  });

  it('skips species already in the journal, unless that is all there is', () => {
    const entries = speciesEntries([find('Solidago canadensis', day(1))]);
    for (const date of ['2026-09-01', '2026-09-02', '2026-09-03']) {
      expect(pickWhatsOut([goldenrod, monarch], entries, date)?.species).toBe(monarch);
    }
    const only = pickWhatsOut([goldenrod], entries, '2026-09-01');
    expect(only).toEqual({ species: goldenrod, inJournal: true });
    expect(whatsOutCopy(only!).hint).toMatch(/already in your journal/);
    expect(pickWhatsOut([], entries, '2026-09-01')).toBeUndefined();
  });

  it('writes the invitation', () => {
    expect(whatsOutCopy({ species: monarch, inJournal: false })).toEqual({
      headline: 'Monarch is at its peak near you.',
      hint: 'Not in your journal yet. Can you find it?',
    });
    expect(whatsOutCopy({ species: agaric, inJournal: false }).headline).toBe(
      'Amanita muscaria is at its peak near you.',
    );
  });

  it('dismisses for the day only', () => {
    dismissWhatsOut('2026-09-28');
    expect(isWhatsOutDismissed('2026-09-28')).toBe(true);
    expect(isWhatsOutDismissed('2026-09-29')).toBe(false);
    expect(localDateKey(new Date(2026, 0, 5, 23))).toBe('2026-01-05');
  });
});

describe('near-you client', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('sends only the ~11 km cell and remembers the answer', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify({ month: 9, radiusKm: 50, species: [], source: 'GBIF' }), {
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(coarseLocation({ latitude: 46.237, longitude: -63.131 })).toEqual({
      latitude: 46.2,
      longitude: -63.1,
    });
    const res = await getWhatsOut({ latitude: 46.237, longitude: -63.131 }, 9);
    expect(res?.month).toBe(9);
    expect(String(fetchMock.mock.calls[0][0])).toBe('/api/whats-out?lat=46.2&lon=-63.1&month=9');
    await getWhatsOut({ latitude: 46.21, longitude: -63.14 }, 9);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('posts family names and falls back to undefined on failure', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response('{}', { status: 502 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await getNearbyFamilyCounts({ latitude: 46.237, longitude: -63.131 }, [
      { name: 'Sapindaceae', rank: 'family', group: 'plant' },
    ]);
    expect(res).toBeUndefined();
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toEqual({
      latitude: 46.2,
      longitude: -63.1,
      taxa: [{ name: 'Sapindaceae', rank: 'family', group: 'plant' }],
    });
  });
});
