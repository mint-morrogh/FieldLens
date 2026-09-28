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

/** BioCLIP 2 (ViT-L/14), as configured in hf-space/app.py: checked against the model itself. */
const BIOCLIP_SPEC = {
  input: 224,
  patch: 14,
  grid: 16,
  layers: 24,
  dims: 768,
  taxa: '867,455',
};

type Phase = 'load' | 'scan' | 'refine' | 'done';

/**
 * What the image model actually does, drawn over the photo and driven by the real stages:
 * the photo is resized to 224 × 224, cut into a 16 × 16 grid of 14 px patches that are read
 * in order as tokens, encoded into one 768-number embedding and compared with every taxon's
 * text embedding. The numbers are the model's real configuration; the progress bar is the
 * share of finished stages. Pl@ntNet doesn't publish its architecture, so plants get the
 * same steps without BioCLIP's numbers.
 */
function ClassifierVisual({
  url,
  phase,
  label,
  bioclip,
  model,
  fraction,
  topGuess,
}: {
  url: string;
  phase: Phase;
  label: string;
  bioclip: boolean;
  model: string;
  fraction: number;
  topGuess?: string;
}) {
  const { grid, input, patch, layers, dims, taxa } = BIOCLIP_SPEC;
  const steps: [string, string][] = bioclip
    ? [
        ['resize', `${input} × ${input} px`],
        ['patches', `${grid} × ${grid} · ${patch} px`],
        ['encode', `ViT-L/${patch} · ${layers} layers → ${dims}-d`],
        ['compare', `cosine vs ${taxa} taxa`],
      ]
    : [
        ['resize', 'model input'],
        ['encode', 'image embedding'],
        ['compare', 'species in the model'],
      ];
  const encoding = phase === 'scan' || phase === 'load';

  return (
    <div className="classifier bg-[#0d100c] text-white" data-phase={phase}>
      <div className="relative mx-auto aspect-square w-full max-w-[26rem] overflow-hidden">
        {/* The model sees a square resize of the crop; show exactly that. */}
        <img
          src={url}
          alt="Photo being identified"
          className="classifier-photo absolute inset-0 h-full w-full"
        />
        <div
          className="classifier-grid absolute inset-0"
          style={{ backgroundSize: `${100 / grid}% ${100 / grid}%` }}
          aria-hidden
        />
        {encoding && (
          <div
            className="absolute inset-0 grid"
            style={{
              gridTemplateColumns: `repeat(${grid}, 1fr)`,
              gridTemplateRows: `repeat(${grid}, 1fr)`,
            }}
            aria-hidden
          >
            {Array.from({ length: grid * grid }, (_, i) => (
              <span key={i} className="token" style={{ animationDelay: `${i * 9}ms` }} />
            ))}
          </div>
        )}
        {phase === 'done' && (
          <div className="fade-up absolute inset-0 flex items-center justify-center" aria-hidden>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#9fd08a] text-[#10180f]">
              <Icon name="check" className="h-8 w-8" />
            </span>
          </div>
        )}
      </div>

      <div className="border-t border-white/10 px-4 pb-4 pt-3">
        <div className="readout flex items-center justify-between text-[0.62rem] text-white/55">
          <span>{model}</span>
          <span>{Math.round(fraction * 100)}%</span>
        </div>
        <ol className="readout mt-2 space-y-1 text-[0.66rem]" aria-hidden>
          {steps.map(([k, v], i) => {
            const done = !encoding;
            return (
              <li
                key={k}
                className={`flex justify-between gap-3 ${done ? 'text-white/80' : 'step-live text-white/80'}`}
                style={done ? undefined : { animationDelay: `${i * 0.35}s` }}
              >
                <span>{k}</span>
                <span className="truncate text-right text-white/50 normal-case tracking-normal">
                  {v}
                </span>
              </li>
            );
          })}
          {topGuess && (
            <li className="fade-up flex justify-between gap-3 text-[#d6f5c7]">
              <span>top-1</span>
              <span className="truncate text-right normal-case tracking-normal">{topGuess}</span>
            </li>
          )}
        </ol>
        <p className="mt-3 text-sm font-semibold">{label}</p>
        <div className="mt-2 h-0.5 overflow-hidden rounded-full bg-white/15">
          <div
            className="h-full bg-[#9fd08a] transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(3, fraction * 100)}%` }}
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
  // Plants go to Pl@ntNet, except under Auto, where BioCLIP 2 looks at the photo first.
  const bioclip = state.category !== 'plant';

  return (
    <div className="space-y-4" aria-busy={!allDone} data-testid="analysis">
      <Card as="div" className="overflow-hidden !p-0">
        {last && (
          <ClassifierVisual
            url={last.url}
            phase={phase}
            label={allDone ? 'Analysis complete' : `${active?.label ?? 'Working'}…`}
            model={model}
            bioclip={bioclip}
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
