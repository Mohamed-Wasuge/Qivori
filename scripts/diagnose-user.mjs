#!/usr/bin/env node
/**
 * diagnose-user.mjs — quick diagnostic for login problems
 * Usage: node scripts/diagnose-user.mjs mwasuge@qivori.com
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

function loadEnv(file) {
  const p = path.join(ROOT, file)
  if (!fs.existsSync(p)) return {}
  const out = {}
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/)
    if (!m) continue
    let v = m[2]
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[m[1]] = v
  }
  return out
}
const env = { ...loadEnv('.env'), ...loadEnv('.env.local') }
const email = process.argv[2]
if (!email) { console.error('Usage: node scripts/diagnose-user.mjs <email>'); process.exit(1) }

const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY
const anonKey = env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY

console.log('═══ ENVIRONMENT ═══')
console.log('SUPABASE_URL:          ', url)
console.log('VITE_SUPABASE_URL:     ', env.VITE_SUPABASE_URL)
console.log('Service key present:   ', !!serviceKey, serviceKey?.slice(0, 15) + '...')
console.log('Anon key present:      ', !!anonKey, anonKey?.slice(0, 15) + '...')
console.log('')

console.log('═══ SEARCHING FOR USER ═══')
const listRes = await fetch(`${url}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
  headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
})
const listData = await listRes.json()
const matches = (listData.users || []).filter(u => (u.email || '').toLowerCase() === email.toLowerCase())

console.log(`Found ${matches.length} user(s) with email "${email}"`)
for (const u of matches) {
  console.log('')
  console.log('─── user ───')
  console.log('id:                 ', u.id)
  console.log('email:              ', u.email)
  console.log('email_confirmed_at: ', u.email_confirmed_at || '(NOT CONFIRMED)')
  console.log('created_at:         ', u.created_at)
  console.log('last_sign_in_at:    ', u.last_sign_in_at || '(never)')
  console.log('banned_until:       ', u.banned_until || '(not banned)')
  console.log('role:               ', u.role)
  console.log('app_metadata:       ', JSON.stringify(u.app_metadata))
  console.log('user_metadata keys: ', Object.keys(u.user_metadata || {}).join(', '))
}

if (matches.length === 0) {
  console.log('')
  console.log('❌ No user with that email exists in this Supabase project.')
  console.log('   You need to either:')
  console.log('   1. Sign up for a new account at qivori.com')
  console.log('   2. Or tell me to create the user via admin API')
}
