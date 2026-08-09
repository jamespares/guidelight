import type { Env } from '../types'

/**
 * Fixed-window rate limiter backed by D1.
 *
 * The public API accepts a window in seconds and a max request count, so callers
 * can be switched to a sliding-window implementation later without changing
 * signatures.
 */
export async function checkRateLimit(
  env: Env,
  key: string,
  windowSeconds: number,
  maxRequests: number,
): Promise<boolean> {
  const now = Math.floor(Date.now() / 1000)
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds

  // Start a fresh row for this window if none exists.
  await env.DB.prepare(
    `INSERT OR IGNORE INTO rate_limits (key, window_start, count) VALUES (?, ?, 0)`,
  )
    .bind(key, windowStart)
    .run()

  // Roll forward stale windows.
  await env.DB.prepare(
    `UPDATE rate_limits SET window_start = ?, count = 0 WHERE key = ? AND window_start < ?`,
  )
    .bind(windowStart, key, windowStart)
    .run()

  // Atomically claim a slot if under the limit.
  const result = await env.DB.prepare(
    `UPDATE rate_limits SET count = count + 1 WHERE key = ? AND count < ?`,
  )
    .bind(key, maxRequests)
    .run()

  return result.meta.changes > 0
}

export function rateLimitIp(
  request: Request,
  env: Env,
  windowSeconds: number,
  maxRequests: number,
): Promise<boolean> {
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown'
  return checkRateLimit(env, `ip:${ip}`, windowSeconds, maxRequests)
}

export function rateLimitUser(
  userId: string,
  env: Env,
  windowSeconds: number,
  maxRequests: number,
): Promise<boolean> {
  return checkRateLimit(env, `user:${userId}`, windowSeconds, maxRequests)
}
