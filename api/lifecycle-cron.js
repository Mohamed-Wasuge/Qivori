import { sendEmail, logEmail, wasEmailSent, sendAdminEmail, sendAdminSMS, TEMPLATES } from './_lib/emails.js'

export const config = { runtime: 'edge' }

const adminEmail = process.env.ADMIN_EMAIL || 'mwasuge@qivori.com'

/**
 * Lifecycle automation cron — runs every hour via Vercel Cron or external trigger.
 * Handles: onboarding drip, trial ending, trial expired, churn prevention, win-back.
 * Protected by CRON_SECRET to prevent unauthorized access.
 */
export default async function handler(req) {
  // Allow GET (cron) or POST (manual trigger)
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const results = { drip: 0, trial: 0, churn: 0, winback: 0, expired: 0, errors: 0 }
  const now = Date.now()

  try {
    // Fetch all users with profiles
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?select=id,email,full_name,role,created_at,subscription_status,subscription_plan,trial_ends_at,last_login,last_load_search,load_board_connected,cancelled_at,grace_period_end&order=created_at.desc&limit=500`, {
      headers: { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` },
    })
    if (!res.ok) throw new Error('Failed to fetch profiles')
    const users = await res.json()

    // ── 0. AUTO-EXPIRE: update subscription_status in DB ──
    for (const user of users) {
      if (!user.id) continue
      try {
        // Auto-expire trialing users whose trial_ends_at has passed
        if (user.subscription_status === 'trialing' && user.trial_ends_at) {
          const trialEnd = new Date(user.trial_ends_at).getTime()
          if (trialEnd < now) {
            await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
              method: 'PATCH',
              headers: {
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({ subscription_status: 'expired' }),
            })
            user.subscription_status = 'expired' // update local copy for email logic below
            results.expired++
          }
        }
        // Auto-expire past_due users whose grace_period_end has passed
        if (user.subscription_status === 'past_due' && user.grace_period_end) {
          const graceEnd = new Date(user.grace_period_end).getTime()
          if (graceEnd < now) {
            await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${user.id}`, {
              method: 'PATCH',
              headers: {
                'apikey': serviceKey,
                'Authorization': `Bearer ${serviceKey}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal',
              },
              body: JSON.stringify({ subscription_status: 'expired' }),
            })
            user.subscription_status = 'expired'
            results.expired++
          }
        }
      } catch (e) {
        results.errors++
      }
    }

    for (const user of users) {
      if (!user.email || !user.id) continue
      const firstName = (user.full_name || user.email.split('@')[0]).split(' ')[0]
      const createdAt = new Date(user.created_at).getTime()
      const daysSinceSignup = (now - createdAt) / 86400000

      try {
        // ── 1. ONBOARDING DRIP EMAILS ──
        // Day 3: Check-in
        if (daysSinceSignup >= 3 && daysSinceSignup < 4) {
          if (!(await wasEmailSent(user.id, 'day3'))) {
            const t = TEMPLATES.day3_checkin(firstName)
            await sendEmail(user.email, t.subject, t.html)
            await logEmail(user.id, user.email, 'day3')
            results.drip++
          }
        }

        // Day 7: Value email
        if (daysSinceSignup >= 7 && daysSinceSignup < 8) {
          if (!(await wasEmailSent(user.id, 'day7'))) {
            const t = TEMPLATES.day7_value(firstName)
            await sendEmail(user.email, t.subject, t.html)
            await logEmail(user.id, user.email, 'day7')
            results.drip++
          }
        }

        // Day 12: Trial ending (2 days left)
        if (daysSinceSignup >= 12 && daysSinceSignup < 13 && user.subscription_status === 'trialing') {
          if (!(await wasEmailSent(user.id, 'day12'))) {
            const t = TEMPLATES.day12_trial_ending(firstName, 2)
            await sendEmail(user.email, t.subject, t.html)
            await logEmail(user.id, user.email, 'day12')
            // Notify admin — trial expiring soon
            await sendEmail(adminEmail, `Trial Expiring: ${firstName} (${user.email})`, `<h2>Trial Expiring in 2 Days</h2><p><strong>${firstName}</strong> (${user.email}) — trial ends in 2 days.</p><p>Plan: ${user.subscription_plan || '—'}</p><p>Loads created: Check admin dashboard.</p><p>Action: Reach out to convert them.</p>`).catch(() => {})
            results.trial++
          }
        }

        // Day 14+: Trial expired (no active subscription)
        if (daysSinceSignup >= 14 && !['active', 'trialing'].includes(user.subscription_status)) {
          if (!(await wasEmailSent(user.id, 'trial_expired'))) {
            const t = TEMPLATES.trial_expired(firstName)
            await sendEmail(user.email, t.subject, t.html)
            await logEmail(user.id, user.email, 'trial_expired')
            // Notify admin — trial expired
            await sendEmail(adminEmail, `Trial Expired: ${firstName} (${user.email})`, `<h2>Trial Expired</h2><p><strong>${firstName}</strong> (${user.email}) — trial has expired. They did not convert.</p><p>Action: Send a personal follow-up or offer an extension.</p>`).catch(() => {})
            results.trial++
          }
        }

        // ── 2. CHURN PREVENTION ──
        if (['active', 'trialing'].includes(user.subscription_status)) {
          const lastLogin = user.last_login ? new Date(user.last_login).getTime() : createdAt
          const lastSearch = user.last_load_search ? new Date(user.last_load_search).getTime() : 0
          const daysSinceLogin = (now - lastLogin) / 86400000
          const daysSinceSearch = lastSearch ? (now - lastSearch) / 86400000 : 999

          // No login for 7 days
          if (daysSinceLogin >= 7 && daysSinceLogin < 8) {
            if (!(await wasEmailSent(user.id, 'churn_no_login'))) {
              const t = TEMPLATES.churn_no_login(firstName)
              await sendEmail(user.email, t.subject, t.html)
              await logEmail(user.id, user.email, 'churn_no_login')
              results.churn++
            }
          }

          // No load search for 5 days
          if (daysSinceSearch >= 5 && daysSinceSearch < 6) {
            if (!(await wasEmailSent(user.id, 'churn_no_search'))) {
              const t = TEMPLATES.churn_no_search(firstName)
              await sendEmail(user.email, t.subject, t.html)
              await logEmail(user.id, user.email, 'churn_no_search')
              results.churn++
            }
          }

          // Load board not connected after 3 days
          if (daysSinceSignup >= 3 && !user.load_board_connected) {
            if (!(await wasEmailSent(user.id, 'churn_no_loadboard'))) {
              const t = TEMPLATES.churn_no_loadboard(firstName)
              await sendEmail(user.email, t.subject, t.html)
              await logEmail(user.id, user.email, 'churn_no_loadboard')
              results.churn++
            }
          }

          // High risk: multiple signals → personal email from Mohamed
          const riskSignals = []
          if (daysSinceLogin >= 5) riskSignals.push('inactive_5d')
          if (daysSinceSearch >= 5) riskSignals.push('no_search_5d')
          if (!user.load_board_connected && daysSinceSignup >= 5) riskSignals.push('no_loadboard')
          if (user.subscription_status === 'trialing' && daysSinceSignup >= 10) riskSignals.push('trial_no_convert')

          if (riskSignals.length >= 2) {
            if (!(await wasEmailSent(user.id, 'churn_high_risk'))) {
              const t = TEMPLATES.churn_high_risk(firstName, riskSignals)
              await sendEmail(user.email, t.subject, t.html)
              await logEmail(user.id, user.email, 'churn_high_risk')
              results.churn++
            }
          }
        }

        // ── 3. WIN-BACK SYSTEM ──
        if (user.subscription_status === 'canceled' && user.cancelled_at) {
          const cancelledAt = new Date(user.cancelled_at).getTime()
          const daysSinceCancel = (now - cancelledAt) / 86400000

          // Day 3: 20% off
          if (daysSinceCancel >= 3 && daysSinceCancel < 4) {
            if (!(await wasEmailSent(user.id, 'win_back_3'))) {
              const t = TEMPLATES.win_back_day3(firstName)
              await sendEmail(user.email, t.subject, t.html)
              await logEmail(user.id, user.email, 'win_back_3')
              results.winback++
            }
          }

          // Day 7: 30 days free trial
          if (daysSinceCancel >= 7 && daysSinceCancel < 8) {
            if (!(await wasEmailSent(user.id, 'win_back_7'))) {
              const t = TEMPLATES.win_back_day7(firstName)
              await sendEmail(user.email, t.subject, t.html)
              await logEmail(user.id, user.email, 'win_back_7')
              results.winback++
            }
          }

          // Day 30: Final feedback survey
          if (daysSinceCancel >= 30 && daysSinceCancel < 31) {
            if (!(await wasEmailSent(user.id, 'win_back_30'))) {
              const t = TEMPLATES.win_back_day30(firstName)
              await sendEmail(user.email, t.subject, t.html)
              await logEmail(user.id, user.email, 'win_back_30')
              results.winback++
            }
          }
        }
      } catch (err) {
        results.errors++
      }
    }

    // ── 4. TRIGGER BOT AGENTS ──
    // Health Monitor Bot
    const botUrl = (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://www.qivori.com')
    const botHeaders = cronSecret ? { 'Authorization': `Bearer ${cronSecret}` } : {}

    const healthBot = await fetch(`${botUrl}/api/bot-health-monitor`, { headers: botHeaders }).then(r => r.json()).catch(() => ({ status: 'error' }))
    results.healthBot = healthBot.status || 'ran'

    // Load Finding Bot
    const loadBot = await fetch(`${botUrl}/api/bot-load-finder`, { headers: botHeaders }).then(r => r.json()).catch(() => ({ status: 'error' }))
    results.loadBot = { loadsScanned: loadBot.loadsScanned || 0, notificationsSent: loadBot.notificationsSent || 0 }

    return Response.json({ success: true, processed: users.length, results, timestamp: new Date().toISOString() })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
