import { confidenceBand } from './confidence.js';
import type { FollowUpQuestion, IdentifyResponse, OrganismCandidate } from './types.js';

export const NOT_SURE = 'unsure';
/** A candidate that contradicts an answer keeps this share of its confidence. */
export const MISFIT_FACTOR = 0.3;

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

/**
 * Re-rank a result using the person's answers. Candidates that contradict an answer are
 * down-weighted; nothing is ever boosted above its own evidence.
 */
export function applyAnswers(result: IdentifyResponse, answers: Answers): IdentifyResponse {
  const questions = result.questions ?? [];
  if (!questions.length || !Object.values(answers).some((a) => a && a !== NOT_SURE)) return result;
  const candidates = result.candidates
    .map((c) =>
      contradicts(c, questions, answers)
        ? { ...c, finalConfidence: c.finalConfidence * MISFIT_FACTOR }
        : c,
    )
    .sort((a, b) => b.finalConfidence - a.finalConfidence);
  const topChanged = candidates[0]?.id !== result.candidates[0]?.id;
  return {
    ...result,
    candidates,
    confidenceBand: candidates[0] ? confidenceBand(candidates[0].finalConfidence) : 'none',
    groupSummary: topChanged ? undefined : result.groupSummary,
    // Facts, photos and the map describe the original top match; don't show them for another.
    speciesInfo: topChanged ? undefined : result.speciesInfo,
  };
}
