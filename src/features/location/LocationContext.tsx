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
  /** Returns a reasonably fresh location if permission was already granted, without prompting. */
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
    return readChoice() === 'declined' ? 'declined' : 'unknown';
  });
  const [location, setLocation] = useState<ApproxLocation>();
  const fetchedAt = useRef(0);

  const fetchLocation = useCallback(async (): Promise<ApproxLocation | undefined> => {
    if (!supported) return undefined;
    setStatus('requesting');
    try {
      const pos = await getPosition();
      const approx = toApproxLocation(pos.coords.latitude, pos.coords.longitude);
      fetchedAt.current = Date.now();
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

  // If permission is already granted, pick up a location silently. Never prompt on load.
  useEffect(() => {
    if (!supported || readChoice() === 'declined') return;
    let cancelled = false;
    const perms = navigator.permissions;
    if (!perms?.query) return;
    perms
      .query({ name: 'geolocation' as PermissionName })
      .then((result) => {
        if (cancelled) return;
        if (result.state === 'granted') void fetchLocation();
        else if (result.state === 'denied') setStatus('denied');
      })
      .catch(() => undefined);
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
    if (status !== 'granted') return undefined;
    if (location && Date.now() - fetchedAt.current < MAX_AGE_MS) return location;
    return fetchLocation();
  }, [status, location, fetchLocation]);

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
