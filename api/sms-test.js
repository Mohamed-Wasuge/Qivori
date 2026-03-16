import { sendSMS, validatePhone } from './_lib/sms.js'

export const config = { runtime: 'edge' }

/**
 * Diagnostic / test endpoint for Twilio SMS configuration.
 * Protected by CRON_SECRET header.
 *
 * GET /api/sms-test
 *   — Returns Twilio config status, account info, balance
 *
 * GET /api/sms-test?send_test=true&to=+1XXXXXXXXXX
 *   — Additionally sends a test SMS to the provided number
 */
export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json({ error: 'GET only' }, { status: 405 })
  }

  // Protect with CRON_SECRET
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  const errors = []
  const result = {
    configured: false,
    accountStatus: null,
    phoneNumber: null,
    balance: null,
    errors: [],
    testSms: null,
  }

  // Check env vars
  if (!accountSid) errors.push('TWILIO_ACCOUNT_SID is not set')
  if (!authToken) errors.push('TWILIO_AUTH_TOKEN is not set')
  if (!fromNumber) errors.push('TWILIO_PHONE_NUMBER is not set')

  if (errors.length > 0) {
    result.errors = errors
    return Response.json(result, { status: 200 })
  }

  result.configured = true
  result.phoneNumber = `****${fromNumber.slice(-4)}`

  // Verify account status via Twilio API
  try {
    const accountRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`,
      {
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        },
      }
    )

    if (!accountRes.ok) {
      const errData = await accountRes.json().catch(() => ({}))
      errors.push(`Account check failed: ${errData.message || `HTTP ${accountRes.status}`}`)
    } else {
      const account = await accountRes.json()
      result.accountStatus = account.status // active, suspended, closed
    }
  } catch (err) {
    errors.push(`Account check error: ${err.message}`)
  }

  // Fetch account balance
  try {
    const balRes = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Balance.json`,
      {
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        },
      }
    )

    if (balRes.ok) {
      const bal = await balRes.json()
      result.balance = `${bal.balance} ${bal.currency}`
    }
  } catch {
    // Balance check is non-critical
  }

  // Optionally send a test SMS
  const url = new URL(req.url)
  const sendTest = url.searchParams.get('send_test')
  const testTo = url.searchParams.get('to')

  if (sendTest === 'true' && testTo) {
    const phoneCheck = validatePhone(testTo)
    if (!phoneCheck.valid) {
      result.testSms = { ok: false, error: phoneCheck.error }
    } else {
      const smsResult = await sendSMS(
        phoneCheck.number,
        'Qivori AI: SMS test successful! Your Twilio integration is working.'
      )
      result.testSms = smsResult
    }
  }

  result.errors = errors
  return Response.json(result, { status: 200 })
}
