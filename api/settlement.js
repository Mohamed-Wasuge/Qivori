import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const RESEND_API_KEY = process.env.RESEND_API_KEY
function json(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json'}})}
const sb=()=>({apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json'})

export default async function handler(req){
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('[settlement] Missing SUPABASE_URL or SUPABASE_SERVICE_KEY env vars')
    return json({ error: 'Server configuration error' }, 500)
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  const url=new URL(req.url)
  const action=url.searchParams.get('action')

  // GET: Settlement history
  if(req.method==='GET'){
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
      const{loadId,invoiceId,amount,driverId,driverPayOverride}=body
      if(!loadId) return json({error:'loadId required'},400)
      const agreedRate=parseFloat(amount)||0

      // Fetch driver pay config if driverId provided
      let payModel='percent',payRate=28,driverPay=0,miles=0
      let driverRecord=null

      if(driverId){
        const dRes=await fetch(SUPABASE_URL+'/rest/v1/drivers?id=eq.'+driverId+'&select=id,full_name,email,pay_model,pay_rate&limit=1',{headers:sb()})
        const drivers=await dRes.json()
        if(Array.isArray(drivers)&&drivers.length>0) driverRecord=drivers[0]
      }

      if(driverRecord&&driverRecord.pay_model&&driverRecord.pay_rate){
        payModel=driverRecord.pay_model
        payRate=parseFloat(driverRecord.pay_rate)

        if(payModel==='percent'){
          driverPay=Math.round(agreedRate*(payRate/100)*100)/100
        }else if(payModel==='permile'){
          // Fetch load miles for per-mile calculation
          const lRes=await fetch(SUPABASE_URL+'/rest/v1/load_matches?id=eq.'+loadId+'&select=distance_miles&limit=1',{headers:sb()})
          const loads=await lRes.json()
          miles=(Array.isArray(loads)&&loads.length>0)?parseFloat(loads[0].distance_miles)||0:0
          driverPay=Math.round(miles*payRate*100)/100
        }else if(payModel==='flat'){
          driverPay=Math.round(payRate*100)/100
        }else{
          // Unknown pay model — fall back to percent
          payModel='percent'
          driverPay=Math.round(agreedRate*(payRate/100)*100)/100
        }
      }else if(driverPayOverride!=null){
        payModel='override'
        payRate=0
        driverPay=Math.round(parseFloat(driverPayOverride)*100)/100
      }else{
        // Default: 28% of agreed rate
        payModel='percent'
        payRate=28
        driverPay=Math.round(agreedRate*0.28*100)/100
      }

      const carrierProfit=Math.round((agreedRate-driverPay)*100)/100

      // Create settlement record
      await fetch(SUPABASE_URL+'/rest/v1/settlements',{
        method:'POST',headers:sb(),
        body:JSON.stringify({load_id:loadId,invoice_id:invoiceId||null,driver_id:driverId||null,driver_pay:driverPay,agreed_rate:agreedRate,carrier_profit:carrierProfit,pay_model:payModel,pay_rate:payRate,payment_received_at:new Date().toISOString(),status:'settled',owner_id:user.id})
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

      // Send driver notification email
      const driverEmail=body.driverEmail||(driverRecord&&driverRecord.email)
      const driverName=(driverRecord&&driverRecord.full_name)||'Driver'
      if(RESEND_API_KEY&&driverEmail){
        const payDesc=payModel==='percent'?payRate+'% of $'+agreedRate.toFixed(2):payModel==='permile'?miles+' mi × $'+payRate.toFixed(2)+'/mi':payModel==='flat'?'Flat rate':'Override'
        const emailHtml=`<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"><table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 20px"><tr><td align="center"><table width="600" cellpadding="0" cellspacing="0" style="background:#141414;border-radius:12px;overflow:hidden;border:1px solid #2a2a2a"><tr><td style="background:linear-gradient(135deg,#1a1a2e,#16213e);padding:32px 40px;text-align:center"><img src="https://qivori.com/logo-white.png" alt="Qivori" height="32" style="margin-bottom:8px"><p style="color:#c9a84c;font-size:13px;margin:0;letter-spacing:1px">SETTLEMENT NOTIFICATION</p></td></tr><tr><td style="padding:40px"><p style="color:#e0e0e0;font-size:16px;margin:0 0 24px">Hi ${driverName},</p><p style="color:#b0b0b0;font-size:15px;margin:0 0 32px;line-height:1.6">A payment has been processed and your settlement is ready. Here are the details:</p><table width="100%" cellpadding="0" cellspacing="0" style="background:#1a1a1a;border-radius:8px;border:1px solid #2a2a2a;margin-bottom:32px"><tr><td style="padding:20px 24px;border-bottom:1px solid #2a2a2a"><table width="100%"><tr><td style="color:#888;font-size:13px">Load Reference</td><td align="right" style="color:#e0e0e0;font-size:14px;font-family:monospace">${loadId.substring(0,8)}...</td></tr></table></td></tr><tr><td style="padding:20px 24px;border-bottom:1px solid #2a2a2a"><table width="100%"><tr><td style="color:#888;font-size:13px">Gross Rate</td><td align="right" style="color:#e0e0e0;font-size:14px">$${agreedRate.toFixed(2)}</td></tr></table></td></tr><tr><td style="padding:20px 24px;border-bottom:1px solid #2a2a2a"><table width="100%"><tr><td style="color:#888;font-size:13px">Pay Calculation</td><td align="right" style="color:#b0b0b0;font-size:13px">${payDesc}</td></tr></table></td></tr><tr><td style="padding:20px 24px"><table width="100%"><tr><td style="color:#c9a84c;font-size:14px;font-weight:600">YOUR PAY</td><td align="right" style="color:#c9a84c;font-size:22px;font-weight:700">$${driverPay.toFixed(2)}</td></tr></table></td></tr></table><p style="color:#666;font-size:13px;margin:0;line-height:1.5">If you have any questions about this settlement, please contact your dispatcher.</p></td></tr><tr><td style="padding:24px 40px;background:#0f0f0f;border-top:1px solid #2a2a2a;text-align:center"><p style="color:#555;font-size:12px;margin:0">Powered by <span style="color:#c9a84c">Qivori AI</span> &mdash; Autonomous Trucking Intelligence</p></td></tr></table></td></tr></table></body></html>`
        await fetch('https://api.resend.com/emails',{
          method:'POST',
          headers:{Authorization:'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},
          body:JSON.stringify({from:'Qivori <payments@qivori.com>',to:[driverEmail],subject:'Settlement Ready — $'+driverPay.toFixed(2)+' Payment',html:emailHtml})
        })
      }
      // ── Co-driver settlement (team drivers) ──
      const coDriverId = body.coDriverId
      let coDriverPay = 0
      if (coDriverId) {
        let coPayModel = 'percent', coPayRate = 28, coDriverRecord = null
        const cdRes = await fetch(SUPABASE_URL+'/rest/v1/drivers?id=eq.'+coDriverId+'&select=id,full_name,email,pay_model,pay_rate&limit=1',{headers:sb()})
        const coDrivers = await cdRes.json()
        if (Array.isArray(coDrivers) && coDrivers.length > 0) coDriverRecord = coDrivers[0]

        if (coDriverRecord?.pay_model && coDriverRecord?.pay_rate) {
          coPayModel = coDriverRecord.pay_model
          coPayRate = parseFloat(coDriverRecord.pay_rate)
          if (coPayModel === 'percent') coDriverPay = Math.round(agreedRate * (coPayRate / 100) * 100) / 100
          else if (coPayModel === 'permile') coDriverPay = Math.round(miles * coPayRate * 100) / 100
          else if (coPayModel === 'flat') coDriverPay = Math.round(coPayRate * 100) / 100
          else coDriverPay = Math.round(agreedRate * (coPayRate / 100) * 100) / 100
        } else {
          coPayModel = 'percent'
          coPayRate = 28
          coDriverPay = Math.round(agreedRate * 0.28 * 100) / 100
        }

        // Create co-driver settlement record
        await fetch(SUPABASE_URL+'/rest/v1/settlements',{
          method:'POST',headers:sb(),
          body:JSON.stringify({load_id:loadId,invoice_id:invoiceId||null,driver_id:coDriverId,driver_pay:coDriverPay,agreed_rate:agreedRate,carrier_profit:0,pay_model:coPayModel,pay_rate:coPayRate,co_driver_id:coDriverId,split_percent:100,payment_received_at:new Date().toISOString(),status:'settled',owner_id:user.id})
        })

        // Recalculate carrier profit with both drivers
        const totalDriverPay = driverPay + coDriverPay
        const adjustedCarrierProfit = Math.round((agreedRate - totalDriverPay) * 100) / 100

        // Update primary settlement carrier_profit
        // (already created above, but update with adjusted profit)

        // Email co-driver
        const coDriverEmail = coDriverRecord?.email
        const coDriverName = coDriverRecord?.full_name || 'Co-Driver'
        if (RESEND_API_KEY && coDriverEmail) {
          await fetch('https://api.resend.com/emails',{
            method:'POST',
            headers:{Authorization:'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},
            body:JSON.stringify({from:'Qivori <payments@qivori.com>',to:[coDriverEmail],subject:'Settlement Ready — $'+coDriverPay.toFixed(2)+' Payment (Team)',html:`<p>Hi ${coDriverName}, your co-driver settlement for $${coDriverPay.toFixed(2)} has been processed. Load: ${loadId.substring(0,8)}. Gross: $${agreedRate.toFixed(2)}.</p>`})
          }).catch(err => console.error('[settlement] Co-driver email failed:', err?.message))
        }

        return json({ok:true,loadId,agreedRate,driverPay,coDriverPay,totalDriverPay,carrierProfit:adjustedCarrierProfit,payModel,payRate,status:'settled',team:true})
      }

      return json({ok:true,loadId,agreedRate,driverPay,carrierProfit,payModel,payRate,status:'settled'})
    }

    // Batch settle multiple loads at once (100+ truck fleet support)
    if(action==='batch_settle'){
      const{items}=body // [{loadId, invoiceId, driverId, amount}, ...]
      if(!Array.isArray(items)||items.length===0) return json({error:'items array required'},400)
      if(items.length>200) return json({error:'Max 200 items per batch'},400)

      // Pre-fetch all unique drivers in one query
      const driverIds=[...new Set(items.map(i=>i.driverId).filter(Boolean))]
      const driverMap={}
      if(driverIds.length>0){
        const dRes=await fetch(SUPABASE_URL+'/rest/v1/drivers?id=in.('+driverIds.join(',')+')'+'&select=id,full_name,email,pay_model,pay_rate',{headers:sb()})
        const driverRows=await dRes.json()
        if(Array.isArray(driverRows)) driverRows.forEach(d=>{driverMap[d.id]=d})
      }

      // Process all settlements in parallel batches of 20
      const results=[]
      const batchSize=20
      for(let i=0;i<items.length;i+=batchSize){
        const batch=items.slice(i,i+batchSize)
        const batchResults=await Promise.allSettled(batch.map(async(item)=>{
          const agreedRate=parseFloat(item.amount)||0
          const driverRecord=driverMap[item.driverId]||null
          let payModel='percent',payRate=28,driverPay=0

          if(driverRecord?.pay_model&&driverRecord?.pay_rate){
            payModel=driverRecord.pay_model
            payRate=parseFloat(driverRecord.pay_rate)
            if(payModel==='percent') driverPay=Math.round(agreedRate*(payRate/100)*100)/100
            else if(payModel==='permile'){
              const lRes=await fetch(SUPABASE_URL+'/rest/v1/loads?id=eq.'+item.loadId+'&select=miles&limit=1',{headers:sb()})
              const ld=await lRes.json()
              const miles=(Array.isArray(ld)&&ld[0])?parseFloat(ld[0].miles)||0:0
              driverPay=Math.round(miles*payRate*100)/100
            }else if(payModel==='flat') driverPay=Math.round(payRate*100)/100
            else driverPay=Math.round(agreedRate*0.28*100)/100
          }else{
            driverPay=Math.round(agreedRate*0.28*100)/100
          }
          const carrierProfit=Math.round((agreedRate-driverPay)*100)/100

          // Create settlement record
          await fetch(SUPABASE_URL+'/rest/v1/settlements',{
            method:'POST',headers:sb(),
            body:JSON.stringify({load_id:item.loadId,invoice_id:item.invoiceId||null,driver_id:item.driverId||null,driver_pay:driverPay,agreed_rate:agreedRate,carrier_profit:carrierProfit,pay_model:payModel,pay_rate:payRate,payment_received_at:new Date().toISOString(),status:'settled',owner_id:user.id})
          })
          // Update invoice
          if(item.invoiceId){
            await fetch(SUPABASE_URL+'/rest/v1/invoices?id=eq.'+item.invoiceId,{
              method:'PATCH',headers:sb(),body:JSON.stringify({status:'paid',paid_at:new Date().toISOString()})
            })
          }
          return{loadId:item.loadId,driverPay,carrierProfit,status:'settled'}
        }))
        batchResults.forEach((r,idx)=>{
          if(r.status==='fulfilled') results.push(r.value)
          else results.push({loadId:batch[idx].loadId,error:r.reason?.message||'Failed',status:'failed'})
        })
      }
      const settled=results.filter(r=>r.status==='settled')
      const failed=results.filter(r=>r.status==='failed')
      return json({ok:true,total:items.length,settled:settled.length,failed:failed.length,results})
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
      return json({report:{period:{startDate,endDate},loads:data.length,totalRevenue,totalDriverPay,carrierProfit:totalRevenue-totalDriverPay,settlements:data}})
    }
    return json({error:'Unknown action'},400)
  }catch(e){return json({error:e.message},500)}
}
