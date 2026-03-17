import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

// AES-256-GCM encryption using Web Crypto API (Edge-compatible)
const ENC_KEY_HEX = process.env.CREDENTIALS_ENCRYPTION_KEY // 64-char hex = 32 bytes
const ALGORITHM = 'AES-GCM'

async function getEncryptionKey() {
  if (!ENC_KEY_HEX) return null
  const keyBytes = new Uint8Array(ENC_KEY_HEX.match(/.{2}/g).map(b => parseInt(b, 16)))
  return crypto.subtle.importKey('raw', keyBytes, { name: ALGORITHM }, false, ['encrypt', 'decrypt'])
}

async function encrypt(plaintext) {
  const key = await getEncryptionKey()
  if (!key) throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured — encryption is mandatory')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(plaintext)
  const ciphertext = await crypto.subtle.encrypt({ name: ALGORITHM, iv }, key, encoded)
  return {
    encrypted: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
    iv: btoa(String.fromCharCode(...iv)),
  }
}

async function decrypt(encryptedB64, ivB64) {
  const key = await getEncryptionKey()
  if (!key) throw new Error('CREDENTIALS_ENCRYPTION_KEY is not configured — decryption is mandatory')
  if (!ivB64) throw new Error('Missing encryption IV — credential data may be corrupt')
  const ciphertext = Uint8Array.from(atob(encryptedB64), c => c.charCodeAt(0))
  const iv = Uint8Array.from(atob(ivB64), c => c.charCodeAt(0))
  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, ciphertext)
  return new TextDecoder().decode(decrypted)
}

function supabaseHeaders(serviceKey) {
  return {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const { user, error } = await verifyAuth(req)
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const ip = getClientIP(req)
  const { limited, resetMs } = rateLimit(`lbcreds:${ip}`, 15, 60000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Server not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  const baseUrl = `${supabaseUrl}/rest/v1/load_board_credentials`

  // ── GET: Fetch user's connected load boards (returns provider + status, NEVER raw credentials)
  if (req.method === 'GET') {
    try {
      const res = await fetch(`${baseUrl}?user_id=eq.${user.id}&select=id,provider,status,connected_at,last_tested`, {
        headers: supabaseHeaders(serviceKey),
      })
      if (!res.ok) return Response.json({ credentials: [] }, { headers: corsHeaders(req) })
      const rows = await res.json()
      return Response.json({ credentials: rows || [] }, { headers: corsHeaders(req) })
    } catch {
      return Response.json({ credentials: [] }, { headers: corsHeaders(req) })
    }
  }

  // ── POST: Save or update credentials
  if (req.method === 'POST') {
    try {
      const { provider, credentials, action } = await req.json()

      if (!provider || !['dat', '123loadboard', 'truckstop'].includes(provider)) {
        return Response.json({ error: 'Invalid provider. Must be: dat, 123loadboard, or truckstop' }, { status: 400, headers: corsHeaders(req) })
      }

      // Delete action
      if (action === 'disconnect') {
        await fetch(`${baseUrl}?user_id=eq.${user.id}&provider=eq.${provider}`, {
          method: 'DELETE',
          headers: { ...supabaseHeaders(serviceKey), 'Prefer': 'return=minimal' },
        })
        return Response.json({ success: true, message: `${provider} disconnected` }, { headers: corsHeaders(req) })
      }

      // Test connection action
      if (action === 'test') {
        const testResult = await testConnection(provider, credentials)
        // Update last_tested timestamp if record exists
        await fetch(`${baseUrl}?user_id=eq.${user.id}&provider=eq.${provider}`, {
          method: 'PATCH',
          headers: { ...supabaseHeaders(serviceKey), 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            status: testResult.success ? 'connected' : 'error',
            last_tested: new Date().toISOString(),
          }),
        })
        return Response.json(testResult, { headers: corsHeaders(req) })
      }

      // Save credentials
      if (!credentials) {
        return Response.json({ error: 'Credentials required' }, { status: 400, headers: corsHeaders(req) })
      }

      // Encrypt credentials
      const credJson = JSON.stringify(credentials)
      const { encrypted, iv } = await encrypt(credJson)

      // Upsert — check if exists first
      const checkRes = await fetch(`${baseUrl}?user_id=eq.${user.id}&provider=eq.${provider}&select=id`, {
        headers: supabaseHeaders(serviceKey),
      })
      const existing = await checkRes.json()

      const row = {
        user_id: user.id,
        provider,
        encrypted_credentials: encrypted,
        encryption_iv: iv,
        status: 'pending',
        connected_at: new Date().toISOString(),
        last_tested: null,
      }

      if (existing && existing.length > 0) {
        // Update
        await fetch(`${baseUrl}?user_id=eq.${user.id}&provider=eq.${provider}`, {
          method: 'PATCH',
          headers: supabaseHeaders(serviceKey),
          body: JSON.stringify({
            encrypted_credentials: encrypted,
            encryption_iv: iv,
            status: 'pending',
            connected_at: new Date().toISOString(),
            last_tested: null,
          }),
        })
      } else {
        // Insert
        await fetch(baseUrl, {
          method: 'POST',
          headers: supabaseHeaders(serviceKey),
          body: JSON.stringify(row),
        })
      }

      // Auto-test after saving
      const testResult = await testConnection(provider, credentials)
      await fetch(`${baseUrl}?user_id=eq.${user.id}&provider=eq.${provider}`, {
        method: 'PATCH',
        headers: { ...supabaseHeaders(serviceKey), 'Prefer': 'return=minimal' },
        body: JSON.stringify({
          status: testResult.success ? 'connected' : 'error',
          last_tested: new Date().toISOString(),
        }),
      })

      return Response.json({
        success: true,
        status: testResult.success ? 'connected' : 'error',
        testResult,
      }, { headers: corsHeaders(req) })
    } catch (err) {
      return Response.json({ error: 'Failed to save credentials' }, { status: 500, headers: corsHeaders(req) })
    }
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(req) })
}

