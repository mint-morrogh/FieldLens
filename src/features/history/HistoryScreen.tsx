import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatPercent } from '../../../shared/confidence';
import { navigate, routeHref } from '../../app/router';
import { Icon } from '../../components/Icon';
import { Button, Card, Notice } from '../../components/ui';
import { displayName, formatDateTime } from '../../lib/format';
import { ResultView } from '../results/ResultView';
import {
  clearObservations,
  deleteObservation,
  getObservation,
  listObservations,
  saveObservation,
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
  const { records, reload } = useObservations(8);
  const [undo, setUndo] = useState<ObservationRecord>();

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(undefined), 6000);
    return () => clearTimeout(t);
  }, [undo]);

  if (!records) return null;
  const remove = (record: ObservationRecord) => {
    void deleteObservation(record.id).then(() => {
      setUndo(record);
      reload();
    });
  };
  const restore = () => {
    if (!undo) return;
    const record = undo;
    setUndo(undefined);
    void saveObservation(record).then(reload);
  };

  return (
    <section aria-labelledby="recent-title">
      <div className="mb-3 flex items-center gap-3">
        <h2
          id="recent-title"
          className="readout shrink-0 text-[0.7rem] font-semibold text-ink-muted"
        >
          Recent identifications
        </h2>
        <span className="h-px flex-1 bg-line" aria-hidden />
        {records.length > 0 && (
          <a href="#/history" className="min-h-11 shrink-0 py-2 text-sm font-semibold text-moss">
            See all
          </a>
        )}
      </div>
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

export function HistoryScreen() {
  const { records, failed, reload } = useObservations();
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="space-y-4">
      <h1 className="pt-2 font-serif text-3xl font-bold">History</h1>
      <p className="text-ink-soft">Saved on this device only. No exact locations are stored.</p>
      {failed && (
        <Notice tone="warn">
          Local storage isn’t available in this browser, so history can’t be shown.
        </Notice>
      )}
      {records && records.length === 0 && !failed && (
        <Card as="div">
          <p className="text-ink-soft">No identifications yet.</p>
          <Button className="mt-3" onClick={() => navigate({ name: 'home' })}>
            Identify something
          </Button>
        </Card>
      )}
      {records && records.length > 0 && (
        <>
          <ul className="divide-y divide-line rounded-[var(--radius-card)] border border-line bg-card px-4">
            {records.map((r) => (
              <ObservationRow
                key={r.id}
                record={r}
                onDelete={() => void deleteObservation(r.id).then(reload)}
              />
            ))}
          </ul>
          {confirmClear ? (
            <div className="flex gap-2" role="group" aria-label="Confirm clearing history">
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
              <Button variant="secondary" className="flex-1" onClick={() => setConfirmClear(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button variant="danger" className="w-full" onClick={() => setConfirmClear(true)}>
              <Icon name="trash" className="h-5 w-5" /> Clear history
            </Button>
          )}
        </>
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
