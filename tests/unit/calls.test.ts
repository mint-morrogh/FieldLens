// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { identifyResponseSchema } from '../../shared/schemas';
import { runIdentification } from '../../server/identify/pipeline';
import {
  BirdnetCallProvider,
  CALL_CONFIDENCE_CAP,
  birdnetWeek,
  toCallCandidates,
} from '../../server/providers/birdnet/birdnet';
import { createMockProviders } from '../../server/providers/mock/mockProviders';
import type { IdentificationInput } from '../../server/providers/types';
import { parseIdentifyForm, wavSeconds } from '../../server/validation/upload';
import { encodeWav } from '../../src/lib/audio';

const wav = async (seconds: number, sampleRate = 48_000) =>
  new Uint8Array(await encodeWav(new Float32Array(seconds * sampleRate), sampleRate).arrayBuffer());

describe('call recordings', () => {
  it('accepts mono 16-bit WAV at 48 kHz and measures it', async () => {
    expect(wavSeconds(await wav(4))).toBe(4);
    expect(wavSeconds(await wav(4, 44_100))).toBeUndefined();
    expect(wavSeconds(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });

  it('parses a recording instead of photos, and rejects clips that are too short', async () => {
    const form = (bytes: Uint8Array) => {
      const f = new FormData();
      f.append('category', 'bird');
      f.append('audio', new File([bytes as BlobPart], 'call.wav', { type: 'audio/wav' }));
      return f;
    };
    const input = await parseIdentifyForm(form(await wav(5)));
    expect(input.images).toEqual([]);
    expect(input.audio?.seconds).toBe(5);
    await expect(parseIdentifyForm(form(await wav(1)))).rejects.toMatchObject({
      code: 'invalid_file',
    });
  });
});

describe('BirdNET candidates', () => {
  it('keeps BirdNET’s order and caps confidence', () => {
    const candidates = toCallCandidates({
      results: [
        { name: 'Cardinalis cardinalis', common: 'Northern Cardinal', score: 0.99, mean: 0.7 },
        // Higher best window but a lower mean: must not jump ahead.
        { name: 'Turdus migratorius', common: 'American Robin', score: 0.4, mean: 0.1 },
        { name: 'Cyanocitta cristata', common: 'Blue Jay', score: 0.6, mean: 0.05 },
      ],
    });
    expect(candidates.map((c) => c.visualConfidence)).toEqual([CALL_CONFIDENCE_CAP, 0.4, 0.4]);
    expect(candidates[0]).toMatchObject({ category: 'bird', commonName: 'Northern Cardinal' });
  });

  it('uses BirdNET’s 48-week year', () => {
    expect(birdnetWeek(new Date('2026-01-01T12:00:00Z'))).toBe(1);
    expect(birdnetWeek(new Date('2026-05-15T12:00:00Z'))).toBe(19);
    expect(birdnetWeek(new Date('2026-12-31T12:00:00Z'))).toBe(48);
  });

  it('sends the recording, location and week to the Space', async () => {
    const calls: { url: string; body?: string }[] = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body as string | undefined });
      if (init?.method === 'POST') return Response.json({ event_id: 'e1' });
      return new Response(
        `event: complete\ndata: ${JSON.stringify([{ results: [{ name: 'Cardinalis cardinalis', score: 0.8, mean: 0.5 }], sound: null }])}\n`,
      );
    }) as typeof fetch;
    const provider = new BirdnetCallProvider('https://space.example', 't', fetchImpl);
    const result = await provider.identify({
      observationId: 'o',
      category: 'bird',
      images: [],
      audio: { data: await wav(3), mimeType: 'audio/wav', seconds: 3 },
      location: { latitude: 42.44, longitude: -76.5 },
      capturedAt: new Date('2026-05-15T12:00:00Z'),
    });
    expect(calls[0].url).toBe('https://space.example/gradio_api/call/identify_audio');
    const payload = JSON.parse(calls[0].body!).data[0];
    expect(payload).toMatchObject({ lat: 42.44, lon: -76.5, week: 19 });
    expect(typeof payload.audio).toBe('string');
    expect(result.candidates[0].scientificName).toBe('Cardinalis cardinalis');
  });
});

describe('Calls through the pipeline', () => {
  const input = async (): Promise<IdentificationInput> => ({
    observationId: 'o',
    category: 'bird',
    images: [],
    audio: { data: await wav(5), mimeType: 'audio/wav', seconds: 5 },
    location: { latitude: 42.44, longitude: -76.5 },
    capturedAt: new Date('2026-05-15T12:00:00Z'),
  });

  it('says so when calls aren’t configured', async () => {
    const providers = { ...createMockProviders('high'), audio: undefined };
    expect(createMockProviders('high').audio).toBeDefined();
    await expect(runIdentification(await input(), { providers })).rejects.toMatchObject({
      code: 'not_configured',
    });
  });

  it('identifies a call as a bird, with sound-model wording and no photo tips', async () => {
    const providers = {
      ...createMockProviders('high'),
      audio: {
        name: 'BirdNET',
        acceptedMimeTypes: [] as const,
        maxImages: 0,
        supports: (t: string) => t === 'bird',
        identify: async () => ({
          provider: 'BirdNET',
          attribution: [],
          candidates: toCallCandidates({
            results: [
              { name: 'Cardinalis cardinalis', common: 'Northern Cardinal', score: 0.9, mean: 0.6 },
            ],
          }),
        }),
      },
    };
    const result = await runIdentification(await input(), { providers });
    expect(identifyResponseSchema.safeParse(result).success).toBe(true);
    expect(result.call).toBe(true);
    expect(result.category).toBe('bird');
    expect(result.candidates[0].scientificName).toBe('Cardinalis cardinalis');
    const texts = [...result.evidence.supports, ...result.evidence.uncertainties].map(
      (e) => e.text,
    );
    expect(texts.some((t) => /photo/i.test(t))).toBe(false);
  });

  it('explains a non-bird sound instead of guessing', async () => {
    const providers = {
      ...createMockProviders('high'),
      audio: {
        name: 'BirdNET',
        acceptedMimeTypes: [] as const,
        maxImages: 0,
        supports: () => true,
        identify: async () => ({
          provider: 'BirdNET',
          attribution: [],
          candidates: [],
          sound: 'Human vocal',
        }),
      },
    };
    const result = await runIdentification(await input(), { providers });
    expect(result.confidenceBand).toBe('none');
    expect(result.guidance[0].message).toContain('human vocal');
  });
});
