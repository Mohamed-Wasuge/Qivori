import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

// ─── Referral tier definitions ──────────────────────────────────────────────
const TIERS = [
  { id: 'bronze',  label: 'Bronze',  min: 0,  max: 2,  monthsPerSignup: 1, perks: ['1 free month per signup'] },
  { id: 'silver',  label: 'Silver',  min: 3,  max: 5,  monthsPerSignup: 1, perks: ['1 free month per signup', 'Priority support'] },
  { id: 'gold',    label: 'Gold',    min: 6,  max: 10, monthsPerSignup: 2, perks: ['2 free months per signup', 'Priority support'] },
  { id: 'diamond', label: 'Diamond', min: 11, max: Infinity, monthsPerSignup: 2, perks: ['2 free months per signup', 'Priority support', 'Featured carrier badge'] },
]

function getTier(signups) {
  return TIERS.find(t => signups >= t.min && signups <= t.max) || TIERS[0]
}

function getNextTier(signups) {
  const current = getTier(signups)
  const idx = TIERS.indexOf(current)
  return idx < TIERS.length - 1 ? TIERS[idx + 1] : null
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'GET') {
    return Response.json({ error: 'GET only' }, { status: 405, headers: corsHeaders(req) })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  const ip = getClientIP(req)
  const { limited, resetMs } = rateLimit(`referral-stats:${ip}`, 30, 60000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  const { user } = await verifyAuth(req)
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

  const sb = (path, opts = {}) => fetch(`${supabaseUrl}/rest/v1/${path}`, {
    headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}`, 'Content-Type': 'application/json', ...opts.headers },
    ...opts,
  })

  try {
    // Get user profile with referral code
    const profRes = await sb(`profiles?id=eq.${user.id}&select=referral_code,email,full_name`)
    const profiles = await profRes.json()
    let referralCode = profiles?.[0]?.referral_code

    if (!referralCode) {
      referralCode = (profiles?.[0]?.email || '').split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '') || user.id.slice(0, 8)
      await sb(`profiles?id=eq.${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ referral_code: referralCode }),
        headers: { 'Prefer': 'return=minimal' },
      })
    }

    // Get all referrals for this user
    const refRes = await sb(`referrals?referrer_id=eq.${user.id}&select=*&order=created_at.desc`)
    const referrals = await refRes.json()
    const refs = Array.isArray(referrals) ? referrals : []

    // Get rewards earned
    const rewardRes = await sb(`referral_rewards?user_id=eq.${user.id}&select=*&order=created_at.desc`)
    const rewardsData = await rewardRes.json()
    const rewards = Array.isArray(rewardsData) ? rewardsData : []

    // Compute stats
    const totalSent = refs.length
    const signups = refs.filter(r => ['signed_up', 'paid', 'rewarded'].includes(r.status)).length
    const paid = refs.filter(r => ['paid', 'rewarded'].includes(r.status)).length
    const pending = refs.filter(r => r.status === 'pending' || r.status === 'clicked').length
    const totalClicks = refs.reduce((s, r) => s + (r.clicks || 0), 0)
    const rewardsEarned = rewards.reduce((s, r) => s + (r.months_credited || 0), 0)

    // Tier calculation
    const currentTier = getTier(signups)
    const nextTier = getNextTier(signups)
    const referralsToNextTier = nextTier ? nextTier.min - signups : 0

    // Leaderboard — top 10 referrers (anonymized)
    const lbRes = await sb(`referrals?select=referrer_id,status&status=in.(signed_up,paid,rewarded)`)
    const lbData = await lbRes.json()
    const lbArray = Array.isArray(lbData) ? lbData : []

    const leaderboardMap = {}
    lbArray.forEach(r => {
      if (!leaderboardMap[r.referrer_id]) leaderboardMap[r.referrer_id] = 0
      leaderboardMap[r.referrer_id]++
    })

    // Get names for leaderboard
    const topReferrerIds = Object.entries(leaderboardMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id]) => id)

    let leaderboard = []
    if (topReferrerIds.length > 0) {
      const namesRes = await sb(`profiles?id=in.(${topReferrerIds.join(',')}')&select=id,full_name,email`)
      const namesData = await namesRes.json()
      const namesMap = {}
      if (Array.isArray(namesData)) {
        namesData.forEach(p => {
          const name = p.full_name || (p.email || '').split('@')[0] || 'Driver'
          // Partial anonymize: "John D."
          const parts = name.split(' ')
          namesMap[p.id] = parts.length > 1 ? `${parts[0]} ${parts[1][0]}.` : parts[0]
        })
      }

      leaderboard = topReferrerIds.map((id, i) => ({
        rank: i + 1,
        name: namesMap[id] || 'Driver',
        signups: leaderboardMap[id],
        tier: getTier(leaderboardMap[id]).label,
        isYou: id === user.id,
      }))
    }

    // Find user's rank
    const allReferrersSorted = Object.entries(leaderboardMap)
      .sort((a, b) => b[1] - a[1])
    const userRank = allReferrersSorted.findIndex(([id]) => id === user.id) + 1

    return Response.json({
      code: referralCode,
      link: `https://qivori.com/ref/${referralCode}`,
      stats: {
        totalSent,
        signups,
        paid,
        pending,
        totalClicks,
        rewardsEarned,
      },
      tier: {
        current: currentTier,
        next: nextTier,
        referralsToNextTier,
      },
      leaderboard,
      userRank: userRank || null,
      referrals: refs.slice(0, 50).map(r => ({
        id: r.id,
        email: r.referred_email || null,
        status: r.status,
        clicks: r.clicks || 0,
        reward_applied: r.reward_applied,
        reward_months: r.reward_months || 0,
        created_at: r.created_at,
        converted_at: r.converted_at,
        rewarded_at: r.rewarded_at,
      })),
      rewards: rewards.slice(0, 20),
    }, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}
