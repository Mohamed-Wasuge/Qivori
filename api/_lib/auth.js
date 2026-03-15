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
 * Require auth — returns a 401 Response if not authenticated.
 * Usage: const authErr = await requireAuth(req); if (authErr) return authErr;
 */
export async function requireAuth(req) {
  const { user, error } = await verifyAuth(req)
  if (error) {
    return Response.json(
      { error: 'Unauthorized' },
      { status: 401, headers: corsHeaders(req) }
    )
  }
  return null
}
