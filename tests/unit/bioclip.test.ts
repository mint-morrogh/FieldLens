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
    expect(payloads[1]).toMatchObject({ rank: 'class' });
    expect(result.candidates).toEqual([]);
    expect(result.categoryCheck).toMatchObject({
      matchesCategory: false,
      suggestedCategory: 'plant',
      suggestedGroup: 'Plantae',
    });
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
