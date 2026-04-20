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
 * GET /api/fuel-ytd
 * Returns year-to-date fuel spending, gallons, avg price/gal, and savings vs retail.
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
    const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString()

    // Pull fuel expenses from expenses table
    const expRes = await fetch(
      `${SUPABASE_URL}/rest/v1/expenses?user_id=eq.${userId}&category=eq.fuel&date=gte.${yearStart.split('T')[0]}&select=amount,gallons,price_per_gallon,fuel_savings,date&order=date.desc`,
      { headers: sbH() }
    )
    const expenses = expRes.ok ? await expRes.json() : []

    const totalSpent = expenses.reduce((s, e) => s + Number(e.amount || 0), 0)
    const totalGallons = expenses.reduce((s, e) => s + Number(e.gallons || 0), 0)
    const totalSavings = expenses.reduce((s, e) => s + Number(e.fuel_savings || 0), 0)
    const avgPricePerGal = totalGallons > 0 ? totalSpent / totalGallons : 0

    // Monthly breakdown
    const byMonth = {}
    expenses.forEach(e => {
      const month = (e.date || '').slice(0, 7)
      if (!month) return
      if (!byMonth[month]) byMonth[month] = { spent: 0, gallons: 0, savings: 0 }
      byMonth[month].spent += Number(e.amount || 0)
      byMonth[month].gallons += Number(e.gallons || 0)
      byMonth[month].savings += Number(e.fuel_savings || 0)
    })

    const monthly = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, d]) => ({
        month,
        spent: Math.round(d.spent * 100) / 100,
        gallons: Math.round(d.gallons * 10) / 10,
        savings: Math.round(d.savings * 100) / 100,
      }))

    return Response.json({
      ytd_spent: Math.round(totalSpent * 100) / 100,
      ytd_gallons: Math.round(totalGallons * 10) / 10,
      ytd_savings: Math.round(totalSavings * 100) / 100,
      avg_price_per_gal: Math.round(avgPricePerGal * 100) / 100,
      fill_count: expenses.length,
      monthly,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    console.error('[fuel-ytd]', err.message)
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
