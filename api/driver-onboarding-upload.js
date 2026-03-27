// api/driver-onboarding-upload.js — Public file upload for driver onboarding
// No auth required — validates via invite token, uploads using service role key

export const config = { runtime: 'edge' }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders })
  }

  try {
    const formData = await req.formData()
    const token = formData.get('token')
    const field = formData.get('field')
    const file = formData.get('file')

    if (!token || !field || !file) {
      return Response.json({ error: 'token, field, and file are required' }, { status: 400, headers: corsHeaders })
    }

    // Validate file size (4MB limit for edge functions)
    if (file.size > 4 * 1024 * 1024) {
      return Response.json({ error: 'File must be under 4MB' }, { status: 400, headers: corsHeaders })
    }

    // Validate invite token
    const svc = {
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    const invRes = await fetch(
      `${supabaseUrl}/rest/v1/invitations?token=eq.${token}&select=id,invited_by,expires_at`,
      { headers: svc }
    )
    if (!invRes.ok) {
      return Response.json({ error: 'Lookup failed' }, { status: 500, headers: corsHeaders })
    }
    const invitations = await invRes.json()
    const inv = invitations?.[0]
    if (!inv) {
      return Response.json({ error: 'Invalid token' }, { status: 404, headers: corsHeaders })
    }
    if (new Date(inv.expires_at) < new Date()) {
      return Response.json({ error: 'Invitation expired' }, { status: 400, headers: corsHeaders })
    }

    // Upload to Supabase Storage using service role key
    const ext = file.name?.split('.').pop() || 'bin'
    const storagePath = `driver-onboarding/${inv.invited_by}/${token.slice(0, 8)}/${field}-${Date.now()}.${ext}`
    const fileBytes = await file.arrayBuffer()

    const uploadRes = await fetch(
      `${supabaseUrl}/storage/v1/object/documents/${storagePath}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': file.type || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: fileBytes,
      }
    )

    if (!uploadRes.ok) {
      const err = await uploadRes.text()
      return Response.json({ error: `Upload failed: ${err}` }, { status: 500, headers: corsHeaders })
    }

    // Get public URL
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/documents/${storagePath}`

    return Response.json({
      ok: true,
      url: publicUrl,
      path: storagePath,
      field,
    }, { headers: corsHeaders })

  } catch (err) {
    return Response.json({ error: err.message || 'Upload failed' }, { status: 500, headers: corsHeaders })
  }
}
