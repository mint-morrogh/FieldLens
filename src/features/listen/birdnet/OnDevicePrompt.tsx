import { useEffect, useState } from 'react';
import { setSetting, useSetting } from '../../../lib/settings';
import { useOnline } from '../../../lib/useOnline';
import { BIRDNET_TOTAL_BYTES } from './manifest';
import { cancelDownload, downloadModel, refreshModelState, useBirdnetModel } from './modelStore';

/** "Not now" turns the full card into a one-line reminder on later visits. */
const DEFERRED_KEY = 'fieldlens.birdnetPromptDeferred';

const mb = (bytes: number) => `${Math.round(bytes / 1_000_000)} MB`;

function readDeferred(): boolean {
  try {
    return localStorage.getItem(DEFERRED_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeDeferred(value: boolean): void {
  try {
    if (value) localStorage.setItem(DEFERRED_KEY, 'true');
    else localStorage.removeItem(DEFERRED_KEY);
  } catch {
    /* storage unavailable: the card just shows again next time */
  }
}

const CARD = 'rounded-2xl border border-white/15 bg-black/45 p-4 backdrop-blur-xl';
const PRIMARY =
  'min-h-11 rounded-full bg-white px-4 text-[0.95rem] font-semibold text-black hover:bg-white/90';
const QUIET = 'min-h-11 rounded-full px-4 text-[0.95rem] font-semibold text-white/75';

/**
 * Offers the on-device model where it's used: on the Calls screen, whenever this browser can
 * run it but it isn't downloaded (or an older download needs updating). Recording keeps
 * working meanwhile; calls are identified online until the model is ready. People who turned
 * the setting off after downloading aren't asked again.
 */
export function OnDevicePrompt({ busy }: { busy: boolean }) {
  const model = useBirdnetModel();
  const enabled = useSetting('onDeviceCalls');
  const online = useOnline();
  const [deferred, setDeferred] = useState(readDeferred);
  const [hidden, setHidden] = useState(false);
  const [justReady, setJustReady] = useState(false);

  useEffect(() => {
    void refreshModelState();
  }, []);

  const start = () => {
    setSetting('onDeviceCalls', true);
    writeDeferred(false);
    setDeferred(false);
    void downloadModel().then(() => setJustReady(true));
  };

  if (model.status === 'downloading') {
    const share = model.total ? Math.min(1, model.loaded / model.total) : 0;
    return (
      <div className={`mx-4 mt-4 ${CARD}`} data-testid="birdnet-prompt" aria-live="polite">
        <p className="text-[0.95rem] font-semibold">
          Downloading BirdNET… {mb(model.loaded)} of {mb(model.total)}
        </p>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15"
          role="progressbar"
          aria-label="Model download"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(share * 100)}
        >
          <div
            className="h-full rounded-full bg-white"
            style={{ width: `${Math.max(2, share * 100)}%` }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-sm text-white/65">You can record while it downloads.</p>
          <button type="button" className={QUIET} onClick={cancelDownload}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (model.status === 'ready') {
    if (!justReady || busy) return null;
    return (
      <p
        className={`mx-4 mt-4 ${CARD} text-[0.95rem]`}
        role="status"
        data-testid="birdnet-prompt-ready"
      >
        BirdNET is on this phone. Calls are now identified here, and recordings aren’t uploaded.
      </p>
    );
  }

  // Nothing to offer: can't run here, still checking, offline, mid-recording, or dismissed.
  const offer = model.status === 'absent' || model.status === 'error';
  if (!offer || !online || busy || hidden) return null;
  // Someone who downloaded, then switched the feature off, has made their choice.
  if (!enabled && model.update) return null;

  const bytes = model.update ? model.update.bytes : BIRDNET_TOTAL_BYTES;
  const action = model.update ? `Update Model (${mb(bytes)})` : `Download (${mb(bytes)})`;

  if (deferred && model.status !== 'error') {
    return (
      <button
        type="button"
        onClick={start}
        className="mx-4 mt-4 rounded-full border border-white/15 bg-black/45 px-4 py-2.5 text-left text-sm text-white/80 backdrop-blur-xl"
        data-testid="birdnet-prompt-compact"
      >
        Identify calls on this phone: {action}
      </button>
    );
  }

  return (
    <div className={`mx-4 mt-4 ${CARD}`} data-testid="birdnet-prompt">
      <p className="font-semibold">
        {model.update ? 'Update BirdNET on this phone' : 'Identify calls on this phone'}
      </p>
      <p className="mt-1 text-sm text-white/70">
        {model.status === 'error'
          ? model.error
          : model.update
            ? `An improved location model is available (${mb(bytes)}). Until it’s updated, calls are identified online.`
            : `Download BirdNET once (${mb(bytes)}, best on Wi-Fi) and recordings stay on your phone. Until then, calls are identified online.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className={PRIMARY}
          onClick={start}
          data-testid="birdnet-prompt-download"
        >
          {model.status === 'error' ? 'Try Again' : action}
        </button>
        <button
          type="button"
          className={QUIET}
          onClick={() => {
            writeDeferred(true);
            setDeferred(true);
            setHidden(true);
          }}
        >
          Not now
        </button>
      </div>
    </div>
  );
}
