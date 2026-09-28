import { CategoryIcon } from '../../components/CategoryIcon';
import { Card } from '../../components/ui';
import { MONTHS_SHORT, formatDate } from '../../lib/format';
import {
  FAMILY_STAMP_SPECIES,
  JOURNAL_GROUPS,
  type FamilyTree,
  type JournalGroup,
  type Stamp,
} from './journal';
import { nearbyLabel, type NearbyCounts } from './nearby';

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

/** A small, stable tilt per stamp so the page looks hand-stamped rather than printed. */
function tilt(key: string): number {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 13) - 6;
}

/** One field-guide ink stamp: a double ring with the name around the edge. */
function InkStamp({ stamp }: { stamp: Stamp }) {
  const earned = !!stamp.earnedAt;
  const pathId = `stamp-arc-${stamp.id}-${stamp.subject ?? ''}`.replace(/[^\w-]/g, '');
  const label = stamp.name.toUpperCase();
  return (
    <li
      className="flex flex-col items-center text-center"
      data-testid="stamp"
      data-earned={earned || undefined}
    >
      <svg
        viewBox="0 0 100 100"
        className={`h-20 w-20 ${earned ? 'text-moss' : 'text-ink-muted opacity-45'}`}
        style={earned ? { transform: `rotate(${tilt(stamp.name)}deg)` } : undefined}
        aria-hidden
      >
        <defs>
          <path id={pathId} d="M50 50m-34 0a34 34 0 1 1 68 0a34 34 0 1 1-68 0" />
        </defs>
        <circle
          cx="50"
          cy="50"
          r="46"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeDasharray={earned ? undefined : '4 5'}
        />
        <circle cx="50" cy="50" r="27" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <text
          fill="currentColor"
          fontSize={label.length > 14 ? 8.5 : 10.5}
          fontWeight="700"
          letterSpacing="1.5"
          style={{ fontFamily: 'var(--font-serif)' }}
        >
          <textPath href={`#${pathId}`} startOffset="25%" textAnchor="middle">
            {label}
          </textPath>
        </text>
        {earned ? (
          <path
            d="M39 51l7 7 15-16"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <text
            x="50"
            y="55"
            textAnchor="middle"
            fill="currentColor"
            fontSize="13"
            fontWeight="700"
            style={{ fontFamily: 'var(--font-mono)' }}
          >
            {stamp.progress ? `${stamp.progress.have}/${stamp.progress.need}` : '?'}
          </text>
        )}
      </svg>
      <span className="mt-1 text-sm font-bold leading-tight">{stamp.name}</span>
      <span className="text-xs leading-snug text-ink-muted">
        {earned ? formatDate(stamp.earnedAt) : stamp.description}
      </span>
      {stamp.note && (
        <span className="text-xs leading-snug text-ink-soft" data-testid="stamp-note">
          {stamp.note}
        </span>
      )}
      <span className="sr-only">
        {earned
          ? `Earned: ${stamp.description}`
          : `Not earned yet: ${stamp.description}${
              stamp.progress ? `, ${stamp.progress.have} of ${stamp.progress.need}` : ''
            }`}
        {stamp.note ? `. ${stamp.note}` : ''}
      </span>
    </li>
  );
}

