#!/usr/bin/env node
/**
 * Qivori AI — Supabase Backup Script
 *
 * Exports all table data + schema to a timestamped SQL file.
 * Run: node scripts/backup-supabase.js
 *
 * Restore: Paste the output SQL into Supabase Dashboard → SQL Editor → Run
 */

import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ─── Config ────────────────────────────────────────────────
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Error: Set VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables.')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// Tables to back up (in dependency order — parents before children)
const TABLES = [
  'companies',
  'vehicles',
  'drivers',
  'loads',
  'load_stops',
  'check_calls',
  'invoices',
  'expenses',
  'documents',
  'profiles',
  'tickets',
]

// ─── Helpers ───────────────────────────────────────────────
function escapeSQL(val) {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE'
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'`
  return `'${String(val).replace(/'/g, "''")}'`
}

function rowToInsert(table, row) {
  const cols = Object.keys(row)
  const vals = cols.map(c => escapeSQL(row[c]))
  return `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${vals.join(', ')});`
}

// ─── Main ──────────────────────────────────────────────────
async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const backupDir = path.join(__dirname, '..', 'backups')

  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true })

  const outFile = path.join(backupDir, `backup-${timestamp}.sql`)
  const lines = []

  lines.push(`-- ═══════════════════════════════════════════════════════════`)
  lines.push(`-- Qivori AI — Supabase Backup`)
  lines.push(`-- Generated: ${new Date().toISOString()}`)
  lines.push(`-- ═══════════════════════════════════════════════════════════`)
  lines.push('')

  // Include the schema creation SQL
  const schemaFile = path.join(__dirname, '..', 'supabase-missing-tables.sql')
  if (fs.existsSync(schemaFile)) {
    lines.push('-- ─── SCHEMA (run first if restoring from scratch) ─────────')
    lines.push('-- Uncomment the line below to include schema creation:')
    lines.push(`-- \\i '${schemaFile}'`)
    lines.push('')
  }

  let totalRows = 0
  let tablesBackedUp = 0

  for (const table of TABLES) {
    process.stdout.write(`  Backing up ${table}...`)

    // Some tables use different timestamp columns
    const orderCol = table === 'check_calls' ? 'called_at'
      : table === 'documents' ? 'uploaded_at'
      : table === 'expenses' ? 'date'
      : 'created_at'

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order(orderCol, { ascending: true })
      .limit(10000)

    if (error) {
      console.log(` SKIP (${error.message})`)
      lines.push(`-- SKIPPED ${table}: ${error.message}`)
      lines.push('')
      continue
    }

    if (!data || data.length === 0) {
      console.log(` empty (0 rows)`)
      lines.push(`-- ${table}: 0 rows`)
      lines.push('')
      continue
    }

    lines.push(`-- ─── ${table.toUpperCase()} (${data.length} rows) ───`)
    lines.push(`-- Clear existing data before restore (uncomment if needed):`)
    lines.push(`-- TRUNCATE ${table} CASCADE;`)
    lines.push('')

    // Use upsert-style INSERT with ON CONFLICT for safe restore
    for (const row of data) {
      lines.push(rowToInsert(table, row))
    }
    lines.push('')

    totalRows += data.length
    tablesBackedUp++
    console.log(` ${data.length} rows`)
  }

  lines.push(`-- ═══════════════════════════════════════════════════════════`)
  lines.push(`-- BACKUP COMPLETE: ${tablesBackedUp} tables, ${totalRows} total rows`)
  lines.push(`-- ═══════════════════════════════════════════════════════════`)

  fs.writeFileSync(outFile, lines.join('\n'), 'utf-8')

  console.log('')
  console.log(`  Backup saved to: ${path.relative(path.join(__dirname, '..'), outFile)}`)
  console.log(`  Tables: ${tablesBackedUp} | Rows: ${totalRows}`)
  console.log('')
  console.log('  To restore: paste the SQL into Supabase Dashboard → SQL Editor → Run')
}

backup().catch(err => {
  console.error('Backup failed:', err.message)
  process.exit(1)
})
