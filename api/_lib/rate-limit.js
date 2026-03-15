/**
 * Simple in-memory rate limiter for Edge functions.
 * Resets on cold start — good enough for basic abuse prevention.
 * For production scale, use Redis/Upstash.
 */

const buckets = new Map()

/**
 * Check if a request should be rate-limited.
 * @param {string} key - Unique key (e.g., IP + endpoint)
 * @param {number} maxRequests - Max requests per window
 * @param {number} windowMs - Time window in milliseconds
 * @returns {{ limited: boolean, remaining: number, resetMs: number }}
 */
export function rateLimit(key, maxRequests = 10, windowMs = 60000) {
  const now = Date.now()
  const bucket = buckets.get(key)

  if (!bucket || now - bucket.windowStart > windowMs) {
    buckets.set(key, { windowStart: now, count: 1 })
    return { limited: false, remaining: maxRequests - 1, resetMs: windowMs }
  }

  bucket.count++
  const remaining = Math.max(0, maxRequests - bucket.count)

  if (bucket.count > maxRequests) {
    const resetMs = windowMs - (now - bucket.windowStart)
    return { limited: true, remaining: 0, resetMs }
  }

  return { limited: false, remaining, resetMs: windowMs - (now - bucket.windowStart) }
}

/**
 * Get client IP from request headers.
 */
export function getClientIP(req) {
  return req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'
}

/**
 * Return a 429 response with rate limit headers.
 */
export function rateLimitResponse(req, corsHeadersFn, resetMs) {
  const headers = corsHeadersFn ? corsHeadersFn(req) : {}
  headers['Retry-After'] = String(Math.ceil(resetMs / 1000))
  return Response.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers }
  )
}
