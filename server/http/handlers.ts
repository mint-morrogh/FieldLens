import { APP_VERSION, RATE_LIMIT } from '../../shared/config.js';
import type { ApiErrorBody, HealthResponse } from '../../shared/types.js';
import { runIdentification } from '../identify/pipeline.js';
import { readEnv, type ServerEnv } from '../lib/env.js';
import { ApiError, toApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { RateLimiter, clientIdFromRequest } from '../lib/rateLimit.js';
import { getProviders, supportedCategories } from '../providers/registry.js';
import type { ProviderSet } from '../providers/types.js';
import { assertContentLength, parseIdentifyForm } from '../validation/upload.js';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

export function errorResponse(error: ApiError): Response {
  const body: ApiErrorBody = {
    error: { code: error.code, message: error.message, retryAfterSeconds: error.retryAfterSeconds },
  };
  const headers: Record<string, string> = error.retryAfterSeconds
    ? { 'Retry-After': String(error.retryAfterSeconds) }
    : {};
  return json(body, error.status, headers);
}

const identifyLimiter = new RateLimiter(
  RATE_LIMIT.identifyMaxRequests,
  RATE_LIMIT.identifyWindowMs,
);

export type HandlerOptions = {
  env?: ServerEnv;
  providers?: (scenario?: string) => ProviderSet;
  limiter?: RateLimiter;
};

export async function handleIdentify(
  request: Request,
  options: HandlerOptions = {},
): Promise<Response> {
  const env = options.env ?? readEnv();
  try {
    if (request.method !== 'POST') {
      return json({ error: { code: 'invalid_request', message: 'Use POST.' } }, 405, {
        Allow: 'POST',
      });
    }
    // The limit protects live provider quotas; mock mode has none to protect.
    const limiter = options.limiter ?? (env.useMockApi ? undefined : identifyLimiter);
    const retryAfter = limiter ? limiter.check(clientIdFromRequest(request)) : 0;
    if (retryAfter > 0) {
      throw new ApiError(
        'rate_limited',
        'You’ve made a lot of identifications in a short time. Please wait a few minutes and try again.',
        {
          retryAfterSeconds: retryAfter,
        },
      );
    }
    if (!env.useMockApi && !env.plantnetApiKey) {
      throw new ApiError(
        'not_configured',
        'Plant identification isn’t configured on this server yet. The site owner needs to add a Pl@ntNet API key.',
      );
    }
    assertContentLength(request);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new ApiError('invalid_request', 'The upload could not be read. Please try again.');
    }
    const input = await parseIdentifyForm(form);
    const providers = options.providers
      ? options.providers(input.mockScenario)
      : getProviders(env, input.mockScenario);
    const result = await runIdentification(input, { providers });
    return json(result);
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.code === 'internal_error') {
      // Log only the error class/message: never request bodies, images, or coordinates.
      logger.warn('identify.internal_error', {
        name: error instanceof Error ? error.name : 'unknown',
        message: env.isProduction ? undefined : String(error),
      });
    } else {
      logger.info('identify.error', { code: apiError.code });
    }
    return errorResponse(apiError);
  }
}

export function handleHealth(options: { env?: ServerEnv } = {}): Response {
  const env = options.env ?? readEnv();
  const body: HealthResponse = {
    ok: true,
    appName: env.appName,
    version: APP_VERSION,
    plantIdentificationConfigured: env.useMockApi || !!env.plantnetApiKey,
    mock: env.useMockApi,
    supportedCategories: supportedCategories(env),
  };
  return json(body);
}
