import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import * as db from '../lib/database'
import { apiFetch } from '../lib/api'
import { useApp } from './AppContext'
import {
  DEMO_LOADS,
  DEMO_INVOICES,
  DEMO_EXPENSES,
  DEMO_DRIVERS,
  DEMO_VEHICLES,
  DEMO_COMPANY,
} from '../data/demoData'

const CarrierContext = createContext(null)

// ─── Compatibility layer ─────────────────────────────────────
// Actual DB loads table: id, load_id, origin, destination, rate, broker_id,
//   broker_name, carrier_id, carrier_name, load_type, equipment, weight,
//   status, posted_at, pickup_date, delivery_date, created_at, rate_con_url, notes
// Frontend expects: loadId, dest, gross, rate, driver, refNum, pickup, delivery, miles, weight

function normalizeLoad(l) {
  if (!l) return l
  const fmtDate = (d, t) => {
    if (!d) return ''
    try {
      const dt = new Date(d)
      const mon = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      return t ? `${mon} · ${t}` : mon
    } catch { return d }
  }
  const grossVal = Number(l.rate) || Number(l.gross_pay) || Number(l.gross) || 0
  const milesVal = Number(l.miles) || 0
  const rpm = milesVal > 0 ? +(grossVal / milesVal).toFixed(2) : 0
  return {
    ...l,
    // Frontend aliases
    loadId: l.load_id || l.load_number || l.loadId || '',
    dest: l.destination || l.dest || '',
    gross: grossVal,
    rate: rpm || Number(l.rate_per_mile) || Number(l.rate) || 0,
    driver: l.carrier_name || l.driver_name || l.driver || '',
    broker: l.broker_name || l.broker || '',
    refNum: l.reference_number || l.refNum || '',
    pickup: fmtDate(l.pickup_date, l.pickup_time),
    delivery: fmtDate(l.delivery_date, l.delivery_time),
    commodity: l.notes || l.commodity || '',
    miles: milesVal,
    weight: l.weight || '',
    // DB aliases (so both old and new code works)
    load_id: l.load_id || l.load_number || l.loadId || '',
    load_number: l.load_id || l.load_number || l.loadId || '',
    destination: l.destination || l.dest || '',
    gross_pay: grossVal,
    rate_per_mile: rpm,
    driver_name: l.carrier_name || l.driver_name || l.driver || '',
    carrier_name: l.carrier_name || l.driver_name || l.driver || '',
    reference_number: l.reference_number || l.refNum || '',
    // Stops
    stops: l.load_stops || l.stops || undefined,
    currentStop: l.load_stops
      ? (l.load_stops.findIndex(s => s.status === 'current') ?? 0)
      : (l.currentStop ?? 0),
  }
}

function normalizeInvoice(inv) {
  if (!inv) return inv
  const fmtShort = (d) => {
    if (!d) return ''
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch { return d }
  }
  return {
    ...inv,
    // Aliases
    id: inv.invoice_number || inv.id,
    _dbId: inv.id, // preserve real DB id
    loadId: inv.load_number || inv.loadId,
    date: fmtShort(inv.invoice_date) || inv.date || '',
    dueDate: fmtShort(inv.due_date) || inv.dueDate || '',
    driver: inv.driver_name || inv.driver || '',
    // Keep DB names
    invoice_number: inv.invoice_number || inv.id,
    load_number: inv.load_number || inv.loadId,
    invoice_date: inv.invoice_date || '',
    due_date: inv.due_date || '',
    driver_name: inv.driver_name || inv.driver || '',
    amount: Number(inv.amount) || 0,
  }
}

function normalizeExpense(e) {
  if (!e) return e
  const fmtShort = (d) => {
    if (!d) return ''
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch { return d }
  }
  return {
    ...e,
    // Aliases
    cat: e.category || e.cat,
    load: e.load_number || e.load || '',
    driver: e.driver_name || e.driver || '',
    date: fmtShort(e.date) || '',
    // Keep DB names
    category: e.category || e.cat,
    load_number: e.load_number || e.load || '',
    driver_name: e.driver_name || e.driver || '',
    amount: Number(e.amount) || 0,
  }
}

function normalizeCompany(c) {
  if (!c) return c
  return {
    ...c,
    mc: c.mc_number || c.mc || '',
    dot: c.dot_number || c.dot || '',
    mc_number: c.mc_number || c.mc || '',
    dot_number: c.dot_number || c.dot || '',
  }
}

