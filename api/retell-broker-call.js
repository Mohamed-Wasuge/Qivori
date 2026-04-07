/**
 * Retell Outbound Broker Call — Q calls a broker about a load
 *
 * Enriches the call with the same intelligence pipeline as inbound:
 *   - Carrier credentials (MC, DOT, company name)
 *   - Rate analysis (target, floor, RPM, operating cost)
 *   - Negotiation settings (markup %, max rounds, auto-accept)
 *   - Broker urgency score (if we've called this broker before)
 *   - Diesel-based operating cost
 *
 * All context is passed as retell_llm_dynamic_variables (string values).
 * The Retell dashboard prompt references them as {{variable_name}}.
 *
 * Runtime: Vercel Edge
 */

import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

const sbHeaders = () => ({
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
})

async function sbGet(path) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: sbHeaders() })
    return res.ok ? res.json() : []
  } catch { return [] }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const RETELL_API_KEY = process.env.RETELL_API_KEY
  const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID
  const FROM_NUMBER = process.env.RETELL_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER
  if (!RETELL_API_KEY || !RETELL_AGENT_ID || !FROM_NUMBER) {
    return Response.json({ error: 'Retell not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json().catch(() => ({}))
    const { phone, brokerName, loadDetails, driverName } = body

    if (!phone) {
      return Response.json({ error: 'Phone number is required' }, { status: 400, headers: corsHeaders(req) })
    }

    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      return Response.json({ error: 'Invalid phone number — must be at least 10 digits' }, { status: 400, headers: corsHeaders(req) })
    }
    const toNumber = `+${digits}`

    // ── Enrich call with intelligence (parallel) ────────────────────────
    const rate = Number(body.rate || 0)
    const miles = Number(body.miles || 0)
    const phone10 = digits.slice(-10)

    const [companies, negSettings, urgencyRows, dieselRows] = await Promise.all([
      sbGet(`companies?owner_id=eq.${user.id}&select=name,mc_number,dot_number&limit=1`),
      sbGet(`negotiation_settings?user_id=eq.${user.id}&select=min_rate_per_mile,counter_offer_markup_pct,max_counter_rounds,auto_accept_above_minimum&limit=1`),
      brokerName
        ? sbGet(`broker_urgency_scores?owner_id=eq.${user.id}&broker_name=eq.${encodeURIComponent(brokerName)}&select=urgency_score,signals,call_count&limit=1`)
        : [],
      sbGet(`diesel_prices?region=eq.US AVG&order=fetched_at.desc&limit=1`),
    ])

    const company = companies[0] || {}
    const neg = negSettings[0] || { min_rate_per_mile: 2.50, counter_offer_markup_pct: 10, max_counter_rounds: 2 }
    const urgency = urgencyRows[0] || null
    const dieselPrice = dieselRows[0]?.price || 4.00

    // Rate math
    const minRpm = neg.min_rate_per_mile || 2.50
    const counterMarkup = neg.counter_offer_markup_pct || 10
    const maxRounds = neg.max_counter_rounds || 2
    const rpm = miles > 0 ? (rate / miles).toFixed(2) : '0'
    const targetRate = Math.round(rate * (1 + counterMarkup / 100))
    const floorRate = Math.round(minRpm * (miles || 500))
    const fuelCpm = (dieselPrice / 6.5).toFixed(2)
    const opCost = (Number(fuelCpm) + 0.51).toFixed(2)

    // Rate verdict
    let verdict = 'No rate analysis available.'
    if (Number(rpm) > 0) {
      if (Number(rpm) >= 3.00) verdict = 'EXCELLENT rate — lock it in.'
      else if (Number(rpm) >= 2.50) verdict = 'GOOD rate — solid, worth taking.'
      else if (Number(rpm) >= minRpm) verdict = 'FAIR rate — push for more.'
      else verdict = `BELOW MINIMUM ($${minRpm}/mi floor) — negotiate hard or walk.`
    }

    // Broker urgency
    let urgencyText = 'No urgency data — standard approach.'
    let strategyText = 'Be professional and direct. Push for best rate.'
    if (urgency) {
      const level = urgency.urgency_score >= 70 ? 'HIGH' : urgency.urgency_score >= 40 ? 'MEDIUM' : 'LOW'
      urgencyText = `${level} urgency (${urgency.urgency_score}/100). Called ${urgency.call_count || 0} times before.`
      if (urgency.urgency_score >= 70) {
        strategyText = 'Broker is desperate — push for top dollar.'
      }
    }

    const carrierName = company.name || body.carrierName || 'our carrier'
    const originCity = body.originCity || ''
    const destCity = body.destinationCity || ''

    const res = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RETELL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from_number: FROM_NUMBER,
        to_number: toNumber,
        agent_id: RETELL_AGENT_ID,
        metadata: {
          call_type: 'broker_outbound',
          loadId: body.loadId || '',
          brokerName: brokerName || '',
          brokerPhone: toNumber,
          carrierName: carrierName,
          origin: originCity,
          destination: destCity,
          rate: String(rate),
          userId: user.id,
        },
        retell_llm_dynamic_variables: {
          caller_type: 'broker_outbound',
          caller_name: brokerName || 'Broker',
          broker_name: brokerName || 'Broker',
          carrier_name: carrierName,
          carrier_mc: company.mc_number || '',
          carrier_dot: company.dot_number || '',
          origin_city: originCity,
          destination_city: destCity,
          load_details: loadDetails || `${originCity} → ${destCity}. Rate: $${rate}${miles ? ` (${miles}mi, $${rpm}/mi)` : ''}. Equipment: ${body.equipment || 'dry van'}.`,
          posted_rate: `$${rate}`,
          rate_per_mile: `$${rpm}/mi`,
          target_rate: `$${targetRate}`,
          target_rpm: `$${(targetRate / (miles || 500)).toFixed(2)}/mi`,
          floor_rate: `$${floorRate}`,
          floor_rpm: `$${minRpm}/mi`,
          operating_cost: `$${opCost}/mi`,
          diesel_price: `$${dieselPrice}/gal`,
          rate_verdict: verdict,
          broker_urgency: urgencyText,
          negotiation_strategy: strategyText,
          max_counter_rounds: String(maxRounds),
          miles: String(miles),
          driver_name: driverName || 'Driver',
        },
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return Response.json({ error: 'Retell error: ' + err }, { status: 502, headers: corsHeaders(req) })
    }

    const data = await res.json()
    return Response.json({
      call_id: data.call_id,
      status: 'calling',
    }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
