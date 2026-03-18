export const config = { runtime: 'edge' }
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
function json(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json'}})}
const sb=()=>({apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json'})

export default async function handler(req){
  const url=new URL(req.url)
  const action=url.searchParams.get('action')

  // GET: Settlement history
  if(req.method==='GET'){
    const authHeader=req.headers.get('authorization')
    if(!authHeader) return json({error:'Unauthorized'},401)
    const token=authHeader.replace('Bearer ','')
    const userRes=await fetch(SUPABASE_URL+'/auth/v1/user',{headers:{apikey:SUPABASE_KEY,Authorization:'Bearer '+token}})
    if(!userRes.ok) return json({error:'Invalid token'},401)
    const user=await userRes.json()
    const r=await fetch(SUPABASE_URL+'/rest/v1/settlements?user_id=eq.'+user.id+'&order=created_at.desc&limit=50',{headers:sb()})
    const settlements=await r.json()
    const total=settlements.reduce((s,i)=>s+(parseFloat(i.agreed_rate)||0),0)
    const pending=settlements.filter(i=>i.status==='pending').length
    return json({settlements,summary:{total,pending,count:settlements.length}})
  }

  if(req.method!=='POST') return json({error:'Method not allowed'},405)
  try{
    const body=await req.json()

    // Payment received — mark as settled
    if(action==='payment_received'){
      const{loadId,invoiceId,amount}=body
      if(!loadId) return json({error:'loadId required'},400)
      const agreedRate=parseFloat(amount)||0
      const driverPay=Math.round(agreedRate*0.90*100)/100
      const qivoriFee=Math.round(agreedRate*0.10*100)/100

      // Create settlement record
      await fetch(SUPABASE_URL+'/rest/v1/settlements',{
        method:'POST',headers:sb(),
        body:JSON.stringify({load_id:loadId,invoice_id:invoiceId||null,driver_pay:driverPay,agreed_rate:agreedRate,payment_received_at:new Date().toISOString(),status:'settled'})
      })

      // Update load status
      await fetch(SUPABASE_URL+'/rest/v1/load_matches?id=eq.'+loadId,{
        method:'PATCH',headers:sb(),body:JSON.stringify({status:'settled'})
      })

      // Update invoice status
      if(invoiceId){
        await fetch(SUPABASE_URL+'/rest/v1/invoices?id=eq.'+invoiceId,{
          method:'PATCH',headers:sb(),body:JSON.stringify({status:'paid',paid_at:new Date().toISOString()})
        })
      }

      // Send driver notification
      if(RESEND_API_KEY&&body.driverEmail){
        await fetch('https://api.resend.com/emails',{
          method:'POST',
          headers:{Authorization:'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},
          body:JSON.stringify({from:'Qivori <payments@qivori.com>',to:[body.driverEmail],subject:'Payment Received - $'+agreedRate,html:'<h2>Payment Received</h2><p>Load: '+loadId+'</p><p>Amount: $'+agreedRate+'</p><p>Driver Pay: $'+driverPay+'</p><p>Qivori Fee: $'+qivoriFee+'</p>'})
        })
      }
      return json({ok:true,loadId,agreedRate,driverPay,qivoriFee,status:'settled'})
    }

    // Generate settlement report
    if(action==='generate_report'){
      const{startDate,endDate}=body
      let query=SUPABASE_URL+'/rest/v1/settlements?status=eq.settled&order=created_at.desc'
      if(startDate) query+='&created_at=gte.'+startDate
      if(endDate) query+='&created_at=lte.'+endDate
      const r=await fetch(query,{headers:sb()})
      const data=await r.json()
      const totalRevenue=data.reduce((s,i)=>s+(parseFloat(i.agreed_rate)||0),0)
      const totalDriverPay=data.reduce((s,i)=>s+(parseFloat(i.driver_pay)||0),0)
      return json({report:{period:{startDate,endDate},loads:data.length,totalRevenue,totalDriverPay,qivoriFees:totalRevenue-totalDriverPay,settlements:data}})
    }
    return json({error:'Unknown action'},400)
  }catch(e){return json({error:e.message},500)}
}
