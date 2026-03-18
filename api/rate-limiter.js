/**
 * Qivori Rate Limiter Middleware
 * Provides rate limiting for all API endpoints using Supabase as storage.
 * 
 * Usage in other API routes:
 *   import { checkRateLimit } from './rate-limiter.js'
 *   const limited = await checkRateLimit(req, { maxRequests: 60, windowMs: 60000 })
 *   if (limited) return limited // returns 429 response
 *
 * Also serves as a standalone endpoint for rate limit status checks.
 */
import { sendAdminSMS } from './_lib/emails.js'

export const config = { runtime: 'edge' }

const supabaseUrl = () => process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseKey = () => process.env.SUPABASE_SERVICE_KEY

function supabaseHeaders(method = 'GET') {
  const key = supabaseKey()
  const headers = { 'apikey': key, 'Authorization': `Bearer ${key}` }
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json'
    headers['Prefer'] = 'return=minimal'
  }
  return headers
}

// ── In-memory rate limit store (per Edge Function instance) ──
// This works well for Edge Functions since each instance handles
// multiple requests. Falls back gracefully on cold starts.
const rateLimitStore = new Map()

// Clean up old entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000
let lastCleanup = Date.now()

function cleanupStore() {
  const now = Date.now()
  if (now - lastCleanup < CLEANUP_INTERVAL) return
  lastCleanup = now
  for (const [key, data] of rateLimitStore) {
    if (now - data.windowStart > data.windowMs * 2) {
      rateLimitStore.delete(key)
    }
  }
}

// ── Rate limit checker ──
function getClientIP(req) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

/**
 * Check rate limit for a request.
 * @param {Request} req - The incoming request
 * @param {Object} options - Rate limit options
 * @param {number} options.maxRequests - Max requests per window (default: 60)
 * @param {number} options.windowMs - Window size in ms (default: 60000 = 1 min)
 * @param {string} options.keyPrefix - Prefix for the rate limit key (default: 'global')
 * @returns {Response|null} - Returns 429 Response if limited, null if allowed
 */
export function checkRateLimit(req, options = {}) {
  const {
    maxRequests = 60,
    windowMs = 60000,
    keyPrefix = 'global',
  } = options

  cleanupStore()

  const ip = getClientIP(req)
  const path = new URL(req.url).pathname
  const key = `${keyPrefix}:${ip}:${path}`
  const now = Date.now()

  let entry = rateLimitStore.get(key)

  if (!entry || now - entry.windowStart > windowMs) {
    // New window
    entry = { count: 1, windowStart: now, windowMs }
    rateLimitStore.set(key, entry)
    return null // Allowed
  }

  entry.count++

  if (entry.count > maxRequests) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000)
    return new Response(JSON.stringify({
      error: 'Too many requests',
      message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
      retry_after: retryAfter,
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        'X-RateLimit-Limit': String(maxRequests),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil((entry.windowStart + windowMs) / 1000)),
        'Access-Control-Allow-Origin': '*',
      },
    })
  }

  return null // Allowed
}

// ── Endpoint-specific rate limit configs ──
const RATE_LIMITS = {
  '/api/error-report': { maxRequests: 30, windowMs: 60000, keyPrefix: 'error-report' },
  '/api/chat': { maxRequests: 20, windowMs: 60000, keyPrefix: 'chat' },
  '/api/create-checkout': { maxRequests: 10, windowMs: 60000, keyPrefix: 'checkout' },
  '/api/create-user': { maxRequests: 5, windowMs: 300000, keyPrefix: 'create-user' },
  '/api/create-portal': { maxRequests: 10, windowMs: 60000, keyPrefix: 'portal' },
  '/api/demo-request': { maxRequests: 5, windowMs: 300000, keyPrefix: 'demo' },
  '/api/auto-match': { maxRequests: 30, windowMs: 60000, keyPrefix: 'auto-match' },
  '/api/bot-load-finder': { maxRequests: 20, windowMs: 60000, keyPrefix: 'bot-load' },
  '/api/diesel-prices': { maxRequests: 30, windowMs: 60000, keyPrefix: 'diesel' },
  '/api/admin-email': { maxRequests: 10, windowMs: 60000, keyPrefix: 'admin-email' },
  'default': { maxRequests: 60, windowMs: 60000, keyPrefix: 'default' },
}

/**
 * Get rate limit config for a specific path.
 */
export function getRateLimitConfig(path) {
  return RATE_LIMITS[path] || RATE_LIMITS['default']
}

// ── Abuse detection ──
const abuseTracker = new Map()

function trackAbuse(ip, path) {
  const key = `abuse:${ip}`
  const now = Date.now()
  let entry = abuseTracker.get(key)

  if (!entry || now - entry.start > 3600000) { // 1 hour window
    entry = { count: 0, start: now, paths: new Set() }
    abuseTracker.set(key, entry)
  }

  entry.count++
  entry.paths.add(path)

  // Flag as abuse if: 500+ requests in an hour OR hitting 10+ different endpoints
  if (entry.count > 500 || entry.paths.size > 10) {
    return true
  }
  return false
}

// ── Standalone endpoint handler ──
export default async function handler(req) {
  const corsHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  }

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-service-key',
      },
    })
  }

  const ip = getClientIP(req)
  const url = new URL(req.url)

  // GET: Return rate limit status for the caller
  if (req.method === 'GET') {
    const config = getRateLimitConfig(url.searchParams.get('path') || 'default')
    const key = `${config.keyPrefix}:${ip}:${url.searchParams.get('path') || '/api/rate-limiter'}`
    const entry = rateLimitStore.get(key)

    return new Response(JSON.stringify({
      ip: ip.slice(0, 8) + '...',
      rate_limits: Object.entries(RATE_LIMITS).map(([path, cfg]) => ({
        path,
        max_requests: cfg.maxRequests,
        window_seconds: cfg.windowMs / 1000,
      })),
      your_usage: entry ? {
        requests_made: entry.count,
        window_remaining_ms: Math.max(0, entry.windowStart + entry.windowMs - Date.now()),
      } : { requests_made: 0, window_remaining_ms: 0 },
    }), { status: 200, headers: corsHeaders })
  }

  // POST: Check rate limit for a given path (used by other endpoints)
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      const path = body.path || '/api/unknown'
      const config = getRateLimitConfig(path)
      const limited = checkRateLimit(req, config)

      // Track potential abuse
      const isAbuse = trackAbuse(ip, path)
      if (isAbuse) {
        await sendAdminSMS(
          `[Qivori Security] Potential abuse detected from IP ${ip.slice(0, 12)}... — ${path}`
        ).catch(() => {})
      }

      if (limited) {
        return limited
      }

      return new Response(JSON.stringify({
        allowed: true,
        path,
        config: {
          max_requests: config.maxRequests,
          window_seconds: config.windowMs / 1000,
        },
      }), { status: 200, headers: corsHeaders })

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 400, headers: corsHeaders,
      })
    }
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405, headers: corsHeaders,
  })
}
