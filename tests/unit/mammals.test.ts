// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { isValidFeature } from '../../shared/categories';
import { identifyResponseSchema } from '../../shared/schemas';
import { SIGNS } from '../../shared/config';
import { NOT_SURE, applyAnswers, contradicts } from '../../shared/questions';
import type { IdentifyResponse, OrganismCandidate } from '../../shared/types';
import { buildQuestions } from '../../server/facts/questions';
import {
  formatActivity,
  formatDiet,
  formatMass,
  mammalTraitFacts,
} from '../../server/facts/mammalFacts';
import { runIdentification, signFor } from '../../server/identify/pipeline';
import { BioclipIdentificationProvider } from '../../server/providers/bioclip/bioclipProvider';
import { createMockProviders } from '../../server/providers/mock/mockProviders';
import type { IdentificationInput } from '../../server/providers/types';
import { buildWildlifeSafety, findWildlifeNotes } from '../../server/safety/wildlife';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const input = (
  category: IdentificationInput['category'],
  feature = 'auto',
): IdentificationInput => ({
  observationId: 'o',
  category,
  images: [{ data: JPEG, mimeType: 'image/jpeg', feature }],
  location: { latitude: 46.24, longitude: -63.13 },
  capturedAt: new Date('2026-09-20T12:00:00Z'),
});

const candidate = (over: Partial<OrganismCandidate>): OrganismCandidate =>
  ({
    id: 'x',
    category: 'mammal',
    scientificName: 'Procyon lotor',
    genus: 'Procyon',
    family: 'Procyonidae',
    order: 'Carnivora',
    taxonKeys: {},
    visualConfidence: 0.9,
    finalConfidence: 0.9,
    source: { identification: 'test' },
    links: [],
    ...over,
  }) as OrganismCandidate;

describe('mammal facts (EltonTraits)', () => {
  it('formats weights, diets and activity', () => {
    expect(formatMass(16.46)).toBe('about 16 g');
    expect(formatMass(5476)).toBe('about 5.5 kg');
    expect(formatMass(356998)).toBe('about 357 kg');
    expect(formatDiet('Inv70,Scav10,Fruit20')).toBe(
      'insects & other invertebrates 70%, fruit 20%, carrion 10%',
    );
    expect(formatActivity('NC')).toBe('At dawn and dusk and at night');
    expect(formatActivity('D')).toBe('By day');
  });

  it('finds bundled traits by name, falling back to other names', () => {
    const facts = mammalTraitFacts([undefined, 'Nonexistent species', 'Alces alces']);
    expect(facts.map((f) => f.label)).toEqual([
      'Average adult weight',
      'Diet',
      'Active',
      'Feeds mainly',
    ]);
    expect(facts[0].value).toBe('about 357 kg');
    expect(facts.every((f) => f.sourceUrl?.includes('figshare'))).toBe(true);
    expect(mammalTraitFacts(['Homo nonexistens'])).toEqual([]);
  });
});

