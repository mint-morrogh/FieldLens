import type { ObservationRecord } from '../history/historyStore';
import { groupOf, isConfirmed, parseLocationLabel } from './journal';

/**
 * Explored areas: each ~11 km cell (the coarse location label kept with every find) where
 * you've made a fairly confident find. Everything is computed from local history.
 */

export type Area = {
  /** Stable key for the cell, e.g. "46.2,-63.1". */
  key: string;
  /** "46.2°N, 63.1°W". */
  label: string;
  latitude: number;
  longitude: number;
  finds: number;
  /** ISO time of the first find here. */
  firstFound: string;
  /** ISO time of the latest find here. */
  lastFound: string;
};

export function areaKey(point: { latitude: number; longitude: number }): string {
  return `${point.latitude},${point.longitude}`;
}

/** The key of the ~11 km cell a record was made in, if it has a location. */
export function recordAreaKey(r: ObservationRecord): string | undefined {
  const p = parseLocationLabel(r.locationLabel);
  return p ? areaKey(p) : undefined;
}

export function formatArea(point: { latitude: number; longitude: number }): string {
  const lat = `${Math.abs(point.latitude)}°${point.latitude < 0 ? 'S' : 'N'}`;
  const lng = `${Math.abs(point.longitude)}°${point.longitude < 0 ? 'W' : 'E'}`;
  return `${lat}, ${lng}`;
}

/**
 * Every area with at least one find, in the order first explored.
 * By default only fairly confident finds count, as with stamps; pass `confirmedOnly: false`
 * to list every place with any find (e.g. to choose a home patch).
 */
export function exploredAreas(
  records: ObservationRecord[],
  { confirmedOnly = true }: { confirmedOnly?: boolean } = {},
): Area[] {
  const areas = new Map<string, Area>();
  for (const r of records) {
    if (!r.top || !groupOf(r.category)) continue;
    if (confirmedOnly && !isConfirmed(r)) continue;
    const p = parseLocationLabel(r.locationLabel);
    if (!p) continue;
    const key = areaKey(p);
    const area = areas.get(key);
    if (area) {
      area.finds++;
      if (r.createdAt < area.firstFound) area.firstFound = r.createdAt;
      if (r.createdAt > area.lastFound) area.lastFound = r.createdAt;
    } else {
      areas.set(key, {
        key,
        label: formatArea(p),
        ...p,
        finds: 1,
        firstFound: r.createdAt,
        lastFound: r.createdAt,
      });
    }
  }
  return [...areas.values()].sort(
    (a, b) => a.firstFound.localeCompare(b.firstFound) || a.key.localeCompare(b.key),
  );
}

export const AREA_MILESTONES = [1, 5, 10, 25, 50, 100] as const;
export const COUNTRY_MILESTONES = [1, 2, 3, 5, 10] as const;
export const REGION_MILESTONES = [1, 2, 3, 5, 10] as const;

export type Milestone = {
  /** How many areas (or countries) it takes. */
  need: number;
  /** When it was reached (ISO), or undefined while still ahead. */
  reachedAt?: string;
};

export type MilestoneProgress = {
  count: number;
  milestones: Milestone[];
  /** The next milestone still ahead, if any. */
  next?: number;
  /** The last milestone reached, if any. */
  last?: number;
  /** 0–1 progress from the last milestone (or zero) to the next. */
  progress: number;
};

/** Milestones for a list of first-found dates (any order). */
export function milestoneProgress(
  firstDates: string[],
  steps: readonly number[],
): MilestoneProgress {
  const sorted = [...firstDates].sort();
  const count = sorted.length;
  const milestones = steps.map((need) => ({ need, reachedAt: sorted[need - 1] }));
  const next = steps.find((s) => s > count);
  const last = steps.findLast((s) => s <= count);
  const from = last ?? 0;
  return {
    count,
    milestones,
    next,
    last,
    progress: next ? (count - from) / (next - from) : 1,
  };
}

export function areaMilestones(areas: Area[]): MilestoneProgress {
  return milestoneProgress(
    areas.map((a) => a.firstFound),
    AREA_MILESTONES,
  );
}

export type CountryFirst = {
  /** world-atlas numeric id. */
  id: string;
  name: string;
  firstFound: string;
};

/** Looks up the country for a point, or undefined over the sea or when unknown. */
export type CountryLookup = (
  latitude: number,
  longitude: number,
) => { id: string; name: string } | undefined;

/** Places (countries, regions) the areas fall in, each with its first find, first first. */
function explored<P extends { id: string }>(
  areas: Area[],
  lookup: (latitude: number, longitude: number) => P | undefined,
): (P & { firstFound: string })[] {
  const places = new Map<string, P & { firstFound: string }>();
  for (const a of areas) {
    const p = lookup(a.latitude, a.longitude);
    if (!p) continue;
    const prev = places.get(p.id);
    if (!prev || a.firstFound < prev.firstFound)
      places.set(p.id, { ...p, firstFound: a.firstFound });
  }
  return [...places.values()].sort(
    (a, b) => a.firstFound.localeCompare(b.firstFound) || a.id.localeCompare(b.id),
  );
}

/** Countries you've made finds in, first explored first. */
export function exploredCountries(areas: Area[], countryOf: CountryLookup): CountryFirst[] {
  return explored(areas, countryOf);
}

export function countryMilestones(countries: CountryFirst[]): MilestoneProgress {
  return milestoneProgress(
    countries.map((c) => c.firstFound),
    COUNTRY_MILESTONES,
  );
}

export type Region = {
  /** Natural Earth admin-1 id, e.g. "CAN-685". */
  id: string;
  /** "Nova Scotia". */
  name: string;
  /** ISO 3166-1 alpha-2 country code, e.g. "CA". */
  country: string;
};

export type RegionFirst = Region & { firstFound: string };

/** Looks up the province or state for a point, or undefined over the sea or when unknown. */
export type RegionLookup = (latitude: number, longitude: number) => Region | undefined;

/** Provinces and states you've made finds in, first explored first. */
export function exploredRegions(areas: Area[], regionOf: RegionLookup): RegionFirst[] {
  return explored(areas, regionOf);
}

export function regionMilestones(regions: RegionFirst[]): MilestoneProgress {
  return milestoneProgress(
    regions.map((r) => r.firstFound),
    REGION_MILESTONES,
  );
}

/** Region names for display, with the country added where two share a name ("Punjab (IN)"). */
export function regionNames(regions: Region[]): string[] {
  const counts = new Map<string, number>();
  for (const r of regions) counts.set(r.name, (counts.get(r.name) ?? 0) + 1);
  return regions.map((r) => ((counts.get(r.name) ?? 0) > 1 ? `${r.name} (${r.country})` : r.name));
}
