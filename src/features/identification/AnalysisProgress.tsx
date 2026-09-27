import { getCategory } from '../../../shared/categories';
import { formatPercent } from '../../../shared/confidence';
import type { IdentifyStage, StageEvent } from '../../../shared/types';
import { Icon } from '../../components/Icon';
import { Card } from '../../components/ui';
import { displayName } from '../../lib/format';
import { useLocationState } from '../location/LocationContext';
import { useSession, type Progress } from './SessionContext';

type RowState = 'pending' | 'active' | 'done' | 'skipped';

type Row = { key: string; label: string; source?: string; state: RowState; note?: string };

function stageState(progress: Progress, stage: IdentifyStage, previous: RowState): RowState {
  const s: StageEvent['status'] | undefined = progress.stages[stage];
  if (s === 'done') return 'done';
  if (s === 'skipped') return 'skipped';
  if (s === 'active') return 'active';
  // Not reported yet: it's next in line once the previous step has finished.
  return previous === 'done' || previous === 'skipped' ? 'active' : 'pending';
}

/** Builds the checklist from real, server-reported stages (nothing here is simulated). */
export function buildRows(progress: Progress, source: string, locationKnown: boolean): Row[] {
  const uploading: RowState =
    progress.phase === 'preparing' || progress.phase === 'uploading' ? 'active' : 'done';
  const identify = uploading === 'done' ? stageState(progress, 'identify', 'done') : 'pending';
  const taxonomy = stageState(progress, 'taxonomy', identify);
  const occurrence = stageState(progress, 'occurrence', taxonomy);
  const rank = stageState(progress, 'rank', occurrence);
  const enrich = stageState(progress, 'enrich', rank);
  return [
    {
      key: 'upload',
      label: progress.phase === 'preparing' ? 'Preparing your photo' : 'Uploading your photo',
      note:
        progress.phase === 'uploading' && progress.fraction > 0
          ? formatPercent(progress.fraction)
          : undefined,
      state: uploading,
    },
    { key: 'identify', label: 'Identifying the species', source, state: identify },
    { key: 'taxonomy', label: 'Matching official names', source: 'GBIF', state: taxonomy },
    {
      key: 'occurrence',
      label: 'Checking records near you',
      source: 'GBIF',
      state: occurrence,
      note:
        occurrence === 'skipped' || (!locationKnown && occurrence === 'pending')
          ? 'Location not used'
          : undefined,
    },
    { key: 'rank', label: 'Weighing the evidence', state: rank },
    {
      key: 'enrich',
      label: 'Gathering field-guide details',
      source: 'Wikipedia · iNaturalist',
      state: enrich,
    },
  ];
}

function RowIcon({ state }: { state: RowState }) {
  if (state === 'done')
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-moss text-white">
        <Icon name="check" className="h-4 w-4" />
      </span>
    );
  if (state === 'active')
    return (
      <span
        className="h-7 w-7 animate-spin rounded-full border-[3px] border-moss-soft border-t-moss motion-reduce:animate-none"
        aria-hidden
      />
    );
  if (state === 'skipped')
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-paper-deep text-ink-muted">
        –
      </span>
    );
  return <span className="h-7 w-7 rounded-full border-2 border-line" aria-hidden />;
}

const STATE_TEXT: Record<RowState, string> = {
  pending: 'waiting',
  active: 'in progress',
  done: 'done',
  skipped: 'skipped',
};

export function AnalysisProgress() {
  const { state } = useSession();
  const { status: locationStatus } = useLocationState();
  const { progress } = state;
  const last = state.images.at(-1);
  const category = getCategory(state.category);
  const rows = buildRows(
    progress,
    category.identificationSource ?? 'identification service',
    locationStatus === 'granted' || locationStatus === 'requesting' || locationStatus === 'unknown',
  );
  const allDone = rows.every((r) => r.state === 'done' || r.state === 'skipped');
  const active = rows.find((r) => r.state === 'active');

  return (
    <div className="space-y-4" aria-busy={!allDone} data-testid="analysis">
      <Card as="div" className="overflow-hidden !p-0">
        <div className="relative bg-ink">
          {last && (
            <img
              src={last.url}
              alt="Photo being identified"
              className={`max-h-[42vh] w-full object-cover transition duration-500 ${allDone ? '' : 'brightness-90 saturate-[0.85]'}`}
            />
          )}
          {!allDone && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
              <div className="scan-grid absolute inset-0" />
              <div className="scan-line" />
              <div className="reticle absolute inset-[12%]">
                {[
                  'left-0 top-0 border-l-4 border-t-4 rounded-tl-xl',
                  'right-0 top-0 border-r-4 border-t-4 rounded-tr-xl',
                  'left-0 bottom-0 border-l-4 border-b-4 rounded-bl-xl',
                  'right-0 bottom-0 border-r-4 border-b-4 rounded-br-xl',
                ].map((c) => (
                  <span key={c} className={`absolute h-10 w-10 border-[#d6f5c7] ${c}`} />
                ))}
              </div>
            </div>
          )}
          {allDone && (
            <div
              className="fade-up absolute inset-0 flex items-center justify-center bg-moss/30"
              aria-hidden
            >
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-moss text-white shadow-lg">
                <Icon name="check" className="h-9 w-9" />
              </span>
            </div>
          )}
          <p className="absolute inset-x-3 bottom-3 rounded-xl bg-black/55 px-3 py-2 text-center text-sm font-semibold text-white backdrop-blur-sm">
            {allDone ? 'Analysis complete' : `${active?.label ?? 'Working'}…`}
          </p>
        </div>

        <div className="p-5">
          <h1 className="text-xl font-bold">
            {allDone ? 'Here’s what we found' : 'Analyzing your photo'}
          </h1>
          <p className="sr-only" role="status" aria-live="polite" data-testid="progress-label">
            {allDone
              ? 'Analysis complete'
              : active
                ? `${active.label}, ${STATE_TEXT[active.state]}`
                : ''}
          </p>

          <ol className="mt-4 space-y-3" data-testid="analysis-steps">
            {rows.map((row) => (
              <li
                key={row.key}
                className="flex items-center gap-3"
                data-state={row.state}
                data-step={row.key}
              >
                <RowIcon state={row.state} />
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-semibold leading-tight ${row.state === 'pending' ? 'text-ink-muted' : 'text-ink'}`}
                  >
                    {row.label}
                    <span className="sr-only"> — {STATE_TEXT[row.state]}</span>
                  </p>
                  {(row.source || row.note) && (
                    <p className="text-sm text-ink-muted">
                      {[row.source, row.note].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>

          {progress.preview && progress.preview.length > 0 && (
            <div
              className="fade-up mt-5 rounded-2xl bg-paper-deep p-3"
              data-testid="analysis-preview"
            >
              <p className="text-xs font-bold uppercase tracking-[0.12em] text-ink-muted">
                First look from {category.identificationSource ?? 'the image model'}
              </p>
              <ul className="mt-2 space-y-1">
                {progress.preview.map((p) => (
                  <li key={p.scientificName} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate">
                      <span className="font-semibold">{displayName(p)}</span>{' '}
                      {p.commonName && (
                        <span className="sci text-ink-soft">{p.scientificName}</span>
                      )}
                    </span>
                    <span className="shrink-0 font-bold tabular-nums">
                      {formatPercent(p.visualConfidence)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-ink-muted">
                Image-match scores before local evidence is weighed in.
              </p>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
