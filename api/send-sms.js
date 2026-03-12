export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } })
  }
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    return Response.json({ error: 'Twilio not configured' }, { status: 500 })
  }

  try {
    const { to, message } = await req.json()
    if (!to || !message) {
      return Response.json({ error: 'to and message are required' }, { status: 400 })
    }

    // Clean phone number
    const cleanTo = to.replace(/[^\d+]/g, '')

    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: cleanTo,
        From: fromNumber,
        Body: message,
      }).toString(),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error('Twilio error:', err)
      return Response.json({ error: 'Failed to send SMS' }, { status: 502 })
    }

    const data = await res.json()
    return Response.json({ success: true, sid: data.sid })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
