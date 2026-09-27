// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { MemoryCache, cached } from '../../server/cache/cache';
import { handleHealth, handleIdentify } from '../../server/http/handlers';
import { buildEvidence, buildGuidance } from '../../server/identify/evidence';
import { genusGroup, peakMonthsFact, runIdentification } from '../../server/identify/pipeline';
import { ApiError, UpstreamError, toApiError } from '../../server/lib/errors';
import { readEnv } from '../../server/lib/env';
import { RateLimiter } from '../../server/lib/rateLimit';
import {
  coarsenPlace,
  licensedPhoto,
} from '../../server/providers/inaturalist/inaturalistProvider';
import { createMockProviders } from '../../server/providers/mock/mockProviders';
import {
  PlantNetIdentificationProvider,
  normalizePlantNetResponse,
  toPlantNetOrgan,
} from '../../server/providers/plantnet/plantnetProvider';
import type { IdentificationInput } from '../../server/providers/types';
import {
  parseIdentifyForm,
  readImageDimensions,
  sniffImageType,
} from '../../server/validation/upload';

// Minimal valid 2x2 PNG header + IHDR (enough for sniffing and dimension checks).
function pngBytes(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}
const JPEG = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0,
  0, 11, 8, 0, 200, 1, 44, 3, 1, 0x22, 0,
]);

const input = (overrides: Partial<IdentificationInput> = {}): IdentificationInput => ({
  observationId: 'obs1',
  category: 'plant',
  images: [{ data: JPEG, mimeType: 'image/jpeg', feature: 'leaf' }],
  capturedAt: new Date('2026-09-20T12:00:00Z'),
  ...overrides,
});

describe('Pl@ntNet normalization', () => {
  const raw = {
    bestMatch: 'Acer rubrum L.',
    results: [
      {
        score: 0.05,
        species: {
          scientificNameWithoutAuthor: 'Acer saccharinum',
          genus: { scientificNameWithoutAuthor: 'Acer' },
          family: { scientificNameWithoutAuthor: 'Sapindaceae' },
          commonNames: [],
        },
        gbif: { id: '3189837' },
      },
      {
        score: 0.91,
        species: {
          scientificNameWithoutAuthor: 'Acer rubrum',
          scientificNameAuthorship: 'L.',
          genus: { scientificNameWithoutAuthor: 'Acer' },
          family: { scientificNameWithoutAuthor: 'Sapindaceae' },
          commonNames: ['Red maple', ' Swamp maple '],
        },
        gbif: { id: '3189883' },
        powo: { id: '781886-1' },
        images: [
          { author: 'Jane', license: 'cc-by-sa', url: { o: 'o.jpg', m: 'm.jpg', s: 's.jpg' } },
          { url: { m: 'nolicense.jpg' } },
        ],
      },
    ],
  };

  it('sorts, maps names, keys and links into taxonomy-neutral candidates', () => {
    const [top, second] = normalizePlantNetResponse(raw);
    expect(top.scientificName).toBe('Acer rubrum');
    expect(top.commonName).toBe('Red maple');
    expect(top.commonNames).toEqual(['Red maple', 'Swamp maple']);
    expect(top.family).toBe('Sapindaceae');
    expect(top.taxonKeys).toEqual({ gbif: 3189883, powo: '781886-1' });
    expect(top.visualConfidence).toBe(0.91);
    expect(top.links.map((l) => l.label)).toContain('Plants of the World Online (Kew)');
    expect(second.scientificName).toBe('Acer saccharinum');
  });
  it('only keeps reference images with an author and license', () => {
    const [top] = normalizePlantNetResponse(raw);
    expect(top.referenceImages).toHaveLength(1);
    expect(top.referenceImages?.[0]).toMatchObject({
      author: 'Jane',
      license: 'cc-by-sa',
      url: 'm.jpg',
    });
  });
  it('rejects malformed responses', () => {
    expect(() => normalizePlantNetResponse({ results: 'x' })).toThrow(UpstreamError);
  });
  it('maps unsupported features to auto', () => {
    expect(toPlantNetOrgan('flower')).toBe('flower');
    expect(toPlantNetOrgan('habit')).toBe('auto');
  });
  it('treats 404 as zero predictions and 429 as quota errors', async () => {
    const provider404 = new PlantNetIdentificationProvider(
      'k',
      'all',
      async () => new Response('{}', { status: 404 }),
    );
    expect((await provider404.identify(input())).candidates).toEqual([]);
    const provider429 = new PlantNetIdentificationProvider(
      'k',
      'all',
      async () => new Response('{}', { status: 429 }),
    );
    const err = await provider429.identify(input()).catch((e) => e);
    expect(toApiError(err).code).toBe('provider_quota_exhausted');
  });
  it('sends images, organs and the key only to the server-side request', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response(JSON.stringify(raw), { status: 200 }),
    );
    const provider = new PlantNetIdentificationProvider(
      'secret-key',
      'all',
      fetchImpl as unknown as typeof fetch,
    );
    const result = await provider.identify(input());
    const [url, init] = fetchImpl.mock.calls[0];
    expect(String(url)).toContain('api-key=secret-key');
    const body = init!.body as FormData;
    expect(body.getAll('organs')).toEqual(['leaf']);
    expect(body.getAll('images')).toHaveLength(1);
    expect(JSON.stringify(result.candidates)).not.toContain('secret-key');
  });
});

