import { handleGeocode } from '../server/http/geocodeHandlers.js';

export async function GET(request: Request): Promise<Response> {
  return handleGeocode(request);
}
