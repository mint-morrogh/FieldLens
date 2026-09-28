// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { MemoryCache } from '../../server/cache/cache';
import {
  INaturalistObservationProvider,
  INaturalistTaxonPhotosProvider,
} from '../../server/providers/inaturalist/inaturalistProvider';
import { findHighRisk, findLookalikes } from '../../server/safety/highRisk';
import {
  attachLookalikePhotos,
  fetchLookalikePhotos,
  type ReferencePhotoProvider,
} from '../../server/safety/lookalikePhotos';
import {
  buildSafety,
  dangerousLookalikes,
  classifySentence,
  edibilityStatements,
  extractSafetySentences,
  splitSections,
  tpptSeverity,
} from '../../server/safety/safety';
import type { LicensedImage, OrganismCandidate } from '../../shared/types';

const cand = (
  scientificName: string,
  genus: string,
  finalConfidence = 0.9,
  commonName?: string,
): OrganismCandidate => ({
  id: scientificName,
  category: 'plant',
  scientificName,
  genus,
  commonName,
  taxonKeys: {},
  visualConfidence: finalConfidence,
  finalConfidence,
  source: { identification: 'test' },
  links: [],
});

const ARTICLE = `Solanum dulcamara is a species of vine. Common names include bittersweet, bitter nightshade, blue bindweed, felonwort, fellenwort, poisonflower, scarlet berry.
== Description ==
The flowers are purple and the berries are bright red when ripe.
== Toxicity ==
The berry is poisonous to humans and livestock, and it is dangerous for children. It can be confused with edible red berries such as redcurrants.
== Uses ==
The berries have been eaten in jams in some regions, but this is not recommended.
== References ==
The berries are edible according to nobody in this references section.`;

describe('Wikipedia sentence extraction', () => {
  it('splits sections', () => {
    expect(splitSections(ARTICLE).map((s) => s.heading)).toEqual([
      '',
      'Description',
      'Toxicity',
      'Uses',
      'References',
    ]);
  });
  it('classifies sentences', () => {
    expect(classifySentence('The berry is poisonous to humans.')).toBe('toxic');
    expect(classifySentence('It is often mistaken for the edible wild grape.')).toBe('lookalike');
    expect(classifySentence('The fruit is inedible.')).toBe('caution');
    expect(
      classifySentence('Oven drying is not recommended because it makes it bitter.'),
    ).toBeUndefined();
    expect(classifySentence('The berries are eaten raw or made into jam.')).toBe('edible');
    expect(classifySentence('The flowers are purple.')).toBeUndefined();
  });
  it('quotes only relevant sentences from relevant sections, skipping name lists', () => {
    const out = extractSafetySentences(ARTICLE, 'https://en.wikipedia.org/wiki/Solanum_dulcamara');
    const texts = out.map((s) => s.text);
    expect(texts.some((t) => t.startsWith('The berry is poisonous'))).toBe(true);
    expect(texts.some((t) => t.includes('confused with edible red berries'))).toBe(true);
    expect(texts.some((t) => t.startsWith('Common names include'))).toBe(false);
    expect(texts.some((t) => t.includes('references section'))).toBe(false);
    expect(
      out.every((s) => s.quote && s.source === 'Wikipedia' && s.license === 'CC BY-SA 4.0'),
    ).toBe(true);
    // Every quote exists verbatim in the article.
    for (const t of texts) expect(ARTICLE.replace(/\s+/g, ' ')).toContain(t);
  });
});

