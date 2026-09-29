import type { InteractiveSegmenterLegacy } from '@mediapipe/tasks-vision';

/**
 * "Subject lift" for live identify: when someone taps the camera view, MediaPipe's interactive
 * segmenter (the Magic Touch model, ~6 MB) cuts out the thing under the finger, like holding
 * a photo subject on iOS. The cut-out is washed in white on screen, so it's clear what's being
 * identified, and its bounds give a tighter crop than a square around the tap.
 */
const SEGMENTER_URL =
  'https://storage.googleapis.com/mediapipe-models/interactive_segmenter/magic_touch/float32/1/magic_touch.tflite';

/** The frame is segmented at this size (longest edge): plenty for an outline, and quick. */
export const LIFT_EDGE = 512;
/** Cut-outs smaller or larger than these shares of the frame are misses (a speck, or everything). */
const MIN_AREA = 0.004;
const MAX_AREA = 0.85;

type Rect = { x: number; y: number; w: number; h: number };

export type LiftMask = {
  /** Alpha mask (255 = subject), `width` × `height`. */
  alpha: Uint8ClampedArray;
  width: number;
  height: number;
  /** Bounds of the subject in mask pixels. */
  box: Rect;
  /** Share of the frame the subject covers. */
  area: number;
  /**
   * A point inside the subject (0–1), as near its middle as the shape allows: where the next
   * cut-out starts when following it.
   */
  inside: { x: number; y: number };
};

/**
 * Turns a segmentation mask into the subject's alpha mask. Which value means "subject" isn't
 * assumed: the subject is whatever side of 0.5 the tapped pixel is on. Returns undefined when
 * the cut-out is too small or too big to be a single thing.
 */
export function maskFromValues(
  values: ArrayLike<number>,
  width: number,
  height: number,
  tap: { x: number; y: number },
  /** Values at or above this count as one class (0.5 for confidences, 0.5 for 0/1 categories). */
  split = 0.5,
): LiftMask | undefined {
  const tx = Math.min(width - 1, Math.max(0, Math.round(tap.x * width)));
  const ty = Math.min(height - 1, Math.max(0, Math.round(tap.y * height)));
  const high = values[ty * width + tx] >= split;
  const alpha = new Uint8ClampedArray(width * height);
  let count = 0;
  let x0 = width;
  let y0 = height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (values[i] >= split !== high) continue;
      alpha[i] = 255;
      count++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const area = count / (width * height);
  if (area < MIN_AREA || area > MAX_AREA) return undefined;
  // The centroid, or (for a C- or ring-shaped subject) the subject pixel nearest it.
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < alpha.length; i++) {
    if (!alpha[i]) continue;
    sx += i % width;
    sy += Math.floor(i / width);
  }
  let cx = sx / count;
  let cy = sy / count;
  if (!alpha[Math.round(cy) * width + Math.round(cx)]) {
    let best = Infinity;
    for (let i = 0; i < alpha.length; i++) {
      if (!alpha[i]) continue;
      const d = ((i % width) - cx) ** 2 + (Math.floor(i / width) - cy) ** 2;
      if (d < best) {
        best = d;
        cx = i % width;
        cy = Math.floor(i / width);
      }
    }
  }
  return {
    alpha,
    width,
    height,
    box: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 },
    area,
    inside: { x: (cx + 0.5) / width, y: (cy + 0.5) / height },
  };
}

/**
 * The region to identify around a cut-out, in video pixels: its bounds plus a margin (some
 * context helps the models), at least `minShare` of the shorter side, kept inside the frame.
 */
export function cropAround(
  box: Rect,
  scale: number,
  vw: number,
  vh: number,
  { margin = 0.15, minShare = 0.2 } = {},
): Rect {
  const min = Math.min(vw, vh) * minShare;
  let w = Math.max(min, box.w * scale * (1 + 2 * margin));
  let h = Math.max(min, box.h * scale * (1 + 2 * margin));
  w = Math.min(w, vw);
  h = Math.min(h, vh);
  const cx = (box.x + box.w / 2) * scale;
  const cy = (box.y + box.h / 2) * scale;
  return {
    x: Math.min(Math.max(0, cx - w / 2), vw - w),
    y: Math.min(Math.max(0, cy - h / 2), vh - h),
    w,
    h,
  };
}

