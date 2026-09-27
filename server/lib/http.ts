import { UpstreamError } from './errors.js';

export const USER_AGENT = 'FieldLens/1.0 (+https://github.com/mint-morrogh/FieldLens)';

export type FetchJsonOptions = {
  service: string;
  timeoutMs: number;
  init?: RequestInit;
  fetchImpl?: typeof fetch;
};

/** fetch + timeout + JSON parse, mapping every failure to an UpstreamError. */
export async function fetchJson<T = unknown>(url: string, options: FetchJsonOptions): Promise<T> {
  const { service, timeoutMs, init, fetchImpl = fetch } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        // Node's fetch sends "Accept-Language: *", which makes GBIF omit common names.
        'Accept-Language': 'en',
        'User-Agent': USER_AGENT,
        ...init?.headers,
      },
    });
  } catch (error) {
    clearTimeout(timer);
    const aborted =
      controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
    throw new UpstreamError(service, aborted ? 'timeout' : 'network');
  }
  try {
    if (!response.ok) {
      // Drain the body so the connection can be reused; never surface its contents.
      await response.text().catch(() => undefined);
      throw new UpstreamError(service, 'http', response.status);
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new UpstreamError(service, 'parse', response.status);
    }
  } finally {
    clearTimeout(timer);
  }
}

/** Run a promise but resolve to `undefined` (instead of throwing) if it fails. */
export async function settle<T>(
  promise: Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await promise };
  } catch (error) {
    return { ok: false, error };
  }
}
