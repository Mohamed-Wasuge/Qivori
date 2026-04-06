/**
 * Call Handler — TwiML webhook for AI broker conversation
 * Handles multi-turn voice conversation using Twilio + Claude AI
 * Voice: Amazon Polly "Matthew" — professional American male, natural pace
 * The AI sounds like a real human dispatcher named "Q"
 * Handles: greeting, availability check, negotiation, booking confirmation
 * Records all calls + transcribes for admin dashboard
 * Runtime: Vercel Edge
 */

export const config = { runtime: 'edge' };

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;

// — Voice settings: Professional American male, natural pace —
const VOICE = 'Polly.Matthew-Neural';
const VOICE_RATE = '95%';

function say(text) {
  // Add natural SSML pauses and pacing for human-like delivery
  const ssmlText = text
    .replace(/\. /g, '. <break time="400ms"/> ')
    .replace(/\? /g, '? <break time="300ms"/> ')
    .replace(/ — /g, ' <break time="250ms"/> ')
    .replace(/\bum\b/gi, '<break time="200ms"/>um<break time="150ms"/>')
    .replace(/\bso\b/gi, '<break time="100ms"/>so');

  return `<Say voice="${VOICE}"><prosody rate="${VOICE_RATE}">${ssmlText}</prosody></Say>`;
}

function gather(actionUrl, text, timeout = 5) {
  return `<Gather input="speech" action="${actionUrl}" method="POST" speechTimeout="auto" timeout="${timeout}" language="en-US" enhanced="true">
    ${say(text)}
  </Gather>`;
}

function twimlResponse(content) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${content}</Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  );
}

