import { useId } from 'react';
import { rankTheme, type RankGlyph } from './rankTheme';

/** A small, fixed tilt per rank so it reads as hand-stamped, like the journal stamps. */
const TILTS = [-5, 4, -3, 6, -4, 3, -6];

function Glyph({ glyph }: { glyph: RankGlyph }) {
  const line = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2.5,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
  } as const;
  switch (glyph) {
    case 'compass':
      return (
        <>
          <path d="M50 33l4 17-4 17-4-17z" fill="currentColor" />
          <path d="M33 50l17-4 17 4-17 4z" {...line} strokeWidth={2} />
        </>
      );
    case 'lens':
      return (
        <>
          <path d="M33 50q17-15 34 0q-17 15-34 0z" {...line} />
          <circle cx="50" cy="50" r="5.5" fill="currentColor" />
        </>
      );
    case 'track':
      return (
        <>
          <ellipse cx="50" cy="56" rx="8" ry="6.5" fill="currentColor" />
          <circle cx="39.5" cy="46" r="3.4" fill="currentColor" />
          <circle cx="46" cy="39.5" r="3.4" fill="currentColor" />
          <circle cx="54" cy="39.5" r="3.4" fill="currentColor" />
          <circle cx="60.5" cy="46" r="3.4" fill="currentColor" />
        </>
      );
    case 'leaf':
      return (
        <>
          <path d="M50 67c-14-9-13-25 0-34c13 9 14 25 0 34z" {...line} />
          <path
            d="M50 67V39M50 57l-6-5M50 57l6-5M50 49l-5-4M50 49l5-4"
            {...line}
            strokeWidth={1.8}
          />
        </>
      );
    case 'fern':
      return (
        <path
          d="M50 67q2-17-2-34M49 60l-9-3M49.5 60l9-4M49 53l-8-4M49.8 52l8-5M48.8 46l-6-4M49.5 45l6-5M48.5 39l-4-3M49 38l4-4"
          {...line}
          strokeWidth={2}
        />
      );
    case 'oak':
      return (
        <>
          <path d="M39 47q11-12 22 0z" fill="currentColor" />
          <path d="M42 47q0 15 8 18q8-3 8-18" {...line} />
          <path d="M50 38l1.5-5" {...line} />
        </>
      );
    case 'book':
      return (
        <path
          d="M33 40q9-4 17 1q8-5 17-1v20q-9-4-17 1q-8-5-17-1zM50 41v20"
          {...line}
          strokeWidth={2.2}
        />
      );
  }
}

/**
 * The rank's ink stamp: a double ring with the rank name around the top, its glyph in
 * the middle and one mark per tier along the bottom. Drawn in currentColor, set to the
 * rank colour; pass `className` for size (e.g. "h-16 w-16").
 */
export function RankEmblem({
  rank,
  className = 'h-16 w-16',
  label,
}: {
  rank: string;
  className?: string;
  /** Accessible name; without one the emblem is decorative (aria-hidden). */
  label?: string;
}) {
  const theme = rankTheme(rank);
  const pathId = `rank-arc-${useId().replace(/[^\w-]/g, '')}`;
  const text = theme.name.toUpperCase();
  // Tier marks: small dots along the bottom arc, centred at the bottom.
  const marks = Array.from({ length: theme.tier + 1 }, (_, i) => {
    const angle = ((90 + (i - theme.tier / 2) * 12) * Math.PI) / 180;
    return { x: 50 + 37 * Math.cos(angle), y: 50 + 37 * Math.sin(angle) };
  });
  return (
    <svg
      viewBox="0 0 100 100"
      className={`${theme.text} ${className}`}
      style={{ transform: `rotate(${TILTS[theme.tier] ?? 0}deg)` }}
      data-rank-emblem={theme.palette}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <defs>
        <path id={pathId} d="M50 50m-37 0a37 37 0 1 1 74 0a37 37 0 1 1-74 0" />
      </defs>
      <circle cx="50" cy="50" r="47" fill="none" stroke="currentColor" strokeWidth="3" />
      <circle cx="50" cy="50" r="28" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <text
        fill="currentColor"
        fontSize={text.length > 14 ? 7.6 : text.length > 9 ? 8.8 : 10}
        fontWeight="700"
        letterSpacing="1.3"
        style={{ fontFamily: 'var(--font-serif)' }}
      >
        <textPath href={`#${pathId}`} startOffset="25%" textAnchor="middle">
          {text}
        </textPath>
      </text>
      {marks.map((m, i) => (
        <circle key={i} cx={m.x.toFixed(2)} cy={m.y.toFixed(2)} r="2" fill="currentColor" />
      ))}
      <Glyph glyph={theme.glyph} />
    </svg>
  );
}
