import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PronounceButton } from '../../src/features/results/Pronounce';
import { WhereRecorded } from '../../src/features/results/sections';
import { ResultView } from '../../src/features/results/ResultView';
import { mockResult } from './fixtures';

describe('pronunciation', () => {
  it('speaks the common name, then the scientific name more slowly', async () => {
    const speak = vi.fn();
    const utterances: { text: string; rate: number }[] = [];
    class FakeUtterance {
      rate = 1;
      lang = '';
      onstart?: () => void;
      onend?: () => void;
      onerror?: () => void;
      constructor(public text: string) {}
    }
    Object.assign(window, {
      speechSynthesis: {
        speak: (u: FakeUtterance) => (speak(u), utterances.push(u)),
        cancel: vi.fn(),
      },
      SpeechSynthesisUtterance: FakeUtterance,
    });
    render(<PronounceButton commonName="Red maple" scientificName="Acer rubrum" />);
    await userEvent.click(screen.getByTestId('pronounce'));
    expect(utterances.map((u) => [u.text, u.rate])).toEqual([
      ['Red maple', 1],
      ['Acer rubrum', 0.8],
    ]);
  });
  it('hides itself when speech is unavailable', () => {
    const original = (window as unknown as Record<string, unknown>).speechSynthesis;
    delete (window as unknown as Record<string, unknown>).speechSynthesis;
    const { container } = render(<PronounceButton scientificName="Acer rubrum" />);
    expect(container).toBeEmptyDOMElement();
    (window as unknown as Record<string, unknown>).speechSynthesis = original;
  });
});

describe('where recorded', () => {
  it('renders a globe with the recorded countries', async () => {
    render(
      <WhereRecorded
        title="Red maple"
        userLocation={{ latitude: 46.24, longitude: -63.13 }}
        info={{
          scientificName: 'Acer rubrum',
          commonNames: [],
          taxonomy: {},
          facts: [],
          links: [],
          sources: [],
          distribution: {
            source: 'GBIF',
            total: 1000,
            countries: [
              { code: 'US', count: 900 },
              { code: 'CA', count: 100 },
            ],
          },
        }}
      />,
    );
    expect(
      await screen.findByRole('img', {
        name: /2 countries, most in United States of America, Canada/,
      }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('globe')).toHaveTextContent(
      'Recorded in 2 countries · 1,000 records · red dot = you',
    );
  });
  it('renders nothing without distribution data', () => {
    const { container } = render(<WhereRecorded title="x" info={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('your photo', () => {
  it('opens your own photos full screen', async () => {
    render(
      <ResultView
        result={await mockResult('high')}
        photoUrl="blob:crop"
        userPhotos={['blob:original']}
      />,
    );
    await userEvent.click(screen.getByTestId('own-photo'));
    const viewer = screen.getByTestId('lightbox');
    expect(viewer).toHaveTextContent('Your photo');
    expect(viewer.querySelector('img')).toHaveAttribute('src', 'blob:original');
  });
  it('labels results that used the photo’s own location', async () => {
    const base = await mockResult('high');
    render(<ResultView result={{ ...base, location: { ...base.location, source: 'photo' } }} />);
    expect(screen.getByTestId('result-headline')).toHaveTextContent('Location from photo');
  });
});
