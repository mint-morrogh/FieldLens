import type { ObservationRecord } from '../history/historyStore';
import { recordAreaKey } from './areas';
import {
  JOURNAL_GROUPS,
  groupOf,
  isConfirmed,
  partsOf,
  speciesEntries,
  type JournalGroup,
} from './journal';

/**
 * Weekly field goals: three small goals each week, generated from your own journal.
 *
 * - Weeks run Monday to Sunday in the device's time zone.
 * - Goals are chosen from the journal as it stood when the week began, seeded by the ISO
 *   week, so they stay the same all week however much you log.
 * - Progress counts only fairly confident finds made during the week.
 * - The streak counts weeks in a row with at least one goal met. One is enough: it's a
 *   gentle nudge to get outside, not a chore, and a week that's still going never breaks it.
 */

export type GoalKind =
  'new-species' | 'new-family' | 'group' | 'days' | 'new-area' | 'finds' | 'new-part';

export type Goal = {
  kind: GoalKind;
  /** Short, e.g. "Find a new species". */
  title: string;
  /** One line on why or how. */
  detail: string;
  /** The group to log in, for `group` goals. */
  group?: JournalGroup;
  need: number;
  have: number;
  met: boolean;
};

export type WeekGoals = {
  /** ISO week, e.g. "2026-W40". */
  week: string;
  /** Local Monday 00:00 (ISO). */
  start: string;
  /** Local Monday 00:00 of the next week (ISO). */
  end: string;
  goals: Goal[];
};

export const DAYS_GOAL = 3;
export const FINDS_GOAL = 5;
/** A group counts as "fresh" if you haven't logged it in this many days. */
export const STALE_GROUP_DAYS = 30;

