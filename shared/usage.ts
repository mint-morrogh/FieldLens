/** Today's use of the free identification services (GET /api/usage). */
export type UsageResponse = {
  checkedAt: string;
  mock: boolean;
  plantnet?: {
    /** Pl@ntNet's day (UTC), e.g. "2026-09-28". */
    day: string;
    used: number;
    limit: number;
    remaining: number;
  };
  bioclip?: {
    /** Hugging Face doesn't report ZeroGPU usage, so only a limit hit is known. */
    allowance: string;
    /** Set when a request recently failed because the GPU quota ran out. */
    quotaReachedAt?: string;
    retryIn?: string;
  };
};
