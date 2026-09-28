/**
 * Client for the "near you" endpoints. Only a ~11 km cell ever leaves the device, and
 * answers are kept locally for a day so the journal and home screen don't refetch.
 * Every failure (offline, no server, bad answer) resolves to `undefined`: these are
 * extras, and the screens fall back to what they show without them.
 */
import { roundCoordinate } from '../../shared/geo';
import {
  NEARBY,
  nearbyFamiliesResponseSchema,
  whatsOutResponseSchema,
  type NearbyFamiliesRequest,
  type NearbyFamiliesResponse,
  type WhatsOutResponse,
} from '../../shared/nearby';
import type { ApproxLocation } from '../../shared/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const STORE_PREFIX = 'fieldlens.nearby.';

export function coarseLocation(location: ApproxLocation): ApproxLocation {
  return {
    latitude: roundCoordinate(location.latitude, NEARBY.precision),
    longitude: roundCoordinate(location.longitude, NEARBY.precision),
  };
}

function readStored<T>(key: string, now: number): T | undefined {
  try {
    const raw = localStorage.getItem(STORE_PREFIX + key);
    if (!raw) return undefined;
    const { at, value } = JSON.parse(raw) as { at: number; value: T };
    return now - at < DAY_MS ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeStored(key: string, value: unknown, now: number) {
  try {
    localStorage.setItem(STORE_PREFIX + key, JSON.stringify({ at: now, value }));
  } catch {
    /* storage full or blocked: just don't remember it */
  }
}

async function fetchJson(input: string, init?: RequestInit): Promise<unknown> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return undefined;
  try {
    const res = await fetch(input, {
      ...init,
      headers: { Accept: 'application/json', ...init?.headers },
    });
    if (!res.ok) return undefined;
    return await res.json();
  } catch {
    return undefined;
  }
}

/** Distinct species recorded near a location for each family/genus. */
export async function getNearbyFamilyCounts(
  location: ApproxLocation,
  taxa: NearbyFamiliesRequest['taxa'],
  now = Date.now(),
): Promise<NearbyFamiliesResponse | undefined> {
  if (taxa.length === 0) return undefined;
  const cell = coarseLocation(location);
  const list = taxa.slice(0, NEARBY.maxTaxa);
  const key = `families:${cell.latitude},${cell.longitude}:${list
    .map((t) => `${t.rank}:${t.name}`)
    .sort()
    .join('|')}`;
  const stored = readStored<NearbyFamiliesResponse>(key, now);
  if (stored) return stored;
  const body = await fetchJson('/api/nearby-families', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...cell, taxa: list }),
  });
  const parsed = nearbyFamiliesResponseSchema.safeParse(body);
  if (!parsed.success) return undefined;
  writeStored(key, parsed.data, now);
  return parsed.data;
}

/** Species at their seasonal peak near a location in a month (1–12). */
export async function getWhatsOut(
  location: ApproxLocation,
  month: number,
  now = Date.now(),
): Promise<WhatsOutResponse | undefined> {
  const cell = coarseLocation(location);
  const key = `whats-out:${cell.latitude},${cell.longitude}:${month}`;
  const stored = readStored<WhatsOutResponse>(key, now);
  if (stored) return stored;
  const params = new URLSearchParams({
    lat: String(cell.latitude),
    lon: String(cell.longitude),
    month: String(month),
  });
  const parsed = whatsOutResponseSchema.safeParse(await fetchJson(`/api/whats-out?${params}`));
  if (!parsed.success) return undefined;
  writeStored(key, parsed.data, now);
  return parsed.data;
}