/** Local midnight on the Monday of the week containing `date`. */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** ISO 8601 week, e.g. "2026-W01" (the week with the year's first Thursday). */
export function isoWeek(date: Date): string {
  const thursday = addDays(weekStart(date), 3);
  const year = thursday.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const dayOfYear = Math.round((thursday.getTime() - jan1.getTime()) / 86_400_000);
  const week = Math.floor(dayOfYear / 7) + 1;
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** FNV-1a hash, then a small PRNG (mulberry32), so a week always draws the same goals. */
function seeded(key: string): () => number {
  let h = 0x811c9dc5;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: T[], rand: () => number): T {
  return items[Math.floor(rand() * items.length)];
}

function groupLabel(id: JournalGroup): string {
  return JOURNAL_GROUPS.find((g) => g.id === id)?.label ?? id;
}

const countable = (r: ObservationRecord) => !!r.top && !!groupOf(r.category) && isConfirmed(r);
const speciesKey = (r: ObservationRecord) => r.top!.scientificName.toLowerCase();
/** "acer rubrum|bark": one part of one species. */
const partKeys = (r: ObservationRecord) => partsOf(r).map((p) => `${speciesKey(r)}|${p}`);
const localDay = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

type Plan = Omit<Goal, 'have' | 'met'>;

/** What the journal looked like before the week began: the basis for choosing goals. */
function journalBefore(records: ObservationRecord[], start: Date) {
  const startIso = start.toISOString();
  const before = records.filter((r) => countable(r) && r.createdAt < startIso);
  const lastByGroup = new Map<JournalGroup, string>();
  for (const r of before) {
    const g = groupOf(r.category)!;
    const prev = lastByGroup.get(g);
    if (!prev || r.createdAt > prev) lastByGroup.set(g, r.createdAt);
  }
  const entries = speciesEntries(before);
  return {
    before,
    species: new Set(before.map(speciesKey)),
    families: new Set(entries.flatMap((e) => (e.family ? [e.family.toLowerCase()] : []))),
    areas: new Set(before.flatMap((r) => recordAreaKey(r) ?? [])),
    parts: new Set(before.flatMap(partKeys)),
    lastByGroup,
  };
}

/** The three goals for the week starting at `start` (a local Monday). */
function planWeek(records: ObservationRecord[], start: Date): Plan[] {
  const rand = seeded(isoWeek(start));
  const past = journalBefore(records, start);

  // 1. Something new to you: a species, or (once you know a few families) a family.
  const discovery: Plan[] = [
    {
      kind: 'new-species',
      title: 'Find a new species',
      detail: 'One you haven’t logged before',
      need: 1,
    },
  ];
  if (past.families.size >= 3)
    discovery.push({
      kind: 'new-family',
      title: 'Find a new family',
      detail: `Beyond the ${past.families.size} families in your journal`,
      need: 1,
    });

  // 2. A group you haven't tried, or haven't logged lately.
  const cutoff = addDays(start, -STALE_GROUP_DAYS).toISOString();
  const untried = JOURNAL_GROUPS.filter((g) => !past.lastByGroup.has(g.id)).map((g) => g.id);
  const stale = JOURNAL_GROUPS.filter((g) => {
    const last = past.lastByGroup.get(g.id);
    return last && last < cutoff;
  }).map((g) => g.id);
  // Early on, prefer the groups people meet most often.
  const common: JournalGroup[] = ['plant', 'bird', 'bug', 'fungus'];
  const commonUntried = untried.filter((g) => common.includes(g));
  const untriedPool = past.before.length < 10 && commonUntried.length ? commonUntried : untried;
  let groupGoal: Plan | undefined;
  if (stale.length && (!untriedPool.length || rand() < 0.5)) {
    const g = pick(stale, rand);
    groupGoal = {
      kind: 'group',
      group: g,
      title: `Log a find in ${groupLabel(g)}`,
      detail: `You haven’t logged ${groupLabel(g).toLowerCase()} in over ${STALE_GROUP_DAYS} days`,
      need: 1,
    };
  } else if (untriedPool.length) {
    const g = pick(untriedPool, rand);
    groupGoal = {
      kind: 'group',
      group: g,
      title: `Log a find in ${groupLabel(g)}`,
      detail: 'A group you haven’t tried yet',
      need: 1,
    };
  }

  // 3. A habit: getting out on a few days, a new place, or a handful of finds.
  const habits: Plan[] = [
    {
      kind: 'days',
      title: `Log finds on ${DAYS_GOAL} different days`,
      detail: 'Short walks count',
      need: DAYS_GOAL,
    },
    {
      kind: 'finds',
      title: `Make ${FINDS_GOAL} confident finds`,
      detail: 'Repeat species count too',
      need: FINDS_GOAL,
    },
  ];
  // Only once you've a species to go back to, and have chosen parts before (so it's a habit).
  if (past.species.size > 0 && past.parts.size > 0)
    habits.push({
      kind: 'new-part',
      title: 'Photograph a new part',
      detail: 'The bark, leaf or flower of a species you know, chosen on the crop screen',
      need: 1,
    });
  if (past.areas.size > 0)
    habits.push({
      kind: 'new-area',
      title: 'Explore a new area',
      detail: 'A find somewhere about 10 km from your usual spots',
      need: 1,
    });

  const goals = [pick(discovery, rand)];
  goals.push(
    groupGoal ??
      pick(
        habits.filter((h) => h.kind === 'new-area'),
        rand,
      ) ??
      habits[0],
  );
  const third = habits.filter((h) => !goals.some((g) => g.kind === h.kind));
  goals.push(pick(third, rand));
  return goals;
}

function progress(plan: Plan, week: ObservationRecord[], past: ReturnType<typeof journalBefore>) {
  switch (plan.kind) {
    case 'new-species':
      return new Set(week.map(speciesKey).filter((k) => !past.species.has(k))).size;
    case 'new-family': {
      const families = speciesEntries(week).flatMap((e) =>
        e.family && !past.families.has(e.family.toLowerCase()) ? [e.family.toLowerCase()] : [],
      );
      return new Set(families).size;
    }
    case 'group':
      return week.filter((r) => groupOf(r.category) === plan.group).length;
    case 'days':
      return new Set(week.map((r) => localDay(r.createdAt))).size;
    case 'new-area':
      return new Set(week.flatMap((r) => recordAreaKey(r) ?? []).filter((k) => !past.areas.has(k)))
        .size;
    case 'finds':
      return week.length;
    case 'new-part':
      return new Set(week.flatMap(partKeys).filter((k) => !past.parts.has(k))).size;
  }
}

/** Goals for the week containing `now`, with progress from that week's confident finds. */
export function weeklyGoals(records: ObservationRecord[], now = new Date()): WeekGoals {
  const start = weekStart(now);
  const end = addDays(start, 7);
  const past = journalBefore(records, start);
  const [s, e] = [start.toISOString(), end.toISOString()];
  const week = records.filter((r) => countable(r) && r.createdAt >= s && r.createdAt < e);
  const goals = planWeek(records, start).map((plan) => {
    const have = progress(plan, week, past);
    return { ...plan, have: Math.min(have, plan.need), met: have >= plan.need };
  });
  return { week: isoWeek(start), start: s, end: e, goals };
}

export type GoalStreak = {
  /** Weeks in a row, up to this one, with at least one goal met. */
  current: number;
  /** The longest run so far. */
  best: number;
  /** Whether this week already counts. */
  thisWeekMet: boolean;
};

/**
 * Weeks in a row with at least one goal met. This week only adds to the streak once a goal
 * is met; until then the streak stands on last week, so it never breaks mid-week.
 */
export function goalStreak(records: ObservationRecord[], now = new Date()): GoalStreak {
  const counted = records.filter(countable);
  if (!counted.length) return { current: 0, best: 0, thisWeekMet: false };
  const first = weekStart(new Date(counted.map((r) => r.createdAt).sort()[0]));
  const thisWeek = weekStart(now);
  const met: boolean[] = [];
  for (let w = first; w <= thisWeek; w = addDays(w, 7))
    met.push(weeklyGoals(counted, w).goals.some((g) => g.met));

  let best = 0;
  let run = 0;
  for (const m of met) {
    run = m ? run + 1 : 0;
    best = Math.max(best, run);
  }
  const thisWeekMet = met[met.length - 1];
  let current = 0;
  for (let i = met.length - (thisWeekMet ? 1 : 2); i >= 0 && met[i]; i--) current++;
  return { current, best, thisWeekMet };
}
