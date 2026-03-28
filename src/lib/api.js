import { supabase } from './supabase'

/**
 * Authenticated fetch wrapper — automatically adds the Supabase session token
 * to API requests as an Authorization header.
 * Handles 401 (expired session) by signing out and redirecting to login.
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

  // Session expired — sign out and redirect
  if (res.status === 401 && token) {
    await supabase.auth.signOut()
    window.location.hash = '#/login'
    window.location.reload()
    throw new Error('Session expired. Please log in again.')
  }

  return res
}
