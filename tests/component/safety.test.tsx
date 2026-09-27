import { render, screen } from '@testing-library/react';
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
  it('always shows warnings with a danger banner and the expert footer', () => {
    render(<SafetySection safety={safety} band="low" category="plant" />);
    expect(screen.getByTestId('safety')).toHaveAttribute('data-level', 'danger');
    expect(screen.getByRole('alert')).toHaveTextContent('Dangerous look-alikes');
    expect(screen.getByText('All parts are highly poisonous.')).toBeInTheDocument();
    expect(screen.getByText(/Never eat a wild plant based on an app/)).toBeInTheDocument();
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
