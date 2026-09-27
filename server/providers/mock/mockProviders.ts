import type {
  ApproxLocation,
  CommunityObservationSummary,
  LicensedImage,
  NearbySpeciesGroup,
  OccurrenceEvidence,
  OrganismCategory,
  TaxonIdentity,
} from '../../../shared/types.js';
import { UpstreamError } from '../../lib/errors.js';
import { GBIF_SOURCE } from '../gbif/gbif.js';
import { slugId, taxonLinks } from '../plantnet/plantnetProvider.js';
import type {
  CommunityObservationProvider,
  IdentificationInput,
  IdentificationProvider,
  IdentificationResult,
  NearbySpeciesProvider,
  OccurrenceProvider,
  ProviderSet,
  ResolvedTaxon,
  SpeciesInfoPart,
  SpeciesInfoProvider,
  TaxonomyProvider,
} from '../types.js';
import {
  FIXTURES,
  INSECT_FIXTURES,
  NEARBY_FIXTURES,
  findFixture,
  fixtureOccurrence,
  fixtureTaxon,
  type MockScenario,
} from './fixtures.js';

const MOCK_ATTRIBUTION = {
  provider: 'FieldLens demo data',
  text: 'Demo mode: results are fixtures, not a real identification',
  url: 'https://github.com/mint-morrogh/FieldLens#mock-mode',
};

const GENUS_COMMON_NAMES: Record<number, string> = {
  3189834: 'maple',
  2973363: 'clover',
  5388868: 'goldenrod',
};

/** A real CC0 iNaturalist photo, so demo mode can show the reference gallery. */
const DEMO_GALLERY: Record<string, LicensedImage[]> = {
  'Acer rubrum': [
    {
      url: 'https://inaturalist-open-data.s3.amazonaws.com/photos/371065093/medium.jpg',
      thumbnailUrl: 'https://inaturalist-open-data.s3.amazonaws.com/photos/371065093/square.jpg',
      author: 'no rights reserved, uploaded by mefisher',
      license: 'CC0',
      source: 'iNaturalist',
      sourceUrl: 'https://www.inaturalist.org/taxa/48098',
    },
  ],
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

export class MockIdentificationProvider implements IdentificationProvider {
  readonly name = 'Mock identification';
  readonly acceptedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
  readonly maxImages = 5;

  constructor(
    private readonly scenario: MockScenario,
    private readonly latencyMs = 350,
  ) {}

  supports(category: OrganismCategory): boolean {
    return category === 'plant' || category === 'insect' || category === 'arachnid';
  }

  async identify(input: IdentificationInput): Promise<IdentificationResult> {
    await delay(this.latencyMs);
    if (this.scenario === 'quota') throw new UpstreamError('Pl@ntNet', 'http', 429);
    if (this.scenario === 'network') throw new UpstreamError('Pl@ntNet', 'network');
    if (this.scenario === 'timeout') throw new UpstreamError('Pl@ntNet', 'timeout');
    if (input.category !== 'plant') return this.identifyAnimal(input);
    if (this.scenario === 'zero')
      return { provider: this.name, candidates: [], attribution: [MOCK_ATTRIBUTION] };

    const set =
      this.scenario === 'medium'
        ? FIXTURES.medium
        : this.scenario === 'low'
          ? FIXTURES.low
          : FIXTURES.high;
    // Extra photos nudge the top score upward, mimicking multi-image fusion.
    const boost = Math.min(0.12, (input.images.length - 1) * 0.06);
    const candidates = set.map((s, i) => ({
      id: slugId('mock', s.scientificName),
      category: input.category,
      scientificName: s.scientificName,
      scientificNameAuthorship: s.authorship,
      commonName: s.commonNames[0],
      commonNames: s.commonNames,
      genus: s.genus,
      family: s.family,
      kingdom: 'Plantae',
      taxonKeys: { gbif: s.gbifKey },
      visualConfidence: Math.min(0.99, i === 0 ? s.score + boost : s.score),
      source: { identification: this.name },
      links: taxonLinks({ gbifKey: s.gbifKey }),
    }));
    return { provider: this.name, candidates, attribution: [MOCK_ATTRIBUTION] };
  }

  /** Insects & spiders (BioCLIP in live mode): experimental, with a category check. */
  private identifyAnimal(input: IdentificationInput): IdentificationResult {
    if (this.scenario === 'wrong-category') {
      return {
        provider: 'Mock BioCLIP',
        candidates: [],
        attribution: [MOCK_ATTRIBUTION],
        experimental: true,
        categoryCheck: {
          matchesCategory: false,
          likelihood: 0.08,
          suggestedCategory: 'plant',
          suggestedGroup: 'Plantae',
        },
      };
    }
    const candidates = INSECT_FIXTURES.map((s) => ({
      id: slugId('mock', s.scientificName),
      category: input.category,
      scientificName: s.scientificName,
      scientificNameAuthorship: s.authorship,
      commonName: s.commonNames[0],
      commonNames: s.commonNames,
      genus: s.genus,
      family: s.family,
      kingdom: s.kingdom,
      className: s.className,
      taxonKeys: { gbif: s.gbifKey },
      visualConfidence: s.score,
      source: { identification: 'Mock BioCLIP' },
      links: taxonLinks({ gbifKey: s.gbifKey }),
    }));
    return {
      provider: 'Mock BioCLIP',
      candidates,
      attribution: [MOCK_ATTRIBUTION],
      experimental: true,
    };
  }
}

class MockTaxonomyProvider implements TaxonomyProvider {
  readonly name = GBIF_SOURCE;
  constructor(private readonly scenario: MockScenario) {}
  async commonNameForKey(key: number): Promise<string | undefined> {
    return GENUS_COMMON_NAMES[key];
  }
  async resolveTaxon(taxon: TaxonIdentity): Promise<ResolvedTaxon | undefined> {
    if (this.scenario === 'gbif-down') throw new UpstreamError(GBIF_SOURCE, 'timeout');
    const f = findFixture(taxon.scientificName);
    return f ? fixtureTaxon(f) : undefined;
  }
}

class MockOccurrenceProvider implements OccurrenceProvider {
  readonly name = GBIF_SOURCE;
  constructor(private readonly scenario: MockScenario) {}
  async getOccurrenceEvidence(taxon: TaxonIdentity): Promise<OccurrenceEvidence> {
    if (this.scenario === 'gbif-down') throw new UpstreamError(GBIF_SOURCE, 'timeout');
    const f = findFixture(taxon.scientificName);
    if (!f) throw new UpstreamError(GBIF_SOURCE, 'http', 404);
    return fixtureOccurrence(f);
  }
}

class MockNearbySpeciesProvider implements NearbySpeciesProvider {
  readonly name = GBIF_SOURCE;
  async getNearbySpecies(
    taxon: TaxonIdentity & { genusKey?: number },
  ): Promise<NearbySpeciesGroup | undefined> {
    const list = taxon.genus ? NEARBY_FIXTURES[taxon.genus] : undefined;
    if (!list) return undefined;
    return {
      label: `Other ${taxon.genus} species recorded nearby`,
      radiusKm: 25,
      species: list.map((s) => ({ ...s, url: `https://www.gbif.org/species/${s.gbifKey}` })),
    };
  }
}

class MockSpeciesInfoProvider implements SpeciesInfoProvider {
  readonly name = 'GBIF';
  constructor(private readonly scenario: MockScenario) {}
  async getSpeciesInfo(taxon: TaxonIdentity): Promise<SpeciesInfoPart> {
    if (this.scenario === 'gbif-down') throw new UpstreamError(GBIF_SOURCE, 'timeout');
    const f = findFixture(taxon.scientificName);
    if (!f) return { source: this.name };
    const gbifUrl = `https://www.gbif.org/species/${f.gbifKey}`;
    return {
      source: this.name,
      facts: [
        {
          label: 'Records worldwide',
          value: `${(f.radiusCounts[2] * 97).toLocaleString('en-US')} occurrence records (demo value)`,
          source: 'GBIF (demo)',
          sourceUrl: gbifUrl,
        },
      ],
      summary: {
        text: `Demo mode is on, so no encyclopedia text was fetched. With live providers enabled, this space shows the lead section of the Wikipedia article for ${f.scientificName}.`,
        source: 'FieldLens demo',
        sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(f.scientificName.replace(/ /g, '_'))}`,
        license: 'Demo text',
      },
      images: DEMO_GALLERY[f.scientificName],
      links: [
        {
          label: 'Wikipedia',
          url: `https://en.wikipedia.org/wiki/${encodeURIComponent(f.scientificName.replace(/ /g, '_'))}`,
        },
      ],
    };
  }
}

