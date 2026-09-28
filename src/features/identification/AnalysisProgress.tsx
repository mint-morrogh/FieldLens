import { useEffect, useState } from 'react';
import { getTarget } from '../../../shared/categories';
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
export function buildRows(
  progress: Progress,
  source: string,
  locationKnown: boolean,
  autoDetect = false,
): Row[] {
  const uploading: RowState =
    progress.phase === 'preparing' || progress.phase === 'uploading' ? 'active' : 'done';
  const detect = uploading === 'done' ? stageState(progress, 'detect', 'done') : 'pending';
  const identify =
    uploading !== 'done'
      ? 'pending'
      : autoDetect
        ? stageState(progress, 'identify', detect)
        : stageState(progress, 'identify', 'done');
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
    ...(autoDetect
      ? [{ key: 'detect', label: 'Working out what it is', source: 'BioCLIP 2', state: detect }]
      : []),
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
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-moss text-on-accent">
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

/** Where the attention loupe looks next (fractions of the photo; top-left of the loupe). */
const LOUPE_STOPS: [number, number][] = [
  [0.33, 0.3],
  [0.08, 0.1],
  [0.55, 0.12],
  [0.58, 0.52],
  [0.12, 0.55],
  [0.36, 0.62],
  [0.62, 0.3],
  [0.2, 0.32],
];
const LOUPE = 0.34;
const ZOOM = 2.2;
const PATCH_COLS = 8;
const PATCH_ROWS = 6;

type Phase = 'load' | 'scan' | 'refine' | 'done';

/**
 * A picture of what the classifier does, driven by the real stages: while the image model
 * runs, the photo turns to high-contrast grayscale, a patch grid lights up (vision
 * transformers read images as patches) and a loupe hops between regions; colour returns
 * while names and local records are checked; the reticle locks on when it's done.
 */
function ClassifierVisual({
  url,
  phase,
  label,
  model,
  fraction,
  topGuess,
}: {
  url: string;
  phase: Phase;
  label: string;
  model: string;
  fraction: number;
  topGuess?: string;
}) {
  const [stop, setStop] = useState(0);
  const scanning = phase === 'scan' || phase === 'load';
  useEffect(() => {
    if (!scanning || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setStop((i) => (i + 1) % LOUPE_STOPS.length), 950);
    return () => clearInterval(t);
  }, [scanning]);
  const [lx, ly] = phase === 'done' ? [(1 - LOUPE) / 2, (1 - LOUPE) / 2] : LOUPE_STOPS[stop];
  // Zoomed view inside the loupe, centred on the loupe's centre.
  const zx = lx + LOUPE / 2 - LOUPE / (2 * ZOOM);
  const zy = ly + LOUPE / 2 - LOUPE / (2 * ZOOM);
  const scale = ZOOM / LOUPE;

  return (
    <div
      className={`classifier relative aspect-[4/3] w-full overflow-hidden bg-[#0d100c]`}
      data-phase={phase}
    >
      <img
        src={url}
        alt="Photo being identified"
        className="classifier-photo absolute inset-0 h-full w-full object-cover"
      />
      <div className="scan-grid absolute inset-0" aria-hidden />

      {/* Patch tokens */}
      <div
        className="classifier-patches absolute inset-0 grid"
        style={{
          gridTemplateColumns: `repeat(${PATCH_COLS}, 1fr)`,
          gridTemplateRows: `repeat(${PATCH_ROWS}, 1fr)`,
        }}
        aria-hidden
      >
        {Array.from({ length: PATCH_COLS * PATCH_ROWS }, (_, i) => (
          <span
            key={i}
            className="patch"
            style={{ animationDelay: `${((i * 37) % 23) * 0.11}s` }}
          />
        ))}
      </div>

      <div className="scan-line classifier-sweep" aria-hidden />

      {/* Attention loupe */}
      <div
        className="classifier-loupe absolute overflow-hidden rounded-lg"
        style={{
          left: `${lx * 100}%`,
          top: `${ly * 100}%`,
          width: `${LOUPE * 100}%`,
          height: `${LOUPE * 100}%`,
        }}
        aria-hidden
      >
        <img
          src={url}
          alt=""
          className="absolute max-w-none object-cover"
          style={{
            width: `${scale * 100}%`,
            height: `${scale * 100}%`,
            left: `${-zx * scale * 100}%`,
            top: `${-zy * scale * 100}%`,
          }}
        />
        <span className="readout absolute left-1.5 top-1 text-[0.55rem] text-[#d6f5c7]/90">
          x{lx.toFixed(2).slice(1)} y{ly.toFixed(2).slice(1)}
        </span>
      </div>

      {phase === 'done' && (
        <div className="fade-up absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#9fd08a] text-[#10180f] shadow-[0_0_0_8px_rgba(159,208,138,0.2)]">
            <Icon name="check" className="h-9 w-9" />
          </span>
        </div>
      )}

      {/* Readouts */}
      <div className="readout absolute inset-x-0 top-0 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-2.5 text-[0.62rem] text-white/80">
        <span className="flex items-center gap-1.5">
          <span
            className={`h-1.5 w-1.5 rounded-full ${phase === 'done' ? 'bg-[#9fd08a]' : 'live-dot bg-[#9fd08a]'}`}
          />
          {phase === 'done' ? 'Complete' : phase === 'refine' ? 'Refining' : 'Classifying'}
        </span>
        <span>{model}</span>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-8">
        {topGuess && (
          <p className="fade-up readout mb-1 truncate text-[0.62rem] text-[#d6f5c7]">
            Leading match · <span className="normal-case tracking-normal">{topGuess}</span>
          </p>
        )}
        <p className="text-sm font-semibold text-white">{label}</p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full rounded-full bg-[#9fd08a] transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(4, fraction * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

export function AnalysisProgress() {
  const { state } = useSession();
  const { status: locationStatus } = useLocationState();
  const { progress } = state;
  const last = state.images.at(-1);
  const category = getTarget(state.category);
  const rows = buildRows(
    progress,
    category.identificationSource ?? 'identification service',
    locationStatus === 'granted' || locationStatus === 'requesting' || locationStatus === 'unknown',
    state.category === 'auto',
  );
  const allDone = rows.every((r) => r.state === 'done' || r.state === 'skipped');
  const active = rows.find((r) => r.state === 'active');
  const finished = rows.filter((r) => r.state === 'done' || r.state === 'skipped').length;
  const fraction = finished / rows.length;
  const imageStep = (key: string) => rows.find((r) => r.key === key)?.state;
  const phase: Phase = allDone
    ? 'done'
    : imageStep('upload') === 'active'
      ? 'load'
      : imageStep('identify') === 'done'
        ? 'refine'
        : 'scan';
  const model =
    state.category === 'auto' ? 'Auto-detect' : (category.identificationSource ?? 'Image model');

  return (
    <div className="space-y-4" aria-busy={!allDone} data-testid="analysis">
      <Card as="div" className="overflow-hidden !p-0">
        {last && (
          <ClassifierVisual
            url={last.url}
            phase={phase}
            label={allDone ? 'Analysis complete' : `${active?.label ?? 'Working'}…`}
            model={model}
            fraction={fraction}
            topGuess={
              progress.preview?.[0]
                ? `${displayName(progress.preview[0])} ${formatPercent(progress.preview[0].visualConfidence)}`
                : undefined
            }
          />
        )}

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
