/**
 * Pinch to zoom in live identify. Where the camera supports zoom (most Android phones in
 * Chrome), the pinch drives the camera's own zoom, so frames sent for identification are
 * sharper. Elsewhere (iOS Safari) the video is magnified on screen instead ("digital" zoom) and
 * scans and taps crop from what's visible. Either way the page itself never zooms.
 */

type Rect = { x: number; y: number; w: number; h: number };

/** Digital zoom stops here: beyond it the crop is too few pixels to identify. */
export const MAX_DIGITAL_ZOOM = 5;
/** Camera zoom is capped too: past ~10× most phone sensors are digital anyway. */
export const MAX_CAMERA_ZOOM = 10;

export type CameraZoom = { min: number; max: number; step: number };

/** The camera's zoom range, when it has one worth using. */
export function cameraZoomRange(track: MediaStreamTrack | undefined): CameraZoom | undefined {
  const caps = (track?.getCapabilities?.() ?? {}) as {
    zoom?: { min?: number; max?: number; step?: number };
  };
  const z = caps.zoom;
  if (!z || z.max === undefined || z.min === undefined || z.max <= z.min * 1.2) return undefined;
  return { min: z.min, max: Math.min(z.max, z.min * MAX_CAMERA_ZOOM), step: z.step || 0.1 };
}

/** Zoom after a pinch: the start zoom times how much the fingers spread, kept in range. */
export function pinchZoom(
  startZoom: number,
  startDistance: number,
  distance: number,
  min: number,
  max: number,
): number {
  if (startDistance <= 0) return startZoom;
  return Math.min(max, Math.max(min, startZoom * (distance / startDistance)));
}

/**
 * The part of the video frame visible on screen (in video pixels), for a video shown with
 * `object-fit: cover` in a `cw` × `ch` box and magnified `zoom` times about its centre.
 */
export function visibleRect(vw: number, vh: number, cw: number, ch: number, zoom = 1): Rect {
  const scale = Math.max(cw / vw, ch / vh) * zoom;
  const w = Math.min(vw, cw / scale);
  const h = Math.min(vh, ch / scale);
  return { x: (vw - w) / 2, y: (vh - h) / 2, w, h };
}

/** A rectangle moved (and if need be shrunk) to lie inside `bounds`. */
export function clampInto(r: Rect, bounds: Rect): Rect {
  const w = Math.min(r.w, bounds.w);
  const h = Math.min(r.h, bounds.h);
  return {
    x: Math.min(Math.max(bounds.x, r.x), bounds.x + bounds.w - w),
    y: Math.min(Math.max(bounds.y, r.y), bounds.y + bounds.h - h),
    w,
    h,
  };
}

/** Where an element-fraction rectangle appears after magnifying `zoom` times about the centre. */
export function zoomDisplay(r: Rect, zoom: number): Rect {
  if (zoom === 1) return r;
  return {
    x: 0.5 + (r.x - 0.5) * zoom,
    y: 0.5 + (r.y - 0.5) * zoom,
    w: r.w * zoom,
    h: r.h * zoom,
  };
}

export function formatZoom(z: number): string {
  return `${z < 10 ? z.toFixed(1) : Math.round(z)}×`;
}
