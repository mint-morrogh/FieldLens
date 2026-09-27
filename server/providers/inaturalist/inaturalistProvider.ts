import { CACHE_TTL_MS, GEO, TIMEOUTS_MS } from '../../../shared/config.js';
import { CATEGORIES } from '../../../shared/categories.js';
import { locationCacheKey } from '../../../shared/geo.js';
import type {
  ApproxLocation,
  CommunityObservation,
  CommunityObservationSummary,
  LicensedImage,
  TaxonIdentity,
} from '../../../shared/types.js';
import { cached, sharedCache, type Cache } from '../../cache/cache.js';
import { fetchJson } from '../../lib/http.js';
import type {
  CommunityObservationProvider,
  SpeciesInfoPart,
  SpeciesInfoProvider,
} from '../types.js';

export const INAT_SOURCE = 'iNaturalist';
export const INAT_ATTRIBUTION = {
  provider: INAT_SOURCE,
  text: 'Community observations from iNaturalist',
  url: 'https://www.inaturalist.org/',
};
const API = 'https://api.inaturalist.org/v1';
const SITE = 'https://www.inaturalist.org';

type INatPhoto = {
  url?: string;
  medium_url?: string;
  license_code?: string | null;
  attribution?: string;
};
type INatTaxon = {
  id: number;
  name: string;
  rank?: string;
  preferred_common_name?: string;
  observations_count?: number;
  iconic_taxon_name?: string;
};
type INatObservation = {
  id: number;
  observed_on?: string | null;
  place_guess?: string | null;
  quality_grade?: string;
  uri?: string;
  photos?: INatPhoto[];
};
type INatSearch<T> = { total_results: number; results: T };

/** Only openly licensed photos may be displayed; "all rights reserved" photos have no license code. */
export function licensedPhoto(
  photo: INatPhoto | undefined,
  observationUrl: string,
  size: 'small' | 'medium' = 'small',
): LicensedImage | undefined {
  if (!photo?.url || !photo.license_code) return undefined;
  return {
    url: photo.url.replace('/square.', `/${size}.`),
    thumbnailUrl: photo.url,
    author: photo.attribution,
    license: photo.license_code.toUpperCase(),
    source: INAT_SOURCE,
    sourceUrl: observationUrl,
  };
}

function isoDaysAgo(days: number, now: Date): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
}

export class INaturalistObservationProvider implements CommunityObservationProvider {
  readonly name = INAT_SOURCE;

  constructor(
    private readonly cache: Cache = sharedCache,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private get<T>(
    path: string,
    params: Record<string, string | number | undefined>,
    ttlMs: number,
  ): Promise<T> {
    const search = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined) search.append(k, String(v));
    const url = `${API}${path}?${search}`;
    return cached(this.cache, `inat:${url}`, ttlMs, () =>
      fetchJson<T>(url, {
        service: INAT_SOURCE,
        timeoutMs: TIMEOUTS_MS.supporting,
        fetchImpl: this.fetchImpl,
      }),
    );
  }

  async resolveTaxon(taxon: TaxonIdentity): Promise<INatTaxon | undefined> {
    const iconic = CATEGORIES[taxon.category].inaturalistIconicTaxon;
    const res = await this.get<INatSearch<INatTaxon[]>>(
      '/taxa',
      { q: taxon.scientificName, is_active: 'true', per_page: 5 },
      CACHE_TTL_MS.taxonomy,
    );
    const wanted = taxon.scientificName.toLowerCase();
    return (
      res.results.find(
        (t) => t.name.toLowerCase() === wanted && (!iconic || t.iconic_taxon_name === iconic),
      ) ?? res.results.find((t) => t.name.toLowerCase() === wanted)
    );
  }

