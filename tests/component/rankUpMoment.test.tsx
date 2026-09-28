import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RankUpMoment } from '../../src/components/RankUpMoment';
import type { ObservationRecord } from '../../src/features/history/historyStore';
import { RANK_ACK_KEY } from '../../src/features/journal/rankUp';

let records: ObservationRecord[] = [];
vi.mock('../../src/features/history/historyStore', () => ({
  listObservations: () => Promise.resolve(records),
}));

/** One confident plant: 1 species + 5 for the group = 6 points, rank Observer. */
function plant(id: string, name: string): ObservationRecord {
  return {
    id,
    schemaVersion: 1,
    createdAt: '2026-09-01T10:00:00Z',
    category: 'plant',
    imagesCount: 1,
    top: { scientificName: name, finalConfidence: 0.9, band: 'high' },
    result: {} as ObservationRecord['result'],
  };
}

describe('RankUpMoment', () => {
  beforeEach(() => {
    localStorage.clear();
    records = [];
    window.location.hash = '#/';
  });

  it('quietly stores existing progress on first run', async () => {
    records = [plant('a', 'Acer rubrum')];
    render(<RankUpMoment />);
    await waitFor(() => expect(localStorage.getItem(RANK_ACK_KEY)).toBe('Observer'));
    expect(screen.queryByTestId('rank-up')).not.toBeInTheDocument();
  });

  it('celebrates a new rank, then remembers it once dismissed', async () => {
    localStorage.setItem(RANK_ACK_KEY, 'Wanderer');
    records = [plant('a', 'Acer rubrum')];
    const { unmount } = render(<RankUpMoment />);
    const dialog = await screen.findByRole('dialog', { name: 'Observer' });
    expect(dialog).toHaveTextContent('1 species · 1 group');
    const button = screen.getByRole('button', { name: 'Continue' });
    expect(button).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('rank-up')).not.toBeInTheDocument();
    expect(localStorage.getItem(RANK_ACK_KEY)).toBe('Observer');

    unmount();
    render(<RankUpMoment />);
    await act(() => Promise.resolve());
    expect(screen.queryByTestId('rank-up')).not.toBeInTheDocument();
  });

  it('dismisses itself after a moment', async () => {
    localStorage.setItem(RANK_ACK_KEY, 'Wanderer');
    records = [plant('a', 'Acer rubrum')];
    render(<RankUpMoment durationMs={50} />);
    await screen.findByTestId('rank-up');
    await waitFor(() => expect(screen.queryByTestId('rank-up')).not.toBeInTheDocument());
    expect(localStorage.getItem(RANK_ACK_KEY)).toBe('Observer');
  });

  it('never shows on the identify or live screens', async () => {
    localStorage.setItem(RANK_ACK_KEY, 'Wanderer');
    records = [plant('a', 'Acer rubrum')];
    for (const hash of ['#/identify', '#/live']) {
      window.location.hash = hash;
      const { unmount } = render(<RankUpMoment />);
      await act(() => Promise.resolve());
      expect(screen.queryByTestId('rank-up')).not.toBeInTheDocument();
      unmount();
    }
    expect(localStorage.getItem(RANK_ACK_KEY)).toBe('Wanderer');
  });
});