describe('error mapping', () => {
  it.each([
    [new UpstreamError('x', 'timeout'), 'provider_timeout', 504],
    [new UpstreamError('x', 'http', 429), 'provider_quota_exhausted', 503],
    [new UpstreamError('x', 'http', 401), 'provider_auth', 503],
    [new UpstreamError('x', 'http', 500), 'provider_unavailable', 502],
    [new UpstreamError('x', 'network'), 'provider_unavailable', 502],
    [new Error('boom secret'), 'internal_error', 500],
  ])('%s → %s', (error, code, status) => {
    const mapped = toApiError(error);
    expect(mapped.code).toBe(code);
    expect(mapped.status).toBe(status);
    expect(mapped.message).not.toContain('secret');
  });
  it('passes ApiErrors through', () => {
    const e = new ApiError('invalid_file', 'bad');
    expect(toApiError(e)).toBe(e);
  });
});

describe('upload validation', () => {
  it('sniffs real image types and reads dimensions', () => {
    expect(sniffImageType(JPEG)).toBe('image/jpeg');
    expect(sniffImageType(pngBytes(10, 10))).toBe('image/png');
    expect(sniffImageType(new TextEncoder().encode('#!/bin/sh'))).toBeUndefined();
    expect(readImageDimensions(pngBytes(640, 480), 'image/png')).toEqual({
      width: 640,
      height: 480,
    });
    expect(readImageDimensions(JPEG, 'image/jpeg')).toEqual({ width: 300, height: 200 });
  });

  const form = (files: Blob[], fields: Record<string, string> = {}) => {
    const f = new FormData();
    for (const file of files) f.append('images', file, 'x');
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    return f;
  };

  it('parses a valid request and re-rounds coordinates server-side', async () => {
    const parsed = await parseIdentifyForm(
      form([new Blob([JPEG as BlobPart], { type: 'image/jpeg' })], {
        features: 'flower',
        latitude: '46.23821',
        longitude: '-63.13119',
        category: 'plant',
      }),
    );
    expect(parsed.location).toEqual({ latitude: 46.24, longitude: -63.13 });
    expect(parsed.images[0].feature).toBe('flower');
  });
  it('rejects disguised files, wrong MIME types, oversize and too many images', async () => {
    const fake = new Blob(['not an image'], { type: 'image/jpeg' });
    await expect(parseIdentifyForm(form([fake]))).rejects.toMatchObject({ code: 'invalid_file' });
    await expect(
      parseIdentifyForm(form([new Blob([JPEG as BlobPart], { type: 'application/x-msdownload' })])),
    ).rejects.toMatchObject({ code: 'invalid_file' });
    const big = new Blob([JPEG as BlobPart, new Uint8Array(3.5 * 1024 * 1024)], {
      type: 'image/jpeg',
    });
    await expect(parseIdentifyForm(form([big]))).rejects.toMatchObject({ code: 'image_too_large' });
    const six = Array.from(
      { length: 6 },
      () => new Blob([JPEG as BlobPart], { type: 'image/jpeg' }),
    );
    await expect(parseIdentifyForm(form(six))).rejects.toMatchObject({ code: 'too_many_images' });
    await expect(parseIdentifyForm(form([]))).rejects.toMatchObject({ code: 'invalid_request' });
  });
  it('rejects tiny images, invalid coordinates and bad categories', async () => {
    await expect(
      parseIdentifyForm(form([new Blob([pngBytes(10, 10) as BlobPart], { type: 'image/png' })])),
    ).rejects.toMatchObject({ code: 'invalid_file' });
    const ok = new Blob([JPEG as BlobPart], { type: 'image/jpeg' });
    await expect(
      parseIdentifyForm(form([ok], { latitude: '100', longitude: '0' })),
    ).rejects.toMatchObject({ code: 'invalid_request' });
    await expect(parseIdentifyForm(form([ok], { category: 'dragon' }))).rejects.toMatchObject({
      code: 'invalid_request',
    });
  });
  it('replaces invalid features with auto', async () => {
    const parsed = await parseIdentifyForm(
      form([new Blob([JPEG as BlobPart], { type: 'image/jpeg' })], { features: 'wing' }),
    );
    expect(parsed.images[0].feature).toBe('auto');
  });
});

