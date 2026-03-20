/**
 * AI Caller Agent — Initiates Twilio outbound calls to brokers
 * Triggered by driver tapping "Book It" or "Call the broker"
 * Uses Twilio REST API to place call, connects to call-handler.js for AI conversation
 * LOCKED TO: Autopilot AI plan ($799/month) only
 * Runtime: Vercel Edge
 */

export const config = { runtime: 'edge' };

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

function isAuthorized(req) {
  const auth = req.headers.get('authorization')?.replace('Bearer ', '');
  return auth === process.env.CRON_SECRET || auth === supabaseKey;
}

// — Supabase helpers —
async function supabaseQuery(table, query = '') {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  return res.json();
}

async function supabaseInsert(table, data) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function supabaseUpdate(table, id, data) {
  await fetch(`${supabaseUrl}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
}

// — Check if user has active subscription —
async function checkPlanAccess(userId) {
  if (!userId) return { allowed: false, reason: 'No user ID' };
  const users = await supabaseQuery('profiles', `id=eq.${userId}&select=plan,subscription_status`);
  const user = users?.[0];
  if (!user) return { allowed: false, reason: 'User not found' };
  const validPlans = ['autonomous_fleet', 'autopilot_ai', 'truck_autopilot_ai'];
  if (!validPlans.includes(user.plan)) {
    return { allowed: false, reason: 'AI Broker Calling requires an active Qivori subscription. Start your free trial to unlock.' };
  }
  if (user.subscription_status !== 'active' && user.subscription_status !== 'trialing') {
    return { allowed: false, reason: 'Subscription is not active' };
  }
  return { allowed: true };
}

// — Initiate Twilio outbound call —
async function initiateCall(brokerPhone, callbackUrl, loadData) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!sid || !token || !from) {
    throw new Error('Twilio credentials not configured');
  }

  // Normalize phone number
  let phone = brokerPhone.replace(/[^\d+]/g, '');
  if (/^\d{10}$/.test(phone)) phone = '+1' + phone;
  if (/^1\d{10}$/.test(phone)) phone = '+' + phone;

  // Build TwiML callback URL with load context
  const params = new URLSearchParams({
    loadId: loadData.load_id || loadData.id || '',
    origin: loadData.origin || '',
    destination: loadData.destination || '',
    rate: String(loadData.rate || ''),
    equipment: loadData.equipment_type || 'dry van',
    carrierName: loadData.carrier_name || 'our carrier',
    carrierMC: loadData.carrier_mc || '',
    carrierDOT: loadData.carrier_dot || '',
    csaScore: loadData.csa_score || 'satisfactory',
    pickupDate: loadData.pickup_date || 'tomorrow morning',
    userId: loadData.user_id || '',
  });

  const twimlUrl = `${callbackUrl}?stage=greeting&${params.toString()}`;

  // Twilio REST API — Create call
  const body = new URLSearchParams({
    To: phone,
    From: from,
    Url: twimlUrl,
    Record: 'true',
    RecordingStatusCallback: `${callbackUrl}?stage=recording_done`,
    RecordingStatusCallbackMethod: 'POST',
    StatusCallback: `${callbackUrl}?stage=call_status`,
    StatusCallbackMethod: 'POST',
    StatusCallbackEvent: 'initiated ringing answered completed',
    MachineDetection: 'DetectMessageEnd',
    AsyncAmd: 'true',
    AsyncAmdStatusCallback: `${callbackUrl}?stage=amd_result`,
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${sid}:${token}`),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  const result = await res.json();

  if (!res.ok) {
    throw new Error(`Twilio error: ${result.message || result.code || 'Unknown'}`);
  }

  return result;
}

