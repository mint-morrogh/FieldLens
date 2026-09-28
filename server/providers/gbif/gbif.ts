import { CACHE_TTL_MS, GEO, TIMEOUTS_MS } from '../../../shared/config.js';
import { CATEGORIES } from '../../../shared/categories.js';
import { locationCacheKey } from '../../../shared/geo.js';
import type {
  ApproxLocation,
  ElevationEvidence,
  ElevationSample,
  NearbySpeciesGroup,
  OccurrenceEvidence,
  SpeciesFact,
  TaxonIdentity,
} from '../../../shared/types.js';
import { cached, sharedCache, type Cache } from '../../cache/cache.js';
import { fetchJson } from '../../lib/http.js';
import type {
  NearbySpeciesProvider,
  OccurrenceProvider,
  ResolvedTaxon,
  SpeciesInfoPart,
  SpeciesInfoProvider,
  TaxonomyProvider,
} from '../types.js';

export const GBIF_SOURCE = 'GBIF';
export const GBIF_ATTRIBUTION = {
  provider: GBIF_SOURCE,
  text: 'Taxonomy and occurrence records from GBIF.org',
  url: 'https://www.gbif.org/',
};
const API = 'https://api.gbif.org/v1';

type GbifMatch = {
  usageKey?: number;
  acceptedUsageKey?: number;
  scientificName?: string;
  canonicalName?: string;
  rank?: string;
  status?: string;
  matchType?: string;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
  genusKey?: number;
  familyKey?: number;
};

type GbifSpecies = GbifMatch & { key: number; vernacularName?: string; taxonomicStatus?: string };

type GbifOccurrenceSearch = {
  count: number;
  facets?: { field: string; counts: { name: string; count: number }[] }[];
};

export class GbifClient {
  constructor(
    private readonly cache: Cache = sharedCache,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get<T>(
    path: string,
    params: Record<string, string | number | undefined>,
    ttlMs: number,
  ): Promise<T> {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) search.append(k, String(v));
    const url = `${API}${path}?${search}`;
    return cached(this.cache, `gbif:${url}`, ttlMs, () =>
      fetchJson<T>(url, {
        service: GBIF_SOURCE,
        timeoutMs: TIMEOUTS_MS.supporting,
        fetchImpl: this.fetchImpl,
      }),
    );
  }

  species(key: number): Promise<GbifSpecies> {
    return this.get<GbifSpecies>(`/species/${key}`, {}, CACHE_TTL_MS.taxonomy);
  }

  occurrenceCount(
    params: Record<string, string | number | undefined>,
  ): Promise<GbifOccurrenceSearch> {
    return this.get<GbifOccurrenceSearch>(
      '/occurrence/search',
      { limit: 0, occurrenceStatus: 'PRESENT', hasGeospatialIssue: 'false', ...params },
      CACHE_TTL_MS.occurrence,
    );
  }
}

function geoDistance(location: ApproxLocation, radiusKm: number): string {
  // Coordinates are already rounded to the privacy grid; locationCacheKey keeps the format stable.
  return `${locationCacheKey(location)},${radiusKm}km`;
}

export class GbifTaxonomyProvider implements TaxonomyProvider {
  readonly name = GBIF_SOURCE;
  constructor(private readonly client: GbifClient = new GbifClient()) {}

  async commonNameForKey(key: number): Promise<string | undefined> {
    const s = await this.client.species(key);
    return s.vernacularName?.trim() || undefined;
  }

  async resolveTaxon(taxon: TaxonIdentity): Promise<ResolvedTaxon | undefined> {
    const kingdom = CATEGORIES[taxon.category].gbifKingdom;
    const match = await this.client.get<GbifMatch>(
      '/species/match',
      { name: taxon.scientificName, kingdom, genus: taxon.genus, family: taxon.family },
      CACHE_TTL_MS.taxonomy,
    );
    if (!match.usageKey || match.matchType === 'NONE' || match.matchType === 'HIGHERRANK')
      return undefined;

    let usage: GbifMatch & { key?: number; vernacularName?: string } = match;
    let key = match.usageKey;
    if (match.acceptedUsageKey && match.acceptedUsageKey !== match.usageKey) {
      // Synonym: follow to the accepted name.
      usage = await this.client.species(match.acceptedUsageKey);
      key = match.acceptedUsageKey;
    }
    return {
      gbifKey: key,
      scientificName: usage.scientificName ?? taxon.scientificName,
      canonicalName: usage.canonicalName ?? usage.species ?? taxon.scientificName,
      kingdom: usage.kingdom,
      phylum: usage.phylum,
      className: usage.class,
      order: usage.order,
      family: usage.family,
      genus: usage.genus,
      species: usage.species,
      genusKey: usage.genusKey,
      familyKey: usage.familyKey,
      vernacularName: usage.vernacularName,
    };
  }
}