describe('identification pipeline', () => {
  it('routes by category and rejects categories without a provider', async () => {
    const plantOnly = {
      ...createMockProviders('high'),
      identification: [
        {
          name: 'plants only',
          acceptedMimeTypes: ['image/jpeg'],
          maxImages: 5,
          supports: (t: string) => t === 'plant',
          identify: async () => ({ provider: 'x', candidates: [], attribution: [] }),
        },
      ],
    };
    await expect(
      runIdentification(input({ category: 'mammal' }), { providers: plantOnly }),
    ).rejects.toMatchObject({
      code: 'unsupported_category',
    });
  });

  it('returns a ranked, enriched result', async () => {
    const result = await runIdentification(
      input({ location: { latitude: 46.24, longitude: -63.13 } }),
      { providers: createMockProviders('high') },
    );
    expect(result.confidenceBand).toBe('high');
    expect(result.candidates[0].scientificName).toBe('Acer rubrum');
    expect(result.candidates[0].geographicSupport).toBeGreaterThan(0.9);
    expect(result.sourceStatus).toEqual({
      identification: 'ok',
      occurrence: 'ok',
      speciesInfo: 'ok',
      community: 'ok',
    });
    expect(result.nearbySpecies?.species.length).toBeGreaterThan(0);
    expect(result.safetyNotice).toContain('safe to eat');
  });
  it('survives supporting-source failures', async () => {
    const gbif = await runIdentification(
      input({ location: { latitude: 46.24, longitude: -63.13 } }),
      { providers: createMockProviders('gbif-down') },
    );
    expect(gbif.candidates.length).toBeGreaterThan(0);
    expect(gbif.sourceStatus.occurrence).toBe('unavailable');
    expect(gbif.evidence.uncertainties.map((e) => e.code)).toContain('gbif_unavailable');
    const inat = await runIdentification(input(), { providers: createMockProviders('inat-down') });
    expect(inat.sourceStatus.community).toBe('unavailable');
    expect(inat.community).toBeUndefined();
  });
  it('marks location as unused when not provided', async () => {
    const result = await runIdentification(input(), { providers: createMockProviders('medium') });
    expect(result.location.used).toBe(false);
    expect(result.sourceStatus.occurrence).toBe('skipped');
    expect(result.candidates[0].finalConfidence).toBe(result.candidates[0].visualConfidence);
  });
  it('returns an empty "none" result for zero predictions', async () => {
    const result = await runIdentification(input(), { providers: createMockProviders('zero') });
    expect(result.confidenceBand).toBe('none');
    expect(result.candidates).toEqual([]);
  });
  it('describes busiest months deterministically', () => {
    expect(peakMonthsFact([0, 0, 0, 0, 0, 10, 20, 15, 0, 0, 0, 0])).toBe('June, July, August');
    expect(peakMonthsFact([0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0])).toBeUndefined();
  });
});

