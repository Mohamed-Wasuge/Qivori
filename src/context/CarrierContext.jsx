import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const CarrierContext = createContext(null)

const INITIAL_LOADS = [
  { id:1, loadId:'FM-4421', broker:'Echo Global',      origin:'Atlanta, GA',   dest:'Chicago, IL',     miles:674,  rate:2.94, gross:3840, pickup:'Mar 8 · 2:00 PM',  delivery:'Mar 9 · 10:00 AM',  weight:'42,000', commodity:'Auto Parts',   driver:'James Tucker', status:'Delivered',          refNum:'EC-88421' },
  { id:2, loadId:'FM-4388', broker:'Coyote Logistics', origin:'Memphis, TN',   dest:'New York, NY',    miles:1100, rate:3.10, gross:5100, pickup:'Mar 10 · 8:00 AM', delivery:'Mar 12 · 6:00 PM',  weight:'39,800', commodity:'Electronics',  driver:'Marcus Lee',   status:'Rate Con Received',  refNum:'CL-22910' },
  { id:3, loadId:'FM-4460', broker:'Echo Global',      origin:'Dallas, TX',    dest:'Miami, FL',       miles:1491, rate:3.22, gross:5600, pickup:'Mar 11 · 7:00 AM', delivery:'Mar 13 · 5:00 PM',  weight:'38,500', commodity:'Food & Bev',   driver:'James Tucker', status:'In Transit',         refNum:'EC-88430',
    stops:[
      { seq:1, type:'pickup',  city:'Dallas, TX',      addr:'2400 Commerce St',       time:'Mar 11 · 7:00 AM',  status:'complete' },
      { seq:2, type:'dropoff', city:'New Orleans, LA', addr:'1100 Port of NO Blvd',   time:'Mar 12 · 9:00 AM',  status:'current'  },
      { seq:3, type:'dropoff', city:'Miami, FL',       addr:'8800 NW 36th St',         time:'Mar 13 · 5:00 PM',  status:'pending'  },
    ], currentStop:1 },
  { id:4, loadId:'FM-4445', broker:'Transplace',       origin:'Denver, CO',    dest:'Houston, TX',     miles:1020, rate:2.61, gross:3400, pickup:'Mar 10 · 6:00 AM', delivery:'Mar 12 · 4:00 PM',  weight:'41,200', commodity:'Machinery',    driver:'Priya Patel',  status:'Assigned to Driver', refNum:'TP-19203',
    stops:[
      { seq:1, type:'pickup',  city:'Denver, CO',    addr:'4500 Industrial Blvd',  time:'Mar 10 · 6:00 AM',  status:'pending' },
      { seq:2, type:'pickup',  city:'Amarillo, TX',  addr:'800 W Industrial Ave',  time:'Mar 11 · 8:00 AM',  status:'pending' },
      { seq:3, type:'dropoff', city:'Houston, TX',   addr:'5900 Gulf Frwy',        time:'Mar 12 · 4:00 PM',  status:'pending' },
    ], currentStop:0 },
  { id:5, loadId:'FM-4412', broker:'W. Express',       origin:'Phoenix, AZ',   dest:'Los Angeles, CA', miles:372,  rate:2.41, gross:1850, pickup:'Mar 7 · 5:00 PM',  delivery:'Mar 8 · 9:00 AM',   weight:'45,000', commodity:'Retail',       driver:'James Tucker', status:'Invoiced',           refNum:'WE-55102' },
  { id:6, loadId:'FM-4398', broker:'Transplace',       origin:'Chicago, IL',   dest:'Atlanta, GA',     miles:674,  rate:2.72, gross:1833, pickup:'Feb 28 · 9:00 AM', delivery:'Mar 1 · 7:00 PM',   weight:'40,000', commodity:'Auto Parts',   driver:'Marcus Lee',   status:'Invoiced',           refNum:'TP-18899' },
]

const INITIAL_INVOICES = [
  { id:'INV-043', loadId:'FM-4421', broker:'Echo Global',      route:'ATL → CHI', amount:3840, date:'Mar 9',  dueDate:'Apr 8',  status:'Unpaid',   driver:'James Tucker' },
  { id:'INV-042', loadId:'FM-4412', broker:'W. Express',       route:'PHX → LAX', amount:1850, date:'Mar 8',  dueDate:'Apr 7',  status:'Unpaid',   driver:'James Tucker' },
  { id:'INV-041', loadId:'FM-4398', broker:'Transplace',       route:'CHI → ATL', amount:1833, date:'Mar 1',  dueDate:'Mar 31', status:'Factored',  driver:'Marcus Lee'   },
  { id:'INV-040', loadId:'FM-4380', broker:'Coyote Logistics', route:'MEM → NYC', amount:4200, date:'Feb 22', dueDate:'Mar 24', status:'Paid',      driver:'Marcus Lee'   },
  { id:'INV-039', loadId:'FM-4371', broker:'Echo Global',      route:'ATL → CHI', amount:3920, date:'Feb 18', dueDate:'Mar 20', status:'Paid',      driver:'James Tucker' },
]

