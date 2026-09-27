import { describe, expect, it } from 'vitest';
import {
  CATEGORIES,
  getFeature,
  isOrganismCategory,
  isValidFeature,
} from '../../shared/categories';
import { confidenceBand, formatPercent } from '../../shared/confidence';
import {
  coarseLocationLabel,
  isValidLatLng,
  locationCacheKey,
  roundCoordinate,
  toApproxLocation,
} from '../../shared/geo';
import { identifyResponseSchema } from '../../shared/schemas';

describe('confidence bands', () => {
  it.each([
    [0.95, 'high'],
    [0.8, 'high'],
    [0.7999, 'medium'],
    [0.55, 'medium'],
    [0.5499, 'low'],
    [0, 'low'],
    [undefined, 'none'],
    [Number.NaN, 'none'],
  ] as const)('%s → %s', (score, band) => {
    expect(confidenceBand(score)).toBe(band);
  });
  it('accepts custom thresholds', () => {
    expect(confidenceBand(0.7, { high: 0.7, medium: 0.5 })).toBe('high');
  });
  it('formats percentages and clamps', () => {
    expect(formatPercent(0.923)).toBe('92%');
    expect(formatPercent(1.4)).toBe('100%');
  });
});

describe('coordinate privacy', () => {
  it('rounds to the request grid', () => {
    expect(toApproxLocation(46.2382, -63.1311)).toEqual({ latitude: 46.24, longitude: -63.13 });
  });
  it('never produces negative zero', () => {
    expect(Object.is(roundCoordinate(-0.001, 2), 0)).toBe(true);
  });
  it('produces stable cache keys for nearby points in the same cell', () => {
    expect(locationCacheKey({ latitude: 46.2382, longitude: -63.1311 })).toBe('46.24,-63.13');
    expect(locationCacheKey({ latitude: 46.2371, longitude: -63.1349 })).toBe('46.24,-63.13');
  });
  it('builds a coarse ~11 km label with hemispheres', () => {
    expect(coarseLocationLabel({ latitude: 46.2382, longitude: -63.1311 })).toBe('46.2°N, 63.1°W');
    expect(coarseLocationLabel({ latitude: -33.87, longitude: 151.21 })).toBe('33.9°S, 151.2°E');
  });
  it('validates ranges', () => {
    expect(isValidLatLng(91, 0)).toBe(false);
    expect(isValidLatLng(0, -181)).toBe(false);
    expect(isValidLatLng(45, 45)).toBe(true);
  });
});

describe('category registry', () => {
  it('has plant available and future categories defined but unavailable', () => {
    expect(CATEGORIES.plant.available).toBe(true);
    expect(CATEGORIES.mammal.available).toBe(false);
    expect(CATEGORIES.fungus.features.length).toBeGreaterThan(0);
  });
  it('validates features per category', () => {
    expect(isValidFeature('plant', 'flower')).toBe(true);
    expect(isValidFeature('plant', 'wing')).toBe(false);
    expect(isValidFeature('bird', 'wing')).toBe(true);
    expect(isValidFeature('bird', 'auto')).toBe(true);
    expect(getFeature('plant', 'nonsense').id).toBe('auto');
  });
  it('recognizes categories', () => {
    expect(isOrganismCategory('insect')).toBe(true);
    expect(isOrganismCategory('dragon')).toBe(false);
  });
});

describe('response schema', () => {
  it('rejects malformed responses', () => {
    expect(identifyResponseSchema.safeParse({ candidates: 'nope' }).success).toBe(false);
  });
});
