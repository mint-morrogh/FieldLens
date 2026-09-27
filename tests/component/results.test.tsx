import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ResultView, type ImproveProps } from '../../src/features/results/ResultView';
import { INaturalistCard } from '../../src/features/results/sections';
import { mockResult } from './fixtures';

const improve = (overrides: Partial<ImproveProps> = {}): ImproveProps => ({
  photos: [{ id: 'p1', url: 'blob:1', feature: 'leaf' }],
  canAddMore: true,
  onAddPhoto: vi.fn(),
  onRemovePhoto: vi.fn(),
  onResubmit: vi.fn(),
  dirty: false,
  ...overrides,
});

describe('ResultView', () => {
  it('renders a high-confidence result with names, confidence text and attribution', async () => {
    render(<ResultView result={await mockResult('high')} photoUrl="blob:x" />);
    const headline = screen.getByTestId('result-headline');
    expect(headline).toHaveAttribute('data-band', 'high');
    expect(within(headline).getByRole('heading', { level: 1 })).toHaveTextContent('Red Maple');
    expect(headline).toHaveTextContent('Acer rubrum');
    // Confidence is conveyed in text, not only color.
    expect(headline).toHaveTextContent(/9\d% identification confidence · Very likely match/);
    expect(screen.getByRole('meter', { name: /identification confidence/ })).toBeInTheDocument();
    expect(screen.getByTestId('attribution')).toHaveTextContent('Demo mode');
    expect(screen.getByTestId('demo-banner')).toHaveTextContent('not a real identification');
    expect(screen.getByText(/safe to eat/)).toBeInTheDocument();
  });

  it('lists alternative candidates separately from nearby species', async () => {
    render(<ResultView result={await mockResult('high')} />);
    const alternatives = screen.getByTestId('alternatives');
    expect(within(alternatives).getAllByTestId('candidate')).toHaveLength(2);
    expect(alternatives).toHaveTextContent('Silver Maple');
    const nearby = screen.getByTestId('nearby-species');
    expect(nearby).toHaveTextContent('not alternative identifications');
    expect(nearby).toHaveTextContent('Sugar Maple');
  });

  it('renders low confidence as a shortlist with guidance and follow-up buttons', async () => {
    const onAddPhoto = vi.fn();
    render(<ResultView result={await mockResult('low')} improve={improve({ onAddPhoto })} />);
    // The three goldenrods add up to a confident genus-level answer.
    expect(screen.getByTestId('group-headline')).toHaveTextContent('A goldenrod (Solidago)');
    expect(screen.getByText(/combined across 3 Solidago species/)).toBeInTheDocument();
    const list = screen.getByTestId('low-confidence-list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(list).toHaveTextContent(/Canada Goldenrod.*3\d%/);
    expect(screen.getByText('A photo of the flower would help.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Add a flower photo/ }));
    expect(onAddPhoto).toHaveBeenCalledWith('flower');
    // Low confidence does not show a species fact sheet for an uncertain top pick.
    expect(screen.queryByTestId('species-facts')).not.toBeInTheDocument();
  });

  it('says "not confident" when candidates do not share a genus', async () => {
    const result = await mockResult('low');
    render(<ResultView result={{ ...result, groupSummary: undefined }} />);
    expect(
      screen.getByRole('heading', { name: 'We’re not confident enough yet.' }),
    ).toBeInTheDocument();
  });

  it('shows a reference gallery that opens a credited full-screen viewer', async () => {
    render(<ResultView result={await mockResult('high')} />);
    const gallery = screen.getByTestId('reference-gallery');
    await userEvent.click(within(gallery).getByRole('button', { name: /Open reference photo 1/ }));
    const viewer = screen.getByTestId('lightbox');
    expect(viewer).toHaveTextContent('CC0');
    expect(viewer).toHaveTextContent('iNaturalist');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('lightbox')).not.toBeInTheDocument();
  });

  it('offers the photo library for follow-ups', async () => {
    const onAddFromLibrary = vi.fn();
    render(<ResultView result={await mockResult('low')} improve={improve({ onAddFromLibrary })} />);
    await userEvent.click(screen.getByRole('button', { name: /photo library/ }));
    expect(onAddFromLibrary).toHaveBeenCalledWith('flower');
  });

  it('prefixes medium confidence with "Likely"', async () => {
    render(<ResultView result={await mockResult('medium')} />);
    expect(screen.getByTestId('result-headline')).toHaveAttribute('data-band', 'medium');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Likely Red Clover');
  });

  it('shows a no-match state for zero predictions', async () => {
    render(<ResultView result={await mockResult('zero')} />);
    expect(screen.getByRole('heading', { name: 'No match found' })).toBeInTheDocument();
    expect(screen.queryByTestId('inat-card')).not.toBeInTheDocument();
  });

  it('shows "Location not used" when location was declined', async () => {
    render(<ResultView result={await mockResult('high', false)} />);
    expect(screen.getByTestId('result-headline')).toHaveTextContent('Location not used');
    expect(screen.getByTestId('geo-evidence')).toHaveTextContent('Location not used');
    expect(screen.getByTestId('why-this-match')).toHaveTextContent('Location not used');
  });

  it('keeps the result when GBIF is unavailable', async () => {
    render(<ResultView result={await mockResult('gbif-down')} />);
    expect(screen.getByTestId('result-headline')).toHaveTextContent('Acer rubrum');
    expect(screen.getAllByText(/temporarily unavailable/).length).toBeGreaterThan(0);
  });

  it('lets the user remove photos and re-identify', async () => {
    const onRemovePhoto = vi.fn();
    const onResubmit = vi.fn();
    render(
      <ResultView
        result={await mockResult('low')}
        improve={improve({
          photos: [
            { id: 'p1', url: 'blob:1', feature: 'leaf' },
            { id: 'p2', url: 'blob:2', feature: 'flower' },
          ],
          onRemovePhoto,
          onResubmit,
          dirty: true,
        })}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Remove photo 2' }));
    expect(onRemovePhoto).toHaveBeenCalledWith('p2');
    await userEvent.click(screen.getByRole('button', { name: /Identify again/ }));
    expect(onResubmit).toHaveBeenCalled();
  });
});

it('shows no demo banner for real (non-mock) results', async () => {
  const result = { ...(await mockResult('high')), mock: undefined };
  render(<ResultView result={result} />);
  expect(screen.queryByTestId('demo-banner')).not.toBeInTheDocument();
});

describe('INaturalistCard', () => {
  it('shows nearby counts, links and the independence disclaimer', async () => {
    const result = await mockResult('high');
    render(<INaturalistCard summary={result.community} status="ok" locationUsed />);
    const card = screen.getByTestId('inat-card');
    expect(within(card).getByRole('heading', { name: 'From iNaturalist' })).toBeInTheDocument();
    expect(card).toHaveTextContent(/\d+ observations within 25 km/);
    expect(card).toHaveTextContent(/observed in the last 90 days/);
    expect(card).toHaveTextContent('do not independently confirm this identification');
    expect(within(card).getByRole('link', { name: /View on iNaturalist/ })).toHaveAttribute(
      'target',
      '_blank',
    );
  });
  it('shows an unavailable state without breaking', () => {
    render(<INaturalistCard status="unavailable" locationUsed />);
    expect(screen.getByTestId('inat-card')).toHaveTextContent(
      'iNaturalist information is temporarily unavailable.',
    );
  });
  it('invites location sharing when location was not used', async () => {
    const result = await mockResult('high', false);
    render(<INaturalistCard summary={result.community} status="ok" locationUsed={false} />);
    expect(screen.getByTestId('inat-card')).toHaveTextContent(
      'Share your location to see nearby observations.',
    );
  });
});
