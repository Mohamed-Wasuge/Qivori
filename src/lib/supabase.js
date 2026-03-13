import { createClient } from '@supabase/supabase-js'

const raw_url = import.meta.env.VITE_SUPABASE_URL
const raw_key = import.meta.env.VITE_SUPABASE_ANON_KEY

// Vite inlines the literal var name if env var is missing at build time
const url = (raw_url && raw_url.startsWith('http')) ? raw_url : ''
const key = (raw_key && !raw_key.includes('VITE_')) ? raw_key : ''

if (!url || !key) {
  console.error('[Qivori] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — check your .env file')
}

export const supabase = createClient(url || 'https://placeholder.supabase.co', key || 'placeholder')
