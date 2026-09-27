import { randomUUID } from 'node:crypto';
import { CATEGORIES } from '../../shared/categories.js';
import { confidenceBand } from '../../shared/confidence.js';
import { GROUPING, TIMEOUTS_MS } from '../../shared/config.js';
import { coarseLocationLabel } from '../../shared/geo.js';
import type {
  Attribution,
  CommunityObservationSummary,
  GroupSummary,
  IdentifyResponse,
  NearbySpeciesGroup,
  OccurrenceEvidence,
  OrganismCandidate,
  SourceStatus,
  SpeciesFact,
  SafetyStatement,
  SpeciesInfo,
  StageEvent,
  TaxonIdentity,
} from '../../shared/types.js';
import { ApiError, UpstreamError } from '../lib/errors.js';
import { settle } from '../lib/http.js';
import { logger } from '../lib/logger.js';
import { GBIF_ATTRIBUTION, GBIF_SOURCE } from '../providers/gbif/gbif.js';
import { INAT_ATTRIBUTION } from '../providers/inaturalist/inaturalistProvider.js';
import { taxonLinks } from '../providers/plantnet/plantnetProvider.js';
import type {
  IdentificationInput,
  ProviderCandidate,
  ProviderSet,
  ResolvedTaxon,
} from '../providers/types.js';
import { WIKIPEDIA_SOURCE } from '../providers/wiki/wiki.js';
import { DeterministicGeoReranker, type CandidateReranker } from '../ranking/reranker.js';
import { SAFETY_CATEGORIES, buildSafety } from '../safety/safety.js';
import { buildEvidence, buildGuidance } from './evidence.js';

/** Reject if `promise` doesn't settle within `ms`, so one slow source can't stall the response. */
export function withDeadline<T>(promise: Promise<T>, ms: number, service: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new UpstreamError(service, 'timeout')), ms);
  });
  return Promise.race([promise, deadline]).finally(() => clearTimeout(timer));
}

