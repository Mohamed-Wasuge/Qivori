import { handleCors, corsHeaders, verifyAuth } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

const FMCSA_BASE = 'https://mobile.fmcsa.dot.gov/qc/services'

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'GET') {
    return Response.json({ error: 'GET only' }, { status: 405, headers: corsHeaders(req) })
  }

  const { user } = await verifyAuth(req)
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders(req) })
  }

  const ip = getClientIP(req)
  const { limited, resetMs } = rateLimit(`fmcsa:${ip}`, 30, 60000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  const url = new URL(req.url)
  const dotNumber = url.searchParams.get('dot')
  const mcNumber = url.searchParams.get('mc')
  const query = url.searchParams.get('q') // company name search

  const webKey = process.env.FMCSA_WEBKEY
  if (!webKey) {
    return Response.json({ error: 'FMCSA_WEBKEY not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    let carrierData = null

    if (dotNumber) {
      // Lookup by DOT number
      carrierData = await fetchCarrierByDOT(dotNumber, webKey)
    } else if (mcNumber) {
      // Lookup by MC/MX docket number
      carrierData = await fetchCarrierByMC(mcNumber, webKey)
    } else if (query) {
      // Search by company name
      const results = await searchCarrierByName(query, webKey)
      return Response.json({ results }, { headers: { ...corsHeaders(req), 'Cache-Control': 'public, max-age=3600' } })
    } else {
      return Response.json({ error: 'Provide ?dot=, ?mc=, or ?q= parameter' }, { status: 400, headers: corsHeaders(req) })
    }

    if (!carrierData) {
      return Response.json({ error: 'Carrier not found' }, { status: 404, headers: corsHeaders(req) })
    }

    // Fetch BASIC scores
    const basics = await fetchBasics(carrierData.dotNumber, webKey).catch(() => null)

    return Response.json({
      carrier: carrierData,
      basics: basics || [],
      inspections: carrierData._inspections || { total: 0, vehicle: 0, driver: 0, hazmat: 0, iep: 0, reviews: 0, crashes: { total: 0, fatal: 0, injury: 0, tow: 0 }, oosCount: { vehicle: 0, driver: 0, hazmat: 0 }, oosRates: { vehicle: 0, driver: 0, hazmat: 0 }, nationalAvgOos: { vehicle: 20.72, driver: 5.51, hazmat: 4.5 } },
    }, {
      headers: { ...corsHeaders(req), 'Cache-Control': 'public, max-age=3600' }
    })
  } catch (err) {
    console.error('FMCSA lookup error:', err)
    return Response.json({ error: 'FMCSA lookup failed: ' + (err.message || 'Unknown error') }, { status: 500, headers: corsHeaders(req) })
  }
}

// ── Fetch carrier by DOT number ──
async function fetchCarrierByDOT(dot, webKey) {
  const res = await fetch(`${FMCSA_BASE}/carriers/${dot}?webKey=${webKey}`)
  if (!res.ok) return null
  const data = await res.json()
  return parseCarrier(data?.content?.carrier)
}

// ── Fetch carrier by MC/MX docket number ──
async function fetchCarrierByMC(mc, webKey) {
  const cleanMC = mc.replace(/[^0-9]/g, '')
  const res = await fetch(`${FMCSA_BASE}/carriers/docket-number/${cleanMC}?webKey=${webKey}`)
  if (!res.ok) return null
  const data = await res.json()
  // MC lookup returns content as array of { carrier: {...} } objects
  const content = data?.content
  if (Array.isArray(content) && content.length > 0) {
    return parseCarrier(content[0]?.carrier || content[0])
  }
  if (content?.carrier) {
    return parseCarrier(content.carrier)
  }
  return null
}

// ── Search carriers by name ──
async function searchCarrierByName(name, webKey) {
  const encoded = encodeURIComponent(name)
  const res = await fetch(`${FMCSA_BASE}/carriers/name/${encoded}?webKey=${webKey}`)
  if (!res.ok) return []
  const data = await res.json()
  const carriers = data?.content?.carrier || data?.content || []
  const list = Array.isArray(carriers) ? carriers : [carriers]
  return list.slice(0, 20).map(parseCarrier).filter(Boolean)
}

// ── Fetch BASIC scores (SMS data) ──
async function fetchBasics(dot, webKey) {
  const res = await fetch(`${FMCSA_BASE}/carriers/${dot}/basics?webKey=${webKey}`)
  if (!res.ok) return []
  const data = await res.json()
  const basics = data?.content?.basics?.basic || data?.content?.basic || []
  const list = Array.isArray(basics) ? basics : [basics]
  return list.map(b => ({
    name: b.basicsType || b.basicName || '',
    score: parseFloat(b.basicsValue || b.percentile || 0),
    threshold: parseFloat(b.basicsThreshold || b.threshold || 0),
    totalViolations: parseInt(b.totalViolations || 0),
    totalInspections: parseInt(b.totalInspections || 0),
    serious: b.seriousViolation === 'Y' || b.seriousViolation === true,
  }))
}

// ── Parse raw FMCSA carrier data into clean object ──
function parseCarrier(raw) {
  if (!raw) return null

  // Extract inspection/crash data — FMCSA includes this in the carrier record
  const vehicleInsp = parseInt(raw.vehicleInsp || 0)
  const driverInsp = parseInt(raw.driverInsp || 0)
  const hazmatInsp = parseInt(raw.hazmatInsp || 0)
  const vehicleOos = parseInt(raw.vehicleOosInsp || 0)
  const driverOos = parseInt(raw.driverOosInsp || 0)
  const hazmatOos = parseInt(raw.hazmatOosInsp || 0)

  const _inspections = {
    total: vehicleInsp + driverInsp,
    vehicle: vehicleInsp,
    driver: driverInsp,
    hazmat: hazmatInsp,
    iep: 0,
    reviews: 0,
    crashes: {
      total: parseInt(raw.crashTotal || 0),
      fatal: parseInt(raw.fatalCrash || 0),
      injury: parseInt(raw.injCrash || 0),
      tow: parseInt(raw.towawayCrash || raw.towCrash || 0),
    },
    oosCount: {
      vehicle: vehicleOos,
      driver: driverOos,
      hazmat: hazmatOos,
    },
    oosRates: {
      vehicle: parseFloat(raw.vehicleOosRate || 0),
      driver: parseFloat(raw.driverOosRate || 0),
      hazmat: parseFloat(raw.hazmatOosRate || 0),
    },
    nationalAvgOos: {
      vehicle: parseFloat(raw.vehicleOosRateNationalAverage || 20.72),
      driver: parseFloat(raw.driverOosRateNationalAverage || 5.51),
      hazmat: parseFloat(raw.hazmatOosRateNationalAverage || 4.5),
    },
  }

  return {
    dotNumber: raw.dotNumber || raw.dot_number || '',
    mcNumber: raw.mcNumber || raw.mc_number || raw.docketNumber || '',
    legalName: raw.legalName || raw.legal_name || '',
    dbaName: raw.dbaName || raw.dba_name || '',
    entityType: raw.carrierOperation?.carrierOperationDesc || raw.entityType || '',
    operationType: raw.operationType || '',
    // Address
    phyStreet: raw.phyStreet || '',
    phyCity: raw.phyCity || '',
    phyState: raw.phyState || '',
    phyZip: raw.phyZipcode || raw.phyZip || '',
    phyCountry: raw.phyCountry || 'US',
    phone: raw.telephone || raw.phone || '',
    // Status
    statusCode: raw.statusCode || '',
    allowedToOperate: raw.allowedToOperate === 'Y' || raw.allowedToOperate === true,
    bipdInsuranceOnFile: parseFloat(raw.bipdInsuranceOnFile || raw.bipdInsurance || 0),
    bipdInsuranceRequired: parseFloat(raw.bipdRequiredAmount || raw.bipdInsuranceRequired || raw.bipdRequired || 0),
    bondInsuranceOnFile: parseFloat(raw.bondInsuranceOnFile || 0),
    cargoInsuranceOnFile: parseFloat(raw.cargoInsuranceOnFile || raw.cargoInsurance || 0),
    // Fleet
    totalDrivers: parseInt(raw.totalDrivers || 0),
    totalPowerUnits: parseInt(raw.totalPowerUnits || 0),
    // Safety
    safetyRating: raw.safetyRating || raw.safetyReviewRating || 'Not Rated',
    safetyRatingDate: raw.safetyRatingDate || raw.reviewDate || '',
    safetyReviewType: raw.safetyReviewType || '',
    // Operation classification
    isPassengerCarrier: raw.passengerCarrier === 'Y' || raw.isPassengerCarrier === 'Y',
    isHHGCarrier: raw.hhgCarrier === 'Y',
    isPrivateCarrier: raw.privateCarrier === 'Y',
    isInterstate: raw.interstateCarrier === 'Y' || raw.carrierOperation?.carrierOperationCode === 'A',
    // Dates
    addDate: raw.addDate || '',
    oicDate: raw.oicDate || '',
    mcs150Date: raw.mcs150FormDate || raw.mcs150Date || '',
    mcs150Mileage: parseInt(raw.mcs150Mileage || raw.mcs150Miles || 0),
    mcs150MileageYear: raw.mcs150MileageYear || raw.mcs150Year || '',
    // Inspection data (extracted from carrier record)
    _inspections,
  }
}