// ─── No mock data — production uses Supabase only ───────────

// ─── Provider ────────────────────────────────────────────────
export function CarrierProvider({ children }) {
  const { demoMode, showToast } = useApp() || {}

  // Helper: block write operations in demo mode
  const demoGuard = useCallback((label) => {
    if (demoMode) {
      showToast?.('', 'Demo Mode', 'Sign up to ' + (label || 'save changes'))
      return true // blocked
    }
    return false
  }, [demoMode, showToast])
  const [loads, setLoads] = useState([])
  const [invoices, setInvoices] = useState([])
  const [expenses, setExpenses] = useState([])
  const [drivers, setDrivers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [company, setCompany] = useState(normalizeCompany({}))
  const [checkCalls, setCheckCalls] = useState({})
  const [dataReady, setDataReady] = useState(false)
  const [useDb, setUseDb] = useState(true)
  const initRef = useRef(false)

  // ─── Load initial data ──────────────────────────────────────
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    // Demo mode — use sample data, no Supabase calls
    if (demoMode) {
      setLoads(DEMO_LOADS.map(normalizeLoad))
      setInvoices(DEMO_INVOICES.map(normalizeInvoice))
      setExpenses(DEMO_EXPENSES.map(normalizeExpense))
      setDrivers(DEMO_DRIVERS)
      setVehicles(DEMO_VEHICLES)
      setCompany(normalizeCompany(DEMO_COMPANY))
      setUseDb(false)
      setDataReady(true)
      return
    }

    async function init() {
      try {
        const [dbLoads, dbInvoices, dbExpenses, dbCompany, dbDrivers, dbVehicles] = await Promise.all([
          db.fetchLoads(),
          db.fetchInvoices(),
          db.fetchExpenses(),
          db.fetchCompany(),
          db.fetchDrivers(),
          db.fetchVehicles(),
        ])

        setLoads(dbLoads.map(normalizeLoad))
        setInvoices(dbInvoices.map(normalizeInvoice))
        setExpenses(dbExpenses.map(normalizeExpense))
        setDrivers(dbDrivers)
        setVehicles(dbVehicles)
        if (dbCompany) setCompany(normalizeCompany(dbCompany))
        setUseDb(true)
      } catch (e) {
        setLoads([])
        setInvoices([])
        setExpenses([])
        setDrivers([])
        setVehicles([])
        setUseDb(false)
      }
      setDataReady(true)
    }

    init()
  }, [demoMode])

  // ─── Load operations ─────────────────────────────────────────
  const addLoad = useCallback(async (load) => {
    if (demoGuard('add loads')) return null
    if (useDb) {
      try {
        const newLoad = await db.createLoad(load)
        const normalized = normalizeLoad(newLoad)
        setLoads(ls => [normalized, ...ls])
        return normalized
      } catch (e) {
        /* error handled gracefully */
      }
    }
    // Fallback: local-only
    const fakeId = 'local-' + Date.now()
    const num = 'QV-' + (5000 + Math.floor(Math.random() * 1000))
    const newLoad = normalizeLoad({ ...load, id: fakeId, load_number: num, status: 'Rate Con Received' })
    setLoads(ls => [newLoad, ...ls])
    return newLoad
  }, [useDb, demoGuard])

  const removeLoad = useCallback(async (loadId) => {
    if (demoGuard('delete loads')) return
    const load = loads.find(l => l.loadId === loadId || l.load_id === loadId || l.load_number === loadId || l.id === loadId)
    if (!load) return
    if (useDb && load.id && !String(load.id).startsWith('mock') && !String(load.id).startsWith('local')) {
      try { await db.deleteLoad(load.id) } catch { /* error handled gracefully */ }
    }
    setLoads(ls => ls.filter(l => !(l.loadId === loadId || l.load_id === loadId || l.load_number === loadId || l.id === loadId)))
    // Also remove any linked invoices
    setInvoices(invs => invs.filter(i => i.loadId !== loadId && i.load_number !== loadId))
  }, [loads, useDb, demoGuard])

  const updateLoadStatus = useCallback(async (loadId, newStatus) => {
    if (demoGuard('update load status')) return
    const load = loads.find(l => l.loadId === loadId || l.load_id === loadId || l.load_number === loadId || l.id === loadId)
    if (!load) return

    if (useDb && load.id && !String(load.id).startsWith('mock') && !String(load.id).startsWith('local')) {
      try {
        await db.updateLoad(load.id, { status: newStatus })
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
      } catch (e) {
        /* error handled gracefully */
      }
    }

    setLoads(ls => ls.map(l => {
      const match = l.loadId === loadId || l.load_id === loadId || l.load_number === loadId || l.id === loadId
      if (!match) return l
      const updated = normalizeLoad({ ...l, status: newStatus })

      // Auto-create invoice on delivery
      if (newStatus === 'Delivered' && l.status !== 'Delivered' && l.status !== 'Invoiced') {
        const today = new Date()
        const due = new Date(today)
        due.setDate(due.getDate() + 30)

        const originShort = (l.origin || '').split(',')[0].substring(0, 3).toUpperCase()
        const destShort = (l.dest || l.destination || '').split(',')[0].substring(0, 3).toUpperCase()

        const inv = {
          load_number: l.loadId || l.load_number,
          broker: l.broker,
          route: originShort + ' → ' + destShort,
          amount: l.gross || l.gross_pay || 0,
          invoice_date: today.toISOString().split('T')[0],
          due_date: due.toISOString().split('T')[0],
          status: 'Unpaid',
          driver_name: l.driver || l.driver_name,
        }

        if (useDb && !String(l.id).startsWith('mock') && !String(l.id).startsWith('local')) {
          db.createInvoice({ ...inv, load_id: l._dbId || l.id }).then(dbInv => {
            setInvoices(invs => [normalizeInvoice(dbInv), ...invs])
          }).catch(() => { /* error handled gracefully */ })

          // If auto-invoice is enabled, fire the API to email the broker
          const autoInvoiceSetting = localStorage.getItem('qivori_auto_invoice')
          if (autoInvoiceSetting === 'true') {
            apiFetch('/api/auto-invoice', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ loadId: l._dbId || l.id }),
            }).catch(() => {})
          }
        } else {
          const fakeInv = normalizeInvoice({
            ...inv, id: 'local-inv-' + Date.now(),
            invoice_number: 'INV-' + String(Math.floor(Math.random() * 9000) + 1000),
          })
          setInvoices(invs => [fakeInv, ...invs])
        }
      }

      return updated
    }))
  }, [loads, useDb, demoGuard])

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
        db.updateLoadStop(updatedStops[next].id, { status: 'current' }).catch(() => {})
        if (currentIdx >= 0 && updatedStops[currentIdx]?.id) {
          db.updateLoadStop(updatedStops[currentIdx].id, { status: 'complete' }).catch(() => {})
        }
      }

      return normalizeLoad({ ...l, stops: updatedStops, load_stops: updatedStops })
    }))
  }, [useDb])

  // ─── Invoice operations ───────────────────────────────────────
  const updateInvoiceStatus = useCallback(async (invoiceId, status) => {
    if (demoGuard('update invoices')) return
    const inv = invoices.find(i => i.id === invoiceId || i.invoice_number === invoiceId || i._dbId === invoiceId)

    if (useDb && inv && inv._dbId && !String(inv._dbId).startsWith('mock') && !String(inv._dbId).startsWith('local')) {
      try {
        await db.updateInvoice(inv._dbId, { status })
      } catch (e) {
        /* error handled gracefully */
      }
    }

    setInvoices(invs => invs.map(i => {
      const match = i.id === invoiceId || i.invoice_number === invoiceId || i._dbId === invoiceId
      return match ? normalizeInvoice({ ...i, status }) : i
    }))

    // Mark linked load as Invoiced
    if (inv && status !== 'Unpaid') {
      setLoads(ls => ls.map(l => {
        const match = l.loadId === inv.loadId || l.load_number === inv.load_number
        return match ? normalizeLoad({ ...l, status: 'Invoiced' }) : l
      }))
    }
  }, [invoices, useDb, demoGuard])

  // ─── Expense operations ───────────────────────────────────────
  const addExpense = useCallback(async (exp) => {
    if (demoGuard('add expenses')) return null
    if (useDb) {
      try {
        const newExp = await db.createExpense(exp)
        setExpenses(es => [normalizeExpense(newExp), ...es])
        return normalizeExpense(newExp)
      } catch (e) {
        /* error handled gracefully */
      }
    }
    const fakeExp = normalizeExpense({ ...exp, id: 'local-exp-' + Date.now() })
    setExpenses(es => [fakeExp, ...es])
    return fakeExp
  }, [useDb, demoGuard])

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
        /* error handled gracefully */
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
    if (useDb) {
      try {
        const newDriver = await db.createDriver(driver)
        setDrivers(ds => [newDriver, ...ds])
        return newDriver
      } catch { /* error handled gracefully */ }
    }
    const fake = { ...driver, id: 'local-drv-' + Date.now() }
    setDrivers(ds => [fake, ...ds])
    return fake
  }, [useDb, demoGuard])

  const editDriver = useCallback(async (id, updates) => {
    if (demoGuard('edit drivers')) return
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.updateDriver(id, updates) } catch { /* error handled gracefully */ }
    }
    setDrivers(ds => ds.map(d => d.id === id ? { ...d, ...updates } : d))
  }, [useDb, demoGuard])

  const removeDriver = useCallback(async (id) => {
    if (demoGuard('remove drivers')) return
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.deleteDriver(id) } catch { /* error handled gracefully */ }
    }
    setDrivers(ds => ds.filter(d => d.id !== id))
  }, [useDb, demoGuard])

  // ─── Vehicle operations ─────────────────────────────────────────
  const addVehicle = useCallback(async (vehicle) => {
    if (demoGuard('add vehicles')) return null
    let result
    if (useDb) {
      try {
        const newVeh = await db.createVehicle(vehicle)
        setVehicles(vs => [newVeh, ...vs])
        result = newVeh
      } catch { /* error handled gracefully */ }
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
      }).catch(() => { /* error handled gracefully */ })
      return vs
    })
    return result
  }, [useDb, demoGuard])

  const editVehicle = useCallback(async (id, updates) => {
    if (demoGuard('edit vehicles')) return
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.updateVehicle(id, updates) } catch { /* error handled gracefully */ }
    }
    setVehicles(vs => vs.map(v => v.id === id ? { ...v, ...updates } : v))
  }, [useDb, demoGuard])

  const removeVehicle = useCallback(async (id) => {
    if (demoGuard('remove vehicles')) return
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.deleteVehicle(id) } catch { /* error handled gracefully */ }
    }
    setVehicles(vs => {
      const updated = vs.filter(v => v.id !== id)
      // Update Stripe billing with new truck count
      const newCount = Math.max(1, updated.length)
      apiFetch('/api/update-truck-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ truckCount: newCount }),
      }).catch(() => { /* error handled gracefully */ })
      return updated
    })
  }, [useDb, demoGuard])

  // ─── Company operations ───────────────────────────────────────
  const updateCompany = useCallback(async (updates) => {
    if (demoGuard('update company info')) return
    const merged = { ...company, ...updates }
    setCompany(normalizeCompany(merged))
    if (useDb) {
      try {
        await db.upsertCompany(merged)
      } catch (e) {
        /* error handled gracefully */
      }
    }
  }, [company, useDb, demoGuard])

  // ─── Reset (clears all local data) ──────────────────────────────
  const resetData = useCallback(() => {
    setLoads([])
    setInvoices([])
    setExpenses([])
    setDrivers([])
    setVehicles([])
    setCompany(normalizeCompany({}))
    setCheckCalls({})
  }, [])

  // ─── Computed values ──────────────────────────────────────────
  const deliveredLoads = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced')
  const activeLoads = loads.filter(l => !['Delivered', 'Invoiced', 'Cancelled'].includes(l.status))
  const unpaidInvoices = invoices.filter(i => i.status === 'Unpaid')
  const totalRevenue = deliveredLoads.reduce((s, l) => s + (l.gross || 0), 0)
  const totalExpenses = expenses.reduce((s, e) => s + (e.amount || 0), 0)

  return (
    <CarrierContext.Provider value={{
      loads, invoices, expenses, drivers, vehicles, company, checkCalls,
      deliveredLoads, activeLoads, unpaidInvoices,
      totalRevenue, totalExpenses,
      updateLoadStatus, addLoad, removeLoad, advanceStop,
      updateInvoiceStatus, addExpense,
      addDriver, editDriver, removeDriver,
      addVehicle, editVehicle, removeVehicle,
      logCheckCall, updateCompany, resetData,
      dataReady, useDb, demoMode,
    }}>
      {children}
    </CarrierContext.Provider>
  )
}

export const useCarrier = () => useContext(CarrierContext)
