import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExploredMilestones } from '../../src/features/journal/ExploredMilestones';
import { HomePatchCard } from '../../src/features/journal/HomePatchCard';
import { WeeklyGoalsCard } from '../../src/features/journal/WeeklyGoalsCard';
import { YearInReviewCard } from '../../src/features/journal/YearInReviewCard';
import { HOME_PATCH_KEY, loadHomePatch } from '../../src/features/journal/patch';
import { createRegionLookup, type AdminTopology } from '../../src/features/journal/regions';
import { find } from '../unit/journalRecord';

// The region outlines are a separate download in the app; here they're read from disk.
const loadRegionOf = vi.hoisted(() => vi.fn());
vi.mock('../../src/features/journal/regions', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/features/journal/regions')>()),
  loadRegionOf,
}));
// "Use my current location" only appears when location is already on; tests set it here.
const locationState = vi.hoisted(() => ({
  value: undefined as
    undefined | { status: string; location?: { latitude: number; longitude: number } },
}));
vi.mock('../../src/features/location/LocationContext', () => ({
  useOptionalLocationState: () => locationState.value,
}));
const admin1 = () =>
  JSON.parse(
    readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../../src/assets/admin1.topo.json'),
      'utf8',
    ),
  ) as AdminTopology;

const HOME = '46.2°N, 63.1°W';
const AWAY = '45.9°N, 64.0°W';
const NOW = new Date(2026, 8, 30, 12); // Wednesday

const records = [
  find('Acer rubrum', new Date(2026, 8, 29, 10), { locationLabel: HOME, commonName: 'red maple' }),
  find('Amanita muscaria', new Date(2026, 8, 29, 11), {
    locationLabel: HOME,
    category: 'fungus',
    commonName: 'fly agaric',
  }),
  find('Picea glauca', new Date(2026, 4, 2, 12), { locationLabel: AWAY }),
  find('Turdus migratorius', new Date(2026, 3, 5, 12), { locationLabel: HOME, category: 'bird' }),
  find('Betula papyrifera', new Date(2026, 5, 5, 12), { locationLabel: HOME }),
  find('Vulpes vulpes', new Date(2025, 5, 5, 12), { category: 'mammal', band: 'low' }),
];

