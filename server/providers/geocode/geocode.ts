import { createHash } from 'node:crypto';
import { TIMEOUTS_MS } from '../../../shared/config.js';
import { GEOCODE, type GeocodeResponse, type GeocodeResult } from '../../../shared/geocode.js';
import { isValidLatLng, labelCell } from '../../../shared/geo.js';
import { MemoryCache, type Cache } from '../../cache/cache.js';
import { ApiError } from '../../lib/errors.js';
import { fetchJson } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';

/**
 * Place search for the home patch. Nominatim's usage policy
 * (https://operations.osmfoundation.org/policies/nominatim/) asks for an identifying
 * User-Agent, at most one request a second and caching; searches only run when the person
 * submits, never per keystroke. Coordinates are rounded to the ~11 km journal cells here,
 * labels are trimmed to town/region/country, and the query text is never logged (the cache
 * keys on a hash of it).
 */

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
export const OPEN_METEO_GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
export const GEOCODE_USER_AGENT = 'FieldLens/1.0 (personal field guide)';
export const OSM_ATTRIBUTION = '© OpenStreetMap contributors';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Places don't move: keep answers for a week (a fallback answer for a day). */
export const GEOCODE_TTL_MS = 7 * DAY_MS;
const FALLBACK_TTL_MS = DAY_MS;
/** Nominatim allows one request a second; leave a little slack. */
export const NOMINATIM_INTERVAL_MS = 1100;
/** Searches waiting for their turn on this instance before new ones are turned away. */
const MAX_QUEUED = 10;

type NominatimPlace = {
  lat?: string;
  lon?: string;
  name?: string;
  addresstype?: string;
  address?: Record<string, string | undefined>;
};

type OpenMeteoPlace = {
  name?: string;
  latitude?: number;
  longitude?: number;
  admin1?: string;
  country?: string;
};

/** Kinds of place whose own name is safe and useful to show (never a house or street). */
const NAMED_KINDS = new Set([
  'city',
  'town',
  'village',
  'hamlet',
  'municipality',
  'suburb',
  'neighbourhood',
  'quarter',
  'borough',
  'city_district',
  'district',
  'county',
  'state_district',
  'state',
  'province',
  'region',
  'country',
  'island',
  'islet',
  'archipelago',
  'locality',
  'isolated_dwelling',
  'park',
  'nature_reserve',
  'protected_area',
  'national_park',
  'peak',
  'mountain_range',
  'lake',
  'water',
  'bay',
  'forest',
  'wood',
  'wetland',
  'beach',
]);
const LOCALITY_FIELDS = ['city', 'town', 'village', 'hamlet', 'municipality', 'county'];

/** "Charlottetown, Prince Edward Island, Canada": the place, never the street address. */
export function nominatimLabel(place: NominatimPlace): string | undefined {
  const a = place.address ?? {};
  const locality = LOCALITY_FIELDS.map((f) => a[f]).find(Boolean);
  const own =
    place.name && place.addresstype && NAMED_KINDS.has(place.addresstype) ? place.name : undefined;
  return joinLabel([own, locality, a.state ?? a.province ?? a.region, a.country]);
}

