import type { ConfidenceBand, FollowUpQuestion, OrganismCandidate } from '../../shared/types.js';
import { BIRD_TRAITS } from './birdTraits.js';
import { ELTONTRAITS_SOURCE, ELTONTRAITS_URL } from './mammalFacts.js';
import { MAMMAL_TRAITS } from './mammalTraits.js';

/**
 * Follow-up questions built only from sourced traits (EltonTraits body mass and activity).
 * A question is asked only when the likely candidates' recorded traits give different
 * answers, so answering it can actually separate them.
 */

type SizeBin = { id: string; label: string; max: number };

const MAMMAL_SIZES: SizeBin[] = [
  { id: 'xs', label: 'Mouse-sized or smaller', max: 100 },
  { id: 's', label: 'Squirrel to rabbit-sized', max: 2_500 },
  { id: 'm', label: 'Cat to coyote-sized', max: 25_000 },
  { id: 'l', label: 'Deer-sized', max: 150_000 },
  { id: 'xl', label: 'Moose or bear-sized', max: Infinity },
];
const BIRD_SIZES: SizeBin[] = [
  { id: 'xs', label: 'Sparrow-sized or smaller', max: 35 },
  { id: 's', label: 'Robin to jay-sized', max: 160 },
  { id: 'm', label: 'Pigeon to crow-sized', max: 700 },
  { id: 'l', label: 'Duck-sized or bigger', max: Infinity },
];
/** Adult size varies, so a candidate fits every bin within this factor of its typical mass. */
const MASS_SPREAD = 1.6;

const TIME_OPTIONS = [
  { id: 'day', label: 'In daylight' },
  { id: 'twilight', label: 'At dawn or dusk' },
  { id: 'night', label: 'At night' },
];

/** A runner-up counts as a real contender when it has at least this share of the top's score. */
const CONTENDER_SHARE = 0.35;
const MIN_CONFIDENCE = 0.05;
const MAX_CANDIDATES = 4;

type Traits = { mass?: number; activity?: string[] };

function traitsFor(c: OrganismCandidate): Traits | undefined {
  const key = c.scientificName.trim().toLowerCase();
  if (c.category === 'mammal') {
    const t = MAMMAL_TRAITS[key];
    if (!t) return undefined;
    const a = t.a ?? '';
    const activity = [
      a.includes('D') && 'day',
      a.includes('C') && 'twilight',
      a.includes('N') && 'night',
    ].filter(Boolean) as string[];
    return { mass: t.m, activity: activity.length ? activity : undefined };
  }
  if (c.category === 'bird') {
    const t = BIRD_TRAITS[key];
    if (!t) return undefined;
    // Diurnal birds are also about at dawn and dusk.
    return { mass: t.m, activity: t.n ? ['twilight', 'night'] : ['day', 'twilight'] };
  }
  return undefined;
}

function sizeBins(mass: number, bins: SizeBin[]): string[] {
  const lo = mass / MASS_SPREAD;
  const hi = mass * MASS_SPREAD;
  let min = 0;
  return bins
    .filter((b) => {
      const overlaps = lo < b.max && hi >= min;
      min = b.max;
      return overlaps;
    })
    .map((b) => b.id);
}

/**
 * Worth asking only if some answer fits the top match but not a close contender, or the
 * other way round: i.e. the answer would clearly settle it one way.
 */
function separatesTop(fits: Record<string, string[]>, topId: string, contenders: string[]) {
  const top = fits[topId];
  if (!top) return false;
  return contenders.some((id) => {
    const other = fits[id];
    return !!other && (top.some((o) => !other.includes(o)) || other.some((o) => !top.includes(o)));
  });
}

export function buildQuestions(
  band: ConfidenceBand,
  candidates: OrganismCandidate[],
): FollowUpQuestion[] {
  if (band === 'high' || band === 'none') return [];
  const likely = candidates
    .filter((c) => c.finalConfidence >= MIN_CONFIDENCE)
    .slice(0, MAX_CANDIDATES)
    .map((c) => ({ c, t: traitsFor(c) }))
    .filter((x): x is { c: OrganismCandidate; t: Traits } => !!x.t);
  // The top candidate must be one we know something about, with a close runner-up.
  if (likely.length < 2 || likely[0].c.id !== candidates[0]?.id) return [];
  const topId = likely[0].c.id;
  const contenders = likely
    .slice(1)
    .filter((x) => x.c.finalConfidence >= likely[0].c.finalConfidence * CONTENDER_SHARE)
    .map((x) => x.c.id);
  if (contenders.length === 0) return [];
  const bins = likely[0].c.category === 'bird' ? BIRD_SIZES : MAMMAL_SIZES;
  const source = { source: ELTONTRAITS_SOURCE, sourceUrl: ELTONTRAITS_URL };
  const questions: FollowUpQuestion[] = [];

  const sizeFits = Object.fromEntries(
    likely.filter((x) => x.t.mass).map((x) => [x.c.id, sizeBins(x.t.mass!, bins)]),
  );
  if (separatesTop(sizeFits, topId, contenders)) {
    questions.push({
      id: 'size',
      prompt: 'About how big was it?',
      options: bins.map(({ id, label }) => ({ id, label })),
      fits: sizeFits,
      ...source,
    });
  }
  const timeFits = Object.fromEntries(
    likely.filter((x) => x.t.activity).map((x) => [x.c.id, x.t.activity!]),
  );
  if (separatesTop(timeFits, topId, contenders)) {
    questions.push({
      id: 'time',
      prompt: 'When did you see it?',
      options: TIME_OPTIONS,
      fits: timeFits,
      ...source,
    });
  }
  return questions;
}
