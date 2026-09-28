import type { SpeciesFact } from '../../shared/types.js';
import { MAMMAL_TRAITS } from './mammalTraits.js';

export const ELTONTRAITS_SOURCE = 'EltonTraits 1.0 (Wilman et al. 2014)';
export const ELTONTRAITS_URL = 'https://doi.org/10.6084/m9.figshare.3559887.v1';

const DIET_LABELS: Record<string, string> = {
  Inv: 'insects & other invertebrates',
  Vend: 'mammals & birds',
  Vect: 'reptiles & amphibians',
  Vfish: 'fish',
  Vunk: 'other animals',
  Scav: 'carrion',
  Fruit: 'fruit',
  Nect: 'nectar',
  Seed: 'seeds & nuts',
  PlantO: 'leaves, grass & other plants',
};

const STRATUM: Record<string, string> = {
  M: 'In the sea',
  G: 'On the ground',
  S: 'On the ground and in trees',
  Ar: 'In trees',
  A: 'In the air',
};

export function formatMass(grams: number): string {
  if (grams < 1000) return `about ${Math.round(grams)} g`;
  const kg = grams / 1000;
  return `about ${kg < 10 ? kg.toFixed(1) : Math.round(kg).toLocaleString('en-US')} kg`;
}

export function formatDiet(diet: string): string | undefined {
  const parts = diet
    .split(',')
    .map((p) => p.match(/^([A-Za-z]+)(\d+)$/))
    .filter((m): m is RegExpMatchArray => !!m && !!DIET_LABELS[m[1]])
    .map((m) => ({ label: DIET_LABELS[m[1]], pct: Number(m[2]) }))
    .sort((a, b) => b.pct - a.pct);
  if (!parts.length) return undefined;
  return parts.map((p) => `${p.label} ${p.pct}%`).join(', ');
}

export function formatActivity(flags: string): string | undefined {
  const parts = [
    flags.includes('D') && 'by day',
    flags.includes('C') && 'at dawn and dusk',
    flags.includes('N') && 'at night',
  ].filter(Boolean) as string[];
  if (!parts.length) return undefined;
  const text = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0];
  return text[0].toUpperCase() + text.slice(1);
}

/**
 * Size, diet, activity and foraging facts for a mammal species from EltonTraits.
 * Tries each name in turn (e.g. the model's label, then GBIF's accepted name).
 */
export function mammalTraitFacts(names: (string | undefined)[]): SpeciesFact[] {
  const traits = names
    .filter((n): n is string => !!n)
    .map((n) => MAMMAL_TRAITS[n.trim().toLowerCase()])
    .find(Boolean);
  if (!traits) return [];
  const source = { source: ELTONTRAITS_SOURCE, sourceUrl: ELTONTRAITS_URL };
  const facts: SpeciesFact[] = [];
  if (traits.m)
    facts.push({ label: 'Average adult weight', value: formatMass(traits.m), ...source });
  const diet = traits.d && formatDiet(traits.d);
  if (diet) facts.push({ label: 'Diet', value: diet, ...source });
  const active = traits.a && formatActivity(traits.a);
  if (active) facts.push({ label: 'Active', value: active, ...source });
  const where = traits.f && STRATUM[traits.f];
  if (where) facts.push({ label: 'Feeds mainly', value: where, ...source });
  return facts;
}
