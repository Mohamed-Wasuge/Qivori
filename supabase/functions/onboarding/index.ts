// Supabase Edge Function — Driver Onboarding API Gateway
// Each carrier's API keys are stored in their companies.provider_keys (JSONB)
// RLS ensures carriers can only access their own keys
//
// Deploy: supabase functions deploy onboarding

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Get the carrier's API keys from their company record
async function getCarrierKeys(req: Request) {
  const authHeader = req.headers.get('Authorization')
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader ?? '' } } }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: company } = await supabase
    .from('companies')
    .select('provider_keys, name')
    .eq('owner_id', user.id)
    .single()

  return {
    keys: company?.provider_keys || {},
    companyName: company?.name || 'Your Company',
    userId: user.id,
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const clonedReq = req.clone()
    const { action, driver, reportId, orderId } = await req.json()
    const { keys, companyName } = await getCarrierKeys(clonedReq)

    switch (action) {
      case 'send_consent_email':
        return await sendConsentEmail(driver, keys, companyName)
      case 'checkr_background':
        return await checkrBackground(driver, keys)
      case 'checkr_employment':
        return await checkrEmployment(driver, keys)
      case 'checkr_status':
        return await checkrStatus(reportId, keys)
      case 'samba_mvr':
        return await sambaMVR(driver, keys)
      case 'samba_status':
        return await sambaStatus(orderId, keys)
      case 'fmcsa_clearinghouse':
        return await fmcsaClearinghouse(driver, keys)
      case 'fmcsa_psp':
        return await fmcsaPSP(driver, keys)
      case 'fmcsa_cdl_verify':
        return await fmcsaCDLVerify(driver, keys)
      case 'fadv_drug_test':
        return await fadvDrugTest(driver, keys)
      case 'fadv_status':
        return await fadvStatus(orderId, keys)
      case 'check_keys':
        return json(getKeyStatus(keys))
      default:
        return json({ error: 'Unknown action: ' + action }, 400)
    }
  } catch (err) {
    return json({ error: err.message }, 500)
  }
})

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Show which providers are configured vs missing
function getKeyStatus(keys: any) {
  return {
    resend:         !!keys.resend_api_key,
    checkr:         !!keys.checkr_api_key,
    sambasafety:    !!keys.sambasafety_api_key,
    fmcsa:          !!keys.fmcsa_api_key,
    fmcsa_psp:      !!keys.fmcsa_webkey,
    first_advantage: !!keys.fadv_client_id,
  }
}

// ═══════════════════════════════════════════════════════════
// CONSENT EMAIL (Resend — carrier's key)
// ═══════════════════════════════════════════════════════════
async function sendConsentEmail(driver: any, keys: any, companyName: string) {
  const apiKey = keys.resend_api_key
  if (!apiKey) return json({ status: 'not_configured', provider: 'resend', message: 'Add your Resend API key in Settings → Provider Keys' })

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${companyName} <onboarding@resend.dev>`,
      to: [driver.email],
      subject: `${companyName} — Pre-Employment Consent Required`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <h2 style="color:#F0A500;">Welcome to ${companyName}</h2>
          <p>Hi <strong>${driver.full_name}</strong>,</p>
          <p>As part of your onboarding, we are required by FMCSA regulations to perform the following pre-employment screenings:</p>
          <ul>
            <li>DOT Drug & Alcohol Test (FMCSA §382.301)</li>
            <li>FMCSA Clearinghouse Full Query (§382.701)</li>
            <li>Motor Vehicle Record (MVR) (§391.23)</li>
            <li>Pre-Employment Screening Program (PSP) (§391.23)</li>
            <li>Employment Verification — 3 year history (§391.23)</li>
            <li>Background Check</li>
          </ul>
          <p><strong>Your written consent is required before we can proceed.</strong></p>
          <p>Please reply to this email with <strong>"I CONSENT"</strong> or click the button below:</p>
          <div style="text-align:center;margin:24px 0;">
            <a href="mailto:onboarding@${companyName.toLowerCase().replace(/\s+/g, '')}?subject=CONSENT%20-%20${encodeURIComponent(driver.full_name)}&body=I%20CONSENT%20to%20pre-employment%20screening."
              style="background:#F0A500;color:#000;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
              I CONSENT
            </a>
          </div>
          <p style="color:#888;font-size:12px;">
            This consent is required under FMCSA regulations 49 CFR Parts 40, 382, and 391.
            Your information will be used solely for employment screening purposes.
          </p>
          <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
          <p style="color:#888;font-size:11px;">${companyName} · Powered by Qivori AI</p>
        </div>
      `,
    }),
  })

  const result = await res.json()
  if (!res.ok) return json({ status: 'error', message: result.message || 'Email failed' }, 400)
  return json({ status: 'sent', id: result.id })
}

