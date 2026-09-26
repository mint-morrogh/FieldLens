import { MONTHS_SHORT } from '../../lib/format';

export function MonthBars({
  counts,
  label,
  colorClass = 'bg-moss',
  highlightMonth,
}: {
  counts: number[];
  label: string;
  colorClass?: string;
  highlightMonth?: number;
}) {
  const max = Math.max(1, ...counts);
  const busiest = counts
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c - a.c)
    .slice(0, 3)
    .filter((m) => m.c > 0)
    .map((m) => MONTHS_SHORT[m.i]);
  return (
    <figure>
      <div
        className="flex h-16 items-stretch gap-1"
        role="img"
        aria-label={`${label}. Busiest months: ${busiest.join(', ') || 'none recorded'}.`}
      >
        {counts.map((c, i) => (
          <div key={i} className="flex h-full flex-1 flex-col justify-end">
            <div
              className={`w-full rounded-t-sm ${colorClass} ${highlightMonth === i ? 'ring-2 ring-ink ring-offset-1' : 'opacity-80'}`}
              style={{ height: `${Math.max(c > 0 ? 6 : 2, (c / max) * 100)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1 text-[0.65rem] text-ink-muted" aria-hidden>
        {MONTHS_SHORT.map((m, i) => (
          <span
            key={m}
            className={`flex-1 text-center ${highlightMonth === i ? 'font-bold text-ink' : ''}`}
          >
            {m[0]}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">{label}</figcaption>
    </figure>
  );
}
