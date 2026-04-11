import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as db from '../lib/database'
import { supabase } from '../lib/supabase'
import { useApp } from './AppContext'
import { MemoryProvider, useMemory } from './MemoryContext'
import { FinancialsProvider, useFinancials } from './FinancialsContext'
import { setInvoiceCompany } from '../utils/generatePDF'
import { checkCDL, checkMedicalCard, checkDriverAvailability, checkRegistration, checkInsurance, checkOutOfService } from '../lib/compliance'
import { canDriverTakeLoad } from '../lib/hosSimulation'
import { calculateCrashRisk } from '../lib/crashRiskEngine'
import { DELIVERED_STATUSES } from '../lib/constants'
import { normalizeLoad, normalizeInvoice, normalizeCompany } from '../lib/normalizers'
import {
  DEMO_LOADS,
  DEMO_DRIVERS,
  DEMO_VEHICLES,
  DEMO_COMPANY,
} from '../data/demoData'

// ─── No mock data — production uses Supabase only ───────────

// ─── Provider ────────────────────────────────────────────────
// Thin shell — wraps MemoryProvider so all consumers get memory values
// via useCarrier() without any consumer-side changes.
export function CarrierProvider({ children }) {
  return (
    <MemoryProvider>
      <FinancialsProvider>
        <CarrierInner>{children}</CarrierInner>
      </FinancialsProvider>
    </MemoryProvider>
  )
}

