import { useEffect } from 'react';
import { Button, Notice } from '../../../components/ui';
import { BIRDNET_LICENSE, BIRDNET_TOTAL_BYTES } from './manifest';
import {
  cancelDownload,
  downloadModel,
  refreshModelState,
  removeModel,
  useBirdnetModel,
} from './modelStore';

const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

/** BirdNET's credit and licence, which must accompany the model. */
export function BirdnetCredit() {
  return (
    <p className="text-xs text-ink-muted" data-testid="birdnet-credit">
      Model: {BIRDNET_LICENSE.credit} (
      <a href={BIRDNET_LICENSE.projectUrl} target="_blank" rel="noreferrer" className="underline">
        BirdNET
      </a>
      ), used unmodified under{' '}
      <a href={BIRDNET_LICENSE.url} target="_blank" rel="noreferrer" className="underline">
        {BIRDNET_LICENSE.name}
      </a>
      . Non-commercial use only.
    </p>
  );
}

/**
 * Download, progress and removal for the on-device bird call model. Shown under the setting
 * while it's on, and whenever the model is on the device (so it can always be removed).
 */
export function OnDeviceModel({ enabled }: { enabled: boolean }) {
  const model = useBirdnetModel();
  useEffect(() => {
    void refreshModelState();
  }, []);

  if (!enabled && model.status !== 'ready' && model.status !== 'downloading') return null;
  const share = model.total ? Math.min(1, model.loaded / model.total) : 0;

  return (
    <div className="space-y-3 rounded-2xl border border-line p-4" data-testid="birdnet-model">
      {model.status === 'checking' && <p className="text-sm text-ink-muted">Checking…</p>}
      {model.status === 'unsupported' && (
        <Notice tone="warn">
          This browser can’t run the model, so calls will keep being identified online.
        </Notice>
      )}
      {model.status === 'absent' && model.update && (
        <>
          <p className="text-sm text-ink-soft" data-testid="birdnet-update">
            An improved location model for BirdNET is available ({mb(model.update.bytes)}; the rest
            is already on this device). Until it’s updated, calls are identified online.
          </p>
          <Button size="sm" onClick={() => void downloadModel()} data-testid="birdnet-download">
            Update Model ({mb(model.update.bytes)})
          </Button>
        </>
      )}
      {model.status === 'absent' && !model.update && (
        <>
          <p className="text-sm text-ink-soft">
            One-time download of {mb(BIRDNET_TOTAL_BYTES)}, kept on this device. Best on Wi-Fi.
            Until it’s downloaded, calls are identified online.
          </p>
          <Button size="sm" onClick={() => void downloadModel()} data-testid="birdnet-download">
            Download Model ({mb(BIRDNET_TOTAL_BYTES)})
          </Button>
        </>
      )}
      {model.status === 'downloading' && (
        <>
          <p className="text-sm text-ink-soft" aria-live="polite">
            Downloading… {mb(model.loaded)} of {mb(model.total)}
          </p>
          <div
            className="h-2 overflow-hidden rounded-full bg-paper-deep"
            role="progressbar"
            aria-label="Model download"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(share * 100)}
          >
            <div
              className="h-full rounded-full bg-moss"
              style={{ width: `${Math.max(2, share * 100)}%` }}
            />
          </div>
          <Button variant="ghost" size="sm" onClick={cancelDownload}>
            Cancel
          </Button>
        </>
      )}
      {model.status === 'ready' && (
        <>
          <p className="text-sm text-ink-soft" data-testid="birdnet-ready">
            {enabled
              ? 'Downloaded. Recordings are identified on this device and aren’t uploaded; if the model can’t run, the call is identified online instead.'
              : `The model is still on this device (${mb(BIRDNET_TOTAL_BYTES)}).`}
          </p>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void removeModel()}
            data-testid="birdnet-remove"
          >
            Remove Model
          </Button>
        </>
      )}
      {model.status === 'error' && (
        <>
          <Notice tone="warn">{model.error}</Notice>
          <Button size="sm" onClick={() => void downloadModel()}>
            Try Again
          </Button>
        </>
      )}
      <BirdnetCredit />
    </div>
  );
}
