/** Crop box geometry in normalized image coordinates (0..1). Pure and unit-tested. */
export type Box = { x: number; y: number; w: number; h: number };
export type Corner = 'nw' | 'ne' | 'sw' | 'se';

export const MIN_BOX = 0.06;
export const FULL_BOX: Box = { x: 0, y: 0, w: 1, h: 1 };
export const DEFAULT_BOX: Box = { x: 0.1, y: 0.1, w: 0.8, h: 0.8 };

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export function clampBox(box: Box, min = MIN_BOX): Box {
  const w = clamp(box.w, min, 1);
  const h = clamp(box.h, min, 1);
  return { x: clamp(box.x, 0, 1 - w), y: clamp(box.y, 0, 1 - h), w, h };
}

export function moveBox(box: Box, dx: number, dy: number): Box {
  return clampBox({ ...box, x: box.x + dx, y: box.y + dy });
}

/** Drag one corner; the opposite corner stays fixed. */
export function resizeBox(box: Box, corner: Corner, dx: number, dy: number, min = MIN_BOX): Box {
  let left = box.x;
  let top = box.y;
  let right = box.x + box.w;
  let bottom = box.y + box.h;
  if (corner === 'nw' || corner === 'sw') left = clamp(left + dx, 0, right - min);
  else right = clamp(right + dx, left + min, 1);
  if (corner === 'nw' || corner === 'ne') top = clamp(top + dy, 0, bottom - min);
  else bottom = clamp(bottom + dy, top + min, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Box spanning two points (any order), used when the user drags on empty space. */
export function boxFromPoints(ax: number, ay: number, bx: number, by: number, min = MIN_BOX): Box {
  const x1 = clamp(Math.min(ax, bx), 0, 1);
  const y1 = clamp(Math.min(ay, by), 0, 1);
  const x2 = clamp(Math.max(ax, bx), 0, 1);
  const y2 = clamp(Math.max(ay, by), 0, 1);
  return clampBox({ x: x1, y: y1, w: Math.max(min, x2 - x1), h: Math.max(min, y2 - y1) }, min);
}

/** Convert to an integer pixel rectangle inside a natural-size image. */
export function toPixelRect(box: Box, width: number, height: number) {
  const sx = Math.round(box.x * width);
  const sy = Math.round(box.y * height);
  const sw = Math.max(1, Math.min(width - sx, Math.round(box.w * width)));
  const sh = Math.max(1, Math.min(height - sy, Math.round(box.h * height)));
  return { sx, sy, sw, sh };
}

/** Output size that keeps aspect ratio and caps the longest edge. */
export function fitWithin(width: number, height: number, maxEdge: number) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function isFullImage(box: Box): boolean {
  return box.x <= 0.001 && box.y <= 0.001 && box.w >= 0.999 && box.h >= 0.999;
}
