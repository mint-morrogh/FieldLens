import { labelCell } from '../../../shared/geo';
import type { ObservationRecord } from '../history/historyStore';
import { areaKey, formatArea, recordAreaKey } from './areas';
import {
  groupOf,
  isConfirmed,
  seasonForMonth,
  speciesEntries,
  type JournalGroup,
  type Season,
} from './journal';

/**
 * Home patch: one ~11 km area (home, a cottage, a favourite trail), chosen from the places
 * already in your journal, found by address or place name, or taken from your current
 * approximate location. Only the cell is kept (never the typed address or a precise point).
 * Saved in localStorage; clearAllLocalData() removes it with every other fieldlens.* key.
 */

export const HOME_PATCH_KEY = 'fieldlens.homePatch';
export const PATCH_NAME_MAX = 40;

export type HomePatch = {
  latitude: number;
  longitude: number;
  /** Optional name, e.g. "Cottage". */
  name?: string;
};

function valid(p: unknown): p is HomePatch {
  if (!p || typeof p !== 'object') return false;
  const { latitude, longitude, name } = p as Record<string, unknown>;
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    (name === undefined || typeof name === 'string')
  );
}

export function loadHomePatch(): HomePatch | undefined {
  try {
    const raw = localStorage.getItem(HOME_PATCH_KEY);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    return valid(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The journal cell (as in a find's "46.2°N, 63.1°W" label) a point falls in, so a patch set
 * by address or current location matches finds made there exactly.
 */
export function patchCell(point: { latitude: number; longitude: number }): {
  latitude: number;
  longitude: number;
} {
  return labelCell(point);
}

/** Saves the patch, snapped to its ~11 km cell; returns false if storage isn't available. */
export function saveHomePatch(patch: HomePatch): boolean {
  const name = patch.name?.trim().slice(0, PATCH_NAME_MAX) || undefined;
  try {
    localStorage.setItem(HOME_PATCH_KEY, JSON.stringify({ ...patchCell(patch), name }));
    return true;
  } catch {
    return false;
  }
}

export function clearHomePatch(): void {
  try {
    localStorage.removeItem(HOME_PATCH_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function patchLabel(patch: HomePatch): string {
  return patch.name || `Area near ${formatArea(patch)}`;
}

export type { Season } from './journal';

export const SEASONS: { id: Season; label: string }[] = [
  { id: 'spring', label: 'Spring' },
  { id: 'summer', label: 'Summer' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'winter', label: 'Winter' },
];

/** Season for a month and latitude (the journal's rule, shared with species pages). */
export const seasonOf = seasonForMonth;

export type PatchSpecies = {
  scientificName: string;
  commonName?: string;
  group: JournalGroup;
  finds: number;
  firstSeen: string;
  lastSeen: string;
  /** Months (0 = January) it has been found here. */
  months: number[];
};

export type PatchSummary = {
  finds: number;
  species: PatchSpecies[];
  /** Distinct species found here in each month, January first (all years together). */
  months: number[];
  /** Species found here in each season. */
  seasons: { season: Season; species: number }[];
  firstVisit?: string;
  lastVisit?: string;
};

/** Everything confidently found at the patch, most-found species first. */
export function patchSummary(records: ObservationRecord[], patch: HomePatch): PatchSummary {
  const key = areaKey(patch);
  const here = records.filter(
    (r) => r.top && groupOf(r.category) && isConfirmed(r) && recordAreaKey(r) === key,
  );
  const entries = speciesEntries(here);
  const species: PatchSpecies[] = entries
    .map((e) => ({
      scientificName: e.scientificName,
      commonName: e.commonName,
      group: e.group,
      finds: e.records.length,
      firstSeen: e.firstSeen,
      lastSeen: e.records[0].createdAt,
      months: [...new Set(e.records.map((r) => new Date(r.createdAt).getMonth()))].sort(
        (a, b) => a - b,
      ),
    }))
    .sort(
      (a, b) =>
        b.finds - a.finds ||
        b.lastSeen.localeCompare(a.lastSeen) ||
        a.scientificName.localeCompare(b.scientificName),
    );

  const months = Array<number>(12).fill(0);
  const bySeason = new Map<Season, Set<string>>();
  for (const s of species) {
    for (const m of s.months) {
      months[m]++;
      const season = seasonOf(m, patch.latitude);
      const set = bySeason.get(season) ?? new Set();
      set.add(s.scientificName);
      bySeason.set(season, set);
    }
  }
  const dates = here.map((r) => r.createdAt).sort();
  return {
    finds: here.length,
    species,
    months,
    seasons: SEASONS.map((s) => ({ season: s.id, species: bySeason.get(s.id)?.size ?? 0 })),
    firstVisit: dates[0],
    lastVisit: dates[dates.length - 1],
  };
}
