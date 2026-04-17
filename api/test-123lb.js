export const config = { runtime: 'edge' }

export default async function handler(req) {
  const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }

  const clientId = process.env.LB123_CLIENT_ID
  const clientSecret = process.env.LB123_CLIENT_SECRET
  const serviceUsername = process.env.LB123_SERVICE_USERNAME
  const servicePassword = process.env.LB123_SERVICE_PASSWORD
  const BASE = process.env.LB123_API_BASE || 'https://api.dev.123loadboard.com'
  // Exact format from Flex API docs: {company}-{product}/{version} ({email})
  const UA = 'Qivori-TMS Dispatch/1.0 (support@qivori.com)'

  const attempts = []

  // Attempt 1: Flex Access API — client_secret as Bearer, service username
  // Exact format per docs: POST /access/v1/token/user, Bearer {partnerToken}, body {username}
  try {
    const res = await fetch(`${BASE}/access/v1/token/user`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${clientSecret}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: serviceUsername }),
    })
    const text = await res.text()
    attempts.push({ name: 'flex_bearer_secret_serviceuser', status: res.status, body: text.slice(0, 400) })
  } catch (err) { attempts.push({ name: 'flex_bearer_secret_serviceuser', error: err.message }) }

  // Attempt 2: Flex Access API — client_secret as Bearer, demo login username
  try {
    const res = await fetch(`${BASE}/access/v1/token/user`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${clientSecret}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'qivori@loadsr.us' }),
    })
    const text = await res.text()
    attempts.push({ name: 'flex_bearer_secret_demouser', status: res.status, body: text.slice(0, 400) })
  } catch (err) { attempts.push({ name: 'flex_bearer_secret_demouser', error: err.message }) }

  // Attempt 3: Flex Access API — client_id as Bearer, service username
  try {
    const res = await fetch(`${BASE}/access/v1/token/user`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${clientId}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: serviceUsername }),
    })
    const text = await res.text()
    attempts.push({ name: 'flex_bearer_clientid_serviceuser', status: res.status, body: text.slice(0, 400) })
  } catch (err) { attempts.push({ name: 'flex_bearer_clientid_serviceuser', error: err.message }) }

  // Attempt 4: Flex Access API — client_id as Bearer, demo username
  try {
    const res = await fetch(`${BASE}/access/v1/token/user`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${clientId}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'qivori@loadsr.us' }),
    })
    const text = await res.text()
    attempts.push({ name: 'flex_bearer_clientid_demouser', status: res.status, body: text.slice(0, 400) })
  } catch (err) { attempts.push({ name: 'flex_bearer_clientid_demouser', error: err.message }) }

  // Attempt 5: Flex org token — client_secret as Bearer, no username
  try {
    const res = await fetch(`${BASE}/access/v1/token/organization`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${clientSecret}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    const text = await res.text()
    attempts.push({ name: 'flex_org_token', status: res.status, body: text.slice(0, 400) })
  } catch (err) { attempts.push({ name: 'flex_org_token', error: err.message }) }

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
