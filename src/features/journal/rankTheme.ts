import type { CSSProperties } from 'react';
import { RANKS } from './journal';

/**
 * A colour and journal cover per naturalist rank, in a field-journal palette: slate,
 * moss, lichen, rust, deep blue, heather and gold ink. The colours are tokens in
 * index.css (`--color-rank-*`, with dark-mode values), so every class below works in
 * both themes. Class strings are written out in full so Tailwind can see them.
 */

export type RankName = (typeof RANKS)[number]['name'];

/** The small drawing in the middle of the rank emblem. */
export type RankGlyph = 'compass' | 'lens' | 'track' | 'leaf' | 'fern' | 'oak' | 'book';

/** Subtle background pattern for the rank card ("journal cover"); see `.rank-cover`. */
export type RankCover = 'plain' | 'dots' | 'ruled' | 'grid' | 'contour' | 'hatch' | 'gilt';

export type RankTheme = {
  name: RankName;
  /** 0 for the first rank, up to RANKS.length - 1. */
  tier: number;
  /** Palette name, for tests and data attributes. */
  palette: 'slate' | 'moss' | 'lichen' | 'rust' | 'deep-blue' | 'heather' | 'gold-ink';
  /** Text / stroke colour, e.g. the rank title and emblem. */
  text: string;
  /** Solid fill, e.g. the progress bar. */
  fill: string;
  /** Soft tinted background, e.g. stat tiles. */
  soft: string;
  /** Border in the rank colour. */
  border: string;
  glyph: RankGlyph;
  cover: RankCover;
  /**
   * CSS variables for `.rank-cover` and anything else that wants the raw colours:
   * `--rank-accent` and `--rank-soft`.
   */
  style: CSSProperties;
};

type ThemeRow = Pick<
  RankTheme,
  'palette' | 'text' | 'fill' | 'soft' | 'border' | 'glyph' | 'cover'
> & {
  token: string;
};

const THEMES: Record<RankName, ThemeRow> = {
  Wanderer: {
    palette: 'slate',
    token: 'slate',
    text: 'text-rank-slate',
    fill: 'bg-rank-slate',
    soft: 'bg-rank-slate-soft',
    border: 'border-rank-slate',
    glyph: 'compass',
    cover: 'plain',
  },
  Observer: {
    palette: 'moss',
    token: 'moss',
    text: 'text-rank-moss',
    fill: 'bg-rank-moss',
    soft: 'bg-rank-moss-soft',
    border: 'border-rank-moss',
    glyph: 'lens',
    cover: 'dots',
  },
  Tracker: {
    palette: 'lichen',
    token: 'lichen',
    text: 'text-rank-lichen',
    fill: 'bg-rank-lichen',
    soft: 'bg-rank-lichen-soft',
    border: 'border-rank-lichen',
    glyph: 'track',
    cover: 'ruled',
  },
  'Field Naturalist': {
    palette: 'rust',
    token: 'rust',
    text: 'text-rank-rust',
    fill: 'bg-rank-rust',
    soft: 'bg-rank-rust-soft',
    border: 'border-rank-rust',
    glyph: 'leaf',
    cover: 'grid',
  },
  Naturalist: {
    palette: 'deep-blue',
    token: 'blue',
    text: 'text-rank-blue',
    fill: 'bg-rank-blue',
    soft: 'bg-rank-blue-soft',
    border: 'border-rank-blue',
    glyph: 'fern',
    cover: 'contour',
  },
  'Master Naturalist': {
    palette: 'heather',
    token: 'heather',
    text: 'text-rank-heather',
    fill: 'bg-rank-heather',
    soft: 'bg-rank-heather-soft',
    border: 'border-rank-heather',
    glyph: 'oak',
    cover: 'hatch',
  },
  'Field Scholar': {
    palette: 'gold-ink',
    token: 'gold',
    text: 'text-rank-gold',
    fill: 'bg-rank-gold',
    soft: 'bg-rank-gold-soft',
    border: 'border-rank-gold',
    glyph: 'book',
    cover: 'gilt',
  },
};

/** The theme for a rank name; unknown names fall back to the first rank. */
export function rankTheme(name: string): RankTheme {
  const tier = Math.max(
    0,
    RANKS.findIndex((r) => r.name === name),
  );
  const rankName = RANKS[tier].name;
  const { token, ...row } = THEMES[rankName];
  return {
    name: rankName,
    tier,
    ...row,
    style: {
      '--rank-accent': `var(--color-rank-${token})`,
      '--rank-soft': `var(--color-rank-${token}-soft)`,
    } as CSSProperties,
  };
}
