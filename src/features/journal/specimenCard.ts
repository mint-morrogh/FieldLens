/**
 * Shareable specimen card: your photo, the name, your rank and the date, drawn on a
 * canvas in the journal's paper-and-ink style. Built on the device; nothing is uploaded.
 * No location is printed, matching the journal's privacy rule.
 */

export type SpecimenCardInput = {
  photo?: Blob;
  name: string;
  scientificName?: string;
  /** e.g. "Field Naturalist · 42 species" */
  rankLine: string;
  /** ISO date of the find. */
  date: string;
};

const W = 1080;
const H = 1350;
const PAD = 72;
const PAPER = '#f7f4ec';
const INK = '#1b1f1a';
const INK_MUTED = '#5f665b';
const MOSS = '#2f5d3a';
const LINE = '#ddd5c4';
const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif";
const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MONO = "ui-monospace, 'SF Mono', Menlo, monospace";

async function loadImage(blob: Blob): Promise<CanvasImageSource | undefined> {
  try {
    if (typeof createImageBitmap === 'function') return await createImageBitmap(blob);
  } catch {
    /* fall through to <img> */
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } catch {
    return undefined;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Shrinks the font until the text fits the width (down to a floor). */
function fitFont(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  size: number,
  font: (px: number) => string,
  min = 40,
): number {
  let px = size;
  ctx.font = font(px);
  while (px > min && ctx.measureText(text).width > maxWidth) {
    px -= 4;
    ctx.font = font(px);
  }
  return px;
}

function ellipsize(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth) t = t.slice(0, -1);
  return `${t}…`;
}

export async function renderSpecimenCard(input: SpecimenCardInput): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // Photo, cropped to fill a square window with a thin ink frame.
  const size = W - PAD * 2;
  const image = input.photo ? await loadImage(input.photo) : undefined;
  if (image) {
    const iw = (image as { width: number }).width;
    const ih = (image as { height: number }).height;
    const scale = Math.max(size / iw, size / ih);
    const sw = size / scale; // square source window, so width and height match
    const sh = sw;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(PAD, PAD, size, size, 28);
    ctx.clip();
    ctx.drawImage(image, (iw - sw) / 2, (ih - sh) / 2, sw, sh, PAD, PAD, size, size);
    ctx.restore();
  } else {
    ctx.fillStyle = '#e2ebdc';
    ctx.beginPath();
    ctx.roundRect(PAD, PAD, size, size, 28);
    ctx.fill();
  }
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(PAD, PAD, size, size, 28);
  ctx.stroke();

  let y = PAD + size + 92;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = INK;
  const namePx = fitFont(ctx, input.name, size, 76, (px) => `700 ${px}px ${SERIF}`);
  ctx.fillText(ellipsize(ctx, input.name, size), PAD, y);

  if (input.scientificName && input.scientificName !== input.name) {
    y += Math.round(namePx * 0.2) + 44;
    ctx.fillStyle = INK_MUTED;
    ctx.font = `italic 40px ${SERIF}`;
    ctx.fillText(ellipsize(ctx, input.scientificName, size), PAD, y);
  }

  // Footer rule, then rank on the left and the date on the right.
  const footer = H - PAD;
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(PAD, footer - 64);
  ctx.lineTo(W - PAD, footer - 64);
  ctx.stroke();

  const date = new Date(input.date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  ctx.font = `500 30px ${MONO}`;
  const dateWidth = ctx.measureText(date).width;
  ctx.fillStyle = INK_MUTED;
  ctx.fillText(date, W - PAD - dateWidth, footer);
  ctx.font = `700 34px ${SANS}`;
  ctx.fillStyle = MOSS;
  ctx.fillText(ellipsize(ctx, input.rankLine, size - dateWidth - 32), PAD, footer);

  ctx.font = `700 26px ${MONO}`;
  ctx.fillStyle = INK_MUTED;
  const brand = 'FIELDLENS';
  ctx.fillText(brand, W - PAD - ctx.measureText(brand).width, footer - 96);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/png'),
  );
}

export function specimenFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `fieldlens-${slug || 'specimen'}.png`;
}

/**
 * Shares the card with the Web Share API when files can be shared, otherwise
 * downloads it. Resolves to what happened; a cancelled share sheet isn't an error.
 */
export async function shareOrDownload(
  blob: Blob,
  fileName: string,
  title: string,
): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], fileName, { type: 'image/png' });
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return 'cancelled';
      // Otherwise fall back to a download.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}
