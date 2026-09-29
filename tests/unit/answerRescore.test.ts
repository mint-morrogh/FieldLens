import { describe, expect, it } from 'vitest';
import { CONFIDENCE_BANDS } from '../../shared/config';
import { NOT_SURE, answersEarnSharpEye, rescoreWithAnswers } from '../../shared/questions';
import type { FollowUpQuestion, IdentifyResponse, OrganismCandidate } from '../../shared/types';
import { toRecord, withAnswers } from '../../src/features/history/historyStore';
import { isConfirmed, rankFor, speciesEntries } from '../../src/features/journal/journal';

const cand = (id: string, finalConfidence: number): OrganismCandidate =>
  ({
    id,
    scientificName: `Genus ${id}`,
    commonName: id,
    category: 'mammal',
    finalConfidence,
    taxonKeys: {},
  }) as unknown as OrganismCandidate;

const size: FollowUpQuestion = {
  id: 'size',
  prompt: 'About how big was it?',
  options: [
    { id: 's', label: 'Small' },
    { id: 'm', label: 'Medium' },
    { id: 'l', label: 'Large' },
  ],
  fits: { fox: ['m'], chip: ['s'], moose: ['l'], wolf: ['m', 'l'] },
  source: 'EltonTraits',
  sourceUrl: 'https://example.org',
};

function result(candidates: OrganismCandidate[], over: Partial<IdentifyResponse> = {}) {
  return {
    requestId: 'r1',
    category: 'mammal',
    imagesSubmitted: 1,
    location: { used: false },
    confidenceBand: candidates[0].finalConfidence >= 0.55 ? 'medium' : 'low',
    candidates,
    questions: [size],
    speciesInfo: { scientificName: 'Genus fox' },
    ...over,
  } as unknown as IdentifyResponse;
}

describe('re-scoring from follow-up answers', () => {
  const low = result([cand('fox', 0.45), cand('chip', 0.35), cand('moose', 0.1)]);

  it('renormalises: ruling rivals down raises the top match and its band', () => {
    const { result: r, raised } = rescoreWithAnswers(low, { size: 'm' });
    expect(raised).toBe(true);
    // Mass 1; chip and moose keep 30%: 0.45 / (1 - 0.315).
    expect(r.candidates[0].id).toBe('fox');
    expect(r.candidates[0].finalConfidence).toBeCloseTo(0.45 / 0.685, 5);
    expect(r.confidenceBand).toBe('medium');
    // Same factor for everyone: the order among the rest is unchanged, facts kept.
    expect(r.candidates.map((c) => c.id)).toEqual(['fox', 'chip', 'moose']);
    expect(r.speciesInfo).toBe(low.speciesInfo);
    expect(answersEarnSharpEye(low, r)).toBe(true);
  });

  it('never reaches high on answers alone', () => {
    const close = result([cand('fox', 0.6), cand('chip', 0.4)]);
    const { result: r } = rescoreWithAnswers(close, { size: 'm' });
    expect(r.candidates[0].finalConfidence).toBeLessThan(CONFIDENCE_BANDS.high);
    expect(r.confidenceBand).toBe('medium');
    // Confidences summing above 1 are treated as a whole of their own sum, still capped.
    const heavy = result([cand('fox', 0.6), cand('chip', 0.5), cand('moose', 0.4)]);
    expect(rescoreWithAnswers(heavy, { size: 'm' }).result.confidenceBand).toBe('medium');
  });

  it("doesn't raise when the top match itself contradicts an answer", () => {
    const { result: r, raised } = rescoreWithAnswers(low, { size: 's' });
    expect(raised).toBe(false);
    expect(r.candidates[0].id).toBe('chip');
    expect(r.candidates[0].finalConfidence).toBe(0.35);
    expect(r.confidenceBand).toBe('low');
    expect(r.speciesInfo).toBeUndefined();
    expect(answersEarnSharpEye(low, r)).toBe(false);
  });

  it('changes nothing for "Not sure" or an answer that fits every candidate', () => {
    expect(rescoreWithAnswers(low, { size: NOT_SURE })).toEqual({ result: low, raised: false });
    const both = result([cand('fox', 0.45), cand('wolf', 0.35)]);
    const { result: r, raised } = rescoreWithAnswers(both, { size: 'm' });
    expect(raised).toBe(false);
    expect(r.candidates[0].finalConfidence).toBe(0.45);
  });

  it('never raises mushrooms, animal signs or experimental results', () => {
    for (const over of [
      { category: 'fungus' },
      { sign: 'track' },
      { experimental: true },
    ] as Partial<IdentifyResponse>[]) {
      const { result: r, raised } = rescoreWithAnswers({ ...low, ...over }, { size: 'm' });
      expect(raised).toBe(false);
      expect(r.candidates[0].finalConfidence).toBe(0.45);
      expect(r.confidenceBand).toBe('low');
      // Rivals are still ruled down.
      expect(r.candidates[1].finalConfidence).toBeCloseTo(0.35 * 0.3, 5);
    }
  });
});

describe('saved observations with answers', () => {
  const low = result([cand('fox', 0.45), cand('chip', 0.35), cand('moose', 0.1)]);
  const saved = toRecord('o1', low, undefined, new Date('2026-09-20T12:00:00Z'));

  it('counts the re-scored band in the journal and keeps the server result', () => {
    expect(isConfirmed(saved)).toBe(false);
    const answered = withAnswers({
      ...saved,
      answers: { requestId: 'r1', answers: { size: 'm' } },
    });
    expect(answered.top?.band).toBe('medium');
    expect(answered.top?.finalConfidence).toBeCloseTo(0.657, 3);
    expect(answered.result).toBe(saved.result);
    expect(answered.result.confidenceBand).toBe('low');
    expect(answered.sharpEye).toBe(true);
    expect(isConfirmed(answered)).toBe(true);
    const base = rankFor(speciesEntries([{ ...saved, top: { ...saved.top!, band: 'medium' } }]));
    expect(rankFor(speciesEntries([answered])).points).toBeGreaterThan(base.points);
  });

  it('takes the mark back when the answers change, and drops answers for an older result', () => {
    const unsure = withAnswers({
      ...saved,
      sharpEye: true,
      answers: { requestId: 'r1', answers: { size: NOT_SURE } },
    });
    expect(unsure.top?.band).toBe('low');
    expect(unsure.sharpEye).toBeUndefined();
    const stale = withAnswers({ ...saved, answers: { requestId: 'old', answers: { size: 'm' } } });
    expect(stale.answers).toBeUndefined();
    expect(stale.top?.band).toBe('low');
  });

  it('keeps a photo-earned mark on a confident result', () => {
    const medium = toRecord('o2', result([cand('fox', 0.6), cand('chip', 0.3)]), undefined);
    const r = withAnswers({
      ...medium,
      sharpEye: true,
      answers: { requestId: 'r1', answers: { size: 'm' } },
    });
    expect(r.sharpEye).toBe(true);
    expect(r.top?.band).toBe('medium');
  });
});
