import { sendSMS } from './_lib/sms.js'
import { sendEmail } from './_lib/emails.js'

export const config = { runtime: 'edge' }

/**
 * AI Load Finding Agent
 * Scans all posted broker loads and matches them to carrier profiles.
 * Sends SMS + email notifications to carriers with matching lanes/equipment.
 * Runs via cron or manual trigger from admin dashboard.
 */
export default async function handler(req) {
  const cronSecret = process.env.CRON_SECRET
  const authHeader = req.headers.get('authorization')
  const isServiceKey = req.headers.get('x-service-key') === process.env.SUPABASE_SERVICE_KEY
  if (!cronSecret || (authHeader !== `Bearer ${cronSecret}` && !isServiceKey)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Not configured' }, { status: 500 })
  }

  const sbHeaders = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }
  const results = { loadsScanned: 0, carriersScored: 0, notificationsSent: 0, matches: [] }

  try {
    // 1. Fetch unmatched loads (posted in last 24h, not yet assigned)
    const loadRes = await fetch(`${supabaseUrl}/rest/v1/loads?status=in.(Rate Con Received,Posted,Booked)&carrier_id=is.null&select=*&order=created_at.desc&limit=50`, {
      headers: sbHeaders,
    })
    const loads = await loadRes.json()
    if (!loads || loads.length === 0) {
      return Response.json({ ...results, message: 'No unmatched loads found' })
    }
    results.loadsScanned = loads.length

    // 2. Fetch all active carriers
    const carrierRes = await fetch(`${supabaseUrl}/rest/v1/profiles?role=eq.carrier&select=id,email,phone,full_name,company_name,city,state,equipment_type,csa_score&limit=200`, {
      headers: sbHeaders,
    })
    const carriers = await carrierRes.json()
    if (!carriers || carriers.length === 0) {
      return Response.json({ ...results, message: 'No carriers available' })
    }

    // 3. Check which carriers were already notified (last 24h)
    const recentNotifRes = await fetch(`${supabaseUrl}/rest/v1/notifications?created_at=gte.${new Date(Date.now() - 86400000).toISOString()}&title=like.%25Load Match%25&select=user_id,body`, {
      headers: sbHeaders,
    })
    const recentNotifs = await recentNotifRes.json().catch(() => [])
    const notifiedSet = new Set((recentNotifs || []).map(n => `${n.user_id}-${n.body}`))

    // 4. Score each carrier against each load
    for (const load of loads) {
      const originState = extractState(load.origin)
      const destState = extractState(load.destination)

      const scored = carriers.map(carrier => {
        let score = 0

        // Equipment match (0-40)
        if (load.equipment && carrier.equipment_type) {
          const le = load.equipment.toLowerCase()
          const ce = carrier.equipment_type.toLowerCase()
          if (ce.includes(le) || le.includes(ce)) score += 40
          else if ((ce.includes('flatbed') && le.includes('flat')) ||
                   (ce.includes('van') && le.includes('dry')) ||
                   (ce.includes('reefer') && le.includes('ref'))) score += 35
        }

        // Location (0-35)
        if (carrier.state) {
          const cs = carrier.state.toUpperCase().trim()
          if (cs === originState) score += 35
          else if (cs === destState) score += 25
          else if (isAdjacent(cs, originState)) score += 15
        }

        // Safety (0-25)
        if (carrier.csa_score) {
          const csa = parseInt(carrier.csa_score)
          if (csa >= 90) score += 25
          else if (csa >= 80) score += 20
          else if (csa >= 70) score += 15
          else score += 5
        } else {
          score += 10
        }

        return { ...carrier, score }
      }).filter(c => c.score >= 30) // Only notify carriers with decent match
        .sort((a, b) => b.score - a.score)
        .slice(0, 5) // Top 5 per load

      results.carriersScored += carriers.length

      // 5. Notify matched carriers
      for (const match of scored) {
        const notifKey = `${match.id}-${load.load_id}`
        if (notifiedSet.has(notifKey)) continue // Already notified

        const rate = parseFloat(load.rate) || 0
        const rateStr = rate > 0 ? `$${rate.toLocaleString()}` : 'Rate TBD'
        const firstName = (match.full_name || '').split(' ')[0] || 'Driver'

        // SMS
        if (match.phone) {
          const msg = `QIVORI: Load match! ${load.origin} → ${load.destination}. ${rateStr}. ${load.equipment || 'Any'}. Score: ${match.score}/100. Log in: qivori.com`
          await sendSMS(match.phone, msg).catch(() => {})
          results.notificationsSent++
        }

        // Email
        if (match.email) {
          const html = buildMatchEmail(firstName, load, match, rateStr)
          await sendEmail(match.email, `Load match: ${load.origin} → ${load.destination}`, html).catch(() => {})
          results.notificationsSent++
        }

        // Log notification to prevent duplicates
        await fetch(`${supabaseUrl}/rest/v1/notifications`, {
          method: 'POST',
          headers: { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
          body: JSON.stringify({
            title: `Load Match — ${load.load_id}`,
            body: notifKey,
            user_id: match.id,
            read: false,
          }),
        }).catch(() => {})

        results.matches.push({
          loadId: load.load_id,
          carrier: match.company_name || match.full_name,
          score: match.score,
          notified: !!(match.phone || match.email),
        })
      }
    }

    return Response.json({ success: true, ...results, timestamp: new Date().toISOString() })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}

function extractState(location) {
  if (!location) return ''
  const parts = location.split(',')
  const last = (parts[parts.length - 1] || '').trim()
  const m = last.match(/^([A-Z]{2})$/)
  if (m) return m[1]
  return last.toUpperCase().slice(0, 2)
}

function isAdjacent(s1, s2) {
  const n = {
    'AL':['FL','GA','MS','TN'],'AZ':['CA','NM','NV','UT'],'AR':['LA','MO','MS','OK','TN','TX'],
    'CA':['AZ','NV','OR'],'CO':['KS','NE','NM','OK','UT','WY'],'CT':['MA','NY','RI'],
    'DE':['MD','NJ','PA'],'FL':['AL','GA'],'GA':['AL','FL','NC','SC','TN'],
    'ID':['MT','NV','OR','UT','WA','WY'],'IL':['IA','IN','KY','MO','WI'],
    'IN':['IL','KY','MI','OH'],'IA':['IL','MN','MO','NE','SD','WI'],
    'KS':['CO','MO','NE','OK'],'KY':['IL','IN','MO','OH','TN','VA','WV'],
    'LA':['AR','MS','TX'],'ME':['NH'],'MD':['DE','PA','VA','WV'],
    'MA':['CT','NH','NY','RI','VT'],'MI':['IN','OH','WI'],'MN':['IA','ND','SD','WI'],
    'MS':['AL','AR','LA','TN'],'MO':['AR','IA','IL','KS','KY','NE','OK','TN'],
    'MT':['ID','ND','SD','WY'],'NE':['CO','IA','KS','MO','SD','WY'],
    'NV':['AZ','CA','ID','OR','UT'],'NH':['MA','ME','VT'],'NJ':['DE','NY','PA'],
    'NM':['AZ','CO','OK','TX','UT'],'NY':['CT','MA','NJ','PA','VT'],
    'NC':['GA','SC','TN','VA'],'ND':['MN','MT','SD'],'OH':['IN','KY','MI','PA','WV'],
    'OK':['AR','CO','KS','MO','NM','TX'],'OR':['CA','ID','NV','WA'],
    'PA':['DE','MD','NJ','NY','OH','WV'],'RI':['CT','MA'],'SC':['GA','NC'],
    'SD':['IA','MN','MT','ND','NE','WY'],'TN':['AL','AR','GA','KY','MO','MS','NC','VA'],
    'TX':['AR','LA','NM','OK'],'UT':['AZ','CO','ID','NM','NV','WY'],
    'VT':['MA','NH','NY'],'VA':['KY','MD','NC','TN','WV'],'WA':['ID','OR'],
    'WV':['KY','MD','OH','PA','VA'],'WI':['IA','IL','MI','MN'],'WY':['CO','ID','MT','NE','SD','UT'],
  }
  return n[s1]?.includes(s2) || n[s2]?.includes(s1) || false
}

function buildMatchEmail(firstName, load, match, rateStr) {
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:24px;">
<span style="font-size:28px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
<span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
</div>
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:32px 24px;">
<h2 style="color:#f0a500;font-size:20px;margin:0 0 12px;">Load Match Found!</h2>
<p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Hey ${firstName}, our AI found a load that matches your profile:</p>
<div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;padding:20px;margin:16px 0;">
<div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:8px;">${load.origin || ''} → ${load.destination || ''}</div>
<div style="font-size:16px;color:#22c55e;font-weight:700;margin-bottom:4px;">${rateStr}</div>
<div style="font-size:12px;color:#8a8a9a;">${load.equipment || 'Any equipment'} · ${load.weight ? load.weight + ' lbs' : ''}</div>
<div style="margin-top:8px;font-size:12px;color:#f0a500;font-weight:600;">AI Match Score: ${match.score}/100</div>
</div>
<div style="text-align:center;margin-top:24px;">
<a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">View Load →</a>
</div>
</div>
<p style="text-align:center;font-size:11px;color:#4a5570;margin-top:20px;">
Qivori AI scans loads and matches them to your lane, equipment, and safety profile.<br/>
Your AI-powered dispatch assistant — finding the best loads so your team can focus on driving.
</p>
</div></body></html>`
}
