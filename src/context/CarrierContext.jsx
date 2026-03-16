import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import * as db from '../lib/database'
import { apiFetch } from '../lib/api'
import { useApp } from './AppContext'

const CarrierContext = createContext(null)

// ─── Demo sample data ────────────────────────────────────────
const DEMO_LOADS = [
  { id: 'd1', load_id: 'QV-8001', origin: 'Chicago, IL', destination: 'Detroit, MI', rate: 3200, miles: 282, weight: '42,000 lbs', equipment: 'Dry Van', status: 'In Transit', broker_name: 'TQL Logistics', carrier_name: 'Mike Johnson', pickup_date: '2026-03-14', delivery_date: '2026-03-15' },
  { id: 'd2', load_id: 'QV-8002', origin: 'Dallas, TX', destination: 'Houston, TX', rate: 1850, miles: 239, weight: '38,000 lbs', equipment: 'Reefer', status: 'Delivered', broker_name: 'CH Robinson', carrier_name: 'Mike Johnson', pickup_date: '2026-03-12', delivery_date: '2026-03-13' },
  { id: 'd3', load_id: 'QV-8003', origin: 'Atlanta, GA', destination: 'Nashville, TN', rate: 2400, miles: 249, weight: '35,000 lbs', equipment: 'Flatbed', status: 'Rate Con Received', broker_name: 'XPO Logistics', carrier_name: '', pickup_date: '2026-03-16', delivery_date: '2026-03-17' },
  { id: 'd4', load_id: 'QV-8004', origin: 'Minneapolis, MN', destination: 'Milwaukee, WI', rate: 1600, miles: 337, weight: '44,000 lbs', equipment: 'Dry Van', status: 'Assigned to Driver', broker_name: 'Echo Global', carrier_name: 'Sarah Davis', pickup_date: '2026-03-15', delivery_date: '2026-03-16' },
  { id: 'd5', load_id: 'QV-8005', origin: 'Los Angeles, CA', destination: 'Phoenix, AZ', rate: 2800, miles: 373, weight: '40,000 lbs', equipment: 'Reefer', status: 'Invoiced', broker_name: 'Coyote Logistics', carrier_name: 'Mike Johnson', pickup_date: '2026-03-10', delivery_date: '2026-03-11' },
  { id: 'd6', load_id: 'QV-8006', origin: 'Denver, CO', destination: 'Kansas City, MO', rate: 2100, miles: 606, weight: '36,000 lbs', equipment: 'Dry Van', status: 'En Route to Pickup', broker_name: 'Landstar', carrier_name: 'James Wilson', pickup_date: '2026-03-15', delivery_date: '2026-03-16' },
]
const DEMO_INVOICES = [
  { id: 'inv1', invoice_number: 'INV-1001', load_number: 'QV-8002', amount: 1850, status: 'Paid', invoice_date: '2026-03-13', due_date: '2026-03-27', driver_name: 'Mike Johnson' },
  { id: 'inv2', invoice_number: 'INV-1002', load_number: 'QV-8005', amount: 2800, status: 'Pending', invoice_date: '2026-03-11', due_date: '2026-03-25', driver_name: 'Mike Johnson' },
  { id: 'inv3', invoice_number: 'INV-1003', load_number: 'QV-8001', amount: 3200, status: 'Unpaid', invoice_date: '2026-03-15', due_date: '2026-03-29', driver_name: 'Mike Johnson' },
]
const DEMO_EXPENSES = [
  { id: 'exp1', description: 'Diesel — Loves Travel Stop', category: 'Fuel', amount: 485, date: '2026-03-14', load_number: 'QV-8001', driver_name: 'Mike Johnson' },
  { id: 'exp2', description: 'Oil change', category: 'Maintenance', amount: 280, date: '2026-03-12', load_number: '', driver_name: '' },
  { id: 'exp3', description: 'Toll — Illinois Tollway', category: 'Tolls', amount: 32, date: '2026-03-14', load_number: 'QV-8001', driver_name: 'Mike Johnson' },
  { id: 'exp4', description: 'Diesel — Pilot', category: 'Fuel', amount: 412, date: '2026-03-10', load_number: 'QV-8005', driver_name: 'Mike Johnson' },
]
const DEMO_DRIVERS = [
  { id: 'drv1', name: 'Mike Johnson', phone: '(555) 111-2222', email: 'mike@demo.com', license_number: 'CDL-A 12345', status: 'Active', hire_date: '2024-06-15' },
  { id: 'drv2', name: 'Sarah Davis', phone: '(555) 333-4444', email: 'sarah@demo.com', license_number: 'CDL-A 67890', status: 'Active', hire_date: '2025-01-10' },
  { id: 'drv3', name: 'James Wilson', phone: '(555) 555-6666', email: 'james@demo.com', license_number: 'CDL-A 11223', status: 'Active', hire_date: '2025-08-01' },
]
const DEMO_VEHICLES = [
  { id: 'veh1', type: 'Dry Van', year: '2022', make: 'Freightliner', model: 'Cascadia', vin: '1FUJGLDR5MLKJ2841', license_plate: 'MN-94821', status: 'Active', assigned_driver: 'Mike Johnson' },
  { id: 'veh2', type: 'Reefer', year: '2023', make: 'Kenworth', model: 'T680', vin: '2XKYD49X3PM456789', license_plate: 'TX-38291', status: 'Active', assigned_driver: 'Sarah Davis' },
  { id: 'veh3', type: 'Flatbed', year: '2021', make: 'Peterbilt', model: '579', vin: '1XPWD40X1PD987654', license_plate: 'GA-72104', status: 'Active', assigned_driver: 'James Wilson' },
]
const DEMO_COMPANY = { name: 'Demo Trucking LLC', mc: 'MC-123456', dot: '2823675', mc_number: 'MC-123456', dot_number: '2823675', phone: '(555) 999-0000' }

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
  const { demoMode } = useApp() || {}
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
        console.warn('Supabase not ready, starting empty:', e.message)
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
    if (useDb) {
      try {
        const newLoad = await db.createLoad(load)
        const normalized = normalizeLoad(newLoad)
        setLoads(ls => [normalized, ...ls])
        return normalized
      } catch (e) {
        console.error('Failed to create load:', e)
      }
    }
    // Fallback: local-only
    const fakeId = 'local-' + Date.now()
    const num = 'QV-' + (5000 + Math.floor(Math.random() * 1000))
    const newLoad = normalizeLoad({ ...load, id: fakeId, load_number: num, status: 'Rate Con Received' })
    setLoads(ls => [newLoad, ...ls])
    return newLoad
  }, [useDb])

  const removeLoad = useCallback(async (loadId) => {
    const load = loads.find(l => l.loadId === loadId || l.load_id === loadId || l.load_number === loadId || l.id === loadId)
    if (!load) return
    if (useDb && load.id && !String(load.id).startsWith('mock') && !String(load.id).startsWith('local')) {
      try { await db.deleteLoad(load.id) } catch (e) { console.error('Failed to delete load:', e) }
    }
    setLoads(ls => ls.filter(l => !(l.loadId === loadId || l.load_id === loadId || l.load_number === loadId || l.id === loadId)))
    // Also remove any linked invoices
    setInvoices(invs => invs.filter(i => i.loadId !== loadId && i.load_number !== loadId))
  }, [loads, useDb])

  const updateLoadStatus = useCallback(async (loadId, newStatus) => {
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
        console.error('Failed to update load:', e)
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
          }).catch(e => console.error('Failed to create invoice:', e))
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
  }, [loads, useDb])

  const advanceStop = useCallback(async (loadId) => {
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
    const inv = invoices.find(i => i.id === invoiceId || i.invoice_number === invoiceId || i._dbId === invoiceId)

    if (useDb && inv && inv._dbId && !String(inv._dbId).startsWith('mock') && !String(inv._dbId).startsWith('local')) {
      try {
        await db.updateInvoice(inv._dbId, { status })
      } catch (e) {
        console.error('Failed to update invoice:', e)
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
  }, [invoices, useDb])

  // ─── Expense operations ───────────────────────────────────────
  const addExpense = useCallback(async (exp) => {
    if (useDb) {
      try {
        const newExp = await db.createExpense(exp)
        setExpenses(es => [normalizeExpense(newExp), ...es])
        return normalizeExpense(newExp)
      } catch (e) {
        console.error('Failed to create expense:', e)
      }
    }
    const fakeExp = normalizeExpense({ ...exp, id: 'local-exp-' + Date.now() })
    setExpenses(es => [fakeExp, ...es])
    return fakeExp
  }, [useDb])

  // ─── Check calls ──────────────────────────────────────────────
  const logCheckCall = useCallback(async (loadNumber, call) => {
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
        console.error('Failed to log check call:', e)
      }
    }

    setCheckCalls(cc => {
      const existing = cc[loadNumber] || []
      const id = 'local-cc-' + Date.now()
      return { ...cc, [loadNumber]: [{ ...call, id, ts: Date.now(), called_at: new Date().toISOString() }, ...existing] }
    })
  }, [loads, useDb])

  // ─── Driver operations ──────────────────────────────────────────
  const addDriver = useCallback(async (driver) => {
    if (useDb) {
      try {
        const newDriver = await db.createDriver(driver)
        setDrivers(ds => [newDriver, ...ds])
        return newDriver
      } catch (e) { console.error('Failed to create driver:', e) }
    }
    const fake = { ...driver, id: 'local-drv-' + Date.now() }
    setDrivers(ds => [fake, ...ds])
    return fake
  }, [useDb])

  const editDriver = useCallback(async (id, updates) => {
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.updateDriver(id, updates) } catch (e) { console.error('Failed to update driver:', e) }
    }
    setDrivers(ds => ds.map(d => d.id === id ? { ...d, ...updates } : d))
  }, [useDb])

  const removeDriver = useCallback(async (id) => {
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.deleteDriver(id) } catch (e) { console.error('Failed to delete driver:', e) }
    }
    setDrivers(ds => ds.filter(d => d.id !== id))
  }, [useDb])

  // ─── Vehicle operations ─────────────────────────────────────────
  const addVehicle = useCallback(async (vehicle) => {
    let result
    if (useDb) {
      try {
        const newVeh = await db.createVehicle(vehicle)
        setVehicles(vs => [newVeh, ...vs])
        result = newVeh
      } catch (e) { console.error('Failed to create vehicle:', e) }
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
      }).catch(e => console.warn('Truck billing update failed:', e))
      return vs
    })
    return result
  }, [useDb])

  const editVehicle = useCallback(async (id, updates) => {
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.updateVehicle(id, updates) } catch (e) { console.error('Failed to update vehicle:', e) }
    }
    setVehicles(vs => vs.map(v => v.id === id ? { ...v, ...updates } : v))
  }, [useDb])

  const removeVehicle = useCallback(async (id) => {
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.deleteVehicle(id) } catch (e) { console.error('Failed to delete vehicle:', e) }
    }
    setVehicles(vs => {
      const updated = vs.filter(v => v.id !== id)
      // Update Stripe billing with new truck count
      const newCount = Math.max(1, updated.length)
      apiFetch('/api/update-truck-count', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ truckCount: newCount }),
      }).catch(e => console.warn('Truck billing update failed:', e))
      return updated
    })
  }, [useDb])

  // ─── Company operations ───────────────────────────────────────
  const updateCompany = useCallback(async (updates) => {
    const merged = { ...company, ...updates }
    setCompany(normalizeCompany(merged))
    if (useDb) {
      try {
        await db.upsertCompany(merged)
      } catch (e) {
        console.error('Failed to update company:', e)
      }
    }
  }, [company, useDb])

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
      dataReady, useDb,
    }}>
      {children}
    </CarrierContext.Provider>
  )
}

export const useCarrier = () => useContext(CarrierContext)