function joinLabel(parts: (string | undefined)[]): string | undefined {
  const out: string[] = [];
  for (const p of parts) {
    const t = p?.trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out.length ? out.join(', ') : undefined;
}

function toResult(label: string | undefined, lat: number, lon: number): GeocodeResult | undefined {
  if (!label || !isValidLatLng(lat, lon)) return undefined;
  return { label: label.slice(0, 120), ...labelCell({ latitude: lat, longitude: lon }) };
}

/** Up to five results, one per label and cell. */
function dedupe(results: (GeocodeResult | undefined)[]): GeocodeResult[] {
  const seen = new Set<string>();
  const out: GeocodeResult[] = [];
  for (const r of results) {
    if (!r) continue;
    const key = `${r.label}|${r.latitude},${r.longitude}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
    if (out.length === GEOCODE.maxResults) break;
  }
  return out;
}

export function parseNominatim(body: unknown): GeocodeResult[] {
  if (!Array.isArray(body)) return [];
  return dedupe(
    (body as NominatimPlace[]).map((p) =>
      toResult(nominatimLabel(p), Number(p.lat ?? NaN), Number(p.lon ?? NaN)),
    ),
  );
}

export function parseOpenMeteo(body: unknown): GeocodeResult[] {
  const list = (body as { results?: OpenMeteoPlace[] } | undefined)?.results;
  if (!Array.isArray(list)) return [];
  return dedupe(
    list.map((p) =>
      toResult(
        joinLabel([p.name, p.admin1, p.country]),
        Number(p.latitude ?? NaN),
        Number(p.longitude ?? NaN),
      ),
    ),
  );
}

/** Lower-cased, single-spaced query (the cache key is a hash of this). */
export function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, ' ').toLowerCase();
}

export const MOCK_GEOCODE: GeocodeResponse = {
  results: [
    { label: 'Charlottetown, Prince Edward Island, Canada', latitude: 46.2, longitude: -63.1 },
    { label: 'Halifax, Nova Scotia, Canada', latitude: 44.6, longitude: -63.6 },
  ],
  source: 'mock',
};

export type GeocodeServiceOptions = {
  cache?: Cache;
  fetchImpl?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export class GeocodeService {
  private readonly cache: Cache;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  /** Nominatim calls run one at a time, spaced by NOMINATIM_INTERVAL_MS. */
  private queue: Promise<unknown> = Promise.resolve();
  private queued = 0;
  private nextSlot = 0;

  constructor(options: GeocodeServiceOptions = {}) {
    this.cache = options.cache ?? new MemoryCache({ maxEntries: 1000 });
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async search(query: string): Promise<GeocodeResponse> {
    const q = normalizeQuery(query);
    const key = `geocode:${createHash('sha256').update(q).digest('base64url')}`;
    const hit = this.cache.get<GeocodeResponse>(key);
    if (hit) return hit;

    let response: GeocodeResponse;
    try {
      response = { results: await this.nominatim(q), source: 'openstreetmap' };
      this.cache.set(key, response, GEOCODE_TTL_MS);
    } catch (error) {
      if (error instanceof ApiError) throw error;
      logger.info('geocode.fallback', { reason: 'nominatim_failed' });
      try {
        response = { results: await this.openMeteo(q), source: 'open-meteo' };
      } catch {
        throw new ApiError(
          'provider_unavailable',
          'Place search is unavailable right now. Please try again shortly.',
        );
      }
      this.cache.set(key, response, FALLBACK_TTL_MS);
    }
    return response;
  }

  private nominatim(q: string): Promise<GeocodeResult[]> {
    if (this.queued >= MAX_QUEUED) {
      return Promise.reject(
        new ApiError('rate_limited', 'Place search is busy. Please try again in a moment.', {
          retryAfterSeconds: 5,
        }),
      );
    }
    this.queued++;
    const run = this.queue.then(async () => {
      try {
        const wait = this.nextSlot - this.now();
        if (wait > 0) await this.sleep(wait);
        this.nextSlot = this.now() + NOMINATIM_INTERVAL_MS;
        const params = new URLSearchParams({
          format: 'jsonv2',
          q,
          limit: String(GEOCODE.maxResults),
          addressdetails: '1',
        });
        const body = await fetchJson(`${NOMINATIM_URL}?${params}`, {
          service: 'Nominatim',
          timeoutMs: TIMEOUTS_MS.supporting,
          fetchImpl: this.fetchImpl,
          init: { headers: { 'User-Agent': GEOCODE_USER_AGENT } },
        });
        return parseNominatim(body);
      } finally {
        this.queued--;
      }
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async openMeteo(q: string): Promise<GeocodeResult[]> {
    const params = new URLSearchParams({
      name: q,
      count: String(GEOCODE.maxResults),
      language: 'en',
      format: 'json',
    });
    const body = await fetchJson(`${OPEN_METEO_GEOCODE_URL}?${params}`, {
      service: 'Open-Meteo',
      timeoutMs: TIMEOUTS_MS.supporting,
      fetchImpl: this.fetchImpl,
      init: { headers: { 'User-Agent': GEOCODE_USER_AGENT } },
    });
    return parseOpenMeteo(body);
  }
}