// ═══════════════════════════════════════════════════════════
// CHECKR — Background Check & Employment Verification
// ═══════════════════════════════════════════════════════════
async function checkrBackground(driver: any, keys: any) {
  const apiKey = keys.checkr_api_key
  if (!apiKey) return json({ status: 'not_configured', provider: 'checkr', message: 'Add your Checkr API key in Settings → Provider Keys' })

  const candidateRes = await fetch('https://api.checkr.com/v1/candidates', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(apiKey + ':')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      first_name: driver.full_name.split(' ')[0],
      last_name: driver.full_name.split(' ').slice(1).join(' '),
      email: driver.email,
      phone: driver.phone,
      dob: driver.dob,
      driver_license_number: driver.cdl_number,
      driver_license_state: driver.state,
    }),
  })
  const candidate = await candidateRes.json()
  if (!candidateRes.ok) return json({ status: 'error', message: candidate.error || 'Checkr API error' }, 400)

  const inviteRes = await fetch('https://api.checkr.com/v1/invitations', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(apiKey + ':')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate_id: candidate.id, package: 'driver_pro' }),
  })
  const invite = await inviteRes.json()
  return json({ status: 'ordered', candidateId: candidate.id, invitationId: invite.id })
}

async function checkrEmployment(driver: any, keys: any) {
  const apiKey = keys.checkr_api_key
  if (!apiKey) return json({ status: 'not_configured', provider: 'checkr' })

  const res = await fetch('https://api.checkr.com/v1/verifications/employments', {
    method: 'POST',
    headers: { Authorization: `Basic ${btoa(apiKey + ':')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ candidate_id: driver.candidate_id, years_to_verify: 3 }),
  })
  const result = await res.json()
  return json({ status: 'ordered', verificationId: result.id })
}

async function checkrStatus(reportId: string, keys: any) {
  const apiKey = keys.checkr_api_key
  if (!apiKey) return json({ status: 'not_configured', provider: 'checkr' })

  const res = await fetch(`https://api.checkr.com/v1/reports/${reportId}`, {
    headers: { Authorization: `Basic ${btoa(apiKey + ':')}` },
  })
  const report = await res.json()
  return json({ status: report.status, result: report.result, completedAt: report.completed_at })
}

// ═══════════════════════════════════════════════════════════
// SAMBASAFETY — Motor Vehicle Record (MVR)
// ═══════════════════════════════════════════════════════════
async function sambaMVR(driver: any, keys: any) {
  const apiKey = keys.sambasafety_api_key
  if (!apiKey) return json({ status: 'not_configured', provider: 'sambasafety', message: 'Add your SambaSafety API key in Settings → Provider Keys' })

  const res = await fetch('https://api.sambasafety.com/v2/mvr/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-Account-Id': keys.sambasafety_account_id || '',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      driver_license_number: driver.license_number,
      driver_license_state: driver.license_state,
      first_name: driver.full_name.split(' ')[0],
      last_name: driver.full_name.split(' ').slice(1).join(' '),
      date_of_birth: driver.dob,
    }),
  })
  const result = await res.json()
  return json({ status: 'ordered', orderId: result.order_id })
}

