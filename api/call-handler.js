/**
 * Call Handler — TwiML webhook for AI broker conversation
 * Handles multi-turn voice conversation using Twilio + Claude AI
 * Voice: Amazon Polly "Matthew" — professional American male, natural pace
 * The AI sounds like a real human dispatcher named "Alex"
 * Handles: greeting, availability check, negotiation, booking confirmation
 * Records all calls + transcribes for admin dashboard
 * Runtime: Vercel Edge
 */

export const config = { runtime: 'edge' };

const supabaseUrl = process.env.VITE_SUPABASE_URL;
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
  const systemPrompt = `You are Alex, an elite freight dispatcher at Qivori Dispatch. You're on a live phone call with a broker.

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
        messages: [{ role: 'user', content: `The broker just said: "${brokerSaid}"\n\nRespond naturally as Alex the dispatcher. Keep it short and conversational.` }]
      })
    });

    const data = await res.json();
    return data.content?.[0]?.text || "Sorry, I didn't catch that. Could you say that again?";
  } catch (e) {
    console.error('Claude error:', e);
    return "Hey sorry, I'm having a bit of trouble hearing you. Can you repeat that?";
  }
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

  const baseUrl = `${url.origin}/api/call-handler`;
  const contextParams = new URLSearchParams(context).toString();

  // — Handle different conversation stages —
  switch (stage) {

    // STAGE 1: Greeting when broker answers
    case 'greeting': {
      const greeting = `Hi, this is Alex calling from Qivori Dispatch on behalf of ${context.carrierName}. I'm calling about load number ${context.loadId} from ${context.origin} to ${context.destination}. Is that load still available?`;

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
          call_sid: callSid, speaker: 'ai_alex', text: pitch, stage: 'availability', created_at: new Date().toISOString()
        });

        const nextUrl = `${baseUrl}?stage=negotiation&${contextParams}`;
        return twimlResponse(gather(nextUrl, pitch, 8));

      } else if (lower.includes('no') || lower.includes('taken') || lower.includes('covered') || lower.includes('booked') || lower.includes('gone')) {
        const response = "Ah gotcha, no worries. Appreciate your time. If anything else opens up on that lane, give us a call. Have a good one.";

        await supabaseInsert('call_transcripts', {
          call_sid: callSid, speaker: 'ai_alex', text: response, stage: 'unavailable', created_at: new Date().toISOString()
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
          call_sid: callSid, speaker: 'ai_alex', text: confirm, stage: 'confirmed', created_at: new Date().toISOString()
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
            call_sid: callSid, speaker: 'ai_alex', text: accept, stage: 'counter_accepted', created_at: new Date().toISOString()
          });

          const nextUrl = `${baseUrl}?stage=get_email&${contextParams}&agreedRate=${counterOffer}`;
          return twimlResponse(gather(nextUrl, accept, 10));
        } else {
          const decline = `I hear you, but $${counterOffer} is a bit below what we can do on this one. We're looking at $${postedRate} to make this work. Any flexibility on your end?`;

          await supabaseInsert('call_transcripts', {
            call_sid: callSid, speaker: 'ai_alex', text: decline, stage: 'counter_declined', created_at: new Date().toISOString()
          });

          const nextUrl = `${baseUrl}?stage=negotiation&${contextParams}`;
          return twimlResponse(gather(nextUrl, decline, 8));
        }
      }

      // Use Claude for complex negotiation responses
      context.stage = 'negotiation';
      const aiResponse = await askClaude(brokerSaid, context);

      await supabaseInsert('call_transcripts', {
        call_sid: callSid, speaker: 'ai_alex', text: aiResponse, stage: 'negotiation', created_at: new Date().toISOString()
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
          call_sid: callSid, speaker: 'ai_alex', text: closing, stage: 'closing', created_at: new Date().toISOString()
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
        if (status === 'completed' || status === 'busy' || status === 'no-answer' || status === 'failed') {
          update.ended_at = new Date().toISOString();
          if (status !== 'completed') update.call_status = status;
        }
        await supabaseUpdate('call_logs', `twilio_call_sid=eq.${callSid}`, update);
      }
      return new Response('OK');
    }

    // Handle AMD (answering machine detection)
    case 'amd_result': {
      const form = await parseForm(req);
      const callSid = form.CallSid || '';
      const amdResult = form.AnsweredBy || '';

      if (amdResult === 'machine_start' || amdResult === 'machine_end_beep') {
        // Leave a voicemail
        const voicemail = `Hi, this is Alex from Qivori Dispatch. I'm calling about a load from ${context.origin} to ${context.destination}. If that's still available, please give us a call back. Thanks.`;
        await supabaseUpdate('call_logs', `twilio_call_sid=eq.${callSid}`, { call_status: 'voicemail', outcome: 'voicemail' });
        return twimlResponse(`${say(voicemail)}<Hangup/>`);
      }
      return new Response('OK');
    }

    default:
      return twimlResponse(say("Sorry, something went wrong on our end. We'll call back. Thanks.") + '<Hangup/>');
  }
}
