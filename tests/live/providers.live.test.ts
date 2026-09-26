// @vitest-environment node
/**
 * Opt-in checks against the real public APIs (GBIF, iNaturalist, Wikidata,
 * Wikipedia, and Pl@ntNet when PLANTNET_API_KEY is set). Not run in CI.
 *   npm run test:live
 */
import { describe, expect, it } from 'vitest';
import { runIdentification } from '../../server/identify/pipeline';
import { readEnv } from '../../server/lib/env';
import { createLiveProviders } from '../../server/providers/registry';
import type { IdentificationProvider } from '../../server/providers/types';

const stubPlantNet: IdentificationProvider = {
  name: 'Stub',
  acceptedMimeTypes: ['image/jpeg'],
  maxImages: 5,
  supports: (c) => c === 'plant',
  identify: async () => ({
    provider: 'Stub',
    attribution: [],
    candidates: [
      {
        id: 'a',
        category: 'plant',
        scientificName: 'Acer rubrum',
        genus: 'Acer',
        family: 'Sapindaceae',
        commonName: 'Red maple',
        taxonKeys: {},
        visualConfidence: 0.9,
        source: { identification: 'Stub' },
        links: [],
      },
      {
        id: 'b',
        category: 'plant',
        scientificName: 'Acer saccharinum',
        genus: 'Acer',
        family: 'Sapindaceae',
        taxonKeys: {},
        visualConfidence: 0.05,
        source: { identification: 'Stub' },
        links: [],
      },
    ],
  }),
};

describe('live providers', () => {
  it('enriches a candidate with GBIF, iNaturalist, Wikidata and Wikipedia', async () => {
    const providers = { ...createLiveProviders(readEnv()), identification: [stubPlantNet] };
    const result = await runIdentification(
      {
        observationId: 'live',
        category: 'plant',
        images: [
          { data: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg', feature: 'leaf' },
        ],
        location: { latitude: 46.24, longitude: -63.13 },
        capturedAt: new Date('2026-09-20T12:00:00Z'),
      },
      { providers },
    );
    if (process.env.LIVE_DUMP)
      (await import('node:fs')).writeFileSync(
        process.env.LIVE_DUMP,
        JSON.stringify(
          { ...result, candidates: result.candidates.map(({ referenceImages: _r, ...c }) => c) },
          null,
          2,
        ),
      );
    expect(result.sourceStatus.occurrence).toBe('ok');
    expect(result.candidates[0].taxonKeys.gbif).toBe(3189883);
    expect(result.candidates[0].occurrence?.radiusCounts[2].count).toBeGreaterThan(0);
    expect(result.sourceStatus.community).toBe('ok');
    expect(result.community?.nearbyCount).toBeGreaterThan(0);
    expect(result.speciesInfo?.summary?.source).toBe('Wikipedia');
  }, 60_000);
});
