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

  const apiKey = (process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) {
    return Response.json({ error: 'Transcription not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    const formData = await req.formData()
    const audioFile = formData.get('audio')
    if (!audioFile) {
      return Response.json({ error: 'No audio file' }, { status: 400, headers: corsHeaders(req) })
    }

    // Forward to OpenAI Whisper
    const whisperForm = new FormData()
    whisperForm.append('file', audioFile, 'audio.webm')
    whisperForm.append('model', 'whisper-1')
    whisperForm.append('response_format', 'json')

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
      body: whisperForm,
    })

    if (!res.ok) {
      const err = await res.text()
      return Response.json({ error: 'Transcription failed' }, { status: 502, headers: corsHeaders(req) })
    }

    const data = await res.json()
    return Response.json({ text: data.text || '' }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
