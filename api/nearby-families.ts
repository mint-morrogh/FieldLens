import { handleNearbyFamilies } from '../server/http/nearbyHandlers.js';

export async function POST(request: Request): Promise<Response> {
  return handleNearbyFamilies(request);
}
