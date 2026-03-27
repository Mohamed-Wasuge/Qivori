/**
 * Tracking token utility — generates and verifies HMAC-signed tokens
 * for public shipper/broker load tracking.
 *
 * Token format: base64url({ loadId, ownerId, sig })
 *   - sig = HMAC-SHA256(loadId:ownerId, secret)
 *   - No time expiry — token expires when load is delivered/paid
 */

function getSecret() {
  const secret = process.env.TRACKING_SECRET || process.env.CRON_SECRET
  if (!secret) return null
  return secret
}

/**
 * Convert ArrayBuffer to hex string.
 */
function bufToHex(buf) {
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * HMAC-SHA256 sign a message string with the given secret.
 * Uses the Web Crypto API (Edge-compatible).
 */
async function hmacSign(message, secret) {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return bufToHex(sig)
}

/**
 * Generate a signed tracking token for a load.
 *
 * @param {string} loadId - The load's database UUID
 * @param {string} ownerId - The carrier's user UUID
 * @returns {Promise<string|null>} - Base64url-encoded token, or null if secret missing
 */
export async function generateTrackingToken(loadId, ownerId) {
  const secret = getSecret()
  if (!secret) return null

  const message = `${loadId}:${ownerId}`
  const sig = await hmacSign(message, secret)

  const payload = JSON.stringify({ loadId, ownerId, sig })
  // Use base64url encoding (replace + / = for URL safety)
  const encoded = btoa(payload).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return encoded
}

/**
 * Verify a tracking token and return the decoded payload.
 *
 * @param {string} token - The base64url-encoded token
 * @returns {Promise<{ valid: boolean, loadId?: string, ownerId?: string, error?: string }>}
 */
export async function verifyTrackingToken(token) {
  const secret = getSecret()
  if (!secret) return { valid: false, error: 'Tracking not configured' }

  try {
    // Decode base64url
    const padded = token.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - token.length % 4) % 4)
    const decoded = atob(padded)
    const payload = JSON.parse(decoded)

    const { loadId, ownerId, sig } = payload
    if (!loadId || !ownerId || !sig) {
      return { valid: false, error: 'Invalid token format' }
    }

    // Verify HMAC signature (no time expiry — checked at load level)
    const message = `${loadId}:${ownerId}`
    const expectedSig = await hmacSign(message, secret)
    if (sig !== expectedSig) {
      return { valid: false, error: 'Invalid token signature' }
    }

    return { valid: true, loadId, ownerId }
  } catch {
    return { valid: false, error: 'Invalid tracking token' }
  }
}

/**
 * Try to verify a token — supports both new HMAC tokens and legacy base64 tokens.
 * Legacy format: base64(ownerId:loadId) — no signature, no expiry.
 *
 * @param {string} token
 * @returns {Promise<{ valid: boolean, loadId?: string, ownerId?: string, legacy?: boolean, error?: string }>}
 */
export async function verifyTrackingTokenCompat(token) {
  // Try new HMAC token first
  const result = await verifyTrackingToken(token)
  if (result.valid) return result

  // Fall back to legacy format: base64(ownerId:loadId)
  try {
    const decoded = atob(token)
    const parts = decoded.split(':')
    if (parts.length === 2 && parts[0].length > 10 && parts[1].length > 10) {
      return { valid: true, ownerId: parts[0], loadId: parts[1], legacy: true }
    }
  } catch {
    // Not a valid legacy token either
  }

  return result // Return the HMAC error message
}
