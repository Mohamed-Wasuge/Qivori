// api/motive-callback.js — Motive OAuth 2.0 Callback Handler
// Exchanges authorization code for access token and stores in Supabase

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MOTIVE_CLIENT_ID = process.env.MOTIVE_CLIENT_ID;
const MOTIVE_CLIENT_SECRET = process.env.MOTIVE_CLIENT_SECRET;

export default async function handler(req) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state'); // user_id passed as state
  const error = url.searchParams.get('error');

  // Handle OAuth errors
  if (error) {
    return new Response(redirectHTML('error', `Motive authorization failed: ${error}`), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  if (!code) {
    return new Response(redirectHTML('error', 'No authorization code received'), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }

  try {
    // Exchange code for access token
    const tokenRes = await fetch('https://api.gomotive.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: 'https://qivori.com/api/motive-callback',
        client_id: MOTIVE_CLIENT_ID,
        client_secret: MOTIVE_CLIENT_SECRET,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Motive token exchange failed:', errText);
      return new Response(redirectHTML('error', 'Failed to exchange authorization code'), {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;

    if (!accessToken) {
      return new Response(redirectHTML('error', 'No access token received'), {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    }

    // Store connection in Supabase if we have a user_id (state param)
    if (state && SUPABASE_URL && SUPABASE_KEY) {
      // Upsert the ELD connection
      await fetch(`${SUPABASE_URL}/rest/v1/eld_connections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          user_id: state,
          provider: 'motive',
          api_key: accessToken,
          status: 'connected',
          connected_at: new Date().toISOString(),
          metadata: JSON.stringify({
            refresh_token: refreshToken,
            token_type: tokenData.token_type,
            expires_in: tokenData.expires_in,
            connected_via: 'oauth',
          }),
        }),
      });
    }

    return new Response(redirectHTML('success', 'Motive connected successfully!'), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err) {
    console.error('Motive callback error:', err);
    return new Response(redirectHTML('error', 'Connection failed. Please try again.'), {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
  }
}

function redirectHTML(status, message) {
  const isSuccess = status === 'success';
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Motive Connection — Qivori</title>
  <style>
    body { font-family: 'DM Sans', system-ui, sans-serif; background: #0a0a0e; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { text-align: center; max-width: 400px; padding: 40px; }
    .icon { font-size: 48px; margin-bottom: 16px; }
    .title { font-size: 20px; font-weight: 800; margin-bottom: 8px; color: ${isSuccess ? '#00d4aa' : '#ef4444'}; }
    .msg { font-size: 14px; color: #8a8a9a; margin-bottom: 24px; }
    .btn { display: inline-block; padding: 12px 32px; background: #f0a500; color: #000; border-radius: 10px; text-decoration: none; font-weight: 700; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${isSuccess ? '✓' : '✕'}</div>
    <div class="title">${isSuccess ? 'Connected!' : 'Connection Failed'}</div>
    <div class="msg">${message}</div>
    <a class="btn" href="https://qivori.com">Return to Qivori</a>
  </div>
  <script>
    // Auto-close and notify parent if opened as popup
    if (window.opener) {
      window.opener.postMessage({ type: 'MOTIVE_OAUTH_${status.toUpperCase()}' }, '*');
      setTimeout(() => window.close(), 2000);
    }
  </script>
</body>
</html>`;
}