export function parseMonthFacet(result: GbifOccurrenceSearch): number[] | undefined {
  const facet = result.facets?.find((f) => f.field === 'MONTH');
  if (!facet) return undefined;
  const months = new Array<number>(12).fill(0);
  for (const { name, count } of facet.counts) {
    const m = Number(name);
    if (m >= 1 && m <= 12) months[m - 1] = count;
  }
  return months;
}

/** Metres either side of the local terrain's range that still count as "this elevation". */
export const ELEVATION_MARGIN_M = 250;
/** GBIF range filter that matches every record carrying an elevation. */
const ANY_ELEVATION = '-1000,9000';

export function elevationBand(site: ElevationSample): [number, number] {
  return [
    Math.max(-500, site.minM - ELEVATION_MARGIN_M),
    Math.min(8900, site.maxM + ELEVATION_MARGIN_M),
  ];
}

export class GbifOccurrenceProvider implements OccurrenceProvider {
  readonly name = GBIF_SOURCE;
  constructor(
    private readonly client: GbifClient = new GbifClient(),
    private readonly radiiKm: readonly number[] = GEO.searchRadiiKm,
  ) {}

  async getOccurrenceEvidence(
    taxon: TaxonIdentity,
    location: ApproxLocation,
    _date?: Date,
    options: { elevation?: ElevationSample } = {},
  ): Promise<OccurrenceEvidence> {
    if (!taxon.gbifKey) throw new Error('GBIF key required for occurrence search');
    const radii = [...this.radiiKm].sort((a, b) => a - b);
    const widest = radii[radii.length - 1];
    const results = await Promise.all(
      radii.map((radiusKm) =>
        this.client.occurrenceCount({
          taxonKey: taxon.gbifKey,
          geoDistance: geoDistance(location, radiusKm),
          ...(radiusKm === widest ? { facet: 'month', facetLimit: 12 } : {}),
        }),
      ),
    );
    const radiusCounts = radii.map((radiusKm, i) => ({ radiusKm, count: results[i].count }));
    const elevation =
      options.elevation && results[results.length - 1].count > 0
        ? await this.elevationEvidence(taxon.gbifKey, location, widest, options.elevation).catch(
            () => undefined,
          )
        : undefined;
    return {
      source: GBIF_SOURCE,
      radiusCounts,
      nearestRadiusKm: radiusCounts.find((r) => r.count > 0)?.radiusKm,
      monthCounts: parseMonthFacet(results[results.length - 1]),
      ...(elevation && { elevation }),
    };
  }

  /**
   * GBIF can't facet on elevation, so two counts within the widest radius: records that carry
   * an elevation at all, and those inside the band around the site's terrain. Many records
   * (most iNaturalist and eBird ones) have no elevation, so this is often too sparse to use.
   */
  private async elevationEvidence(
    taxonKey: number,
    location: ApproxLocation,
    radiusKm: number,
    site: ElevationSample,
  ): Promise<ElevationEvidence> {
    const bandM = elevationBand(site);
    const [all, inBand] = await Promise.all(
      [ANY_ELEVATION, `${bandM[0]},${bandM[1]}`].map((elevation) =>
        this.client.occurrenceCount({
          taxonKey,
          geoDistance: geoDistance(location, radiusKm),
          elevation,
        }),
      ),
    );
    return {
      site,
      bandM,
      recordsWithElevation: all.count,
      recordsInBand: Math.min(inBand.count, all.count),
    };
  }
}

const IUCN_LABELS: Record<string, string> = {
  EX: 'Extinct',
  EW: 'Extinct in the wild',
  CR: 'Critically endangered',
  EN: 'Endangered',
  VU: 'Vulnerable',
  NT: 'Near threatened',
  LC: 'Least concern',
  DD: 'Data deficient',
};

export class GbifSpeciesInfoProvider implements SpeciesInfoProvider {
  readonly name = GBIF_SOURCE;
  constructor(private readonly client: GbifClient = new GbifClient()) {}

