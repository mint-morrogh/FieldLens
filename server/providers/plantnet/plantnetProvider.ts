import { z } from 'zod';
import { CANDIDATES, TIMEOUTS_MS } from '../../../shared/config.js';
import type { ExternalLink, LicensedImage, OrganismCategory } from '../../../shared/types.js';
import { ApiError, UpstreamError } from '../../lib/errors.js';
import { USER_AGENT } from '../../lib/http.js';
import { logger } from '../../lib/logger.js';
import type {
  IdentificationInput,
  IdentificationProvider,
  IdentificationResult,
  ProviderCandidate,
} from '../types.js';

const SERVICE = 'Pl@ntNet';
const API_BASE = 'https://my-api.plantnet.org/v2/identify';

export const PLANTNET_ATTRIBUTION = {
  provider: SERVICE,
  text: 'Visual identification by the Pl@ntNet API',
  url: 'https://plantnet.org/',
};

/** Pl@ntNet accepts these organ values; any other feature is sent as "auto". */
const PLANTNET_ORGANS = new Set(['leaf', 'flower', 'fruit', 'bark', 'auto']);

const nameObj = z
  .object({
    scientificNameWithoutAuthor: z.string().optional(),
    scientificName: z.string().optional(),
  })
  .passthrough();

const plantnetResponseSchema = z
  .object({
    results: z
      .array(
        z
          .object({
            score: z.number(),
            species: z
              .object({
                scientificNameWithoutAuthor: z.string(),
                scientificNameAuthorship: z.string().optional(),
                scientificName: z.string().optional(),
                genus: nameObj.optional(),
                family: nameObj.optional(),
                commonNames: z.array(z.string()).optional(),
              })
              .passthrough(),
            gbif: z
              .object({ id: z.union([z.string(), z.number()]) })
              .passthrough()
              .nullish(),
            powo: z.object({ id: z.string() }).passthrough().nullish(),
            images: z
              .array(
                z
                  .object({
                    organ: z.string().optional(),
                    author: z.string().optional(),
                    license: z.string().optional(),
                    citation: z.string().optional(),
                    url: z
                      .object({
                        o: z.string().optional(),
                        m: z.string().optional(),
                        s: z.string().optional(),
                      })
                      .passthrough(),
                  })
                  .passthrough(),
              )
              .optional(),
          })
          .passthrough(),
      )
      .default([]),
    remainingIdentificationRequests: z.number().optional(),
    version: z.string().optional(),
  })
  .passthrough();

export type PlantNetResponse = z.infer<typeof plantnetResponseSchema>;

export function toPlantNetOrgan(feature: string): string {
  return PLANTNET_ORGANS.has(feature) ? feature : 'auto';
}

function genusOf(r: PlantNetResponse['results'][number]): string | undefined {
  return r.species.genus?.scientificNameWithoutAuthor ?? r.species.genus?.scientificName;
}
function familyOf(r: PlantNetResponse['results'][number]): string | undefined {
  return r.species.family?.scientificNameWithoutAuthor ?? r.species.family?.scientificName;
}

export function slugId(provider: string, scientificName: string): string {
  return `${provider}:${scientificName}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-');
}

export function taxonLinks(names: { gbifKey?: number; powoId?: string }): ExternalLink[] {
  const links: ExternalLink[] = [];
  if (names.gbifKey)
    links.push({ label: 'GBIF', url: `https://www.gbif.org/species/${names.gbifKey}` });
  if (names.powoId) {
    links.push({
      label: 'Plants of the World Online (Kew)',
      url: `https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:${names.powoId}`,
    });
  }
  return links;
}

