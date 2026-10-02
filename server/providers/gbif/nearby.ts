import { roundCoordinate } from '../../../shared/geo.js';
import {
  NEARBY,
  WHATS_OUT_GROUPS,
  type NearbyFamiliesRequest,
  type NearbyFamiliesResponse,
  type WhatsOutGroup,
  type WhatsOutResponse,
  type WhatsOutSpecies,
} from '../../../shared/nearby.js';
import type { ApproxLocation, LicensedImage, OrganismCategory } from '../../../shared/types.js';
import { cached, sharedCache, type Cache } from '../../cache/cache.js';
import type { ReferencePhotoProvider } from '../../safety/lookalikePhotos.js';
import { GBIF_SOURCE, GbifClient } from './gbif.js';

/**
 * GBIF lookups behind the journal's "recorded near you" counts and the home screen's
 * "What's out now" card. Both are keyed by a ~11 km cell and cached for days: the
 * underlying record counts barely move from one week to the next.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
export const NEARBY_TTL_MS = {
  /** Name → GBIF key. */
  match: 30 * DAY_MS,
  /** Species counts per cell + taxon. */
  counts: 7 * DAY_MS,
  /** Month and all-time facets per cell + group. */
  season: 7 * DAY_MS,
  /** The finished "What's out now" list per cell + month. */
  whatsOut: 3 * DAY_MS,
} as const;

/** Distinct species are counted from the speciesKey facet, capped at this many. */
export const SPECIES_FACET_CAP = 1000;

export const WHATS_OUT = {
  /** Top species this month considered per group. */
  monthTop: 40,
  /** All-time species facet used to compute each one's month share. */
  allTimeTop: 500,
  /** A species' month share must be this many times the group's own month share. */
  minLift: 1.8,
  /** And it must be logged this often this month to count as "commonly recorded". */
  minMonthRecords: 5,
  perGroup: 2,
  photoTimeoutMs: 3000,
} as const;

/** GBIF backbone keys for the groups the card suggests from. */
const GROUP_TAXON_KEYS: Record<WhatsOutGroup, number> = {
  plant: 6, // Plantae
  fungus: 5, // Fungi
  bird: 212, // Aves
  bug: 216, // Insecta
  mammal: 359, // Mammalia
};

const GROUP_CATEGORY: Record<WhatsOutGroup, OrganismCategory> = {
  plant: 'plant',
  fungus: 'fungus',
  bird: 'bird',
  bug: 'insect',
  mammal: 'mammal',
};

const KINGDOM_FOR_GROUP: Record<string, string> = {
  plant: 'Plantae',
  fungus: 'Fungi',
  bug: 'Animalia',
  bird: 'Animalia',
  mammal: 'Animalia',
  herp: 'Animalia',
  fish: 'Animalia',
  sea: 'Animalia',
};

/** Snap to the ~11 km cell, whatever precision the client sent. */
export function coarseCell(location: ApproxLocation): ApproxLocation {
  return {
    latitude: roundCoordinate(location.latitude, NEARBY.precision),
    longitude: roundCoordinate(location.longitude, NEARBY.precision),
  };
}

function geoDistance(cell: ApproxLocation, radiusKm: number): string {
  const d = NEARBY.precision;
  return `${cell.latitude.toFixed(d)},${cell.longitude.toFixed(d)},${radiusKm}km`;
}

function cellKey(cell: ApproxLocation): string {
  return geoDistance(cell, NEARBY.radiusKm);
}

type Facet = { name: string; count: number }[];
type OccurrenceFacets = {
  count: number;
  facets?: { field: string; counts: Facet }[];
};

function speciesFacet(result: OccurrenceFacets): Facet {
  return result.facets?.find((f) => f.field === 'SPECIES_KEY')?.counts ?? [];
}

export class NearbyService {
  constructor(
    private readonly client: GbifClient = new GbifClient(),
    private readonly photos?: ReferencePhotoProvider,
    private readonly cache: Cache = sharedCache,
    private readonly radiusKm: number = NEARBY.radiusKm,
  ) {}

  private occurrences(params: Record<string, string | number | undefined>, ttlMs: number) {
    return this.client.get<OccurrenceFacets>(
      '/occurrence/search',
      { limit: 0, occurrenceStatus: 'PRESENT', hasGeospatialIssue: 'false', ...params },
      ttlMs,
    );
  }

