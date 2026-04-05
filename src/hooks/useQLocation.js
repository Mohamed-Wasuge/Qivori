import { useState, useEffect, useRef, useCallback } from 'react'
import { haversine } from '../components/mobile/shared'

// ── Geocode cache — survives re-renders, cleared on page reload ──
const geocodeCache = {}

async function geocodeCity(cityName) {
  if (!cityName) return null
  // Normalize: take first part before comma for cleaner geocoding
  const key = cityName.trim().toLowerCase()
  if (geocodeCache[key]) return geocodeCache[key]
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName.split(',')[0].trim())}&count=1&language=en&format=json`
    )
    const data = await res.json()
    if (data.results?.[0]) {
      const coords = { lat: data.results[0].latitude, lng: data.results[0].longitude }
      geocodeCache[key] = coords
      return coords
    }
  } catch {}
  return null
}

// ── Get pickup/delivery coordinates for a load (from fields or geocoding) ──
async function getLoadCoords(load) {
  let pickup = null
  let delivery = null

  // Try stored coordinates first
  if (load.origin_lat && load.origin_lng) {
    pickup = { lat: Number(load.origin_lat), lng: Number(load.origin_lng) }
  }
  if (load.dest_lat && load.dest_lng) {
    delivery = { lat: Number(load.dest_lat), lng: Number(load.dest_lng) }
  }

  // Fall back to geocoding city names
  if (!pickup && load.origin) {
    pickup = await geocodeCity(load.origin)
  }
  if (!delivery && (load.destination || load.dest)) {
    delivery = await geocodeCity(load.destination || load.dest)
  }

  return { pickup, delivery }
}

// ── Geofence radii (miles) ──
const ARRIVAL_RADIUS = 0.3      // 0.3 miles = ~500 meters
const DEPARTURE_RADIUS = 0.5    // Slightly larger to avoid false departure
const DVIR_RADIUS = 0.15        // ~250 meters from yard
const HIGH_ACCURACY_RADIUS = 5  // Switch to high accuracy within 5 miles
const DWELL_TIME_MS = 60_000    // 60 seconds inside geofence before triggering arrival
const DETENTION_TIME_MS = 7_200_000 // 2 hours for detention

/**
 * useQLocation — Q's autonomous location engine
 *
 * Continuously tracks driver GPS and checks geofences against active loads.
 * Fires callbacks when the driver arrives at pickup/delivery, departs, or
 * triggers detention. Handles geocoding, battery optimization, and dwell time.
 */
export default function useQLocation({
  activeLoads = [],
  allLoads = [],
  enabled = false,
  companyAddress = null,
  onArrivedAtPickup,
  onArrivedAtDelivery,
  onDepartedPickup,
  onDepartedDelivery,
  onDetentionStart,
  onNearYard,
  onDispatchedLoad,
}) {
  const [position, setPosition] = useState({ lat: null, lng: null, accuracy: null, watching: false, lastUpdate: null })
  const watchIdRef = useRef(null)
  const geofenceStateRef = useRef({})       // { [loadId]: { ... } }
  const cooldownRef = useRef({})             // { [loadId_event]: timestamp }
  const prevLoadIdsRef = useRef(new Set())
  const yardCoordsRef = useRef(null)
  const dvirDismissedRef = useRef(new Set()) // Track dismissed DVIR prompts per load
  const useHighAccuracyRef = useRef(false)
  const geocodingInProgressRef = useRef({})  // Prevent duplicate geocoding

  // ── Cooldown check: prevent re-firing same event within 5 minutes ──
  const isCoolingDown = useCallback((loadId, event) => {
    const key = `${loadId}_${event}`
    const last = cooldownRef.current[key]
    if (last && Date.now() - last < 300_000) return true
    return false
  }, [])

  const setCooldown = useCallback((loadId, event) => {
    cooldownRef.current[`${loadId}_${event}`] = Date.now()
  }, [])

  // ── Detect new dispatched loads ──
  useEffect(() => {
    if (!enabled) return
    const currentIds = new Set(activeLoads.map(l => l.id || l.load_id))
    for (const load of activeLoads) {
      const lid = load.id || load.load_id
      const status = (load.status || '').toLowerCase()
      if (!prevLoadIdsRef.current.has(lid) && (status === 'dispatched' || status === 'assigned to driver')) {
        onDispatchedLoad?.(load)
      }
    }
    prevLoadIdsRef.current = currentIds
  }, [activeLoads, enabled, onDispatchedLoad])

  // ── Geocode company address for DVIR yard detection ──
  useEffect(() => {
    if (!companyAddress || yardCoordsRef.current) return
    geocodeCity(companyAddress).then(coords => {
      if (coords) yardCoordsRef.current = coords
    })
  }, [companyAddress])

  // ── Process a position update against all active load geofences ──
  const processPosition = useCallback(async (lat, lng) => {
    if (!lat || !lng) return

    let needsHighAccuracy = false

    for (const load of activeLoads) {
      const lid = load.id || load.load_id || load.loadId
      if (!lid) continue

      const status = (load.status || '').toLowerCase()

      // Initialize geofence state for this load
      if (!geofenceStateRef.current[lid]) {
        geofenceStateRef.current[lid] = {
          insidePickup: false,
          insideDelivery: false,
          pickupEntryTime: null,
          deliveryEntryTime: null,
          arrivedPickup: false,
          arrivedDelivery: false,
          departedPickup: false,
          detentionPickupFired: false,
          detentionDeliveryFired: false,
        }
      }
      const gs = geofenceStateRef.current[lid]

      // Skip geocoding if already in progress for this load
      if (geocodingInProgressRef.current[lid]) continue

      // Get load coordinates (cached or geocoded)
      geocodingInProgressRef.current[lid] = true
      let coords
      try {
        coords = await getLoadCoords(load)
      } finally {
        geocodingInProgressRef.current[lid] = false
      }

      // ── PICKUP GEOFENCE ──
      if (coords.pickup) {
        const distToPickup = haversine(lat, lng, coords.pickup.lat, coords.pickup.lng)

        // Check if we need high accuracy (approaching destination)
        if (distToPickup < HIGH_ACCURACY_RADIUS) needsHighAccuracy = true

        const wasInside = gs.insidePickup
        const isInside = distToPickup < ARRIVAL_RADIUS

        if (isInside && !wasInside) {
          // Entered pickup geofence
          gs.insidePickup = true
          gs.pickupEntryTime = Date.now()
        } else if (!isInside && wasInside && distToPickup > DEPARTURE_RADIUS) {
          // Left pickup geofence
          gs.insidePickup = false
          gs.pickupEntryTime = null
        }

        // ── AUTO-ARRIVAL at pickup ──
        const pickupStatuses = ['dispatched', 'en route to pickup', 'assigned to driver', 'booked']
        if (gs.insidePickup && gs.pickupEntryTime && !gs.arrivedPickup && pickupStatuses.some(s => status.includes(s))) {
          const dwellTime = Date.now() - gs.pickupEntryTime
          if (dwellTime >= DWELL_TIME_MS && !isCoolingDown(lid, 'arrivedPickup')) {
            gs.arrivedPickup = true
            setCooldown(lid, 'arrivedPickup')
            onArrivedAtPickup?.(load, { lat, lng })
          }
        }

        // ── AUTO-DEPARTURE from pickup (driver loaded and leaving) ──
        if (!gs.insidePickup && gs.arrivedPickup && !gs.departedPickup) {
          const departStatuses = ['at pickup', 'loaded']
          if (departStatuses.some(s => status.includes(s)) && !isCoolingDown(lid, 'departedPickup')) {
            gs.departedPickup = true
            setCooldown(lid, 'departedPickup')
            onDepartedPickup?.(load, { lat, lng })
          }
        }

        // ── AUTO-DETENTION at pickup ──
        if (gs.insidePickup && gs.pickupEntryTime && gs.arrivedPickup && !gs.detentionPickupFired) {
          const atPickupStatuses = ['at pickup']
          if (atPickupStatuses.some(s => status.includes(s))) {
            const dwellTime = Date.now() - gs.pickupEntryTime
            if (dwellTime >= DETENTION_TIME_MS) {
              gs.detentionPickupFired = true
              onDetentionStart?.(load, 'pickup')
            }
          }
        }
      }

      // ── DELIVERY GEOFENCE ──
      if (coords.delivery) {
        const distToDelivery = haversine(lat, lng, coords.delivery.lat, coords.delivery.lng)

        if (distToDelivery < HIGH_ACCURACY_RADIUS) needsHighAccuracy = true

        const wasInside = gs.insideDelivery
        const isInside = distToDelivery < ARRIVAL_RADIUS

        if (isInside && !wasInside) {
          gs.insideDelivery = true
          gs.deliveryEntryTime = Date.now()
        } else if (!isInside && wasInside && distToDelivery > DEPARTURE_RADIUS) {
          gs.insideDelivery = false
          gs.deliveryEntryTime = null
        }

        // ── AUTO-ARRIVAL at delivery ──
        const deliveryStatuses = ['loaded', 'in transit', 'en route']
        if (gs.insideDelivery && gs.deliveryEntryTime && !gs.arrivedDelivery && deliveryStatuses.some(s => status.includes(s))) {
          const dwellTime = Date.now() - gs.deliveryEntryTime
          if (dwellTime >= DWELL_TIME_MS && !isCoolingDown(lid, 'arrivedDelivery')) {
            gs.arrivedDelivery = true
            setCooldown(lid, 'arrivedDelivery')
            onArrivedAtDelivery?.(load, { lat, lng })
          }
        }

        // ── AUTO-DEPARTURE from delivery ──
        if (!gs.insideDelivery && gs.arrivedDelivery) {
          const atDeliveryStatuses = ['at delivery']
          if (atDeliveryStatuses.some(s => status.includes(s)) && !isCoolingDown(lid, 'departedDelivery')) {
            setCooldown(lid, 'departedDelivery')
            onDepartedDelivery?.(load, { lat, lng })
          }
        }

        // ── AUTO-DETENTION at delivery ──
        if (gs.insideDelivery && gs.deliveryEntryTime && gs.arrivedDelivery && !gs.detentionDeliveryFired) {
          const atDeliveryStatuses = ['at delivery']
          if (atDeliveryStatuses.some(s => status.includes(s))) {
            const dwellTime = Date.now() - gs.deliveryEntryTime
            if (dwellTime >= DETENTION_TIME_MS) {
              gs.detentionDeliveryFired = true
              onDetentionStart?.(load, 'delivery')
            }
          }
        }
      }
    }

    // ── DVIR YARD DETECTION ──
    if (yardCoordsRef.current) {
      const distToYard = haversine(lat, lng, yardCoordsRef.current.lat, yardCoordsRef.current.lng)
      if (distToYard < DVIR_RADIUS) {
        // Check if any dispatched load needs pre-trip
        const dispatchedLoad = activeLoads.find(l => {
          const s = (l.status || '').toLowerCase()
          return s === 'dispatched' || s === 'assigned to driver'
        })
        if (dispatchedLoad && !dvirDismissedRef.current.has(dispatchedLoad.id || dispatchedLoad.load_id)) {
          if (!isCoolingDown('yard', 'dvir')) {
            setCooldown('yard', 'dvir')
            onNearYard?.(dispatchedLoad)
          }
        }
      }
    }

    // ── Adaptive accuracy ──
    if (needsHighAccuracy !== useHighAccuracyRef.current) {
      useHighAccuracyRef.current = needsHighAccuracy
      // Restart watcher with new accuracy setting
      restartWatcher()
    }
  }, [activeLoads, isCoolingDown, setCooldown, onArrivedAtPickup, onArrivedAtDelivery, onDepartedPickup, onDepartedDelivery, onDetentionStart, onNearYard])

  // ── Start/stop GPS watcher ──
  const startWatcher = useCallback(() => {
    if (!navigator.geolocation) return
    if (watchIdRef.current !== null) return

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords
        // Skip stale positions (older than 2 minutes)
        if (pos.timestamp && Date.now() - pos.timestamp > 120_000) return

        setPosition({ lat, lng, accuracy, watching: true, lastUpdate: Date.now() })
        processPosition(lat, lng)
      },
      (err) => {
        // Permission denied — stop watching, app remains manual
        if (err.code === 1) {
          setPosition(p => ({ ...p, watching: false }))
          stopWatcher()
        }
      },
      {
        enableHighAccuracy: useHighAccuracyRef.current,
        timeout: 30_000,
        maximumAge: useHighAccuracyRef.current ? 10_000 : 60_000,
      }
    )
    watchIdRef.current = id
    setPosition(p => ({ ...p, watching: true }))
  }, [processPosition])

  const stopWatcher = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
    setPosition(p => ({ ...p, watching: false }))
  }, [])

  const restartWatcher = useCallback(() => {
    stopWatcher()
    // Small delay to let the old watcher clean up
    setTimeout(() => startWatcher(), 100)
  }, [stopWatcher, startWatcher])

  // ── Enable/disable based on active loads ──
  useEffect(() => {
    if (enabled && activeLoads.length > 0) {
      startWatcher()
    } else {
      stopWatcher()
      // Clean up geofence state for loads that are no longer active
      const activeIds = new Set(activeLoads.map(l => l.id || l.load_id || l.loadId))
      for (const lid of Object.keys(geofenceStateRef.current)) {
        if (!activeIds.has(lid)) {
          delete geofenceStateRef.current[lid]
        }
      }
    }
    return () => stopWatcher()
  }, [enabled, activeLoads.length > 0]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reset geofence state when a load's status changes ──
  useEffect(() => {
    for (const load of activeLoads) {
      const lid = load.id || load.load_id || load.loadId
      const gs = geofenceStateRef.current[lid]
      if (!gs) continue
      const status = (load.status || '').toLowerCase()

      // If status was externally advanced past our tracked state, sync up
      if (status === 'at pickup' && !gs.arrivedPickup) gs.arrivedPickup = true
      if ((status === 'loaded' || status === 'in transit') && !gs.departedPickup) gs.departedPickup = true
      if (status === 'at delivery' && !gs.arrivedDelivery) gs.arrivedDelivery = true
    }
  }, [activeLoads])

  // ── Public method to dismiss DVIR for a load ──
  const dismissDVIR = useCallback((loadId) => {
    dvirDismissedRef.current.add(loadId)
  }, [])

  return { ...position, dismissDVIR }
}
