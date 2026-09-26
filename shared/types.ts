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

export type IdentifyResponse = {
  requestId: string;
  category: OrganismCategory;
  generatedAt: string;
  imagesSubmitted: number;
  location: { used: boolean; approx?: ApproxLocation; label?: string };
  confidenceBand: ConfidenceBand;
  candidates: OrganismCandidate[];
  speciesInfo?: SpeciesInfo;
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
