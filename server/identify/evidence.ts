import { CATEGORIES, SCAT_FEATURE, TRACK_FEATURE } from '../../shared/categories.js';
import type {
  AnimalSign,
  CommunityObservationSummary,
  ConfidenceBand,
  DayPhase,
  EvidenceItem,
  FeatureId,
  Guidance,
  OrganismCandidate,
  OrganismCategory,
  SourceStatus,
  TiltBucket,
} from '../../shared/types.js';
import { RANKING } from '../../shared/config.js';
import { activityOf } from '../ranking/context.js';
import { monthSeasonSupport } from '../ranking/reranker.js';

export type EvidenceContext = {
  category: OrganismCategory;
  candidates: OrganismCandidate[];
  band: ConfidenceBand;
  imageCount: number;
  features: FeatureId[];
  locationProvided: boolean;
  occurrenceStatus: SourceStatus;
  community?: CommunityObservationSummary;
  /** Identified from a recording (Calls) rather than photos. */
  call?: boolean;
  /** When the photo was taken; its month names the season. */
  capturedAt?: Date;
  /** Day, night or twilight at the capture place and time, when known. */
  phase?: DayPhase;
  tilt?: TiltBucket;
};

const MONTHS_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * The months when a species is usually recorded, as short ranges: "Apr–Jun", "Mar–May,
 * Sep–Oct" or "all year". A month counts when it holds at least half its uniform share of
 * records. Undefined when there are too few records or more than two separate seasons.
 */
export function seasonSpan(monthCounts: number[] | undefined): string | undefined {
  if (!monthCounts || monthCounts.length !== 12) return undefined;
  const total = monthCounts.reduce((a, b) => a + b, 0);
  if (total < RANKING.seasonMinRecords) return undefined;
  const on = monthCounts.map((c) => c >= total / 24);
  if (on.every(Boolean)) return 'all year';
  // Start just after an "off" month so a run crossing December → January stays whole.
  const start = on.findIndex((v, i) => !v && on[(i + 1) % 12]);
  const runs: [number, number][] = [];
  for (let k = 1; k <= 12; k++) {
    const m = (start + k) % 12;
    if (!on[m]) continue;
    const last = runs.at(-1);
    if (last && (last[1] + 1) % 12 === m) last[1] = m;
    else runs.push([m, m]);
  }
  if (!runs.length || runs.length > 2) return undefined;
  return runs
    .map(([a, b]) => (a === b ? MONTHS_SHORT[a] : `${MONTHS_SHORT[a]}–${MONTHS_SHORT[b]}`))
    .join(', ');
}

function seasonEvidence(
  top: OrganismCandidate,
  capturedAt: Date,
  supports: EvidenceItem[],
  uncertainties: EvidenceItem[],
) {
  const o = top.occurrence;
  if (o?.recentlyReported !== undefined) {
    if (o.recentlyReported)
      supports.push({
        code: 'season_recent',
        text: 'Reported within 50 km in the last 30 days (eBird)',
      });
    else
      uncertainties.push({
        code: 'season_not_recent',
        text: 'Not reported within 50 km in the last 30 days (eBird)',
      });
  }
  const months = monthSeasonSupport(o, capturedAt);
  if (!months) return;
  const month = MONTHS_LONG[capturedAt.getUTCMonth()];
  const flowering = months.basis === 'flowering';
  const span = seasonSpan(flowering ? o?.floweringMonthCounts : o?.monthCounts);
  if (months.support >= 0.8) {
    supports.push({
      code: 'season_typical',
      text: flowering
        ? span
          ? `In season: flowers here ${span}`
          : `Recorded in flower near you in ${month}`
        : `Commonly recorded near you in ${month}`,
    });
  } else if (months.support < RANKING.outOfSeason.threshold) {
    uncertainties.push({
      code: 'season_atypical',
      text: flowering
        ? `Out of season: rarely recorded in flower near you in ${month}${span ? ` (flowers ${span})` : ''}`
        : `Rarely recorded near you in ${month}${span ? ` (mostly ${span})` : ''}`,
    });
  }
}

const PHASE_TEXT: Record<Exclude<DayPhase, 'twilight'>, string> = {
  day: 'in daylight',
  night: 'at night',
};

function contextEvidence(
  ctx: EvidenceContext,
  top: OrganismCandidate,
  supports: EvidenceItem[],
  uncertainties: EvidenceItem[],
) {
  // Time of day.
  if (ctx.phase && ctx.phase !== 'twilight') {
    const activity = activityOf(top);
    const when = PHASE_TEXT[ctx.phase];
    // "Active by day, taken by day" is only worth saying when it moved another candidate down.
    const othersNudged = ctx.candidates.some((c) => c !== top && c.nudges?.timeOfDay);
    if (activity === 'nocturnal' && ctx.phase === 'night')
      supports.push({ code: 'time_fits', text: `Active at night, and this was taken ${when}` });
    else if (activity === 'diurnal' && ctx.phase === 'day' && othersNudged)
      supports.push({ code: 'time_fits', text: `Active by day, and this was taken ${when}` });
    else if (top.nudges?.timeOfDay !== undefined)
      uncertainties.push({
        code: 'time_atypical',
        text: `Usually active ${activity === 'nocturnal' ? 'at night' : 'by day'}, but this was taken ${when}`,
      });
  }
  // Elevation.
  const elevation = top.occurrence?.elevation;
  if (elevation && top.nudges?.elevation !== undefined) {
    uncertainties.push({
      code: 'elevation_atypical',
      text: `Few nearby records at this elevation (about ${elevation.site.centerM.toLocaleString('en-US')} m)`,
    });
  } else if (
    elevation &&
    elevation.recordsWithElevation >= 20 &&
    elevation.recordsInBand / elevation.recordsWithElevation >= 0.25
  ) {
    supports.push({
      code: 'elevation_typical',
      text: `Recorded nearby at this elevation (about ${elevation.site.centerM.toLocaleString('en-US')} m)`,
    });
  }
  // Camera tilt: only mentioned when it actually broke a tie.
  if (ctx.tilt && ctx.tilt !== 'level' && ctx.candidates.some((c) => c.nudges?.tilt)) {
    supports.push({
      code: 'tilt_used',
      text: `Camera pointing ${ctx.tilt} used to separate close matches`,
    });
  }
}