describe('wildlife safety', () => {
  it('warns about rabies for raccoons, and roundworm only for droppings', () => {
    const photo = findWildlifeNotes(candidate({}));
    expect(photo.map((n) => n.source)).toEqual(['CDC — About Rabies']);
    const scat = findWildlifeNotes(candidate({}), 'scat');
    expect(scat.map((n) => n.source)).toContain('CDC — About Baylisascaris');
  });

  it('matches bats by order, bears by family and moose by genus', () => {
    expect(
      findWildlifeNotes(
        candidate({
          scientificName: 'Eptesicus fuscus',
          genus: 'Eptesicus',
          family: 'Vespertilionidae',
          order: 'Chiroptera',
        }),
      ),
    ).toHaveLength(1);
    expect(
      findWildlifeNotes(
        candidate({ scientificName: 'Ursus americanus', genus: 'Ursus', family: 'Ursidae' }),
      )[0].note,
    ).toMatch(/distance/);
    expect(
      findWildlifeNotes(
        candidate({ scientificName: 'Alces alces', genus: 'Alces', family: 'Cervidae' }),
      ).map((n) => n.taxon),
    ).toEqual(['alces', 'cervidae']);
  });

  it('includes other likely candidates only when unsure, and never calls anything safe', () => {
    const skunk = candidate({
      scientificName: 'Mephitis mephitis',
      genus: 'Mephitis',
      family: 'Mephitidae',
      commonName: 'Striped skunk',
    });
    const squirrel = candidate({
      scientificName: 'Sciurus carolinensis',
      genus: 'Sciurus',
      family: 'Sciuridae',
      order: 'Rodentia',
    });
    expect(buildWildlifeSafety({ band: 'high', candidates: [squirrel, skunk] })).toBeUndefined();
    const unsure = buildWildlifeSafety({ band: 'medium', candidates: [squirrel, skunk] })!;
    expect(unsure.kind).toBe('wildlife');
    expect(unsure.statements[0].subject).toContain('Striped skunk');
    const scat = buildWildlifeSafety({ band: 'high', candidates: [squirrel], feature: 'scat' })!;
    expect(scat.statements.map((s) => s.text).join(' ')).toMatch(/wash your hands/);
    for (const s of [...unsure.statements, ...scat.statements]) {
      expect(s.text).not.toMatch(/\bsafe\b|harmless/i);
      expect(s.sourceUrl).toMatch(/^https:\/\//);
    }
  });
});

describe('tracks and droppings', () => {
  it('treats a track or droppings photo as a mammal sign for Not sure, Animal and Mammal', () => {
    expect(signFor(input('auto', 'track'))).toBe('track');
    expect(signFor(input('animal', 'scat'))).toBe('scat');
    expect(signFor(input('mammal', 'track'))).toBe('track');
    expect(signFor(input('mammal', 'face'))).toBeUndefined();
    expect(signFor(input('bird', 'track'))).toBeUndefined();
    // The app only offers Tracks and Droppings once Mammal is chosen.
    expect(isValidFeature('mammal', 'track')).toBe(true);
    expect(isValidFeature('mammal', 'scat')).toBe(true);
    expect(isValidFeature('auto', 'track')).toBe(false);
    expect(isValidFeature('plant', 'scat')).toBe(false);
  });

  it('identifies a track under Not sure as a mammal, capped below high confidence', async () => {
    const result = await runIdentification(input('auto', 'track'), {
      providers: createMockProviders('high'),
    });
    expect(result.category).toBe('mammal');
    expect(result.sign).toBe('track');
    expect(result.candidates[0].scientificName).toBe('Procyon lotor');
    expect(result.candidates[0].visualConfidence).toBeLessThanOrEqual(SIGNS.confidenceCap);
    expect(result.confidenceBand).not.toBe('high');
    expect(result.guidance[0].feature).toBe('track');
    expect(result.safety?.kind).toBe('wildlife');
    expect(result.speciesInfo?.facts.some((f) => f.label === 'Diet')).toBe(true);
    expect(identifyResponseSchema.safeParse(result).success).toBe(true);
  });

  it('sends the sign and nearby candidates to the Space', async () => {
    const payloads: Record<string, unknown>[] = [];
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') {
        payloads.push(JSON.parse(String(init.body)).data[0]);
        return new Response(JSON.stringify({ event_id: 'e1' }));
      }
      const data = {
        results: [
          {
            name: 'Alces alces',
            species: 'Alces alces',
            commonName: 'Moose',
            kingdom: 'Animalia',
            class: 'Mammalia',
            genus: 'Alces',
            score: 0.97,
          },
        ],
        rank: 'species',
        restricted: true,
        candidateCount: 2,
        sign: 'scat',
      };
      return new Response(`event: complete\ndata: ${JSON.stringify([data])}\n\n`);
    });
    const provider = new BioclipIdentificationProvider(
      'https://space',
      'tok',
      ['mammal'],
      fetchImpl as unknown as typeof fetch,
    );
    const result = await provider.identify({
      ...input('mammal', 'scat'),
      sign: 'scat',
      signCandidates: [{ name: 'Alces alces', common: 'Moose' }, { name: 'Castor canadensis' }],
    });
    expect(payloads[0]).toMatchObject({ sign: 'scat', candidates: [{ name: 'Alces alces' }, {}] });
    expect(payloads[0].within).toBeUndefined();
    expect(result.candidates[0]).toMatchObject({
      scientificName: 'Alces alces',
      category: 'mammal',
    });
  });
});

