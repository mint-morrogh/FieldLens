import { CACHE_TTL_MS, TIMEOUTS_MS } from '../../shared/config.js';
import type {
  ConfidenceBand,
  OrganismCandidate,
  OrganismCategory,
  SafetyInfo,
  SafetyStatement,
  TaxonIdentity,
} from '../../shared/types.js';
import { cached, sharedCache, type Cache } from '../cache/cache.js';
import { fetchJson } from '../lib/http.js';
import { findHighRisk, findLookalikes, type HighRiskEntry } from './highRisk.js';
import { TPPT } from './tpptData.js';

export const WIKIPEDIA_LICENSE = 'CC BY-SA 4.0';
const TPPT_SOURCE = 'TPPT toxic plant database (Agroscope)';
const TPPT_URL = 'https://zenodo.org/records/15758276';
const CURATED_SOURCE = 'Wikipedia (summarised by FieldLens)';

/** Categories that get an edibility & safety section. */
export const SAFETY_CATEGORIES: OrganismCategory[] = ['plant', 'fungus'];

export interface SafetyTextProvider {
  readonly name: string;
  getSafetyStatements(taxon: TaxonIdentity): Promise<SafetyStatement[]>;
}

// ---------------------------------------------------------------------------
// Wikipedia: quote safety-relevant sentences verbatim
// ---------------------------------------------------------------------------

const RELEVANT_SECTION =
  /toxic|poison|edib|uses|culinary|food|cuisine|culture|similar|look-?alike|confus|safety|hazard|chemistry|consumption/i;
const TOXIC =
  /\b(toxic|toxin|poison\w*|fatal|deadly|lethal|harmful|irritat\w*|dermatitis|blister\w*|phototoxic|vomit\w*)\b/i;
const NOT_EDIBLE =
  /\b(inedible|not edible|should not be eaten|unpalatable|not recommended (?:for|to be) (?:eat|consum)\w*)\b/i;
const EDIBLE = /\b(edible|eaten|eat|cooked|culinary|jam|jelly|pies?|wine|syrup|foraged|food)\b/i;
const LOOKALIKE = /\b(resembl\w*|confused with|mistaken for|look-?alikes?|confusion)\b/i;

/** Split a plain-text article into (heading, body) sections; the lead has an empty heading. */
export function splitSections(extract: string): { heading: string; body: string }[] {
  const parts = extract.split(/^={2,}\s*(.+?)\s*={2,}\s*$/m);
  const sections = [{ heading: '', body: parts[0] ?? '' }];
  for (let i = 1; i < parts.length; i += 2)
    sections.push({ heading: parts[i], body: parts[i + 1] ?? '' });
  return sections;
}

export function classifySentence(sentence: string): SafetyStatement['kind'] | undefined {
  if (LOOKALIKE.test(sentence) && (TOXIC.test(sentence) || EDIBLE.test(sentence)))
    return 'lookalike';
  if (TOXIC.test(sentence)) return 'toxic';
  if (NOT_EDIBLE.test(sentence)) return 'caution';
  if (EDIBLE.test(sentence)) return 'edible';
  return undefined;
}

/** Deterministic extraction: only sentences that already exist in the article are returned. */
export function extractSafetySentences(
  extract: string,
  pageUrl: string,
  perKind = 2,
): SafetyStatement[] {
  const out: SafetyStatement[] = [];
  const counts: Record<string, number> = {};
  const seen = new Set<string>();
  for (const { heading, body } of splitSections(extract)) {
    if (heading && !RELEVANT_SECTION.test(heading)) continue;
    const sentences = body
      .replace(/\s+/g, ' ')
      .split(/(?<=[.!?])\s+(?=[A-Z])/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 30 && s.length <= 360)
      // Skip lists of names ("Common names include bittersweet, … felonwort, …").
      .filter((s) => !/^(common|other|vernacular|local) names?\b/i.test(s))
      .filter((s) => (s.match(/,/g) ?? []).length <= 5);
    for (const sentence of sentences) {
      const kind = classifySentence(sentence);
      if (!kind || (counts[kind] ?? 0) >= perKind || seen.has(sentence)) continue;
      seen.add(sentence);
      counts[kind] = (counts[kind] ?? 0) + 1;
      out.push({
        kind,
        text: sentence,
        quote: true,
        source: 'Wikipedia',
        sourceUrl: pageUrl,
        license: WIKIPEDIA_LICENSE,
      });
    }
  }
  return out;
}

