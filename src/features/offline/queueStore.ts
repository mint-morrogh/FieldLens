/**
 * The offline queue: photos saved on this device while there was no signal, identified
 * automatically once back online (see processQueue). Stored in the same IndexedDB
 * database as the Field Journal, in its own object store.
 */
import type { IdentifyRequest } from '../../lib/api';
import { db } from '../history/historyStore';
import type { QueuedIdentification } from './queueTypes';

export type { QueuedIdentification } from './queueTypes';

/** Keeps storage use modest: 20 photos is a long walk without signal. */
export const QUEUE_LIMIT = 20;

export class QueueError extends Error {
  constructor(
    readonly reason: 'full' | 'storage',
    message: string,
  ) {
    super(message);
    this.name = 'QueueError';
  }
}

const listeners = new Set<() => void>();

/** Called whenever the queue changes (in this tab). */
export function subscribeQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function changed() {
  for (const listener of listeners) listener();
}

/**
 * Ids the open identification took back from the queue (the user retried on the error
 * screen). The queue processor skips them so the same photo isn't sent twice.
 */
const takenBySession = new Set<string>();

export function isTakenBySession(id: string): boolean {
  return takenBySession.has(id);
}

/** Queued photos the user retried by hand: if the retry fails too, they go back in the queue. */
const retriedFromQueue = new Set<string>();

/** True if this observation was taken out of the queue for a retry. */
export function wasQueued(id: string): boolean {
  return retriedFromQueue.has(id);
}

export function toQueued(
  request: IdentifyRequest,
  photo?: Blob,
  now = new Date(),
): QueuedIdentification {
  return {
    id: request.observationId,
    queuedAt: now.toISOString(),
    category: request.category,
    images: request.images.map((i) => ({ blob: i.blob, feature: i.feature })),
    photo,
    location: request.location
      ? { latitude: request.location.latitude, longitude: request.location.longitude }
      : undefined,
    locationSource: request.location ? request.locationSource : undefined,
    capturedAt: request.capturedAt.toISOString(),
    timeSource: request.timeSource,
    tilt: request.tilt,
    attempts: 0,
    status: 'waiting',
  };
}

export function toRequest(item: QueuedIdentification): IdentifyRequest {
  return {
    observationId: item.id,
    category: item.category,
    images: item.images,
    location: item.location,
    locationSource: item.location ? item.locationSource : undefined,
    capturedAt: new Date(item.capturedAt),
    timeSource: item.timeSource,
    tilt: item.tilt,
  };
}

function storageError(error: unknown): QueueError {
  const quota =
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
  return new QueueError(
    'storage',
    quota
      ? 'There isn’t enough storage on this device to save the photo.'
      : 'The photo couldn’t be saved on this device.',
  );
}

/** Adds (or replaces, for the same observation) a queued photo. Throws QueueError. */
export async function enqueue(item: QueuedIdentification): Promise<void> {
  try {
    const database = await db();
    const tx = database.transaction('queue', 'readwrite');
    const existing = await tx.store.get(item.id);
    if (!existing && (await tx.store.count()) >= QUEUE_LIMIT) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new QueueError(
        'full',
        `${QUEUE_LIMIT} photos are already waiting. Remove some, or wait for signal.`,
      );
    }
    await tx.store.put(item);
    await tx.done;
  } catch (error) {
    if (error instanceof QueueError) throw error;
    throw storageError(error);
  }
  takenBySession.delete(item.id);
  retriedFromQueue.delete(item.id);
  changed();
}

/** Oldest first. Never throws: an unreadable queue is shown as empty. */
export async function listQueued(): Promise<QueuedIdentification[]> {
  try {
    return await (await db()).getAllFromIndex('queue', 'byQueuedAt');
  } catch {
    return [];
  }
}

export async function getQueued(id: string): Promise<QueuedIdentification | undefined> {
  try {
    return await (await db()).get('queue', id);
  } catch {
    return undefined;
  }
}

export async function updateQueued(
  id: string,
  patch: Partial<Omit<QueuedIdentification, 'id'>>,
): Promise<void> {
  try {
    const database = await db();
    const tx = database.transaction('queue', 'readwrite');
    const item = await tx.store.get(id);
    if (item) await tx.store.put({ ...item, ...patch });
    await tx.done;
  } catch {
    /* best effort; the item is simply retried as it was */
  }
  changed();
}

/** Deletes a queued photo (and its position). */
export async function removeQueued(id: string): Promise<void> {
  try {
    await (await db()).delete('queue', id);
  } catch {
    /* already gone or storage unavailable */
  }
  changed();
}

/**
 * The open identification is being retried by the user: take it out of the queue so it
 * isn't identified twice. Synchronously marks it so a running processor skips it.
 */
export async function takeFromQueue(id: string): Promise<void> {
  takenBySession.add(id);
  if (!(await getQueued(id))) return;
  // Saved for later again in the meantime (the retry already failed): keep that copy.
  if (!takenBySession.has(id)) return;
  retriedFromQueue.add(id);
  await removeQueued(id);
}

/** Clears the in-memory bookkeeping (tests). */
export function resetQueueMemory() {
  takenBySession.clear();
  retriedFromQueue.clear();
}