let loading: Promise<InteractiveSegmenterLegacy | undefined> | undefined;
let ready: InteractiveSegmenterLegacy | undefined;

/** Loads the segmenter once (GPU, else CPU); resolves undefined where it can't run. */
export function loadSubjectLift(wasmUrl: string): Promise<InteractiveSegmenterLegacy | undefined> {
  loading ??= (async () => {
    try {
      const { FilesetResolver, InteractiveSegmenterLegacy } =
        await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(wasmUrl);
      const create = (delegate: 'GPU' | 'CPU') =>
        InteractiveSegmenterLegacy.createFromOptions(vision, {
          baseOptions: { modelAssetPath: SEGMENTER_URL, delegate },
          outputConfidenceMasks: true,
          outputCategoryMask: false,
        });
      const segmenter = await create('GPU').catch(() => create('CPU'));
      // The first run compiles the model's shaders (a few hundred ms on a phone); do it now,
      // in the background, so the first tap is quick.
      try {
        const warm = document.createElement('canvas');
        warm.width = warm.height = 64;
        const result = segmenter.segment(warm, { keypoint: { x: 0.5, y: 0.5 } });
        for (const m of result.confidenceMasks ?? []) m.close();
      } catch {
        /* warm-up is only an optimisation */
      }
      ready = segmenter;
      return ready;
    } catch {
      return undefined;
    }
  })();
  return loading;
}

/** The segmenter, if it has finished loading (taps never wait for the download). */
export function subjectLiftReady(): InteractiveSegmenterLegacy | undefined {
  return ready;
}

export function closeSubjectLift(): void {
  ready?.close();
  ready = undefined;
  loading = undefined;
}

export type Lift = {
  /** PNG of the subject's alpha mask, same aspect as the video, for a CSS mask. */
  maskUrl: string;
  /** Subject bounds in video pixels. */
  box: Rect;
  /** Share of the frame the subject covers. */
  area: number;
  /** A point inside the subject (0–1 in the frame), for following it. */
  inside: { x: number; y: number };
};

/**
 * Whether a new cut-out is plausibly the same subject as the last one: similar size, and not
 * jumped across the frame. Otherwise it's taken as lost (it left the view, or the cut-out
 * grabbed the background).
 */
export function sameSubject(
  prev: Pick<Lift, 'area' | 'inside'>,
  next: Pick<Lift, 'area' | 'inside'>,
): boolean {
  const ratio = next.area / prev.area;
  const moved = Math.hypot(next.inside.x - prev.inside.x, next.inside.y - prev.inside.y);
  return ratio > 0.4 && ratio < 2.5 && moved < 0.3;
}

/**
 * Cuts out the subject at `tap` (0–1 in the frame) from a still of the video. Synchronous and
 * quick (tens of milliseconds on a phone's GPU); undefined when nothing clear was found.
 */
export function liftSubject(
  segmenter: InteractiveSegmenterLegacy,
  frame: HTMLCanvasElement,
  tap: { x: number; y: number },
  videoWidth: number,
): Lift | undefined {
  let mask: LiftMask | undefined;
  try {
    const result = segmenter.segment(frame, { keypoint: tap });
    const m = result.confidenceMasks?.[0];
    if (m) {
      mask = maskFromValues(m.getAsFloat32Array(), m.width, m.height, tap);
      for (const c of result.confidenceMasks ?? []) c.close();
    }
  } catch {
    return undefined;
  }
  if (!mask) return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const g = canvas.getContext('2d');
  if (!g) return undefined;
  const image = new ImageData(mask.width, mask.height);
  for (let i = 0; i < mask.alpha.length; i++) {
    image.data[i * 4 + 3] = mask.alpha[i];
  }
  // Soften the stair-stepped edge a little, as the wash reads better with a feathered outline.
  const hard = document.createElement('canvas');
  hard.width = mask.width;
  hard.height = mask.height;
  hard.getContext('2d')?.putImageData(image, 0, 0);
  g.filter = 'blur(1.5px)';
  g.drawImage(hard, 0, 0);
  const scale = videoWidth / mask.width;
  return {
    maskUrl: canvas.toDataURL('image/png'),
    box: {
      x: mask.box.x * scale,
      y: mask.box.y * scale,
      w: mask.box.w * scale,
      h: mask.box.h * scale,
    },
    area: mask.area,
    inside: mask.inside,
  };
}
