/**
 * Development fixtures. Species names and GBIF keys are real so links resolve,
 * but the scores and counts are synthetic and exist only to exercise the UI.
 */
import type { OccurrenceEvidence } from '../../../shared/types.js';
import type { ResolvedTaxon } from '../types.js';

export const MOCK_SCENARIOS = [
  'high',
  'medium',
  'low',
  'zero',
  'gbif-down',
  'inat-down',
  'quota',
  'network',
  'timeout',
  'wrong-category',
  'auto-bug',
  'auto-animal',
  'person',
] as const;
export type MockScenario = (typeof MOCK_SCENARIOS)[number];

export function isMockScenario(value: string | undefined): value is MockScenario {
  return !!value && (MOCK_SCENARIOS as readonly string[]).includes(value);
}

export type FixtureSpecies = {
  /** Defaults to a flowering plant when omitted. */
  kingdom?: string;
  phylum?: string;
  className?: string;
  scientificName: string;
  authorship: string;
  commonNames: string[];
  score: number;
  gbifKey: number;
  genusKey: number;
  familyKey: number;
  genus: string;
  family: string;
  order: string;
  radiusCounts: [number, number, number];
  monthCounts: number[];
};

const MAPLE = {
  genus: 'Acer',
  genusKey: 3189834,
  family: 'Sapindaceae',
  familyKey: 6657,
  order: 'Sapindales',
};
const CLOVER = {
  genus: 'Trifolium',
  genusKey: 2973363,
  family: 'Fabaceae',
  familyKey: 5386,
  order: 'Fabales',
};
const GOLDENROD = {
  genus: 'Solidago',
  genusKey: 5388868,
  family: 'Asteraceae',
  familyKey: 3065,
  order: 'Asterales',
};

const TREE_SEASON = [2, 3, 8, 70, 60, 98, 71, 56, 71, 65, 12, 1];
const SUMMER_FLOWER = [0, 0, 1, 4, 20, 60, 90, 85, 50, 12, 2, 0];
const LATE_SUMMER = [0, 0, 0, 1, 3, 10, 40, 95, 110, 30, 3, 0];

export const FIXTURES: Record<'high' | 'medium' | 'low', FixtureSpecies[]> = {
  high: [
    {
      scientificName: 'Acer rubrum',
      authorship: 'L.',
      commonNames: ['Red maple', 'Swamp maple'],
      score: 0.93,
      gbifKey: 3189883,
      ...MAPLE,
      radiusCounts: [41, 487, 3120],
      monthCounts: TREE_SEASON,
    },
    {
      scientificName: 'Acer saccharinum',
      authorship: 'L.',
      commonNames: ['Silver maple'],
      score: 0.03,
      gbifKey: 3189837,
      ...MAPLE,
      radiusCounts: [2, 19, 160],
      monthCounts: TREE_SEASON,
    },
    {
      scientificName: 'Acer platanoides',
      authorship: 'L.',
      commonNames: ['Norway maple'],
      score: 0.02,
      gbifKey: 3189846,
      ...MAPLE,
      radiusCounts: [5, 60, 420],
      monthCounts: TREE_SEASON,
    },
  ],
  medium: [
    {
      scientificName: 'Trifolium pratense',
      authorship: 'L.',
      commonNames: ['Red clover'],
      score: 0.69,
      gbifKey: 8324121,
      ...CLOVER,
      radiusCounts: [12, 140, 900],
      monthCounts: SUMMER_FLOWER,
    },
    {
      scientificName: 'Trifolium hybridum',
      authorship: 'L.',
      commonNames: ['Alsike clover'],
      score: 0.17,
      gbifKey: 6109535,
      ...CLOVER,
      radiusCounts: [3, 38, 250],
      monthCounts: SUMMER_FLOWER,
    },
    {
      scientificName: 'Trifolium medium',
      authorship: 'L.',
      commonNames: ['Zigzag clover'],
      score: 0.07,
      gbifKey: 5358812,
      ...CLOVER,
      radiusCounts: [0, 0, 4],
      monthCounts: SUMMER_FLOWER,
    },
  ],
  low: [
    {
      scientificName: 'Solidago canadensis',
      authorship: 'L.',
      commonNames: ['Canada goldenrod'],
      score: 0.36,
      gbifKey: 5389029,
      ...GOLDENROD,
      radiusCounts: [9, 110, 700],
      monthCounts: LATE_SUMMER,
    },
    {
      scientificName: 'Solidago gigantea',
      authorship: 'Aiton',
      commonNames: ['Giant goldenrod'],
      score: 0.29,
      gbifKey: 5389017,
      ...GOLDENROD,
      radiusCounts: [0, 6, 80],
      monthCounts: LATE_SUMMER,
    },
    {
      scientificName: 'Solidago altissima',
      authorship: 'L.',
      commonNames: ['Tall goldenrod'],
      score: 0.21,
      gbifKey: 5389058,
      ...GOLDENROD,
      radiusCounts: [0, 0, 0],
      monthCounts: new Array(12).fill(0),
    },
    {
      scientificName: 'Euthamia graminifolia',
      authorship: '(L.) Nutt.',
      commonNames: ['Grass-leaved goldenrod'],
      score: 0.06,
      gbifKey: 3092782,
      genus: 'Euthamia',
      genusKey: 7944033,
      family: 'Asteraceae',
      familyKey: 3065,
      order: 'Asterales',
      radiusCounts: [4, 50, 380],
      monthCounts: LATE_SUMMER,
    },
  ],
};

