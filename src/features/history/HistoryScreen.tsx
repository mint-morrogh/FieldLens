import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatPercent } from '../../../shared/confidence';
import { navigate, routeHref } from '../../app/router';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Icon } from '../../components/Icon';
import { Button, Card, Notice } from '../../components/ui';
import { displayName, formatDateTime } from '../../lib/format';
import {
  JOURNAL_GROUPS,
  POINTS_PER_GROUP,
  POINTS_PER_SPECIES,
  journalPins,
  rankFor,
  speciesEntries,
  type JournalGroup,
  type RankInfo,
  type SpeciesEntry,
} from '../journal/journal';
import { ResultView } from '../results/ResultView';
import {
  clearObservations,
  deleteObservation,
  getObservation,
  listObservations,
  type ObservationRecord,
} from './historyStore';

function useObjectUrl(blob: Blob | undefined): string | undefined {
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : undefined), [blob]);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return url;
}

function ObservationRow({
  record,
  onDelete,
}: {
  record: ObservationRecord;
  onDelete?: () => void;
}) {
  const thumb = useObjectUrl(record.thumbnail);
  const top = record.top;
  return (
    <li className="flex items-center gap-3 py-2.5" data-testid="history-item">
      <a
        href={routeHref({ name: 'observation', id: record.id })}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-xl"
      >
        {thumb ? (
          <img src={thumb} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
        ) : (
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-moss-soft text-moss"
            aria-hidden
          >
            <Icon name="leaf" />
          </span>
        )}
        <span className="min-w-0">
          <span className="block truncate font-bold">{top ? displayName(top) : 'No match'}</span>
          {top?.commonName && (
            <span className="sci block truncate text-ink-soft">{top.scientificName}</span>
          )}
          <span className="block text-sm text-ink-muted">
            {formatDateTime(record.createdAt)}
            {top ? ` · ${formatPercent(top.finalConfidence)}` : ''}
            {record.locationLabel ? ` · ~${record.locationLabel}` : ''}
          </span>
        </span>
      </a>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-rust-soft hover:text-rust"
          aria-label={`Delete ${top ? displayName(top) : 'observation'}`}
        >
          <Icon name="trash" className="h-5 w-5" />
        </button>
      )}
    </li>
  );
}

function useObservations(limit?: number) {
  const [records, setRecords] = useState<ObservationRecord[]>();
  const [failed, setFailed] = useState(false);
  const reload = useCallback(() => {
    listObservations(limit)
      .then(setRecords)
      .catch(() => {
        setFailed(true);
        setRecords([]);
      });
  }, [limit]);
  useEffect(reload, [reload]);
  return { records, failed, reload };
}

