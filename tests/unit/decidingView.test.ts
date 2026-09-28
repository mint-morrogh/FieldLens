// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { identifyResponseSchema } from '../../shared/schemas';
import type { OrganismCandidate } from '../../shared/types';
import { buildDecidingView } from '../../server/facts/decidingView';
import { buildQuestions } from '../../server/facts/questions';
import { runIdentification } from '../../server/identify/pipeline';
import { createMockProviders } from '../../server/providers/mock/mockProviders';

const candidate = (over: Partial<OrganismCandidate>): OrganismCandidate =>
  ({
    id: over.scientificName ?? 'x',
    category: 'fungus',
    scientificName: 'Agaricus campestris',
    taxonKeys: {},
    visualConfidence: 0.5,
    finalConfidence: 0.5,
    source: { identification: 'test' },
    links: [],
    ...over,
  }) as OrganismCandidate;

const fungus = (scientificName: string, family: string, finalConfidence: number) =>
  candidate({
    id: scientificName,
    scientificName,
    genus: scientificName.split(' ')[0],
    family,
    finalConfidence,
  });

describe('deciding view', () => {
  const bolete = fungus('Boletus edulis', 'Boletaceae', 0.45);
  const agaric = fungus('Agaricus campestris', 'Agaricaceae', 0.3);

  it('asks for the underside when close fungi differ between gills and pores', () => {
    const view = buildDecidingView({
      category: 'fungus',
      band: 'medium',
      candidates: [bolete, agaric],
      features: ['cap'],
    });
    expect(view?.feature).toBe('underside');
    expect(view?.prompt).toBe('Show the underside of the cap');
    expect(view?.reason).toContain('pores');
    expect(view?.reason).toContain('gills');
  });

  it('does not ask for a part already photographed', () => {
    expect(
      buildDecidingView({
        category: 'fungus',
        band: 'medium',
        candidates: [bolete, agaric],
        features: ['cap', 'underside'],
      }),
    ).toBeUndefined();
  });

  it('asks for the stem base first when an Amanita is among the close matches', () => {
    const view = buildDecidingView({
      category: 'fungus',
      band: 'low',
      candidates: [agaric, fungus('Amanita virosa', 'Amanitaceae', 0.25)],
      features: ['auto'],
    });
    expect(view?.feature).toBe('base');
    expect(view?.prompt).toBe('Get the stem base');
    expect(view?.reason).toContain('volva');
  });

  it('stays quiet when confident, when there is no real runner-up, or when they agree', () => {
    const base = { category: 'fungus' as const, features: ['auto'] };
    expect(buildDecidingView({ ...base, band: 'high', candidates: [bolete, agaric] })).toBe(
      undefined,
    );
    // The runner-up has well under a third of the top's score.
    expect(
      buildDecidingView({
        ...base,
        band: 'medium',
        candidates: [bolete, { ...agaric, finalConfidence: 0.05 }],
      }),
    ).toBeUndefined();
    // Two gilled families: the underside wouldn't separate them.
    expect(
      buildDecidingView({
        ...base,
        band: 'medium',
        candidates: [agaric, fungus('Russula emetica', 'Russulaceae', 0.3)],
      }),
    ).toBeUndefined();
    // Family unknown: no claim about its underside.
    expect(
      buildDecidingView({
        ...base,
        band: 'medium',
        candidates: [bolete, { ...agaric, family: undefined }],
      }),
    ).toBeUndefined();
  });

  it('asks birds for the head and bill when AVONET bill shapes differ', () => {
    const candidates = [
      candidate({
        id: 'finch',
        category: 'bird',
        scientificName: 'Haemorhous mexicanus',
        finalConfidence: 0.4,
      }),
      candidate({
        id: 'warbler',
        category: 'bird',
        scientificName: 'Setophaga petechia',
        finalConfidence: 0.3,
      }),
    ];
    const questions = buildQuestions('medium', candidates);
    const view = buildDecidingView({
      category: 'bird',
      band: 'medium',
      candidates,
      features: ['whole'],
      questions,
    });
    expect(view?.feature).toBe('head');
    expect(view?.source).toContain('AVONET');
    expect(
      buildDecidingView({
        category: 'bird',
        band: 'medium',
        candidates,
        features: ['head'],
        questions,
      }),
    ).toBeUndefined();
  });

  it('asks plants in one genus for a flower, unless a flower or fruit is already in', () => {
    const maple = (name: string, c: number) =>
      candidate({
        id: name,
        category: 'plant',
        scientificName: name,
        genus: 'Acer',
        finalConfidence: c,
      });
    const candidates = [maple('Acer rubrum', 0.4), maple('Acer saccharinum', 0.3)];
    const view = buildDecidingView({
      category: 'plant',
      band: 'medium',
      candidates,
      features: ['leaf'],
    });
    expect(view?.feature).toBe('flower');
    expect(view?.reason).toContain('Acer');
    expect(
      buildDecidingView({ category: 'plant', band: 'medium', candidates, features: ['fruit'] }),
    ).toBeUndefined();
    // Different genera: no single organ is known to settle it.
    expect(
      buildDecidingView({
        category: 'plant',
        band: 'medium',
        candidates: [
          candidates[0],
          candidate({
            id: 'oak',
            category: 'plant',
            scientificName: 'Quercus rubra',
            genus: 'Quercus',
            finalConfidence: 0.3,
          }),
        ],
        features: ['leaf'],
      }),
    ).toBeUndefined();
  });

  it('is a valid part of the identify response', async () => {
    const result = await runIdentification(
      {
        observationId: 'o',
        category: 'plant',
        images: [
          { data: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg', feature: 'leaf' },
        ],
        capturedAt: new Date('2026-09-20T12:00:00Z'),
      },
      { providers: createMockProviders('medium') },
    );
    expect(identifyResponseSchema.safeParse(result).success).toBe(true);
    const withView = {
      ...result,
      decidingView: { feature: 'underside', prompt: 'Show the underside', reason: 'Because' },
    };
    expect(identifyResponseSchema.safeParse(withView).success).toBe(true);
  });
});
