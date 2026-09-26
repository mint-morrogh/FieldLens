import { createMockProviders } from '../../server/providers/mock/mockProviders';
import { runIdentification } from '../../server/identify/pipeline';
import type { IdentifyResponse } from '../../shared/types';

/** Build realistic responses by running the real pipeline against mock providers. */
export async function mockResult(
  scenario: 'high' | 'medium' | 'low' | 'zero' | 'gbif-down' | 'inat-down',
  withLocation = true,
): Promise<IdentifyResponse> {
  return runIdentification(
    {
      observationId: 'o',
      category: 'plant',
      images: [
        { data: new Uint8Array([0xff, 0xd8, 0xff]), mimeType: 'image/jpeg', feature: 'leaf' },
      ],
      location: withLocation ? { latitude: 46.24, longitude: -63.13 } : undefined,
      capturedAt: new Date('2026-09-20T12:00:00Z'),
    },
    { providers: createMockProviders(scenario) },
  );
}
