import { getTarget, targetMembers } from '../../../shared/categories.js';
import { CANDIDATES } from '../../../shared/config.js';
import type { CategoryCheck, IdentifyTarget, OrganismCategory } from '../../../shared/types.js';
import { ApiError, UpstreamError } from '../../lib/errors.js';
import { USER_AGENT } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { noteBioclipQuotaReached } from '../../usage/usage.js';
import { slugId } from '../plantnet/plantnetProvider.js';
import type {
  CategoryDetectionResult,
  IdentificationInput,
  IdentificationProvider,
  IdentificationResult,
  ProviderCandidate,
} from '../types.js';

const SERVICE = 'BioCLIP 2';

export const BIOCLIP_ATTRIBUTION = {
  provider: SERVICE,
  text: 'Image identification by BioCLIP 2 (Imageomics, MIT licence)',
  url: 'https://huggingface.co/imageomics/bioclip-2',
};

/** Below this share of belief in the chosen group, the photo probably shows something else. */
export const GROUP_MISMATCH_THRESHOLD = 0.5;
/**
 * Mushrooms were the one group that failed real-phone testing (2026-09-27), and
 * mistakes there are dangerous, so their visual confidence is capped.
 */
export const FUNGUS_CONFIDENCE_CAP = 0.9;
const TIMEOUT_MS = 25_000;
/**
 * Portraits scored 0.24–0.91 on the Space's person check; 166 photos of plants, fungi,
 * animals, tracks and droppings (some with a hand for scale) all stayed at or below 0.05.
 */
export const PERSON_THRESHOLD = 0.15;
const isPerson = (r: BioclipResponse) => (r.person ?? 0) >= PERSON_THRESHOLD;
const PERSON_RESULT = {
  provider: SERVICE,
  candidates: [],
  attribution: [BIOCLIP_ATTRIBUTION],
  experimental: true,
  person: true,
} satisfies IdentificationResult;

export type BioclipResult = {
  name: string;
  score: number;
  commonName?: string;
  kingdom?: string;
  phylum?: string;
  class?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
};

export type BioclipResponse = {
  results: BioclipResult[];
  rank: string;
  restricted: boolean;
  candidateCount: number;
  groupProbability?: number | null;
  /** 0–1 from a general CLIP model: does the photo show a person? (BioCLIP can't tell.) */
  person?: number;
};

type BioclipPayload = {
  images: string[];
  rank?: string;
  k?: number;
  taxa?: string[];
  within?: Partial<Record<string, string[]>>;
  /** Tracks or droppings: rank `candidates` with sign prompts (see hf-space/app.py). */
  sign?: string;
  candidates?: { name: string; common?: string }[];
};

const FISH_CLASSES = new Set([
  'Actinopterygii',
  'Elasmobranchii',
  'Holocephali',
  'Chondrichthyes',
  'Petromyzonti',
  'Myxini',
  'Coelacanthi',
  'Dipneusti',
]);
const REPTILE_CLASSES = new Set([
  'Reptilia',
  'Squamata',
  'Testudines',
  'Crocodylia',
  'Sphenodontia',
]);
const BUG_CLASSES = new Set(['Insecta', 'Chilopoda', 'Diplopoda', 'Collembola']);

/** Map a BioCLIP kingdom/phylum/class to the FieldLens category that covers it. */
export function categoryForTaxon(
  kingdom?: string,
  className?: string,
  phylum?: string,
): OrganismCategory {
  if (kingdom === 'Plantae') return 'plant';
  if (kingdom === 'Fungi') return 'fungus';
  const cls = className ?? '';
  if (cls === 'Aves') return 'bird';
  if (cls === 'Mammalia') return 'mammal';
  if (cls === 'Amphibia') return 'amphibian';
  if (REPTILE_CLASSES.has(cls)) return 'reptile';
  if (cls === 'Arachnida') return 'arachnid';
  if (BUG_CLASSES.has(cls)) return 'insect';
  // Tree of Life labels leave most ray-finned fish without a class.
  if (FISH_CLASSES.has(cls) || (phylum === 'Chordata' && (!cls || cls.endsWith('(unranked)')))) {
    return 'fish';
  }
  return 'other';
}

/**
 * "…retry in 2:05:11" / "Try again in 45:10" (ZeroGPU quota messages) → "2 h 5 min".
 * Returns undefined when no duration is given.
 */
