import type { ApiErrorCode } from '../../shared/types.js';

const STATUS: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  invalid_file: 415,
  image_too_large: 413,
  too_many_images: 400,
  unsupported_category: 422,
  rate_limited: 429,
  provider_quota_exhausted: 503,
  provider_timeout: 504,
  provider_unavailable: 502,
  provider_auth: 503,
  zero_predictions: 200,
  not_configured: 503,
  internal_error: 500,
};

/** An error that is safe to show to the client. Messages must never contain secrets. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly retryAfterSeconds?: number;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: { retryAfterSeconds?: number; status?: number } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = options.status ?? STATUS[code];
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

/** Failure talking to an upstream service. `status` is the upstream HTTP status when known. */
export class UpstreamError extends Error {
  readonly service: string;
  readonly status?: number;
  readonly kind: 'timeout' | 'network' | 'http' | 'parse';
  /** Extra detail safe to show, e.g. how long until a quota resets ("2 h 5 min"). */
  readonly detail?: string;

  constructor(service: string, kind: UpstreamError['kind'], status?: number, detail?: string) {
    super(`${service} ${kind}${status ? ` ${status}` : ''}`);
    this.name = 'UpstreamError';
    this.service = service;
    this.kind = kind;
    this.status = status;
    this.detail = detail;
  }
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof UpstreamError) {
    if (error.kind === 'timeout') {
      return new ApiError(
        'provider_timeout',
        'The identification service took too long to respond. Please try again.',
      );
    }
    if (error.status === 429) {
      // No fallback to a lower-accuracy service: say plainly that today's free quota is used.
      const message =
        error.service === 'Pl@ntNet'
          ? 'We’ve used today’s free plant identifications from Pl@ntNet. They reset at midnight UTC — please try again then.'
          : error.service === 'BioCLIP 2'
            ? `We’ve used today’s free identification time for animals, fungi and insects.${error.detail ? ` It resets in about ${error.detail}.` : ' It resets within a day.'}`
            : 'The identification service’s daily quota is used up. Please try again later.';
      return new ApiError('provider_quota_exhausted', message, { retryAfterSeconds: 3600 });
    }
    if (error.status === 401 || error.status === 403) {
      return new ApiError(
        'provider_auth',
        'The identification service rejected this server’s credentials. The site owner needs to check the API key.',
      );
    }
    return new ApiError(
      'provider_unavailable',
      'The identification service is temporarily unavailable. Please try again shortly.',
    );
  }
  return new ApiError('internal_error', 'Something went wrong on our side. Please try again.');
}
