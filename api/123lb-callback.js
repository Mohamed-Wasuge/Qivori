/**
 * 123Loadboard OAuth2 Callback
 *
 * Flow:
 *   1. User clicks authorize link → redirected to 123LB login
 *   2. 123LB redirects back here with ?code=XXXX
 *   3. We exchange the code for access_token + refresh_token
 *   4. Store tokens in Supabase (encrypted)
 *   5. Redirect user back to Qivori settings page
 *
 * Runtime: Vercel Edge
 */

import { encrypt } from './load-board-credentials.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const CLIENT_ID = process.env.LB123_CLIENT_ID
const CLIENT_SECRET = process.env.LB123_CLIENT_SECRET
const REDIRECT_URI = 'https://www.qivori.com/api/123lb-callback'
// Flip to https://api.123loadboard.com via LB123_API_BASE env var once
// 123Loadboard approves production API access.
const LB_BASE = process.env.LB123_API_BASE || 'https://api.dev.123loadboard.com'

export default async function handler(req) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')
  const state = url.searchParams.get('state') // userId

  // Loop guard: if neither a userId param NOR code/error/state, this is a bare
  // hit (likely 123LB looped back via fragment). Don't restart the dance —
  // bounce to settings with an error so the loop terminates.
  const userIdParam = url.searchParams.get('userId')
  if (!code && !error && !state && !userIdParam) {
    return redirectToSettings('error=callback_loop_blocked')
  }

  // If no code, generate the authorization URL
  if (!code && !error) {
    if (!CLIENT_ID) {
      return new Response('123Loadboard not configured', { status: 500 })
    }

    const authUrl = `${LB_BASE}/authorize?` + new URLSearchParams({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: REDIRECT_URI,
      scope: 'loadsearching',
      state: userIdParam || 'unknown',
    }).toString()

    // 123LB's /authorize endpoint requires the 123LB-Api-Version header,
    // which browsers can't send on a top-level navigation. So we hop server-side:
    // fetch /authorize with the header, follow the 302 to /login?ReturnUrl=...,
    // then redirect the browser to that login page (which renders fine without
    // any custom headers).
    try {
      const hop = await fetch(authUrl, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          '123LB-Api-Version': '1.3',
          'User-Agent': 'Qivori-Dispatch/1.0 (support@qivori.com)',
        },
      })
      const loginPath = hop.headers.get('location')
      if (loginPath) {
        const loginUrl = loginPath.startsWith('http') ? loginPath : `${LB_BASE}${loginPath}`
        return Response.redirect(loginUrl, 302)
      }
      // Fallback: redirect directly (will likely 500 in browser, but at least try)
      return Response.redirect(authUrl, 302)
    } catch (err) {
      return new Response(`Authorize hop failed: ${err.message}`, { status: 500 })
    }
  }

  // Error from 123LB
  if (error) {
    return redirectToSettings(`error=${encodeURIComponent(error)}`)
  }

  // Exchange code for token
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return redirectToSettings('error=missing_config')
  }

  try {
    const basicAuth = btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)
    const tokenRes = await fetch(`${LB_BASE}/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        '123LB-Api-Version': '1.3',
        'User-Agent': 'Qivori-Dispatch/1.0 (support@qivori.com)',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: CLIENT_ID,
        redirect_uri: REDIRECT_URI,
      }).toString(),
    })

    const tokenText = await tokenRes.text()

    if (!tokenRes.ok) {
      console.error(`123LB token exchange failed: ${tokenRes.status} ${tokenText}`)
      return redirectToSettings(`error=token_exchange_failed&status=${tokenRes.status}`)
    }

    const tokenData = JSON.parse(tokenText)
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token
    const expiresIn = tokenData.expires_in || 3600

    if (!accessToken) {
      return redirectToSettings('error=no_access_token')
    }

    // Store tokens in Supabase
    const userId = state || 'unknown'
    if (SUPABASE_URL && SUPABASE_KEY && userId !== 'unknown') {
      await storeTokens(userId, {
        accessToken,
        refreshToken,
        expiresAt: new Date(Date.now() + expiresIn * 1000).toISOString(),
        clientId: CLIENT_ID,
        clientSecret: CLIENT_SECRET,
      })
    }

    // Also store as env-level cache for immediate use
    // (the load-board.js will pick this up)
    globalThis.__lb123Token = accessToken
    globalThis.__lb123TokenExpiry = Date.now() + expiresIn * 1000

    return redirectToSettings('success=true&provider=123loadboard')
  } catch (err) {
    console.error(`123LB callback error: ${err.message}`)
    return redirectToSettings(`error=${encodeURIComponent(err.message)}`)
  }
}

function redirectToSettings(params) {
  return Response.redirect(`https://www.qivori.com/#/settings/load-boards?${params}`, 302)
}

async function storeTokens(userId, tokens) {
  const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal',
  }

  // Check if record exists
  const checkRes = await fetch(
    `${SUPABASE_URL}/rest/v1/load_board_credentials?user_id=eq.${userId}&provider=eq.123loadboard&select=id`,
    { headers }
  )
  const existing = await checkRes.json()

  // AES-256-GCM encrypt the token JSON so getUserCredentials() in
  // load-board-credentials.js can decrypt it. The previous base64 placeholder
  // was unreadable by the load fetcher and silently dropped.
  const tokenJson = JSON.stringify(tokens)
  const { encrypted, iv } = await encrypt(tokenJson)
  const row = {
    user_id: userId,
    provider: '123loadboard',
    encrypted_credentials: encrypted,
    encryption_iv: iv,
    status: 'connected',
    connected_at: new Date().toISOString(),
    last_tested: new Date().toISOString(),
  }

  if (existing && existing.length > 0) {
    await fetch(
      `${SUPABASE_URL}/rest/v1/load_board_credentials?user_id=eq.${userId}&provider=eq.123loadboard`,
      { method: 'PATCH', headers, body: JSON.stringify(row) }
    )
  } else {
    await fetch(
      `${SUPABASE_URL}/rest/v1/load_board_credentials`,
      { method: 'POST', headers, body: JSON.stringify(row) }
    )
  }
}