describe('journey cards', () => {
  beforeEach(() => localStorage.clear());

  it('shows areas explored with the next milestone, then countries once loaded', async () => {
    loadRegionOf.mockRejectedValue(new TypeError('offline'));
    render(<ExploredMilestones records={records} />);
    const card = screen.getByTestId('explored-milestones');
    expect(within(card).getByRole('heading')).toHaveTextContent('2 areas');
    expect(card).toHaveTextContent('3 more to 5 areas');
    expect(within(card).getByText(/Areas: reached/)).toBeInTheDocument();
    // The country outlines load lazily; allow for a slow import when the whole suite runs.
    const countries = await screen.findByTestId('explored-countries', {}, { timeout: 10_000 });
    expect(countries).toHaveTextContent('1 country');
    expect(countries).toHaveTextContent('Canada');
    // Offline: the region outlines never arrive, so there's no provinces line.
    expect(screen.queryByTestId('explored-regions')).not.toBeInTheDocument();
  });

  it('shows provinces & states, with the newest, once the outlines load', async () => {
    loadRegionOf.mockResolvedValue(createRegionLookup(admin1()));
    render(<ExploredMilestones records={records} />);
    const regions = await screen.findByTestId('explored-regions', {}, { timeout: 10_000 });
    expect(regions).toHaveTextContent('2 provinces & states');
    expect(regions).toHaveTextContent('Prince Edward Island, Nova Scotia');
    expect(within(regions).getByTestId('newest-region')).toHaveTextContent('Newest: Nova Scotia');
    expect(regions).toHaveTextContent('1 more to 3 provinces & states');
    expect(within(regions).getAllByText(/Provinces & states: reached/)).toHaveLength(2);
  });

  it('shows this week’s three goals and the week streak', () => {
    render(<WeeklyGoalsCard records={records} now={NOW} />);
    expect(screen.getAllByTestId('weekly-goal')).toHaveLength(3);
    expect(screen.getByRole('heading', { name: /Field goals · \d of 3/ })).toBeInTheDocument();
    expect(screen.getByTestId('goal-streak')).toHaveTextContent(/in a row/);
  });

  it('offers a year in review once a year has enough finds, with a year switcher', () => {
    const { unmount } = render(<YearInReviewCard records={records.slice(0, 3)} now={NOW} />);
    expect(screen.queryByTestId('year-review')).not.toBeInTheDocument();
    unmount();

    const older = [2, 3, 4, 5, 6].map((d) =>
      find(`Older${d} sp`, new Date(2025, 6, d, 12), { locationLabel: AWAY }),
    );
    render(<YearInReviewCard records={[...records, ...older]} now={NOW} />);
    const card = screen.getByTestId('year-review');
    expect(within(card).getByRole('heading', { level: 2 })).toHaveTextContent('2026 so far');
    expect(card).toHaveTextContent('Busiest month');
    expect(screen.getAllByTestId('year-first').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '2025' }));
    expect(screen.getByRole('button', { name: '2025' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(card).getByRole('heading', { level: 2 })).toHaveTextContent('2025');
    expect(card).toHaveTextContent('~45.9°N, 64°W');
  });

  it('sets, shows, changes and clears a home patch from existing areas', () => {
    render(<HomePatchCard records={records} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set a home patch' }));
    const area = screen.getByLabelText('Area');
    expect(within(area).getAllByRole('option')).toHaveLength(2);
    fireEvent.change(area, { target: { value: '46.2,-63.1' } });
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: 'Home' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set patch' }));

    expect(loadHomePatch()).toEqual({ latitude: 46.2, longitude: -63.1, name: 'Home' });
    expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByTestId('patch-count')).toHaveTextContent('4 species found at your patch');
    expect(within(screen.getByTestId('patch-species')).getByText('Red Maple')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Species by season' })).toHaveTextContent('Autumn');

    fireEvent.click(screen.getByRole('button', { name: 'Change patch' }));
    fireEvent.change(screen.getByLabelText('Area'), { target: { value: '45.9,-64' } });
    fireEvent.change(screen.getByLabelText(/Name/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set patch' }));
    expect(screen.getByTestId('patch-count')).toHaveTextContent('1 species');

    fireEvent.click(screen.getByRole('button', { name: 'Clear patch' }));
    expect(localStorage.getItem(HOME_PATCH_KEY)).toBeNull();
    expect(screen.getByRole('button', { name: 'Set a home patch' })).toBeInTheDocument();
  });

  it('stays hidden while the journal is empty', () => {
    render(<HomePatchCard records={[]} />);
    expect(screen.queryByTestId('home-patch')).not.toBeInTheDocument();
  });

  it('sets a patch by address: search, pick, saved as the rounded cell named Home', async () => {
    const fetchMock = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            results: [
              {
                label: 'Charlottetown, Prince Edward Island, Canada',
                latitude: 46.2,
                longitude: -63.1,
              },
              { label: 'Halifax, Nova Scotia, Canada', latitude: 44.6, longitude: -63.6 },
            ],
            source: 'openstreetmap',
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', fetchMock);
    try {
      // No find has a location yet: the address search still works.
      render(<HomePatchCard records={[find('A b', NOW)]} />);
      fireEvent.click(screen.getByRole('button', { name: 'Set a home patch' }));
      expect(screen.queryByLabelText('Area')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Set patch' })).toBeDisabled();
      expect(screen.getByRole('link', { name: 'OpenStreetMap contributors' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Use my current location' })).toBeNull();

      fireEvent.change(screen.getByLabelText('Search by address or place'), {
        target: { value: '12 Queen Street, Charlottetown' },
      });
      // Nothing is sent while typing, only on submit.
      expect(fetchMock).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Search' }));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(String(fetchMock.mock.calls[0][0])).toBe(
        '/api/geocode?q=12+Queen+Street%2C+Charlottetown',
      );

      const places = await screen.findByRole('list', { name: 'Places found' });
      fireEvent.click(within(places).getByRole('button', { name: /Charlottetown/ }));
      expect(screen.getByLabelText(/Name/)).toHaveValue('Home');
      expect(screen.getByTestId('patch-choice')).toHaveTextContent('~46.2°N, 63.1°W');
      fireEvent.click(screen.getByRole('button', { name: 'Set patch' }));

      expect(loadHomePatch()).toEqual({ latitude: 46.2, longitude: -63.1, name: 'Home' });
      expect(localStorage.getItem(HOME_PATCH_KEY)).not.toMatch(/Queen|Charlottetown/);
      expect(screen.getByRole('heading', { name: 'Home' })).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('matches finds at a patch found by address', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              results: [
                {
                  label: 'Charlottetown, Prince Edward Island, Canada',
                  latitude: 46.2,
                  longitude: -63.1,
                },
              ],
              source: 'openstreetmap',
            }),
          ),
      ),
    );
    try {
      render(<HomePatchCard records={records} />);
      fireEvent.click(screen.getByRole('button', { name: 'Set a home patch' }));
      fireEvent.change(screen.getByLabelText('Search by address or place'), {
        target: { value: 'Charlottetown' },
      });
      fireEvent.submit(screen.getByRole('search'));
      fireEvent.click(await screen.findByRole('button', { name: /Charlottetown/ }));
      // Picking a place clears the area list's selection.
      expect(screen.getByLabelText('Area')).toHaveValue('');
      fireEvent.click(screen.getByRole('button', { name: 'Set patch' }));
      expect(screen.getByTestId('patch-count')).toHaveTextContent('4 species found at your patch');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('shows a message when place search fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: 'rate_limited', message: 'Too many searches. Please try again.' },
            }),
            { status: 429 },
          ),
      ),
    );
    try {
      render(<HomePatchCard records={records} />);
      fireEvent.click(screen.getByRole('button', { name: 'Set a home patch' }));
      fireEvent.change(screen.getByLabelText('Search by address or place'), {
        target: { value: 'Charlottetown' },
      });
      fireEvent.submit(screen.getByRole('search'));
      expect(await screen.findByText('Too many searches. Please try again.')).toBeInTheDocument();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('uses the current approximate location when it is already on', async () => {
    locationState.value = { status: 'granted', location: { latitude: 46.24, longitude: -63.13 } };
    try {
      render(<HomePatchCard records={records} />);
      fireEvent.click(screen.getByRole('button', { name: 'Set a home patch' }));
      fireEvent.click(screen.getByRole('button', { name: 'Use my current location' }));
      fireEvent.click(screen.getByRole('button', { name: 'Set patch' }));
      await waitFor(() => expect(loadHomePatch()).toEqual({ latitude: 46.2, longitude: -63.1 }));
      expect(screen.getByTestId('patch-count')).toHaveTextContent('4 species');
    } finally {
      locationState.value = undefined;
    }
  });
});