type ExtractResponse = {
  query?: { pages?: { title?: string; extract?: string; missing?: boolean }[] };
};

export class WikipediaSafetyProvider implements SafetyTextProvider {
  readonly name = 'Wikipedia';
  constructor(
    private readonly cache: Cache = sharedCache,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getSafetyStatements(taxon: TaxonIdentity): Promise<SafetyStatement[]> {
    const title = taxon.scientificName;
    return cached(this.cache, `wikipedia-safety:${title}`, CACHE_TTL_MS.speciesInfo, async () => {
      const params = new URLSearchParams({
        action: 'query',
        prop: 'extracts',
        explaintext: '1',
        exsectionformat: 'wiki',
        redirects: '1',
        format: 'json',
        formatversion: '2',
        titles: title,
      });
      const data = await fetchJson<ExtractResponse>(
        `https://en.wikipedia.org/w/api.php?${params}`,
        {
          service: 'Wikipedia',
          timeoutMs: TIMEOUTS_MS.supporting,
          fetchImpl: this.fetchImpl,
        },
      );
      const page = data.query?.pages?.[0];
      if (!page?.extract || page.missing) return [];
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent((page.title ?? title).replace(/ /g, '_'))}`;
      return extractSafetySentences(page.extract, url);
    });
  }
}

// ---------------------------------------------------------------------------
// Local data: TPPT (species + genus) and the curated high-risk list
// ---------------------------------------------------------------------------

/** Map a TPPT human-toxicity grade to our severity (undefined = not worth a warning). */
export function tpptSeverity(grade: string): SafetyStatement['severity'] | undefined {
  const g = grade.toLowerCase();
  if (/very strong toxic|strong toxic/.test(g)) return 'deadly';
  if (/^toxic|toxic \(unknown|liver toxic|carcinogenic|cytotoxic/.test(g)) return 'toxic';
  if (/irritat|phototoxic|allergenic/.test(g)) return 'skin';
  if (/weak toxic/.test(g)) return 'caution';
  return undefined;
}

function tpptStatement(
  candidate: Pick<OrganismCandidate, 'scientificName' | 'genus'>,
): SafetyStatement | undefined {
  const name = candidate.scientificName.toLowerCase().split(/\s+/).slice(0, 2).join(' ');
  const source = { source: TPPT_SOURCE, sourceUrl: TPPT_URL, license: 'CC BY 4.0' } as const;
  const species = TPPT.species[name];
  if (species) {
    const severity = tpptSeverity(species.h);
    if (!severity) return undefined;
    const part = species.p ? ` (${species.p.toLowerCase()})` : '';
    return {
      ...source,
      kind: severity === 'caution' ? 'caution' : 'toxic',
      text: `Listed as “${species.h}” for people${part}.`,
      basis: 'species',
      severity,
    };
  }
  // Genus-level fallback only for genuinely toxic genera, clearly labelled as genus-level.
  const genus = (candidate.genus ?? name.split(' ')[0]).toLowerCase();
  const g = TPPT.genera[genus];
  const severity = g?.w ? tpptSeverity(g.w) : undefined;
  if (!g?.w || (severity !== 'deadly' && severity !== 'toxic')) return undefined;
  return {
    ...source,
    kind: 'toxic',
    text: `Some ${candidate.genus ?? genus} species are listed as “${g.w}” for people.${g.r ? ` ${g.r}` : ''}`,
    basis: 'genus',
    severity,
  };
}

function curatedStatement(entry: HighRiskEntry, subject?: string): SafetyStatement {
  return {
    kind: entry.severity === 'caution' ? 'caution' : 'toxic',
    text: entry.note,
    subject,
    basis: entry.taxon.includes(' ') ? 'species' : 'genus',
    severity: entry.severity,
    source: entry.source ?? CURATED_SOURCE,
    sourceUrl: entry.sourceUrl,
  };
}

/** Map Wikidata edibility values (P789) to statements; "medicinal" is dropped. */
export function edibilityStatements(values: string[], wikidataUrl?: string): SafetyStatement[] {
  const out: SafetyStatement[] = [];
  const clean = values.map((v) => v.toLowerCase()).filter((v) => v && !v.includes('medicinal'));
  const deadly = clean.filter((v) => /deadly|poisonous|toxic/.test(v));
  const caution = clean.filter((v) => /caution|inedible|psychoactive|allergenic/.test(v));
  const edible = clean.filter((v) => /edible|choice/.test(v) && !/inedible/.test(v));
  const base = { source: 'Wikidata', sourceUrl: wikidataUrl, license: 'CC0' } as const;
  if (deadly.length) {
    out.push({
      ...base,
      kind: 'toxic',
      severity: deadly.some((v) => v.includes('deadly')) ? 'deadly' : 'toxic',
      text: `Edibility recorded as: ${deadly.join(', ')}.`,
    });
  }
  if (caution.length)
    out.push({
      ...base,
      kind: 'caution',
      severity: 'caution',
      text: `Also recorded as: ${caution.join(', ')}.`,
    });
  if (edible.length && !deadly.length)
    out.push({ ...base, kind: 'edible', text: `Edibility recorded as: ${edible.join(', ')}.` });
  return out;
}

/** Curated dangerous look-alikes of a candidate (excluding its own entry), in warning order. */
export function dangerousLookalikes(
  top: Pick<OrganismCandidate, 'scientificName' | 'genus'>,
): HighRiskEntry[] {
  const own = findHighRisk(top.scientificName, top.genus);
  return findLookalikes(top.scientificName, top.genus).filter((look) => look !== own);
}

export type SafetyInput = {
  category: OrganismCategory;
  band: ConfidenceBand;
  candidates: OrganismCandidate[];
  /** Sentences quoted from the top candidate's Wikipedia article. */
  wikipedia: SafetyStatement[];
  /** Wikidata P789 values for the top candidate (mostly mushrooms). */
  wikidataEdibility?: string[];
  wikidataUrl?: string;
};

/**
 * Combine every source into one list. Toxic information is always included —
 * for the top candidate, for other likely candidates, and for known dangerous
 * look-alikes. Edible statements are included here but the UI only shows them
 * for high-confidence identifications.
 */
export function buildSafety(input: SafetyInput): SafetyInfo | undefined {
  if (!SAFETY_CATEGORIES.includes(input.category)) return undefined;
  const [top, ...rest] = input.candidates;
  if (!top) return undefined;
  const statements: SafetyStatement[] = [];

  const topRisk = findHighRisk(top.scientificName, top.genus);
  if (topRisk) statements.push(curatedStatement(topRisk));
  const topTppt = tpptStatement(top);
  if (topTppt) statements.push(topTppt);
  statements.push(...edibilityStatements(input.wikidataEdibility ?? [], input.wikidataUrl));
  statements.push(...input.wikipedia);

  // Other plausible candidates that are dangerous (matters most when unsure).
  // Mushrooms: always check the other likely candidates — a confident ID can still be a look-alike.
  const others = input.band === 'high' && input.category !== 'fungus' ? [] : rest.slice(0, 2);
  for (const c of others) {
    const risk = findHighRisk(c.scientificName, c.genus);
    const name = c.commonName ? `${c.commonName} (${c.scientificName})` : c.scientificName;
    if (risk && risk !== topRisk) statements.push(curatedStatement(risk, name));
    else {
      const t = tpptStatement(c);
      if (t && t.basis === 'species' && t.severity === 'deadly')
        statements.push({ ...t, subject: name });
    }
  }

  // Dangerous look-alikes of the top candidate.
  for (const look of dangerousLookalikes(top)) {
    statements.push({ ...curatedStatement(look, look.commonName), kind: 'lookalike' });
  }

  const warnings = statements.filter((s) => s.kind !== 'edible');
  // Graded toxic statements about the top candidate itself (no subject = the top candidate).
  const topToxic = statements.some(
    (s) => s.kind === 'toxic' && !s.subject && (s.severity === 'deadly' || s.severity === 'toxic'),
  );
  if (warnings.length === 0) return { statements, level: 'none', topToxic };
  // Only graded sources (curated list, TPPT, Wikidata) raise the red "danger" level;
  // quoted sentences like "toxic to horses" stay at caution.
  const danger = statements.some(
    (s) =>
      (s.kind === 'toxic' || s.kind === 'lookalike') &&
      (s.severity === 'deadly' || s.severity === 'toxic'),
  );
  return { statements, level: danger ? 'danger' : 'caution', topToxic };
}
