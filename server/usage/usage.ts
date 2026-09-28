import type { UsageResponse } from '../../shared/usage.js';
import type { ServerEnv } from '../lib/env.js';
import { USER_AGENT } from '../lib/http.js';

/**
 * Free-quota status for the Settings page. Pl@ntNet reports the day's count through
 * /v2/quota/daily (which doesn't use up an identification); Hugging Face doesn't report
 * ZeroGPU usage, so for BioCLIP we can only say when a request hit the limit.
 */
const PLANTNET_QUOTA_URL = 'https://my-api.plantnet.org/v2/quota/daily';
const CACHE_MS = 60_000;
export const BIOCLIP_ALLOWANCE = 'Free Hugging Face ZeroGPU allowance (a few minutes of GPU a day)';

let cache: { at: number; value: UsageResponse['plantnet'] } | undefined;
/** Last BioCLIP quota error seen by this server instance. */
let bioclipQuota: { at: string; retryIn?: string } | undefined;

export function noteBioclipQuotaReached(retryIn?: string) {
  bioclipQuota = { at: new Date().toISOString(), retryIn };
}

/** A quota note older than a day is stale: ZeroGPU quotas reset daily. */
function recentBioclipQuota() {
  if (!bioclipQuota) return undefined;
  return Date.now() - Date.parse(bioclipQuota.at) < 24 * 3600_000 ? bioclipQuota : undefined;
}

type PlantNetDaily = {
  day?: string;
  quota?: { identify?: { count?: number; total?: number; remaining?: number } };
};

export async function plantnetUsage(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UsageResponse['plantnet']> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const res = await fetchImpl(`${PLANTNET_QUOTA_URL}?api-key=${encodeURIComponent(apiKey)}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) return undefined;
  const body = (await res.json()) as PlantNetDaily;
  const q = body.quota?.identify;
  if (!q || typeof q.total !== 'number') return undefined;
  const used = q.count ?? q.total - (q.remaining ?? q.total);
  const value = {
    day: body.day ?? new Date().toISOString().slice(0, 10),
    used,
    limit: q.total,
    remaining: q.remaining ?? Math.max(0, q.total - used),
  };
  cache = { at: Date.now(), value };
  return value;
}

export async function getUsage(
  env: ServerEnv,
  fetchImpl: typeof fetch = fetch,
): Promise<UsageResponse> {
  const quota = recentBioclipQuota();
  return {
    checkedAt: new Date().toISOString(),
    mock: env.useMockApi,
    plantnet:
      env.useMockApi || !env.plantnetApiKey
        ? undefined
        : await plantnetUsage(env.plantnetApiKey, fetchImpl).catch(() => undefined),
    bioclip:
      env.useMockApi || !env.bioclipSpaceUrl
        ? undefined
        : {
            allowance: BIOCLIP_ALLOWANCE,
            quotaReachedAt: quota?.at,
            retryIn: quota?.retryIn,
          },
  };
}
