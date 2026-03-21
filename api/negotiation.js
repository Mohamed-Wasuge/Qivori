import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
function json(d, s=200) { return new Response(JSON.stringify(d), { status: s, headers: {'Content-Type':'application/json'} }) }
const sb = () => ({ apikey: SUPABASE_KEY, Authorization: 'Bearer '+SUPABASE_KEY, 'Content-Type': 'application/json' })

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // GET: Return negotiation settings
  if (req.method === 'GET') {
    const res = await fetch(SUPABASE_URL + '/rest/v1/negotiation_settings?user_id=eq.' + user.id + '&limit=1', { headers: sb() })
    const data = await res.json()
    if (data.length === 0) {
      return json({ min_rate_per_mile: 2.50, counter_offer_markup_pct: 10, max_counter_rounds: 2, auto_accept_above_minimum: false, notify_driver_on_offer: true, driver_response_timeout_minutes: 5 })
    }
    return json(data[0])
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    const body = await req.json()

    // POST update_settings: Save negotiation preferences
    if (action === 'update_settings') {
      const settings = {
        user_id: user.id,
        min_rate_per_mile: body.min_rate_per_mile || 2.50,
        counter_offer_markup_pct: body.counter_offer_markup_pct || 10,
        max_counter_rounds: body.max_counter_rounds || 2,
        auto_accept_above_minimum: body.auto_accept_above_minimum || false,
        notify_driver_on_offer: body.notify_driver_on_offer !== false,
        driver_response_timeout_minutes: body.driver_response_timeout_minutes || 5,
        updated_at: new Date().toISOString()
      }
      await fetch(SUPABASE_URL + '/rest/v1/negotiation_settings', {
        method: 'POST', headers: { ...sb(), Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify(settings)
      })
      return json({ ok: true, settings })
    }

    // POST driver_response: Driver responds to rate offer
    if (action === 'driver_response') {
      const { callId, decision, counterRate } = body
      if (!callId || !decision) return json({ error: 'Missing callId or decision' }, 400)
      const validDecisions = ['accept', 'counter', 'decline']
      if (!validDecisions.includes(decision)) return json({ error: 'Invalid decision' }, 400)

      let outcome = decision
      let agreedRate = null
      if (decision === 'accept') { outcome = 'accepted'; agreedRate = body.offeredRate }
      if (decision === 'counter') { outcome = 'counter_offer'; agreedRate = counterRate }
      if (decision === 'decline') { outcome = 'declined' }

      await fetch(SUPABASE_URL + '/rest/v1/retell_calls?retell_call_id=eq.' + callId, {
        method: 'PATCH', headers: sb(),
        body: JSON.stringify({ outcome, agreed_rate: agreedRate, notes: 'Driver decision: ' + decision + (counterRate ? ' at $' + counterRate : '') })
      })
      return json({ ok: true, decision, outcome, agreedRate })
    }

    return json({ error: 'Unknown action. Use ?action=update_settings or ?action=driver_response' }, 400)
  } catch (error) {
    return json({ error: 'Failed: ' + error.message }, 500)
  }
}
