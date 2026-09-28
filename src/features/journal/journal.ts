import type { OrganismCategory } from '../../../shared/types';
import type { ObservationRecord } from '../history/historyStore';

/**
 * The Field Journal: saved identifications turned into a species collection, a map of
 * where things were found, and a naturalist rank. Everything is computed on the device
 * from local history; nothing new is stored.
 */

export type JournalGroup = 'plant' | 'fungus' | 'bug' | 'bird' | 'mammal' | 'herp' | 'fish';

export const JOURNAL_GROUPS: { id: JournalGroup; label: string }[] = [
  { id: 'plant', label: 'Plants' },
  { id: 'fungus', label: 'Fungi' },
  { id: 'bug', label: 'Bugs' },
  { id: 'bird', label: 'Birds' },
  { id: 'mammal', label: 'Mammals' },
  { id: 'herp', label: 'Reptiles & amphibians' },
  { id: 'fish', label: 'Fish' },
];

export function groupOf(category: OrganismCategory): JournalGroup | undefined {
  switch (category) {
    case 'insect':
    case 'arachnid':
      return 'bug';
    case 'reptile':
    case 'amphibian':
      return 'herp';
    case 'other':
      return undefined;
    default:
      return category;
  }
}

/** Only fairly confident identifications count toward the collection and rank. */
export function isConfirmed(record: ObservationRecord): boolean {
  return record.top?.band === 'high' || record.top?.band === 'medium';
}

export type SpeciesEntry = {
  scientificName: string;
  commonName?: string;
  group: JournalGroup;
  /** Most recent sighting first. */
  records: ObservationRecord[];
  firstSeen: string;
  confirmed: boolean;
};

/** One entry per species, newest sighting first; unconfirmed-only species are flagged. */
export function speciesEntries(records: ObservationRecord[]): SpeciesEntry[] {
  const bySpecies = new Map<string, SpeciesEntry>();
  const sorted = [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  for (const r of sorted) {
    const group = groupOf(r.category);
    if (!r.top || !group) continue;
    const key = r.top.scientificName.toLowerCase();
    const entry = bySpecies.get(key);
    if (entry) {
      entry.records.push(r);
      entry.firstSeen = r.createdAt;
      entry.confirmed ||= isConfirmed(r);
      entry.commonName ??= r.top.commonName;
    } else {
      bySpecies.set(key, {
        scientificName: r.top.scientificName,
        commonName: r.top.commonName,
        group,
        records: [r],
        firstSeen: r.createdAt,
        confirmed: isConfirmed(r),
      });
    }
  }
  return [...bySpecies.values()];
}

/** "46.2°N, 63.1°W" (the ~11 km label kept in history) → coordinates for a map pin. */
export function parseLocationLabel(
  label?: string,
): { latitude: number; longitude: number } | undefined {
  const m = label?.match(/(\d+(?:\.\d+)?)°([NS]),\s*(\d+(?:\.\d+)?)°([EW])/);
  if (!m) return undefined;
  return {
    latitude: Number(m[1]) * (m[2] === 'S' ? -1 : 1),
    longitude: Number(m[3]) * (m[4] === 'W' ? -1 : 1),
  };
}

export type Pin = { latitude: number; longitude: number; count: number };

/** One pin per ~11 km cell, sized by how many finds were made there. */
export function journalPins(records: ObservationRecord[]): Pin[] {
  const cells = new Map<string, Pin>();
  for (const r of records) {
    const p = parseLocationLabel(r.locationLabel);
    if (!p) continue;
    const key = `${p.latitude},${p.longitude}`;
    const cell = cells.get(key);
    if (cell) cell.count++;
    else cells.set(key, { ...p, count: 1 });
  }
  return [...cells.values()];
}

/** Points: one per confirmed species, plus a bonus for each group you've explored. */
export const POINTS_PER_SPECIES = 1;
export const POINTS_PER_GROUP = 5;

export const RANKS = [
  { name: 'Wanderer', min: 0 },
  { name: 'Observer', min: 5 },
  { name: 'Tracker', min: 15 },
  { name: 'Field Naturalist', min: 30 },
  { name: 'Naturalist', min: 60 },
  { name: 'Master Naturalist', min: 100 },
  { name: 'Field Scholar', min: 175 },
] as const;

export type RankInfo = {
  name: string;
  points: number;
  species: number;
  groups: number;
  next?: { name: string; min: number };
  /** 0–1 progress from this rank to the next. */
  progress: number;
};

export function rankFor(entries: SpeciesEntry[]): RankInfo {
  const confirmed = entries.filter((e) => e.confirmed);
  const groups = new Set(confirmed.map((e) => e.group)).size;
  const points = confirmed.length * POINTS_PER_SPECIES + groups * POINTS_PER_GROUP;
  const index = RANKS.findLastIndex((r) => points >= r.min);
  const rank = RANKS[index];
  const next = RANKS[index + 1];
  return {
    name: rank.name,
    points,
    species: confirmed.length,
    groups,
    next,
    progress: next ? (points - rank.min) / (next.min - rank.min) : 1,
  };
}