export function quotaRetryIn(message: string): string | undefined {
  const m = message.match(/(?:retry|try again) in (?:(\d+):)?(\d+):(\d+)/i);
  if (!m) return undefined;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2]) + (Number(m[3]) >= 30 ? 1 : 0);
  return h ? `${h} h ${min} min` : `${Math.max(1, min)} min`;
}

/** Parse Gradio's server-sent events and return the `complete` payload (or throw on `error`). */
export function parseGradioEvents(text: string, service: string = SERVICE): unknown {
  let event: string | undefined;
  for (const line of text.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) {
      if (event === 'complete') return JSON.parse(line.slice(5));
      if (event === 'error') {
        // ZeroGPU reports an exhausted daily GPU quota as an error event.
        const data = line.slice(5);
        if (/quota/i.test(data)) {
          const retryIn = quotaRetryIn(data);
          noteBioclipQuotaReached(retryIn);
          throw new UpstreamError(service, 'http', 429, retryIn);
        }
        throw new UpstreamError(service, 'http', 500);
      }
    }
  }
  throw new UpstreamError(service, 'parse');
}

export function toCandidates(
  response: BioclipResponse,
  target: IdentifyTarget,
): ProviderCandidate[] {
  const members = targetMembers(target);
  // Fold "does this look like the chosen group at all?" into the visual score, then cap it.
  const groupFactor =
    response.groupProbability === undefined || response.groupProbability === null
      ? 1
      : Math.min(1, response.groupProbability / 0.9);
  return response.results
    .filter((r) => r.species || r.name)
    .slice(0, CANDIDATES.maxCandidates)
    .map((r) => {
      const scientificName = (r.species || r.name).trim();
      // Groups ("bug", "animal"): each candidate gets its own specific category.
      const detected = categoryForTaxon(r.kingdom, r.class, r.phylum);
      const category = members.includes(detected) ? detected : members[0];
      return {
        id: slugId('bioclip', scientificName),
        category,
        scientificName,
        commonName: r.commonName?.trim() || undefined,
        kingdom: r.kingdom || undefined,
        phylum: r.phylum || undefined,
        className: r.class || undefined,
        order: r.order || undefined,
        family: r.family || undefined,
        genus: r.genus || undefined,
        taxonKeys: {},
        visualConfidence: Math.min(
          category === 'fungus' ? FUNGUS_CONFIDENCE_CAP : 1,
          Math.max(0, r.score * groupFactor),
        ),
        source: { identification: SERVICE },
        links: [],
      } satisfies ProviderCandidate;
    });
}

export type SpaceTarget = {
  spaceUrl: string;
  token: string;
  fetchImpl: typeof fetch;
  service: string;
};

