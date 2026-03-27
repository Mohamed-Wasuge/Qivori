import { handleCors, corsHeaders } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

async function supabaseRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// Simple rate limit: 20 requests per 60 seconds per IP
const ipHits = new Map()
function checkIPRate(ip) {
  const now = Date.now()
  const entry = ipHits.get(ip) || { count: 0, resetAt: now + 60000 }
  if (now > entry.resetAt) { entry.count = 0; entry.resetAt = now + 60000 }
  entry.count++
  ipHits.set(ip, entry)
  return entry.count <= 20
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (!checkIPRate(ip)) {
    return Response.json({ error: 'Too many requests' }, { status: 429, headers: corsHeaders(req) })
  }

  // GET — load contract for signing page
  if (req.method === 'GET') {
    try {
      const url = new URL(req.url)
      const token = url.searchParams.get('token')
      if (!token) return Response.json({ error: 'Token required' }, { status: 400, headers: corsHeaders(req) })

      const contracts = await supabaseRequest(`driver_contracts?signing_token=eq.${token}&select=*`)
      if (!contracts.length) {
        return Response.json({ error: 'Contract not found or link expired' }, { status: 404, headers: corsHeaders(req) })
      }

      const c = contracts[0]

      // Check expiry
      if (c.signing_token_expires_at && new Date(c.signing_token_expires_at) < new Date()) {
        return Response.json({ error: 'This signing link has expired. Please ask your carrier to send a new one.' }, { status: 410, headers: corsHeaders(req) })
      }

      // Check if already signed
      if (c.driver_signature) {
        return Response.json({ error: 'This contract has already been signed.', alreadySigned: true }, { status: 409, headers: corsHeaders(req) })
      }

      // Return sanitized contract data (no sensitive fields)
      return Response.json({
        ok: true,
        contract: {
          driver_name: c.driver_name,
          contract_type: c.contract_type,
          company_name: c.company_name,
          pay_structure: c.pay_structure,
          pay_rate: c.pay_rate,
          start_date: c.start_date,
          end_date: c.end_date,
          vehicle_info: c.vehicle_info,
          vehicle_vin: c.vehicle_vin,
          carrier_signature: c.carrier_signature,
          custom_terms: c.custom_terms,
          signed_date: c.signed_date,
          amendment_number: c.amendment_number,
          amendment_reason: c.amendment_reason,
        },
      }, { headers: corsHeaders(req) })

    } catch (err) {
      return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
    }
  }

  // POST — submit driver signature
  if (req.method === 'POST') {
    try {
      const { token, signature, signerName } = await req.json()
      if (!token || !signature) {
        return Response.json({ error: 'Token and signature required' }, { status: 400, headers: corsHeaders(req) })
      }

      const contracts = await supabaseRequest(`driver_contracts?signing_token=eq.${token}&select=*`)
      if (!contracts.length) {
        return Response.json({ error: 'Contract not found' }, { status: 404, headers: corsHeaders(req) })
      }

      const c = contracts[0]

      // Check expiry
      if (c.signing_token_expires_at && new Date(c.signing_token_expires_at) < new Date()) {
        return Response.json({ error: 'Signing link expired' }, { status: 410, headers: corsHeaders(req) })
      }

      // Check already signed
      if (c.driver_signature) {
        return Response.json({ error: 'Already signed' }, { status: 409, headers: corsHeaders(req) })
      }

      const ua = req.headers.get('user-agent') || 'unknown'
      const now = new Date().toISOString()

      // Update contract with driver signature
      await supabaseRequest(`driver_contracts?id=eq.${c.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          driver_signature: signature,
          driver_signed_date: now,
          driver_signed_ip: ip,
          driver_signed_user_agent: ua,
          fully_executed: true,
          status: 'active',
        }),
      })

      // Generate and store the contract HTML document
      try {
        await generateAndStoreContractDoc(c, signature, now, ip, ua)
      } catch {
        // Non-fatal — contract is signed even if PDF storage fails
      }

      return Response.json({ ok: true }, { headers: corsHeaders(req) })

    } catch (err) {
      return Response.json({ error: 'Server error' }, { status: 500, headers: corsHeaders(req) })
    }
  }

  return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders(req) })
}

async function generateAndStoreContractDoc(contract, driverSig, driverSignedDate, driverIp, driverUa) {
  const isLease = contract.contract_type === 'lease'
  const typeLabel = isLease ? 'Owner-Operator Lease Agreement'
    : contract.contract_type === 'ic' ? 'Independent Contractor Agreement'
    : contract.contract_type
  const payDesc = contract.pay_structure === 'percent' ? `${contract.pay_rate}% of gross revenue`
    : contract.pay_structure === 'permile' ? `$${contract.pay_rate} per mile`
    : `$${contract.pay_rate} per load`

  const sections = isLease ? LEASE_SECTIONS_API : IC_SECTIONS_API
  const legalText = isLease ? LEASE_LEGAL_API : IC_LEGAL_API

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${typeLabel} — ${contract.driver_name}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Times New Roman',Georgia,serif;color:#1a1a1a;padding:60px 72px;line-height:1.6;max-width:900px;margin:0 auto}
h1{font-size:22px;text-align:center;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px}
.subtitle{text-align:center;font-size:13px;color:#666;margin-bottom:32px}
.parties{margin-bottom:28px;font-size:14px}
.parties strong{font-weight:700}
.summary-table{width:100%;border-collapse:collapse;margin-bottom:28px}
.summary-table td{padding:8px 12px;border:1px solid #ddd;font-size:13px}
.summary-table td:first-child{font-weight:700;background:#f8f8f8;width:200px}
.section{margin-bottom:24px;page-break-inside:avoid}
.section-num{font-size:14px;font-weight:700;margin-bottom:6px;text-transform:uppercase;color:#333}
.section-body{font-size:13px;text-align:justify}
.sig-block{margin-top:48px;display:flex;justify-content:space-between;gap:48px}
.sig-col{flex:1}
.sig-line{border-bottom:1px solid #333;height:50px;margin-bottom:6px;position:relative}
.sig-line img{position:absolute;bottom:4px;left:0;height:44px}
.sig-label{font-size:11px;color:#666}
.sig-date{font-size:12px;margin-top:4px}
.meta{margin-top:32px;padding:16px;background:#f9f9f4;border:1px solid #e0dcc8;border-radius:4px;font-size:10px;color:#666}
.footer{margin-top:48px;text-align:center;font-size:10px;color:#999;border-top:1px solid #ddd;padding-top:16px}
</style></head><body>
<h1>${typeLabel}</h1>
<div class="subtitle">${isLease ? '49 CFR §376.12 Compliant' : 'Independent Contractor Relationship'} — FULLY EXECUTED</div>
<div class="parties">
<p>This agreement is entered into as of <strong>${contract.start_date || '___'}</strong> by and between:</p>
<p style="margin:12px 0"><strong>CARRIER:</strong> ${contract.company_name || '___'}</p>
<p><strong>OWNER-OPERATOR / CONTRACTOR:</strong> ${contract.driver_name || '___'}</p>
</div>
<table class="summary-table">
<tr><td>Agreement Type</td><td>${typeLabel}</td></tr>
<tr><td>Compensation</td><td>${payDesc}</td></tr>
<tr><td>Start Date</td><td>${contract.start_date || 'Upon execution'}</td></tr>
<tr><td>End Date</td><td>${contract.end_date || 'Open-ended'}</td></tr>
<tr><td>Vehicle</td><td>${contract.vehicle_info || 'See Exhibit A'} ${contract.vehicle_vin ? '— VIN: ' + contract.vehicle_vin : ''}</td></tr>
</table>
${sections.map((s, i) => `<div class="section"><div class="section-num">Section ${i+1}: ${s}</div><div class="section-body">${legalText[s] || ''}</div></div>`).join('')}
${contract.custom_terms ? `<div style="background:#f9f9f4;border:1px solid #e0dcc8;padding:16px;border-radius:4px;margin-bottom:28px"><h3 style="font-size:13px;font-weight:700;margin-bottom:6px">Additional Terms</h3><p style="font-size:12px;white-space:pre-wrap">${contract.custom_terms}</p></div>` : ''}
<div class="section"><div class="section-num">Entire Agreement</div><div class="section-body">This Agreement constitutes the entire understanding between the parties and supersedes all prior agreements, negotiations, and discussions. This Agreement may not be amended except by a written instrument signed by both parties.</div></div>
<div class="sig-block">
<div class="sig-col">
<div class="sig-line">${contract.carrier_signature ? `<img src="${contract.carrier_signature}" alt="Carrier Signature"/>` : ''}</div>
<div class="sig-label"><strong>Carrier Authorized Signature</strong></div>
<div class="sig-date">${contract.company_name || '___'}</div>
<div class="sig-date">Date: ${contract.signed_date ? new Date(contract.signed_date).toLocaleDateString() : '___'}</div>
</div>
<div class="sig-col">
<div class="sig-line"><img src="${driverSig}" alt="Driver Signature"/></div>
<div class="sig-label"><strong>Owner-Operator / Contractor Signature</strong></div>
<div class="sig-date">${contract.driver_name || '___'}</div>
<div class="sig-date">Date: ${new Date(driverSignedDate).toLocaleDateString()}</div>
</div>
</div>
<div class="meta">
<strong>Digital Signature Verification</strong><br/>
Carrier signed: ${contract.signed_date ? new Date(contract.signed_date).toISOString() : 'N/A'} | IP: ${contract.carrier_signed_ip || 'N/A'}<br/>
Driver signed: ${driverSignedDate} | IP: ${driverIp} | UA: ${driverUa}
</div>
<div class="footer">
<p>Generated by Qivori AI — Transportation Management System</p>
<p>This is a legally binding document. Both parties have signed electronically.</p>
${isLease ? '<p>Prepared in compliance with 49 CFR §376.12</p>' : ''}
</div>
</body></html>`

  // Upload to Supabase storage
  const path = `contracts/${contract.owner_id}/${contract.id}.html`
  const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/documents/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'text/html',
      'x-upsert': 'true',
    },
    body: html,
  })

  if (uploadRes.ok) {
    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/documents/${path}`
    await supabaseRequest(`driver_contracts?id=eq.${contract.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ pdf_url: publicUrl, pdf_path: path }),
    })
  }
}

