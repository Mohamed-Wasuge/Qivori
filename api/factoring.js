import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
function json(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json',...corsHeaders({headers:{get:()=>null}})}})}
const sb=()=>({apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json'})
const FACTORING_COMPANIES=[{name:'OTR Solutions',email:'submissions@otrsolutions.com'},{name:'RTS Financial',email:'submissions@rtsinc.com'},{name:'Triumph Business Capital',email:'submissions@triumphpay.com'},{name:'TCI Business Capital',email:'submissions@tcicapital.com'},{name:'Riviera Finance',email:'submissions@rivierafinance.com'}]

export default async function handler(req){
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  const url=new URL(req.url)
  const action=url.searchParams.get('action')

  // GET: settings + dashboard + submissions
  if(req.method==='GET'){
    const[settingsRes,subsRes]=await Promise.all([
      fetch(SUPABASE_URL+'/rest/v1/factoring_settings?user_id=eq.'+user.id+'&limit=1',{headers:sb()}),
      fetch(SUPABASE_URL+'/rest/v1/factoring_submissions?user_id=eq.'+user.id+'&order=created_at.desc&limit=50',{headers:sb()})
    ])
    const settings=(await settingsRes.json())[0]||{use_factoring:true,factoring_company:'',factoring_email:''}
    const submissions=await subsRes.json()
    const thisMonth=submissions.filter(s=>{const d=new Date(s.created_at);const n=new Date();return d.getMonth()===n.getMonth()&&d.getFullYear()===n.getFullYear()})
    const totalFactored=thisMonth.reduce((s,i)=>s+(parseFloat(i.invoice_amount)||0),0)
    const paid=submissions.filter(s=>s.status==='paid')
    const avgDays=paid.length?Math.round(paid.reduce((s,i)=>{const sub=new Date(i.submitted_at);const pay=new Date(i.paid_at);return s+(pay-sub)/(1000*60*60*24)},0)/paid.length):0
    return json({settings,companies:FACTORING_COMPANIES,dashboard:{totalFactoredThisMonth:totalFactored,avgDaysToPayment:avgDays,submitted:submissions.filter(s=>s.status==='submitted').length,approved:submissions.filter(s=>s.status==='approved').length,paid:paid.length},submissions})
  }

  if(req.method!=='POST') return json({error:'Method not allowed'},405)
  try{
    const body=await req.json()

    if(action==='save_settings'){
      const{factoring_company,factoring_email,factoring_phone,is_custom,use_factoring}=body
      await fetch(SUPABASE_URL+'/rest/v1/factoring_settings',{
        method:'POST',headers:{...sb(),Prefer:'resolution=merge-duplicates'},
        body:JSON.stringify({user_id:user.id,factoring_company,factoring_email:factoring_email||FACTORING_COMPANIES.find(c=>c.name===factoring_company)?.email||'',factoring_phone,is_custom:is_custom||false,use_factoring:use_factoring!==false,updated_at:new Date().toISOString()})
      })
      return json({ok:true})
    }

    if(action==='submit_to_factoring'){
      const{loadId,invoiceAmount,brokerName}=body
      if(!loadId||!invoiceAmount) return json({error:'loadId and invoiceAmount required'},400)
      const sRes=await fetch(SUPABASE_URL+'/rest/v1/factoring_settings?user_id=eq.'+user.id+'&limit=1',{headers:sb()})
      const settings=(await sRes.json())[0]
      if(!settings||!settings.factoring_email) return json({error:'No factoring company configured'},400)

      // Email invoice to factoring company
      if(RESEND_API_KEY){
        await fetch('https://api.resend.com/emails',{
          method:'POST',headers:{Authorization:'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},
          body:JSON.stringify({from:'Qivori <billing@qivori.com>',to:[settings.factoring_email],subject:'Invoice Submission - Load '+loadId+' - $'+invoiceAmount,html:'<h2>Invoice Submission</h2><p>Load: '+loadId+'</p><p>Broker: '+(brokerName||'N/A')+'</p><p>Amount: $'+invoiceAmount+'</p><p>Submitted by Qivori on behalf of carrier.</p>'})
        })
      }
      await fetch(SUPABASE_URL+'/rest/v1/factoring_submissions',{
        method:'POST',headers:sb(),
        body:JSON.stringify({user_id:user.id,load_id:loadId,factoring_company:settings.factoring_company,factoring_email:settings.factoring_email,invoice_amount:invoiceAmount,status:'submitted',submitted_at:new Date().toISOString()})
      })
      return json({ok:true,submitted_to:settings.factoring_company})
    }

    if(action==='update_status'){
      const{submissionId,status}=body
      if(!submissionId||!status) return json({error:'submissionId and status required'},400)
      const updates={status}
      if(status==='approved') updates.approved_at=new Date().toISOString()
      if(status==='paid') updates.paid_at=new Date().toISOString()
      await fetch(SUPABASE_URL+'/rest/v1/factoring_submissions?id=eq.'+submissionId,{method:'PATCH',headers:sb(),body:JSON.stringify(updates)})
      return json({ok:true})
    }
    return json({error:'Unknown action'},400)
  }catch(e){return json({error:e.message},500)}
}