describe('genus grouping', () => {
  it('summarizes same-genus candidates when the species is uncertain', async () => {
    const result = await runIdentification(input(), { providers: createMockProviders('low') });
    expect(result.groupSummary).toMatchObject({
      rank: 'genus',
      name: 'Solidago',
      commonName: 'goldenrod',
      memberCount: 3,
    });
    expect(result.groupSummary!.confidence).toBeGreaterThan(0.75);
  });
  it('is omitted for high-confidence results', async () => {
    const result = await runIdentification(input(), { providers: createMockProviders('high') });
    expect(result.groupSummary).toBeUndefined();
  });
  it('requires enough combined confidence and members', () => {
    const c = (genus: string, finalConfidence: number) => ({ genus, finalConfidence }) as never;
    expect(genusGroup([c('A', 0.3), c('A', 0.3)], 'low')).toMatchObject({
      name: 'A',
      memberCount: 2,
    });
    expect(genusGroup([c('A', 0.3), c('B', 0.3)], 'low')).toBeUndefined();
    expect(genusGroup([c('A', 0.2), c('A', 0.2)], 'low')).toBeUndefined();
  });
});

describe('progress stages', () => {
  it('reports each stage in order, skipping location when absent', async () => {
    const events: string[] = [];
    await runIdentification(input(), {
      providers: createMockProviders('high'),
      onStage: (e) => events.push(`${e.stage}:${e.status}`),
    });
    expect(events).toEqual([
      'identify:active',
      'identify:done',
      'taxonomy:active',
      'taxonomy:done',
      'occurrence:skipped',
      'rank:done',
      'enrich:active',
      'enrich:done',
    ]);
  });
  it('includes a preview of first guesses after the visual step', async () => {
    let preview: unknown;
    await runIdentification(input(), {
      providers: createMockProviders('high'),
      onStage: (e) => {
        if (e.stage === 'identify' && e.status === 'done') preview = e.preview;
      },
    });
    expect(preview).toEqual(
      expect.arrayContaining([expect.objectContaining({ scientificName: 'Acer rubrum' })]),
    );
  });
  it('never lets a failing progress callback break identification', async () => {
    const result = await runIdentification(input(), {
      providers: createMockProviders('high'),
      onStage: () => {
        throw new Error('ui crashed');
      },
    });
    expect(result.candidates.length).toBeGreaterThan(0);
  });
});

describe('evidence and guidance', () => {
  it('suggests photos of features not yet submitted, category-aware', () => {
    expect(buildGuidance({ category: 'plant', band: 'low', features: ['leaf'] })[0].feature).toBe(
      'flower',
    );
    expect(buildGuidance({ category: 'plant', band: 'low', features: ['flower'] })[0].feature).toBe(
      'leaf',
    );
    expect(buildGuidance({ category: 'plant', band: 'high', features: [] })).toEqual([]);
    expect(buildGuidance({ category: 'bird', band: 'low', features: [] })[0].message).toMatch(
      /side view/,
    );
  });
  it('only claims evidence the system holds', () => {
    const { supports, uncertainties } = buildEvidence({
      category: 'plant',
      candidates: [],
      band: 'none',
      imageCount: 1,
      features: [],
      locationProvided: false,
      occurrenceStatus: 'skipped',
    });
    expect(supports).toEqual([]);
    expect(uncertainties).toEqual([]);
  });
});