describe('graded sources', () => {
  it('maps TPPT grades to severities', () => {
    expect(tpptSeverity('very strong toxic')).toBe('deadly');
    expect(tpptSeverity('strong toxic')).toBe('deadly');
    expect(tpptSeverity('toxic')).toBe('toxic');
    expect(tpptSeverity('weak toxic')).toBe('caution');
    expect(tpptSeverity('skin-irritating')).toBe('skin');
    expect(tpptSeverity('nontoxic')).toBeUndefined();
  });
  it('maps Wikidata edibility and drops "medicinal"', () => {
    const deadly = edibilityStatements(['deadly', 'medicinal mushroom']);
    expect(deadly).toHaveLength(1);
    expect(deadly[0]).toMatchObject({ kind: 'toxic', severity: 'deadly' });
    const edible = edibilityStatements(['edible', 'choice']);
    expect(edible[0]).toMatchObject({
      kind: 'edible',
      text: 'Edibility recorded as: edible, choice.',
    });
    // Never report "edible" alongside "poisonous".
    expect(edibilityStatements(['edible', 'poisonous']).some((s) => s.kind === 'edible')).toBe(
      false,
    );
  });
  it('finds curated entries by species or genus and resolves look-alikes', () => {
    expect(findHighRisk('Amanita phalloides')?.severity).toBe('deadly');
    expect(findHighRisk('Cicuta maculata')?.commonName).toBe('water hemlock');
    expect(findHighRisk('Acer rubrum')).toBeUndefined();
    expect(findLookalikes('Cantharellus cibarius').map((e) => e.commonName)).toEqual([
      "jack-o'-lantern mushroom",
      'false chanterelle',
    ]);
    expect(findLookalikes('Daucus carota').map((e) => e.taxon)).toEqual([
      'conium maculatum',
      'cicuta',
    ]);
  });
  it('resolves the added high-risk plants and fungi', () => {
    const cases: [string, string | undefined, string][] = [
      ['Oenanthe crocata', undefined, 'hemlock water dropwort'],
      ['Colchicum autumnale', undefined, 'autumn crocus'],
      ['Ricinus communis', undefined, 'castor bean'],
      ['Nerium oleander', undefined, 'oleander'],
      ['Datura stramonium', undefined, 'jimsonweed / thorn apple'],
      ['Zigadenus elegans', undefined, 'death camas'],
      ['Toxicoscordion venenosum', undefined, 'meadow death camas'],
      ['Abrus precatorius', undefined, 'rosary pea'],
      ['Cerbera odollam', undefined, 'suicide tree / pong-pong'],
      ['Gloriosa superba', undefined, 'flame lily / glory lily'],
      ['Amanita phalloides', undefined, 'death cap'],
      ['Amanita ocreata', undefined, 'western destroying angel'],
      ['Amanita virosa', undefined, 'European destroying angel'],
      ['Amanita bisporigera', undefined, 'eastern destroying angel'],
      ['Galerina marginata', undefined, 'deadly galerina'],
      ['Lepiota brunneoincarnata', undefined, 'deadly dapperling'],
      ['Lepiota subincarnata', undefined, 'deadly dapperling'],
      ['Cortinarius orellanus', undefined, 'fool’s webcap'],
      ['Cortinarius rubellus', undefined, 'deadly webcap'],
      ['Clitocybe rivulosa', undefined, 'fool’s funnel'],
      ['Clitocybe dealbata', undefined, 'fool’s funnel'],
      ['Paxillus involutus', 'Paxillus', 'brown roll-rim / poison pax'],
    ];
    for (const [name, genus, common] of cases) {
      expect(findHighRisk(name, genus)?.commonName, name).toBe(common);
    }
    // Species entries override the genus note; other species still get the genus note.
    expect(findHighRisk('Amanita muscaria')?.commonName).toBe('amanitas');
    // Only the hemlock water dropwort is listed, not the whole genus.
    expect(findHighRisk('Oenanthe javanica')).toBeUndefined();
    expect(findHighRisk('Datura stramonium')?.severity).toBe('toxic');
    expect(findHighRisk('Ricinus communis')?.source).toContain('NC State Extension');
  });
  it('keeps new entries sourced, cautious and off Wikipedia', () => {
    for (const name of ['Colchicum autumnale', 'Galerina marginata', 'Paxillus involutus']) {
      const e = findHighRisk(name)!;
      expect(e.sourceUrl).toMatch(/^https:\/\//);
      expect(e.sourceUrl).not.toContain('wikipedia.org');
      expect(e.source).toBeTruthy();
      expect(e.note.toLowerCase()).not.toMatch(/\bsafe\b/);
    }
  });
  it('resolves the added look-alikes', () => {
    expect(findLookalikes('Allium ursinum').map((e) => e.taxon)).toEqual([
      'colchicum autumnale',
      'convallaria',
    ]);
    expect(findLookalikes('Allium canadense').map((e) => e.taxon)).toEqual([
      'toxicoscordion venenosum',
      'zigadenus',
    ]);
    expect(findLookalikes('Camassia quamash').map((e) => e.taxon)).toEqual([
      'zigadenus',
      'toxicoscordion venenosum',
    ]);
    expect(findLookalikes('Symphytum officinale').map((e) => e.taxon)).toEqual(['digitalis']);
    expect(findLookalikes('Armillaria mellea').map((e) => e.commonName)).toEqual([
      'deadly galerina',
    ]);
    expect(findLookalikes('Flammulina velutipes').map((e) => e.taxon)).toEqual([
      'galerina marginata',
    ]);
    expect(findLookalikes('Marasmius oreades').map((e) => e.taxon)).toEqual(['clitocybe rivulosa']);
  });
});

describe('buildSafety', () => {
  it('flags a poisonous top candidate as danger with graded and quoted sources', () => {
    const safety = buildSafety({
      category: 'plant',
      band: 'high',
      candidates: [cand('Solanum dulcamara', 'Solanum')],
      wikipedia: [],
    })!;
    expect(safety.level).toBe('danger');
    expect(safety.topToxic).toBe(true);
    expect(safety.statements.map((s) => s.source)).toEqual(
      expect.arrayContaining([
        'Wikipedia (summarised by FieldLens)',
        'TPPT toxic plant database (Agroscope)',
      ]),
    );
  });
  it('warns about dangerous alternative candidates when unsure', () => {
    const safety = buildSafety({
      category: 'plant',
      band: 'low',
      candidates: [
        cand('Vitis riparia', 'Vitis', 0.4),
        cand('Menispermum canadense', 'Menispermum', 0.3, 'Moonseed'),
      ],
      wikipedia: [],
    })!;
    const moonseed = safety.statements.filter((s) => s.subject?.includes('Moonseed'));
    expect(moonseed.length).toBeGreaterThan(0);
    // The grape itself also gets the moonseed look-alike warning.
    expect(safety.statements.some((s) => s.kind === 'lookalike' && s.subject === 'moonseed')).toBe(
      true,
    );
    expect(safety.level).toBe('danger');
  });
  it('keeps edible-only results out of warning styling and skips other categories', () => {
    const edibleOnly = buildSafety({
      category: 'plant',
      band: 'high',
      candidates: [cand('Vaccinium angustifolium', 'Vaccinium')],
      wikipedia: [
        {
          kind: 'edible',
          text: 'Blueberry pie is made with wild blueberries.',
          source: 'Wikipedia',
          quote: true,
        },
      ],
    })!;
    expect(edibleOnly.level).toBe('none');
    expect(
      buildSafety({
        category: 'insect',
        band: 'high',
        candidates: [cand('Danaus plexippus', 'Danaus')],
        wikipedia: [],
      }),
    ).toBeUndefined();
  });
  it('never uses the phrase "safe to eat"', () => {
    const safety = buildSafety({
      category: 'fungus',
      band: 'high',
      candidates: [cand('Cantharellus cibarius', 'Cantharellus')],
      wikipedia: [],
      wikidataEdibility: ['edible', 'choice'],
    })!;
    expect(JSON.stringify(safety).toLowerCase()).not.toContain('safe to eat');
    // Danger comes from the look-alikes, not the chanterelle itself.
    expect(safety.level).toBe('danger');
    expect(safety.topToxic).toBe(false);
    expect(safety.statements.filter((s) => s.kind === 'lookalike')).toHaveLength(2);
  });
});

describe('look-alike reference photos', () => {
  const photo = (name: string): LicensedImage => ({
    url: `https://photos.example/${name}/small.jpg`,
    thumbnailUrl: `https://photos.example/${name}/square.jpg`,
    author: '(c) Someone, some rights reserved (CC BY)',
    license: 'CC-BY',
    source: 'iNaturalist',
    sourceUrl: `https://www.inaturalist.org/taxa/${name}`,
  });

  it('fetches one photo per look-alike in parallel, capped, and tolerates failures and slowness', async () => {
    const asked: string[] = [];
    const provider: ReferencePhotoProvider = {
      name: 'test',
      getReferencePhoto: vi.fn(async (taxon) => {
        asked.push(taxon.scientificName);
        if (taxon.scientificName === 'Cicuta') throw new Error('upstream down');
        if (taxon.scientificName === 'Veratrum') return new Promise<never>(() => {});
        return photo(taxon.scientificName);
      }),
    };
    const entries = [
      ...findLookalikes('Daucus carota', 'Daucus'),
      ...findLookalikes('Allium tricoccum', 'Allium'),
    ];
    expect(entries.map((e) => e.taxon)).toEqual([
      'conium maculatum',
      'cicuta',
      'convallaria',
      'veratrum',
    ]);
    const started = Date.now();
    const photos = await fetchLookalikePhotos(entries, 'plant', provider, {
      max: 4,
      timeoutMs: 50,
    });
    expect(Date.now() - started).toBeLessThan(1000);
    expect(asked).toEqual(['Conium maculatum', 'Cicuta', 'Convallaria', 'Veratrum']);
    expect([...photos.keys()]).toEqual(['poison hemlock', 'lily of the valley']);

    // Default cap: three look-alikes.
    asked.length = 0;
    await fetchLookalikePhotos(entries, 'plant', provider, { timeoutMs: 50 });
    expect(asked).toHaveLength(3);
    // No provider or no look-alikes: nothing to do.
    expect((await fetchLookalikePhotos(entries, 'plant', undefined)).size).toBe(0);
    expect((await fetchLookalikePhotos([], 'plant', provider)).size).toBe(0);
  });

  it('attaches photos to look-alike warnings only, leaving the text unchanged', async () => {
    const top = cand('Daucus carota', 'Daucus', 0.95, 'Wild carrot');
    const safety = buildSafety({
      category: 'plant',
      band: 'high',
      candidates: [top],
      wikipedia: [],
    })!;
    const photos = await fetchLookalikePhotos(dangerousLookalikes(top), 'plant', {
      name: 'test',
      getReferencePhoto: async (t) => photo(t.scientificName),
    });
    const enriched = attachLookalikePhotos(safety, photos)!;
    expect(enriched.statements.map((s) => s.text)).toEqual(safety.statements.map((s) => s.text));
    const looks = enriched.statements.filter((s) => s.kind === 'lookalike');
    expect(looks.map((s) => [s.subject, s.photo?.url])).toEqual([
      ['poison hemlock', 'https://photos.example/Conium maculatum/small.jpg'],
      ['water hemlock', 'https://photos.example/Cicuta/small.jpg'],
    ]);
    expect(enriched.statements.filter((s) => s.kind !== 'lookalike' && s.photo)).toHaveLength(0);
    expect(attachLookalikePhotos(safety, new Map())).toBe(safety);
    expect(attachLookalikePhotos(undefined, photos)).toBeUndefined();
  });

  it('uses the iNaturalist default photo only when openly licensed, else the first licensed one', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('/taxa?') && u.includes('q=Omphalotus')) {
        return Response.json({
          total_results: 1,
          results: [
            {
              id: 48484,
              name: 'Omphalotus',
              iconic_taxon_name: 'Fungi',
              default_photo: {
                url: 'https://static.inaturalist.org/photos/1/square.jpg',
                license_code: 'cc-by-nc',
                attribution: '(c) A, some rights reserved (CC BY-NC)',
              },
            },
          ],
        });
      }
      if (u.includes('/taxa?')) {
        return Response.json({
          total_results: 1,
          results: [
            {
              id: 7,
              name: 'Amanita',
              iconic_taxon_name: 'Fungi',
              default_photo: {
                url: 'https://static.inaturalist.org/photos/2/square.jpg',
                license_code: null,
              },
            },
          ],
        });
      }
      if (u.endsWith('/taxa/7')) {
        return Response.json({
          results: [
            {
              taxon_photos: [
                { photo: { url: 'https://static.inaturalist.org/photos/3/square.jpg' } },
                {
                  photo: {
                    url: 'https://static.inaturalist.org/photos/4/square.jpg',
                    license_code: 'cc0',
                    attribution: 'no rights reserved',
                  },
                },
              ],
            },
          ],
        });
      }
      return new Response('{}', { status: 404 });
    });
    const cache = new MemoryCache();
    const f = fetchImpl as unknown as typeof fetch;
    const provider = new INaturalistTaxonPhotosProvider(
      new INaturalistObservationProvider(cache, f),
      cache,
      f,
    );
    const omphalotus = await provider.getReferencePhoto({
      scientificName: 'Omphalotus',
      category: 'fungus',
    });
    expect(omphalotus).toEqual({
      url: 'https://static.inaturalist.org/photos/1/small.jpg',
      thumbnailUrl: 'https://static.inaturalist.org/photos/1/square.jpg',
      author: '(c) A, some rights reserved (CC BY-NC)',
      license: 'CC-BY-NC',
      source: 'iNaturalist',
      sourceUrl: 'https://www.inaturalist.org/taxa/48484',
    });
    expect(calls.some((u) => u.includes('/taxa/48484'))).toBe(false);
    const amanita = await provider.getReferencePhoto({
      scientificName: 'Amanita',
      category: 'fungus',
    });
    expect(amanita?.url).toBe('https://static.inaturalist.org/photos/4/small.jpg');
    expect(amanita?.license).toBe('CC0');
    // Cached: a second lookup makes no new requests.
    const before = calls.length;
    await provider.getReferencePhoto({ scientificName: 'Amanita', category: 'fungus' });
    expect(calls.length).toBe(before);
  });
});
