import { handleUsage } from '../server/http/handlers.js';

export async function GET(): Promise<Response> {
  return handleUsage();
}
