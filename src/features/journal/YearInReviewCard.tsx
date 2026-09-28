import { useMemo, useState } from 'react';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Card } from '../../components/ui';
import { MONTHS_SHORT, displayName, formatDate } from '../../lib/format';
import type { ObservationRecord } from '../history/historyStore';
import { JOURNAL_GROUPS, type JournalGroup } from './journal';
import { MIN_YEAR_FINDS, reviewYears, yearInReview } from './yearReview';

const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

function groupLabel(id: JournalGroup): string {
  return JOURNAL_GROUPS.find((g) => g.id === id)?.label ?? id;
}

function MonthBars({ months, busiest }: { months: number[]; busiest?: number }) {
  const max = Math.max(1, ...months);
  const label = months
    .map((n, i) => `${MONTHS_SHORT[i]} ${n}`)
    .filter((_, i) => months[i] > 0)
    .join(', ');
  return (
    <div className="mt-4" role="img" aria-label={`Finds by month: ${label}`}>
      <div className="flex h-16 items-end gap-1">
        {months.map((n, i) => (
          <span
            key={i}
            className={`flex-1 rounded-t-sm ${
              n === 0 ? 'bg-paper-deep' : i === busiest ? 'bg-moss' : 'bg-moss/45'
            }`}
            style={{ height: `${n ? Math.max(8, (n / max) * 100) : 4}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-1" aria-hidden>
        {MONTHS_SHORT.map((m, i) => (
          <span
            key={m}
            className={`flex-1 text-center text-[0.6rem] ${
              i === busiest ? 'font-bold text-moss' : 'text-ink-muted'
            }`}
          >
            {m[0]}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * A quiet look back at one year of the journal. Offers every year with at least
 * MIN_YEAR_FINDS confident finds; renders nothing until there is one.
 */
export function YearInReviewCard({
  records,
  now,
}: {
  records: ObservationRecord[];
  /** For tests; defaults to the current time. */
  now?: Date;
}) {
  const years = useMemo(() => reviewYears(records), [records]);
  const [chosen, setChosen] = useState<number>();
  const year = chosen !== undefined && years.includes(chosen) ? chosen : years[0];
  const review = useMemo(
    () => (year === undefined ? undefined : yearInReview(records, year)),
    [records, year],
  );
  if (!review || year === undefined) return null;
  const currentYear = (now ?? new Date()).getFullYear();
  const soFar = year === currentYear;

  const stats: [string, number][] = [
    ['Species', review.species],
    ['Finds', review.finds],
    ['Field days', review.fieldDays],
  ];

  return (
    <Card as="section" aria-labelledby="year-title" data-testid="year-review">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="readout text-[0.7rem] font-semibold text-ink-muted">Year in review</p>
          <h2 id="year-title" className="font-serif text-2xl font-bold text-moss-dark">
            {year}
            {soFar && (
              <span className="font-sans text-base font-normal text-ink-muted"> so far</span>
            )}
          </h2>
        </div>
        {years.length > 1 && (
          <div className="flex flex-wrap justify-end gap-1" role="group" aria-label="Choose a year">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                aria-pressed={y === year}
                onClick={() => setChosen(y)}
                className={`min-h-10 rounded-full border px-3 text-sm font-semibold tabular-nums ${
                  y === year
                    ? 'border-moss bg-moss text-on-accent'
                    : 'border-line bg-card text-ink hover:bg-paper-deep'
                }`}
              >
                {y}
              </button>
            ))}
          </div>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-paper-deep px-2 py-2">
            <dd className="text-xl font-bold tabular-nums">{value}</dd>
            <dt className="text-xs text-ink-muted">{label}</dt>
          </div>
        ))}
      </dl>
      {review.newSpecies > 0 && review.newSpecies !== review.species && (
        <p className="mt-2 text-sm text-ink-soft">
          {review.newSpecies} of them new to your journal.
        </p>
      )}

      <MonthBars months={review.months} busiest={review.busiestMonth?.month} />
      {review.busiestMonth && (
        <p className="mt-1 text-sm text-ink-muted">
          Busiest month:{' '}
          <span className="font-semibold text-ink">{MONTHS_LONG[review.busiestMonth.month]}</span> ·{' '}
          {review.busiestMonth.finds} {review.busiestMonth.finds === 1 ? 'find' : 'finds'}
        </p>
      )}

      <dl className="mt-4 space-y-3">
        {review.favouritePlace && (
          <div>
            <dt className="text-xs font-semibold text-ink-muted">Favourite place</dt>
            <dd>
              <span className="font-bold">~{review.favouritePlace.label}</span>
              <span className="text-ink-muted">
                {' '}
                · {review.favouritePlace.finds}{' '}
                {review.favouritePlace.finds === 1 ? 'find' : 'finds'}
              </span>
            </dd>
          </div>
        )}
        {review.topFamily && review.topFamily.species > 1 && (
          <div>
            <dt className="text-xs font-semibold text-ink-muted">Top family</dt>
            <dd className="flex items-center gap-2">
              <CategoryIcon id={review.topFamily.group} className="h-5 w-5 shrink-0 text-moss" />
              <span className="font-bold">
                {review.topFamily.rank === 'genus' ? (
                  <span className="sci">{review.topFamily.name}</span>
                ) : (
                  review.topFamily.name
                )}
              </span>
              <span className="text-ink-muted">· {review.topFamily.species} species</span>
            </dd>
          </div>
        )}
        {review.newGroups.length > 0 && (
          <div>
            <dt className="text-xs font-semibold text-ink-muted">New groups explored</dt>
            <dd className="font-bold">{review.newGroups.map(groupLabel).join(', ')}</dd>
          </div>
        )}
      </dl>

      {review.groupFirsts.length > 0 && (
        <>
          <h3 className="mt-4 text-xs font-semibold text-ink-muted">First of the year</h3>
          <ul className="mt-1 divide-y divide-line">
            {review.groupFirsts.map((f) => (
              <li key={f.group} className="flex items-center gap-3 py-2" data-testid="year-first">
                <CategoryIcon id={f.group} className="h-5 w-5 shrink-0 text-moss" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold leading-tight">{displayName(f)}</span>
                  <span className="block text-xs text-ink-muted">
                    {groupLabel(f.group)} · {formatDate(f.date, new Date(year, 6, 1))}
                  </span>
                </span>
                {f.lifeFirst && (
                  <span className="shrink-0 rounded-full border border-moss px-2 py-0.5 text-[0.7rem] font-semibold text-moss">
                    First ever
                  </span>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        Private to this device. Years with {MIN_YEAR_FINDS} or more fairly confident finds are
        shown.
      </p>
    </Card>
  );
}
