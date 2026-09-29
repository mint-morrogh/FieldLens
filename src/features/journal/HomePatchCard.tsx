import { useId, useMemo, useState } from 'react';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Button, Card } from '../../components/ui';
import { MONTHS_SHORT, displayName, formatDate } from '../../lib/format';
import { GEOCODE } from '../../../shared/geocode';
import { searchPlaces, type PlaceSearch } from '../../lib/geocode';
import { useAreaSize } from '../../lib/units';
import type { ObservationRecord } from '../history/historyStore';
import { useOptionalLocationState } from '../location/LocationContext';
import { areaKey, exploredAreas, formatArea } from './areas';
import {
  PATCH_NAME_MAX,
  SEASONS,
  clearHomePatch,
  loadHomePatch,
  patchCell,
  patchLabel,
  patchSummary,
  saveHomePatch,
  type HomePatch,
} from './patch';

const SHOWN_SPECIES = 8;
const HERE_LABEL = 'Your current area';

type Choice =
  | { kind: 'area'; key: string }
  | { kind: 'place'; latitude: number; longitude: number; label: string };

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
  const here = useOptionalLocationState();
  // Only offered when location is already on: this never asks for permission.
  const hereCell =
    here?.status === 'granted' && here.location ? patchCell(here.location) : undefined;
  // Every place with any find, most-visited first.
  const areas = useMemo(
    () =>
      exploredAreas(records, { confirmedOnly: false }).sort(
        (a, b) => b.finds - a.finds || b.lastFound.localeCompare(a.lastFound),
      ),
    [records],
  );
  const [choice, setChoice] = useState<Choice | undefined>(() => {
    if (current && areas.some((a) => a.key === areaKey(current)))
      return { kind: 'area', key: areaKey(current) };
    if (current) return { kind: 'place', ...current, label: current.name || 'Current patch' };
    return areas[0] ? { kind: 'area', key: areas[0].key } : undefined;
  });
  const [name, setName] = useState(current?.name ?? '');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState<PlaceSearch>();

  const chosen =
    choice?.kind === 'area'
      ? areas.find((a) => a.key === choice.key)
      : choice && { ...patchCell(choice), label: choice.label };

  const pickPlace = (p: { latitude: number; longitude: number; label: string }, named?: string) => {
    setChoice({ kind: 'place', ...patchCell(p), label: p.label });
    if (named && !name.trim()) setName(named);
  };

  return (
    <div className="mt-3 space-y-4">
      <form
        role="search"
        aria-label="Place search"
        onSubmit={(e) => {
          e.preventDefault();
          if (searching || !query.trim()) return;
          setSearching(true);
          void searchPlaces(query).then((r) => {
            setSearch(r);
            setSearching(false);
          });
        }}
      >
        <label htmlFor={`${id}-q`} className="block text-sm font-semibold">
          Search by address or place
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id={`${id}-q`}
            type="search"
            value={query}
            maxLength={GEOCODE.maxQuery}
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Street address, town or park"
            className="min-h-12 min-w-0 flex-1 rounded-xl border border-line bg-card px-3 text-ink placeholder:text-ink-muted"
          />
          <Button type="submit" variant="secondary" disabled={searching || !query.trim()}>
            {searching ? 'Searching…' : 'Search'}
          </Button>
        </div>
        {search && !search.ok && (
          <p className="mt-1 text-sm text-amber" role="status">
            {search.message}
          </p>
        )}
        {search?.ok && search.results.length === 0 && (
          <p className="mt-1 text-sm text-ink-muted" role="status">
            No places found. Try a town or a nearby landmark.
          </p>
        )}
        {search?.ok && search.results.length > 0 && (
          <ul className="mt-2 space-y-1" aria-label="Places found">
            {search.results.map((r) => {
              const selected =
                choice?.kind === 'place' &&
                choice.label === r.label &&
                areaKey(choice) === areaKey(patchCell(r));
              return (
                <li key={`${r.label}|${r.latitude},${r.longitude}`}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    onClick={() => pickPlace(r, 'Home')}
                    className={`w-full rounded-xl border px-3 py-2 text-left ${selected ? 'border-moss bg-paper-deep' : 'border-line bg-card'}`}
                  >
                    <span className="block font-semibold leading-tight">{r.label}</span>
                    <span className="block text-xs text-ink-muted">
                      ~{formatArea(patchCell(r))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-1 text-xs text-ink-muted">
          Sent once to OpenStreetMap’s place search and not kept; only a rounded ~{areaSize} area is
          saved. Search data ©{' '}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            OpenStreetMap contributors
          </a>
          .
        </p>
      </form>

      {hereCell && (
        <Button
          variant="secondary"
          className="w-full"
          aria-pressed={choice?.kind === 'place' && choice.label === HERE_LABEL}
          onClick={() => pickPlace({ ...hereCell, label: HERE_LABEL })}
        >
          Use my current location
        </Button>
      )}

      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (chosen) onSave({ latitude: chosen.latitude, longitude: chosen.longitude, name });
        }}
      >
        {areas.length > 0 && (
          <div>
            <label htmlFor={`${id}-area`} className="block text-sm font-semibold">
              Area
            </label>
            <select
              id={`${id}-area`}
              value={choice?.kind === 'area' ? choice.key : ''}
              onChange={(e) => e.target.value && setChoice({ kind: 'area', key: e.target.value })}
              className="mt-1 min-h-12 w-full rounded-xl border border-line bg-card px-3 text-ink"
            >
              {choice?.kind !== 'area' && (
                <option value="" disabled>
                  Or pick one of your areas
                </option>
              )}
              {areas.map((a) => (
                <option key={a.key} value={a.key}>
                  ~{a.label} · {a.finds} {a.finds === 1 ? 'find' : 'finds'}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-muted">
              Or pick one of the places already in your journal, each about {areaSize} across.
            </p>
          </div>
        )}
        {chosen && (
          <p className="text-sm text-ink-soft" role="status" data-testid="patch-choice">
            Chosen: {choice?.kind === 'place' ? `${choice.label} · ` : ''}~{formatArea(chosen)}
          </p>
        )}
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
          <Button type="submit" className="flex-1" disabled={!chosen}>
            Set patch
          </Button>
          {onCancel && (
            <Button variant="secondary" className="flex-1" onClick={onCancel}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    </div>
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
  const summary = useMemo(
    () => (patch ? patchSummary(records, patch) : undefined),
    [records, patch],
  );

  // An empty journal keeps its own welcome; once anything is logged a patch can be set by
  // address even before a find with a location.
  if (!patch && records.length === 0) return null;

  const save = (p: HomePatch) => {
    setSaveFailed(!saveHomePatch(p));
    setPatch(loadHomePatch() ?? { ...patchCell(p), name: p.name?.trim() || undefined });
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
            <Button
              variant="secondary"
              size="sm"
              className="flex-1"
              onClick={() => setEditing(true)}
            >
              Change patch
            </Button>
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
