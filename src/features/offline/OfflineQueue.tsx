/**
 * Offline queue UI: saving a photo for later on the error screen, the home-screen
 * "waiting for signal" indicator, and the runner that identifies queued photos once back
 * online (with a quiet toast, and a silent notification if the app is in the background).
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { routeHref, useRoute } from '../../app/router';
import { Icon } from '../../components/Icon';
import { Button, Notice } from '../../components/ui';
import type { ClientError, ClientErrorCode, IdentifyRequest } from '../../lib/api';
import { formatDateTime, plural } from '../../lib/format';
import { makeDisplayCopy } from '../../lib/image';
import { useOnline } from '../../lib/useOnline';
import { useObjectUrl } from '../history/HistoryScreen';
import { useSession } from '../identification/SessionContext';
import { declineNotifications, requestNotifications, shouldOfferNotifications } from './notify';
import { backoffDelay, nextDueAt } from './processQueue';
import {
  QueueError,
  enqueue,
  listQueued,
  removeQueued,
  subscribeQueue,
  toQueued,
  updateQueued,
  wasQueued,
  type QueuedIdentification,
} from './queueStore';
import { dismissIdentified, getRunnerState, runQueue, subscribeRunner } from './runQueue';

/** Wait for a returning connection to settle (and let an open retry go first). */
const ONLINE_SETTLE_MS = import.meta.env.MODE === 'test' ? 0 : 2000;
const MAX_TIMER_MS = 30 * 60_000;
const TOAST_MS = 12_000;

function useRunner() {
  return useSyncExternalStore(subscribeRunner, getRunnerState, getRunnerState);
}

/** Bumps each time a queued photo is identified, so journal lists can reload. */
export function useQueueIdentifiedCount(): number {
  return useRunner().identifiedCount;
}

