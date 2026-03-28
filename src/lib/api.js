import { supabase } from './supabase'

/**
 * Authenticated fetch wrapper — automatically adds the Supabase session token
 * to API requests as an Authorization header.
 * On 401: verifies if the session is actually expired before signing out.
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

  // Only sign out if 401 AND session is actually gone (not just an endpoint auth issue)
  if (res.status === 401 && token) {
    const { data: { session: currentSession } } = await supabase.auth.getSession()
    if (!currentSession) {
      window.location.hash = '#/login'
      window.location.reload()
      throw new Error('Session expired. Please log in again.')
    }
  }

  return res
}
