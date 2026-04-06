export const config = { runtime: 'edge' }

export default async function handler(req) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

  const clientId = process.env.LB123_CLIENT_ID
  const clientSecret = process.env.LB123_CLIENT_SECRET
  const serviceUsername = process.env.LB123_SERVICE_USERNAME
  const servicePassword = process.env.LB123_SERVICE_PASSWORD
  const BASE = 'https://api.dev.123loadboard.com'
  const UA = 'Qivori-Dispatch/1.0 (support@qivori.com)'

  const attempts = []

  // Attempt 1: Flex API — use client_secret as Bearer token + service username
  try {
    const res = await fetch(`${BASE}/access/v1/token/user`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clientSecret}`,
        'User-Agent': UA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: serviceUsername }),
    })
    const text = await res.text()
    attempts.push({ name: 'flex_clientsecret_serviceuser', status: res.status, body: text.slice(0, 400) })
  } catch (err) { attempts.push({ name: 'flex_clientsecret_serviceuser', error: err.message }) }

  // Attempt 2: Flex API — use client_secret as Bearer + test account username
  try {
    const res = await fetch(`${BASE}/access/v1/token/user`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${clientSecret}`,
        'User-Agent': UA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: 'qivori@loadsr.us' }),
    })
    const text = await res.text()
    attempts.push({ name: 'flex_clientsecret_testuser', status: res.status, body: text.slice(0, 400) })
  } catch (err) { attempts.push({ name: 'flex_clientsecret_testuser', error: err.message }) }

  // Attempt 3: OAuth /token with external_grant
  try {
    const basicAuth = btoa(`${clientId}:${clientSecret}`)
    const res = await fetch(`${BASE}/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        '123LB-Api-Version': '1.3',
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'external_grant', username: serviceUsername, password: servicePassword }).toString(),
    })
    const text = await res.text()
    attempts.push({ name: 'oauth_external_grant', status: res.status, body: text.slice(0, 400) })
  } catch (err) { attempts.push({ name: 'oauth_external_grant', error: err.message }) }

  // Attempt 4: Flex API — Basic auth with service creds, get org token
  try {
    const serviceBasic = btoa(`${serviceUsername}:${servicePassword}`)
    const res = await fetch(`${BASE}/access/v1/token/user`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${serviceBasic}`,
        'User-Agent': UA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ username: serviceUsername }),
    })
    const text = await res.text()
    attempts.push({ name: 'flex_basic_servicecreds', status: res.status, body: text.slice(0, 400) })
  } catch (err) { attempts.push({ name: 'flex_basic_servicecreds', error: err.message }) }

  // Attempt 5: OAuth /token with password grant using service account as Basic Auth
  try {
    const serviceBasic = btoa(`${serviceUsername}:${servicePassword}`)
    const res = await fetch(`${BASE}/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${serviceBasic}`,
        '123LB-Api-Version': '1.3',
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }).toString(),
    })
    const text = await res.text()
    attempts.push({ name: 'oauth_service_basic_cc', status: res.status, body: text.slice(0, 400) })
  } catch (err) { attempts.push({ name: 'oauth_service_basic_cc', error: err.message }) }

  // Check if any attempt got a token
  let token = null
  let winningAttempt = null
  for (const a of attempts) {
    if (a.status === 200 && a.body) {
      try {
        const data = JSON.parse(a.body)
        if (data.access_token || data.accessToken) {
          token = data.access_token || data.accessToken
          winningAttempt = a.name
          break
        }
      } catch {}
    }
  }

  // If we got a token, test a load search
  let searchResult = null
  if (token) {
    try {
      const res = await fetch(`${BASE}/loads/search`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          '123LB-Api-Version': '1.3',
          '123LB-AID': 'qivori-test',
          'User-Agent': UA,
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

  return new Response(JSON.stringify({ gotToken: !!token, winningAttempt, attempts, searchResult }, null, 2), { headers })
}