  async getNearbyObservations(
    taxon: TaxonIdentity,
    location: ApproxLocation | undefined,
  ): Promise<CommunityObservationSummary> {
    const inatTaxon = taxon.inaturalistId
      ? ({ id: taxon.inaturalistId, name: taxon.scientificName } as INatTaxon)
      : await this.resolveTaxon(taxon);
    const recentDays = GEO.communityRecentDays;

    if (!inatTaxon) {
      return {
        source: INAT_SOURCE,
        taxonName: taxon.scientificName,
        recentDays,
        recentObservations: [],
      };
    }

    const taxonUrl = `${SITE}/taxa/${inatTaxon.id}`;
    const base: CommunityObservationSummary = {
      source: INAT_SOURCE,
      taxonName: inatTaxon.name,
      taxonCommonName: inatTaxon.preferred_common_name || undefined,
      taxonUrl,
      recentDays,
      globalCount: inatTaxon.observations_count,
      recentObservations: [],
    };
    if (!location) return base;

    const radiusKm = GEO.communityRadiusKm;
    const [lat, lng] = locationCacheKey(location).split(',');
    const geo = { taxon_id: inatTaxon.id, lat, lng, radius: radiusKm, verifiable: 'true' };
    const d1 = isoDaysAgo(recentDays, this.now());

    // Sequential-ish and cached: iNaturalist asks clients to keep request rates low.
    const [all, recent, histogram] = await Promise.all([
      this.get<INatSearch<INatObservation[]>>(
        '/observations',
        { ...geo, per_page: 1, order_by: 'observed_on', order: 'desc' },
        CACHE_TTL_MS.community,
      ),
      this.get<INatSearch<INatObservation[]>>(
        '/observations',
        { ...geo, d1, per_page: 6, order_by: 'observed_on', order: 'desc' },
        CACHE_TTL_MS.community,
      ),
      this.get<{ results: { month_of_year?: Record<string, number> } }>(
        '/observations/histogram',
        { ...geo, interval: 'month_of_year', date_field: 'observed' },
        CACHE_TTL_MS.community,
      ).catch(() => undefined),
    ]);

    const toObservation = (o: INatObservation): CommunityObservation => {
      const url = o.uri ?? `${SITE}/observations/${o.id}`;
      return {
        id: o.id,
        observedOn: o.observed_on ?? undefined,
        // place_guess can be very specific (street address); keep only the broader trailing parts.
        placeGuess: o.place_guess ? coarsenPlace(o.place_guess) : undefined,
        qualityGrade: o.quality_grade,
        url,
        photo: licensedPhoto(o.photos?.[0], url),
      };
    };

    const monthMap = histogram?.results.month_of_year;
    return {
      ...base,
      radiusKm,
      nearbyCount: all.total_results,
      recentCount: recent.total_results,
      mostRecentDate: all.results[0]?.observed_on ?? undefined,
      monthCounts: monthMap
        ? Array.from({ length: 12 }, (_, i) => monthMap[String(i + 1)] ?? 0)
        : undefined,
      recentObservations: recent.results.map(toObservation),
      exploreUrl: `${SITE}/observations?taxon_id=${inatTaxon.id}&lat=${lat}&lng=${lng}&radius=${radiusKm}`,
    };
  }
}

const STREET =
  /\b(st|rd|dr|ave|ln|road|street|drive|lane|way|ct|court|blvd|hwy|highway|cres|crescent|pl|place|terrace|trail)\b\.?$/i;

/**
 * Reduce an observer's free-text place to town/region level:
 * "12 Horton Dr, Stratford, PE C1E 1K6, CA" → "Stratford, PE, CA".
 */
export function coarsenPlace(place: string): string {
  const parts = place
    .split(',')
    // Drop any word containing a digit (house numbers, postal/ZIP codes).
    .map((p) =>
      p
        .split(/\s+/)
        .filter((w) => w && !/\d/.test(w))
        .join(' ')
        .trim(),
    )
    .filter(Boolean);
  while (parts.length > 1 && STREET.test(parts[0])) parts.shift();
  return parts.slice(-3).join(', ');
}

/**
 * Reference photos of a taxon from iNaturalist, for the result gallery. Works for
 * any organism group, so future animal/fungus providers get galleries for free.
 * Only openly licensed photos are returned, each with its attribution.
 */
export class INaturalistTaxonPhotosProvider implements SpeciesInfoProvider {
  readonly name = INAT_SOURCE;

  constructor(
    private readonly observations: INaturalistObservationProvider = new INaturalistObservationProvider(),
    private readonly cache: Cache = sharedCache,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly maxPhotos = 8,
  ) {}

  async getSpeciesInfo(taxon: TaxonIdentity): Promise<SpeciesInfoPart> {
    const inatTaxon = await this.observations.resolveTaxon(taxon);
    if (!inatTaxon) return { source: INAT_SOURCE };
    const url = `${API}/taxa/${inatTaxon.id}`;
    const detail = await cached(this.cache, `inat:${url}`, CACHE_TTL_MS.speciesInfo, () =>
      fetchJson<{ results: { taxon_photos?: { photo: INatPhoto }[] }[] }>(url, {
        service: INAT_SOURCE,
        timeoutMs: TIMEOUTS_MS.supporting,
        fetchImpl: this.fetchImpl,
      }),
    );
    const taxonUrl = `${SITE}/taxa/${inatTaxon.id}`;
    const images = (detail.results[0]?.taxon_photos ?? [])
      .map((tp) => licensedPhoto(tp.photo, taxonUrl, 'medium'))
      .filter((img): img is LicensedImage => !!img)
      .slice(0, this.maxPhotos);
    return { source: INAT_SOURCE, images };
  }
}
