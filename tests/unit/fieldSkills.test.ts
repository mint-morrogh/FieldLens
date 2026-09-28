import { describe, expect, it } from 'vitest';
import type { IdentifyResponse, OrganismCandidate } from '../../shared/types';
import { isSharpEye, matchGuess, normalizeName } from '../../src/features/journal/fieldSkills';

const result = (
  over: Partial<IdentifyResponse> & { top?: Partial<OrganismCandidate> } = {},
): IdentifyResponse =>
  ({
    category: 'plant',
    confidenceBand: 'high',
    imagesSubmitted: 1,
    candidates: [
      {
        id: 'a',
        scientificName: 'Acer rubrum',
        commonName: 'Red Maple',
        commonNames: ['swamp maple'],
        genus: 'Acer',
        finalConfidence: 0.9,
        ...over.top,
      },
    ],
    ...over,
  }) as IdentifyResponse;

describe('name it first: guess matching', () => {
  it('normalizes case, accents and punctuation', () => {
    expect(normalizeName("  St. John's-Wort ")).toBe('st johns wort');
    expect(normalizeName('Épicéa')).toBe('epicea');
  });

  it('matches a common or scientific name exactly, ignoring case', () => {
    expect(matchGuess({ text: 'red maple' }, result())).toBe('exact');
    expect(matchGuess({ text: 'RED MAPLES' }, result())).toBe('exact');
    expect(matchGuess({ text: 'Swamp maple' }, result())).toBe('exact');
    expect(matchGuess({ text: 'acer rubrum' }, result())).toBe('exact');
  });

  it('counts the genus, another species in it, or the head word as close', () => {
    expect(matchGuess({ text: 'Acer' }, result())).toBe('close');
    expect(matchGuess({ text: 'Acer saccharum' }, result())).toBe('close');
    expect(matchGuess({ text: 'maple' }, result())).toBe('close');
    const goldenrod = result({
      top: {
        scientificName: 'Solidago canadensis',
        commonName: 'Canada goldenrod',
        genus: 'Solidago',
      },
      groupSummary: {
        rank: 'genus',
        name: 'Solidago',
        commonName: 'goldenrods',
        confidence: 0.8,
        memberCount: 3,
      },
    });
    expect(matchGuess({ text: 'goldenrod' }, goldenrod)).toBe('close');
  });

  it('falls back to the group, and otherwise a miss', () => {
    expect(matchGuess({ text: 'oak', group: 'plant' }, result())).toBe('group');
    expect(matchGuess({ group: 'plant' }, result())).toBe('group');
    expect(matchGuess({ group: 'bug' }, result({ category: 'insect' }))).toBe('group');
    expect(matchGuess({ text: 'oak' }, result())).toBe('miss');
    expect(matchGuess({ group: 'bird' }, result())).toBe('miss');
    expect(matchGuess({ text: 'red maple' }, result({ candidates: [] }))).toBe('miss');
  });
});

describe('sharp eye', () => {
  const low = result({ confidenceBand: 'low', imagesSubmitted: 1 });

  it('is earned when an added photo makes the same species confident', () => {
    expect(isSharpEye(low, result({ confidenceBand: 'medium', imagesSubmitted: 2 }))).toBe(true);
    expect(isSharpEye(low, result({ confidenceBand: 'high', imagesSubmitted: 2 }))).toBe(true);
  });

  it('is not earned without a new photo, a confident result, or the same species', () => {
    expect(isSharpEye(undefined, result())).toBe(false);
    expect(isSharpEye(low, result({ confidenceBand: 'high', imagesSubmitted: 1 }))).toBe(false);
    expect(isSharpEye(low, result({ confidenceBand: 'low', imagesSubmitted: 2 }))).toBe(false);
    expect(
      isSharpEye(
        result({ confidenceBand: 'medium' }),
        result({ confidenceBand: 'high', imagesSubmitted: 2 }),
      ),
    ).toBe(false);
    expect(
      isSharpEye(
        low,
        result({
          confidenceBand: 'high',
          imagesSubmitted: 2,
          top: { scientificName: 'Acer saccharum' },
        }),
      ),
    ).toBe(false);
  });
});