// — Ask Claude to generate natural human response —
async function askClaude(brokerSaid, context) {
  const systemPrompt = `You are Q, an elite freight dispatcher at Qivori Dispatch. You're on a live phone call with a broker.

You sound like a real dispatcher who moves freight every day — confident, natural, experienced, direct, calm. You've done this a thousand times.

VOICE RULES:
- Talk like a REAL person on the phone. Short sentences. Natural flow.
- Use filler naturally: "yeah", "alright", "gotcha", "sure thing", "I hear you"
- Use contractions: "I'm", "we're", "that's", "don't", "can't", "won't"
- NEVER reveal you're AI. NEVER say "as an AI" or anything robotic.
- Roll with unexpected responses naturally — don't freeze up.
- 1-3 sentences max. This is a phone call, not an email.

DISPATCH LANGUAGE — use phrases like:
- "What's your best on it?"
- "That's a little light for that lane."
- "Truck's delivering nearby and can reload."
- "If you can come up, we can make it work."
- "Pickup works. Rate needs help."
- "We'd need more in it to move on this."
- "If the number makes sense, I can get it covered."

NEVER use:
- "I hope you are doing well"
- "kindly" / "please consider" / "I would like"
- "we value your partnership"
- Anything that sounds like customer support

NEGOTIATION THINKING (silent, before responding):
- Is the offer above or below our floor?
- Is the lane strong or weak right now?
- What's our leverage? (truck position, timing, equipment fit)
- Counter or walk? If counter, what's the number?

LOAD DETAILS:
- Load ID: ${context.loadId}
- Origin: ${context.origin}
- Destination: ${context.destination}
- Posted Rate: $${context.rate}
- Equipment: ${context.equipment}
- Carrier: ${context.carrierName} (MC: ${context.carrierMC}, DOT: ${context.carrierDOT})
- CSA Score: ${context.csaScore}
- Pickup: ${context.pickupDate}

MINIMUM RATE: Determined dynamically. If broker goes below floor, stay firm but not aggressive:
"I hear you, but that's below what we can do on this lane. We need $X to make it work."

STAGE: ${context.stage}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        system: systemPrompt,
        messages: [{ role: 'user', content: `The broker just said: "${brokerSaid}"\n\nRespond naturally as Q the dispatcher. Keep it short and conversational.` }]
      })
    });

    const data = await res.json();
    return data.content?.[0]?.text || "Sorry, I didn't catch that. Could you say that again?";
  } catch (e) {
    console.error('Claude error:', e);
    return "Hey sorry, I'm having a bit of trouble hearing you. Can you repeat that?";
  }
}

// — Broker urgency extraction from call transcripts —
const URGENCY_PATTERNS = [
  { pattern: /willing to (increase|come up|go higher|bump|raise)/i, signal: 'willing to increase rate' },
  { pattern: /(need.*(covered|picked up|moved).*(today|asap|immediately|now))/i, signal: 'deadline pressure' },
  { pattern: /(urgent|asap|emergency|critical|time.?sensitive)/i, signal: 'deadline pressure' },
  { pattern: /(repost|posted.*again|put.*(back|again).*board)/i, signal: 'reposted load multiple times' },
  { pattern: /(other carrier|another carrier|someone else|shopping)/i, signal: 'mentioned other carriers' },
  { pattern: /(take it|book it|let'?s do it|deal|sounds good|works for me)/i, signal: 'quick acceptance' },
  { pattern: /(flexible|negotiable|work with you|meet.*middle)/i, signal: 'flexible on rate' },
  { pattern: /(call.*(back|again)|follow.?up|reaching out again)/i, signal: 'multiple callbacks' },
  { pattern: /(pickup today|deliver.*(today|tomorrow morning))/i, signal: 'pickup today' },
];

function extractUrgencyFromTranscript(transcriptText) {
  if (!transcriptText) return [];
  const detected = [];
  for (const { pattern, signal } of URGENCY_PATTERNS) {
    if (pattern.test(transcriptText) && !detected.includes(signal)) {
      detected.push(signal);
    }
  }
  return detected;
}

const SIGNAL_SCORES = {
  'willing to increase rate': 15, 'deadline pressure': 20, 'reposted load multiple times': 25,
  'mentioned other carriers': 10, 'quick acceptance': 15, 'flexible on rate': 15,
  'multiple callbacks': 15, 'pickup today': 20,
};

function scoreUrgencySignals(signals) {
  let total = 0;
  for (const s of signals) {
    total += SIGNAL_SCORES[s] || 5;
  }
  return Math.min(total, 100);
}

async function updateBrokerUrgency(userId, brokerName, transcriptText) {
  if (!userId || !brokerName || !supabaseUrl || !supabaseKey) return;
  try {
    const signals = extractUrgencyFromTranscript(transcriptText);
    if (signals.length === 0) return;

    const newScore = scoreUrgencySignals(signals);

    // Fetch existing
    let existingScore = 50, existingCallCount = 0, existingSignals = [];
    const res = await fetch(
      `${supabaseUrl}/rest/v1/broker_urgency_scores?owner_id=eq.${userId}&broker_name=eq.${encodeURIComponent(brokerName)}&select=*&limit=1`,
      { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
    );
    if (res.ok) {
      const rows = await res.json();
      if (rows?.[0]) {
        existingScore = rows[0].urgency_score || 50;
        existingCallCount = rows[0].call_count || 0;
        existingSignals = rows[0].signals || [];
      }
    }

    const finalScore = Math.round(newScore * 0.6 + existingScore * 0.4);
    const mergedSignals = [...new Set([...existingSignals, ...signals])].slice(-20);

    await fetch(`${supabaseUrl}/rest/v1/broker_urgency_scores`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify({
        owner_id: userId,
        broker_name: brokerName,
        urgency_score: Math.min(finalScore, 100),
        signals: mergedSignals,
        call_count: existingCallCount + 1,
        last_call_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
    });
  } catch {}
}

// — Supabase helpers —
async function supabaseUpdate(table, query, data) {
  await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
}

async function supabaseInsert(table, data) {
  await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
}

// — Parse form body from Twilio POST —
async function parseForm(req) {
  const text = await req.text();
  const params = new URLSearchParams(text);
  const obj = {};
  for (const [key, val] of params) obj[key] = val;
  return obj;
}

// — Fetch user's negotiation settings —
async function getNegotiationSettings(userId) {
  if (!userId || !supabaseUrl || !supabaseKey) return null;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/negotiation_settings?user_id=eq.${userId}&limit=1`, {
      headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
    });
    const data = await res.json();
    return data?.[0] || null;
  } catch { return null; }
}

