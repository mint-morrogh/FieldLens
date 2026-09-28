import type { CategoryGroupId, FeatureId, IdentifyTarget, OrganismCategory } from './types.js';

export type FeatureDefinition = {
  id: FeatureId;
  label: string;
  /** Short follow-up prompt, e.g. "Add a flower photo". */
  followUpLabel: string;
  /** Advice shown when this feature would most help a low-confidence result. */
  advice: string;
};

export type CategoryDefinition = {
  id: IdentifyTarget;
  /** For groups: the specific categories they cover. */
  members?: OrganismCategory[];
  label: string;
  /** Whether an identification provider exists for this category yet. */
  available: boolean;
  /** Name of the visual identification source, shown while analyzing. */
  identificationSource?: string;
  /** Results come from a newer, less-tested provider; the UI labels them "experimental". */
  experimental?: boolean;
  /** Higher taxa that this category covers, used to keep open-ended models on target. */
  taxonScope?: Partial<Record<'kingdom' | 'phylum' | 'class' | 'order', string[]>>;
  /** Short description for the category picker, e.g. "Flowers, trees, leaves". */
  blurb: string;
  /** Plural noun used in headings such as "Other maples nearby". */
  pluralNoun: string;
  /** Category-specific features (organs/body parts). "auto" is always implied first. */
  features: FeatureDefinition[];
  /** Generic advice when confidence is low and no feature-specific hint applies. */
  generalAdvice: string;
  safetyNotice?: string;
  /** GBIF kingdom used to disambiguate name matching. */
  gbifKingdom?: string;
  /** iNaturalist iconic taxon name for filtering. */
  inaturalistIconicTaxon?: string;
};

export const AUTO_FEATURE: FeatureDefinition = {
  id: 'auto',
  label: 'Auto',
  followUpLabel: 'Add another photo',
  advice: 'Another photo from a different angle would help.',
};

/** Mammal signs. Picking one of these (even under "Not sure") identifies a mammal from its sign. */
export const TRACK_FEATURE: FeatureDefinition = {
  id: 'track',
  label: 'Tracks',
  followUpLabel: 'Add another track photo',
  advice:
    'A photo straight down on one clear print, with a hand, coin or ruler next to it for scale, would help.',
};
export const SCAT_FEATURE: FeatureDefinition = {
  id: 'scat',
  label: 'Droppings',
  followUpLabel: 'Add another droppings photo',
  advice:
    'A closer photo of the droppings with something for scale (a coin or stick, not your hand) would help.',
};

const BUG_HEAD_FEATURE: FeatureDefinition = {
  id: 'face',
  label: 'Head',
  followUpLabel: 'Add a head photo',
  advice: 'A close photo of the head, eyes and antennae would help.',
};
const WINGS_FEATURE: FeatureDefinition = {
  id: 'wing',
  label: 'Wings',
  followUpLabel: 'Add a wings photo',
  advice: 'A photo with the wings spread, showing their pattern, would help.',
};
const FINS_FEATURE: FeatureDefinition = {
  id: 'fins',
  label: 'Fins & tail',
  followUpLabel: 'Add a fins photo',
  advice: 'A photo showing the fins and tail spread out would help.',
};

const EDIBILITY_NOTICE =
  'Do not use this identification alone to decide whether an organism is safe to eat, touch, handle, or use medicinally.';
const WILDLIFE_NOTICE =
  'Observe wildlife from a respectful distance. Do not rely on this identification to judge whether an animal is dangerous.';

