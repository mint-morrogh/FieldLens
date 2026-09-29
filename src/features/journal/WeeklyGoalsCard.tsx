import { useMemo } from 'react';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Card } from '../../components/ui';
import { useSetting } from '../../lib/settings';
import { localizeMeasurements } from '../../lib/units';
import type { ObservationRecord } from '../history/historyStore';
import { goalStreak, weeklyGoals, type Goal } from './goals';

function GoalMark({ goal }: { goal: Goal }) {
  if (goal.met)
    return (
      <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0 text-moss" aria-hidden>
        <circle cx="12" cy="12" r="11" fill="currentColor" />
        <path
          d="M7 12.5l3.2 3.2L17 9"
          fill="none"
          stroke="var(--color-card)"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  if (goal.group) return <CategoryIcon id={goal.group} className="h-7 w-7 shrink-0 text-moss" />;
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 shrink-0 text-ink-muted" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r="10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeDasharray="3 3"
      />
    </svg>
  );
}

function dayRange(startIso: string, endIso: string): string {
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const end = new Date(endIso);
  end.setDate(end.getDate() - 1);
  return `${fmt(new Date(startIso))} – ${fmt(end)}`;
}

/**
 * Three small goals for this week, chosen from your own journal, and a streak that counts
 * weeks (not days) with at least one goal met.
 */
export function WeeklyGoalsCard({
  records,
  now,
}: {
  records: ObservationRecord[];
  /** For tests; defaults to the current time. */
  now?: Date;
}) {
  const units = useSetting('units');
  const at = useMemo(() => now ?? new Date(), [now]);
  const week = useMemo(() => weeklyGoals(records, at), [records, at]);
  const streak = useMemo(() => goalStreak(records, at), [records, at]);
  const met = week.goals.filter((g) => g.met).length;

  return (
    <Card as="section" aria-labelledby="goals-title" data-testid="weekly-goals">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="readout text-[0.7rem] font-semibold text-ink-muted">
            This week · <span className="whitespace-nowrap">{dayRange(week.start, week.end)}</span>
          </p>
          <h2 id="goals-title" className="text-lg font-bold">
            Field goals · {met} of {week.goals.length}
          </h2>
        </div>
        <div
          className="shrink-0 rounded-xl bg-paper-deep px-3 py-1.5 text-center"
          data-testid="goal-streak"
        >
          <span className="block text-xl font-bold tabular-nums leading-tight">
            {streak.current}
          </span>
          <span className="block text-[0.7rem] text-ink-muted">
            {streak.current === 1 ? 'week' : 'weeks'} in a row
          </span>
        </div>
      </div>
      <ul className="mt-3 divide-y divide-line">
        {week.goals.map((g) => (
          <li
            key={g.kind}
            className="flex items-center gap-3 py-2.5"
            data-testid="weekly-goal"
            data-met={g.met || undefined}
          >
            <GoalMark goal={g} />
            <span className="min-w-0 flex-1">
              <span className={`block font-bold leading-tight ${g.met ? 'text-moss' : ''}`}>
                {g.title}
              </span>
              <span className="block text-sm text-ink-muted">
                {localizeMeasurements(g.detail, units)}
              </span>
            </span>
            {g.need > 1 ? (
              <span
                className="shrink-0 text-sm font-semibold tabular-nums text-ink-soft"
                aria-label={`${g.have} of ${g.need}`}
              >
                {g.have}/{g.need}
              </span>
            ) : (
              <span className="sr-only">{g.met ? 'Done' : 'Not yet'}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-ink-muted">
        {streak.thisWeekMet
          ? 'This week counts toward your streak.'
          : 'Meet any one goal to keep the streak going.'}
        {streak.best > streak.current
          ? ` Longest: ${streak.best} ${streak.best === 1 ? 'week' : 'weeks'}.`
          : ''}{' '}
        New goals every Monday. Only fairly confident finds count.
      </p>
    </Card>
  );
}
