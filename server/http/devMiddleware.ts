import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import { handleHealth, handleIdentify, handleUsage } from './handlers.js';
import { handleGeocode } from './geocodeHandlers.js';
import { handleNearbyFamilies, handleWhatsOut } from './nearbyHandlers.js';

/**
 * Connect-style middleware that serves /api/* from the same handlers Vercel
 * uses, so `vite` and `vite preview` work locally without the Vercel CLI.
 */
export function apiMiddleware() {
  return async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return next();

    let response: Response;
    if (url.pathname === '/api/health') {
      response = handleHealth();
    } else if (url.pathname === '/api/usage') {
      response = await handleUsage();
    } else if (url.pathname === '/api/whats-out') {
      response = await handleWhatsOut(await toRequest(req, url));
    } else if (url.pathname === '/api/geocode') {
      response = await handleGeocode(await toRequest(req, url));
    } else if (url.pathname === '/api/nearby-families') {
      response = await handleNearbyFamilies(await toRequest(req, url));
    } else if (url.pathname === '/api/identify') {
      const headers = new Headers();
      for (const [k, v] of Object.entries(req.headers)) {
        if (typeof v === 'string') headers.set(k, v);
        else if (Array.isArray(v)) headers.set(k, v.join(', '));
      }
      if (!headers.has('x-forwarded-for') && req.socket.remoteAddress)
        headers.set('x-forwarded-for', req.socket.remoteAddress);
      const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
      const request = new Request(url, {
        method: req.method,
        headers,
        body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
        // @ts-expect-error — required by Node's fetch for streaming request bodies
        duplex: 'half',
      });
      response = await handleIdentify(request);
    } else {
      response = new Response(
        JSON.stringify({ error: { code: 'invalid_request', message: 'Not found' } }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }

    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    if (!response.body) return res.end();
    // Forward chunks as they arrive so streamed progress reaches the browser live.
    for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
      res.write(chunk);
    }
    res.end();
  };
}

/** A small buffered Web Request for the JSON endpoints (not for streamed uploads). */
async function toRequest(req: IncomingMessage, url: URL): Promise<Request> {
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === 'string') headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(', '));
  }
  if (!headers.has('x-forwarded-for') && req.socket.remoteAddress)
    headers.set('x-forwarded-for', req.socket.remoteAddress);
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  let body: string | undefined;
  if (hasBody) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    body = Buffer.concat(chunks).toString('utf8');
  }
  return new Request(url, { method: req.method, headers, body });
}
