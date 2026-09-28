import { z } from 'zod';
import { isIdentifyTarget } from './categories.js';
import type { HealthResponse, IdentifyResponse } from './types.js';

const categorySchema = z.enum([
  'plant',
  'bird',
  'mammal',
  'reptile',
  'amphibian',
  'fish',
  'insect',
  'arachnid',
  'fungus',
  'other',
]);

const score = z.number().min(0).max(1);
const sourceStatus = z.enum(['ok', 'unavailable', 'skipped']);
const link = z.object({ label: z.string(), url: z.string() });

const licensedImage = z.object({
  url: z.string(),
  thumbnailUrl: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
  source: z.string(),
  sourceUrl: z.string().optional(),
});

const approxLocation = z.object({ latitude: z.number(), longitude: z.number() });

const occurrenceEvidence = z.object({
  source: z.string(),
  radiusCounts: z.array(z.object({ radiusKm: z.number(), count: z.number() })),
  nearestRadiusKm: z.number().optional(),
  monthCounts: z.array(z.number()).optional(),
});

export const organismCandidateSchema = z.object({
  id: z.string(),
  category: categorySchema,
  scientificName: z.string(),
  scientificNameAuthorship: z.string().optional(),
  commonName: z.string().optional(),
  commonNames: z.array(z.string()).optional(),
  kingdom: z.string().optional(),
  phylum: z.string().optional(),
  className: z.string().optional(),
  order: z.string().optional(),
  family: z.string().optional(),
  genus: z.string().optional(),
  taxonKeys: z.object({
    gbif: z.number().optional(),
    powo: z.string().optional(),
    inaturalist: z.number().optional(),
  }),
  visualConfidence: score,
  geographicSupport: score.optional(),
  seasonalSupport: score.optional(),
  finalConfidence: score,
  occurrence: occurrenceEvidence.optional(),
  source: z.object({
    identification: z.string(),
    taxonomy: z.array(z.string()).optional(),
    occurrence: z.array(z.string()).optional(),
  }),
  referenceImages: z.array(licensedImage).optional(),
  links: z.array(link),
});

const speciesInfo = z.object({
  scientificName: z.string(),
  commonNames: z.array(z.string()),
  taxonomy: z.object({
    kingdom: z.string().optional(),
    phylum: z.string().optional(),
    className: z.string().optional(),
    order: z.string().optional(),
    family: z.string().optional(),
    genus: z.string().optional(),
    species: z.string().optional(),
  }),
  facts: z.array(
    z.object({
      label: z.string(),
      value: z.string(),
      source: z.string(),
      sourceUrl: z.string().optional(),
    }),
  ),
  summary: z
    .object({ text: z.string(), source: z.string(), sourceUrl: z.string(), license: z.string() })
    .optional(),
  image: licensedImage.optional(),
  images: z.array(licensedImage).optional(),
  distribution: z
    .object({
      source: z.string(),
      sourceUrl: z.string().optional(),
      total: z.number(),
      countries: z.array(z.object({ code: z.string(), count: z.number() })),
    })
    .optional(),
  links: z.array(link),
  sources: z.array(z.string()),
});

const community = z.object({
  source: z.string(),
  taxonName: z.string(),
  taxonCommonName: z.string().optional(),
  taxonUrl: z.string().optional(),
  radiusKm: z.number().optional(),
  nearbyCount: z.number().optional(),
  recentDays: z.number(),
  recentCount: z.number().optional(),
  mostRecentDate: z.string().optional(),
  globalCount: z.number().optional(),
  monthCounts: z.array(z.number()).optional(),
  recentObservations: z.array(
    z.object({
      id: z.number(),
      observedOn: z.string().optional(),
      placeGuess: z.string().optional(),
      qualityGrade: z.string().optional(),
      url: z.string(),
      photo: licensedImage.optional(),
    }),
  ),
  exploreUrl: z.string().optional(),
});

const evidenceItem = z.object({ code: z.string(), text: z.string() });

export const identifyResponseSchema = z.object({
  requestId: z.string(),
  category: categorySchema,
  generatedAt: z.string(),
  imagesSubmitted: z.number().int().min(0),
  location: z.object({
    used: z.boolean(),
    approx: approxLocation.optional(),
    label: z.string().optional(),
    source: z.enum(['device', 'photo']).optional(),
  }),
  confidenceBand: z.enum(['high', 'medium', 'low', 'none']),
  candidates: z.array(organismCandidateSchema),
  speciesInfo: speciesInfo.optional(),
  groupSummary: z
    .object({
      rank: z.literal('genus'),
      name: z.string(),
      commonName: z.string().optional(),
      confidence: score,
      memberCount: z.number().int(),
    })
    .optional(),
  community: community.optional(),
  nearbySpecies: z
    .object({
      label: z.string(),
      radiusKm: z.number(),
      species: z.array(
        z.object({
          scientificName: z.string(),
          commonName: z.string().optional(),
          gbifKey: z.number().optional(),
          count: z.number(),
          url: z.string().optional(),
        }),
      ),
    })
    .optional(),
  evidence: z.object({ supports: z.array(evidenceItem), uncertainties: z.array(evidenceItem) }),
  guidance: z.array(z.object({ feature: z.string().optional(), message: z.string() })),
  attribution: z.array(z.object({ provider: z.string(), text: z.string(), url: z.string() })),
  sourceStatus: z.object({
    identification: sourceStatus,
    occurrence: sourceStatus,
    speciesInfo: sourceStatus,
    community: sourceStatus,
  }),
  safetyNotice: z.string().optional(),
  experimental: z.boolean().optional(),
  categoryCheck: z
    .object({
      matchesCategory: z.boolean(),
      likelihood: score,
      suggestedCategory: categorySchema.optional(),
      suggestedGroup: z.string().optional(),
    })
    .optional(),
  categoryDetection: z
    .object({
      requested: z.string().refine(isIdentifyTarget),
      detected: categorySchema,
      likelihood: score.optional(),
    })
    .optional(),
  sign: z.enum(['track', 'scat']).optional(),
  person: z.boolean().optional(),
  questions: z
    .array(
      z.object({
        id: z.enum(['size', 'time']),
        prompt: z.string(),
        options: z.array(z.object({ id: z.string(), label: z.string() })),
        fits: z.record(z.string(), z.array(z.string())),
        source: z.string(),
        sourceUrl: z.string(),
      }),
    )
    .optional(),
  safety: z
    .object({
      kind: z.enum(['food', 'wildlife']).optional(),
      statements: z.array(
        z.object({
          kind: z.enum(['toxic', 'edible', 'caution', 'lookalike']),
          text: z.string(),
          subject: z.string().optional(),
          basis: z.enum(['species', 'genus']).optional(),
          severity: z.enum(['deadly', 'toxic', 'skin', 'caution']).optional(),
          quote: z.boolean().optional(),
          source: z.string(),
          sourceUrl: z.string().optional(),
          license: z.string().optional(),
        }),
      ),
      level: z.enum(['danger', 'caution', 'none']),
      topToxic: z.boolean().optional(),
    })
    .optional(),
  mock: z.boolean().optional(),
}) satisfies z.ZodType<IdentifyResponse>;

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryAfterSeconds: z.number().optional(),
  }),
});

export const healthResponseSchema = z.object({
  ok: z.boolean(),
  appName: z.string(),
  version: z.string(),
  plantIdentificationConfigured: z.boolean(),
  mock: z.boolean(),
  supportedCategories: z.array(categorySchema),
  autoDetect: z.boolean().optional(),
}) satisfies z.ZodType<HealthResponse>;
