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
  taxonScope?: TaxonScope;
  /**
   * Narrow picks ("Beetle") fall back to this broader target when the photo doesn't look
   * like the pick, so a wrong guess costs a little accuracy instead of a wrong answer.
   */
  widenTo?: IdentifyTarget;
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

export type TaxonRank = 'kingdom' | 'phylum' | 'class' | 'order' | 'family' | 'genus';
/**
 * Taxa a pick covers, in BioCLIP's Tree of Life labels. Within one filter every rank must
 * match; a list matches any of its filters. "" matches taxa with no value at that rank
 * (most ray-finned fish and all reptiles have no order or class there).
 */
export type TaxonFilter = Partial<Record<TaxonRank, string[]>>;
export type TaxonScope = TaxonFilter | TaxonFilter[];

/** Whether a taxon's ranks fall inside a scope (the same rule the Space applies). */
export function taxonInScope(
  taxon: Partial<Record<TaxonRank, string | undefined>>,
  scope: TaxonScope,
): boolean {
  const filters = Array.isArray(scope) ? scope : [scope];
  return filters.some((f) =>
    Object.entries(f).every(([rank, values]) => {
      const v = (taxon[rank as TaxonRank] ?? '').trim().toLowerCase();
      return (values ?? []).some((w) => w.trim().toLowerCase() === v);
    }),
  );
}

/** Concatenate scopes into one "any of" scope. */
function anyOf(...scopes: TaxonScope[]): TaxonFilter[] {
  return scopes.flatMap((s) => (Array.isArray(s) ? s : [s]));
}

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

/** BioCLIP label scopes reused by categories and picks. */
export const FISH_CLASSES = [
  'Actinopterygii',
  'Elasmobranchii',
  'Holocephali',
  'Chondrichthyes',
  'Petromyzonti',
  'Myxini',
  'Coelacanthi',
  'Dipneusti',
];
// Most ray-finned fish have no class in the Tree of Life labels, hence "".
const FISH_SCOPE: TaxonFilter = { phylum: ['Chordata'], class: ['', ...FISH_CLASSES] };
export const REPTILE_CLASSES = ['Squamata', 'Testudines', 'Crocodylia', 'Sphenodontia'];
/** Snake families in BioCLIP's labels (reptiles have no order there, so snakes go by family). */
export const SNAKE_FAMILIES = [
  'Acrochordidae',
  'Aniliidae',
  'Anomalepididae',
  'Anomochilidae',
  'Atractaspididae',
  'Boidae',
  'Bolyeriidae',
  'Colubridae',
  'Cyclocoridae',
  'Cylindrophiidae',
  'Elapidae',
  'Gerrhopilidae',
  'Homalopsidae',
  'Lamprophiidae',
  'Leptotyphlopidae',
  'Loxocemidae',
  'Pareidae',
  'Prosymnidae',
  'Psammophiidae',
  'Pseudaspididae',
  'Pseudoxyrhophiidae',
  'Pythonidae',
  'Tropidophiidae',
  'Typhlopidae',
  'Uropeltidae',
  'Viperidae',
  'Xenodermidae',
  'Xenopeltidae',
  'Xenophidiidae',
];
/** Legless lizards and worm lizards: people call them snakes, so the Snake pick includes them. */
const SNAKELIKE_LIZARD_FAMILIES = [
  'Anguidae',
  'Pygopodidae',
  'Dibamidae',
  'Amphisbaenidae',
  'Bipedidae',
  'Blanidae',
  'Cadeidae',
  'Rhineuridae',
  'Trogonophidae',
];
export const LIZARD_FAMILIES = [
  'Agamidae',
  'Alopoglossidae',
  'Anguidae',
  'Carphodactylidae',
  'Chamaeleonidae',
  'Cordylidae',
  'Corytophanidae',
  'Crotaphytidae',
  'Dactyloidae',
  'Diplodactylidae',
  'Diploglossidae',
  'Eublepharidae',
  'Gekkonidae',
  'Gerrhosauridae',
  'Gymnophthalmidae',
  'Helodermatidae',
  'Hoplocercidae',
  'Iguanidae',
  'Lacertidae',
  'Lanthanotidae',
  'Leiocephalidae',
  'Leiosauridae',
  'Liolaemidae',
  'Opluridae',
  'Phrynosomatidae',
  'Phyllodactylidae',
  'Polychrotidae',
  'Pygopodidae',
  'Scincidae',
  'Shinisauridae',
  'Sphaerodactylidae',
  'Teiidae',
  'Tropiduridae',
  'Varanidae',
  'Xantusiidae',
  'Xenosauridae',
];
/** Orders made up mostly of lichens (checked against BioCLIP's labels, 2026-10-02). */
export const LICHEN_ORDERS = [
  'Lecanorales',
  'Peltigerales',
  'Teloschistales',
  'Caliciales',
  'Pertusariales',
  'Umbilicariales',
  'Verrucariales',
  'Arthoniales',
  'Lichinales',
  'Baeomycetales',
  'Acarosporales',
  'Candelariales',
  'Lecideales',
  'Rhizocarpales',
  'Graphidales',
  'Gyalectales',
  'Ostropales',
  'Pyrenulales',
  'Trypetheliales',
];
export const BUG_CLASSES = ['Insecta', 'Chilopoda', 'Diplopoda', 'Collembola'];
/** Crabs, shrimp, lobsters, crayfish, woodlice (Malacostraca), barnacles, fairy shrimp, plus horseshoe crabs. */
export const CRUSTACEAN_CLASSES = ['Malacostraca', 'Maxillopoda', 'Branchiopoda', 'Merostomata'];
export const SEAWEED_CLASSES = ['Phaeophyceae', 'Florideophyceae', 'Bangiophyceae', 'Ulvophyceae'];
export const MOSS_PHYLA = ['Bryophyta', 'Marchantiophyta', 'Anthocerotophyta'];
export const WORM_PHYLA = ['Annelida', 'Nemertea', 'Platyhelminthes'];
export const CNIDARIAN_PHYLA = ['Cnidaria', 'Ctenophora'];
export const SPONGE_PHYLA = ['Porifera', 'Bryozoa'];
export const SEA_SQUIRT_CLASSES = ['Ascidiacea', 'Thaliacea'];
const SPONGE_SCOPE = anyOf(
  { phylum: SPONGE_PHYLA },
  { phylum: ['Chordata'], class: SEA_SQUIRT_CLASSES },
);
const ISOPODS: TaxonFilter = { class: ['Malacostraca'], order: ['Isopoda'] };

