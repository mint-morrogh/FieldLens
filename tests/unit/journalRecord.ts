import type { ObservationRecord } from '../../src/features/history/historyStore';

let n = 0;

/** A saved find for journal tests. `at` is a local date; the band defaults to high. */
export function find(
  scientificName: string,
  at: Date,
  over: Partial<ObservationRecord> & {
    band?: 'high' | 'medium' | 'low';
    family?: string;
    commonName?: string;
  } = {},
): ObservationRecord {
  n++;
  const { band = 'high', family, commonName, ...rest } = over;
  return {
    id: `f${n}`,
    schemaVersion: 1,
    createdAt: at.toISOString(),
    category: 'plant',
    top: { scientificName, commonName, finalConfidence: 0.9, band },
    imagesCount: 1,
    result: (family
      ? { candidates: [{ genus: scientificName.split(' ')[0], family }] }
      : {}) as ObservationRecord['result'],
    ...rest,
  };
}
