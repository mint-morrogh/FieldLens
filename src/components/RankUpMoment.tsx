import { useEffect, useRef, useState } from 'react';
import { useRoute } from '../app/router';
import { listObservations } from '../features/history/historyStore';
import { rankFor, speciesEntries, type RankInfo } from '../features/journal/journal';
import { RankEmblem } from '../features/journal/RankEmblem';
import { rankTheme } from '../features/journal/rankTheme';
import {
  JOURNAL_CHANGED_EVENT,
  acknowledgeRank,
  checkRankUp,
  readAcknowledgedRank,
} from '../features/journal/rankUp';

/** How long the moment stays up before dismissing itself. */
export const RANK_UP_DURATION_MS = 2600;

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

function RankUpOverlay({
  rank,
  durationMs,
  onDone,
}: {
  rank: RankInfo;
  durationMs: number;
  onDone: () => void;
}) {
  const theme = rankTheme(rank.name);
  const button = useRef<HTMLButtonElement>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    button.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => done.current(), durationMs);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') done.current();
      // A single control: keep Tab inside the dialog.
      if (e.key === 'Tab') {
        e.preventDefault();
        button.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      const back =
        previous && previous !== document.body && previous.isConnected
          ? previous
          : document.getElementById('main');
      back?.focus({ preventScroll: true });
    };
  }, [durationMs]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rank-up-title"
      aria-describedby="rank-up-detail"
      aria-live="polite"
      data-testid="rank-up"
      data-rank={theme.palette}
      style={theme.style}
      onClick={onDone}
      className="rank-up fixed inset-0 z-40 flex flex-col items-center justify-center bg-paper/95 px-6 text-center backdrop-blur-sm"
    >
      <p className="rank-up-text readout text-xs font-semibold text-ink-muted">New rank</p>
      <div className="relative mt-5">
        <span aria-hidden className="rank-up-ink absolute inset-0 rounded-full" />
        <div className="rank-up-stamp">
          <RankEmblem rank={theme.name} className="h-40 w-40" />
        </div>
      </div>
      <h2
        id="rank-up-title"
        className={`rank-up-text mt-6 font-serif text-3xl font-bold ${theme.text}`}
      >
        {theme.name}
      </h2>
      <p id="rank-up-detail" className="rank-up-text mt-1 text-ink-soft">
        {plural(rank.species, 'species', 'species')} · {plural(rank.groups, 'group', 'groups')}
      </p>
      <button
        ref={button}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDone();
        }}
        className={`rank-up-text mt-8 inline-flex min-h-12 items-center justify-center rounded-2xl px-6 font-semibold text-on-accent ${theme.fill}`}
      >
        Continue
      </button>
    </div>
  );
}

/**
 * A short, silent, full-screen moment when the naturalist rank goes up. Computed on the
 * device from local history, and only on the calm screens (home and the journal), never
 * during an identification or on the live camera. Progress that existed before this
 * feature, or before local data was cleared, is stored quietly rather than celebrated.
 * Motion follows the device's reduced-motion setting (see .rank-up in index.css).
 */
export function RankUpMoment({ durationMs = RANK_UP_DURATION_MS }: { durationMs?: number }) {
  const route = useRoute();
  const calm = route.name === 'home' || route.name === 'history';
  const [moment, setMoment] = useState<RankInfo>();

  useEffect(() => {
    if (!calm) return;
    let active = true;
    const check = () => {
      listObservations()
        .then((records) => {
          if (!active) return;
          const rank = rankFor(speciesEntries(records));
          const result = checkRankUp(readAcknowledgedRank(), rank.name);
          if (result.kind === 'store') acknowledgeRank(result.rank);
          else if (result.kind === 'celebrate') setMoment(rank);
        })
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    check();
    window.addEventListener('focus', check);
    window.addEventListener(JOURNAL_CHANGED_EVENT, check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.removeEventListener('focus', check);
      window.removeEventListener(JOURNAL_CHANGED_EVENT, check);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // Re-check on every move between home and the journal, as identifications return there.
  }, [calm, route.name]);

  // Leaving for another screen hides it unacknowledged; it comes back on the next calm screen.
  if (!moment || !calm) return null;
  return (
    <RankUpOverlay
      key={moment.name}
      rank={moment}
      durationMs={durationMs}
      onDone={() => {
        acknowledgeRank(moment.name);
        setMoment(undefined);
      }}
    />
  );
}
