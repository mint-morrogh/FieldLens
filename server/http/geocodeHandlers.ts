import { GEOCODE } from '../../shared/geocode.js';
import { readEnv, type ServerEnv } from '../lib/env.js';
import { ApiError, toApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { RateLimiter, clientIdFromRequest } from '../lib/rateLimit.js';
import { GeocodeService, MOCK_GEOCODE } from '../providers/geocode/geocode.js';
import { errorResponse, json } from './handlers.js';

/**
 * GET /api/geocode?q=... — find a place for the home patch. Returns short labels and
 * positions rounded to ~11 km. The query is never logged, and the answer is `no-store` so
 * browsers don't keep the typed address in their HTTP cache.
 */

/** Searches only run on submit, so a person needs a handful at most. */
const geocodeLimiter = new RateLimiter(20, 10 * 60 * 1000);

let defaultService: GeocodeService | undefined;

export type GeocodeHandlerOptions = {
  env?: ServerEnv;
  service?: GeocodeService;
  limiter?: RateLimiter;
};

export async function handleGeocode(
  request: Request,
  options: GeocodeHandlerOptions = {},
): Promise<Response> {
  const env = options.env ?? readEnv();
  try {
    if (request.method !== 'GET') {
      return json({ error: { code: 'invalid_request', message: 'Use GET.' } }, 405, {
        Allow: 'GET',
      });
    }
    const limiter = options.limiter ?? (env.useMockApi ? undefined : geocodeLimiter);
    const retryAfter = limiter ? limiter.check(clientIdFromRequest(request)) : 0;
    if (retryAfter > 0) {
      throw new ApiError('rate_limited', 'Too many searches. Please try again in a few minutes.', {
        retryAfterSeconds: retryAfter,
      });
    }
    const q = (new URL(request.url).searchParams.get('q') ?? '').trim();
    if (q.length < GEOCODE.minQuery || q.length > GEOCODE.maxQuery) {
      throw new ApiError('invalid_request', 'Type a place or address to search for.');
    }
    if (env.useMockApi) return json(MOCK_GEOCODE);
    defaultService ??= new GeocodeService();
    return json(await (options.service ?? defaultService).search(q));
  } catch (error) {
    const apiError = toApiError(error);
    // Never log the query: just that the route failed and how.
    logger.info('geocode.error', { code: apiError.code });
    return errorResponse(apiError);
  }
}
