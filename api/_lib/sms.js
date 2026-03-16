/**
 * Shared Twilio SMS helper — used by all API routes that need to send texts.
 * Uses fetch() only (no npm packages). Edge-compatible.
 */

const E164_REGEX = /^\+1\d{10}$/

/**
 * Validate and normalize a phone number to E.164 format (+1XXXXXXXXXX).
 * Returns { valid, number, error }.
 */
export function validatePhone(raw) {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, number: null, error: 'Phone number is required' }
  }

  // Strip everything except digits and leading +
  const cleaned = raw.replace(/[^\d+]/g, '')

  let normalized = cleaned
  // If it's 10 digits (US number without country code), prepend +1
  if (/^\d{10}$/.test(cleaned)) {
    normalized = `+1${cleaned}`
  }
  // If it's 11 digits starting with 1 (US number with country code, no +), prepend +
  else if (/^1\d{10}$/.test(cleaned)) {
    normalized = `+${cleaned}`
  }
  // If it already starts with +1 and has correct length, keep it
  else if (E164_REGEX.test(cleaned)) {
    normalized = cleaned
  }

  if (!E164_REGEX.test(normalized)) {
    return { valid: false, number: null, error: 'Invalid phone number. Expected US E.164 format: +1XXXXXXXXXX' }
  }

  return { valid: true, number: normalized, error: null }
}

/**
 * Split a long message into SMS segments (160 chars each for single-part,
 * 153 chars for multi-part due to UDH header).
 */
export function splitMessage(message) {
  if (!message) return []
  if (message.length <= 160) return [message]

  const segments = []
  const chunkSize = 153 // multi-part SMS segment size
  for (let i = 0; i < message.length; i += chunkSize) {
    segments.push(message.slice(i, i + chunkSize))
  }
  return segments
}

/**
 * Map common Twilio error codes to human-readable messages.
 */
function describeTwilioError(code, message) {
  const map = {
    21211: 'Invalid phone number — the "To" number is not a valid phone number.',
    21214: 'Invalid phone number — the "To" number is not a mobile number.',
    21608: 'The "From" number is not enabled for SMS or is not owned by this account.',
    21610: 'Message blocked — recipient has opted out (replied STOP).',
    21611: 'This Twilio number has exceeded its SMS queue limit. Try again later.',
    21612: 'The "To" number is not reachable or is not a valid mobile number.',
    21614: 'Invalid mobile number — cannot receive SMS.',
    21408: 'Permission not enabled for the region you are trying to send to.',
    21219: 'Trial account — the "To" number must be verified before sending.',
    20003: 'Authentication error — check TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
    20404: 'Twilio resource not found — check your Account SID.',
  }
  return map[code] || message || `Twilio error code ${code}`
}

/**
 * Send an SMS via the Twilio REST API using fetch().
 *
 * @param {string} to - Recipient phone number (E.164 or 10-digit US)
 * @param {string} message - SMS body text
 * @param {object} [options] - Optional settings
 * @param {string} [options.statusCallback] - URL for Twilio delivery status webhooks
 * @returns {{ ok: boolean, messageId: string|null, error: string|null, errorCode: number|null }}
 */
export async function sendSMS(to, message, options = {}) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const fromNumber = process.env.TWILIO_PHONE_NUMBER

  if (!accountSid || !authToken || !fromNumber) {
    return { ok: false, messageId: null, error: 'Twilio not configured — missing env vars', errorCode: null }
  }

  // Validate phone number
  const phone = validatePhone(to)
  if (!phone.valid) {
    return { ok: false, messageId: null, error: phone.error, errorCode: null }
  }

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return { ok: false, messageId: null, error: 'Message body cannot be empty', errorCode: null }
  }

  // Split long messages into segments and send each
  const segments = splitMessage(message.trim())
  let lastMessageId = null

  try {
    for (const segment of segments) {
      const params = {
        To: phone.number,
        From: fromNumber,
        Body: segment,
      }

      if (options.statusCallback) {
        params.StatusCallback = options.statusCallback
      }

      const res = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams(params).toString(),
        }
      )

      const data = await res.json().catch(() => ({}))

      if (!res.ok) {
        const code = data.code || null
        const errMsg = describeTwilioError(code, data.message)
        return { ok: false, messageId: null, error: errMsg, errorCode: code }
      }

      lastMessageId = data.sid
    }

    return { ok: true, messageId: lastMessageId, error: null, errorCode: null }
  } catch (err) {
    return { ok: false, messageId: null, error: `Network error: ${err.message}`, errorCode: null }
  }
}
