import { handleWhatsOut } from '../server/http/nearbyHandlers.js';

export async function GET(request: Request): Promise<Response> {
  return handleWhatsOut(request);
}