/** Stamps earned so far, with the rest shown faintly as goals. */
export function StampsCard({ stamps }: { stamps: Stamp[] }) {
  const earned = stamps.filter((s) => s.earnedAt).length;
  // Earned first, in the order they were earned; then the goals.
  const sorted = [...stamps].sort((a, b) =>
    a.earnedAt && b.earnedAt
      ? a.earnedAt.localeCompare(b.earnedAt)
      : Number(!!b.earnedAt) - Number(!!a.earnedAt),
  );
  return (
    <Card as="section" aria-labelledby="stamps-title" data-testid="stamps-card">
      <p className="readout text-[0.7rem] font-semibold text-ink-muted">Stamps</p>
      <h2 id="stamps-title" className="mb-3 text-lg font-bold">
        {earned} of {stamps.length} earned
      </h2>
      <ul className="grid grid-cols-3 gap-x-2 gap-y-4">
        {sorted.map((s) => (
          <InkStamp key={`${s.id}:${s.subject ?? ''}`} stamp={s} />
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-muted">Only fairly confident identifications count.</p>
    </Card>
  );
}

/** Donut segment for month `i` of 12, starting at the top and running clockwise. */
function arc(i: number, r0: number, r1: number): string {
  const gap = 0.05;
  const a0 = ((i + gap) / 12) * 2 * Math.PI - Math.PI / 2;
  const a1 = ((i + 1 - gap) / 12) * 2 * Math.PI - Math.PI / 2;
  const p = (r: number, a: number) =>
    `${(50 + r * Math.cos(a)).toFixed(2)} ${(50 + r * Math.sin(a)).toFixed(2)}`;
  return `M${p(r1, a0)}A${r1} ${r1} 0 0 1 ${p(r1, a1)}L${p(r0, a1)}A${r0} ${r0} 0 0 0 ${p(r0, a0)}Z`;
}

function Wheel({ group, months }: { group: JournalGroup; months: number[] }) {
  const filled = months.filter((m) => m > 0).length;
  const max = Math.max(...months);
  const label = `${groupLabel(group)}: ${
    filled ? `finds in ${MONTHS_LONG.filter((_, i) => months[i] > 0).join(', ')}` : 'no finds yet'
  }`;
  return (
    <li className="flex flex-col items-center" data-testid="season-wheel" data-group={group}>
      <div className="relative h-24 w-24" role="img" aria-label={label}>
        <svg viewBox="0 0 100 100" className="h-full w-full">
          {months.map((count, i) => (
            <path
              key={i}
              d={arc(i, 30, 46)}
              className={count ? 'fill-moss' : 'fill-paper-deep'}
              style={count ? { opacity: 0.45 + 0.55 * (count / max) } : undefined}
            >
              <title>{`${MONTHS_SHORT[i]}: ${count}`}</title>
            </path>
          ))}
        </svg>
        <CategoryIcon
          id={group}
          className="absolute left-1/2 top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 text-moss"
        />
      </div>
      <span className="mt-1 text-sm font-bold leading-tight">{groupLabel(group)}</span>
      <span className="text-xs text-ink-muted">{filled}/12 months</span>
    </li>
  );
}

/** A 12-month ring per group that fills as you log finds through the year. */
export function SeasonsCard({ wheels }: { wheels: { group: JournalGroup; months: number[] }[] }) {
  return (
    <Card as="section" aria-labelledby="seasons-title" data-testid="seasons-card">
      <p className="readout text-[0.7rem] font-semibold text-ink-muted">Seasons</p>
      <h2 id="seasons-title" className="mb-3 text-lg font-bold">
        Your year in the field
      </h2>
      <ul className="grid grid-cols-3 gap-x-2 gap-y-4">
        {wheels.map((w) => (
          <Wheel key={w.group} {...w} />
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-muted">
        Each ring starts at January and runs clockwise. Darker months have more finds.
      </p>
    </Card>
  );
}

/** Species grouped by family (or genus), biggest first. */
export function FamiliesCard({ trees, nearby }: { trees: FamilyTree[]; nearby?: NearbyCounts }) {
  const shown = trees.slice(0, 8);
  return (
    <Card as="section" aria-labelledby="families-title" data-testid="families-card">
      <p className="readout text-[0.7rem] font-semibold text-ink-muted">Family trees</p>
      <h2 id="families-title" className="mb-1 text-lg font-bold">
        {trees.length} {trees.length === 1 ? 'family' : 'families'}
      </h2>
      <p className="mb-3 text-sm text-ink-muted">
        Find {FAMILY_STAMP_SPECIES} species in one family to earn its stamp.
      </p>
      <ul className="divide-y divide-line">
        {shown.map((t) => {
          const count = t.entries.length;
          const near = nearbyLabel(t, nearby);
          return (
            <li
              key={`${t.rank}:${t.name}`}
              className="flex items-center gap-3 py-2.5"
              data-testid="family-row"
            >
              <CategoryIcon id={t.group} className="h-5 w-5 shrink-0 text-moss" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-bold">
                  {t.rank === 'genus' ? <span className="sci">{t.name}</span> : t.name}
                  <span className="font-normal text-ink-muted"> · {count}</span>
                </span>
                <span className="sci block truncate text-sm text-ink-soft">
                  {t.genera
                    .map((g) => (g.count > 1 ? `${g.name} (${g.count})` : g.name))
                    .join(', ')}
                </span>
                {near && (
                  <span
                    className="block truncate text-xs text-ink-muted"
                    data-testid="family-nearby"
                  >
                    {near}
                  </span>
                )}
              </span>
              <span
                className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-paper-deep"
                aria-label={`${Math.min(count, FAMILY_STAMP_SPECIES)} of ${FAMILY_STAMP_SPECIES} toward the stamp`}
                role="img"
              >
                <span
                  className="block h-full rounded-full bg-moss"
                  style={{
                    width: `${(Math.min(count, FAMILY_STAMP_SPECIES) / FAMILY_STAMP_SPECIES) * 100}%`,
                  }}
                />
              </span>
            </li>
          );
        })}
      </ul>
      {trees.length > shown.length && (
        <p className="mt-2 text-sm text-ink-muted">
          and {trees.length - shown.length} more with fewer species
        </p>
      )}
    </Card>
  );
}
