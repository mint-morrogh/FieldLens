import type { FeatureId, OrganismCategory } from './types.js';

export type FeatureDefinition = {
  id: FeatureId;
  label: string;
  /** Short follow-up prompt, e.g. "Add a flower photo". */
  followUpLabel: string;
  /** Advice shown when this feature would most help a low-confidence result. */
  advice: string;
};

export type CategoryDefinition = {
  id: OrganismCategory;
  label: string;
  /** Whether an identification provider exists for this category yet. */
  available: boolean;
  /** Name of the visual identification source, shown while analyzing. */
  identificationSource?: string;
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

const EDIBILITY_NOTICE =
  'Do not use this identification alone to decide whether an organism is safe to eat, touch, handle, or use medicinally.';
const WILDLIFE_NOTICE =
  'Observe wildlife from a respectful distance. Do not rely on this identification to judge whether an animal is dangerous.';

export const CATEGORIES: Record<OrganismCategory, CategoryDefinition> = {
  plant: {
    id: 'plant',
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
    label: 'Bird',
    available: false,
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
    label: 'Mammal',
    available: false,
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
      {
        id: 'track',
        label: 'Track',
        followUpLabel: 'Add a track photo',
        advice: 'A photo of the track with something for scale would help.',
      },
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
    label: 'Reptile',
    available: false,
    pluralNoun: 'reptiles',
    gbifKingdom: 'Animalia',
    inaturalistIconicTaxon: 'Reptilia',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'A clear photo of the head and body pattern would help.',
    features: [],
  },
  amphibian: {
    id: 'amphibian',
    label: 'Amphibian',
    available: false,
    pluralNoun: 'amphibians',
    gbifKingdom: 'Animalia',
    inaturalistIconicTaxon: 'Amphibia',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'A clear photo from above and from the side would help.',
    features: [],
  },
  fish: {
    id: 'fish',
    label: 'Fish',
    available: false,
    pluralNoun: 'fish',
    gbifKingdom: 'Animalia',
    inaturalistIconicTaxon: 'Actinopterygii',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'A side-on photo showing the fins would help.',
    features: [],
  },
  insect: {
    id: 'insect',
    label: 'Insect',
    available: false,
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
    ],
  },
  arachnid: {
    id: 'arachnid',
    label: 'Spider',
    available: false,
    pluralNoun: 'spiders',
    gbifKingdom: 'Animalia',
    inaturalistIconicTaxon: 'Arachnida',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'A clear photo from above showing the eye arrangement and markings would help.',
    features: [],
  },
  fungus: {
    id: 'fungus',
    label: 'Fungus',
    available: false,
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
    ],
  },
  other: {
    id: 'other',
    label: 'Other',
    available: false,
    pluralNoun: 'organisms',
    generalAdvice: 'A closer, well-lit photo would help.',
    features: [],
  },
};

/** Categories offered in the picker, in display order. */
export const CATEGORY_PICKER_ORDER: OrganismCategory[] = [
  'plant',
  'bird',
  'insect',
  'fungus',
  'mammal',
  'other',
];

export const DEFAULT_CATEGORY: OrganismCategory = 'plant';

export function isOrganismCategory(value: unknown): value is OrganismCategory {
  return typeof value === 'string' && value in CATEGORIES;
}

export function getCategory(id: OrganismCategory): CategoryDefinition {
  return CATEGORIES[id];
}

export function getFeature(
  category: OrganismCategory,
  feature: FeatureId | undefined,
): FeatureDefinition {
  if (!feature || feature === 'auto') return AUTO_FEATURE;
  return CATEGORIES[category].features.find((f) => f.id === feature) ?? AUTO_FEATURE;
}

export function isValidFeature(category: OrganismCategory, feature: string): boolean {
  return feature === 'auto' || CATEGORIES[category].features.some((f) => f.id === feature);
}
