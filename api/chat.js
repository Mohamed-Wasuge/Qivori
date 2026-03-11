export const config = { runtime: 'edge' }

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } })
  }
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  try {
    const { messages, context, action } = await req.json()

    // Build system prompt with carrier context + action capabilities
    const systemPrompt = `You are Qivori AI, a smart assistant for trucking owner-operators and small fleet carriers. You help drivers manage their business from their phone.

You are concise, friendly, and action-oriented. When the driver asks you to DO something (submit check call, add expense, view loads), you respond with a JSON action block that the app will execute.

CARRIER DATA:
${context || 'No carrier data loaded yet.'}

CAPABILITIES — when the user wants to perform an action, include an ACTION block in your response using this exact format:
\`\`\`action
{"type": "ACTION_TYPE", ...params}
\`\`\`

Available actions:
- {"type":"check_call","load_id":"...","location":"...","status":"On Time|Delayed|At Pickup|At Delivery|Loaded|Empty","notes":"..."}
- {"type":"add_expense","category":"Fuel|Maintenance|Tolls|Food|Parking|Other","amount":0,"merchant":"...","notes":"..."}
- {"type":"navigate","to":"loads|invoices|check-call|add-expense|home"}
- {"type":"call_broker","phone":"..."}
- {"type":"get_gps"} — request the driver's current GPS location

RULES:
- Keep responses SHORT — drivers are on the road
- Use dollar amounts and numbers, not paragraphs
- If the driver says something like "fuel $85 at Loves" → create the expense action immediately
- If they say "check in" or "update location" → trigger get_gps then check_call
- If they ask about loads, revenue, invoices → answer from the carrier data above
- Always confirm what you did after an action
- Use simple language, no jargon unless it's trucking terms
- If you don't have enough info for an action, ask ONE clarifying question`

    const claudeMessages = (messages || []).map(m => ({
      role: m.role,
      content: m.content,
    }))

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: claudeMessages,
      }),
    })

    if (!res.ok) {
      const err = await res.text()
      return Response.json({ error: 'Claude API error: ' + err }, { status: 502 })
    }

    const data = await res.json()
    const reply = data.content?.[0]?.text || 'No response from AI.'

    return Response.json({ reply })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
