import { useId, useMemo, useState } from 'react';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Button, Card } from '../../components/ui';
import { MONTHS_SHORT, displayName, formatDate } from '../../lib/format';
import { useAreaSize } from '../../lib/units';
import type { ObservationRecord } from '../history/historyStore';
import { areaKey, exploredAreas, formatArea } from './areas';
import {
  PATCH_NAME_MAX,
  SEASONS,
  clearHomePatch,
  loadHomePatch,
  patchLabel,
  patchSummary,
  saveHomePatch,
  type HomePatch,
} from './patch';

const SHOWN_SPECIES = 8;

function PatchPicker({
  records,
  current,
  onSave,
  onCancel,
}: {
  records: ObservationRecord[];
  current?: HomePatch;
  onSave: (p: HomePatch) => void;
  onCancel?: () => void;
}) {
  const id = useId();
  const areaSize = useAreaSize();
  // Every place with any find, most-visited first; no location is requested.
  const areas = useMemo(
    () =>
      exploredAreas(records, { confirmedOnly: false }).sort(
        (a, b) => b.finds - a.finds || b.lastFound.localeCompare(a.lastFound),
      ),
    [records],
  );
  const [key, setKey] = useState(() =>
    current && areas.some((a) => a.key === areaKey(current)) ? areaKey(current) : areas[0]?.key,
  );
  const [name, setName] = useState(current?.name ?? '');
  const area = areas.find((a) => a.key === key);

  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (area) onSave({ latitude: area.latitude, longitude: area.longitude, name });
      }}
    >
      <div>
        <label htmlFor={`${id}-area`} className="block text-sm font-semibold">
          Area
        </label>
        <select
          id={`${id}-area`}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-card px-3 text-ink"
        >
          {areas.map((a) => (
            <option key={a.key} value={a.key}>
              ~{a.label} · {a.finds} {a.finds === 1 ? 'find' : 'finds'}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-ink-muted">
          Chosen from places already in your journal, each about {areaSize} across.
        </p>
      </div>
      <div>
        <label htmlFor={`${id}-name`} className="block text-sm font-semibold">
          Name <span className="font-normal text-ink-muted">(optional)</span>
        </label>
        <input
          id={`${id}-name`}
          value={name}
          maxLength={PATCH_NAME_MAX}
          onChange={(e) => setName(e.target.value)}
          placeholder="Home, cottage, a favourite trail"
          className="mt-1 min-h-12 w-full rounded-xl border border-line bg-card px-3 text-ink placeholder:text-ink-muted"
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" className="flex-1" disabled={!area}>
          Set patch
        </Button>
        {onCancel && (
          <Button variant="secondary" className="flex-1" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

/**
 * Your home patch: one ~10 km area you return to, with every species found there and how
 * the list changes through the months and seasons.
 */
export function HomePatchCard({ records }: { records: ObservationRecord[] }) {
  const [patch, setPatch] = useState<HomePatch | undefined>(loadHomePatch);
  const [editing, setEditing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const hasPlaces = useMemo(
    () => exploredAreas(records, { confirmedOnly: false }).length > 0,
    [records],
  );
  const summary = useMemo(
    () => (patch ? patchSummary(records, patch) : undefined),
    [records, patch],
  );

  if (!patch && !hasPlaces) return null;

  const save = (p: HomePatch) => {
    setSaveFailed(!saveHomePatch(p));
    setPatch(loadHomePatch() ?? { ...p, name: p.name?.trim() || undefined });
    setEditing(false);
  };
  const clear = () => {
    clearHomePatch();
    setPatch(undefined);
    setEditing(false);
  };

  const maxMonth = Math.max(1, ...(summary?.months ?? []));

  return (
    <Card as="section" aria-labelledby="patch-title" data-testid="home-patch">
      <p className="readout text-[0.7rem] font-semibold text-ink-muted">Home patch</p>
      <h2 id="patch-title" className="text-lg font-bold">
        {patch ? patchLabel(patch) : 'Choose a place you return to'}
      </h2>
      {!patch && !editing && (
        <>
          <p className="mt-1 text-sm text-ink-soft">
            Home, a cottage or a favourite trail. Watch what turns up there through the seasons.
          </p>
          <Button variant="secondary" className="mt-3 w-full" onClick={() => setEditing(true)}>
            Set a home patch
          </Button>
        </>
      )}
      {editing && (
        <PatchPicker
          records={records}
          current={patch}
          onSave={save}
          onCancel={() => setEditing(false)}
        />
      )}

      {patch && summary && !editing && (
        <>
          {patch.name && <p className="text-sm text-ink-muted">~{formatArea(patch)}</p>}
          <p className="mt-2" data-testid="patch-count">
            <span className="text-3xl font-bold tabular-nums text-moss-dark">
              {summary.species.length}
            </span>{' '}
            <span className="text-ink-soft">species found at your patch</span>
          </p>
          <p className="text-sm text-ink-muted">
            {summary.finds} {summary.finds === 1 ? 'find' : 'finds'}
            {summary.firstVisit ? ` since ${formatDate(summary.firstVisit)}` : ''}
          </p>

          <ul className="mt-4 grid grid-cols-4 gap-2 text-center" aria-label="Species by season">
            {summary.seasons.map((s) => (
              <li key={s.season} className="rounded-xl bg-paper-deep px-1 py-2">
                <span className="block text-lg font-bold tabular-nums">{s.species}</span>
                <span className="block text-[0.7rem] text-ink-muted">
                  {SEASONS.find((x) => x.id === s.season)?.label}
                </span>
              </li>
            ))}
          </ul>

          <div
            className="mt-3"
            role="img"
            aria-label={`Species by month: ${summary.months
              .map((n, i) => `${MONTHS_SHORT[i]} ${n}`)
              .join(', ')}`}
          >
            <div className="flex h-12 items-end gap-1">
              {summary.months.map((n, i) => (
                <span
                  key={i}
                  className={`flex-1 rounded-t-sm ${n ? 'bg-moss' : 'bg-paper-deep'}`}
                  style={{
                    height: `${n ? Math.max(10, (n / maxMonth) * 100) : 5}%`,
                    opacity: n ? 0.45 + 0.55 * (n / maxMonth) : undefined,
                  }}
                />
              ))}
            </div>
            <div className="mt-1 flex gap-1" aria-hidden>
              {MONTHS_SHORT.map((m) => (
                <span key={m} className="flex-1 text-center text-[0.6rem] text-ink-muted">
                  {m[0]}
                </span>
              ))}
            </div>
          </div>

          {summary.species.length > 0 ? (
            <ul className="mt-3 divide-y divide-line" data-testid="patch-species">
              {summary.species.slice(0, SHOWN_SPECIES).map((s) => (
                <li key={s.scientificName} className="flex items-center gap-3 py-2">
                  <CategoryIcon id={s.group} className="h-5 w-5 shrink-0 text-moss" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold leading-tight">{displayName(s)}</span>
                    <span className="block truncate text-xs text-ink-muted">
                      {s.months.map((m) => MONTHS_SHORT[m]).join(', ')}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-ink-muted">×{s.finds}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-ink-muted">
              No confident finds here yet. They’ll appear as you log them.
            </p>
          )}
          {summary.species.length > SHOWN_SPECIES && (
            <p className="mt-1 text-sm text-ink-muted">
              and {summary.species.length - SHOWN_SPECIES} more
            </p>
          )}

          <div className="mt-4 flex gap-2">
            {hasPlaces && (
              <Button
                variant="secondary"
                size="sm"
                className="flex-1"
                onClick={() => setEditing(true)}
              >
                Change patch
              </Button>
            )}
            <Button variant="ghost" size="sm" className="flex-1" onClick={clear}>
              Clear patch
            </Button>
          </div>
        </>
      )}
      {saveFailed && (
        <p className="mt-2 text-xs text-amber" role="status">
          This browser won’t keep the patch after you leave.
        </p>
      )}
      <p className="mt-3 text-xs text-ink-muted">
        Saved on this device only. Only fairly confident finds count.
      </p>
    </Card>
  );
}
