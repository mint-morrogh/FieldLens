import { useEffect, useState } from 'react';
import { coarseLocation, getNearbyFamilyCounts } from '../../lib/nearby';
import type { ObservationRecord } from '../history/historyStore';
import { useLocationState } from '../location/LocationContext';
import type { FamilyTree } from './journal';
import { nearbyLocation, nearbyTaxa, toNearbyCounts, type NearbyCounts } from './nearby';

/**
 * "Recorded near you" counts for the journal's families, fetched in the background.
 * Undefined until they arrive, or for good when offline / no location is known.
 */
export function useNearbyFamilyCounts(
  trees: FamilyTree[],
  records: ObservationRecord[] | undefined,
): NearbyCounts | undefined {
  const { location: device } = useLocationState();
  const found = nearbyLocation(device, records);
  const location = found && coarseLocation(found);
  const lat = location?.latitude;
  const lon = location?.longitude;
  // Stable strings, so re-renders with the same families and cell don't refetch.
  const taxaJson = JSON.stringify(nearbyTaxa(trees));
  const key = `${lat},${lon}:${taxaJson}`;
  const [result, setResult] = useState<{ key: string; counts?: NearbyCounts }>();

  useEffect(() => {
    const taxa = JSON.parse(taxaJson) as ReturnType<typeof nearbyTaxa>;
    if (lat === undefined || lon === undefined || taxa.length === 0) return;
    let cancelled = false;
    void getNearbyFamilyCounts({ latitude: lat, longitude: lon }, taxa).then((res) => {
      if (!cancelled) setResult({ key, counts: toNearbyCounts(res) });
    });
    return () => {
      cancelled = true;
    };
  }, [key, lat, lon, taxaJson]);

  return result?.key === key ? result.counts : undefined;
}