/** Swipeable recent-identification card with its own delete button. */
function RecentCard({ record, onDelete }: { record: ObservationRecord; onDelete: () => void }) {
  const thumb = useObjectUrl(record.thumbnail ?? record.photo);
  const top = record.top;
  const name = top ? displayName(top) : 'No match';
  return (
    <li className="relative w-36 shrink-0 snap-start" data-testid="recent-card">
      <a
        href={routeHref({ name: 'observation', id: record.id })}
        className="block overflow-hidden rounded-2xl border border-line bg-card shadow-[0_1px_0_rgba(0,0,0,0.04)]"
      >
        {thumb ? (
          <img src={thumb} alt="" className="h-28 w-full object-cover" />
        ) : (
          <span
            className="flex h-28 w-full items-center justify-center bg-moss-soft text-moss"
            aria-hidden
          >
            <Icon name="leaf" className="h-8 w-8" />
          </span>
        )}
        <span className="block px-2.5 pb-2.5 pt-2">
          <span className="block truncate text-[0.95rem] font-bold leading-tight">{name}</span>
          <span className="mt-0.5 block truncate text-xs text-ink-muted">
            {new Date(record.createdAt).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
            {top ? ` · ${formatPercent(top.finalConfidence)}` : ''}
          </span>
        </span>
      </a>
      <button
        type="button"
        onClick={onDelete}
        className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur hover:bg-rust"
        aria-label={`Delete ${name}`}
      >
        <Icon name="trash" className="h-4 w-4" />
      </button>
    </li>
  );
}

export function RecentObservations() {
  const { records: stored, reload } = useObservations(8);
  const { records: all } = useObservations();
  const rank = useMemo(() => rankFor(speciesEntries(all ?? [])), [all]);
  // Deleting only hides the card; it's removed from storage once the undo window passes.
  // (Re-saving an already-deleted record fails on iOS Safari, whose stored photo blobs
  // disappear with the record, so "undo" must never need to write it back.)
  const [undo, setUndo] = useState<ObservationRecord>();
  const pending = useRef<ObservationRecord | undefined>(undefined);

  const commit = useCallback(() => {
    const record = pending.current;
    pending.current = undefined;
    if (record) void deleteObservation(record.id).then(reload);
  }, [reload]);

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => {
      commit();
      setUndo(undefined);
    }, 6000);
    return () => clearTimeout(t);
  }, [undo, commit]);
  // Leaving the page finishes any pending delete.
  useEffect(() => () => commit(), [commit]);

  if (!stored) return null;
  const records = stored.filter((r) => r.id !== undo?.id);
  const remove = (record: ObservationRecord) => {
    commit(); // a second delete confirms the first
    pending.current = record;
    setUndo(record);
  };
  const restore = () => {
    pending.current = undefined;
    setUndo(undefined);
  };

  return (
    <section aria-labelledby="recent-title">
      <div className="mb-3 flex items-center gap-3">
        <h2
          id="recent-title"
          className="readout shrink-0 text-[0.7rem] font-semibold text-ink-muted"
        >
          Field journal
        </h2>
        <span className="h-px flex-1 bg-line" aria-hidden />
        {records.length > 0 && (
          <a href="#/history" className="min-h-11 shrink-0 py-2 text-sm font-semibold text-moss">
            Open journal
          </a>
        )}
      </div>
      {records.length > 0 && (
        <a
          href="#/history"
          className="mb-3 flex items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3"
          data-testid="rank-chip"
        >
          <span className="min-w-0">
            <span className="block font-serif text-lg font-bold leading-tight text-moss-dark">
              {rank.name}
            </span>
            <span className="block text-sm text-ink-muted">
              {rank.species} species · {rank.groups} {rank.groups === 1 ? 'group' : 'groups'}
              {rank.next ? ` · ${rank.next.min - rank.points} pts to ${rank.next.name}` : ''}
            </span>
          </span>
          <span
            className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-paper-deep"
            aria-hidden
          >
            <span
              className="block h-full rounded-full bg-moss"
              style={{ width: `${Math.max(6, rank.progress * 100)}%` }}
            />
          </span>
        </a>
      )}
      {records.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-[0.95rem] text-ink-muted">
          Your identifications will appear here. They’re stored only on this device.
        </p>
      ) : (
        <ul className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none]">
          {records.map((r) => (
            <RecentCard key={r.id} record={r} onDelete={() => remove(r)} />
          ))}
        </ul>
      )}
      {undo && (
        <div
          role="status"
          className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-toast px-4 py-2.5 text-white"
          data-testid="undo-delete"
        >
          <span className="truncate">
            Deleted {undo.top ? displayName(undo.top) : 'identification'}
          </span>
          <button
            type="button"
            onClick={restore}
            className="min-h-10 shrink-0 font-bold text-[#9fd08a]"
          >
            Undo
          </button>
        </div>
      )}
    </section>
  );
}

const JournalGlobe = lazy(() => import('../results/Globe'));