describe('photos of people', () => {
  it('answers "a person" under Not sure without identifying a species', async () => {
    const result = await runIdentification(input('auto'), {
      providers: createMockProviders('person'),
    });
    expect(result.person).toBe(true);
    expect(result.candidates).toEqual([]);
    expect(identifyResponseSchema.safeParse(result).success).toBe(true);
  });

  it('flags a person when the Space says so, even under a chosen category', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(JSON.stringify({ event_id: 'e1' }));
      const data = {
        results: [{ name: 'Obama marmorata', species: 'Obama marmorata', score: 0.2 }],
        rank: 'species',
        restricted: true,
        candidateCount: 1,
        person: 0.9,
      };
      return new Response(`event: complete\ndata: ${JSON.stringify([data])}\n\n`);
    });
    const provider = new BioclipIdentificationProvider(
      'https://space',
      'tok',
      ['mammal'],
      fetchImpl as unknown as typeof fetch,
    );
    const result = await provider.identify(input('mammal'));
    expect(result.person).toBe(true);
    expect(result.candidates).toEqual([]);
    expect((await provider.detectCategory(input('auto'))).person).toBe(true);
  });
});

describe('follow-up questions', () => {
  const fox = candidate({
    id: 'fox',
    scientificName: 'Vulpes vulpes',
    genus: 'Vulpes',
    family: 'Canidae',
    finalConfidence: 0.5,
  });
  const chipmunk = candidate({
    id: 'chip',
    scientificName: 'Tamias striatus',
    genus: 'Tamias',
    family: 'Sciuridae',
    finalConfidence: 0.3,
  });
  const moose = candidate({
    id: 'moose',
    scientificName: 'Alces alces',
    genus: 'Alces',
    family: 'Cervidae',
    finalConfidence: 0.1,
  });

  it('asks about size only when the likely matches differ, from sourced traits', () => {
    const questions = buildQuestions('medium', [fox, chipmunk, moose]);
    const size = questions.find((q) => q.id === 'size')!;
    expect(size.fits.fox).toContain('m');
    expect(size.fits.chip).toContain('s');
    expect(size.fits.moose).toContain('xl');
    expect(size.source).toContain('EltonTraits');
    expect(buildQuestions('high', [fox, chipmunk])).toEqual([]);
    // Two foxes can't be told apart by size: no question.
    expect(buildQuestions('medium', [fox, { ...fox, id: 'fox2' }])).toEqual([]);
    // Not torn: the runner-up is far behind, so nothing to ask.
    expect(buildQuestions('medium', [fox, { ...chipmunk, finalConfidence: 0.08 }])).toEqual([]);
  });

  it('re-ranks without ever boosting, and "Not sure" changes nothing', () => {
    const base = {
      requestId: 'r',
      category: 'mammal',
      confidenceBand: 'medium',
      candidates: [fox, chipmunk, moose],
      questions: buildQuestions('medium', [fox, chipmunk, moose]),
      speciesInfo: { scientificName: 'Vulpes vulpes' },
    } as unknown as IdentifyResponse;
    expect(applyAnswers(base, { size: NOT_SURE })).toBe(base);
    const small = applyAnswers(base, { size: 's' });
    expect(small.candidates[0].id).toBe('chip');
    expect(small.candidates[0].finalConfidence).toBe(0.3);
    expect(small.confidenceBand).toBe('low');
    // Facts describe the old top match, so they're dropped when the top changes.
    expect(small.speciesInfo).toBeUndefined();
    expect(contradicts(fox, base.questions!, { size: 's' })).toBe(true);
  });
});