const INITIAL_EXPENSES = [
  { id:1, date:'Mar 8',  cat:'Fuel',        amount:284.50, merchant:'Pilot Travel Center',    load:'FM-4421', notes:'Fill-up before pickup',      driver:'James Tucker' },
  { id:2, date:'Mar 7',  cat:'Fuel',        amount:312.00, merchant:'Love\'s Travel Stops',   load:'FM-4412', notes:'Diesel + DEF',               driver:'James Tucker' },
  { id:3, date:'Mar 6',  cat:'Maintenance', amount:420.00, merchant:'TA Truck Service',       load:'',        notes:'Oil change + filter',        driver:'' },
  { id:4, date:'Mar 5',  cat:'Tolls',       amount:38.75,  merchant:'Illinois Tollway',       load:'FM-4398', notes:'I-90 tolls',                 driver:'Marcus Lee' },
  { id:5, date:'Mar 3',  cat:'Lumper',      amount:200.00, merchant:'Chicago Distribution',  load:'FM-4388', notes:'Unload fee',                 driver:'Marcus Lee' },
  { id:6, date:'Feb 28', cat:'Fuel',        amount:297.00, merchant:'Pilot Travel Center',   load:'FM-4398', notes:'',                           driver:'Marcus Lee' },
  { id:7, date:'Feb 26', cat:'Permits',     amount:200.00, merchant:'IFTA/Oversize',         load:'',        notes:'Q1 permits',                 driver:'' },
]

function loadFromStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function genInvoiceId(existing) {
  const nums = existing.map(i => parseInt(i.id.replace('INV-', ''))).filter(Boolean)
  const next = nums.length ? Math.max(...nums) + 1 : 44
  return 'INV-' + String(next).padStart(3, '0')
}

function addDays(dateStr, days) {
  // Simple date string offset — returns "Apr 8" style
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const parts = dateStr.split(' ')
  if (parts.length < 2) return dateStr
  const mon = months.indexOf(parts[0])
  const day = parseInt(parts[1])
  if (mon < 0 || isNaN(day)) return dateStr
  const d = new Date(2026, mon, day + days)
  return months[d.getMonth()] + ' ' + d.getDate()
}

const INITIAL_COMPANY = {
  name: 'Swift Carriers LLC', mc: 'MC-294810', dot: 'DOT-3821049',
  address: '1420 Truckers Blvd, Minneapolis, MN 55401',
  phone: '(612) 555-0182', email: 'ops@swiftcarriers.com', ein: '82-4910283',
  logo: '',
}

// Seed some realistic check call history for demo loads
const INITIAL_CHECK_CALLS = {
  'FM-4460': [
    { id:1, ts: Date.now() - 5*60*60*1000, location:'New Orleans, LA', status:'On Time',      eta:'Mar 13 · 5:00 PM', notes:'Light traffic, no issues' },
    { id:2, ts: Date.now() - 9*60*60*1000, location:'Baton Rouge, LA', status:'On Time',      eta:'Mar 13 · 5:00 PM', notes:'' },
    { id:3, ts: Date.now() - 14*60*60*1000,location:'Houston, TX',     status:'At Stop',      eta:'Mar 13 · 5:00 PM', notes:'Picked up, departed stop 1' },
  ],
  'FM-4388': [
    { id:1, ts: Date.now() - 2*60*60*1000, location:'Nashville, TN',   status:'On Time',      eta:'Mar 12 · 6:00 PM', notes:'Moving good' },
  ],
}

