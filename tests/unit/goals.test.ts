import { describe, expect, it } from 'vitest';
import type { ObservationRecord } from '../../src/features/history/historyStore';
import {
  DAYS_GOAL,
  FINDS_GOAL,
  addDays,
  goalStreak,
  isoWeek,
  weekStart,
  weeklyGoals,
} from '../../src/features/journal/goals';
import { JOURNAL_GROUPS } from '../../src/features/journal/journal';
import { find } from './journalRecord';

const MON = new Date(2026, 8, 28); // Monday 28 September 2026
const at = (dayOffset: number, hour = 12) => {
  const d = addDays(MON, dayOffset);
  d.setHours(hour);
  return d;
};

/** A week of finds that meets every goal but (perhaps) the group one. */
function busyWeek(weekOffset: number, tag: string): ObservationRecord[] {
  return [0, 1, 2, 2, 3].map((d, i) =>
    find(`Genus${tag}${i} species`, at(weekOffset * 7 + d), {
      family: `Family${tag}${i}`,
      locationLabel: `${10 + weekOffset}.${i}°N, 20.0°E`,
    }),
  );
}

describe('weeks', () => {
  it('start on Monday at local midnight', () => {
    expect(weekStart(new Date(2026, 9, 4, 23, 30))).toEqual(MON); // Sunday night
    expect(weekStart(new Date(2026, 8, 28, 0, 0))).toEqual(MON);
    expect(weekStart(new Date(2026, 8, 27, 23, 59))).toEqual(new Date(2026, 8, 21));
  });

  it('are named by ISO week, across year ends', () => {
    expect(isoWeek(MON)).toBe('2026-W40');
    expect(isoWeek(new Date(2025, 11, 29))).toBe('2026-W01');
    expect(isoWeek(new Date(2027, 0, 1))).toBe('2026-W53');
    expect(isoWeek(new Date(2027, 0, 4))).toBe('2027-W01');
  });
});

describe('weekly field goals', () => {
  it('gives three different goals, starting with something new to you', () => {
    const week = weeklyGoals([], at(2));
    expect(week.week).toBe('2026-W40');
    expect(week.start).toBe(MON.toISOString());
    expect(week.end).toBe(addDays(MON, 7).toISOString());
    expect(week.goals).toHaveLength(3);
    expect(new Set(week.goals.map((g) => g.kind)).size).toBe(3);
    expect(week.goals[0].kind).toBe('new-species');
    // A new journal is steered toward a common group.
    const group = week.goals.find((g) => g.kind === 'group');
    expect(['plant', 'bird', 'bug', 'fungus']).toContain(group?.group);
    expect(week.goals.every((g) => g.have === 0 && !g.met)).toBe(true);
  });

  it('stays the same all week, however much you log', () => {
    const past = busyWeek(-2, 'p');
    const monday = weeklyGoals(past, at(0, 8));
    const sunday = weeklyGoals([...past, ...busyWeek(0, 'x')], at(6, 22));
    const plan = (w: typeof monday) =>
      w.goals.map(({ kind, title, group }) => ({ kind, title, group }));
    expect(plan(sunday)).toEqual(plan(monday));
  });

  it('draws the same goals for the same journal, and varies between weeks', () => {
    const past = busyWeek(-6, 'p');
    expect(weeklyGoals(past, at(1))).toEqual(weeklyGoals(past, at(3)));
    const titles = new Set(
      Array.from({ length: 12 }, (_, w) =>
        weeklyGoals(past, at(7 * w))
          .goals.map((g) => g.title)
          .join('|'),
      ),
    );
    expect(titles.size).toBeGreaterThan(1);
  });

  it('counts progress from this week’s confident finds only', () => {
    const records = [
      find('Acer rubrum', at(-3)), // last week
      find('Acer rubrum', at(1)), // not new
      find('Quercus alba', at(1, 9)),
      find('Betula papyrifera', at(2), { band: 'low' }), // doesn't count
      find('Pinus strobus', at(7)), // next week
    ];
    const goals = weeklyGoals(records, at(3)).goals;
    expect(goals[0]).toMatchObject({ kind: 'new-species', have: 1, need: 1, met: true });
    const days = weeklyGoals(records, at(3)).goals.find((g) => g.kind === 'days');
    if (days) expect(days).toMatchObject({ have: 1, need: DAYS_GOAL, met: false });
    const finds = weeklyGoals(records, at(3)).goals.find((g) => g.kind === 'finds');
    if (finds) expect(finds).toMatchObject({ have: 2, need: FINDS_GOAL, met: false });
  });

  it('asks for a group you haven’t logged in 30 days once you’ve tried them all', () => {
    const categories = ['insect', 'bird', 'mammal', 'reptile', 'fish'] as const;
    const records = [
      find('Amanita muscaria', at(-60), { category: 'fungus' }),
      ...Array.from({ length: 10 }, (_, i) =>
        find(`Plant${i} x`, at(-5 - i), {
          category: i < categories.length ? categories[i] : 'plant',
        }),
      ),
    ];
    const group = weeklyGoals(records, at(0)).goals.find((g) => g.kind === 'group');
    expect(group).toMatchObject({ group: 'fungus', title: 'Log a find in Fungi' });
    expect(group?.detail).toMatch(/30 days/);
    expect(new Set(records.map((r) => r.category)).size).toBe(JOURNAL_GROUPS.length);
  });

  it('offers a new family and a new area once the journal has them', () => {
    const past = busyWeek(-1, 'p');
    const kinds = new Set<string>();
    for (let w = 0; w < 20; w++)
      for (const g of weeklyGoals(past, at(7 * w)).goals) kinds.add(g.kind);
    expect(kinds).toContain('new-family');
    expect(kinds).toContain('new-area');
  });

  it('meets area and family goals with finds somewhere, or in a family, new to you', () => {
    const past = busyWeek(-1, 'p');
    const now = [
      ...past,
      find('Genusq0 other', at(1), { family: 'Familyp0', locationLabel: '9.0°N, 20.0°E' }),
      find('Genusq1 other', at(2), { family: 'Brand new', locationLabel: '1.0°N, 1.0°E' }),
    ];
    for (let w = 0; w < 20; w++) {
      const records = now.map((r) => ({
        ...r,
        createdAt: addDays(new Date(r.createdAt), 7 * w).toISOString(),
      }));
      for (const g of weeklyGoals(records, at(7 * w + 3)).goals) {
        if (g.kind === 'new-area') expect(g).toMatchObject({ have: 1, met: true });
        if (g.kind === 'new-family') expect(g).toMatchObject({ have: 1, met: true });
      }
    }
  });
});