  async getSpeciesInfo(taxon: TaxonIdentity): Promise<SpeciesInfoPart> {
    if (!taxon.gbifKey) return { source: GBIF_SOURCE };
    const key = taxon.gbifKey;
    const [iucn, global] = await Promise.all([
      this.client
        .get<{ code?: string; category?: string }>(
          `/species/${key}/iucnRedListCategory`,
          {},
          CACHE_TTL_MS.speciesInfo,
        )
        .catch(() => undefined),
      // One request gives the worldwide total and the per-country breakdown for the globe.
      this.client
        .occurrenceCount({ taxonKey: key, facet: 'country', facetLimit: 250 })
        .catch(() => undefined),
    ]);
    const gbifUrl = `https://www.gbif.org/species/${key}`;
    const facts: SpeciesFact[] = [];
    if (iucn?.code && IUCN_LABELS[iucn.code]) {
      facts.push({
        label: 'Conservation status (IUCN)',
        value: `${IUCN_LABELS[iucn.code]} (${iucn.code})`,
        source: 'IUCN Red List via GBIF',
        sourceUrl: gbifUrl,
      });
    }
    if (global && global.count > 0) {
      facts.push({
        label: 'Records worldwide',
        value: `${global.count.toLocaleString('en-US')} occurrence records`,
        source: GBIF_SOURCE,
        sourceUrl: `https://www.gbif.org/occurrence/search?taxon_key=${key}`,
      });
    }
    const countryFacet = global?.facets?.find((f) => f.field === 'COUNTRY')?.counts ?? [];
    const countries = countryFacet
      .filter((c) => /^[A-Z]{2}$/.test(c.name) && c.name !== 'ZZ' && c.count > 0)
      .map((c) => ({ code: c.name, count: c.count }));
    return {
      source: GBIF_SOURCE,
      facts,
      links: [{ label: 'GBIF', url: gbifUrl }],
      distribution:
        global && countries.length
          ? {
              source: GBIF_SOURCE,
              sourceUrl: `https://www.gbif.org/species/${key}`,
              total: global.count,
              countries,
            }
          : undefined,
    };
  }
}

export class GbifNearbySpeciesProvider implements NearbySpeciesProvider {
  readonly name = GBIF_SOURCE;
  constructor(
    private readonly client: GbifClient = new GbifClient(),
    private readonly radiusKm: number = GEO.nearbySpeciesRadiusKm,
  ) {}

  async getNearbySpecies(
    taxon: TaxonIdentity & { genusKey?: number; familyKey?: number },
    location: ApproxLocation,
    exclude: Set<string>,
  ): Promise<NearbySpeciesGroup | undefined> {
    const groups: { key?: number; param: 'genusKey' | 'familyKey'; name?: string }[] = [
      { key: taxon.genusKey, param: 'genusKey', name: taxon.genus },
      { key: taxon.familyKey, param: 'familyKey', name: taxon.family },
    ];
    for (const group of groups) {
      if (!group.key) continue;
      const result = await this.client.occurrenceCount({
        [group.param]: group.key,
        geoDistance: geoDistance(location, this.radiusKm),
        facet: 'speciesKey',
        facetLimit: 12,
      });
      const counts = result.facets?.find((f) => f.field === 'SPECIES_KEY')?.counts ?? [];
      const keys = counts
        .map((c) => ({ key: Number(c.name), count: c.count }))
        .filter((c) => Number.isFinite(c.key));
      const species = await Promise.all(
        keys.map(async ({ key, count }) => {
          const s = await this.client.species(key).catch(() => undefined);
          const scientificName = s?.canonicalName ?? s?.species;
          if (!scientificName) return undefined;
          return {
            scientificName,
            commonName: s?.vernacularName,
            gbifKey: key,
            count,
            url: `https://www.gbif.org/species/${key}`,
          };
        }),
      );
      const filtered = species
        .filter(
          (s): s is NonNullable<typeof s> => !!s && !exclude.has(s.scientificName.toLowerCase()),
        )
        .slice(0, 6);
      if (filtered.length >= 2 || (group.param === 'familyKey' && filtered.length > 0)) {
        return {
          label: group.name
            ? `Other ${group.name} species recorded nearby`
            : 'Related species recorded nearby',
          radiusKm: this.radiusKm,
          species: filtered,
        };
      }
    }
    return undefined;
  }
}
