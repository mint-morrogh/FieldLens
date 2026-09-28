import { GEO } from '../../../shared/config.js';
import { locationCacheKey, roundCoordinate } from '../../../shared/geo.js';
import type { ApproxLocation, ElevationSample } from '../../../shared/types.js';
import { cached, sharedCache, type Cache } from '../../cache/cache.js';
import { fetchJson } from '../../lib/http.js';
import type { ElevationProvider } from '../types.js';

export const OPEN_METEO_SOURCE = 'Open-Meteo';
export const OPEN_METEO_ATTRIBUTION = {
  provider: OPEN_METEO_SOURCE,
  text: 'Ground elevation from Open-Meteo (Copernicus DEM GLO-90)',
  url: 'https://open-meteo.com/en/docs/elevation-api',
};
const API = 'https://api.open-meteo.com/v1/elevation';

/** Terrain doesn't change: keep lookups for a month. */
const TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Elevation is a nice-to-have, so it must never slow identification down. */
export const ELEVATION_TIMEOUT_MS = 1500;
/** Offsets (degrees) of the 3 × 3 sample grid inside the 0.1° cell. */
const OFFSETS = [-0.04, 0, 0.04];

/**
 * Only the ~11 km cell (1 decimal place) is sent to Open-Meteo. One request samples a 3 × 3
 * grid inside that cell, so in hilly country the result is a range (valley floor to hilltop)
 * rather than a single, possibly misleading, point.
 */
export function elevationGrid(location: ApproxLocation): ApproxLocation {
  const d = GEO.labelPrecision;
  return {
    latitude: roundCoordinate(location.latitude, d),
    longitude: roundCoordinate(location.longitude, d),
  };
}

export function sampleSummary(values: unknown): ElevationSample | undefined {
  if (!Array.isArray(values) || values.length !== OFFSETS.length ** 2) return undefined;
  const nums = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  if (nums.length !== values.length) return undefined;
  return {
    centerM: Math.round(nums[Math.floor(nums.length / 2)]),
    minM: Math.round(Math.min(...nums)),
    maxM: Math.round(Math.max(...nums)),
  };
}

export class OpenMeteoElevationProvider implements ElevationProvider {
  readonly name = OPEN_METEO_SOURCE;
  constructor(
    private readonly cache: Cache = sharedCache,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getElevation(location: ApproxLocation): Promise<ElevationSample | undefined> {
    const cell = elevationGrid(location);
    const lats: string[] = [];
    const lngs: string[] = [];
    for (const dy of OFFSETS) {
      for (const dx of OFFSETS) {
        lats.push(Math.max(-90, Math.min(90, cell.latitude + dy)).toFixed(2));
        lngs.push((((cell.longitude + dx + 540) % 360) - 180).toFixed(2));
      }
    }
    const url = `${API}?latitude=${lats.join(',')}&longitude=${lngs.join(',')}`;
    const key = `elevation:${locationCacheKey(cell, GEO.labelPrecision)}`;
    const body = await cached(this.cache, key, TTL_MS, () =>
      fetchJson<{ elevation?: unknown }>(url, {
        service: OPEN_METEO_SOURCE,
        timeoutMs: ELEVATION_TIMEOUT_MS,
        fetchImpl: this.fetchImpl,
      }),
    );
    return sampleSummary(body.elevation);
  }
}
