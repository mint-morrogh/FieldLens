import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { toApproxLocation } from '../../../shared/geo';
import type { ApproxLocation } from '../../../shared/types';

export type LocationStatus =
  'unknown' | 'requesting' | 'granted' | 'denied' | 'declined' | 'unavailable';

type LocationState = {
  status: LocationStatus;
  /** Rounded to the privacy grid immediately; precise coordinates are never kept. */
  location?: ApproxLocation;
  request: () => Promise<ApproxLocation | undefined>;
  decline: () => void;
  /** A fresh approximate location for a request; prompts if the user hasn't decided yet. */
  current: () => Promise<ApproxLocation | undefined>;
};

const CHOICE_KEY = 'fieldlens.locationChoice';
const MAX_AGE_MS = 5 * 60 * 1000;

const LocationContext = createContext<LocationState | null>(null);

function readChoice(): string | null {
  try {
    return localStorage.getItem(CHOICE_KEY);
  } catch {
    return null;
  }
}
function writeChoice(value: string | null) {
  try {
    if (value) localStorage.setItem(CHOICE_KEY, value);
    else localStorage.removeItem(CHOICE_KEY);
  } catch {
    /* ignore */
  }
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) =>
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: false,
      maximumAge: MAX_AGE_MS,
      timeout: 12_000,
    }),
  );
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [status, setStatus] = useState<LocationStatus>(() => {
    if (!supported) return 'unavailable';
    const choice = readChoice();
    return choice === 'declined' ? 'declined' : choice === 'denied' ? 'denied' : 'unknown';
  });
  const [location, setLocation] = useState<ApproxLocation>();
  const fetchedAt = useRef(0);
  // Mirrors of state for `current`, so callers holding an older reference still see
  // the latest permission (e.g. a retry right after the user grants location).
  const latest = useRef({ status, location });
  useEffect(() => {
    latest.current = { status, location };
  }, [status, location]);

  const fetchLocation = useCallback(async (): Promise<ApproxLocation | undefined> => {
    if (!supported) return undefined;
    setStatus('requesting');
    try {
      const pos = await getPosition();
      const approx = toApproxLocation(pos.coords.latitude, pos.coords.longitude);
      fetchedAt.current = Date.now();
      latest.current = { status: 'granted', location: approx };
      setLocation(approx);
      setStatus('granted');
      writeChoice('granted');
      return approx;
    } catch (error) {
      const denied = (error as GeolocationPositionError)?.code === 1;
      setStatus(denied ? 'denied' : 'unavailable');
      if (denied) writeChoice('denied');
      setLocation(undefined);
      return undefined;
    }
  }, [supported]);

  // On open: use location if already granted, and ask once on first launch.
  // After a denial or "Not Now" we never prompt again automatically.
  useEffect(() => {
    if (!supported) return;
    const choice = readChoice();
    if (choice === 'declined') return;
    let cancelled = false;
    const perms = navigator.permissions;
    const decide = (state?: PermissionState) => {
      if (cancelled) return;
      if (state === 'denied') setStatus('denied');
      // Ask unless the user previously denied it (Safari may reset "granted" between visits).
      else if (state === 'granted' || choice !== 'denied') void fetchLocation();
    };
    if (perms?.query) {
      perms
        .query({ name: 'geolocation' as PermissionName })
        .then((result) => decide(result.state))
        .catch(() => decide());
    } else {
      // e.g. older iOS Safari without the Permissions API
      decide();
    }
    return () => {
      cancelled = true;
    };
  }, [supported, fetchLocation]);

  const decline = useCallback(() => {
    writeChoice('declined');
    setStatus('declined');
    setLocation(undefined);
  }, []);

  const current = useCallback(async () => {
    const { status: s, location: loc } = latest.current;
    if (s === 'declined' || s === 'unavailable') return undefined;
    if (s === 'granted' && loc && Date.now() - fetchedAt.current < MAX_AGE_MS) return loc;
    // Stale, undecided (startup prompt still open), or previously denied: ask the browser.
    // A denial answers instantly without a prompt, so this never nags.
    return fetchLocation();
  }, [fetchLocation]);

  const value = useMemo(
    () => ({ status, location, request: fetchLocation, decline, current }),
    [status, location, fetchLocation, decline, current],
  );
  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocationState(): LocationState {
  const ctx = useContext(LocationContext);
  if (!ctx) throw new Error('useLocationState must be used inside LocationProvider');
  return ctx;
}
