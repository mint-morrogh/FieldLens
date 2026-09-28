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

/** Broader picker choices that the server narrows to a specific category. */
export type CategoryGroupId = 'tree' | 'bug' | 'herp' | 'animal' | 'auto';

/** What the user asked to identify: a specific category or a broader group. */
export type IdentifyTarget = OrganismCategory | CategoryGroupId;

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

/** Where a location sits relative to a species' modelled range. */
export type RangeStatus = 'in' | 'near' | 'out';

export type OccurrenceEvidence = {
  source: string;
  /** Counts at each configured search radius (smallest first). */
  radiusCounts: RadiusCount[];
  /** Smallest radius that returned at least one record, if any. */
  nearestRadiusKm?: number;
  /** Records per calendar month (index 0 = January) within the widest radius. */
  monthCounts?: number[];
  /** Nearby records annotated as flowering, per month; used for photos of flowers. */
  floweringMonthCounts?: number[];
  /** Birds: whether eBird has reports within 50 km in the last 30 days. */
  recentlyReported?: boolean;
  /** Relative to the species' iNaturalist range map; absent when it has no map. */
  range?: RangeStatus;
  /** Records within the widest radius that carry an elevation, and how many sit near the site's. */
  elevation?: ElevationEvidence;
};

/** Ground elevation of the ~11 km cell around the location (Open-Meteo, Copernicus DEM). */
export type ElevationSample = { centerM: number; minM: number; maxM: number };

export type ElevationEvidence = {
  site: ElevationSample;
  /** The elevation band counted as "at this elevation", in metres. */
  bandM: [number, number];
  recordsWithElevation: number;
  recordsInBand: number;
};

/** Which way the camera pointed when the photo was taken. */
export type TiltBucket = 'up' | 'level' | 'down';

/** Daylight at the capture place and time; twilight is treated as neutral. */
export type DayPhase = 'day' | 'twilight' | 'night';

/**
 * Soft context adjustments applied to a candidate's score, as multipliers (≤ 1). Absent when a
 * signal was not used for that candidate.
 */
export type ContextNudges = {
  timeOfDay?: number;
  season?: number;
  elevation?: number;
  tilt?: number;
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
  /** Time of day, season, elevation and camera-tilt nudges that changed this score. */
  nudges?: ContextNudges;

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

export type SpeciesDistribution = {
  source: string;
  sourceUrl?: string;
  total: number;
  /** ISO 3166-1 alpha-2 codes with record counts, most first. */
  countries: { code: string; count: number }[];
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
  /** Where the species has been recorded worldwide (GBIF records per country). */
  distribution?: SpeciesDistribution;
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
  /** iNaturalist's preferred common name for the taxon, when known. */
  taxonCommonName?: string;
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
  location: { used: boolean; approx?: ApproxLocation; label?: string; source?: 'device' | 'photo' };
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
  /** Identified by a newer, less-tested provider; the UI asks people to double-check. */
  experimental?: boolean;
  /** Whether the photo actually looks like the chosen category, with a better guess if not. */
  categoryCheck?: CategoryCheck;
  /**
   * The category or group the person chose (e.g. 'tree', 'auto', 'bug', 'plant'),
   * whatever it was narrowed to. Set on every pipeline response.
   */
  requestedTarget?: IdentifyTarget;
  /** The part photographed in each submitted image (e.g. 'flower', 'bark', 'gills'); 'auto' when not chosen. */
  features?: FeatureId[];
  /** Present when a group or "Not sure" was chosen: what was asked and what was found. */
  categoryDetection?: {
    requested: IdentifyTarget;
    detected: OrganismCategory;
    likelihood?: number;
  };
  safety?: SafetyInfo;
  /**
   * Optional multiple-choice questions whose answers can separate the likely candidates
   * (only when the result is uncertain and sourced traits differ between them).
   */
  questions?: FollowUpQuestion[];
  /**
   * The one view that would settle it: set when the close candidates differ on a feature
   * a specific photo would show (gills vs pores, a volva at the stem base, bill shape) and
   * that feature hasn't been photographed yet.
   */
  decidingView?: DecidingView;
  /** The photo shows a person (people aren't in FieldLens's field guide). */
  person?: boolean;
  /** Set when the photo shows tracks or droppings rather than the animal itself. */
  sign?: AnimalSign;
  /** Identified from a recording of its call (Calls) rather than photos. */
  call?: boolean;
  mock?: boolean;
};

export type DecidingView = {
  /** The part to photograph next, one of the category's features (e.g. 'underside', 'base'). */
  feature: FeatureId;
  /** Short instruction, e.g. "Show the underside of the cap". */
  prompt: string;
  /** Why this view would help, naming the candidates it separates. */
  reason: string;
  source?: string;
  sourceUrl?: string;
};

export type FollowUpQuestion = {
  id: 'size' | 'time' | 'bill';
  prompt: string;
  /** "Not sure" is always offered by the UI in addition to these. */
  options: { id: string; label: string }[];
  /** Candidate id → the options consistent with that candidate's recorded traits. */
  fits: Record<string, string[]>;
  source: string;
  sourceUrl: string;
};

/** Signs an animal leaves behind, identified with lower confidence than the animal itself. */
export type AnimalSign = 'track' | 'scat';

export type SafetyStatement = {
  kind: 'toxic' | 'edible' | 'caution' | 'lookalike';
  text: string;
  /** Set when the statement is about another taxon (an alternative candidate or a look-alike). */
  subject?: string;
  /** Genus-level statements are labelled as such in the UI. */
  basis?: 'species' | 'genus';
  severity?: 'deadly' | 'toxic' | 'skin' | 'caution';
  /** True when `text` is quoted verbatim from the source. */
  quote?: boolean;
  /** Look-alikes only: an openly licensed reference photo of the look-alike, when one was found. */
  photo?: LicensedImage;
  source: string;
  sourceUrl?: string;
  license?: string;
};

/** Sourced edibility and toxicity notes. Never contains "safe to eat" claims. */
export type SafetyInfo = {
  /** "food" (plants & fungi: edibility and toxicity) or "wildlife" (animals: bites, disease, distance). */
  kind?: 'food' | 'wildlife';
  statements: SafetyStatement[];
  /** Most serious warning found for the candidates shown or their look-alikes. */
  level: 'danger' | 'caution' | 'none';
  /** The top candidate itself is reported toxic by a graded source (not just its look-alikes). */
  topToxic?: boolean;
};

export type CategoryCheck = {
  matchesCategory: boolean;
  /** 0–1: how much the image model thinks the photo shows the chosen group. */
  likelihood: number;
  suggestedCategory?: OrganismCategory;
  /** e.g. "Insecta", "Plantae" — what the model thinks it is instead. */
  suggestedGroup?: string;
};

/** Pipeline stages reported to the client while an identification runs. */
export type IdentifyStage = 'detect' | 'identify' | 'taxonomy' | 'occurrence' | 'rank' | 'enrich';

export type StageEvent = {
  stage: IdentifyStage;
  status: 'active' | 'done' | 'skipped';
  /** After the visual step: the provider's first guesses, before any reranking. */
  preview?: { scientificName: string; commonName?: string; visualConfidence: number }[];
  /** After automatic detection: what kind of organism it looks like, or that it's a person. */
  detected?: OrganismCategory | 'person';
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
  /** Whether "Not sure" (automatic category detection) is available. */
  autoDetect?: boolean;
};