const STAGE_MS = TIMEOUTS_MS.supporting + 1500;
const MONTHS = [
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

function toIdentity(
  c: ProviderCandidate | OrganismCandidate,
  extra?: Partial<TaxonIdentity>,
): TaxonIdentity {
  return {
    scientificName: c.scientificName,
    category: c.category,
    gbifKey: c.taxonKeys.gbif,
    powoId: c.taxonKeys.powo,
    genus: c.genus,
    family: c.family,
    ...extra,
  };
}

function mergeTaxonomy(c: ProviderCandidate, t: ResolvedTaxon | undefined): ProviderCandidate {
  if (!t) return c;
  const gbif = t.gbifKey ?? c.taxonKeys.gbif;
  const links = c.links.filter((l) => l.label !== 'GBIF');
  return {
    ...c,
    commonName: c.commonName ?? t.vernacularName,
    kingdom: t.kingdom ?? c.kingdom,
    phylum: t.phylum ?? c.phylum,
    className: t.className ?? c.className,
    order: t.order ?? c.order,
    family: t.family ?? c.family,
    genus: t.genus ?? c.genus,
    taxonKeys: { ...c.taxonKeys, gbif },
    source: { ...c.source, taxonomy: [GBIF_SOURCE] },
    links: [...taxonLinks({ gbifKey: gbif }), ...links],
  };
}

/** Deterministic description of the busiest months in local occurrence records. */
export function peakMonthsFact(monthCounts: number[] | undefined): string | undefined {
  if (!monthCounts) return undefined;
  const total = monthCounts.reduce((a, b) => a + b, 0);
  if (total < 12) return undefined;
  return monthCounts
    .map((count, month) => ({ count, month }))
    .sort((a, b) => b.count - a.count || a.month - b.month)
    .slice(0, 3)
    .sort((a, b) => a.month - b.month)
    .map((m) => MONTHS[m.month])
    .join(', ');
}

export type PipelineDeps = {
  providers: ProviderSet;
  reranker?: CandidateReranker;
  /** Called as each stage starts/finishes, for live progress in the UI. Must not throw. */
  onStage?: (event: StageEvent) => void;
};

/** Genus-level answer when the species is uncertain but top candidates share a genus. */
export function genusGroup(
  ranked: OrganismCandidate[],
  band: string,
): Omit<GroupSummary, 'commonName'> | undefined {
  const genus = ranked[0]?.genus;
  if (!genus || band === 'high') return undefined;
  const members = ranked.filter((c) => c.genus === genus);
  const confidence = Math.min(
    1,
    members.reduce((sum, c) => sum + c.finalConfidence, 0),
  );
  if (members.length < GROUPING.minMembers || confidence < GROUPING.minConfidence) return undefined;
  return { rank: 'genus', name: genus, confidence, memberCount: members.length };
}

export async function runIdentification(
  input: IdentificationInput,
  deps: PipelineDeps,
): Promise<IdentifyResponse> {
  const { providers } = deps;
  const reranker = deps.reranker ?? new DeterministicGeoReranker();
  const stage = (event: StageEvent) => {
    try {
      deps.onStage?.(event);
    } catch {
      /* progress reporting must never break identification */
    }
  };
  const category = CATEGORIES[input.category];
  const requestId = randomUUID();

  // 1. Category-aware provider selection.
  const provider = providers.identification.find((p) => p.supports(input.category));
  if (!provider) {
    if (providers.identification.length === 0) {
      throw new ApiError('not_configured', 'Identification isn’t configured on this server yet.');
    }
    throw new ApiError(
      'unsupported_category',
      `${category.label} identification is coming soon. Plants are supported today.`,
    );
  }
  if (input.images.length > provider.maxImages) {
    throw new ApiError(
      'too_many_images',
      `Up to ${provider.maxImages} photos can be combined in one identification.`,
    );
  }
  if (input.images.some((img) => !provider.acceptedMimeTypes.includes(img.mimeType))) {
    throw new ApiError(
      'invalid_file',
      'This photo format is not supported. Please use a JPEG or PNG image.',
    );
  }

  // 2. Visual identification (the only stage allowed to fail the request).
  const started = Date.now();
  stage({ stage: 'identify', status: 'active' });
  const identification = await provider.identify(input);
  const topVisual = identification.candidates[0]?.visualConfidence;
  logger.info('identify.visual', {
    provider: provider.name,
    candidates: identification.candidates.length,
    topScore: topVisual !== undefined ? Math.round(topVisual * 100) / 100 : undefined,
    ms: Date.now() - started,
  });
  stage({
    stage: 'identify',
    status: 'done',
    preview: identification.candidates.slice(0, 3).map((c) => ({
      scientificName: c.scientificName,
      commonName: c.commonName,
      visualConfidence: c.visualConfidence,
    })),
  });

  const locationProvided = !!input.location;
  const location = input.location
    ? { used: true, approx: input.location, label: coarseLocationLabel(input.location) }
    : { used: false };
  const attribution: Attribution[] = [...identification.attribution];
  const features = input.images.map((i) => i.feature);

  if (identification.candidates.length === 0) {
    return {
      requestId,
      category: input.category,
      generatedAt: new Date().toISOString(),
      imagesSubmitted: input.images.length,
      location,
      confidenceBand: 'none',
      candidates: [],
      evidence: { supports: [], uncertainties: [] },
      guidance: identification.categoryCheck
        ? [
            {
              message: `This photo doesn't look like ${category.pluralNoun === 'fish' ? 'a fish' : `one of the ${category.pluralNoun}`} we can identify.`,
            },
          ]
        : [{ message: category.generalAdvice }],
      attribution,
      sourceStatus: {
        identification: 'ok',
        occurrence: 'skipped',
        speciesInfo: 'skipped',
        community: 'skipped',
      },
      safetyNotice: category.safetyNotice,
      experimental: identification.experimental || undefined,
      categoryCheck: identification.categoryCheck,
      mock: providers.mock || undefined,
    };
  }

  // 3. Taxonomy normalization (parallel, failures tolerated per candidate).
  stage({ stage: 'taxonomy', status: 'active' });
  const taxonomyResults = await Promise.all(
    identification.candidates.map((c) =>
      settle(withDeadline(providers.taxonomy.resolveTaxon(toIdentity(c)), STAGE_MS, GBIF_SOURCE)),
    ),
  );
  const resolved = taxonomyResults.map((r) => (r.ok ? r.value : undefined));
  const candidates = identification.candidates.map((c, i) => mergeTaxonomy(c, resolved[i]));
  stage({ stage: 'taxonomy', status: 'done' });

  // 4. Geographic evidence (parallel).
  let occurrenceStatus: SourceStatus = 'skipped';
  let withOccurrence: (ProviderCandidate & { occurrence?: OccurrenceEvidence })[] = candidates;
  if (!input.location) stage({ stage: 'occurrence', status: 'skipped' });
  if (input.location) {
    stage({ stage: 'occurrence', status: 'active' });
    const loc = input.location;
    const occurrence = await Promise.all(
      candidates.map((c) =>
        c.taxonKeys.gbif
          ? settle(
              withDeadline(
                providers.occurrence.getOccurrenceEvidence(toIdentity(c), loc, input.capturedAt),
                STAGE_MS,
                GBIF_SOURCE,
              ),
            )
          : Promise.resolve(undefined),
      ),
    );
    const attempted = occurrence.filter((o) => o !== undefined);
    occurrenceStatus = attempted.some((o) => o.ok) ? 'ok' : 'unavailable';
    if (occurrenceStatus === 'unavailable') logger.warn('identify.occurrence_unavailable');
    withOccurrence = candidates.map((c, i) => {
      const o = occurrence[i];
      return o?.ok
        ? { ...c, occurrence: o.value, source: { ...c.source, occurrence: [GBIF_SOURCE] } }
        : c;
    });
    stage({ stage: 'occurrence', status: occurrenceStatus === 'ok' ? 'done' : 'skipped' });
  }

  // 5. Deterministic reranking.
  const ranked = await reranker.rerank({
    candidates: withOccurrence,
    locationUsed: occurrenceStatus === 'ok',
    capturedAt: input.capturedAt,
  });
  const top = ranked[0];
  const topResolved = resolved[identification.candidates.findIndex((c) => c.id === top.id)];
  const band = confidenceBand(top.finalConfidence);
  stage({ stage: 'rank', status: 'done' });
  const group = genusGroup(ranked, band);

  // 6. Facts, photos, community observations and nearby species — all independent and optional.
  stage({ stage: 'enrich', status: 'active' });
  const topIdentity = toIdentity(top);
  const speciesInfoTask = (async (): Promise<{
    info?: SpeciesInfo;
    status: SourceStatus;
    sources: Set<string>;
    edibility: string[];
    wikidataUrl?: string;
  }> => {
    // Every source runs in parallel except Wikipedia, which waits for Wikidata's article title.
    const run = (p: (typeof providers.speciesInfo)[number], wikipediaTitle?: string) =>
      settle(withDeadline(p.getSpeciesInfo(topIdentity, { wikipediaTitle }), STAGE_MS, p.name));
    const independent = providers.speciesInfo.filter((p) => p.name !== WIKIPEDIA_SOURCE);
    const wikipedia = providers.speciesInfo.filter((p) => p.name === WIKIPEDIA_SOURCE);
    const first = await Promise.all(independent.map((p) => run(p)));
    const title = first
      .map((r) => (r.ok && 'wikipediaTitle' in r.value ? r.value.wikipediaTitle : undefined))
      .find(Boolean);
    const results = [...first, ...(await Promise.all(wikipedia.map((p) => run(p, title))))];
    const parts = results.filter((r) => r.ok).map((r) => r.value);
    const failures = results.length - parts.length;
    const facts: SpeciesFact[] = parts.flatMap((p) => p.facts ?? []);
    const peak = peakMonthsFact(top.occurrence?.monthCounts);
    if (peak) {
      facts.push({
        label: 'Busiest months for nearby records',
        value: peak,
        source: `${GBIF_SOURCE} (within 100 km)`,
      });
    }
    const commonNames = [
      ...new Set(
        [...(top.commonNames ?? []), ...parts.flatMap((p) => p.commonNames ?? [])].map((n) =>
          n.trim(),
        ),
      ),
    ];
    const dedupe = new Map<string, string>();
    for (const n of commonNames) if (!dedupe.has(n.toLowerCase())) dedupe.set(n.toLowerCase(), n);
    const sources = new Set(
      parts
        .filter(
          (p) =>
            (p.facts?.length ?? 0) > 0 || p.summary || p.commonNames?.length || p.images?.length,
        )
        .map((p) => p.source),
    );
    const info: SpeciesInfo = {
      scientificName: top.scientificName,
      commonNames: [...dedupe.values()].slice(0, 8),
      taxonomy: {
        kingdom: top.kingdom,
        phylum: top.phylum,
        className: top.className,
        order: top.order,
        family: top.family,
        genus: top.genus,
        species: topResolved?.species ?? top.scientificName,
      },
      facts,
      summary: parts.find((p) => p.summary)?.summary,
      images: parts.flatMap((p) => p.images ?? []),
      links: [
        ...top.links,
        ...parts
          .flatMap((p) => p.links ?? [])
          .filter((l) => !top.links.some((t) => t.url === l.url)),
      ],
      sources: [...sources],
    };
    const status: SourceStatus = failures === providers.speciesInfo.length ? 'unavailable' : 'ok';
    return {
      info,
      status,
      sources,
      edibility: parts.flatMap((p) => p.edibility ?? []),
      wikidataUrl: parts.find((p) => p.wikidataUrl)?.wikidataUrl,
    };
  })();

  const communityTask = settle(
    withDeadline(
      providers.community.getNearbyObservations(topIdentity, input.location),
      STAGE_MS * 1.5,
      providers.community.name,
    ),
  );

  const nearbyTask: Promise<NearbySpeciesGroup | undefined> =
    input.location && occurrenceStatus === 'ok' && topResolved
      ? withDeadline(
          providers.nearbySpecies.getNearbySpecies(
            { ...topIdentity, genusKey: topResolved.genusKey, familyKey: topResolved.familyKey },
            input.location,
            new Set(ranked.map((c) => c.scientificName.toLowerCase())),
          ),
          STAGE_MS,
          GBIF_SOURCE,
        ).catch(() => undefined)
      : Promise.resolve(undefined);

  const safetyTextTask: Promise<SafetyStatement[]> =
    SAFETY_CATEGORIES.includes(input.category) && providers.safety
      ? withDeadline(
          providers.safety.getSafetyStatements(topIdentity),
          STAGE_MS,
          providers.safety.name,
        ).catch(() => [])
      : Promise.resolve([]);

  const groupNameTask: Promise<string | undefined> =
    group && topResolved?.genusKey && providers.taxonomy.commonNameForKey
      ? withDeadline(
          providers.taxonomy.commonNameForKey(topResolved.genusKey),
          STAGE_MS,
          GBIF_SOURCE,
        ).catch(() => undefined)
      : Promise.resolve(undefined);

  const [speciesResult, communityResult, nearbySpecies, groupCommonName, safetyText] =
    await Promise.all([speciesInfoTask, communityTask, nearbyTask, groupNameTask, safetyTextTask]);
  stage({ stage: 'enrich', status: 'done' });
  const community: CommunityObservationSummary | undefined = communityResult.ok
    ? communityResult.value
    : undefined;
  // Open-ended models (BioCLIP) sometimes carry obscure common names ("Wanderer" for the
  // monarch); prefer iNaturalist's preferred name for the top candidate when we have it.
  if (identification.experimental && community?.taxonCommonName && ranked[0]) {
    const preferred = community.taxonCommonName;
    ranked[0] = { ...ranked[0], commonName: preferred };
    if (speciesResult.info) {
      speciesResult.info.commonNames = [
        preferred,
        ...speciesResult.info.commonNames.filter(
          (n) => n.toLowerCase() !== preferred.toLowerCase(),
        ),
      ];
    }
  }
  if (!communityResult.ok) logger.warn('identify.community_unavailable');

  if (resolved.some(Boolean) || occurrenceStatus === 'ok') attribution.push(GBIF_ATTRIBUTION);
  if (community || speciesResult.info?.images?.length) attribution.push(INAT_ATTRIBUTION);
  if (speciesResult.sources.has('Wikidata')) {
    attribution.push({
      provider: 'Wikidata',
      text: 'Common names from Wikidata (CC0)',
      url: 'https://www.wikidata.org/',
    });
  }
  const safety = buildSafety({
    category: input.category,
    band,
    candidates: ranked,
    wikipedia: safetyText,
    wikidataEdibility: speciesResult.edibility,
    wikidataUrl: speciesResult.wikidataUrl,
  });
  if (safety?.statements.some((s) => s.source.startsWith('TPPT'))) {
    attribution.push({
      provider: 'TPPT',
      text: 'Plant toxicity data from TPPT (Agroscope, CC BY 4.0)',
      url: 'https://zenodo.org/records/15758276',
    });
  }

  if (speciesResult.info?.summary || safety?.statements.some((s) => s.source === 'Wikipedia')) {
    attribution.push({
      provider: WIKIPEDIA_SOURCE,
      text: 'Summary from Wikipedia (CC BY-SA 4.0)',
      url:
        speciesResult.info?.summary?.sourceUrl ??
        safety?.statements.find((s) => s.source === 'Wikipedia')?.sourceUrl ??
        'https://en.wikipedia.org/',
    });
  }

  const evidence = buildEvidence({
    category: input.category,
    candidates: ranked,
    band,
    imageCount: input.images.length,
    features,
    locationProvided,
    occurrenceStatus,
    community,
  });

  logger.info('identify.done', {
    band,
    candidates: ranked.length,
    occurrence: occurrenceStatus,
    community: communityResult.ok,
    ms: Date.now() - started,
  });

  return {
    requestId,
    category: input.category,
    generatedAt: new Date().toISOString(),
    imagesSubmitted: input.images.length,
    location,
    confidenceBand: band,
    candidates: ranked,
    speciesInfo: speciesResult.info,
    groupSummary: group ? { ...group, commonName: groupCommonName } : undefined,
    safety,
    community,
    nearbySpecies,
    evidence,
    guidance: buildGuidance({ category: input.category, band, features }),
    attribution,
    sourceStatus: {
      identification: 'ok',
      occurrence: occurrenceStatus,
      speciesInfo: speciesResult.status,
      community: communityResult.ok ? 'ok' : 'unavailable',
    },
    safetyNotice: category.safetyNotice,
    experimental: identification.experimental || undefined,
    categoryCheck: identification.categoryCheck,
    mock: providers.mock || undefined,
  };
}
