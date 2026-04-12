/**
 * /api/retell-driver-call — Q calls the driver's phone for voice interaction
 *
 * Long-pressing the Q mic in the mobile app triggers this endpoint.
 * Instead of WebRTC in-app (which needs the Retell SDK), we have Retell
 * call the driver's actual phone number. Driver answers → talks to Q.
 *
 * This keeps the driver hands-free in the truck (phone speaker/earpiece)
 * and requires zero additional npm packages in the mobile app.
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
  // Use a driver-specific agent if configured, fall back to the main agent
  const RETELL_AGENT_ID = process.env.RETELL_DRIVER_AGENT_ID || process.env.RETELL_AGENT_ID
  const FROM_NUMBER = process.env.RETELL_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER

  if (!RETELL_API_KEY || !RETELL_AGENT_ID || !FROM_NUMBER) {
    return Response.json({
      error: 'Retell not configured',
      missing: { apiKey: !RETELL_API_KEY, agentId: !RETELL_AGENT_ID, fromNumber: !FROM_NUMBER },
    }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const body = await req.json().catch(() => ({}))

    // 1. Fetch driver profile (phone, name, truck, plan)
    const profiles = await sbGet(
      `profiles?id=eq.${user.id}&select=full_name,phone,assigned_truck_id,subscription_plan&limit=1`
    )
    const profile = profiles[0]
    if (!profile) {
      return Response.json({ error: 'Driver profile not found' }, { status: 404, headers: corsHeaders(req) })
    }

    const phone = body.phone || profile.phone
    if (!phone) {
      return Response.json({
        error: 'No phone number on file. Add your phone in Settings.',
      }, { status: 400, headers: corsHeaders(req) })
    }

    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      return Response.json({ error: 'Invalid phone number' }, { status: 400, headers: corsHeaders(req) })
    }
    // Ensure US +1 prefix
    const toNumber = digits.startsWith('1') ? `+${digits}` : `+1${digits}`

    // 2. Fetch truck info
    let truck = null
    if (profile.assigned_truck_id) {
      const trucks = await sbGet(
        `vehicles?id=eq.${profile.assigned_truck_id}&select=unit_number,year,make,model,status&limit=1`
      )
      truck = trucks[0] || null
    }

    // 3. Fetch company (owner first, then via membership for drivers)
    let company = {}
    const ownedCos = await sbGet(
      `companies?owner_id=eq.${user.id}&select=name,mc_number,dot_number&limit=1`
    )
    if (ownedCos[0]) {
      company = ownedCos[0]
    } else {
      const memberships = await sbGet(
        `company_members?user_id=eq.${user.id}&status=eq.active&select=company_id&limit=1`
      )
      if (memberships[0]) {
        const cos = await sbGet(
          `companies?id=eq.${memberships[0].company_id}&select=name,mc_number,dot_number&limit=1`
        )
        company = cos[0] || {}
      }
    }

    // 4. This week's earnings (Mon–today)
    const now = new Date()
    const monday = new Date(now)
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7))
    monday.setHours(0, 0, 0, 0)
    const invoices = await sbGet(
      `invoices?user_id=eq.${user.id}&status=eq.paid&created_at=gte.${encodeURIComponent(monday.toISOString())}&select=gross_pay&limit=50`
    )
    const weeklyGross = invoices.reduce((sum, inv) => sum + (Number(inv.gross_pay) || 0), 0)

    // 5. Active load
    const activeLoads = await sbGet(
      `loads?user_id=eq.${user.id}&status=in.(in_transit,picked_up,assigned)&select=load_number,origin,destination,rate,status&order=created_at.desc&limit=1`
    )
    const activeLoad = activeLoads[0] || null

    const driverName = profile.full_name || 'Driver'
    const truckLabel = truck
      ? [truck.year, truck.make, truck.model].filter(Boolean).join(' ') + (truck.unit_number ? ` (Unit ${truck.unit_number})` : '')
      : 'no truck assigned'

    console.log('[retell-driver-call] calling', driverName, 'at', toNumber)

    // 6. Create Retell outbound call TO the driver's phone
    const retellRes = await fetch('https://api.retellai.com/v2/create-phone-call', {
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
          call_type: 'driver_direct',
          userId: user.id,
          driverId: user.id,
          truckId: profile.assigned_truck_id || '',
          experience: 'driver_voice',
        },
        retell_llm_dynamic_variables: {
          // Tells the agent this is a driver-initiated voice session
          // so it behaves as a dispatcher assistant, not a broker negotiator
          caller_type: 'driver_direct',
          call_context: 'driver_voice_assistant',
          driver_name: driverName,
          carrier_name: company.name || 'your carrier',
          carrier_mc: company.mc_number || 'N/A',
          carrier_dot: company.dot_number || 'N/A',
          truck_info: truckLabel,
          weekly_earnings: weeklyGross > 0
            ? `$${Math.round(weeklyGross).toLocaleString()} this week`
            : 'no paid loads this week yet',
          active_load: activeLoad
            ? `Load ${activeLoad.load_number}: ${activeLoad.origin} → ${activeLoad.destination}, $${Number(activeLoad.rate || 0).toLocaleString()}, status: ${activeLoad.status}`
            : 'no active load',
          subscription_plan: profile.subscription_plan || 'standard',
          user_id: user.id,
        },
      }),
    })

    if (!retellRes.ok) {
      const err = await retellRes.text()
      console.error('[retell-driver-call] Retell error', retellRes.status, err)
      return Response.json({ error: 'Failed to start call: ' + err }, { status: 502, headers: corsHeaders(req) })
    }

    const data = await retellRes.json()

    // 7. Insert retell_calls row so realtime feed picks it up
    if (data?.call_id) {
      await fetch(`${SUPABASE_URL}/rest/v1/retell_calls`, {
        method: 'POST',
        headers: { ...sbHeaders(), Prefer: 'return=minimal' },
        body: JSON.stringify({
          user_id: user.id,
          retell_call_id: data.call_id,
          broker_name: 'Q Voice',
          call_status: 'initiating',
          call_type: 'driver_direct',
          truck_id: profile.assigned_truck_id || null,
          driver_id: user.id,
          created_at: new Date().toISOString(),
        }),
      }).catch(() => {})
    }

    return Response.json({
      call_id: data.call_id,
      status: 'calling',
      message: `Q is calling ${toNumber}. Answer your phone to talk.`,
    }, { headers: corsHeaders(req) })

  } catch (err) {
    console.error('[retell-driver-call] error:', err.message)
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
