/**
 * Client for place search (home patch by address). The typed text is sent once, on submit,
 * and is not kept anywhere on the device; answers carry only a short label and a position
 * rounded to ~11 km.
 */
import { GEOCODE, geocodeResponseSchema, type GeocodeResult } from '../../shared/geocode';

export type PlaceSearch = { ok: true; results: GeocodeResult[] } | { ok: false; message: string };

const UNAVAILABLE = 'Place search isn’t available right now. Please try again later.';

export async function searchPlaces(query: string): Promise<PlaceSearch> {
  const q = query.trim().slice(0, GEOCODE.maxQuery);
  if (q.length < GEOCODE.minQuery) return { ok: false, message: 'Type a place or address.' };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return { ok: false, message: 'You’re offline. Place search needs a connection.' };
  }
  try {
    const res = await fetch(`/api/geocode?${new URLSearchParams({ q })}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const body: unknown = await res.json().catch(() => undefined);
    if (!res.ok) {
      const message = (body as { error?: { message?: unknown } } | undefined)?.error?.message;
      return { ok: false, message: typeof message === 'string' ? message : UNAVAILABLE };
    }
    const parsed = geocodeResponseSchema.safeParse(body);
    return parsed.success
      ? { ok: true, results: parsed.data.results }
      : { ok: false, message: UNAVAILABLE };
  } catch {
    return { ok: false, message: UNAVAILABLE };
  }
}
