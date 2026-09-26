import { handleIdentify } from '../server/http/handlers.js';

// Vercel Node.js function using the Web-standard Request/Response signature.
export function POST(request: Request): Promise<Response> {
  return handleIdentify(request);
}

export function GET(request: Request): Promise<Response> {
  return handleIdentify(request);
}