// — Main handler —
export default async function handler(req) {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
      }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = await req.json();
    const { loadId, userId, brokerPhone, loadData, batchLoads } = body;

    // — Handle batch calls from load-finder (service-to-service) —
    if (batchLoads && Array.isArray(batchLoads) && isAuthorized(req)) {
      const results = [];
      for (const bl of batchLoads.slice(0, 5)) { // max 5 calls per batch
        try {
          if (!bl.broker_phone) continue;
          const origin = new URL(req.url).origin;
          const callbackUrl = `${origin}/api/call-handler`;
          const callResult = await initiateCall(bl.broker_phone, callbackUrl, bl);
          await supabaseInsert('call_logs', {
            twilio_call_sid: callResult.sid,
            load_id: bl.load_id || bl.id || null,
            user_id: bl.user_id || null,
            broker_phone: bl.broker_phone,
            broker_name: bl.broker_name || 'Unknown',
            call_status: 'initiated',
            notes: JSON.stringify({
              source: 'load_finder',
              origin: bl.origin || `${bl.origin_city || ''}, ${bl.origin_state || ''}`,
              destination: bl.destination || `${bl.destination_city || ''}, ${bl.destination_state || ''}`,
              rate: bl.rate || 0,
              match_score: bl.match_score,
              equipment: bl.equipment_type,
            }),
          });
          results.push({ loadId: bl.load_id || bl.id, callSid: callResult.sid, status: 'initiated' });
        } catch (e) {
          results.push({ loadId: bl.load_id || bl.id, error: e.message });
        }
      }
      return Response.json({ ok: true, batch: true, results }, { headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    // — Plan gating for user-initiated calls —
    if (userId) {
      const access = await checkPlanAccess(userId);
      if (!access.allowed) {
        return Response.json({ ok: false, error: access.reason, planRequired: 'autonomous_fleet' }, {
          status: 403,
          headers: { 'Access-Control-Allow-Origin': '*' }
        });
      }
    } else if (!isAuthorized(req)) {
      return new Response('Unauthorized', { status: 401 });
    }

    // — Validate required data —
    if (!brokerPhone && !loadData?.broker_phone) {
      return Response.json({ ok: false, error: 'Broker phone number required' }, {
        status: 400, headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    const phone = brokerPhone || loadData.broker_phone;
    const origin = new URL(req.url).origin;
    const callbackUrl = `${origin}/api/call-handler`;

    // — Get load details if loadId provided —
    let load = loadData || {};
    if (loadId && !loadData) {
      const loads = await supabaseQuery('loads', `id=eq.${loadId}&limit=1`);
      if (loads?.[0]) load = loads[0];
    }

    // — Get carrier info for the driver —
    if (userId) {
      const carriers = await supabaseQuery('carriers', `user_id=eq.${userId}&limit=1`);
      if (carriers?.[0]) {
        load.carrier_name = carriers[0].company_name || carriers[0].name;
        load.carrier_mc = carriers[0].mc_number;
        load.carrier_dot = carriers[0].dot_number;
        load.csa_score = carriers[0].csa_score || 'satisfactory';
      }
    }

    // — Initiate the Twilio call —
    const callResult = await initiateCall(phone, callbackUrl, load);

    // — Log the call —
    const callLog = {
      twilio_call_sid: callResult.sid,
      load_id: loadId || load.id || null,
      user_id: userId || null,
      broker_phone: phone,
      broker_name: load.broker_name || 'Unknown',
      call_status: 'initiated',
      notes: JSON.stringify({
        origin: load.origin || `${load.origin_city || ''}, ${load.origin_state || ''}`,
        destination: load.destination || `${load.destination_city || ''}, ${load.destination_state || ''}`,
        rate: load.rate || 0,
        equipment: load.equipment_type,
        carrier_name: load.carrier_name,
        carrier_mc: load.carrier_mc,
        pickup_date: load.pickup_date
      }),
    };

    await supabaseInsert('call_logs', callLog);

    return Response.json({
      ok: true,
      message: 'AI is calling the broker now...',
      callSid: callResult.sid,
      status: callResult.status,
      brokerPhone: phone
    }, { headers: { 'Access-Control-Allow-Origin': '*' } });

  } catch (error) {
    console.error('AI Caller error:', error);
    return Response.json({ ok: false, error: error.message }, {
      status: 500, headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
}