// — Main handler —
export default async function handler(req) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  const url = new URL(req.url);
  const stage = url.searchParams.get('stage') || 'greeting';

  // Load context from URL params
  const context = {
    loadId: url.searchParams.get('loadId') || '',
    origin: url.searchParams.get('origin') || '',
    destination: url.searchParams.get('destination') || '',
    rate: url.searchParams.get('rate') || '0',
    equipment: url.searchParams.get('equipment') || 'dry van',
    carrierName: url.searchParams.get('carrierName') || 'our carrier',
    carrierMC: url.searchParams.get('carrierMC') || '',
    carrierDOT: url.searchParams.get('carrierDOT') || '',
    csaScore: url.searchParams.get('csaScore') || 'satisfactory',
    pickupDate: url.searchParams.get('pickupDate') || 'tomorrow morning',
    userId: url.searchParams.get('userId') || '',
    stage: stage
  };

  // Always use www — Vercel redirects non-www, breaking Twilio POST requests
  const baseUrl = `https://www.qivori.com/api/call-handler`;
  const contextParams = new URLSearchParams(context).toString();

  // — Handle different conversation stages —
  switch (stage) {

    // INBOUND: Unknown caller greeted by Q — handle their response
    case 'inbound_greeting': {
      const form = await parseForm(req);
      const callerSaid = form.SpeechResult || '';
      const callSid = form.CallSid || '';
      const lower = callerSaid.toLowerCase();

      // If they mention a load, route, or want to talk about freight
      if (lower.includes('load') || lower.includes('freight') || lower.includes('truck') || lower.includes('dispatch') || lower.includes('driver')) {
        const response = `Got it. Can you give me the origin and destination, or a load number, and I'll pull it up for you?`;
        const nextUrl = `${baseUrl}?stage=inbound_greeting&${contextParams}`;
        return twimlResponse(gather(nextUrl, response, 10) + say("No worries. Call back anytime. Have a good one.") + '<Hangup/>');
      }

      // Generic helpful response
      const response = `I appreciate you calling in. I'm Q, the AI dispatcher for Qivori. I can help with load status, dispatch, or connect you with the right carrier. What do you need?`;
      const nextUrl = `${baseUrl}?stage=inbound_greeting&${contextParams}`;
      return twimlResponse(
        gather(nextUrl, response, 10)
        + say("Alright, feel free to call back anytime. Have a good one.")
        + '<Hangup/>'
      );
    }

    // STAGE 1: Greeting when broker answers
    case 'greeting': {
      const greeting = `Hi, this is Q calling from Qivori Dispatch on behalf of ${context.carrierName}. I'm calling about load number ${context.loadId} from ${context.origin} to ${context.destination}. Is that load still available?`;

      const nextUrl = `${baseUrl}?stage=availability&${contextParams}`;
      return twimlResponse(gather(nextUrl, greeting, 8));
    }

    // STAGE 2: Handle availability response
    case 'availability': {
      const form = await parseForm(req);
      const brokerSaid = form.SpeechResult || '';
      const callSid = form.CallSid || '';

      // Log the speech
      await supabaseInsert('call_transcripts', {
        call_sid: callSid, speaker: 'broker', text: brokerSaid, stage: 'availability', created_at: new Date().toISOString()
      });

      const lower = brokerSaid.toLowerCase();

      // Detect if load is available
      if (lower.includes('yes') || lower.includes('available') || lower.includes('still got') || lower.includes('yeah') || lower.includes('sure') || lower.includes('it is')) {
        const pitch = `Great — my carrier is running ${context.equipment}, fully insured, ${context.csaScore} CSA score. They're available for pickup ${context.pickupDate}. The posted rate is $${context.rate} — can we confirm at that rate?`;

        await supabaseInsert('call_transcripts', {
          call_sid: callSid, speaker: 'ai_q', text: pitch, stage: 'availability', created_at: new Date().toISOString()
        });

        const nextUrl = `${baseUrl}?stage=negotiation&${contextParams}`;
        return twimlResponse(gather(nextUrl, pitch, 8));

      } else if (lower.includes('no') || lower.includes('taken') || lower.includes('covered') || lower.includes('booked') || lower.includes('gone')) {
        const response = "Ah gotcha, no worries. Appreciate your time. If anything else opens up on that lane, give us a call. Have a good one.";

        await supabaseInsert('call_transcripts', {
          call_sid: callSid, speaker: 'ai_q', text: response, stage: 'unavailable', created_at: new Date().toISOString()
        });
        await supabaseUpdate('call_logs', `twilio_call_sid=eq.${callSid}`, { call_status: 'load_unavailable', ended_at: new Date().toISOString() });

        return twimlResponse(`${say(response)}<Hangup/>`);
      } else {
        // Unclear response — use Claude to handle naturally
        context.stage = 'availability_clarify';
        const aiResponse = await askClaude(brokerSaid, context);
        const nextUrl = `${baseUrl}?stage=availability&${contextParams}`;
        return twimlResponse(gather(nextUrl, aiResponse, 8));
      }
    }

    // STAGE 3: Negotiation
    case 'negotiation': {
      const form = await parseForm(req);
      const brokerSaid = form.SpeechResult || '';
      const callSid = form.CallSid || '';

      await supabaseInsert('call_transcripts', {
        call_sid: callSid, speaker: 'broker', text: brokerSaid, stage: 'negotiation', created_at: new Date().toISOString()
      });

      const lower = brokerSaid.toLowerCase();
      const postedRate = Number(context.rate);

      // Fetch user's negotiation settings — fall back to 90% of posted rate
      const negSettings = context.userId ? await getNegotiationSettings(context.userId) : null;
      let minRate;
      if (negSettings?.min_rate_per_mile && context.rate) {
        // Use user's min $/mile if set — convert to total rate using estimated miles
        const estMiles = postedRate / 2.50; // rough estimate
        const minRpm = negSettings.min_rate_per_mile;
        minRate = Math.round(Math.max(minRpm * estMiles, postedRate * 0.85));
      } else {
        minRate = Math.round(postedRate * 0.9);
      }

      // Detect confirmation
      if (lower.includes('yes') || lower.includes('confirm') || lower.includes('deal') || lower.includes('sounds good') || lower.includes('works') || lower.includes('let\'s do it') || lower.includes('book it') || lower.includes('that works')) {
        const confirm = `Perfect — I'll send over the carrier packet now. MC number ${context.carrierMC}, DOT ${context.carrierDOT}, insurance on file. What's the best email for the rate confirmation?`;

        await supabaseInsert('call_transcripts', {
          call_sid: callSid, speaker: 'ai_q', text: confirm, stage: 'confirmed', created_at: new Date().toISOString()
        });

        const nextUrl = `${baseUrl}?stage=get_email&${contextParams}&agreedRate=${postedRate}`;
        return twimlResponse(gather(nextUrl, confirm, 10));
      }

      // Detect counter offer — extract number from speech
      const numberMatch = brokerSaid.match(/(\d[\d,]*)/);
      if (numberMatch) {
        const counterOffer = parseInt(numberMatch[1].replace(/,/g, ''));

        if (counterOffer >= minRate) {
          const accept = `Let me check that against our minimum. ... Yeah, we can do $${counterOffer}. That works for us. I'll get the carrier packet sent over. What's the best email for the rate con?`;

          await supabaseInsert('call_transcripts', {
            call_sid: callSid, speaker: 'ai_q', text: accept, stage: 'counter_accepted', created_at: new Date().toISOString()
          });

          const nextUrl = `${baseUrl}?stage=get_email&${contextParams}&agreedRate=${counterOffer}`;
          return twimlResponse(gather(nextUrl, accept, 10));
        } else {
          const decline = `I hear you, but $${counterOffer} is a bit below what we can do on this one. We're looking at $${postedRate} to make this work. Any flexibility on your end?`;

          await supabaseInsert('call_transcripts', {
            call_sid: callSid, speaker: 'ai_q', text: decline, stage: 'counter_declined', created_at: new Date().toISOString()
          });

          const nextUrl = `${baseUrl}?stage=negotiation&${contextParams}`;
          return twimlResponse(gather(nextUrl, decline, 8));
        }
      }

      // Use Claude for complex negotiation responses
      context.stage = 'negotiation';
      const aiResponse = await askClaude(brokerSaid, context);

      await supabaseInsert('call_transcripts', {
        call_sid: callSid, speaker: 'ai_q', text: aiResponse, stage: 'negotiation', created_at: new Date().toISOString()
      });

      const nextUrl = `${baseUrl}?stage=negotiation&${contextParams}`;
      return twimlResponse(gather(nextUrl, aiResponse, 8));
    }

    // STAGE 4: Get broker email for rate confirmation
    case 'get_email': {
      const form = await parseForm(req);
      const brokerSaid = form.SpeechResult || '';
      const callSid = form.CallSid || '';
      const agreedRate = url.searchParams.get('agreedRate') || context.rate;

      await supabaseInsert('call_transcripts', {
        call_sid: callSid, speaker: 'broker', text: brokerSaid, stage: 'get_email', created_at: new Date().toISOString()
      });

      // Try to extract email from speech
      const emailMatch = brokerSaid.toLowerCase()
        .replace(/ at /g, '@')
        .replace(/ dot /g, '.')
        .replace(/\s/g, '')
        .match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/);

      if (emailMatch) {
        const brokerEmail = emailMatch[0];
        const closing = `Got it — ${brokerEmail}. I'll have that rate con over to you within the next few minutes. Appreciate you working with us. Have a great day.`;

        await supabaseInsert('call_transcripts', {
          call_sid: callSid, speaker: 'ai_q', text: closing, stage: 'closing', created_at: new Date().toISOString()
        });

        // Update call log as booked
        await supabaseUpdate('call_logs', `twilio_call_sid=eq.${callSid}`, {
          call_status: 'booked',
          outcome: 'booked',
          agreed_rate: Number(agreedRate),
          broker_email: brokerEmail,
          ended_at: new Date().toISOString()
        });

        // Trigger rate confirmation email (fire-and-forget)
        const origin = url.origin;
        fetch(`${origin}/api/rate-confirm`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.CRON_SECRET}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callSid, brokerEmail, agreedRate: Number(agreedRate),
            loadId: context.loadId, origin: context.origin, destination: context.destination,
            equipment: context.equipment, carrierName: context.carrierName,
            carrierMC: context.carrierMC, carrierDOT: context.carrierDOT,
            pickupDate: context.pickupDate
          })
        }).catch(() => {});

        return twimlResponse(`${say(closing)}<Hangup/>`);
      } else {
        // Couldn't parse email — ask again
        const retry = "Sorry, I didn't quite catch that email. Could you spell it out for me?";
        const nextUrl = `${baseUrl}?stage=get_email&${contextParams}&agreedRate=${agreedRate}`;
        return twimlResponse(gather(nextUrl, retry, 10));
      }
    }

    // Handle recording completion
    case 'recording_done': {
      const form = await parseForm(req);
      const callSid = form.CallSid || '';
      const recordingUrl = form.RecordingUrl || '';
      const recordingSid = form.RecordingSid || '';

      if (callSid && recordingUrl) {
        await supabaseUpdate('call_logs', `twilio_call_sid=eq.${callSid}`, {
          recording_url: recordingUrl,
          recording_sid: recordingSid
        });
      }
      return new Response('OK');
    }

    // Handle call status updates
    case 'call_status': {
      const form = await parseForm(req);
      const callSid = form.CallSid || '';
      const status = form.CallStatus || '';
      const duration = form.CallDuration || '0';

      if (callSid) {
        const update = { call_duration: Number(duration) };
        if (status === 'completed' || status === 'busy' || status === 'no-answer' || status === 'failed' || status === 'canceled') {
          update.ended_at = new Date().toISOString();
          if (status !== 'completed') {
            update.call_status = status;
            update.outcome = status; // busy, no-answer, failed
          }
        }
        await supabaseUpdate('call_logs', `twilio_call_sid=eq.${callSid}`, update);

        // Schedule auto-retry for busy/no-answer (retry in 30 min, max 3 attempts)
        if ((status === 'busy' || status === 'no-answer') && context.loadId && context.userId) {
          scheduleRetryCall(context, callSid).catch(() => {});
        }

        // After call completes, extract broker urgency from transcripts (fire-and-forget)
        if (status === 'completed' && context.userId) {
          (async () => {
            try {
              const tRes = await fetch(
                `${supabaseUrl}/rest/v1/call_transcripts?call_sid=eq.${callSid}&speaker=eq.broker&select=text&order=created_at.asc&limit=50`,
                { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
              );
              if (tRes.ok) {
                const rows = await tRes.json();
                const fullTranscript = (rows || []).map(r => r.text).join(' ');
                if (fullTranscript && context.loadId) {
                  const brokerName = context.carrierName || 'Unknown';
                  await updateBrokerUrgency(context.userId, brokerName, fullTranscript);
                }
              }
            } catch {}
          })();
        }
      }
      return new Response('OK');
    }

    // Handle AMD (answering machine detection)
    case 'amd_result': {
      const form = await parseForm(req);
      const callSid = form.CallSid || '';
      const amdResult = form.AnsweredBy || '';

      if (amdResult === 'machine_start' || amdResult === 'machine_end_beep' || amdResult === 'machine_end_other') {
        // Leave a detailed voicemail with load info and callback number
        const fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
        const rateInfo = context.rate ? `, posted at $${context.rate}` : '';
        const voicemail = `Hi, this is Q from Qivori Dispatch calling on behalf of ${context.carrierName}. `
          + `I'm reaching out about load number ${context.loadId}, ${context.origin} to ${context.destination}${rateInfo}. `
          + `We've got a ${context.equipment || 'dry van'} available for pickup ${context.pickupDate || 'as soon as possible'}. `
          + `If that load's still available, please call us back at ${fromNumber.replace(/(\d{1})(\d{3})(\d{3})(\d{4})/, '$1-$2-$3-$4')}. `
          + `Again, this is Q from Qivori Dispatch. Thank you.`;

        await supabaseUpdate('call_logs', `twilio_call_sid=eq.${callSid}`, {
          call_status: 'voicemail', outcome: 'voicemail',
          notes: 'Voicemail left — auto-retry scheduled in 30 min'
        });

        // Log voicemail as transcript
        await supabaseInsert('call_transcripts', {
          call_sid: callSid, speaker: 'ai_q', text: voicemail,
          stage: 'voicemail', created_at: new Date().toISOString()
        });

        // Schedule retry call in 30 min
        scheduleRetryCall(context, callSid).catch(() => {});

        return twimlResponse(`${say(voicemail)}<Hangup/>`);
      }

      // Human answered — AMD confirms, just continue normally
      if (amdResult === 'human') {
        await supabaseUpdate('call_logs', `twilio_call_sid=eq.${callSid}`, { notes: 'AMD confirmed human answered' });
      }

      return new Response('OK');
    }

    default:
      return twimlResponse(say("Sorry, something went wrong on our end. We'll call back. Thanks.") + '<Hangup/>');
  }
}

