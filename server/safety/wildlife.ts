/**
 * Hand-curated wildlife safety notes for mammals, mostly North American.
 *
 * Rules for editing this file:
 * - Each note must be supported by the linked page (checked 2026-09-27).
 * - Warnings only: never say an animal is harmless or safe to approach or handle.
 * - Match at the broadest rank the note is true for (order, family, genus or species).
 */
import type {
  ConfidenceBand,
  OrganismCandidate,
  SafetyInfo,
  SafetyStatement,
} from '../../shared/types.js';

type Rank = 'order' | 'family' | 'genus' | 'species';

export type WildlifeNote = {
  rank: Rank;
  /** Lower-case taxon name at `rank`. */
  taxon: string;
  commonName: string;
  note: string;
  /** Only relevant to droppings (e.g. raccoon roundworm, hantavirus). */
  sign?: 'scat';
  source: string;
  sourceUrl: string;
};

const CDC_RABIES = {
  source: 'CDC — About Rabies',
  sourceUrl: 'https://www.cdc.gov/rabies/about/index.html',
};
const NPS_YELLOWSTONE = {
  source: 'US National Park Service — Yellowstone safety',
  sourceUrl: 'https://www.nps.gov/yell/planyourvisit/safety.htm',
};
const wiki = (title: string) => ({
  source: 'Wikipedia',
  sourceUrl: `https://en.wikipedia.org/wiki/${title}`,
});

export const WILDLIFE_NOTES: WildlifeNote[] = [
  {
    rank: 'order',
    taxon: 'chiroptera',
    commonName: 'bats',
    note: 'Bats are among the animals most often found with rabies, and bat contact is the leading cause of human rabies deaths in the US. Never handle a bat; if you may have been bitten or scratched, seek medical attention urgently.',
    ...CDC_RABIES,
  },
  {
    rank: 'genus',
    taxon: 'procyon',
    commonName: 'raccoons',
    note: 'Raccoons are among the animals most often found with rabies. Don’t approach or feed them; if you may have been bitten or scratched, seek medical attention urgently.',
    ...CDC_RABIES,
  },
  {
    rank: 'genus',
    taxon: 'procyon',
    commonName: 'raccoons',
    sign: 'scat',
    note: 'Raccoon droppings can carry roundworm eggs that infect people who swallow them by mistake. Don’t touch raccoon droppings or latrines with bare hands, and wash your hands after being outdoors.',
    source: 'CDC — About Baylisascaris',
    sourceUrl: 'https://www.cdc.gov/baylisascaris/about/index.html',
  },
  {
    rank: 'family',
    taxon: 'mephitidae',
    commonName: 'skunks',
    note: 'Skunks are among the animals most often found with rabies. Keep your distance; if you may have been bitten or scratched, seek medical attention urgently.',
    ...CDC_RABIES,
  },
  {
    rank: 'family',
    taxon: 'mephitidae',
    commonName: 'skunks',
    note: 'Skunks can spray their musk several metres; in the eyes it causes a burning sensation.',
    ...wiki('Striped_skunk'),
  },
  {
    rank: 'genus',
    taxon: 'vulpes',
    commonName: 'foxes',
    note: 'Foxes are among the animals most often found with rabies. Don’t approach or feed them; if you may have been bitten or scratched, seek medical attention urgently.',
    ...CDC_RABIES,
  },
  {
    rank: 'genus',
    taxon: 'urocyon',
    commonName: 'grey foxes',
    note: 'Foxes are among the animals most often found with rabies. Don’t approach or feed them; if you may have been bitten or scratched, seek medical attention urgently.',
    ...CDC_RABIES,
  },
  {
    rank: 'family',
    taxon: 'ursidae',
    commonName: 'bears',
    note: 'Keep your distance from bears, always leave them an escape route, and never get between a mother and her cubs. Never let a bear get your food. Bear spray is used to stop an aggressive or charging bear.',
    source: 'US National Park Service — Bear safety',
    sourceUrl: 'https://www.nps.gov/subjects/bears/safety.htm',
  },
  {
    rank: 'genus',
    taxon: 'alces',
    commonName: 'moose',
    note: 'Moose injure more people than any other wild mammal. Cows attack people who come close to their calves, bulls can be aggressive in the autumn rut, and moose may charge when startled or near dogs. Raised hackles usually mean a charge is coming.',
    ...wiki('Moose'),
  },
  {
    rank: 'genus',
    taxon: 'bison',
    commonName: 'bison',
    note: 'Bison have injured more people in Yellowstone than any other animal and run three times faster than people. The park asks visitors to stay at least 25 yards (23 m) away and never approach one for a photo.',
    ...NPS_YELLOWSTONE,
  },
  {
    rank: 'species',
    taxon: 'cervus canadensis',
    commonName: 'elk',
    note: 'Yellowstone asks visitors to stay at least 25 yards (23 m) from elk at all times and never approach one for a photo.',
    ...NPS_YELLOWSTONE,
  },
  {
    rank: 'species',
    taxon: 'canis lupus',
    commonName: 'wolves',
    note: 'Yellowstone asks visitors to stay at least 100 yards (91 m) from wolves at all times and never approach one for a photo.',
    ...NPS_YELLOWSTONE,
  },
  {
    rank: 'species',
    taxon: 'puma concolor',
    commonName: 'cougars',
    note: 'Yellowstone asks visitors to stay at least 100 yards (91 m) from cougars at all times and never approach one for a photo.',
    ...NPS_YELLOWSTONE,
  },
  {
    rank: 'species',
    taxon: 'canis latrans',
    commonName: 'coyotes',
    note: 'Never feed coyotes; it gets them used to people. Never run away from a coyote. Keep small dogs on a leash and don’t leave them outside unattended.',
    source: 'Humane World for Animals — What to do about coyotes',
    sourceUrl: 'https://www.humaneworld.org/resources/what-do-about-coyotes',
  },
  {
    rank: 'genus',
    taxon: 'erethizon',
    commonName: 'porcupines',
    note: 'Porcupines often injure dogs that inspect or attack them; the quills can stay embedded. Keep dogs away.',
    ...wiki('North_American_porcupine'),
  },
  {
    rank: 'family',
    taxon: 'cervidae',
    commonName: 'deer',
    note: 'Deer are a source of blood for blacklegged ticks, which can spread Lyme disease. Deer don’t carry the bacteria themselves, but check for ticks after walking where deer live — prompt tick removal can prevent infection.',
    source: 'CDC — Lyme disease: causes',
    sourceUrl: 'https://www.cdc.gov/lyme/causes/index.html',
  },
  ...(['muridae', 'cricetidae'] as const).map((family): WildlifeNote => ({
    rank: 'family',
    taxon: family,
    commonName: 'mice & rats',
    sign: 'scat',
    note: 'Don’t sweep or vacuum rodent droppings — it can put viruses such as hantavirus into the air. Spray them with bleach solution or disinfectant until very wet and let it soak for 5 minutes first.',
    source: 'CDC — Cleaning up after rodents',
    sourceUrl: 'https://www.cdc.gov/healthy-pets/rodent-control/clean-up.html',
  })),
];

