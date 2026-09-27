import { CACHE_TTL_MS, TIMEOUTS_MS } from '../../../shared/config.js';
import type { TaxonIdentity } from '../../../shared/types.js';
import { cached, sharedCache, type Cache } from '../../cache/cache.js';
import { fetchJson } from '../../lib/http.js';
import type { SpeciesInfoPart, SpeciesInfoProvider } from '../types.js';

export const WIKIDATA_SOURCE = 'Wikidata';
export const WIKIPEDIA_SOURCE = 'Wikipedia';

type WikidataSearch = { query?: { search?: { title: string }[] } };
type WikidataEntity = {
  labels?: Record<string, { value: string }>;
  sitelinks?: Record<string, { title: string }>;
  claims?: Record<string, { mainsnak?: { datavalue?: { value?: unknown } } }[]>;
};

/**
 * Finds the Wikidata item for a taxon through its GBIF taxon ID (property P846),
 * which avoids ambiguous name searches. Provides English common names and the
 * matching English Wikipedia article title.
 */
export class WikidataSpeciesInfoProvider implements SpeciesInfoProvider {
  readonly name = WIKIDATA_SOURCE;
  constructor(
    private readonly cache: Cache = sharedCache,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getSpeciesInfo(
    taxon: TaxonIdentity,
  ): Promise<SpeciesInfoPart & { wikipediaTitle?: string }> {
    if (!taxon.gbifKey) return { source: WIKIDATA_SOURCE };
    const key = `wikidata:${taxon.gbifKey}`;
    return cached(this.cache, key, CACHE_TTL_MS.speciesInfo, async () => {
      const opts = {
        service: WIKIDATA_SOURCE,
        timeoutMs: TIMEOUTS_MS.supporting,
        fetchImpl: this.fetchImpl,
      };
      const search = await fetchJson<WikidataSearch>(
        `https://www.wikidata.org/w/api.php?${new URLSearchParams({
          action: 'query',
          list: 'search',
          srsearch: `haswbstatement:P846=${taxon.gbifKey}`,
          srlimit: '1',
          format: 'json',
        })}`,
        opts,
      );
      const qid = search.query?.search?.[0]?.title;
      if (!qid || !/^Q\d+$/.test(qid)) return { source: WIKIDATA_SOURCE };

      const entities = await fetchJson<{ entities?: Record<string, WikidataEntity> }>(
        `https://www.wikidata.org/w/api.php?${new URLSearchParams({
          action: 'wbgetentities',
          ids: qid,
          props: 'claims|sitelinks|labels',
          languages: 'en',
          sitefilter: 'enwiki',
          format: 'json',
        })}`,
        opts,
      );
      const entity = entities.entities?.[qid];
      const commonNames = (entity?.claims?.P1843 ?? [])
        .map(
          (c) => c.mainsnak?.datavalue?.value as { text?: string; language?: string } | undefined,
        )
        .filter((v) => v?.language === 'en' && v.text)
        .map((v) => v!.text!.trim());
      const wikipediaTitle = entity?.sitelinks?.enwiki?.title;
      // P789 "edibility" (mostly fungi): resolve the value items to English labels.
      const edibilityIds = (entity?.claims?.P789 ?? [])
        .map((c) => (c.mainsnak?.datavalue?.value as { id?: string } | undefined)?.id)
        .filter((id): id is string => !!id && /^Q\d+$/.test(id));
      let edibility: string[] = [];
      if (edibilityIds.length) {
        const labels = await fetchJson<{ entities?: Record<string, WikidataEntity> }>(
          `https://www.wikidata.org/w/api.php?${new URLSearchParams({
            action: 'wbgetentities',
            ids: edibilityIds.join('|'),
            props: 'labels',
            languages: 'en',
            format: 'json',
          })}`,
          opts,
        ).catch(() => undefined);
        edibility = edibilityIds
          .map((id) => labels?.entities?.[id]?.labels?.en?.value)
          .filter((v): v is string => !!v);
      }
      return {
        source: WIKIDATA_SOURCE,
        commonNames: [...new Set(commonNames)],
        links: [{ label: 'Wikidata', url: `https://www.wikidata.org/wiki/${qid}` }],
        wikipediaTitle,
        edibility,
        wikidataUrl: `https://www.wikidata.org/wiki/${qid}`,
      };
    });
  }
}

type WikipediaSummary = {
  type?: string;
  title?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
};

/** Lead-section summary of the English Wikipedia article (CC BY-SA 4.0). */
export class WikipediaSpeciesSummaryProvider implements SpeciesInfoProvider {
  readonly name = WIKIPEDIA_SOURCE;
  constructor(
    private readonly cache: Cache = sharedCache,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getSpeciesInfo(
    taxon: TaxonIdentity,
    context: { wikipediaTitle?: string },
  ): Promise<SpeciesInfoPart> {
    const title = context.wikipediaTitle ?? taxon.scientificName;
    return cached(this.cache, `wikipedia:${title}`, CACHE_TTL_MS.speciesInfo, async () => {
      const summary = await fetchJson<WikipediaSummary>(
        `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`,
        { service: WIKIPEDIA_SOURCE, timeoutMs: TIMEOUTS_MS.supporting, fetchImpl: this.fetchImpl },
      );
      const page = summary.content_urls?.desktop?.page;
      if (summary.type !== 'standard' || !summary.extract || !page)
        return { source: WIKIPEDIA_SOURCE };
      return {
        source: WIKIPEDIA_SOURCE,
        summary: {
          text: summary.extract,
          source: WIKIPEDIA_SOURCE,
          sourceUrl: page,
          license: 'CC BY-SA 4.0',
        },
        links: [{ label: 'Wikipedia', url: page }],
      };
    });
  }
}
