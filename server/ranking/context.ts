/**
 * Soft context signals from the phone: time of day, elevation and camera tilt. Each one is a
 * small, capped multiplier (≤ 1) on a candidate's score, never a hard rule, and has no effect
 * where there is no sourced data for the candidate.
 */
import { CONTEXT } from '../../shared/config.js';
import type {
  ApproxLocation,
  DayPhase,
  ElevationEvidence,
  OrganismCandidate,
  OrganismCategory,
  TiltBucket,
} from '../../shared/types.js';
import { BIRD_TRAITS } from '../facts/birdTraits.js';
import { MAMMAL_TRAITS } from '../facts/mammalTraits.js';

type Config = typeof CONTEXT;
type Taxon = Pick<OrganismCandidate, 'scientificName' | 'category' | 'family' | 'kingdom'>;

const RAD = Math.PI / 180;

/** Sun altitude in degrees (low-precision solar position; well under 1° error). */
export function sunAltitude(date: Date, latitude: number, longitude: number): number {
  const d = date.getTime() / 86_400_000 - 10_957.5; // days since J2000.0
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const lambda = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(e) * Math.sin(lambda));
  const gmstHours = (((18.697374558 + 24.06570982441908 * d) % 24) + 24) % 24;
  const hourAngle = (gmstHours * 15 + longitude) * RAD - ra;
  const lat = latitude * RAD;
  return (
    Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle)) /
    RAD
  );
}

export type TimeContext = {
  capturedAt: Date;
  localHour?: number;
  approximate?: boolean;
  location?: ApproxLocation;
};

/**
 * Day, night or twilight where and when the photo was taken. Undefined when the local hour
 * isn't known (old clients, library photos without an EXIF date).
 * - Location and a trusted instant (camera photos): the sun's actual altitude.
 * - Location and an approximate hour (library photos): solar time estimated from longitude,
 *   with wider margins to absorb time-zone and daylight-saving error.
 * - No location: fixed hour bands.
 * Dawn and dusk come out as twilight, which the time-of-day nudge treats as neutral.
 */
export function dayPhase(ctx: TimeContext, config: Config = CONTEXT): DayPhase | undefined {
  const { localHour, location } = ctx;
  if (localHour === undefined || !Number.isFinite(localHour)) return undefined;
  if (location) {
    let instant = ctx.capturedAt;
    const margins = ctx.approximate ? config.sunMarginsApprox : config.sunMargins;
    if (ctx.approximate) {
      const midnight = Date.UTC(
        ctx.capturedAt.getUTCFullYear(),
        ctx.capturedAt.getUTCMonth(),
        ctx.capturedAt.getUTCDate(),
      );
      instant = new Date(midnight + (localHour - location.longitude / 15) * 3_600_000);
    }
    const altitude = sunAltitude(instant, location.latitude, location.longitude);
    if (altitude >= margins.day) return 'day';
    if (altitude <= margins.night) return 'night';
    return 'twilight';
  }
  const h = ((localHour % 24) + 24) % 24;
  const { day, night } = config.hourBands;
  if (h >= day[0] && h < day[1]) return 'day';
  if (h >= night[0] || h < night[1]) return 'night';
  return 'twilight';
}

export type Activity = 'diurnal' | 'nocturnal';

/** Butterflies (Papilionoidea, incl. skippers) fly by day; moths are too varied to call. */
const BUTTERFLY_FAMILIES = new Set([
  'papilionidae',
  'pieridae',
  'nymphalidae',
  'lycaenidae',
  'riodinidae',
  'hesperiidae',
]);

const key = (name: string) => name.trim().toLowerCase();

/**
 * Mainly diurnal or nocturnal, from EltonTraits activity (mammals: N/C/D flags; birds: the
 * nocturnal flag) or butterfly family. Undefined when mixed, crepuscular or unknown.
 */
export function activityOf(c: Taxon): Activity | undefined {
  if (c.category === 'mammal') {
    const a = MAMMAL_TRAITS[key(c.scientificName)]?.a;
    if (!a) return undefined;
    const n = a.includes('N');
    const d = a.includes('D');
    return n && !d ? 'nocturnal' : d && !n ? 'diurnal' : undefined;
  }
  if (c.category === 'bird') {
    const t = BIRD_TRAITS[key(c.scientificName)];
    if (!t) return undefined;
    return t.n ? 'nocturnal' : 'diurnal';
  }
  if (c.category === 'insect' && c.family && BUTTERFLY_FAMILIES.has(key(c.family))) {
    return 'diurnal';
  }
  return undefined;
}

