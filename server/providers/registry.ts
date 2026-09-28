import { CATEGORIES } from '../../shared/categories.js';
import type { OrganismCategory } from '../../shared/types.js';
import { BioclipIdentificationProvider } from './bioclip/bioclipProvider.js';
import type { ServerEnv } from '../lib/env.js';
import {
  GbifClient,
  GbifNearbySpeciesProvider,
  GbifOccurrenceProvider,
  GbifSpeciesInfoProvider,
  GbifTaxonomyProvider,
} from './gbif/gbif.js';
import {
  INaturalistObservationProvider,
  INaturalistTaxonPhotosProvider,
} from './inaturalist/inaturalistProvider.js';
import { BirdnetCallProvider } from './birdnet/birdnet.js';
import { EbirdRecentProvider } from './ebird/ebird.js';
import { OpenMeteoElevationProvider } from './elevation/openMeteo.js';
import { isMockScenario } from './mock/fixtures.js';
import { createMockProviders } from './mock/mockProviders.js';
import { HuggingFaceRangeProvider } from './ranges/ranges.js';
import { PlantNetIdentificationProvider } from './plantnet/plantnetProvider.js';
import { WikipediaSafetyProvider } from '../safety/safety.js';
import type { IdentificationProvider, ProviderSet } from './types.js';
import { WikidataSpeciesInfoProvider, WikipediaSpeciesSummaryProvider } from './wiki/wiki.js';

/**
 * Wires concrete providers together. Adding a new organism category means
 * adding its IdentificationProvider to the `identification` list — the
 * pipeline picks the first provider whose `supports(category)` is true.
 */
export function createLiveProviders(env: ServerEnv, fetchImpl: typeof fetch = fetch): ProviderSet {
  const identification: IdentificationProvider[] = [];
  if (env.plantnetApiKey) {
    identification.push(
      new PlantNetIdentificationProvider(env.plantnetApiKey, env.plantnetProject, fetchImpl),
    );
  }
  if (env.hfToken && env.bioclipSpaceUrl) {
    // BioCLIP 2 serves every available category that declares a taxon scope (insects, spiders…).
    const bioclipCategories = (Object.keys(CATEGORIES) as OrganismCategory[]).filter(
      (c) => CATEGORIES[c].available && CATEGORIES[c].taxonScope,
    );
    identification.push(
      new BioclipIdentificationProvider(
        env.bioclipSpaceUrl,
        env.hfToken,
        bioclipCategories,
        fetchImpl,
      ),
    );
  }

  const inat = new INaturalistObservationProvider(undefined, fetchImpl);
  const inatPhotos = new INaturalistTaxonPhotosProvider(inat, undefined, fetchImpl);
  const gbif = new GbifClient(undefined, fetchImpl);
  return {
    identification,
    taxonomy: new GbifTaxonomyProvider(gbif),
    occurrence: new GbifOccurrenceProvider(gbif),
    nearbySpecies: new GbifNearbySpeciesProvider(gbif),
    speciesInfo: [
      new GbifSpeciesInfoProvider(gbif),
      new WikidataSpeciesInfoProvider(undefined, fetchImpl),
      new WikipediaSpeciesSummaryProvider(undefined, fetchImpl),
      inatPhotos,
    ],
    community: inat,
    safety: new WikipediaSafetyProvider(undefined, fetchImpl),
    referencePhotos: inatPhotos,
    signCandidates: inat,
    flowering: inat,
    audio:
      env.hfToken && env.bioclipSpaceUrl
        ? new BirdnetCallProvider(env.bioclipSpaceUrl, env.hfToken, fetchImpl)
        : undefined,
    ranges:
      env.hfToken && env.rangesDataset
        ? new HuggingFaceRangeProvider(env.rangesDataset, env.hfToken, fetchImpl)
        : undefined,
    recentBirds: env.ebirdApiKey ? new EbirdRecentProvider(env.ebirdApiKey) : undefined,
    elevation: new OpenMeteoElevationProvider(undefined, fetchImpl),
    mock: false,
  };
}

export function getProviders(env: ServerEnv, mockScenario?: string): ProviderSet {
  if (env.useMockApi)
    return createMockProviders(isMockScenario(mockScenario) ? mockScenario : 'high');
  return createLiveProviders(env);
}

/** Categories that have a working identification provider under this configuration. */
export function supportedCategories(env: ServerEnv): OrganismCategory[] {
  const categories: OrganismCategory[] = [
    'plant',
    'bird',
    'mammal',
    'reptile',
    'amphibian',
    'fish',
    'insect',
    'arachnid',
    'fungus',
    'other',
  ];
  const providers = env.useMockApi
    ? createMockProviders().identification
    : createLiveProviders(env).identification;
  return categories.filter((c) => providers.some((p) => p.supports(c)));
}

/** Whether any configured provider can detect the category itself ("Not sure"). */
export function canAutoDetect(env: ServerEnv): boolean {
  const providers = env.useMockApi
    ? createMockProviders().identification
    : createLiveProviders(env).identification;
  return providers.some((p) => typeof p.detectCategory === 'function');
}
