import type {
  AnimalSign,
  ApproxLocation,
  Attribution,
  CategoryCheck,
  CommunityObservationSummary,
  FeatureId,
  IdentifyTarget,
  NearbySpeciesGroup,
  OccurrenceEvidence,
  OrganismCandidate,
  OrganismCategory,
  SpeciesInfo,
  TaxonIdentity,
  TaxonomyRanks,
} from '../../shared/types.js';
import type { SafetyTextProvider } from '../safety/safety.js';

export type InputImage = {
  data: Uint8Array;
  mimeType: string;
  feature: FeatureId;
};

export type IdentificationInput = {
  observationId: string;
  /** A specific category, a group ("bug", "animal") or "auto"; see the pipeline. */
  category: IdentifyTarget;
  images: InputImage[];
  location?: ApproxLocation;
  /** Where the position came from: the device now, or the photo's own GPS. */
  locationSource?: 'device' | 'photo';
  capturedAt: Date;
  /** Only honoured by mock providers. */
  mockScenario?: string;
  /** Tracks or droppings: rank `signCandidates` instead of the whole Tree of Life. */
  sign?: AnimalSign;
  signCandidates?: SignCandidate[];
};

/** A species that could have left a sign, e.g. a mammal recorded near the user. */
export type SignCandidate = { name: string; common?: string };

export interface SignCandidateProvider {
  readonly name: string;
  /** Mammal species recorded near the location (or commonly recorded anywhere). */
  getMammalCandidates(location?: ApproxLocation): Promise<SignCandidate[]>;
}

/** Candidate as returned by a visual provider, before geographic reranking. */
export type ProviderCandidate = Omit<
  OrganismCandidate,
  'finalConfidence' | 'geographicSupport' | 'seasonalSupport' | 'occurrence'
>;

export type IdentificationResult = {
  provider: string;
  candidates: ProviderCandidate[];
  attribution: Attribution[];
  experimental?: boolean;
  categoryCheck?: CategoryCheck;
  /** The photo shows a person; no candidates are returned. */
  person?: boolean;
  /** For groups: the specific category of the top candidate (e.g. "amphibian" for "animal"). */
  detectedCategory?: OrganismCategory;
  /** Provider-native response, kept only for debugging; never sent to the UI. */
  raw?: unknown;
};

export type CategoryDetectionResult = {
  category: OrganismCategory;
  likelihood: number;
  /** The photo shows a person, not something FieldLens identifies. */
  person?: boolean;
};

export interface IdentificationProvider {
  readonly name: string;
  readonly acceptedMimeTypes: readonly string[];
  readonly maxImages: number;
  /** Whether this provider can identify a specific category or group. */
  supports(target: IdentifyTarget): boolean;
  identify(input: IdentificationInput): Promise<IdentificationResult>;
  /** Optional: work out which category a photo belongs to ("Not sure"). */
  detectCategory?(input: IdentificationInput): Promise<CategoryDetectionResult>;
}

export type ResolvedTaxon = TaxonomyRanks & {
  gbifKey?: number;
  scientificName: string;
  canonicalName?: string;
  genusKey?: number;
  familyKey?: number;
  vernacularName?: string;
};

export interface TaxonomyProvider {
  readonly name: string;
  resolveTaxon(taxon: TaxonIdentity): Promise<ResolvedTaxon | undefined>;
  /** Common name for a taxon key (e.g. a genus: 3189834 → "maple"), if known. */
  commonNameForKey?(key: number): Promise<string | undefined>;
}

export interface OccurrenceProvider {
  readonly name: string;
  getOccurrenceEvidence(
    taxon: TaxonIdentity,
    location: ApproxLocation,
    date: Date,
  ): Promise<OccurrenceEvidence>;
}

export interface NearbySpeciesProvider {
  readonly name: string;
  getNearbySpecies(
    taxon: TaxonIdentity & { genusKey?: number; familyKey?: number },
    location: ApproxLocation,
    exclude: Set<string>,
  ): Promise<NearbySpeciesGroup | undefined>;
}

/** Partial info from one source; the pipeline merges several into a SpeciesInfo. */
export type SpeciesInfoPart = Partial<Omit<SpeciesInfo, 'scientificName'>> & {
  source: string;
  /** Wikidata P789 edibility labels (mostly mushrooms), used by the safety section. */
  edibility?: string[];
  wikidataUrl?: string;
};

export interface SpeciesInfoProvider {
  readonly name: string;
  getSpeciesInfo(
    taxon: TaxonIdentity,
    context: { wikipediaTitle?: string },
  ): Promise<SpeciesInfoPart & { wikipediaTitle?: string }>;
}

export interface CommunityObservationProvider {
  readonly name: string;
  getNearbyObservations(
    taxon: TaxonIdentity,
    location: ApproxLocation | undefined,
  ): Promise<CommunityObservationSummary>;
}

export type ProviderSet = {
  identification: IdentificationProvider[];
  taxonomy: TaxonomyProvider;
  occurrence: OccurrenceProvider;
  nearbySpecies: NearbySpeciesProvider;
  /** Applied in order; later providers may use `wikipediaTitle` discovered by earlier ones. */
  speciesInfo: SpeciesInfoProvider[];
  community: CommunityObservationProvider;
  /** Quoted edibility/toxicity sentences for plants and fungi (optional). */
  safety?: SafetyTextProvider;
  /** Candidate species for tracks and droppings (optional). */
  signCandidates?: SignCandidateProvider;
  mock: boolean;
};
