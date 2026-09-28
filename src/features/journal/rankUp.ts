import { RANKS } from './journal';

/**
 * Rank-up detection, on the device only. The last rank the user has seen celebrated
 * (or already had when this feature arrived) is kept in localStorage.
 */

export const RANK_ACK_KEY = 'fieldlens.rank.acknowledged';

/** Fire this after saving or deleting an observation to re-check the rank right away. */
export const JOURNAL_CHANGED_EVENT = 'fieldlens:journal-changed';

/** Position of a rank in RANKS, or -1 when it isn't a known rank. */
export function rankIndex(name: string | null | undefined): number {
  return name ? RANKS.findIndex((r) => r.name === name) : -1;
}

export type RankCheck =
  /** Nothing to do. */
  | { kind: 'none' }
  /** Remember this rank without celebrating (first run, or an unreadable stored value). */
  | { kind: 'store'; rank: string }
  /** A new, higher rank: celebrate it, then store it once acknowledged. */
  | { kind: 'celebrate'; rank: string };

/**
 * Compare the acknowledged rank with the current one. Pre-existing progress is never
 * celebrated, and a lower rank (after deleting finds) is ignored, so the same rank is
 * never celebrated twice. A jump of several ranks celebrates only the newest.
 */
export function checkRankUp(acknowledged: string | null, current: string): RankCheck {
  const now = rankIndex(current);
  if (now < 0) return { kind: 'none' };
  const seen = rankIndex(acknowledged);
  if (seen < 0) return { kind: 'store', rank: current };
  return now > seen ? { kind: 'celebrate', rank: current } : { kind: 'none' };
}

export function readAcknowledgedRank(): string | null {
  try {
    return localStorage.getItem(RANK_ACK_KEY);
  } catch {
    return null;
  }
}

export function acknowledgeRank(rank: string): void {
  try {
    localStorage.setItem(RANK_ACK_KEY, rank);
  } catch {
    /* storage unavailable: the moment may show again, which is harmless */
  }
}
