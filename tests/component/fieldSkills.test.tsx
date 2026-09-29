import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NameItFirst } from '../../src/features/identification/NameItFirst';
import { ResultView, type ImproveProps } from '../../src/features/results/ResultView';
import { mockResult } from './fixtures';

const improve = (overrides: Partial<ImproveProps> = {}): ImproveProps => ({
  photos: [{ id: 'p1', url: 'blob:1', feature: 'leaf' }],
  canAddMore: true,
  onAddPhoto: vi.fn(),
  onAddFromLibrary: vi.fn(),
  onRemovePhoto: vi.fn(),
  onResubmit: vi.fn(),
  dirty: false,
  ...overrides,
});

describe('deciding angle', () => {
  it('asks for the deciding view and opens the camera for that part', async () => {
    const result = {
      ...(await mockResult('medium')),
      decidingView: {
        feature: 'flower',
        prompt: 'Photograph a flower up close',
        reason: 'Both are maples.',
      },
    };
    const props = improve();
    render(<ResultView result={result} improve={props} />);
    const card = screen.getByTestId('deciding-view');
    expect(card).toHaveTextContent('Photograph a flower up close');
    expect(card).toHaveTextContent('Both are maples.');
    await userEvent.click(screen.getByRole('button', { name: /Add a photo/ }));
    expect(props.onAddPhoto).toHaveBeenCalledWith('flower');
    await userEvent.click(screen.getByRole('button', { name: 'Or pick one from your library' }));
    expect(props.onAddFromLibrary).toHaveBeenCalledWith('flower');
  });

  it('is not shown when confident or when no more photos fit', async () => {
    const view = { feature: 'flower', prompt: 'Photograph a flower', reason: 'r' };
    const { unmount } = render(
      <ResultView
        result={{ ...(await mockResult('high')), decidingView: view }}
        improve={improve()}
      />,
    );
    expect(screen.queryByTestId('deciding-view')).not.toBeInTheDocument();
    unmount();
    render(
      <ResultView
        result={{ ...(await mockResult('medium')), decidingView: view }}
        improve={improve({ canAddMore: false })}
      />,
    );
    expect(screen.queryByTestId('deciding-view')).not.toBeInTheDocument();
  });
});