/** Normalize a Pl@ntNet response into taxonomy-neutral provider candidates. */
export function normalizePlantNetResponse(
  raw: unknown,
  category: OrganismCategory = 'plant',
): ProviderCandidate[] {
  const parsed = plantnetResponseSchema.safeParse(raw);
  if (!parsed.success) throw new UpstreamError(SERVICE, 'parse');
  return parsed.data.results
    .filter((r) => r.score > 0 && r.species.scientificNameWithoutAuthor)
    .sort((a, b) => b.score - a.score)
    .slice(0, CANDIDATES.maxCandidates)
    .map((r) => {
      const scientificName = r.species.scientificNameWithoutAuthor.trim();
      const gbifKey = r.gbif?.id !== undefined ? Number(r.gbif.id) : undefined;
      const powoId = r.powo?.id || undefined;
      const commonNames = (r.species.commonNames ?? []).map((n) => n.trim()).filter(Boolean);
      const referenceImages: LicensedImage[] = (r.images ?? [])
        .filter((img) => img.url.m || img.url.s)
        .filter((img) => img.license && img.author)
        .slice(0, 6)
        .map((img) => ({
          url: (img.url.m ?? img.url.o ?? img.url.s)!,
          thumbnailUrl: img.url.s ?? img.url.m,
          author: img.author,
          license: img.license,
          source: SERVICE,
          sourceUrl: 'https://identify.plantnet.org/',
        }));
      return {
        id: slugId('plantnet', scientificName),
        category,
        scientificName,
        scientificNameAuthorship: r.species.scientificNameAuthorship || undefined,
        commonName: commonNames[0],
        commonNames: commonNames.length ? commonNames : undefined,
        genus: genusOf(r),
        family: familyOf(r),
        kingdom: 'Plantae',
        taxonKeys: {
          gbif: gbifKey !== undefined && Number.isFinite(gbifKey) ? gbifKey : undefined,
          powo: powoId,
        },
        visualConfidence: Math.max(0, Math.min(1, r.score)),
        source: { identification: SERVICE },
        referenceImages: referenceImages.length ? referenceImages : undefined,
        links: taxonLinks({ gbifKey: Number.isFinite(gbifKey) ? gbifKey : undefined, powoId }),
      } satisfies ProviderCandidate;
    });
}

export class PlantNetIdentificationProvider implements IdentificationProvider {
  readonly name = SERVICE;
  readonly acceptedMimeTypes = ['image/jpeg', 'image/png'] as const;
  readonly maxImages = 5;

  constructor(
    private readonly apiKey: string,
    private readonly project: string = 'all',
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  supports(category: OrganismCategory): boolean {
    return category === 'plant';
  }

  async identify(input: IdentificationInput): Promise<IdentificationResult> {
    const form = new FormData();
    for (const [i, image] of input.images.entries()) {
      const ext = image.mimeType === 'image/png' ? 'png' : 'jpg';
      form.append(
        'images',
        new Blob([image.data as BlobPart], { type: image.mimeType }),
        `image-${i}.${ext}`,
      );
      form.append('organs', toPlantNetOrgan(image.feature));
    }

    const params = new URLSearchParams({
      'include-related-images': 'true',
      'nb-results': String(CANDIDATES.maxCandidates),
      lang: 'en',
      'no-reject': 'false',
      'api-key': this.apiKey,
    });
    const url = `${API_BASE}/${encodeURIComponent(this.project)}?${params}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUTS_MS.identification);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        body: form,
        signal: controller.signal,
        headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
      });
    } catch {
      throw new UpstreamError(SERVICE, controller.signal.aborted ? 'timeout' : 'network');
    } finally {
      clearTimeout(timer);
    }

    // Pl@ntNet answers 404 "Species not found" when nothing matches (including non-plant photos).
    if (response.status === 404) {
      await response.text().catch(() => undefined);
      return { provider: SERVICE, candidates: [], attribution: [PLANTNET_ATTRIBUTION] };
    }
    if (response.status === 400) {
      await response.text().catch(() => undefined);
      throw new ApiError(
        'invalid_file',
        'The identification service could not read this image. Try a different photo.',
      );
    }
    if (!response.ok) {
      await response.text().catch(() => undefined);
      throw new UpstreamError(SERVICE, 'http', response.status);
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new UpstreamError(SERVICE, 'parse');
    }
    const remaining = (raw as { remainingIdentificationRequests?: number })
      .remainingIdentificationRequests;
    logger.info('plantnet.identify', { images: input.images.length, remaining });

    return {
      provider: SERVICE,
      candidates: normalizePlantNetResponse(raw, input.category),
      attribution: [PLANTNET_ATTRIBUTION],
      raw,
    };
  }
}
