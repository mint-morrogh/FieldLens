import { CLIENT_IMAGE } from '../../shared/config';
import { fitWithin, toPixelRect, type Box } from '../features/crop/cropMath';

export async function loadImage(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } catch {
    throw new Error('image_decode_failed');
  } finally {
    // The decoded bitmap stays usable for drawing after the URL is revoked.
    URL.revokeObjectURL(url);
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode_failed'))), type, quality),
  );
}

/**
 * Crop to the box, downscale, and re-encode as JPEG. Drawing through a canvas
 * discards all EXIF metadata (including GPS). Browsers apply EXIF orientation
 * when decoding <img>, so the output is upright.
 */
export async function cropAndEncode(
  source: Blob,
  box: Box,
  options: { maxEdge?: number; quality?: number } = {},
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImage(source);
  const { sx, sy, sw, sh } = toPixelRect(box, img.naturalWidth, img.naturalHeight);
  const { width, height } = fitWithin(sw, sh, options.maxEdge ?? CLIENT_IMAGE.maxEdge);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas_unavailable');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, 'image/jpeg', options.quality ?? CLIENT_IMAGE.quality);
  return { blob, width, height };
}

export async function makeThumbnail(source: Blob): Promise<Blob> {
  const { blob } = await cropAndEncode(
    source,
    { x: 0, y: 0, w: 1, h: 1 },
    {
      maxEdge: CLIENT_IMAGE.thumbnailEdge,
      quality: CLIENT_IMAGE.thumbnailQuality,
    },
  );
  return blob;
}

export const ACCEPTED_INPUT = /^image\//;
/** Reject absurd inputs before trying to decode them (originals stay on-device). */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

/** Longest edge of the copy kept in local History for the full-screen viewer. */
export const DISPLAY_COPY_EDGE = 2048;

export async function makeDisplayCopy(source: Blob): Promise<Blob> {
  const { blob } = await cropAndEncode(
    source,
    { x: 0, y: 0, w: 1, h: 1 },
    { maxEdge: DISPLAY_COPY_EDGE, quality: 0.86 },
  );
  return blob;
}