describe('goal streak', () => {
  it('is zero for an empty journal', () => {
    expect(goalStreak([], MON)).toEqual({ current: 0, best: 0, thisWeekMet: false });
  });

  it('counts weeks in a row with a goal met, not days', () => {
    const records = [...busyWeek(-2, 'a'), ...busyWeek(-1, 'b'), ...busyWeek(0, 'c')];
    expect(goalStreak(records, at(4))).toEqual({ current: 3, best: 3, thisWeekMet: true });
  });

  it('doesn’t break while this week is still going', () => {
    const records = [...busyWeek(-2, 'a'), ...busyWeek(-1, 'b')];
    expect(goalStreak(records, at(2))).toEqual({ current: 2, best: 2, thisWeekMet: false });
  });

  it('restarts after a week with no goal met, keeping the best run', () => {
    const records = [
      ...busyWeek(-5, 'a'),
      ...busyWeek(-4, 'b'),
      ...busyWeek(-3, 'c'),
      // week -2: nothing
      ...busyWeek(-1, 'd'),
    ];
    expect(goalStreak(records, at(1))).toEqual({ current: 1, best: 3, thisWeekMet: false });
    // After a whole missed week the streak is gone.
    expect(goalStreak(records, at(8))).toMatchObject({ current: 0, best: 3 });
  });

  it('ignores low-confidence finds', () => {
    const low = busyWeek(0, 'a').map((r) => ({ ...r, top: { ...r.top!, band: 'low' as const } }));
    expect(goalStreak(low, at(5))).toEqual({ current: 0, best: 0, thisWeekMet: false });
  });
});

describe('new-part goal', () => {
  it('is offered once you photograph parts, and met by a new part of a known species', () => {
    const past = [
      find('Acer rubrum', at(-20), { result: { features: ['leaf'] } as never }),
      find('Quercus alba', at(-15), { result: { features: ['bark'] } as never }),
    ];
    // Goals are drawn per week; find a week that asks for a new part.
    const offset = Array.from({ length: 60 }, (_, i) => i).find((w) =>
      weeklyGoals(past, at(w * 7)).goals.some((g) => g.kind === 'new-part'),
    );
    expect(offset).toBeDefined();
    const day = offset! * 7 + 1;
    const same = find('Acer rubrum', at(day), { result: { features: ['leaf'] } as never });
    const goal = (records: ObservationRecord[]) =>
      weeklyGoals(records, at(day)).goals.find((g) => g.kind === 'new-part')!;
    expect(goal([...past, same]).met).toBe(false);
    const bark = find('Acer rubrum', at(day), { result: { features: ['bark'] } as never });
    expect(goal([...past, bark]).met).toBe(true);
  });

  it('is not offered before any part has been recorded', () => {
    const past = [find('Acer rubrum', at(-20))];
    for (let w = 0; w < 30; w++)
      expect(weeklyGoals(past, at(w * 7)).goals.some((g) => g.kind === 'new-part')).toBe(false);
  });
});
