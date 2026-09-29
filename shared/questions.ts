import { CONFIDENCE_BANDS } from './config.js';
import { confidenceBand } from './confidence.js';
import type {
  ConfidenceBand,
  FollowUpQuestion,
  IdentifyResponse,
  OrganismCandidate,
  OrganismCategory,
} from './types.js';

export const NOT_SURE = 'unsure';
/** A candidate that contradicts an answer keeps this share of its confidence. */
export const MISFIT_FACTOR = 0.3;
/**
 * The highest band answers alone can lift a result to. 'high' stays for photo evidence:
 * answers are coarse (a size bin, a time of day, a bill shape) and only compared with the
 * listed candidates, and 'high' is what unlocks things like "safe to eat" notes.
 */
export const ANSWERS_MAX_BAND: ConfidenceBand = 'medium';
/** Categories whose confidence answers never raise: mushrooms stay on photo evidence alone. */
const NO_RAISE_CATEGORIES: ReadonlySet<OrganismCategory> = new Set(['fungus']);

export type Answers = Partial<Record<FollowUpQuestion['id'], string>>;

/** True when the candidate's recorded traits contradict one of the answers. */
export function contradicts(
  candidate: OrganismCandidate,
  questions: FollowUpQuestion[],
  answers: Answers,
): boolean {
  return questions.some((q) => {
    const answer = answers[q.id];
    const fits = q.fits[candidate.id];
    // No answer, "not sure", or no recorded trait for this candidate: no evidence either way.
    return !!answer && answer !== NOT_SURE && !!fits && !fits.includes(answer);
  });
}

/** Highest confidence answers may lift the top match to: just under the 'high' threshold. */
const MAX_ANSWERED_CONFIDENCE = CONFIDENCE_BANDS.high - 0.01;

/** Whether this result's confidence may be raised by answers at all. */
function mayRaise(result: IdentifyResponse): boolean {
  return (
    !NO_RAISE_CATEGORIES.has(result.category) &&
    // Tracks and droppings are capped low on purpose; a less-tested provider isn't calibrated.
    !result.sign &&
    !result.experimental
  );
}

export type Rescored = {
  result: IdentifyResponse;
  /** The top match's confidence went up because answers ruled rivals down. */
  raised: boolean;
};

/**
 * Re-score a result on the device using the person's answers.
 *
 * Candidates that contradict an answer keep MISFIT_FACTOR of their confidence. When the top
 * match fits every answer, the confidences are then renormalised (Bayes with likelihood 1
 * for fitting candidates and MISFIT_FACTOR for contradicted ones): the total mass is
 * max(1, sum of confidences), the unlisted rest counting as "something else", so the mass
 * taken from ruled-down rivals is shared out and the top match's share rises. Every
 * candidate is scaled by the same factor, so the order among fitting ones never changes.
 *
 * Caps: never above ANSWERS_MAX_BAND (just under the 'high' threshold), never for
 * mushrooms, animal signs or experimental results, never lower than before, and no raise
 * at all when the top match itself contradicts an answer (then it's only down-weighted and
 * a rival may take the lead, banded on its own confidence).
 */
export function rescoreWithAnswers(result: IdentifyResponse, answers: Answers): Rescored {
  const questions = result.questions ?? [];
  if (!questions.length || !Object.values(answers).some((a) => a && a !== NOT_SURE))
    return { result, raised: false };
  const original = result.candidates[0];
  const misfit = result.candidates.map((c) => contradicts(c, questions, answers));
  const weighted = result.candidates.map((c, i) =>
    misfit[i] ? { ...c, finalConfidence: c.finalConfidence * MISFIT_FACTOR } : c,
  );
  let scale = 1;
  if (original && !misfit[0] && mayRaise(result) && original.finalConfidence > 0) {
    const before = result.candidates.reduce((n, c) => n + c.finalConfidence, 0);
    const after = weighted.reduce((n, c) => n + c.finalConfidence, 0);
    const mass = Math.max(1, before);
    const removed = before - after;
    const renormalised = (original.finalConfidence * mass) / (mass - removed);
    const cap = Math.max(original.finalConfidence, MAX_ANSWERED_CONFIDENCE);
    scale = Math.min(renormalised, cap) / original.finalConfidence;
  }
  const candidates = weighted
    .map((c) => (scale > 1 ? { ...c, finalConfidence: c.finalConfidence * scale } : c))
    .sort((a, b) => b.finalConfidence - a.finalConfidence);
  const topChanged = candidates[0]?.id !== original?.id;
  const band = candidates[0] ? confidenceBand(candidates[0].finalConfidence) : 'none';
  return {
    result: {
      ...result,
      candidates,
      confidenceBand: band,
      groupSummary: topChanged ? undefined : result.groupSummary,
      // Facts, photos and the map describe the original top match; don't show them for another.
      speciesInfo: topChanged ? undefined : result.speciesInfo,
    },
    raised: scale > 1,
  };
}

/** Re-rank (and, when the top match fits, re-score) a result using the person's answers. */
export function applyAnswers(result: IdentifyResponse, answers: Answers): IdentifyResponse {
  return rescoreWithAnswers(result, answers).result;
}

/**
 * Sharp eye from answers: they took the same top match from low or no confidence to a
 * confident band (medium; answers never reach high on their own).
 */
export function answersEarnSharpEye(original: IdentifyResponse, answered: IdentifyResponse) {
  const was = original.candidates[0];
  const now = answered.candidates[0];
  return (
    !!was &&
    !!now &&
    was.id === now.id &&
    (original.confidenceBand === 'low' || original.confidenceBand === 'none') &&
    (answered.confidenceBand === 'medium' || answered.confidenceBand === 'high')
  );
}
