import type { OnDeviceCall } from '../../shared/onDeviceCall.js';
import type {
  AnimalSign,
  ApproxLocation,
  Attribution,
  CategoryCheck,
  CommunityObservationSummary,
  ElevationSample,
  FeatureId,
  IdentifyTarget,
  NearbySpeciesGroup,
  OccurrenceEvidence,
  OrganismCandidate,
  OrganismCategory,
  RangeStatus,
  SpeciesInfo,
  TaxonIdentity,
  TaxonomyRanks,
  TiltBucket,
} from '../../shared/types.js';
import type { SafetyTextProvider } from '../safety/safety.js';
import type { ReferencePhotoProvider } from '../safety/lookalikePhotos.js';

export type InputImage = {
  data: Uint8Array;
  mimeType: string;
  feature: FeatureId;
};

/**
 * Calls: a validated mono 16-bit PCM WAV at `AUDIO.sampleRate`, or (with `onDevice`, and
 * empty `data`) BirdNET's result from the phone, when the recording never left it.
 */
export type InputAudio = {
  data: Uint8Array;
  mimeType: 'audio/wav';
  seconds: number;
  onDevice?: OnDeviceCall;
};

export type IdentificationInput = {
  observationId: string;
  /** A specific category, a group ("bug", "animal") or "auto"; see the pipeline. */
  category: IdentifyTarget;
  images: InputImage[];
  /** Calls: identify this recording instead of photos. */
  audio?: InputAudio;
  location?: ApproxLocation;
  /** Where the position came from: the device now, or the photo's own GPS. */
  locationSource?: 'device' | 'photo';
  capturedAt: Date;
  /**
   * Wall-clock hour (0–24, fractional) where the photo was taken: the phone clock for camera
   * photos, the EXIF date for library photos. Absent when unknown.
   */
  localHour?: number;
  /** The hour is only approximate (EXIF time zone unknown), so `capturedAt` isn't a trusted instant. */
  localHourApprox?: boolean;
  /** Which way the camera pointed (camera photos only). */
  tilt?: TiltBucket;
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
  'finalConfidence' | 'geographicSupport' | 'seasonalSupport' | 'occurrence' | 'nudges'
>;

export type IdentificationResult = {
  provider: string;
  candidates: ProviderCandidate[];
  attribution: Attribution[];
  experimental?: boolean;
  categoryCheck?: CategoryCheck;
  /** The photo shows a person; no candidates are returned. */
  person?: boolean;
  /** Calls: a non-bird sound ("Human vocal", "Dog", "Engine"…) was louder than any bird. */
  sound?: string;
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
    /** With the site's elevation, also count nearby records at a similar elevation. */
    options?: { elevation?: ElevationSample },
  ): Promise<OccurrenceEvidence>;
}

export interface ElevationProvider {
  readonly name: string;
  /** Ground elevation around a location; undefined when it can't be looked up. */
  getElevation(location: ApproxLocation): Promise<ElevationSample | undefined>;
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

export interface FloweringProvider {
  readonly name: string;
  /** Nearby research-grade records annotated as flowering, per month (index 0 = January). */
  getFloweringMonths(taxon: TaxonIdentity, location: ApproxLocation): Promise<number[] | undefined>;
}

/** Lower-cased names of the bird species reported near a location recently. */
export type RecentBirds = { scientificNames: Set<string>; commonNames: Set<string> };

export interface RecentBirdsProvider {
  readonly name: string;
  /** Undefined when the area has too few recent reports for absence to mean anything. */
  getRecentBirds(location: ApproxLocation): Promise<RecentBirds | undefined>;
}

export interface RangeProvider {
  readonly name: string;
  /** Keyed by lower-cased scientific name; species without a range map are left out. */
  getRangeStatus(
    scientificNames: string[],
    location: ApproxLocation,
  ): Promise<Map<string, RangeStatus>>;
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
  /** One openly licensed reference photo per named look-alike in safety warnings (optional). */
  referencePhotos?: ReferencePhotoProvider;
  /** Candidate species for tracks and droppings (optional). */
  signCandidates?: SignCandidateProvider;
  /** When plants flower locally, for photos of flowers (optional). */
  flowering?: FloweringProvider;
  /** Birds reported nearby in the last month (optional; needs an eBird key). */
  recentBirds?: RecentBirdsProvider;
  /** Identifies bird calls from recordings (optional). */
  audio?: IdentificationProvider;
  /** Modelled species ranges (optional). */
  ranges?: RangeProvider;
  /** Ground elevation from a terrain model (optional). */
  elevation?: ElevationProvider;
  mock: boolean;
};
