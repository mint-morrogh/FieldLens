import { CATEGORIES } from '../../../shared/categories.js';
import { CANDIDATES } from '../../../shared/config.js';
import type { CategoryCheck, OrganismCategory } from '../../../shared/types.js';
import { ApiError, UpstreamError } from '../../lib/errors.js';
import { USER_AGENT } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import { slugId } from '../plantnet/plantnetProvider.js';
import type {
  IdentificationInput,
  IdentificationProvider,
  IdentificationResult,
  ProviderCandidate,
} from '../types.js';

const SERVICE = 'BioCLIP 2';

export const BIOCLIP_ATTRIBUTION = {
  provider: SERVICE,
  text: 'Image identification by BioCLIP 2 (Imageomics, MIT licence) — experimental',
  url: 'https://huggingface.co/imageomics/bioclip-2',
};

/** Below this share of belief in the chosen group, the photo probably shows something else. */
export const GROUP_MISMATCH_THRESHOLD = 0.5;
/** Newer provider: never present more than this as visual confidence until measured on real photos. */
export const EXPERIMENTAL_CONFIDENCE_CAP = 0.9;
const TIMEOUT_MS = 25_000;

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
};

type BioclipPayload = {
  images: string[];
  rank?: string;
  k?: number;
  taxa?: string[];
  within?: Partial<Record<string, string[]>>;
};

/** Map a BioCLIP kingdom/class to the FieldLens category that covers it. */
export function categoryForTaxon(kingdom?: string, className?: string): OrganismCategory {
  if (kingdom === 'Plantae') return 'plant';
  if (kingdom === 'Fungi') return 'fungus';
  switch (className) {
    case 'Aves':
      return 'bird';
    case 'Mammalia':
      return 'mammal';
    case 'Amphibia':
      return 'amphibian';
    case 'Reptilia':
    case 'Squamata':
    case 'Testudines':
    case 'Crocodylia':
      return 'reptile';
    case 'Actinopterygii':
    case 'Chondrichthyes':
    case 'Elasmobranchii':
      return 'fish';
    case 'Arachnida':
      return 'arachnid';
    case 'Insecta':
    case 'Chilopoda':
    case 'Diplopoda':
    case 'Collembola':
      return 'insect';
    default:
      return 'other';
  }
}

/** Parse Gradio's server-sent events and return the `complete` payload (or throw on `error`). */
export function parseGradioEvents(text: string): unknown {
  let event: string | undefined;
  for (const line of text.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) {
      if (event === 'complete') return JSON.parse(line.slice(5));
      if (event === 'error') throw new UpstreamError(SERVICE, 'http', 500);
    }
  }
  throw new UpstreamError(SERVICE, 'parse');
}

export function toCandidates(
  response: BioclipResponse,
  category: OrganismCategory,
): ProviderCandidate[] {
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
        visualConfidence: Math.min(EXPERIMENTAL_CONFIDENCE_CAP, Math.max(0, r.score * groupFactor)),
        source: { identification: SERVICE },
        links: [],
      } satisfies ProviderCandidate;
    });
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

  supports(category: OrganismCategory): boolean {
    return this.categories.includes(category) && !!CATEGORIES[category].taxonScope;
  }

  private async call(payload: BioclipPayload): Promise<BioclipResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    const headers = {
      Authorization: `Bearer ${this.token}`,
      'User-Agent': USER_AGENT,
    };
    try {
      const submit = await this.fetchImpl(`${this.spaceUrl}/gradio_api/call/identify`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [payload] }),
        signal: controller.signal,
      });
      if (!submit.ok) {
        await submit.text().catch(() => undefined);
        throw new UpstreamError(SERVICE, 'http', submit.status);
      }
      const { event_id: eventId } = (await submit.json()) as { event_id?: string };
      if (!eventId) throw new UpstreamError(SERVICE, 'parse');
      const stream = await this.fetchImpl(`${this.spaceUrl}/gradio_api/call/identify/${eventId}`, {
        headers,
        signal: controller.signal,
      });
      if (!stream.ok) throw new UpstreamError(SERVICE, 'http', stream.status);
      const data = parseGradioEvents(await stream.text()) as BioclipResponse[];
      if (!Array.isArray(data) || !data[0]?.results) throw new UpstreamError(SERVICE, 'parse');
      return data[0];
    } catch (error) {
      if (error instanceof UpstreamError) throw error;
      if (controller.signal.aborted) {
        throw new ApiError(
          'provider_timeout',
          'The identification service is waking up or busy. Please try again in a minute.',
        );
      }
      throw new UpstreamError(SERVICE, 'network');
    } finally {
      clearTimeout(timer);
    }
  }

  async identify(input: IdentificationInput): Promise<IdentificationResult> {
    const scope = CATEGORIES[input.category].taxonScope;
    const images = input.images.map((img) => Buffer.from(img.data).toString('base64'));
    const started = Date.now();
    const response = await this.call({
      images,
      within: scope,
      k: CANDIDATES.maxCandidates,
    });
    const likelihood = response.groupProbability ?? 1;
    let categoryCheck: CategoryCheck | undefined;
    if (likelihood < GROUP_MISMATCH_THRESHOLD) {
      // Off-target photo: ask what it looks like instead so the UI can suggest a category.
      const overview = await this.call({ images, rank: 'class', k: 1 }).catch(() => undefined);
      const best = overview?.results[0];
      const suggested = best ? categoryForTaxon(best.kingdom, best.class) : undefined;
      categoryCheck = {
        matchesCategory: false,
        likelihood,
        suggestedCategory: suggested && suggested !== input.category ? suggested : undefined,
        suggestedGroup:
          best?.kingdom === 'Plantae' || best?.kingdom === 'Fungi' ? best.kingdom : best?.class,
      };
    }
    logger.info('bioclip.identify', {
      category: input.category,
      images: images.length,
      groupProbability: Math.round(likelihood * 100) / 100,
      topScore: Math.round((response.results[0]?.score ?? 0) * 100) / 100,
      ms: Date.now() - started,
    });
    return {
      provider: SERVICE,
      candidates: categoryCheck ? [] : toCandidates(response, input.category),
      attribution: [BIOCLIP_ATTRIBUTION],
      experimental: true,
      categoryCheck,
    };
  }
}
