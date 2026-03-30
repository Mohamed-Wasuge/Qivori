/**
 * AES-256-GCM encryption for sensitive data (OAuth tokens, bank info, API keys).
 * Uses Web Crypto API — works on Vercel Edge Functions.
 *
 * Every encrypted value gets a unique IV (initialization vector), so the same
 * plaintext produces different ciphertext each time. The IV is prepended to
 * the ciphertext and extracted during decryption.
 *
 * Env var required: ENCRYPTION_KEY (64-char hex = 32 bytes)
 *   Generate one: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 */

const ALGORITHM = 'AES-GCM'
const IV_LENGTH = 12 // 96 bits — recommended for AES-GCM

/**
 * Get the encryption key from environment.
 * Returns a CryptoKey or null if not configured.
 */
async function getKey() {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    console.warn('[encrypt] ENCRYPTION_KEY not set or invalid (need 64 hex chars)')
    return null
  }

  const keyBytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    keyBytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }

  return crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  )
}

/**
 * Encrypt a plaintext string.
 * Returns a base64 string (IV + ciphertext) or null if encryption is not configured.
 *
 * @param {string} plaintext - The sensitive data to encrypt
 * @returns {Promise<string|null>} - Base64-encoded encrypted data, or null
 */
export async function encrypt(plaintext) {
  const key = await getKey()
  if (!key) return null

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH))
  const encoded = new TextEncoder().encode(plaintext)

  const ciphertext = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    encoded
  )

  // Prepend IV to ciphertext: [12 bytes IV][ciphertext + GCM tag]
  const combined = new Uint8Array(IV_LENGTH + ciphertext.byteLength)
  combined.set(iv, 0)
  combined.set(new Uint8Array(ciphertext), IV_LENGTH)

  // Encode as base64
  return btoa(String.fromCharCode(...combined))
}

/**
 * Decrypt an encrypted string.
 * Expects the base64 format produced by encrypt().
 *
 * @param {string} encrypted - Base64-encoded encrypted data
 * @returns {Promise<string|null>} - Decrypted plaintext, or null on failure
 */
export async function decrypt(encrypted) {
  const key = await getKey()
  if (!key) return null

  try {
    // Decode base64
    const combined = Uint8Array.from(atob(encrypted), c => c.charCodeAt(0))

    if (combined.length < IV_LENGTH + 1) {
      console.error('[encrypt] Ciphertext too short')
      return null
    }

    const iv = combined.slice(0, IV_LENGTH)
    const ciphertext = combined.slice(IV_LENGTH)

    const decrypted = await crypto.subtle.decrypt(
      { name: ALGORITHM, iv },
      key,
      ciphertext
    )

    return new TextDecoder().decode(decrypted)
  } catch (err) {
    console.error('[encrypt] Decryption failed:', err.message)
    return null
  }
}

/**
 * Encrypt a JSON object (e.g., OAuth token response).
 *
 * @param {object} data - Object to encrypt
 * @returns {Promise<string|null>} - Encrypted base64 string
 */
export async function encryptJSON(data) {
  return encrypt(JSON.stringify(data))
}

/**
 * Decrypt back to a JSON object.
 *
 * @param {string} encrypted - Encrypted base64 string
 * @returns {Promise<object|null>} - Decrypted object, or null
 */
export async function decryptJSON(encrypted) {
  const plaintext = await decrypt(encrypted)
  if (!plaintext) return null
  try {
    return JSON.parse(plaintext)
  } catch {
    console.error('[encrypt] Decrypted data is not valid JSON')
    return null
  }
}

/**
 * Check if encryption is available (ENCRYPTION_KEY is set).
 */
export function isEncryptionConfigured() {
  const hex = process.env.ENCRYPTION_KEY
  return !!(hex && hex.length === 64)
}