// ── Test provider connection with provided credentials ──────────────────────
async function testConnection(provider, credentials) {
  try {
    if (provider === 'dat') {
      const { clientId, clientSecret } = credentials || {}
      if (!clientId || !clientSecret) return { success: false, message: 'Client ID and Secret required' }
      const res = await fetch('https://identity.api.dat.com/access/v1/token/client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, clientSecret }),
      })
      if (res.ok) return { success: true, message: 'DAT connected successfully' }
      return { success: false, message: `DAT auth failed (HTTP ${res.status})` }
    }

    if (provider === '123loadboard') {
      const { apiKey } = credentials || {}
      if (!apiKey) return { success: false, message: 'API Key required' }
      const res = await fetch(`https://api.123loadboard.com/v1/loads/search?api_key=${apiKey}&format=json&limit=1`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })
      if (res.ok || res.status === 200) return { success: true, message: '123Loadboard connected successfully' }
      if (res.status === 401 || res.status === 403) return { success: false, message: 'Invalid API key' }
      return { success: false, message: `123Loadboard returned HTTP ${res.status}` }
    }

    if (provider === 'truckstop') {
      const { clientId, clientSecret } = credentials || {}
      if (!clientId || !clientSecret) return { success: false, message: 'Client ID and Secret required' }
      const res = await fetch('https://api.truckstop.com/auth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
      })
      if (res.ok) return { success: true, message: 'Truckstop connected successfully' }
      return { success: false, message: `Truckstop auth failed (HTTP ${res.status})` }
    }

    return { success: false, message: 'Unknown provider' }
  } catch (err) {
    return { success: false, message: `Connection test failed: ${err.message || 'Network error'}` }
  }
}

// ── Exported helper: fetch and decrypt a user's credentials (for load-board.js) ──
export async function getUserCredentials(userId) {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) return {}

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/load_board_credentials?user_id=eq.${userId}&status=eq.connected&select=provider,encrypted_credentials,encryption_iv`,
      { headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` } }
    )
    if (!res.ok) return {}
    const rows = await res.json()
    const result = {}
    for (const row of rows) {
      try {
        const decrypted = await decrypt(row.encrypted_credentials, row.encryption_iv)
        result[row.provider] = JSON.parse(decrypted)
      } catch {
        // Skip bad decrypt
      }
    }
    return result
  } catch {
    return {}
  }
}
