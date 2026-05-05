/**
 * FleetContext — drivers, vehicles, company
 *
 * Owns:
 *   drivers     — driver records
 *   vehicles    — vehicle records
 *   company     — carrier company profile
 *   driverMap   — pre-indexed Map for O(1) driver lookups
 *   addDriver / editDriver / removeDriver
 *   addVehicle / editVehicle / removeVehicle
 *   updateCompany
 *   resetFleet  — clears all fleet state (called by CarrierInner.resetData)
 *
 * Consumed via useFleet() or indirectly via useCarrier()
 * (CarrierContext re-exports all values for backward compatibility).
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as db from '../lib/database'
import { apiFetch } from '../lib/api'
import { useApp } from './AppContext'
import { setInvoiceCompany } from '../utils/generatePDF'
import { normalizeCompany } from '../lib/normalizers'
import { DEMO_DRIVERS, DEMO_VEHICLES, DEMO_COMPANY } from '../data/demoData'

const FleetContext = createContext(null)

export function FleetProvider({ children }) {
  const { demoMode, showToast, user, authLoading } = useApp() || {}

  const demoGuard = useCallback((label) => {
    if (demoMode) {
      showToast?.('', 'Demo Mode', 'Sign up to ' + (label || 'save changes'))
      return true
    }
    return false
  }, [demoMode, showToast])

  const [drivers, setDrivers]   = useState([])
  const [vehicles, setVehicles] = useState([])
  const [company, setCompany]   = useState(normalizeCompany({}))
  const [useDb, setUseDb]       = useState(true)
  const initRef = useRef(false)

  // ─── Reset on logout ─────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      initRef.current = false
      setDrivers([])
      setVehicles([])
      setCompany(normalizeCompany({}))
    }
  }, [user])

  // ─── Initial data fetch ───────────────────────────────────────
  useEffect(() => {
    if (demoMode) {
      if (initRef.current) return
      initRef.current = true
      setDrivers(DEMO_DRIVERS)
      setVehicles(DEMO_VEHICLES)
      setCompany(normalizeCompany(DEMO_COMPANY))
      setUseDb(false)
      return
    }
    if (authLoading || !user) return
    if (initRef.current) return
    initRef.current = true

    async function init() {
      try {
        const [dbCompany, dbDrivers, dbVehicles] = await Promise.all([
          db.fetchCompany(),
          db.fetchDrivers(),
          db.fetchVehicles(),
        ])
        setDrivers(dbDrivers)
        setVehicles(dbVehicles)
        if (dbCompany) {
          const nc = normalizeCompany(dbCompany)
          setCompany(nc)
          setInvoiceCompany(nc)
        }
        setUseDb(true)
      } catch (e) {
        console.error('[FleetContext] Init failed:', e.message || e)
        setDrivers([])
        setVehicles([])
        setUseDb(false)
      }
    }
    init()
  }, [demoMode, authLoading, user])

  // ─── Driver map ───────────────────────────────────────────────
  const driverMap = useMemo(() => {
    const map = new Map()
    drivers.forEach(d => {
      if (d.full_name) map.set(d.full_name, d)
      if (d.name && d.name !== d.full_name) map.set(d.name, d)
      if (d.id) map.set(d.id, d)
    })
    return map
  }, [drivers])

  // ─── Driver operations ────────────────────────────────────────
  const addDriver = useCallback(async (driver) => {
    if (demoGuard('add drivers')) return null
    const name = (driver.full_name || driver.name || '').toLowerCase().trim()
    if (name) {
      const dup = drivers.find(d => (d.full_name || d.name || '').toLowerCase().trim() === name)
      if (dup) { showToast?.('', 'Duplicate Driver', `${name} already exists`); return null }
    }
    if (useDb) {
      try {
        const newDriver = await db.createDriver(driver)
        setDrivers(ds => [newDriver, ...ds])
        db.createAuditLog({ action: 'driver.created', entity_type: 'driver', entity_id: newDriver.id, new_value: { name: driver.full_name || driver.name, pay_model: driver.pay_model, pay_rate: driver.pay_rate, phone: driver.phone } }).catch(() => {})
        return newDriver
      } catch (e) { console.error('DB operation failed:', e) }
    }
    const fake = { ...driver, id: 'local-drv-' + Date.now() }
    setDrivers(ds => [fake, ...ds])
    return fake
  }, [useDb, demoGuard, drivers, showToast])

  const editDriver = useCallback(async (id, updates) => {
    if (demoGuard('edit drivers')) return
    const existing = drivers.find(d => d.id === id)
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.updateDriver(id, updates) } catch (e) { console.error('DB operation failed:', e) }
      db.createAuditLog({ action: 'driver.updated', entity_type: 'driver', entity_id: id, old_value: existing ? { name: existing.full_name || existing.name, pay_model: existing.pay_model, pay_rate: existing.pay_rate } : null, new_value: updates }).catch(() => {})
    }
    setDrivers(ds => ds.map(d => d.id === id ? { ...d, ...updates } : d))
  }, [useDb, demoGuard, drivers])

  const removeDriver = useCallback(async (id) => {
    if (demoGuard('remove drivers')) return
    const existing = drivers.find(d => d.id === id)
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.deleteDriver(id) } catch (e) { console.error('DB operation failed:', e) }
      db.createAuditLog({ action: 'driver.deleted', entity_type: 'driver', entity_id: id, old_value: existing ? { name: existing.full_name || existing.name, phone: existing.phone } : null }).catch(() => {})
    }
    setDrivers(ds => ds.filter(d => d.id !== id))
  }, [useDb, demoGuard, drivers])

  // ─── Vehicle operations ───────────────────────────────────────
  const addVehicle = useCallback(async (vehicle) => {
    if (demoGuard('add vehicles')) return null
    const vin  = (vehicle.vin || '').trim().toUpperCase()
    const unit = (vehicle.unit_number || '').trim()
    if (vin  && vehicles.find(v => (v.vin || '').trim().toUpperCase() === vin))  { showToast?.('', 'Duplicate Vehicle', `VIN ${vin} already exists`); return null }
    if (unit && vehicles.find(v => (v.unit_number || '').trim() === unit))        { showToast?.('', 'Duplicate Vehicle', `Unit #${unit} already exists`); return null }
    let result
    if (useDb) {
      result = await db.createVehicle(vehicle)
      if (!result) throw new Error('Failed to save vehicle — check your connection and try again.')
      setVehicles(vs => [result, ...vs])
      db.createAuditLog({ action: 'vehicle.created', entity_type: 'vehicle', entity_id: result.id, new_value: { unit_number: vehicle.unit_number, make: vehicle.make, model: vehicle.model, vin: vehicle.vin, type: vehicle.type } }).catch(() => {})
    } else {
      result = { ...vehicle, id: 'local-veh-' + Date.now() }
      setVehicles(vs => [result, ...vs])
    }
    setVehicles(vs => {
      apiFetch('/api/update-truck-count', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ truckCount: vs.length }) }).catch(() => {})
      return vs
    })
    return result
  }, [useDb, demoGuard, vehicles, showToast])

  const editVehicle = useCallback(async (id, updates) => {
    if (demoGuard('edit vehicles')) return
    const existing = vehicles.find(v => v.id === id)
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.updateVehicle(id, updates) } catch (e) { console.error('DB operation failed:', e) }
      db.createAuditLog({ action: 'vehicle.updated', entity_type: 'vehicle', entity_id: id, old_value: existing ? { unit_number: existing.unit_number, status: existing.status } : null, new_value: updates }).catch(() => {})
    }
    setVehicles(vs => vs.map(v => v.id === id ? { ...v, ...updates } : v))
  }, [useDb, demoGuard, vehicles])

  const removeVehicle = useCallback(async (id) => {
    if (demoGuard('remove vehicles')) return
    const existing = vehicles.find(v => v.id === id)
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.deleteVehicle(id) } catch (e) { console.error('DB operation failed:', e) }
      db.createAuditLog({ action: 'vehicle.deleted', entity_type: 'vehicle', entity_id: id, old_value: existing ? { unit_number: existing.unit_number, make: existing.make, vin: existing.vin } : null }).catch(() => {})
    }
    setVehicles(vs => {
      const updated = vs.filter(v => v.id !== id)
      apiFetch('/api/update-truck-count', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ truckCount: Math.max(1, updated.length) }) }).catch(() => {})
      return updated
    })
  }, [useDb, demoGuard, vehicles])

  // ─── Company operations ───────────────────────────────────────
  const updateCompany = useCallback(async (updates) => {
    if (demoGuard('update company info')) return
    const merged = { ...company, ...updates }
    const nc = normalizeCompany(merged)
    setCompany(nc)
    setInvoiceCompany(nc)
    if (useDb) {
      try {
        await db.upsertCompany(merged)
        db.createAuditLog({ action: 'company.updated', entity_type: 'company', entity_id: 'company', old_value: { name: company?.name, mc_number: company?.mc_number }, new_value: updates }).catch(() => {})
      } catch (e) {
        console.error('DB operation failed:', e)
      }
    }
  }, [company, useDb, demoGuard])

  // ─── Reset (called by CarrierInner.resetData) ─────────────────
  const resetFleet = useCallback(() => {
    setDrivers([])
    setVehicles([])
    setCompany(normalizeCompany({}))
  }, [])

  return (
    <FleetContext.Provider value={{
      drivers,
      vehicles,
      company,
      driverMap,
      addDriver,
      editDriver,
      removeDriver,
      addVehicle,
      editVehicle,
      removeVehicle,
      updateCompany,
      resetFleet,
    }}>
      {children}
    </FleetContext.Provider>
  )
}

export const useFleet = () => useContext(FleetContext)
