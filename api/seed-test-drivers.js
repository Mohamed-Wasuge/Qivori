// api/seed-test-drivers.js — Create realistic test drivers for auto-book testing
import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

function sbHeaders() {
  return {
    'apikey': SERVICE_KEY,
    'Authorization': `Bearer ${SERVICE_KEY}`,
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  }
}

const TEST_DRIVERS = [
  {
    full_name: 'Marcus Johnson',
    phone: '+15551001001',
    email: 'marcus.j@testdriver.com',
    license_number: 'CDL-IL-8834721',
    license_state: 'IL',
    license_class: 'CDL-A',
    license_expiry: '2027-08-15',
    medical_card_expiry: '2027-03-01',
    endorsements: 'H, N, T',
    equipment_experience: 'Dry Van, Reefer, Flatbed',
    years_experience: 12,
    status: 'Active',
    driver_type: 'owner_operator',
    pay_model: 'percent',
    pay_rate: 50,
    hire_date: '2024-06-01',
    address: '1420 S Michigan Ave, Chicago, IL 60605',
    emergency_contact_name: 'Lisa Johnson',
    emergency_contact_phone: '+15551001002',
  },
  {
    full_name: 'David Rodriguez',
    phone: '+15552002001',
    email: 'david.r@testdriver.com',
    license_number: 'CDL-TX-5567890',
    license_state: 'TX',
    license_class: 'CDL-A',
    license_expiry: '2027-11-20',
    medical_card_expiry: '2027-06-15',
    endorsements: 'H, T',
    equipment_experience: 'Dry Van, Reefer',
    years_experience: 8,
    status: 'Active',
    driver_type: 'owner_operator',
    pay_model: 'percent',
    pay_rate: 50,
    hire_date: '2025-01-15',
    address: '2800 Live Oak St, Dallas, TX 75204',
    emergency_contact_name: 'Maria Rodriguez',
    emergency_contact_phone: '+15552002002',
  },
  {
    full_name: 'James Williams',
    phone: '+15553003001',
    email: 'james.w@testdriver.com',
    license_number: 'CDL-GA-3345678',
    license_state: 'GA',
    license_class: 'CDL-A',
    license_expiry: '2028-02-10',
    medical_card_expiry: '2027-09-20',
    endorsements: 'N, T, X',
    equipment_experience: 'Flatbed, Step Deck, Dry Van',
    years_experience: 15,
    status: 'Active',
    driver_type: 'company_driver',
    pay_model: 'permile',
    pay_rate: 0.65,
    hire_date: '2023-11-01',
    address: '456 Peachtree St NE, Atlanta, GA 30308',
    emergency_contact_name: 'Keisha Williams',
    emergency_contact_phone: '+15553003002',
  },
  {
    full_name: 'Robert Chen',
    phone: '+15554004001',
    email: 'robert.c@testdriver.com',
    license_number: 'CDL-CA-7712345',
    license_state: 'CA',
    license_class: 'CDL-A',
    license_expiry: '2027-06-30',
    medical_card_expiry: '2027-01-15',
    endorsements: 'H, N, T, X',
    equipment_experience: 'Reefer, Dry Van, Power Only',
    years_experience: 10,
    status: 'Active',
    driver_type: 'owner_operator',
    pay_model: 'percent',
    pay_rate: 50,
    hire_date: '2024-03-20',
    address: '789 S Broadway, Los Angeles, CA 90014',
    emergency_contact_name: 'Amy Chen',
    emergency_contact_phone: '+15554004002',
  },
  {
    full_name: 'Andre Washington',
    phone: '+15555005001',
    email: 'andre.w@testdriver.com',
    license_number: 'CDL-MI-2298765',
    license_state: 'MI',
    license_class: 'CDL-A',
    license_expiry: '2028-04-01',
    medical_card_expiry: '2027-12-10',
    endorsements: 'T',
    equipment_experience: 'Dry Van, Step Deck',
    years_experience: 5,
    status: 'Active',
    driver_type: 'company_driver',
    pay_model: 'percent',
    pay_rate: 30,
    hire_date: '2025-07-10',
    address: '321 Woodward Ave, Detroit, MI 48226',
    emergency_contact_name: 'Sharon Washington',
    emergency_contact_phone: '+15555005002',
  },
]

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse

  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  if (!SUPABASE_URL || !SERVICE_KEY) {
    return Response.json({ error: 'Not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    // Check if test drivers already exist
    const checkRes = await fetch(
      `${SUPABASE_URL}/rest/v1/drivers?owner_id=eq.${user.id}&email=like.*testdriver.com&select=id,full_name`,
      { headers: sbHeaders() }
    )
    const existing = checkRes.ok ? await checkRes.json() : []

    if (existing.length >= 5) {
      return Response.json({
        ok: true,
        message: 'Test drivers already exist',
        drivers: existing,
        created: 0,
      }, { headers: corsHeaders(req) })
    }

    // Remove any partial test drivers first
    if (existing.length > 0) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/drivers?owner_id=eq.${user.id}&email=like.*testdriver.com`,
        { method: 'DELETE', headers: { ...sbHeaders(), 'Prefer': 'return=minimal' } }
      )
    }

    // Insert all test drivers (try full schema first, fallback to base columns)
    const records = TEST_DRIVERS.map(d => ({ ...d, owner_id: user.id }))
    let insertRes = await fetch(`${SUPABASE_URL}/rest/v1/drivers`, {
      method: 'POST',
      headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
      body: JSON.stringify(records),
    })

    // If full insert fails (missing columns), retry with only base schema columns
    if (!insertRes.ok) {
      const errText = await insertRes.text()
      const BASE_FIELDS = ['full_name','email','phone','license_number','license_state','license_expiry','medical_card_expiry','status','hire_date','notes',
        'driver_type','pay_model','pay_rate', // from migrations
        'license_class','endorsements','equipment_experience','years_experience','address','emergency_contact_name','emergency_contact_phone'] // from new migration

      // Strip unknown columns by probing which ones exist
      const baseRecords = TEST_DRIVERS.map(d => {
        const rec = { owner_id: user.id, full_name: d.full_name, email: d.email, phone: d.phone,
          license_number: d.license_number, license_state: d.license_state, license_expiry: d.license_expiry,
          medical_card_expiry: d.medical_card_expiry, status: d.status, hire_date: d.hire_date }
        // Try adding migrated columns
        if (d.driver_type) rec.driver_type = d.driver_type
        if (d.pay_model) rec.pay_model = d.pay_model
        if (d.pay_rate != null) rec.pay_rate = d.pay_rate
        return rec
      })

      insertRes = await fetch(`${SUPABASE_URL}/rest/v1/drivers`, {
        method: 'POST',
        headers: { ...sbHeaders(), 'Prefer': 'return=representation' },
        body: JSON.stringify(baseRecords),
      })

      if (!insertRes.ok) {
        const err2 = await insertRes.text()
        return Response.json({
          error: 'Insert failed — run supabase-driver-autobook-columns.sql migration first',
          detail: err2,
          original_error: errText,
        }, { status: 500, headers: corsHeaders(req) })
      }
    }

    const created = await insertRes.json()

    return Response.json({
      ok: true,
      message: `Created ${created.length} test drivers`,
      drivers: created.map(d => ({
        id: d.id,
        name: d.full_name,
        type: d.driver_type,
        equipment: d.equipment_experience,
        state: d.license_state,
        experience: d.years_experience + ' years',
      })),
      created: created.length,
    }, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: err.message || 'Seed failed' }, { status: 500, headers: corsHeaders(req) })
  }
}
