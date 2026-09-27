// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { findHighRisk, findLookalikes } from '../../server/safety/highRisk';
import {
  buildSafety,
  classifySentence,
  edibilityStatements,
  extractSafetySentences,
  splitSections,
  tpptSeverity,
} from '../../server/safety/safety';
import type { OrganismCandidate } from '../../shared/types';

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
