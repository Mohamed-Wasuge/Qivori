import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !url.startsWith('http')) {
  console.error('[Qivori] VITE_SUPABASE_URL is not set. Check your environment variables.')
}
if (!key || key.includes('VITE_')) {
  console.error('[Qivori] VITE_SUPABASE_ANON_KEY is not set. Check your environment variables.')
}

export const supabase = createClient(url || '', key || '')
