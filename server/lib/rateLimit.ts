import { createHash } from 'node:crypto';

/**
 * Privacy-conscious, ephemeral fixed-window limiter. Client identifiers are
 * hashed with a salt that rotates daily and only live in memory, so no IP
 * address is ever stored or logged. Limits are per serverless instance.
 */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records an attempt. Returns 0 if allowed, otherwise seconds until the next slot frees up. */
  check(clientId: string): number {
    const key = hashClient(clientId, this.now());
    const cutoff = this.now() - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > cutoff);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return Math.max(1, Math.ceil((recent[0] + this.windowMs - this.now()) / 1000));
    }
    recent.push(this.now());
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.prune(cutoff);
    return 0;
  }

  private prune(cutoff: number) {
    for (const [key, times] of this.hits) {
      if (times.every((t) => t <= cutoff)) this.hits.delete(key);
    }
  }
}

function hashClient(clientId: string, now: number): string {
  const daySalt = Math.floor(now / 86_400_000).toString();
  return createHash('sha256').update(`${daySalt}:${clientId}`).digest('base64url').slice(0, 22);
}

export function clientIdFromRequest(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
  return ip;
}
