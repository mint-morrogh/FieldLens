import { getCategory } from '../../shared/categories.js';
import type {
  ConfidenceBand,
  DecidingView,
  FeatureId,
  FollowUpQuestion,
  OrganismCandidate,
  OrganismCategory,
} from '../../shared/types.js';

/**
 * "Ask for the deciding angle": when the close candidates differ on something one particular
 * photo would show, name that photo. Asked only when it would actually help:
 *  - the result is uncertain (medium or low) with a real runner-up;
 *  - the candidates' recorded traits or taxonomy give different answers for that part;
 *  - that part hasn't been photographed yet (per the `features` sent with the photos).
 *
 * The differences come from sourced data only: AVONET bill measurements for birds (via the
 * follow-up bill question), and for fungi the underside type of each family (gills, pores,
 * teeth or ridges, as described in standard mycological keys) and the genus Amanita, whose
 * stem base (volva or bulb) is its key field character.
 */

/** Same thresholds as the follow-up questions: a contender has a real share of the top's score. */
const CONTENDER_SHARE = 0.35;
const MIN_CONFIDENCE = 0.05;
const MAX_CANDIDATES = 4;

type Underside = 'gills' | 'pores' | 'teeth' | 'ridges';

/**
 * What a family's fertile underside looks like. Family, not order: Boletales has gilled
 * families (Paxillaceae, Gomphidiaceae) as well as the pored boletes.
 */
const UNDERSIDE_BY_FAMILY: Record<string, Underside> = {
  // Pores
  boletaceae: 'pores',
  suillaceae: 'pores',
  gyroporaceae: 'pores',
  polyporaceae: 'pores',
  fomitopsidaceae: 'pores',
  hymenochaetaceae: 'pores',
  ganodermataceae: 'pores',
  meripilaceae: 'pores',
  fistulinaceae: 'pores',
  laetiporaceae: 'pores',
  // Teeth
  hydnaceae: 'teeth',
  bankeraceae: 'teeth',
  auriscalpiaceae: 'teeth',
  hericiaceae: 'teeth',
  // Ridges (false gills)
  cantharellaceae: 'ridges',
  gomphaceae: 'ridges',
  // Gills
  agaricaceae: 'gills',
  amanitaceae: 'gills',
  russulaceae: 'gills',
  tricholomataceae: 'gills',
  cortinariaceae: 'gills',
  psathyrellaceae: 'gills',
  strophariaceae: 'gills',
  inocybaceae: 'gills',
  hygrophoraceae: 'gills',
  marasmiaceae: 'gills',
  mycenaceae: 'gills',
  pluteaceae: 'gills',
  entolomataceae: 'gills',
  omphalotaceae: 'gills',
  physalacriaceae: 'gills',
  lyophyllaceae: 'gills',
  bolbitiaceae: 'gills',
  hymenogastraceae: 'gills',
  paxillaceae: 'gills',
  gomphidiaceae: 'gills',
  pleurotaceae: 'gills',
  hydnangiaceae: 'gills',
  tubariaceae: 'gills',
  crepidotaceae: 'gills',
};

const UNDERSIDE_WORDS: Record<Underside, string> = {
  gills: 'gills',
  pores: 'pores',
  teeth: 'teeth or spines',
  ridges: 'blunt ridges',
};

function nameOf(c: OrganismCandidate): string {
  return c.commonName ?? c.scientificName;
}

function genusOf(c: OrganismCandidate): string {
  return (c.genus ?? c.scientificName.split(' ')[0] ?? '').toLowerCase();
}

function undersideOf(c: OrganismCandidate): Underside | undefined {
  return c.family ? UNDERSIDE_BY_FAMILY[c.family.trim().toLowerCase()] : undefined;
}

/** The top candidate and the runners-up close enough to matter. */
function closeCandidates(
  candidates: OrganismCandidate[],
): { top: OrganismCandidate; contenders: OrganismCandidate[] } | undefined {
  const [top, ...rest] = candidates;
  if (!top) return undefined;
  const contenders = rest
    .slice(0, MAX_CANDIDATES - 1)
    .filter(
      (c) =>
        c.finalConfidence >= MIN_CONFIDENCE &&
        c.finalConfidence >= top.finalConfidence * CONTENDER_SHARE,
    );
  return contenders.length ? { top, contenders } : undefined;
}

function hasFeature(category: OrganismCategory, feature: FeatureId): boolean {
  return getCategory(category).features.some((f) => f.id === feature);
}

export function buildDecidingView(input: {
  category: OrganismCategory;
  band: ConfidenceBand;
  candidates: OrganismCandidate[];
  /** The part photographed in each image sent so far. */
  features: FeatureId[];
  questions?: FollowUpQuestion[];
}): DecidingView | undefined {
  if (input.band === 'high' || input.band === 'none') return undefined;
  const close = closeCandidates(input.candidates);
  if (!close) return undefined;
  const { top, contenders } = close;
  const done = new Set(input.features);
  const open = (feature: FeatureId) => !done.has(feature) && hasFeature(input.category, feature);

  if (input.category === 'fungus') {
    // The stem base first: it is what separates Amanitas, which include the deadliest species.
    const all = [top, ...contenders];
    const amanita = all.find((c) => genusOf(c) === 'amanita');
    const other = all.find((c) => genusOf(c) !== 'amanita');
    if (amanita && other && open('base')) {
      return {
        feature: 'base',
        prompt: 'Get the stem base',
        reason: `${nameOf(amanita)} is an Amanita, and ${nameOf(other)} is not. Amanitas are told apart by the base of the stem: a cup-like sac (volva) or a swollen bulb. Dig it out carefully rather than cutting the stem.`,
      };
    }
    const topSide = undersideOf(top);
    const differs = contenders.find((c) => {
      const side = undersideOf(c);
      return side && topSide && side !== topSide;
    });
    if (topSide && differs && open('underside')) {
      return {
        feature: 'underside',
        prompt: 'Show the underside of the cap',
        reason: `${nameOf(top)} has ${UNDERSIDE_WORDS[topSide]} underneath; ${nameOf(differs)} has ${UNDERSIDE_WORDS[undersideOf(differs)!]}.`,
      };
    }
    return undefined;
  }

  if (input.category === 'bird') {
    const bill = input.questions?.find((q) => q.id === 'bill');
    if (!bill || !open('head')) return undefined;
    const topShapes = bill.fits[top.id];
    const differs = contenders.find((c) => {
      const shapes = bill.fits[c.id];
      return (
        topShapes &&
        shapes &&
        (topShapes.some((s) => !shapes.includes(s)) || shapes.some((s) => !topShapes.includes(s)))
      );
    });
    if (!differs) return undefined;
    return {
      feature: 'head',
      prompt: 'Get a clear view of the head and bill',
      reason: `${nameOf(top)} and ${nameOf(differs)} have differently shaped bills.`,
      source: bill.source,
      sourceUrl: bill.sourceUrl,
    };
  }

  if (input.category === 'plant') {
    // Species in one genus: keys separate them by flower and fruit far more than by leaves.
    const sibling = contenders.find(
      (c) => genusOf(c) === genusOf(top) && c.scientificName !== top.scientificName,
    );
    if (!sibling || done.has('flower') || done.has('fruit') || !open('flower')) return undefined;
    const genus = top.genus ?? top.scientificName.split(' ')[0];
    return {
      feature: 'flower',
      prompt: 'Photograph a flower up close',
      reason: `${nameOf(top)} and ${nameOf(sibling)} are both in the genus ${genus}, whose species are mostly told apart by their flowers or fruit. A fruit photo works too.`,
    };
  }

  return undefined;
}
