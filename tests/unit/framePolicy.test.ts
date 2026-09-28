import { describe, expect, it } from 'vitest';
import {
  BASE_TICK_MS,
  MAX_TICK_MS,
  framePolicy,
  lightLabel,
  smoothLatency,
} from '../../src/features/live/framePolicy';

describe('framePolicy', () => {
  it('runs at full rate normally', () => {
    const p = framePolicy({ dataSaver: false, batteryLevel: 0.8, charging: false, detectorMs: 20 });
    expect(p.tickMs).toBe(BASE_TICK_MS);
    expect(p.reasons).toEqual([]);
    expect(p.maxAttempts).toBe(15);
    expect(p.cropMaxEdge).toBe(1600);
    expect(lightLabel(p.reasons)).toBeUndefined();
  });

  it('slows down on low battery unless charging', () => {
    const low = framePolicy({ dataSaver: false, batteryLevel: 0.15, charging: false });
    expect(low.tickMs).toBeGreaterThan(BASE_TICK_MS);
    expect(low.reasons).toEqual(['battery']);
    expect(low.maxAttempts).toBeLessThan(15);
    const charging = framePolicy({ dataSaver: false, batteryLevel: 0.15, charging: true });
    expect(charging.tickMs).toBe(BASE_TICK_MS);
    expect(charging.reasons).toEqual([]);
  });

  it('backs off as the detector slows down, with hysteresis', () => {
    const warm = framePolicy({ dataSaver: false, detectorMs: 80 });
    expect(warm.warm).toBe(true);
    expect(warm.reasons).toEqual(['warm']);
    expect(warm.tickMs).toBe(320);
    expect(framePolicy({ dataSaver: false, detectorMs: 400 }).tickMs).toBe(MAX_TICK_MS);
    // Between the thresholds, the previous state holds.
    expect(framePolicy({ dataSaver: false, detectorMs: 45, wasWarm: true }).warm).toBe(true);
    expect(framePolicy({ dataSaver: false, detectorMs: 45, wasWarm: false }).warm).toBe(false);
    expect(framePolicy({ dataSaver: false, detectorMs: 20, wasWarm: true }).warm).toBe(false);
  });

  it('sends fewer, smaller frames with data saver', () => {
    const p = framePolicy({ dataSaver: true });
    expect(p.reasons).toEqual(['data']);
    expect(p.tickMs).toBe(BASE_TICK_MS);
    expect(p.maxAttempts).toBeLessThan(15);
    expect(p.cooldownMs).toBeGreaterThan(2500);
    expect(p.cropMaxEdge).toBeLessThan(1600);
    expect(p.quality).toBeLessThan(0.88);
    expect(lightLabel(p.reasons)).toBe('Data saver');
  });

  it('combines reasons', () => {
    const p = framePolicy({ dataSaver: true, batteryLevel: 0.1, charging: false, detectorMs: 90 });
    expect(lightLabel(p.reasons)).toBe('Low battery · Cooling down · Data saver');
  });
});

describe('smoothLatency', () => {
  it('starts at the first sample and moves gradually', () => {
    expect(smoothLatency(undefined, 50)).toBe(50);
    expect(smoothLatency(50, 150)).toBe(70);
  });
});
