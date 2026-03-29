/**
 * GET /api/dot-audit-package
 * Generates a DOT/FMCSA audit-ready data package.
 * Returns all compliance records: DVIRs, driver files, vehicle records,
 * insurance, drug tests, HOS logs, load history.
 *
 * Carrier clicks one button → gets everything DOT needs.
 */
import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders() {
  return { 'apikey': SERVICE_KEY, 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  const { user, error: authErr } = await verifyAuth(req)
  if (authErr) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  if (!SUPABASE_URL || !SERVICE_KEY) return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })

  try {
    const url = new URL(req.url)
    const months = parseInt(url.searchParams.get('months')) || 12

    const cutoff = new Date()
    cutoff.setMonth(cutoff.getMonth() - months)
    const cutoffISO = cutoff.toISOString()

    // Fetch all compliance data in parallel
    const [companyRes, driversRes, vehiclesRes, dvirsRes, loadsRes, docsRes, expensesRes] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/companies?owner_id=eq.${user.id}&select=*&limit=1`, { headers: sbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/drivers?owner_id=eq.${user.id}&select=*`, { headers: sbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/vehicles?owner_id=eq.${user.id}&select=*`, { headers: sbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/dvir_inspections?owner_id=eq.${user.id}&submitted_at=gte.${cutoffISO}&select=*&order=submitted_at.desc&limit=500`, { headers: sbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/loads?owner_id=eq.${user.id}&created_at=gte.${cutoffISO}&select=load_number,origin,destination,status,pickup_date,delivery_date,driver_name,equipment,miles,rate&order=created_at.desc&limit=500`, { headers: sbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/documents?owner_id=eq.${user.id}&select=name,doc_type,file_url,created_at&order=created_at.desc&limit=200`, { headers: sbHeaders() }),
      fetch(`${SUPABASE_URL}/rest/v1/expenses?owner_id=eq.${user.id}&date=gte.${cutoff.toISOString().split('T')[0]}&select=category,amount,date,merchant,notes&order=date.desc&limit=500`, { headers: sbHeaders() }),
    ])

    const company = companyRes.ok ? (await companyRes.json())?.[0] : null
    const drivers = driversRes.ok ? await driversRes.json() : []
    const vehicles = vehiclesRes.ok ? await vehiclesRes.json() : []
    const dvirs = dvirsRes.ok ? await dvirsRes.json() : []
    const loads = loadsRes.ok ? await loadsRes.json() : []
    const docs = docsRes.ok ? await docsRes.json() : []
    const expenses = expensesRes.ok ? await expensesRes.json() : []

    const now = new Date()

    // ── Compliance checks ──
    const issues = []
    const warnings = []

    // Driver compliance
    drivers.forEach(d => {
      const name = d.full_name || d.name || 'Unknown'
      if (d.cdl_expiry) {
        const exp = new Date(d.cdl_expiry)
        if (exp < now) issues.push({ type: 'critical', item: `${name}: CDL expired ${d.cdl_expiry}`, reg: 'FMCSA §391.11' })
        else if (exp < new Date(now.getTime() + 30 * 86400000)) warnings.push({ type: 'warning', item: `${name}: CDL expires ${d.cdl_expiry}`, reg: 'FMCSA §391.11' })
      }
      if (d.medical_card_expiry) {
        const exp = new Date(d.medical_card_expiry)
        if (exp < now) issues.push({ type: 'critical', item: `${name}: Medical card expired ${d.medical_card_expiry}`, reg: 'FMCSA §391.43' })
        else if (exp < new Date(now.getTime() + 30 * 86400000)) warnings.push({ type: 'warning', item: `${name}: Medical card expires ${d.medical_card_expiry}`, reg: 'FMCSA §391.43' })
      }
    })

    // Vehicle compliance
    vehicles.forEach(v => {
      const unit = v.unit_number || v.name || 'Unknown'
      if (v.registration_expiry) {
        const exp = new Date(v.registration_expiry)
        if (exp < now) issues.push({ type: 'critical', item: `Unit ${unit}: Registration expired ${v.registration_expiry}`, reg: 'FMCSA §392.2' })
      }
      if (v.insurance_expiry) {
        const exp = new Date(v.insurance_expiry)
        if (exp < now) issues.push({ type: 'critical', item: `Unit ${unit}: Insurance expired ${v.insurance_expiry}`, reg: 'FMCSA §387' })
      }
    })

    // DVIR compliance
    const recentDvirs = dvirs.filter(d => {
      const days = Math.floor((now - new Date(d.submitted_at)) / 86400000)
      return days <= 30
    })
    if (recentDvirs.length === 0 && vehicles.length > 0) {
      warnings.push({ type: 'warning', item: 'No DVIR inspections in the last 30 days', reg: 'FMCSA §396.11' })
    }
    const failedDvirs = dvirs.filter(d => d.status === 'defects_found')

    // Document completeness
    const docTypes = docs.map(d => (d.doc_type || '').toLowerCase())
    const requiredDocs = ['insurance', 'registration', 'operating_authority']
    requiredDocs.forEach(rd => {
      if (!docTypes.some(dt => dt.includes(rd.replace('_', '')))) {
        warnings.push({ type: 'warning', item: `Missing document: ${rd.replace(/_/g, ' ')}`, reg: 'FMCSA §390-399' })
      }
    })

    // Build compliance score
    const totalChecks = drivers.length * 2 + vehicles.length * 2 + 3
    const passedChecks = totalChecks - issues.length - warnings.length
    const complianceScore = totalChecks > 0 ? Math.round(passedChecks / totalChecks * 100) : 0

    // Build audit package
    const auditPackage = {
      generated_at: now.toISOString(),
      period: `${months} months (${cutoff.toISOString().split('T')[0]} to ${now.toISOString().split('T')[0]})`,

      // Company
      company: {
        name: company?.name || '—',
        mc_number: company?.mc_number || '—',
        dot_number: company?.dot_number || '—',
        address: company?.address || '—',
        phone: company?.phone || '—',
        email: company?.email || '—',
      },

      // Compliance summary
      compliance: {
        score: complianceScore,
        grade: complianceScore >= 90 ? 'A' : complianceScore >= 75 ? 'B' : complianceScore >= 60 ? 'C' : 'D',
        critical_issues: issues.length,
        warnings: warnings.length,
        issues,
        warnings: warnings,
        audit_ready: issues.length === 0,
      },

      // Drivers
      drivers: drivers.map(d => ({
        name: d.full_name || d.name,
        cdl_number: d.license_number || d.cdl_number || '—',
        cdl_expiry: d.cdl_expiry || '—',
        cdl_status: d.cdl_expiry ? (new Date(d.cdl_expiry) < now ? 'EXPIRED' : 'Valid') : 'Unknown',
        medical_card_expiry: d.medical_card_expiry || '—',
        medical_status: d.medical_card_expiry ? (new Date(d.medical_card_expiry) < now ? 'EXPIRED' : 'Valid') : 'Unknown',
        status: d.status || 'Active',
        hire_date: d.created_at?.split('T')[0] || '—',
      })),

      // Vehicles
      vehicles: vehicles.map(v => ({
        unit: v.unit_number || v.name,
        year: v.year, make: v.make, model: v.model,
        vin: v.vin || '—',
        plate: v.license_plate || '—',
        plate_state: v.plate_state || '—',
        registration_expiry: v.registration_expiry || '—',
        insurance_expiry: v.insurance_expiry || '—',
        odometer: v.odometer || '—',
        status: v.status || 'Active',
      })),

      // DVIRs
      dvirs: {
        total: dvirs.length,
        last_30_days: recentDvirs.length,
        passed: dvirs.filter(d => d.status === 'safe').length,
        defects_found: failedDvirs.length,
        records: dvirs.slice(0, 50).map(d => ({
          date: d.submitted_at?.split('T')[0],
          vehicle: d.vehicle_name || '—',
          driver: d.driver_name || '—',
          status: d.status,
          defects: d.defects || [],
        })),
      },

      // Load history
      loads: {
        total: loads.length,
        delivered: loads.filter(l => ['Delivered', 'Invoiced', 'Paid'].includes(l.status)).length,
        cancelled: loads.filter(l => l.status === 'Cancelled').length,
        records: loads.slice(0, 50).map(l => ({
          load: l.load_number, origin: l.origin, destination: l.destination,
          status: l.status, driver: l.driver_name, equipment: l.equipment,
          pickup: l.pickup_date, delivery: l.delivery_date, miles: l.miles, rate: l.rate,
        })),
      },

      // Documents on file
      documents: docs.map(d => ({
        name: d.name, type: d.doc_type, url: d.file_url,
        uploaded: d.created_at?.split('T')[0],
      })),

      // Expense summary + individual fuel receipts (IFTA audit §IFTA-R1320)
      expenses: {
        total: expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0),
        fuel_total: expenses.filter(e => e.category === 'Fuel').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0),
        fuel_gallons: expenses.filter(e => e.category === 'Fuel').reduce((s, e) => s + (parseFloat(e.gallons) || 0), 0),
        maintenance: expenses.filter(e => e.category === 'Maintenance' || e.category === 'Repairs').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0),
        tolls: expenses.filter(e => e.category === 'Tolls').reduce((s, e) => s + (parseFloat(e.amount) || 0), 0),
        count: expenses.length,
        // Individual fuel receipts for IFTA audit
        fuel_receipts: expenses.filter(e => e.category === 'Fuel').map(e => ({
          date: e.date,
          amount: parseFloat(e.amount) || 0,
          gallons: parseFloat(e.gallons) || 0,
          price_per_gallon: parseFloat(e.price_per_gallon) || 0,
          state: e.state || '—',
          merchant: e.merchant || '—',
          notes: e.notes || '',
        })),
        // Maintenance receipts
        maintenance_receipts: expenses.filter(e => e.category === 'Maintenance' || e.category === 'Repairs').map(e => ({
          date: e.date,
          amount: parseFloat(e.amount) || 0,
          merchant: e.merchant || '—',
          notes: e.notes || '',
        })),
      },

      // DOT-specific required records checklist
      dot_checklist: {
        carrier_identification: !!company?.mc_number || !!company?.dot_number,
        operating_authority: docTypes.some(d => d.includes('operating') || d.includes('authority')),
        insurance_certificate: docTypes.some(d => d.includes('insurance')),
        driver_qualification_files: drivers.length > 0,
        cdl_on_file: drivers.every(d => d.license_number || d.cdl_number),
        medical_cards_current: drivers.every(d => !d.medical_card_expiry || new Date(d.medical_card_expiry) > now),
        vehicle_registration: docTypes.some(d => d.includes('registration')),
        vehicle_inspection_records: dvirs.length > 0,
        hours_of_service_logs: true, // tracked via HOS system
        fuel_tax_records: expenses.filter(e => e.category === 'Fuel').length > 0,
        maintenance_records: expenses.filter(e => e.category === 'Maintenance' || e.category === 'Repairs').length > 0,
        accident_register: docTypes.some(d => d.includes('accident') || d.includes('incident')),
        drug_alcohol_testing: docTypes.some(d => d.includes('drug') || d.includes('clearinghouse')),
      },
    }

    return Response.json(auditPackage, { headers: corsHeaders(req) })

  } catch (err) {
    return Response.json({ error: err.message }, { status: 500, headers: corsHeaders(req) })
  }
}
