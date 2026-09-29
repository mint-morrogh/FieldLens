// @vitest-environment node
import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const files = {
  'model.json': '{"m":1}',
  'group1-shard1of1.bin': 'weights',
  'mdata/model.json': '{"g":1}',
};
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
    BIRDNET_LOCATION_URL: 'https://location.example/v2.4/',
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
        keys: async () => [...bucket.keys()].map((url) => new Request(url)),
        delete: async (req: Request) => bucket.delete(req.url),
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
    // The location model comes from its own host; everything else from the main source.
    const u = String(url);
    const path = u.startsWith('https://location.example/v2.4/mdata/')
      ? u.replace('https://location.example/v2.4/', '')
      : u.startsWith('https://models.example/birdnet/') && !u.includes('/mdata/')
        ? u.replace('https://models.example/birdnet/', '')
        : 'wrong-host';
    const body = overrides[path] ?? files[path as keyof typeof files];
    return body === undefined ? new Response('', { status: 404 }) : new Response(body);
  }) as unknown as typeof fetch;

describe('on-device model store', () => {
  it('downloads, verifies and caches every file with the licence, then reports ready', async () => {
    expect((await store.refreshModelState()).status).toBe('absent');
    const fetchImpl = serve();
    await store.downloadModel(fetchImpl);
    expect(store.getModelState()).toMatchObject({ status: 'ready', loaded: 21, total: 21 });
    const bucket = caches.buckets.get(manifest.BIRDNET_CACHE)!;
    const keys = [...bucket.keys()].map((k) => new URL(k).pathname);
    expect(keys).toEqual([
      '/models/birdnet-v2.4/model.json',
      '/models/birdnet-v2.4/group1-shard1of1.bin',
      '/models/birdnet-v2.4/mdata/model.json',
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
    // model.json was already verified and cached: only the shard (then the location model,
    // which the failed attempt never reached) is fetched.
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(fetchImpl).mock.calls[0][0])).toContain('group1-shard1of1.bin');
  });

  it('updates an older download by fetching only the new files, then drops the old ones', async () => {
    // A download from before revisions: its marker has no revision, and it holds the old
    // location model instead of mdata/.
    const bucket = await caches.open(manifest.BIRDNET_CACHE);
    for (const path of ['model.json', 'group1-shard1of1.bin'] as const)
      await bucket.put(manifest.cacheKey(path), new Response(files[path]));
    await bucket.put(manifest.cacheKey('area-model/model.json'), new Response('old'));
    await bucket.put(manifest.cacheKey('complete.json'), Response.json({ version: 'v2.4' }));

    expect(await store.isModelReady()).toBe(false);
    expect(await store.refreshModelState()).toMatchObject({
      status: 'absent',
      update: { bytes: files['mdata/model.json'].length },
    });

    const fetchImpl = serve();
    await store.downloadModel(fetchImpl);
    expect(store.getModelState()).toMatchObject({ status: 'ready', update: undefined });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(fetchImpl).mock.calls[0][0])).toBe(
      'https://location.example/v2.4/mdata/model.json',
    );
    const keys = [...caches.buckets.get(manifest.BIRDNET_CACHE)!.keys()].map(
      (k) => new URL(k).pathname,
    );
    expect(keys).not.toContain('/models/birdnet-v2.4/area-model/model.json');
    const marker = await caches.buckets
      .get(manifest.BIRDNET_CACHE)!
      .get(manifest.cacheKey('complete.json'))!
      .clone()
      .json();
    expect(marker.revision).toBe(manifest.BIRDNET_MODEL_REVISION);
    expect(await store.isModelReady()).toBe(true);
  });
});
