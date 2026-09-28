import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DONE_KEY,
  USES_KEY,
  _resetInstallPromptForTests,
  captureInstallEvents,
  dismissInstall,
  getUseCount,
  installOffer,
  isStandalone,
  recordUse,
  useInstallPrompt,
} from '../../src/lib/installPrompt';

const base = {
  uses: 2,
  done: false,
  standalone: false,
  platform: 'android-chrome' as const,
  hasNativePrompt: true,
};

function fakeInstallEvent(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: string }>;
  };
  event.prompt = vi.fn(() => Promise.resolve());
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe('installOffer', () => {
  it('waits for the second use', () => {
    expect(installOffer({ ...base, uses: 0 })).toBeNull();
    expect(installOffer({ ...base, uses: 1 })).toBeNull();
    expect(installOffer({ ...base, uses: 2 })).toBe('native');
    expect(installOffer({ ...base, uses: 7 })).toBe('native');
  });

  it('never shows when installed, dismissed or running standalone', () => {
    expect(installOffer({ ...base, done: true })).toBeNull();
    expect(installOffer({ ...base, standalone: true })).toBeNull();
    expect(installOffer({ ...base, platform: 'ios-app', hasNativePrompt: false })).toBeNull();
  });

  it('gives iOS Safari instructions, and nothing where install is unsupported', () => {
    expect(installOffer({ ...base, platform: 'ios-safari', hasNativePrompt: false })).toBe('ios');
    expect(installOffer({ ...base, platform: 'ios-chrome', hasNativePrompt: false })).toBeNull();
    expect(
      installOffer({ ...base, platform: 'desktop-firefox', hasNativePrompt: false }),
    ).toBeNull();
    expect(
      installOffer({ ...base, platform: 'android-chrome', hasNativePrompt: false }),
    ).toBeNull();
  });
});

describe('install prompt storage and events', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetInstallPromptForTests();
  });

  it('counts uses and stops counting once done', () => {
    recordUse();
    recordUse();
    expect(getUseCount()).toBe(2);
    dismissInstall();
    expect(localStorage.getItem(DONE_KEY)).toBe('dismissed');
    recordUse();
    expect(getUseCount()).toBe(2);
  });

  it('treats a corrupt count as zero and survives storage errors', () => {
    localStorage.setItem(USES_KEY, 'nonsense');
    expect(getUseCount()).toBe(0);
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => recordUse()).not.toThrow();
    expect(getUseCount()).toBe(0);
    spy.mockRestore();
    set.mockRestore();
  });

  it('detects standalone display mode and navigator.standalone', () => {
    const win = (standalone: boolean, nav?: boolean) =>
      ({
        matchMedia: () => ({ matches: standalone }),
        navigator: { standalone: nav },
      }) as unknown as Window;
    expect(isStandalone(win(false))).toBe(false);
    expect(isStandalone(win(true))).toBe(true);
    expect(isStandalone(win(false, true))).toBe(true);
  });

  it('captures beforeinstallprompt, prompts, and remembers the install', async () => {
    captureInstallEvents(window);
    recordUse();
    recordUse();
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.offer).toBeNull(); // jsdom UA: no native event yet, not iOS

    const event = fakeInstallEvent('accepted');
    act(() => {
      window.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(result.current.offer).toBe('native');

    await act(async () => {
      expect(await result.current.install()).toBe(true);
    });
    expect(event.prompt).toHaveBeenCalled();
    expect(localStorage.getItem(DONE_KEY)).toBe('installed');
    expect(result.current.offer).toBeNull();
  });

  it('declining the browser dialog counts as a dismissal', async () => {
    captureInstallEvents(window);
    recordUse();
    recordUse();
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(fakeInstallEvent('dismissed'));
    });
    await act(async () => {
      expect(await result.current.install()).toBe(false);
    });
    expect(localStorage.getItem(DONE_KEY)).toBe('dismissed');
    expect(result.current.offer).toBeNull();
  });

  it('hides after appinstalled fires', () => {
    captureInstallEvents(window);
    recordUse();
    recordUse();
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(fakeInstallEvent('accepted'));
    });
    expect(result.current.offer).toBe('native');
    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });
    expect(result.current.offer).toBeNull();
    expect(localStorage.getItem(DONE_KEY)).toBe('installed');
  });

  it('re-renders when a use is recorded', () => {
    captureInstallEvents(window);
    const { result } = renderHook(() => useInstallPrompt());
    act(() => {
      window.dispatchEvent(fakeInstallEvent('accepted'));
    });
    expect(result.current.offer).toBeNull();
    act(() => recordUse());
    expect(result.current.offer).toBeNull();
    act(() => recordUse());
    expect(result.current.offer).toBe('native');
  });
});
