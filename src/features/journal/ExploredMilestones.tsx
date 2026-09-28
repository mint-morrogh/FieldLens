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
  type CountryLookup,
  type MilestoneProgress,
} from './areas';

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
 * Areas explored (~10 km cells with a confident find) and countries, with milestones.
 * Sits under the journal globe. Countries come from an offline outline lookup, loaded
 * on demand; nothing leaves the device.
 */
export function ExploredMilestones({ records }: { records: ObservationRecord[] }) {
  const areas = useMemo(() => exploredAreas(records), [records]);
  const areaSize = useAreaSize();
  const progress = useMemo(() => areaMilestones(areas), [areas]);
  const [countryOf, setCountryOf] = useState<CountryLookup>();
  useEffect(() => {
    if (!areas.length) return;
    let live = true;
    import('./countries')
      .then((m) => live && setCountryOf(() => m.countryOf))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [areas.length]);
  const countries = useMemo(
    () => (countryOf ? exploredCountries(areas, countryOf) : undefined),
    [areas, countryOf],
  );
  const countryProgress = countries && countryMilestones(countries);

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
      <p className="mt-3 text-xs text-ink-muted">Only fairly confident identifications count.</p>
    </Card>
  );
}
