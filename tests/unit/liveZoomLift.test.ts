import { describe, expect, it } from 'vitest';
import { cropAround, maskFromValues } from '../../src/features/live/subjectLift';
import {
  clampInto,
  formatZoom,
  pinchZoom,
  visibleRect,
  zoomDisplay,
} from '../../src/features/live/zoom';

describe('live zoom', () => {
  it('follows the fingers and stays in range', () => {
    expect(pinchZoom(1, 100, 200, 1, 5)).toBe(2);
    expect(pinchZoom(2, 100, 50, 1, 5)).toBe(1);
    expect(pinchZoom(3, 100, 1000, 1, 5)).toBe(5);
    expect(pinchZoom(1, 0, 50, 1, 5)).toBe(1);
  });

  it('works out what part of the frame is on screen', () => {
    // A 1920×1080 frame covering a 390×844 portrait screen shows a central strip…
    const full = visibleRect(1920, 1080, 390, 844);
    expect(full.h).toBeCloseTo(1080);
    expect(full.w).toBeCloseTo(390 / (844 / 1080));
    expect(full.x + full.w / 2).toBeCloseTo(960);
    // …and at 2× only the middle half of that, still centred.
    const zoomed = visibleRect(1920, 1080, 390, 844, 2);
    expect(zoomed.w).toBeCloseTo(full.w / 2);
    expect(zoomed.h).toBeCloseTo(540);
    expect(zoomed.y).toBeCloseTo(270);
  });

  it('maps boxes through the on-screen magnification and keeps crops in view', () => {
    const z = zoomDisplay({ x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, 2);
    expect(z.x).toBeCloseTo(0.3);
    expect(z.y).toBeCloseTo(0.3);
    expect(z.w).toBeCloseTo(0.4);
    expect(z.h).toBeCloseTo(0.4);
    expect(clampInto({ x: -10, y: 90, w: 50, h: 50 }, { x: 0, y: 0, w: 100, h: 100 })).toEqual({
      x: 0,
      y: 50,
      w: 50,
      h: 50,
    });
    expect(formatZoom(2.345)).toBe('2.3×');
  });
});

describe('subject lift', () => {
  /** A 10×10 confidence mask with a 4×4 subject at (3,3). */
  function square(subjectHigh = true) {
    const v = new Float32Array(100).fill(subjectHigh ? 0.1 : 0.9);
    for (let y = 3; y < 7; y++) for (let x = 3; x < 7; x++) v[y * 10 + x] = subjectHigh ? 0.9 : 0.1;
    return v;
  }

  it('cuts out whatever the tap is on, whichever way the mask is encoded', () => {
    for (const high of [true, false]) {
      const m = maskFromValues(square(high), 10, 10, { x: 0.45, y: 0.45 })!;
      expect(m.box).toEqual({ x: 3, y: 3, w: 4, h: 4 });
      expect(m.area).toBeCloseTo(0.16);
      expect(m.alpha[0]).toBe(0);
      expect(m.alpha[4 * 10 + 4]).toBe(255);
    }
  });

  it('rejects a cut-out that is everything or almost nothing', () => {
    // Tapping the background of the square "selects" 84% of the frame: fine. All of it: not.
    expect(maskFromValues(new Float32Array(100).fill(0.9), 10, 10, { x: 0.5, y: 0.5 })).toBe(
      undefined,
    );
    const speck = new Float32Array(10_000).fill(0.1);
    speck[5050] = 0.9;
    expect(maskFromValues(speck, 100, 100, { x: 0.5, y: 0.505 })).toBeUndefined();
  });

  it('crops around the cut-out with a minimum size, inside the frame', () => {
    const r = cropAround({ x: 10, y: 10, w: 20, h: 10 }, 2, 1000, 500, {
      margin: 0,
      minShare: 0.2,
    });
    expect(r.w).toBe(100); // 20% of the 500 px shorter side
    expect(r.h).toBe(100);
    expect(r.x).toBe(0); // centred on (40, 30) but kept inside the frame
    expect(r.y).toBe(0);
  });
});
