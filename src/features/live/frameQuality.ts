/**
 * A quick check, on the phone, that a live frame is worth sending: not too dark and not
 * blurred (motion or focus). Automatic scans skip frames that fail and say why, which saves
 * identification calls on frames that would come back uncertain anyway. It runs on a small
 * copy of the crop, so it costs well under a millisecond.
 */

/** The crop is checked at this size (longest edge). */
export const QUALITY_EDGE = 96;

/** Mean luminance (0–255) below which a frame is too dark to identify. */
export const DARK = 38;
/**
 * Variance of the Laplacian below which a frame is too blurred, at 96 px. On the app's eight
 * sample photos, sharp crops scored 947–4396, 2 px of blur 72–482 and 4 px 11–72, so this only
 * catches clearly blurred frames and leaves smooth subjects (a plain cap, a petal) alone.
 */
export const BLURRY = 40;

export type FrameQuality = {
  /** Mean luminance, 0–255. */
  brightness: number;
  /** Variance of the Laplacian: higher is sharper. */
  sharpness: number;
  problem?: 'dark' | 'blurry';
};

/** Luminance of RGBA pixels (Rec. 601 weights). */
export function toLuma(rgba: ArrayLike<number>, pixels: number): Float32Array {
  const out = new Float32Array(pixels);
  for (let i = 0; i < pixels; i++)
    out[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
  return out;
}

export function frameQuality(luma: ArrayLike<number>, width: number, height: number): FrameQuality {
  let sum = 0;
  for (let i = 0; i < width * height; i++) sum += luma[i];
  const brightness = sum / (width * height);

  // Variance of the 4-neighbour Laplacian over the interior.
  let n = 0;
  let mean = 0;
  let m2 = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = luma[i - 1] + luma[i + 1] + luma[i - width] + luma[i + width] - 4 * luma[i];
      n++;
      const d = lap - mean;
      mean += d / n;
      m2 += d * (lap - mean);
    }
  }
  const sharpness = n > 1 ? m2 / (n - 1) : 0;
  const problem = brightness < DARK ? 'dark' : sharpness < BLURRY ? 'blurry' : undefined;
  return { brightness, sharpness, problem };
}

/** Checks a region of the video (in video pixels). */
export function checkRegion(
  video: CanvasImageSource,
  r: { x: number; y: number; w: number; h: number },
  canvas: HTMLCanvasElement,
): FrameQuality | undefined {
  const scale = Math.min(1, QUALITY_EDGE / Math.max(r.w, r.h));
  const w = Math.max(8, Math.round(r.w * scale));
  const h = Math.max(8, Math.round(r.h * scale));
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  if (!g) return undefined;
  try {
    g.drawImage(video, r.x, r.y, r.w, r.h, 0, 0, w, h);
    return frameQuality(toLuma(g.getImageData(0, 0, w, h).data, w * h), w, h);
  } catch {
    return undefined;
  }
}
