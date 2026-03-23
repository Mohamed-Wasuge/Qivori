import { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from 'react'
import * as db from '../lib/database'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'
import { useApp } from './AppContext'
import { setInvoiceCompany } from '../utils/generatePDF'
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
    // Stops — normalize new fields
    stops: (l.load_stops || l.stops || []).map(s => ({
      ...s,
      contact_name: s.contact_name || '',
      contact_phone: s.contact_phone || '',
      reference_number: s.reference_number || '',
      notes: s.notes || '',
      scheduled_date: s.scheduled_date || '',
      actual_arrival: s.actual_arrival || null,
      actual_departure: s.actual_departure || null,
      state: s.state || '',
      zip_code: s.zip_code || '',
    })),
    stopCount: (l.load_stops || l.stops || []).length,
    currentStop: l.load_stops
      ? (l.load_stops.findIndex(s => s.status === 'current') ?? 0)
      : (l.currentStop ?? 0),
    // LTL / Partial fields
    load_type: l.load_type || 'FTL',
    freight_class: l.freight_class || null,
    pallet_count: l.pallet_count || null,
    stackable: l.stackable || false,
    length_inches: l.length_inches || null,
    width_inches: l.width_inches || null,
    height_inches: l.height_inches || null,
    handling_unit: l.handling_unit || null,
    consolidation_id: l.consolidation_id || null,
    // Source tracking
    load_source: l.load_source || null,
    amazon_block_id: l.amazon_block_id || null,
    payment_terms: l.payment_terms || null,
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
  const { demoMode, showToast, isDriver, myDriverId, companyRole, profile } = useApp() || {}

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
  const [qMemories, setQMemories] = useState([])
  const [consolidations, setConsolidations] = useState([])
  const [checkCalls, setCheckCalls] = useState({})
  const [fuelCostPerMile, setFuelCostPerMile] = useState(0.22) // default, updated from EIA
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
        const [dbLoads, dbInvoices, dbExpenses, dbCompany, dbDrivers, dbVehicles, dbMemories, dbConsolidations] = await Promise.all([
          db.fetchLoads(),
          db.fetchInvoices(),
          db.fetchExpenses(),
          db.fetchCompany(),
          db.fetchDrivers(),
          db.fetchVehicles(),
          db.fetchMemories(),
          db.fetchConsolidations(),
        ])

        setLoads(dbLoads.map(normalizeLoad))
        setInvoices(dbInvoices.map(normalizeInvoice))
        setExpenses(dbExpenses.map(normalizeExpense))
        setDrivers(dbDrivers)
        setVehicles(dbVehicles)
        setQMemories(dbMemories)
        setConsolidations(dbConsolidations || [])
        if (dbCompany) {
          const nc = normalizeCompany(dbCompany)
          setCompany(nc)
          setInvoiceCompany(nc)
        }
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

  // ─── Real-time subscriptions ──────────────────────────────────
  useEffect(() => {
    if (demoMode || !useDb) return

    const channels = []

    // Subscribe to loads changes
    const loadsChannel = supabase.channel('realtime-loads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'loads' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setLoads(prev => [normalizeLoad(payload.new), ...prev.filter(l => l.id !== payload.new.id)])
        } else if (payload.eventType === 'UPDATE') {
          setLoads(prev => prev.map(l => l.id === payload.new.id ? normalizeLoad(payload.new) : l))
        } else if (payload.eventType === 'DELETE') {
          setLoads(prev => prev.filter(l => l.id !== payload.old.id))
        }
      })
      .subscribe()
    channels.push(loadsChannel)

    // Subscribe to invoices changes
    const invoicesChannel = supabase.channel('realtime-invoices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setInvoices(prev => [normalizeInvoice(payload.new), ...prev.filter(i => i.id !== payload.new.id)])
        } else if (payload.eventType === 'UPDATE') {
          setInvoices(prev => prev.map(i => i.id === payload.new.id ? normalizeInvoice(payload.new) : i))
        } else if (payload.eventType === 'DELETE') {
          setInvoices(prev => prev.filter(i => i.id !== payload.old.id))
        }
      })
      .subscribe()
    channels.push(invoicesChannel)

    // Subscribe to expenses changes
    const expensesChannel = supabase.channel('realtime-expenses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setExpenses(prev => [normalizeExpense(payload.new), ...prev.filter(e => e.id !== payload.new.id)])
        } else if (payload.eventType === 'UPDATE') {
          setExpenses(prev => prev.map(e => e.id === payload.new.id ? normalizeExpense(payload.new) : e))
        } else if (payload.eventType === 'DELETE') {
          setExpenses(prev => prev.filter(e => e.id !== payload.old.id))
        }
      })
      .subscribe()
    channels.push(expensesChannel)

    return () => {
      channels.forEach(ch => supabase.removeChannel(ch))
    }
  }, [demoMode, useDb])

  // ─── Fetch real diesel prices from EIA API ─────────────────────
  useEffect(() => {
    if (demoMode) return
    apiFetch('/api/diesel-prices').then(r => r.json()).then(data => {
      const prices = data?.prices
      if (prices && prices.length > 0) {
        const usAvg = prices.find(p => p.region === 'US AVG')
        const price = usAvg ? usAvg.price : prices[0].price
        if (price && price > 0) {
          // Convert $/gallon to $/mile (avg truck: 6.5 MPG)
          setFuelCostPerMile(+(price / 6.5).toFixed(3))
        }
      }
    }).catch(() => {}) // keep default $0.22/mi on failure
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
        console.error('DB operation failed:', e)
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
      try { await db.deleteLoad(load.id) } catch (e) { console.error('DB operation failed:', e) }
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
        console.error('DB operation failed:', e)
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
          }).catch(err => { console.error('DB operation failed:', err) })

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
        const now = new Date().toISOString()
        db.updateLoadStop(updatedStops[next].id, { status: 'current', actual_arrival: now }).catch(() => {})
        if (currentIdx >= 0 && updatedStops[currentIdx]?.id) {
          db.updateLoadStop(updatedStops[currentIdx].id, { status: 'complete', actual_departure: now }).catch(() => {})
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
        console.error('DB operation failed:', e)
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
        console.error('DB operation failed:', e)
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
    if (useDb) {
      try {
        const newDriver = await db.createDriver(driver)
        setDrivers(ds => [newDriver, ...ds])
        return newDriver
      } catch (e) { console.error('DB operation failed:', e) }
    }
    const fake = { ...driver, id: 'local-drv-' + Date.now() }
    setDrivers(ds => [fake, ...ds])
    return fake
  }, [useDb, demoGuard])

  const editDriver = useCallback(async (id, updates) => {
    if (demoGuard('edit drivers')) return
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.updateDriver(id, updates) } catch (e) { console.error('DB operation failed:', e) }
    }
    setDrivers(ds => ds.map(d => d.id === id ? { ...d, ...updates } : d))
  }, [useDb, demoGuard])

  const removeDriver = useCallback(async (id) => {
    if (demoGuard('remove drivers')) return
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.deleteDriver(id) } catch (e) { console.error('DB operation failed:', e) }
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
      } catch (e) { console.error('DB operation failed:', e) }
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
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.updateVehicle(id, updates) } catch (e) { console.error('DB operation failed:', e) }
    }
    setVehicles(vs => vs.map(v => v.id === id ? { ...v, ...updates } : v))
  }, [useDb, demoGuard])

  const removeVehicle = useCallback(async (id) => {
    if (demoGuard('remove vehicles')) return
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.deleteVehicle(id) } catch (e) { console.error('DB operation failed:', e) }
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
      } catch (e) {
        console.error('DB operation failed:', e)
      }
    }
  }, [company, useDb, demoGuard])

  // ─── Q Memories (cross-session AI intelligence) ─────────────────
  const addQMemory = useCallback(async (memory) => {
    if (demoGuard()) return null
    const saved = await db.createMemory(memory)
    if (saved) setQMemories(prev => [saved, ...prev])
    return saved
  }, [useDb])

  const removeQMemory = useCallback(async (id) => {
    if (demoGuard()) return
    await db.deleteMemory(id)
    setQMemories(prev => prev.filter(m => m.id !== id))
  }, [useDb])

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

  // ─── Reset (clears all local data) ──────────────────────────────
  const resetData = useCallback(() => {
    setLoads([])
    setInvoices([])
    setExpenses([])
    setDrivers([])
    setVehicles([])
    setCompany(normalizeCompany({}))
    setCheckCalls({})
    setQMemories([])
    setConsolidations([])
  }, [])

  // ─── Driver filtering ────────────────────────────────────────
  // For driver-role users, filter data to only their assigned loads/expenses
  const driverName = isDriver ? (profile?.full_name || '') : ''

  const isMyLoad = useCallback((load) => {
    if (!isDriver) return true
    // Match by driver_id if available
    if (myDriverId && load.driver_id === myDriverId) return true
    // Fallback: match by driver_name
    if (driverName && (load.driver_name || load.driver || load.carrier_name || '').toLowerCase() === driverName.toLowerCase()) return true
    return false
  }, [isDriver, myDriverId, driverName])

  const isMyExpense = useCallback((exp) => {
    if (!isDriver) return true
    if (myDriverId && exp.driver_id === myDriverId) return true
    if (driverName && (exp.driver_name || exp.driver || '').toLowerCase() === driverName.toLowerCase()) return true
    return false
  }, [isDriver, myDriverId, driverName])

  const isMyInvoice = useCallback((inv) => {
    if (!isDriver) return true
    // Match by driver_name or by load linkage
    if (driverName && (inv.driver_name || inv.driver || '').toLowerCase() === driverName.toLowerCase()) return true
    return false
  }, [isDriver, driverName])

  // Filtered data views for driver role
  const visibleLoads = useMemo(() => isDriver ? loads.filter(isMyLoad) : loads, [loads, isDriver, isMyLoad])
  const visibleExpenses = useMemo(() => isDriver ? expenses.filter(isMyExpense) : expenses, [expenses, isDriver, isMyExpense])
  const visibleInvoices = useMemo(() => isDriver ? invoices.filter(isMyInvoice) : invoices, [invoices, isDriver, isMyInvoice])

  // ─── Computed values ──────────────────────────────────────────
  const deliveredLoads = visibleLoads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced')
  const activeLoads = visibleLoads.filter(l => !['Delivered', 'Invoiced', 'Cancelled'].includes(l.status))
  const unpaidInvoices = visibleInvoices.filter(i => i.status === 'Unpaid')
  const totalRevenue = deliveredLoads.reduce((s, l) => s + (l.gross || 0), 0)
  const totalExpenses = visibleExpenses.reduce((s, e) => s + (e.amount || 0), 0)

  // Broker intelligence — score brokers from load + invoice history
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
      // on-time: delivered before or on scheduled date (if available)
      if (l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid') {
        b.total += 1
        if (l.delivery_date && l.actual_delivery) {
          if (new Date(l.actual_delivery) <= new Date(l.delivery_date)) b.onTime += 1
          else b.onTime += 0
        } else {
          b.onTime += 1 // assume on-time if no dates to compare
        }
      }
    })
    // Match invoices to brokers via load_id
    const loadBrokerMap = {}
    loads.forEach(l => {
      const name = l.broker_name || l.broker
      if (name && l.id) loadBrokerMap[l.id] = name
    })
    invoices.forEach(inv => {
      const brokerName = inv.broker_name || inv.broker || loadBrokerMap[inv.load_id]
      if (!brokerName || !map[brokerName]) return
      if (inv.status === 'Paid') {
        const created = new Date(inv.created_at || inv.date)
        const paid = new Date(inv.paid_at || inv.updated_at)
        if (!isNaN(created) && !isNaN(paid)) {
          const days = Math.max(0, Math.round((paid - created) / 86400000))
          map[brokerName].payDays.push(days)
        }
      }
    })
    return Object.values(map)
      .map(b => ({
        name: b.name,
        totalLoads: b.loads,
        totalRevenue: b.totalRevenue,
        avgRpm: b.miles > 0 ? (b.totalRevenue / b.miles).toFixed(2) : 'N/A',
        avgDaysToPay: b.payDays.length > 0 ? Math.round(b.payDays.reduce((s, d) => s + d, 0) / b.payDays.length) : null,
        onTimeRate: b.total > 0 ? Math.round((b.onTime / b.total) * 100) : null,
      }))
      .sort((a, b) => b.totalLoads - a.totalLoads)
  }, [loads, invoices])

  return (
    <CarrierContext.Provider value={{
      loads: visibleLoads, invoices: visibleInvoices, expenses: visibleExpenses,
      allLoads: loads, allInvoices: invoices, allExpenses: expenses,
      drivers, vehicles, company, checkCalls, qMemories, consolidations,
      deliveredLoads, activeLoads, unpaidInvoices,
      totalRevenue, totalExpenses, brokerStats, fuelCostPerMile,
      updateLoadStatus, addLoad, addLoadWithStops, removeLoad, advanceStop,
      updateInvoiceStatus, addExpense,
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