/** Shown for every droppings photo. */
export const SIGN_HYGIENE: WildlifeNote = {
  rank: 'order',
  taxon: '*',
  commonName: 'animal droppings',
  sign: 'scat',
  note: 'Don’t touch animal droppings with bare hands, and wash your hands after being outdoors.',
  source: 'CDC — About Baylisascaris',
  sourceUrl: 'https://www.cdc.gov/baylisascaris/about/index.html',
};

function candidateRank(c: OrganismCandidate, rank: Rank): string | undefined {
  const value =
    rank === 'order'
      ? c.order
      : rank === 'family'
        ? c.family
        : rank === 'genus'
          ? (c.genus ?? c.scientificName.split(/\s+/)[0])
          : c.scientificName.split(/\s+/).slice(0, 2).join(' ');
  return value?.trim().toLowerCase();
}

export function findWildlifeNotes(c: OrganismCandidate, feature?: string): WildlifeNote[] {
  return WILDLIFE_NOTES.filter(
    (n) => candidateRank(c, n.rank) === n.taxon && (!n.sign || feature === 'scat'),
  );
}

/**
 * Safety notes for animals: warnings about the top candidate and, when the
 * identification is uncertain, about other likely candidates. Never says an
 * animal is harmless.
 */
export function buildWildlifeSafety(input: {
  band: ConfidenceBand;
  candidates: OrganismCandidate[];
  /** The part photographed ("scat", "track", …) when known. */
  feature?: string;
}): SafetyInfo | undefined {
  const [top, ...rest] = input.candidates;
  if (!top) return undefined;
  const toStatement = (n: WildlifeNote, subject?: string): SafetyStatement => ({
    kind: 'caution',
    text: n.note,
    subject,
    basis: n.rank === 'species' ? 'species' : undefined,
    severity: 'caution',
    source: n.source,
    sourceUrl: n.sourceUrl,
  });
  const statements: SafetyStatement[] = findWildlifeNotes(top, input.feature).map((n) =>
    toStatement(n),
  );
  const seen = new Set(statements.map((s) => s.text));
  const others = input.band === 'high' ? [] : rest.slice(0, 2);
  for (const c of others) {
    const name = c.commonName ? `${c.commonName} (${c.scientificName})` : c.scientificName;
    for (const n of findWildlifeNotes(c, input.feature)) {
      if (seen.has(n.note)) continue;
      seen.add(n.note);
      statements.push(toStatement(n, name));
    }
  }
  if (input.feature === 'scat') statements.push(toStatement(SIGN_HYGIENE));
  if (!statements.length) return undefined;
  return { statements, level: 'caution', kind: 'wildlife' };
}
