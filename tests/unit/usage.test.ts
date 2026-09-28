// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readEnv } from '../../server/lib/env';
import { UpstreamError, toApiError } from '../../server/lib/errors';
import { parseGradioEvents, quotaRetryIn } from '../../server/providers/bioclip/bioclipProvider';
import { getUsage, plantnetUsage } from '../../server/usage/usage';

describe('free quota usage', () => {
  it('reads Pl@ntNet’s daily count without spending an identification', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toContain('/v2/quota/daily?api-key=');
      return new Response(
        JSON.stringify({
          day: '2026-09-28',
          quota: { identify: { count: 84, total: 500, remaining: 416 } },
        }),
      );
    });
    const usage = await plantnetUsage('key', fetchImpl as unknown as typeof fetch);
    expect(usage).toEqual({ day: '2026-09-28', used: 84, limit: 500, remaining: 416 });
  });

  it('reports nothing to use up in demo mode', async () => {
    const usage = await getUsage(readEnv({ USE_MOCK_API: 'true' }));
    expect(usage.mock).toBe(true);
    expect(usage.plantnet).toBeUndefined();
    expect(usage.bioclip).toBeUndefined();
  });
});

describe('quota errors', () => {
  it('turns a ZeroGPU quota error into a clear "try later" message', () => {
    const sse =
      'event: error\ndata: "You have exceeded your GPU quota (60s requested vs. 12s left). Try again in 2:05:11"\n\n';
    let caught: unknown;
    try {
      parseGradioEvents(sse);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(UpstreamError);
    expect((caught as UpstreamError).status).toBe(429);
    const api = toApiError(caught);
    expect(api.code).toBe('provider_quota_exhausted');
    expect(api.message).toContain('free identification time');
    expect(api.message).toContain('2 h 5 min');
  });

  it('other Space errors are not mistaken for a quota', () => {
    expect(() => parseGradioEvents('event: error\ndata: null\n\n')).toThrow(
      expect.objectContaining({ status: 500 }),
    );
  });

  it('names Pl@ntNet’s daily limit and never suggests a fallback', () => {
    const api = toApiError(new UpstreamError('Pl@ntNet', 'http', 429));
    expect(api.code).toBe('provider_quota_exhausted');
    expect(api.message).toMatch(/free plant identifications/);
    expect(api.message).toMatch(/midnight UTC/);
  });

  it('formats retry times', () => {
    expect(quotaRetryIn('Try again in 45:10')).toBe('45 min');
    expect(quotaRetryIn('retry in 1:00:40')).toBe('1 h 1 min');
    expect(quotaRetryIn('no time given')).toBeUndefined();
  });
});
