import { z } from 'zod';

/**
 * "Near you" lookups for the journal and home screen: how many species of a family are
 * recorded around the user, and which species are at their seasonal peak this month.
 * Coordinates are coarsened to ~11 km on the device and again on the server.
 * Counts are GBIF occurrence records (how often people log things), never rarity.
 */

export const NEARBY = {
  /** Decimal places kept for these lookups (1 ≈ 11 km), on the device and the server. */
  precision: 1,
  radiusKm: 50,
  maxTaxa: 20,
} as const;

/** Journal groups the "What's out now" card can suggest from. */
export const WHATS_OUT_GROUPS = ['plant', 'fungus', 'bird', 'bug', 'mammal'] as const;
export type WhatsOutGroup = (typeof WHATS_OUT_GROUPS)[number];

const taxonRank = z.enum(['family', 'genus']);
const group = z.enum(['plant', 'fungus', 'bug', 'bird', 'mammal', 'herp', 'fish']);

export const nearbyFamiliesRequestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  taxa: z
    .array(
      z.object({
        name: z
          .string()
          .trim()
          .min(2)
          .max(60)
          .regex(/^[A-Za-z][A-Za-z-]*$/),
        rank: taxonRank,
        group,
      }),
    )
    .min(1)
    .max(NEARBY.maxTaxa),
});
export type NearbyFamiliesRequest = z.infer<typeof nearbyFamiliesRequestSchema>;

export const nearbyFamiliesResponseSchema = z.object({
  radiusKm: z.number(),
  results: z.array(
    z.object({
      name: z.string(),
      rank: taxonRank,
      /** Distinct species with occurrence records within the radius. */
      species: z.number().int().min(0),
      /** True when the count hit the lookup's cap (shown as "N+"). */
      capped: z.boolean().optional(),
    }),
  ),
  source: z.string(),
});
export type NearbyFamiliesResponse = z.infer<typeof nearbyFamiliesResponseSchema>;

export const whatsOutSpeciesSchema = z.object({
  scientificName: z.string(),
  commonName: z.string().optional(),
  group: z.enum(WHATS_OUT_GROUPS),
  gbifKey: z.number().optional(),
  url: z.string().optional(),
  photo: z
    .object({
      url: z.string(),
      author: z.string().optional(),
      license: z.string().optional(),
      source: z.string(),
      sourceUrl: z.string().optional(),
    })
    .optional(),
});
export type WhatsOutSpecies = z.infer<typeof whatsOutSpeciesSchema>;

export const whatsOutResponseSchema = z.object({
  month: z.number().int().min(1).max(12),
  radiusKm: z.number(),
  species: z.array(whatsOutSpeciesSchema),
  source: z.string(),
});
export type WhatsOutResponse = z.infer<typeof whatsOutResponseSchema>;