  /** A family or genus name → its GBIF key (exact, accepted matches at that rank only). */
  async taxonKey(
    name: string,
    rank: 'family' | 'genus',
    group: string,
  ): Promise<number | undefined> {
    const match = await this.client.get<{
      usageKey?: number;
      acceptedUsageKey?: number;
      rank?: string;
      matchType?: string;
    }>(
      '/species/match',
      { name, rank: rank.toUpperCase(), kingdom: KINGDOM_FOR_GROUP[group], strict: 'true' },
      NEARBY_TTL_MS.match,
    );
    if (!match.usageKey || match.matchType === 'NONE' || match.matchType === 'HIGHERRANK')
      return undefined;
    if (match.rank && match.rank.toLowerCase() !== rank) return undefined;
    return match.acceptedUsageKey ?? match.usageKey;
  }

  /** Distinct species per family/genus with records within the radius. Failed taxa are left out. */
  async familyCounts(request: NearbyFamiliesRequest): Promise<NearbyFamiliesResponse> {
    const cell = coarseCell(request);
    const seen = new Set<string>();
    const taxa = request.taxa.filter((t) => {
      const key = `${t.rank}:${t.name.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const results = await Promise.all(
      taxa.map(async (t) => {
        try {
          const key = await this.taxonKey(t.name, t.rank, t.group);
          if (!key) return undefined;
          const res = await this.occurrences(
            {
              taxonKey: key,
              geoDistance: geoDistance(cell, this.radiusKm),
              facet: 'speciesKey',
              facetLimit: SPECIES_FACET_CAP,
            },
            NEARBY_TTL_MS.counts,
          );
          const species = speciesFacet(res).filter((c) => c.count > 0).length;
          return {
            name: t.name,
            rank: t.rank,
            species,
            ...(species >= SPECIES_FACET_CAP ? { capped: true } : {}),
          };
        } catch {
          return undefined;
        }
      }),
    );
    return {
      radiusKm: this.radiusKm,
      results: results.filter((r): r is NonNullable<typeof r> => !!r),
      source: GBIF_SOURCE,
    };
  }

  /** Species of one group that are at their peak this month, best first. */
  async peakSpecies(
    group: WhatsOutGroup,
    cell: ApproxLocation,
    month: number,
  ): Promise<{ key: number; score: number }[]> {
    const base = {
      taxonKey: GROUP_TAXON_KEYS[group],
      geoDistance: geoDistance(cell, this.radiusKm),
      facet: 'speciesKey',
    };
    const [thisMonth, allTime] = await Promise.all([
      this.occurrences({ ...base, month, facetLimit: WHATS_OUT.monthTop }, NEARBY_TTL_MS.season),
      this.occurrences({ ...base, facetLimit: WHATS_OUT.allTimeTop }, NEARBY_TTL_MS.season),
    ]);
    return pickPeaks(thisMonth, allTime);
  }

  async whatsOut(location: ApproxLocation, month: number): Promise<WhatsOutResponse> {
    const cell = coarseCell(location);
    return cached(this.cache, `whats-out:${cellKey(cell)}:${month}`, NEARBY_TTL_MS.whatsOut, () =>
      this.computeWhatsOut(cell, month),
    );
  }

  private async computeWhatsOut(cell: ApproxLocation, month: number): Promise<WhatsOutResponse> {
    const perGroup = await Promise.all(
      WHATS_OUT_GROUPS.map((group) =>
        this.peakSpecies(group, cell, month)
          .then((peaks) => ({ group, peaks }))
          .catch(() => ({ group, peaks: [] as { key: number; score: number }[] })),
      ),
    );
    const failedAll = perGroup.every((g) => g.peaks.length === 0);
    const species = (
      await Promise.all(
        perGroup.flatMap(({ group, peaks }) =>
          // Look up a few extra in case some keys don't resolve to a species name.
          peaks.slice(0, WHATS_OUT.perGroup + 2).map((p) => this.describe(p.key, group)),
        ),
      )
    ).filter((s): s is WhatsOutSpecies => !!s);
    // Keep at most `perGroup` per group, in the order found.
    const counts = new Map<WhatsOutGroup, number>();
    const kept = species.filter((s) => {
      const n = counts.get(s.group) ?? 0;
      if (n >= WHATS_OUT.perGroup) return false;
      counts.set(s.group, n + 1);
      return true;
    });
    if (failedAll && kept.length === 0) {
      // Don't cache a total outage as "nothing is out".
      throw new Error('GBIF season lookups failed');
    }
    await this.attachPhotos(kept);
    return { month, radiusKm: this.radiusKm, species: kept, source: GBIF_SOURCE };
  }

  private async describe(key: number, group: WhatsOutGroup): Promise<WhatsOutSpecies | undefined> {
    const s = await this.client.species(key).catch(() => undefined);
    const scientificName = s?.canonicalName ?? s?.species;
    if (!s || !scientificName || (s.rank && s.rank !== 'SPECIES')) return undefined;
    const commonName = s.vernacularName?.trim();
    return {
      scientificName,
      ...(commonName ? { commonName } : {}),
      group,
      gbifKey: key,
      url: `https://www.gbif.org/species/${key}`,
    };
  }

  private async attachPhotos(species: WhatsOutSpecies[]): Promise<void> {
    const provider = this.photos;
    if (!provider) return;
    await Promise.all(
      species.map(async (s) => {
        const photo = await within(
          provider.getReferencePhoto({
            scientificName: s.scientificName,
            category: GROUP_CATEGORY[s.group],
            genus: s.scientificName.split(' ')[0],
          }),
          WHATS_OUT.photoTimeoutMs,
        );
        if (photo) s.photo = toPhoto(photo);
      }),
    );
  }
}

function toPhoto(img: LicensedImage): NonNullable<WhatsOutSpecies['photo']> {
  return {
    url: img.thumbnailUrl ?? img.url,
    ...(img.author ? { author: img.author } : {}),
    ...(img.license ? { license: img.license } : {}),
    source: img.source,
    ...(img.sourceUrl ? { sourceUrl: img.sourceUrl } : {}),
  };
}

function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([promise.catch(() => undefined), deadline]).finally(() =>
    clearTimeout(timer),
  );
}