export function CarrierProvider({ children }) {
  const [loads, setLoads]           = useState(() => loadFromStorage('fm_loads',        INITIAL_LOADS))
  const [invoices, setInvoices]     = useState(() => loadFromStorage('fm_invoices',     INITIAL_INVOICES))
  const [expenses, setExpenses]     = useState(() => loadFromStorage('fm_expenses',     INITIAL_EXPENSES))
  const [company, setCompany]       = useState(() => loadFromStorage('fm_company',      INITIAL_COMPANY))
  const [checkCalls, setCheckCalls] = useState(() => loadFromStorage('fm_checkcalls',   INITIAL_CHECK_CALLS))

  useEffect(() => { localStorage.setItem('fm_company', JSON.stringify(company)) }, [company])
  const updateCompany = useCallback((updates) => setCompany(c => ({ ...c, ...updates })), [])

  // Persist to localStorage
  useEffect(() => { localStorage.setItem('fm_loads',      JSON.stringify(loads))      }, [loads])
  useEffect(() => { localStorage.setItem('fm_invoices',   JSON.stringify(invoices))   }, [invoices])
  useEffect(() => { localStorage.setItem('fm_expenses',   JSON.stringify(expenses))   }, [expenses])
  useEffect(() => { localStorage.setItem('fm_checkcalls', JSON.stringify(checkCalls)) }, [checkCalls])

  // Update load status — auto-creates invoice when status hits "Delivered"
  const updateLoadStatus = useCallback((loadId, newStatus) => {
    setLoads(ls => ls.map(l => {
      if (l.loadId !== loadId) return l
      const updated = { ...l, status: newStatus }
      if (newStatus === 'Delivered' && l.status !== 'Delivered' && l.status !== 'Invoiced') {
        const delDate = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' })
        const dueDate = addDays(delDate, 30)
        const inv = {
          id:      genInvoiceId([]),  // will be recalculated with setInvoices
          loadId:  l.loadId,
          broker:  l.broker,
          route:   l.origin.split(',')[0].substring(0,3).toUpperCase() + ' → ' + l.dest.split(',')[0].substring(0,3).toUpperCase(),
          amount:  l.gross,
          date:    delDate,
          dueDate,
          status:  'Unpaid',
          driver:  l.driver,
        }
        setInvoices(invs => {
          const id = genInvoiceId(invs)
          return [{ ...inv, id }, ...invs]
        })
      }
      return updated
    }))
  }, [])

  const addLoad = useCallback((load) => {
    setLoads(ls => {
      const id = ls.length ? Math.max(...ls.map(l => l.id)) + 1 : 1
      const loadId = 'FM-' + (4500 + id)
      return [{ ...load, id, loadId, status: 'Rate Con Received' }, ...ls]
    })
  }, [])

  const updateInvoiceStatus = useCallback((invoiceId, status) => {
    setInvoices(invs => invs.map(inv =>
      inv.id === invoiceId ? { ...inv, status } : inv
    ))
    // Mark the linked load as Invoiced when invoice is created/factored
    setLoads(ls => ls.map(l => {
      const inv = invoices.find(i => i.id === invoiceId)
      if (inv && l.loadId === inv.loadId && status !== 'Unpaid') {
        return { ...l, status: 'Invoiced' }
      }
      return l
    }))
  }, [invoices])

  const logCheckCall = useCallback((loadId, call) => {
    setCheckCalls(cc => {
      const existing = cc[loadId] || []
      const id = existing.length ? Math.max(...existing.map(c => c.id)) + 1 : 1
      return { ...cc, [loadId]: [{ ...call, id, ts: Date.now() }, ...existing] }
    })
  }, [])

  // Advance to next stop on a multi-stop load
  const advanceStop = useCallback((loadId) => {
    setLoads(ls => ls.map(l => {
      if (l.loadId !== loadId || !l.stops) return l
      const next = l.currentStop + 1
      if (next >= l.stops.length) return l
      const updatedStops = l.stops.map((s, i) => ({
        ...s,
        status: i < next ? 'complete' : i === next ? 'current' : 'pending'
      }))
      const allDelivered = next === l.stops.length - 1 && l.stops[next].type === 'dropoff'
      return { ...l, stops: updatedStops, currentStop: next, ...(allDelivered ? { status: 'Delivered' } : {}) }
    }))
  }, [])

  const addExpense = useCallback((exp) => {
    setExpenses(es => {
      const id = es.length ? Math.max(...es.map(e => e.id)) + 1 : 1
      return [{ ...exp, id }, ...es]
    })
  }, [])

  const resetData = useCallback(() => {
    localStorage.removeItem('fm_loads')
    localStorage.removeItem('fm_invoices')
    localStorage.removeItem('fm_expenses')
    setLoads(INITIAL_LOADS)
    setInvoices(INITIAL_INVOICES)
    setExpenses(INITIAL_EXPENSES)
  }, [])

  // Computed helpers
  const deliveredLoads   = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced')
  const activeLoads      = loads.filter(l => !['Delivered','Invoiced'].includes(l.status))
  const unpaidInvoices   = invoices.filter(i => i.status === 'Unpaid')
  const totalRevenue     = deliveredLoads.reduce((s, l) => s + l.gross, 0)
  const totalExpenses    = expenses.reduce((s, e) => s + e.amount, 0)

  return (
    <CarrierContext.Provider value={{
      loads, invoices, expenses, company,
      deliveredLoads, activeLoads, unpaidInvoices,
      totalRevenue, totalExpenses,
      updateLoadStatus, addLoad, advanceStop,
      updateInvoiceStatus, addExpense,
      logCheckCall, checkCalls,
      updateCompany, resetData,
    }}>
      {children}
    </CarrierContext.Provider>
  )
}

export const useCarrier = () => useContext(CarrierContext)
