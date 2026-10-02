import { SCAT_FEATURE, TRACK_FEATURE, getFeature, getTarget } from '../../../shared/categories';
import type { FeatureId, OrganismCategory } from '../../../shared/types';
import type { ObservationRecord } from '../history/historyStore';

/**
 * The Field Journal: saved identifications turned into a species collection, a map of
 * where things were found, and a naturalist rank. Everything is computed on the device
 * from local history; nothing new is stored.
 */

export type JournalGroup = 'plant' | 'fungus' | 'bug' | 'bird' | 'mammal' | 'herp' | 'fish' | 'sea';

export const JOURNAL_GROUPS: { id: JournalGroup; label: string }[] = [
  { id: 'plant', label: 'Plants' },
  { id: 'fungus', label: 'Fungi' },
  { id: 'bug', label: 'Bugs' },
  { id: 'bird', label: 'Birds' },
  { id: 'mammal', label: 'Mammals' },
  { id: 'herp', label: 'Reptiles & amphibians' },
  { id: 'fish', label: 'Fish' },
  { id: 'sea', label: 'Shells & sea life' },
];

export function groupOf(category: OrganismCategory): JournalGroup | undefined {
  switch (category) {
    case 'insect':
    case 'arachnid':
    case 'worm':
      return 'bug';
    case 'moss':
      return 'plant';
    case 'crustacean':
    case 'mollusc':
    case 'echinoderm':
    case 'cnidarian':
    case 'sponge':
    case 'seaweed':
      return 'sea';
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
  genus?: string;
  family?: string;
};

/** Genus and family from the saved result (the top candidate, else the species info). */
function taxonomyOf(r: ObservationRecord): { genus?: string; family?: string } {
  const top = r.result?.candidates?.[0];
  const ranks = r.result?.speciesInfo?.taxonomy;
  return {
    genus: top?.genus ?? ranks?.genus ?? r.top?.scientificName.split(' ')[0],
    family: top?.family ?? ranks?.family,
  };
}

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
      const t = taxonomyOf(r);
      entry.genus ??= t.genus;
      entry.family ??= t.family;
    } else {
      bySpecies.set(key, {
        scientificName: r.top.scientificName,
        commonName: r.top.commonName,
        group,
        records: [r],
        firstSeen: r.createdAt,
        confirmed: isConfirmed(r),
        ...taxonomyOf(r),
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

/** Points: one per confirmed species, a bonus for each group explored, and one per extra part. */
export const POINTS_PER_SPECIES = 1;
export const POINTS_PER_GROUP = 5;
/** Each part of a confident species photographed beyond the first (flower, then bark…). */
export const POINTS_PER_EXTRA_PART = 1;
/** "Sharp eye": an added photo turned an uncertain identification into a confident one. */
export const POINTS_PER_SHARP_EYE = 2;

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
  const extraParts = confirmed.reduce((n, e) => n + Math.max(0, partCount(e) - 1), 0);
  const sharpEyes = confirmed.reduce(
    (n, e) => n + e.records.filter((r) => r.sharpEye && isConfirmed(r)).length,
    0,
  );
  const points =
    confirmed.length * POINTS_PER_SPECIES +
    groups * POINTS_PER_GROUP +
    extraParts * POINTS_PER_EXTRA_PART +
    sharpEyes * POINTS_PER_SHARP_EYE;
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

export type FamilyTree = {
  /** The family, or the genus when the family isn't known. */
  name: string;
  rank: 'family' | 'genus';
  group: JournalGroup;
  entries: SpeciesEntry[];
  /** Genera within the family, most species first. */
  genera: { name: string; count: number }[];
};

/** Species in a family (or genus) needed for its stamp. */
export const FAMILY_STAMP_SPECIES = 5;

/** Species grouped by family (falling back to genus), biggest families first. */
export function familyTrees(entries: SpeciesEntry[]): FamilyTree[] {
  const trees = new Map<string, FamilyTree>();
  for (const e of entries) {
    const rank = e.family ? 'family' : 'genus';
    const name = e.family ?? e.genus ?? e.scientificName.split(' ')[0];
    const key = `${rank}:${name.toLowerCase()}`;
    let tree = trees.get(key);
    if (!tree) {
      tree = { name, rank, group: e.group, entries: [], genera: [] };
      trees.set(key, tree);
    }
    tree.entries.push(e);
  }
  for (const tree of trees.values()) {
    const genera = new Map<string, number>();
    for (const e of tree.entries) {
      const g = e.genus ?? e.scientificName.split(' ')[0];
      genera.set(g, (genera.get(g) ?? 0) + 1);
    }
    tree.genera = [...genera]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }
  return [...trees.values()].sort(
    (a, b) => b.entries.length - a.entries.length || a.name.localeCompare(b.name),
  );
}

/**
 * The seasonal wheel: for each group with finds, which months (0 = January, in the
 * device's time zone) have at least one find, and how many.
 */
export function seasonalWheel(
  records: ObservationRecord[],
): { group: JournalGroup; months: number[] }[] {
  const byGroup = new Map<JournalGroup, number[]>();
  for (const r of records) {
    const group = groupOf(r.category);
    if (!r.top || !group) continue;
    const months = byGroup.get(group) ?? Array<number>(12).fill(0);
    months[new Date(r.createdAt).getMonth()]++;
    byGroup.set(group, months);
  }
  return JOURNAL_GROUPS.filter((g) => byGroup.has(g.id)).map((g) => ({
    group: g.id,
    months: byGroup.get(g.id)!,
  }));
}

export type StampId =
  | 'first-light'
  | 'night-walker'
  | 'tracker'
  | 'five-groups'
  | 'mycologist'
  | 'canopy'
  | 'family'
  | 'called-it'
  | 'called-ten'
  | 'sharp-eye';

export type Stamp = {
  id: StampId;
  name: string;
  /** How it's earned, shown on locked and earned stamps alike. */
  description: string;
  /** When it was earned (ISO), or undefined while still locked. */
  earnedAt?: string;
  /** Progress toward a count-based stamp. */
  progress?: { have: number; need: number };
  /** For family stamps: which family. */
  subject?: string;
  /** Extra line when known, e.g. "Sapindaceae: 3 of 12 recorded near you". */
  note?: string;
};

/** Mainly nocturnal, according to the sourced "Active" fact (EltonTraits) on the result. */
export function isNocturnal(r: ObservationRecord): boolean {
  const active = r.result?.speciesInfo?.facts?.find((f) => f.label === 'Active')?.value;
  if (!active) return false;
  const v = active.toLowerCase();
  return v.includes('at night') && !v.includes('by day');
}

/** The date a count-based stamp was earned: when the nth distinct species was first seen. */
function nthFirstSeen(entries: SpeciesEntry[], n: number): string | undefined {
  if (entries.length < n) return undefined;
  return entries.map((e) => e.firstSeen).sort()[n - 1];
}

/** Earliest record (oldest first) matching a test. */
function earliest(records: ObservationRecord[], test: (r: ObservationRecord) => boolean) {
  return records
    .filter(test)
    .map((r) => r.createdAt)
    .sort()[0];
}

export const MYCOLOGIST_SPECIES = 10;
export const CANOPY_TREES = 10;
export const FIVE_GROUPS = 5;
/** Correct "Name it first" guesses for the second guessing stamp. */
export const CALLED_IT_COUNT = 10;

/** A "Name it first" guess that named it (exactly, or to the genus). */
export function calledIt(r: ObservationRecord): boolean {
  return r.guess?.result === 'exact' || r.guess?.result === 'close';
}

/**
 * Field-guide stamps, earned from the journal alone. Only fairly confident finds count,
 * so a stamp always stands for a real, confirmed identification.
 */
export function journalStamps(
  records: ObservationRecord[],
  /** The guessing stamps only show with "Name it first" on, or once a guess has been made. */
  options: { nameItFirst?: boolean } = {},
): Stamp[] {
  const confirmedRecords = records.filter((r) => r.top && groupOf(r.category) && isConfirmed(r));
  const entries = speciesEntries(confirmedRecords);

  const groupFirsts = new Map<JournalGroup, string>();
  for (const e of entries) {
    const prev = groupFirsts.get(e.group);
    if (!prev || e.firstSeen < prev) groupFirsts.set(e.group, e.firstSeen);
  }
  const fungi = entries.filter((e) => e.group === 'fungus');
  // Trees are the plants identified with "Tree" chosen (saved on newer results only).
  const trees = speciesEntries(
    confirmedRecords.filter((r) => r.result?.requestedTarget === 'tree'),
  );

  const stamps: Stamp[] = [
    {
      id: 'first-light',
      name: 'First Light',
      description: 'A find before 8 am',
      earnedAt: earliest(confirmedRecords, (r) => new Date(r.createdAt).getHours() < 8),
    },
    {
      id: 'night-walker',
      name: 'Night Walker',
      description: 'A nocturnal animal',
      earnedAt: earliest(confirmedRecords, isNocturnal),
    },
    {
      id: 'tracker',
      name: 'Tracker',
      description: 'An identification from tracks or droppings',
      earnedAt: earliest(confirmedRecords, (r) => !!r.result?.sign),
    },
    {
      id: 'five-groups',
      name: 'Five Groups',
      description: `Finds in ${FIVE_GROUPS} of the ${JOURNAL_GROUPS.length} groups`,
      earnedAt: [...groupFirsts.values()].sort()[FIVE_GROUPS - 1],
      progress: { have: Math.min(groupFirsts.size, FIVE_GROUPS), need: FIVE_GROUPS },
    },
    {
      id: 'mycologist',
      name: 'Mycologist',
      description: `${MYCOLOGIST_SPECIES} species of fungi`,
      earnedAt: nthFirstSeen(fungi, MYCOLOGIST_SPECIES),
      progress: { have: Math.min(fungi.length, MYCOLOGIST_SPECIES), need: MYCOLOGIST_SPECIES },
    },
    {
      id: 'canopy',
      name: 'Canopy',
      description: `${CANOPY_TREES} species of trees`,
      earnedAt: nthFirstSeen(trees, CANOPY_TREES),
      progress: { have: Math.min(trees.length, CANOPY_TREES), need: CANOPY_TREES },
    },
  ];

  // Name it first (optional setting): only guesses on confident results count.
  const called = confirmedRecords
    .filter(calledIt)
    .map((r) => r.createdAt)
    .sort();
  const guessing = options.nameItFirst || records.some((r) => r.guess);
  const guessStamps: Stamp[] = [
    {
      id: 'called-it',
      name: 'Called It',
      description: 'Name a find before the result, then have it confirmed',
      earnedAt: called[0],
      note: called.length > 1 ? `${called.length} called so far` : undefined,
    },
    {
      id: 'called-ten',
      name: 'Keen Namer',
      description: `${CALLED_IT_COUNT} finds named before the result`,
      earnedAt: called[CALLED_IT_COUNT - 1],
      progress: { have: Math.min(called.length, CALLED_IT_COUNT), need: CALLED_IT_COUNT },
    },
  ];
  if (guessing) stamps.push(...guessStamps);
  stamps.push({
    id: 'sharp-eye',
    name: 'Sharp Eye',
    description: 'An added photo that made an uncertain identification confident',
    earnedAt: earliest(confirmedRecords, (r) => !!r.sharpEye),
  });

  const families = familyTrees(entries);
  if (!families.some((t) => t.entries.length >= FAMILY_STAMP_SPECIES)) {
    // Locked placeholder, showing progress in the family you're closest to.
    const closest = families[0];
    stamps.push({
      id: 'family',
      name: 'Family of Five',
      description: `${FAMILY_STAMP_SPECIES} species in one family`,
      progress: { have: closest?.entries.length ?? 0, need: FAMILY_STAMP_SPECIES },
      subject: closest?.name,
    });
  }
  for (const tree of families) {
    if (tree.entries.length < FAMILY_STAMP_SPECIES) continue;
    stamps.push({
      id: 'family',
      name: tree.name,
      subject: tree.name,
      description: `${FAMILY_STAMP_SPECIES} species in one ${tree.rank}`,
      earnedAt: nthFirstSeen(tree.entries, FAMILY_STAMP_SPECIES),
    });
  }
  return stamps;
}

// ---------------------------------------------------------------------------
// Field-guide pages: a species' journal page that fills in as you log it more.

/** The parts photographed in a record, e.g. ["flower", "bark"] (tracks and droppings included). */
export function partsOf(r: ObservationRecord): FeatureId[] {
  const parts = new Set<FeatureId>();
  for (const f of r.result?.features ?? []) if (f && f !== 'auto') parts.add(f);
  if (r.result?.sign) parts.add(r.result.sign);
  return [...parts];
}

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export const SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];

/** Meteorological season for a month (0 = January), flipped in the southern hemisphere. */
export function seasonForMonth(month: number, latitude = 1): Season {
  const shifted = (month + (latitude < 0 ? 6 : 0)) % 12;
  if (shifted >= 2 && shifted <= 4) return 'spring';
  if (shifted >= 5 && shifted <= 7) return 'summer';
  if (shifted >= 8 && shifted <= 10) return 'autumn';
  return 'winter';
}

/** Season of a find, using its ~11 km location for the hemisphere (north when unknown). */
export function seasonOf(r: ObservationRecord): Season {
  return seasonForMonth(
    new Date(r.createdAt).getMonth(),
    parseLocationLabel(r.locationLabel)?.latitude,
  );
}

export type PageMilestone = { id: string; label: string; done: boolean };

export type SpeciesPage = {
  entry: SpeciesEntry;
  seasons: Season[];
  /** Distinct ~11 km areas. */
  places: string[];
  /** Finds per month, January first. */
  months: number[];
  /** Every part this group can be photographed by, and whether you have. */
  parts: { id: FeatureId; label: string; have: boolean }[];
  milestones: PageMilestone[];
  /** 0–1: how much of the page is filled in. */
  completion: number;
};

/** Parts worth collecting per group (the "Other"/"Auto" choices don't count). */
function collectableParts(entry: SpeciesEntry): { id: FeatureId; label: string }[] {
  const tree = entry.records.some((r) => r.result?.requestedTarget === 'tree');
  const category = tree ? 'tree' : (entry.records[0]?.category ?? 'other');
  const defs = getTarget(category).features.filter((f) => f.id !== 'other' && f.id !== 'auto');
  const extra: { id: FeatureId; label: string }[] =
    entry.group === 'mammal' ? [TRACK_FEATURE, SCAT_FEATURE] : [];
  return [...defs, ...extra].map((f) => ({ id: f.id, label: f.label }));
}

export function speciesPage(entry: SpeciesEntry): SpeciesPage {
  const seasons = new Set<Season>();
  const places = new Set<string>();
  const months = Array<number>(12).fill(0);
  const have = new Set<FeatureId>();
  for (const r of entry.records) {
    seasons.add(seasonOf(r));
    if (r.locationLabel) places.add(r.locationLabel);
    months[new Date(r.createdAt).getMonth()]++;
    for (const p of partsOf(r)) have.add(p);
  }
  const known = collectableParts(entry);
  // Parts recorded under another category (e.g. an old "Plant" photo of a tree) still count.
  const parts = [
    ...known.map((p) => ({ ...p, have: have.has(p.id) })),
    ...[...have]
      .filter((id) => !known.some((p) => p.id === id))
      .map((id) => ({ id, label: getFeature(entry.records[0].category, id).label, have: true })),
  ];
  const partCount = parts.filter((p) => p.have).length;
  const partGoal = Math.min(3, parts.length);
  const milestones: PageMilestone[] = [
    { id: 'first', label: 'First sighting', done: true },
    { id: 'confirmed', label: 'A confident identification', done: entry.confirmed },
    { id: 'three', label: 'Seen 3 times', done: entry.records.length >= 3 },
    { id: 'seasons', label: 'Seen in 2 seasons', done: seasons.size >= 2 },
    { id: 'places', label: 'Seen in 2 places', done: places.size >= 2 },
    ...(partGoal > 0
      ? [
          {
            id: 'parts',
            label: `Photographed ${partGoal} different parts`,
            done: partCount >= partGoal,
          },
        ]
      : []),
  ];
  return {
    entry,
    seasons: SEASONS.filter((s) => seasons.has(s)),
    places: [...places],
    months,
    parts,
    milestones,
    completion: milestones.filter((m) => m.done).length / milestones.length,
  };
}

/** Distinct parts recorded for a species across its sightings. */
export function partCount(entry: SpeciesEntry): number {
  return new Set(entry.records.flatMap(partsOf)).size;
}
