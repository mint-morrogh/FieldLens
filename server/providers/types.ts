import type {
  ApproxLocation,
  Attribution,
  CategoryCheck,
  CommunityObservationSummary,
  FeatureId,
  NearbySpeciesGroup,
  OccurrenceEvidence,
  OrganismCandidate,
  OrganismCategory,
  SpeciesInfo,
  TaxonIdentity,
  TaxonomyRanks,
} from '../../shared/types.js';

export type InputImage = {
  data: Uint8Array;
  mimeType: string;
  feature: FeatureId;
};

export type IdentificationInput = {
  observationId: string;
  category: OrganismCategory;
  images: InputImage[];
  location?: ApproxLocation;
  capturedAt: Date;
  /** Only honoured by mock providers. */
  mockScenario?: string;
};

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
  /** Provider-native response, kept only for debugging; never sent to the UI. */
  raw?: unknown;
};

export interface IdentificationProvider {
  readonly name: string;
  readonly acceptedMimeTypes: readonly string[];
  readonly maxImages: number;
  supports(category: OrganismCategory): boolean;
  identify(input: IdentificationInput): Promise<IdentificationResult>;
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
export type SpeciesInfoPart = Partial<Omit<SpeciesInfo, 'scientificName'>> & { source: string };

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
  mock: boolean;
};
