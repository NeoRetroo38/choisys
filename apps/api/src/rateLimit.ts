import { ApiError } from './errors.js';

export const PRODUCT_WINDOW_MS = 60_000;
export const PRODUCT_LIMIT = 60;
const MAX_TRACKED_KEYS = 10_000;

/** Fixed-window counter per key, in memory. Resets on restart and is not shared between instances. */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; expiresAt: number }>();
  constructor(
    private readonly limit = PRODUCT_LIMIT,
    private readonly windowMs = PRODUCT_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  consume(key: string): void {
    const now = this.now();
    for (const [stored, value] of this.hits) if (value.expiresAt <= now) this.hits.delete(stored);
    const value = this.hits.get(key);
    if ((value?.count ?? 0) >= this.limit || (!value && this.hits.size >= MAX_TRACKED_KEYS)) throw new ApiError(429, 'AUTH_RATE_LIMITED');
    if (value) value.count++;
    else this.hits.set(key, { count: 1, expiresAt: now + this.windowMs });
  }
}
