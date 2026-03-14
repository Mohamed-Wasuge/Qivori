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

  return fetch(url, { ...options, headers })
}
