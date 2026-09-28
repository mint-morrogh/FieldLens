import type { SpeciesFact } from '../../shared/types.js';
import { BIRD_TRAITS } from './birdTraits.js';
import { ELTONTRAITS_SOURCE, ELTONTRAITS_URL, formatDiet, formatMass } from './mammalFacts.js';

const STRATA: Record<string, string> = {
  U: 'under water',
  W: 'on the water',
  G: 'on the ground',
  L: 'in low shrubs',
  M: 'at mid-height in trees',
  C: 'in the treetops',
  A: 'in the air',
};

/** "G40,L20,C40" → "On the ground 40%, in the treetops 40%, in low shrubs 20%". */
export function formatStrata(strata: string): string | undefined {
  const parts = strata
    .split(',')
    .map((p) => p.match(/^([A-Z])(\d+)$/))
    .filter((m): m is RegExpMatchArray => !!m && !!STRATA[m[1]])
    .map((m) => ({ label: STRATA[m[1]], pct: Number(m[2]) }))
    .sort((a, b) => b.pct - a.pct);
  if (!parts.length) return undefined;
  const text =
    parts.length === 1 ? parts[0].label : parts.map((p) => `${p.label} ${p.pct}%`).join(', ');
  return text[0].toUpperCase() + text.slice(1);
}

/**
 * Size, diet, activity and foraging facts for a bird species from EltonTraits.
 * Tries each name in turn (e.g. the model's label, then GBIF's accepted name).
 */
export function birdTraitFacts(names: (string | undefined)[]): SpeciesFact[] {
  const traits = names
    .filter((n): n is string => !!n)
    .map((n) => BIRD_TRAITS[n.trim().toLowerCase()])
    .find(Boolean);
  if (!traits) return [];
  const source = { source: ELTONTRAITS_SOURCE, sourceUrl: ELTONTRAITS_URL };
  const facts: SpeciesFact[] = [];
  if (traits.m)
    facts.push({ label: 'Average adult weight', value: formatMass(traits.m), ...source });
  const diet = traits.d && formatDiet(traits.d);
  if (diet) facts.push({ label: 'Diet', value: diet, ...source });
  // EltonTraits flags nocturnal birds; the rest are diurnal. Same wording as mammals' 'Active'.
  facts.push({ label: 'Active', value: traits.n ? 'At night' : 'By day', ...source });
  const where = traits.f && formatStrata(traits.f);
  if (where) facts.push({ label: 'Where it feeds', value: where, ...source });
  return facts;
}