export function useQueue(): QueuedIdentification[] | undefined {
  const [items, setItems] = useState<QueuedIdentification[]>();
  useEffect(() => {
    let alive = true;
    const load = () => void listQueued().then((list) => alive && setItems(list));
    load();
    const unsubscribe = subscribeQueue(load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, []);
  return items;
}

/** Puts the failed request in the queue. Never throws. */
export async function saveForLater(
  request: IdentifyRequest,
  first: { blob: Blob; original?: { blob: Blob } },
  code: ClientErrorCode,
): Promise<{ ok: true } | { ok: false; message: string }> {
  // An EXIF-free display copy for the journal; the original file is never stored here.
  const photo = await makeDisplayCopy(first.original?.blob ?? first.blob).catch(() => undefined);
  const item = toQueued(request, photo);
  // It just failed while "online" (weak signal): don't retry it straight away.
  if (code === 'network') item.nextAttemptAt = Date.now() + backoffDelay(1);
  try {
    await enqueue(item);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      message: e instanceof QueueError ? e.message : 'The photo couldn’t be saved.',
    };
  }
}

/**
 * On the error screen for "offline" / "couldn't reach FieldLens": saves the photo on the
 * device to identify later. Automatic when the device is clearly offline.
 */
export function SaveForLater({ error }: { error: ClientError }) {
  const session = useSession();
  const [status, setStatus] = useState<'idle' | 'saved' | 'failed' | 'declined'>('idle');
  const [message, setMessage] = useState<string>();
  const [offerNotify, setOfferNotify] = useState(false);
  const busy = useRef(false);

  const { observationId, images } = session.state;
  const request = session.lastRequest();
  const eligible =
    (error.code === 'offline' || error.code === 'network') &&
    request?.observationId === observationId &&
    request.images.length > 0;
  const automatic = error.code === 'offline' || wasQueued(observationId);

  const save = () => {
    if (busy.current || !request) return;
    busy.current = true;
    void saveForLater(request, images[0] ?? request.images[0], error.code)
      .then((outcome) => {
        if (outcome.ok) {
          setStatus('saved');
          setOfferNotify(shouldOfferNotifications());
        } else {
          setStatus('failed');
          setMessage(outcome.message);
        }
      })
      .finally(() => {
        busy.current = false;
      });
  };

  useEffect(() => {
    if (eligible && automatic && status === 'idle') save();
    // `save` reads the latest render; run once per error.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, automatic, status]);

  if (!eligible) return null;
  if (status === 'failed') {
    return (
      <Notice tone="error" role="alert">
        {message}
      </Notice>
    );
  }
  if (status === 'idle' || status === 'declined') {
    if (automatic && status === 'idle') return null;
    return (
      <Button variant="secondary" onClick={() => void save()} data-testid="save-for-later">
        <Icon name="offline" className="h-5 w-5" /> Save and identify when back online
      </Button>
    );
  }
  return (
    <div className="space-y-3" data-testid="saved-for-later">
      <Notice role="status">
        <span className="flex items-start gap-2">
          <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-moss" />
          <span>
            Saved on this device. It will be identified automatically when you’re back online, and
            added to your Field Journal.{' '}
            <button
              type="button"
              className="font-semibold text-moss underline underline-offset-4"
              onClick={() => {
                void removeQueued(observationId);
                setStatus('declined');
              }}
            >
              Don’t save
            </button>
          </span>
        </span>
      </Notice>
      {offerNotify && (
        <div className="rounded-2xl border border-line bg-card p-4" data-testid="notify-offer">
          <p className="font-medium">Get a notification when it’s identified?</p>
          <p className="mt-1 text-sm text-ink-muted">
            A silent notification on this device when the result is ready. Nothing else is sent, and
            you can turn it off in your browser settings.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => void requestNotifications().finally(() => setOfferNotify(false))}
            >
              Notify me
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                declineNotifications();
                setOfferNotify(false);
              }}
            >
              No thanks
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function QueueRow({ item }: { item: QueuedIdentification }) {
  const online = useOnline();
  const thumb = useObjectUrl(item.photo ?? item.images[0]?.blob);
  const [confirming, setConfirming] = useState(false);
  const when = formatDateTime(item.capturedAt);
  const failed = item.status === 'failed';
  return (
    <li className="flex items-center gap-3 py-2" data-testid="queue-item">
      {thumb ? (
        <img src={thumb} alt="" className="h-14 w-14 shrink-0 rounded-xl object-cover" />
      ) : (
        <span className="h-14 w-14 shrink-0 rounded-xl bg-paper-deep" aria-hidden />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">Photo from {when}</p>
        <p className={`text-sm ${failed ? 'text-rust' : 'text-ink-muted'}`}>
          {failed
            ? (item.error ?? 'Couldn’t be identified.')
            : item.error
              ? 'Didn’t go through; trying again soon.'
              : 'Waiting to be identified.'}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {confirming ? (
          <>
            <Button size="sm" variant="danger" onClick={() => void removeQueued(item.id)}>
              Remove
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove photo from ${when}`}
              onClick={() => setConfirming(true)}
            >
              <Icon name="trash" className="h-4.5 w-4.5" />
            </Button>
            {failed && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void updateQueued(item.id, {
                    status: 'waiting',
                    attempts: 0,
                    nextAttemptAt: undefined,
                    error: undefined,
                  }).then(() => {
                    if (online) void runQueue();
                  })
                }
              >
                Try again
              </Button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/** Home screen: "2 photos waiting for signal", expandable to view or remove them. */
export function QueueIndicator() {
  const items = useQueue();
  const online = useOnline();
  const { running } = useRunner();
  const [open, setOpen] = useState(false);
  if (!items || items.length === 0) return null;

  const waiting = items.filter((i) => i.status === 'waiting').length;
  const failed = items.length - waiting;
  const summary =
    waiting === 0
      ? `${plural(failed, 'saved photo')} couldn’t be identified`
      : !online
        ? `${plural(waiting, 'photo')} waiting for signal`
        : running
          ? `Identifying ${plural(waiting, 'saved photo')}…`
          : `${plural(waiting, 'saved photo')} waiting to be identified`;

  return (
    <section
      className="rounded-2xl border border-line bg-card px-4 py-2"
      aria-label="Saved photos"
      data-testid="queue-indicator"
    >
      <div className="flex items-center gap-3">
        <Icon name={online ? 'history' : 'offline'} className="h-5 w-5 shrink-0 text-ink-muted" />
        <button
          type="button"
          className="min-h-11 flex-1 text-left font-medium"
          aria-expanded={open}
          aria-controls="queue-list"
          onClick={() => setOpen((o) => !o)}
          data-testid="queue-summary"
        >
          {summary}
          <span className="ml-2 text-sm font-semibold text-moss">{open ? 'Hide' : 'View'}</span>
        </button>
        {online && waiting > 0 && !running && (
          <Button size="sm" variant="ghost" onClick={() => void runQueue({ force: true })}>
            Try now
          </Button>
        )}
      </div>
      {open && (
        <ul id="queue-list" className="divide-y divide-line border-t border-line">
          {items.map((item) => (
            <QueueRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

function QueueToast() {
  const { identified } = useRunner();
  const route = useRoute();
  useEffect(() => {
    if (identified.length === 0) return;
    const t = setTimeout(dismissIdentified, TOAST_MS);
    return () => clearTimeout(t);
  }, [identified]);

  // Never over the live camera; it waits until they leave.
  if (identified.length === 0 || route.name === 'live') return null;
  const one = identified.length === 1 ? identified[0] : undefined;
  return (
    <div
      role="status"
      className="safe-bottom fixed inset-x-3 bottom-3 z-30 mx-auto flex max-w-xl items-center gap-3 rounded-2xl bg-toast p-3 pl-4 text-white shadow-lg"
      data-testid="queue-toast"
    >
      <Icon name="check" className="h-5 w-5 shrink-0" />
      <p className="flex-1">
        {one ? (
          <>
            Saved photo identified: <strong>{one.name}</strong>
          </>
        ) : (
          `${identified.length} saved photos identified`
        )}
      </p>
      <a
        href={one ? routeHref({ name: 'observation', id: one.id }) : routeHref({ name: 'history' })}
        className="min-h-10 content-center px-2 font-semibold underline underline-offset-4"
        onClick={dismissIdentified}
      >
        View
      </a>
      <button
        type="button"
        aria-label="Dismiss"
        className="flex min-h-10 min-w-10 items-center justify-center"
        onClick={dismissIdentified}
      >
        <Icon name="close" className="h-5 w-5" />
      </button>
    </div>
  );
}

/**
 * Identifies queued photos on app start, when the connection returns and when the app
 * comes back to the foreground; retries backed-off items on a timer while open.
 */
export function OfflineQueueRunner() {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settle: ReturnType<typeof setTimeout> | undefined;

    const schedule = async () => {
      const due = nextDueAt(await listQueued());
      clearTimeout(timer);
      if (cancelled || due === undefined) return;
      const wait = Math.min(Math.max(due - Date.now(), 1000), MAX_TIMER_MS);
      timer = setTimeout(kick, wait);
    };
    const kick = () => {
      if (cancelled || navigator.onLine === false) return;
      void runQueue().then(schedule, schedule);
    };
    const onOnline = () => {
      clearTimeout(settle);
      settle = setTimeout(kick, ONLINE_SETTLE_MS);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') kick();
    };
    // A tapped notification, relayed by the service worker (public/sw-notifications.js).
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | undefined;
      if (data?.type !== 'fieldlens:open' || !data.url) return;
      try {
        window.location.hash = new URL(data.url).hash;
      } catch {
        /* ignore malformed */
      }
    };

    kick();
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', kick);
    document.addEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.addEventListener('message', onMessage);
    const unsubscribe = subscribeQueue(() => void schedule());
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearTimeout(settle);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', kick);
      document.removeEventListener('visibilitychange', onVisible);
      navigator.serviceWorker?.removeEventListener('message', onMessage);
      unsubscribe();
    };
  }, []);

  return <QueueToast />;
}