const MONARCH_FAMILY = { family: 'Nymphalidae', familyKey: 7017, order: 'Lepidoptera' };
const INSECT = { kingdom: 'Animalia', phylum: 'Arthropoda', className: 'Insecta' };
const BUTTERFLY_SEASON = [0, 0, 0, 0, 2, 20, 60, 90, 70, 10, 0, 0];

/** Returned for insect/spider identifications in mock mode. */
export const INSECT_FIXTURES: FixtureSpecies[] = [
  {
    scientificName: 'Danaus plexippus',
    authorship: '(Linnaeus, 1758)',
    commonNames: ['Monarch'],
    score: 0.6,
    gbifKey: 5133088,
    genus: 'Danaus',
    genusKey: 5133087,
    ...MONARCH_FAMILY,
    ...INSECT,
    radiusCounts: [3, 40, 310],
    monthCounts: BUTTERFLY_SEASON,
  },
  {
    scientificName: 'Limenitis archippus',
    authorship: '(Cramer, 1775)',
    commonNames: ['Viceroy'],
    score: 0.14,
    gbifKey: 5132398,
    genus: 'Limenitis',
    genusKey: 5131972,
    ...MONARCH_FAMILY,
    ...INSECT,
    radiusCounts: [0, 6, 45],
    monthCounts: BUTTERFLY_SEASON,
  },
  {
    scientificName: 'Speyeria cybele',
    authorship: '(Fabricius, 1775)',
    commonNames: ['Great spangled fritillary'],
    score: 0.05,
    gbifKey: 1905172,
    genus: 'Speyeria',
    genusKey: 1905150,
    ...MONARCH_FAMILY,
    ...INSECT,
    radiusCounts: [2, 25, 180],
    monthCounts: BUTTERFLY_SEASON,
  },
];

const AMANITA = {
  genus: 'Amanita',
  genusKey: 6005964,
  family: 'Amanitaceae',
  familyKey: 4171,
  order: 'Agaricales',
};
const FUNGUS = { kingdom: 'Fungi', phylum: 'Basidiomycota', className: 'Agaricomycetes' };
const MUSHROOM_SEASON = [0, 0, 0, 0, 1, 4, 20, 60, 90, 45, 6, 0];

/** Returned for fungus identifications in mock mode. */
export const FUNGUS_FIXTURES: FixtureSpecies[] = [
  {
    scientificName: 'Amanita muscaria',
    authorship: '(L.) Lam.',
    commonNames: ['Fly agaric'],
    score: 0.72,
    gbifKey: 8168319,
    ...AMANITA,
    ...FUNGUS,
    radiusCounts: [2, 30, 210],
    monthCounts: MUSHROOM_SEASON,
  },
  {
    scientificName: 'Amanita flavoconia',
    authorship: 'G.F.Atk.',
    commonNames: ['Yellow patches'],
    score: 0.12,
    gbifKey: 5240273,
    ...AMANITA,
    ...FUNGUS,
    radiusCounts: [0, 5, 40],
    monthCounts: MUSHROOM_SEASON,
  },
  {
    scientificName: 'Amanita rubescens',
    authorship: 'Pers.',
    commonNames: ['Blusher'],
    score: 0.05,
    gbifKey: 7496350,
    ...AMANITA,
    ...FUNGUS,
    radiusCounts: [0, 3, 22],
    monthCounts: MUSHROOM_SEASON,
  },
];

