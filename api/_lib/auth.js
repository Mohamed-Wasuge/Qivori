/**
 * Shared auth helper for Vercel Edge API routes.
 * Verifies the Supabase JWT by calling Supabase's auth endpoint.
 */

const ALLOWED_ORIGINS = [
  'https://qivori.com',
  'https://www.qivori.com',
  'https://staging.qivori.com',
]

// In development, also allow localhost
if (process.env.VERCEL_ENV !== 'production') {
  ALLOWED_ORIGINS.push('http://localhost:5173', 'http://localhost:3000')
}

/**
 * Returns CORS headers restricted to allowed origins.
 */
export function corsHeaders(req) {
  const origin = req.headers.get('origin') || ''
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  }
}

/**
 * Handle CORS preflight requests.
 */
export function handleCors(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders(req) })
  }
  return null
}

/**
 * Verify user auth by validating the Supabase access token.
 * Returns { user, error } — user is the Supabase user object if valid.
 */
export async function verifyAuth(req) {
  const authHeader = req.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'Missing or invalid Authorization header' }
  }

  const token = authHeader.split(' ')[1]
  if (!token) {
    return { user: null, error: 'No token provided' }
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseKey) {
    return { user: null, error: 'Supabase not configured' }
  }

  try {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${token}`,
      },
    })

    if (!res.ok) {
      return { user: null, error: 'Invalid or expired token' }
    }

    const user = await res.json()
    if (!user || !user.id) {
      return { user: null, error: 'Invalid token' }
    }

    return { user, error: null }
  } catch (err) {
    return { user: null, error: 'Auth verification failed' }
  }
}

/**
 * Require auth — returns a 401 Response if not authenticated, null if OK.
 * Also attaches `req._user` so downstream code can access the user object.
 * Usage: const authErr = await requireAuth(req); if (authErr) return authErr;
 *        const userId = req._user.id;
 */
export async function requireAuth(req) {
  const { user, error } = await verifyAuth(req)
  if (error) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: corsHeaders(req) }
    )
  }
  // Stash user on the request for downstream use (e.g., rate limiting)
  req._user = user
  return null
}

/**
 * Require an active subscription — returns a 403 Response if the user's
 * subscription is expired, suspended, or otherwise inactive.
 *
 * Allowed statuses: 'active', 'trial'
 * Admin bypass: any @qivori.com email is always allowed.
 *
 * Usage:
 *   const { user } = await verifyAuth(req)
 *   const subErr = await requireActiveSubscription(req, user)
 *   if (subErr) return subErr
 *
 * Returns null if OK, returns a 403 Response if blocked.
 */
export async function requireActiveSubscription(req, user) {
  // Admin bypass — @qivori.com emails always pass
  const email = user?.email || ''
  if (email.endsWith('@qivori.com')) {
    return null
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    // If Supabase is not configured, allow request (fail open for development)
    return null
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}&select=status,role`,
      {
        headers: {
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'Accept': 'application/json',
        },
      }
    )

    if (!res.ok) {
      // If we can't verify, fail open to avoid blocking legitimate users
      return null
    }

    const rows = await res.json()
    const profile = rows?.[0]

    if (!profile) {
      // No profile found — block access
      return Response.json(
        { error: 'Subscription required' },
        { status: 403, headers: corsHeaders(req) }
      )
    }

    // Admin role bypass
    if (profile.role === 'admin') {
      return null
    }

    // Check subscription status
    const allowedStatuses = ['active', 'trial']
    if (allowedStatuses.includes(profile.status)) {
      return null
    }

    return Response.json(
      { error: 'Subscription required' },
      { status: 403, headers: corsHeaders(req) }
    )
  } catch (err) {
    // On error, fail open to avoid blocking legitimate users
    return null
  }
}
