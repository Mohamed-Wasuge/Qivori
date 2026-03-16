import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { sendEmail } from './_lib/emails.js'
import { sendSMS } from './_lib/sms.js'

export const config = { runtime: 'edge' }

/**
 * Auto-match: when a broker posts a load, score all available carriers
 * by equipment type, location proximity, and safety score.
 * Sends email notification to top 3 matches.
 */
export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const { loadId, origin, destination, rate, equipment, brokerName } = await req.json()
    if (!loadId || !origin || !destination) {
      return Response.json({ error: 'Missing load details' }, { status: 400, headers: corsHeaders(req) })
    }

    const sbHeaders = { 'apikey': serviceKey, 'Authorization': `Bearer ${serviceKey}` }

    // Fetch all active carriers
    const res = await fetch(`${supabaseUrl}/rest/v1/profiles?role=eq.carrier&status=eq.active&select=id,email,phone,full_name,company_name,city,state,equipment_type,csa_score,mc_number&limit=200`, {
      headers: sbHeaders,
    })
    const carriers = await res.json()
    if (!carriers || carriers.length === 0) {
      return Response.json({ matches: [], message: 'No carriers available' }, { headers: corsHeaders(req) })
    }

    // Extract origin/destination state for proximity matching
    const originState = extractState(origin)
    const destState = extractState(destination)

    // Score each carrier
    const scored = carriers.map(carrier => {
      let score = 0

      // Equipment match (0-40 points)
      if (equipment && carrier.equipment_type) {
        const loadEquip = equipment.toLowerCase()
        const carrierEquip = carrier.equipment_type.toLowerCase()
        if (carrierEquip.includes(loadEquip) || loadEquip.includes(carrierEquip)) score += 40
        else if (carrierEquip.includes('flatbed') && loadEquip.includes('flat')) score += 35
        else if (carrierEquip.includes('van') && loadEquip.includes('dry')) score += 35
        else if (carrierEquip.includes('reefer') && loadEquip.includes('ref')) score += 35
      }

      // Location proximity (0-35 points)
      if (carrier.state) {
        const carrierState = carrier.state.toUpperCase().trim()
        if (carrierState === originState) score += 35
        else if (carrierState === destState) score += 25
        else if (isAdjacentState(carrierState, originState)) score += 15
      }

      // Safety score (0-25 points)
      if (carrier.csa_score) {
        const csa = parseInt(carrier.csa_score)
        if (csa >= 90) score += 25
        else if (csa >= 80) score += 20
        else if (csa >= 70) score += 15
        else score += 5
      } else {
        score += 10 // neutral if no score
      }

      return { ...carrier, matchScore: score }
    })

    // Sort by score descending, take top 3
    scored.sort((a, b) => b.matchScore - a.matchScore)
    const topMatches = scored.slice(0, 3)

    // Calculate RPM for email
    const rateNum = parseFloat(rate) || 0
    const rpmDisplay = rateNum > 0 ? `$${(rateNum).toLocaleString()}` : 'Rate TBD'

    // Send notification emails to top 3 matches
    const emailPromises = topMatches.map(carrier => {
      if (!carrier.email) return Promise.resolve()
      const firstName = (carrier.full_name || carrier.email.split('@')[0]).split(' ')[0]
      const subject = `New load available: ${origin} → ${destination}`
      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;">
<span style="font-size:32px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
<span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
</div>
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:32px 24px;margin-bottom:24px;">
<h2 style="color:#f0a500;font-size:20px;margin:0 0 12px;">New Load Match!</h2>
<p style="color:#8a8a9a;font-size:14px;line-height:1.6;">Hey ${firstName}, a new load just posted that matches your profile:</p>
<div style="background:#1e1e2a;border:1px solid #2a2a35;border-radius:12px;padding:20px;margin:16px 0;">
<div style="font-size:18px;font-weight:800;color:#fff;margin-bottom:8px;">${origin} → ${destination}</div>
<div style="font-size:16px;color:#22c55e;font-weight:700;margin-bottom:4px;">${rpmDisplay}</div>
<div style="font-size:12px;color:#8a8a9a;">${equipment || 'Any equipment'} · Posted by ${brokerName || 'Broker'}</div>
<div style="margin-top:8px;font-size:12px;color:#f0a500;font-weight:600;">Match Score: ${carrier.matchScore}/100</div>
</div>
<div style="text-align:center;margin-top:24px;">
<a href="https://qivori.com" style="display:inline-block;background:#f0a500;color:#000;font-weight:700;font-size:14px;padding:14px 40px;border-radius:10px;text-decoration:none;">View Load →</a>
</div>
</div>
</div></body></html>`
      return sendEmail(carrier.email, subject, html).catch(() => {})
    })
    await Promise.allSettled(emailPromises)

    // Also send SMS to carriers with phone numbers
    const smsPromises = topMatches.map(carrier => {
      if (!carrier.phone) return Promise.resolve()
      const msg = `QIVORI: New load match! ${origin} → ${destination}. ${rpmDisplay}. ${equipment || 'Any equipment'}. Score: ${carrier.matchScore}/100. Log in to view: qivori.com`
      return sendSMS(carrier.phone, msg).catch(() => {})
    })
    await Promise.allSettled(smsPromises)

    // Update load with match data
    await fetch(`${supabaseUrl}/rest/v1/loads?load_id=eq.${encodeURIComponent(loadId)}`, {
      method: 'PATCH',
      headers: { ...sbHeaders, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        notes: `AI matched ${topMatches.length} carriers (scores: ${topMatches.map(m => m.matchScore).join(', ')})`,
      }),
    }).catch(() => {})

    return Response.json({
      matches: topMatches.map(m => ({
        id: m.id,
        name: m.full_name,
        company: m.company_name,
        equipment: m.equipment_type,
        location: [m.city, m.state].filter(Boolean).join(', '),
        score: m.matchScore,
        notified: !!m.email,
      })),
    }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}

function extractState(location) {
  if (!location) return ''
  const parts = location.split(',')
  const last = (parts[parts.length - 1] || '').trim()
  // Handle "City, ST" or "City, State"
  const stateMatch = last.match(/^([A-Z]{2})$/)
  if (stateMatch) return stateMatch[1]
  return last.toUpperCase().slice(0, 2)
}

function isAdjacentState(s1, s2) {
  const neighbors = {
    'AL': ['FL','GA','MS','TN'], 'AZ': ['CA','NM','NV','UT'], 'AR': ['LA','MO','MS','OK','TN','TX'],
    'CA': ['AZ','NV','OR'], 'CO': ['KS','NE','NM','OK','UT','WY'], 'CT': ['MA','NY','RI'],
    'DE': ['MD','NJ','PA'], 'FL': ['AL','GA'], 'GA': ['AL','FL','NC','SC','TN'],
    'ID': ['MT','NV','OR','UT','WA','WY'], 'IL': ['IA','IN','KY','MO','WI'],
    'IN': ['IL','KY','MI','OH'], 'IA': ['IL','MN','MO','NE','SD','WI'],
    'KS': ['CO','MO','NE','OK'], 'KY': ['IL','IN','MO','OH','TN','VA','WV'],
    'LA': ['AR','MS','TX'], 'ME': ['NH'], 'MD': ['DE','PA','VA','WV'],
    'MA': ['CT','NH','NY','RI','VT'], 'MI': ['IN','OH','WI'], 'MN': ['IA','ND','SD','WI'],
    'MS': ['AL','AR','LA','TN'], 'MO': ['AR','IA','IL','KS','KY','NE','OK','TN'],
    'MT': ['ID','ND','SD','WY'], 'NE': ['CO','IA','KS','MO','SD','WY'],
    'NV': ['AZ','CA','ID','OR','UT'], 'NH': ['MA','ME','VT'], 'NJ': ['DE','NY','PA'],
    'NM': ['AZ','CO','OK','TX','UT'], 'NY': ['CT','MA','NJ','PA','VT'],
    'NC': ['GA','SC','TN','VA'], 'ND': ['MN','MT','SD'], 'OH': ['IN','KY','MI','PA','WV'],
    'OK': ['AR','CO','KS','MO','NM','TX'], 'OR': ['CA','ID','NV','WA'],
    'PA': ['DE','MD','NJ','NY','OH','WV'], 'RI': ['CT','MA'], 'SC': ['GA','NC'],
    'SD': ['IA','MN','MT','ND','NE','WY'], 'TN': ['AL','AR','GA','KY','MO','MS','NC','VA'],
    'TX': ['AR','LA','NM','OK'], 'UT': ['AZ','CO','ID','NM','NV','WY'],
    'VT': ['MA','NH','NY'], 'VA': ['KY','MD','NC','TN','WV'], 'WA': ['ID','OR'],
    'WV': ['KY','MD','OH','PA','VA'], 'WI': ['IA','IL','MI','MN'], 'WY': ['CO','ID','MT','NE','SD','UT'],
  }
  return neighbors[s1]?.includes(s2) || neighbors[s2]?.includes(s1) || false
}