const CLOSE_MARGIN = 0.15;

/**
 * Builds the "Why this match?" panel. Every statement here is derived from data
 * the pipeline actually holds — no visual reasoning is inferred or invented.
 */
export function buildEvidence(ctx: EvidenceContext): {
  supports: EvidenceItem[];
  uncertainties: EvidenceItem[];
} {
  const supports: EvidenceItem[] = [];
  const uncertainties: EvidenceItem[] = [];
  const [top, second] = ctx.candidates;
  if (!top) return { supports, uncertainties };

  const model = ctx.call ? 'sound-model' : 'image-model';
  if (top.visualConfidence >= 0.7)
    supports.push({ code: 'visual_strong', text: `Strong ${model} match` });
  else if (top.visualConfidence < 0.4)
    uncertainties.push({ code: 'visual_weak', text: `The ${model} match is weak` });

  if (ctx.locationProvided) supports.push({ code: 'location_used', text: 'Location used' });
  else uncertainties.push({ code: 'location_not_used', text: 'Location not used' });

  if (ctx.locationProvided && ctx.occurrenceStatus === 'ok' && top.occurrence) {
    const nearest = top.occurrence.radiusCounts.find((r) => r.count > 0);
    if (nearest) {
      supports.push({
        code: 'gbif_nearby',
        text: `Recorded within ${nearest.radiusKm} km in GBIF (${nearest.count.toLocaleString('en-US')} record${nearest.count === 1 ? '' : 's'})`,
      });
    } else {
      const widest = top.occurrence.radiusCounts.at(-1)?.radiusKm;
      uncertainties.push({
        code: 'gbif_absent',
        text: `No GBIF records within ${widest} km — it may be under-recorded or cultivated here`,
      });
    }
    if (ctx.capturedAt) seasonEvidence(top, ctx.capturedAt, supports, uncertainties);
    else if (top.seasonalSupport !== undefined) {
      if (top.seasonalSupport >= 0.8)
        supports.push({
          code: 'season_typical',
          text: 'Commonly recorded nearby at this time of year',
        });
      else if (top.seasonalSupport < 0.3)
        uncertainties.push({
          code: 'season_atypical',
          text: 'Rarely recorded nearby at this time of year',
        });
    }
  } else if (ctx.locationProvided && ctx.occurrenceStatus === 'unavailable') {
    uncertainties.push({
      code: 'gbif_unavailable',
      text: 'Local records could not be checked right now',
    });
  }

  contextEvidence(ctx, top, supports, uncertainties);

  if (ctx.community?.nearbyCount) {
    supports.push({
      code: 'inat_nearby',
      text: `Observed nearby on iNaturalist (within ${ctx.community.radiusKm} km)`,
    });
  }

  if (ctx.call) {
    // One recording: the photo-count notes don't apply.
  } else if (ctx.imageCount > 1)
    supports.push({ code: 'multiple_photos', text: `${ctx.imageCount} photos submitted` });
  else if (ctx.band !== 'high')
    uncertainties.push({ code: 'single_photo', text: 'Only one photo submitted' });

  if (second && top.finalConfidence - second.finalConfidence < CLOSE_MARGIN) {
    uncertainties.push({ code: 'close_alternatives', text: 'Other candidates scored closely' });
  }
  if (second && top.genus && second.genus === top.genus) {
    uncertainties.push({
      code: 'same_genus',
      text: `Several ${top.genus} species are among the candidates`,
    });
  }

  return { supports, uncertainties };
}

/** Category-aware suggestions for what additional photo would most help. */
export function buildGuidance(
  ctx: Pick<EvidenceContext, 'category' | 'band' | 'features'> & { sign?: AnimalSign },
): Guidance[] {
  if (ctx.band === 'high') return [];
  // Tracks and droppings: another, better photo of the sign is what the person can take.
  if (ctx.sign) {
    const f = ctx.sign === 'track' ? TRACK_FEATURE : SCAT_FEATURE;
    return [{ feature: f.id, message: f.advice }];
  }
  const category = CATEGORIES[ctx.category];
  const submitted = new Set(ctx.features.filter((f) => f !== 'auto'));
  const suggestions = category.features
    .filter((f) => f.id !== 'other' && !submitted.has(f.id))
    .slice(0, ctx.band === 'medium' ? 1 : 2)
    .map((f) => ({ feature: f.id, message: f.advice }));
  return suggestions.length ? suggestions : [{ message: category.generalAdvice }];
}
