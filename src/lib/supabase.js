import { createClient } from '@supabase/supabase-js'

const FALLBACK_URL = 'https://jrencclzfztrilrldmwf.supabase.co'
const FALLBACK_KEY = 'sb_publishable_JPboIPM1fpNAZC6RtdCWGQ_ZvaKCC3g'

const raw_url = import.meta.env.VITE_SUPABASE_URL
const raw_key = import.meta.env.VITE_SUPABASE_ANON_KEY

const url = (raw_url && raw_url.startsWith('http')) ? raw_url : FALLBACK_URL
const key = (raw_key && !raw_key.includes('VITE_')) ? raw_key : FALLBACK_KEY

export const supabase = createClient(url, key)
