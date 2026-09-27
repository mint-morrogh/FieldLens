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

export function RecentObservations() {
  const { records } = useObservations(3);
  if (!records) return null;
  return (
    <section aria-labelledby="recent-title">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 id="recent-title" className="text-lg font-bold">
          Recent Identifications
        </h2>
        {records.length > 0 && (
          <a href="#/history" className="min-h-11 py-2 font-semibold text-moss">
            See all
          </a>
        )}
      </div>
      {records.length === 0 ? (
        <p className="text-ink-muted">
          Your identifications will appear here. They’re stored only on this device.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {records.map((r) => (
            <ObservationRow key={r.id} record={r} />
          ))}
        </ul>
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
