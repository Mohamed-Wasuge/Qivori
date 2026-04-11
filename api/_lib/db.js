/**
 * Qivori API — shared Supabase client for Edge functions
 *
 * Replaces the ~5 lines of boilerplate in every API file:
 *   const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
 *   const serviceKey = process.env.SUPABASE_SERVICE_KEY
 *   const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ... }
 *
 * Usage:
 *   import { sbGet, sbPost, sbPatch, sbDelete } from './_lib/db.js'
 *
 *   const loads = await sbGet('loads?user_id=eq.' + userId)
 *   await sbPost('loads', { user_id: userId, origin: 'Chicago' })
 *   await sbPatch('loads', 'id=eq.' + loadId, { status: 'Delivered' })
 *   await sbDelete('loads', 'id=eq.' + loadId)
 */

function getConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars not configured')
  return { url, key }
}

function makeHeaders(extra = {}) {
  const { key } = getConfig()
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    ...extra,
  }
}

/**
 * GET rows from a Supabase table.
 * @param {string} path - e.g. `loads?user_id=eq.${userId}&order=created_at.desc`
 * @returns {Promise<any[]>}
 */
export async function sbGet(path) {
  const { url } = getConfig()
  const res = await fetch(`${url}/rest/v1/${path}`, {
    headers: makeHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sbGet ${path} failed (${res.status}): ${text}`)
  }
  return res.json()
}

/**
 * GET with a 500ms timeout — returns null instead of throwing on timeout.
 * @param {string} path
 * @returns {Promise<any[]|null>}
 */
export async function sbGetSafe(path) {
  try {
    return await Promise.race([
      sbGet(path),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 5000)),
    ])
  } catch {
    return null
  }
}

/**
 * INSERT a row into a Supabase table.
 * @param {string} table
 * @param {Record<string, any>} data
 * @param {{ returnRow?: boolean }} opts
 * @returns {Promise<any>}
 */
export async function sbPost(table, data, opts = {}) {
  const { url } = getConfig()
  const prefer = opts.returnRow ? 'return=representation' : 'return=minimal'
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: makeHeaders({ Prefer: prefer }),
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sbPost ${table} failed (${res.status}): ${text}`)
  }
  return opts.returnRow ? res.json() : null
}

/**
 * PATCH (update) rows matching a filter.
 * @param {string} table
 * @param {string} filter - e.g. `id=eq.${id}`
 * @param {Record<string, any>} data
 * @returns {Promise<void>}
 */
export async function sbPatch(table, filter, data) {
  const { url } = getConfig()
  const res = await fetch(`${url}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: makeHeaders({ Prefer: 'return=minimal' }),
    body: JSON.stringify(data),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sbPatch ${table} failed (${res.status}): ${text}`)
  }
}

/**
 * DELETE rows matching a filter.
 * @param {string} table
 * @param {string} filter - e.g. `id=eq.${id}`
 * @returns {Promise<void>}
 */
export async function sbDelete(table, filter) {
  const { url } = getConfig()
  const res = await fetch(`${url}/rest/v1/${table}?${filter}`, {
    method: 'DELETE',
    headers: makeHeaders(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sbDelete ${table} failed (${res.status}): ${text}`)
  }
}

/**
 * RPC call to a Supabase function.
 * @param {string} fn - function name
 * @param {Record<string, any>} params
 * @returns {Promise<any>}
 */
export async function sbRpc(fn, params = {}) {
  const { url } = getConfig()
  const res = await fetch(`${url}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: makeHeaders(),
    body: JSON.stringify(params),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sbRpc ${fn} failed (${res.status}): ${text}`)
  }
  return res.json()
}

/**
 * Returns raw Supabase config for cases where you need manual fetch control.
 * Prefer sbGet/sbPost/sbPatch/sbDelete over this.
 */
export function getRawSbConfig() {
  return {
    ...getConfig(),
    headers: makeHeaders(),
  }
}
