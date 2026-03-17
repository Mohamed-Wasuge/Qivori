import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  const ip = getClientIP(req)
  const { limited, resetMs } = rateLimit(`referral:${ip}`, 30, 60000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  const url = new URL(req.url)
  const sb = (path, opts = {}) => fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })

  // GET — get user's referral data
  if (req.method === 'GET') {
    const { user } = await verifyAuth(req)
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

    // Get or create referral code
    const profRes = await sb(`profiles?id=eq.${user.id}&select=referral_code,email,full_name`)
    const profiles = await profRes.json()
    let referralCode = profiles?.[0]?.referral_code

    if (!referralCode) {
      // Generate cryptographically random referral code
      referralCode = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      await sb(`profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ referral_code: referralCode }),
        headers: { 'Prefer': 'return=minimal' },
      })
    }

    // Get referral stats
    const refRes = await sb(`referrals?referrer_id=eq.${user.id}&select=*&order=created_at.desc`)
    const referrals = await refRes.json()

    const stats = {
      code: referralCode,
      link: `https://qivori.com/ref/${referralCode}`,
      totalReferrals: Array.isArray(referrals) ? referrals.length : 0,
      signups: Array.isArray(referrals) ? referrals.filter(r => ['signed_up', 'paid', 'rewarded'].includes(r.status)).length : 0,
      paid: Array.isArray(referrals) ? referrals.filter(r => ['paid', 'rewarded'].includes(r.status)).length : 0,
      rewardsEarned: Array.isArray(referrals) ? referrals.filter(r => r.reward_applied).length : 0,
      totalClicks: Array.isArray(referrals) ? referrals.reduce((s, r) => s + (r.clicks || 0), 0) : 0,
      referrals: Array.isArray(referrals) ? referrals.slice(0, 20) : [],
    }

    return Response.json(stats, { headers: corsHeaders(req) })
  }

  // POST — track referral click or signup
  if (req.method === 'POST') {
    const { action, referralCode, email } = await req.json()

    if (action === 'click') {
      // Track click on referral link
      if (!referralCode) return Response.json({ error: 'Missing code' }, { status: 400, headers: corsHeaders(req) })

      // Find referrer by code
      const profRes = await sb(`profiles?referral_code=eq.${encodeURIComponent(referralCode)}&select=id`)
      const profiles = await profRes.json()
      if (!profiles?.length) return Response.json({ error: 'Invalid code' }, { status: 404, headers: corsHeaders(req) })

      // Increment clicks or create entry
      const existingRes = await sb(`referrals?referrer_id=eq.${profiles[0].id}&referral_code=eq.${encodeURIComponent(referralCode)}&status=eq.pending&select=id,clicks&limit=1`)
      const existing = await existingRes.json()

      if (existing?.length) {
        await sb(`referrals?id=eq.${existing[0].id}`, {
          method: 'PATCH',
          body: JSON.stringify({ clicks: (existing[0].clicks || 0) + 1 }),
          headers: { 'Prefer': 'return=minimal' },
        })
      } else {
        await sb('referrals', {
          method: 'POST',
          body: JSON.stringify({ referrer_id: profiles[0].id, referral_code: referralCode, clicks: 1, status: 'pending' }),
          headers: { 'Prefer': 'return=minimal' },
        })
      }
      return Response.json({ tracked: true }, { headers: corsHeaders(req) })
    }

    if (action === 'signup') {
      // User signed up via referral
      if (!referralCode || !email) return Response.json({ error: 'Missing code or email' }, { status: 400, headers: corsHeaders(req) })

      const profRes = await sb(`profiles?referral_code=eq.${encodeURIComponent(referralCode)}&select=id`)
      const profiles = await profRes.json()
      if (!profiles?.length) return Response.json({ error: 'Invalid code' }, { status: 404, headers: corsHeaders(req) })

      // Update or create referral entry
      await sb('referrals', {
        method: 'POST',
        body: JSON.stringify({
          referrer_id: profiles[0].id,
          referral_code: referralCode,
          referred_email: email,
          status: 'signed_up',
          converted_at: new Date().toISOString(),
        }),
        headers: { 'Prefer': 'return=minimal' },
      })

      // Mark the referred user's profile
      await sb(`profiles?email=eq.${encodeURIComponent(email)}`, {
        method: 'PATCH',
        body: JSON.stringify({ referred_by: referralCode }),
        headers: { 'Prefer': 'return=minimal' },
      })

      return Response.json({ tracked: true }, { headers: corsHeaders(req) })
    }

    if (action === 'complete') {
      // User subscribed — credit both referrer and referee
      if (!referralCode || !email) return Response.json({ error: 'Missing code or email' }, { status: 400, headers: corsHeaders(req) })

      const profRes = await sb(`profiles?referral_code=eq.${encodeURIComponent(referralCode)}&select=id`)
      const profiles = await profRes.json()
      if (!profiles?.length) return Response.json({ error: 'Invalid code' }, { status: 404, headers: corsHeaders(req) })

      const referrerId = profiles[0].id

      // Tier calculation: count existing successful referrals to determine reward months
      const existingRes = await sb(`referrals?referrer_id=eq.${referrerId}&status=in.(signed_up,paid,rewarded)&select=id`)
      const existingRefs = await existingRes.json()
      const signupCount = Array.isArray(existingRefs) ? existingRefs.length : 0

      // Tier: 0-2 = 1 month, 3-5 = 1 month, 6-10 = 2 months, 11+ = 2 months
      const rewardMonths = signupCount >= 6 ? 2 : 1

      // Find the referral entry to update
      const refEntryRes = await sb(`referrals?referrer_id=eq.${referrerId}&referred_email=eq.${encodeURIComponent(email)}&select=id&limit=1&order=created_at.desc`)
      const refEntries = await refEntryRes.json()

      if (refEntries?.length) {
        // Update referral status to paid
        await sb(`referrals?id=eq.${refEntries[0].id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            status: 'rewarded',
            reward_applied: true,
            reward_months: rewardMonths,
            rewarded_at: new Date().toISOString(),
          }),
          headers: { 'Prefer': 'return=minimal' },
        })

        // Credit the referrer
        await sb('referral_rewards', {
          method: 'POST',
          body: JSON.stringify({
            user_id: referrerId,
            referral_id: refEntries[0].id,
            reward_type: 'free_month',
            months_credited: rewardMonths,
            applied: false,
          }),
          headers: { 'Prefer': 'return=minimal' },
        })

        // Credit the referee (find their user ID)
        const refereeRes = await sb(`profiles?email=eq.${encodeURIComponent(email)}&select=id`)
        const refereeProfiles = await refereeRes.json()
        if (refereeProfiles?.length) {
          await sb('referral_rewards', {
            method: 'POST',
            body: JSON.stringify({
              user_id: refereeProfiles[0].id,
              referral_id: refEntries[0].id,
              reward_type: 'free_month',
              months_credited: 1, // Referee always gets 1 month
              applied: false,
            }),
            headers: { 'Prefer': 'return=minimal' },
          })
        }
      }

      return Response.json({ tracked: true, rewardMonths }, { headers: corsHeaders(req) })
    }

    return Response.json({ error: 'Invalid action' }, { status: 400, headers: corsHeaders(req) })
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(req) })
}
