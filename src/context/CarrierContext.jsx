import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import * as db from '../lib/database'

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

// ─── Fallback mock data ──────────────────────────────────────
const MOCK_LOADS = [
  { id:'mock-1', load_number:'QV-5001', broker:'Echo Global',      origin:'Atlanta, GA',   destination:'Chicago, IL',     miles:674,  rate_per_mile:2.94, gross_pay:3840, pickup_date:'2026-03-08', pickup_time:'2:00 PM',  delivery_date:'2026-03-09', delivery_time:'10:00 AM',  weight:'42,000', commodity:'Auto Parts',   driver_name:'James Tucker', status:'Delivered',          reference_number:'EC-88421' },
  { id:'mock-2', load_number:'QV-5002', broker:'Coyote Logistics', origin:'Memphis, TN',   destination:'New York, NY',    miles:1100, rate_per_mile:3.10, gross_pay:5100, pickup_date:'2026-03-10', pickup_time:'8:00 AM',  delivery_date:'2026-03-12', delivery_time:'6:00 PM',   weight:'39,800', commodity:'Electronics',  driver_name:'Marcus Lee',   status:'Rate Con Received',  reference_number:'CL-22910' },
  { id:'mock-3', load_number:'QV-5003', broker:'Echo Global',      origin:'Dallas, TX',    destination:'Miami, FL',       miles:1491, rate_per_mile:3.22, gross_pay:5600, pickup_date:'2026-03-11', pickup_time:'7:00 AM',  delivery_date:'2026-03-13', delivery_time:'5:00 PM',   weight:'38,500', commodity:'Food & Bev',   driver_name:'James Tucker', status:'In Transit',         reference_number:'EC-88430' },
  { id:'mock-4', load_number:'QV-5004', broker:'Transplace',       origin:'Denver, CO',    destination:'Houston, TX',     miles:1020, rate_per_mile:2.61, gross_pay:3400, pickup_date:'2026-03-10', pickup_time:'6:00 AM',  delivery_date:'2026-03-12', delivery_time:'4:00 PM',   weight:'41,200', commodity:'Machinery',    driver_name:'Priya Patel',  status:'Assigned to Driver', reference_number:'TP-19203' },
  { id:'mock-5', load_number:'QV-5005', broker:'W. Express',       origin:'Phoenix, AZ',   destination:'Los Angeles, CA', miles:372,  rate_per_mile:2.41, gross_pay:1850, pickup_date:'2026-03-07', pickup_time:'5:00 PM',  delivery_date:'2026-03-08', delivery_time:'9:00 AM',   weight:'45,000', commodity:'Retail',       driver_name:'James Tucker', status:'Invoiced',           reference_number:'WE-55102' },
  { id:'mock-6', load_number:'QV-5006', broker:'Transplace',       origin:'Chicago, IL',   destination:'Atlanta, GA',     miles:674,  rate_per_mile:2.72, gross_pay:1833, pickup_date:'2026-02-28', pickup_time:'9:00 AM',  delivery_date:'2026-03-01', delivery_time:'7:00 PM',   weight:'40,000', commodity:'Auto Parts',   driver_name:'Marcus Lee',   status:'Invoiced',           reference_number:'TP-18899' },
]

const MOCK_INVOICES = [
  { id:'mock-inv-1', invoice_number:'INV-0100', load_number:'QV-5001', broker:'Echo Global',      route:'ATL → CHI', amount:3840, invoice_date:'2026-03-09', due_date:'2026-04-08', status:'Unpaid',   driver_name:'James Tucker' },
  { id:'mock-inv-2', invoice_number:'INV-0101', load_number:'QV-5005', broker:'W. Express',       route:'PHX → LAX', amount:1850, invoice_date:'2026-03-08', due_date:'2026-04-07', status:'Unpaid',   driver_name:'James Tucker' },
  { id:'mock-inv-3', invoice_number:'INV-0102', load_number:'QV-5006', broker:'Transplace',       route:'CHI → ATL', amount:1833, invoice_date:'2026-03-01', due_date:'2026-03-31', status:'Factored', driver_name:'Marcus Lee'   },
  { id:'mock-inv-4', invoice_number:'INV-0103', load_number:'QV-4380', broker:'Coyote Logistics', route:'MEM → NYC', amount:4200, invoice_date:'2026-02-22', due_date:'2026-03-24', status:'Paid',     driver_name:'Marcus Lee'   },
]

