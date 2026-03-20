// api/quickbooks-auth.js — QuickBooks Online OAuth 2.0 Integration
// Handles: authorize, callback, disconnect, refresh

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const QB_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID
const QB_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET

const QB_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2'
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'
const QB_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

async function supabaseRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase error: ${err}`)
  }
  return res.json()
}

async function authenticateUser(req) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.split(' ')[1]
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// Encode state as base64 JSON (user_id + timestamp for CSRF protection)
function encodeState(userId) {
  const payload = JSON.stringify({ uid: userId, ts: Date.now() })
  return btoa(payload)
}

function decodeState(state) {
  try {
    return JSON.parse(atob(state))
  } catch { return null }
}

// GET: authorize (build OAuth URL) or callback (exchange code)
async function handleGet(req) {
  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // ── Build OAuth authorize URL ──
  if (action === 'authorize') {
    const user = await authenticateUser(req)
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    if (!QB_CLIENT_ID) {
      return new Response(JSON.stringify({ error: 'QUICKBOOKS_CLIENT_ID not configured' }), { status: 500, headers: corsHeaders })
    }

    const origin = req.headers.get('origin') || 'https://qivori.com'
    const redirectUri = `${origin}/api/quickbooks-auth`
    const state = encodeState(user.id)

    const params = new URLSearchParams({
      client_id: QB_CLIENT_ID,
      response_type: 'code',
      scope: 'com.intuit.quickbooks.accounting',
      redirect_uri: redirectUri,
      state,
    })

    const authUrl = `${QB_AUTH_URL}?${params.toString()}`

    return new Response(JSON.stringify({ ok: true, url: authUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── OAuth callback: exchange code for tokens ──
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const realmId = url.searchParams.get('realmId')

  if (code && state && realmId) {
    const stateData = decodeState(state)
    if (!stateData || !stateData.uid) {
      return Response.redirect('https://qivori.com/carrier?tab=finance&qb=error&reason=invalid_state', 302)
    }

    // Reject states older than 10 minutes
    if (Date.now() - stateData.ts > 10 * 60 * 1000) {
      return Response.redirect('https://qivori.com/carrier?tab=finance&qb=error&reason=expired', 302)
    }

    if (!QB_CLIENT_ID || !QB_CLIENT_SECRET) {
      return Response.redirect('https://qivori.com/carrier?tab=finance&qb=error&reason=config', 302)
    }

    const origin = req.headers.get('origin') || 'https://qivori.com'
    const redirectUri = `${origin}/api/quickbooks-auth`

    try {
      // Exchange authorization code for tokens
      const basicAuth = btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`)
      const tokenRes = await fetch(QB_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }).toString(),
      })

      const tokens = await tokenRes.json()
      if (!tokenRes.ok || tokens.error) {
        console.error('QB token exchange failed:', tokens)
        return Response.redirect('https://qivori.com/carrier?tab=finance&qb=error&reason=token_exchange', 302)
      }

      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

      // Fetch company info from QB to get company name
      let companyName = null
      try {
        const isProduction = !QB_CLIENT_ID.startsWith('AB') // sandbox keys start with AB
        const qbBase = isProduction
          ? `https://quickbooks.api.intuit.com/v3/company/${realmId}`
          : `https://sandbox-quickbooks.api.intuit.com/v3/company/${realmId}`
        const companyRes = await fetch(`${qbBase}/companyinfo/${realmId}`, {
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Accept': 'application/json',
          },
        })
        if (companyRes.ok) {
          const companyData = await companyRes.json()
          companyName = companyData?.QueryResponse?.CompanyInfo?.[0]?.CompanyName
            || companyData?.CompanyInfo?.CompanyName
            || null
        }
      } catch { /* non-critical */ }

      // Upsert connection in Supabase
      const existing = await supabaseRequest(
        `quickbooks_connections?user_id=eq.${stateData.uid}&limit=1`
      )

      const connectionData = {
        user_id: stateData.uid,
        realm_id: realmId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: expiresAt,
        company_name: companyName,
        connected_at: new Date().toISOString(),
      }

      if (existing.length) {
        await supabaseRequest(
          `quickbooks_connections?user_id=eq.${stateData.uid}`,
          { method: 'PATCH', body: JSON.stringify(connectionData) }
        )
      } else {
        await supabaseRequest('quickbooks_connections', {
          method: 'POST',
          body: JSON.stringify(connectionData),
        })
      }

      return Response.redirect('https://qivori.com/carrier?tab=finance&qb=connected', 302)
    } catch (err) {
      console.error('QB OAuth callback error:', err)
      return Response.redirect('https://qivori.com/carrier?tab=finance&qb=error&reason=server', 302)
    }
  }

  // ── GET status (check if connected) ──
  const user = await authenticateUser(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const connections = await supabaseRequest(
    `quickbooks_connections?user_id=eq.${user.id}&limit=1&select=id,realm_id,company_name,connected_at,last_sync,token_expires_at`
  )

  const conn = connections[0] || null
  const connected = !!conn
  const expired = conn ? new Date(conn.token_expires_at) < new Date() : false

  return new Response(JSON.stringify({
    ok: true,
    connected,
    expired,
    connection: conn ? {
      realm_id: conn.realm_id,
      company_name: conn.company_name,
      connected_at: conn.connected_at,
      last_sync: conn.last_sync,
    } : null,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// POST: disconnect or refresh
async function handlePost(req) {
  const user = await authenticateUser(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const body = await req.json()
  const { action } = body

  // ── Disconnect: revoke token + delete from Supabase ──
  if (action === 'disconnect') {
    const connections = await supabaseRequest(
      `quickbooks_connections?user_id=eq.${user.id}&limit=1`
    )
    const conn = connections[0]

    if (conn) {
      // Revoke token at Intuit (best-effort)
      try {
        const basicAuth = btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`)
        await fetch(QB_REVOKE_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({ token: conn.refresh_token }),
        })
      } catch { /* best-effort revocation */ }

      // Delete from Supabase
      await supabaseRequest(
        `quickbooks_connections?user_id=eq.${user.id}`,
        { method: 'DELETE' }
      )
    }

    return new Response(JSON.stringify({ ok: true, message: 'QuickBooks disconnected' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // ── Refresh: get new access token using refresh_token ──
  if (action === 'refresh') {
    const connections = await supabaseRequest(
      `quickbooks_connections?user_id=eq.${user.id}&limit=1`
    )
    const conn = connections[0]

    if (!conn) {
      return new Response(JSON.stringify({ error: 'No QuickBooks connection found' }), {
        status: 404, headers: corsHeaders,
      })
    }

    if (!QB_CLIENT_ID || !QB_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: 'QuickBooks credentials not configured' }), {
        status: 500, headers: corsHeaders,
      })
    }

    try {
      const basicAuth = btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`)
      const tokenRes = await fetch(QB_TOKEN_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: conn.refresh_token,
        }).toString(),
      })

      const tokens = await tokenRes.json()
      if (!tokenRes.ok || tokens.error) {
        console.error('QB token refresh failed:', tokens)
        return new Response(JSON.stringify({ error: 'Token refresh failed. Please reconnect QuickBooks.' }), {
          status: 401, headers: corsHeaders,
        })
      }

      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

      await supabaseRequest(
        `quickbooks_connections?user_id=eq.${user.id}`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            token_expires_at: expiresAt,
          }),
        }
      )

      return new Response(JSON.stringify({ ok: true, message: 'Token refreshed', expires_at: expiresAt }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    } catch (err) {
      console.error('QB refresh error:', err)
      return new Response(JSON.stringify({ error: 'Token refresh failed' }), {
        status: 500, headers: corsHeaders,
      })
    }
  }

  return new Response(JSON.stringify({ error: 'Unknown action. Use: disconnect or refresh' }), {
    status: 400, headers: corsHeaders,
  })
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    if (req.method === 'GET') return handleGet(req)
    if (req.method === 'POST') return handlePost(req)

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })
  } catch (error) {
    console.error('QuickBooks auth error:', error)
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: corsHeaders })
  }
}
