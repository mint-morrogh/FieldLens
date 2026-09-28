import { openDB } from 'idb';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IdentifyResponse } from '../../shared/types';
import {
  clearAllLocalData,
  getObservation,
  listObservations,
} from '../../src/features/history/historyStore';
import {
  MAX_ATTEMPTS,
  backoffDelay,
  nextDueAt,
  processQueue,
  type QueueDeps,
} from '../../src/features/offline/processQueue';
import {
  QUEUE_LIMIT,
  QueueError,
  enqueue,
  getQueued,
  listQueued,
  removeQueued,
  resetQueueMemory,
  takeFromQueue,
  toQueued,
  toRequest,
  wasQueued,
  type QueuedIdentification,
} from '../../src/features/offline/queueStore';
import { ClientError, type IdentifyRequest } from '../../src/lib/api';
import { mockResult } from '../component/fixtures';

function request(id: string, overrides: Partial<IdentifyRequest> = {}): IdentifyRequest {
  return {
    observationId: id,
    category: 'plant',
    images: [{ blob: new Blob(['jpeg'], { type: 'image/jpeg' }), feature: 'leaf' }],
    location: { latitude: 46.24, longitude: -63.13 },
    capturedAt: new Date('2026-09-20T15:30:00Z'),
    timeSource: 'device',
    tilt: 'down',
    ...overrides,
  };
}

async function queue(id: string, patch: Partial<QueuedIdentification> = {}, at = 0) {
  await enqueue({
    ...toQueued(request(id), undefined, new Date(Date.UTC(2026, 8, 20, 16, 0, at))),
    ...patch,
  });
}

async function clearQueue() {
  for (const item of await listQueued()) await removeQueued(item.id);
}

let high: IdentifyResponse;
let zero: IdentifyResponse;

// Runs before anything opens the database: a v1 database from an older version of the app.
beforeAll(async () => {
  const v1 = await openDB('fieldlens', 1, {
    upgrade(d) {
      const store = d.createObjectStore('observations', { keyPath: 'id' });
      store.createIndex('byCreatedAt', 'createdAt');
      store.createIndex('byScientificName', 'top.scientificName');
      store.createIndex('byCategory', 'category');
    },
  });
  high = await mockResult('high');
  zero = await mockResult('zero');
  await v1.put('observations', {
    id: 'old',
    schemaVersion: 1,
    createdAt: '2025-05-01T00:00:00.000Z',
    category: 'plant',
    imagesCount: 1,
    result: high,
  });
  v1.close();
});

beforeEach(async () => {
  resetQueueMemory();
  await clearQueue();
});

describe('database upgrade', () => {
  it('adds the queue store and keeps existing observations', async () => {
    await queue('q1');
    expect((await listQueued()).map((i) => i.id)).toEqual(['q1']);
    expect((await getObservation('old'))?.createdAt).toBe('2025-05-01T00:00:00.000Z');
  });
});

describe('queue store', () => {
  it('round-trips a request with only the ~1 km position the request uses', async () => {
    const item = toQueued(request('a', { locationSource: 'photo' }));
    expect(item.location).toEqual({ latitude: 46.24, longitude: -63.13 });
    const back = toRequest(item);
    expect(back.observationId).toBe('a');
    expect(back.capturedAt.toISOString()).toBe('2026-09-20T15:30:00.000Z');
    expect(back.timeSource).toBe('device');
    expect(back.tilt).toBe('down');
    expect(back.locationSource).toBe('photo');
    expect(back.images[0].feature).toBe('leaf');
    expect(toRequest(toQueued(request('b', { location: undefined }))).location).toBeUndefined();
  });

  it('stores blobs and lists oldest first', async () => {
    await queue('b', {}, 2);
    await queue('a', {}, 1);
    const items = await listQueued();
    expect(items.map((i) => i.id)).toEqual(['a', 'b']);
    // (jsdom's Blob doesn't survive fake-indexeddb's structured clone intact; browsers keep it.)
    expect(items[0].images[0].blob).toBeDefined();
    expect(items[0].images[0].feature).toBe('leaf');
    expect(items[0].status).toBe('waiting');
  });

  it(`caps the queue at ${QUEUE_LIMIT} photos, but replacing one is fine`, async () => {
    for (let i = 0; i < QUEUE_LIMIT; i++) await queue(`p${i}`, {}, i);
    await expect(queue('extra')).rejects.toMatchObject({ reason: 'full' });
    await expect(queue('extra')).rejects.toBeInstanceOf(QueueError);
    await queue('p3'); // same observation again
    expect(await listQueued()).toHaveLength(QUEUE_LIMIT);
  });

  it('a retry by hand takes the photo out, and remembers it was queued', async () => {
    await queue('r');
    await takeFromQueue('r');
    expect(await getQueued('r')).toBeUndefined();
    expect(wasQueued('r')).toBe(true);
    await takeFromQueue('never-queued');
    expect(wasQueued('never-queued')).toBe(false);
  });

  it('clearing all local data empties the queue', async () => {
    await queue('c');
    await clearAllLocalData();
    expect(await listQueued()).toEqual([]);
  });
});