class MockCommunityProvider implements CommunityObservationProvider {
  readonly name = 'iNaturalist';
  constructor(
    private readonly scenario: MockScenario,
    private readonly now: () => Date = () => new Date(),
  ) {}
  async getNearbyObservations(
    taxon: TaxonIdentity,
    location: ApproxLocation | undefined,
  ): Promise<CommunityObservationSummary> {
    if (this.scenario === 'inat-down') throw new UpstreamError('iNaturalist', 'timeout');
    const f = findFixture(taxon.scientificName);
    const taxonUrl = `https://www.inaturalist.org/search?q=${encodeURIComponent(taxon.scientificName)}`;
    const base: CommunityObservationSummary = {
      source: 'iNaturalist',
      taxonName: taxon.scientificName,
      taxonUrl,
      recentDays: 90,
      globalCount: f ? f.radiusCounts[2] * 53 : undefined,
      recentObservations: [],
    };
    if (!location || !f) return base;
    const day = (n: number) =>
      new Date(this.now().getTime() - n * 86_400_000).toISOString().slice(0, 10);
    const nearby = Math.round(f.radiusCounts[1] * 0.5);
    return {
      ...base,
      radiusKm: 25,
      nearbyCount: nearby,
      recentCount: Math.round(nearby * 0.15),
      mostRecentDate: nearby > 0 ? day(5) : undefined,
      monthCounts: f.monthCounts.map((c) => Math.round(c * 0.4)),
      recentObservations:
        nearby > 0
          ? [5, 12, 26].map((d, i) => ({
              id: 100000 + i,
              observedOn: day(d),
              placeGuess: 'Demo location',
              qualityGrade: i === 0 ? 'research' : 'needs_id',
              url: taxonUrl,
            }))
          : [],
      exploreUrl: taxonUrl,
    };
  }
}

export function createMockProviders(scenario: MockScenario = 'high'): ProviderSet {
  return {
    identification: [new MockIdentificationProvider(scenario)],
    taxonomy: new MockTaxonomyProvider(scenario),
    occurrence: new MockOccurrenceProvider(scenario),
    nearbySpecies: new MockNearbySpeciesProvider(),
    speciesInfo: [new MockSpeciesInfoProvider(scenario)],
    community: new MockCommunityProvider(scenario),
    mock: true,
  };
}
