import { GEO } from './config.js';
import type { ApproxLocation } from './types.js';

/** Round a coordinate to a fixed number of decimals, avoiding "-0". */
export function roundCoordinate(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function isValidLatLng(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Snap precise coordinates to the privacy grid used for requests and cache keys.
 * With the default precision (2 decimals) a cell is roughly 1.1 km tall.
 */
export function toApproxLocation(
  latitude: number,
  longitude: number,
  decimals: number = GEO.requestPrecision,
): ApproxLocation {
  return {
    latitude: roundCoordinate(latitude, decimals),
    longitude: roundCoordinate(longitude, decimals),
  };
}

/** Stable key for caching location-dependent queries: "46.24,-63.13". */
export function locationCacheKey(
  location: ApproxLocation,
  decimals: number = GEO.requestPrecision,
): string {
  const approx = toApproxLocation(location.latitude, location.longitude, decimals);
  return `${approx.latitude.toFixed(decimals)},${approx.longitude.toFixed(decimals)}`;
}

/** Human-readable coarse label, e.g. "46.2°N, 63.1°W" (≈11 km precision). */
export function coarseLocationLabel(location: ApproxLocation): string {
  const d = GEO.labelPrecision;
  const lat = roundCoordinate(Math.abs(location.latitude), d).toFixed(d);
  const lng = roundCoordinate(Math.abs(location.longitude), d).toFixed(d);
  const ns = location.latitude >= 0 ? 'N' : 'S';
  const ew = location.longitude >= 0 ? 'E' : 'W';
  return `${lat}°${ns}, ${lng}°${ew}`;
}