export const CATEGORIES: Record<OrganismCategory, CategoryDefinition> = {
  plant: {
    id: 'plant',
    blurb: 'Flowers, trees, leaves',
    label: 'Plant',
    available: true,
    identificationSource: 'Pl@ntNet',
    pluralNoun: 'plants',
    gbifKingdom: 'Plantae',
    inaturalistIconicTaxon: 'Plantae',
    safetyNotice: EDIBILITY_NOTICE,
    generalAdvice: 'A close, well-lit photo of a flower or leaf usually helps the most.',
    features: [
      {
        id: 'flower',
        label: 'Flower',
        followUpLabel: 'Add a flower photo',
        advice: 'A photo of the flower would help.',
      },
      {
        id: 'leaf',
        label: 'Leaf',
        followUpLabel: 'Add a leaf photo',
        advice: 'A clear photo of a single leaf, top side, would help.',
      },
      {
        id: 'fruit',
        label: 'Fruit',
        followUpLabel: 'Add a fruit photo',
        advice: 'A photo of the fruit or seeds would help.',
      },
      {
        id: 'bark',
        label: 'Bark',
        followUpLabel: 'Add a bark photo',
        advice: 'A photo of the bark or stem would help.',
      },
      {
        id: 'habit',
        label: 'Whole plant',
        followUpLabel: 'Add whole plant photo',
        advice: 'A photo showing the whole plant would help.',
      },
      {
        id: 'other',
        label: 'Other',
        followUpLabel: 'Add another photo',
        advice: 'Another photo from a different angle would help.',
      },
    ],
  },
  bird: {
    id: 'bird',
    blurb: 'Songbirds, raptors, waterfowl',
    label: 'Bird',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: { class: ['Aves'] },
    pluralNoun: 'birds',
    gbifKingdom: 'Animalia',
    inaturalistIconicTaxon: 'Aves',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'Try getting a clearer side view.',
    features: [
      {
        id: 'whole',
        label: 'Whole bird',
        followUpLabel: 'Add a whole-bird photo',
        advice: 'Try getting a clearer side view.',
      },
      {
        id: 'head',
        label: 'Head',
        followUpLabel: 'Add a head photo',
        advice: 'A clear view of the head and bill would help.',
      },
      {
        id: 'wing',
        label: 'Wing',
        followUpLabel: 'Add a wing photo',
        advice: 'A photo of the wing pattern would help.',
      },
      {
        id: 'feather',
        label: 'Feather',
        followUpLabel: 'Add a feather photo',
        advice: 'A photo of the feather on a plain background would help.',
      },
    ],
  },
  mammal: {
    id: 'mammal',
    blurb: 'Deer, squirrels, bats…',
    label: 'Mammal',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: { class: ['Mammalia'] },
    pluralNoun: 'mammals',
    gbifKingdom: 'Animalia',
    inaturalistIconicTaxon: 'Mammalia',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'A clear photo of the whole animal from the side would help.',
    features: [
      {
        id: 'whole',
        label: 'Whole animal',
        followUpLabel: 'Add a whole-animal photo',
        advice: 'A clear photo of the whole animal would help.',
      },
      {
        id: 'face',
        label: 'Face',
        followUpLabel: 'Add a face photo',
        advice: 'A photo of the face would help.',
      },
      TRACK_FEATURE,
      SCAT_FEATURE,
      {
        id: 'fur',
        label: 'Fur',
        followUpLabel: 'Add a fur photo',
        advice: 'A close photo of the fur pattern would help.',
      },
    ],
  },
  reptile: {
    id: 'reptile',
    blurb: 'Snakes, turtles, lizards',
    label: 'Reptile',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: { class: ['Squamata', 'Testudines', 'Crocodylia', 'Sphenodontia'] },
    pluralNoun: 'reptiles',
    gbifKingdom: 'Animalia',
    inaturalistIconicTaxon: 'Reptilia',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'A clear photo of the head and body pattern would help.',
    features: [
      {
        id: 'whole',
        label: 'Whole animal',
        followUpLabel: 'Add a whole-body photo',
        advice: 'A photo showing the whole body would help.',
      },
      {
        id: 'head',
        label: 'Head',
        followUpLabel: 'Add a head photo',
        advice: 'A close photo of the head from the side would help.',
      },
      {
        id: 'pattern',
        label: 'Markings',
        followUpLabel: 'Add a markings photo',
        advice: 'A close photo of the scales or shell pattern would help.',
      },
    ],
  },
  amphibian: {
    id: 'amphibian',
    blurb: 'Frogs, toads, salamanders',
    label: 'Amphibian',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: { class: ['Amphibia'] },
    pluralNoun: 'amphibians',
    gbifKingdom: 'Animalia',
    inaturalistIconicTaxon: 'Amphibia',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'A clear photo from above and from the side would help.',
    features: [
      {
        id: 'dorsal',
        label: 'From above',
        followUpLabel: 'Add a top-down photo',
        advice: 'A photo from directly above would help.',
      },
      {
        id: 'lateral',
        label: 'Side',
        followUpLabel: 'Add a side photo',
        advice: 'A side view showing the skin pattern would help.',
      },
    ],
  },
  fish: {
    id: 'fish',
    blurb: 'Freshwater & sea fish',
    label: 'Fish',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: {
      phylum: ['Chordata'],
      class: [
        '',
        'Actinopterygii',
        'Elasmobranchii',
        'Holocephali',
        'Chondrichthyes',
        'Petromyzonti',
        'Myxini',
        'Coelacanthi',
        'Dipneusti',
      ],
    },
    pluralNoun: 'fish',
    gbifKingdom: 'Animalia',
    inaturalistIconicTaxon: 'Actinopterygii',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'A side-on photo showing the fins would help.',
    features: [
      {
        id: 'whole',
        label: 'Whole fish',
        followUpLabel: 'Add a whole-fish photo',
        advice: 'A photo of the whole fish, nose to tail, would help.',
      },
      {
        id: 'lateral',
        label: 'Side',
        followUpLabel: 'Add a side-on photo',
        advice: 'A side-on photo showing all the fins would help.',
      },
      {
        id: 'head',
        label: 'Head',
        followUpLabel: 'Add a head photo',
        advice: 'A close photo of the head and mouth from the side would help.',
      },
      FINS_FEATURE,
      {
        id: 'pattern',
        label: 'Markings',
        followUpLabel: 'Add a markings photo',
        advice: 'A close photo of the spots, stripes or scales would help.',
      },
    ],
  },
  insect: {
    id: 'insect',
    blurb: 'Butterflies, beetles, bees',
    label: 'Insect',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: { class: ['Insecta', 'Chilopoda', 'Diplopoda', 'Collembola'] },
    pluralNoun: 'insects',
    gbifKingdom: 'Animalia',
    inaturalistIconicTaxon: 'Insecta',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'Try photographing the wings and body from above.',
    features: [
      {
        id: 'dorsal',
        label: 'From above',
        followUpLabel: 'Add a top-down photo',
        advice: 'Try photographing the wings and body from above.',
      },
      {
        id: 'lateral',
        label: 'Side',
        followUpLabel: 'Add a side photo',
        advice: 'A side view would help.',
      },
      BUG_HEAD_FEATURE,
      WINGS_FEATURE,
    ],
  },
  arachnid: {
    id: 'arachnid',
    blurb: 'Spiders, ticks, harvestmen',
    label: 'Spider',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: { class: ['Arachnida'] },
    pluralNoun: 'spiders',
    gbifKingdom: 'Animalia',
    inaturalistIconicTaxon: 'Arachnida',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'A clear photo from above showing the eye arrangement and markings would help.',
    features: [
      {
        id: 'dorsal',
        label: 'From above',
        followUpLabel: 'Add a top-down photo',
        advice: 'A photo from directly above showing the body markings would help.',
      },
      {
        id: 'face',
        label: 'Eyes / face',
        followUpLabel: 'Add a close-up of the eyes',
        advice: 'A close-up of the eyes from the front would help.',
      },
      {
        id: 'web',
        label: 'Web',
        followUpLabel: 'Add a photo of the web',
        advice: 'A photo of the web can help narrow it down.',
      },
    ],
  },
  fungus: {
    id: 'fungus',
    blurb: 'Mushrooms, brackets, lichens',
    label: 'Fungus',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: { kingdom: ['Fungi'] },
    pluralNoun: 'fungi',
    gbifKingdom: 'Fungi',
    inaturalistIconicTaxon: 'Fungi',
    safetyNotice: EDIBILITY_NOTICE,
    generalAdvice:
      'Photos of the cap, the gills or pores underneath, and the stem base would help.',
    features: [
      {
        id: 'cap',
        label: 'Cap',
        followUpLabel: 'Add a cap photo',
        advice: 'A photo of the top of the cap would help.',
      },
      {
        id: 'underside',
        label: 'Gills / pores',
        followUpLabel: 'Add an underside photo',
        advice: 'A photo of the gills or pores underneath would help.',
      },
      {
        id: 'stem',
        label: 'Stem',
        followUpLabel: 'Add a stem photo',
        advice: 'A photo of the full stem including its base would help.',
      },
      {
        id: 'base',
        label: 'Stem base',
        followUpLabel: 'Add a stem-base photo',
        advice:
          'Carefully dig out and photograph the very base of the stem — a cup-like sac (volva) is a key sign of deadly Amanitas.',
      },
    ],
  },
  other: {
    id: 'other',
    blurb: 'Anything else alive',
    label: 'Other',
    available: false,
    pluralNoun: 'organisms',
    generalAdvice: 'A closer, well-lit photo would help.',
    features: [],
  },
};

