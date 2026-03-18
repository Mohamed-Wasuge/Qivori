export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

export default async function handler(req) {
  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: { 'Content-Type': 'application/json' } })
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
    const founderPrice = 399
    const standardPrice = 549

    return new Response(JSON.stringify({
      founderSpotsRemaining,
      founderPrice,
      standardPrice,
      isFounderAvailable,
      currentPrice: isFounderAvailable ? founderPrice : standardPrice
    }), { status: 200, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, s-maxage=60' } })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to fetch pricing', founderSpotsRemaining: 100, founderPrice: 399, standardPrice: 549, isFounderAvailable: true, currentPrice: 399 }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
}