async function sambaStatus(orderId: string, keys: any) {
  const apiKey = keys.sambasafety_api_key
  if (!apiKey) return json({ status: 'not_configured', provider: 'sambasafety' })

  const res = await fetch(`https://api.sambasafety.com/v2/mvr/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  const result = await res.json()
  return json({ status: result.status, violations: result.violations || [] })
}

// ═══════════════════════════════════════════════════════════
// FMCSA — Clearinghouse, PSP, CDL Verification
// ═══════════════════════════════════════════════════════════
async function fmcsaClearinghouse(driver: any, keys: any) {
  const apiKey = keys.fmcsa_api_key
  if (!apiKey) return json({ status: 'not_configured', provider: 'fmcsa', message: 'Add your FMCSA API key in Settings → Provider Keys' })

  const res = await fetch('https://clearinghouse-api.fmcsa.dot.gov/api/queries/full', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      driverLicenseNumber: driver.license_number,
      driverLicenseState: driver.license_state,
      dateOfBirth: driver.dob,
      queryType: 'FULL',
    }),
  })
  const result = await res.json()
  return json({ status: 'ordered', queryId: result.queryId, violations: result.violations || [] })
}

async function fmcsaPSP(driver: any, keys: any) {
  const apiKey = keys.fmcsa_webkey
  if (!apiKey) return json({ status: 'not_configured', provider: 'fmcsa_psp', message: 'Add your FMCSA WebKey in Settings → Provider Keys' })

  const res = await fetch('https://ai.fmcsa.dot.gov/PSP/api/Report', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ licenseNumber: driver.license_number, licenseState: driver.license_state }),
  })
  const result = await res.json()
  return json({ status: 'complete', crashes: result.crashCount || 0, inspections: result.inspectionCount || 0, outOfService: result.oosCount || 0 })
}

async function fmcsaCDLVerify(driver: any, keys: any) {
  const webKey = keys.fmcsa_webkey
  if (!webKey) return json({ status: 'not_configured', provider: 'fmcsa' })

  const res = await fetch(`https://mobile.fmcsa.dot.gov/qc/services/carriers/docket-number/${driver.license_number}?webKey=${webKey}`)
  const result = await res.json()
  return json({ status: 'complete', valid: result.content?.carrier?.allowedToOperate === 'Y', details: result.content?.carrier || {} })
}

// ═══════════════════════════════════════════════════════════
// FIRST ADVANTAGE — Drug & Alcohol Testing
// ═══════════════════════════════════════════════════════════
async function fadvDrugTest(driver: any, keys: any) {
  const clientId = keys.fadv_client_id
  const clientSecret = keys.fadv_client_secret
  if (!clientId) return json({ status: 'not_configured', provider: 'first_advantage', message: 'Add your First Advantage credentials in Settings → Provider Keys' })

  const tokenRes = await fetch('https://api.fadv.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
  })
  const { access_token } = await tokenRes.json()

  const res = await fetch('https://api.fadv.com/v1/screening/orders', {
    method: 'POST',
    headers: { Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      orderType: 'DOT_DRUG_SCREEN',
      candidate: {
        firstName: driver.full_name.split(' ')[0],
        lastName: driver.full_name.split(' ').slice(1).join(' '),
        email: driver.email,
        phone: driver.phone,
        dateOfBirth: driver.dob,
      },
      panelType: 'DOT_5_PANEL',
    }),
  })
  const result = await res.json()
  return json({ status: 'ordered', orderId: result.orderId, collectionSite: result.site })
}

async function fadvStatus(orderId: string, keys: any) {
  const clientId = keys.fadv_client_id
  const clientSecret = keys.fadv_client_secret
  if (!clientId) return json({ status: 'not_configured', provider: 'first_advantage' })

  const tokenRes = await fetch('https://api.fadv.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
  })
  const { access_token } = await tokenRes.json()

  const res = await fetch(`https://api.fadv.com/v1/screening/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${access_token}` },
  })
  const result = await res.json()
  return json({ status: result.status, result: result.result })
}
