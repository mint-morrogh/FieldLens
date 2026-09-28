import { afterEach, describe, expect, it, vi } from 'vitest';
import { RANKS } from '../../src/features/journal/journal';
import { rankTheme } from '../../src/features/journal/rankTheme';
import {
  RANK_ACK_KEY,
  acknowledgeRank,
  checkRankUp,
  rankIndex,
  readAcknowledgedRank,
} from '../../src/features/journal/rankUp';

describe('checkRankUp', () => {
  it('stores the current rank quietly on first run, even with existing progress', () => {
    expect(checkRankUp(null, 'Wanderer')).toEqual({ kind: 'store', rank: 'Wanderer' });
    expect(checkRankUp(null, 'Naturalist')).toEqual({ kind: 'store', rank: 'Naturalist' });
  });

  it('treats an unknown stored rank like a first run', () => {
    expect(checkRankUp('Grand Poobah', 'Tracker')).toEqual({ kind: 'store', rank: 'Tracker' });
  });

  it('celebrates a higher rank, and only the newest after a jump', () => {
    expect(checkRankUp('Wanderer', 'Observer')).toEqual({ kind: 'celebrate', rank: 'Observer' });
    expect(checkRankUp('Observer', 'Field Naturalist')).toEqual({
      kind: 'celebrate',
      rank: 'Field Naturalist',
    });
  });

  it('does nothing for the same or a lower rank', () => {
    expect(checkRankUp('Tracker', 'Tracker')).toEqual({ kind: 'none' });
    expect(checkRankUp('Naturalist', 'Observer')).toEqual({ kind: 'none' });
  });

  it('ignores an unknown current rank', () => {
    expect(checkRankUp('Observer', 'Nope')).toEqual({ kind: 'none' });
  });

  it('indexes ranks in order', () => {
    expect(RANKS.map((r) => rankIndex(r.name))).toEqual(RANKS.map((_, i) => i));
    expect(rankIndex(null)).toBe(-1);
  });
});

describe('acknowledged rank storage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('round-trips under a fieldlens. key', () => {
    expect(RANK_ACK_KEY.startsWith('fieldlens.')).toBe(true);
    expect(readAcknowledgedRank()).toBeNull();
    acknowledgeRank('Tracker');
    expect(readAcknowledgedRank()).toBe('Tracker');
  });

  it('survives unavailable storage', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => acknowledgeRank('Observer')).not.toThrow();
    expect(readAcknowledgedRank()).toBeNull();
  });
});

describe('rankTheme', () => {
  it('gives every rank its own palette, glyph and cover', () => {
    const themes = RANKS.map((r) => rankTheme(r.name));
    expect(themes.map((t) => t.name)).toEqual(RANKS.map((r) => r.name));
    expect(themes.map((t) => t.tier)).toEqual(RANKS.map((_, i) => i));
    for (const key of ['palette', 'glyph', 'cover', 'text'] as const)
      expect(new Set(themes.map((t) => t[key])).size).toBe(RANKS.length);
  });

  it('uses rank tokens for classes and CSS variables', () => {
    const t = rankTheme('Naturalist');
    expect(t.palette).toBe('deep-blue');
    expect(t.text).toBe('text-rank-blue');
    expect(t.fill).toBe('bg-rank-blue');
    expect(t.style).toMatchObject({
      '--rank-accent': 'var(--color-rank-blue)',
      '--rank-soft': 'var(--color-rank-blue-soft)',
    });
  });

  it('falls back to the first rank for unknown names', () => {
    expect(rankTheme('Unknown').name).toBe('Wanderer');
    expect(rankTheme('Unknown').tier).toBe(0);
  });
});
