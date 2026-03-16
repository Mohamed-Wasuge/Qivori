/**
 * Shared Twilio SMS helper — used by all API routes that need to send texts
 */
export async function sendSMS(to, message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    return { success: false, error: 'Twilio not configured' }
  }

  const cleanTo = to.replace(/[^\d+]/g, '')
  if (cleanTo.length < 10) {
    return { success: false, error: 'Invalid phone number' }
  }

  try {
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: cleanTo.startsWith('+') ? cleanTo : `+1${cleanTo}`,
        From: fromNumber,
        Body: message,
      }).toString(),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, error: err.message || `HTTP ${res.status}` }
    }

    const data = await res.json()
    return { success: true, sid: data.sid }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
