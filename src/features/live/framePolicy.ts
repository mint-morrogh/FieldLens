/**
 * Battery- and data-light live mode. A pure policy decides how often the live loop runs the
 * on-device detector and how many frames it may send for identification, from:
 *  - the battery (Battery Status API, where the browser has it): low and not charging;
 *  - how long the detector is taking per frame: a rising time means the phone is warm or
 *    throttled, so the loop backs off (with hysteresis so it doesn't flap);
 *  - the data saver setting: fewer, smaller frames sent to the server.
 */

export type LightReason = 'battery' | 'warm' | 'data';

export interface FrameInputs {
  /** 0–1, undefined where the Battery Status API isn't available. */
  batteryLevel?: number;
  charging?: boolean;
  /** Smoothed detector time per frame, in ms (undefined before the first measurement). */
  detectorMs?: number;
  /** Whether the previous decision already counted the phone as warm (hysteresis). */
  wasWarm?: boolean;
  dataSaver: boolean;
}

export interface FramePolicy {
  /** Time between live loop ticks (detection and stillness checks). */
  tickMs: number;
  /** Frames that may be sent for identification in one live session. */
  maxAttempts: number;
  /** Wait after an identification before the next automatic one. */
  cooldownMs: number;
  /** Longest edge and JPEG quality of the crop sent to the server. */
  cropMaxEdge: number;
  quality: number;
  /** Longest edge of the whole frame kept for the result page. */
  frameMaxEdge: number;
  warm: boolean;
  reasons: LightReason[];
}

export const BASE_TICK_MS = 100;
export const MAX_TICK_MS = 600;
export const LOW_BATTERY = 0.2;
/** Detector slower than this per frame counts as warm; it cools off below `COOL_MS`. */
export const WARM_MS = 60;
export const COOL_MS = 35;

export function framePolicy(input: FrameInputs): FramePolicy {
  const reasons: LightReason[] = [];
  let tickMs = BASE_TICK_MS;

  const lowBattery =
    input.batteryLevel !== undefined && input.batteryLevel < LOW_BATTERY && !input.charging;
  if (lowBattery) {
    reasons.push('battery');
    tickMs = Math.max(tickMs, 300);
  }

  const ms = input.detectorMs;
  const warm = ms !== undefined && (input.wasWarm ? ms > COOL_MS : ms > WARM_MS);
  if (warm) {
    reasons.push('warm');
    // Leave the phone idle for most of each tick: about four times the detector's own time.
    tickMs = Math.max(tickMs, Math.round(ms * 4));
  }

  if (input.dataSaver) reasons.push('data');
  tickMs = Math.min(MAX_TICK_MS, tickMs);

  const saving = input.dataSaver || lowBattery;
  return {
    tickMs,
    maxAttempts: saving ? 8 : 15,
    cooldownMs: saving ? 5000 : 2500,
    cropMaxEdge: input.dataSaver ? 1024 : 1600,
    quality: input.dataSaver ? 0.8 : 0.88,
    frameMaxEdge: input.dataSaver ? 1280 : 2048,
    warm,
    reasons,
  };
}

/** Exponential moving average of detector time, so one slow frame doesn't trigger backoff. */
export function smoothLatency(previous: number | undefined, sample: number, weight = 0.2): number {
  return previous === undefined ? sample : previous + (sample - previous) * weight;
}

/** "Battery saver", "Cooling down", "Data saver", joined for the live mode indicator. */
export function lightLabel(reasons: LightReason[]): string | undefined {
  if (!reasons.length) return undefined;
  const names: Record<LightReason, string> = {
    battery: 'Low battery',
    warm: 'Cooling down',
    data: 'Data saver',
  };
  return reasons.map((r) => names[r]).join(' · ');
}

type BatteryLike = EventTarget & { level: number; charging: boolean };

/**
 * Watches the battery where the Battery Status API exists (Chrome, Android). Calls back with
 * the current state and on every change; returns an unsubscribe function.
 */
export function watchBattery(
  cb: (state: { level: number; charging: boolean }) => void,
): () => void {
  let battery: BatteryLike | undefined;
  let stopped = false;
  const update = () => battery && cb({ level: battery.level, charging: battery.charging });
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryLike> };
  if (typeof nav.getBattery === 'function') {
    nav
      .getBattery()
      .then((b) => {
        if (stopped) return;
        battery = b;
        b.addEventListener('levelchange', update);
        b.addEventListener('chargingchange', update);
        update();
      })
      .catch(() => undefined);
  }
  return () => {
    stopped = true;
    battery?.removeEventListener('levelchange', update);
    battery?.removeEventListener('chargingchange', update);
  };
}