const BIRD = { kingdom: 'Animalia', phylum: 'Chordata', className: 'Aves' };
const BIRD_SEASON = [30, 28, 35, 40, 55, 50, 45, 48, 60, 70, 50, 38];

/** Returned for bird identifications in mock mode. */
export const BIRD_FIXTURES: FixtureSpecies[] = [
  {
    scientificName: 'Cyanocitta cristata',
    authorship: '(Linnaeus, 1758)',
    commonNames: ['Blue jay'],
    score: 0.88,
    gbifKey: 2482593,
    genus: 'Cyanocitta',
    genusKey: 2482592,
    family: 'Corvidae',
    familyKey: 5235,
    order: 'Passeriformes',
    ...BIRD,
    radiusCounts: [60, 900, 5200],
    monthCounts: BIRD_SEASON,
  },
  {
    scientificName: 'Poecile atricapillus',
    authorship: '(Linnaeus, 1766)',
    commonNames: ['Black-capped chickadee'],
    score: 0.04,
    gbifKey: 2487805,
    genus: 'Poecile',
    genusKey: 2487782,
    family: 'Paridae',
    familyKey: 9327,
    order: 'Passeriformes',
    ...BIRD,
    radiusCounts: [80, 1200, 7000],
    monthCounts: BIRD_SEASON,
  },
  {
    scientificName: 'Megaceryle alcyon',
    authorship: '(Linnaeus, 1758)',
    commonNames: ['Belted kingfisher'],
    score: 0.02,
    gbifKey: 2475472,
    genus: 'Megaceryle',
    genusKey: 2475462,
    family: 'Alcedinidae',
    familyKey: 2984,
    order: 'Coraciiformes',
    ...BIRD,
    radiusCounts: [5, 120, 800],
    monthCounts: BIRD_SEASON,
  },
];

const FROG = { kingdom: 'Animalia', phylum: 'Chordata', className: 'Amphibia', order: 'Anura' };
const FROG_SEASON = [0, 0, 2, 40, 70, 60, 45, 40, 30, 12, 1, 0];

/** Returned for animal ("Animal" group) identifications in mock mode. */
export const AMPHIBIAN_FIXTURES: FixtureSpecies[] = [
  {
    scientificName: 'Lithobates sylvaticus',
    authorship: '(LeConte, 1825)',
    commonNames: ['Wood frog'],
    score: 0.71,
    gbifKey: 2427072,
    genus: 'Lithobates',
    genusKey: 2427046,
    family: 'Ranidae',
    familyKey: 6746,
    ...FROG,
    radiusCounts: [4, 60, 420],
    monthCounts: FROG_SEASON,
  },
  {
    scientificName: 'Lithobates clamitans',
    authorship: '(Latreille, 1801)',
    commonNames: ['Green frog'],
    score: 0.12,
    gbifKey: 2427172,
    genus: 'Lithobates',
    genusKey: 2427046,
    family: 'Ranidae',
    familyKey: 6746,
    ...FROG,
    radiusCounts: [6, 80, 510],
    monthCounts: FROG_SEASON,
  },
  {
    scientificName: 'Anaxyrus americanus',
    authorship: '(Holbrook, 1836)',
    commonNames: ['American toad'],
    score: 0.05,
    gbifKey: 2422872,
    genus: 'Anaxyrus',
    genusKey: 2422857,
    family: 'Bufonidae',
    familyKey: 6727,
    ...FROG,
    radiusCounts: [3, 40, 300],
    monthCounts: FROG_SEASON,
  },
];

const MAMMAL = { kingdom: 'Animalia', phylum: 'Chordata', className: 'Mammalia' };
const MAMMAL_SEASON = [20, 18, 30, 45, 60, 70, 75, 72, 65, 50, 30, 22];

