import { CANDIDATES } from '../../../shared/config.js';
import type { IdentifyTarget } from '../../../shared/types.js';
import { ApiError, UpstreamError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { callSpace, type SpaceTarget } from '../bioclip/bioclipProvider.js';
import { slugId } from '../plantnet/plantnetProvider.js';
import type {
  IdentificationInput,
  IdentificationProvider,
  IdentificationResult,
  ProviderCandidate,
} from '../types.js';

const SERVICE = 'BirdNET';

export const BIRDNET_ATTRIBUTION = {
  provider: SERVICE,
  text: 'Bird call identification by BirdNET (K. Lisa Yang Center for Conservation Bioacoustics, CC BY-NC-SA 4.0)',
  url: 'https://github.com/birdnet-team/BirdNET-Analyzer',
};

/**
 * On 40 real recordings, a best-window score of 0.5 or more was right 28 times out of 29,
 * so a single call is never shown as more certain than this.
 */
export const CALL_CONFIDENCE_CAP = 0.95;
const TIMEOUT_MS = 30_000;

export type BirdnetResult = {
  name: string;
  common?: string;
  score: number;
  mean: number;
  segments?: number;
  of?: number;
};
export type BirdnetResponse = { results: BirdnetResult[]; sound?: string | null };

/** BirdNET's 48-week year: four "weeks" per month (days 1–7, 8–14, 15–21, 22–end). */
export function birdnetWeek(date: Date): number {
  return date.getUTCMonth() * 4 + Math.min(4, Math.floor((date.getUTCDate() - 1) / 7) + 1);
}

/**
 * The Space ranks by the mean over 3 s windows (the bird singing throughout), while `score`
 * is the best window. Confidence follows the best window but never rises down the list, so
 * the reranker keeps BirdNET's order unless location evidence says otherwise.
 */
export function toCallCandidates(response: BirdnetResponse): ProviderCandidate[] {
  let ceiling = CALL_CONFIDENCE_CAP;
  return response.results.slice(0, CANDIDATES.maxCandidates).map((r) => {
    ceiling = Math.min(ceiling, Math.max(0, r.score));
    const scientificName = r.name.trim();
    return {
      id: slugId('birdnet', scientificName),
      category: 'bird',
      scientificName,
      commonName: r.common?.trim() || undefined,
      genus: scientificName.split(' ')[0],
      kingdom: 'Animalia',
      className: 'Aves',
      taxonKeys: {},
      visualConfidence: ceiling,
      source: { identification: SERVICE },
      links: [],
    } satisfies ProviderCandidate;
  });
}

/** Bird calls, identified by BirdNET on our Hugging Face Space (CPU, no GPU quota). */
export class BirdnetCallProvider implements IdentificationProvider {
  readonly name = SERVICE;
  readonly acceptedMimeTypes = [] as const;
  readonly maxImages = 0;
  private readonly space: SpaceTarget;

  constructor(spaceUrl: string, token: string, fetchImpl: typeof fetch = fetch) {
    this.space = { spaceUrl, token, fetchImpl, service: SERVICE };
  }

  supports(target: IdentifyTarget): boolean {
    return target === 'bird';
  }

  async identify(input: IdentificationInput): Promise<IdentificationResult> {
    if (!input.audio) throw new ApiError('invalid_request', 'Please include a recording.');
    const started = Date.now();
    const data = (await callSpace(
      this.space,
      'identify_audio',
      {
        audio: Buffer.from(input.audio.data).toString('base64'),
        lat: input.location?.latitude ?? null,
        lon: input.location?.longitude ?? null,
        week: birdnetWeek(input.capturedAt),
        k: CANDIDATES.maxCandidates,
      },
      TIMEOUT_MS,
    )) as BirdnetResponse[];
    const response = data?.[0];
    if (!response || !Array.isArray(response.results)) throw new UpstreamError(SERVICE, 'parse');
    logger.info('birdnet.identify', {
      seconds: Math.round(input.audio.seconds),
      candidates: response.results.length,
      topScore: Math.round((response.results[0]?.score ?? 0) * 100) / 100,
      ms: Date.now() - started,
    });
    return {
      provider: SERVICE,
      candidates: toCallCandidates(response),
      attribution: [BIRDNET_ATTRIBUTION],
      experimental: true,
      detectedCategory: 'bird',
      ...(response.sound && { sound: response.sound }),
    };
  }
}
