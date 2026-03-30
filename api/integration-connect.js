/**
 * API: Store & retrieve encrypted integration credentials.
 *
 * POST /api/integration-credentials — Store OAuth tokens / API keys for an integration
 *   Body: { provider: "truckstop", credentials: { access_token, refresh_token, ... } }
 *
 * GET /api/integration-credentials?provider=truckstop — Retrieve decrypted credentials
 *
 * DELETE /api/integration-credentials?provider=truckstop — Remove credentials
 *
 * All credentials are AES-256-GCM encrypted before storage.
 * Each carrier can only access their own credentials (RLS + user ID check).
 */

import { corsHeaders, handleCors, requireAuth } from './_lib/auth.js'
import { encrypt, decrypt, isEncryptionConfigured } from './_lib/encrypt.js'
import { checkRateLimit, rateLimitResponse } from './_lib/rate-limit.js'

const VALID_PROVIDERS = ['truckstop', '123loadboard', 'motive', 'chrobinson', 'dat', 'corpay', 'quickbooks']

function getSupabaseConfig() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) return null
  return {
    baseUrl: `${supabaseUrl}/rest/v1`,
    headers: {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
  }
}

export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  const userId = req._user.id

  // Rate limit: 30 req/min per user
  const rl = await checkRateLimit(userId, 'integration-credentials', 30, 60)
  if (rl.limited) return rateLimitResponse(req, corsHeaders, rl.resetSeconds)

  if (!isEncryptionConfigured()) {
    return Response.json(
      { error: 'Encryption not configured on server' },
      { status: 500, headers: corsHeaders(req) }
    )
  }

  const config = getSupabaseConfig()
  if (!config) {
    return Response.json(
      { error: 'Database not configured' },
      { status: 500, headers: corsHeaders(req) }
    )
  }

  try {
    if (req.method === 'POST') return await handleStore(req, userId, config)
    if (req.method === 'GET') return await handleRetrieve(req, userId, config)
    if (req.method === 'DELETE') return await handleDelete(req, userId, config)

    return Response.json(
      { error: 'Method not allowed' },
      { status: 405, headers: corsHeaders(req) }
    )
  } catch (err) {
    console.error('[integration-credentials] Error:', err.message)
    return Response.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders(req) }
    )
  }
}

async function handleStore(req, userId, config) {
  const body = await req.json()
  const { provider, credentials } = body

  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return Response.json(
      { error: `Invalid provider. Must be one of: ${VALID_PROVIDERS.join(', ')}` },
      { status: 400, headers: corsHeaders(req) }
    )
  }

  if (!credentials || typeof credentials !== 'object') {
    return Response.json(
      { error: 'Missing credentials object' },
      { status: 400, headers: corsHeaders(req) }
    )
  }

  // Encrypt the entire credentials object
  const encrypted = await encrypt(JSON.stringify(credentials))
  if (!encrypted) {
    return Response.json(
      { error: 'Encryption failed' },
      { status: 500, headers: corsHeaders(req) }
    )
  }

  // Upsert: update if exists, insert if not
  // First check if exists
  const checkUrl = `${config.baseUrl}/integration_credentials?owner_id=eq.${userId}&provider=eq.${provider}&select=id`
  const checkRes = await fetch(checkUrl, { headers: config.headers })
  const existing = await checkRes.json()

  if (existing && existing.length > 0) {
    // Update
    const updateUrl = `${config.baseUrl}/integration_credentials?owner_id=eq.${userId}&provider=eq.${provider}`
    await fetch(updateUrl, {
      method: 'PATCH',
      headers: { ...config.headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        encrypted_credentials: encrypted,
        updated_at: new Date().toISOString(),
      }),
    })
  } else {
    // Insert
    await fetch(`${config.baseUrl}/integration_credentials`, {
      method: 'POST',
      headers: { ...config.headers, 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        owner_id: userId,
        provider,
        encrypted_credentials: encrypted,
      }),
    })
  }

  return Response.json(
    { success: true, provider },
    { headers: corsHeaders(req) }
  )
}

async function handleRetrieve(req, userId, config) {
  const url = new URL(req.url)
  const provider = url.searchParams.get('provider')

  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return Response.json(
      { error: 'Invalid or missing provider param' },
      { status: 400, headers: corsHeaders(req) }
    )
  }

  const fetchUrl = `${config.baseUrl}/integration_credentials?owner_id=eq.${userId}&provider=eq.${provider}&select=encrypted_credentials,updated_at`
  const res = await fetch(fetchUrl, { headers: config.headers })
  const rows = await res.json()

  if (!rows || rows.length === 0) {
    return Response.json(
      { connected: false, provider },
      { headers: corsHeaders(req) }
    )
  }

  const decrypted = await decrypt(rows[0].encrypted_credentials)
  if (!decrypted) {
    return Response.json(
      { error: 'Failed to decrypt credentials' },
      { status: 500, headers: corsHeaders(req) }
    )
  }

  return Response.json(
    { connected: true, provider, credentials: JSON.parse(decrypted), updated_at: rows[0].updated_at },
    { headers: corsHeaders(req) }
  )
}

async function handleDelete(req, userId, config) {
  const url = new URL(req.url)
  const provider = url.searchParams.get('provider')

  if (!provider || !VALID_PROVIDERS.includes(provider)) {
    return Response.json(
      { error: 'Invalid or missing provider param' },
      { status: 400, headers: corsHeaders(req) }
    )
  }

  const deleteUrl = `${config.baseUrl}/integration_credentials?owner_id=eq.${userId}&provider=eq.${provider}`
  await fetch(deleteUrl, {
    method: 'DELETE',
    headers: { ...config.headers, 'Prefer': 'return=minimal' },
  })

  return Response.json(
    { success: true, provider },
    { headers: corsHeaders(req) }
  )
}
