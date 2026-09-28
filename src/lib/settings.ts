import { useSyncExternalStore } from 'react';
import { CLIENT_IMAGE } from '../../shared/config';

/**
 * App settings, kept on the device in localStorage (one `fieldlens.settings.*` key each).
 * Every storage access is guarded: in private mode or with storage blocked, settings still
 * work for the session (held in memory) and fall back to sane defaults.
 *
 * Read with `useSettings()` / `useSetting(key)` in components, or `getSetting(key)` anywhere
 * else; change with `setSetting(key, value)`. Components re-render on change.
 */

export type Units = 'metric' | 'imperial';
export type CameraMode = 'live' | 'photo';

export interface Settings {
  /** Guess the group or name before the result appears. Off by default. */
  nameItFirst: boolean;
  /** How measurements are shown. Defaults from the device locale. */
  units: Units;
  /** Smaller uploads and fewer live frames sent for identification. */
  dataSaver: boolean;
  /** The home screen's main camera action. */
  defaultCameraMode: CameraMode;
}

export const SETTINGS_KEYS: Record<keyof Settings, string> = {
  nameItFirst: 'fieldlens.settings.nameItFirst',
  units: 'fieldlens.settings.units',
  dataSaver: 'fieldlens.settings.dataSaver',
  defaultCameraMode: 'fieldlens.settings.cameraMode',
};

/** Regions that measure in miles and pounds. */
const IMPERIAL_REGIONS = new Set(['US', 'LR', 'MM']);

function regionOf(tag: string): string | undefined {
  try {
    const locale = new Intl.Locale(tag);
    return locale.region ?? locale.maximize().region;
  } catch {
    return tag.split(/[-_]/)[1]?.toUpperCase();
  }
}

/** Imperial for the US (en-US, es-US…), metric everywhere else. */
export function defaultUnits(locales?: readonly string[]): Units {
  let list = locales;
  if (!list) {
    try {
      list = navigator.languages?.length ? navigator.languages : [navigator.language];
    } catch {
      list = [];
    }
  }
  const first = list.find(Boolean);
  if (!first) return 'metric';
  const region = regionOf(first);
  return region && IMPERIAL_REGIONS.has(region) ? 'imperial' : 'metric';
}

export function defaultSettings(): Settings {
  return { nameItFirst: false, units: defaultUnits(), dataSaver: false, defaultCameraMode: 'live' };
}

const parsers: { [K in keyof Settings]: (raw: string) => Settings[K] | undefined } = {
  nameItFirst: (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined),
  dataSaver: (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined),
  units: (raw) => (raw === 'metric' || raw === 'imperial' ? raw : undefined),
  defaultCameraMode: (raw) => (raw === 'live' || raw === 'photo' ? raw : undefined),
};

/** Values set this session, used when storage can't be written or read. */
let memory: Partial<Settings> = {};
let cache: Settings | undefined;
const listeners = new Set<() => void>();

function readStored<K extends keyof Settings>(key: K): Settings[K] | undefined {
  try {
    const raw = localStorage.getItem(SETTINGS_KEYS[key]);
    return raw === null ? undefined : parsers[key](raw);
  } catch {
    return undefined;
  }
}

function readAll(): Settings {
  const defaults = defaultSettings();
  const out = { ...defaults };
  for (const key of Object.keys(SETTINGS_KEYS) as (keyof Settings)[]) {
    const value = readStored(key) ?? memory[key];
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

/** All settings (a stable object until something changes). */
export function getSettings(): Settings {
  return (cache ??= readAll());
}

export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return getSettings()[key];
}

function emit() {
  cache = undefined;
  for (const l of listeners) l();
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  memory = { ...memory, [key]: value };
  try {
    localStorage.setItem(SETTINGS_KEYS[key], String(value));
  } catch {
    /* storage unavailable: kept in memory for this session */
  }
  emit();
}

/** Forget in-memory values and re-read storage (after local data is cleared). */
export function reloadSettings(): void {
  memory = {};
  emit();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith('fieldlens.settings.')) emit();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', onStorage);
  };
}

export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, getSettings, getSettings);
}

export function useSetting<K extends keyof Settings>(key: K): Settings[K] {
  return useSettings()[key];
}

/**
 * JPEG encoding for photos sent for identification. Data saver trades a little detail
 * (Pl@ntNet likes petal and leaf detail) for uploads roughly a third the size.
 */
export function uploadEncoding(dataSaver = getSetting('dataSaver')): {
  maxEdge: number;
  quality: number;
} {
  return dataSaver
    ? { maxEdge: 1024, quality: 0.8 }
    : { maxEdge: CLIENT_IMAGE.maxEdge, quality: CLIENT_IMAGE.quality };
}
