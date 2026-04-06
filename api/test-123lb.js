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

  const basicAuth = btoa(`${clientId}:${clientSecret}`)
  let token = null
  const attempts = []

  // Attempt 1: client_credentials grant (Basic Auth header)
  try {
    const res = await fetch('https://api.dev.123loadboard.com/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        '123LB-Api-Version': '1.3',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    })
    const text = await res.text()
    attempts.push({ grant: 'client_credentials_basic', status: res.status, body: text.slice(0, 300) })
    if (res.ok) { try { token = JSON.parse(text).access_token } catch {} }
  } catch (err) { attempts.push({ grant: 'client_credentials_basic', error: err.message }) }

  // Attempt 2: password grant (Basic Auth header)
  if (!token) {
    try {
      const res = await fetch('https://api.dev.123loadboard.com/token', {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${basicAuth}`,
          '123LB-Api-Version': '1.3',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'password', username: serviceUsername, password: servicePassword }).toString(),
      })
      const text = await res.text()
      attempts.push({ grant: 'password_basic', status: res.status, body: text.slice(0, 300) })
      if (res.ok) { try { token = JSON.parse(text).access_token } catch {} }
    } catch (err) { attempts.push({ grant: 'password_basic', error: err.message }) }
  }

  // Attempt 3: password grant (client_id/secret in body, no header)
  if (!token) {
    try {
      const res = await fetch('https://api.dev.123loadboard.com/token', {
        method: 'POST',
        headers: {
          '123LB-Api-Version': '1.3',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'password', client_id: clientId, client_secret: clientSecret, username: serviceUsername, password: servicePassword }).toString(),
      })
      const text = await res.text()
      attempts.push({ grant: 'password_body', status: res.status, body: text.slice(0, 300) })
      if (res.ok) { try { token = JSON.parse(text).access_token } catch {} }
    } catch (err) { attempts.push({ grant: 'password_body', error: err.message }) }
  }

  // Attempt 4: client_credentials with client_id/secret in body
  if (!token) {
    try {
      const res = await fetch('https://api.dev.123loadboard.com/token', {
        method: 'POST',
        headers: {
          '123LB-Api-Version': '1.3',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
      })
      const text = await res.text()
      attempts.push({ grant: 'client_credentials_body', status: res.status, body: text.slice(0, 300) })
      if (res.ok) { try { token = JSON.parse(text).access_token } catch {} }
    } catch (err) { attempts.push({ grant: 'client_credentials_body', error: err.message }) }
  }

  // If token worked, try a search
  let searchResult = null
  if (token) {
    try {
      const deviceId = 'qivori-test-' + clientId.slice(-8)
      const res = await fetch('https://api.dev.123loadboard.com/loads/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          '123LB-Api-Version': '1.3',
          '123LB-AID': deviceId,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ equipmentTypes: ['Van'], loadSize: 'Tl' }),
      })
      const text = await res.text()
      searchResult = { status: res.status, body: text.slice(0, 1000) }
    } catch (err) {
      searchResult = { error: err.message }
    }
  }

  return new Response(JSON.stringify({ envCheck, gotToken: !!token, attempts, searchResult }, null, 2), { headers })
}
