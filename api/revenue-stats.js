import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

/**
 * Revenue dashboard stats for admin — MRR, ARR, churn, signups, LTV, etc.
 * Pulls live data from Supabase profiles and Stripe.
 */
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'GET') return Response.json({ error: 'GET only' }, { status: 405, headers: corsHeaders(req) })

  const { user } = await verifyAuth(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })

  const sb = async (path) => {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
    })
    return res.ok ? res.json() : []
  }

  try {
    // Fetch all profiles
    const profiles = await sb('profiles?select=id,email,full_name,role,subscription_plan,subscription_status,trial_ends_at,created_at,cancelled_at,last_login&order=created_at.desc&limit=1000')

    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const weekStart = new Date(now - 7 * 86400000).toISOString()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()

    // Plan prices in cents
    const PLAN_PRICES = { autopilot: 9900, autopilot_ai: 79900, basic: 9900, pro: 9900, solo: 9900, fleet: 9900, growing: 9900, enterprise: 79900 }

    // Active subscribers
    const active = profiles.filter(p => ['active', 'trialing'].includes(p.subscription_status))
    const paying = profiles.filter(p => p.subscription_status === 'active')
    const trialing = profiles.filter(p => p.subscription_status === 'trialing')
    const cancelled = profiles.filter(p => p.subscription_status === 'canceled')

    // MRR = sum of all active subscription prices
    const mrrCents = paying.reduce((sum, p) => sum + (PLAN_PRICES[p.subscription_plan] || 0), 0)
    const mrr = mrrCents / 100
    const arr = mrr * 12

    // Signups
    const signupsToday = profiles.filter(p => p.created_at >= todayStart).length
    const signupsWeek = profiles.filter(p => p.created_at >= weekStart).length
    const signupsMonth = profiles.filter(p => p.created_at >= monthStart).length

    // Trial conversion rate
    const expiredTrials = profiles.filter(p => {
      if (!p.trial_ends_at) return false
      return new Date(p.trial_ends_at) < now
    })
    const convertedTrials = expiredTrials.filter(p => p.subscription_status === 'active')
    const trialConversionRate = expiredTrials.length > 0 ? Math.round((convertedTrials.length / expiredTrials.length) * 100) : 0

    // Churn rate (cancelled this month / active at start of month)
    const cancelledThisMonth = cancelled.filter(p => p.cancelled_at && p.cancelled_at >= monthStart).length
    const activeLastMonth = profiles.filter(p => p.created_at < monthStart && ['active', 'trialing'].includes(p.subscription_status)).length
    const churnRate = activeLastMonth > 0 ? Math.round((cancelledThisMonth / activeLastMonth) * 100) : 0

    // ARPU (average revenue per user)
    const arpu = paying.length > 0 ? Math.round(mrrCents / paying.length) / 100 : 0

    // LTV estimate (ARPU / churn rate)
    const monthlyChurnRate = churnRate / 100 || 0.05 // default 5% if no data
    const ltv = Math.round(arpu / monthlyChurnRate)

    // Plan breakdown
    const planBreakdown = {}
    for (const p of paying) {
      const plan = p.subscription_plan || 'unknown'
      if (!planBreakdown[plan]) planBreakdown[plan] = { count: 0, revenue: 0 }
      planBreakdown[plan].count++
      planBreakdown[plan].revenue += (PLAN_PRICES[plan] || 0) / 100
    }

    // Top plan by revenue
    const topPlan = Object.entries(planBreakdown).sort((a, b) => b[1].revenue - a[1].revenue)[0]

    // Founder spots (Autopilot AI subscribers)
    const founderPlans = ['autopilot_ai', 'autonomous_fleet', 'autopilot', 'solo', 'fleet', 'pro']
    const founderCount = profiles.filter(p => founderPlans.includes(p.subscription_plan) && ['active', 'trialing'].includes(p.subscription_status)).length
    const founderSpotsLeft = Math.max(0, 100 - founderCount)

    // Recent signups for feed
    const recentSignups = profiles.slice(0, 10).map(p => ({
      email: p.email,
      name: p.full_name,
      plan: p.subscription_plan,
      status: p.subscription_status,
      createdAt: p.created_at,
      role: p.role,
    }))

    return Response.json({
      mrr,
      arr,
      mrrFormatted: `$${mrr.toLocaleString()}`,
      arrFormatted: `$${arr.toLocaleString()}`,
      totalUsers: profiles.length,
      activeSubscribers: active.length,
      payingCustomers: paying.length,
      trialingUsers: trialing.length,
      cancelledUsers: cancelled.length,
      signupsToday,
      signupsWeek,
      signupsMonth,
      trialConversionRate,
      churnRate,
      arpu,
      arpuFormatted: `$${arpu.toFixed(2)}`,
      ltv,
      ltvFormatted: `$${ltv.toLocaleString()}`,
      planBreakdown,
      topPlan: topPlan ? { name: topPlan[0], ...topPlan[1] } : null,
      founderCount,
      founderSpotsLeft,
      recentSignups,
    }, { headers: { ...corsHeaders(req), 'Cache-Control': 'no-cache' } })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
