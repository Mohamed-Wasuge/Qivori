/**
 * Compliance Alerts Cron — runs daily
 * Checks insurance, DOT inspections, CDL/medical expiry
 * Sends push notifications to owners (and drivers for their own docs)
 *
 * Vercel cron: schedule "0 13 * * *" (9am ET daily)
 * Runtime: Edge
 */

export const config = { runtime: 'edge' }

import { sendPush, getPushToken } from './_lib/push.js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const CRON_SECRET  = process.env.CRON_SECRET

const sbH = () => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` })
const sb  = async (path) => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbH() })
  return r.ok ? r.json() : []
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const diff = new Date(dateStr) - new Date()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}

function json(data, s = 200) {
  return new Response(JSON.stringify(data), { status: s, headers: { 'Content-Type': 'application/json' } })
}

export default async function handler(req) {
  // Verify cron secret (set CRON_SECRET in Vercel env)
  const auth = req.headers.get('authorization') || ''
  if (CRON_SECRET && auth !== `Bearer ${CRON_SECRET}`) {
    return json({ error: 'Unauthorized' }, 401)
  }

  const results = { pushed: 0, checked: 0, errors: [] }

  try {
    // ── 1. Vehicle insurance expiry ────────────────────────────────────────
    const vehicles = await sb(
      'vehicles?select=id,unit_number,company_id,insurance_expiry&insurance_expiry=not.is.null'
    )

    for (const v of vehicles) {
      results.checked++
      const days = daysUntil(v.insurance_expiry)
      if (days === null) continue
      if (days !== 30 && days !== 14 && days !== 7 && days !== 1) continue

      // Find company owner
      const companies = await sb(`companies?id=eq.${v.company_id}&select=owner_id&limit=1`)
      const ownerId = companies[0]?.owner_id
      if (!ownerId) continue

      const token = await getPushToken(ownerId, SUPABASE_URL, SUPABASE_KEY)
      if (!token) continue

      const urgency = days <= 7 ? '⚠️ ' : ''
      await sendPush(token,
        `${urgency}Insurance expiring in ${days} day${days === 1 ? '' : 's'}`,
        `${v.unit_number || 'Truck'} insurance expires ${new Date(v.insurance_expiry).toLocaleDateString()}. Renew now to avoid dispatch block.`,
        { type: 'compliance', screen: 'insurance', vehicleId: v.id }
      ).catch(() => {})
      results.pushed++
    }

    // ── 2. Vehicle DOT inspection expiry ───────────────────────────────────
    const vehiclesDOT = await sb(
      'vehicles?select=id,unit_number,company_id,inspection_expiry&inspection_expiry=not.is.null'
    )

    for (const v of vehiclesDOT) {
      results.checked++
      const days = daysUntil(v.inspection_expiry)
      if (days === null || (days !== 30 && days !== 14 && days !== 7)) continue

      const companies = await sb(`companies?id=eq.${v.company_id}&select=owner_id&limit=1`)
      const ownerId = companies[0]?.owner_id
      if (!ownerId) continue

      const token = await getPushToken(ownerId, SUPABASE_URL, SUPABASE_KEY)
      if (!token) continue

      await sendPush(token,
        `DOT inspection due in ${days} days`,
        `${v.unit_number || 'Truck'} annual inspection expires ${new Date(v.inspection_expiry).toLocaleDateString()}.`,
        { type: 'compliance', screen: 'fleet', vehicleId: v.id }
      ).catch(() => {})
      results.pushed++
    }

    // ── 3. Driver CDL expiry ───────────────────────────────────────────────
    const drivers = await sb(
      'drivers?select=id,full_name,user_id,company_id,license_expiry&license_expiry=not.is.null'
    )

    for (const d of drivers) {
      results.checked++
      const days = daysUntil(d.license_expiry)
      if (days === null || (days !== 60 && days !== 30 && days !== 14)) continue

      // Push to driver directly
      if (d.user_id) {
        const driverToken = await getPushToken(d.user_id, SUPABASE_URL, SUPABASE_KEY)
        if (driverToken) {
          await sendPush(driverToken,
            `CDL expires in ${days} days`,
            `Your commercial driver's license expires ${new Date(d.license_expiry).toLocaleDateString()}. Renew before it lapses.`,
            { type: 'compliance', screen: 'documents' }
          ).catch(() => {})
          results.pushed++
        }
      }

      // Also push to fleet owner
      if (d.company_id) {
        const companies = await sb(`companies?id=eq.${d.company_id}&select=owner_id&limit=1`)
        const ownerId = companies[0]?.owner_id
        if (ownerId && ownerId !== d.user_id) {
          const ownerToken = await getPushToken(ownerId, SUPABASE_URL, SUPABASE_KEY)
          if (ownerToken) {
            await sendPush(ownerToken,
              `${d.full_name || 'Driver'} CDL expires in ${days} days`,
              `CDL expires ${new Date(d.license_expiry).toLocaleDateString()}. Driver cannot legally operate after expiry.`,
              { type: 'compliance', screen: 'fleet' }
            ).catch(() => {})
            results.pushed++
          }
        }
      }
    }

    // ── 4. Driver medical card expiry ──────────────────────────────────────
    const driversMed = await sb(
      'drivers?select=id,full_name,user_id,company_id,medical_card_expiry&medical_card_expiry=not.is.null'
    )

    for (const d of driversMed) {
      results.checked++
      const days = daysUntil(d.medical_card_expiry)
      if (days === null || (days !== 60 && days !== 30)) continue

      if (d.user_id) {
        const token = await getPushToken(d.user_id, SUPABASE_URL, SUPABASE_KEY)
        if (token) {
          await sendPush(token,
            `Medical card expires in ${days} days`,
            `Your DOT medical certificate expires ${new Date(d.medical_card_expiry).toLocaleDateString()}.`,
            { type: 'compliance', screen: 'documents' }
          ).catch(() => {})
          results.pushed++
        }
      }
    }

    // ── 5. Overdue broker payments (owner only) ────────────────────────────
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    const overdueInvoices = await sb(
      `invoices?status=eq.sent&created_at=lte.${thirtyDaysAgo}&select=id,amount,broker_name,owner_id&limit=50`
    )

    const overdueByOwner = {}
    for (const inv of overdueInvoices) {
      if (!inv.owner_id) continue
      if (!overdueByOwner[inv.owner_id]) overdueByOwner[inv.owner_id] = []
      overdueByOwner[inv.owner_id].push(inv)
    }

    for (const [ownerId, invoices] of Object.entries(overdueByOwner)) {
      const token = await getPushToken(ownerId, SUPABASE_URL, SUPABASE_KEY)
      if (!token) continue
      const total = invoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
      const brokers = [...new Set(invoices.map(i => i.broker_name).filter(Boolean))].slice(0, 2)
      await sendPush(token,
        `${invoices.length} invoice${invoices.length > 1 ? 's' : ''} overdue 30+ days`,
        `${brokers.join(', ')}${invoices.length > 2 ? ` +${invoices.length - 2} more` : ''} — $${total.toLocaleString()} outstanding.`,
        { type: 'payment_overdue', screen: 'pay' }
      ).catch(() => {})
      results.pushed++
    }

  } catch (err) {
    results.errors.push(err.message)
    console.error('[compliance-alerts-cron]', err)
  }

  console.log('[compliance-alerts-cron] done', results)
  return json(results)
}
