/**
 * GET /api/carrier-score?carrier_id=XXX
 * POST /api/carrier-score (cron: recalculate all scores)
 *
 * Carrier reliability score — like a credit score for trucking.
 * Based on: on-time delivery, invoice accuracy, document compliance,
 * load volume, factoring rate, dispute rate.
 *
 * Score: 0-100 (A: 90+, B: 75-89, C: 60-74, D: below 60)
 */
import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders() {
  return { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
}

async function calculateScore(carrierId) {
  const h = sbHeaders()

  // Fetch all carrier data in parallel
  const [loadsRes, invoicesRes, driversRes, vehiclesRes, dvirsRes] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/loads?owner_id=eq.${carrierId}&select=status,created_at,pickup_date,delivery_date,rate,miles&order=created_at.desc&limit=200`, { headers: h }),
    fetch(`${SUPABASE_URL}/rest/v1/invoices?owner_id=eq.${carrierId}&select=status,amount,created_at&limit=200`, { headers: h }),
    fetch(`${SUPABASE_URL}/rest/v1/drivers?owner_id=eq.${carrierId}&select=status,cdl_expiry,medical_card_expiry&limit=50`, { headers: h }),
    fetch(`${SUPABASE_URL}/rest/v1/vehicles?owner_id=eq.${carrierId}&select=status&limit=50`, { headers: h }),
    fetch(`${SUPABASE_URL}/rest/v1/dvir_inspections?owner_id=eq.${carrierId}&select=status,submitted_at&order=submitted_at.desc&limit=50`, { headers: h }),
  ])

  const loads = loadsRes.ok ? await loadsRes.json() : []
  const invoices = invoicesRes.ok ? await invoicesRes.json() : []
  const drivers = driversRes.ok ? await driversRes.json() : []
  const vehicles = vehiclesRes.ok ? await vehiclesRes.json() : []
  const dvirs = dvirsRes.ok ? await dvirsRes.json() : []

  let score = 50 // start at baseline
  const factors = []

  // 1. DELIVERY RATE (0-25 points)
  const totalLoads = loads.length
  const delivered = loads.filter(l => ['Delivered', 'Invoiced', 'Paid'].includes(l.status)).length
  const cancelled = loads.filter(l => l.status === 'Cancelled').length
  if (totalLoads > 0) {
    const deliveryRate = delivered / totalLoads
    const deliveryPoints = Math.round(deliveryRate * 25)
    score += deliveryPoints - 12 // normalize around baseline
    factors.push({ name: 'Delivery Rate', value: `${Math.round(deliveryRate * 100)}%`, points: deliveryPoints, max: 25 })
  } else {
    factors.push({ name: 'Delivery Rate', value: 'No loads', points: 0, max: 25 })
  }

  // 2. VOLUME (0-15 points)
  const volumePoints = Math.min(15, Math.round(totalLoads / 2))
  score += volumePoints - 7
  factors.push({ name: 'Load Volume', value: `${totalLoads} loads`, points: volumePoints, max: 15 })

  // 3. INVOICE HEALTH (0-20 points)
  const totalInvoices = invoices.length
  const paidInvoices = invoices.filter(i => i.status === 'Paid').length
  const disputedInvoices = invoices.filter(i => i.status === 'Disputed').length
  if (totalInvoices > 0) {
    const payRate = paidInvoices / totalInvoices
    const disputeRate = disputedInvoices / totalInvoices
    let invoicePoints = Math.round(payRate * 15) + (disputeRate < 0.05 ? 5 : disputeRate < 0.15 ? 2 : 0)
    invoicePoints = Math.min(20, invoicePoints)
    score += invoicePoints - 10
    factors.push({ name: 'Invoice Health', value: `${Math.round(payRate * 100)}% collected, ${disputedInvoices} disputes`, points: invoicePoints, max: 20 })
  } else {
    factors.push({ name: 'Invoice Health', value: 'No invoices', points: 0, max: 20 })
  }

  // 4. COMPLIANCE (0-20 points)
  let compliancePoints = 10 // baseline
  const now = new Date()

  // Driver docs
  drivers.forEach(d => {
    if (d.cdl_expiry && new Date(d.cdl_expiry) < now) compliancePoints -= 3
    if (d.medical_card_expiry && new Date(d.medical_card_expiry) < now) compliancePoints -= 3
  })

  // DVIR completion
  const recentDvirs = dvirs.filter(d => {
    const days = Math.floor((now - new Date(d.submitted_at)) / 86400000)
    return days <= 30
  })
  if (recentDvirs.length > 0) compliancePoints += 3
  if (recentDvirs.length >= 5) compliancePoints += 2
  const safeDvirs = recentDvirs.filter(d => d.status === 'safe').length
  if (recentDvirs.length > 0 && safeDvirs / recentDvirs.length >= 0.9) compliancePoints += 3

  // Active vehicles
  const activeVehicles = vehicles.filter(v => v.status === 'Active').length
  if (activeVehicles > 0) compliancePoints += 2

  compliancePoints = Math.max(0, Math.min(20, compliancePoints))
  score += compliancePoints - 10
  factors.push({ name: 'Compliance', value: `${recentDvirs.length} DVIRs, ${drivers.length} drivers`, points: compliancePoints, max: 20 })

  // 5. CANCELLATION RATE (0-10 points)
  const cancelRate = totalLoads > 0 ? cancelled / totalLoads : 0
  const cancelPoints = cancelRate < 0.02 ? 10 : cancelRate < 0.05 ? 7 : cancelRate < 0.10 ? 4 : 0
  score += cancelPoints - 5
  factors.push({ name: 'Reliability', value: `${Math.round(cancelRate * 100)}% cancel rate`, points: cancelPoints, max: 10 })

  // 6. PROFITABILITY (0-10 points — higher RPM = healthier carrier)
  const loadsWithMiles = loads.filter(l => l.miles > 0 && l.rate > 0)
  if (loadsWithMiles.length > 0) {
    const avgRpm = loadsWithMiles.reduce((s, l) => s + l.rate / l.miles, 0) / loadsWithMiles.length
    const rpmPoints = avgRpm >= 3.00 ? 10 : avgRpm >= 2.50 ? 8 : avgRpm >= 2.00 ? 6 : avgRpm >= 1.50 ? 4 : 2
    score += rpmPoints - 5
    factors.push({ name: 'Rate Quality', value: `$${avgRpm.toFixed(2)}/mi avg`, points: rpmPoints, max: 10 })
  }

  // Clamp score
  score = Math.max(0, Math.min(100, score))

  // Grade
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D'
  const gradeLabel = score >= 90 ? 'Excellent' : score >= 75 ? 'Good' : score >= 60 ? 'Average' : 'Needs Improvement'

  return {
    carrier_id: carrierId,
    score,
    grade,
    grade_label: gradeLabel,
    factors,
    total_loads: totalLoads,
    delivered,
    cancelled,
    total_invoices: totalInvoices,
    paid_invoices: paidInvoices,
    disputed_invoices: disputedInvoices,
    drivers: drivers.length,
    vehicles: vehicles.length,
    dvirs_30d: recentDvirs.length,
    computed_at: new Date().toISOString(),
  }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })

  // GET — single carrier score
  if (req.method === 'GET') {
    const { user, error: authErr } = await verifyAuth(req)
    if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

    const url = new URL(req.url)
    const carrierId = url.searchParams.get('carrier_id') || user.id

    const scoreData = await calculateScore(carrierId)
    return Response.json(scoreData, { headers: corsHeaders(req) })
  }

  // POST or cron GET — batch recalculate all carriers
  const isCronRequest = req.headers.get('authorization')?.startsWith('Bearer ') && !req.headers.get('authorization')?.startsWith('Bearer eyJ')
  if (req.method === 'POST' || isCronRequest) {
    const auth = req.headers.get('authorization') || ''
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
    }

    const carriersRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?role=eq.carrier&select=id&limit=500`, { headers: sbHeaders() })
    const carriers = carriersRes.ok ? await carriersRes.json() : []

    const results = []
    for (const c of carriers) {
      const scoreData = await calculateScore(c.id)
      // Store score
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${c.id}`, {
        method: 'PATCH',
        headers: { ...sbHeaders(), 'Prefer': 'return=minimal' },
        body: JSON.stringify({ carrier_score: scoreData.score, carrier_grade: scoreData.grade }),
      })
      results.push({ id: c.id, score: scoreData.score, grade: scoreData.grade })
    }

    return Response.json({ success: true, scored: results.length, results }, { headers: corsHeaders(req) })
  }

  return Response.json({ error: 'GET or POST' }, { status: 405, headers: corsHeaders(req) })
}
