// api/driver-onboarding.js — Public endpoint for driver self-service onboarding
// No auth required — validates via invite token

export const config = { runtime: 'edge' }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders })
  }

  const svc = {
    'apikey': serviceKey,
    'Authorization': `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }

  // GET — fetch invitation details (for pre-filling the form)
  if (req.method === 'GET') {
    const url = new URL(req.url)
    const token = url.searchParams.get('token')
    if (!token) return Response.json({ error: 'Token required' }, { status: 400, headers: corsHeaders })

    const invRes = await fetch(
      `${supabaseUrl}/rest/v1/invitations?token=eq.${token}&select=*`,
      { headers: svc }
    )
    if (!invRes.ok) return Response.json({ error: 'Lookup failed' }, { status: 500, headers: corsHeaders })

    const invitations = await invRes.json()
    const inv = invitations?.[0]
    if (!inv) return Response.json({ error: 'Invalid token' }, { status: 404, headers: corsHeaders })
    if (new Date(inv.expires_at) < new Date()) return Response.json({ error: 'Invitation expired' }, { status: 400, headers: corsHeaders })

    // Get company name
    let companyName = ''
    try {
      const profRes = await fetch(
        `${supabaseUrl}/rest/v1/profiles?id=eq.${inv.invited_by}&select=company_name,full_name`,
        { headers: svc }
      )
      if (profRes.ok) {
        const profiles = await profRes.json()
        companyName = profiles?.[0]?.company_name || profiles?.[0]?.full_name || ''
      }
    } catch {}

    // Check if already submitted
    const subRes = await fetch(
      `${supabaseUrl}/rest/v1/driver_onboarding_submissions?invite_token=eq.${token}&select=id,status,completed_steps`,
      { headers: svc }
    )
    let existing = null
    if (subRes.ok) {
      const subs = await subRes.json()
      existing = subs?.[0] || null
    }

    return Response.json({
      ok: true,
      email: inv.email,
      role: inv.role,
      companyName,
      alreadyAccepted: !!inv.accepted_at,
      existingSubmission: existing,
    }, { headers: corsHeaders })
  }

  // POST — save onboarding data
  if (req.method === 'POST') {
    try {
      const body = await req.json()
      const { token, step, data } = body

      if (!token) return Response.json({ error: 'Token required' }, { status: 400, headers: corsHeaders })

      // Validate token
      const invRes = await fetch(
        `${supabaseUrl}/rest/v1/invitations?token=eq.${token}&select=*`,
        { headers: svc }
      )
      if (!invRes.ok) return Response.json({ error: 'Lookup failed' }, { status: 500, headers: corsHeaders })

      const invitations = await invRes.json()
      const inv = invitations?.[0]
      if (!inv) return Response.json({ error: 'Invalid token' }, { status: 404, headers: corsHeaders })
      if (new Date(inv.expires_at) < new Date()) return Response.json({ error: 'Invitation expired' }, { status: 400, headers: corsHeaders })

      // Check for existing submission
      const subRes = await fetch(
        `${supabaseUrl}/rest/v1/driver_onboarding_submissions?invite_token=eq.${token}&select=*`,
        { headers: svc }
      )
      let existingSub = null
      if (subRes.ok) {
        const subs = await subRes.json()
        existingSub = subs?.[0] || null
      }

      const completedSteps = existingSub?.completed_steps || []
      if (step && !completedSteps.includes(step)) completedSteps.push(step)

      const existingData = existingSub?.onboarding_data || {}
      const mergedData = { ...existingData, ...data }

      const isComplete = completedSteps.length >= 9 // personal, cdl, employment, mvr, w9, deposit, documents, consent, emergency
      const status = isComplete ? 'completed' : 'in_progress'

      const record = {
        invite_token: token,
        company_id: inv.company_id,
        invited_by: inv.invited_by,
        email: inv.email,
        onboarding_data: mergedData,
        completed_steps: completedSteps,
        status,
        updated_at: new Date().toISOString(),
      }

      if (existingSub) {
        // Update
        await fetch(
          `${supabaseUrl}/rest/v1/driver_onboarding_submissions?id=eq.${existingSub.id}`,
          {
            method: 'PATCH',
            headers: { ...svc, 'Prefer': 'return=minimal' },
            body: JSON.stringify(record),
          }
        )
      } else {
        // Insert
        record.created_at = new Date().toISOString()
        await fetch(
          `${supabaseUrl}/rest/v1/driver_onboarding_submissions`,
          {
            method: 'POST',
            headers: { ...svc, 'Prefer': 'return=minimal' },
            body: JSON.stringify(record),
          }
        )
      }

      // Build driver fields from onboarding data
      const driverFields = {
        full_name: mergedData.fullName || undefined,
        phone: mergedData.phone || undefined,
        email: inv.email,
        license_number: mergedData.cdlNumber || undefined,
        license_state: mergedData.cdlState || undefined,
        license_class: mergedData.cdlClass ? `CDL-${mergedData.cdlClass}` : undefined,
        license_expiry: mergedData.cdlExpiry || undefined,
        medical_card_expiry: mergedData.medicalExpiry || undefined,
        endorsements: mergedData.cdlEndorsements?.length ? mergedData.cdlEndorsements.join(', ') : undefined,
        equipment_experience: mergedData.equipmentExp?.length ? mergedData.equipmentExp.join(', ') : undefined,
        years_experience: mergedData.yearsExperience ? parseInt(mergedData.yearsExperience) : undefined,
        address: [mergedData.address, mergedData.city, mergedData.state, mergedData.zip].filter(Boolean).join(', ') || undefined,
        dob: mergedData.dob || undefined,
        emergency_contact_name: mergedData.emergencyName || undefined,
        emergency_contact_phone: mergedData.emergencyPhone || undefined,
        emergency_contact_relationship: mergedData.emergencyRelationship || undefined,
        profile_photo: mergedData.profilePhoto || undefined,
        bank_name: mergedData.bankName || undefined,
        routing_number: mergedData.routingNumber || undefined,
        account_number: mergedData.accountNumber || undefined,
        account_type: mergedData.accountType || undefined,
      }

      // If complete, update the driver record with the collected data
      if (isComplete && inv.driver_id) {
        const driverUpdate = { ...driverFields }
        // Remove undefined keys
        Object.keys(driverUpdate).forEach(k => driverUpdate[k] === undefined && delete driverUpdate[k])

        if (Object.keys(driverUpdate).length > 0) {
          await fetch(
            `${supabaseUrl}/rest/v1/drivers?id=eq.${inv.driver_id}`,
            {
              method: 'PATCH',
              headers: { ...svc, 'Prefer': 'return=minimal' },
              body: JSON.stringify(driverUpdate),
            }
          )
        }
      }

      // If complete and no driver_id, create the driver record
      if (isComplete && !inv.driver_id) {
        const cleanFields = { ...driverFields }
        Object.keys(cleanFields).forEach(k => cleanFields[k] === undefined && delete cleanFields[k])
        const newDriver = {
          owner_id: inv.invited_by,
          ...cleanFields,
          full_name: cleanFields.full_name || 'New Driver',
          status: 'Active',
          hire_date: new Date().toISOString().split('T')[0],
        }
        const drvRes = await fetch(`${supabaseUrl}/rest/v1/drivers`, {
          method: 'POST',
          headers: { ...svc, 'Prefer': 'return=representation' },
          body: JSON.stringify(newDriver),
        })
        if (drvRes.ok) {
          const created = await drvRes.json()
          const driverId = created?.[0]?.id
          if (driverId) {
            // Link driver_id to the invitation
            await fetch(
              `${supabaseUrl}/rest/v1/invitations?id=eq.${inv.id}`,
              {
                method: 'PATCH',
                headers: { ...svc, 'Prefer': 'return=minimal' },
                body: JSON.stringify({ driver_id: driverId }),
              }
            )
          }
        }
      }

      return Response.json({ ok: true, status, completedSteps }, { headers: corsHeaders })
    } catch (err) {
      return Response.json({ error: err.message || 'Server error' }, { status: 500, headers: corsHeaders })
    }
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders })
}