/**
 * Species "at their peak": their share of this month's records is well above the group's
 * own month share (which corrects for how many people are out logging that month).
 * Scored by that lift, damped by how often the species is logged this month.
 */
export function pickPeaks(
  thisMonth: OccurrenceFacets,
  allTime: OccurrenceFacets,
): { key: number; score: number }[] {
  const monthTotal = thisMonth.count;
  const allTotal = allTime.count;
  if (monthTotal <= 0 || allTotal <= 0) return [];
  const groupShare = monthTotal / allTotal;
  const totals = new Map(speciesFacet(allTime).map((c) => [c.name, c.count]));
  const peaks: { key: number; score: number }[] = [];
  for (const { name, count } of speciesFacet(thisMonth)) {
    const key = Number(name);
    const total = totals.get(name);
    if (!Number.isFinite(key) || !total || count < WHATS_OUT.minMonthRecords) continue;
    const lift = count / total / groupShare;
    if (lift < WHATS_OUT.minLift) continue;
    peaks.push({ key, score: lift * Math.log1p(count) });
  }
  return peaks.sort((a, b) => b.score - a.score || a.key - b.key);
}

/** Fixed sample data for mock mode, so the cards can be seen without network access. */
export function mockFamilyCounts(request: NearbyFamiliesRequest): NearbyFamiliesResponse {
  return {
    radiusKm: NEARBY.radiusKm,
    results: request.taxa.map((t) => ({
      name: t.name,
      rank: t.rank,
      species: 6 + (t.name.length % 9),
    })),
    source: GBIF_SOURCE,
  };
}

export function mockWhatsOut(month: number): WhatsOutResponse {
  return {
    month,
    radiusKm: NEARBY.radiusKm,
    species: [
      { scientificName: 'Solidago canadensis', commonName: 'Canada goldenrod', group: 'plant' },
      { scientificName: 'Amanita muscaria', commonName: 'Fly agaric', group: 'fungus' },
      { scientificName: 'Danaus plexippus', commonName: 'Monarch', group: 'bug' },
      { scientificName: 'Setophaga coronata', commonName: 'Yellow-rumped warbler', group: 'bird' },
    ],
    source: GBIF_SOURCE,
  };
}