// Inline legal sections for API (can't import ES modules in edge functions from src/)
const LEASE_SECTIONS_API = [
  'Equipment Description (VIN, Year, Make, Model)',
  'Lease Duration & Renewal Terms',
  'Compensation Structure (% of revenue, per-mile, or flat)',
  'Fuel, Insurance & Toll Responsibility',
  'Escrow & Deduction Policies',
  'Maintenance & Repair Obligations',
  'Insurance Requirements & Minimums',
  'Cargo Liability',
  '45-Day Settlement Guarantee (FMCSA)',
  'Termination & Return of Equipment',
]
const IC_SECTIONS_API = [
  'Independent Contractor Status (not W-2)',
  'Compensation & Pay Schedule',
  'Tax Obligations (1099)',
  'Insurance Requirements',
  'Equipment & Operating Authority',
  'Load Acceptance / Right to Refuse',
  'Non-Compete / Non-Solicitation',
  'Confidentiality',
  'Termination Terms (30-day notice)',
  'Dispute Resolution & Governing Law',
]
const LEASE_LEGAL_API = {
  'Equipment Description (VIN, Year, Make, Model)': 'The Carrier hereby leases to the Owner-Operator the following described equipment for use in the transportation of property under the Carrier\'s operating authority. The Owner-Operator represents that they are the legal owner of the vehicle described herein and that it is free from all liens and encumbrances unless otherwise noted.',
  'Lease Duration & Renewal Terms': 'This lease agreement shall commence on the Start Date specified above and shall continue for the duration indicated, or if open-ended, shall remain in effect until terminated by either party upon thirty (30) days written notice.',
  'Compensation Structure (% of revenue, per-mile, or flat)': 'The Carrier shall compensate the Owner-Operator according to the pay structure specified in this agreement. Detailed settlement statements shall be provided within fifteen (15) business days of delivery.',
  'Fuel, Insurance & Toll Responsibility': 'The Owner-Operator shall be responsible for all fuel costs, tolls, and scales unless otherwise specified. The Carrier shall maintain primary liability insurance as required by federal regulations.',
  'Escrow & Deduction Policies': 'All deductions must be itemized on each settlement statement. No deductions shall be made without prior written authorization. Upon termination, escrow funds shall be returned within forty-five (45) days.',
  'Maintenance & Repair Obligations': 'The Owner-Operator shall be solely responsible for maintaining the leased equipment in safe operating condition in compliance with all FMCSRs.',
  'Insurance Requirements & Minimums': 'The Carrier shall maintain primary liability insurance meeting 49 CFR §387. The Owner-Operator shall maintain Non-Trucking Liability ($1,000,000 min), Physical Damage/Cargo, and Occupational Accident insurance.',
  'Cargo Liability': 'The Owner-Operator shall exercise due care in handling all cargo and shall be liable for loss or damage caused by negligence.',
  '45-Day Settlement Guarantee (FMCSA)': 'In accordance with 49 CFR §376.12(h), upon termination the Carrier shall provide a final settlement within forty-five (45) days including all compensation owed and return of escrow funds.',
  'Termination & Return of Equipment': 'Either party may terminate upon thirty (30) days written notice. The Carrier may terminate immediately for cause. Owner-Operator equipment shall be released upon completion of final settlement.',
}
const IC_LEGAL_API = {
  'Independent Contractor Status (not W-2)': 'The Owner-Operator is an independent contractor, not an employee. The Owner-Operator controls the manner and means of performing transportation services.',
  'Compensation & Pay Schedule': 'Settlement statements shall be issued weekly with payment within seven (7) business days. Each settlement shall itemize gross revenue, surcharges, and deductions.',
  'Tax Obligations (1099)': 'The Owner-Operator is solely responsible for all taxes. The Carrier shall issue Form 1099-NEC annually.',
  'Insurance Requirements': 'The Owner-Operator shall maintain Commercial Auto Liability ($1M), Cargo ($100K), Workers\' Comp/OA, and General Liability ($1M) insurance.',
  'Equipment & Operating Authority': 'The Owner-Operator shall provide all equipment necessary and maintain it in compliance with FMCSA regulations.',
  'Load Acceptance / Right to Refuse': 'The Owner-Operator has the unrestricted right to accept or reject any load without penalty.',
  'Non-Compete / Non-Solicitation': 'During the term and twelve (12) months after, the Owner-Operator agrees not to directly solicit Carrier\'s customers established through the Carrier.',
  'Confidentiality': 'The Owner-Operator shall maintain confidentiality of all proprietary information for two (2) years after termination.',
  'Termination Terms (30-day notice)': 'Either party may terminate upon thirty (30) days written notice. Final settlement within forty-five (45) days.',
  'Dispute Resolution & Governing Law': 'Disputes shall first go to mediation, then binding arbitration under AAA rules. Governed by federal transportation law and the state of the Carrier\'s principal office.',
}
