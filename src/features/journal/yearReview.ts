import type { ObservationRecord } from '../history/historyStore';
import { areaKey, formatArea } from './areas';
import {
  JOURNAL_GROUPS,
  familyTrees,
  groupOf,
  isConfirmed,
  parseLocationLabel,
  speciesEntries,
  type JournalGroup,
} from './journal';

/**
 * Year in review: a private summary of one calendar year (device time zone), built on the
 * device from the journal. Only fairly confident finds count, as with stamps and rank.
 */

/** Fewest finds in a year for its review to be offered. */
export const MIN_YEAR_FINDS = 5;

export type GroupFirst = {
  group: JournalGroup;
  scientificName: string;
  commonName?: string;
  date: string;
  /** Also your first ever in this group. */
  lifeFirst: boolean;
};

export type YearReview = {
  year: number;
  finds: number;
  species: number;
  /** Species logged for the first time ever this year. */
  newSpecies: number;
  /** Finds per month, January first. */
  months: number[];
  busiestMonth?: { month: number; finds: number };
  /** The first find in each group this year, in journal group order. */
  groupFirsts: GroupFirst[];
  /** Groups you logged for the first time ever this year. */
  newGroups: JournalGroup[];
  /** The ~11 km area with the most finds this year. */
  favouritePlace?: { key: string; label: string; finds: number };
  /** The family (or genus) with the most species this year. */
  topFamily?: { name: string; rank: 'family' | 'genus'; group: JournalGroup; species: number };
  /** Distinct days with at least one find. */
  fieldDays: number;
};

const countable = (r: ObservationRecord) => !!r.top && !!groupOf(r.category) && isConfirmed(r);
const yearOf = (iso: string) => new Date(iso).getFullYear();

/** Years with at least `min` confident finds, newest first. */
export function reviewYears(records: ObservationRecord[], min = MIN_YEAR_FINDS): number[] {
  const counts = new Map<number, number>();
  for (const r of records) {
    if (!countable(r)) continue;
    const y = yearOf(r.createdAt);
    counts.set(y, (counts.get(y) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, n]) => n >= min)
    .map(([y]) => y)
    .sort((a, b) => b - a);
}

export function yearInReview(records: ObservationRecord[], year: number): YearReview {
  const all = records.filter(countable).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const inYear = all.filter((r) => yearOf(r.createdAt) === year);
  const beforeYear = all.filter((r) => yearOf(r.createdAt) < year);

  const seenBefore = new Set(beforeYear.map((r) => r.top!.scientificName.toLowerCase()));
  const groupsBefore = new Set(beforeYear.map((r) => groupOf(r.category)!));
  const entries = speciesEntries(inYear);

  const months = Array<number>(12).fill(0);
  for (const r of inYear) months[new Date(r.createdAt).getMonth()]++;
  const max = Math.max(...months);
  const busiest = months.indexOf(max);

  const firsts = new Map<JournalGroup, GroupFirst>();
  for (const r of inYear) {
    const group = groupOf(r.category)!;
    if (firsts.has(group)) continue;
    firsts.set(group, {
      group,
      scientificName: r.top!.scientificName,
      commonName: r.top!.commonName,
      date: r.createdAt,
      lifeFirst: !groupsBefore.has(group),
    });
  }
  const groupFirsts = JOURNAL_GROUPS.flatMap((g) => firsts.get(g.id) ?? []);

  const places = new Map<string, { key: string; label: string; finds: number; first: string }>();
  for (const r of inYear) {
    const p = parseLocationLabel(r.locationLabel);
    if (!p) continue;
    const key = areaKey(p);
    const place = places.get(key);
    if (place) place.finds++;
    else places.set(key, { key, label: formatArea(p), finds: 1, first: r.createdAt });
  }
  // Most finds; ties go to the place you found first.
  const favourite = [...places.values()].sort(
    (a, b) => b.finds - a.finds || a.first.localeCompare(b.first),
  )[0];

  const tree = familyTrees(entries)[0];

  return {
    year,
    finds: inYear.length,
    species: entries.length,
    newSpecies: entries.filter((e) => !seenBefore.has(e.scientificName.toLowerCase())).length,
    months,
    busiestMonth: max > 0 ? { month: busiest, finds: max } : undefined,
    groupFirsts,
    newGroups: groupFirsts.filter((f) => f.lifeFirst).map((f) => f.group),
    favouritePlace: favourite && {
      key: favourite.key,
      label: favourite.label,
      finds: favourite.finds,
    },
    topFamily: tree && {
      name: tree.name,
      rank: tree.rank,
      group: tree.group,
      species: tree.entries.length,
    },
    fieldDays: new Set(
      inYear.map((r) => {
        const d = new Date(r.createdAt);
        return `${d.getMonth()}-${d.getDate()}`;
      }),
    ).size,
  };
}
