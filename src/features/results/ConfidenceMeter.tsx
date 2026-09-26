import { BAND_LABELS, confidenceBand, formatPercent } from '../../../shared/confidence';

const BAR_COLORS = {
  high: 'bg-moss',
  medium: 'bg-amber',
  low: 'bg-rust',
  none: 'bg-ink-muted',
} as const;

/** Confidence is always stated in text; the bar is supplementary. */
export function ConfidenceMeter({
  score,
  label = 'identification confidence',
  compact = false,
}: {
  score: number;
  label?: string;
  compact?: boolean;
}) {
  const band = confidenceBand(score);
  return (
    <div className={compact ? 'min-w-24' : ''}>
      {!compact && (
        <p className="mb-1.5 text-[0.95rem] text-ink-soft">
          <strong className="text-lg text-ink">{formatPercent(score)}</strong> {label}
          <span className="text-ink-muted"> · {BAND_LABELS[band]}</span>
        </p>
      )}
      <div
        className={`${compact ? 'h-1.5' : 'h-2.5'} w-full overflow-hidden rounded-full bg-paper-deep`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(score * 100)}
        aria-label={`${formatPercent(score)} ${label}`}
      >
        <div
          className={`h-full rounded-full ${BAR_COLORS[band]}`}
          style={{ width: `${Math.max(2, score * 100)}%` }}
        />
      </div>
    </div>
  );
}