// Schedule a retry call in 30 minutes (max 3 attempts per load+broker)
async function scheduleRetryCall(context, originalCallSid) {
  // Check how many retries we've already done for this load
  const retryRes = await fetch(
    `${supabaseUrl}/rest/v1/call_logs?load_id=eq.${context.loadId}&broker_phone=eq.${context.brokerPhone || ''}&outcome=in.(voicemail,no-answer,busy)&select=id&limit=5`,
    { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
  );
  const retries = retryRes.ok ? await retryRes.json() : [];

  if (retries.length >= 3) {
    // Max retries reached — mark as exhausted, don't schedule more
    await supabaseUpdate('call_logs', `twilio_call_sid=eq.${originalCallSid}`, {
      notes: `Max retries reached (${retries.length} attempts). No further calls.`
    });
    return;
  }

  // Schedule retry via check_calls table (picked up by cron)
  const retryAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min from now
  await supabaseInsert('check_calls', {
    load_id: context.loadId,
    call_type: 'broker_retry',
    broker_name: context.carrierName || '',
    broker_phone: context.brokerPhone || '',
    carrier_name: context.carrierName || '',
    call_status: 'scheduled',
    scheduled_at: retryAt.toISOString(),
    notes: `Auto-retry #${retries.length + 1} — original call ${originalCallSid}`
  });
}
