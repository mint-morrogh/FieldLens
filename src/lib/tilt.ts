/**
 * Which way the camera points (up, level or down), from DeviceOrientationEvent. Only the
 * bucket ever leaves the device. On iOS motion access needs a permission tap first
 * (`requestTiltPermission`, called from a user gesture); elsewhere readings just arrive.
 */
import type { TiltBucket } from '../../shared/types';

/** Camera at least 45° below the horizon counts as down; at least 35° above, as up. */
const DOWN_MAX_BETA = 45;
const UP_MIN_BETA = 125;
/** A reading older than this no longer describes the shot. */
const FRESH_MS = 1500;

type PermissionCtor = { requestPermission?: () => Promise<'granted' | 'denied'> };

let last: { bucket?: TiltBucket; at: number } | undefined;
let listening = false;
let asked = false;
const waiters = new Set<(bucket: TiltBucket | undefined) => void>();

/**
 * Bucket from the front-to-back tilt (beta). Held upright in portrait, beta is about 90° with
 * the rear camera on the horizon, 0° flat facing the ground and 180° facing the sky. In
 * landscape beta isn't the camera's pitch, so there's no reading.
 */
export function tiltBucket(
  beta: number | null | undefined,
  screenAngle = 0,
): TiltBucket | undefined {
  if (beta === null || beta === undefined || !Number.isFinite(beta)) return undefined;
  if (screenAngle % 180 !== 0) return undefined;
  if (beta < -60) return undefined;
  if (beta <= DOWN_MAX_BETA) return 'down';
  if (beta >= UP_MIN_BETA) return 'up';
  return 'level';
}

function screenAngle(): number {
  if (typeof screen !== 'undefined' && screen.orientation) return screen.orientation.angle;
  const legacy = (globalThis as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

function onOrientation(e: DeviceOrientationEvent) {
  const bucket = tiltBucket(e.beta, screenAngle());
  last = { bucket, at: Date.now() };
  for (const resolve of waiters) resolve(bucket);
  waiters.clear();
}

function supported(): boolean {
  return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
}

/** Start listening (idempotent). Without permission on iOS, no events arrive: harmless. */
export function startTiltTracking(): void {
  if (listening || !supported()) return;
  listening = true;
  window.addEventListener('deviceorientation', onOrientation);
}

/**
 * On iOS, ask once for motion access. Must be called synchronously inside a user gesture.
 * Elsewhere this just starts listening. Never throws.
 */
export function requestTiltPermission(): void {
  if (!supported()) return;
  const ctor = window.DeviceOrientationEvent as unknown as PermissionCtor;
  if (typeof ctor.requestPermission !== 'function') {
    startTiltTracking();
    return;
  }
  if (asked) return;
  asked = true;
  ctor
    .requestPermission()
    .then((state) => {
      if (state === 'granted') startTiltTracking();
    })
    .catch(() => undefined);
}

/** The tilt right now, if a fresh reading exists. */
export function currentTilt(maxAgeMs = FRESH_MS): TiltBucket | undefined {
  return last && Date.now() - last.at <= maxAgeMs ? last.bucket : undefined;
}

/**
 * The next reading within `timeoutMs` (or a fresh one already held). Used when a photo comes
 * back from the native camera: the page was hidden while it was taken, so wait for the phone
 * to report again.
 */
export function nextTilt(timeoutMs = 700): Promise<TiltBucket | undefined> {
  if (!listening) return Promise.resolve(undefined);
  const now = currentTilt(250);
  if (now) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = (bucket: TiltBucket | undefined) => {
      clearTimeout(timer);
      waiters.delete(done);
      resolve(bucket);
    };
    const timer = setTimeout(() => done(undefined), timeoutMs);
    waiters.add(done);
  });
}
