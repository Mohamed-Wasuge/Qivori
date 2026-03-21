import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user, error: authError } = await verifyAuth(req)
  if (authError) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    // No OpenAI key — return empty so client falls back to browser TTS
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }

  try {
    const { text } = await req.json()
    if (!text || text.length > 4096) {
      return Response.json({ error: 'Text required (max 4096 chars)' }, { status: 400, headers: corsHeaders(req) })
    }

    // Clean markdown/code blocks
    const clean = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\*\*/g, '')
      .replace(/[#*_~`]/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .trim()

    if (!clean) {
      return new Response(null, { status: 204, headers: corsHeaders(req) })
    }

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'onyx', // Deep male voice — perfect for Alex
        input: clean,
        response_format: 'mp3',
        speed: 1.05,
      }),
    })

    if (!res.ok) {
      return new Response(null, { status: 204, headers: corsHeaders(req) })
    }

    const audioData = await res.arrayBuffer()
    const headers = {
      ...corsHeaders(req),
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-cache',
    }
    return new Response(audioData, { status: 200, headers })
  } catch {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }
}
