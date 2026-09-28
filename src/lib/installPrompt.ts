import { useEffect, useState, useSyncExternalStore } from 'react';
import { detectPlatform, type Platform } from './platform';

/**
 * "Add FieldLens to your home screen" nudge.
 *
 * A "use" is a completed identification that was saved to the Field Journal (photo or live).
 * From the second one onward we offer installation — natively where the browser supports
 * `beforeinstallprompt` (Chrome/Edge/Samsung on Android and desktop), or with short Share →
 * Add to Home Screen instructions in iPhone/iPad Safari. Never shown when already running
 * installed, and never again once dismissed or installed.
 */

export const USES_KEY = 'fieldlens.install.uses';
export const DONE_KEY = 'fieldlens.install.done'; // 'dismissed' | 'installed'
export const USES_BEFORE_PROMPT = 2;

/** Chrome's non-standard install event. */
export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
};

export type InstallOffer = 'native' | 'ios' | null;

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode, blocked): the nudge just won't persist */
  }
}

export function getUseCount(): number {
  const n = Number.parseInt(read(USES_KEY) ?? '0', 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function isInstallDone(): boolean {
  return read(DONE_KEY) !== null;
}

/** Pure decision: which nudge (if any) to show. */
export function installOffer(input: {
  uses: number;
  done: boolean;
  standalone: boolean;
  platform: Platform;
  hasNativePrompt: boolean;
}): InstallOffer {
  if (input.done || input.standalone || input.uses < USES_BEFORE_PROMPT) return null;
  if (input.hasNativePrompt) return 'native';
  // Only Safari can add to the home screen on iOS in a way we can describe reliably.
  if (input.platform === 'ios-safari') return 'ios';
  return null;
}

export function isStandalone(win: Window = window): boolean {
  try {
    return (
      win.matchMedia?.('(display-mode: standalone)').matches === true ||
      (win.navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

// --- Tiny store so React re-renders when the count, event or done flag change. ---

let deferred: BeforeInstallPromptEvent | null = null;
let version = 0;
const listeners = new Set<() => void>();
function emit() {
  version++;
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Count one completed identification. */
export function recordUse() {
  if (isInstallDone()) return;
  write(USES_KEY, String(getUseCount() + 1));
  emit();
}

export function dismissInstall() {
  write(DONE_KEY, 'dismissed');
  emit();
}

function markInstalled() {
  write(DONE_KEY, 'installed');
  deferred = null;
  emit();
}

/** Show the browser's install dialog. Resolves true if the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  // The event can only be used once.
  deferred = null;
  try {
    await event.prompt();
    const choice = await event.userChoice;
    if (choice.outcome === 'accepted') markInstalled();
    else dismissInstall();
    return choice.outcome === 'accepted';
  } catch {
    emit();
    return false;
  }
}

let captured: Window | null = null;
/**
 * Start listening for the install events. Idempotent; call as early as possible because
 * Chrome may fire `beforeinstallprompt` before React mounts.
 */
export function captureInstallEvents(win: Window = window) {
  if (captured === win) return;
  captured = win;
  win.addEventListener('beforeinstallprompt', (e) => {
    // Keep Chrome's own mini-infobar away; we offer it gently ourselves.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  win.addEventListener('appinstalled', markInstalled);
}

/** Test-only reset of module state. */
export function _resetInstallPromptForTests() {
  deferred = null;
  captured = null;
  listeners.clear();
  version = 0;
}

export function useInstallPrompt(): {
  offer: InstallOffer;
  install: () => Promise<boolean>;
  dismiss: () => void;
} {
  const snapshot = useSyncExternalStore(subscribe, () => version);
  const [platform] = useState(() => detectPlatform());
  // Also react to installs made from another tab/window mode change.
  const [standalone, setStandalone] = useState(() => isStandalone());
  useEffect(() => {
    const mq = window.matchMedia?.('(display-mode: standalone)');
    if (!mq?.addEventListener) return;
    const onChange = () => setStandalone(isStandalone());
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  void snapshot;
  const offer = installOffer({
    uses: getUseCount(),
    done: isInstallDone(),
    standalone,
    platform,
    hasNativePrompt: deferred !== null,
  });
  return { offer, install: promptInstall, dismiss: dismissInstall };
}
