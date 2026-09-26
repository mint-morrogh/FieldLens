import { handleHealth } from '../server/http/handlers.js';

export function GET(): Response {
  return handleHealth();
}