/**
 * Broader picker choices, because people often don't know whether a newt is a
 * reptile or an amphibian, or that a tick isn't an insect. The server narrows a
 * group to the specific category and the result says what it found.
 */
export const GROUPS: Record<CategoryGroupId, CategoryDefinition> = {
  // Trees are plants to Pl@ntNet; choosing Tree just offers tree-specific parts.
  tree: {
    id: 'tree',
    label: 'Tree',
    blurb: 'Trees & shrubs',
    available: true,
    identificationSource: 'Pl@ntNet',
    members: ['plant'],
    pluralNoun: 'trees',
    gbifKingdom: 'Plantae',
    inaturalistIconicTaxon: 'Plantae',
    safetyNotice: EDIBILITY_NOTICE,
    generalAdvice:
      'A close photo of a leaf or a few needles, plus one of the bark, usually helps the most.',
    features: [
      {
        id: 'leaf',
        label: 'Leaves or needles',
        followUpLabel: 'Add a leaf or needles photo',
        advice: 'A close photo of a single leaf, or a few needles on the twig, would help.',
      },
      {
        id: 'bark',
        label: 'Bark',
        followUpLabel: 'Add a bark photo',
        advice: 'A close photo of the bark at chest height would help.',
      },
      {
        id: 'fruit',
        label: 'Cones, nuts & fruit',
        followUpLabel: 'Add a cone or fruit photo',
        advice: 'A photo of a cone, nut, seed or fruit would help.',
      },
      {
        id: 'flower',
        label: 'Flowers & catkins',
        followUpLabel: 'Add a flower photo',
        advice: 'A photo of the flowers or catkins would help.',
      },
      {
        id: 'twig',
        label: 'Twigs & buds',
        followUpLabel: 'Add a twig photo',
        advice: 'A close photo of a twig with its buds would help, especially in winter.',
      },
      {
        id: 'habit',
        label: 'Whole tree',
        followUpLabel: 'Add a whole-tree photo',
        advice: 'A photo of the whole tree, showing its shape, would help.',
      },
    ],
  },
  bug: {
    id: 'bug',
    label: 'Bug',
    blurb: 'Insects, spiders, ticks & more',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    members: ['insect', 'arachnid'],
    taxonScope: { class: ['Insecta', 'Chilopoda', 'Diplopoda', 'Collembola', 'Arachnida'] },
    pluralNoun: 'bugs',
    gbifKingdom: 'Animalia',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'A clear photo from above showing the body and markings would help.',
    features: [
      {
        id: 'dorsal',
        label: 'From above',
        followUpLabel: 'Add a top-down photo',
        advice: 'Try photographing the body and markings from above.',
      },
      {
        id: 'lateral',
        label: 'Side',
        followUpLabel: 'Add a side photo',
        advice: 'A side view would help.',
      },
      BUG_HEAD_FEATURE,
      WINGS_FEATURE,
      {
        id: 'web',
        label: 'Web',
        followUpLabel: 'Add a web photo',
        advice: 'A photo of the web would help.',
      },
    ],
  },
  herp: {
    id: 'herp',
    label: 'Reptile & amphibian',
    blurb: 'Snakes, turtles, frogs, salamanders',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    members: ['reptile', 'amphibian'],
    taxonScope: { class: ['Squamata', 'Testudines', 'Crocodylia', 'Sphenodontia', 'Amphibia'] },
    pluralNoun: 'reptiles and amphibians',
    gbifKingdom: 'Animalia',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice:
      'A clear photo of the head and the body pattern, from the side or above, would help.',
    features: [
      {
        id: 'whole',
        label: 'Whole animal',
        followUpLabel: 'Add a whole-body photo',
        advice: 'A photo showing the whole body would help.',
      },
      {
        id: 'head',
        label: 'Head',
        followUpLabel: 'Add a head photo',
        advice: 'A close photo of the head from the side would help.',
      },
      {
        id: 'pattern',
        label: 'Markings',
        followUpLabel: 'Add a markings photo',
        advice: 'A close photo of the skin, scales or shell pattern would help.',
      },
    ],
  },
  animal: {
    id: 'animal',
    label: 'Animal',
    blurb: 'Mammals, reptiles, frogs, fish',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    members: ['mammal', 'reptile', 'amphibian', 'fish'],
    taxonScope: {
      phylum: ['Chordata'],
      class: [
        'Mammalia',
        ...['Squamata', 'Testudines', 'Crocodylia', 'Sphenodontia'],
        'Amphibia',
        ...[
          '',
          'Actinopterygii',
          'Elasmobranchii',
          'Holocephali',
          'Chondrichthyes',
          'Petromyzonti',
          'Myxini',
          'Coelacanthi',
          'Dipneusti',
        ],
      ],
    },
    pluralNoun: 'animals',
    gbifKingdom: 'Animalia',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'A clear photo of the whole animal from the side would help.',
    features: [TRACK_FEATURE, SCAT_FEATURE],
  },
  auto: {
    id: 'auto',
    label: 'Not sure',
    blurb: 'FieldLens works it out',
    available: true,
    identificationSource: 'Pl@ntNet or BioCLIP 2',
    members: [
      'plant',
      'fungus',
      'insect',
      'arachnid',
      'bird',
      'mammal',
      'reptile',
      'amphibian',
      'fish',
    ],
    pluralNoun: 'organisms',
    generalAdvice: 'A closer, well-lit photo of just the organism would help.',
    features: [],
  },
};

