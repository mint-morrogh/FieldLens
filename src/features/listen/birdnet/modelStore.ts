/**
 * Downloading, checking and removing the on-device BirdNET model (page side). Files go into
 * their own Cache Storage bucket with the licence notice beside them, each verified against
 * its SHA-256 first. Components read the state with `useBirdnetModel()`.
 */
import { useSyncExternalStore } from 'react';
import { birdnetClient, stopBirdnet } from './client';
import {
  BIRDNET_CACHE,
  BIRDNET_FILES,
  BIRDNET_LOCATION_URL,
  BIRDNET_MODEL_REVISION,
  BIRDNET_MODEL_VERSION,
  BIRDNET_RUNTIME_CACHE,
  BIRDNET_SOURCE_URL,
  BIRDNET_TOTAL_BYTES,
  COMPLETE_MARKER,
  LICENSE_FILE,
  LICENSE_TEXT,
  cacheKey,
  fileUrl,
  type ModelFile,
} from './manifest';

export type ModelStatus = 'checking' | 'unsupported' | 'absent' | 'downloading' | 'ready' | 'error';

export type ModelState = {
  status: ModelStatus;
  /** Bytes downloaded so far (while downloading). */
  loaded: number;
  total: number;
  error?: string;
  /**
   * Set while `absent` when an older download is on the device: how much the update needs.
   * Its unchanged files are reused, so only the new ones are fetched.
   */
  update?: { bytes: number };
};

let state: ModelState = { status: 'checking', loaded: 0, total: BIRDNET_TOTAL_BYTES };
const listeners = new Set<() => void>();
let controller: AbortController | undefined;

