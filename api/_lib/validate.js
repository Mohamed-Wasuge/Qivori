/**
 * Qivori API — input validation utilities
 * Call these at the top of every edge function before touching the DB.
 *
 * Usage:
 *   const err = requireFields(body, ['loadId', 'amount'])
 *   if (err) return err
 */

// ─── Field presence ───────────────────────────────────────────────────────────

/**
 * Checks that all required fields are present and non-empty in a body object.
 * Returns a 400 Response if any are missing, null if all present.
 * Pass `headers` (from corsHeaders(req)) to include CORS headers on the error response.
 *
 * @param {Record<string, any>} body
 * @param {string[]} fields
 * @param {Record<string, string>} [headers]
 * @returns {Response|null}
 */
export function requireFields(body, fields, headers = {}) {
  for (const field of fields) {
    const val = body?.[field]
    if (val === undefined || val === null || val === '') {
      return Response.json(
        { error: `Missing required field: ${field}` },
        { status: 400, headers }
      )
    }
  }
  return null
}

// ─── Type validators ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_RE = /^\+?[\d\s\-().]{7,20}$/

/** Returns true if val is a valid UUID v4 string */
export function isUUID(val) {
  return typeof val === 'string' && UUID_RE.test(val)
}

/** Returns true if val is a valid email address */
export function isEmail(val) {
  return typeof val === 'string' && EMAIL_RE.test(val)
}

/** Returns true if val is a plausible phone number */
export function isPhone(val) {
  return typeof val === 'string' && PHONE_RE.test(val)
}

/** Returns true if val is a finite number greater than zero */
export function isPositiveNumber(val) {
  const n = Number(val)
  return isFinite(n) && n > 0
}

/** Returns true if val is a finite number zero or greater */
export function isNonNegativeNumber(val) {
  const n = Number(val)
  return isFinite(n) && n >= 0
}

// ─── Convenience validators that return Response|null ────────────────────────

/**
 * Returns 400 if val is not a valid UUID, null if ok.
 * @param {any} val
 * @param {string} fieldName
 * @param {Record<string, string>} [headers]
 * @returns {Response|null}
 */
export function validateUUID(val, fieldName = 'id', headers = {}) {
  if (!isUUID(val)) {
    return Response.json({ error: `Invalid ${fieldName}: must be a UUID` }, { status: 400, headers })
  }
  return null
}

/**
 * Returns 400 if val is not a positive number, null if ok.
 * @param {any} val
 * @param {string} fieldName
 * @param {Record<string, string>} [headers]
 * @returns {Response|null}
 */
export function validatePositiveNumber(val, fieldName = 'amount', headers = {}) {
  if (!isPositiveNumber(val)) {
    return Response.json({ error: `Invalid ${fieldName}: must be a positive number` }, { status: 400, headers })
  }
  return null
}

/**
 * Returns 400 if val is not a valid email, null if ok.
 * @param {any} val
 * @param {string} fieldName
 * @param {Record<string, string>} [headers]
 * @returns {Response|null}
 */
export function validateEmail(val, fieldName = 'email', headers = {}) {
  if (!isEmail(val)) {
    return Response.json({ error: `Invalid ${fieldName}: must be a valid email` }, { status: 400, headers })
  }
  return null
}

// ─── Sanitization ────────────────────────────────────────────────────────────

/**
 * Strips characters that could be used for injection attacks.
 * Safe for use in DB values, email subjects, log messages.
 * @param {any} val
 * @param {number} maxLength
 * @returns {string}
 */
export function sanitizeString(val, maxLength = 500) {
  if (val === null || val === undefined) return ''
  return String(val)
    .replace(/[<>]/g, '')           // strip angle brackets (XSS)
    .replace(/[\x00-\x1F]/g, '')    // strip control characters
    .trim()
    .slice(0, maxLength)
}

/**
 * Sanitizes an object's string values in-place.
 * @param {Record<string, any>} obj
 * @param {string[]} fields - fields to sanitize
 * @returns {Record<string, any>}
 */
export function sanitizeFields(obj, fields) {
  const out = { ...obj }
  for (const field of fields) {
    if (typeof out[field] === 'string') {
      out[field] = sanitizeString(out[field])
    }
  }
  return out
}
