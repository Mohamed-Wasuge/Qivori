import { handleCors, corsHeaders } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
  }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'GET') {
    return Response.json({ error: 'GET only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Rate limit by IP
  const ip = getClientIP(req)
  const { limited, resetMs } = rateLimit(`carrier-page:${ip}`, 30, 60000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  const url = new URL(req.url)
  const slug = url.searchParams.get('slug')

  if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
    return Response.json({ error: 'Invalid slug' }, { status: 400, headers: corsHeaders(req) })
  }

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    // Fetch company by slug (only if public page is enabled)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/companies?slug=eq.${slug}&public_page_enabled=eq.true&select=name,mc_number,dot_number,address,phone,email,logo,tagline,service_areas,equipment_types`,
      { headers: sbHeaders() }
    )

    if (!res.ok) {
      return Response.json({ error: 'Failed to fetch' }, { status: 500, headers: corsHeaders(req) })
    }

    const rows = await res.json()
    if (!rows || rows.length === 0) {
      return Response.json({ error: 'Carrier not found' }, { status: 404, headers: corsHeaders(req) })
    }

    const company = rows[0]

    // Fetch carrier settings for equipment preferences (fallback)
    // We don't expose sensitive settings — just equipment and regions
    const ownerId = await getOwnerId(slug)
    let preferredEquipment = []
    let preferredRegions = []

    if (ownerId) {
      const settingsRes = await fetch(
        `${SUPABASE_URL}/rest/v1/carrier_settings?owner_id=eq.${ownerId}&select=preferred_equipment,preferred_regions`,
        { headers: sbHeaders() }
      )
      if (settingsRes.ok) {
        const settings = await settingsRes.json()
        if (settings?.[0]) {
          preferredEquipment = settings[0].preferred_equipment || []
          preferredRegions = settings[0].preferred_regions || []
        }
      }
    }

    return Response.json({
      company: {
        name: company.name,
        mc_number: company.mc_number,
        dot_number: company.dot_number,
        address: company.address,
        phone: company.phone,
        email: company.email,
        logo: company.logo,
        tagline: company.tagline,
        service_areas: company.service_areas,
        equipment_types: company.equipment_types,
      },
      preferredEquipment,
      preferredRegions,
    }, {
      headers: {
        ...corsHeaders(req),
        'Cache-Control': 'public, max-age=300, s-maxage=600',
      },
    })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
  }
}

async function getOwnerId(slug) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/companies?slug=eq.${slug}&select=owner_id`,
      { headers: sbHeaders() }
    )
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0]?.owner_id || null
  } catch {
    return null
  }
}
