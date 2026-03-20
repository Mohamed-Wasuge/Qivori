export const config = { runtime: 'edge' }
const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY
const RETELL_API_KEY = process.env.RETELL_API_KEY
const CRON_SECRET = process.env.CRON_SECRET
function json(d,s=200){return new Response(JSON.stringify(d),{status:s,headers:{'Content-Type':'application/json'}})}
const sb=()=>({apikey:SUPABASE_KEY,Authorization:'Bearer '+SUPABASE_KEY,'Content-Type':'application/json'})

function isAuthorized(req){const a=req.headers.get('authorization');return a==='Bearer '+CRON_SECRET||a==='Bearer '+SUPABASE_KEY}

export default async function handler(req){
  const url=new URL(req.url)
  const action=url.searchParams.get('action')

  // GET: list check calls for a load
  if(req.method==='GET'){
    const loadId=url.searchParams.get('loadId')
    if(!loadId) return json({error:'loadId required'},400)
    const r=await fetch(SUPABASE_URL+'/rest/v1/check_calls?load_id=eq.'+loadId+'&order=scheduled_at.asc',{headers:sb()})
    return json(await r.json())
  }

  if(req.method!=='POST') return json({error:'Method not allowed'},405)

  try{
    const body=await req.json().catch(()=>({}))

    // Cron: execute pending check calls
    if(action==='cron'||!action){
      if(!isAuthorized(req)) return json({error:'Unauthorized'},401)
      const now=new Date().toISOString()
      const r=await fetch(SUPABASE_URL+'/rest/v1/check_calls?call_status=eq.scheduled&scheduled_at=lte.'+now+'&limit=10',{headers:sb()})
      const pending=await r.json()
      let executed=0
      for(const call of pending){
        try{
          const script=call.call_type==='pickup_check'
            ?'Hi this is Alex from Qivori Dispatch. Calling to confirm '+call.carrier_name+' picked up load and is en route to '+call.destination+'. Current ETA is '+call.eta+'. Any questions?'
            :'Hi this is Alex from Qivori. '+call.carrier_name+' is approximately 2 hours from delivery. ETA '+(call.eta||'on schedule')+'. Delivery on schedule.'
          if(RETELL_API_KEY){
            const retellRes=await fetch('https://api.retellai.com/v2/create-phone-call',{
              method:'POST',headers:{Authorization:'Bearer '+RETELL_API_KEY,'Content-Type':'application/json'},
              body:JSON.stringify({agent_id:process.env.RETELL_AGENT_ID||'check_call_agent',from_number:process.env.TWILIO_PHONE_NUMBER||process.env.TWILIO_FROM_NUMBER,to_number:call.broker_phone,metadata:{call_type:'check_call',loadId:call.load_id},retell_llm_dynamic_variables:{call_script:script}})
            })
            if(retellRes.ok){const d=await retellRes.json();call.retell_call_id=d.call_id}
          }
          await fetch(SUPABASE_URL+'/rest/v1/check_calls?id=eq.'+call.id,{
            method:'PATCH',headers:sb(),
            body:JSON.stringify({call_status:'in_progress',retell_call_id:call.retell_call_id||null})
          })
          executed++
        }catch(e){console.error('Check call failed:',e)}
      }
      return json({ok:true,pending:pending.length,executed})
    }

    // Schedule a check call
    if(action==='schedule'){
      const{loadId,callType,brokerPhone,brokerName,carrierName,eta,destination,scheduledAt}=body
      if(!loadId||!callType) return json({error:'loadId and callType required'},400)
      const r=await fetch(SUPABASE_URL+'/rest/v1/check_calls',{
        method:'POST',headers:{...sb(),Prefer:'return=representation'},
        body:JSON.stringify({load_id:loadId,call_type:callType,broker_phone:brokerPhone,broker_name:brokerName,carrier_name:carrierName,eta,destination,call_status:'scheduled',scheduled_at:scheduledAt||new Date(Date.now()+2*60*60*1000).toISOString()})
      })
      return json(await r.json())
    }

    return json({error:'Unknown action'},400)
  }catch(e){return json({error:e.message},500)}
}
