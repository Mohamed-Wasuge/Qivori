export const config = { runtime: 'edge' }

export default async function handler(req) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

  const clientId = process.env.LB123_CLIENT_ID
  const clientSecret = process.env.LB123_CLIENT_SECRET
  const serviceUsername = process.env.LB123_SERVICE_USERNAME
  const servicePassword = process.env.LB123_SERVICE_PASSWORD

  const envCheck = {
    LB123_CLIENT_ID: clientId ? `${clientId.slice(0, 6)}...` : 'MISSING',
    LB123_CLIENT_SECRET: clientSecret ? 'SET' : 'MISSING',
    LB123_SERVICE_USERNAME: serviceUsername ? `${serviceUsername.slice(0, 4)}...` : 'MISSING',
    LB123_SERVICE_PASSWORD: servicePassword ? 'SET' : 'MISSING',
  }

  if (!clientId || !clientSecret || !serviceUsername || !servicePassword) {
    return new Response(JSON.stringify({ envCheck, error: 'Missing env vars' }), { headers })
  }

  // Try OAuth2 token
  const basicAuth = btoa(`${clientId}:${clientSecret}`)
  let tokenResult = null
  let token = null

  try {
    const res = await fetch('https://api.dev.123loadboard.com/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        '123LB-Api-Version': '1.3',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'password',
        username: serviceUsername,
        password: servicePassword,
      }).toString(),
    })
    const text = await res.text()
    tokenResult = { status: res.status, body: text.slice(0, 500) }
    if (res.ok) {
      try {
        const data = JSON.parse(text)
        token = data.access_token
        tokenResult.hasToken = !!token
      } catch {}
    }
  } catch (err) {
    tokenResult = { error: err.message }
  }

  // If token worked, try a search
  let searchResult = null
  if (token) {
    try {
      const searchBody = {
        equipmentTypes: ['Van'],
        loadSize: 'Tl',
        hasRate: true,
      }
      const deviceId = 'qivori-test-' + clientId.slice(-8)
      const res = await fetch('https://api.dev.123loadboard.com/loads/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          '123LB-Api-Version': '1.3',
          '123LB-AID': deviceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(searchBody),
      })
      const text = await res.text()
      searchResult = { status: res.status, body: text.slice(0, 1000) }
    } catch (err) {
      searchResult = { error: err.message }
    }
  }

  return new Response(JSON.stringify({ envCheck, tokenResult, searchResult }, null, 2), { headers })
}
