import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'hello@qivori.com'
const CRON_SECRET = process.env.CRON_SECRET
function json(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json'}})}
const sb=()=>({apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json'})

async function requireAdmin(req) {
  // Allow cron jobs with secret
  const url = new URL(req.url)
  if (CRON_SECRET && url.searchParams.get('secret') === CRON_SECRET) return null
  // Require auth + admin email
  const { user, error } = await verifyAuth(req)
  if (error) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  if (user.email !== ADMIN_EMAIL && !user.email?.endsWith('@qivori.com')) {
    return Response.json({ error: 'Admin access required' }, { status: 403, headers: corsHeaders(req) })
  }
  return null
}

export default async function handler(req){
  const corsRes = handleCors(req)
  if (corsRes) return corsRes
  const url=new URL(req.url)
  const action=url.searchParams.get('action')

  // Auth: require admin for all operations
  const authErr = await requireAdmin(req)
  if (authErr) return authErr

  // GET: Admin dashboard aggregation
  if(req.method==='GET'){
    const[callsRes,checkRes,settleRes,factorRes,docsRes]=await Promise.all([
      fetch(SUPABASE_URL+'/rest/v1/retell_calls?order=created_at.desc&limit=20',{headers:sb()}),
      fetch(SUPABASE_URL+'/rest/v1/check_calls?order=created_at.desc&limit=20',{headers:sb()}),
      fetch(SUPABASE_URL+'/rest/v1/settlements?order=created_at.desc&limit=20',{headers:sb()}),
      fetch(SUPABASE_URL+'/rest/v1/factoring_submissions?order=created_at.desc&limit=20',{headers:sb()}),
      fetch(SUPABASE_URL+'/rest/v1/carrier_documents?order=created_at.desc&limit=20',{headers:sb()})
    ])
    const[calls,checks,settlements,factoring,docs]=await Promise.all([callsRes.json(),checkRes.json(),settleRes.json(),factorRes.json(),docsRes.json()])

    const totalCalls=calls.length
    const bookedCalls=calls.filter(c=>c.outcome==='booked').length
    const totalSettled=settlements.filter(s=>s.status==='settled').reduce((sum,s)=>sum+(parseFloat(s.agreed_rate)||0),0)
    const pendingFactoring=factoring.filter(f=>f.status==='submitted').length

    return json({
      summary:{totalCalls,bookedCalls,bookRate:totalCalls?Math.round(bookedCalls/totalCalls*100):0,totalSettled,pendingFactoring,totalDocuments:docs.length},
      recentCalls:calls.slice(0,10),
      recentCheckCalls:checks.slice(0,10),
      recentSettlements:settlements.slice(0,10),
      recentFactoring:factoring.slice(0,10),
      carrierDocs:docs.slice(0,10)
    })
  }

  if(req.method!=='POST') return json({error:'Method not allowed'},405)
  try{
    const body=await req.json()

    // Send admin digest email
    if(action==='send_digest'){
      if(!RESEND_API_KEY) return json({error:'Email not configured'},500)
      const dashRes=await fetch(req.url.replace('action=send_digest',''),{method:'GET',headers:req.headers})
      const dash=await dashRes.json()
      const html='<h2>Qivori Admin Digest</h2>'+
        '<p>Total AI Calls: '+dash.summary.totalCalls+'</p>'+
        '<p>Booked: '+dash.summary.bookedCalls+' ('+dash.summary.bookRate+'%)</p>'+
        '<p>Total Settled: $'+dash.summary.totalSettled+'</p>'+
        '<p>Pending Factoring: '+dash.summary.pendingFactoring+'</p>'
      await fetch('https://api.resend.com/emails',{
        method:'POST',headers:{Authorization:'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({from:'Qivori Admin <admin@qivori.com>',to:[ADMIN_EMAIL],subject:'Qivori Daily Digest - '+new Date().toLocaleDateString(),html})
      })
      return json({ok:true,sent_to:ADMIN_EMAIL})
    }

    // Alert on specific events
    if(action==='alert'){
      const{type,message,loadId}=body
      if(!RESEND_API_KEY) return json({error:'Email not configured'},500)
      await fetch('https://api.resend.com/emails',{
        method:'POST',headers:{Authorization:'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},
        body:JSON.stringify({from:'Qivori Alerts <alerts@qivori.com>',to:[ADMIN_EMAIL],subject:'[Qivori Alert] '+(type||'System')+' - '+(loadId||''),html:'<h3>'+type+'</h3><p>'+(message||'')+'</p><p>Load: '+(loadId||'N/A')+'</p><p>Time: '+new Date().toISOString()+'</p>'})
      })
      return json({ok:true})
    }
    return json({error:'Unknown action'},400)
  }catch(e){return json({error:e.message},500)}
}
