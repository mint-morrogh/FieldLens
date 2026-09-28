/**
 * Local observation history in IndexedDB. Designed to grow into a personal
 * field guide (life list, first/last seen, favorites, collections), so records
 * are versioned and indexed by taxon as well as time.
 *
 * Privacy: exact and approximate coordinates are removed before saving; only a
 * coarse (~11 km) label is kept.
 */
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ConfidenceBand, IdentifyResponse, OrganismCategory } from '../../../shared/types';
import { reloadSettings } from '../../lib/settings';
import type { Guess } from '../journal/fieldSkills';
import type { QueuedIdentification } from '../offline/queueTypes';

export const HISTORY_SCHEMA_VERSION = 1;

export type ObservationRecord = {
  id: string;
  schemaVersion: number;
  createdAt: string;
  category: OrganismCategory;
  thumbnail?: Blob;
  /** Higher-quality copy (≤2048 px, EXIF-free) for the full-screen viewer. */
  photo?: Blob;
  top?: {
    scientificName: string;
    commonName?: string;
    finalConfidence: number;
    band: ConfidenceBand;
    gbifKey?: number;
  };
  imagesCount: number;
  locationLabel?: string;
  /** Snapshot of the result for re-display, with coordinates stripped. */
  result: IdentifyResponse;
  /** "Name it first": what was guessed before the result was shown, and how it compared. */
  guess?: Guess;
  /** An added photo turned an uncertain identification into a confident one. */
  sharpEye?: true;
  // Reserved for the personal field guide: favorites, collections, notes.
  favorite?: boolean;
  collections?: string[];
  notes?: string;
};

interface FieldLensDB extends DBSchema {
  observations: {
    key: string;
    value: ObservationRecord;
    indexes: { byCreatedAt: string; byScientificName: string; byCategory: string };
  };
  /** Photos saved without signal, waiting to be identified (v2). See features/offline. */
  queue: {
    key: string;
    value: QueuedIdentification;
    indexes: { byQueuedAt: string };
  };
}

const DB_NAME = 'fieldlens';
/** 1: observations. 2: the offline queue (existing observations are untouched). */
const DB_VERSION = 2;
let dbPromise: Promise<IDBPDatabase<FieldLensDB>> | undefined;

export function db() {
  dbPromise ??= openDB<FieldLensDB>(DB_NAME, DB_VERSION, {
    upgrade(database, oldVersion) {
      if (oldVersion < 1) {
        const store = database.createObjectStore('observations', { keyPath: 'id' });
        store.createIndex('byCreatedAt', 'createdAt');
        store.createIndex('byScientificName', 'top.scientificName');
        store.createIndex('byCategory', 'category');
      }
      if (oldVersion < 2) {
        const queue = database.createObjectStore('queue', { keyPath: 'id' });
        queue.createIndex('byQueuedAt', 'queuedAt');
      }
    },
    // Another tab opened a newer version: close so its upgrade isn't blocked.
    blocking() {
      void dbPromise?.then((d) => d.close());
      dbPromise = undefined;
    },
  });
  return dbPromise;
}

export function stripLocation(result: IdentifyResponse): IdentifyResponse {
  return {
    ...result,
    location: {
      used: result.location.used,
      label: result.location.label,
      source: result.location.source,
    },
  };
}

export function toRecord(
  id: string,
  result: IdentifyResponse,
  thumbnail: Blob | undefined,
  createdAt = new Date(),
  photo?: Blob,
): ObservationRecord {
  const top = result.candidates[0];
  return {
    id,
    schemaVersion: HISTORY_SCHEMA_VERSION,
    createdAt: createdAt.toISOString(),
    category: result.category,
    thumbnail,
    photo,
    top: top
      ? {
          scientificName: top.scientificName,
          commonName: top.commonName,
          finalConfidence: top.finalConfidence,
          band: result.confidenceBand,
          gbifKey: top.taxonKeys.gbif,
        }
      : undefined,
    imagesCount: result.imagesSubmitted,
    locationLabel: result.location.label,
    result: stripLocation(result),
  };
}

type Extras = Pick<ObservationRecord, 'guess' | 'sharpEye'>;
/**
 * Guesses and sharp-eye marks made this session, by observation. Every later save of the same
 * observation (the thumbnail pass, a follow-up photo) keeps them.
 */
const extrasById = new Map<string, Extras>();

export async function saveObservation(record: ObservationRecord): Promise<void> {
  await (
    await db()
  ).put('observations', {
    ...record,
    ...extrasById.get(record.id),
    result: stripLocation(record.result),
  });
}

export async function listObservations(limit?: number): Promise<ObservationRecord[]> {
  const database = await db();
  const out: ObservationRecord[] = [];
  let cursor = await database
    .transaction('observations')
    .store.index('byCreatedAt')
    .openCursor(null, 'prev');
  while (cursor && (limit === undefined || out.length < limit)) {
    out.push(cursor.value);
    cursor = await cursor.continue();
  }
  return out;
}

/** Merge fields into a saved observation (no-op when it isn't saved). */
export async function patchObservation(id: string, patch: Extras): Promise<void> {
  extrasById.set(id, { ...extrasById.get(id), ...patch });
  const database = await db();
  const tx = database.transaction('observations', 'readwrite');
  const record = await tx.store.get(id);
  if (record) await tx.store.put({ ...record, ...patch });
  await tx.done;
}

export async function getObservation(id: string): Promise<ObservationRecord | undefined> {
  return (await db()).get('observations', id);
}

export async function deleteObservation(id: string): Promise<void> {
  await (await db()).delete('observations', id);
}

export async function clearObservations(): Promise<void> {
  await (await db()).clear('observations');
}

/** Removes every piece of FieldLens data stored in this browser. */
export async function clearAllLocalData(): Promise<void> {
  await clearObservations().catch(() => undefined);
  // Photos waiting for signal, with their ~1 km positions.
  await db()
    .then((d) => d.clear('queue'))
    .catch(() => undefined);
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith('fieldlens.')) localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
  // Settings are fieldlens.* keys too: back to their defaults.
  reloadSettings();
}
