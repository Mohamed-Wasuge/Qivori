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

  // Try ElevenLabs first, then OpenAI
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY
  const openaiKey = process.env.OPENAI_API_KEY

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

    // ElevenLabs TTS — natural human voice
    if (elevenLabsKey) {
      // Brian voice ID from ElevenLabs
      const voiceId = process.env.ELEVENLABS_VOICE_ID || 'nPczCjzI2devNBz1zQrb' // Brian
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'xi-api-key': elevenLabsKey,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify({
          text: clean,
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      })
      if (res.ok) {
        const audioData = await res.arrayBuffer()
        return new Response(audioData, {
          status: 200,
          headers: { ...corsHeaders(req), 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-cache' },
        })
      }
    }

    // OpenAI TTS fallback
    if (openaiKey) {
      const res = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          voice: 'echo',
          input: clean,
          response_format: 'mp3',
          speed: 1.05,
        }),
      })
      if (res.ok) {
        const audioData = await res.arrayBuffer()
        return new Response(audioData, {
          status: 200,
          headers: { ...corsHeaders(req), 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-cache' },
        })
      }
    }

    // No TTS available
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  } catch {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }
}