/** Rank, points and progress to the next rank. */
export function RankCard({ rank, finds }: { rank: RankInfo; finds: number }) {
  return (
    <Card as="section" aria-labelledby="rank-title" data-testid="rank-card">
      <p className="readout text-[0.7rem] font-semibold text-ink-muted">Naturalist rank</p>
      <h2 id="rank-title" className="mt-1 font-serif text-2xl font-bold text-moss-dark">
        {rank.name}
      </h2>
      <div
        className="mt-3 h-2 overflow-hidden rounded-full bg-paper-deep"
        role="progressbar"
        aria-label={rank.next ? `Progress to ${rank.next.name}` : 'Top rank reached'}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(rank.progress * 100)}
      >
        <div
          className="h-full rounded-full bg-moss transition-[width] duration-700"
          style={{ width: `${Math.max(3, rank.progress * 100)}%` }}
        />
      </div>
      <p className="mt-1.5 text-sm text-ink-muted">
        {rank.points} pts
        {rank.next ? ` · ${rank.next.min - rank.points} to ${rank.next.name}` : ' · top rank'}
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        {(
          [
            ['Species', rank.species],
            ['Groups', `${rank.groups}/${JOURNAL_GROUPS.length}`],
            ['Finds', finds],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className="rounded-xl bg-paper-deep px-2 py-2">
            <dd className="text-xl font-bold tabular-nums">{value}</dd>
            <dt className="text-xs text-ink-muted">{label}</dt>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-ink-muted">
        {POINTS_PER_SPECIES} point per confident species, {POINTS_PER_GROUP} for each new group.
      </p>
    </Card>
  );
}

function SpeciesCard({ entry }: { entry: SpeciesEntry }) {
  const latest = entry.records[0];
  const thumb = useObjectUrl(latest.thumbnail ?? latest.photo);
  const name = displayName(entry);
  return (
    <li data-testid="species-card" data-group={entry.group}>
      <a
        href={routeHref({ name: 'observation', id: latest.id })}
        className="block overflow-hidden rounded-2xl border border-line bg-card"
      >
        <span className="relative block">
          {thumb ? (
            <img src={thumb} alt="" className="aspect-square w-full object-cover" />
          ) : (
            <span
              className="flex aspect-square w-full items-center justify-center bg-moss-soft text-moss"
              aria-hidden
            >
              <CategoryIcon id={entry.group} className="h-10 w-10" />
            </span>
          )}
          {entry.records.length > 1 && (
            <span className="readout absolute right-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[0.65rem] text-white">
              ×{entry.records.length}
            </span>
          )}
          {!entry.confirmed && (
            <span className="absolute left-2 top-2 rounded-full bg-amber-soft px-2 py-0.5 text-[0.7rem] font-semibold text-amber">
              Unconfirmed
            </span>
          )}
        </span>
        <span className="block px-2.5 pb-2.5 pt-2">
          <span className="block truncate font-bold leading-tight">{name}</span>
          <span className="sci block truncate text-sm text-ink-soft">{entry.scientificName}</span>
          <span className="mt-0.5 block text-xs text-ink-muted">
            First seen{' '}
            {new Date(entry.firstSeen).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </span>
        </span>
      </a>
    </li>
  );
}

/** The Field Journal: rank, a globe of where you've been, and your species by group. */
export function HistoryScreen() {
  const { records, failed, reload } = useObservations();
  const [confirmClear, setConfirmClear] = useState(false);
  const [group, setGroup] = useState<JournalGroup | 'all'>('all');
  const entries = useMemo(() => speciesEntries(records ?? []), [records]);
  const pins = useMemo(() => journalPins(records ?? []), [records]);
  const rank = rankFor(entries);
  const shown = group === 'all' ? entries : entries.filter((e) => e.group === group);
  const counts = new Map<JournalGroup, number>();
  for (const e of entries) counts.set(e.group, (counts.get(e.group) ?? 0) + 1);

  return (
    <div className="space-y-4">
      <header className="pt-2">
        <h1 className="font-serif text-3xl font-bold">Field Journal</h1>
        <p className="text-ink-soft">Saved on this device only. No exact locations are stored.</p>
      </header>
      {failed && (
        <Notice tone="warn">
          Local storage isn’t available in this browser, so the journal can’t be shown.
        </Notice>
      )}
      {records && <RankCard rank={rank} finds={records.length} />}
      {records && records.length === 0 && !failed && (
        <Card as="div">
          <p className="text-ink-soft">
            Your journal is empty. Every species you identify is added here.
          </p>
          <Button className="mt-3" onClick={() => navigate({ name: 'home' })}>
            Identify something
          </Button>
        </Card>
      )}
      {pins.length > 0 && (
        <Card as="section" aria-labelledby="explored-title" data-testid="journal-globe">
          <p className="readout text-[0.7rem] font-semibold text-ink-muted">Explored</p>
          <h2 id="explored-title" className="mb-2 text-lg font-bold">
            Where you’ve found things
          </h2>
          <Suspense
            fallback={
              <div className="skeleton mx-auto aspect-square w-full max-w-[18rem] rounded-full" />
            }
          >
            <JournalGlobe pins={pins} title="where you’ve found things" />
          </Suspense>
          <p className="mt-2 text-center text-sm text-ink-muted">
            {pins.length} {pins.length === 1 ? 'place' : 'places'} · each pin is an area about 10 km
            across
          </p>
        </Card>
      )}
      {entries.length > 0 && (
        <section aria-labelledby="species-title">
          <div className="mb-3 flex items-center gap-3">
            <h2
              id="species-title"
              className="readout shrink-0 text-[0.7rem] font-semibold text-ink-muted"
            >
              Species · {entries.length}
            </h2>
            <span className="h-px flex-1 bg-line" aria-hidden />
          </div>
          <div
            className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
            role="group"
            aria-label="Filter by group"
            data-testid="journal-filter"
          >
            {[{ id: 'all' as const, label: 'All' }, ...JOURNAL_GROUPS]
              .filter((g) => g.id === 'all' || counts.has(g.id))
              .map((g) => (
                <button
                  key={g.id}
                  type="button"
                  aria-pressed={group === g.id}
                  onClick={() => setGroup(g.id)}
                  className={`flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[0.95rem] font-medium ${
                    group === g.id
                      ? 'border-moss bg-moss text-on-accent'
                      : 'border-line bg-card text-ink'
                  }`}
                >
                  {g.id !== 'all' && <CategoryIcon id={g.id} className="h-4 w-4" />}
                  {g.label}
                  <span className="tabular-nums opacity-70">
                    {g.id === 'all' ? entries.length : counts.get(g.id)}
                  </span>
                </button>
              ))}
          </div>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((e) => (
              <SpeciesCard key={e.scientificName} entry={e} />
            ))}
          </ul>
        </section>
      )}
      {records && records.length > 0 && (
        <details className="group rounded-[var(--radius-card)] border border-line bg-card px-4">
          <summary className="flex min-h-12 cursor-pointer items-center justify-between font-semibold">
            All entries ({records.length})
            <Icon
              name="back"
              className="h-4 w-4 -rotate-90 transition-transform group-open:rotate-90"
            />
          </summary>
          <ul className="divide-y divide-line border-t border-line">
            {records.map((r) => (
              <ObservationRow
                key={r.id}
                record={r}
                onDelete={() => void deleteObservation(r.id).then(reload)}
              />
            ))}
          </ul>
          <div className="py-3">
            {confirmClear ? (
              <div className="flex gap-2" role="group" aria-label="Confirm clearing the journal">
                <Button
                  variant="danger"
                  className="flex-1"
                  onClick={() =>
                    void clearObservations().then(() => {
                      setConfirmClear(false);
                      reload();
                    })
                  }
                >
                  Yes, clear all
                </Button>
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setConfirmClear(false)}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Button variant="danger" className="w-full" onClick={() => setConfirmClear(true)}>
                <Icon name="trash" className="h-5 w-5" /> Clear journal
              </Button>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

export function ObservationScreen({ id }: { id: string }) {
  const [record, setRecord] = useState<ObservationRecord | null>();
  useEffect(() => {
    getObservation(id)
      .then((r) => setRecord(r ?? null))
      .catch(() => setRecord(null));
  }, [id]);
  const thumb = useObjectUrl(record?.thumbnail ?? undefined);
  const photo = useObjectUrl(record?.photo ?? undefined);

  if (record === undefined) return <div className="skeleton mt-4 h-64" aria-label="Loading" />;
  if (record === null) {
    return (
      <Notice tone="warn" role="alert">
        This observation wasn’t found.{' '}
        <a href="#/history" className="font-semibold underline">
          Back to history
        </a>
      </Notice>
    );
  }
  return (
    <div className="space-y-4">
      <p className="pt-2 text-sm text-ink-muted">Saved {formatDateTime(record.createdAt)}</p>
      <ResultView
        result={record.result}
        photoUrl={photo}
        thumbnailUrl={thumb}
        userPhotos={photo ? [photo] : undefined}
      />
      <Button
        variant="danger"
        className="w-full"
        onClick={() =>
          void deleteObservation(record.id).then(() =>
            navigate({ name: 'history' }, { replace: true }),
          )
        }
      >
        <Icon name="trash" className="h-5 w-5" /> Delete observation
      </Button>
    </div>
  );
}
