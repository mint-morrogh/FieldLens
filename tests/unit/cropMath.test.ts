import { describe, expect, it } from 'vitest';
import {
  MIN_BOX,
  boxFromPoints,
  clampBox,
  fitWithin,
  isFullImage,
  moveBox,
  resizeBox,
  toPixelRect,
} from '../../src/features/crop/cropMath';

describe('crop math', () => {
  const box = { x: 0.2, y: 0.2, w: 0.5, h: 0.5 };
  it('moves within bounds', () => {
    expect(moveBox(box, 1, 1)).toEqual({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
    expect(moveBox(box, -1, 0).x).toBe(0);
  });
  it('resizes from each corner keeping the opposite corner fixed', () => {
    const se = resizeBox(box, 'se', 0.1, 0.1);
    expect(se).toMatchObject({ x: 0.2, y: 0.2 });
    expect(se.w).toBeCloseTo(0.6);
    const nw = resizeBox(box, 'nw', -0.1, -0.1);
    expect(nw.x).toBeCloseTo(0.1);
    expect(nw.x + nw.w).toBeCloseTo(0.7);
  });
  it('enforces a minimum size', () => {
    expect(resizeBox(box, 'se', -1, -1).w).toBeCloseTo(MIN_BOX);
    expect(clampBox({ x: 0.99, y: 0, w: 0, h: 2 })).toEqual({
      x: 1 - MIN_BOX,
      y: 0,
      w: MIN_BOX,
      h: 1,
    });
  });
  it('draws boxes from points in any order', () => {
    expect(boxFromPoints(0.8, 0.9, 0.2, 0.1)).toEqual({
      x: 0.2,
      y: 0.1,
      w: 0.6000000000000001,
      h: 0.8,
    });
  });
  it('converts to pixels and fits within a max edge', () => {
    expect(toPixelRect({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, 4000, 3000)).toEqual({
      sx: 2000,
      sy: 1500,
      sw: 2000,
      sh: 1500,
    });
    expect(fitWithin(4000, 3000, 1600)).toEqual({ width: 1600, height: 1200 });
    expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 });
    expect(isFullImage({ x: 0, y: 0, w: 1, h: 1 })).toBe(true);
  });
});