describe('skill notes', () => {
  it('acknowledges a called guess and a sharp eye quietly', async () => {
    render(
      <ResultView
        result={await mockResult('high')}
        guess={{ text: 'red maple', result: 'exact' }}
        sharpEye
      />,
    );
    expect(screen.getByTestId('guess-note')).toHaveTextContent('You called it.');
    expect(screen.getByTestId('sharp-eye-note')).toHaveTextContent(
      'Sharp eye: your extra photo made this confident.',
    );
  });

  it('re-scores from answers that rule rivals down, with a sharp-eye note', async () => {
    const base = await mockResult('low');
    const [first, second, third] = base.candidates;
    const candidates = [
      { ...first, finalConfidence: 0.45 },
      { ...second, finalConfidence: 0.35 },
      ...(third ? [{ ...third, finalConfidence: 0.1 }] : []),
    ];
    const result = {
      ...base,
      category: 'mammal' as const,
      confidenceBand: 'low' as const,
      candidates,
      questions: [
        {
          id: 'size' as const,
          prompt: 'About how big was it?',
          options: [
            { id: 'small', label: 'Small' },
            { id: 'big', label: 'Big' },
          ],
          fits: Object.fromEntries(candidates.map((c, i) => [c.id, i === 0 ? ['big'] : ['small']])),
          source: 'EltonTraits 1.0 (Wilman et al. 2014)',
          sourceUrl: 'https://doi.org/10.6084/m9.figshare.3559887.v1',
        },
      ],
    };
    const onAnswers = vi.fn();
    render(<ResultView result={result} onAnswers={onAnswers} />);
    expect(screen.getByTestId('result-headline')).toHaveAttribute('data-band', 'low');
    expect(screen.queryByTestId('answers-updated')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Big' }));
    expect(onAnswers).toHaveBeenCalledWith({ size: 'big' });
    expect(screen.getByTestId('result-headline')).toHaveAttribute('data-band', 'medium');
    expect(screen.getByTestId('answers-updated')).toHaveTextContent('Updated from your answers');
    expect(screen.getByTestId('sharp-eye-note')).toHaveTextContent(
      'Sharp eye: your answers made this confident.',
    );
    // "Not sure" takes it back.
    await userEvent.click(screen.getByRole('button', { name: 'Not sure' }));
    expect(screen.getByTestId('result-headline')).toHaveAttribute('data-band', 'low');
    expect(screen.queryByTestId('sharp-eye-note')).not.toBeInTheDocument();
  });

  it('shows saved answers again when reopened', async () => {
    const base = await mockResult('low');
    const [first, second] = base.candidates;
    const result = {
      ...base,
      category: 'mammal' as const,
      confidenceBand: 'low' as const,
      candidates: [
        { ...first, finalConfidence: 0.45 },
        { ...second, finalConfidence: 0.4 },
      ],
      questions: [
        {
          id: 'time' as const,
          prompt: 'When did you see it?',
          options: [
            { id: 'day', label: 'In daylight' },
            { id: 'night', label: 'At night' },
          ],
          fits: { [first.id]: ['day'], [second.id]: ['night'] },
          source: 'EltonTraits 1.0 (Wilman et al. 2014)',
          sourceUrl: 'https://doi.org/10.6084/m9.figshare.3559887.v1',
        },
      ],
    };
    render(
      <ResultView
        result={result}
        sharpEye
        answers={{ requestId: result.requestId, answers: { time: 'day' } }}
      />,
    );
    expect(screen.getByRole('button', { name: 'In daylight' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByTestId('answers-updated')).toBeInTheDocument();
    expect(screen.getByTestId('sharp-eye-note')).toHaveTextContent('your answers');
  });

  it('says nothing about a missed guess', async () => {
    render(
      <ResultView result={await mockResult('high')} guess={{ text: 'oak', result: 'miss' }} />,
    );
    expect(screen.queryByTestId('skill-notes')).not.toBeInTheDocument();
  });
});

describe('name it first', () => {
  it('compares a typed name with the result', async () => {
    const onDone = vi.fn();
    render(<NameItFirst result={await mockResult('high')} onDone={onDone} />);
    expect(screen.getByTestId('guess-submit')).toBeDisabled();
    await userEvent.type(screen.getByTestId('guess-input'), 'Red maple');
    await userEvent.click(screen.getByTestId('guess-submit'));
    expect(onDone).toHaveBeenCalledWith({ text: 'Red maple', group: undefined, result: 'exact' });
  });

  it('takes a group chip, and can be skipped', async () => {
    const onDone = vi.fn();
    render(<NameItFirst result={await mockResult('high')} onDone={onDone} />);
    await userEvent.click(screen.getByRole('button', { name: 'Plants' }));
    await userEvent.click(screen.getByTestId('guess-submit'));
    expect(onDone).toHaveBeenLastCalledWith({ text: undefined, group: 'plant', result: 'group' });
    await userEvent.click(screen.getByTestId('guess-skip'));
    expect(onDone).toHaveBeenLastCalledWith();
  });
});

describe('session: sharp eye and reveal', () => {
  it('keeps the sharp-eye mark and the guess on the session', async () => {
    const { sessionReducer } = await import('../../src/features/identification/SessionContext');
    const result = await mockResult('high');
    let state = sessionReducer(
      { ...sessionReducer(undefined as never, { type: 'reset', category: 'auto' }) },
      { type: 'result', result: { ...result, confidenceBand: 'low' } },
    );
    expect(state.sharpEye).toBeUndefined();
    state = sessionReducer(state, { type: 'result', result, sharpEye: true });
    expect(state.sharpEye).toBe(true);
    state = sessionReducer(state, { type: 'reveal', guess: { group: 'plant', result: 'group' } });
    expect(state).toMatchObject({ revealed: true, guess: { group: 'plant' } });
  });

  it('adopts a live result as the same journal entry, already revealed', async () => {
    const { sessionReducer } = await import('../../src/features/identification/SessionContext');
    const result = await mockResult('high');
    const image = { id: 'i', blob: new Blob(), url: 'blob:i', feature: 'auto' };
    const state = sessionReducer(undefined as never, {
      type: 'adopt',
      images: [image, { ...image, id: 'j', feature: 'flower' }],
      result,
      capturedAt: new Date(),
    });
    expect(state.observationId).toBe(result.requestId);
    expect(state.revealed).toBe(true);
    expect(state.images.map((i) => i.feature)).toEqual(['auto', 'flower']);
  });
});