/** Calls a Gradio endpoint on our Hugging Face Space and returns its output list. */
export async function callSpace(
  space: SpaceTarget,
  endpoint: string,
  payload: unknown,
  timeoutMs: number = TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const headers = {
    Authorization: `Bearer ${space.token}`,
    'User-Agent': USER_AGENT,
  };
  try {
    const submit = await space.fetchImpl(`${space.spaceUrl}/gradio_api/call/${endpoint}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ data: [payload] }),
      signal: controller.signal,
    });
    if (!submit.ok) {
      await submit.text().catch(() => undefined);
      throw new UpstreamError(space.service, 'http', submit.status);
    }
    const { event_id: eventId } = (await submit.json()) as { event_id?: string };
    if (!eventId) throw new UpstreamError(space.service, 'parse');
    const stream = await space.fetchImpl(
      `${space.spaceUrl}/gradio_api/call/${endpoint}/${eventId}`,
      { headers, signal: controller.signal },
    );
    if (!stream.ok) throw new UpstreamError(space.service, 'http', stream.status);
    return parseGradioEvents(await stream.text(), space.service);
  } catch (error) {
    if (error instanceof UpstreamError) throw error;
    if (controller.signal.aborted) {
      throw new ApiError(
        'provider_timeout',
        'The identification service is waking up or busy. Please try again in a minute.',
      );
    }
    throw new UpstreamError(space.service, 'network');
  } finally {
    clearTimeout(timer);
  }
}

/**
 * BioCLIP 2 running in our private Hugging Face Space (see hf-space/). One
 * provider serves every category that declares a `taxonScope`; the scope keeps
 * the open-ended model inside the chosen group.
 */
export class BioclipIdentificationProvider implements IdentificationProvider {
  readonly name = SERVICE;
  readonly acceptedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
  readonly maxImages = 5;

  constructor(
    private readonly spaceUrl: string,
    private readonly token: string,
    private readonly categories: readonly OrganismCategory[],
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  supports(target: IdentifyTarget): boolean {
    if (target === 'auto') return false; // handled by detectCategory() in the pipeline
    const members = targetMembers(target);
    return !!getTarget(target).taxonScope && members.every((m) => this.categories.includes(m));
  }

  private async call(payload: BioclipPayload): Promise<BioclipResponse> {
    const data = (await callSpace(
      { spaceUrl: this.spaceUrl, token: this.token, fetchImpl: this.fetchImpl, service: SERVICE },
      'identify',
      payload,
    )) as BioclipResponse[];
    if (!Array.isArray(data) || !data[0]?.results) throw new UpstreamError(SERVICE, 'parse');
    return data[0];
  }

  async identify(input: IdentificationInput): Promise<IdentificationResult> {
    if (input.sign && input.signCandidates?.length) return this.identifySign(input);
    const scope = getTarget(input.category).taxonScope;
    const images = input.images.map((img) => Buffer.from(img.data).toString('base64'));
    const started = Date.now();
    const response = await this.call({
      images,
      within: scope,
      k: CANDIDATES.maxCandidates,
    });
    if (isPerson(response)) return PERSON_RESULT;
    const likelihood = response.groupProbability ?? 1;
    let categoryCheck: CategoryCheck | undefined;
    if (likelihood < GROUP_MISMATCH_THRESHOLD) {
      // Looks off-target. Get a second opinion from the top-species vote, which handles
      // camouflaged subjects better (e.g. a frog in leaf litter). If the vote agrees with
      // the chosen group, carry on; otherwise suggest the category it points to.
      const vote = await this.detectCategory(input).catch(() => undefined);
      const members = targetMembers(input.category);
      if (!vote || !members.includes(vote.category)) {
        categoryCheck = {
          matchesCategory: false,
          likelihood,
          suggestedCategory:
            vote && vote.category !== 'other' && !members.includes(vote.category)
              ? vote.category
              : undefined,
          suggestedGroup: vote?.category,
        };
      }
    }
    logger.info('bioclip.identify', {
      category: input.category,
      images: images.length,
      groupProbability: Math.round(likelihood * 100) / 100,
      topScore: Math.round((response.results[0]?.score ?? 0) * 100) / 100,
      ms: Date.now() - started,
    });
    const candidates = categoryCheck ? [] : toCandidates(response, input.category);
    return {
      provider: SERVICE,
      candidates,
      attribution: [BIOCLIP_ATTRIBUTION],
      experimental: true,
      categoryCheck,
      detectedCategory: candidates[0]?.category,
    };
  }

  /** Tracks or droppings, ranked against mammals recorded near the user. */
  private async identifySign(input: IdentificationInput): Promise<IdentificationResult> {
    const images = input.images.map((img) => Buffer.from(img.data).toString('base64'));
    const started = Date.now();
    const response = await this.call({
      images,
      sign: input.sign,
      candidates: input.signCandidates,
      k: CANDIDATES.maxCandidates,
    });
    logger.info('bioclip.identify_sign', {
      sign: input.sign,
      candidates: input.signCandidates?.length,
      topScore: Math.round((response.results[0]?.score ?? 0) * 100) / 100,
      ms: Date.now() - started,
    });
    if (isPerson(response)) return PERSON_RESULT;
    const candidates = toCandidates(response, 'mammal');
    return {
      provider: SERVICE,
      candidates,
      attribution: [BIOCLIP_ATTRIBUTION],
      experimental: true,
      detectedCategory: candidates.length ? 'mammal' : undefined,
    };
  }

  /**
   * "Not sure": let the top 20 species vote for a category, weighted by score.
   * On test photos this beat summing whole classes, which favours huge classes
   * (e.g. a camouflaged frog came out as "fungus" by class sums).
   */
  async detectCategory(input: IdentificationInput): Promise<CategoryDetectionResult> {
    const images = input.images.map((img) => Buffer.from(img.data).toString('base64'));
    const response = await this.call({ images, k: 20 });
    if (isPerson(response)) return { category: 'mammal', likelihood: 1, person: true };
    const votes = new Map<OrganismCategory, number>();
    for (const r of response.results) {
      const c = categoryForTaxon(r.kingdom, r.class, r.phylum);
      votes.set(c, (votes.get(c) ?? 0) + r.score);
    }
    const total = [...votes.values()].reduce((a, b) => a + b, 0) || 1;
    const [category, weight] = [...votes.entries()].sort((a, b) => b[1] - a[1])[0] ?? ['other', 0];
    return { category, likelihood: Math.min(1, weight / total) };
  }
}
