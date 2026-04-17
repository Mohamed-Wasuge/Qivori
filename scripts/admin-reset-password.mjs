#!/usr/bin/env node
/**
 * admin-reset-password.mjs
 *
 * One-shot admin script to reset a Supabase user's password directly.
 * Bypasses the email flow entirely — useful when the Site URL is misconfigured
 * and reset emails redirect to the wrong app.
 *
 * Usage:
 *   node scripts/admin-reset-password.mjs <email> <new-password>
 *
 * Example:
 *   node scripts/admin-reset-password.mjs mwasuge@qivori.com 'MyNewPass123!'
 *
 * Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SERVICE_KEY)
 * from .env.local (or .env).
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ─── Parse args ──────────────────────────────────────────────────────
const [email, newPassword] = process.argv.slice(2)
if (!email || !newPassword) {
  console.error('Usage: node scripts/admin-reset-password.mjs <email> <new-password>')
  process.exit(1)
}
if (newPassword.length < 6) {
  console.error('❌ Password must be at least 6 characters.')
  process.exit(1)
}

// ─── Load env from .env.local (preferred) or .env ────────────────────
function loadEnv(file) {
  const fullPath = path.join(ROOT, file)
  if (!fs.existsSync(fullPath)) return {}
  const out = {}
  const content = fs.readFileSync(fullPath, 'utf8')
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.+?)\s*$/)
    if (!m) continue
    let val = m[2]
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[m[1]] = val
  }
  return out
}
const env = { ...loadEnv('.env'), ...loadEnv('.env.local') }

const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !serviceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env / .env.local')
  process.exit(1)
}

console.log(`📍 Supabase project: ${supabaseUrl}`)
console.log(`👤 Target user: ${email}`)

// ─── Step 1: find the user by email ──────────────────────────────────
const listRes = await fetch(`${supabaseUrl}/auth/v1/admin/users?email=${encodeURIComponent(email)}`, {
  headers: {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
  },
})
if (!listRes.ok) {
  console.error(`❌ Failed to list users (${listRes.status}):`, await listRes.text())
  process.exit(1)
}
const listData = await listRes.json()
const user = (listData.users || []).find(u => (u.email || '').toLowerCase() === email.toLowerCase())
if (!user) {
  console.error(`❌ No user with email "${email}" found in Supabase project.`)
  console.error(`   Make sure you've signed up first, or try a different email.`)
  process.exit(1)
}
console.log(`✅ Found user: ${user.id}`)

// ─── Step 2: update the password ─────────────────────────────────────
const updateRes = await fetch(`${supabaseUrl}/auth/v1/admin/users/${user.id}`, {
  method: 'PUT',
  headers: {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ password: newPassword, email_confirm: true }),
})
if (!updateRes.ok) {
  console.error(`❌ Failed to update password (${updateRes.status}):`, await updateRes.text())
  process.exit(1)
}

console.log('')
console.log('✅ Password reset successfully.')
console.log(`   You can now log in at your Qivori app with:`)
console.log(`   Email:    ${email}`)
console.log(`   Password: ${newPassword}`)
console.log('')
console.log('   (The script also marked your email as confirmed, in case it wasn\'t.)')
