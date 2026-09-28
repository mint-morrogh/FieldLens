import { z } from 'zod';
import { DEFAULT_CATEGORY, isIdentifyTarget, isValidFeature } from '../../shared/categories.js';
import { AUDIO, UPLOAD } from '../../shared/config.js';
import { isValidLatLng, toApproxLocation } from '../../shared/geo.js';
import type { IdentifyTarget } from '../../shared/types.js';
import { ApiError } from '../lib/errors.js';
import type { IdentificationInput, InputAudio, InputImage } from '../providers/types.js';

type Limits = typeof UPLOAD;

/** Identify the real image type from its leading bytes; the declared MIME type is not trusted. */
export function sniffImageType(
  bytes: Uint8Array,
): 'image/jpeg' | 'image/png' | 'image/webp' | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  )
    return 'image/png';
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  )
    return 'image/webp';
  return undefined;
}

/** Read pixel dimensions from the image header without decoding it. */
export function readImageDimensions(
  bytes: Uint8Array,
  type: string,
): { width: number; height: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'image/png' && bytes.length >= 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (type === 'image/jpeg') {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return undefined;
      const marker = bytes[offset + 1];
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        offset += 2;
        continue;
      }
      const length = view.getUint16(offset + 2);
      // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
    return undefined;
  }
  if (type === 'image/webp' && bytes.length >= 30) {
    const chunk = String.fromCharCode(...bytes.subarray(12, 16));
    if (chunk === 'VP8 ')
      return {
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    if (chunk === 'VP8L') {
      const b = view.getUint32(21, true);
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 };
    }
    if (chunk === 'VP8X') {
      const w = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
      const h = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
      return { width: w, height: h };
    }
  }
  return undefined;
}

const fieldsSchema = z.object({
  category: z
    .string()
    .refine((v) => isIdentifyTarget(v))
    .default(DEFAULT_CATEGORY),
  observationId: z
    .string()
    .regex(/^[A-Za-z0-9_-]{1,64}$/)
    .optional(),
  latitude: z.coerce.number().optional(),
  longitude: z.coerce.number().optional(),
  capturedAt: z.string().max(40).optional(),
  locationSource: z.enum(['device', 'photo']).optional(),
  // Context hints from newer clients: optional, and dropped (not rejected) when malformed.
  localHour: z.coerce.number().min(0).max(24).optional().catch(undefined),
  localHourApprox: z
    .enum(['1', 'true', '0', 'false'])
    .transform((v) => v === '1' || v === 'true')
    .optional()
    .catch(undefined),
  tilt: z.enum(['up', 'level', 'down']).optional().catch(undefined),
  mockScenario: z
    .string()
    .regex(/^[a-z0-9-]{1,32}$/)
    .optional(),
});

function stringField(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function assertContentLength(request: Request, limits: Limits = UPLOAD): void {
  const length = Number(request.headers.get('content-length') ?? NaN);
  if (Number.isFinite(length) && length > limits.maxRequestBytes) {
    throw new ApiError(
      'image_too_large',
      'These photos are too large to upload together. Try fewer or smaller photos.',
    );
  }
  const type = request.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data')) {
    throw new ApiError('invalid_request', 'Expected a multipart form upload.');
  }
}

