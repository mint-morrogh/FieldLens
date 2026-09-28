import type { IdentifyResponse } from '../../../shared/types';
import { groupOf, type JournalGroup } from './journal';

/**
 * Small field skills the journal rewards: naming a find before the result is shown
 * ("Name it first") and turning an uncertain identification into a confident one with a
 * better photo ("Sharp eye"). Pure functions, computed on the device.
 */

export type GuessResult = 'exact' | 'close' | 'group' | 'miss';

export type Guess = {
  /** A typed name, common or scientific. */
  text?: string;
  /** A quick group chip. */
  group?: JournalGroup;
  result: GuessResult;
};

/** Lower case, no accents or punctuation, single spaces: "St. John's-wort" → "st johns wort". */
export function normalizeName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’.]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Close enough to count as the same word: equal, or one is the other plus a plural "s"/"es". */
function sameWord(a: string, b: string): boolean {
  return a === b || a === `${b}s` || b === `${a}s` || a === `${b}es` || b === `${a}es`;
}

/**
 * How a guess compares with the result's top match. A typed name matches a common name or
 * the scientific name ("exact"); the genus, the genus's common name, or the head word of the
 * common name ("maple" for red maple) is "close"; the right group is "group". Case and
 * accents don't matter.
 */
export function matchGuess(
  guess: { text?: string; group?: JournalGroup },
  result: IdentifyResponse,
): GuessResult {
  const top = result.candidates[0];
  if (!top) return 'miss';
  const text = guess.text ? normalizeName(guess.text) : '';
  if (text) {
    const sci = normalizeName(top.scientificName);
    const binomial = sci.split(' ').slice(0, 2).join(' ');
    const commons = [
      top.commonName,
      ...(top.commonNames ?? []),
      ...(result.speciesInfo?.commonNames ?? []),
    ]
      .filter((n): n is string => !!n)
      .map(normalizeName);
    if (text === sci || text === binomial || commons.some((c) => sameWord(c, text))) {
      return 'exact';
    }
    const genus = normalizeName(top.genus ?? top.scientificName.split(' ')[0] ?? '');
    const groupCommon = result.groupSummary?.commonName
      ? normalizeName(result.groupSummary.commonName)
      : undefined;
    const heads = commons.map((c) => c.split(' ').at(-1)!).filter(Boolean);
    if (
      (genus && (text === genus || text.split(' ')[0] === genus)) ||
      (groupCommon && sameWord(groupCommon, text)) ||
      heads.some((h) => sameWord(h, text))
    ) {
      return 'close';
    }
  }
  if (guess.group && guess.group === groupOf(result.category)) return 'group';
  return 'miss';
}

/** A guess that named it (exactly, or to the genus). */
export function isCorrectGuess(guess?: Guess): boolean {
  return guess?.result === 'exact' || guess?.result === 'close';
}

const CONFIDENT = new Set(['medium', 'high']);

/**
 * Sharp eye: an added photo turned an uncertain identification (low or no confidence) into
 * a fairly confident one (medium or high), with the same top species as before.
 */
export function isSharpEye(before: IdentifyResponse | undefined, after: IdentifyResponse): boolean {
  if (!before) return false;
  const was = before.candidates[0];
  const now = after.candidates[0];
  if (!was || !now) return false;
  return (
    (before.confidenceBand === 'low' || before.confidenceBand === 'none') &&
    CONFIDENT.has(after.confidenceBand) &&
    after.imagesSubmitted > before.imagesSubmitted &&
    was.scientificName.toLowerCase() === now.scientificName.toLowerCase()
  );
}
