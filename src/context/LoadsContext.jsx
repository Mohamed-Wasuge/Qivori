/**
 * LoadsContext — loads, check calls, consolidations, and all load operations
 *
 * Owns:
 *   loads / checkCalls / consolidations
 *   deliveredLoads / activeLoads / totalRevenue / brokerStats  (computed)
 *   dataReady   — signals the full init cycle has completed
 *   addLoad / addLoadWithStops / removeLoad / updateLoadStatus /
 *   assignLoadToDriver / advanceStop / logCheckCall /
 *   addConsolidation / editConsolidation
 *   resetLoads  — clears load state (called by CarrierInner.resetData)
 *
 * Cross-context deps (resolved via sibling hooks, all providers are ancestors):
 *   useFinancials() — appendInvoice, pruneInvoicesByLoadId, registerLoadsUpdater, allInvoices
 *   useFleet()      — company, drivers, vehicles
 *
 * Consumed via useLoads() or indirectly via useCarrier()
 * (CarrierContext re-exports all values for backward compatibility).
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as db from '../lib/database'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'
import { useApp } from './AppContext'
import { useFinancials } from './FinancialsContext'
import { useFleet } from './FleetContext'
import { checkCDL, checkMedicalCard, checkDriverAvailability, checkRegistration, checkInsurance, checkOutOfService } from '../lib/compliance'
import { canDriverTakeLoad } from '../lib/hosSimulation'
import { calculateCrashRisk } from '../lib/crashRiskEngine'
import { DELIVERED_STATUSES } from '../lib/constants'
import { normalizeLoad, normalizeInvoice } from '../lib/normalizers'
import { DEMO_LOADS } from '../data/demoData'

const LoadsContext = createContext(null)

// Debounce helper — batches rapid realtime updates into a single state change
function createDebouncedHandler(setter, normalize, idField = 'id') {
  let pending = { inserts: [], updates: [], deletes: [] }
  let timer = null
  return (payload) => {
    if (payload.eventType === 'INSERT') pending.inserts.push(normalize(payload.new))
    else if (payload.eventType === 'UPDATE') pending.updates.push(normalize(payload.new))
    else if (payload.eventType === 'DELETE') pending.deletes.push(payload.old[idField])
    clearTimeout(timer)
    timer = setTimeout(() => {
      const batch = { ...pending }
      pending = { inserts: [], updates: [], deletes: [] }
      setter(prev => {
        let next = prev
        if (batch.deletes.length) next = next.filter(item => !batch.deletes.includes(item[idField]))
        if (batch.updates.length) {
          const updateMap = new Map(batch.updates.map(u => [u[idField], u]))
          next = next.map(item => updateMap.get(item[idField]) || item)
        }
        if (batch.inserts.length) {
          const existingIds = new Set(next.map(item => item[idField]))
          next = [...batch.inserts.filter(item => !existingIds.has(item[idField])), ...next]
        }
        return next
      })
    }, 300)
  }
}

export function LoadsProvider({ children }) {
  const { demoMode, showToast, isDriver, myDriverId, profile, user, authLoading } = useApp() || {}
  const {
    appendInvoice, pruneInvoicesByLoadId,
    registerLoadsUpdater, allInvoices,
  } = useFinancials() || {}
  const { company, drivers, vehicles } = useFleet() || {}

  const demoGuard = useCallback((label) => {
    if (demoMode) {
      showToast?.('', 'Demo Mode', 'Sign up to ' + (label || 'save changes'))
      return true
    }
    return false
  }, [demoMode, showToast])

  const [loads, setLoads]               = useState([])
  const [checkCalls, setCheckCalls]     = useState({})
  const [consolidations, setConsolidations] = useState([])
  const [dataReady, setDataReady]       = useState(false)
  const [useDb, setUseDb]               = useState(true)
  const initRef    = useRef(false)
  const prevUserRef = useRef(null)

  // ─── Wire FinancialsContext → update linked load when invoice status changes ──
  useEffect(() => {
    registerLoadsUpdater?.((inv) => {
      setLoads(ls => ls.map(l => {
        const match = l.loadId === inv.loadId || l.load_number === inv.load_number
        return match ? normalizeLoad({ ...l, status: 'Invoiced' }) : l
      }))
    })
  }, [registerLoadsUpdater])

  // ─── Reset on logout ─────────────────────────────────────────
  useEffect(() => {
    if (prevUserRef.current && (!user || user.id !== prevUserRef.current)) {
      initRef.current = false
      setDataReady(false)
      setLoads([])
      setCheckCalls({})
      setConsolidations([])
    }
    prevUserRef.current = user?.id || null
  }, [user])

  // ─── Initial data fetch ───────────────────────────────────────
  useEffect(() => {
    if (demoMode) {
      if (initRef.current) return
      initRef.current = true
      setLoads(DEMO_LOADS.map(normalizeLoad))
      setUseDb(false)
      setDataReady(true)
      return
    }
    if (authLoading) return
    if (!user) { setUseDb(false); setDataReady(true); return }
    if (initRef.current) return
    initRef.current = true

    async function init() {
      try {
        const [dbLoads, dbConsolidations] = await Promise.all([
          db.fetchLoads(),
          db.fetchConsolidations(),
        ])
        setLoads(dbLoads.map(normalizeLoad))
        setConsolidations(dbConsolidations || [])
        setUseDb(true)
      } catch (e) {
        console.error('[LoadsContext] Init failed:', e.message || e)
        setLoads([])
        setUseDb(false)
      }
      setDataReady(true)
    }
    init()
  }, [demoMode, authLoading, user])

  // ─── Real-time subscription ───────────────────────────────────
  useEffect(() => {
    if (demoMode || !useDb) return
    const loadsHandler = createDebouncedHandler(setLoads, normalizeLoad)
    const ch = supabase.channel('realtime-loads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loads' }, loadsHandler)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [demoMode, useDb])

  // ─── Load operations ──────────────────────────────────────────
  const addLoad = useCallback(async (load) => {
    if (demoGuard('add loads')) return null
    const incomingRef = load.load_id || load.load_number || load.loadId || ''
    if (incomingRef) {
      const dup = loads.find(l =>
        (l.loadId === incomingRef || l.load_id === incomingRef || l.load_number === incomingRef) &&
        l.status !== 'Cancelled'
      )
      if (dup) { showToast?.('', 'Duplicate Load', `Load ${incomingRef} already exists (${dup.status})`); return null }
    }
    if (useDb) {
      try {
        const newLoad = await db.createLoad(load)
        const normalized = normalizeLoad(newLoad)
        setLoads(ls => [normalized, ...ls])
        showToast?.('', 'Load Created', `${normalized.loadId || normalized.load_number || 'New load'} added`)
        db.createAuditLog({ action: 'load.created', entity_type: 'load', entity_id: newLoad.id, new_value: { loadId: normalized.loadId, origin: normalized.origin, destination: normalized.dest, gross: normalized.gross, broker: normalized.broker }, metadata: { driver: normalized.driver, status: normalized.status } }).catch(() => {})
        return normalized
      } catch (e) {
        console.error('DB operation failed:', e)
        showToast?.('', 'Error', 'Failed to create load')
      }
    }
    const newLoad = normalizeLoad({ ...load, id: 'local-' + Date.now(), load_number: 'QV-' + (5000 + Math.floor(Math.random() * 1000)), status: 'Rate Con Received' })
    setLoads(ls => [newLoad, ...ls])
    return newLoad
  }, [useDb, demoGuard, loads, showToast])

  const addLoadWithStops = useCallback(async (load, stops) => {
    if (demoGuard('add loads')) return null
    if (useDb) {
      try {
        const newLoad = await db.createLoadWithStops(load, stops)
        const normalized = normalizeLoad(newLoad)
        setLoads(ls => [normalized, ...ls])
        return normalized
      } catch (e) { console.error('DB operation failed:', e) }
    }
    const fakeStops = (stops || []).map((s, i) => ({ ...s, id: 'local-stop-' + Date.now() + '-' + i, sequence: s.sequence ?? i + 1 }))
    const newLoad = normalizeLoad({ ...load, id: 'local-' + Date.now(), load_number: 'QV-' + (5000 + Math.floor(Math.random() * 1000)), status: 'Rate Con Received', load_stops: fakeStops })
    setLoads(ls => [newLoad, ...ls])
    return newLoad
  }, [useDb, demoGuard])

  const removeLoad = useCallback(async (loadId) => {
    if (demoGuard('delete loads')) return
    const load = loads.find(l => l.loadId === loadId || l.load_id === loadId || l.load_number === loadId || l.id === loadId)
    if (!load) return
    if (useDb && load.id && !String(load.id).startsWith('mock') && !String(load.id).startsWith('local')) {
      try { await db.deleteLoad(load.id) } catch (e) { console.error('DB operation failed:', e); showToast?.('', 'Error', 'Failed to delete load'); return }
      db.createAuditLog({ action: 'load.deleted', entity_type: 'load', entity_id: load.id, old_value: { loadId: load.loadId, origin: load.origin, destination: load.dest, gross: load.gross, status: load.status }, metadata: { driver: load.driver, broker: load.broker } }).catch(() => {})
    }
    setLoads(ls => ls.filter(l => !(l.loadId === loadId || l.load_id === loadId || l.load_number === loadId || l.id === loadId)))
    pruneInvoicesByLoadId?.(loadId)
    showToast?.('', 'Load Deleted', `${load.loadId || load.load_number || loadId} removed`)
  }, [loads, useDb, demoGuard, showToast, pruneInvoicesByLoadId])

  const updateLoadStatus = useCallback(async (loadId, newStatus) => {
    if (demoGuard('update load status')) return
    const load = loads.find(l => l.loadId === loadId || l.load_id === loadId || l.load_number === loadId || l.id === loadId)
    if (!load) return

    if (useDb && load.id && !String(load.id).startsWith('mock') && !String(load.id).startsWith('local')) {
      try {
        await db.updateLoad(load.id, { status: newStatus })
        showToast?.('', 'Status Updated', `${load.loadId || load.load_id || ''} → ${newStatus}`)
        db.createAuditLog({
          action: 'load_status_change', entity_type: 'load', entity_id: load.id,
          old_value: { status: load.status }, new_value: { status: newStatus },
          metadata: { load_id: load.loadId || load.load_id, origin: load.origin, destination: load.dest || load.destination, driver: load.driver },
        }).catch(() => {})
        apiFetch('/api/load-status-sms', {
          method: 'POST',
          body: JSON.stringify({ loadId: load.loadId || load.load_id || load.load_number, newStatus, loadInfo: { origin: load.origin, destination: load.dest || load.destination, rate: load.gross || load.gross_pay || load.rate, brokerName: load.broker || load.broker_name, brokerPhone: load.broker_phone, brokerEmail: load.broker_email, carrierName: load.carrier || load.carrier_name, carrierPhone: load.carrier_phone, driverName: load.driver || load.driver_name, driverPhone: load.driver_phone } }),
        }).catch(() => {})
        const checkCallStatuses = ['Assigned to Driver', 'En Route to Pickup', 'Loaded', 'In Transit']
        if (checkCallStatuses.includes(newStatus)) {
          apiFetch('/api/check-calls?action=schedule', {
            method: 'POST',
            body: JSON.stringify({ loadId: load.loadId || load.load_id || load.load_number, callType: ['Assigned to Driver', 'En Route to Pickup'].includes(newStatus) ? 'pickup_check' : 'delivery_check', brokerPhone: load.broker_phone, brokerName: load.broker || load.broker_name, carrierName: load.driver || load.driver_name || load.carrier_name, destination: load.dest || load.destination, eta: load.delivery_date || '', scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString() }),
          }).catch(() => {})
        }
        const ediStatuses = ['Dispatched', 'At Pickup', 'In Transit', 'At Delivery', 'Delivered']
        if (ediStatuses.includes(newStatus) && (load.load_source === 'edi_204' || load.source === 'edi_204')) {
          apiFetch('/api/edi/send-214', { method: 'POST', body: JSON.stringify({ load_id: load.id, status_event: newStatus }) }).catch(() => {})
        }
        const loadRef = load.loadId || load.load_id || load.load_number || ''
        const dest = (load.dest || load.destination || '').split(',')[0]?.trim()
        if (newStatus === 'At Pickup') {
          localStorage.setItem(`detention_${load.id}`, String(Date.now()))
          apiFetch('/api/check-calls?action=schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loadId: loadRef, callType: 'pickup_check', brokerPhone: load.broker_phone, brokerName: load.broker || load.broker_name, carrierName: load.driver || load.driver_name, destination: load.dest || load.destination, eta: 'At pickup now', scheduledAt: new Date().toISOString() }) }).catch(() => {})
          showToast?.('', 'Q: At Pickup', `Detention clock started. Get loaded.`)
        }
        if (newStatus === 'In Transit' || newStatus === 'Loaded') {
          localStorage.removeItem(`detention_${load.id}`)
          showToast?.('', 'Q: Rolling', `In transit to ${dest}. Q is tracking.`)
        }
        if (newStatus === 'At Delivery') {
          localStorage.setItem(`detention_${load.id}`, String(Date.now()))
          apiFetch('/api/check-calls?action=schedule', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loadId: loadRef, callType: 'delivery_check', brokerPhone: load.broker_phone, brokerName: load.broker || load.broker_name, carrierName: load.driver || load.driver_name, destination: load.dest || load.destination, eta: 'At delivery now', scheduledAt: new Date().toISOString() }) }).catch(() => {})
          showToast?.('', 'Q: At Delivery', `Detention clock started. Get unloaded.`)
        }
        if (newStatus === 'Delivered') {
          localStorage.removeItem(`detention_${load.id}`)
          showToast?.('', 'Q: Delivered', `Upload POD. Q is generating invoice and searching reloads from ${dest}.`)
          apiFetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: `Load ${loadRef} delivered at ${dest}. Find reloads.` }], context: `Just delivered ${loadRef} at ${load.dest || load.destination}. Need reload options.` }) }).catch(() => {})
        }
      } catch (e) {
        console.error('DB operation failed:', e)
        showToast?.('', 'Error', 'Failed to update load status')
      }
    }

    setLoads(ls => ls.map(l => {
      const match = l.loadId === loadId || l.load_id === loadId || l.load_number === loadId || l.id === loadId
      if (!match) return l
      const updated = normalizeLoad({ ...l, status: newStatus })

      const autoInvoiceEnabled = company?.auto_invoice === true
      if (newStatus === 'Delivered' && l.status !== 'Delivered' && l.status !== 'Invoiced' && autoInvoiceEnabled) {
        const grossAmount = l.gross || l.gross_pay || l.rate || 0
        if (grossAmount <= 0) {
          console.warn('[Invoice] Skipped auto-invoice — no rate/gross on load', l.loadId || l.id)
          return updated
        }
        const termsStr = company?.invoice_terms || 'Net 30'
        const termsDays = parseInt(termsStr.replace(/[^0-9]/g, ''), 10) || 30
        const today = new Date()
        const due = new Date(today)
        due.setDate(due.getDate() + termsDays)
        const originShort = (l.origin || '').split(',')[0].substring(0, 3).toUpperCase()
        const destShort = (l.dest || l.destination || '').split(',')[0].substring(0, 3).toUpperCase()
        const inv = {
          load_number: l.loadId || l.load_number,
          broker: l.broker,
          route: originShort + ' → ' + destShort,
          amount: grossAmount,
          invoice_date: today.toISOString().split('T')[0],
          due_date: due.toISOString().split('T')[0],
          status: 'Unpaid',
          driver_name: l.driver || l.driver_name,
        }
        if (useDb && !String(l.id).startsWith('mock') && !String(l.id).startsWith('local')) {
          const dbLoadId = l.id
          const createInvoiceWithRetry = async (attempt = 1) => {
            try {
              const dbInv = await db.createInvoice({ ...inv, load_id: dbLoadId })
              appendInvoice?.(normalizeInvoice(dbInv))
              db.createAuditLog({ action: 'invoice_created', entity_type: 'invoice', entity_id: dbInv?.id || dbLoadId, old_value: null, new_value: { invoice_number: dbInv?.invoice_number, amount: inv.amount, status: 'Unpaid' }, metadata: { load_id: l.loadId || l.load_number, broker: l.broker, driver: l.driver || l.driver_name, trigger: 'auto_on_delivery' } }).catch(() => {})
              db.updateLoad(dbLoadId, { status: 'Invoiced' }).then(() => {
                setLoads(ls => ls.map(ld => ld.id === dbLoadId ? normalizeLoad({ ...ld, status: 'Invoiced' }) : ld))
              }).catch(() => {})
              if (company?.auto_factor_on_delivery && company?.factoring_company && company.factoring_company !== "I don't use factoring" && dbInv?.id) {
                showToast?.('', 'Auto-Factor Queued', `${dbInv.invoice_number} will be sent to ${company.factoring_company} in 30s`)
                setTimeout(() => apiFetch('/api/factor-invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invoiceId: dbInv.id, factoringCompany: company.factoring_company, factoringRate: parseFloat(company.factoring_rate) || 2.5, paymentTerms: 'same_day' }) }).then(() => { showToast?.('', 'Auto-Factored', `${dbInv.invoice_number} → ${company.factoring_company} · Same day pay`) }).catch(() => {}), 30000)
              }
            } catch (err) {
              console.error(`[Pilot] Invoice creation failed (attempt ${attempt}):`, err)
              if (attempt < 2) { setTimeout(() => createInvoiceWithRetry(attempt + 1), 2000) }
              else {
                apiFetch('/api/admin-alert', { method: 'POST', body: JSON.stringify({ type: 'invoice_failure', title: 'Invoice Not Generated After Delivery', message: `Load ${l.loadId || l.load_number} (${l.origin} → ${l.dest || l.destination}, $${inv.amount}) was marked Delivered but invoice creation failed after 2 attempts. Error: ${err.message || 'Unknown'}`, severity: 'critical', source: 'LoadsContext' }) }).catch(() => {})
              }
            }
          }
          createInvoiceWithRetry()
          apiFetch('/api/auto-invoice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loadId: dbLoadId }) }).catch(err => { console.error('[Pilot] Invoice email failed:', err) })
          const loadRate = l.gross || l.gross_pay || l.rate || 0
          if (loadRate > 0) {
            apiFetch('/api/charge-ai-fee', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ loadId: dbLoadId, loadNumber: l.loadId || l.load_number, loadRate, origin: l.origin, destination: l.dest || l.destination, broker: l.broker || l.broker_name, featureUsed: 'dispatch' }) }).then(r => r.json()).catch(err => { console.error('[Pilot] AI fee charge failed:', err) })
          }
        } else {
          appendInvoice?.(normalizeInvoice({ ...inv, id: 'local-inv-' + Date.now(), invoice_number: 'INV-' + String(Math.floor(Math.random() * 9000) + 1000) }))
        }
      }

      return updated
    }))
  }, [loads, useDb, demoGuard, company, showToast, appendInvoice])

  const assignLoadToDriver = useCallback(async (loadId, driverName, coDriverName) => {
    if (demoGuard('assign driver')) return
    const load = loads.find(l => l.loadId === loadId || l.load_id === loadId || l.id === loadId)
    if (!load) return

    const driver = (drivers || []).find(d => (d.full_name || d.name) === driverName)
    if (driver) {
      const cdl = checkCDL(driver), med = checkMedicalCard(driver), avail = checkDriverAvailability(driver)
      const blocks = [cdl, med, avail].filter(c => c.status === 'fail')
      if (blocks.length > 0) {
        const reasons = blocks.map(b => b.label).join(', ')
        showToast?.('', 'Dispatch Blocked', `${driverName}: ${reasons}`)
        if (useDb && load.id) {
          db.createAuditLog({ action: 'dispatch_compliance_blocked', entity_type: 'load', entity_id: load.id, old_value: { status: load.status }, new_value: { attempted_driver: driverName, blocked: true }, metadata: { load_id: load.loadId || load.load_id, violations: blocks.map(b => b.label) } }).catch(() => {})
          apiFetch('/api/admin-alert', { method: 'POST', body: JSON.stringify({ type: 'compliance_block', title: 'Compliance Blocked Dispatch', message: `Driver "${driverName}" was blocked from load ${load.loadId || load.load_id} (${load.origin} → ${load.dest || load.destination}). Violations: ${reasons}. Suggested fix: Update driver documents or resolve compliance issues in Settings → Compliance.`, severity: 'warning', source: 'dispatch_compliance' }) }).catch(() => {})
        }
        return
      }
    }

    if (coDriverName) {
      const coDriver = (drivers || []).find(d => (d.full_name || d.name) === coDriverName)
      if (coDriver) {
        const blocks = [checkCDL(coDriver), checkMedicalCard(coDriver)].filter(c => c.status === 'fail')
        if (blocks.length > 0) { showToast?.('', 'Co-Driver Blocked', `${coDriverName}: ${blocks.map(b => b.label).join(', ')}`); return }
      }
    }

    const driverVehicle = (vehicles || []).find(v =>
      v.assigned_driver === driverName || v.driver_name === driverName ||
      (driver?.id && v.driver_id === driver?.id)
    )
    if (driverVehicle) {
      const vBlocks = [checkRegistration(driverVehicle), checkInsurance(driverVehicle), checkOutOfService(driverVehicle)].filter(c => c.status === 'fail')
      if (vBlocks.length > 0) {
        const unit = driverVehicle.unit_number || driverVehicle.truck_number || 'Vehicle'
        showToast?.('', 'Vehicle Blocked', `${unit}: ${vBlocks.map(b => b.label).join(', ')}`)
        if (useDb && load.id) db.createAuditLog({ action: 'dispatch_vehicle_blocked', entity_type: 'load', entity_id: load.id, old_value: { status: load.status }, new_value: { attempted_driver: driverName, vehicle: unit, blocked: true }, metadata: { load_id: load.loadId || load.load_id, violations: vBlocks.map(b => b.label) } }).catch(() => {})
        return
      }
    }

    if (driver) {
      const loadMiles = parseFloat(load.miles) || 0
      const estimatedHours = loadMiles > 0 ? loadMiles / 55 : 0
      if (estimatedHours > 0) {
        const hosCheck = canDriverTakeLoad(driver, estimatedHours)
        if (!hosCheck.legal) {
          showToast?.('', 'HOS Violation', `${driverName}: ${hosCheck.reason}`)
          if (useDb && load.id) db.createAuditLog({ action: 'dispatch_hos_blocked', entity_type: 'load', entity_id: load.id, old_value: { status: load.status }, new_value: { attempted_driver: driverName, blocked: true }, metadata: { load_id: load.loadId || load.load_id, hos: hosCheck } }).catch(() => {})
          return
        }
      }
    }

    if (driver) {
      try {
        const riskResult = calculateCrashRisk(driver, { vehicle: driverVehicle, load: { weight: parseFloat(load.weight) || 0, miles: parseFloat(load.miles) || 0, hazmat: load.hazmat || load.equipment?.toLowerCase?.()?.includes('hazmat'), origin: load.origin, destination: load.dest || load.destination }, departureTime: load.pickup_date || load.pickup || new Date().toISOString() })
        const hasCriticalFactor = riskResult.factors.some(f => f.score >= 80)
        if (riskResult.score >= 60 || hasCriticalFactor) {
          const topFactors = riskResult.factors.filter(f => f.score >= 30).map(f => f.label).join(', ')
          showToast?.('', 'Safety Risk: CRITICAL', `${driverName} crash risk score ${riskResult.score}/100. Top risks: ${topFactors || 'Multiple factors'}. ${riskResult.recommendations[0]?.action || 'Review before dispatch.'}`)
          if (useDb && load.id) {
            db.createAuditLog({ action: 'dispatch_crash_risk_blocked', entity_type: 'load', entity_id: load.id, old_value: { status: load.status }, new_value: { attempted_driver: driverName, blocked: true, crash_risk_score: riskResult.score }, metadata: { load_id: load.loadId || load.load_id, risk_level: riskResult.level, risk_score: riskResult.score, factors: riskResult.factors.map(f => ({ factor: f.factor, score: f.score })), recommendations: riskResult.recommendations.map(r => r.action) } }).catch(() => {})
            apiFetch('/api/admin-alert', { method: 'POST', body: JSON.stringify({ type: 'crash_risk_critical', title: 'AI Safety: Dispatch Blocked — Critical Crash Risk', message: `Driver "${driverName}" blocked from load ${load.loadId || load.load_id} (${load.origin} → ${load.dest || load.destination}). Crash risk: ${riskResult.score}/100 (${riskResult.level}). Factors: ${topFactors}. Recommendations: ${riskResult.recommendations.map(r => r.action).join('; ')}`, severity: 'critical', source: 'crash_risk_engine' }) }).catch(() => {})
          }
          return
        }
        if (riskResult.score >= 35) {
          showToast?.('', 'Safety Warning: HIGH Risk', `${driverName} crash risk ${riskResult.score}/100. Proceed with caution. ${riskResult.recommendations[0]?.action || ''}`)
          if (useDb && load.id) db.createAuditLog({ action: 'dispatch_crash_risk_warning', entity_type: 'load', entity_id: load.id, old_value: { status: load.status }, new_value: { driver: driverName, crash_risk_score: riskResult.score, dispatched_with_warning: true }, metadata: { load_id: load.loadId || load.load_id, risk_level: riskResult.level, risk_score: riskResult.score, factors: riskResult.factors.map(f => ({ factor: f.factor, score: f.score })) } }).catch(() => {})
        }
      } catch (e) { console.warn('[CrashRisk] Scoring failed, proceeding with dispatch:', e.message) }
    }

    const coDriver = coDriverName ? (drivers || []).find(d => (d.full_name || d.name) === coDriverName) : null
    const matchedDriver = (drivers || []).find(d => (d.full_name || d.name) === driverName)
    const dbUpdates = { carrier_name: driverName, driver_name: driverName, status: 'Assigned to Driver', ...(matchedDriver?.id ? { driver_id: matchedDriver.id } : {}), ...(coDriverName ? { co_driver_name: coDriverName } : {}), ...(coDriver?.id ? { co_driver_id: coDriver.id } : {}) }
    const localUpdates = { driver: driverName, driver_name: driverName, carrier_name: driverName, status: 'Assigned to Driver', ...(coDriverName ? { co_driver_name: coDriverName, co_driver_id: coDriver?.id || null } : {}) }
    if (useDb && load.id && !String(load.id).startsWith('mock') && !String(load.id).startsWith('local')) {
      try {
        await db.updateLoad(load.id, dbUpdates)
        db.createAuditLog({ action: 'driver_assigned', entity_type: 'load', entity_id: load.id, old_value: { driver: load.driver || load.driver_name || null, status: load.status }, new_value: { driver: driverName, co_driver: coDriverName || null, status: 'Assigned to Driver' }, metadata: { load_id: load.loadId || load.load_id, origin: load.origin, destination: load.dest || load.destination } }).catch(() => {})
      } catch (e) { console.error('[Pilot] DB assign failed:', e) }
    }
    setLoads(ls => ls.map(l => {
      const match = l.loadId === loadId || l.load_id === loadId || l.id === loadId
      return match ? normalizeLoad({ ...l, ...localUpdates }) : l
    }))
  }, [loads, drivers, vehicles, useDb, demoGuard, showToast])

  const advanceStop = useCallback(async (loadId) => {
    if (demoGuard('advance stops')) return
    setLoads(ls => ls.map(l => {
      const match = l.loadId === loadId || l.load_number === loadId
      if (!match) return l
      const stops = l.stops || l.load_stops
      if (!stops?.length) return l
      const currentIdx = stops.findIndex(s => s.status === 'current')
      const next = currentIdx + 1
      if (next >= stops.length) return l
      const updatedStops = stops.map((s, i) => ({ ...s, status: i < next ? 'complete' : i === next ? 'current' : 'pending' }))
      if (useDb && updatedStops[next]?.id) {
        const now = new Date().toISOString()
        db.updateLoadStop(updatedStops[next].id, { status: 'current', actual_arrival: now }).catch(() => {})
        if (currentIdx >= 0 && updatedStops[currentIdx]?.id) db.updateLoadStop(updatedStops[currentIdx].id, { status: 'complete', actual_departure: now }).catch(() => {})
      }
      return normalizeLoad({ ...l, stops: updatedStops, load_stops: updatedStops })
    }))
  }, [useDb, demoGuard])

  // ─── Check calls ──────────────────────────────────────────────
  const logCheckCall = useCallback(async (loadNumber, call) => {
    if (demoGuard('log check calls')) return
    const load = loads.find(l => l.loadId === loadNumber || l.load_number === loadNumber)
    if (useDb && load && !String(load.id).startsWith('mock') && !String(load.id).startsWith('local')) {
      try {
        const dbCall = await db.createCheckCall(load._dbId || load.id, call)
        setCheckCalls(cc => ({ ...cc, [loadNumber]: [dbCall, ...(cc[loadNumber] || [])] }))
        return
      } catch (e) { console.error('DB operation failed:', e) }
    }
    setCheckCalls(cc => {
      const existing = cc[loadNumber] || []
      return { ...cc, [loadNumber]: [{ ...call, id: 'local-cc-' + Date.now(), ts: Date.now(), called_at: new Date().toISOString() }, ...existing] }
    })
  }, [loads, useDb, demoGuard])

  // ─── Consolidation operations ─────────────────────────────────
  const addConsolidation = useCallback(async (consolidation) => {
    if (demoGuard('create consolidations')) return null
    if (useDb) {
      try {
        const newCon = await db.createConsolidation(consolidation)
        setConsolidations(prev => [newCon, ...prev])
        return newCon
      } catch (e) { console.error('DB operation failed:', e) }
    }
    const fake = { ...consolidation, id: 'local-con-' + Date.now(), created_at: new Date().toISOString() }
    setConsolidations(prev => [fake, ...prev])
    return fake
  }, [useDb, demoGuard])

  const editConsolidation = useCallback(async (id, updates) => {
    if (demoGuard('update consolidations')) return
    if (useDb && !String(id).startsWith('local')) {
      try { await db.updateConsolidation(id, updates) } catch (e) { console.error('DB operation failed:', e) }
    }
    setConsolidations(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c))
  }, [useDb, demoGuard])

  // ─── Reset ────────────────────────────────────────────────────
  const resetLoads = useCallback(() => {
    setLoads([])
    setCheckCalls({})
    setConsolidations([])
  }, [])

  // ─── Driver-role filtering ────────────────────────────────────
  const driverName = isDriver ? (profile?.full_name || '') : ''

  const isMyLoad = useCallback((load) => {
    if (!isDriver) return true
    if (myDriverId && load.driver_id === myDriverId) return true
    if (driverName && (load.driver_name || load.driver || load.carrier_name || '').toLowerCase() === driverName.toLowerCase()) return true
    return false
  }, [isDriver, myDriverId, driverName])

  const visibleLoads = useMemo(() => isDriver ? loads.filter(isMyLoad) : loads, [loads, isDriver, isMyLoad])

  // ─── Computed values ──────────────────────────────────────────
  const deliveredLoads = useMemo(
    () => visibleLoads.filter(l => DELIVERED_STATUSES.includes(l.status)),
    [visibleLoads]
  )
  const activeLoads = useMemo(
    () => visibleLoads.filter(l => !DELIVERED_STATUSES.includes(l.status) && l.status !== 'Cancelled'),
    [visibleLoads]
  )
  const totalRevenue = useMemo(
    () => deliveredLoads.reduce((s, l) => s + (l.gross || l.rate || 0), 0),
    [deliveredLoads]
  )

  // Broker intelligence — uses loads + allInvoices from FinancialsContext
  const brokerStats = useMemo(() => {
    const map = {}
    loads.forEach(l => {
      const name = l.broker_name || l.broker
      if (!name) return
      if (!map[name]) map[name] = { name, loads: 0, totalRevenue: 0, miles: 0, payDays: [], onTime: 0, total: 0 }
      const b = map[name]
      b.loads += 1; b.totalRevenue += Number(l.rate || l.gross || 0); b.miles += Number(l.miles || 0)
      if (l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid') {
        b.total += 1
        if (l.delivery_date && l.actual_delivery) { if (new Date(l.actual_delivery) <= new Date(l.delivery_date)) b.onTime += 1 }
        else b.onTime += 1
      }
    })
    const loadBrokerMap = {}
    loads.forEach(l => { const name = l.broker_name || l.broker; if (name && l.id) loadBrokerMap[l.id] = name })
    ;(allInvoices || []).forEach(inv => {
      const brokerName = inv.broker_name || inv.broker || loadBrokerMap[inv.load_id]
      if (!brokerName || !map[brokerName]) return
      if (inv.status === 'Paid') {
        const created = new Date(inv.created_at || inv.date), paid = new Date(inv.paid_at || inv.updated_at)
        if (!isNaN(created) && !isNaN(paid)) map[brokerName].payDays.push(Math.max(0, Math.round((paid - created) / 86400000)))
      }
    })
    return Object.values(map)
      .map(b => ({ name: b.name, totalLoads: b.loads, totalRevenue: b.totalRevenue, avgRpm: b.miles > 0 ? (b.totalRevenue / b.miles).toFixed(2) : 'N/A', avgDaysToPay: b.payDays.length > 0 ? Math.round(b.payDays.reduce((s, d) => s + d, 0) / b.payDays.length) : null, onTimeRate: b.total > 0 ? Math.round((b.onTime / b.total) * 100) : null }))
      .sort((a, b) => b.totalLoads - a.totalLoads)
  }, [loads, allInvoices])

  return (
    <LoadsContext.Provider value={{
      loads: visibleLoads,
      allLoads: loads,
      checkCalls,
      consolidations,
      deliveredLoads,
      activeLoads,
      totalRevenue,
      brokerStats,
      dataReady,
      useDb,
      addLoad,
      addLoadWithStops,
      removeLoad,
      updateLoadStatus,
      assignLoadToDriver,
      advanceStop,
      logCheckCall,
      addConsolidation,
      editConsolidation,
      resetLoads,
    }}>
      {children}
    </LoadsContext.Provider>
  )
}

export const useLoads = () => useContext(LoadsContext)
