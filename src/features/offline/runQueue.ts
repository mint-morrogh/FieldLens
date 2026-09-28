/**
 * The app's wiring for the offline queue: the real identify call and Field Journal save,
 * notifications, and a small store the UI reads (running / recently identified).
 */
import type { IdentifyResponse } from '../../../shared/types';
import { identify } from '../../lib/api';
import { displayName } from '../../lib/format';
import { saveToHistory } from '../identification/SessionContext';
import { showReadyNotification } from './notify';
import { processQueue, type QueueDeps, type QueueRunSummary } from './processQueue';
import type { QueuedIdentification } from './queueTypes';

export type IdentifiedNote = { id: string; name: string };

type RunnerState = {
  running: boolean;
  /** Queued photos identified since the last toast was dismissed, newest last. */
  identified: IdentifiedNote[];
  /** Total identified this session; lets lists of observations refresh. */
  identifiedCount: number;
};

let state: RunnerState = { running: false, identified: [], identifiedCount: 0 };
const listeners = new Set<() => void>();

function setState(patch: Partial<RunnerState>) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener();
}

export function subscribeRunner(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getRunnerState(): RunnerState {
  return state;
}

export function dismissIdentified() {
  setState({ identified: [] });
}

export function saveQueuedResult(
  item: QueuedIdentification,
  result: IdentifyResponse,
): Promise<boolean> {
  const first = item.images[0];
  return saveToHistory(
    item.id,
    result,
    first && { blob: first.blob, original: item.photo ? { blob: item.photo } : undefined },
    new Date(item.capturedAt),
  );
}

function announce(item: QueuedIdentification, result: IdentifyResponse) {
  const top = result.candidates[0];
  const name = top ? displayName(top) : 'Your photo';
  setState({
    identified: [...state.identified, { id: item.id, name }],
    identifiedCount: state.identifiedCount + 1,
  });
  // In the app, the quiet toast is enough; the system notification is for when it's hidden.
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    void showReadyNotification(
      item.id,
      `Identified: ${name}`,
      'A photo you saved without signal is ready in your Field Journal.',
    );
  }
}

const defaultDeps: QueueDeps = {
  identify: (req) => identify(req),
  save: saveQueuedResult,
  onIdentified: announce,
};

/** Identifies whatever is due in the queue. Safe to call often. */
export async function runQueue(options: { force?: boolean } = {}): Promise<QueueRunSummary> {
  setState({ running: true });
  try {
    return await processQueue(defaultDeps, options);
  } finally {
    setState({ running: false });
  }
}
