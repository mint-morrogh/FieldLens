import { z } from 'zod';

/**
 * Place search for choosing a home patch by address. The typed text goes once through
 * FieldLens to OpenStreetMap's Nominatim (Open-Meteo's place names as a fallback); only a
 * short place label and a position rounded to ~11 km come back, and nothing is stored.
 */

export const GEOCODE = {
  minQuery: 2,
  maxQuery: 200,
  maxResults: 5,
} as const;

export const geocodeResultSchema = z.object({
  /** Short place label, e.g. "Charlottetown, Prince Edward Island, Canada". */
  label: z.string(),
  /** Rounded to 1 decimal (~11 km), the same cells as journal areas. */
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});
export type GeocodeResult = z.infer<typeof geocodeResultSchema>;

export const geocodeResponseSchema = z.object({
  results: z.array(geocodeResultSchema).max(GEOCODE.maxResults),
  source: z.enum(['openstreetmap', 'open-meteo', 'mock']),
});
export type GeocodeResponse = z.infer<typeof geocodeResponseSchema>;
