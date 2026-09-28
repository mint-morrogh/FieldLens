import { isValidLatLng } from '../../shared/geo.js';
import { nearbyFamiliesRequestSchema } from '../../shared/nearby.js';
import { readEnv, type ServerEnv } from '../lib/env.js';
import { ApiError, toApiError } from '../lib/errors.js';
import { logger } from '../lib/logger.js';
import { RateLimiter, clientIdFromRequest } from '../lib/rateLimit.js';
import { GbifClient } from '../providers/gbif/gbif.js';
import {
  NearbyService,
  coarseCell,
  mockFamilyCounts,
  mockWhatsOut,
} from '../providers/gbif/nearby.js';
import {
  INaturalistObservationProvider,
  INaturalistTaxonPhotosProvider,
} from '../providers/inaturalist/inaturalistProvider.js';
import { errorResponse, json } from './handlers.js';

/**
 * "Near you" endpoints: the journal's family counts and the home screen's
 * "What's out now". Both take a coarse location (rounded again here to ~11 km),
 * never log it, and answer from a days-long cache.
 */

/** Generous: each journal visit and home screen load makes at most one call each. */
const nearbyLimiter = new RateLimiter(60, 10 * 60 * 1000);

let defaultService: NearbyService | undefined;
function service(): NearbyService {
  defaultService ??= new NearbyService(
    new GbifClient(),
    new INaturalistTaxonPhotosProvider(new INaturalistObservationProvider()),
  );
  return defaultService;
}

export type NearbyHandlerOptions = {
  env?: ServerEnv;
  service?: NearbyService;
  limiter?: RateLimiter;
};

/** Browsers may reuse an answer for a few hours; it changes slowly. */
const CLIENT_CACHE = { 'Cache-Control': 'private, max-age=21600' };

function checkLimit(request: Request, options: NearbyHandlerOptions, env: ServerEnv) {
  const limiter = options.limiter ?? (env.useMockApi ? undefined : nearbyLimiter);
  const retryAfter = limiter ? limiter.check(clientIdFromRequest(request)) : 0;
  if (retryAfter > 0) {
    throw new ApiError('rate_limited', 'Too many requests. Please try again in a few minutes.', {
      retryAfterSeconds: retryAfter,
    });
  }
}

function fail(error: unknown, route: string): Response {
  const apiError = toApiError(error);
  // Never log coordinates or taxa: just which route failed and how.
  logger.info(`${route}.error`, { code: apiError.code });
  return errorResponse(apiError);
}

/** POST /api/nearby-families { latitude, longitude, taxa: [{ name, rank, group }] } */
export async function handleNearbyFamilies(
  request: Request,
  options: NearbyHandlerOptions = {},
): Promise<Response> {
  const env = options.env ?? readEnv();
  try {
    if (request.method !== 'POST') {
      return json({ error: { code: 'invalid_request', message: 'Use POST.' } }, 405, {
        Allow: 'POST',
      });
    }
    checkLimit(request, options, env);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError('invalid_request', 'The request could not be read.');
    }
    const parsed = nearbyFamiliesRequestSchema.safeParse(body);
    if (!parsed.success) throw new ApiError('invalid_request', 'Invalid location or taxa.');
    const req = { ...parsed.data, ...coarseCell(parsed.data) };
    if (env.useMockApi) return json(mockFamilyCounts(req), 200, CLIENT_CACHE);
    const result = await (options.service ?? service()).familyCounts(req);
    return json(result, 200, CLIENT_CACHE);
  } catch (error) {
    return fail(error, 'nearby_families');
  }
}

/** GET /api/whats-out?lat=46.2&lon=-63.1&month=9 */
export async function handleWhatsOut(
  request: Request,
  options: NearbyHandlerOptions = {},
): Promise<Response> {
  const env = options.env ?? readEnv();
  try {
    if (request.method !== 'GET') {
      return json({ error: { code: 'invalid_request', message: 'Use GET.' } }, 405, {
        Allow: 'GET',
      });
    }
    checkLimit(request, options, env);
    const params = new URL(request.url).searchParams;
    const latitude = Number(params.get('lat') ?? NaN);
    const longitude = Number(params.get('lon') ?? NaN);
    const monthParam = params.get('month');
    const month = monthParam ? Number(monthParam) : new Date().getUTCMonth() + 1;
    if (
      !params.get('lat') ||
      !params.get('lon') ||
      !isValidLatLng(latitude, longitude) ||
      !Number.isInteger(month) ||
      month < 1 ||
      month > 12
    ) {
      throw new ApiError('invalid_request', 'Invalid location or month.');
    }
    if (env.useMockApi) return json(mockWhatsOut(month), 200, CLIENT_CACHE);
    const result = await (options.service ?? service()).whatsOut({ latitude, longitude }, month);
    return json(result, 200, CLIENT_CACHE);
  } catch (error) {
    return fail(error, 'whats_out');
  }
}
