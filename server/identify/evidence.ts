import { CATEGORIES, SCAT_FEATURE, TRACK_FEATURE } from '../../shared/categories.js';
import type {
  AnimalSign,
  CommunityObservationSummary,
  ConfidenceBand,
  EvidenceItem,
  FeatureId,
  Guidance,
  OrganismCandidate,
  OrganismCategory,
  SourceStatus,
} from '../../shared/types.js';

export type EvidenceContext = {
  category: OrganismCategory;
  candidates: OrganismCandidate[];
  band: ConfidenceBand;
  imageCount: number;
  features: FeatureId[];
  locationProvided: boolean;
  occurrenceStatus: SourceStatus;
  community?: CommunityObservationSummary;
};

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

  if (top.visualConfidence >= 0.7)
    supports.push({ code: 'visual_strong', text: 'Strong image-model match' });
  else if (top.visualConfidence < 0.4)
    uncertainties.push({ code: 'visual_weak', text: 'The image-model match is weak' });

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
    if (top.seasonalSupport !== undefined) {
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

  if (ctx.community?.nearbyCount) {
    supports.push({
      code: 'inat_nearby',
      text: `Observed nearby on iNaturalist (within ${ctx.community.radiusKm} km)`,
    });
  }

  if (ctx.imageCount > 1)
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
