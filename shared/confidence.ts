import { CONFIDENCE_BANDS } from './config.js';
import type { ConfidenceBand } from './types.js';

export function confidenceBand(
  score: number | undefined,
  thresholds: { high: number; medium: number } = CONFIDENCE_BANDS,
): ConfidenceBand {
  if (score === undefined || !Number.isFinite(score)) return 'none';
  if (score >= thresholds.high) return 'high';
  if (score >= thresholds.medium) return 'medium';
  return 'low';
}

export function formatPercent(score: number): string {
  return `${Math.round(Math.max(0, Math.min(1, score)) * 100)}%`;
}

export const BAND_LABELS: Record<ConfidenceBand, string> = {
  high: 'Very likely match',
  medium: 'Likely match',
  low: 'Not confident yet',
  none: 'No match found',
};
