import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SafetySection } from '../../src/features/results/SafetySection';
import type { SafetyInfo } from '../../shared/types';

const safety: SafetyInfo = {
  level: 'danger',
  topToxic: false,
  statements: [
    {
      kind: 'toxic',
      severity: 'deadly',
      text: 'All parts are highly poisonous.',
      source: 'Wikipedia (summarised by FieldLens)',
      sourceUrl: 'https://en.wikipedia.org/wiki/X',
    },
    {
      kind: 'edible',
      text: 'The berries are made into jam.',
      quote: true,
      source: 'Wikipedia',
      license: 'CC BY-SA 4.0',
    },
  ],
};

describe('SafetySection', () => {
  it('always shows warnings with a danger banner', () => {
    render(<SafetySection safety={safety} band="low" category="plant" />);
    expect(screen.getByTestId('safety')).toHaveAttribute('data-level', 'danger');
    expect(screen.getByRole('alert')).toHaveTextContent('Dangerous look-alikes');
    expect(screen.getByText('All parts are highly poisonous.')).toBeInTheDocument();
  });
  it('hides edible uses unless the identification is high confidence', () => {
    const { unmount } = render(<SafetySection safety={safety} band="medium" category="plant" />);
    expect(screen.getByTestId('edible-hidden')).toBeInTheDocument();
    expect(screen.queryByText(/made into jam/)).not.toBeInTheDocument();
    unmount();
    render(<SafetySection safety={safety} band="high" category="plant" />);
    expect(screen.getByText('“The berries are made into jam.”')).toBeInTheDocument();
  });
  it('never shows food uses for a species reported poisonous itself', () => {
    render(<SafetySection safety={{ ...safety, topToxic: true }} band="high" category="fungus" />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Reported poisonous. Do not eat any part of it.',
    );
    expect(screen.getByTestId('edible-hidden')).toHaveTextContent('reported poisonous');
    expect(screen.queryByText(/made into jam/)).not.toBeInTheDocument();
  });

  it('adds a stronger warning for mushrooms and handles missing information', () => {
    const { unmount } = render(<SafetySection safety={safety} band="high" category="fungus" />);
    expect(screen.getByText(/Many edible mushrooms have deadly look-alikes/)).toBeInTheDocument();
    unmount();
    render(
      <SafetySection safety={{ level: 'none', statements: [] }} band="high" category="plant" />,
    );
    expect(screen.getByTestId('edible-none')).toHaveTextContent('doesn’t mean it’s safe');
  });
});

describe('Wildlife safety', () => {
  it('shows animal cautions without any edibility section', () => {
    render(
      <SafetySection
        safety={{
          kind: 'wildlife',
          level: 'caution',
          statements: [
            {
              kind: 'caution',
              severity: 'caution',
              text: 'Raccoons are among the animals most often found with rabies.',
              source: 'CDC — About Rabies',
              sourceUrl: 'https://www.cdc.gov/rabies/about/index.html',
            },
          ],
        }}
        band="high"
        category="mammal"
      />,
    );
    expect(screen.getByRole('heading', { name: 'Wildlife safety' })).toBeInTheDocument();
    expect(screen.getByText(/most often found with rabies/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /CDC — About Rabies/ })).toBeInTheDocument();
    expect(screen.queryByText(/edible/i)).not.toBeInTheDocument();
  });

  it('shows a small, credited reference photo next to each look-alike warning', () => {
    const lookalikes: SafetyInfo = {
      level: 'danger',
      statements: [
        {
          kind: 'lookalike',
          severity: 'deadly',
          subject: 'poison hemlock',
          text: 'All parts of poison hemlock are highly poisonous to people and animals.',
          source: 'Wikipedia (summarised by FieldLens)',
          sourceUrl: 'https://en.wikipedia.org/wiki/Conium_maculatum',
          photo: {
            url: 'https://static.inaturalist.org/photos/1/small.jpg',
            thumbnailUrl: 'https://static.inaturalist.org/photos/1/square.jpg',
            author: '(c) A. Botanist, some rights reserved (CC BY)',
            license: 'CC-BY',
            source: 'iNaturalist',
            sourceUrl: 'https://www.inaturalist.org/taxa/49640',
          },
        },
        {
          kind: 'lookalike',
          severity: 'deadly',
          subject: 'water hemlock',
          text: 'Water hemlocks are highly poisonous; eating even a small amount can be fatal.',
          source: 'Wikipedia (summarised by FieldLens)',
        },
      ],
    };
    render(<SafetySection safety={lookalikes} band="high" category="plant" />);
    const [hemlock, water] = screen.getAllByRole('listitem');
    // Warning text comes first; the photo is secondary.
    expect(hemlock.textContent!.indexOf('highly poisonous')).toBeLessThan(
      hemlock.textContent!.indexOf('Photo of poison hemlock'),
    );
    const img = within(hemlock).getByRole('img', { name: 'Reference photo of poison hemlock' });
    expect(img).toHaveAttribute('src', 'https://static.inaturalist.org/photos/1/small.jpg');
    expect(within(hemlock).getByTestId('lookalike-credit')).toHaveTextContent(
      'Photo of poison hemlock: © A. Botanist, some rights reserved (CC BY) · CC-BY · iNaturalist',
    );
    expect(within(hemlock).getByRole('link', { name: /source/ })).toHaveAttribute(
      'href',
      'https://www.inaturalist.org/taxa/49640',
    );
    // No photo: the warning is shown as before.
    expect(within(water).queryByRole('img')).not.toBeInTheDocument();
    expect(water).toHaveTextContent('Water hemlocks are highly poisonous');

    // Tap to enlarge.
    fireEvent.click(screen.getByTestId('lookalike-photo'));
    expect(screen.getByTestId('lightbox')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close photos' }));

    // A photo that fails to load disappears with its credit; the warning stays.
    fireEvent.error(img);
    expect(screen.queryByRole('img', { name: /Reference photo/ })).not.toBeInTheDocument();
    expect(screen.queryByTestId('lookalike-credit')).not.toBeInTheDocument();
    expect(screen.getByText(/All parts of poison hemlock/)).toBeInTheDocument();
  });
});
