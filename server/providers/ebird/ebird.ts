import { CACHE_TTL_MS, TIMEOUTS_MS } from '../../../shared/config.js';
import { locationCacheKey } from '../../../shared/geo.js';
import type { ApproxLocation } from '../../../shared/types.js';
import { cached, sharedCache, type Cache } from '../../cache/cache.js';
import { fetchJson } from '../../lib/http.js';
import type { RecentBirdsProvider, RecentBirds } from '../types.js';

export const EBIRD_SOURCE = 'eBird';
export const EBIRD_ATTRIBUTION = {
  provider: EBIRD_SOURCE,
  text: 'Recent bird sightings from eBird (Cornell Lab of Ornithology)',
  url: 'https://ebird.org/',
};
const API = 'https://api.ebird.org/v2';
/** eBird's maximum search radius, and how far back "recently" reaches. */
export const EBIRD_RADIUS_KM = 50;
export const EBIRD_BACK_DAYS = 30;
/**
 * Fewer species than this reported in the last month means the area is barely birded,
 * so a species missing from the list says nothing.
 */
export const EBIRD_MIN_SPECIES = 30;

type EbirdObservation = { sciName?: string; comName?: string };

/** Species reported to eBird near a location in the last month. */
export class EbirdRecentProvider implements RecentBirdsProvider {
  readonly name = EBIRD_SOURCE;

  constructor(
    private readonly apiKey: string,
    private readonly cache: Cache = sharedCache,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getRecentBirds(location: ApproxLocation): Promise<RecentBirds | undefined> {
    const params = new URLSearchParams({
      lat: location.latitude.toFixed(2),
      lng: location.longitude.toFixed(2),
      dist: String(EBIRD_RADIUS_KM),
      back: String(EBIRD_BACK_DAYS),
      cat: 'species',
    });
    const observations = await cached(
      this.cache,
      `ebird:recent:${locationCacheKey(location)}`,
      CACHE_TTL_MS.community,
      () =>
        fetchJson<EbirdObservation[]>(`${API}/data/obs/geo/recent?${params}`, {
          service: EBIRD_SOURCE,
          timeoutMs: TIMEOUTS_MS.supporting,
          fetchImpl: this.fetchImpl,
          init: { headers: { 'X-eBirdApiToken': this.apiKey } },
        }),
    );
    if (!Array.isArray(observations) || observations.length < EBIRD_MIN_SPECIES) return undefined;
    const lower = (s?: string) => s?.trim().toLowerCase();
    return {
      scientificNames: new Set(
        observations.map((o) => lower(o.sciName)).filter(Boolean) as string[],
      ),
      commonNames: new Set(observations.map((o) => lower(o.comName)).filter(Boolean) as string[]),
    };
  }
}
