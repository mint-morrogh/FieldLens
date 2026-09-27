// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  BioclipIdentificationProvider,
  EXPERIMENTAL_CONFIDENCE_CAP,
  categoryForTaxon,
  parseGradioEvents,
  toCandidates,
} from '../../server/providers/bioclip/bioclipProvider';
import { toApiError } from '../../server/lib/errors';
import { readEnv } from '../../server/lib/env';
import { runIdentification } from '../../server/identify/pipeline';
import { createMockProviders } from '../../server/providers/mock/mockProviders';
import { supportedCategories } from '../../server/providers/registry';
import type { IdentificationInput } from '../../server/providers/types';

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const input = (category: IdentificationInput['category'] = 'insect'): IdentificationInput => ({
  observationId: 'o',
  category,
  images: [{ data: JPEG, mimeType: 'image/jpeg', feature: 'auto' }],
  capturedAt: new Date('2026-09-20T12:00:00Z'),
});

const sse = (payload: unknown) => `event: complete\ndata: ${JSON.stringify([payload])}\n\n`;

/** Fake Hugging Face Space: returns queued responses for each identify call. */
function fakeSpace(responses: unknown[], status = 200) {
  const payloads: unknown[] = [];
  let call = 0;
  const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    if (init?.method === 'POST') {
      payloads.push(JSON.parse(String(init.body)).data[0]);
      return new Response(JSON.stringify({ event_id: `e${call}` }), { status });
    }
    expect(u).toContain('/gradio_api/call/identify/');
    return new Response(sse(responses[call++]), { status: 200 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, payloads };
}

const monarch = {
  results: [
    {
      name: 'Danaus plexippus',
      score: 0.97,
      commonName: 'Wanderer',
      kingdom: 'Animalia',
      class: 'Insecta',
      family: 'Nymphalidae',
      genus: 'Danaus',
      species: 'Danaus plexippus',
    },
    {
      name: 'Danaus erippus',
      score: 0.02,
      class: 'Insecta',
      genus: 'Danaus',
      species: 'Danaus erippus',
    },
  ],
  rank: 'species',
  restricted: true,
  candidateCount: 280000,
  groupProbability: 0.9,
};

describe('BioCLIP provider', () => {
  it('parses Gradio events', () => {
    expect(parseGradioEvents('event: heartbeat\ndata: null\n\n' + sse({ ok: 1 }))).toEqual([
      { ok: 1 },
    ]);
    expect(() => parseGradioEvents('event: error\ndata: "boom"\n')).toThrow();
    expect(() => parseGradioEvents('nothing useful')).toThrow();
  });

  it('maps taxa to FieldLens categories', () => {
    expect(categoryForTaxon('Plantae', 'Magnoliopsida')).toBe('plant');
    expect(categoryForTaxon('Fungi', 'Agaricomycetes')).toBe('fungus');
    expect(categoryForTaxon('Animalia', 'Insecta')).toBe('insect');
    expect(categoryForTaxon('Animalia', 'Arachnida')).toBe('arachnid');
    expect(categoryForTaxon('Animalia', 'Aves')).toBe('bird');
    expect(categoryForTaxon('Animalia', 'Squamata')).toBe('reptile');
    expect(categoryForTaxon('Animalia', 'Gastropoda')).toBe('other');
  });

  it('caps experimental confidence and folds in how much the photo looks like the group', () => {
    const [top] = toCandidates(monarch, 'insect');
    expect(top.visualConfidence).toBe(EXPERIMENTAL_CONFIDENCE_CAP);
    const [weak] = toCandidates({ ...monarch, groupProbability: 0.45 }, 'insect');
    expect(weak.visualConfidence).toBeCloseTo(0.97 * 0.5, 2);
    expect(top).toMatchObject({
      scientificName: 'Danaus plexippus',
      className: 'Insecta',
      genus: 'Danaus',
    });
  });

  it('sends photos with the category scope and returns experimental candidates', async () => {
    const { fetchImpl, payloads } = fakeSpace([monarch]);
    const provider = new BioclipIdentificationProvider(
      'https://space',
      'tok',
      ['insect', 'arachnid'],
      fetchImpl,
    );
    expect(provider.supports('insect')).toBe(true);
    expect(provider.supports('plant')).toBe(false);
    const result = await provider.identify(input());
    expect(payloads[0]).toMatchObject({ within: { class: expect.arrayContaining(['Insecta']) } });
    expect(result.experimental).toBe(true);
    expect(result.categoryCheck).toBeUndefined();
    expect(result.candidates[0].scientificName).toBe('Danaus plexippus');
  });

  it('flags off-target photos, suggests a category and returns no species', async () => {
    const leaf = { ...monarch, groupProbability: 0.02 };
    const overview = {
      results: [{ name: 'Magnoliopsida', score: 0.95, kingdom: 'Plantae', class: 'Magnoliopsida' }],
      rank: 'class',
      restricted: false,
      candidateCount: 1,
    };
    const { fetchImpl, payloads } = fakeSpace([leaf, overview]);
    const provider = new BioclipIdentificationProvider(
      'https://space',
      'tok',
      ['insect'],
      fetchImpl,
    );
    const result = await provider.identify(input());
    expect(payloads[1]).toMatchObject({ k: 20 }); // second opinion: top-species vote
    expect(result.candidates).toEqual([]);
    expect(result.categoryCheck).toMatchObject({
      matchesCategory: false,
      suggestedCategory: 'plant',
      suggestedGroup: 'plant',
    });
  });

  it('trusts the species vote when it agrees with the chosen group (camouflaged subjects)', async () => {
    const lowGroup = { ...monarch, groupProbability: 0.3 };
    const vote = {
      results: [{ name: 'Danaus plexippus', score: 0.5, kingdom: 'Animalia', class: 'Insecta' }],
      rank: 'species',
      restricted: false,
      candidateCount: 1,
    };
    const { fetchImpl } = fakeSpace([lowGroup, vote]);
    const provider = new BioclipIdentificationProvider(
      'https://space',
      'tok',
      ['insect'],
      fetchImpl,
    );
    const result = await provider.identify(input());
    expect(result.categoryCheck).toBeUndefined();
    expect(result.candidates[0].scientificName).toBe('Danaus plexippus');
  });

  it('maps a rejected token to a configuration error', async () => {
    const { fetchImpl } = fakeSpace([], 401);
    const provider = new BioclipIdentificationProvider(
      'https://space',
      'bad',
      ['insect'],
      fetchImpl,
    );
    const error = await provider.identify(input()).catch((e) => e);
    expect(toApiError(error).code).toBe('provider_auth');
  });

  it('is only offered when the Hugging Face settings exist', () => {
    expect(supportedCategories(readEnv({ PLANTNET_API_KEY: 'k' }))).toEqual(['plant']);
    expect(
      supportedCategories(
        readEnv({ PLANTNET_API_KEY: 'k', HF_TOKEN: 't', BIOCLIP_SPACE_URL: 'https://s' }),
      ),
    ).toEqual(expect.arrayContaining(['plant', 'insect', 'arachnid']));
  });
});

describe('pipeline with experimental providers', () => {
  it('passes the experimental flag through', async () => {
    const result = await runIdentification(input(), { providers: createMockProviders('high') });
    expect(result.experimental).toBe(true);
    expect(result.candidates[0].scientificName).toBe('Danaus plexippus');
  });
  it('returns the category check with no species for off-target photos', async () => {
    const result = await runIdentification(input(), {
      providers: createMockProviders('wrong-category'),
    });
    expect(result.confidenceBand).toBe('none');
    expect(result.categoryCheck).toMatchObject({ suggestedCategory: 'plant' });
  });
  it('reports not configured when no identification provider exists', async () => {
    const providers = { ...createMockProviders('high'), identification: [] };
    await expect(runIdentification(input('plant'), { providers })).rejects.toMatchObject({
      code: 'not_configured',
    });
  });
});

describe('groups and category detection', () => {
  it('maps vertebrate classes, including classless fish', () => {
    expect(categoryForTaxon('Animalia', 'Squamata', 'Chordata')).toBe('reptile');
    expect(categoryForTaxon('Animalia', 'Testudines', 'Chordata')).toBe('reptile');
    expect(categoryForTaxon('Animalia', '', 'Chordata')).toBe('fish');
    expect(categoryForTaxon('Animalia', 'Chordata (unranked)', 'Chordata')).toBe('fish');
    expect(categoryForTaxon('Animalia', 'Elasmobranchii', 'Chordata')).toBe('fish');
    expect(categoryForTaxon('Animalia', 'Amphibia', 'Chordata')).toBe('amphibian');
  });

  it('supports groups whose members it covers and gives each candidate its own category', async () => {
    const response = {
      results: [
        {
          name: 'Dermacentor variabilis',
          score: 0.5,
          kingdom: 'Animalia',
          class: 'Arachnida',
          species: 'Dermacentor variabilis',
        },
        {
          name: 'Ixodes scapularis',
          score: 0.2,
          kingdom: 'Animalia',
          class: 'Arachnida',
          species: 'Ixodes scapularis',
        },
        {
          name: 'Cimex lectularius',
          score: 0.1,
          kingdom: 'Animalia',
          class: 'Insecta',
          species: 'Cimex lectularius',
        },
      ],
      rank: 'species',
      restricted: true,
      candidateCount: 300000,
      groupProbability: 0.95,
    };
    const { fetchImpl, payloads } = fakeSpace([response]);
    const provider = new BioclipIdentificationProvider(
      'https://s',
      't',
      ['insect', 'arachnid'],
      fetchImpl,
    );
    expect(provider.supports('bug')).toBe(true);
    expect(provider.supports('animal')).toBe(false);
    expect(provider.supports('auto')).toBe(false);
    const result = await provider.identify(input('bug'));
    expect((payloads[0] as { within: { class: string[] } }).within.class).toEqual(
      expect.arrayContaining(['Insecta', 'Arachnida']),
    );
    expect(result.detectedCategory).toBe('arachnid');
    expect(result.candidates.map((c) => c.category)).toEqual(['arachnid', 'arachnid', 'insect']);
  });

  it('detects a category by letting the top species vote', async () => {
    const response = {
      results: [
        {
          name: 'Paralepistopsis acromelalga',
          score: 0.04,
          kingdom: 'Fungi',
          class: 'Agaricomycetes',
        },
        {
          name: 'Lithobates sylvaticus',
          score: 0.03,
          kingdom: 'Animalia',
          phylum: 'Chordata',
          class: 'Amphibia',
        },
        {
          name: 'Lithobates clamitans',
          score: 0.03,
          kingdom: 'Animalia',
          phylum: 'Chordata',
          class: 'Amphibia',
        },
        {
          name: 'Pseudacris crucifer',
          score: 0.02,
          kingdom: 'Animalia',
          phylum: 'Chordata',
          class: 'Amphibia',
        },
      ],
      rank: 'species',
      restricted: false,
      candidateCount: 867455,
    };
    const { fetchImpl } = fakeSpace([response]);
    const provider = new BioclipIdentificationProvider('https://s', 't', ['amphibian'], fetchImpl);
    const found = await provider.detectCategory(input('auto'));
    expect(found.category).toBe('amphibian');
    expect(found.likelihood).toBeCloseTo(0.08 / 0.12, 2);
  });
});

describe('pipeline with groups', () => {
  it('reports the specific category found for a group', async () => {
    const result = await runIdentification(input('animal'), {
      providers: createMockProviders('high'),
    });
    expect(result.category).toBe('amphibian');
    expect(result.categoryDetection).toMatchObject({ requested: 'animal', detected: 'amphibian' });
  });
  it('"Not sure" detects first, then routes (plants go to the plant provider)', async () => {
    const plant = await runIdentification(input('auto'), {
      providers: createMockProviders('high'),
    });
    expect(plant.category).toBe('plant');
    expect(plant.categoryDetection).toMatchObject({ requested: 'auto', detected: 'plant' });
    expect(plant.experimental).toBeUndefined();
    const bug = await runIdentification(input('auto'), {
      providers: createMockProviders('auto-bug'),
    });
    expect(bug.category).toBe('insect');
    expect(bug.experimental).toBe(true);
  });
});
