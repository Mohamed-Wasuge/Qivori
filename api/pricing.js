import { handleCors, corsHeaders } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } })
  }

  try {
    const headers = {
      apikey: SUPABASE_KEY,
      Authorization: 'Bearer ' + SUPABASE_KEY,
      'Content-Type': 'application/json'
    }

    // Call Supabase RPC to get founder spots remaining
    const rpcResponse = await fetch(
      SUPABASE_URL + '/rest/v1/rpc/get_founder_spots_remaining',
      { method: 'POST', headers, body: JSON.stringify({}) }
    )

    let founderSpotsRemaining = 100
    if (rpcResponse.ok) {
      const data = await rpcResponse.json()
      founderSpotsRemaining = typeof data === 'number' ? data : 100
    }

    const isFounderAvailable = founderSpotsRemaining > 0
    const founderFirstTruck = 199
    const founderExtraTruck = 99
    const standardFirstTruck = 299
    const standardExtraTruck = 149

    return new Response(JSON.stringify({
      founderSpotsRemaining,
      founderFirstTruck,
      founderExtraTruck,
      standardFirstTruck,
      standardExtraTruck,
      isFounderAvailable,
      currentFirstTruck: isFounderAvailable ? founderFirstTruck : standardFirstTruck,
      currentExtraTruck: isFounderAvailable ? founderExtraTruck : standardExtraTruck,
      // Legacy fields for backwards compat
      founderPrice: founderFirstTruck,
      standardPrice: standardFirstTruck,
      currentPrice: isFounderAvailable ? founderFirstTruck : standardFirstTruck,
    }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60', ...corsHeaders(req) } })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch pricing', founderSpotsRemaining: 100, founderPrice: 199, standardPrice: 299, isFounderAvailable: true, currentPrice: 199 }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } })
  }
}