function set(next: Partial<ModelState>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

export function getModelState(): ModelState {
  return state;
}

/** Cache Storage, WebAssembly and workers: what the on-device mode needs at a minimum. */
export function onDeviceSupported(): boolean {
  return (
    typeof caches !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof WebAssembly !== 'undefined' &&
    typeof crypto !== 'undefined' &&
    !!crypto.subtle
  );
}

/** The "download complete" marker's revision, or undefined when there's no marker. */
async function markerRevision(cache: Cache): Promise<number | undefined> {
  const marker = await cache.match(cacheKey(COMPLETE_MARKER));
  if (!marker) return undefined;
  try {
    const { revision } = (await marker.json()) as { revision?: number };
    return revision ?? 1; // markers from before revisions were added
  } catch {
    return 1;
  }
}

/** Whether the complete, verified model for this app version is in the cache. */
export async function isModelReady(): Promise<boolean> {
  if (!onDeviceSupported()) return false;
  try {
    const cache = await caches.open(BIRDNET_CACHE);
    return (await markerRevision(cache)) === BIRDNET_MODEL_REVISION;
  } catch {
    return false;
  }
}

export async function refreshModelState(): Promise<ModelState> {
  if (state.status === 'downloading') return state;
  if (!onDeviceSupported()) {
    set({ status: 'unsupported' });
    return state;
  }
  try {
    const cache = await caches.open(BIRDNET_CACHE);
    const revision = await markerRevision(cache);
    if (revision === BIRDNET_MODEL_REVISION) {
      set({ status: 'ready', error: undefined, update: undefined });
    } else if (revision !== undefined) {
      let bytes = 0;
      for (const file of BIRDNET_FILES) {
        if (!(await cache.match(cacheKey(file.path)))) bytes += file.bytes;
      }
      set({ status: 'absent', error: undefined, update: { bytes } });
    } else {
      set({ status: 'absent', error: undefined, update: undefined });
    }
  } catch {
    set({ status: 'absent', error: undefined, update: undefined });
  }
  return state;
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchFile(
  file: ModelFile,
  signal: AbortSignal,
  onBytes: (n: number) => void,
  fetchImpl: typeof fetch,
): Promise<ArrayBuffer> {
  const url = fileUrl(file.path, BIRDNET_SOURCE_URL, BIRDNET_LOCATION_URL);
  const res = await fetchImpl(url, { signal, cache: 'no-store' });
  if (!res.ok) throw new Error(`Download failed (${res.status}).`);
  let buffer: ArrayBuffer;
  if (res.body) {
    const reader = res.body.getReader();
    const out = new Uint8Array(file.bytes);
    let at = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (at + value.length > out.length) throw new Error('A model file was larger than expected.');
      out.set(value, at);
      at += value.length;
      onBytes(value.length);
    }
    buffer = out.buffer.slice(0, at);
  } else {
    buffer = await res.arrayBuffer();
    onBytes(buffer.byteLength);
  }
  if (buffer.byteLength !== file.bytes) throw new Error('A model file was incomplete.');
  const digest = hex(await crypto.subtle.digest('SHA-256', buffer));
  if (digest !== file.sha256) throw new Error('A model file didn’t match its checksum.');
  return buffer;
}

function contentType(path: string): string {
  if (path.endsWith('.json')) return 'application/json';
  if (path.endsWith('.txt')) return 'text/plain; charset=utf-8';
  return 'application/octet-stream';
}

/**
 * Downloads every file (skipping ones already cached from an interrupted download), verifies
 * it, and marks the model complete. Asks the browser to keep the storage (persist) first.
 */
export async function downloadModel(fetchImpl: typeof fetch = fetch): Promise<void> {
  if (state.status === 'downloading') return;
  if (!onDeviceSupported()) {
    set({ status: 'unsupported' });
    return;
  }
  controller = new AbortController();
  const { signal } = controller;
  set({ status: 'downloading', loaded: 0, error: undefined });
  try {
    let free = Infinity;
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.quota !== undefined && estimate.usage !== undefined) {
        free = estimate.quota - estimate.usage;
      }
      // Makes eviction under storage pressure less likely (a no-op where it isn't granted).
      await navigator.storage?.persist?.();
    } catch {
      /* storage estimates aren't available everywhere */
    }
    if (free < BIRDNET_TOTAL_BYTES * 1.1) {
      throw new Error('There isn’t enough free storage on this device for the model.');
    }
    const cache = await caches.open(BIRDNET_CACHE);
    let loaded = 0;
    let shown = 0;
    // Re-render at most every ~0.5% of the download, not on every network chunk.
    const progress = (n: number) => {
      loaded += n;
      if (loaded - shown >= BIRDNET_TOTAL_BYTES / 200) {
        shown = loaded;
        set({ loaded });
      }
    };
    for (const file of BIRDNET_FILES) {
      const key = cacheKey(file.path);
      if (await cache.match(key)) {
        progress(file.bytes);
        continue;
      }
      const buffer = await fetchFile(file, signal, progress, fetchImpl);
      await cache.put(
        key,
        new Response(buffer, { headers: { 'Content-Type': contentType(file.path) } }),
      );
    }
    await cache.put(
      cacheKey(LICENSE_FILE),
      new Response(LICENSE_TEXT, { headers: { 'Content-Type': contentType(LICENSE_FILE) } }),
    );
    await cache.put(
      cacheKey(COMPLETE_MARKER),
      Response.json({
        version: BIRDNET_MODEL_VERSION,
        revision: BIRDNET_MODEL_REVISION,
        source: BIRDNET_SOURCE_URL,
        locationSource: BIRDNET_LOCATION_URL,
        files: BIRDNET_FILES.map((f) => f.path),
        downloadedAt: new Date().toISOString(),
      }),
    );
    // Drop files an older revision needed that this one doesn't (e.g. the old location model).
    try {
      const keep = new Set(
        [...BIRDNET_FILES.map((f) => f.path), LICENSE_FILE, COMPLETE_MARKER].map((p) =>
          cacheKey(p),
        ),
      );
      for (const request of (await cache.keys?.()) ?? []) {
        if (!keep.has(request.url)) await cache.delete(request);
      }
    } catch {
      /* leftovers only cost space; Remove Model clears everything */
    }
    set({ status: 'ready', loaded: BIRDNET_TOTAL_BYTES, update: undefined });
    // Start the worker once while online, so the service worker caches its script (and the
    // WASM runtime, if that's the backend used) for offline use. Failures here are harmless:
    // identification falls back to the Space.
    void birdnetClient()
      .load()
      .catch(() => undefined)
      .finally(stopBirdnet);
  } catch (e) {
    if (signal.aborted) {
      set({ status: 'absent', loaded: 0 });
      return;
    }
    set({
      status: 'error',
      error:
        e instanceof Error && e.message
          ? e.message
          : 'The model couldn’t be downloaded. Check your connection and try again.',
    });
  } finally {
    controller = undefined;
  }
}

/** Stops a download in progress. Files already fetched stay cached for the next try. */
export function cancelDownload(): void {
  controller?.abort();
}

/** Deletes the model and its licence file from this device. */
export async function removeModel(): Promise<void> {
  cancelDownload();
  stopBirdnet();
  try {
    await Promise.all([caches.delete(BIRDNET_CACHE), caches.delete(BIRDNET_RUNTIME_CACHE)]);
  } finally {
    set({ status: 'absent', loaded: 0, error: undefined });
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** The model's download state; call `refreshModelState()` once to check the cache. */
export function useBirdnetModel(): ModelState {
  return useSyncExternalStore(subscribe, getModelState, getModelState);
}