/** Returned for mammal identifications (including tracks and droppings) in mock mode. */
export const MAMMAL_FIXTURES: FixtureSpecies[] = [
  {
    scientificName: 'Procyon lotor',
    authorship: '(Linnaeus, 1758)',
    commonNames: ['Raccoon'],
    score: 0.74,
    gbifKey: 5218786,
    genus: 'Procyon',
    genusKey: 5218785,
    family: 'Procyonidae',
    familyKey: 5494,
    order: 'Carnivora',
    ...MAMMAL,
    radiusCounts: [30, 400, 2600],
    monthCounts: MAMMAL_SEASON,
  },
  {
    scientificName: 'Mephitis mephitis',
    authorship: '(Schreber, 1776)',
    commonNames: ['Striped skunk'],
    score: 0.1,
    gbifKey: 2433875,
    genus: 'Mephitis',
    genusKey: 2433874,
    family: 'Mephitidae',
    familyKey: 9380,
    order: 'Carnivora',
    ...MAMMAL,
    radiusCounts: [12, 180, 1300],
    monthCounts: MAMMAL_SEASON,
  },
  {
    scientificName: 'Vulpes vulpes',
    authorship: '(Linnaeus, 1758)',
    commonNames: ['Red fox'],
    score: 0.05,
    gbifKey: 5219243,
    genus: 'Vulpes',
    genusKey: 5219234,
    family: 'Canidae',
    familyKey: 9701,
    order: 'Carnivora',
    ...MAMMAL,
    radiusCounts: [25, 350, 2400],
    monthCounts: MAMMAL_SEASON,
  },
];

export const ALL_FIXTURE_SPECIES = [
  ...FIXTURES.high,
  ...FIXTURES.medium,
  ...FIXTURES.low,
  ...INSECT_FIXTURES,
  ...FUNGUS_FIXTURES,
  ...BIRD_FIXTURES,
  ...AMPHIBIAN_FIXTURES,
  ...MAMMAL_FIXTURES,
];

export function findFixture(scientificName: string): FixtureSpecies | undefined {
  return ALL_FIXTURE_SPECIES.find((s) => s.scientificName === scientificName);
}

export function fixtureTaxon(s: FixtureSpecies): ResolvedTaxon {
  return {
    gbifKey: s.gbifKey,
    scientificName: `${s.scientificName} ${s.authorship}`,
    canonicalName: s.scientificName,
    kingdom: s.kingdom ?? 'Plantae',
    phylum: s.phylum ?? 'Tracheophyta',
    className: s.className ?? 'Magnoliopsida',
    order: s.order,
    family: s.family,
    genus: s.genus,
    species: s.scientificName,
    genusKey: s.genusKey,
    familyKey: s.familyKey,
  };
}

export function fixtureOccurrence(s: FixtureSpecies): OccurrenceEvidence {
  const radii = [5, 25, 100];
  const radiusCounts = radii.map((radiusKm, i) => ({ radiusKm, count: s.radiusCounts[i] }));
  return {
    source: 'GBIF',
    radiusCounts,
    nearestRadiusKm: radiusCounts.find((r) => r.count > 0)?.radiusKm,
    monthCounts: s.monthCounts,
  };
}

/** Other members of the same genus, used for "nearby species" in mock mode. */
export const NEARBY_FIXTURES: Record<
  string,
  { scientificName: string; commonName: string; gbifKey: number; count: number }[]
> = {
  Acer: [
    { scientificName: 'Acer saccharum', commonName: 'Sugar maple', gbifKey: 3189859, count: 212 },
    { scientificName: 'Acer spicatum', commonName: 'Mountain maple', gbifKey: 3189848, count: 96 },
    {
      scientificName: 'Acer pensylvanicum',
      commonName: 'Striped maple',
      gbifKey: 3189836,
      count: 74,
    },
  ],
  Trifolium: [
    {
      scientificName: 'Trifolium repens',
      commonName: 'White clover',
      gbifKey: 5358748,
      count: 188,
    },
    {
      scientificName: 'Trifolium aureum',
      commonName: 'Golden clover',
      gbifKey: 5359060,
      count: 21,
    },
  ],
  Solidago: [
    {
      scientificName: 'Solidago rugosa',
      commonName: 'Wrinkle-leaf goldenrod',
      gbifKey: 5388967,
      count: 133,
    },
    {
      scientificName: 'Solidago sempervirens',
      commonName: 'Seaside goldenrod',
      gbifKey: 5388927,
      count: 67,
    },
  ],
};
