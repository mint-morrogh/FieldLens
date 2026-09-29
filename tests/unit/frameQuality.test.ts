import { describe, expect, it } from 'vitest';
import { BLURRY, DARK, frameQuality } from '../../src/features/live/frameQuality';

/** A 48×48 checkerboard of 4 px squares between two levels. */
function checker(lo: number, hi: number): Float32Array {
  const out = new Float32Array(48 * 48);
  for (let y = 0; y < 48; y++)
    for (let x = 0; x < 48; x++)
      out[y * 48 + x] = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 ? hi : lo;
  return out;
}

/** A 3×3 box blur, `passes` times. */
function blur(src: Float32Array, passes: number): Float32Array {
  let a = src;
  for (let p = 0; p < passes; p++) {
    const b = new Float32Array(a.length);
    for (let y = 0; y < 48; y++)
      for (let x = 0; x < 48; x++) {
        let sum = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= 48 || yy >= 48) continue;
            sum += a[yy * 48 + xx];
            n++;
          }
        b[y * 48 + x] = sum / n;
      }
    a = b;
  }
  return a;
}

describe('live frame quality', () => {
  it('passes a sharp, well-lit frame', () => {
    const q = frameQuality(checker(60, 200), 48, 48);
    expect(q.problem).toBeUndefined();
    expect(q.sharpness).toBeGreaterThan(BLURRY);
  });

  it('flags a dark frame', () => {
    const q = frameQuality(checker(5, 40), 48, 48);
    expect(q.brightness).toBeLessThan(DARK);
    expect(q.problem).toBe('dark');
  });

  it('flags a heavily blurred frame', () => {
    const q = frameQuality(blur(checker(60, 200), 6), 48, 48);
    expect(q.problem).toBe('blurry');
  });

  it('leaves a plain but bright frame alone only if it has some detail', () => {
    // A perfectly flat frame has no edges at all: nothing there worth identifying.
    expect(frameQuality(new Float32Array(48 * 48).fill(150), 48, 48).problem).toBe('blurry');
  });
});
