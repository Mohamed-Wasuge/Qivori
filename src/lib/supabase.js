import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || 'https://jrencclzfztrilrldmwf.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_JPboIPM1fpNAZC6RtdCWGQ_ZvaKCC3g'

export const supabase = createClient(url, key)
