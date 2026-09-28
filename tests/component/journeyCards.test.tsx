import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { ExploredMilestones } from '../../src/features/journal/ExploredMilestones';
import { HomePatchCard } from '../../src/features/journal/HomePatchCard';
import { WeeklyGoalsCard } from '../../src/features/journal/WeeklyGoalsCard';
import { YearInReviewCard } from '../../src/features/journal/YearInReviewCard';
import { HOME_PATCH_KEY, loadHomePatch } from '../../src/features/journal/patch';
import { find } from '../unit/journalRecord';

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
    render(<ExploredMilestones records={records} />);
    const card = screen.getByTestId('explored-milestones');
    expect(within(card).getByRole('heading')).toHaveTextContent('2 areas');
    expect(card).toHaveTextContent('3 more to 5 areas');
    expect(within(card).getByText(/Areas: reached/)).toBeInTheDocument();
    // The country outlines load lazily; allow for a slow import when the whole suite runs.
    const countries = await screen.findByTestId('explored-countries', {}, { timeout: 10_000 });
    expect(countries).toHaveTextContent('1 country');
    expect(countries).toHaveTextContent('Canada');
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

  it('stays hidden when there are no places to choose from', () => {
    render(<HomePatchCard records={[find('A b', NOW)]} />);
    expect(screen.queryByTestId('home-patch')).not.toBeInTheDocument();
  });
});
