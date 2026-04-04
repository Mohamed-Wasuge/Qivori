// ═══════════════════════════════════════════════════════════════════════════════
// FLEET STATE ENGINE — Real-time truck/driver availability
// GET  → returns fleet status for dashboard
// POST → update truck status (from ELD sync, driver app, or AI)
// ═══════════════════════════════════════════════════════════════════════════════

import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'
import {
  sbQuery, sbInsert, sbUpsert, sbUpdate,
  getFleetStatus, getAvailableTrucks, updateTruckStatus,
  logEvent, recordFailure, QError,
} from './_lib/q-engine.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsRes = handleCors(req)
  if (corsRes) return corsRes

  const authErr = await requireAuth(req)
  if (authErr) return authErr
  const user = req._user

  try {
    if (req.method === 'GET') {
      return handleGet(user)
    } else if (req.method === 'POST') {
      const body = await req.json()
      return handlePost(user, body)
    } else if (req.method === 'PATCH') {
      const body = await req.json()
      return handlePatch(user, body)
    }
    return json({ error: 'Method not allowed' }, 405)
  } catch (err) {
    console.error('[fleet-state] Error:', err.message)
    return json({ error: err.message }, 500)
  }
}

// ── GET: Fleet overview ───────────────────────────────────────────────────────
async function handleGet(user) {
  const fleet = await getFleetStatus(user.id)
  const available = fleet.filter(t => t.status === 'READY_FOR_LOAD' || t.status === 'EMPTY')
  const inTransit = fleet.filter(t => ['IN_TRANSIT_TO_PICKUP', 'IN_TRANSIT', 'LOADED'].includes(t.status))
  const atStop = fleet.filter(t => ['AT_PICKUP', 'AT_DELIVERY'].includes(t.status))
  const booked = fleet.filter(t => ['BOOKED', 'WAITING_DRIVER_RESPONSE', 'NEGOTIATING'].includes(t.status))
  const unavailable = fleet.filter(t => t.status === 'UNAVAILABLE' || t.status === 'ISSUE_REPORTED')

  return json({
    ok: true,
    summary: {
      total: fleet.length,
      available: available.length,
      inTransit: inTransit.length,
      atStop: atStop.length,
      booked: booked.length,
      unavailable: unavailable.length,
    },
    trucks: fleet,
  })
}

// ── POST: Initialize truck status (called when vehicle is added or on first sync)
async function handlePost(user, body) {
  const { vehicleId, driverId, trailerType, maxWeight, preferredMaxWeight, currentCity, currentState } = body
  if (!vehicleId) return json({ error: 'vehicleId required' }, 400)

  const existing = await sbQuery('truck_status', `owner_id=eq.${user.id}&vehicle_id=eq.${vehicleId}`)
  if (existing?.length > 0) {
    return json({ ok: true, message: 'Truck status already exists', truck: existing[0] })
  }

  const rows = await sbInsert('truck_status', {
    owner_id: user.id,
    vehicle_id: vehicleId,
    driver_id: driverId || null,
    status: 'EMPTY',
    trailer_type: trailerType || 'Dry Van',
    max_weight: maxWeight || 45000,
    preferred_max_weight: preferredMaxWeight || 37000,
    current_city: currentCity || null,
    current_state: currentState || null,
    status_changed_at: new Date().toISOString(),
  })

  return json({ ok: true, truck: rows?.[0] })
}

// ── PATCH: Update truck status ────────────────────────────────────────────────
async function handlePatch(user, body) {
  const { vehicleId, status, statusReason, loadId, driverId, currentCity, currentState,
          lat, lng, pickupEta, deliveryEta, availableAt, nextAvailableCity,
          hosData } = body

  if (!vehicleId) return json({ error: 'vehicleId required' }, 400)
  if (!status) return json({ error: 'status required' }, 400)

  const validStatuses = [
    'READY_FOR_LOAD', 'WAITING_DRIVER_RESPONSE', 'NEGOTIATING', 'BOOKED',
    'IN_TRANSIT_TO_PICKUP', 'AT_PICKUP', 'LOADED', 'IN_TRANSIT',
    'AT_DELIVERY', 'EMPTY', 'UNAVAILABLE', 'ISSUE_REPORTED',
  ]
  if (!validStatuses.includes(status)) {
    return json({ error: `Invalid status. Valid: ${validStatuses.join(', ')}` }, 400)
  }

  const result = await updateTruckStatus(user.id, vehicleId, status, {
    statusReason, currentLoadId: loadId, currentCity, currentState,
    lat, lng, pickupEta, deliveryEta, availableAt, nextAvailableCity,
    hosData, loadId,
  })

  // If driver assigned, update driver association
  if (driverId) {
    await sbUpdate('truck_status', `owner_id=eq.${user.id}&vehicle_id=eq.${vehicleId}`, {
      driver_id: driverId,
    }).catch(err => console.error('[fleet-state] Failed to update driver:', err.message))
  }

  return json({ ok: true, ...result })
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
