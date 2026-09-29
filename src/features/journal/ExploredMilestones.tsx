import { useEffect, useMemo, useState } from 'react';
import { Card } from '../../components/ui';
import { formatDate } from '../../lib/format';
import { useAreaSize } from '../../lib/units';
import type { ObservationRecord } from '../history/historyStore';
import {
  areaMilestones,
  countryMilestones,
  exploredAreas,
  exploredCountries,
  exploredRegions,
  regionMilestones,
  regionNames,
  type CountryLookup,
  type MilestoneProgress,
  type RegionLookup,
} from './areas';

/** Region names shown before "and N more". */
const MAX_REGION_NAMES = 12;

/** A row of milestone marks: filled once reached, outlined while still ahead. */
function MilestoneTrack({ progress, unit }: { progress: MilestoneProgress; unit: string }) {
  return (
    <ol className="mt-2 flex items-center gap-1" aria-label={`${unit} milestones`}>
      {progress.milestones.map((m, i) => (
        <li key={m.need} className="flex flex-1 items-center gap-1">
          {i > 0 && (
            <span
              className={`h-0.5 flex-1 rounded-full ${m.reachedAt ? 'bg-moss' : 'bg-paper-deep'}`}
              aria-hidden
            />
          )}
          <span
            className={`flex h-7 min-w-7 items-center justify-center rounded-full border-2 px-1 text-[0.7rem] font-bold tabular-nums ${
              m.reachedAt
                ? 'border-moss bg-moss text-on-accent'
                : 'border-dashed border-line text-ink-muted'
            }`}
            title={m.reachedAt ? `Reached ${formatDate(m.reachedAt)}` : undefined}
          >
            {m.need}
            <span className="sr-only">
              {m.reachedAt
                ? ` ${unit}: reached ${formatDate(m.reachedAt)}`
                : ` ${unit}: not reached yet`}
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function nextLine(p: MilestoneProgress, one: string, many: string): string {
  if (!p.next) return 'Every milestone reached';
  const left = p.next - p.count;
  return `${left} more to ${p.next} ${p.next === 1 ? one : many}`;
}

/**
 * Areas explored (~10 km cells with a confident find), countries, and provinces & states,
 * with milestones. Sits under the journal globe. Countries and regions come from offline
 * outline lookups, loaded on demand (the region outlines are a separate download; the
 * line stays hidden if it can't be fetched); nothing leaves the device.
 */
export function ExploredMilestones({ records }: { records: ObservationRecord[] }) {
  const areas = useMemo(() => exploredAreas(records), [records]);
  const areaSize = useAreaSize();
  const progress = useMemo(() => areaMilestones(areas), [areas]);
  const [countryOf, setCountryOf] = useState<CountryLookup>();
  const [regionOf, setRegionOf] = useState<RegionLookup>();
  const hasAreas = areas.length > 0;
  useEffect(() => {
    if (!hasAreas) return;
    let live = true;
    import('./countries')
      .then((m) => live && setCountryOf(() => m.countryOf))
      .catch(() => undefined);
    import('./regions')
      .then((m) => m.loadRegionOf())
      .then((lookup) => live && setRegionOf(() => lookup))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [hasAreas]);
  const countries = useMemo(
    () => (countryOf ? exploredCountries(areas, countryOf) : undefined),
    [areas, countryOf],
  );
  const countryProgress = countries && countryMilestones(countries);
  const regions = useMemo(
    () => (regionOf ? exploredRegions(areas, regionOf) : undefined),
    [areas, regionOf],
  );
  const regionProgress = regions && regionMilestones(regions);
  const names = regions ? regionNames(regions) : [];
  const newest = regions?.at(-1);

  return (
    <Card as="section" aria-labelledby="areas-title" data-testid="explored-milestones">
      <p className="readout text-[0.7rem] font-semibold text-ink-muted">Areas explored</p>
      <h2 id="areas-title" className="text-lg font-bold">
        <span className="tabular-nums">{progress.count}</span>{' '}
        {progress.count === 1 ? 'area' : 'areas'}
        <span className="font-normal text-ink-muted"> · about {areaSize} each</span>
      </h2>
      <MilestoneTrack progress={progress} unit="Areas" />
      <p className="mt-1.5 text-sm text-ink-muted">{nextLine(progress, 'area', 'areas')}</p>

      {countries && countryProgress && countries.length > 0 && (
        <div className="mt-4 border-t border-line pt-3" data-testid="explored-countries">
          <p className="font-bold">
            <span className="tabular-nums">{countries.length}</span>{' '}
            {countries.length === 1 ? 'country' : 'countries'}
          </p>
          <p className="text-sm text-ink-soft">{countries.map((c) => c.name).join(', ')}</p>
          <MilestoneTrack progress={countryProgress} unit="Countries" />
          <p className="mt-1.5 text-sm text-ink-muted">
            {nextLine(countryProgress, 'country', 'countries')}
          </p>
        </div>
      )}

      {regions && regionProgress && regions.length > 0 && newest && (
        <div className="mt-4 border-t border-line pt-3" data-testid="explored-regions">
          <p className="font-bold">
            <span className="tabular-nums">{regions.length}</span>{' '}
            {regions.length === 1 ? 'province or state' : 'provinces & states'}
          </p>
          <p className="text-sm text-ink-soft">
            {names.slice(0, MAX_REGION_NAMES).join(', ')}
            {names.length > MAX_REGION_NAMES && ` and ${names.length - MAX_REGION_NAMES} more`}
          </p>
          <p className="mt-1 text-sm text-ink-soft" data-testid="newest-region">
            Newest: <span className="font-semibold text-ink">{names.at(-1)}</span>
            <span className="text-ink-muted">, {formatDate(newest.firstFound)}</span>
          </p>
          <MilestoneTrack progress={regionProgress} unit="Provinces & states" />
          <p className="mt-1.5 text-sm text-ink-muted">
            {nextLine(regionProgress, 'province or state', 'provinces & states')}
          </p>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-muted">Only fairly confident identifications count.</p>
    </Card>
  );
}