/** Choices offered in the picker, in display order. */
/**
 * Choices offered in the picker, in display order. Specific animal groups narrow what the
 * model chooses from; wrong picks are caught by the category check, which suggests the
 * right group. Bug (insects/spiders) and Reptile & amphibian stay combined because people
 * often can't tell those apart. With nothing picked, the app detects the group ("auto"). The broader "animal" group is still
 * supported by the server but not offered here.
 */
export const CATEGORY_PICKER_ORDER: IdentifyTarget[] = [
  'plant',
  'tree',
  'fungus',
  'bug',
  'bird',
  'mammal',
  'herp',
  'fish',
];

export const DEFAULT_CATEGORY: IdentifyTarget = 'plant';

export function isOrganismCategory(value: unknown): value is OrganismCategory {
  return typeof value === 'string' && value in CATEGORIES;
}

export function getCategory(id: OrganismCategory): CategoryDefinition {
  return CATEGORIES[id];
}

export function isCategoryGroup(value: unknown): value is CategoryGroupId {
  return typeof value === 'string' && value in GROUPS;
}

export function isIdentifyTarget(value: unknown): value is IdentifyTarget {
  return isOrganismCategory(value) || isCategoryGroup(value);
}

/** Definition for a specific category or a group. */
export function getTarget(id: IdentifyTarget): CategoryDefinition {
  return isCategoryGroup(id) ? GROUPS[id] : CATEGORIES[id];
}

/** Specific categories a target covers (a category covers itself). */
export function targetMembers(id: IdentifyTarget): OrganismCategory[] {
  return isCategoryGroup(id) ? (GROUPS[id].members ?? []) : [id];
}

export function getFeature(
  category: IdentifyTarget,
  feature: FeatureId | undefined,
): FeatureDefinition {
  if (!feature || feature === 'auto') return AUTO_FEATURE;
  return getTarget(category).features.find((f) => f.id === feature) ?? AUTO_FEATURE;
}

export function isValidFeature(category: IdentifyTarget, feature: string): boolean {
  return feature === 'auto' || getTarget(category).features.some((f) => f.id === feature);
}
