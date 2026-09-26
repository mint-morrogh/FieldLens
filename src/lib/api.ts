/**
 * The only module that talks to the FieldLens API. Components call these
 * functions; they never fetch providers directly.
 */
import { apiErrorSchema, healthResponseSchema, identifyResponseSchema } from '../../shared/schemas';
import type {
  ApiErrorCode,
  ApproxLocation,
  FeatureId,
  HealthResponse,
  IdentifyResponse,
  OrganismCategory,
} from '../../shared/types';
import { getMockScenario } from './mockScenario';

export type ClientErrorCode = ApiErrorCode | 'offline' | 'network' | 'bad_response' | 'aborted';

export class ClientError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    message: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'ClientError';
  }
}

export type IdentifyRequest = {
  observationId: string;
  category: OrganismCategory;
  images: { blob: Blob; feature: FeatureId }[];
  location?: ApproxLocation;
  capturedAt: Date;
};

export type IdentifyOptions = {
  onUploadProgress?: (fraction: number) => void;
  signal?: AbortSignal;
};

export function buildIdentifyForm(
  req: IdentifyRequest,
  mockScenario = getMockScenario(),
): FormData {
  const form = new FormData();
  form.append('category', req.category);
  form.append('observationId', req.observationId);
  form.append('capturedAt', req.capturedAt.toISOString());
  req.images.forEach((img, i) => {
    form.append('images', img.blob, `photo-${i + 1}.jpg`);
    form.append('features', img.feature);
  });
  if (req.location) {
    form.append('latitude', String(req.location.latitude));
    form.append('longitude', String(req.location.longitude));
  }
  if (mockScenario) form.append('mockScenario', mockScenario);
  return form;
}

function parseError(status: number, body: unknown): ClientError {
  const parsed = apiErrorSchema.safeParse(body);
  if (parsed.success) {
    return new ClientError(
      parsed.data.error.code as ClientErrorCode,
      parsed.data.error.message,
      parsed.data.error.retryAfterSeconds,
    );
  }
  if (status === 429)
    return new ClientError(
      'rate_limited',
      'Too many requests. Please wait a moment and try again.',
    );
  if (status === 404)
    return new ClientError(
      'not_configured',
      'The identification service could not be reached on this deployment.',
    );
  return new ClientError('internal_error', 'Something went wrong. Please try again.');
}

/** Upload with progress (XHR, since fetch cannot report upload progress). */
export function identify(
  req: IdentifyRequest,
  options: IdentifyOptions = {},
): Promise<IdentifyResponse> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.reject(new ClientError('offline', 'You’re offline.'));
  }
  const form = buildIdentifyForm(req);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/identify');
    xhr.responseType = 'text';
    xhr.timeout = 60_000;
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) options.onUploadProgress?.(e.loaded / e.total);
    };
    xhr.upload.onload = () => options.onUploadProgress?.(1);
    xhr.onerror = () =>
      reject(
        navigator.onLine === false
          ? new ClientError('offline', 'You’re offline.')
          : new ClientError(
              'network',
              'We couldn’t reach FieldLens. Check your connection and try again.',
            ),
      );
    xhr.ontimeout = () =>
      reject(new ClientError('provider_timeout', 'This is taking too long. Please try again.'));
    xhr.onabort = () => reject(new ClientError('aborted', 'Cancelled.'));
    xhr.onload = () => {
      let body: unknown;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        reject(parseError(xhr.status, undefined));
        return;
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(parseError(xhr.status, body));
        return;
      }
      const parsed = identifyResponseSchema.safeParse(body);
      if (!parsed.success) {
        reject(
          new ClientError('bad_response', 'We received an unexpected response. Please try again.'),
        );
        return;
      }
      resolve(parsed.data);
    };
    options.signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

export async function getHealth(): Promise<HealthResponse | undefined> {
  try {
    const res = await fetch('/api/health', { headers: { Accept: 'application/json' } });
    if (!res.ok) return undefined;
    const parsed = healthResponseSchema.safeParse(await res.json());
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}
