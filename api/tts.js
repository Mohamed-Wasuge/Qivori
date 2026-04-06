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

  // ElevenLabs TTS (OpenAI removed — Retell handles voice calls)
  const elevenLabsKey = process.env.ELEVENLABS_API_KEY

  try {
    const { text } = await req.json()
    if (!text || text.length > 4096) {
      return Response.json({ error: 'Text required (max 4096 chars)' }, { status: 400, headers: corsHeaders(req) })
    }

    // Clean markdown/code blocks and truncate for speed
    let clean = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\*\*/g, '')
      .replace(/[#*_~`]/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .trim()

    if (!clean) {
      return new Response(null, { status: 204, headers: corsHeaders(req) })
    }

    // Truncate to ~300 chars for faster TTS — driver doesn't need the whole essay read aloud
    if (clean.length > 300) {
      const cutoff = clean.lastIndexOf('. ', 300)
      clean = clean.slice(0, cutoff > 100 ? cutoff + 1 : 300) + '...'
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

    // No TTS available (browser speechSynthesis will be used as client-side fallback)
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  } catch {
    return new Response(null, { status: 204, headers: corsHeaders(req) })
  }
}
