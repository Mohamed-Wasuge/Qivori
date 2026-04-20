import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const sbH = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
})

/**
 * GET /api/factor-status
 * Returns factoring reserve balance + recent factor transactions.
 * Reads from carrier's configured factoring company + invoices table.
 */
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'GET') {
    return Response.json({ error: 'GET only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  try {
    const userId = req._user.id

    // Get factoring company from profile
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=factoring_company,factoring_reserve_pct&limit=1`,
      { headers: sbH() }
    )
    const profiles = await profileRes.json()
    const profile = profiles?.[0]
    const factoringCompany = profile?.factoring_company || null
    const reservePct = parseFloat(profile?.factoring_reserve_pct || 5) / 100

    // Get factored invoices from last 90 days
    const d90 = new Date(Date.now() - 90 * 86400000).toISOString()
    const invRes = await fetch(
      `${SUPABASE_URL}/rest/v1/invoices?user_id=eq.${userId}&status=in.(factored,factor_paid)&created_at=gte.${d90}&select=id,invoice_number,amount,total,broker_name,created_at,status,factoring_company&order=created_at.desc`,
      { headers: sbH() }
    )
    const invoices = invRes.ok ? await invRes.json() : []

    // Calculate reserve
    const totalFactored = invoices.reduce((s, i) => s + Number(i.amount || i.total || 0), 0)
    const reserveHeld = Math.round(totalFactored * reservePct * 100) / 100

    // Pending factored (submitted but not paid out yet)
    const pending = invoices.filter(i => i.status === 'factored')
    const pendingAmount = pending.reduce((s, i) => s + Number(i.amount || i.total || 0), 0)
    const pendingNet = Math.round(pendingAmount * (1 - reservePct) * 100) / 100

    return Response.json({
      factoring_company: factoringCompany,
      reserve_pct: reservePct * 100,
      reserve_held: reserveHeld,
      pending_count: pending.length,
      pending_gross: Math.round(pendingAmount * 100) / 100,
      pending_net: pendingNet,
      total_factored_90d: Math.round(totalFactored * 100) / 100,
      recent: invoices.slice(0, 5).map(i => ({
        invoice_number: i.invoice_number,
        broker: i.broker_name,
        amount: Number(i.amount || i.total || 0),
        status: i.status,
        date: i.created_at?.split('T')[0],
      })),
    }, { headers: corsHeaders(req) })

  } catch (err) {
    console.error('[factor-status]', err.message)
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