describe('HTTP handlers', () => {
  const mockEnv = readEnv({ USE_MOCK_API: 'true' });
  const request = (fields: Record<string, string> = {}) => {
    const f = new FormData();
    f.append('images', new Blob([JPEG as BlobPart], { type: 'image/jpeg' }), 'a.jpg');
    for (const [k, v] of Object.entries(fields)) f.append(k, v);
    return new Request('http://localhost/api/identify', {
      method: 'POST',
      body: f,
      headers: { 'x-forwarded-for': '1.2.3.4' },
    });
  };

  it('health reports configuration without calling providers', async () => {
    const res = handleHealth({ env: readEnv({ PLANTNET_API_KEY: '' }) });
    const body = await res.json();
    expect(body).toMatchObject({
      ok: true,
      plantIdentificationConfigured: false,
      mock: false,
      version: '1.0.0',
    });
    expect(JSON.stringify(body)).not.toMatch(/key/i);
  });
  it('reports misconfiguration when no key is set', async () => {
    const res = await handleIdentify(request(), { env: readEnv({}) });
    expect(res.status).toBe(503);
    expect((await res.json()).error.code).toBe('not_configured');
  });
  it('rate limits per client with a Retry-After header', async () => {
    const limiter = new RateLimiter(2, 60_000);
    const opts = { env: mockEnv, limiter };
    expect((await handleIdentify(request({ mockScenario: 'high' }), opts)).status).toBe(200);
    expect((await handleIdentify(request({ mockScenario: 'high' }), opts)).status).toBe(200);
    const limited = await handleIdentify(request(), opts);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('Retry-After')).toBeTruthy();
  });
  it('maps provider failures to safe JSON errors', async () => {
    const res = await handleIdentify(request({ mockScenario: 'timeout' }), { env: mockEnv });
    expect(res.status).toBe(504);
    const body = await res.json();
    expect(body.error.code).toBe('provider_timeout');
    expect(JSON.stringify(body)).not.toMatch(/stack|at /);
  });
  it('streams NDJSON stage lines followed by the result', async () => {
    const f = new FormData();
    f.append('images', new Blob([JPEG as BlobPart], { type: 'image/jpeg' }), 'a.jpg');
    const req = new Request('http://localhost/api/identify', {
      method: 'POST',
      body: f,
      headers: { accept: 'application/x-ndjson' },
    });
    const res = await handleIdentify(req, { env: mockEnv });
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const lines = (await res.text())
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines[0]).toMatchObject({ type: 'stage', stage: 'identify', status: 'active' });
    expect(lines.at(-1).type).toBe('result');
    expect(lines.at(-1).result.candidates[0].scientificName).toBe('Acer rubrum');
  });
  it('streams provider failures as an error line', async () => {
    const f = new FormData();
    f.append('images', new Blob([JPEG as BlobPart], { type: 'image/jpeg' }), 'a.jpg');
    f.append('mockScenario', 'quota');
    const req = new Request('http://localhost/api/identify', {
      method: 'POST',
      body: f,
      headers: { accept: 'application/x-ndjson' },
    });
    const lines = (await (await handleIdentify(req, { env: mockEnv })).text())
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    expect(lines.at(-1)).toMatchObject({
      type: 'error',
      status: 503,
      error: { code: 'provider_quota_exhausted' },
    });
  });
  it('rejects non-POST and non-multipart requests', async () => {
    expect(
      (await handleIdentify(new Request('http://x/api/identify'), { env: mockEnv })).status,
    ).toBe(405);
    const json = new Request('http://x/api/identify', {
      method: 'POST',
      body: '{}',
      headers: { 'content-type': 'application/json' },
    });
    expect((await handleIdentify(json, { env: mockEnv })).status).toBe(400);
  });
});

describe('infrastructure', () => {
  it('memory cache expires entries and evicts least recently used', async () => {
    let now = 0;
    const cache = new MemoryCache({ maxEntries: 2, now: () => now });
    cache.set('a', 1, 100);
    cache.set('b', 2, 100);
    cache.get('a');
    cache.set('c', 3, 100);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    now = 200;
    expect(cache.get('a')).toBeUndefined();
    const compute = vi.fn(async () => 'v');
    await cached(cache, 'k', 100, compute);
    await cached(cache, 'k', 100, compute);
    expect(compute).toHaveBeenCalledTimes(1);
  });
  it('rate limiter frees slots after the window', () => {
    let now = 0;
    const limiter = new RateLimiter(1, 1000, () => now);
    expect(limiter.check('ip')).toBe(0);
    expect(limiter.check('ip')).toBeGreaterThan(0);
    expect(limiter.check('other')).toBe(0);
    now = 1001;
    expect(limiter.check('ip')).toBe(0);
  });
  it('coarsens iNaturalist places and only shows licensed photos', () => {
    expect(coarsenPlace('12 Horton Dr, Stratford, PE C1E 1K6, CA')).toBe('Stratford, PE, CA');
    expect(coarsenPlace('Charlottetown, PE C1E 1K6, Canada')).toBe('Charlottetown, PE, Canada');
    expect(licensedPhoto({ url: 'https://x/square.jpg', license_code: null }, 'u')).toBeUndefined();
    expect(licensedPhoto({ url: 'https://x/square.jpg', license_code: 'cc-by' }, 'u')?.url).toBe(
      'https://x/small.jpg',
    );
  });
});
