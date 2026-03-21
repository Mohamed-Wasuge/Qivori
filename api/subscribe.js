import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY
function json(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json'}})}
const sb=()=>({apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json'})

export default async function handler(req){
  const corsRes = handleCors(req)
  if (corsRes) return corsRes
  if(req.method!=='POST') return json({error:'Method not allowed'},405)
  const authErr = await requireAuth(req)
  if (authErr) return authErr
  try{
    const body=await req.json()
    const{truckCount,successUrl,cancelUrl}=body
    const trucks=Math.max(1,Math.min(250,parseInt(truckCount)||1))

    // Check founder spots
    const spotsRes=await fetch(SUPABASE_URL+'/rest/v1/rpc/get_founder_spots_remaining',{method:'POST',headers:sb(),body:'{}'})
    let spots=100
    if(spotsRes.ok){const d=await spotsRes.json();spots=typeof d==='number'?d:100}
    const isFounder=spots>=trucks
    const pricePerTruck=isFounder?399:549
    const totalCents=pricePerTruck*trucks*100

    if(!STRIPE_KEY){
      return json({ok:true,provider:'mock',isFounder,pricePerTruck,trucks,checkoutUrl:(successUrl||'/app')+'?checkout=mock_success'})
    }

    // Create Stripe checkout session
    const params=new URLSearchParams()
    params.set('mode','subscription')
    params.set('success_url',(successUrl||'https://qivori.com/app')+'?checkout=success&session_id={CHECKOUT_SESSION_ID}')
    params.set('cancel_url',cancelUrl||'https://qivori.com/pricing?checkout=cancel')
    params.set('subscription_data[trial_period_days]','14')
    params.set('line_items[0][price_data][currency]','usd')
    params.set('line_items[0][price_data][product_data][name]','Qivori Dispatch ('+trucks+' trucks)')
    params.set('line_items[0][price_data][recurring][interval]','month')
    params.set('line_items[0][price_data][unit_amount]',String(totalCents))
    params.set('line_items[0][quantity]','1')
    params.set('metadata[truck_count]',String(trucks))
    params.set('metadata[price_per_truck]',String(pricePerTruck))
    params.set('metadata[is_founder]',String(isFounder))

    const stripeRes=await fetch('https://api.stripe.com/v1/checkout/sessions',{
      method:'POST',
      headers:{Authorization:'Bearer '+STRIPE_KEY,'Content-Type':'application/x-www-form-urlencoded'},
      body:params
    })
    const session=await stripeRes.json()
    if(!stripeRes.ok) return json({error:session?.error?.message||'Stripe error'},400)

    return json({ok:true,provider:'stripe',sessionId:session.id,checkoutUrl:session.url,isFounder,pricePerTruck,trucks})
  }catch(e){return json({error:e.message},500)}
}
