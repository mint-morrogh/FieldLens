/**
 * Taxonomy-neutral domain model shared by the client and the server.
 * Nothing here is plant-specific: plants are one OrganismCategory among many.
 */

export type OrganismCategory =
  | 'plant'
  | 'bird'
  | 'mammal'
  | 'reptile'
  | 'amphibian'
  | 'fish'
  | 'insect'
  | 'arachnid'
  | 'fungus'
  | 'other';

/** A category-specific body part / organ / feature, e.g. "flower" for plants or "wing" for birds. */
export type FeatureId = string;

export type ConfidenceBand = 'high' | 'medium' | 'low' | 'none';

export type ApproxLocation = {
  /** Coordinates already rounded to the privacy grid (see shared/geo.ts). */
  latitude: number;
  longitude: number;
};

export type LicensedImage = {
  url: string;
  thumbnailUrl?: string;
  author?: string;
  license?: string;
  source: string;
  sourceUrl?: string;
};

export type TaxonIdentity = {
  scientificName: string;
  category: OrganismCategory;
  gbifKey?: number;
  inaturalistId?: number;
  powoId?: string;
  genus?: string;
  family?: string;
};

export type TaxonomyRanks = {
  kingdom?: string;
  phylum?: string;
  className?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
};

export type RadiusCount = { radiusKm: number; count: number };

export type OccurrenceEvidence = {
  source: string;
  /** Counts at each configured search radius (smallest first). */
  radiusCounts: RadiusCount[];
  /** Smallest radius that returned at least one record, if any. */
  nearestRadiusKm?: number;
  /** Records per calendar month (index 0 = January) within the widest radius. */
  monthCounts?: number[];
};

export type ExternalLink = { label: string; url: string };

export type OrganismCandidate = {
  id: string;
  category: OrganismCategory;

  scientificName: string;
  scientificNameAuthorship?: string;
  commonName?: string;
  commonNames?: string[];

  kingdom?: string;
  phylum?: string;
  className?: string;
  order?: string;
  family?: string;
  genus?: string;

  taxonKeys: { gbif?: number; powo?: string; inaturalist?: number };

  visualConfidence: number;
  geographicSupport?: number;
  seasonalSupport?: number;
  finalConfidence: number;

  occurrence?: OccurrenceEvidence;

  source: {
    identification: string;
    taxonomy?: string[];
    occurrence?: string[];
  };

  referenceImages?: LicensedImage[];
  links: ExternalLink[];
};

export type SpeciesFact = {
  label: string;
  value: string;
  source: string;
  sourceUrl?: string;
};

export type SpeciesInfo = {
  scientificName: string;
  commonNames: string[];
  taxonomy: TaxonomyRanks;
  facts: SpeciesFact[];
  summary?: { text: string; source: string; sourceUrl: string; license: string };
  image?: LicensedImage;
  /** Openly licensed reference photos of this taxon (e.g. from iNaturalist). */
  images?: LicensedImage[];
  links: ExternalLink[];
  sources: string[];
};

export type CommunityObservation = {
  id: number;
  observedOn?: string;
  placeGuess?: string;
  qualityGrade?: string;
  url: string;
  photo?: LicensedImage;
};

export type CommunityObservationSummary = {
  source: string;
  taxonName: string;
  taxonUrl?: string;
  radiusKm?: number;
  nearbyCount?: number;
  recentDays: number;
  recentCount?: number;
  mostRecentDate?: string;
  globalCount?: number;
  monthCounts?: number[];
  recentObservations: CommunityObservation[];
  exploreUrl?: string;
};

export type SourceStatus = 'ok' | 'unavailable' | 'skipped';

export type EvidenceItem = { code: string; text: string };

export type NearbySpecies = {
  scientificName: string;
  commonName?: string;
  gbifKey?: number;
  count: number;
  url?: string;
};

export type NearbySpeciesGroup = {
  label: string;
  radiusKm: number;
  species: NearbySpecies[];
};

export type Guidance = { feature?: FeatureId; message: string };

export type Attribution = { provider: string; text: string; url: string };

/**
 * Higher-rank summary when the species is uncertain but the top candidates
 * agree on a group, e.g. three Solidago species → "probably a goldenrod".
 */
export type GroupSummary = {
  rank: 'genus';
  name: string;
  commonName?: string;
  /** Sum of finalConfidence over the candidates in this group. */
  confidence: number;
  memberCount: number;
};

export type IdentifyResponse = {
  requestId: string;
  category: OrganismCategory;
  generatedAt: string;
  imagesSubmitted: number;
  location: { used: boolean; approx?: ApproxLocation; label?: string };
  confidenceBand: ConfidenceBand;
  candidates: OrganismCandidate[];
  speciesInfo?: SpeciesInfo;
  groupSummary?: GroupSummary;
  community?: CommunityObservationSummary;
  nearbySpecies?: NearbySpeciesGroup;
  evidence: { supports: EvidenceItem[]; uncertainties: EvidenceItem[] };
  guidance: Guidance[];
  attribution: Attribution[];
  sourceStatus: {
    identification: SourceStatus;
    occurrence: SourceStatus;
    speciesInfo: SourceStatus;
    community: SourceStatus;
  };
  safetyNotice?: string;
  mock?: boolean;
};

/** Pipeline stages reported to the client while an identification runs. */
export type IdentifyStage = 'identify' | 'taxonomy' | 'occurrence' | 'rank' | 'enrich';

export type StageEvent = {
  stage: IdentifyStage;
  status: 'active' | 'done' | 'skipped';
  /** After the visual step: the provider's first guesses, before any reranking. */
  preview?: { scientificName: string; commonName?: string; visualConfidence: number }[];
};

/** One line of the streamed (NDJSON) /api/identify response. */
export type IdentifyStreamLine =
  | ({ type: 'stage' } & StageEvent)
  | { type: 'result'; result: IdentifyResponse }
  | { type: 'error'; error: ApiErrorBody['error']; status: number };

export type ApiErrorCode =
  | 'invalid_request'
  | 'invalid_file'
  | 'image_too_large'
  | 'too_many_images'
  | 'unsupported_category'
  | 'rate_limited'
  | 'provider_quota_exhausted'
  | 'provider_timeout'
  | 'provider_unavailable'
  | 'provider_auth'
  | 'zero_predictions'
  | 'not_configured'
  | 'internal_error';

export type ApiErrorBody = {
  error: { code: ApiErrorCode; message: string; retryAfterSeconds?: number };
};

export type HealthResponse = {
  ok: boolean;
  appName: string;
  version: string;
  plantIdentificationConfigured: boolean;
  mock: boolean;
  supportedCategories: OrganismCategory[];
};
