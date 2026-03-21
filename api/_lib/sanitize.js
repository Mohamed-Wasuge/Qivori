/**
 * Shared input sanitization helpers for API routes.
 */

/**
 * Trim, strip HTML tags, and enforce max length.
 * @param {*} str - input value
 * @param {number} maxLength - maximum allowed length (default 1000)
 * @returns {string}
 */
export function sanitizeString(str, maxLength = 1000) {
  if (str === null || str === undefined) return ''
  return String(str)
    .trim()
    .replace(/<[^>]*>/g, '')   // strip HTML tags
    .slice(0, maxLength)
}

/**
 * Lowercase, trim, and validate email format.
 * Returns the sanitized email or null if invalid.
 * @param {*} email
 * @returns {string|null}
 */
export function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') return null
  const cleaned = email.trim().toLowerCase()
  const emailRe = /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/
  return emailRe.test(cleaned) ? cleaned : null
}

/**
 * Parse a value as a number and clamp it to [min, max].
 * Returns NaN if the value is not numeric.
 * @param {*} val
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
export function sanitizeNumber(val, min = -Infinity, max = Infinity) {
  const num = Number(val)
  if (isNaN(num)) return NaN
  return Math.min(Math.max(num, min), max)
}
