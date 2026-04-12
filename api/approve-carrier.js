import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { sendSMS } from './_lib/sms.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY

function db(path) {
  return `${SUPABASE_URL}/rest/v1/${path}`
}

function serviceHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
  }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Must be an authenticated admin (@qivori.com)
  const { user, error: authError } = await verifyAuth(req)
  if (authError || !user?.email?.endsWith('@qivori.com')) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const { companyId } = await req.json()
  if (!companyId) {
    return Response.json({ error: 'companyId required' }, { status: 400, headers: corsHeaders(req) })
  }

  // 1. Fetch company + owner phone
  const compRes = await fetch(db(`companies?id=eq.${companyId}&select=*`), { headers: serviceHeaders() })
  const [company] = await compRes.json()
  if (!company) {
    return Response.json({ error: 'Company not found' }, { status: 404, headers: corsHeaders(req) })
  }

  // 2. Update companies: active + basic plan
  await fetch(db(`companies?id=eq.${companyId}`), {
    method: 'PATCH',
    headers: serviceHeaders(),
    body: JSON.stringify({ carrier_status: 'active', plan: 'basic' }),
  })

  // 3. Collect all user IDs in this company (owner + members)
  const [membersRes, ownerProfileRes] = await Promise.all([
    fetch(db(`company_members?company_id=eq.${companyId}&select=user_id`), { headers: serviceHeaders() }),
    company.owner_id
      ? fetch(db(`profiles?id=eq.${company.owner_id}&select=id,phone`), { headers: serviceHeaders() })
      : Promise.resolve(null),
  ])

  const members = await membersRes.json()
  const ownerProfiles = ownerProfileRes ? await ownerProfileRes.json() : []
  const ownerProfile = ownerProfiles[0] || null

  const memberIds = (members || []).map(m => m.user_id).filter(Boolean)
  if (company.owner_id && !memberIds.includes(company.owner_id)) {
    memberIds.push(company.owner_id)
  }

  // 4. Update profiles: subscription_plan = tms_pro (basic carrier plan)
  if (memberIds.length > 0) {
    await fetch(db(`profiles?id=in.(${memberIds.join(',')})`), {
      method: 'PATCH',
      headers: serviceHeaders(),
      body: JSON.stringify({ subscription_plan: 'tms_pro', status: 'active' }),
    })
  }

  // 5. Send approval SMS to the owner's phone
  let smsSent = false
  let smsError = null
  const phone = ownerProfile?.phone || company.phone
  if (phone) {
    const result = await sendSMS(
      phone,
      `You're approved on Q! Open the app to get started. Questions? Reply or call us at hello@qivori.com`
    )
    smsSent = result.ok
    smsError = result.error
  }

  return Response.json({
    ok: true,
    smsSent,
    smsError: smsSent ? null : smsError,
    syncedProfiles: memberIds.length,
  }, { headers: corsHeaders(req) })
}
