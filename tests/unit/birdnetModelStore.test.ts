// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = { 'model.json': '{"m":1}', 'group1-shard1of1.bin': 'weights' };
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

vi.mock('../../src/features/listen/birdnet/manifest', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/features/listen/birdnet/manifest')>();
  const list = Object.entries(files).map(([path, body]) => ({
    path,
    bytes: body.length,
    sha256: sha(body),
  }));
  return {
    ...real,
    BIRDNET_SOURCE_URL: 'https://models.example/birdnet/',
    BIRDNET_FILES: list,
    BIRDNET_TOTAL_BYTES: list.reduce((n, f) => n + f.bytes, 0),
  };
});

/** Just enough Cache Storage for the store. */
function fakeCaches() {
  const buckets = new Map<string, Map<string, Response>>();
  return {
    buckets,
    open: async (name: string) => {
      const bucket = buckets.get(name) ?? new Map<string, Response>();
      buckets.set(name, bucket);
      return {
        match: async (key: string) => bucket.get(key)?.clone(),
        put: async (key: string, res: Response) => void bucket.set(key, res),
      };
    },
    delete: async (name: string) => buckets.delete(name),
  };
}

let store: typeof import('../../src/features/listen/birdnet/modelStore');
let manifest: typeof import('../../src/features/listen/birdnet/manifest');
let caches: ReturnType<typeof fakeCaches>;
let workers = 0;

beforeEach(async () => {
  vi.resetModules();
  caches = fakeCaches();
  vi.stubGlobal('caches', caches);
  workers = 0;
  vi.stubGlobal(
    'Worker',
    class {
      onmessage = null;
      onerror = null;
      constructor() {
        workers++;
      }
      postMessage() {}
      terminate() {}
    },
  );
  store = await import('../../src/features/listen/birdnet/modelStore');
  manifest = await import('../../src/features/listen/birdnet/manifest');
});

const serve = (overrides: Record<string, string> = {}) =>
  vi.fn(async (url: string | URL | Request) => {
    const path = String(url).replace('https://models.example/birdnet/', '');
    const body = overrides[path] ?? files[path as keyof typeof files];
    return body === undefined ? new Response('', { status: 404 }) : new Response(body);
  }) as unknown as typeof fetch;

describe('on-device model store', () => {
  it('downloads, verifies and caches every file with the licence, then reports ready', async () => {
    expect((await store.refreshModelState()).status).toBe('absent');
    const fetchImpl = serve();
    await store.downloadModel(fetchImpl);
    expect(store.getModelState()).toMatchObject({ status: 'ready', loaded: 14, total: 14 });
    const bucket = caches.buckets.get(manifest.BIRDNET_CACHE)!;
    const keys = [...bucket.keys()].map((k) => new URL(k).pathname);
    expect(keys).toEqual([
      '/models/birdnet-v2.4/model.json',
      '/models/birdnet-v2.4/group1-shard1of1.bin',
      '/models/birdnet-v2.4/LICENSE.txt',
      '/models/birdnet-v2.4/complete.json',
    ]);
    expect(await bucket.get(manifest.cacheKey('LICENSE.txt'))!.clone().text()).toContain(
      'CC BY-NC-SA 4.0',
    );
    expect(await store.isModelReady()).toBe(true);
    // The worker is started once while online, so it's cached for offline use.
    expect(workers).toBe(1);

    await store.removeModel();
    expect(caches.buckets.has(manifest.BIRDNET_CACHE)).toBe(false);
    expect(store.getModelState().status).toBe('absent');
  });

  it('refuses a file that doesn’t match its checksum, and resumes on retry', async () => {
    await store.downloadModel(serve({ 'group1-shard1of1.bin': 'tampere' }));
    expect(store.getModelState()).toMatchObject({ status: 'error' });
    expect(store.getModelState().error).toMatch(/checksum/);
    expect(await store.isModelReady()).toBe(false);

    const fetchImpl = serve();
    await store.downloadModel(fetchImpl);
    expect(store.getModelState().status).toBe('ready');
    // model.json was already verified and cached: only the shard is fetched again.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