function CarrierInner({ children }) {
  const { demoMode, showToast, isDriver, myDriverId, companyRole, profile, user, authLoading } = useApp() || {}
  const { qMemories, aiFees, fuelCostPerMile, carrierMpg, addQMemory, removeQMemory } = useMemory() || {}
  const {
    invoices: visibleInvoices, expenses: visibleExpenses,
    allInvoices, allExpenses,
    unpaidInvoices, totalExpenses,
    updateInvoiceStatus, addExpense, editExpense, removeExpense, removeInvoice,
    appendInvoice, pruneInvoicesByLoadId,
    registerLoadsUpdater,
  } = useFinancials() || {}

  // Helper: block write operations in demo mode
  const demoGuard = useCallback((label) => {
    if (demoMode) {
      showToast?.('', 'Demo Mode', 'Sign up to ' + (label || 'save changes'))
      return true // blocked
    }
    return false
  }, [demoMode, showToast])
  const [loads, setLoads] = useState([])
  const [drivers, setDrivers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [company, setCompany] = useState(normalizeCompany({}))
  const [consolidations, setConsolidations] = useState([])
  const [checkCalls, setCheckCalls] = useState({})
  const [dataReady, setDataReady] = useState(false)
  const [useDb, setUseDb] = useState(true)
  const initRef = useRef(false)
  const prevUserRef = useRef(null)

  // Register loads updater with FinancialsContext so updateInvoiceStatus can sync load status
  useEffect(() => {
    registerLoadsUpdater?.((inv) => {
      setLoads(ls => ls.map(l => {
        const match = l.loadId === inv.loadId || l.load_number === inv.load_number
        return match ? normalizeLoad({ ...l, status: 'Invoiced' }) : l
      }))
    })
  }, [registerLoadsUpdater])

  // Reset init flag when user changes (logout → login)
  useEffect(() => {
    if (prevUserRef.current && (!user || user.id !== prevUserRef.current)) {
      initRef.current = false
      setDataReady(false)
    }
    prevUserRef.current = user?.id || null
  }, [user])

  // ─── Load initial data ──────────────────────────────────────
  useEffect(() => {
    // Demo mode — use sample data, no Supabase calls
    if (demoMode) {
      if (initRef.current) return
      initRef.current = true
      setLoads(DEMO_LOADS.map(normalizeLoad))
      setDrivers(DEMO_DRIVERS)
      setVehicles(DEMO_VEHICLES)
      setCompany(normalizeCompany(DEMO_COMPANY))
      setUseDb(false)
      setDataReady(true)
      return
    }

    // Wait for auth to finish loading — don't fetch until we know if user is logged in
    if (authLoading) return

    // No user = no data to fetch
    if (!user) {
      setUseDb(false)
      setDataReady(true)
      return
    }

    // Only init once per user session
    if (initRef.current) return
    initRef.current = true

    async function init() {
      try {
        const [dbLoads, dbCompany, dbDrivers, dbVehicles, dbConsolidations] = await Promise.all([
          db.fetchLoads(),
          db.fetchCompany(),
          db.fetchDrivers(),
          db.fetchVehicles(),
          db.fetchConsolidations(),
        ])

        setLoads(dbLoads.map(normalizeLoad))
        setDrivers(dbDrivers)
        setVehicles(dbVehicles)
        setConsolidations(dbConsolidations || [])
        if (dbCompany) {
          const nc = normalizeCompany(dbCompany)
          setCompany(nc)
          setInvoiceCompany(nc)
        }
        setUseDb(true)
      } catch (e) {
        console.error('[CarrierContext] Init failed:', e.message || e)
        setLoads([])
        setDrivers([])
        setVehicles([])
        setUseDb(false)
      }
      setDataReady(true)
    }

    init()
  }, [demoMode, authLoading, user])

  // ─── Real-time subscriptions (debounced for 100+ truck fleets) ──
  useEffect(() => {
    if (demoMode || !useDb) return

    const channels = []

    // Debounce helper — batches rapid realtime updates into single state changes
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
              const newItems = batch.inserts.filter(item => !existingIds.has(item[idField]))
              next = [...newItems, ...next]
            }
            return next
          })
        }, 300) // batch updates within 300ms window
      }
    }

    const loadsHandler = createDebouncedHandler(setLoads, normalizeLoad)

    const loadsChannel = supabase.channel('realtime-loads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loads' }, loadsHandler)
      .subscribe()
    channels.push(loadsChannel)

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch))
    }
  }, [demoMode, useDb])

  // ─── Load operations ─────────────────────────────────────────
  const addLoad = useCallback(async (load) => {
    if (demoGuard('add loads')) return null

    // ── Duplicate load detection ──
    const incomingRef = load.load_id || load.load_number || load.loadId || ''
    if (incomingRef) {
      const dup = loads.find(l =>
        (l.loadId === incomingRef || l.load_id === incomingRef || l.load_number === incomingRef) &&
        l.status !== 'Cancelled'
      )
      if (dup) {
        showToast?.('', 'Duplicate Load', `Load ${incomingRef} already exists (${dup.status})`)
        return null
      }
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
    // Fallback: local-only
    const fakeId = 'local-' + Date.now()
    const num = 'QV-' + (5000 + Math.floor(Math.random() * 1000))
    const newLoad = normalizeLoad({ ...load, id: fakeId, load_number: num, status: 'Rate Con Received' })
    setLoads(ls => [newLoad, ...ls])
    return newLoad
  }, [useDb, demoGuard])

  const addLoadWithStops = useCallback(async (load, stops) => {
    if (demoGuard('add loads')) return null
    if (useDb) {
      try {
        const newLoad = await db.createLoadWithStops(load, stops)
        const normalized = normalizeLoad(newLoad)
        setLoads(ls => [normalized, ...ls])
        return normalized
      } catch (e) {
        console.error('DB operation failed:', e)
      }
    }
    // Fallback: local-only
    const fakeId = 'local-' + Date.now()
    const num = 'QV-' + (5000 + Math.floor(Math.random() * 1000))
    const fakeStops = (stops || []).map((s, i) => ({ ...s, id: 'local-stop-' + Date.now() + '-' + i, sequence: s.sequence ?? i + 1 }))
    const newLoad = normalizeLoad({ ...load, id: fakeId, load_number: num, status: 'Rate Con Received', load_stops: fakeStops })
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
  }, [loads, useDb, demoGuard, showToast])

  const updateLoadStatus = useCallback(async (loadId, newStatus) => {
    if (demoGuard('update load status')) return
    const load = loads.find(l => l.loadId === loadId || l.load_id === loadId || l.load_number === loadId || l.id === loadId)
    if (!load) return

    if (useDb && load.id && !String(load.id).startsWith('mock') && !String(load.id).startsWith('local')) {
      try {
        await db.updateLoad(load.id, { status: newStatus })
        showToast?.('', 'Status Updated', `${load.loadId || load.load_id || ''} → ${newStatus}`)
        // Log to audit trail for pilot tracking (fire-and-forget)
        db.createAuditLog({
          action: 'load_status_change',
          entity_type: 'load',
          entity_id: load.id,
          old_value: { status: load.status },
          new_value: { status: newStatus },
          metadata: { load_id: load.loadId || load.load_id, origin: load.origin, destination: load.dest || load.destination, driver: load.driver },
        }).catch(() => {})
        // Fire SMS/email notification (fire-and-forget)
        apiFetch('/api/load-status-sms', {
          method: 'POST',
          body: JSON.stringify({
            loadId: load.loadId || load.load_id || load.load_number,
            newStatus,
            loadInfo: {
              origin: load.origin,
              destination: load.dest || load.destination,
              rate: load.gross || load.gross_pay || load.rate,
              brokerName: load.broker || load.broker_name,
              brokerPhone: load.broker_phone,
              brokerEmail: load.broker_email,
              carrierName: load.carrier || load.carrier_name,
              carrierPhone: load.carrier_phone,
              driverName: load.driver || load.driver_name,
              driverPhone: load.driver_phone,
            },
          }),
        }).catch(() => {})
        // Auto-schedule check call for active loads
        const checkCallStatuses = ['Assigned to Driver', 'En Route to Pickup', 'Loaded', 'In Transit']
        if (checkCallStatuses.includes(newStatus)) {
          apiFetch('/api/check-calls?action=schedule', {
            method: 'POST',
            body: JSON.stringify({
              loadId: load.loadId || load.load_id || load.load_number,
              callType: ['Assigned to Driver', 'En Route to Pickup'].includes(newStatus) ? 'pickup_check' : 'delivery_check',
              brokerPhone: load.broker_phone,
              brokerName: load.broker || load.broker_name,
              carrierName: load.driver || load.driver_name || load.carrier_name,
              destination: load.dest || load.destination,
              eta: load.delivery_date || '',
              scheduledAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
            }),
          }).catch(() => {})
        }
        // EDI 214 — auto-send status update if load came from EDI
        const ediStatuses = ['Dispatched', 'At Pickup', 'In Transit', 'At Delivery', 'Delivered']
        if (ediStatuses.includes(newStatus) && (load.load_source === 'edi_204' || load.source === 'edi_204')) {
          apiFetch('/api/edi/send-214', {
            method: 'POST',
            body: JSON.stringify({ load_id: load.id, status_event: newStatus }),
          }).catch(() => {})
        }

        // ── Q AUTO-CHAIN: Proactive actions on status change ──
        const loadRef = load.loadId || load.load_id || load.load_number || ''
        const dest = (load.dest || load.destination || '').split(',')[0]?.trim()

        if (newStatus === 'At Pickup') {
          // Start detention clock at shipper
          localStorage.setItem(`detention_${load.id}`, String(Date.now()))
          // Check call to broker
          apiFetch('/api/check-calls?action=schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loadId: loadRef, callType: 'pickup_check', brokerPhone: load.broker_phone, brokerName: load.broker || load.broker_name, carrierName: load.driver || load.driver_name, destination: load.dest || load.destination, eta: 'At pickup now', scheduledAt: new Date().toISOString() }),
          }).catch(() => {})
          showToast?.('', 'Q: At Pickup', `Detention clock started. Get loaded.`)
        }

        if (newStatus === 'In Transit' || newStatus === 'Loaded') {
          // Stop pickup detention
          localStorage.removeItem(`detention_${load.id}`)
          showToast?.('', 'Q: Rolling', `In transit to ${dest}. Q is tracking.`)
        }

        if (newStatus === 'At Delivery') {
          // Start detention clock at receiver
          localStorage.setItem(`detention_${load.id}`, String(Date.now()))
          // Check call to broker — approaching delivery
          apiFetch('/api/check-calls?action=schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loadId: loadRef, callType: 'delivery_check', brokerPhone: load.broker_phone, brokerName: load.broker || load.broker_name, carrierName: load.driver || load.driver_name, destination: load.dest || load.destination, eta: 'At delivery now', scheduledAt: new Date().toISOString() }),
          }).catch(() => {})
          showToast?.('', 'Q: At Delivery', `Detention clock started. Get unloaded.`)
        }

        if (newStatus === 'Delivered') {
          // Stop detention clock
          localStorage.removeItem(`detention_${load.id}`)
          // Q proactive message
          showToast?.('', 'Q: Delivered', `Upload POD. Q is generating invoice and searching reloads from ${dest}.`)
          // Auto-search reloads from delivery city (fire-and-forget notification)
          apiFetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [{ role: 'user', content: `Load ${loadRef} delivered at ${dest}. Find reloads.` }], context: `Just delivered ${loadRef} at ${load.dest || load.destination}. Need reload options.` }),
          }).catch(() => {})
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

      // Auto-create invoice on delivery — gated by companies.auto_invoice
      // toggle (Settings → Company Profile → Invoicing). When the toggle is
      // off, the load goes to Delivered and STAYS there until the user
      // manually creates an invoice. invoice_terms drives the due date.
      const autoInvoiceEnabled = company?.auto_invoice === true
      if (newStatus === 'Delivered' && l.status !== 'Delivered' && l.status !== 'Invoiced' && autoInvoiceEnabled) {
        const grossAmount = l.gross || l.gross_pay || l.rate || 0
        if (grossAmount <= 0) {
          console.warn('[Invoice] Skipped auto-invoice — no rate/gross on load', l.loadId || l.id)
          return updated
        }

        // Net X terms — pull from settings, default 30
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
          // Auto-create invoice with retry (max 2 attempts) + admin alert on failure
          const createInvoiceWithRetry = async (attempt = 1) => {
            try {
              const dbInv = await db.createInvoice({ ...inv, load_id: dbLoadId })
              appendInvoice?.(normalizeInvoice(dbInv))
              // Audit log: invoice auto-created on delivery
              db.createAuditLog({
                action: 'invoice_created',
                entity_type: 'invoice',
                entity_id: dbInv?.id || dbLoadId,
                old_value: null,
                new_value: { invoice_number: dbInv?.invoice_number, amount: inv.amount, status: 'Unpaid' },
                metadata: { load_id: l.loadId || l.load_number, broker: l.broker, driver: l.driver || l.driver_name, trigger: 'auto_on_delivery' },
              }).catch(() => {})
              // Auto-advance load to Invoiced after invoice is created
              db.updateLoad(dbLoadId, { status: 'Invoiced' }).then(() => {
                setLoads(ls => ls.map(ld => ld.id === dbLoadId ? normalizeLoad({ ...ld, status: 'Invoiced' }) : ld))
              }).catch(() => {})
              // Auto-factor if enabled (30s delay for carrier review)
              if (company?.auto_factor_on_delivery && company?.factoring_company && company.factoring_company !== "I don't use factoring" && dbInv?.id) {
                showToast?.('', 'Auto-Factor Queued', `${dbInv.invoice_number} will be sent to ${company.factoring_company} in 30s`)
                setTimeout(() => apiFetch('/api/factor-invoice', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    invoiceId: dbInv.id,
                    factoringCompany: company.factoring_company,
                    factoringRate: parseFloat(company.factoring_rate) || 2.5,
                    paymentTerms: 'same_day',
                  }),
                }).then(() => {
                  showToast?.('', 'Auto-Factored', `${dbInv.invoice_number} → ${company.factoring_company} · Same day pay`)
                }).catch(() => {}), 30000)
              }
            } catch (err) {
              console.error(`[Pilot] Invoice creation failed (attempt ${attempt}):`, err)
              if (attempt < 2) {
                setTimeout(() => createInvoiceWithRetry(attempt + 1), 2000)
              } else {
                // Final failure — alert admin
                apiFetch('/api/admin-alert', {
                  method: 'POST',
                  body: JSON.stringify({
                    type: 'invoice_failure',
                    title: 'Invoice Not Generated After Delivery',
                    message: `Load ${l.loadId || l.load_number} (${l.origin} → ${l.dest || l.destination}, $${inv.amount}) was marked Delivered but invoice creation failed after 2 attempts. Error: ${err.message || 'Unknown'}`,
                    severity: 'critical',
                    source: 'CarrierContext',
                  }),
                }).catch(() => {})
              }
            }
          }
          createInvoiceWithRetry()

          // Always email broker invoice (removed localStorage gate for pilot reliability)
          apiFetch('/api/auto-invoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ loadId: dbLoadId }),
          }).catch(err => { console.error('[Pilot] Invoice email failed:', err) })

          // Q Intelligence — charge 3% AI fee on delivered load
          const loadRate = l.gross || l.gross_pay || l.rate || 0
          if (loadRate > 0) {
            apiFetch('/api/charge-ai-fee', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                loadId: dbLoadId,
                loadNumber: l.loadId || l.load_number,
                loadRate,
                origin: l.origin,
                destination: l.dest || l.destination,
                broker: l.broker || l.broker_name,
                featureUsed: 'dispatch',
              }),
            }).then(r => r.json()).catch(err => { console.error('[Pilot] AI fee charge failed:', err) })
          }
        } else {
          appendInvoice?.(normalizeInvoice({
            ...inv, id: 'local-inv-' + Date.now(),
            invoice_number: 'INV-' + String(Math.floor(Math.random() * 9000) + 1000),
          }))
        }
      }

      return updated
    }))
  }, [loads, useDb, demoGuard, company])

  // Assign a driver to a load (updates both driver field and status)
  // Runs compliance pre-check: blocks if CDL expired, medical card expired, or driver unavailable
  const assignLoadToDriver = useCallback(async (loadId, driverName, coDriverName) => {
    if (demoGuard('assign driver')) return
    const load = loads.find(l => l.loadId === loadId || l.load_id === loadId || l.id === loadId)
    if (!load) return

    // ── Compliance pre-check for primary driver ──
    const driver = drivers.find(d => (d.full_name || d.name) === driverName)
    if (driver) {
      const cdl = checkCDL(driver)
      const med = checkMedicalCard(driver)
      const avail = checkDriverAvailability(driver)
      const blocks = [cdl, med, avail].filter(c => c.status === 'fail')
      if (blocks.length > 0) {
        const reasons = blocks.map(b => b.label).join(', ')
        showToast?.('', 'Dispatch Blocked', `${driverName}: ${reasons}`)
        console.warn(`[Compliance] Dispatch blocked for ${driverName}:`, blocks)
        if (useDb && load.id) {
          db.createAuditLog({
            action: 'dispatch_compliance_blocked',
            entity_type: 'load',
            entity_id: load.id,
            old_value: { status: load.status },
            new_value: { attempted_driver: driverName, blocked: true },
            metadata: { load_id: load.loadId || load.load_id, violations: blocks.map(b => b.label) },
          }).catch(() => {})
          apiFetch('/api/admin-alert', {
            method: 'POST',
            body: JSON.stringify({
              type: 'compliance_block',
              title: 'Compliance Blocked Dispatch',
              message: `Driver "${driverName}" was blocked from load ${load.loadId || load.load_id} (${load.origin} → ${load.dest || load.destination}). Violations: ${reasons}. Suggested fix: Update driver documents or resolve compliance issues in Settings → Compliance.`,
              severity: 'warning',
              source: 'dispatch_compliance',
            }),
          }).catch(() => {})
        }
        return
      }
      const warns = [cdl, med, avail].filter(c => c.status === 'warn')
      if (warns.length > 0) {
      }
    }

    // ── Compliance pre-check for co-driver (team) ──
    if (coDriverName) {
      const coDriver = drivers.find(d => (d.full_name || d.name) === coDriverName)
      if (coDriver) {
        const cdl = checkCDL(coDriver)
        const med = checkMedicalCard(coDriver)
        const blocks = [cdl, med].filter(c => c.status === 'fail')
        if (blocks.length > 0) {
          const reasons = blocks.map(b => b.label).join(', ')
          showToast?.('', 'Co-Driver Blocked', `${coDriverName}: ${reasons}`)
          return
        }
      }
    }

    // ── Vehicle compliance pre-check ──
    // If driver has an assigned vehicle, verify it's road-ready
    const driverVehicle = vehicles.find(v =>
      v.assigned_driver === driverName || v.driver_name === driverName ||
      (driver?.id && v.driver_id === driver?.id)
    )
    if (driverVehicle) {
      const reg = checkRegistration(driverVehicle)
      const ins = checkInsurance(driverVehicle)
      const oos = checkOutOfService(driverVehicle)
      const vBlocks = [reg, ins, oos].filter(c => c.status === 'fail')
      if (vBlocks.length > 0) {
        const reasons = vBlocks.map(b => b.label).join(', ')
        const unit = driverVehicle.unit_number || driverVehicle.truck_number || 'Vehicle'
        showToast?.('', 'Vehicle Blocked', `${unit}: ${reasons}`)
        if (useDb && load.id) {
          db.createAuditLog({
            action: 'dispatch_vehicle_blocked',
            entity_type: 'load',
            entity_id: load.id,
            old_value: { status: load.status },
            new_value: { attempted_driver: driverName, vehicle: unit, blocked: true },
            metadata: { load_id: load.loadId || load.load_id, violations: vBlocks.map(b => b.label) },
          }).catch(() => {})
        }
        return
      }
    }

    // ── HOS (Hours of Service) pre-check ──
    if (driver) {
      const loadMiles = parseFloat(load.miles) || 0
      const estimatedHours = loadMiles > 0 ? loadMiles / 55 : 0 // ~55 mph avg
      if (estimatedHours > 0) {
        const hosCheck = canDriverTakeLoad(driver, estimatedHours)
        if (!hosCheck.legal) {
          showToast?.('', 'HOS Violation', `${driverName}: ${hosCheck.reason}`)
          console.warn(`[HOS] Dispatch blocked for ${driverName}:`, hosCheck.reason)
          if (useDb && load.id) {
            db.createAuditLog({
              action: 'dispatch_hos_blocked',
              entity_type: 'load',
              entity_id: load.id,
              old_value: { status: load.status },
              new_value: { attempted_driver: driverName, blocked: true },
              metadata: { load_id: load.loadId || load.load_id, hos: hosCheck },
            }).catch(() => {})
          }
          return
        }
      }
    }

    // ── AI Crash Risk Prediction ──
    // Uses 8-factor model to predict crash probability before dispatch
    if (driver) {
      try {
        const riskResult = calculateCrashRisk(driver, {
          vehicle: driverVehicle,
          load: {
            weight: parseFloat(load.weight) || 0,
            miles: parseFloat(load.miles) || 0,
            hazmat: load.hazmat || load.equipment?.toLowerCase?.()?.includes('hazmat'),
            origin: load.origin,
            destination: load.dest || load.destination,
          },
          departureTime: load.pickup_date || load.pickup || new Date().toISOString(),
        })

        // Also block if ANY single factor is extreme (80+) — one critical danger is enough
        const hasCriticalFactor = riskResult.factors.some(f => f.score >= 80)

        // BLOCK dispatch: composite 60+ OR any single factor 80+
        if (riskResult.score >= 60 || hasCriticalFactor) {
          const topFactors = riskResult.factors
            .filter(f => f.score >= 30)
            .map(f => f.label)
            .join(', ')
          showToast?.('', 'Safety Risk: CRITICAL', `${driverName} crash risk score ${riskResult.score}/100. Top risks: ${topFactors || 'Multiple factors'}. ${riskResult.recommendations[0]?.action || 'Review before dispatch.'}`)
          if (useDb && load.id) {
            db.createAuditLog({
              action: 'dispatch_crash_risk_blocked',
              entity_type: 'load',
              entity_id: load.id,
              old_value: { status: load.status },
              new_value: { attempted_driver: driverName, blocked: true, crash_risk_score: riskResult.score },
              metadata: {
                load_id: load.loadId || load.load_id,
                risk_level: riskResult.level,
                risk_score: riskResult.score,
                factors: riskResult.factors.map(f => ({ factor: f.factor, score: f.score })),
                recommendations: riskResult.recommendations.map(r => r.action),
              },
            }).catch(() => {})
            apiFetch('/api/admin-alert', {
              method: 'POST',
              body: JSON.stringify({
                type: 'crash_risk_critical',
                title: 'AI Safety: Dispatch Blocked — Critical Crash Risk',
                message: `Driver "${driverName}" blocked from load ${load.loadId || load.load_id} (${load.origin} → ${load.dest || load.destination}). Crash risk: ${riskResult.score}/100 (${riskResult.level}). Factors: ${topFactors}. Recommendations: ${riskResult.recommendations.map(r => r.action).join('; ')}`,
                severity: 'critical',
                source: 'crash_risk_engine',
              }),
            }).catch(() => {})
          }
          return
        }

        // MODERATE-HIGH risk (35-59) — Allow but warn and log
        if (riskResult.score >= 35) {
          const topFactors = riskResult.factors
            .filter(f => f.score >= 20)
            .map(f => f.label)
            .join(', ')
          showToast?.('', 'Safety Warning: HIGH Risk', `${driverName} crash risk ${riskResult.score}/100. Proceed with caution. ${riskResult.recommendations[0]?.action || ''}`)
          if (useDb && load.id) {
            db.createAuditLog({
              action: 'dispatch_crash_risk_warning',
              entity_type: 'load',
              entity_id: load.id,
              old_value: { status: load.status },
              new_value: { driver: driverName, crash_risk_score: riskResult.score, dispatched_with_warning: true },
              metadata: {
                load_id: load.loadId || load.load_id,
                risk_level: riskResult.level,
                risk_score: riskResult.score,
                factors: riskResult.factors.map(f => ({ factor: f.factor, score: f.score })),
              },
            }).catch(() => {})
          }
        }
      } catch (e) {
        console.warn('[CrashRisk] Scoring failed, proceeding with dispatch:', e.message)
      }
    }

    // Build DB + local updates (include co-driver if team)
    const coDriver = coDriverName ? drivers.find(d => (d.full_name || d.name) === coDriverName) : null
    const matchedDriver = drivers.find(d => (d.full_name || d.name) === driverName)
    const dbUpdates = {
      carrier_name: driverName, driver_name: driverName, status: 'Assigned to Driver',
      ...(matchedDriver?.id ? { driver_id: matchedDriver.id } : {}),
      ...(coDriverName ? { co_driver_name: coDriverName } : {}),
      ...(coDriver?.id ? { co_driver_id: coDriver.id } : {}),
    }
    const localUpdates = {
      driver: driverName, driver_name: driverName, carrier_name: driverName, status: 'Assigned to Driver',
      ...(coDriverName ? { co_driver_name: coDriverName, co_driver_id: coDriver?.id || null } : {}),
    }
    if (useDb && load.id && !String(load.id).startsWith('mock') && !String(load.id).startsWith('local')) {
      try {
        await db.updateLoad(load.id, dbUpdates)
        const teamLabel = coDriverName ? ` + ${coDriverName} (team)` : ''
        db.createAuditLog({
          action: 'driver_assigned',
          entity_type: 'load',
          entity_id: load.id,
          old_value: { driver: load.driver || load.driver_name || null, status: load.status },
          new_value: { driver: driverName, co_driver: coDriverName || null, status: 'Assigned to Driver' },
          metadata: { load_id: load.loadId || load.load_id, origin: load.origin, destination: load.dest || load.destination },
        }).catch(() => {})
      } catch (e) {
        console.error('[Pilot] DB assign failed:', e)
      }
    }
    setLoads(ls => ls.map(l => {
      const match = l.loadId === loadId || l.load_id === loadId || l.id === loadId
      return match ? normalizeLoad({ ...l, ...localUpdates }) : l
    }))
  }, [loads, drivers, useDb, demoGuard, showToast])

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

      const updatedStops = stops.map((s, i) => ({
        ...s,
        status: i < next ? 'complete' : i === next ? 'current' : 'pending'
      }))

      if (useDb && updatedStops[next]?.id) {
        const now = new Date().toISOString()
        db.updateLoadStop(updatedStops[next].id, { status: 'current', actual_arrival: now }).catch(() => {})
        if (currentIdx >= 0 && updatedStops[currentIdx]?.id) {
          db.updateLoadStop(updatedStops[currentIdx].id, { status: 'complete', actual_departure: now }).catch(() => {})
        }
      }

      return normalizeLoad({ ...l, stops: updatedStops, load_stops: updatedStops })
    }))
  }, [useDb])

  // ─── Check calls ──────────────────────────────────────────────
  const logCheckCall = useCallback(async (loadNumber, call) => {
    if (demoGuard('log check calls')) return
    const load = loads.find(l => l.loadId === loadNumber || l.load_number === loadNumber)

    if (useDb && load && !String(load.id).startsWith('mock') && !String(load.id).startsWith('local')) {
      try {
        const dbCall = await db.createCheckCall(load._dbId || load.id, call)
        setCheckCalls(cc => ({
          ...cc,
          [loadNumber]: [dbCall, ...(cc[loadNumber] || [])]
        }))
        return
      } catch (e) {
        console.error('DB operation failed:', e)
      }
    }

    setCheckCalls(cc => {
      const existing = cc[loadNumber] || []
      const id = 'local-cc-' + Date.now()
      return { ...cc, [loadNumber]: [{ ...call, id, ts: Date.now(), called_at: new Date().toISOString() }, ...existing] }
    })
  }, [loads, useDb, demoGuard])

  // ─── Driver operations ──────────────────────────────────────────
  const addDriver = useCallback(async (driver) => {
    if (demoGuard('add drivers')) return null
    // Duplicate driver detection
    const driverName = (driver.full_name || driver.name || '').toLowerCase().trim()
    if (driverName) {
      const dup = drivers.find(d => (d.full_name || d.name || '').toLowerCase().trim() === driverName)
      if (dup) {
        showToast?.('', 'Duplicate Driver', `${driverName} already exists`)
        return null
      }
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
  }, [useDb, demoGuard])

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

  // ─── Vehicle operations ─────────────────────────────────────────
  const addVehicle = useCallback(async (vehicle) => {
    if (demoGuard('add vehicles')) return null
    // Duplicate vehicle detection (by VIN or unit number)
    const vin = (vehicle.vin || '').trim().toUpperCase()
    const unit = (vehicle.unit_number || '').trim()
    if (vin) {
      const dupVin = vehicles.find(v => (v.vin || '').trim().toUpperCase() === vin)
      if (dupVin) { showToast?.('', 'Duplicate Vehicle', `VIN ${vin} already exists`); return null }
    }
    if (unit) {
      const dupUnit = vehicles.find(v => (v.unit_number || '').trim() === unit)
      if (dupUnit) { showToast?.('', 'Duplicate Vehicle', `Unit #${unit} already exists`); return null }
    }
    let result
    if (useDb) {
      try {
        const newVeh = await db.createVehicle(vehicle)
        setVehicles(vs => [newVeh, ...vs])
        result = newVeh
      } catch (e) { console.error('DB operation failed:', e) }
    }
    if (result && useDb) {
      db.createAuditLog({ action: 'vehicle.created', entity_type: 'vehicle', entity_id: result.id, new_value: { unit_number: vehicle.unit_number, make: vehicle.make, model: vehicle.model, vin: vehicle.vin, type: vehicle.type } }).catch(() => {})
    }
    if (!result) {
      result = { ...vehicle, id: 'local-veh-' + Date.now() }
      setVehicles(vs => [result, ...vs])
    }
    // Update Stripe billing with new truck count
    setVehicles(vs => {
      const newCount = vs.length
      apiFetch('/api/update-truck-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ truckCount: newCount }),
      }).catch(err => { console.error('DB operation failed:', err) })
      return vs
    })
    return result
  }, [useDb, demoGuard])

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
      // Update Stripe billing with new truck count
      const newCount = Math.max(1, updated.length)
      apiFetch('/api/update-truck-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ truckCount: newCount }),
      }).catch(err => { console.error('DB operation failed:', err) })
      return updated
    })
  }, [useDb, demoGuard])

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

  // ─── Consolidation operations (LTL/Partial grouping) ──────────────
  const addConsolidation = useCallback(async (consolidation) => {
    if (demoGuard('create consolidations')) return null
    if (useDb) {
      try {
        const newCon = await db.createConsolidation(consolidation)
        setConsolidations(prev => [newCon, ...prev])
        return newCon
      } catch (e) {
        console.error('DB operation failed:', e)
      }
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

  // ─── Reset (clears loads/fleet data owned by this context) ─────────
  const resetData = useCallback(() => {
    setLoads([])
    setDrivers([])
    setVehicles([])
    setCompany(normalizeCompany({}))
    setCheckCalls({})
    setConsolidations([])
  }, [])

  // ─── Load driver-role filtering ──────────────────────────────
  const driverName = isDriver ? (profile?.full_name || '') : ''

  const isMyLoad = useCallback((load) => {
    if (!isDriver) return true
    if (myDriverId && load.driver_id === myDriverId) return true
    if (driverName && (load.driver_name || load.driver || load.carrier_name || '').toLowerCase() === driverName.toLowerCase()) return true
    return false
  }, [isDriver, myDriverId, driverName])

  const visibleLoads = useMemo(() => isDriver ? loads.filter(isMyLoad) : loads, [loads, isDriver, isMyLoad])

  // ─── Computed values ─────────────────────────────────────────
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

  // Pre-indexed driver map for O(1) lookups
  const driverMap = useMemo(() => {
    const map = new Map()
    drivers.forEach(d => {
      if (d.full_name) map.set(d.full_name, d)
      if (d.name && d.name !== d.full_name) map.set(d.name, d)
      if (d.id) map.set(d.id, d)
    })
    return map
  }, [drivers])

  // Broker intelligence — uses loads + invoices from FinancialsContext
  const brokerStats = useMemo(() => {
    const map = {}
    loads.forEach(l => {
      const name = l.broker_name || l.broker
      if (!name) return
      if (!map[name]) map[name] = { name, loads: 0, totalRevenue: 0, miles: 0, payDays: [], onTime: 0, total: 0 }
      const b = map[name]
      b.loads += 1
      b.totalRevenue += Number(l.rate || l.gross || 0)
      b.miles += Number(l.miles || 0)
      if (l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid') {
        b.total += 1
        if (l.delivery_date && l.actual_delivery) {
          if (new Date(l.actual_delivery) <= new Date(l.delivery_date)) b.onTime += 1
        } else {
          b.onTime += 1
        }
      }
    })
    const loadBrokerMap = {}
    loads.forEach(l => { const name = l.broker_name || l.broker; if (name && l.id) loadBrokerMap[l.id] = name })
    ;(allInvoices || []).forEach(inv => {
      const brokerName = inv.broker_name || inv.broker || loadBrokerMap[inv.load_id]
      if (!brokerName || !map[brokerName]) return
      if (inv.status === 'Paid') {
        const created = new Date(inv.created_at || inv.date)
        const paid = new Date(inv.paid_at || inv.updated_at)
        if (!isNaN(created) && !isNaN(paid)) {
          map[brokerName].payDays.push(Math.max(0, Math.round((paid - created) / 86400000)))
        }
      }
    })
    return Object.values(map)
      .map(b => ({
        name: b.name, totalLoads: b.loads, totalRevenue: b.totalRevenue,
        avgRpm: b.miles > 0 ? (b.totalRevenue / b.miles).toFixed(2) : 'N/A',
        avgDaysToPay: b.payDays.length > 0 ? Math.round(b.payDays.reduce((s, d) => s + d, 0) / b.payDays.length) : null,
        onTimeRate: b.total > 0 ? Math.round((b.onTime / b.total) * 100) : null,
      }))
      .sort((a, b) => b.totalLoads - a.totalLoads)
  }, [loads, allInvoices])

  return (
    <CarrierContext.Provider value={{
      // Loads (owned here)
      loads: visibleLoads, allLoads: loads,
      deliveredLoads, activeLoads, totalRevenue, brokerStats, driverMap,
      // Financials (from FinancialsContext — re-exported for useCarrier() compat)
      invoices: visibleInvoices, expenses: visibleExpenses,
      allInvoices, allExpenses,
      unpaidInvoices, totalExpenses,
      updateInvoiceStatus, addExpense, editExpense, removeExpense, removeInvoice,
      // Fleet
      drivers, vehicles, company, checkCalls, consolidations,
      // Memory (from MemoryContext)
      qMemories, aiFees, fuelCostPerMile, carrierMpg,
      // Operations
      updateLoadStatus, assignLoadToDriver, addLoad, addLoadWithStops, removeLoad, advanceStop,
      addDriver, editDriver, removeDriver,
      addVehicle, editVehicle, removeVehicle,
      addConsolidation, editConsolidation,
      logCheckCall, updateCompany, resetData,
      addQMemory, removeQMemory,
      dataReady, useDb, demoMode,
    }}>
      {children}
    </CarrierContext.Provider>
  )
}

export const useCarrier = () => useContext(CarrierContext)
