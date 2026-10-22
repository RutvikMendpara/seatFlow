const MINUTE = 60_000;

// Limits per route. Counters are kept in memory, so with several API
// instances each one counts separately. Moving them to Redis is the next
// step if that matters.
export const LIMITS = {
  login: { default: { limit: 10, ttl: 15 * MINUTE } },
  // Per IP, which is only meaningful with TRUST_PROXY set behind a real
  // reverse proxy. Without one, every request seems to come from the web app.
  register: { default: { limit: 50, ttl: 10 * MINUTE } },
  hold: { default: { limit: 30, ttl: MINUTE } },
  checkout: { default: { limit: 20, ttl: MINUTE } },
} as const;
