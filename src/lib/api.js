import { supabase } from './supabase'

/**
 * Authenticated fetch wrapper — automatically adds the Supabase session token
 * to API requests as an Authorization header.
 */
export async function apiFetch(url, options = {}) {
  const { data: { session } } = await supabase.auth.getSession()
  const token = session?.access_token

  const headers = {
    ...(options.headers || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(url, { ...options, headers })

  // 401 from API = endpoint auth issue (missing API key, config error, etc.)
  // Do NOT sign out — just return the response and let the caller handle it.
  // Session expiry is handled by Supabase's onAuthStateChange listener in AppContext.

  return res
}
