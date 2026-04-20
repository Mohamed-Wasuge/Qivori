/**
 * POST /api/delete-account
 *
 * Permanently deletes the authenticated user's account.
 * Required for App Store / Play Store compliance and GDPR.
 *
 * Flow:
 *   1. Verify Authorization: Bearer <token>
 *   2. Require explicit confirmation in body: { confirmation: "DELETE" }
 *   3. Call supabase.auth.admin.deleteUser(user.id)
 *      → all FK tables cascade (profiles, loads, invoices, expenses,
 *        retell_calls, vehicles, drivers, eld_hos_logs, route_plans, etc.)
 *   4. Best-effort cleanup of Storage objects under the user's prefix
 *      (Storage objects are NOT cascaded by auth.users deletion).
 *   5. Audit-log the deletion.
 *
 * Returns:
 *   200 { success: true, userId }
 *   400 if confirmation missing/wrong
 *   401 if not authenticated
 *   500 on server error
 */

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
)

// Storage buckets we know hold user-uploaded files. Best-effort cleanup.
const USER_STORAGE_BUCKETS = [
  'documents',     // CDL, medical cards, insurance docs
  'pod',           // proof-of-delivery scans
  'receipts',      // scanned expense receipts
  'avatars',       // profile photos
]

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // --- 1. Auth ---
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // --- 2. Confirmation guard ---
  // Mobile client must send { confirmation: "DELETE" } — prevents accidental
  // deletion if a dev hits the endpoint without meaning to.
  const { confirmation, reason } = req.body || {}
  if (confirmation !== 'DELETE') {
    return res.status(400).json({
      error: 'Confirmation required',
      detail: 'Send { "confirmation": "DELETE" } in the request body.',
    })
  }

  const userId = user.id
  const email = user.email || null

  try {
    // --- 3. Best-effort storage cleanup (before auth delete) ---
    // Storage objects do NOT cascade with auth.users deletion, so wipe first.
    // Failures here are non-fatal — log and continue to the auth delete.
    const storageErrors = []
    for (const bucket of USER_STORAGE_BUCKETS) {
      try {
        const { data: files } = await supabase
          .storage
          .from(bucket)
          .list(userId, { limit: 1000 })

        if (files && files.length > 0) {
          const paths = files.map((f) => `${userId}/${f.name}`)
          const { error: rmErr } = await supabase
            .storage
            .from(bucket)
            .remove(paths)
          if (rmErr) storageErrors.push(`${bucket}: ${rmErr.message}`)
        }
      } catch (e) {
        storageErrors.push(`${bucket}: ${e.message}`)
      }
    }

    // --- 4. Audit log BEFORE delete (so we keep the record) ---
    // Uses the profiles row's data before it cascades away.
    try {
      await supabase.from('audit_logs').insert({
        actor_id: userId,
        actor_email: email,
        action: 'account_deleted',
        target_type: 'user',
        target_id: userId,
        metadata: {
          reason: reason || null,
          storage_errors: storageErrors.length ? storageErrors : null,
          deleted_at: new Date().toISOString(),
        },
      })
    } catch (e) {
      // Audit_logs table may not exist in all environments. Don't block delete.
      console.warn('[delete-account] audit log failed:', e.message)
    }

    // --- 5. Delete the auth user (cascades to every owner_id / user_id FK) ---
    const { error: delErr } = await supabase.auth.admin.deleteUser(userId)
    if (delErr) {
      console.error('[delete-account] admin.deleteUser failed:', delErr)
      return res.status(500).json({
        error: 'Failed to delete account',
        detail: delErr.message,
      })
    }

    return res.status(200).json({
      success: true,
      userId,
      storage_warnings: storageErrors.length ? storageErrors : undefined,
    })
  } catch (err) {
    console.error('[delete-account] unhandled error:', err)
    return res.status(500).json({
      error: 'Internal server error',
      detail: err.message,
    })
  }
}
