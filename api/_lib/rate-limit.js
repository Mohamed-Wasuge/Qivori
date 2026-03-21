/**
 * Supabase-based rate limiter for Vercel Edge Functions.
 *
 * Unlike in-memory rate limiting (which resets on every cold start and doesn't
 * share state across serverless instances), this uses a Supabase `rate_limits`
 * table to persist request counts. Works correctly on Vercel serverless.
 *
 * Table SQL:
 *   CREATE TABLE IF NOT EXISTS rate_limits (
 *     id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *     user_id uuid NOT NULL,
 *     endpoint text NOT NULL,
 *     created_at timestamptz DEFAULT now()
 *   );
 *   CREATE INDEX idx_rate_limits_lookup ON rate_limits (user_id, endpoint, created_at);
 */

/**
 * Get a Supabase REST client URL and headers for the rate_limits table.
 * Uses the service role key so RLS doesn't block inserts.
 */
function getSupabaseConfig() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  // Prefer service role key (bypasses RLS), fall back to anon key
  const apiKey = serviceKey || anonKey

  if (!supabaseUrl || !apiKey) {
    return null
  }

  return {
    baseUrl: `${supabaseUrl}/rest/v1`,
    headers: {
      'apikey': apiKey,
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
  }
}

/**
 * Check if a user has exceeded their rate limit for an endpoint.
 *
 * @param {string} userId - The authenticated user's UUID
 * @param {string} endpoint - Endpoint identifier (e.g., 'chat', 'parse-ratecon')
 * @param {number} maxRequests - Max requests allowed in the window
 * @param {number} windowSeconds - Time window in seconds
 * @returns {Promise<{ limited: boolean, remaining: number, resetSeconds: number }>}
 */
export async function checkRateLimit(userId, endpoint, maxRequests, windowSeconds) {
  const config = getSupabaseConfig()

  // If Supabase isn't configured, allow the request (fail open)
  if (!config) {
    console.warn('[rate-limit] Supabase not configured — skipping rate limit check')
    return { limited: false, remaining: maxRequests, resetSeconds: 0 }
  }

  const windowStart = new Date(Date.now() - windowSeconds * 1000).toISOString()

  try {
    // Count recent requests in the window
    const countUrl = `${config.baseUrl}/rate_limits?select=id&user_id=eq.${userId}&endpoint=eq.${endpoint}&created_at=gte.${windowStart}`
    const countRes = await fetch(countUrl, {
      method: 'HEAD',
      headers: {
        ...config.headers,
        'Prefer': 'count=exact',
      },
    })

    // Parse count from content-range header: "0-N/total" or "*/0"
    const contentRange = countRes.headers.get('content-range') || ''
    let count = 0
    const match = contentRange.match(/\/(\d+)$/)
    if (match) {
      count = parseInt(match[1], 10)
    }

    if (count >= maxRequests) {
      return { limited: true, remaining: 0, resetSeconds: windowSeconds }
    }

    // Log this request (non-blocking — fire and forget)
    fetch(`${config.baseUrl}/rate_limits`, {
      method: 'POST',
      headers: config.headers,
      body: JSON.stringify({ user_id: userId, endpoint }),
    }).catch(() => {
      // Swallow insert errors — don't block the request
    })

    return {
      limited: false,
      remaining: maxRequests - count - 1,
      resetSeconds: windowSeconds,
    }
  } catch (err) {
    // On any error, fail open — don't block legitimate users
    console.error('[rate-limit] Error checking rate limit:', err.message)
    return { limited: false, remaining: maxRequests, resetSeconds: 0 }
  }
}

// ── Legacy in-memory rate limiter (kept for non-critical endpoints) ──────────
// These endpoints don't call paid APIs so in-memory is acceptable.
// TODO: Migrate remaining endpoints to checkRateLimit as needed.

const buckets = new Map()

/**
 * @deprecated Use checkRateLimit() for critical/expensive endpoints.
 * Simple in-memory rate limiter — resets on cold start.
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
export function rateLimitResponse(req, corsHeadersFn, resetSeconds) {
  const headers = corsHeadersFn ? corsHeadersFn(req) : {}
  headers['Retry-After'] = String(Math.ceil(resetSeconds))
  return Response.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers }
  )
}