/** Duration in seconds of a mono 16-bit PCM WAV at the expected rate, or undefined if it isn't one. */
export function wavSeconds(
  data: Uint8Array,
  sampleRate: number = AUDIO.sampleRate,
): number | undefined {
  if (data.length < 44) return undefined;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const tag = (offset: number) => String.fromCharCode(...data.subarray(offset, offset + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || tag(12) !== 'fmt ' || tag(36) !== 'data')
    return undefined;
  const pcm = view.getUint16(20, true) === 1;
  const mono = view.getUint16(22, true) === 1;
  const bits = view.getUint16(34, true);
  if (!pcm || !mono || bits !== 16 || view.getUint32(24, true) !== sampleRate) return undefined;
  const bytes = Math.min(view.getUint32(40, true), data.length - 44);
  return bytes / 2 / sampleRate;
}

async function parseAudio(form: FormData): Promise<InputAudio | undefined> {
  const file = form.get('audio');
  if (!file || typeof file === 'string') return undefined;
  // 16-bit mono: 2 bytes per sample, plus the 44-byte header.
  if (file.size > 44 + AUDIO.maxSeconds * AUDIO.sampleRate * 2 + 1024) {
    throw new ApiError('invalid_file', `Recordings can be up to ${AUDIO.maxSeconds} seconds.`);
  }
  const data = new Uint8Array(await file.arrayBuffer());
  const seconds = wavSeconds(data);
  if (seconds === undefined) throw new ApiError('invalid_file', 'That recording couldn’t be read.');
  if (seconds < AUDIO.minSeconds - 0.25) {
    throw new ApiError('invalid_file', `Record at least ${AUDIO.minSeconds} seconds.`);
  }
  return { data, mimeType: 'audio/wav', seconds };
}

export async function parseIdentifyForm(
  form: FormData,
  limits: Limits = UPLOAD,
  now: Date = new Date(),
): Promise<IdentificationInput> {
  const parsed = fieldsSchema.safeParse({
    category: stringField(form, 'category'),
    observationId: stringField(form, 'observationId'),
    latitude: stringField(form, 'latitude'),
    longitude: stringField(form, 'longitude'),
    capturedAt: stringField(form, 'capturedAt'),
    mockScenario: stringField(form, 'mockScenario'),
    locationSource: stringField(form, 'locationSource'),
    localHour: stringField(form, 'localHour'),
    localHourApprox: stringField(form, 'localHourApprox'),
    tilt: stringField(form, 'tilt'),
  });
  if (!parsed.success) throw new ApiError('invalid_request', 'Some request fields were invalid.');
  const fields = parsed.data;
  const category = fields.category as IdentifyTarget;

  const files = form.getAll('images').filter((v): v is File => typeof v !== 'string');
  const features = form.getAll('features').map((v) => (typeof v === 'string' ? v : 'auto'));
  const audio = await parseAudio(form);
  if (files.length === 0 && !audio)
    throw new ApiError('invalid_request', 'Please include at least one photo.');
  if (files.length > limits.maxImages) {
    throw new ApiError(
      'too_many_images',
      `Up to ${limits.maxImages} photos can be combined in one identification.`,
    );
  }

  let total = 0;
  const images: InputImage[] = [];
  for (const [i, file] of files.entries()) {
    if (file.size > limits.maxImageBytes) {
      throw new ApiError(
        'image_too_large',
        'One of the photos is too large. Please try a smaller photo.',
      );
    }
    total += file.size;
    if (total > limits.maxRequestBytes) {
      throw new ApiError(
        'image_too_large',
        'These photos are too large to upload together. Try fewer or smaller photos.',
      );
    }
    if (!(limits.acceptedMimeTypes as readonly string[]).includes(file.type)) {
      throw new ApiError('invalid_file', 'Only JPEG, PNG, or WebP photos are supported.');
    }
    const data = new Uint8Array(await file.arrayBuffer());
    const sniffed = sniffImageType(data);
    if (!sniffed) throw new ApiError('invalid_file', 'That file does not look like a photo.');
    const dims = readImageDimensions(data, sniffed);
    if (dims) {
      const longest = Math.max(dims.width, dims.height);
      const shortest = Math.min(dims.width, dims.height);
      if (longest > limits.maxDimension)
        throw new ApiError('image_too_large', 'That photo’s dimensions are too large.');
      if (shortest < limits.minDimension)
        throw new ApiError('invalid_file', 'That photo is too small to identify.');
    }
    const feature = features[i] ?? 'auto';
    images.push({
      data,
      mimeType: sniffed,
      feature: isValidFeature(category, feature) ? feature : 'auto',
    });
  }

  let location: IdentificationInput['location'];
  if (fields.latitude !== undefined && fields.longitude !== undefined) {
    if (!isValidLatLng(fields.latitude, fields.longitude))
      throw new ApiError('invalid_request', 'Location was invalid.');
    // Re-round server-side: never trust the client to have applied the privacy grid.
    location = toApproxLocation(fields.latitude, fields.longitude);
  }

  let capturedAt = now;
  if (fields.capturedAt) {
    const d = new Date(fields.capturedAt);
    if (!Number.isNaN(d.getTime()) && d.getTime() <= now.getTime() + 86_400_000) capturedAt = d;
  }

  return {
    observationId: fields.observationId ?? crypto.randomUUID(),
    category,
    images,
    location,
    locationSource: location ? (fields.locationSource ?? 'device') : undefined,
    capturedAt,
    ...(fields.localHour !== undefined && {
      localHour: fields.localHour,
      localHourApprox: fields.localHourApprox ?? false,
    }),
    ...(fields.tilt && { tilt: fields.tilt }),
    mockScenario: fields.mockScenario,
    ...(audio && { audio }),
  };
}