const MOCK_EXPENSES = [
  { id:'mock-exp-1', date:'2026-03-08', category:'Fuel',        amount:284.50, merchant:'Pilot Travel Center',   load_number:'QV-5001', notes:'Fill-up before pickup',  driver_name:'James Tucker' },
  { id:'mock-exp-2', date:'2026-03-07', category:'Fuel',        amount:312.00, merchant:"Love's Travel Stops",   load_number:'QV-5005', notes:'Diesel + DEF',            driver_name:'James Tucker' },
  { id:'mock-exp-3', date:'2026-03-06', category:'Maintenance', amount:420.00, merchant:'TA Truck Service',      load_number:'',        notes:'Oil change + filter',     driver_name:'' },
  { id:'mock-exp-4', date:'2026-03-05', category:'Tolls',       amount:38.75,  merchant:'Illinois Tollway',      load_number:'QV-5006', notes:'I-90 tolls',              driver_name:'Marcus Lee' },
  { id:'mock-exp-5', date:'2026-03-03', category:'Lumper',      amount:200.00, merchant:'Chicago Distribution',  load_number:'QV-5002', notes:'Unload fee',              driver_name:'Marcus Lee' },
  { id:'mock-exp-6', date:'2026-02-28', category:'Fuel',        amount:297.00, merchant:'Pilot Travel Center',   load_number:'QV-5006', notes:'',                        driver_name:'Marcus Lee' },
  { id:'mock-exp-7', date:'2026-02-26', category:'Permits',     amount:200.00, merchant:'IFTA/Oversize',         load_number:'',        notes:'Q1 permits',              driver_name:'' },
]

const MOCK_COMPANY = {
  name: 'Swift Carriers LLC', mc_number: 'MC-294810', dot_number: 'DOT-3821049',
  address: '1420 Truckers Blvd, Minneapolis, MN 55401',
  phone: '(612) 555-0182', email: 'ops@swiftcarriers.com', ein: '82-4910283',
  logo: '',
}

// ─── Provider ────────────────────────────────────────────────
export function CarrierProvider({ children }) {
  const [loads, setLoads] = useState([])
  const [invoices, setInvoices] = useState([])
  const [expenses, setExpenses] = useState([])
  const [company, setCompany] = useState(normalizeCompany(MOCK_COMPANY))
  const [checkCalls, setCheckCalls] = useState({})
  const [dataReady, setDataReady] = useState(false)
  const [useDb, setUseDb] = useState(true)
  const initRef = useRef(false)

  // ─── Load initial data ──────────────────────────────────────
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true

    async function init() {
      try {
        const [dbLoads, dbInvoices, dbExpenses, dbCompany] = await Promise.all([
          db.fetchLoads(),
          db.fetchInvoices(),
          db.fetchExpenses(),
          db.fetchCompany(),
        ])

        setLoads((dbLoads.length ? dbLoads : MOCK_LOADS).map(normalizeLoad))
        setInvoices((dbInvoices.length ? dbInvoices : MOCK_INVOICES).map(normalizeInvoice))
        setExpenses((dbExpenses.length ? dbExpenses : MOCK_EXPENSES).map(normalizeExpense))
        if (dbCompany) setCompany(normalizeCompany(dbCompany))
        setUseDb(true)
      } catch (e) {
        console.warn('Supabase tables not ready, using mock data:', e.message)
        setLoads(MOCK_LOADS.map(normalizeLoad))
        setInvoices(MOCK_INVOICES.map(normalizeInvoice))
        setExpenses(MOCK_EXPENSES.map(normalizeExpense))
        setUseDb(false)
      }
      setDataReady(true)
    }

    init()
  }, [])

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

  const updateLoadStatus = useCallback(async (loadId, newStatus) => {
    const load = loads.find(l => l.loadId === loadId || l.load_id === loadId || l.load_number === loadId || l.id === loadId)
    if (!load) return

    if (useDb && load.id && !String(load.id).startsWith('mock') && !String(load.id).startsWith('local')) {
      try {
        await db.updateLoad(load.id, { status: newStatus })
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

  // ─── Reset ─────────────────────────────────────────────────────
  const resetData = useCallback(() => {
    setLoads(MOCK_LOADS.map(normalizeLoad))
    setInvoices(MOCK_INVOICES.map(normalizeInvoice))
    setExpenses(MOCK_EXPENSES.map(normalizeExpense))
    setCompany(normalizeCompany(MOCK_COMPANY))
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
      loads, invoices, expenses, company, checkCalls,
      deliveredLoads, activeLoads, unpaidInvoices,
      totalRevenue, totalExpenses,
      updateLoadStatus, addLoad, advanceStop,
      updateInvoiceStatus, addExpense,
      logCheckCall, updateCompany, resetData,
      dataReady, useDb,
    }}>
      {children}
    </CarrierContext.Provider>
  )
}

export const useCarrier = () => useContext(CarrierContext)
