import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const RETELL_API_KEY = process.env.RETELL_API_KEY

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders({headers:{get:()=>null}}) } })
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  try {
    const body = await req.json()
    const { loadId, brokerPhone, brokerName, brokerEmail, carrierName, origin, destination, equipmentType, pickupDate, postedRate, minRate } = body

    if (!loadId || !brokerPhone || !carrierName || !origin || !destination) {
      return json({ error: 'Missing required fields' }, 400)
    }

    const phone = brokerPhone.replace(/\D/g, '')
    if (phone.length < 10) return json({ error: 'Invalid phone number' }, 400)

    // Retell AI outbound call
    const retellRes = await fetch('https://api.retellai.com/v2/create-phone-call', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + RETELL_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: process.env.RETELL_AGENT_ID || 'broker_call_agent',
        from_number: process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_FROM_NUMBER,
        to_number: '+1' + phone,
        metadata: { loadId, brokerName, brokerEmail, carrierName, origin, destination, equipmentType, postedRate, minRate },
        retell_llm_dynamic_variables: {
          carrier_name: carrierName,
          origin_city: origin,
          destination_city: destination,
          equipment_type: equipmentType || 'Dry Van',
          pickup_date: pickupDate || 'ASAP',
          posted_rate: String(postedRate || ''),
          min_rate: String(minRate || ''),
          broker_name: brokerName
        }
      })
    })

    if (!retellRes.ok) throw new Error('Retell API error: ' + retellRes.status)
    const retellData = await retellRes.json()

    // Store call record
    const headers = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY, 'Content-Type': 'application/json' }
    await fetch(SUPABASE_URL + '/rest/v1/retell_calls', {
      method: 'POST', headers,
      body: JSON.stringify({
        load_id: loadId, retell_call_id: retellData.call_id, call_type: 'broker_outbound',
        broker_phone: brokerPhone, broker_name: brokerName, broker_email: brokerEmail,
        carrier_name: carrierName, call_status: 'initiated', created_at: new Date().toISOString()
      })
    })

    return json({ callId: retellData.call_id, status: 'initiated', message: 'Call initiated to ' + brokerName })
  } catch (error) {
    return json({ error: 'Failed to initiate call: ' + error.message }, 500)
  }
}
