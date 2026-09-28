/**
 * Central tuning knobs. Everything that affects ranking, UI bands, privacy
 * rounding, limits, or caching lives here so it can be adjusted in one place.
 */

export const APP_VERSION = '1.0.0';

export const RANKING = {
  /** Used when reliable seasonal data is available. */
  weightsWithSeason: { visual: 0.8, geo: 0.15, season: 0.05 },
  /** Used when seasonal data is missing or too sparse to trust. */
  weightsWithoutSeason: { visual: 0.8, geo: 0.2, season: 0 },
  /** Geographic support assigned when no records exist within the widest radius (absence ≠ elimination). */
  geoSupportWhenAbsent: 0.25,
  /** Multiplier for the smallest radius that contains records; closer evidence counts more. */
  radiusFactors: { 5: 1, 25: 0.9, 100: 0.75 } as Record<number, number>,
  /** Record count at which the count component saturates. */
  geoCountSaturation: 50,
  /** Minimum records in the widest radius before month distribution is considered reliable. */
  seasonMinRecords: 12,
  /** Window (± months) around the capture month that counts as "in season". */
  seasonWindowMonths: 1,
  /**
   * Birds with eBird data: whether the species was reported nearby in the last month is
   * sharper seasonal evidence (migrants come and go within weeks), so it weighs more.
   */
  weightsWithRecentSightings: { visual: 0.8, geo: 0.1, season: 0.1 },
  /**
   * Multiplier from the species' modelled range: in range or no map → 1. Plants are
   * penalised less because gardens and houseplants grow far outside native ranges.
   */
  rangeFactors: {
    animal: { in: 1, near: 0.92, out: 0.75 },
    plant: { in: 1, near: 0.97, out: 0.9 },
  },
} as const;

export const CONFIDENCE_BANDS = {
  high: 0.8,
  medium: 0.55,
} as const;

export const GEO = {
  searchRadiiKm: [5, 25, 100],
  /** Decimal places kept when coordinates leave the device (2 ≈ 1.1 km). */
  requestPrecision: 2,
  /** Decimal places for human-readable labels saved in local history (1 ≈ 11 km). */
  labelPrecision: 1,
  nearbySpeciesRadiusKm: 25,
  communityRadiusKm: 25,
  communityRecentDays: 90,
} as const;

export const UPLOAD = {
  maxImages: 5,
  maxImageBytes: 3 * 1024 * 1024,
  /** Vercel's request body limit is 4.5 MB, so stay below it. */
  maxRequestBytes: 4.2 * 1024 * 1024,
  maxDimension: 4096,
  minDimension: 64,
  acceptedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
} as const;

/** Calls: short mono 16-bit WAV clips at BirdNET's sample rate, decoded on the device. */
export const AUDIO = {
  sampleRate: 48_000,
  minSeconds: 3,
  maxSeconds: 15,
} as const;

export const CLIENT_IMAGE = {
  /** Longest edge of the image sent for identification. */
  maxEdge: 1600,
  quality: 0.88,
  thumbnailEdge: 240,
  thumbnailQuality: 0.75,
} as const;

export const GROUPING = {
  /** Show a genus-level answer when same-genus candidates together reach this confidence. */
  minConfidence: 0.55,
  minMembers: 2,
} as const;

export const CANDIDATES = {
  /** How many candidates are requested from the visual provider and enriched with GBIF. */
  maxCandidates: 5,
  /** How many are shown as alternatives. */
  minAlternativesShown: 3,
} as const;

/**
 * Tracks and droppings are much harder than photos of the animal (about half right at
 * species level in our 2026-09-27 evaluation), so they are always shown as possible matches.
 */
export const SIGNS = {
  confidenceCap: 0.5,
  /** How long to wait for the list of nearby mammals before identifying without it. */
  candidateTimeoutMs: 5_000,
} as const;

export const CACHE_TTL_MS = {
  taxonomy: 7 * 24 * 60 * 60 * 1000,
  occurrence: 6 * 60 * 60 * 1000,
  community: 45 * 60 * 1000,
  speciesInfo: 7 * 24 * 60 * 60 * 1000,
} as const;

export const TIMEOUTS_MS = {
  identification: 20_000,
  supporting: 6_000,
} as const;

export const RATE_LIMIT = {
  identifyMaxRequests: 10,
  identifyWindowMs: 10 * 60 * 1000,
} as const;