/**
 * Multiplier for a candidate given the time of day. A diurnal species at night loses up to
 * the cap; a nocturnal one by day loses half of it, since roosting owls and bats are
 * photographed by day far more often than sleeping songbirds at night. Twilight: no effect.
 */
export function timeOfDayFactor(
  c: Taxon,
  phase: DayPhase | undefined,
  approximate = false,
  config: Config = CONTEXT,
): number | undefined {
  if (!phase || phase === 'twilight') return undefined;
  const activity = activityOf(c);
  if (!activity) return undefined;
  const cap = config.timeOfDayCap * (approximate ? 0.6 : 1);
  if (activity === 'diurnal' && phase === 'night') return 1 - cap;
  if (activity === 'nocturnal' && phase === 'day') return 1 - cap / 2;
  return 1;
}

/** Groups where elevation says something about which species it is. */
export const ELEVATION_CATEGORIES: readonly OrganismCategory[] = ['plant', 'insect', 'bird'];

/**
 * Multiplier from nearby GBIF records at the site's elevation. Needs enough records that carry
 * an elevation; when almost none of them fall in the site's band, the score drops, up to the cap.
 */
export function elevationFactor(
  category: OrganismCategory,
  evidence: ElevationEvidence | undefined,
  config: Config = CONTEXT,
): number | undefined {
  if (!evidence || !ELEVATION_CATEGORIES.includes(category)) return undefined;
  const { recordsWithElevation: all, recordsInBand: inBand } = evidence;
  if (all < config.elevationMinRecords) return undefined;
  const share = inBand / all;
  if (share >= config.elevationTypicalShare) return 1;
  return 1 - config.elevationCap * (1 - share / config.elevationTypicalShare);
}

function strata(f: string | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const part of (f ?? '').split(',')) {
    const m = part.match(/^([A-Z])(\d+)$/);
    if (m) out[m[1]] = Number(m[2]);
  }
  return out;
}

/**
 * How well a candidate fits the camera's tilt: 1 fits, -1 doesn't, 0 unknown. From EltonTraits
 * foraging strata for birds and mammals; fungi grow underfoot. Other groups: no data, so 0.
 */
export function tiltFit(c: Taxon, tilt: TiltBucket | undefined): -1 | 0 | 1 {
  if (!tilt || tilt === 'level') return 0;
  const k = key(c.scientificName);
  if (c.category === 'bird') {
    const s = strata(BIRD_TRAITS[k]?.f);
    if (!Object.keys(s).length) return 0;
    const high = (s.M ?? 0) + (s.C ?? 0) + (s.A ?? 0);
    const low = (s.G ?? 0) + (s.W ?? 0) + (s.U ?? 0);
    if (tilt === 'up') return high >= 60 ? 1 : low >= 60 ? -1 : 0;
    return low >= 50 ? 1 : high >= 60 ? -1 : 0;
  }
  if (c.category === 'mammal') {
    const f = MAMMAL_TRAITS[k]?.f;
    if (!f || f === 'M') return 0;
    const high = f === 'Ar' || f === 'A';
    if (tilt === 'up') return high ? 1 : f === 'G' ? -1 : 0;
    return f === 'G' ? 1 : high ? -1 : 0;
  }
  if (c.category === 'fungus' || key(c.kingdom ?? '') === 'fungi') return tilt === 'down' ? 1 : 0;
  return 0;
}

/**
 * Tilt only breaks near-ties: a candidate is nudged down (by the margin) only when another
 * candidate that fits the tilt better scores within that margin of it. Returns the multiplier
 * per index, or undefined when tilt changed nothing.
 */
export function tiltTieBreak(
  scores: number[],
  fits: (-1 | 0 | 1)[],
  config: Config = CONTEXT,
): (number | undefined)[] {
  const m = config.tiltTieMargin;
  return scores.map((score, i) => {
    const close = scores.some(
      (other, j) =>
        j !== i && fits[j] > fits[i] && Math.abs(other - score) <= m * Math.max(other, score),
    );
    return close ? 1 - m : undefined;
  });
}
