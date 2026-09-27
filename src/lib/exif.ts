/**
 * Minimal EXIF reader for JPEGs: GPS position and the date the photo was taken.
 * Runs entirely on the device, before the upload copy is re-encoded (which strips
 * all metadata). Only the ~1 km-rounded position ever leaves the phone.
 */

export type PhotoMetadata = {
  latitude?: number;
  longitude?: number;
  takenAt?: Date;
};

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME = 0x0132;

type Reader = { view: DataView; little: boolean; tiff: number };

function u16(r: Reader, off: number) {
  return r.view.getUint16(off, r.little);
}
function u32(r: Reader, off: number) {
  return r.view.getUint32(off, r.little);
}

/** Read an IFD into tag → { type, count, valueOffset(absolute) }. */
function readIfd(r: Reader, ifdOffset: number) {
  const tags = new Map<number, { type: number; count: number; at: number }>();
  const start = r.tiff + ifdOffset;
  if (start + 2 > r.view.byteLength) return tags;
  const n = u16(r, start);
  for (let i = 0; i < n; i++) {
    const e = start + 2 + i * 12;
    if (e + 12 > r.view.byteLength) break;
    const tag = u16(r, e);
    const type = u16(r, e + 2);
    const count = u32(r, e + 4);
    const size =
      ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 } as Record<number, number>)[type] ?? 1;
    // Values larger than 4 bytes live at an offset; smaller ones are inline.
    const at = size * count > 4 ? r.tiff + u32(r, e + 8) : e + 8;
    tags.set(tag, { type, count, at });
  }
  return tags;
}

function readRationals(r: Reader, at: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const num = u32(r, at + i * 8);
    const den = u32(r, at + i * 8 + 4);
    out.push(den ? num / den : 0);
  }
  return out;
}

function readAscii(r: Reader, at: number, count: number): string {
  let s = '';
  for (let i = 0; i < count && at + i < r.view.byteLength; i++) {
    const c = r.view.getUint8(at + i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}

/** "2026:09:21 14:05:33" → Date (local time), or undefined. */
export function parseExifDate(value: string): Date | undefined {
  const m = value.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return undefined;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isNaN(d.getTime()) || d.getFullYear() < 1990 ? undefined : d;
}

/** Parse EXIF from JPEG bytes. Returns {} when there is no usable metadata. */
export function parseExif(buffer: ArrayBuffer): PhotoMetadata {
  const view = new DataView(buffer);
  if (view.byteLength < 4 || view.getUint16(0) !== 0xffd8) return {};
  let offset = 2;
  while (offset + 4 < view.byteLength) {
    if (view.getUint8(offset) !== 0xff) return {};
    const marker = view.getUint8(offset + 1);
    const length = view.getUint16(offset + 2);
    if (marker === 0xe1 && view.getUint32(offset + 4) === 0x45786966) {
      // "Exif\0\0" then a TIFF header
      const tiff = offset + 10;
      const little = view.getUint16(tiff) === 0x4949;
      const r: Reader = { view, little, tiff };
      if (u16(r, tiff + 2) !== 42) return {};
      const ifd0 = readIfd(r, u32(r, tiff + 4));
      const out: PhotoMetadata = {};

      const exifPtr = ifd0.get(TAG_EXIF_IFD);
      const exif = exifPtr ? readIfd(r, u32(r, exifPtr.at)) : undefined;
      const dateTag = exif?.get(TAG_DATETIME_ORIGINAL) ?? ifd0.get(TAG_DATETIME);
      if (dateTag) out.takenAt = parseExifDate(readAscii(r, dateTag.at, dateTag.count));

      const gpsPtr = ifd0.get(TAG_GPS_IFD);
      if (gpsPtr) {
        const gps = readIfd(r, u32(r, gpsPtr.at));
        const latRef = gps.get(1);
        const lat = gps.get(2);
        const lngRef = gps.get(3);
        const lng = gps.get(4);
        if (lat && lng && lat.count === 3 && lng.count === 3) {
          const toDeg = ([d, m, s]: number[]) => d + m / 60 + s / 3600;
          let latitude = toDeg(readRationals(r, lat.at, 3));
          let longitude = toDeg(readRationals(r, lng.at, 3));
          if (latRef && readAscii(r, latRef.at, 2).startsWith('S')) latitude = -latitude;
          if (lngRef && readAscii(r, lngRef.at, 2).startsWith('W')) longitude = -longitude;
          // Ignore the 0,0 placeholder some apps write.
          if (
            Number.isFinite(latitude) &&
            Number.isFinite(longitude) &&
            !(latitude === 0 && longitude === 0)
          ) {
            out.latitude = latitude;
            out.longitude = longitude;
          }
        }
      }
      return out;
    }
    if (marker === 0xda) return {}; // start of image data: no EXIF segment
    offset += 2 + length;
  }
  return {};
}

export async function readPhotoMetadata(file: Blob): Promise<PhotoMetadata> {
  try {
    // EXIF lives in the first segments; 256 KB is plenty.
    return parseExif(await file.slice(0, 256 * 1024).arrayBuffer());
  } catch {
    return {};
  }
}
