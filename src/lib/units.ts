import { useSetting, type Units } from './settings';

/**
 * Unit-aware display of measurements. Distances in the app are coarse (radius labels, ~10 km
 * areas), so imperial values are rounded the same way. Server facts arrive as metric text
 * ("about 5.2 kg"); `localizeMeasurements` rewrites the masses and distances inside them.
 */

const KM_PER_MILE = 1.609344;
const GRAMS_PER_OUNCE = 28.349523;
const GRAMS_PER_POUND = 453.59237;

function round(value: number): string {
  const r = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return r.toLocaleString('en-US');
}

/** "10 km" or "6 mi". */
export function formatDistance(km: number, units: Units): string {
  if (units === 'metric') return `${round(km)} km`;
  return `${round(km / KM_PER_MILE)} mi`;
}

/** "about 10 km across" or "about 6 miles across": for the coarse journal areas. */
export function formatAreaSize(km: number, units: Units): string {
  if (units === 'metric') return `${round(km)} km`;
  // Approximate sizes read better whole: "about 6 miles", not "about 6.2 miles".
  const mi = Math.max(1, Math.round(km / KM_PER_MILE));
  return `${mi} ${mi === 1 ? 'mile' : 'miles'}`;
}

/** "450 g" / "5.2 kg" or "1 oz" / "11.5 lb". */
export function formatMass(grams: number, units: Units): string {
  if (units === 'metric') return grams < 1000 ? `${round(grams)} g` : `${round(grams / 1000)} kg`;
  if (grams < GRAMS_PER_POUND) return `${round(grams / GRAMS_PER_OUNCE)} oz`;
  return `${round(grams / GRAMS_PER_POUND)} lb`;
}

const MEASURE = /(\d[\d,]*(?:\.\d+)?)\s?(kg|g|km)\b/g;

/** Rewrites metric masses and distances in server text ("about 5.2 kg") for imperial units. */
export function localizeMeasurements(text: string, units: Units): string {
  if (units === 'metric') return text;
  return text.replace(MEASURE, (match, num: string, unit: string) => {
    const n = Number(num.replace(/,/g, ''));
    if (!Number.isFinite(n)) return match;
    if (unit === 'km') return formatDistance(n, units);
    return formatMass(unit === 'kg' ? n * 1000 : n, units);
  });
}

/** "10 km" or "6 miles": the size of the coarse (~10 km) areas the journal groups finds by. */
export function useAreaSize(km = 10): string {
  return formatAreaSize(km, useSetting('units'));
}

/** "1 km" or "0.6 mi": a single coarse distance in the person's units. */
export function useDistance(km: number): string {
  return formatDistance(km, useSetting('units'));
}
