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

export const HISTORY_SCHEMA_VERSION = 1;

export type ObservationRecord = {
  id: string;
  schemaVersion: number;
  createdAt: string;
  category: OrganismCategory;
  thumbnail?: Blob;
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
}

const DB_NAME = 'fieldlens';
let dbPromise: Promise<IDBPDatabase<FieldLensDB>> | undefined;

function db() {
  dbPromise ??= openDB<FieldLensDB>(DB_NAME, 1, {
    upgrade(database) {
      const store = database.createObjectStore('observations', { keyPath: 'id' });
      store.createIndex('byCreatedAt', 'createdAt');
      store.createIndex('byScientificName', 'top.scientificName');
      store.createIndex('byCategory', 'category');
    },
  });
  return dbPromise;
}

export function stripLocation(result: IdentifyResponse): IdentifyResponse {
  return { ...result, location: { used: result.location.used, label: result.location.label } };
}

export function toRecord(
  id: string,
  result: IdentifyResponse,
  thumbnail: Blob | undefined,
  createdAt = new Date(),
): ObservationRecord {
  const top = result.candidates[0];
  return {
    id,
    schemaVersion: HISTORY_SCHEMA_VERSION,
    createdAt: createdAt.toISOString(),
    category: result.category,
    thumbnail,
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

export async function saveObservation(record: ObservationRecord): Promise<void> {
  await (await db()).put('observations', { ...record, result: stripLocation(record.result) });
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
  try {
    for (const key of Object.keys(localStorage))
      if (key.startsWith('fieldlens.')) localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}