const SHELLFISH_NOTICE =
  'Never eat wild shellfish based on an app. Shellfish can hold toxins from algae that cooking doesn’t remove; check local shellfish advisories.';

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
    taxonScope: { class: REPTILE_CLASSES },
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
    taxonScope: FISH_SCOPE,
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
    taxonScope: { class: BUG_CLASSES },
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
  moss: {
    id: 'moss',
    blurb: 'Mosses, liverworts, hornworts',
    label: 'Moss',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: { kingdom: ['Plantae'], phylum: MOSS_PHYLA },
    pluralNoun: 'mosses',
    gbifKingdom: 'Plantae',
    inaturalistIconicTaxon: 'Plantae',
    generalAdvice: 'A sharp close-up of a few stems, and any spore capsules, would help.',
    features: [
      {
        id: 'habit',
        label: 'Whole clump',
        followUpLabel: 'Add a whole-clump photo',
        advice: 'A photo of the whole clump or mat would help.',
      },
      {
        id: 'closeup',
        label: 'Close-up',
        followUpLabel: 'Add a close-up',
        advice: 'A sharp close-up of a few stems and their tiny leaves would help.',
      },
      {
        id: 'capsule',
        label: 'Spore capsules',
        followUpLabel: 'Add a capsule photo',
        advice: 'A photo of the spore capsules on their stalks would help.',
      },
    ],
  },
  seaweed: {
    id: 'seaweed',
    blurb: 'Kelp, rockweed, sea lettuce',
    label: 'Seaweed',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: { class: SEAWEED_CLASSES },
    pluralNoun: 'seaweeds',
    // Brown seaweeds are Chromista and red/green ones Plantae, so GBIF matching uses each
    // candidate's own kingdom.
    safetyNotice: EDIBILITY_NOTICE,
    generalAdvice: 'A photo of the whole seaweed laid flat, and a close-up of a blade, would help.',
    features: [
      {
        id: 'habit',
        label: 'Whole seaweed',
        followUpLabel: 'Add a whole-seaweed photo',
        advice: 'A photo of the whole seaweed, spread out flat, would help.',
      },
      {
        id: 'closeup',
        label: 'Blade & bladders',
        followUpLabel: 'Add a close-up',
        advice: 'A close-up of a blade, its edge and any air bladders would help.',
      },
      {
        id: 'base',
        label: 'Holdfast',
        followUpLabel: 'Add a holdfast photo',
        advice: 'A photo of the root-like holdfast at the base would help.',
      },
    ],
  },
  crustacean: {
    id: 'crustacean',
    blurb: 'Crabs, shrimp, lobsters, barnacles',
    label: 'Crustacean',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: { class: CRUSTACEAN_CLASSES },
    pluralNoun: 'crustaceans',
    gbifKingdom: 'Animalia',
    safetyNotice: SHELLFISH_NOTICE,
    generalAdvice: 'A clear photo from above showing the shell and claws would help.',
    features: [
      {
        id: 'dorsal',
        label: 'From above',
        followUpLabel: 'Add a top-down photo',
        advice: 'A photo from directly above showing the whole shell would help.',
      },
      {
        id: 'ventral',
        label: 'Underside',
        followUpLabel: 'Add an underside photo',
        advice: 'A photo of the underside would help.',
      },
      {
        id: 'claws',
        label: 'Claws & legs',
        followUpLabel: 'Add a claws photo',
        advice: 'A close photo of the claws and legs would help.',
      },
    ],
  },
  mollusc: {
    id: 'mollusc',
    blurb: 'Snails, slugs, clams, octopus',
    label: 'Mollusc',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: { phylum: ['Mollusca'] },
    pluralNoun: 'molluscs',
    gbifKingdom: 'Animalia',
    inaturalistIconicTaxon: 'Mollusca',
    safetyNotice: SHELLFISH_NOTICE,
    generalAdvice: 'Photos of the shell from above and of its opening would help.',
    features: [
      {
        id: 'shell',
        label: 'Shell',
        followUpLabel: 'Add a shell photo',
        advice: 'A photo of the whole shell from above would help.',
      },
      {
        id: 'underside',
        label: 'Shell opening',
        followUpLabel: 'Add a photo of the opening',
        advice: 'A photo of the shell’s opening or inside would help.',
      },
      {
        id: 'whole',
        label: 'Whole animal',
        followUpLabel: 'Add a whole-animal photo',
        advice: 'A photo of the animal moving, with its body out, would help.',
      },
    ],
  },
  echinoderm: {
    id: 'echinoderm',
    blurb: 'Sea stars, urchins, sand dollars',
    label: 'Echinoderm',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: { phylum: ['Echinodermata'] },
    pluralNoun: 'sea stars and urchins',
    gbifKingdom: 'Animalia',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'A photo from directly above, and one of the underside, would help.',
    features: [
      {
        id: 'dorsal',
        label: 'From above',
        followUpLabel: 'Add a top-down photo',
        advice: 'A photo from directly above would help.',
      },
      {
        id: 'ventral',
        label: 'Underside',
        followUpLabel: 'Add an underside photo',
        advice: 'A photo of the underside would help.',
      },
    ],
  },
  cnidarian: {
    id: 'cnidarian',
    blurb: 'Jellyfish, anemones, corals',
    label: 'Jellyfish & coral',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: { phylum: CNIDARIAN_PHYLA },
    pluralNoun: 'jellyfish, anemones and corals',
    gbifKingdom: 'Animalia',
    safetyNotice:
      'Don’t touch jellyfish, even dead ones on the beach: many can still sting. Do not rely on this identification to judge whether one is dangerous.',
    generalAdvice:
      'A clear photo of the whole animal, and a close-up of the tentacles, would help.',
    features: [
      {
        id: 'whole',
        label: 'Whole animal',
        followUpLabel: 'Add a whole-animal photo',
        advice: 'A photo of the whole animal would help.',
      },
      {
        id: 'closeup',
        label: 'Close-up',
        followUpLabel: 'Add a close-up',
        advice: 'A close-up of the tentacles, polyps or pattern would help.',
      },
    ],
  },
  worm: {
    id: 'worm',
    blurb: 'Earthworms, leeches, sea worms',
    label: 'Worm',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: { phylum: WORM_PHYLA },
    pluralNoun: 'worms',
    gbifKingdom: 'Animalia',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'A sharp photo of the whole worm, and a close-up of its head end, would help.',
    features: [
      {
        id: 'whole',
        label: 'Whole worm',
        followUpLabel: 'Add a whole-worm photo',
        advice: 'A photo of the whole worm, stretched out, would help.',
      },
      {
        id: 'head',
        label: 'Head end',
        followUpLabel: 'Add a head photo',
        advice: 'A close-up of the head end would help.',
      },
    ],
  },
  sponge: {
    id: 'sponge',
    blurb: 'Sponges, sea squirts, moss animals',
    label: 'Sponge & sea squirt',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    taxonScope: SPONGE_SCOPE,
    pluralNoun: 'sponges and sea squirts',
    gbifKingdom: 'Animalia',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice: 'A photo of the whole colony, and a close-up of its surface, would help.',
    features: [
      {
        id: 'whole',
        label: 'Whole',
        followUpLabel: 'Add a whole photo',
        advice: 'A photo of the whole sponge or colony would help.',
      },
      {
        id: 'closeup',
        label: 'Surface',
        followUpLabel: 'Add a close-up',
        advice: 'A close-up of the surface and its openings would help.',
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

type NarrowPickId = Exclude<CategoryGroupId, 'tree' | 'bug' | 'herp' | 'shore' | 'animal' | 'auto'>;

/** A narrower pick built on a category: same parts, advice and sources, smaller scope. */
function narrow(
  base: OrganismCategory,
  def: Pick<CategoryDefinition, 'label' | 'blurb' | 'pluralNoun' | 'taxonScope' | 'widenTo'> &
    Partial<CategoryDefinition> & { id: NarrowPickId },
): CategoryDefinition {
  return { ...CATEGORIES[base], members: [base], ...def };
}

const LICHEN_FEATURES: FeatureDefinition[] = [
  {
    id: 'habit',
    label: 'Whole patch',
    followUpLabel: 'Add a whole-patch photo',
    advice: 'A photo of the whole patch, with the rock or bark around it, would help.',
  },
  {
    id: 'closeup',
    label: 'Close-up',
    followUpLabel: 'Add a close-up',
    advice: 'A sharp close-up of the edges and any cups or discs would help.',
  },
];
const OCTOPUS_FEATURES: FeatureDefinition[] = [
  {
    id: 'whole',
    label: 'Whole animal',
    followUpLabel: 'Add a whole-animal photo',
    advice: 'A photo of the whole animal, arms included, would help.',
  },
  {
    id: 'pattern',
    label: 'Skin & markings',
    followUpLabel: 'Add a markings photo',
    advice: 'A close photo of the skin pattern would help.',
  },
];

const insects = (order: string[]): TaxonFilter => ({ class: ['Insecta'], order });

/**
 * Narrower picks, named the way people (not biologists) name things. Each searches a
 * smaller part of the tree, and some also take obvious look-alikes from elsewhere
 * (legless lizards under Snake, skinks under Salamander, roly-polies with the
 * centipedes). The result always names the true group.
 */
function narrowPicks(): Record<NarrowPickId, CategoryDefinition> {
  return {
    lichen: narrow('fungus', {
      id: 'lichen',
      label: 'Lichen',
      blurb: 'Crusty, leafy or bushy patches on rock and bark',
      pluralNoun: 'lichens',
      taxonScope: { kingdom: ['Fungi'], order: LICHEN_ORDERS },
      widenTo: 'fungus',
      generalAdvice: 'A sharp close-up of the edges and any cups or discs would help.',
      features: LICHEN_FEATURES,
    }),
    butterfly: narrow('insect', {
      id: 'butterfly',
      label: 'Butterfly & moth',
      blurb: 'Caterpillars too',
      pluralNoun: 'butterflies and moths',
      taxonScope: insects(['Lepidoptera']),
      widenTo: 'bug',
    }),
    beetle: narrow('insect', {
      id: 'beetle',
      label: 'Beetle',
      blurb: 'Ladybugs, fireflies, weevils',
      pluralNoun: 'beetles',
      taxonScope: insects(['Coleoptera']),
      widenTo: 'bug',
    }),
    bee: narrow('insect', {
      id: 'bee',
      label: 'Bee, wasp & ant',
      blurb: 'Hornets, bumblebees, sawflies',
      pluralNoun: 'bees, wasps and ants',
      taxonScope: insects(['Hymenoptera']),
      widenTo: 'bug',
    }),
    fly: narrow('insect', {
      id: 'fly',
      label: 'Fly & mosquito',
      blurb: 'Hoverflies, gnats, crane flies',
      pluralNoun: 'flies',
      taxonScope: insects(['Diptera']),
      widenTo: 'bug',
    }),
    dragonfly: narrow('insect', {
      id: 'dragonfly',
      label: 'Dragonfly',
      blurb: 'Damselflies and nymphs too',
      pluralNoun: 'dragonflies and damselflies',
      taxonScope: insects(['Odonata']),
      widenTo: 'bug',
    }),
    grasshopper: narrow('insect', {
      id: 'grasshopper',
      label: 'Grasshopper & cricket',
      blurb: 'Katydids, mantises, stick insects',
      pluralNoun: 'grasshoppers and crickets',
      taxonScope: insects(['Orthoptera', 'Mantodea', 'Phasmida']),
      widenTo: 'bug',
    }),
    truebug: narrow('insect', {
      id: 'truebug',
      label: 'Stink bug & cicada',
      blurb: 'Aphids, leafhoppers, water striders',
      pluralNoun: 'true bugs',
      taxonScope: insects(['Hemiptera']),
      widenTo: 'bug',
    }),
    crawly: narrow('insect', {
      id: 'crawly',
      label: 'Centipede & roly-poly',
      blurb: 'Millipedes, pill bugs, woodlice',
      pluralNoun: 'centipedes, millipedes and woodlice',
      members: ['insect', 'crustacean'],
      taxonScope: anyOf({ class: ['Chilopoda', 'Diplopoda'] }, ISOPODS),
      widenTo: 'bug',
      features: CATEGORIES.insect.features.slice(0, 2),
    }),
    snake: narrow('reptile', {
      id: 'snake',
      label: 'Snake',
      blurb: 'Legless lizards too',
      pluralNoun: 'snakes',
      members: ['reptile', 'amphibian'],
      taxonScope: anyOf(
        { class: ['Squamata'], family: [...SNAKE_FAMILIES, ...SNAKELIKE_LIZARD_FAMILIES] },
        { class: ['Amphibia'], order: ['Gymnophiona'] },
      ),
      widenTo: 'herp',
    }),
    lizard: narrow('reptile', {
      id: 'lizard',
      label: 'Lizard & alligator',
      blurb: 'Geckos, skinks, iguanas, crocodiles',
      pluralNoun: 'lizards',
      members: ['reptile', 'amphibian'],
      taxonScope: anyOf(
        { class: ['Squamata'], family: LIZARD_FAMILIES },
        { class: ['Crocodylia', 'Sphenodontia'] },
        { class: ['Amphibia'], order: ['Caudata'] },
      ),
      widenTo: 'herp',
    }),
    turtle: narrow('reptile', {
      id: 'turtle',
      label: 'Turtle & tortoise',
      blurb: 'Terrapins, sea turtles',
      pluralNoun: 'turtles',
      taxonScope: { class: ['Testudines'] },
      widenTo: 'herp',
    }),
    frog: narrow('amphibian', {
      id: 'frog',
      label: 'Frog & toad',
      blurb: 'Tadpoles too',
      pluralNoun: 'frogs and toads',
      taxonScope: { class: ['Amphibia'], order: ['Anura'] },
      widenTo: 'herp',
    }),
    salamander: narrow('amphibian', {
      id: 'salamander',
      label: 'Salamander & newt',
      blurb: 'Mudpuppies, axolotls, efts',
      pluralNoun: 'salamanders and newts',
      members: ['amphibian', 'reptile'],
      taxonScope: anyOf(
        { class: ['Amphibia'], order: ['Caudata', 'Gymnophiona'] },
        { class: ['Squamata'], family: ['Scincidae'] },
      ),
      widenTo: 'herp',
    }),
    snail: narrow('mollusc', {
      id: 'snail',
      label: 'Snail & slug',
      blurb: 'Sea snails, limpets, nudibranchs',
      pluralNoun: 'snails and slugs',
      taxonScope: { phylum: ['Mollusca'], class: ['Gastropoda'] },
      widenTo: 'mollusc',
    }),
    clam: narrow('mollusc', {
      id: 'clam',
      label: 'Clam, mussel & oyster',
      blurb: 'Scallops, cockles, chitons, empty shells',
      pluralNoun: 'clams and mussels',
      taxonScope: {
        phylum: ['Mollusca'],
        class: ['Bivalvia', 'Polyplacophora', 'Scaphopoda'],
      },
      widenTo: 'mollusc',
    }),
    octopus: narrow('mollusc', {
      id: 'octopus',
      label: 'Octopus & squid',
      blurb: 'Cuttlefish, nautilus',
      pluralNoun: 'octopus and squid',
      taxonScope: { phylum: ['Mollusca'], class: ['Cephalopoda'] },
      widenTo: 'mollusc',
      generalAdvice: 'A photo of the whole animal, arms included, would help.',
      features: OCTOPUS_FEATURES,
    }),
  };
}

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
    // People call woodlice, earthworms and garden slugs bugs too.
    members: ['insect', 'arachnid', 'crustacean', 'worm', 'mollusc'],
    taxonScope: anyOf(
      { class: [...BUG_CLASSES, 'Arachnida'] },
      ISOPODS,
      { phylum: ['Annelida'], class: ['Clitellata'] },
      { class: ['Gastropoda'], order: ['Stylommatophora'] },
    ),
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
    taxonScope: { class: [...REPTILE_CLASSES, 'Amphibia'] },
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
  ...narrowPicks(),
  shore: {
    id: 'shore',
    label: 'Beach & water',
    blurb: 'Anything from the shore, tide pools or water',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    members: [
      'fish',
      'crustacean',
      'mollusc',
      'echinoderm',
      'cnidarian',
      'sponge',
      'seaweed',
      'worm',
    ],
    taxonScope: anyOf(
      FISH_SCOPE,
      { class: CRUSTACEAN_CLASSES },
      { phylum: ['Mollusca'] },
      { phylum: ['Echinodermata'] },
      { phylum: CNIDARIAN_PHYLA },
      SPONGE_SCOPE,
      { class: SEAWEED_CLASSES },
      { phylum: ['Annelida'], class: ['Polychaeta'] },
    ),
    pluralNoun: 'beach and water life',
    safetyNotice: WILDLIFE_NOTICE,
    generalAdvice:
      'A clear, close photo of just the one thing, out of the water if it’s safe, would help.',
    features: [],
  },
  animal: {
    id: 'animal',
    label: 'Animal',
    blurb: 'Birds, mammals, reptiles, frogs, fish',
    available: true,
    experimental: true,
    identificationSource: 'BioCLIP 2',
    members: ['mammal', 'bird', 'reptile', 'amphibian', 'fish'],
    taxonScope: anyOf({ class: ['Mammalia', 'Aves', ...REPTILE_CLASSES, 'Amphibia'] }, FISH_SCOPE),
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
      'moss',
      'seaweed',
      'crustacean',
      'mollusc',
      'echinoderm',
      'cnidarian',
      'worm',
      'sponge',
    ],
    pluralNoun: 'organisms',
    generalAdvice: 'A closer, well-lit photo of just the organism would help.',
    features: [],
  },
};

export type PickerItem = {
  id: IdentifyTarget;
  /** Defaults to the target's label and blurb. */
  label?: string;
  blurb?: string;
  /** Everyday words people might search for ("roly-poly", "starfish"). */
  keywords?: string[];
};
export type PickerSection = {
  id: string;
  title: string;
  /** A pick for the whole section, for when you know roughly but not exactly. */
  all?: PickerItem;
  items: PickerItem[];
};

/**
 * The "What is it?" sheet, in display order. Names are what a 10-year-old would pick,
 * not taxonomy; a few things appear twice where people look in two places (seaweed).
 * Picking narrows what the model searches; wrong picks widen or get a suggestion.
 */
export const PICKER_SECTIONS: PickerSection[] = [
  {
    id: 'plants',
    title: 'Plants & fungi',
    items: [
      {
        id: 'plant',
        label: 'Flower & plant',
        blurb: 'Wildflowers, weeds, ferns, shrubs',
        keywords: [
          'flower',
          'weed',
          'grass',
          'fern',
          'shrub',
          'bush',
          'vine',
          'cactus',
          'herb',
          'berry',
          'leaf',
          'succulent',
        ],
      },
      {
        id: 'tree',
        keywords: [
          'oak',
          'maple',
          'pine',
          'spruce',
          'birch',
          'palm',
          'willow',
          'cedar',
          'bark',
          'cone',
        ],
      },
      {
        id: 'fungus',
        label: 'Mushroom',
        blurb: 'Toadstools, brackets, puffballs',
        keywords: [
          'fungus',
          'fungi',
          'toadstool',
          'puffball',
          'bracket',
          'mold',
          'mould',
          'shelf',
          'morel',
        ],
      },
      { id: 'lichen', keywords: ['crust', 'rock', 'old man’s beard', 'reindeer'] },
      { id: 'moss', keywords: ['liverwort', 'hornwort', 'sphagnum', 'peat'] },
      { id: 'seaweed', keywords: ['kelp', 'rockweed', 'wrack', 'algae', 'sea lettuce', 'bladder'] },
    ],
  },
  {
    id: 'bugs',
    title: 'Bugs & creepy-crawlies',
    all: {
      id: 'bug',
      label: 'Any bug',
      blurb: 'Not sure what kind',
      keywords: [
        'insect',
        'cockroach',
        'termite',
        'earwig',
        'silverfish',
        'springtail',
        'flea',
        'louse',
        'lice',
        'mayfly',
        'lacewing',
      ],
    },
    items: [
      { id: 'butterfly', keywords: ['caterpillar', 'moth', 'chrysalis', 'cocoon', 'monarch'] },
      {
        id: 'beetle',
        keywords: ['ladybug', 'ladybird', 'firefly', 'weevil', 'june bug', 'lightning bug'],
      },
      { id: 'bee', keywords: ['wasp', 'hornet', 'ant', 'yellowjacket', 'bumblebee', 'sawfly'] },
      { id: 'fly', keywords: ['mosquito', 'gnat', 'hoverfly', 'crane fly', 'midge', 'horsefly'] },
      { id: 'dragonfly', keywords: ['damselfly', 'darner', 'skimmer'] },
      {
        id: 'grasshopper',
        keywords: ['cricket', 'katydid', 'mantis', 'praying mantis', 'stick insect', 'locust'],
      },
      {
        id: 'truebug',
        keywords: [
          'stink bug',
          'cicada',
          'aphid',
          'leafhopper',
          'water strider',
          'shield bug',
          'assassin bug',
        ],
      },
      {
        id: 'arachnid',
        label: 'Spider & tick',
        blurb: 'Scorpions, mites, daddy longlegs',
        keywords: ['spider', 'tick', 'scorpion', 'mite', 'harvestman', 'daddy longlegs', 'web'],
      },
      {
        id: 'crawly',
        keywords: [
          'centipede',
          'millipede',
          'roly-poly',
          'roly poly',
          'pill bug',
          'woodlouse',
          'sow bug',
        ],
      },
      {
        id: 'worm',
        label: 'Worm & leech',
        keywords: ['earthworm', 'leech', 'flatworm', 'bristle worm', 'nightcrawler'],
      },
    ],
  },
  {
    id: 'animals',
    title: 'Animals',
    all: { id: 'animal', label: 'Any animal', blurb: 'Birds, mammals, reptiles, frogs' },
    items: [
      {
        id: 'bird',
        keywords: [
          'duck',
          'owl',
          'hawk',
          'eagle',
          'gull',
          'seagull',
          'robin',
          'sparrow',
          'crow',
          'pigeon',
          'heron',
          'hummingbird',
          'woodpecker',
          'goose',
          'feather',
          'nest',
        ],
      },
      {
        id: 'mammal',
        blurb: 'Or their tracks and droppings',
        keywords: [
          'deer',
          'squirrel',
          'bat',
          'fox',
          'raccoon',
          'rabbit',
          'mouse',
          'rat',
          'bear',
          'seal',
          'whale',
          'dolphin',
          'otter',
          'coyote',
          'moose',
          'chipmunk',
          'tracks',
          'footprint',
          'droppings',
          'scat',
          'poop',
        ],
      },
      {
        id: 'snake',
        keywords: ['viper', 'rattlesnake', 'python', 'garter', 'slow worm', 'legless lizard'],
      },
      {
        id: 'lizard',
        keywords: [
          'gecko',
          'skink',
          'iguana',
          'alligator',
          'crocodile',
          'chameleon',
          'anole',
          'monitor',
        ],
      },
      { id: 'turtle', keywords: ['tortoise', 'terrapin', 'sea turtle', 'snapping turtle'] },
      { id: 'frog', keywords: ['toad', 'tadpole', 'bullfrog', 'tree frog', 'amphibian'] },
      { id: 'salamander', keywords: ['newt', 'mudpuppy', 'axolotl', 'eft', 'amphibian'] },
    ],
  },
  {
    id: 'water',
    title: 'Beach & water',
    all: {
      id: 'shore',
      label: 'Anything from the beach',
      blurb: 'Shore, tide pools, lakes and rivers',
      keywords: ['tide pool', 'ocean', 'sea', 'lake', 'river', 'pond', 'shore'],
    },
    items: [
      {
        id: 'fish',
        keywords: [
          'shark',
          'ray',
          'stingray',
          'eel',
          'minnow',
          'trout',
          'salmon',
          'bass',
          'perch',
          'seahorse',
        ],
      },
      {
        id: 'crustacean',
        label: 'Crab, lobster & shrimp',
        blurb: 'Crayfish, barnacles, horseshoe crabs',
        keywords: [
          'crab',
          'hermit crab',
          'lobster',
          'shrimp',
          'prawn',
          'crayfish',
          'crawfish',
          'barnacle',
          'horseshoe crab',
          'krill',
          'sand flea',
          'beach hopper',
          'roly-poly',
          'pill bug',
          'woodlouse',
        ],
      },
      {
        id: 'snail',
        keywords: [
          'slug',
          'whelk',
          'limpet',
          'periwinkle',
          'conch',
          'nudibranch',
          'sea slug',
          'shell',
          'seashell',
        ],
      },
      {
        id: 'clam',
        keywords: ['mussel', 'oyster', 'scallop', 'cockle', 'chiton', 'shell', 'seashell'],
      },
      { id: 'octopus', keywords: ['squid', 'cuttlefish', 'nautilus'] },
      {
        id: 'echinoderm',
        label: 'Starfish & sea urchin',
        blurb: 'Sand dollars, sea cucumbers, brittle stars',
        keywords: ['starfish', 'sea star', 'urchin', 'sand dollar', 'sea cucumber', 'brittle star'],
      },
      {
        id: 'cnidarian',
        label: 'Jellyfish, anemone & coral',
        blurb: 'Man o’ war, hydroids, comb jellies',
        keywords: [
          'jellyfish',
          'jelly',
          'anemone',
          'coral',
          'man o war',
          'portuguese',
          'hydroid',
          'comb jelly',
          'sea pen',
        ],
      },
      {
        id: 'sponge',
        blurb: 'Tunicates, moss animals, salps',
        keywords: ['sponge', 'sea squirt', 'tunicate', 'bryozoan', 'salp'],
      },
      { id: 'seaweed', keywords: ['kelp', 'rockweed', 'wrack', 'algae', 'sea lettuce'] },
    ],
  },
];

/** Every pick in the sheet, in display order and without repeats. */
export const CATEGORY_PICKER_ORDER: IdentifyTarget[] = [
  ...new Set(
    PICKER_SECTIONS.flatMap((s) => [...(s.all ? [s.all.id] : []), ...s.items.map((i) => i.id)]),
  ),
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
