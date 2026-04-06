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

  // Transcription now handled client-side via browser SpeechRecognition API (free, no OpenAI needed)
  // This endpoint is kept for backward compatibility — returns empty if called
  return Response.json({ text: '', note: 'Use browser SpeechRecognition instead' }, { headers: corsHeaders(req) })
}
