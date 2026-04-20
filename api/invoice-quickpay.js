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
 * POST /api/invoice-quickpay
 * Submit a QuickPay request to a broker.
 * Body: { invoice_id, user_id, discount_pct }
 * Returns: { submitted: true, net_amount, fee_amount, expected_by }
 */
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  try {
    const { invoice_id, discount_pct } = await req.json()
    const userId = req._user.id

    if (!invoice_id) {
      return Response.json({ error: 'invoice_id required' }, { status: 400, headers: corsHeaders(req) })
    }

    // Fetch invoice
    const invRes = await fetch(
      `${SUPABASE_URL}/rest/v1/invoices?id=eq.${invoice_id}&user_id=eq.${userId}&select=*&limit=1`,
      { headers: sbH() }
    )
    const invoices = await invRes.json()
    const inv = invoices?.[0]

    if (!inv) {
      return Response.json({ error: 'Invoice not found' }, { status: 404, headers: corsHeaders(req) })
    }

    const amount = Number(inv.amount || inv.total || 0)
    const feeRate = parseFloat(discount_pct || inv.quickpay_fee_pct || 2) / 100
    const feeAmount = Math.round(amount * feeRate * 100) / 100
    const netAmount = Math.round((amount - feeAmount) * 100) / 100

    // Expected payment in 2 business days
    const expectedBy = new Date()
    expectedBy.setDate(expectedBy.getDate() + 2)
    // Skip weekends
    if (expectedBy.getDay() === 6) expectedBy.setDate(expectedBy.getDate() + 2)
    if (expectedBy.getDay() === 0) expectedBy.setDate(expectedBy.getDate() + 1)

    // Update invoice status
    await fetch(`${SUPABASE_URL}/rest/v1/invoices?id=eq.${invoice_id}`, {
      method: 'PATCH',
      headers: { ...sbH(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        status: 'quickpay_requested',
        quickpay_fee: feeAmount,
        quickpay_net: netAmount,
        quickpay_requested_at: new Date().toISOString(),
        quickpay_expected_by: expectedBy.toISOString(),
      }),
    })

    // Log Q activity
    await fetch(`${SUPABASE_URL}/rest/v1/q_activity`, {
      method: 'POST',
      headers: { ...sbH(), Prefer: 'return=minimal' },
      body: JSON.stringify({
        user_id: userId,
        type: 'quickpay_requested',
        data: JSON.stringify({
          invoice_id,
          invoice_number: inv.invoice_number,
          broker: inv.broker_name,
          amount,
          fee: feeAmount,
          net: netAmount,
        }),
        created_at: new Date().toISOString(),
      }),
    })

    return Response.json({
      submitted: true,
      invoice_number: inv.invoice_number,
      gross_amount: amount,
      fee_amount: feeAmount,
      fee_pct: feeRate * 100,
      net_amount: netAmount,
      expected_by: expectedBy.toISOString().split('T')[0],
      broker: inv.broker_name,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    console.error('[invoice-quickpay]', err.message)
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