describe('processing', () => {
  function deps(identify: QueueDeps['identify'], overrides: Partial<QueueDeps> = {}) {
    return {
      identify: vi.fn(identify),
      save: vi.fn(async () => true),
      onIdentified: vi.fn(),
      isOnline: () => true,
      now: () => 1_000_000,
      ...overrides,
    } satisfies QueueDeps;
  }

  it('identifies each photo in order, saves it, then removes it', async () => {
    await queue('one', {}, 1);
    await queue('two', {}, 2);
    const d = deps(async () => high);
    const summary = await processQueue(d);
    expect(summary).toEqual({ identified: 2, failed: 0, offline: false });
    expect(d.identify.mock.calls.map(([r]) => r.observationId)).toEqual(['one', 'two']);
    expect(d.identify.mock.calls[0][0].location).toEqual({ latitude: 46.24, longitude: -63.13 });
    expect(d.save).toHaveBeenCalledTimes(2);
    expect(d.onIdentified).toHaveBeenCalledTimes(2);
    expect(await listQueued()).toEqual([]);
  });

  it('saves to the Field Journal like a normal identification', async () => {
    await queue('journal');
    const { saveQueuedResult } = await import('../../src/features/offline/runQueue');
    await processQueue(deps(async () => high, { save: saveQueuedResult }));
    const saved = (await listObservations()).find((r) => r.id === 'journal');
    expect(saved?.top?.scientificName).toBe('Acer rubrum');
    expect(saved?.createdAt).toBe('2026-09-20T15:30:00.000Z');
    expect(JSON.stringify(saved)).not.toContain('46.24');
  });

  it('does nothing while offline', async () => {
    await queue('x');
    const d = deps(async () => high, { isOnline: () => false });
    expect((await processQueue(d)).offline).toBe(true);
    expect(d.identify).not.toHaveBeenCalled();
  });

  it('stops without counting an attempt when the connection drops again', async () => {
    await queue('a', {}, 1);
    await queue('b', {}, 2);
    const d = deps(async () => {
      throw new ClientError('offline', 'You’re offline.');
    });
    expect((await processQueue(d)).offline).toBe(true);
    expect(d.identify).toHaveBeenCalledTimes(1);
    expect((await getQueued('a'))?.attempts).toBe(0);
  });

  it('backs off after a network error and skips it until due', async () => {
    await queue('n');
    const d = deps(async () => {
      throw new ClientError('network', 'We couldn’t reach FieldLens.');
    });
    await processQueue(d);
    const item = await getQueued('n');
    expect(item?.attempts).toBe(1);
    expect(item?.nextAttemptAt).toBe(1_000_000 + backoffDelay(1));
    expect(item?.status).toBe('waiting');

    const later = deps(async () => high);
    await processQueue(later);
    expect(later.identify).not.toHaveBeenCalled();
    expect(nextDueAt(await listQueued())).toBe(1_000_000 + backoffDelay(1));
    // "Try now" ignores the backoff.
    await processQueue(later, { force: true });
    expect(later.identify).toHaveBeenCalledTimes(1);
    expect(await getQueued('n')).toBeUndefined();
  });

  it('grows the backoff and respects Retry-After', () => {
    expect(backoffDelay(1)).toBe(30_000);
    expect(backoffDelay(2)).toBe(60_000);
    expect(backoffDelay(20)).toBe(30 * 60_000);
    expect(backoffDelay(1, 300)).toBe(300_000);
  });

  it('marks a photo failed when trying again cannot help', async () => {
    await queue('bad');
    await processQueue(
      deps(async () => {
        throw new ClientError('invalid_file', 'That photo couldn’t be read.');
      }),
    );
    expect(await getQueued('bad')).toMatchObject({
      status: 'failed',
      error: 'That photo couldn’t be read.',
    });
  });

  it('gives up after repeated service errors', async () => {
    await queue('busy', { attempts: MAX_ATTEMPTS - 1 });
    await processQueue(
      deps(async () => {
        throw new ClientError('provider_unavailable', 'Unavailable.');
      }),
    );
    expect((await getQueued('busy'))?.status).toBe('failed');
  });

  it('keeps a photo with no match for the user to see', async () => {
    await queue('none');
    const d = deps(async () => zero);
    expect((await processQueue(d)).failed).toBe(1);
    expect(d.save).not.toHaveBeenCalled();
    expect((await getQueued('none'))?.status).toBe('failed');
  });

  it('keeps the photo if the result could not be saved', async () => {
    await queue('keep');
    await processQueue(deps(async () => high, { save: vi.fn(async () => false) }));
    expect((await getQueued('keep'))?.nextAttemptAt).toBeGreaterThan(1_000_000);
  });

  it('skips a photo the user is retrying by hand, and shares one run', async () => {
    await queue('mine', {}, 1);
    await queue('other', {}, 2);
    void takeFromQueue('mine');
    const d = deps(async () => high);
    const [a, b] = await Promise.all([processQueue(d), processQueue(d)]);
    expect(a).toBe(b);
    expect(d.identify.mock.calls.map(([r]) => r.observationId)).toEqual(['other']);
  });
});
