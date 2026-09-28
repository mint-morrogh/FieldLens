import type {
  LicensedImage,
  OrganismCategory,
  SafetyInfo,
  TaxonIdentity,
} from '../../shared/types.js';
import type { HighRiskEntry } from './highRisk.js';

/** Openly licensed reference photos of a taxon, e.g. iNaturalist's default taxon photo. */
export interface ReferencePhotoProvider {
  readonly name: string;
  getReferencePhoto(taxon: TaxonIdentity): Promise<LicensedImage | undefined>;
}

export const LOOKALIKE_PHOTOS = {
  /** At most this many look-alikes get a photo (one each). */
  max: 3,
  /** Photos are a nice-to-have: give up quickly rather than hold the result back. */
  timeoutMs: 2500,
} as const;

function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([promise.catch(() => undefined), deadline]).finally(() =>
    clearTimeout(timer),
  );
}

/** "omphalotus" → "Omphalotus", "conium maculatum" → "Conium maculatum". */
function scientificName(taxon: string): string {
  return taxon.charAt(0).toUpperCase() + taxon.slice(1);
}

/**
 * One reference photo per named look-alike (capped), fetched in parallel with a tight
 * deadline. Never throws; look-alikes whose photo fails or is too slow are simply left out.
 * Keyed by the look-alike's common name, which is the statement's `subject`.
 */
export async function fetchLookalikePhotos(
  lookalikes: HighRiskEntry[],
  category: OrganismCategory,
  provider: ReferencePhotoProvider | undefined,
  options: { max?: number; timeoutMs?: number } = {},
): Promise<Map<string, LicensedImage>> {
  const photos = new Map<string, LicensedImage>();
  if (!provider || lookalikes.length === 0) return photos;
  const max = options.max ?? LOOKALIKE_PHOTOS.max;
  const timeoutMs = options.timeoutMs ?? LOOKALIKE_PHOTOS.timeoutMs;
  const wanted = lookalikes.slice(0, max);
  const results = await Promise.all(
    wanted.map((entry) => {
      const name = scientificName(entry.taxon);
      const [genus] = name.split(' ');
      let request: Promise<LicensedImage | undefined>;
      try {
        request = provider.getReferencePhoto({ scientificName: name, category, genus });
      } catch {
        return Promise.resolve(undefined);
      }
      return within(request, timeoutMs);
    }),
  );
  wanted.forEach((entry, i) => {
    const photo = results[i];
    if (photo?.url) photos.set(entry.commonName, photo);
  });
  return photos;
}

/** Attach each look-alike's photo to its warning. Text and order are unchanged. */
export function attachLookalikePhotos(
  safety: SafetyInfo | undefined,
  photos: Map<string, LicensedImage>,
): SafetyInfo | undefined {
  if (!safety || photos.size === 0) return safety;
  return {
    ...safety,
    statements: safety.statements.map((s) => {
      const photo = s.kind === 'lookalike' && s.subject ? photos.get(s.subject) : undefined;
      return photo ? { ...s, photo } : s;
    }),
  };
}
