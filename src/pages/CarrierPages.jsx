import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { BarChart2, Flame, Target, DollarSign, AlertTriangle, CheckCircle, Clock, MapPin, Wrench, FileText, Phone, Package, Truck, Users, CreditCard, Receipt, Zap, Bot, Star, Activity, Search, Shield, Bell, Wallet, Map, Droplets, FileCheck, ShieldCheck, AlertCircle, User, UserPlus, Briefcase, Settings, Layers, Eye, Download, Upload, Send, Check, ChevronRight, Plus, Filter, Calendar, Hash, Gauge, Radio, TrendingUp, TrendingDown, MessageCircle, Flag, Square, Edit3 as PencilIcon, Moon, Lightbulb, Cpu, Fuel, Route, Navigation, CircleDot, Bookmark, MailOpen, Inbox, Building2, FlaskConical, Sparkles, Trophy, ArrowRight, RefreshCw, Brain, Construction, Snowflake, TrafficCone, BellOff, Banknote, Archive, Paperclip, HardDrive, Siren, Dumbbell, GraduationCap, Dice5, Plug, Heart, Pill, Beer, Bomb, Save } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useCarrier } from '../context/CarrierContext'
import { generateInvoicePDF, generateSettlementPDF, generateIFTAPDF } from '../utils/generatePDF'
import { apiFetch } from '../lib/api'

const Ic = ({ icon: Icon, size = 14, ...p }) => <Icon size={size} {...p} />

// ─── shared helpers ────────────────────────────────────────────────────────────
const S = {
  page: { padding: 20, paddingBottom: 60, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 },
  panel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' },
  panelHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' },
  panelTitle: { fontSize: 13, fontWeight: 700 },
  panelBody: { padding: 16 },
  grid: (n) => ({ display: 'grid', gridTemplateColumns: `repeat(${n},1fr)`, gap: 12 }),
  stat: (color = 'var(--accent)') => ({
    background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '14px 16px', textAlign: 'center',
  }),
  badge: (color) => ({
    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
    background: color + '15', color, border: '1px solid ' + color + '30',
    display: 'inline-block'
  }),
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' },
  tag: (color) => ({ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: color + '15', color }),
}

function StatCard({ label, value, change, color = 'var(--accent)', changeType = 'up' }) {
  return (
    <div style={S.stat()}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, color, letterSpacing: 1 }}>{value}</div>
      {change && <div style={{ fontSize: 11, color: changeType === 'up' ? 'var(--success)' : changeType === 'down' ? 'var(--danger)' : 'var(--muted)', marginTop: 4 }}>{change}</div>}
    </div>
  )
}

function AiBanner({ title, sub, action, onAction }) {
  return (
    <div style={{ background: 'linear-gradient(135deg,rgba(240,165,0,0.08),rgba(0,212,170,0.06))', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ fontSize: 22, animation: 'pulse 2s infinite' }}><Bot size={22} /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div>
      </div>
      {action && <button className="btn btn-primary" onClick={onAction}>{action}</button>}
    </div>
  )
}

// ─── AI DASHBOARD ─────────────────────────────────────────────────────────────
export function CarrierDashboard() {
  const { navigatePage, showToast } = useApp()
  const ctx = useCarrier() || {}
  const loads = ctx.loads || []
  const activeLoads = ctx.activeLoads || []
  const invoices = ctx.invoices || []
  const expenses = ctx.expenses || []
  const drivers = ctx.drivers || []
  const vehicles = ctx.vehicles || []
  const totalRevenue = ctx.totalRevenue || 0
  const totalExpenses = ctx.totalExpenses || 0
  const unpaidInvoices = ctx.unpaidInvoices || []

  const totalMiles = loads.reduce((s, l) => s + (Number(l.miles) || 0), 0)
  const fleetUtil = Math.round((activeLoads.length / (vehicles.length || 1)) * 100)
  const netProfit = totalRevenue - totalExpenses

  const fmtCurrency = (v) => {
    if (v >= 1000) return '$' + (v / 1000).toFixed(1) + 'K'
    return '$' + v.toLocaleString()
  }

  const [dismissed, setDismissed] = useState([])

  const recommendations = useMemo(() => {
    const recs = []
    let id = 1
    if (loads.length === 0) recs.push({ id: id++, type: 'GET STARTED', color: 'var(--accent)', icon: Plus, title: 'Add your first load to start tracking revenue', sub: 'Go to Loads to create a new shipment', action: 'Add Load', onAction: () => navigatePage('carrier-loads') })
    if (drivers.length === 0) recs.push({ id: id++, type: 'DRIVERS', color: 'var(--accent2)', icon: Users, title: 'Add drivers to enable dispatch', sub: 'Go to Drivers to add your team', action: 'Add Driver', onAction: () => navigatePage('carrier-drivers') })
    if (unpaidInvoices.length > 0) recs.push({ id: id++, type: 'INVOICES', color: 'var(--warning)', icon: Receipt, title: `You have ${unpaidInvoices.length} unpaid invoice${unpaidInvoices.length > 1 ? 's' : ''}`, sub: `Total outstanding: $${unpaidInvoices.reduce((s, i) => s + (Number(i.amount) || Number(i.total) || 0), 0).toLocaleString()}`, action: 'View', onAction: () => navigatePage('carrier-invoicing') })
    if (activeLoads.length > 0) recs.push({ id: id++, type: 'IN TRANSIT', color: 'var(--accent3)', icon: Truck, title: `You have ${activeLoads.length} active load${activeLoads.length > 1 ? 's' : ''} in transit`, sub: 'Monitor progress in dispatch', action: 'Track', onAction: () => navigatePage('carrier-dispatch') })
    return recs
  }, [loads.length, drivers.length, unpaidInvoices.length, activeLoads.length])

  const filteredRecs = recommendations.filter(r => !dismissed.includes(r.id))

  const brokerStats = useMemo(() => {
    const stats = {}
    loads.forEach(l => {
      const name = l.broker_name || l.broker || 'Unknown'
      if (!stats[name]) stats[name] = { name, loads: 0, revenue: 0 }
      stats[name].loads++
      stats[name].revenue += Number(l.rate) || Number(l.gross) || 0
    })
    return Object.values(stats).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  }, [loads])

  const fuelExpenses = expenses.filter(e => (e.category || '').toLowerCase().includes('fuel')).reduce((s, e) => s + (Number(e.amount) || 0), 0)

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <AiBanner
        title={activeLoads.length > 0 ? `AI Engine Active — ${activeLoads.length} load${activeLoads.length > 1 ? 's' : ''} in transit` : 'AI Engine Active — Add loads to get started'}
        sub={totalRevenue > 0 ? `Revenue MTD: ${fmtCurrency(totalRevenue)} · ${loads.length} total loads · ${activeLoads.length} active` : 'Start by adding loads, drivers, and vehicles to see insights'}
        action="Smart Dispatch →"
        onAction={() => navigatePage('carrier-dispatch')}
      />

      <div style={S.grid(4)}>
        <StatCard label="Revenue MTD" value={totalRevenue > 0 ? fmtCurrency(totalRevenue) : '$0'} change={loads.length > 0 ? `${loads.length} loads` : 'No loads yet'} color="var(--accent)" changeType="neutral" />
        <StatCard label="Expenses MTD" value={totalExpenses > 0 ? fmtCurrency(totalExpenses) : '$0'} change={netProfit >= 0 ? `Net: +${fmtCurrency(netProfit)}` : `Net: -${fmtCurrency(Math.abs(netProfit))}`} color="var(--success)" changeType={netProfit >= 0 ? 'up' : 'down'} />
        <StatCard label="Total Miles" value={totalMiles > 0 ? totalMiles.toLocaleString() : '0'} change={loads.length > 0 ? `Across ${loads.length} loads` : 'No miles yet'} color="var(--accent2)" changeType="neutral" />
        <StatCard label="Fleet Utilization" value={vehicles.length > 0 ? `${fleetUtil}%` : '—'} change={vehicles.length > 0 ? `${activeLoads.length}/${vehicles.length} vehicles active` : 'Add vehicles to track'} color="var(--accent3)" changeType="neutral" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16 }}>
        {/* AI Recommendations */}
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}><Ic icon={Bot} /> AI Recommendations</div>
            <span style={S.badge('var(--accent)')}>{filteredRecs.length} active</span>
          </div>
          <div>
            {filteredRecs.map(r => (
              <div key={r.id} style={{ ...S.row, borderBottom: '1px solid var(--border)' }}
                onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{ fontSize: 22 }}>{typeof r.icon === "string" ? r.icon : <r.icon size={22} />}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 3 }}>
                    <span style={S.tag(r.color)}>{r.type}</span>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{r.title}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.sub}</div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-primary" style={{ fontSize: 11, padding: '5px 10px' }}
                    onClick={() => r.onAction ? r.onAction() : showToast(r.icon, r.type, r.title)}>{r.action}</button>
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: '5px 8px' }}
                    onClick={() => setDismissed(d => [...d, r.id])}>✕</button>
                </div>
              </div>
            ))}
            {filteredRecs.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>All caught up!</div>}
          </div>
        </div>

        {/* Financials Overview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={TrendingUp} /> Financials Overview</div>
            </div>
            <div style={S.panelBody}>
              {totalRevenue > 0 || totalExpenses > 0 ? [
                { label: 'Gross Revenue', value: fmtCurrency(totalRevenue), color: 'var(--accent)' },
                { label: 'Fuel Costs', value: fuelExpenses > 0 ? `−${fmtCurrency(fuelExpenses)}` : '$0', color: 'var(--danger)' },
                { label: 'Total Expenses', value: totalExpenses > 0 ? `−${fmtCurrency(totalExpenses)}` : '$0', color: 'var(--danger)' },
                { label: 'Net Profit', value: netProfit >= 0 ? fmtCurrency(netProfit) : `−${fmtCurrency(Math.abs(netProfit))}`, color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)', bold: true },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{item.label}</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: item.bold ? 22 : 18, color: item.color }}>{item.value}</div>
                </div>
              )) : (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No financial data yet. Add loads to see projections.</div>
              )}
            </div>
          </div>

          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Briefcase} /> Broker Leaderboard</div>
            </div>
            <div>
              {brokerStats.length > 0 ? brokerStats.map(b => (
                <div key={b.name} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{b.loads} load{b.loads > 1 ? 's' : ''} · ${b.revenue.toLocaleString()}</div>
                  </div>
                  <span style={S.badge('var(--accent)')}>{b.loads} loads</span>
                </div>
              )) : (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No broker data yet. Add loads with broker info.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── AI DISPATCH COPILOT ───────────────────────────────────────────────────────
// DAT-normalized load shape — swap normalizeDATLoad() when API keys are ready
// Sample load board data — replaced by DAT API when connected
const MARKET_LOADS = [
  { id:'DAT-8821', from:'ATL', fromFull:'Atlanta, GA',    to:'CHI', toFull:'Chicago, IL',      miles:674,  gross:3840, rpm:2.94, weight:'42,000', commodity:'Auto Parts',   broker:'Echo Global',      brokerScore:98, brokerPay:'< 24hr',  pickup:'Today 2PM',    delivery:'Mar 9 · 10AM',  equipment:'Dry Van', deadhead:22, aiScore:96, mktLow:2.55, mktAvg:2.80, mktHigh:3.10, tags:['AI TOP PICK','FAST PAY'], source:'dat' },
  { id:'DAT-4440', from:'MEM', fromFull:'Memphis, TN',    to:'NYC', toFull:'New York, NY',      miles:1100, gross:5100, rpm:3.10, weight:'39,800', commodity:'Electronics',  broker:'Coyote Logistics', brokerScore:92, brokerPay:'< 48hr',  pickup:'Tomorrow 8AM', delivery:'Mar 12 · 6PM',  equipment:'Dry Van', deadhead:8,  aiScore:91, mktLow:2.80, mktAvg:3.05, mktHigh:3.35, tags:['HIGH VALUE'], source:'dat' },
  { id:'DAT-4460', from:'DAL', fromFull:'Dallas, TX',     to:'MIA', toFull:'Miami, FL',         miles:1491, gross:5600, rpm:3.22, weight:'38,500', commodity:'Food & Bev',   broker:'Echo Global',      brokerScore:98, brokerPay:'< 24hr',  pickup:'Mar 11 7AM',   delivery:'Mar 13 · 5PM',  equipment:'Reefer',  deadhead:12, aiScore:88, mktLow:3.00, mktAvg:3.18, mktHigh:3.45, tags:['FAST PAY'], source:'dat' },
  { id:'DAT-4445', from:'DEN', fromFull:'Denver, CO',     to:'HOU', toFull:'Houston, TX',       miles:1020, gross:3400, rpm:2.61, weight:'41,200', commodity:'Machinery',    broker:'Transplace',       brokerScore:74, brokerPay:'< 7 days', pickup:'Mar 10 6AM',   delivery:'Mar 12 · 4PM',  equipment:'Flatbed', deadhead:45, aiScore:68, mktLow:2.55, mktAvg:2.75, mktHigh:3.00, tags:['SLOW PAYER'], source:'dat' },
  { id:'DAT-4412', from:'PHX', fromFull:'Phoenix, AZ',    to:'LAX', toFull:'Los Angeles, CA',   miles:372,  gross:1850, rpm:2.41, weight:'45,000', commodity:'Retail',       broker:'Worldwide Express', brokerScore:81, brokerPay:'< 3 days', pickup:'Today 5PM',    delivery:'Mar 8 · 9AM',   equipment:'Dry Van', deadhead:65, aiScore:58, mktLow:2.20, mktAvg:2.45, mktHigh:2.70, tags:['HIGH DEADHEAD'], source:'dat' },
  { id:'DAT-5102', from:'CHI', fromFull:'Chicago, IL',    to:'ATL', toFull:'Atlanta, GA',       miles:716,  gross:2900, rpm:2.72, weight:'40,000', commodity:'Auto Parts',   broker:'CH Robinson',      brokerScore:88, brokerPay:'< 3 days', pickup:'Mar 12 6AM',   delivery:'Mar 13 · 8PM',  equipment:'Dry Van', deadhead:5,  aiScore:82, mktLow:2.50, mktAvg:2.70, mktHigh:2.95, tags:[], source:'dat' },
  { id:'DAT-5210', from:'LAX', fromFull:'Los Angeles, CA',to:'SEA', toFull:'Seattle, WA',       miles:1135, gross:4200, rpm:3.70, weight:'36,000', commodity:'Consumer Goods',broker:'MoLo Solutions',   brokerScore:85, brokerPay:'< 48hr',  pickup:'Mar 11 9AM',   delivery:'Mar 13 · 3PM',  equipment:'Dry Van', deadhead:18, aiScore:93, mktLow:3.40, mktAvg:3.65, mktHigh:4.00, tags:['AI TOP PICK','FAST PAY'], source:'dat' },
  { id:'DAT-5318', from:'HOU', fromFull:'Houston, TX',    to:'CHI', toFull:'Chicago, IL',       miles:1090, gross:3800, rpm:2.86, weight:'43,000', commodity:'Chemicals',    broker:'Uber Freight',     brokerScore:90, brokerPay:'< 24hr',  pickup:'Mar 12 7AM',   delivery:'Mar 14 · 6PM',  equipment:'Tanker',  deadhead:30, aiScore:76, mktLow:2.65, mktAvg:2.85, mktHigh:3.10, tags:['FAST PAY'], source:'dat' },
]

const DISPATCH_DRIVERS = []

const COPILOT_SUGGESTIONS = (load) => [
  `Should I take this ${load.from}→${load.to} load at $${load.rpm.toFixed(2)}/mi?`,
  `What's the market rate for ${load.from}→${load.to} right now?`,
  `Is ${load.broker} a reliable broker to work with?`,
  `What's the backhaul opportunity from ${load.to}?`,
  `How does this compare to my best loads this month?`,
]

export function SmartDispatch() {
  const { showToast } = useApp()
  const { loads: ctxLoads, addLoad, totalRevenue, expenses, drivers: dbDrivers } = useCarrier()
  const dispatchDrivers = dbDrivers.length ? dbDrivers.map(d => ({
    name: d.full_name, status: d.status === 'Active' ? 'Available' : d.status || 'Available',
    location: '', hos: '—', unit: '',
  })) : DISPATCH_DRIVERS

  const [loads, setLoads] = useState(MARKET_LOADS)
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('All')
  const [searchOrigin, setSearchOrigin] = useState('')
  const [searchDest, setSearchDest]     = useState('')
  const [equipment, setEquipment]       = useState('All')
  const [bookModal, setBookModal]       = useState(null)   // load being booked
  const [bookDriver, setBookDriver]     = useState('')
  const [aiMessages, setAiMessages]     = useState({})     // keyed by load.id
  const [aiInput, setAiInput]           = useState('')
  const [aiLoading, setAiLoading]       = useState(false)
  // editable calc inputs per load
  const [calcInputs, setCalcInputs]     = useState({})
  // Add Load modal
  const [addModal, setAddModal]         = useState(false)
  const [addForm, setAddForm]           = useState({ broker:'', origin:'', dest:'', miles:'', gross:'', rate:'', weight:'', commodity:'', pickup:'', delivery:'', equipment:'Dry Van', driver:'', notes:'' })
  const [addParsing, setAddParsing]     = useState(false)
  const addFileRef = useRef(null)

  const sel = selected ? loads.find(l => l.id === selected) : null

  // calc inputs with defaults
  const ci = sel ? (calcInputs[sel.id] || { mpg: 6.8, fuelPrice: 3.89, driverPct: 28, otherCosts: 0 }) : {}
  const setCI = (field, val) => setCalcInputs(prev => ({ ...prev, [sel.id]: { ...ci, [field]: val } }))

  // live profit calc
  const calcFuel      = sel ? Math.round((sel.miles / ci.mpg) * ci.fuelPrice) : 0
  const calcDriverPay = sel ? Math.round(sel.gross * (ci.driverPct / 100)) : 0
  const calcOther     = sel ? (parseFloat(ci.otherCosts) || 0) : 0
  const calcNet       = sel ? sel.gross - calcFuel - calcDriverPay - calcOther : 0
  const calcNetPerMile = sel && sel.miles > 0 ? (calcNet / sel.miles).toFixed(2) : '0.00'
  const calcMargin     = sel && sel.gross > 0 ? ((calcNet / sel.gross) * 100).toFixed(1) : '0.0'

  const EQUIP_TYPES = ['All', 'Dry Van', 'Reefer', 'Flatbed', 'Tanker']
  const FILTER_TABS = ['All', 'AI Top Picks', 'Fast Pay', 'Best Rate']

  const filtered = loads.filter(l => {
    const matchEq    = equipment === 'All' || l.equipment === equipment
    const matchOrig  = !searchOrigin || l.fromFull.toLowerCase().includes(searchOrigin.toLowerCase()) || l.from.toLowerCase().includes(searchOrigin.toLowerCase())
    const matchDest  = !searchDest   || l.toFull.toLowerCase().includes(searchDest.toLowerCase())   || l.to.toLowerCase().includes(searchDest.toLowerCase())
    const matchFilter = filter === 'All' ? true
      : filter === 'AI Top Picks' ? l.aiScore >= 88
      : filter === 'Fast Pay'        ? l.tags.includes('FAST PAY')
      : filter === 'Best Rate'       ? l.rpm >= l.mktAvg
      : true
    return matchEq && matchOrig && matchDest && matchFilter
  })

  const avgScore = filtered.length ? Math.round(filtered.reduce((s,l)=>s+l.aiScore,0)/filtered.length) : 0
  const bestNet  = filtered.length ? Math.max(...filtered.map(l => {
    const f = l.miles/6.8*3.89; const d = l.gross*0.28; return l.gross-f-d
  })) : 0

  // AI score breakdown computed from load fields
  const scoreBreakdown = sel ? [
    { label:'Rate vs Market',    score: sel.rpm >= sel.mktHigh ? 25 : sel.rpm >= sel.mktAvg ? 20 : sel.rpm >= sel.mktLow ? 14 : 8,  max:25, color:'var(--accent)' },
    { label:'Broker Reliability',score: Math.round(sel.brokerScore * 0.20), max:20, color:'var(--accent2)' },
    { label:'Deadhead Penalty',  score: sel.deadhead < 15 ? 20 : sel.deadhead < 30 ? 15 : sel.deadhead < 50 ? 8 : 3, max:20, color:'var(--warning)' },
    { label:'Lane Familiarity',  score: ctxLoads.some(l => l.origin?.includes(sel.from) || l.dest?.includes(sel.to)) ? 18 : 10, max:18, color:'var(--accent3)' },
    { label:'Equipment Match',   score: sel.equipment === 'Dry Van' ? 12 : sel.equipment === 'Reefer' ? 11 : 10, max:12, color:'var(--success)' },
    { label:'Fleet Availability',score: dispatchDrivers.some(d=>d.status==='Available') ? 5 : 2, max:5, color:'var(--muted)' },
  ] : []

  const computedScore = scoreBreakdown.reduce((s,x) => s+x.score, 0)

  // Book a load → addLoad() into context
  const confirmBook = () => {
    if (!bookModal || !bookDriver) return
    const l = bookModal
    addLoad({
      broker:    l.broker,
      origin:    l.fromFull,
      dest:      l.toFull,
      miles:     l.miles,
      rate:      l.rpm,
      gross:     l.gross,
      weight:    l.weight,
      commodity: l.commodity,
      pickup:    l.pickup,
      delivery:  l.delivery,
      driver:    bookDriver,
      refNum:    l.id,
    })
    setLoads(ls => ls.filter(x => x.id !== l.id))
    setSelected(null)
    setBookModal(null)
    setBookDriver('')
    showToast('', 'Load Booked!', `${l.fromFull} → ${l.toFull} · $${l.gross.toLocaleString()} · ${bookDriver}`)
  }

  // ── Add Load: compress + AI parse rate con ──
  const compressAddImg = (file) => new Promise((resolve) => {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const reader = new FileReader()
      reader.onload = () => resolve({ b64: reader.result.split(',')[1], mt: 'application/pdf' })
      reader.readAsDataURL(file)
      return
    }
    const img = new Image()
    img.onload = () => {
      const maxW = 1200; let w = img.width, h = img.height
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
      const c = document.createElement('canvas'); c.width = w; c.height = h
      c.getContext('2d').drawImage(img, 0, 0, w, h)
      resolve({ b64: c.toDataURL('image/jpeg', 0.85).split(',')[1], mt: 'image/jpeg' })
    }
    img.onerror = () => {
      const reader = new FileReader()
      reader.onload = () => resolve({ b64: reader.result.split(',')[1], mt: file.type || 'image/jpeg' })
      reader.readAsDataURL(file)
    }
    img.src = URL.createObjectURL(file)
  })

  const parseAddRC = async (file) => {
    if (!file) return
    setAddParsing(true)
    showToast('','Reading Rate Con','Compressing and sending to AI...')
    try {
      const { b64, mt } = await compressAddImg(file)
      if (!b64 || b64.length < 50) { showToast('','Error','Could not read file'); setAddParsing(false); return }
      const res = await apiFetch('/api/parse-ratecon', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ file: b64, mediaType: mt })
      })
      const text = await res.text()
      let data; try { data = JSON.parse(text) } catch { data = null }
      if (data && !data.error) {
        setAddForm(f => ({
          ...f,
          origin: data.origin || f.origin,
          dest: data.destination || f.dest,
          gross: data.rate ? String(data.rate) : f.gross,
          weight: data.weight ? String(data.weight) : f.weight,
          equipment: data.equipment || f.equipment,
          pickup: data.pickup_date || f.pickup,
          delivery: data.delivery_date || f.delivery,
          commodity: data.commodity || f.commodity,
          notes: data.notes || f.notes,
        }))
        showToast('','Rate Con Parsed',`${data.origin || ''} → ${data.destination || ''} · $${data.rate || '—'}`)
      } else {
        showToast('','Parse Error', data?.error || 'Could not read rate con')
      }
    } catch(err) { showToast('','Error', err?.message || 'Failed') }
    setAddParsing(false)
  }

  const submitAddLoad = () => {
    if (!addForm.origin || !addForm.dest || !addForm.gross) {
      showToast('','Missing Fields','Origin, destination, and rate are required')
      return
    }
    addLoad({
      broker: addForm.broker || 'Direct',
      origin: addForm.origin,
      dest: addForm.dest,
      miles: parseInt(addForm.miles) || 0,
      rate: addForm.miles ? (parseFloat(addForm.gross) / parseInt(addForm.miles)).toFixed(2) : 0,
      gross: parseFloat(addForm.gross) || 0,
      weight: parseInt(addForm.weight) || 0,
      commodity: addForm.commodity,
      pickup: addForm.pickup || new Date().toISOString().split('T')[0],
      delivery: addForm.delivery,
      driver: addForm.driver || '',
      notes: addForm.notes,
      equipment: addForm.equipment,
    })
    showToast('','Load Added',`${addForm.origin} → ${addForm.dest} · $${parseFloat(addForm.gross).toLocaleString()}`)
    setAddForm({ broker:'', origin:'', dest:'', miles:'', gross:'', rate:'', weight:'', commodity:'', pickup:'', delivery:'', equipment:'Dry Van', driver:'', notes:'' })
    setAddModal(false)
  }

  // AI Copilot send message for selected load
  const sendCopilot = async (text) => {
    if (!sel) return
    const userText = text || aiInput.trim()
    if (!userText) return
    setAiInput('')
    const prev = aiMessages[sel.id] || []
    const next = [...prev, { role:'user', content: userText }]
    setAiMessages(m => ({ ...m, [sel.id]: next }))
    setAiLoading(true)
    // Build context: this load + carrier snapshot
    const ctxCompleted = ctxLoads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced')
    const avgRPM = ctxCompleted.length ? (ctxCompleted.reduce((s,l)=>s+(l.rate||0),0)/ctxCompleted.length).toFixed(2) : 'N/A'
    const sameLane = ctxCompleted.filter(l => l.origin?.includes(sel.from) || l.dest?.includes(sel.to))
    const context = [
      `LOAD BEING EVALUATED:`,
      `Route: ${sel.fromFull} → ${sel.toFull} (${sel.miles} miles)`,
      `Gross: $${sel.gross} | RPM: $${sel.rpm.toFixed(2)} | Equipment: ${sel.equipment}`,
      `Broker: ${sel.broker} (score ${sel.brokerScore}) | Pay speed: ${sel.brokerPay}`,
      `Deadhead: ${sel.deadhead} miles | Commodity: ${sel.commodity}`,
      `Market rate range: $${sel.mktLow}–$${sel.mktHigh}/mi | Posted at: $${sel.rpm.toFixed(2)}/mi`,
      `Est. fuel cost: $${calcFuel} | Est. driver pay: $${calcDriverPay} | Est. net: $${calcNet}`,
      ``,
      `CARRIER SNAPSHOT:`,
      `Revenue MTD: $${totalRevenue.toLocaleString()} | Completed loads: ${ctxCompleted.length}`,
      `Fleet avg RPM: $${avgRPM} | Same-lane history: ${sameLane.length} loads`,
      `Available drivers: ${dispatchDrivers.filter(d=>d.status==='Available').map(d=>d.name+' ('+d.hos+' HOS, '+d.location+')').join(', ')}`,
    ].join('\n')
    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, context }),
      })
      const data = await res.json()
      setAiMessages(m => ({ ...m, [sel.id]: [...next, { role:'assistant', content: data.reply || data.error }] }))
    } catch {
      setAiMessages(m => ({ ...m, [sel.id]: [...next, { role:'assistant', content:'Connection error — start the server on port 4000.' }] }))
    } finally {
      setAiLoading(false)
    }
  }

  const msgs = sel ? (aiMessages[sel.id] || []) : []
  const tagColor = t => t.includes('URGENT')||t.includes('DEAD')||t.includes('SLOW') ? 'var(--danger)' : t==='AI TOP PICK' ? 'var(--accent)' : t==='FAST PAY' ? 'var(--success)' : 'var(--accent2)'

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden', background:'var(--bg)' }}>

      {/* ── PANEL 1: LOAD LIST ── */}
      <div style={{ width: sel ? 360 : '100%', minWidth: 340, display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)', height:'100%', overflow:'hidden', flexShrink:0 }}>

        {/* Search bar + Add Load */}
        <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', display:'flex', gap:6 }}>
          <input value={searchOrigin} onChange={e=>setSearchOrigin(e.target.value)} placeholder="Origin city…"
            style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 10px', color:'var(--text)', fontSize:11, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
          <span style={{ color:'var(--muted)', alignSelf:'center', fontSize:12 }}>→</span>
          <input value={searchDest} onChange={e=>setSearchDest(e.target.value)} placeholder="Destination…"
            style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'6px 10px', color:'var(--text)', fontSize:11, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
          <button onClick={() => { setSearchOrigin(''); setSearchDest('') }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14, padding:'0 4px' }}>✕</button>
          <button onClick={() => setAddModal(true)} className="btn btn-primary" style={{ padding:'5px 12px', fontSize:11, fontWeight:700, whiteSpace:'nowrap', borderRadius:6 }}>
            <Plus size={12} /> Add Load
          </button>
        </div>

        {/* Equipment + filter tabs */}
        <div style={{ padding:'8px 12px', borderBottom:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:6 }}>
          <div style={{ display:'flex', gap:4 }}>
            {EQUIP_TYPES.map(eq => (
              <button key={eq} onClick={()=>setEquipment(eq)}
                style={{ padding:'3px 9px', borderRadius:12, border:'1px solid var(--border)', background: equipment===eq ? 'var(--surface3)' : 'transparent', color: equipment===eq ? 'var(--text)' : 'var(--muted)', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                {eq}
              </button>
            ))}
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {FILTER_TABS.map(f => (
              <button key={f} onClick={()=>setFilter(f)}
                style={{ padding:'3px 9px', borderRadius:12, border:'1px solid var(--border)', background: filter===f ? 'var(--accent)' : 'transparent', color: filter===f ? '#000' : 'var(--muted)', fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', borderBottom:'1px solid var(--border)' }}>
          {[
            { label:'Loads', value: filtered.length },
            { label:'Avg Score', value: avgScore },
            { label:'Best Net', value: '$'+Math.round(bestNet).toLocaleString() },
          ].map(s => (
            <div key={s.label} style={{ textAlign:'center', padding:'8px 0', borderRight:'1px solid var(--border)' }}>
              <div style={{ fontSize:16, fontFamily:"'Bebas Neue',sans-serif", color:'var(--accent)' }}>{s.value}</div>
              <div style={{ fontSize:9, color:'var(--muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Load rows */}
        <div style={{ overflowY:'auto', flex:1, minHeight:0 }}>
          {filtered.length === 0 && (
            <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No loads match your search.</div>
          )}
          {filtered.map(load => {
            const isActive = selected === load.id
            const sc = load.aiScore >= 88 ? 'var(--success)' : load.aiScore >= 70 ? 'var(--warning)' : 'var(--danger)'
            const aboveMarket = load.rpm >= load.mktAvg
            return (
              <div key={load.id} onClick={() => setSelected(isActive ? null : load.id)}
                style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', cursor:'pointer', background: isActive ? 'rgba(240,165,0,0.05)' : 'transparent', borderLeft:`3px solid ${isActive ? 'var(--accent)' : 'transparent'}`, transition:'all 0.12s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:5 }}>
                  <div>
                    <div style={{ fontSize:14, fontWeight:800, marginBottom:2 }}>
                      {load.from} <span style={{ color:'var(--muted)' }}>→</span> {load.to}
                      <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400, marginLeft:5 }}>{load.miles.toLocaleString()}mi</span>
                    </div>
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
                      {load.tags.map(t => <span key={t} style={{ ...S.tag(tagColor(t)), fontSize:8 }}>{t}</span>)}
                      {aboveMarket && <span style={{ ...S.tag('var(--success)'), fontSize:8 }}>ABOVE MARKET</span>}
                    </div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0, marginLeft:8 }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:'var(--accent)', lineHeight:1 }}>${load.gross.toLocaleString()}</div>
                    <div style={{ fontSize:10, color: aboveMarket ? 'var(--success)' : 'var(--muted)', fontWeight: aboveMarket ? 700 : 400 }}>${load.rpm.toFixed(2)}/mi</div>
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>{load.equipment} · {load.commodity} · {load.pickup}</div>
                  <div style={{ fontSize:12, fontWeight:800, color:sc }}>AI {load.aiScore}</div>
                </div>
              </div>
            )
          })}
        </div>

        {/* DAT source badge */}
        <div style={{ padding:'8px 14px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8, background:'var(--surface)' }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--success)' }}/>
          <span style={{ fontSize:10, color:'var(--muted)' }}>Showing mock data · DAT API ready to connect</span>
        </div>
      </div>

      {/* ── PANEL 2: LOAD DETAIL + PROFIT CALC ── */}
      {sel && (
        <div style={{ width:400, flexShrink:0, overflowY:'auto', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column' }}>
          <div style={{ flex:1, padding:16, display:'flex', flexDirection:'column', gap:12 }}>

            {/* Header */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:0.5, lineHeight:1.1 }}>
                  {sel.fromFull} <span style={{ color:'var(--accent)' }}>→</span> {sel.toFull}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{sel.id} · {sel.miles.toLocaleString()} mi · {sel.equipment} · {sel.commodity}</div>
              </div>
              <button className="btn btn-ghost" style={{ fontSize:16, flexShrink:0 }} onClick={() => setSelected(null)}>✕</button>
            </div>

            {/* Market rate bar */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
              <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:1, marginBottom:8 }}>RATE vs MARKET (DAT RATEVIEW)</div>
              <div style={{ position:'relative', height:20, background:'var(--surface2)', borderRadius:10, marginBottom:6 }}>
                {/* market range bar */}
                {(() => {
                  const min = sel.mktLow - 0.3, max = sel.mktHigh + 0.3, range = max - min
                  const lowPct  = ((sel.mktLow  - min) / range) * 100
                  const highPct = ((sel.mktHigh - min) / range) * 100
                  const rpmPct  = Math.max(0, Math.min(100, ((sel.rpm - min) / range) * 100))
                  return (<>
                    <div style={{ position:'absolute', left:`${lowPct}%`, width:`${highPct-lowPct}%`, height:'100%', background:'rgba(240,165,0,0.15)', borderRadius:10 }}/>
                    <div style={{ position:'absolute', left:`${rpmPct}%`, top:0, width:3, height:'100%', background: sel.rpm >= sel.mktAvg ? 'var(--success)' : 'var(--warning)', borderRadius:2, transform:'translateX(-50%)' }}/>
                  </>)
                })()}
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)' }}>
                <span>Low ${sel.mktLow.toFixed(2)}</span>
                <span style={{ color: sel.rpm >= sel.mktAvg ? 'var(--success)' : 'var(--warning)', fontWeight:700 }}>
                  Posted ${sel.rpm.toFixed(2)}/mi {sel.rpm >= sel.mktAvg ? '↑ above avg' : '↓ below avg'}
                </span>
                <span>High ${sel.mktHigh.toFixed(2)}</span>
              </div>
            </div>

            {/* AI Score breakdown */}
            <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.25)', borderRadius:10, padding:'12px 14px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ fontSize:12, fontWeight:700 }}><Ic icon={Bot} /> AI Match Score</div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color: computedScore>=80?'var(--success)':computedScore>=60?'var(--warning)':'var(--danger)', lineHeight:1 }}>{computedScore}/100</div>
              </div>
              {scoreBreakdown.map(s => (
                <div key={s.label} style={{ marginBottom:7 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, marginBottom:2 }}>
                    <span style={{ color:'var(--muted)' }}>{s.label}</span>
                    <span style={{ color:s.color, fontWeight:700 }}>{s.score}/{s.max}</span>
                  </div>
                  <div style={{ height:4, background:'var(--border)', borderRadius:2 }}>
                    <div style={{ height:'100%', width:`${(s.score/s.max)*100}%`, background:s.color, borderRadius:2, transition:'width 0.5s' }}/>
                  </div>
                </div>
              ))}
            </div>

            {/* Editable profit calculator */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
              <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:12, fontWeight:700 }}><Ic icon={DollarSign} /> Profit Calculator</div>
                <span style={{ fontSize:10, color:'var(--muted)' }}>Edit any field</span>
              </div>
              {/* Editable inputs */}
              <div style={{ padding:'10px 14px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, borderBottom:'1px solid var(--border)' }}>
                {[
                  { label:'Fuel Price ($/gal)', field:'fuelPrice', step:'0.01', min:'2', max:'8' },
                  { label:'MPG', field:'mpg', step:'0.1', min:'3', max:'12' },
                  { label:'Driver Pay (%)', field:'driverPct', step:'1', min:'0', max:'50' },
                  { label:'Other Costs ($)', field:'otherCosts', step:'10', min:'0', max:'5000' },
                ].map(inp => (
                  <div key={inp.field}>
                    <div style={{ fontSize:9, color:'var(--muted)', marginBottom:3, textTransform:'uppercase', letterSpacing:1 }}>{inp.label}</div>
                    <input type="number" step={inp.step} min={inp.min} max={inp.max}
                      value={ci[inp.field] ?? (inp.field==='fuelPrice'?3.89:inp.field==='mpg'?6.8:inp.field==='driverPct'?28:0)}
                      onChange={e => setCI(inp.field, parseFloat(e.target.value) || 0)}
                      style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', color:'var(--text)', fontSize:12, fontFamily:"'Bebas Neue',sans-serif", outline:'none', boxSizing:'border-box' }} />
                  </div>
                ))}
              </div>
              {/* Results */}
              <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:6 }}>
                {[
                  { label:'Gross Revenue', value:'$'+sel.gross.toLocaleString(), color:'var(--accent)', big:true },
                  { label:`Fuel (${sel.miles}mi ÷ ${ci.mpg||6.8}mpg × $${ci.fuelPrice||3.89})`, value:'−$'+calcFuel.toLocaleString(), color:'var(--danger)' },
                  { label:`Driver Pay (${ci.driverPct||28}%)`, value:'−$'+calcDriverPay.toLocaleString(), color:'var(--danger)' },
                  { label:'Other Costs', value:`−$${calcOther}`, color:'var(--muted)' },
                ].map(row => (
                  <div key={row.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                    <span style={{ fontSize:11, color:'var(--muted)' }}>{row.label}</span>
                    <span style={{ fontFamily: row.big?"'Bebas Neue',sans-serif":"'DM Sans',sans-serif", fontSize: row.big?20:12, color:row.color }}>{row.value}</span>
                  </div>
                ))}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0' }}>
                  <span style={{ fontSize:12, fontWeight:700 }}>Est. Net Profit</span>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color: calcNet > 0 ? 'var(--success)' : 'var(--danger)' }}>${calcNet.toLocaleString()}</span>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  <div style={{ background:'var(--surface2)', borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                    <div style={{ fontSize:9, color:'var(--muted)' }}>NET PER MILE</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent2)' }}>${calcNetPerMile}</div>
                  </div>
                  <div style={{ background:'var(--surface2)', borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                    <div style={{ fontSize:9, color:'var(--muted)' }}>MARGIN</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color: parseFloat(calcMargin)>=30?'var(--success)':parseFloat(calcMargin)>=20?'var(--warning)':'var(--danger)' }}>{calcMargin}%</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Broker + Deadhead */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:1, marginBottom:6 }}>BROKER</div>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:4 }}>{sel.broker}</div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color: sel.brokerScore>=90?'var(--success)':sel.brokerScore>=75?'var(--warning)':'var(--danger)', lineHeight:1, marginBottom:2 }}>{sel.brokerScore}</div>
                <div style={{ fontSize:9, color:'var(--muted)', marginBottom:6 }}>Risk Score</div>
                <div style={{ fontSize:11, color:'var(--accent2)' }}>Pays {sel.brokerPay}</div>
              </div>
              <div style={{ background:'var(--surface)', border:`1px solid ${sel.deadhead>40?'rgba(239,68,68,0.3)':'var(--border)'}`, borderRadius:10, padding:'12px 14px' }}>
                <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:1, marginBottom:6 }}>DEADHEAD</div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color: sel.deadhead<20?'var(--success)':sel.deadhead<40?'var(--warning)':'var(--danger)', lineHeight:1, marginBottom:2 }}>{sel.deadhead} mi</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>
                  {sel.deadhead<20 ? 'Excellent' : sel.deadhead<40 ? 'Moderate' : 'High — $'+Math.round(sel.deadhead*0.55)+' cost'}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display:'flex', gap:8 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'11px 0', fontSize:13 }}
                onClick={() => { setBookModal(sel); setBookDriver('') }}>
                <Zap size={13} /> Book Load — ${sel.rpm.toFixed(2)}/mi
              </button>
              <button className="btn btn-ghost" style={{ padding:'11px 14px', fontSize:13 }}
                onClick={() => showToast('', 'Saved', sel.id + ' added to watchlist')}>
                <Ic icon={Bookmark} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PANEL 3: AI COPILOT CHAT ── */}
      {sel && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', minWidth:300, borderLeft:'1px solid var(--border)' }}>
          {/* Header */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', background:'linear-gradient(135deg,rgba(240,165,0,0.07),rgba(0,212,170,0.04))', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <div style={{ width:32, height:32, borderRadius:'50%', background:'rgba(240,165,0,0.15)', border:'1px solid rgba(240,165,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}><Bot size={20} /></div>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--accent)' }}>AI Dispatch Copilot</div>
              <div style={{ fontSize:10, color:'var(--muted)' }}>Analyzing {sel.from}→{sel.to} · ${sel.rpm.toFixed(2)}/mi</div>
            </div>
            <div style={{ marginLeft:'auto', width:8, height:8, borderRadius:'50%', background:'var(--success)' }}/>
          </div>

          {/* Messages */}
          <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:14, display:'flex', flexDirection:'column', gap:10 }}>
            {msgs.length === 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:12, padding:'12px 14px', fontSize:12, lineHeight:1.6 }}>
                  <div style={{ fontWeight:700, color:'var(--accent)', marginBottom:6 }}><Ic icon={Bot} /> Ready to analyze this load</div>
                  <div style={{ color:'var(--muted)' }}>
                    I see a <b style={{ color:'var(--text)' }}>{sel.equipment}</b> load from <b style={{ color:'var(--text)' }}>{sel.fromFull}</b> to <b style={{ color:'var(--text)' }}>{sel.toFull}</b> at <b style={{ color: sel.rpm>=sel.mktAvg?'var(--success)':'var(--warning)' }}>${sel.rpm.toFixed(2)}/mi</b> ({sel.rpm>=sel.mktAvg?'above':'below'} market avg of ${sel.mktAvg.toFixed(2)}).
                    {' '}Est. net: <b style={{ color:'var(--success)' }}>${calcNet.toLocaleString()}</b>. Ask me anything.
                  </div>
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', padding:'4px 0' }}>Try asking:</div>
                {COPILOT_SUGGESTIONS(sel).map(q => (
                  <button key={q} onClick={() => sendCopilot(q)}
                    style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:11, color:'var(--text)', cursor:'pointer', textAlign:'left', fontFamily:"'DM Sans',sans-serif", lineHeight:1.4, transition:'border-color 0.15s' }}
                    onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
                    onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            {msgs.map((m,i) => (
              <div key={i} style={{ display:'flex', flexDirection:'column', alignItems: m.role==='user'?'flex-end':'flex-start' }}>
                <div style={{ maxWidth:'88%', padding:'9px 12px', borderRadius: m.role==='user'?'12px 12px 4px 12px':'12px 12px 12px 4px', background: m.role==='user'?'var(--accent)':'var(--surface2)', color: m.role==='user'?'#000':'var(--text)', fontSize:12, lineHeight:1.6, whiteSpace:'pre-wrap' }}>
                  {m.content}
                </div>
              </div>
            ))}
            {aiLoading && (
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ display:'flex', gap:4 }}>
                  {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', animation:`pulse 1s ease-in-out ${i*0.2}s infinite` }}/>)}
                </div>
                <span style={{ fontSize:10, color:'var(--muted)' }}>Analyzing…</span>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', display:'flex', gap:8, flexShrink:0 }}>
            <input value={aiInput} onChange={e=>setAiInput(e.target.value)}
              onKeyDown={e => e.key==='Enter' && !e.shiftKey && sendCopilot()}
              placeholder="Ask about this load…"
              style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
            <button onClick={() => sendCopilot()} disabled={aiLoading || !aiInput.trim()}
              style={{ background:'var(--accent)', border:'none', borderRadius:8, padding:'8px 14px', color:'#000', fontWeight:700, cursor:'pointer', fontSize:12, opacity: aiLoading||!aiInput.trim()?0.5:1 }}>
              Send
            </button>
          </div>
        </div>
      )}

      {/* ── ADD LOAD MODAL ── */}
      {addModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => e.target===e.currentTarget && setAddModal(false)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:28, width:520, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1, marginBottom:4 }}>Add Load</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>Drop a rate con to auto-fill or enter manually</div>

            {/* Rate Con Upload */}
            <input ref={addFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display:'none' }}
              onChange={e => { if (e.target.files?.[0]) parseAddRC(e.target.files[0]) }} />
            <div onClick={() => addFileRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='var(--accent)' }}
              onDragLeave={e => { e.currentTarget.style.borderColor='var(--border)' }}
              onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor='var(--border)'; parseAddRC(e.dataTransfer.files[0]) }}
              style={{ padding:'14px 16px', border:'1px dashed var(--border)', borderRadius:10, textAlign:'center', cursor:'pointer', marginBottom:16, transition:'border-color 0.2s', background: addParsing ? 'rgba(240,165,0,0.04)' : 'transparent' }}
              onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
              onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}>
              {addParsing ? (
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  <span style={{ width:14, height:14, border:'2px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', display:'inline-block' }} />
                  <span style={{ fontSize:12, fontWeight:600, color:'var(--accent)' }}>AI reading rate con...</span>
                </div>
              ) : (
                <>
                  <Upload size={20} style={{ color:'var(--accent)', marginBottom:4 }} />
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>Drop Rate Con Here</div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>PDF, PNG, or JPG — AI will auto-fill all fields</div>
                </>
              )}
            </div>

            {/* Form fields */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
              {[
                { key:'broker', label:'Broker', ph:'e.g. TQL, CH Robinson' },
                { key:'equipment', label:'Equipment', ph:'Dry Van' },
                { key:'origin', label:'Origin *', ph:'City, ST' },
                { key:'dest', label:'Destination *', ph:'City, ST' },
                { key:'gross', label:'Rate ($) *', ph:'3500', type:'number' },
                { key:'miles', label:'Miles', ph:'1200', type:'number' },
                { key:'weight', label:'Weight (lbs)', ph:'42000', type:'number' },
                { key:'commodity', label:'Commodity', ph:'Electronics' },
                { key:'pickup', label:'Pickup Date', ph:'', type:'date' },
                { key:'delivery', label:'Delivery Date', ph:'', type:'date' },
              ].map(f => (
                <div key={f.key}>
                  <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4, letterSpacing:0.5 }}>{f.label}</div>
                  {f.key === 'equipment' ? (
                    <select value={addForm.equipment} onChange={e => setAddForm(p => ({ ...p, equipment: e.target.value }))}
                      style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif" }}>
                      {['Dry Van','Reefer','Flatbed','Step Deck','Power Only','Conestoga','Hotshot'].map(eq => <option key={eq}>{eq}</option>)}
                    </select>
                  ) : (
                    <input type={f.type||'text'} placeholder={f.ph} value={addForm[f.key]}
                      onChange={e => setAddForm(p => ({ ...p, [f.key]: e.target.value }))}
                      style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' }} />
                  )}
                </div>
              ))}
            </div>

            {/* Driver */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4, letterSpacing:0.5 }}>ASSIGN DRIVER</div>
              <select value={addForm.driver} onChange={e => setAddForm(p => ({ ...p, driver: e.target.value }))}
                style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif" }}>
                <option value="">Unassigned</option>
                {dispatchDrivers.map(d => <option key={d.name} value={d.name}>{d.name} — {d.status} ({d.hos} HOS)</option>)}
              </select>
            </div>

            {/* Notes */}
            <div style={{ marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4, letterSpacing:0.5 }}>NOTES</div>
              <textarea value={addForm.notes} onChange={e => setAddForm(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Special instructions..."
                style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none', resize:'vertical', boxSizing:'border-box' }} />
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setAddModal(false)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:2, padding:'11px 0', fontSize:13 }} onClick={submitAddLoad}>
                <Plus size={13} /> Add to Dispatch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BOOK MODAL ── */}
      {bookModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => e.target===e.currentTarget && setBookModal(null)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:28, width:420, boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1, marginBottom:4 }}>
              Book Load
            </div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>
              {bookModal.fromFull} → {bookModal.toFull} · {bookModal.miles.toLocaleString()}mi · ${bookModal.gross.toLocaleString()}
            </div>

            {/* Driver selection */}
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', letterSpacing:1, marginBottom:10 }}>SELECT DRIVER</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:20 }}>
              {dispatchDrivers.map(d => (
                <label key={d.name} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 14px', borderRadius:10, border:`1px solid ${bookDriver===d.name?'var(--accent)':'var(--border)'}`, background: bookDriver===d.name?'rgba(240,165,0,0.06)':'var(--surface2)', cursor: d.status==='On Load'?'not-allowed':'pointer', opacity: d.status==='On Load'?0.5:1 }}>
                  <input type="radio" name="driver" value={d.name} disabled={d.status==='On Load'}
                    checked={bookDriver===d.name} onChange={() => setBookDriver(d.name)}
                    style={{ accentColor:'var(--accent)' }} />
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700 }}>{d.name} <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400 }}>· {d.unit}</span></div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{d.location} · {d.hos} HOS remaining</div>
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background: d.status==='Available'?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)', color: d.status==='Available'?'var(--success)':'var(--danger)' }}>{d.status}</span>
                </label>
              ))}
            </div>

            {/* Confirm summary */}
            {bookDriver && (
              <div style={{ background:'rgba(240,165,0,0.06)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:10, padding:'12px 14px', marginBottom:16, fontSize:12 }}>
                <div style={{ color:'var(--accent)', fontWeight:700, marginBottom:6 }}><Ic icon={Check} /> Booking Summary</div>
                <div style={{ color:'var(--muted)', lineHeight:1.7 }}>
                  <b style={{ color:'var(--text)' }}>{bookDriver}</b> → {bookModal.fromFull} to {bookModal.toFull}<br/>
                  Pickup: {bookModal.pickup} · Gross: <b style={{ color:'var(--accent)' }}>${bookModal.gross.toLocaleString()}</b><br/>
                  Est. net: <b style={{ color:'var(--success)' }}>${calcNet.toLocaleString()}</b> ({calcMargin}% margin)
                </div>
              </div>
            )}

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setBookModal(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ flex:2, padding:'11px 0', fontSize:13 }}
                disabled={!bookDriver} onClick={confirmBook}>
                <Zap size={13} /> Confirm & Add to Dispatch
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── REVENUE INTELLIGENCE ──────────────────────────────────────────────────────
// ─── TRUCK ROI ──────────────────────────────────────────────────────────────
const TRUCK_MAP = {}

function TruckROI() {
  const { loads, expenses } = useCarrier()
  const [selIdx, setSelIdx] = useState(0)

  const trucks = Object.entries(TRUCK_MAP).map(([driver, meta]) => {
    const dLoads    = loads.filter(l => l.driver === driver && ['Delivered','Invoiced'].includes(l.status))
    const dExpenses = expenses.filter(e => e.driver === driver)
    const revenue   = dLoads.reduce((s, l) => s + l.gross, 0)
    const miles     = dLoads.reduce((s, l) => s + l.miles, 0)
    const rpm       = miles ? revenue / miles : 0
    const costs     = dExpenses.reduce((s, e) => s + e.amount, 0)
    const net       = revenue - costs
    const margin    = revenue ? Math.round((net / revenue) * 100) : 0

    const laneTotals = {}
    dLoads.forEach(l => {
      const key = l.origin.split(',')[0].substring(0,3).toUpperCase() + '→' + l.dest.split(',')[0].substring(0,3).toUpperCase()
      if (!laneTotals[key]) laneTotals[key] = 0
      laneTotals[key] += l.gross
    })
    const bestLane = Object.entries(laneTotals).sort((a,b) => b[1]-a[1])[0]?.[0] || '—'

    const costByCat = {}
    dExpenses.forEach(e => { costByCat[e.cat] = (costByCat[e.cat] || 0) + e.amount })

    return { driver, ...meta, revenue, miles, rpm, costs, net, margin,
      loadCount: dLoads.length, avgLoad: dLoads.length ? Math.round(revenue/dLoads.length) : 0,
      bestLane, costByCat, recentLoads: dLoads.slice(0,5) }
  }).sort((a,b) => b.net - a.net)

  const sel = trucks[selIdx] || trucks[0]
  const marginColor = (m) => m > 30 ? 'var(--success)' : m > 15 ? 'var(--warning)' : 'var(--danger)'

  return (
    <div style={{ display:'flex', gap:16, height:'100%', overflow:'hidden' }}>
      {/* ── Left: ranked cards */}
      <div style={{ width:270, display:'flex', flexDirection:'column', gap:10, flexShrink:0, overflowY:'auto' }}>
        <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:1, paddingBottom:4 }}>Ranked by Net Profit</div>
        {trucks.map((t, i) => {
          const active = selIdx === i
          return (
            <div key={t.unit} onClick={() => setSelIdx(i)} style={{ background: active ? 'var(--surface2)' : 'var(--surface)', border:`1px solid ${active ? t.color : 'var(--border)'}`, borderRadius:12, padding:14, cursor:'pointer', transition:'all 0.15s' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                <div style={{ width:28, height:28, borderRadius:8, background:`${t.color}22`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:900, color:t.color }}>{i+1}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700 }}>{t.unit}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>{t.make}</div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:16, fontWeight:800, color: t.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>${t.net.toLocaleString()}</div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>net profit</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:6 }}>
                {[
                  { label:'RPM', value:`$${t.rpm.toFixed(2)}`, color:'var(--accent)' },
                  { label:'Loads', value:t.loadCount, color:'var(--text)' },
                  { label:'Margin', value:`${t.margin}%`, color: marginColor(t.margin) },
                ].map(s => (
                  <div key={s.label} style={{ flex:1, background:'var(--surface3)', borderRadius:6, padding:'6px 8px', textAlign:'center' }}>
                    <div style={{ fontSize:12, fontWeight:700, color:s.color }}>{s.value}</div>
                    <div style={{ fontSize:9, color:'var(--muted)' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Right: detail */}
      {sel && (
        <div style={{ flex:1, minHeight:0, overflowY:'auto', display:'flex', flexDirection:'column', gap:14 }}>
          {/* Header */}
          <div style={{ background:`linear-gradient(135deg, ${sel.color}12, transparent)`, border:`1px solid ${sel.color}30`, borderRadius:14, padding:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:16 }}>
              <div style={{ width:48, height:48, borderRadius:12, background:`${sel.color}20`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26 }}><Truck size={20} /></div>
              <div>
                <div style={{ fontSize:20, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:1 }}>{sel.unit} — {sel.make} {sel.year}</div>
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>Driver: {sel.driver} · Best lane: {sel.bestLane}</div>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10 }}>
              {[
                { label:'Gross Revenue', value:`$${sel.revenue.toLocaleString()}`, color:sel.color },
                { label:'Total Expenses', value:`$${sel.costs.toLocaleString()}`, color:'var(--danger)' },
                { label:'Net Profit', value:`$${sel.net.toLocaleString()}`, color: sel.net >= 0 ? 'var(--success)' : 'var(--danger)' },
                { label:'Profit Margin', value:`${sel.margin}%`, color: marginColor(sel.margin) },
              ].map(s => (
                <div key={s.label} style={{ background:'var(--surface)', borderRadius:10, padding:'12px 14px' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:4 }}>{s.label}</div>
                  <div style={{ fontSize:24, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif", color:s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            {/* Cost breakdown */}
            <div style={S.panel}>
              <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={DollarSign} /> Cost Breakdown</div></div>
              <div style={{ padding:14 }}>
                {Object.keys(sel.costByCat).length === 0
                  ? <div style={{ fontSize:12, color:'var(--muted)' }}>No expenses logged</div>
                  : Object.entries(sel.costByCat).map(([cat, amt]) => {
                      const pct = sel.costs ? Math.round((amt/sel.costs)*100) : 0
                      return (
                        <div key={cat} style={{ marginBottom:10 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                            <span>{cat}</span>
                            <span style={{ fontWeight:700 }}>${amt.toFixed(2)} <span style={{ color:'var(--muted)', fontWeight:400 }}>({pct}%)</span></span>
                          </div>
                          <div style={{ height:5, background:'var(--border)', borderRadius:3 }}>
                            <div style={{ height:'100%', width:`${pct}%`, background:'var(--danger)', borderRadius:3 }} />
                          </div>
                        </div>
                      )
                    })
                }
              </div>
            </div>

            {/* Performance stats */}
            <div style={S.panel}>
              <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={BarChart2} /> Performance Stats</div></div>
              <div style={{ padding:'0 14px' }}>
                {[
                  { label:'Total Miles',       value:`${sel.miles.toLocaleString()} mi` },
                  { label:'Avg Load Value',    value:`$${sel.avgLoad.toLocaleString()}` },
                  { label:'Revenue Per Mile',  value:`$${sel.rpm.toFixed(2)}` },
                  { label:'Cost Per Mile',     value:`$${sel.miles ? (sel.costs/sel.miles).toFixed(2) : '0.00'}` },
                  { label:'Net Per Mile',      value:`$${sel.miles ? (sel.net/sel.miles).toFixed(2) : '0.00'}`, highlight:true },
                ].map(r => (
                  <div key={r.label} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'1px solid var(--border)', fontSize:13 }}>
                    <span style={{ color:'var(--muted)' }}>{r.label}</span>
                    <span style={{ fontWeight:700, color: r.highlight ? 'var(--success)' : 'var(--text)' }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Load history */}
          <div style={S.panel}>
            <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={FileText} /> Load History</div></div>
            {sel.recentLoads.length === 0
              ? <div style={{ padding:16, fontSize:12, color:'var(--muted)' }}>No completed loads yet</div>
              : <div style={{ overflowX:'auto' }}><table style={{ minWidth:600 }}>
                  <thead><tr>
                    <th>Load</th><th>Route</th><th>Miles</th><th>Rate/Mi</th><th>Gross</th><th>Status</th>
                  </tr></thead>
                  <tbody>
                    {sel.recentLoads.map(l => (
                      <tr key={l.loadId}>
                        <td className="mono" style={{ color:'var(--accent)', fontSize:12 }}>{l.loadId}</td>
                        <td>{l.origin.split(',')[0]} → {l.dest.split(',')[0]}</td>
                        <td style={{ color:'var(--muted)' }}>{l.miles.toLocaleString()}</td>
                        <td style={{ color:'var(--accent2)' }}>${l.rate.toFixed(2)}</td>
                        <td style={{ fontWeight:700 }}>${l.gross.toLocaleString()}</td>
                        <td><span style={S.tag(l.status==='Delivered'?'var(--success)':'var(--accent)')}>{l.status}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
            }
          </div>
        </div>
      )}
    </div>
  )
}

// ─── REVENUE INTEL ───────────────────────────────────────────────────────────
export function RevenueIntel() {
  const [tab, setTab] = useState('overview')
  const weeks = ['W1','W2','W3','W4']
  const gross  = [5200, 6800, 4900, 7200]
  const net    = [2100, 2900, 1800, 3200]
  const maxVal = 8000

  return (
    <div style={{ ...S.page, gap:0, paddingBottom:0 }}>
      {/* Tab bar */}
      <div style={{ display:'flex', gap:6, marginBottom:16, flexShrink:0 }}>
        {[
          { id:'overview', label:'Revenue Overview' },
          { id:'trucks',   label:'Truck Profitability' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="btn" style={{
            background: tab===t.id ? 'rgba(240,165,0,0.12)' : 'var(--surface2)',
            color: tab===t.id ? 'var(--accent)' : 'var(--muted)',
            border: `1px solid ${tab===t.id ? 'rgba(240,165,0,0.35)' : 'var(--border)'}`,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16, flex:1, overflowY:'auto', minHeight:0 }}>
          <AiBanner
            title="AI Revenue Forecast: You're on track for $14,200 this month"
            sub="Best performing lane: MSP→CHI at $3.10/mi avg · Take 2 more loads this week to hit your $5,000/week target"
          />
          <div style={S.grid(4)}>
            <StatCard label="Gross MTD"     value="$12.4K" change="↑ 18%" color="var(--accent)" />
            <StatCard label="Net MTD"       value="$4,820" change="After all costs" color="var(--success)" />
            <StatCard label="Best Lane RPM" value="$3.22"  change="DAL→MIA" color="var(--accent2)" changeType="neutral"/>
            <StatCard label="Avg Load Size" value="$3,890" change="↑ $340 vs last mo" color="var(--accent3)" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
            <div style={S.panel}>
              <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={BarChart2} /> Weekly Revenue (Gross vs Net)</div></div>
              <div style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, height: 160 }}>
                  {weeks.map((w, i) => (
                    <div key={w} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: '100%', display: 'flex', gap: 4, alignItems: 'flex-end', justifyContent: 'center' }}>
                        <div style={{ width: '42%', height: `${(gross[i]/maxVal)*140}px`, background: 'var(--accent)', borderRadius: '4px 4px 0 0', transition: 'height 0.5s' }} />
                        <div style={{ width: '42%', height: `${(net[i]/maxVal)*140}px`, background: 'var(--success)', borderRadius: '4px 4px 0 0', transition: 'height 0.5s' }} />
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{w}</div>
                      <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>${(gross[i]/1000).toFixed(1)}K</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}><div style={{ width: 10, height: 10, background: 'var(--accent)', borderRadius: 2 }} /> Gross</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--muted)' }}><div style={{ width: 10, height: 10, background: 'var(--success)', borderRadius: 2 }} /> Net Profit</div>
                </div>
              </div>
            </div>

            <div style={S.panel}>
              <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Flame} /> Top Lanes by Net</div></div>
              <div>
                {[
                  { lane:'DAL→MIA', rpm:3.22, loads:4, net:'$13.7K', trend:'↑12%', color:'var(--success)' },
                  { lane:'ATL→CHI', rpm:2.94, loads:6, net:'$11.2K', trend:'↑8%',  color:'var(--success)' },
                  { lane:'MEM→NYC', rpm:3.10, loads:3, net:'$9.7K',  trend:'↑5%',  color:'var(--accent2)' },
                  { lane:'MSP→CHI', rpm:3.10, loads:5, net:'$8.4K',  trend:'→',    color:'var(--muted)'   },
                  { lane:'PHX→LAX', rpm:2.41, loads:8, net:'$6.1K',  trend:'↓3%',  color:'var(--danger)'  },
                ].map((l, i) => (
                  <div key={l.lane} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', gap: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', width: 16 }}>#{i+1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{l.lane}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>${l.rpm}/mi · {l.loads} loads</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>{l.net}</div>
                      <div style={{ fontSize: 10, color: l.color }}>{l.trend}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Target} /> AI Weekly Targets</div>
              <span style={S.badge('var(--accent2)')}>Auto-updated</span>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 12 }}>
              {[
                { label:'Loads This Week', target:4, current:2, unit:'loads', color:'var(--accent)' },
                { label:'Miles Planned',   target:3000, current:1700, unit:'mi', color:'var(--accent2)' },
                { label:'Revenue Target',  target:6200, current:3840, unit:'$',  color:'var(--success)' },
              ].map(g => {
                const pct = Math.round((g.current/g.target)*100)
                const val = g.unit==='$' ? `$${g.current.toLocaleString()} / $${g.target.toLocaleString()}` : `${g.current.toLocaleString()} / ${g.target.toLocaleString()} ${g.unit}`
                return (
                  <div key={g.label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16 }}>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 8 }}>{g.label}</div>
                    <div style={{ fontSize: 12, marginBottom: 8 }}>{val}</div>
                    <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                      <div style={{ height: '100%', width: `${pct}%`, background: g.color, borderRadius: 3, transition: 'width 0.5s' }} />
                    </div>
                    <div style={{ fontSize: 11, color: g.color, marginTop: 4 }}>{pct}% complete</div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {tab === 'trucks' && (
        <div style={{ flex:1, minHeight:0, overflow:'hidden' }}>
          <TruckROI />
        </div>
      )}
    </div>
  )
}

// ─── DRIVER SETTLEMENT ─────────────────────────────────────────────────────────
const SETTLE_DRIVERS = []

const PAY_MODELS = [
  { id: 'percent', label: '% of Gross', desc: 'e.g. 28%' },
  { id: 'permile', label: 'Per Mile',   desc: 'e.g. $0.52/mi' },
  { id: 'flat',    label: 'Flat / Load', desc: 'e.g. $900/load' },
]

const DEDUCT_PRESETS = ['Fuel Advance', 'Lumper Reimbursement', 'Escrow Hold', 'Toll Reimbursement', 'Violation / Fine', 'Other']

function calcPay(load, model, val) {
  if (model === 'percent') return Math.round(load.gross * (val / 100))
  if (model === 'permile')  return Math.round(load.miles * val)
  return val // flat
}

export function DriverSettlement() {
  const { showToast } = useApp()
  const { loads: ctxLoads } = useCarrier()
  const [activeDriver, setActiveDriver] = useState('james')
  const [models, setModels] = useState({ james: 'percent', marcus: 'permile', priya: 'flat' })
  const [modelVals, setModelVals] = useState({ james: 28, marcus: 0.52, priya: 900 })
  const [deductions, setDeductions] = useState({ james: [{ id: 1, label: 'Fuel Advance', amount: -200 }], marcus: [], priya: [] })
  const [addingDeduct, setAddingDeduct] = useState(false)
  const [newDeduct, setNewDeduct] = useState({ label: 'Fuel Advance', amount: '' })
  const [showSheet, setShowSheet] = useState(false)

  const driver = SETTLE_DRIVERS.find(d => d.id === activeDriver)

  if (!driver) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>No Drivers Yet</div>
      <div style={{ fontSize: 12 }}>Add drivers to view settlement details</div>
    </div>
  )

  const model = models[activeDriver]
  const modelVal = modelVals[activeDriver]
  const driverDeductions = deductions[activeDriver] || []

  // Merge context delivered loads with hardcoded history for this driver
  const driverName = driver?.name || ''
  const contextLoads = ctxLoads
    .filter(l => l.driver === driverName && (l.status === 'Delivered' || l.status === 'Invoiced'))
    .map(l => ({ id: l.loadId, route: l.origin.split(',')[0] + ' → ' + l.dest.split(',')[0], miles: l.miles, gross: l.gross, date: l.pickup?.split(' ·')[0] || 'Mar' }))
  const mergedLoads = contextLoads.length > 0 ? contextLoads : (driver?.loads || [])

  const loadPays = mergedLoads.map(l => ({ ...l, pay: calcPay(l, model, modelVal) }))
  const grossPay = loadPays.reduce((s, l) => s + l.pay, 0)
  const totalDeduct = driverDeductions.reduce((s, d) => s + d.amount, 0)
  const netPay = grossPay + totalDeduct

  const addDeduction = () => {
    if (!newDeduct.amount) return
    const amt = parseFloat(newDeduct.amount)
    const isReimburse = newDeduct.label.toLowerCase().includes('reimburs') || newDeduct.label.toLowerCase().includes('toll')
    setDeductions(d => ({ ...d, [activeDriver]: [...(d[activeDriver]||[]), { id: Date.now(), label: newDeduct.label, amount: isReimburse ? Math.abs(amt) : -Math.abs(amt) }] }))
    setNewDeduct({ label: 'Fuel Advance', amount: '' })
    setAddingDeduct(false)
  }

  const removeDeduction = (id) => setDeductions(d => ({ ...d, [activeDriver]: d[activeDriver].filter(x => x.id !== id) }))

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      {/* ── Driver selector ── */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          {SETTLE_DRIVERS.map(d => {
            const isActive = activeDriver === d.id
            return (
              <button key={d.id} onClick={() => setActiveDriver(d.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`, background: isActive ? 'rgba(240,165,0,0.08)' : 'var(--surface)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: isActive ? 'var(--accent)' : 'var(--surface2)', color: isActive ? '#000' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{d?.avatar || '?'}</div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? 'var(--accent)' : 'var(--text)' }}>{d.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{(ctxLoads.filter(l => l.driver === d.name && (l.status==='Delivered'||l.status==='Invoiced')).length || d.loads.length)} loads this period</div>
                </div>
              </button>
            )
          })}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowSheet(s => !s)}>
          {showSheet ? '✕ Close Sheet' : 'Settlement Sheet'}
        </button>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => showToast('', 'FastPay Sent', `${driver?.name || 'Driver'} · $${netPay.toLocaleString()} · 24hr deposit`)}>
          <Zap size={13} /> FastPay ${netPay.toLocaleString()}
        </button>
      </div>

      {/* ── Settlement Sheet modal ── */}
      {showSheet && (
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 12, padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2 }}>DRIVER SETTLEMENT STATEMENT</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Qivori TMS · Period: Mar W2 · Generated {new Date().toLocaleDateString()}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{driver.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Pay Model: {PAY_MODELS.find(m => m.id === model)?.label} · {model === 'percent' ? modelVal + '%' : model === 'permile' ? '$' + modelVal + '/mi' : '$' + modelVal + '/load'}</div>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, minWidth:550 }}>
            <thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
              {['Load ID','Route','Miles','Gross','Pay'].map(h => <th key={h} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {loadPays.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>{l.id}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{l.route}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>{l.miles.toLocaleString()} mi</td>
                  <td style={{ padding: '10px 12px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: 'var(--accent)' }}>${l.gross.toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>${l.pay.toLocaleString()}</td>
                </tr>
              ))}
              {driverDeductions.map(d => (
                <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td colSpan={4} style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>{d.label}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: d.amount < 0 ? 'var(--danger)' : 'var(--success)' }}>{d.amount < 0 ? '−' : '+'}${Math.abs(d.amount).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 40, padding: '12px 12px 0', borderTop: '2px solid var(--border)' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Gross Pay</div>
              <div style={{ fontSize: 20, fontFamily: "'Bebas Neue',sans-serif", color: 'var(--accent)' }}>${grossPay.toLocaleString()}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Deductions</div>
              <div style={{ fontSize: 20, fontFamily: "'Bebas Neue',sans-serif", color: 'var(--danger)' }}>${Math.abs(totalDeduct).toLocaleString()}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>NET PAY</div>
              <div style={{ fontSize: 28, fontFamily: "'Bebas Neue',sans-serif", color: 'var(--success)' }}>${netPay.toLocaleString()}</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button className="btn btn-primary" style={{ flex: 1, padding: '11px 0' }} onClick={() => showToast('', 'FastPay Sent', `${driver.name} · $${netPay.toLocaleString()} · 24hr deposit`)}><Ic icon={Zap} /> FastPay — 2.5% fee · 24hr deposit</button>
            <button className="btn btn-ghost" style={{ flex: 1, padding: '11px 0' }} onClick={() => showToast('', 'ACH Transfer Queued', `${driver.name} · $${netPay.toLocaleString()} · 1–3 business days`)}><Ic icon={Briefcase} /> Standard ACH — 1–3 days · Free</button>
            <button className="btn btn-ghost" style={{ padding: '11px 16px' }} onClick={() => generateSettlementPDF(driver.name, mergedLoads, 'Mar 1–15, 2026')} title="Download Settlement PDF"><Ic icon={Download} /> PDF</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── Pay Model ── */}
        <div style={S.panel}>
          <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Settings} /> Pay Model — {driver.name}</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PAY_MODELS.map(pm => {
              const isActive = model === pm.id
              return (
                <label key={pm.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`, background: isActive ? 'rgba(240,165,0,0.05)' : 'var(--surface2)', cursor: 'pointer' }}>
                  <input type="radio" name={`model-${activeDriver}`} checked={isActive} onChange={() => setModels(m => ({ ...m, [activeDriver]: pm.id }))} style={{ accentColor: 'var(--accent)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? 'var(--accent)' : 'var(--text)' }}>{pm.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{pm.desc}</div>
                  </div>
                  {isActive && (
                    <input type="number" value={modelVal} step={pm.id === 'permile' ? 0.01 : 1} min={0}
                      onChange={e => setModelVals(v => ({ ...v, [activeDriver]: parseFloat(e.target.value) || 0 }))}
                      onClick={e => e.stopPropagation()}
                      style={{ width: 80, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 14, fontFamily: "'Bebas Neue',sans-serif", textAlign: 'center' }} />
                  )}
                </label>
              )
            })}
          </div>
        </div>

        {/* ── Deductions ── */}
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}><Ic icon={Square} /> Deductions & Reimbursements</div>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setAddingDeduct(a => !a)}>{addingDeduct ? '✕ Cancel' : '+ Add'}</button>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {addingDeduct && (
              <div style={{ display: 'flex', gap: 8, padding: '10px 12px', background: 'var(--surface2)', borderRadius: 8, border: '1px solid rgba(240,165,0,0.2)' }}>
                <select value={newDeduct.label} onChange={e => setNewDeduct(d => ({ ...d, label: e.target.value }))}
                  style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                  {DEDUCT_PRESETS.map(p => <option key={p}>{p}</option>)}
                </select>
                <input type="number" placeholder="Amount" value={newDeduct.amount}
                  onChange={e => setNewDeduct(d => ({ ...d, amount: e.target.value }))}
                  style={{ width: 90, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 13, fontFamily: "'Bebas Neue',sans-serif" }} />
                <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={addDeduction}>Add</button>
              </div>
            )}
            {driverDeductions.length === 0 && !addingDeduct && (
              <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '12px 0' }}>No deductions this period</div>
            )}
            {driverDeductions.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
                <div style={{ flex: 1, fontSize: 13 }}>{d.label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif", color: d.amount < 0 ? 'var(--danger)' : 'var(--success)' }}>
                  {d.amount < 0 ? '−' : '+'}${Math.abs(d.amount).toLocaleString()}
                </div>
                <button onClick={() => removeDeduction(d.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Load Table ── */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Package} /> Loads This Period — {driver.name}</div>
          <span style={S.badge('var(--accent2)')}>{PAY_MODELS.find(m => m.id === model)?.label} · {model === 'percent' ? modelVal + '%' : model === 'permile' ? '$' + modelVal + '/mi' : '$' + modelVal + '/load'}</span>
        </div>
        <div style={{ overflowX:'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth:600 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            {['Load ID', 'Route', 'Date', 'Miles', 'Gross', 'Driver Pay'].map(h => (
              <th key={h} style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {loadPays.map((l, i) => (
              <tr key={l.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{l.id}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>{l.route}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>{l.date}</td>
                <td style={{ padding: '12px 16px', fontSize: 12 }}>{l.miles.toLocaleString()} mi</td>
                <td style={{ padding: '12px 16px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--accent)' }}>${l.gross.toLocaleString()}</td>
                <td style={{ padding: '12px 16px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--success)' }}>${l.pay.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table></div>

        {/* Totals row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', borderTop: '2px solid var(--border)' }}>
          {[
            { label: 'Gross Pay',   value: '$' + grossPay.toLocaleString(),         color: 'var(--accent)' },
            { label: 'Deductions',  value: '−$' + Math.abs(totalDeduct).toLocaleString(), color: 'var(--danger)' },
            { label: 'Net Pay',     value: '$' + netPay.toLocaleString(),            color: 'var(--success)', large: true },
            { label: 'Loads',       value: mergedLoads.length,                      color: 'var(--accent2)' },
          ].map(item => (
            <div key={item.label} style={{ textAlign: 'center', padding: '14px 0', borderRight: '1px solid var(--border)' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{item.label}</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: item.large ? 28 : 22, color: item.color }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Pay actions ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <button className="btn btn-primary" style={{ padding: '14px 0', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={() => showToast('', 'FastPay Sent', `${driver.name} · $${netPay.toLocaleString()} · 24hr deposit`)}>
          <span><Ic icon={Zap} /> FastPay</span>
          <span style={{ opacity: 0.7, fontSize: 12 }}>2.5% fee · Same-day deposit</span>
        </button>
        <button className="btn btn-ghost" style={{ padding: '14px 0', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={() => showToast('', 'ACH Queued', `${driver.name} · $${netPay.toLocaleString()} · 1–3 business days`)}>
          <span><Ic icon={Briefcase} /> Standard ACH</span>
          <span style={{ opacity: 0.7, fontSize: 12 }}>Free · 1–3 business days</span>
        </button>
      </div>

      {/* ── Settlement history ── */}
      <div style={S.panel}>
        <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Clock} /> Settlement History — {driver.name}</div></div>
        <div style={{ overflowX:'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth:550 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            {['Period', 'Gross Paid', 'Net Pay', 'Paid On', 'Status'].map(h => (
              <th key={h} style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {driver.history.map(h => (
              <tr key={h.period} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '11px 16px', fontSize: 13, fontWeight: 600 }}>{h.period}</td>
                <td style={{ padding: '11px 16px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: 'var(--accent)' }}>${h.gross.toLocaleString()}</td>
                <td style={{ padding: '11px 16px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: 'var(--success)' }}>${h.net.toLocaleString()}</td>
                <td style={{ padding: '11px 16px', fontSize: 12, color: 'var(--muted)' }}>{h.date}</td>
                <td style={{ padding: '11px 16px' }}><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.2)' }}>{h.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}

// ─── FLEET MAP ─────────────────────────────────────────────────────────────────
const CITIES = {
  'Atlanta, GA':   { x: 62, y: 66 }, 'Chicago, IL':   { x: 57, y: 42 },
  'Dallas, TX':    { x: 46, y: 72 }, 'Miami, FL':     { x: 68, y: 82 },
  'Denver, CO':    { x: 32, y: 50 }, 'Houston, TX':   { x: 47, y: 78 },
  'Memphis, TN':   { x: 57, y: 64 }, 'New York, NY':  { x: 77, y: 38 },
  'Phoenix, AZ':   { x: 20, y: 66 }, 'Los Angeles, CA':{ x: 10, y: 62 },
  'Omaha, NE':     { x: 46, y: 46 }, 'Minneapolis, MN':{ x: 50, y: 32 },
}
const STATUS_PROGRESS = { 'Rate Con Received':0.05, 'Assigned to Driver':0.10, 'En Route to Pickup':0.20, 'Loaded':0.45, 'In Transit':0.65, 'Delivered':1, 'Invoiced':1 }
const STATUS_LABEL = { 'Rate Con Received':'Ready', 'Assigned to Driver':'Assigned', 'En Route to Pickup':'En Route', 'Loaded':'Loaded', 'In Transit':'En Route', 'Delivered':'Delivered', 'Invoiced':'Delivered' }

// ─── STOP TIMELINE ─────────────────────────────────────────────────────────────
export function StopTimeline({ load, onAdvance }) {
  const { advanceStop } = useCarrier()
  const { showToast } = useApp()
  if (!load?.stops?.length) return null

  const stopTypeIcon  = { pickup: Package, dropoff: Flag }
  const stopTypeColor = { pickup:'var(--accent2)', dropoff:'var(--success)' }
  const statusColor   = { complete:'var(--success)', current:'var(--accent)', pending:'var(--muted)' }
  const statusIcon    = { complete: Check, current: CircleDot, pending: Square }
  const canAdvance    = load.status === 'In Transit' || load.status === 'Loaded' || load.status === 'Assigned to Driver' || load.status === 'En Route to Pickup'

  const handleAdvance = () => {
    advanceStop(load.loadId)
    const next = load.stops[load.currentStop + 1]
    showToast('', 'Stop Updated', next ? `En route to Stop ${next.seq}: ${next.city}` : 'Final delivery confirmed')
    if (onAdvance) onAdvance()
  }

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
      <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontWeight:700, fontSize:13 }}><Ic icon={MapPin} /> Route · {load.stops.length} Stops</span>
        <span style={{ fontSize:10, padding:'2px 8px', background:'rgba(240,165,0,0.12)', color:'var(--accent)', borderRadius:6, fontWeight:800 }}>
          ALL-IN · ${load.gross?.toLocaleString()}
        </span>
        <span style={{ marginLeft:'auto', fontSize:11, color:'var(--muted)' }}>
          Stop {(load.currentStop || 0) + 1} of {load.stops.length}
        </span>
      </div>

      <div style={{ padding:'14px 18px' }}>
        {load.stops.map((stop, idx) => {
          const isLast   = idx === load.stops.length - 1
          const sc       = stop.status || (idx < (load.currentStop||0) ? 'complete' : idx === (load.currentStop||0) ? 'current' : 'pending')
          const isCurrent = sc === 'current'

          return (
            <div key={stop.seq} style={{ display:'flex', gap:14, position:'relative' }}>
              {/* Vertical line */}
              {!isLast && (
                <div style={{ position:'absolute', left:9, top:22, bottom:-8, width:2,
                  background: sc === 'complete' ? 'var(--success)' : 'var(--border)' }}/>
              )}

              {/* Dot */}
              <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2,
                background: isCurrent ? 'var(--accent)' : sc === 'complete' ? 'var(--success)' : 'var(--surface2)',
                border: `2px solid ${statusColor[sc]}`,
                boxShadow: isCurrent ? '0 0 8px var(--accent)' : 'none',
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, zIndex:1 }}>
                {sc === 'complete' ? '✓' : sc === 'current' ? '●' : stop.seq}
              </div>

              {/* Stop info */}
              <div style={{ flex:1, paddingBottom: isLast ? 0 : 18 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                  <span style={{ fontSize:10, fontWeight:800, padding:'1px 6px', borderRadius:5,
                    background: stopTypeColor[stop.type]+'18', color: stopTypeColor[stop.type],
                    textTransform:'uppercase', letterSpacing:0.5 }}>
                    {React.createElement(stopTypeIcon[stop.type], {size:10})} {stop.type}
                  </span>
                  {isCurrent && (
                    <span style={{ fontSize:9, fontWeight:800, color:'var(--accent)', background:'rgba(240,165,0,0.1)', padding:'1px 6px', borderRadius:5 }}>
                      ● CURRENT
                    </span>
                  )}
                </div>
                <div style={{ fontSize:13, fontWeight:700, color: isCurrent ? 'var(--text)' : sc === 'complete' ? 'var(--muted)' : 'var(--text)', marginBottom:2 }}>
                  {stop.city}
                </div>
                {stop.addr && <div style={{ fontSize:11, color:'var(--muted)', marginBottom:2 }}>{stop.addr}</div>}
                <div style={{ fontSize:11, color: isCurrent ? 'var(--accent)' : 'var(--muted)' }}><Ic icon={Calendar} /> {stop.time}</div>
                {stop.notes && <div style={{ fontSize:11, color:'var(--muted)', marginTop:2, fontStyle:'italic' }}><Ic icon={FileText} /> {stop.notes}</div>}
              </div>
            </div>
          )
        })}
      </div>

      {/* Advance stop button */}
      {canAdvance && (load.currentStop || 0) < load.stops.length - 1 && (
        <div style={{ padding:'12px 18px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ flex:1, fontSize:11, color:'var(--muted)' }}>
            Next: <span style={{ color:'var(--text)', fontWeight:600 }}>{load.stops[(load.currentStop||0)+1]?.city}</span>
            {' · '}{load.stops[(load.currentStop||0)+1]?.time}
          </div>
          <button className="btn btn-primary" style={{ fontSize:11, padding:'6px 16px' }} onClick={handleAdvance}>
            <Check size={13} /> Confirm Stop & Advance
          </button>
        </div>
      )}
    </div>
  )
}

export function FleetMap() {
  const { showToast } = useApp()
  const ctx = useCarrier() || {}
  const drivers = ctx.drivers || []
  const vehicles = ctx.vehicles || []
  const loads = ctx.activeLoads || (ctx.loads || []).filter(l => !['Delivered','Invoiced'].includes(l.status))

  const UNIT_COLORS = ['#f0a500','#00d4aa','#6b7280','#e74c3c','#3498db','#9b59b6','#1abc9c','#e67e22']

  // Build real truck data from context
  const trucksData = drivers.map((d, i) => {
    const driverName = d.name || d.full_name || `Driver ${i+1}`
    const vehicle = vehicles[i]
    const unit = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : `Unit ${String(i+1).padStart(2,'0')}`
    const color = UNIT_COLORS[i % UNIT_COLORS.length]
    const load = loads.find(l => (l.driver_name || l.driver) === driverName)
    const homecity = d.city || d.home_city || 'Unknown'
    if (load) {
      const from = load.origin || homecity
      const to   = load.dest   || homecity
      return { unit, driver: driverName, from, to, progress: STATUS_PROGRESS[load.status] || 0.5, status: STATUS_LABEL[load.status] || load.status, color, load: load.loadId, eta: load.delivery?.split(' · ')[0] || 'TBD' }
    }
    return { unit, driver: driverName, from: homecity, to: homecity, progress: 1, status: 'Available', color, load: '—', eta: 'Ready' }
  })

  const [selectedTruck, setSelectedTruck] = useState(trucksData[0]?.unit || 'Unit 01')

  const truckPos = (t) => {
    const from = CITIES[t.from] || { x:50, y:50 }
    const to   = CITIES[t.to]   || { x:50, y:50 }
    return { x: from.x + (to.x - from.x) * t.progress, y: from.y + (to.y - from.y) * t.progress }
  }

  if (!drivers.length) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', background:'#0a0e1a' }}>
        <div style={{ textAlign:'center', padding:'40px 32px' }}>
          <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
            <Truck size={26} color="var(--accent)" />
          </div>
          <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginBottom:8 }}>No drivers added yet</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)', lineHeight:1.6, maxWidth:280 }}>
            Add your first driver to see fleet map.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      {/* Map area */}
      <div style={{ flex:1, position:'relative', background:'#0a0e1a', overflow:'hidden' }}>
        {/* Grid lines */}
        <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0.06 }}>
          {[10,20,30,40,50,60,70,80,90].map(x => <line key={x} x1={`${x}%`} y1="0" x2={`${x}%`} y2="100%" stroke="#6b7280" strokeWidth="1"/>)}
          {[10,20,30,40,50,60,70,80,90].map(y => <line key={y} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke="#6b7280" strokeWidth="1"/>)}
        </svg>
        {/* US outline suggestion */}
        <div style={{ position:'absolute', left:'8%', top:'28%', right:'5%', bottom:'12%', border:'1px solid rgba(255,255,255,0.04)', borderRadius:'4% 8% 6% 12%' }} />

        <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
          {/* Route lines */}
          {trucksData.filter(t => t.from !== t.to).map(t => {
            const from = CITIES[t.from], to = CITIES[t.to]
            if (!from || !to) return null
            return (
              <g key={t.unit}>
                <line x1={`${from.x}%`} y1={`${from.y}%`} x2={`${to.x}%`} y2={`${to.y}%`}
                  stroke={t.color} strokeWidth="1.5" strokeDasharray="6,4" opacity="0.3" />
                <line x1={`${from.x}%`} y1={`${from.y}%`}
                  x2={`${from.x + (to.x-from.x)*t.progress}%`} y2={`${from.y + (to.y-from.y)*t.progress}%`}
                  stroke={t.color} strokeWidth="2" opacity="0.8" />
              </g>
            )
          })}
          {/* City dots */}
          {Object.entries(CITIES).map(([name, pos]) => (
            <g key={name}>
              <circle cx={`${pos.x}%`} cy={`${pos.y}%`} r="4" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
              <text x={`${pos.x}%`} y={`${pos.y - 1.5}%`} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="DM Sans,sans-serif">{name.split(',')[0]}</text>
            </g>
          ))}
          {/* Truck icons */}
          {trucksData.map(t => {
            const pos = truckPos(t)
            const isSel = selectedTruck === t.unit
            return (
              <g key={t.unit} style={{ cursor:'pointer' }} onClick={() => setSelectedTruck(t.unit)}>
                <circle cx={`${pos.x}%`} cy={`${pos.y}%`} r={isSel ? 14 : 10} fill={t.color} opacity={isSel ? 1 : 0.7} />
                {isSel && <circle cx={`${pos.x}%`} cy={`${pos.y}%`} r="18" fill="none" stroke={t.color} strokeWidth="1.5" opacity="0.4"/>}
                <text x={`${pos.x}%`} y={`${pos.y}%`} textAnchor="middle" dominantBaseline="middle" fill="#000" fontSize="9" fontWeight="800" fontFamily="DM Sans,sans-serif"><Truck size={20} /></text>
              </g>
            )
          })}
        </svg>

        {/* Legend */}
        <div style={{ position:'absolute', bottom:16, left:16, display:'flex', gap:12 }}>
          {trucksData.map(t => (
            <div key={t.unit} onClick={() => setSelectedTruck(t.unit)}
              style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(0,0,0,0.6)', border:`1px solid ${selectedTruck===t.unit ? t.color : 'rgba(255,255,255,0.1)'}`, borderRadius:8, padding:'6px 10px', cursor:'pointer' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:t.color }} />
              <span style={{ fontSize:11, color:'#fff', fontFamily:'DM Sans,sans-serif' }}>{t.unit}</span>
            </div>
          ))}
        </div>

        {/* Top label */}
        <div style={{ position:'absolute', top:16, left:16, background:'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'6px 12px' }}>
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)', fontFamily:'DM Sans,sans-serif', letterSpacing:2 }}>● LIVE FLEET — {trucksData.filter(t=>t.load!=='—').length} on load</span>
        </div>

        {/* Empty state overlay when no trucks on load */}
        {trucksData.filter(t=>t.load!=='—').length === 0 && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:5, pointerEvents:'none' }}>
            <div style={{ textAlign:'center', background:'rgba(0,0,0,0.6)', borderRadius:16, padding:'32px 40px', border:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(8px)' }}>
              <div style={{ width:48, height:48, borderRadius:12, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                <Truck size={22} color="var(--accent)" />
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:'#fff', marginBottom:6 }}>All trucks available</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)', lineHeight:1.5, maxWidth:240 }}>
                No active loads dispatched. Book a load from the AI Load Board to see trucks on the map.
              </div>
              <div style={{ display:'flex', gap:8, marginTop:16, justifyContent:'center' }}>
                {trucksData.map(t => (
                  <div key={t.unit} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 8px', background:'rgba(255,255,255,0.05)', borderRadius:6 }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:t.color }}/>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>{t.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Side panel */}
      <div style={{ width:280, flexShrink:0, background:'var(--surface)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:11, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:2 }}>FLEET STATUS</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:8, marginTop:10 }}>
            {[
              { v: String(trucksData.filter(t=>t.status==='En Route'||t.status==='Loaded'||t.status==='Assigned').length), l:'On Load',   c:'var(--success)' },
              { v: String(trucksData.filter(t=>t.status==='Available').length), l:'Available', c:'var(--accent2)' },
              { v: String(trucksData.length), l:'Total', c:'var(--muted)' },
            ].map(s => (
              <div key={s.l} style={{ textAlign:'center', background:'var(--surface2)', borderRadius:8, padding:'8px 4px' }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:s.c }}>{s.v}</div>
                <div style={{ fontSize:9, color:'var(--muted)' }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {trucksData.map(t => {
          const isSel = selectedTruck === t.unit
          const statusColor = ['En Route','Loaded','Assigned'].includes(t.status) ? 'var(--success)' : t.status==='Available' ? 'var(--accent2)' : 'var(--muted)'
          return (
            <div key={t.unit} onClick={() => setSelectedTruck(t.unit)}
              style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', borderLeft:`3px solid ${isSel ? t.color : 'transparent'}`, background: isSel ? 'rgba(240,165,0,0.04)' : 'transparent', transition:'all 0.15s' }}>
              <div style={{ padding:'12px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:t.color }} />
                    <span style={{ fontSize:13, fontWeight:700 }}>{t.unit}</span>
                  </div>
                  <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:8, background:statusColor+'15', color:statusColor }}>{t.status}</span>
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}><Ic icon={User} /> {t.driver}</div>
                {t.from !== t.to && <div style={{ fontSize:11, marginBottom:4 }}><Ic icon={MapPin} /> {t.from.split(',')[0]} <span style={{ color:'var(--accent)' }}>→</span> {t.to.split(',')[0]}</div>}
                {t.from === t.to && <div style={{ fontSize:11, marginBottom:4 }}><Ic icon={MapPin} /> {t.from.split(',')[0]}</div>}
                {t.load !== '—' && (
                  <>
                    <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6 }}><Ic icon={Package} /> {t.load} · ETA {t.eta}</div>
                    <div style={{ height:4, background:'var(--border)', borderRadius:2 }}>
                      <div style={{ height:'100%', width:`${t.progress*100}%`, background:t.color, borderRadius:2 }} />
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{Math.round(t.progress*100)}% complete</div>
                  </>
                )}
                {isSel && (
                  <div style={{ display:'flex', gap:6, marginTop:10 }}>
                    <button className="btn btn-ghost" style={{ fontSize:10, flex:1 }} onClick={e => { e.stopPropagation(); showToast('', t.unit, 'Pinging ELD for location update...') }}><Ic icon={Radio} /> Ping</button>
                    <button className="btn btn-ghost" style={{ fontSize:10, flex:1 }} onClick={e => { e.stopPropagation(); showToast('', 'Message Sent', `Dispatcher → ${t.driver}`) }}><Ic icon={MessageCircle} /> Message</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── FLEET & GPS ───────────────────────────────────────────────────────────────
export function CarrierFleet() {
  const { showToast } = useApp()
  const ctx = useCarrier() || {}
  const vehicles = ctx.vehicles || []
  const drivers = ctx.drivers || []
  const loads = ctx.activeLoads || (ctx.loads || []).filter(l => !['Delivered','Invoiced'].includes(l.status))

  const trucks = vehicles.map((v, i) => {
    const driver = drivers[i]
    const driverName = driver ? (driver.name || driver.full_name || `Driver ${i+1}`) : 'Unassigned'
    const unitLabel = `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || `Unit ${String(i+1).padStart(2,'0')}`
    const load = loads.find(l => (l.driver_name || l.driver) === driverName)
    const status = load ? 'En Route' : driver ? 'Available' : 'Unassigned'
    const loc = driver?.city || driver?.home_city || v.location || 'Unknown'
    return {
      unit: unitLabel, driver: driverName, status, loc,
      dest: load?.dest || '—', load: load?.loadId || '—', eta: load?.delivery?.split(' · ')[0] || '—',
      hos: driver?.hos_remaining || '—', mpg: v.mpg || '—',
      nextService: v.next_service || '—', eld: v.eld_provider || 'N/A',
      hosColor: 'var(--success)',
    }
  })

  const enRouteCount = trucks.filter(t => t.status === 'En Route').length
  const availableCount = trucks.filter(t => t.status === 'Available').length

  if (!vehicles.length) {
    return (
      <div style={{ ...S.page, paddingBottom:40 }}>
        <div style={{ textAlign:'center', padding:'60px 32px' }}>
          <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
            <Truck size={26} color="var(--accent)" />
          </div>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:8 }}>No vehicles added yet</div>
          <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, maxWidth:300, margin:'0 auto' }}>
            Add your first vehicle to see your fleet overview here.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div style={S.grid(4)}>
        <StatCard label="Fleet Online" value={`${trucks.length}/${trucks.length}`} change="Vehicles tracked" color="var(--success)" changeType="neutral" />
        <StatCard label="En Route"    value={String(enRouteCount)}    change={enRouteCount ? 'Active loads' : 'None'}  color="var(--accent)"  changeType="neutral" />
        <StatCard label="Available"   value={String(availableCount)}    change={availableCount ? 'Ready to dispatch' : 'None'}   color="var(--accent2)" changeType="neutral" />
        <StatCard label="Total Vehicles" value={String(trucks.length)}  change={`${drivers.length} drivers assigned`} color="var(--muted)" changeType="neutral" />
      </div>
      {trucks.map(t => {
        const sp = t.status==='En Route' ? 'var(--success)' : t.status==='Available' ? 'var(--accent3)' : 'var(--muted)'
        return (
          <div key={t.unit} style={S.panel}>
            <div style={{ ...S.panelHead, borderColor: t.nextService==='800 mi' ? 'rgba(245,158,11,0.3)' : 'var(--border)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div><Truck size={20} /></div>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{t.unit}</span>
                    <span style={{ ...S.tag(sp), fontSize: 10 }}>{t.status}</span>
                    {t.nextService==='800 mi' && <span style={{ ...S.tag('var(--warning)'), fontSize: 10 }}><Ic icon={AlertTriangle} /> SERVICE SOON</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.driver} · ELD: {t.eld}</div>
                </div>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => showToast('', t.unit, 'Live GPS: ' + t.loc)}>Track Live</button>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
              {[
                { label:'Location', value: t.loc },
                { label:'HOS Remaining', value: t.hos, color: t.hosColor },
                { label:'MPG', value: t.mpg, color: t.mpg < 6.6 ? 'var(--warning)' : 'var(--success)' },
                { label:'Next Service', value: t.nextService, color: t.nextService==='800 mi' ? 'var(--warning)' : 'var(--muted)' },
              ].map(item => (
                <div key={item.label} style={{ textAlign: 'center', background: 'var(--surface2)', borderRadius: 8, padding: '10px 6px' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: item.color || 'var(--text)' }}>{item.value}</div>
                </div>
              ))}
            </div>
            {t.status === 'En Route' && (
              <div style={{ margin: '0 16px 16px', background: 'var(--surface2)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                  <span><Ic icon={Package} /> {t.load}</span><span style={{ color: 'var(--accent2)' }}>ETA {t.eta}</span>
                </div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                  <div style={{ height:'100%', width:'62%', background:'var(--accent)', borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>62% complete · {t.loc} → {t.dest}</div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}



// ─── FUEL OPTIMIZER ───────────────────────────────────────────────────────────
export function FuelOptimizer() {
  const { showToast } = useApp()
  const ctx = useCarrier() || {}
  const expenses = ctx.expenses || []
  const loads = ctx.loads || []
  const vehicles = ctx.vehicles || []

  const fuelExpenses = expenses.filter(e => (e.cat || e.category || '').toLowerCase() === 'fuel')
  const fuelSpend = fuelExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const totalMiles = loads.reduce((s, l) => s + (parseFloat(l.miles) || 0), 0)
  const costPerMile = totalMiles > 0 ? (fuelSpend / totalMiles).toFixed(2) : '--'
  const vehicleMpgs = vehicles.map(v => parseFloat(v.mpg)).filter(n => !isNaN(n) && n > 0)
  const avgMpg = vehicleMpgs.length > 0 ? (vehicleMpgs.reduce((s, m) => s + m, 0) / vehicleMpgs.length).toFixed(1) : '--'
  const hasData = fuelSpend > 0 || totalMiles > 0

  if (!hasData) {
    return (
      <div style={{ ...S.page, paddingBottom:40 }}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, gap:12, color:'var(--muted)' }}>
          <Fuel size={40} />
          <div style={{ fontSize:15, fontWeight:700 }}>No fuel data yet</div>
          <div style={{ fontSize:13 }}>Add fuel expenses to see optimization insights.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div style={S.grid(4)}>
        <StatCard label="Fleet Avg MPG" value={avgMpg} change={vehicleMpgs.length > 0 ? `${vehicleMpgs.length} vehicle${vehicleMpgs.length !== 1 ? 's' : ''}` : 'No vehicle MPG data'} color="var(--accent)" changeType="neutral"/>
        <StatCard label="Fuel Spend" value={`$${fuelSpend.toLocaleString()}`} change={`${fuelExpenses.length} fuel expense${fuelExpenses.length !== 1 ? 's' : ''}`} color="var(--warning)"/>
        <StatCard label="Cost/Mile" value={costPerMile === '--' ? '--' : `$${costPerMile}`} change={totalMiles > 0 ? `${totalMiles.toLocaleString()} total miles` : 'No miles data'} color="var(--muted)" changeType="neutral"/>
        <StatCard label="Total Miles" value={totalMiles > 0 ? totalMiles.toLocaleString() : '--'} change={`${loads.length} load${loads.length !== 1 ? 's' : ''}`} color="var(--accent2)" changeType="neutral"/>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
        <div style={S.panel}>
          <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Fuel} /> Fuel Expenses</div></div>
          <div>
            {fuelExpenses.slice(0, 10).map((e, i) => (
              <div key={i} style={S.row}>
                <div><Fuel size={18} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{e.notes || e.description || 'Fuel'}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{e.date || '--'}{e.load ? ` \u00b7 Load ${e.load}` : ''}{e.driver ? ` \u00b7 ${e.driver}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--warning)' }}>${(Number(e.amount) || 0).toLocaleString()}</div>
                </div>
              </div>
            ))}
            {fuelExpenses.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No fuel expenses recorded yet.</div>
            )}
          </div>
        </div>
        <div style={S.panel}>
          <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={BarChart2} /> Fleet Efficiency</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {vehicles.length > 0 ? vehicles.map((v, i) => {
              const mpg = parseFloat(v.mpg) || 0
              const status = mpg >= 6.5 ? 'Good' : mpg > 0 ? 'Low MPG' : 'No Data'
              const color = mpg >= 6.5 ? 'var(--success)' : mpg > 0 ? 'var(--warning)' : 'var(--muted)'
              return (
                <div key={v.id || i} style={{ background:'var(--surface2)', borderRadius:8, padding:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <div style={{ fontSize:12, fontWeight:700 }}>{v.name || v.unit || `Vehicle ${i + 1}`}{v.driver ? ` \u00b7 ${v.driver}` : ''}</div>
                    <span style={S.tag(color)}>{status}</span>
                  </div>
                  {mpg > 0 && (
                    <>
                      <div style={{ height:6, background:'var(--border)', borderRadius:3 }}>
                        <div style={{ height:'100%', width:`${Math.min((mpg/10)*100, 100)}%`, background:color, borderRadius:3 }} />
                      </div>
                      <div style={{ fontSize:11, color, marginTop:4 }}>{mpg} MPG</div>
                    </>
                  )}
                </div>
              )
            }) : (
              <div style={{ textAlign:'center', color:'var(--muted)', fontSize:13, padding:16 }}>No vehicles added yet.</div>
            )}
            {totalMiles > 0 && fuelSpend > 0 && (
              <div style={{ marginTop:4, padding:12, background:'rgba(240,165,0,0.06)', borderRadius:8, border:'1px solid rgba(240,165,0,0.2)', fontSize:12 }}>
                <Bot size={14} style={{display:"inline",verticalAlign:"middle"}} /> <b>AI Tip:</b> Your fleet averages <b style={{color:'var(--accent)'}}>${costPerMile}/mile</b> in fuel cost across {totalMiles.toLocaleString()} miles.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── BROKER RISK INTEL ────────────────────────────────────────────────────────
export function BrokerRiskIntel() {
  const { showToast } = useApp()
  const { loads, invoices } = useCarrier()

  const brokerNames = [...new Set(loads.map(l => l.broker).filter(Boolean))]

  const brokers = brokerNames.map(name => {
    const bLoads    = loads.filter(l => l.broker === name)
    const bInvs     = invoices.filter(i => i.broker === name)
    const paid      = bInvs.filter(i => i.status === 'Paid').length
    const unpaid    = bInvs.filter(i => i.status === 'Unpaid').length
    const factored  = bInvs.filter(i => i.status === 'Factored').length
    const totalGross = bLoads.reduce((s,l) => s+(l.gross||0), 0)
    const miles      = bLoads.reduce((s,l) => s+(parseFloat(l.miles)||0), 0)
    const avgRpm     = miles > 0 ? (totalGross/miles).toFixed(2) : '—'

    // Score: start 75, adjust for payment behavior
    let score = 75
    if (paid > 0) score += 10
    if (paid > 0 && unpaid === 0 && factored === 0) score += 10  // all paid, never had to factor
    if (bLoads.length >= 3) score += 5
    if (unpaid > 1) score -= 15
    if (factored > 0) score -= 5
    if (unpaid > 0 && paid === 0) score -= 10
    score = Math.min(Math.max(score, 30), 99)

    const paySpeed   = paid > 0 && unpaid === 0 ? '< 24hr' : factored > 0 ? '< 48hr (factored)' : unpaid > 0 ? '5–10 days' : 'Unknown'
    const tag        = score >= 90 ? 'FAST PAY' : score >= 82 ? 'RELIABLE' : score >= 72 ? 'REPUTABLE' : score >= 62 ? 'MONITOR' : 'SLOW PAYER'
    const color      = score >= 85 ? 'var(--success)' : score >= 72 ? 'var(--accent2)' : score >= 60 ? 'var(--warning)' : 'var(--danger)'
    const recommended = score >= 80

    return { name, score, paySpeed, loads: bLoads.length, disputes: 0, avgRpm, totalGross, paid, unpaid, factored, recommended, tag, color }
  }).sort((a,b) => b.score - a.score)

  const fastPay    = brokers.filter(b => b.score >= 85).length
  const slowPayers = brokers.filter(b => b.score < 65).length
  const avgScore   = brokers.length ? Math.round(brokers.reduce((s,b) => s+b.score, 0) / brokers.length) : 0

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <AiBanner
        title={slowPayers > 0 ? `AI flagged ${slowPayers} slow-pay broker${slowPayers>1?'s':''} — review payment history before booking` : 'All brokers in your network are paying on time — strong cashflow position'}
        sub={`${brokers.length} brokers tracked · ${fastPay} fast-pay · Avg risk score ${avgScore} · Based on your real invoice history`}
      />
      <div style={S.grid(4)}>
        <StatCard label="Tracked Brokers"  value={brokers.length}      change="From your loads"       color="var(--accent)"  changeType="neutral"/>
        <StatCard label="Fast Pay"          value={fastPay}             change="Score 85+"             color="var(--success)" changeType="neutral"/>
        <StatCard label="Needs Monitoring"  value={slowPayers}          change="Score below 65"        color={slowPayers>0?'var(--danger)':'var(--success)'} changeType={slowPayers>0?'down':'neutral'}/>
        <StatCard label="Avg Risk Score"    value={avgScore}            change="Higher = safer"        color="var(--accent2)" changeType="neutral"/>
      </div>
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Briefcase} /> Broker Risk Scores — Your Network</div>
          <span style={S.badge('var(--accent2)')}>Computed from invoice history</span>
        </div>
        <div>
          {brokers.map(b => (
            <div key={b.name} style={{ ...S.row }}
              onMouseOver={e => e.currentTarget.style.background='var(--surface2)'}
              onMouseOut={e => e.currentTarget.style.background='transparent'}>
              <div style={{ width:48, height:48, borderRadius:'50%', background:b.color+'15', border:'2px solid '+b.color+'30', display:'flex', alignItems:'center', justifyContent:'center', fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:b.color, flexShrink:0 }}>
                {b.score}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                  <span style={{ fontSize:13, fontWeight:700 }}>{b.name}</span>
                  <span style={{ ...S.tag(b.color), fontSize:9 }}>{b.tag}</span>
                  {b.recommended && <span style={{ ...S.tag('var(--success)'), fontSize:9 }}>PREFERRED</span>}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>
                  {b.loads} load{b.loads!==1?'s':''} · ${b.totalGross.toLocaleString()} gross · Avg RPM ${b.avgRpm}
                  {' · '}Pay: <b style={{color:b.color}}>{b.paySpeed}</b>
                  {b.paid > 0 && <span style={{color:'var(--success)'}}> · {b.paid} paid</span>}
                  {b.unpaid > 0 && <span style={{color:'var(--warning)'}}> · {b.unpaid} unpaid</span>}
                </div>
              </div>
              <button className="btn btn-ghost" style={{ fontSize:11 }}
                onClick={() => showToast('', b.name, `Score ${b.score} · ${b.loads} loads · ${b.paid} paid / ${b.unpaid} unpaid invoices`)}>
                Details
              </button>
            </div>
          ))}
          {brokers.length === 0 && (
            <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No loads booked yet — broker scores will appear once you start running loads.</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── ELD / HOS ────────────────────────────────────────────────────────────────
// CarrierELD now redirects to unified compliance center
export function CarrierELD() { return <AIComplianceCenter defaultTab="eld" /> }

// ─── IFTA ─────────────────────────────────────────────────────────────────────
// 2026 IFTA fuel tax rates by state (cents per gallon → dollars)
const ALL_IFTA_RATES = {
  Alabama:0.290, Alaska:0.089, Arizona:0.260, Arkansas:0.285, California:0.680,
  Colorado:0.220, Connecticut:0.250, Delaware:0.220, Florida:0.350, Georgia:0.330,
  Idaho:0.320, Illinois:0.392, Indiana:0.330, Iowa:0.305, Kansas:0.260,
  Kentucky:0.286, Louisiana:0.200, Maine:0.312, Maryland:0.361, Massachusetts:0.240,
  Michigan:0.302, Minnesota:0.285, Mississippi:0.180, Missouri:0.195, Montana:0.325,
  Nebraska:0.286, Nevada:0.230, 'New Hampshire':0.222, 'New Jersey':0.104, 'New Mexico':0.185,
  'New York':0.259, 'North Carolina':0.384, 'North Dakota':0.230, Ohio:0.385, Oklahoma:0.200,
  Oregon:0.380, Pennsylvania:0.576, 'Rhode Island':0.350, 'South Carolina':0.280, 'South Dakota':0.300,
  Tennessee:0.274, Texas:0.200, Utah:0.315, Vermont:0.312, Virginia:0.262,
  Washington:0.494, 'West Virginia':0.357, Wisconsin:0.329, Wyoming:0.240, 'District of Columbia':0.235
}

// Map two-letter state codes to full names
const STATE_CODES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',
  DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',
  MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',
  NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',
  TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'
}

// Extract state from location string like "Atlanta, GA" or "Chicago, Illinois"
function extractState(location) {
  if (!location) return null
  const parts = location.split(',').map(s => s.trim())
  const last = parts[parts.length - 1]
  // Check if it's a 2-letter code
  if (last.length === 2 && STATE_CODES[last.toUpperCase()]) return STATE_CODES[last.toUpperCase()]
  // Check if it's a full state name
  if (ALL_IFTA_RATES[last]) return last
  return null
}

// Estimate mileage distribution across states for a route
// Simple approach: split miles between origin and destination states
// (In production, this would use actual route data from Google Maps API)
function estimateStateMiles(origin, destination, totalMiles) {
  const originState = extractState(origin)
  const destState = extractState(destination)
  if (!originState && !destState) return {}
  if (originState === destState) return { [originState]: totalMiles }
  if (!originState) return { [destState]: totalMiles }
  if (!destState) return { [originState]: totalMiles }
  // Split roughly: 40% origin, 40% destination, 20% transit (simplified)
  return { [originState]: Math.round(totalMiles * 0.4), [destState]: Math.round(totalMiles * 0.4) }
}

export function CarrierIFTA() {
  const { showToast } = useApp()
  const ctx = useCarrier ? useCarrier() : {}
  const loads = ctx?.loads || []
  const company = ctx?.company || {}
  const [iftaTab, setIftaTab] = useState('report')
  const [avgMpg, setAvgMpg] = useState('6.9')
  const [manualOverrides, setManualOverrides] = useState({})
  const [showReturn, setShowReturn] = useState(false)

  // Dynamic quarter calculation
  const now = new Date()
  const currentQ = Math.floor(now.getMonth() / 3) + 1
  const currentYear = now.getFullYear()
  const quarterLabel = `Q${currentQ} ${currentYear}`
  const qStart = new Date(currentYear, (currentQ - 1) * 3, 1)
  const qEnd = new Date(currentYear, currentQ * 3, 0)
  const dueDate = new Date(currentYear, currentQ * 3, 30)
  const dueDateStr = dueDate.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
  const companyName = company.name || 'Your Company'
  const mcNumber = company.mc_number || company.mc || ''

  // Auto-calculate state mileage from loads
  const autoMilesByState = useMemo(() => {
    const acc = {}

    loads.forEach(load => {
      // Only count delivered/invoiced loads in current quarter
      const loadDate = new Date(load.pickup_date || load.pickupDate || load.created_at)
      if (loadDate < qStart || loadDate > qEnd) return
      if (!['Delivered', 'Invoiced', 'In Transit', 'Loaded'].includes(load.status)) return

      const miles = Number(load.miles) || 0
      if (miles === 0) return

      const origin = load.origin || ''
      const dest = load.destination || load.dest || ''
      const stateMiles = estimateStateMiles(origin, dest, miles)

      Object.entries(stateMiles).forEach(([state, m]) => {
        acc[state] = (acc[state] || 0) + m
      })
    })
    return acc
  }, [loads])

  // Merge auto-calculated with manual overrides
  const allStatesWithMiles = useMemo(() => {
    const merged = { ...autoMilesByState }
    Object.entries(manualOverrides).forEach(([state, val]) => {
      if (val !== '' && val !== undefined) merged[state] = parseFloat(val) || 0
    })
    return merged
  }, [autoMilesByState, manualOverrides])

  const stateData = Object.entries(allStatesWithMiles)
    .filter(([, miles]) => miles > 0)
    .map(([state, miles]) => {
      const rate = ALL_IFTA_RATES[state] || 0.25
      const gal = Math.round(miles / parseFloat(avgMpg || 6.9))
      const tax = parseFloat((gal * rate).toFixed(2))
      const isAutoCalc = !(state in manualOverrides) && state in autoMilesByState
      return { state, miles, gal, rate, tax, status: 'Pending', isAutoCalc }
    })
    .sort((a, b) => b.miles - a.miles)

  const totalMiles = stateData.reduce((s, r) => s + r.miles, 0)
  const totalTax = stateData.reduce((s, r) => s + r.tax, 0)
  const refund = stateData.filter(r => r.tax < 0).reduce((s, r) => s + Math.abs(r.tax), 0)
  const owed = stateData.filter(r => r.tax > 0).reduce((s, r) => s + r.tax, 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Sub-nav */}
      <div style={{ flexShrink:0, display:'flex', gap:2, padding:'0 20px', background:'var(--surface)', borderBottom:'1px solid var(--border)', flexWrap:'wrap' }}>
        {[{ id:'report', label:`${quarterLabel} Report` }, { id:'entry', label:'Enter Mileage' }, { id:'history', label:'Filing History' }].map(t => (
          <button key={t.id} onClick={() => setIftaTab(t.id)}
            style={{ padding:'10px 16px', border:'none', borderBottom: iftaTab===t.id ? '2px solid var(--accent)' : '2px solid transparent', background:'transparent', color: iftaTab===t.id ? 'var(--accent)' : 'var(--muted)', fontSize:12, fontWeight: iftaTab===t.id ? 700 : 500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:-1 }}>
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:20, paddingBottom:60, display:'flex', flexDirection:'column', gap:16 }}>
        <AiBanner title={`AI Auto-Calculated: ${Object.keys(autoMilesByState).length} states detected from ${loads.filter(l => ['Delivered','Invoiced','In Transit','Loaded'].includes(l.status)).length} loads this quarter`} sub={totalMiles > 0 ? `${totalMiles.toLocaleString()} total miles tracked · Avg ${avgMpg} MPG · Est. tax $${totalTax.toFixed(2)} · You can override any state manually` : 'No delivered loads this quarter yet — enter mileage manually or deliver loads to auto-calculate'} />

        {/* Report tab */}
        {iftaTab === 'report' && (
          <>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12 }}>
              {[
                { label:'Total Miles',     value: totalMiles.toLocaleString(), color:'var(--accent)' },
                { label:'Total Tax Owed',  value: '$' + owed.toFixed(2),       color:'var(--warning)' },
                { label:'Credit / Refund', value: '$' + refund.toFixed(2),     color:'var(--success)' },
                { label:'Net Balance',     value: (owed - refund) > 0 ? '-$' + (owed - refund).toFixed(2) : '+$' + (refund - owed).toFixed(2), color: (owed - refund) > 0 ? 'var(--danger)' : 'var(--success)' },
              ].map(s => (
                <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'13px 16px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color:s.color }}>{s.value}</div>
                </div>
              ))}
            </div>

            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                <div style={{ fontWeight:700, fontSize:13 }}><Ic icon={BarChart2} /> IFTA by State · {quarterLabel}</div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setIftaTab('entry')}><Ic icon={PencilIcon} /> Edit Mileage</button>
                  <button className="btn btn-primary" style={{ fontSize:11 }} onClick={() => { setShowReturn(true); showToast('','IFTA Return','Quarterly return generated — ready to file') }}><Ic icon={Upload} /> Generate Return</button>
                </div>
              </div>
              <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
                <thead><tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
                  {['State','Miles','Gallons Used','Tax Rate','Tax / Credit','Status'].map(h => (
                    <th key={h} style={{ padding:'9px 16px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1, whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {stateData.length === 0 && (
                    <tr><td colSpan={6} style={{ padding:30, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No state mileage data yet. Deliver loads or enter mileage manually.</td></tr>
                  )}
                  {stateData.map(r => (
                    <tr key={r.state} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'11px 16px', fontWeight:700, whiteSpace:'nowrap' }}>{r.state} {r.isAutoCalc && <span style={{ fontSize:8, color:'var(--success)', fontWeight:700, marginLeft:4, verticalAlign:'super' }}>AUTO</span>}</td>
                      <td style={{ padding:'11px 16px', color:'var(--muted)', fontFamily:'monospace' }}>{r.miles.toLocaleString()}</td>
                      <td style={{ padding:'11px 16px', color:'var(--muted)', fontFamily:'monospace' }}>{r.gal.toLocaleString()}</td>
                      <td style={{ padding:'11px 16px', color:'var(--muted)' }}>${r.rate.toFixed(3)}</td>
                      <td style={{ padding:'11px 16px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color: r.tax < 0 ? 'var(--success)' : 'var(--text)', whiteSpace:'nowrap' }}>
                        {r.tax < 0 ? 'Credit $' + Math.abs(r.tax).toFixed(2) : '$' + r.tax.toFixed(2)}
                      </td>
                      <td style={{ padding:'11px 16px' }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:(r.status==='Filed'?'var(--success)':r.tax<0?'var(--accent2)':'var(--warning)')+'15', color: r.status==='Filed'?'var(--success)':r.tax<0?'var(--accent2)':'var(--warning)' }}>
                          {r.tax < 0 ? 'Credit' : r.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </div>

            {showReturn && (
              <div style={{ background:'linear-gradient(135deg,rgba(34,197,94,0.06),rgba(0,212,170,0.04))', border:'1px solid rgba(34,197,94,0.2)', borderRadius:12, padding:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14, flexWrap:'wrap', gap:10 }}>
                  <div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, letterSpacing:1, color:'var(--success)', marginBottom:2 }}><Ic icon={Check} /> {quarterLabel} RETURN READY</div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>Due date: {dueDateStr}{companyName !== 'Your Company' ? ` · ${companyName}` : ''}{mcNumber ? ` · ${mcNumber}` : ''}</div>
                  </div>
                  <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                    <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => {
                      const pdfData = stateData.map(r => ({ state: r.state, miles: r.miles, gallons: r.gal, rate: r.rate, taxDue: r.tax > 0 ? r.tax : 0, net: -r.tax }))
                      const totalFuel = stateData.reduce((s,r) => s + r.gal, 0)
                      generateIFTAPDF(quarterLabel, pdfData, totalMiles, totalFuel, owed - refund)
                      showToast('','PDF Downloaded',`IFTA-${quarterLabel.replace(' ','-')}-Qivori.pdf`)
                    }}><Ic icon={Download} /> Download PDF</button>
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(140px,1fr))', gap:12 }}>
                  {[
                    { label:'Total Miles Reported', value: totalMiles.toLocaleString() },
                    { label:'Net Tax Due',           value: (owed - refund) > 0 ? '$' + (owed - refund).toFixed(2) : 'REFUND' },
                    { label:'Refund Amount',         value: '$' + refund.toFixed(2) },
                    { label:'States Reported',       value: stateData.length },
                  ].map(s => (
                    <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', textAlign:'center' }}>
                      <div style={{ fontSize:10, color:'var(--muted)', marginBottom:3 }}>{s.label}</div>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:'var(--success)' }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Entry tab */}
        {iftaTab === 'entry' && (
          <>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
              <div style={{ fontWeight:700, fontSize:13, marginBottom:6 }}><Ic icon={PencilIcon} /> State Mileage · {quarterLabel}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:14 }}>Auto-calculated from your loads. Override any state manually if needed.</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:10, marginBottom:16 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Fleet Avg MPG</label>
                  <input type="number" value={avgMpg} onChange={e => setAvgMpg(e.target.value)} min="4" max="12" step="0.1"
                    style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }} />
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(200px,1fr))', gap:10 }}>
                {/* Show states with auto-calculated miles first, then allow adding new states */}
                {[...new Set([...Object.keys(autoMilesByState), ...Object.keys(manualOverrides)])].sort().map(state => {
                  const autoVal = autoMilesByState[state] || 0
                  const hasOverride = state in manualOverrides && manualOverrides[state] !== ''
                  const rate = ALL_IFTA_RATES[state] || 0
                  return (
                    <div key={state}>
                      <label style={{ fontSize:11, color:'var(--muted)', display:'flex', alignItems:'center', gap:4, marginBottom:4 }}>
                        {state} <span style={{ fontWeight:400 }}>· ${rate.toFixed(3)}/gal</span>
                        {autoVal > 0 && !hasOverride && <span style={{ fontSize:9, color:'var(--success)', fontWeight:700 }}>AUTO</span>}
                        {hasOverride && <span style={{ fontSize:9, color:'var(--accent)', fontWeight:700 }}>MANUAL</span>}
                      </label>
                      <input type="number" value={hasOverride ? manualOverrides[state] : autoVal || ''}
                        onChange={e => setManualOverrides(m => ({ ...m, [state]: e.target.value }))}
                        placeholder={autoVal > 0 ? `Auto: ${autoVal.toLocaleString()}` : '0'}
                        style={{ width:'100%', background: hasOverride ? 'rgba(240,165,0,0.06)' : 'var(--surface2)', border:'1px solid ' + (hasOverride ? 'rgba(240,165,0,0.3)' : 'var(--border)'), borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }} />
                    </div>
                  )
                })}
              </div>
              <div style={{ display:'flex', gap:10, marginTop:16 }}>
                <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }} onClick={() => { setIftaTab('report'); showToast('','Calculated','IFTA report updated with latest data') }}><Ic icon={Check} /> View Report</button>
                <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => { setManualOverrides({}); showToast('','Reset','Using auto-calculated mileage from loads') }}>Reset to Auto</button>
              </div>
            </div>
          </>
        )}

        {/* History tab */}
        {iftaTab === 'history' && (
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={FileText} /> Filing History</div>
            <div style={{ padding:40, textAlign:'center' }}>
              <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                <Ic icon={FileText} size={26} color="var(--accent)" />
              </div>
              <div style={{ fontWeight:700, fontSize:15, marginBottom:6 }}>No filings yet</div>
              <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6, maxWidth:340, margin:'0 auto' }}>
                Once you generate and file your {quarterLabel} IFTA return, it will appear here. Past filings will be saved for your records.
              </div>
              <button className="btn btn-primary" style={{ marginTop:16, fontSize:12 }} onClick={() => setIftaTab('report')}>
                <Ic icon={BarChart2} /> Go to {quarterLabel} Report
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── AI COMPLIANCE CENTER ─────────────────────────────────────────────────────
const DVIR_ITEMS_DEFAULT = [
  {item:'Brakes',        status:'Pass'}, {item:'Tires',          status:'Pass'},
  {item:'Lights',        status:'Pass'}, {item:'Steering',       status:'Pass'},
  {item:'Horn',          status:'Pass'}, {item:'Wipers',         status:'Pass'},
  {item:'Mirrors',       status:'Pass'}, {item:'Fuel System',    status:'Pass'},
  {item:'Coupling Dev',  status:'Pass'}, {item:'Emergency Equip',status:'Pass'},
  {item:'Fire Ext.',     status:'Pass'}, {item:'Seat Belts',     status:'Pass'},
]

const COMPLIANCE_DRIVERS = []

const BASIC_SCORES = [
  { basic:'Unsafe Driving',       score:12, threshold:65, icon: Truck,         tip:'Speeding, reckless driving · 4pt improvement this quarter' },
  { basic:'HOS Compliance',       score:8,  threshold:65, icon: Clock,         tip:'Log falsification, ELD violations · 0 issues this year' },
  { basic:'Vehicle Maintenance',  score:22, threshold:80, icon: Wrench,        tip:'OOS violations, equipment defects · 1 resolved defect' },
  { basic:'Driver Fitness',       score:0,  threshold:80, icon: User,          tip:'Unlicensed driver, CDL violations · All CDLs current' },
  { basic:'Controlled Substances',score:0,  threshold:50, icon: FlaskConical,  tip:'Positive drug/alcohol tests · All clearinghouse checks passed' },
  { basic:'Crash Indicator',      score:5,  threshold:65, icon: AlertTriangle, tip:'DOT-reportable crashes · Zero crashes all time' },
  { basic:'Hazmat Compliance',    score:0,  threshold:50, icon: Shield,        tip:'Hazmat violations · N/A — non-hazmat carrier' },
]

function ComplianceScoreRing({ score, size = 160 }) {
  const r = (size - 16) / 2, c = 2 * Math.PI * r, offset = c * (1 - score / 100)
  const color = score >= 90 ? '#22c55e' : score >= 70 ? '#f0a500' : '#ef4444'
  return (
    <svg width={size} height={size} style={{ display:'block' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--border)" strokeWidth={10} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={10}
        strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} style={{ transition:'stroke-dashoffset 1s ease' }} />
      <text x={size/2} y={size/2 - 8} textAnchor="middle" fill={color} fontFamily="'Bebas Neue',sans-serif" fontSize={size*0.3} letterSpacing={2}>{score}</text>
      <text x={size/2} y={size/2 + 14} textAnchor="middle" fill="var(--muted)" fontSize={10} fontFamily="'DM Sans',sans-serif">AI SCORE</text>
    </svg>
  )
}

function MiniGauge({ label, value, max, color, unit = '' }) {
  const pct = Math.min((value / max) * 100, 100)
  return (
    <div style={{ textAlign:'center' }}>
      <div style={{ fontSize:10, color:'var(--muted)', marginBottom:6, fontWeight:600, letterSpacing:0.5 }}>{label}</div>
      <div style={{ width:56, height:56, margin:'0 auto 6px', position:'relative' }}>
        <svg width={56} height={56}>
          <circle cx={28} cy={28} r={22} fill="none" stroke="var(--border)" strokeWidth={5} />
          <circle cx={28} cy={28} r={22} fill="none" stroke={color} strokeWidth={5}
            strokeDasharray={`${2*Math.PI*22}`} strokeDashoffset={`${2*Math.PI*22*(1-pct/100)}`}
            strokeLinecap="round" transform="rotate(-90 28 28)" style={{ transition:'stroke-dashoffset 0.8s ease' }} />
        </svg>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:15, color }}>{value}{unit}</span>
        </div>
      </div>
    </div>
  )
}

function AIComplianceCenter({ defaultTab = 'overview' }) {
  const { showToast } = useApp()
  const [compTab, setCompTab] = useState(defaultTab)
  const [items, setItems] = useState(DVIR_ITEMS_DEFAULT)
  const [selectedUnit, setSelectedUnit] = useState('Unit 01')
  const defects = items.filter(i => i.status === 'Defect').length

  // Clearinghouse state
  const [chDriver, setChDriver] = useState('')
  const [chType, setChType] = useState('Pre-Employment')
  const [chConsent, setChConsent] = useState(false)
  const [chOrders, setChOrders] = useState([
    { id:'CH-001', driver:'James Tucker', cdl:'MN-223344', type:'Annual',         date:'Jan 15, 2026', status:'Complete', result:'Clear', cost:1.25 },
    { id:'CH-002', driver:'Marcus Lee',   cdl:'IL-445566', type:'Pre-Employment', date:'Nov 02, 2025', status:'Complete', result:'Clear', cost:1.25 },
    { id:'CH-003', driver:'Priya Patel',  cdl:'CO-667788', type:'Pre-Employment', date:'Oct 18, 2025', status:'Complete', result:'Clear', cost:1.25 },
  ])

  const submitCH = () => {
    if (!chDriver) { showToast('','Select Driver','Choose a driver to query'); return }
    if (!chConsent) { showToast('','Consent Required','Driver must provide electronic consent'); return }
    const d = COMPLIANCE_DRIVERS.find(x => x.name === chDriver)
    const newOrder = { id:'CH-00'+(chOrders.length+1), driver:chDriver, cdl:d?.cdl||'', type:chType, date:'Mar 11, 2026', status:'Processing', result:'Pending', cost:1.25 }
    setChOrders(o => [newOrder, ...o])
    showToast('','Query Submitted',`${chDriver} · ${chType} · Processing`)
    setChDriver(''); setChConsent(false)
    setTimeout(() => setChOrders(o => o.map(x => x.id === newOrder.id ? {...x, status:'Complete', result:'Clear'} : x)), 3000)
  }

  // AI Compliance Score computation
  const complianceScore = useMemo(() => {
    const avgBasicPct = BASIC_SCORES.reduce((s, b) => s + (b.score / b.threshold), 0) / BASIC_SCORES.length
    const hosScore = 25 // 25/25 — no violations
    const dvirScore = defects === 0 ? 25 : Math.max(0, 25 - defects * 5)
    const csaScore = Math.round((1 - avgBasicPct) * 25)
    const clearScore = chOrders.every(o => o.result === 'Clear' || o.result === 'Pending') ? 25 : 15
    return Math.min(100, hosScore + dvirScore + csaScore + clearScore)
  }, [defects, chOrders])

  const COMP_TABS = [
    { id:'overview', label:'Overview',       icon: Brain },
    { id:'eld',      label:'ELD / HOS',      icon: Activity },
    { id:'dvir',     label:'DVIR',            icon: FileCheck },
    { id:'csa',      label:'CSA Scores',      icon: Shield },
    { id:'clearinghouse', label:'Clearinghouse', icon: Search },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      {/* Tab bar */}
      <div style={{ flexShrink:0, display:'flex', gap:0, padding:'0 16px', background:'var(--surface)', borderBottom:'1px solid var(--border)', alignItems:'center', overflowX:'auto' }}>
        {COMP_TABS.map(t => (
          <button key={t.id} onClick={() => setCompTab(t.id)}
            style={{ padding:'12px 14px', border:'none', borderBottom: compTab===t.id ? '2px solid var(--accent)' : '2px solid transparent', background:'transparent', color: compTab===t.id ? 'var(--text)' : 'var(--muted)', fontSize:12, fontWeight: compTab===t.id ? 700 : 500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:-1, display:'flex', gap:6, alignItems:'center', whiteSpace:'nowrap', transition:'color 0.15s' }}>
            <t.icon size={13} /> {t.label}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <div style={{ fontSize:11, color:'var(--muted)', display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap', padding:'0 8px' }}>
          <CheckCircle size={13} color="var(--success)" /> All compliant
        </div>
      </div>

      <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:20, paddingBottom:60, display:'flex', flexDirection:'column', gap:16 }}>

        {/* ── OVERVIEW ── */}
        {compTab === 'overview' && (
          <>
            {/* Hero: AI Score + Insights side by side */}
            <div style={{ display:'grid', gridTemplateColumns:'minmax(180px,220px) 1fr', gap:16 }}>
              {/* Score ring */}
              <div style={{ background:'linear-gradient(160deg, var(--surface) 0%, rgba(240,165,0,0.03) 100%)', border:'1px solid var(--border)', borderRadius:16, padding:'28px 20px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:10 }}>
                <ComplianceScoreRing score={complianceScore} size={130} />
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:13, letterSpacing:2, color:'var(--muted)' }}>AI COMPLIANCE</div>
                <div style={{ fontSize:11, color: complianceScore >= 90 ? 'var(--success)' : 'var(--warning)', fontWeight:700, background: (complianceScore >= 90 ? 'var(--success)' : 'var(--warning)') + '15', padding:'4px 14px', borderRadius:20 }}>
                  {complianceScore >= 95 ? 'Excellent' : complianceScore >= 85 ? 'Good' : complianceScore >= 70 ? 'Needs Attention' : 'Critical'}
                </div>
                {/* Mini gauges row */}
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, width:'100%', marginTop:4 }}>
                  <MiniGauge label="HOS" value={0} max={5} color="var(--success)" unit="" />
                  <MiniGauge label="CSA" value={Math.round(BASIC_SCORES.reduce((s,b) => s + b.score, 0) / BASIC_SCORES.length)} max={65} color="var(--success)" unit="%" />
                  <MiniGauge label="DVIR" value={defects === 0 ? 100 : Math.max(0, 100 - defects * 10)} max={100} color={defects === 0 ? 'var(--success)' : 'var(--danger)'} unit="%" />
                  <MiniGauge label="Drug" value={100} max={100} color="var(--success)" unit="%" />
                </div>
              </div>

              {/* Right column: status cards + AI insights */}
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {/* Status row */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
                  {[
                    { label:'ELD Devices',    value:'3/3',   sub:'All synced',      color:'var(--success)' },
                    { label:'HOS Violations',  value:'0',     sub:'Clean 30 days',   color:'var(--success)' },
                    { label:'CSA Rating',      value:'Satisfactory', sub:'FMCSA Status', color:'var(--success)' },
                  ].map(s => (
                    <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
                      <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4, fontWeight:600 }}>{s.label}</div>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: s.value.length > 5 ? 15 : 22, color:s.color, letterSpacing:1 }}>{s.value}</div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{s.sub}</div>
                    </div>
                  ))}
                </div>

                {/* AI Insights */}
                <div style={{ background:'linear-gradient(135deg, rgba(240,165,0,0.04), rgba(77,142,240,0.04))', border:'1px solid rgba(240,165,0,0.15)', borderRadius:12, padding:'16px 18px', flex:1, minHeight:0 }}>
                  <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
                    <Bot size={15} color="var(--accent)" />
                    <span style={{ fontSize:11, fontWeight:700, color:'var(--accent)', letterSpacing:1 }}>AI COMPLIANCE INSIGHTS</span>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {[
                      { text:'All 3 drivers HOS compliant — 0 violations in 30 days', color:'var(--success)', icon: CheckCircle },
                      { text:'Vehicle Maintenance BASIC at 22% — monitor brake inspections on Unit 03', color:'var(--warning)', icon: AlertTriangle },
                      { text:'Priya Patel clearinghouse annual query due Apr 2026 — schedule now', color:'var(--accent2)', icon: Calendar },
                      { text:'CSA trending down 4pts this quarter — on track for premium freight rates', color:'var(--success)', icon: TrendingDown },
                    ].map((r, i) => (
                      <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', fontSize:12, color:'var(--muted)' }}>
                        <r.icon size={14} color={r.color} style={{ marginTop:1, flexShrink:0 }} />
                        <span>{r.text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Driver Compliance Matrix */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Users} /> Driver Compliance Matrix</div>
                <span style={{ fontSize:11, color:'var(--success)', fontWeight:700 }}><Ic icon={CheckCircle} /> All Clear</span>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
                  <thead><tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
                    {['Driver','Unit','CDL','ELD','HOS','DVIR','CSA','Clearinghouse','Med Card'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {[
                      { name:'James Tucker', unit:'Unit 01', cdl:'MN-223344', eld:'Synced', hos:'8h 22m', dvir:'Clear', csa:'12%', ch:'Clear', med:'Sep 2025', medWarn:true },
                      { name:'Marcus Lee',   unit:'Unit 02', cdl:'IL-445566', eld:'Synced', hos:'11h 0m', dvir:'Clear', csa:'8%',  ch:'Clear', med:'Nov 2025', medWarn:false },
                      { name:'Priya Patel',  unit:'Unit 03', cdl:'CO-667788', eld:'Synced', hos:'Restart', dvir:'Clear', csa:'0%',  ch:'Clear', med:'Oct 2026', medWarn:false },
                    ].map(d => (
                      <tr key={d.name} style={{ borderBottom:'1px solid var(--border)' }}>
                        <td style={{ padding:'11px 12px', fontSize:13, fontWeight:700, whiteSpace:'nowrap' }}>{d.name}</td>
                        <td style={{ padding:'11px 12px', fontSize:12, color:'var(--muted)' }}>{d.unit}</td>
                        <td style={{ padding:'11px 12px', fontSize:11, fontFamily:'monospace', color:'var(--muted)' }}>{d.cdl}</td>
                        <td style={{ padding:'11px 12px' }}><span style={S.tag('var(--success)')}>{d.eld}</span></td>
                        <td style={{ padding:'11px 12px', fontFamily:"'Bebas Neue',sans-serif", fontSize:15, color: d.hos === 'Restart' ? 'var(--muted)' : parseFloat(d.hos) > 8 ? 'var(--success)' : 'var(--warning)' }}>{d.hos}</td>
                        <td style={{ padding:'11px 12px' }}><span style={S.tag('var(--success)')}>{d.dvir}</span></td>
                        <td style={{ padding:'11px 12px', fontFamily:"'Bebas Neue',sans-serif", fontSize:15, color:'var(--success)' }}>{d.csa}</td>
                        <td style={{ padding:'11px 12px' }}><span style={S.tag('var(--success)')}>{d.ch}</span></td>
                        <td style={{ padding:'11px 12px' }}>
                          <span style={S.tag(d.medWarn ? 'var(--warning)' : 'var(--success)')}>{d.med}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Upcoming Deadlines */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Calendar} /> Upcoming Deadlines</div>
              </div>
              <div style={{ padding:14, display:'flex', flexDirection:'column', gap:6 }}>
                {[
                  { date:'Mar 15, 2026', item:'Unit 01 DVIR due', type:'DVIR',    color:'var(--accent)',  days:4 },
                  { date:'Apr 2026',     item:'Priya Patel — clearinghouse annual', type:'Query', color:'var(--accent2)', days:21 },
                  { date:'Apr 30, 2026', item:'IFTA Q1 2026 filing deadline', type:'IFTA',    color:'var(--warning)', days:50 },
                  { date:'Aug 2026',     item:'James Tucker CDL renewal',    type:'CDL',     color:'var(--accent)',  days:142 },
                  { date:'Sep 2025',     item:'James Tucker med card expired', type:'URGENT', color:'var(--danger)',  days:-163 },
                ].map((d, i) => (
                  <div key={i} style={{ display:'flex', gap:10, alignItems:'center', padding:'10px 14px', background: d.days < 0 ? 'rgba(239,68,68,0.05)' : 'var(--surface2)', borderRadius:10, border:`1px solid ${d.days < 0 ? 'rgba(239,68,68,0.2)' : 'var(--border)'}` }}>
                    <span style={S.tag(d.color)}>{d.type}</span>
                    <span style={{ fontSize:12, fontWeight:600, flex:1, minWidth:0 }}>{d.item}</span>
                    <span style={{ fontSize:11, color:'var(--muted)', whiteSpace:'nowrap' }}>{d.date}</span>
                    <span style={{ fontSize:11, fontWeight:700, color: d.days < 0 ? 'var(--danger)' : d.days < 14 ? 'var(--warning)' : 'var(--muted)', whiteSpace:'nowrap', minWidth:50, textAlign:'right' }}>
                      {d.days < 0 ? 'OVERDUE' : d.days + 'd'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        {/* ── ELD / HOS ── */}
        {compTab === 'eld' && (
          <>
            <div style={{ background:'linear-gradient(135deg,rgba(34,197,94,0.05),rgba(77,142,240,0.03))', border:'1px solid rgba(34,197,94,0.15)', borderRadius:12, padding:'14px 18px', display:'flex', gap:14, alignItems:'center' }}>
              <Bot size={20} color="var(--success)" />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--success)', marginBottom:2 }}>All 3 drivers HOS compliant — 0 violations in 30 days</div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>James Tucker 8h 22m remaining · Marcus Lee resets midnight · Priya 34hr restart</div>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10 }}>
              {[
                { label:'Units Online',   value:'3/3',     sub:'All synced',       color:'var(--success)' },
                { label:'HOS Violations',  value:'0',       sub:'Clean 30 days',    color:'var(--success)' },
                { label:'Avg HOS Left',    value:'9h 47m',  sub:'Across fleet',     color:'var(--accent2)' },
                { label:'ELD Provider',    value:'Samsara', sub:'CM32 · Connected', color:'var(--accent)' },
              ].map(s => (
                <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4, fontWeight:600 }}>{s.label}</div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:s.color, letterSpacing:1 }}>{s.value}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Activity} /> Driver HOS Status — Live</div>
                <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast('','ELD Sync','All devices synced')}><Ic icon={RefreshCw} /> Sync All</button>
              </div>
              {[
                { driver:'James Tucker', unit:'Unit 01', status:'Driving',  hosLeft:'8h 22m', driveToday:'5h 38m', shiftLeft:'9h 22m', cycleLeft:'52h', statusColor:'var(--success)', load:'FM-4421', rec:'1 more short load today' },
                { driver:'Marcus Lee',   unit:'Unit 02', status:'On Duty',  hosLeft:'9h 45m', driveToday:'4h 15m', shiftLeft:'10h 45m',cycleLeft:'58h', statusColor:'var(--accent)',  load:'—', rec:'Full day available — 2 loads possible' },
                { driver:'Priya Patel',  unit:'Unit 03', status:'Off Duty', hosLeft:'11h 0m', driveToday:'0h',     shiftLeft:'14h',    cycleLeft:'70h', statusColor:'var(--muted)',   load:'—', rec:'34hr restart — available tomorrow 6AM', restart:true },
              ].map(d => (
                <div key={d.driver} style={{ padding:'16px 18px', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10, flexWrap:'wrap' }}>
                    <div style={{ width:38, height:38, borderRadius:'50%', background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, color:'var(--accent)', flexShrink:0 }}>
                      {d.driver.split(' ').map(n=>n[0]).join('')}
                    </div>
                    <div style={{ flex:1, minWidth:120 }}>
                      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:2, flexWrap:'wrap' }}>
                        <span style={{ fontSize:13, fontWeight:700 }}>{d.driver}</span>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>{d.unit}</span>
                        <span style={S.tag(d.statusColor)}>{d.status}</span>
                        {d.load !== '—' && <span style={{ fontSize:11, color:'var(--accent)', fontFamily:'monospace' }}>Load: {d.load}</span>}
                      </div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>Samsara CM32 · Drive today: {d.driveToday}</div>
                    </div>
                    <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast('','Full Log', d.driver + ' HOS log opened')}>Full Log</button>
                  </div>
                  {/* HOS bar + shift/cycle */}
                  <div style={{ display:'flex', gap:16, alignItems:'center', flexWrap:'wrap' }}>
                    <div style={{ flex:1, minWidth:200 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>Drive Time Remaining</span>
                        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color: parseFloat(d.hosLeft) > 8 ? 'var(--success)' : parseFloat(d.hosLeft) > 4 ? 'var(--warning)' : d.restart ? 'var(--muted)' : 'var(--danger)' }}>{d.hosLeft}</span>
                      </div>
                      {!d.restart && (
                        <div style={{ height:8, background:'var(--border)', borderRadius:4 }}>
                          <div style={{ height:'100%', width:`${(parseFloat(d.hosLeft)/11)*100}%`, background: parseFloat(d.hosLeft) > 8 ? 'var(--success)' : parseFloat(d.hosLeft) > 4 ? 'var(--warning)' : 'var(--danger)', borderRadius:4, transition:'width 0.5s' }} />
                        </div>
                      )}
                      {d.restart && <div style={{ fontSize:11, color:'var(--accent3)' }}><Ic icon={Clock} /> 34hr restart in progress</div>}
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      {[{ label:'Shift', value:d.shiftLeft }, { label:'Cycle', value:d.cycleLeft }].map(s => (
                        <div key={s.label} style={{ padding:'6px 12px', background:'var(--surface2)', borderRadius:8, textAlign:'center', minWidth:55 }}>
                          <div style={{ fontSize:9, color:'var(--muted)', marginBottom:2 }}>{s.label}</div>
                          <div style={{ fontSize:12, fontWeight:700, color:'var(--success)' }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* AI recommendation */}
                  <div style={{ marginTop:10, fontSize:12, color: d.restart ? 'var(--muted)' : 'var(--success)', background: (d.restart ? 'var(--muted)' : 'var(--success)') + '10', padding:'8px 12px', borderRadius:8 }}>
                    <Bot size={13} style={{ display:'inline', verticalAlign:'middle', marginRight:6 }} />
                    {d.rec}
                  </div>
                </div>
              ))}
            </div>

            {/* HOS Events */}
            <div style={S.panel}>
              <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Clock} /> Recent HOS Events</div></div>
              {[
                { date:'Mar 6',  driver:'Marcus Lee',   event:'34hr restart completed',   type:'Info',   color:'var(--accent2)' },
                { date:'Mar 4',  driver:'James Tucker',  event:'Pre-trip inspection done',  type:'DVIR',   color:'var(--success)' },
                { date:'Mar 2',  driver:'Priya Patel',   event:'Sleeper berth 8h split',   type:'HOS',    color:'var(--accent)' },
                { date:'Feb 28', driver:'James Tucker',  event:'ELD auto-synchronized',    type:'System', color:'var(--muted)' },
              ].map((e, i) => (
                <div key={i} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                  <span style={{ fontSize:11, color:'var(--muted)', minWidth:42 }}>{e.date}</span>
                  <span style={S.tag(e.color)}>{e.type}</span>
                  <span style={{ fontSize:12, fontWeight:600 }}>{e.driver}</span>
                  <span style={{ fontSize:12, color:'var(--muted)' }}>{e.event}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* ── DVIR ── */}
        {compTab === 'dvir' && (
          <>
            <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ fontSize:14, fontWeight:700, marginBottom:2 }}>Daily Vehicle Inspection Report</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>FMCSA §396.11 — Complete before each dispatch</div>
              </div>
              <select value={selectedUnit} onChange={e => setSelectedUnit(e.target.value)}
                style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif" }}>
                {['Unit 01','Unit 02','Unit 03'].map(u => <option key={u}>{u}</option>)}
              </select>
              <div style={{ fontSize:12, color:'var(--muted)' }}>{new Date().toLocaleDateString()}</div>
            </div>

            {defects > 0 && (
              <div style={{ padding:'12px 16px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:10, display:'flex', gap:10, alignItems:'center' }}>
                <Siren size={20} color="var(--danger)" />
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--danger)' }}>{defects} defect{defects !== 1 ? 's' : ''} found — DO NOT DISPATCH</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Vehicle must not be operated until repaired and re-inspected per FMCSA §396.11</div>
                </div>
              </div>
            )}

            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:16, display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
                {items.map((item, i) => (
                  <div key={item.item} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background: item.status==='Defect' ? 'rgba(239,68,68,0.05)' : 'var(--surface2)', border:`1px solid ${item.status==='Defect'?'rgba(239,68,68,0.2)':'var(--border)'}`, borderRadius:8, padding:'10px 14px' }}>
                    <span style={{ fontSize:13, fontWeight:600 }}>{item.item}</span>
                    <div style={{ display:'flex', gap:6 }}>
                      {['Pass','Defect'].map(s => (
                        <button key={s} onClick={() => setItems(it => it.map((x,j) => j===i ? {...x,status:s} : x))}
                          style={{ padding:'4px 12px', borderRadius:6, border:'none', cursor:'pointer', fontSize:11, fontWeight:700, fontFamily:"'DM Sans',sans-serif",
                            background: item.status===s ? (s==='Pass'?'rgba(34,197,94,0.2)':'rgba(239,68,68,0.2)') : 'var(--border)',
                            color: item.status===s ? (s==='Pass'?'var(--success)':'var(--danger)') : 'var(--muted)', transition:'all 0.15s' }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ padding:'0 16px 16px' }}>
                <button className="btn btn-primary" style={{ width:'100%', padding:'12px 0', fontSize:14 }}
                  onClick={() => showToast('','DVIR Submitted', defects===0 ? selectedUnit + ' cleared for dispatch · No defects' : defects + ' defect(s) noted · Maintenance required before dispatch')}>
                  <Check size={13} /> Submit DVIR — {selectedUnit}
                </button>
              </div>
            </div>

            <div style={S.panel}>
              <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={FileText} /> Recent DVIRs</div></div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth:500 }}>
                  <thead><tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
                    {['Date','Unit','Driver','Result',''].map(h => <th key={h} style={{ padding:'9px 14px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1, whiteSpace:'nowrap' }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {[
                      { date:'Mar 8, 2026',  unit:'Unit 01', driver:'James Tucker',  result:'No Defects', color:'var(--success)' },
                      { date:'Mar 8, 2026',  unit:'Unit 02', driver:'Marcus Lee',    result:'No Defects', color:'var(--success)' },
                      { date:'Mar 7, 2026',  unit:'Unit 03', driver:'Priya Patel',   result:'1 Defect — Resolved', color:'var(--warning)' },
                      { date:'Mar 7, 2026',  unit:'Unit 01', driver:'James Tucker',  result:'No Defects', color:'var(--success)' },
                    ].map((r,i) => (
                      <tr key={i} style={{ borderBottom:'1px solid var(--border)' }}>
                        <td style={{ padding:'10px 14px', fontSize:12, color:'var(--muted)' }}>{r.date}</td>
                        <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700 }}>{r.unit}</td>
                        <td style={{ padding:'10px 14px', fontSize:12 }}>{r.driver}</td>
                        <td style={{ padding:'10px 14px' }}><span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:r.color+'15', color:r.color }}>{r.result}</span></td>
                        <td style={{ padding:'10px 14px' }}><button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast('','DVIR',r.date + ' · ' + r.unit)}>View</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── CSA SCORES ── */}
        {compTab === 'csa' && (
          <>
            <div style={{ background:'linear-gradient(135deg,rgba(34,197,94,0.05),rgba(77,142,240,0.03))', border:'1px solid rgba(34,197,94,0.15)', borderRadius:12, padding:'14px 18px', display:'flex', gap:14, alignItems:'center' }}>
              <Bot size={20} color="var(--success)" />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--success)', marginBottom:2 }}>All 7 BASIC scores below intervention threshold</div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>Unsafe Driving improved 4pts this quarter · Clean crash record qualifies for premium freight</div>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10 }}>
              {[
                { label:'Safety Rating',  value:'Satisfactory', color:'var(--success)', sub:'FMCSA Status' },
                { label:'Inspections',     value:'24',           color:'var(--accent)',  sub:'Last 24 months' },
                { label:'Violations',      value:'2',            color:'var(--warning)', sub:'Minor only' },
                { label:'Crashes',         value:'0',            color:'var(--success)', sub:'Clean record' },
              ].map(s => (
                <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4, fontWeight:600 }}>{s.label}</div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: s.value.length > 4 ? 15 : 22, color:s.color, letterSpacing:1 }}>{s.value}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Shield} /> BASIC Score Breakdown</div>
                <span style={{ fontSize:11, color:'var(--success)', fontWeight:700 }}>All Below Threshold</span>
              </div>
              <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
                {BASIC_SCORES.map(b => {
                  const pct = (b.score / b.threshold) * 100
                  const scoreColor = pct > 75 ? 'var(--danger)' : pct > 50 ? 'var(--warning)' : 'var(--success)'
                  return (
                    <div key={b.basic} style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 16px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8, flexWrap:'wrap', gap:8 }}>
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                          <b.icon size={16} color={scoreColor} />
                          <span style={{ fontSize:12, fontWeight:700 }}>{b.basic}</span>
                        </div>
                        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
                          <span style={{ fontSize:11, color:'var(--muted)' }}>Threshold: {b.threshold}%</span>
                          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:scoreColor }}>{b.score}%</span>
                        </div>
                      </div>
                      <div style={{ height:8, background:'var(--border)', borderRadius:4, position:'relative', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${Math.min(pct, 100)}%`, background:scoreColor, borderRadius:4, transition:'width 0.5s' }} />
                      </div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:6 }}>{b.tip}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}

        {/* ── CLEARINGHOUSE ── */}
        {compTab === 'clearinghouse' && (
          <>
            <div style={{ background:'linear-gradient(135deg,rgba(240,165,0,0.06),rgba(0,212,170,0.04))', border:'1px solid rgba(240,165,0,0.15)', borderRadius:12, padding:'14px 18px', display:'flex', gap:14, alignItems:'center', flexWrap:'wrap' }}>
              <GraduationCap size={20} color="var(--accent)" />
              <div style={{ flex:1, minWidth:200 }}>
                <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)', marginBottom:2 }}>FMCSA Drug & Alcohol Clearinghouse — 49 CFR Part 382</div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>Pre-employment queries required before hiring · Annual queries for all CDL drivers</div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:11, color:'var(--muted)' }}>Balance</div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--accent)' }}>$48.75</div>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              {/* Order form */}
              <div style={S.panel}>
                <div style={S.panelHead}>
                  <div style={S.panelTitle}><Ic icon={Search} /> Order Query</div>
                  <span style={S.tag('var(--accent)')}>$1.25</span>
                </div>
                <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
                  <div>
                    <label style={{ fontSize:11, color:'var(--muted)', fontWeight:600 }}>Select Driver</label>
                    <select value={chDriver} onChange={e => setChDriver(e.target.value)}
                      style={{ width:'100%', marginTop:4, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }}>
                      <option value="">— Select driver —</option>
                      {COMPLIANCE_DRIVERS.map(d => <option key={d.name} value={d.name}>{d.name} · {d.cdl}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:'var(--muted)', fontWeight:600 }}>Query Type</label>
                    <select value={chType} onChange={e => setChType(e.target.value)}
                      style={{ width:'100%', marginTop:4, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }}>
                      {['Pre-Employment','Annual','Random','Return-to-Duty','Follow-Up'].map(o => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                  {chDriver && (
                    <div style={{ background:'rgba(240,165,0,0.05)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
                      <div style={{ fontWeight:700, marginBottom:4, color:'var(--accent)' }}>Auto-filled from profile</div>
                      {(() => { const d = COMPLIANCE_DRIVERS.find(x=>x.name===chDriver); return d ? (
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4, color:'var(--muted)' }}>
                          <span>CDL: <b style={{ color:'var(--text)' }}>{d.cdl}</b></span>
                          <span>State: <b style={{ color:'var(--text)' }}>{d.state}</b></span>
                          <span>DOB: <b style={{ color:'var(--text)' }}>{d.dob}</b></span>
                        </div>
                      ) : null })()}
                    </div>
                  )}
                  <div onClick={() => setChConsent(v => !v)}
                    style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'10px 14px', background:'var(--surface2)', borderRadius:8, cursor:'pointer', border:`1px solid ${chConsent ? 'rgba(34,197,94,0.4)' : 'var(--border)'}` }}>
                    <div style={{ width:18, height:18, borderRadius:4, background: chConsent ? 'var(--success)' : 'var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:1 }}>
                      {chConsent && <Ic icon={Check} size={12} style={{ color:'#fff' }} />}
                    </div>
                    <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.4 }}>
                      Driver has provided electronic consent per 49 CFR § 382.701.
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ padding:'11px 0' }} onClick={submitCH}>
                    <Search size={13} /> Submit Query — $1.25
                  </button>
                </div>
              </div>

              {/* Annual compliance tracker */}
              <div style={S.panel}>
                <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Calendar} /> Annual Compliance</div></div>
                <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
                  {COMPLIANCE_DRIVERS.map(d => {
                    const lastQuery = chOrders.find(o => o.driver === d.name && o.type === 'Annual' && o.status === 'Complete')
                    const due = lastQuery ? 'Jan 2027' : 'OVERDUE'
                    const isDue = !lastQuery
                    return (
                      <div key={d.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', background:'var(--surface2)', borderRadius:10, border:`1px solid ${isDue ? 'rgba(239,68,68,0.3)' : 'var(--border)'}`, flexWrap:'wrap' }}>
                        <div style={{ width:34, height:34, borderRadius:'50%', background:'var(--surface)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:11, color:'var(--accent)', flexShrink:0 }}>
                          {d?.avatar || '?'}
                        </div>
                        <div style={{ flex:1, minWidth:100 }}>
                          <div style={{ fontSize:13, fontWeight:700, marginBottom:1 }}>{d.name}</div>
                          <div style={{ fontSize:11, color:'var(--muted)' }}>{d.cdl} · {d.unit}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>Due</div>
                          <div style={{ fontSize:12, fontWeight:700, color: isDue ? 'var(--danger)' : 'var(--success)' }}>{due}</div>
                        </div>
                        {isDue && <button className="btn btn-primary" style={{ fontSize:10, padding:'4px 10px' }} onClick={() => setChDriver(d.name)}>Query</button>}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Query history */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={FileText} /> Query History</div>
                <span style={{ fontSize:11, color:'var(--muted)' }}>{chOrders.length} queries · ${(chOrders.reduce((s,o)=>s+o.cost,0)).toFixed(2)}</span>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
                  <thead><tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
                    {['ID','Driver','CDL','Type','Date','Status','Result','Cost'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {chOrders.map(o => (
                      <tr key={o.id} style={{ borderBottom:'1px solid var(--border)' }}>
                        <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:11, color:'var(--accent)' }}>{o.id}</td>
                        <td style={{ padding:'10px 12px', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>{o.driver}</td>
                        <td style={{ padding:'10px 12px', fontSize:11, color:'var(--muted)' }}>{o.cdl}</td>
                        <td style={{ padding:'10px 12px', fontSize:12 }}>{o.type}</td>
                        <td style={{ padding:'10px 12px', fontSize:11, color:'var(--muted)', whiteSpace:'nowrap' }}>{o.date}</td>
                        <td style={{ padding:'10px 12px' }}><span style={S.tag(o.status === 'Complete' ? 'var(--success)' : 'var(--accent)')}>{o.status}</span></td>
                        <td style={{ padding:'10px 12px' }}><span style={S.tag(o.result === 'Clear' ? 'var(--success)' : o.result === 'Pending' ? 'var(--accent)' : 'var(--danger)')}>{o.result}</span></td>
                        <td style={{ padding:'10px 12px', fontSize:12, color:'var(--muted)' }}>${o.cost.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// CarrierCSA now redirects to unified compliance center
export function CarrierCSA() { return <AIComplianceCenter defaultTab="csa" /> }

// CarrierClearinghouse now redirects to unified compliance center
export function CarrierClearinghouse() { return <AIComplianceCenter defaultTab="clearinghouse" /> }

// CarrierDVIR is the unified AI Compliance Center
export function CarrierDVIR() { return <AIComplianceCenter /> }

// ─── DRIVER PROFILES ───────────────────────────────────────────────────────────
const DRIVER_DATA = []

export function DriverProfiles() {
  const { showToast } = useApp()
  const { drivers: dbDrivers, addDriver, editDriver, removeDriver } = useCarrier()
  const driverList = dbDrivers.length ? dbDrivers.map(d => ({
    id: d.id, name: d.full_name, avatar: (d.full_name || '').split(' ').map(w => w[0]).join('').slice(0,2),
    phone: d.phone || '', email: d.email || '',
    hired: d.hire_date ? new Date(d.hire_date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '',
    cdl: d.license_number || '', cdlClass: 'Class A', cdlExpiry: d.license_expiry ? new Date(d.license_expiry).toLocaleDateString('en-US', { month:'short', year:'numeric' }) : '',
    medCard: d.medical_card_expiry ? new Date(d.medical_card_expiry).toLocaleDateString('en-US', { month:'short', year:'numeric' }) : '',
    status: d.status || 'Active', hos: '—', unit: '',
    stats: { loadsMTD: 0, milesMTD: 0, grossMTD: 0, payMTD: 0, rating: 0 },
    endorsements: (d.notes || '').split(',').map(s => s.trim()).filter(Boolean),
    violations: [], payModel: '',
  })) : DRIVER_DATA
  const [selected, setSelected] = useState(driverList[0]?.id || 'james')
  const [showAdd, setShowAdd] = useState(false)
  const [newD, setNewD] = useState({ name:'', phone:'', email:'', license_number:'', license_state:'', license_expiry:'', medical_card_expiry:'' })
  const [saving, setSaving] = useState(false)
  const d = driverList.find(x => x.id === selected) || driverList[0]

  const handleAddDriver = async () => {
    if (!newD.name) { showToast('error', 'Error', 'Name is required'); return }
    setSaving(true)
    try {
      await addDriver({
        full_name: newD.name,
        phone: newD.phone,
        email: newD.email,
        license_number: newD.license_number,
        license_state: newD.license_state,
        license_expiry: newD.license_expiry || null,
        medical_card_expiry: newD.medical_card_expiry || null,
        status: 'Active',
        hire_date: new Date().toISOString().split('T')[0],
      })
      showToast('success', 'Driver Added', newD.name + ' added successfully')
      setNewD({ name:'', phone:'', email:'', license_number:'', license_state:'', license_expiry:'', medical_card_expiry:'' })
      setShowAdd(false)
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to add driver')
    }
    setSaving(false)
  }

  const expiryColor = (expiry) => {
    const months = (new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24 * 30)
    return months < 3 ? 'var(--danger)' : months < 6 ? 'var(--warning)' : 'var(--success)'
  }
  const statusColor = { Active: 'var(--success)', Available: 'var(--accent2)', 'Off Duty': 'var(--muted)' }

  const addInp = { width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, boxSizing:'border-box', outline:'none' }

  return (
    <>
      {/* Add Driver Modal — rendered outside the overflow:hidden container */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setShowAdd(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:440, padding:24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Add New Driver</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>Enter driver details below</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { key:'name', label:'Full Name *', ph:'John Smith', span:true },
                { key:'phone', label:'Phone', ph:'(612) 555-0198' },
                { key:'email', label:'Email', ph:'driver@email.com' },
                { key:'license_number', label:'CDL Number', ph:'MN-12345678' },
                { key:'license_state', label:'License State', ph:'MN' },
                { key:'license_expiry', label:'CDL Expiry', ph:'', type:'date' },
                { key:'medical_card_expiry', label:'Medical Card Expiry', ph:'', type:'date' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                  <input type={f.type||'text'} value={newD[f.key]} onChange={e => setNewD(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={addInp} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:18 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }} onClick={handleAddDriver} disabled={saving || !newD.name}>
                {saving ? 'Saving...' : 'Add Driver'}
              </button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Driver list */}
      <div style={{ width: 240, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflowY: 'auto' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2 }}>DRIVERS ({driverList.length})</div>
          <button className="btn btn-primary" style={{ fontSize: 10, padding: '4px 10px' }} onClick={() => setShowAdd(true)}>+ Add</button>
        </div>
        {driverList.map(dr => {
          const isSel = selected === dr.id
          return (
            <div key={dr.id} onClick={() => setSelected(dr.id)}
              style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', borderLeft: `3px solid ${isSel ? 'var(--accent)' : 'transparent'}`, background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: isSel ? 'var(--accent)' : 'var(--surface2)', color: isSel ? '#000' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{dr?.avatar || '?'}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isSel ? 'var(--accent)' : 'var(--text)' }}>{dr.name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 6, background: (statusColor[dr.status] || 'var(--muted)') + '15', color: statusColor[dr.status] || 'var(--muted)' }}>{dr.status}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{dr.unit}</span>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Profile detail */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!d ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:'var(--muted)' }}>
            <Users size={32} />
            <div style={{ fontSize:14, fontWeight:600 }}>No drivers yet</div>
            <div style={{ fontSize:12 }}>Add your first driver to get started</div>
            <button className="btn btn-primary" style={{ fontSize:12, marginTop:8 }} onClick={() => setShowAdd(true)}>+ Add Driver</button>
          </div>
        ) : <>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800 }}>{d?.avatar || '?'}</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 1 }}>{d.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: (statusColor[d.status]||'var(--muted)') + '15', color: statusColor[d.status]||'var(--muted)' }}>{d.status}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{d.unit} · CDL {d.cdlClass} · Hired {d.hired}</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
              <span style={{ fontSize: 12 }}><Ic icon={Phone} /> {d.phone}</span>
              <span style={{ fontSize: 12 }}><Ic icon={Send} /> {d.email}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => showToast('', 'Message', `Opening chat with ${d.name}`)}><Ic icon={MessageCircle} /> Message</button>
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => showToast('', 'Edit Profile', d.name)}><Ic icon={PencilIcon} /> Edit</button>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap: 12 }}>
          {[
            { label: 'Loads MTD',  value: d.stats.loadsMTD,                    color: 'var(--accent)' },
            { label: 'Miles MTD',  value: d.stats.milesMTD.toLocaleString(),   color: 'var(--accent2)' },
            { label: 'Gross MTD',  value: '$' + d.stats.grossMTD.toLocaleString(), color: 'var(--accent)' },
            { label: 'Pay MTD',    value: '$' + d.stats.payMTD.toLocaleString(),   color: 'var(--success)' },
            { label: 'Rating',     value: d.stats.rating,              color: 'var(--warning)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* License & Compliance */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}><Ic icon={FileCheck} /> License & Compliance</div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'CDL Number',     value: d.cdl, color: 'var(--text)' },
                { label: 'CDL Class',      value: d.cdlClass, color: 'var(--text)' },
                { label: 'CDL Expiry',     value: d.cdlExpiry, color: expiryColor(d.cdlExpiry) },
                { label: 'Medical Card',   value: d.medCard, color: expiryColor(d.medCard) },
                { label: 'HOS Remaining',  value: d.hos, color: d.hos === 'Restart' ? 'var(--warning)' : 'var(--success)' },
                { label: 'Pay Model',      value: d.payModel, color: 'var(--accent2)' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{item.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.value}</span>
                </div>
              ))}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Endorsements</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {d.endorsements.map(e => <span key={e} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'rgba(0,212,170,0.1)', color: 'var(--accent2)', border: '1px solid rgba(0,212,170,0.2)' }}>{e}</span>)}
                </div>
              </div>
            </div>
          </div>

          {/* Violations & Notes */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}><Ic icon={AlertTriangle} /> Violations & Safety</div>
            <div style={{ padding: 16 }}>
              {d.violations.length === 0
                ? <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--success)', fontSize: 13 }}><Ic icon={Check} /> Clean record — no violations</div>
                : d.violations.map((v, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>{v.type}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{v.date} · {v.points} CSA point{v.points !== 1 ? 's' : ''}</div>
                  </div>
                ))
              }
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-ghost" style={{ width: '100%', fontSize: 12 }} onClick={() => showToast('', 'MVR Report', `Requesting MVR for ${d.name}...`)}><Ic icon={FileText} /> Request MVR Report</button>
              </div>
            </div>
          </div>
        </div>
      </>}
      </div>
    </div>
    </>
  )
}

// ─── BROKER DIRECTORY ──────────────────────────────────────────────────────────
export function BrokerDirectory() {
  const { showToast } = useApp()
  const ctx = useCarrier() || {}
  const loads = ctx.loads || []
  const invoices = ctx.invoices || []
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('All')

  const brokerMap = {}
  loads.forEach(l => {
    const name = l.broker_name || l.broker
    if (!name) return
    if (!brokerMap[name]) brokerMap[name] = { name, loads: 0, revenue: 0, onTime: 0, delivered: 0 }
    brokerMap[name].loads++
    brokerMap[name].revenue += Number(l.rate) || Number(l.gross) || 0
    if (l.status === 'delivered') {
      brokerMap[name].delivered++
      brokerMap[name].onTime++
    }
  })
  const brokers = Object.values(brokerMap).sort((a,b) => b.loads - a.loads).map((b, i) => {
    const onTimeRate = b.delivered > 0 ? Math.round((b.onTime / b.delivered) * 100) : 0
    const score = Math.min(99, 70 + Math.min(b.loads * 3, 15) + (onTimeRate > 80 ? 10 : 0))
    const tag = score >= 85 ? 'var(--success)' : score >= 70 ? 'var(--accent)' : 'var(--warning)'
    const preferred = score >= 85
    return { ...b, id: i + 1, score, tag, preferred, onTimeRate }
  })

  const filtered = brokers
    .filter(b => b.name.toLowerCase().includes(search.toLowerCase()))
    .filter(b => filter === 'All' ? true : filter === 'Preferred' ? b.preferred : b.score < 80)

  const selBroker = brokers.find(b => b.id === selected) || (filtered.length > 0 ? filtered[0] : null)

  if (brokers.length === 0) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12, color:'var(--muted)' }}>
        <Briefcase size={40} />
        <div style={{ fontSize:15, fontWeight:700 }}>No broker data yet</div>
        <div style={{ fontSize:13 }}>Complete loads to build your broker directory.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* List */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)' }}>
        <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input placeholder="Search brokers..." value={search} onChange={e => setSearch(e.target.value)}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", outline: 'none' }} />
          <div style={{ display: 'flex', gap: 6 }}>
            {['All', 'Preferred', 'Caution'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid', borderColor: filter === f ? 'var(--accent)' : 'var(--border)', background: filter === f ? 'var(--accent)' : 'transparent', color: filter === f ? '#000' : 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
                {f}
              </button>
            ))}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {filtered.map(b => {
            const isSel = selBroker && selBroker.id === b.id
            return (
              <div key={b.id} onClick={() => setSelected(b.id)}
                style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', borderLeft: `3px solid ${isSel ? 'var(--accent)' : 'transparent'}`, background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isSel ? 'var(--accent)' : 'var(--text)' }}>{b.name}</div>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: b.tag }}>{b.score}</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{b.loads} load{b.loads !== 1 ? 's' : ''} \u00b7 ${b.revenue.toLocaleString()} revenue</div>
                {b.preferred && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--success)', marginTop: 2, display: 'inline-block' }}><Star size={9} /> PREFERRED</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Detail */}
      {selBroker && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 1 }}>{selBroker.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>{selBroker.loads} load{selBroker.loads !== 1 ? 's' : ''} completed</div>
            </div>
            <div style={{ textAlign: 'center', background: 'var(--surface)', border: `2px solid ${selBroker.tag}`, borderRadius: 12, padding: '10px 20px' }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 40, color: selBroker.tag, lineHeight: 1 }}>{selBroker.score}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>Score</div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            {[
              { label: 'Total Loads', value: selBroker.loads, color: 'var(--accent)' },
              { label: 'Revenue', value: `$${selBroker.revenue.toLocaleString()}`, color: 'var(--success)' },
              { label: 'Delivered', value: selBroker.delivered, color: 'var(--accent2)' },
              { label: 'On-Time Rate', value: selBroker.delivered > 0 ? `${selBroker.onTimeRate}%` : '--', color: selBroker.onTimeRate >= 80 ? 'var(--success)' : 'var(--warning)' },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── EXPENSE TRACKER ───────────────────────────────────────────────────────────
const EXPENSE_CATS = ['Fuel', 'Maintenance', 'Tolls', 'Lumper', 'Insurance', 'Permits', 'Other']
const CAT_COLORS = { Fuel:'var(--warning)', Maintenance:'var(--danger)', Tolls:'var(--accent2)', Lumper:'var(--accent3)', Insurance:'var(--accent)', Permits:'var(--success)', Other:'var(--muted)' }
const CAT_ICONS  = { Fuel: Fuel, Maintenance: Wrench, Tolls: Route, Lumper: Dumbbell, Insurance: Shield, Permits: FileText, Other: Paperclip }

export function ExpenseTracker() {
  const { showToast } = useApp()
  const { expenses, addExpense: ctxAddExpense } = useCarrier()
  const [showForm, setShowForm] = useState(false)
  const [filterCat, setFilterCat] = useState('All')
  const [newExp, setNewExp] = useState({ date:'', cat:'Fuel', amount:'', load:'', notes:'', driver:'' })
  const [scanning, setScanning] = useState(false)
  const [scanDrag, setScanDrag] = useState(false)

  const filtered = filterCat === 'All' ? expenses : expenses.filter(e => e.cat === filterCat)
  const totalBycat = EXPENSE_CATS.map(c => ({ cat: c, total: expenses.filter(e => e.cat === c).reduce((s,e) => s+e.amount, 0) })).filter(x => x.total > 0)
  const grandTotal = expenses.reduce((s,e) => s+e.amount, 0)

  const addExpense = () => {
    if (!newExp.amount || !newExp.cat) return
    ctxAddExpense({ ...newExp, amount: parseFloat(newExp.amount) })
    setNewExp({ date:'', cat:'Fuel', amount:'', load:'', notes:'', driver:'' })
    setShowForm(false)
    showToast('', 'Expense Added', `${newExp.cat} · $${newExp.amount}`)
  }

  const scanReceipt = async (file) => {
    if (!file) return
    setScanning(true)
    setShowForm(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiFetch('/api/parse-receipt', { method: 'POST', body: fd })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      const d = json.data
      setNewExp(e => ({ ...e, amount: d.amount || '', date: d.date || '', cat: d.category || 'Fuel', notes: d.notes || d.merchant || '', }))
      showToast('', 'Receipt Scanned', `${d.category || 'Expense'} · $${d.amount} — review and confirm`)
    } catch (err) {
      showToast('', 'Scan Failed', err.message || 'Check server connection')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header stats */}
      <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center', gridColumn: 'span 1' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>TOTAL MTD</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--danger)' }}>${grandTotal.toLocaleString()}</div>
        </div>
        {totalBycat.slice(0,3).map(c => (
          <div key={c.cat} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{React.createElement(CAT_ICONS[c.cat] || Paperclip, {size:10})} {c.cat.toUpperCase()}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: CAT_COLORS[c.cat] }}>${c.total.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Category breakdown bar */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}><Ic icon={BarChart2} /> Expense Breakdown</div>
        <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 1, marginBottom: 12 }}>
          {totalBycat.map(c => (
            <div key={c.cat} style={{ flex: c.total, background: CAT_COLORS[c.cat], transition: 'flex 0.4s' }} title={c.cat + ': $' + c.total} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {totalBycat.map(c => (
            <div key={c.cat} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: CAT_COLORS[c.cat] }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.cat} <b style={{ color: 'var(--text)' }}>${c.total.toLocaleString()}</b></span>
            </div>
          ))}
        </div>
      </div>

      {/* Receipt Drop Zone */}
      {!showForm && (
        <div
          onDragOver={e => { e.preventDefault(); setScanDrag(true) }}
          onDragLeave={() => setScanDrag(false)}
          onDrop={e => { e.preventDefault(); setScanDrag(false); scanReceipt(e.dataTransfer.files[0]) }}
          onClick={() => document.getElementById('receipt-input').click()}
          style={{ border: `2px dashed ${scanDrag ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 12, padding: '20px', textAlign: 'center', cursor: 'pointer', background: scanDrag ? 'rgba(240,165,0,0.04)' : 'transparent', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
          <input id="receipt-input" type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => scanReceipt(e.target.files[0])} />
          <span style={{ fontSize: 28 }}><Receipt size={28} /></span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>Drop a receipt to scan it</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Photo, screenshot, or PDF · AI fills in amount, date & category</div>
          </div>
        </div>
      )}

      {scanning && (
        <div style={{ background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}><Ic icon={Zap} /> Scanning receipt...</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>AI is reading the amount, merchant, and date</div>
        </div>
      )}

      {/* Filter + Add */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
          {['All', ...EXPENSE_CATS].map(c => (
            <button key={c} onClick={() => setFilterCat(c)}
              style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid', borderColor: filterCat===c ? 'var(--accent)' : 'var(--border)', background: filterCat===c ? 'var(--accent)' : 'transparent', color: filterCat===c ? '#000' : 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
              {c === 'All' ? c : <>{React.createElement(CAT_ICONS[c] || Paperclip, {size:11})} {c}</>}
            </button>
          ))}
        </div>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowForm(s => !s)}>{showForm ? '✕ Cancel' : '+ Add Expense'}</button>
      </div>

      {/* Add form */}
      {showForm && (
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 10 }}>
            {[
              { key:'date',   label:'Date',      type:'text', ph:'Mar 12' },
              { key:'amount', label:'Amount ($)', type:'number', ph:'250' },
              { key:'load',   label:'Load ID',   type:'text', ph:'FM-4421 (optional)' },
              { key:'driver', label:'Driver',    type:'text', ph:'James Tucker (optional)' },
              { key:'notes',  label:'Notes',     type:'text', ph:'Description' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input type={f.type} placeholder={f.ph} value={newExp[f.key]} onChange={e => setNewExp(x => ({ ...x, [f.key]: e.target.value }))}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Category</label>
              <select value={newExp.cat} onChange={e => setNewExp(x => ({ ...x, cat: e.target.value }))}
                style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
                {EXPENSE_CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <button className="btn btn-primary" style={{ width: '100%', padding: '11px 0' }} onClick={addExpense}><Ic icon={Check} /> Add Expense</button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX:'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth:600 }}>
          <thead><tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
            {['Date','Category','Amount','Load','Driver','Notes'].map(h => (
              <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map((e, i) => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', background: i%2===0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)' }}>{e.date}</td>
                <td style={{ padding: '11px 14px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: (CAT_COLORS[e.cat]||'var(--muted)') + '15', color: CAT_COLORS[e.cat]||'var(--muted)' }}>{React.createElement(CAT_ICONS[e.cat] || Paperclip, {size:11})} {e.cat}</span>
                </td>
                <td style={{ padding: '11px 14px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--danger)' }}>−${e.amount.toLocaleString()}</td>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{e.load || '—'}</td>
                <td style={{ padding: '11px 14px', fontSize: 12 }}>{e.driver || '—'}</td>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)' }}>{e.notes}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}


// ─── FACTORING & CASHFLOW ──────────────────────────────────────────────────────
const INVOICES = []

const HISTORY = []

const CASHFLOW_WEEKS = []

const PRIORITY_COLORS = { HIGH:'var(--success)', MEDIUM:'var(--accent)', URGENT:'var(--danger)' }

export function FactoringCashflow() {
  const { showToast } = useApp()
  const { invoices: ctxInvoices, updateInvoiceStatus } = useCarrier()
  const [selected, setSelected] = useState(new Set())
  const [tab, setTab] = useState('invoices')
  const [factoringRate, setFactoringRate] = useState(2.5)
  const [company, setCompany] = useState('Qivori FastPay')
  const [history, setHistory] = useState(HISTORY)

  // Use real invoices from context — Unpaid = factorable, Factored/Paid = history
  const readyInvoices = ctxInvoices.filter(i => i.status === 'Unpaid').map(i => ({
    ...i, id: i.id, loadId: i.loadId, broker: i.broker, route: i.route,
    amount: i.amount, brokerScore: 90, paySpeed:'< 3 days', priority:'HIGH',
  }))
  const pendingInvoices = ctxInvoices.filter(i => i.status === 'Factored')

  const toggleSelect = (id) => setSelected(s => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const toggleAll = () => setSelected(s => s.size === readyInvoices.length ? new Set() : new Set(readyInvoices.map(i => i.id)))

  const selectedInvoices = readyInvoices.filter(i => selected.has(i.id))
  const selectedTotal = selectedInvoices.reduce((s, i) => s + i.amount, 0)
  const selectedFee   = Math.round(selectedTotal * (factoringRate / 100) * 100) / 100
  const selectedNet   = selectedTotal - selectedFee

  const factorNow = () => {
    if (selected.size === 0) return
    const today = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' })
    const tmrw  = new Date(Date.now() + 86400000).toLocaleDateString('en-US', { month:'short', day:'numeric' })
    const newHist = selectedInvoices.map(inv => ({
      id: inv.id, broker: inv.broker, amount: inv.amount,
      fee: Math.round(inv.amount * factoringRate / 100 * 100) / 100,
      net: Math.round(inv.amount * (1 - factoringRate / 100) * 100) / 100,
      factoredOn: today, received: tmrw, status: 'Pending',
    }))
    selectedInvoices.forEach(inv => updateInvoiceStatus(inv.id, 'Factored'))
    setHistory(h => [...newHist, ...h])
    setSelected(new Set())
    showToast('', 'Invoices Submitted', `${selected.size} invoice${selected.size > 1 ? 's' : ''} · $${selectedNet.toLocaleString()} net · 24hr deposit`)
  }

  const totalAvailable = readyInvoices.reduce((s, i) => s + i.amount, 0)
  const totalPending   = pendingInvoices.reduce((s, i) => s + i.amount, 0)
  const feesThisMonth  = HISTORY.reduce((s, h) => s + h.fee, 0)
  const receivedMTD    = HISTORY.reduce((s, h) => s + h.net, 0)

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <AiBanner
        title="AI Cashflow Alert: INV-0035 is 11 days old — factor now to avoid cash gap next week"
        sub="Transplace historically pays slow · Factoring today gets you $3,298 by tomorrow vs waiting up to 7 more days"
        action="Factor It Now"
        onAction={() => { setSelected(new Set(['INV-0035'])); setTab('invoices') }}
      />

      {/* KPIs */}
      <div style={S.grid(4)}>
        <StatCard label="Available to Factor" value={'$' + totalAvailable.toLocaleString()} change={readyInvoices.length + ' invoices ready'} color="var(--accent)" changeType="neutral" />
        <StatCard label="Pending Deposit"     value={'$' + totalPending.toLocaleString()}   change="Submitted, awaiting deposit"             color="var(--warning)" changeType="neutral" />
        <StatCard label="Received MTD"        value={'$' + receivedMTD.toLocaleString()}     change="After factoring fees"                    color="var(--success)" changeType="neutral" />
        <StatCard label="Fees Paid MTD"       value={'$' + feesThisMonth.toFixed(0)}         change={'@ ' + factoringRate + '% flat rate'}    color="var(--danger)"  changeType="neutral" />
      </div>

      {/* Sub-nav */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'invoices',  label: 'Factor Invoices' },
          { id: 'cashflow',  label: 'Cashflow Forecast' },
          { id: 'history',   label: 'History' },
          { id: 'settings',  label: 'Settings' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '9px 18px', border: 'none', borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent', background: 'transparent', color: tab === t.id ? 'var(--accent)' : 'var(--muted)', fontSize: 13, fontWeight: tab === t.id ? 700 : 500, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Factor Invoices tab ── */}
      {tab === 'invoices' && (
        <>
          {/* Selection summary */}
          {selected.size > 0 && (
            <div style={{ background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ flex: 1, display: 'flex', gap: 24 }}>
                <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>SELECTED</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--accent)' }}>{selected.size} invoice{selected.size > 1 ? 's' : ''}</div></div>
                <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>GROSS</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--text)' }}>${selectedTotal.toLocaleString()}</div></div>
                <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>FEE ({factoringRate}%)</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--danger)' }}>−${selectedFee.toLocaleString()}</div></div>
                <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>YOU RECEIVE</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--success)' }}>${selectedNet.toLocaleString()}</div></div>
              </div>
              <button className="btn btn-primary" style={{ padding: '12px 24px', fontSize: 14 }} onClick={factorNow}>
                <Zap size={13} /> Factor Now — 24hr Deposit
              </button>
            </div>
          )}

          {/* Invoice list */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={selected.size === readyInvoices.length} onChange={toggleAll}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                <div style={S.panelTitle}>Open Invoices — Ready to Factor</div>
              </div>
              <span style={S.badge('var(--accent)')}>{readyInvoices.length} available</span>
            </div>

            {readyInvoices.map(inv => {
              const isSel = selected.has(inv.id)
              const fee = Math.round(inv.amount * factoringRate / 100)
              const net = inv.amount - fee
              const priorityColor = PRIORITY_COLORS[inv.priority]
              const ageColor = inv.days > 7 ? 'var(--danger)' : inv.days > 3 ? 'var(--warning)' : 'var(--muted)'

              return (
                <div key={inv.id} onClick={() => toggleSelect(inv.id)}
                  style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isSel ? 'rgba(240,165,0,0.04)' : 'transparent', borderLeft: `3px solid ${isSel ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <input type="checkbox" checked={isSel} onChange={() => toggleSelect(inv.id)} onClick={e => e.stopPropagation()}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }} />

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{inv.id}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{inv.broker}</span>
                      <span style={{ ...S.tag(priorityColor), fontSize: 9 }}>{inv.priority} PRIORITY</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {inv.loadId} · {inv.route} · Broker score: <b style={{ color: inv.brokerScore >= 90 ? 'var(--success)' : inv.brokerScore >= 75 ? 'var(--warning)' : 'var(--danger)' }}>{inv.brokerScore}</b> · Pays {inv.paySpeed}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 16, textAlign: 'right' }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>AGE</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: ageColor }}>{inv.days}d</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>FEE</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>−${fee}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>YOU GET</div>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--success)' }}>${net.toLocaleString()}</div>
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); generateInvoicePDF({ id: inv.id, loadId: inv.loadId, broker: inv.broker, route: inv.route, amount: inv.amount, date: inv.date, dueDate: inv.dueDate, driver: inv.driver, status: inv.status }) }}
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 10, color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'DM Sans',sans-serif" }}
                    title="Download Invoice PDF"><Ic icon={Download} /> PDF</button>
                </div>
              )
            })}

            {pendingInvoices.length > 0 && (
              <>
                <div style={{ padding: '10px 18px', background: 'var(--surface2)', borderTop: '1px solid var(--border)', fontSize: 10, fontWeight: 800, color: 'var(--muted)', letterSpacing: 2 }}>PENDING DEPOSIT</div>
                {pendingInvoices.map(inv => (
                  <div key={inv.id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14, opacity: 0.6 }}>
                    <div style={{ width: 16, height: 16 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{inv.id} <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>— {inv.broker}</span></div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{inv.loadId} · {inv.route} · Submitted — awaiting deposit</div>
                    </div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--warning)' }}>${inv.amount.toLocaleString()}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', color: 'var(--warning)' }}>Pending</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Cashflow Forecast tab ── */}
      {tab === 'cashflow' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            {CASHFLOW_WEEKS.map((w, i) => (
              <div key={w.week} style={{ background: 'var(--surface)', border: `1px solid ${i === 0 ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? 'var(--accent)' : 'var(--muted)', marginBottom: 12 }}>{w.week}</div>
                {[
                  { label: 'Incoming', value: '$' + w.incoming.toLocaleString(), color: 'var(--success)' },
                  { label: 'Outgoing', value: '−$' + w.outgoing.toLocaleString(), color: 'var(--danger)' },
                  { label: 'Net',      value: '$' + w.net.toLocaleString(),       color: w.net > 500 ? 'var(--success)' : 'var(--warning)', bold: true },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.label}</span>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: item.bold ? 20 : 16, color: item.color }}>{item.value}</span>
                  </div>
                ))}
                {w.factored > 0 && (
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}><Ic icon={Zap} /> ${w.factored.toLocaleString()} factored</div>
                )}
                {w.net < 500 && (
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--warning)', fontWeight: 700 }}><Ic icon={AlertTriangle} /> Tight week — consider factoring</div>
                )}
              </div>
            ))}
          </div>

          <div style={S.panel}>
            <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Bot} /> AI Cashflow Recommendations</div></div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { icon: Zap, title: 'Factor INV-0035 immediately', desc: 'Transplace has 7-day pay terms — you\'d wait until Mar 15. Factoring today gives you $3,298 by tomorrow.', action: 'Factor Now', color: 'var(--danger)' },
                { icon: Calendar, title: 'Week 3 looks tight at $1,400 net', desc: 'Consider factoring INV-0038 before then to smooth cashflow. You\'d clear $4,972 instead of waiting.', action: 'View Invoice', color: 'var(--warning)' },
                { icon: Check, title: 'Echo Global — no need to factor', desc: 'Score 98 · Pays in < 24hr. Let them pay direct and save the 2.5% fee — that\'s $96 back in your pocket.', action: 'Got it', color: 'var(--success)' },
              ].map(r => (
                <div key={r.title} style={{ display: 'flex', gap: 14, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 10, borderLeft: `3px solid ${r.color}` }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{typeof r.icon === "string" ? r.icon : <r.icon size={20} />}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.desc}</div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 11, alignSelf: 'center', flexShrink: 0 }}>{r.action}</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── History tab ── */}
      {tab === 'history' && (
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}><Ic icon={Clock} /> Factoring History</div>
            <span style={S.badge('var(--success)')}>${receivedMTD.toLocaleString()} received MTD</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              {['Invoice','Broker','Gross','Fee','Net Received','Factored On','Deposit','Status'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={h.id + i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{h.id}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600 }}>{h.broker}</td>
                  <td style={{ padding: '11px 14px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: 'var(--accent)' }}>${h.amount.toLocaleString()}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--danger)' }}>−${h.fee}</td>
                  <td style={{ padding: '11px 14px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--success)' }}>${h.net.toLocaleString()}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)' }}>{h.factoredOn}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)' }}>{h.received}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: h.status === 'Received' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', color: h.status === 'Received' ? 'var(--success)' : 'var(--warning)' }}>{h.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Settings tab ── */}
      {tab === 'settings' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={S.panel}>
            <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Settings} /> Factoring Setup</div></div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Factoring Company</label>
                <select value={company} onChange={e => setCompany(e.target.value)}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
                  {['Qivori FastPay', 'RTS Financial', 'OTR Solutions', 'Triumph Business Capital', 'TBS Factoring', 'Other'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Factoring Rate (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="number" min={1} max={10} step={0.1} value={factoringRate}
                    onChange={e => setFactoringRate(parseFloat(e.target.value) || 2.5)}
                    style={{ width: 90, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--accent)', fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", textAlign: 'center' }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>% flat fee per invoice</span>
                </div>
              </div>
              {[
                { label: 'Advance Rate',      value: '97.5%', note: 'Percentage of invoice advanced upfront' },
                { label: 'Deposit Speed',     value: '24hr',  note: 'Business days after submission' },
                { label: 'Contract Type',     value: 'Non-recourse', note: 'We absorb the credit risk' },
                { label: 'Minimum Volume',    value: 'None',  note: 'No monthly minimums required' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{item.note}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent2)', alignSelf: 'center' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={S.panel}>
            <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Briefcase} /> Connected Accounts</div></div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Business Checking', bank: 'Chase Bank ****4821', status: 'Connected', color: 'var(--success)' },
                { label: 'Fuel Card',          bank: 'EFS Fleet Card',      status: 'Connected', color: 'var(--success)' },
                { label: 'Payroll Account',    bank: 'Not connected',        status: 'Add',       color: 'var(--warning)' },
              ].map(acc => (
                <div key={acc.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: acc.color + '15', border: '1px solid ' + acc.color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}><Briefcase size={16} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{acc.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{acc.bank}</div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: acc.color + '15', color: acc.color }}>{acc.status}</span>
                </div>
              ))}
              <button className="btn btn-ghost" style={{ marginTop: 6 }} onClick={() => {}}>+ Connect Bank Account</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── FLEET MANAGER ─────────────────────────────────────────────────────────────
const FLEET_TRUCKS = []

const MAINT_LOGS = {}

const SERVICE_TYPES = ['Oil Change','Tire Rotation','Tire Replacement','Brake Service','DOT Inspection','Coolant Flush','DPF Cleaning','Transmission Service','AC Service','Other']
const WEEKS = ['W1','W2','W3','W4','W5','W6']

function expiryColor(dateStr) {
  const months = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24 * 30)
  return months < 2 ? 'var(--danger)' : months < 5 ? 'var(--warning)' : 'var(--success)'
}
function expiryLabel(dateStr) {
  const months = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24 * 30)
  if (months < 0)  return 'EXPIRED'
  if (months < 2)  return '< 2 months'
  if (months < 5)  return '< 5 months'
  return 'OK'
}

const BLANK_TRUCK = { vin:'', year:'', make:'', model:'', color:'', plate:'', gvw:'', fuel:'Diesel', odometer:'', driver:'', regExpiry:'', insExpiry:'', dotInspection:'', unit_cost:'' }

export function FleetManager() {
  const { showToast } = useApp()
  const { vehicles: dbVehicles, addVehicle, editVehicle, removeVehicle } = useCarrier()
  const initialTrucks = dbVehicles.length ? dbVehicles.map((v, i) => ({
    id: v.id, unit: v.unit_number || `Unit ${String(i+1).padStart(2,'0')}`,
    status: v.status === 'Active' ? 'Available' : v.status || 'Available',
    statusColor: v.status === 'Active' ? 'var(--accent2)' : 'var(--muted)',
    year: v.year || '', make: v.make || '', model: v.model || '',
    vin: v.vin || '', plate: v.license_plate || '', color: '',
    gvw: '80,000 lbs', fuel: 'Diesel',
    regExpiry: v.registration_expiry || '', insExpiry: v.insurance_expiry || '',
    dotInspection: '', odometer: v.current_miles || 0,
    driver: '', unit_cost: 0,
    mpg:[7.0,7.0,7.0,7.0,7.0,7.0], miles:[0,0,0,0,0,0],
    revenue:[0,0,0,0,0,0], opCost:[0,0,0,0,0,0],
  })) : FLEET_TRUCKS
  const [trucks, setTrucks] = useState(initialTrucks)
  const [selectedTruck, setSelectedTruck] = useState(initialTrucks[0]?.id || 'unit01')
  const [subTab, setSubTab] = useState('profile')
  const [logs, setLogs] = useState(MAINT_LOGS)
  const [showAddService, setShowAddService] = useState(false)
  const [newService, setNewService] = useState({ date:'', mileage:'', type:'Oil Change', cost:'', shop:'', notes:'', nextDue:'' })

  // Add Truck modal
  const [showAddTruck, setShowAddTruck] = useState(false)
  const [newTruck, setNewTruck] = useState(BLANK_TRUCK)
  const [vinLoading, setVinLoading] = useState(false)
  const [vinResult, setVinResult] = useState(null)

  const decodeVIN = async (vin) => {
    if (vin.length !== 17) return
    setVinLoading(true)
    setVinResult(null)
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`)
      const json = await res.json()
      const get = (var_) => json.Results?.find(r => r.Variable === var_)?.Value || ''
      const year  = get('Model Year')
      const make  = get('Make')
      const model = get('Model')
      const gvw   = get('Gross Vehicle Weight Rating From')
      const fuel  = get('Fuel Type - Primary') || 'Diesel'
      const body  = get('Body Class')
      if (!year || year === 'Not Applicable') {
        setVinResult({ error: 'VIN not found — check the number and try again' })
      } else {
        const decoded = { year, make, model, gvw: gvw || '80,000 lbs', fuel: fuel.includes('Diesel') ? 'Diesel' : fuel, body }
        setVinResult(decoded)
        setNewTruck(t => ({ ...t, year, make, model, gvw: decoded.gvw, fuel: decoded.fuel }))
        showToast('', 'VIN Decoded', `${year} ${make} ${model}`)
      }
    } catch {
      setVinResult({ error: 'Could not reach VIN database — check your connection' })
    } finally {
      setVinLoading(false)
    }
  }

  const saveTruck = async () => {
    if (!newTruck.vin || !newTruck.make) return
    const unitNum = 'Unit ' + String(trucks.length + 1).padStart(2, '0')
    const dbPayload = {
      unit_number: unitNum, vin: newTruck.vin, year: parseInt(newTruck.year) || null,
      make: newTruck.make, model: newTruck.model, license_plate: newTruck.plate,
      license_state: '', status: 'Active', current_miles: parseInt(newTruck.odometer) || 0,
      insurance_expiry: newTruck.insExpiry || null, registration_expiry: newTruck.regExpiry || null,
      notes: `${newTruck.color || ''}, ${newTruck.gvw || ''}, ${newTruck.fuel || 'Diesel'}`.trim(),
    }
    const saved = await addVehicle(dbPayload)
    const id = saved?.id || ('local-veh-' + Date.now())
    setTrucks(t => [...t, {
      ...newTruck, id, unit: unitNum, status: 'Available', statusColor: 'var(--accent2)',
      odometer: parseInt(newTruck.odometer) || 0,
      unit_cost: parseFloat(newTruck.unit_cost) || 0,
      mpg:[7.0,7.0,7.0,7.0,7.0,7.0],
      miles:[0,0,0,0,0,0], revenue:[0,0,0,0,0,0], opCost:[0,0,0,0,0,0],
    }])
    setSelectedTruck(id)
    setShowAddTruck(false)
    setNewTruck(BLANK_TRUCK)
    setVinResult(null)
    showToast('', 'Truck Added', `${newTruck.year} ${newTruck.make} ${newTruck.model} — ${unitNum}`)
  }

  const truck = trucks.find(t => t.id === selectedTruck)
  const truckLogs = logs[selectedTruck] || []
  const totalMaintCost = truckLogs.reduce((s, l) => s + l.cost, 0)
  const avgMpg = truck ? (truck.mpg.reduce((s,v) => s+v, 0) / truck.mpg.length).toFixed(1) : '0.0'
  const totalMiles = truck ? truck.miles.reduce((s,v) => s+v, 0) : 0
  const totalRev = truck ? truck.revenue.reduce((s,v) => s+v, 0) : 0
  const totalCost = truck ? truck.opCost.reduce((s,v) => s+v, 0) : 0
  const netProfit = totalRev - totalCost
  const maxRev = truck ? Math.max(...truck.revenue) : 0

  const addService = () => {
    if (!newService.date || !newService.type) return
    const entry = { ...newService, id: Date.now(), cost: parseFloat(newService.cost) || 0, mileage: parseInt(newService.mileage) || truck.odometer }
    setLogs(l => ({ ...l, [selectedTruck]: [entry, ...(l[selectedTruck] || [])] }))
    setNewService({ date:'', mileage:'', type:'Oil Change', cost:'', shop:'', notes:'', nextDue:'' })
    setShowAddService(false)
    showToast('', 'Service Logged', `${entry.type} · Unit ${truck.unit} · $${entry.cost}`)
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* ── Add Truck Modal ── */}
      {showAddTruck && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddTruck(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:16, width:'100%', maxWidth:580, maxHeight:'90vh', overflowY:'auto', padding:28 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>ADD NEW TRUCK</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>Enter the VIN to auto-fill truck details</div>
              </div>
              <button onClick={() => { setShowAddTruck(false); setVinResult(null); setNewTruck(BLANK_TRUCK) }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>

            {/* VIN input with decode */}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:6 }}>VIN Number <span style={{ color:'var(--accent)' }}>— 17 characters, auto-decodes</span></label>
              <div style={{ display:'flex', gap:8 }}>
                <input
                  value={newTruck.vin}
                  onChange={e => {
                    const v = e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17)
                    setNewTruck(t => ({ ...t, vin: v }))
                    setVinResult(null)
                    if (v.length === 17) decodeVIN(v)
                  }}
                  placeholder="1FUJGLDR5MLKJ2841"
                  maxLength={17}
                  style={{ flex:1, background:'var(--surface2)', border:`2px solid ${newTruck.vin.length === 17 ? (vinResult?.error ? 'var(--danger)' : 'var(--success)') : 'var(--border)'}`, borderRadius:8, padding:'10px 14px', color:'var(--text)', fontSize:15, fontFamily:'monospace', letterSpacing:2, outline:'none' }}
                />
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', width:44, fontSize:20 }}>
                  {vinLoading ? '...' : newTruck.vin.length === 17 && !vinResult?.error ? <Check size={14} /> : ''}
                </div>
              </div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>{newTruck.vin.length}/17 characters</div>
            </div>

            {/* VIN result banner */}
            {vinResult && !vinResult.error && (
              <div style={{ padding:'12px 14px', background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:10, marginBottom:16, display:'flex', gap:12, alignItems:'center' }}>
                <span style={{ fontSize:22 }}><Truck size={20} /></span>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:'var(--success)' }}>{vinResult.year} {vinResult.make} {vinResult.model}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>VIN decoded · {vinResult.body} · {vinResult.fuel} · Fields auto-filled below</div>
                </div>
              </div>
            )}
            {vinResult?.error && (
              <div style={{ padding:'10px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, marginBottom:16, fontSize:12, color:'var(--danger)' }}>
                <AlertTriangle size={13} /> {vinResult.error}
              </div>
            )}

            {/* Form fields */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              {[
                { key:'year',         label:'Year',              ph:'2021',         note: vinResult && !vinResult.error ? 'from VIN' : '' },
                { key:'make',         label:'Make',              ph:'Freightliner', note: vinResult && !vinResult.error ? 'from VIN' : '' },
                { key:'model',        label:'Model',             ph:'Cascadia',     note: vinResult && !vinResult.error ? 'from VIN' : '' },
                { key:'color',        label:'Color',             ph:'White' },
                { key:'plate',        label:'License Plate',     ph:'MN-94821' },
                { key:'gvw',          label:'GVW',               ph:'80,000 lbs',   note: vinResult && !vinResult.error ? 'from VIN' : '' },
                { key:'odometer',     label:'Current Odometer',  ph:'125000' },
                { key:'driver',       label:'Assigned Driver',   ph:'James Tucker' },
                { key:'regExpiry',    label:'Registration Expiry',ph:'Dec 2026' },
                { key:'insExpiry',    label:'Insurance Expiry',   ph:'Jun 2026' },
                { key:'dotInspection',label:'DOT Inspection',     ph:'Dec 2025' },
                { key:'unit_cost',    label:'Purchase Cost ($)',  ph:'128000' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:11, color: f.note ? 'var(--success)' : 'var(--muted)', display:'block', marginBottom:4 }}>{f.label} {f.note && <span style={{ fontSize:10 }}>{f.note}</span>}</label>
                  <input value={newTruck[f.key]} onChange={e => setNewTruck(t => ({ ...t, [f.key]: e.target.value }))}
                    placeholder={f.ph}
                    style={{ width:'100%', background: f.note ? 'rgba(34,197,94,0.05)' : 'var(--surface2)', border:`1px solid ${f.note ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }} />
                </div>
              ))}
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'12px 0', fontSize:14 }} onClick={saveTruck}
                disabled={!newTruck.vin || !newTruck.make}>
                <Truck size={13} /> Add Truck to Fleet
              </button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'12px 0' }} onClick={() => { setShowAddTruck(false); setVinResult(null); setNewTruck(BLANK_TRUCK) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Truck sidebar ── */}
      <div style={{ width:200, flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'14px 16px 8px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2 }}>FLEET ({trucks.length})</div>
        </div>
        {trucks.map(t => {
          const isSel = selectedTruck === t.id
          const hasAlert = t.regExpiry && expiryColor(t.regExpiry) !== 'var(--success)' || t.insExpiry && expiryColor(t.insExpiry) !== 'var(--success)'
          return (
            <div key={t.id} onClick={() => setSelectedTruck(t.id)}
              style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`, background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.15s' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <div style={{ fontSize:13, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)' }}><Ic icon={Truck} /> {t.unit}</div>
                {hasAlert && <span style={{ fontSize:11 }}><AlertTriangle size={18} /></span>}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{t.year} {t.make}</div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:t.statusColor }} />
                <span style={{ fontSize:10, color:t.statusColor, fontWeight:700 }}>{t.status}</span>
              </div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{t.odometer.toLocaleString()} mi</div>
            </div>
          )
        })}
        <div style={{ padding:12, marginTop:'auto', borderTop:'1px solid var(--border)' }}>
          <button className="btn btn-primary" style={{ width:'100%', fontSize:11 }} onClick={() => setShowAddTruck(true)}>+ Add Truck</button>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {!truck ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:14 }}>No trucks added yet. Click "+ Add Truck" to get started.</div>
        ) : (<>
        {/* Truck header */}
        <div style={{ flexShrink:0, padding:'14px 20px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ width:44, height:44, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}><Truck size={20} /></div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:2 }}>
              <span style={{ fontSize:16, fontWeight:800 }}>{truck.unit} — {truck.year} {truck.make} {truck.model}</span>
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:truck.statusColor+'15', color:truck.statusColor }}>{truck.status}</span>
            </div>
            <div style={{ fontSize:12, color:'var(--muted)' }}>
              {truck.plate} · VIN {truck.vin.slice(-6)} · {truck.driver} · {truck.odometer.toLocaleString()} mi
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast('','Edit','Opening truck profile editor...')}><Ic icon={PencilIcon} /> Edit</button>
            <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { setSubTab('maintenance'); setShowAddService(true) }}><Ic icon={Wrench} /> Log Service</button>
            <button className="btn btn-primary" style={{ fontSize:11 }} onClick={() => showToast('','Fleet Map','Locating ' + truck.unit + '...')}><Ic icon={Radio} /> Track Live</button>
          </div>
        </div>

        {/* Sub-nav */}
        <div style={{ flexShrink:0, display:'flex', gap:2, padding:'0 20px', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
          {[
            { id:'profile',     label:'Profile' },
            { id:'maintenance', label:'Maintenance' },
            { id:'analytics',   label:'Analytics' },
          ].map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              style={{ padding:'10px 16px', border:'none', borderBottom: subTab===t.id ? '2px solid var(--accent)' : '2px solid transparent', background:'transparent', color: subTab===t.id ? 'var(--accent)' : 'var(--muted)', fontSize:12, fontWeight: subTab===t.id ? 700 : 500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:-1 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>

          {/* ── PROFILE TAB ── */}
          {subTab === 'profile' && (
            <>
              {/* Expiry alerts */}
              {[
                { label:'Registration', expiry: truck.regExpiry },
                { label:'Insurance',    expiry: truck.insExpiry },
                { label:'DOT Inspection', expiry: truck.dotInspection },
              ].filter(item => expiryColor(item.expiry) !== 'var(--success)').map(item => (
                <div key={item.label} style={{ padding:'12px 16px', background: expiryColor(item.expiry)==='var(--danger)' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border:`1px solid ${expiryColor(item.expiry)}30`, borderRadius:10, display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:18 }}>{expiryColor(item.expiry)==='var(--danger)' ? <Siren size={18} /> : <AlertTriangle size={18} />}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color: expiryColor(item.expiry) }}>{item.label} {expiryColor(item.expiry)==='var(--danger)' ? 'EXPIRED' : 'expiring soon'} — {item.expiry}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>Update before dispatching this truck</div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast('','Renew',item.label + ' renewal form opening...')}>Renew Now</button>
                </div>
              ))}

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {/* Truck details */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={Truck} /> Unit Details</div>
                  <div style={{ padding:16, display:'flex', flexDirection:'column', gap:0 }}>
                    {[
                      { label:'Year / Make / Model', value:`${truck.year} ${truck.make} ${truck.model}` },
                      { label:'VIN',                 value: truck.vin, mono: true },
                      { label:'License Plate',       value: truck.plate },
                      { label:'Color',               value: truck.color },
                      { label:'GVW Rating',          value: truck.gvw },
                      { label:'Fuel Type',           value: truck.fuel },
                      { label:'Odometer',            value: truck.odometer.toLocaleString() + ' mi' },
                      { label:'Assigned Driver',     value: truck.driver, color:'var(--accent2)' },
                      { label:'Purchase Cost',       value: '$' + truck.unit_cost.toLocaleString(), color:'var(--accent)' },
                    ].map(item => (
                      <div key={item.label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:12, color:'var(--muted)' }}>{item.label}</span>
                        <span style={{ fontSize:12, fontWeight:700, color: item.color || 'var(--text)', fontFamily: item.mono ? 'monospace' : 'inherit' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Compliance & documents */}
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                    <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={FileText} /> Compliance Dates</div>
                    <div style={{ padding:16, display:'flex', flexDirection:'column', gap:0 }}>
                      {[
                        { label:'Registration Expiry', value: truck.regExpiry,       expiry: truck.regExpiry },
                        { label:'Insurance Expiry',    value: truck.insExpiry,       expiry: truck.insExpiry },
                        { label:'DOT Inspection',      value: truck.dotInspection,   expiry: truck.dotInspection },
                      ].map(item => (
                        <div key={item.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                          <span style={{ fontSize:12, color:'var(--muted)' }}>{item.label}</span>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:12, fontWeight:700 }}>{item.value}</span>
                            <span style={{ fontSize:10, color: expiryColor(item.expiry) }}>{expiryLabel(item.expiry)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                    <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ fontWeight:700, fontSize:13 }}><Ic icon={Paperclip} /> Documents</div>
                      <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast('','Upload','Select document to attach...')}>+ Upload</button>
                    </div>
                    <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8 }}>
                      {[
                        { name:'Registration Card.pdf',    type:'Registration', date:'Dec 2024' },
                        { name:'Insurance Certificate.pdf',type:'Insurance',    date:'Jan 2025' },
                        { name:'Last Inspection.pdf',      type:'DOT Inspection',date:'Dec 2024' },
                      ].map(doc => (
                        <div key={doc.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'var(--surface2)', borderRadius:8 }}>
                          <span style={{ fontSize:16 }}><FileText size={16} /></span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.name}</div>
                            <div style={{ fontSize:10, color:'var(--muted)' }}>{doc.type} · {doc.date}</div>
                          </div>
                          <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast('','View',doc.name)}>View</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── MAINTENANCE TAB ── */}
          {subTab === 'maintenance' && (
            <>
              {/* Stats */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
                {[
                  { label:'Services Logged',  value: truckLogs.length,                         color:'var(--accent)' },
                  { label:'Total Maint Cost', value:'$' + totalMaintCost.toLocaleString(),      color:'var(--danger)' },
                  { label:'Last Service',     value: truckLogs[0]?.date || '—',                color:'var(--accent2)' },
                  { label:'Next Due',         value: truckLogs[0]?.nextDue || '—',             color: truckLogs[0]?.nextDue?.includes('warning') ? 'var(--warning)' : 'var(--success)' },
                ].map(s => (
                  <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'13px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Add service form */}
              {showAddService && (
                <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:12, padding:18 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)', marginBottom:14 }}><Ic icon={Wrench} /> Log New Service — {truck.unit}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:12 }}>
                    {[
                      { key:'date',    label:'Date',         type:'text',   ph:'Mar 8' },
                      { key:'mileage', label:'Mileage',      type:'number', ph: truck.odometer.toString() },
                      { key:'cost',    label:'Cost ($)',      type:'number', ph:'250' },
                      { key:'shop',    label:'Shop / Location', type:'text', ph:'Speedco Chicago' },
                      { key:'nextDue', label:'Next Due',     type:'text',   ph:'295,000 mi or Jun 2025' },
                      { key:'notes',   label:'Notes',        type:'text',   ph:'What was done...' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                        <input type={f.type} placeholder={f.ph} value={newService[f.key]}
                          onChange={e => setNewService(s => ({ ...s, [f.key]: e.target.value }))}
                          style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Service Type</label>
                      <select value={newService.type} onChange={e => setNewService(s => ({ ...s, type:e.target.value }))}
                        style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif" }}>
                        {SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:10 }}>
                    <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }} onClick={addService}><Ic icon={Check} /> Log Service</button>
                    <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setShowAddService(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Service history */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}><Ic icon={Wrench} /> Service History — {truck.unit}</div>
                  <button className="btn btn-primary" style={{ fontSize:11 }} onClick={() => setShowAddService(s => !s)}>{showAddService ? '✕ Cancel' : '+ Log Service'}</button>
                </div>
                <div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
                  <thead><tr style={{ background:'var(--surface2)', borderBottom:'1px solid var(--border)' }}>
                    {['Date','Mileage','Service Type','Cost','Shop','Next Due','Notes'].map(h => (
                      <th key={h} style={{ padding:'9px 14px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {truckLogs.map((log, i) => (
                      <tr key={log.id} style={{ borderBottom:'1px solid var(--border)', background: i%2===0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                        <td style={{ padding:'11px 14px', fontSize:12, color:'var(--muted)' }}>{log.date}</td>
                        <td style={{ padding:'11px 14px', fontSize:12, fontFamily:'monospace' }}>{log.mileage.toLocaleString()}</td>
                        <td style={{ padding:'11px 14px', fontSize:13, fontWeight:600 }}>{log.type}</td>
                        <td style={{ padding:'11px 14px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--danger)' }}>${log.cost.toLocaleString()}</td>
                        <td style={{ padding:'11px 14px', fontSize:12, color:'var(--muted)' }}>{log.shop}</td>
                        <td style={{ padding:'11px 14px', fontSize:11, color: log.nextDue?.includes('warning') ? 'var(--warning)' : 'var(--accent2)', fontWeight:600 }}>{log.nextDue}</td>
                        <td style={{ padding:'11px 14px', fontSize:11, color:'var(--muted)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{log.notes}</td>
                      </tr>
                    ))}
                    {truckLogs.length === 0 && (
                      <tr><td colSpan={7} style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No service records yet — log the first service above</td></tr>
                    )}
                  </tbody>
                </table></div>
              </div>
            </>
          )}

          {/* ── ANALYTICS TAB ── */}
          {subTab === 'analytics' && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
                {[
                  { label:'6-Week Revenue',  value:'$' + totalRev.toLocaleString(),    color:'var(--accent)' },
                  { label:'Operating Cost',  value:'$' + totalCost.toLocaleString(),   color:'var(--danger)' },
                  { label:'Net Profit',      value:'$' + netProfit.toLocaleString(),   color:'var(--success)', large:true },
                  { label:'Avg MPG',         value: avgMpg,                            color: parseFloat(avgMpg) < 6.8 ? 'var(--warning)' : 'var(--success)' },
                ].map(s => (
                  <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'13px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: s.large ? 28 : 22, color:s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {/* Revenue vs Cost chart */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
                    <div style={{ fontWeight:700, fontSize:13 }}><Ic icon={DollarSign} /> Revenue vs Cost — {truck.unit}</div>
                    <div style={{ display:'flex', gap:10 }}>
                      {[{c:'var(--accent)',label:'Revenue'},{c:'var(--danger)',label:'Cost'},{c:'var(--success)',label:'Net'}].map(x=>(
                        <div key={x.label} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, color:'var(--muted)' }}>
                          <div style={{ width:7,height:7,borderRadius:2,background:x.c }}/>
                          {x.label}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:16 }}>
                    <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:130 }}>
                      {WEEKS.map((w,i) => {
                        const net = truck.revenue[i] - truck.opCost[i]
                        return (
                          <div key={w} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                            <div style={{ width:'100%', display:'flex', gap:2, alignItems:'flex-end', height:110, justifyContent:'center' }}>
                              <div style={{ width:'30%', height:`${(truck.revenue[i]/maxRev)*108}px`, background:'var(--accent)', borderRadius:'3px 3px 0 0', opacity:0.8 }}/>
                              <div style={{ width:'30%', height:`${(truck.opCost[i]/maxRev)*108}px`, background:'var(--danger)', borderRadius:'3px 3px 0 0', opacity:0.8 }}/>
                              <div style={{ width:'30%', height:`${(net/maxRev)*108}px`, background:'var(--success)', borderRadius:'3px 3px 0 0' }}/>
                            </div>
                            <div style={{ fontSize:10, color:'var(--muted)' }}>{w}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* MPG trend */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={Fuel} /> MPG Trend — {truck.unit}</div>
                  <div style={{ padding:16 }}>
                    <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:130 }}>
                      {truck.mpg.map((v,i) => {
                        const pct = ((v - 5.5) / 3) * 100
                        const color = v < 6.5 ? 'var(--warning)' : v < 7.0 ? 'var(--accent2)' : 'var(--success)'
                        return (
                          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                            <div style={{ fontSize:10, fontWeight:700, color }}>{v}</div>
                            <div style={{ width:'60%', height:`${pct}px`, background:color, borderRadius:'3px 3px 0 0', maxHeight:90 }}/>
                            <div style={{ fontSize:10, color:'var(--muted)' }}>{WEEKS[i]}</div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ marginTop:10, padding:'8px 12px', background:'var(--surface2)', borderRadius:8, fontSize:12, color:'var(--muted)' }}>
                      {parseFloat(avgMpg) < 6.8
                        ? `Avg ${avgMpg} MPG is below fleet target (6.8). Check tire pressure and consider DPF cleaning.`
                        : `Avg ${avgMpg} MPG — performing at or above fleet target.`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Miles per week */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontWeight:700, fontSize:13 }}><Ic icon={MapPin} /> Miles per Week — {truck.unit}</div>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:'var(--accent2)' }}>{totalMiles.toLocaleString()} total</span>
                </div>
                <div style={{ padding:'16px 20px', display:'flex', alignItems:'flex-end', gap:8, height:90 }}>
                  {truck.miles.map((m,i) => (
                    <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                      <div style={{ fontSize:10, color:'var(--accent2)', fontWeight:700 }}>{m.toLocaleString()}</div>
                      <div style={{ width:'70%', height:`${(m / Math.max(...truck.miles)) * 55}px`, background:'var(--accent2)', borderRadius:'3px 3px 0 0', opacity:0.7 }}/>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>{WEEKS[i]}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Utilization breakdown */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12 }}>
                {[
                  { label:'Revenue per Mile', value:'$' + (totalRev / totalMiles).toFixed(2) + '/mi', icon: DollarSign, color:'var(--accent)', note:'6-week avg across all loads' },
                  { label:'Cost per Mile',    value:'$' + (totalCost / totalMiles).toFixed(2) + '/mi', icon: DollarSign, color:'var(--danger)', note:'Fuel + maintenance + insurance' },
                  { label:'Net per Mile',     value:'$' + ((totalRev - totalCost) / totalMiles).toFixed(2) + '/mi', icon: TrendingUp, color:'var(--success)', note:'What this truck actually earns' },
                ].map(s => (
                  <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'16px 18px', display:'flex', gap:12, alignItems:'center' }}>
                    <span style={{ fontSize:24 }}>{typeof s.icon === "string" ? s.icon : <s.icon size={24} />}</span>
                    <div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{s.label}</div>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color:s.color }}>{s.value}</div>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>{s.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </>)}
      </div>
    </div>
  )
}

// ─── AI DRIVER ONBOARDING ─────────────────────────────────────────────────────
const PE_CHECKS = [
  { id:'drug',         icon: FlaskConical, label:'Drug & Alcohol Test',        provider:'First Advantage',   eta:'1–3 days',  required:true,  reg:'FMCSA §382.301',  desc:'DOT 5-panel urine specimen · Clearinghouse enrollment' },
  { id:'clearinghouse',icon: Search, label:'Clearinghouse Full Query',   provider:'FMCSA',             eta:'Instant',   required:true,  reg:'FMCSA §382.701',  desc:'Drug & alcohol violation history — required before first dispatch' },
  { id:'mvr',          icon: Truck, label:'Motor Vehicle Record',       provider:'SambaSafety',       eta:'Instant',   required:true,  reg:'FMCSA §391.23',   desc:'3-year driving history · license validity · all licensed states' },
  { id:'psp',          icon: FileText, label:'PSP Safety Report',          provider:'FMCSA PSP',         eta:'1–2 hrs',   required:true,  reg:'FMCSA §391.23',   desc:'5-year crash history · 3-year roadside inspection record' },
  { id:'employment',   icon: Phone, label:'Employment Verification',    provider:'Manual / Checkr',   eta:'2–5 days',  required:true,  reg:'FMCSA §391.23',   desc:'3 years of prior employer contacts · driving history form' },
  { id:'cdl',          icon: FileCheck, label:'CDL Verification',           provider:'State DMV',         eta:'Instant',   required:true,  reg:'FMCSA §391.11',   desc:'License class · endorsements · restrictions · expiry date' },
  { id:'road_test',    icon: Truck, label:'Road Test',                  provider:'In-House',          eta:'Scheduled', required:true,  reg:'FMCSA §391.31',   desc:'Must be completed and signed off before first dispatch' },
  { id:'medical',      icon: Building2, label:'DOT Medical Certificate',    provider:'Certified MEC',     eta:'Same day',  required:true,  reg:'FMCSA §391.41',   desc:'DOT physical exam · 2-year expiry · must be on file' },
  { id:'eld',          icon: Activity, label:'ELD Provisioning',           provider:'Samsara',           eta:'15 min',    required:false, reg:'FMCSA §395.8',    desc:'Device pairing · HOS setup · co-driver linking' },
  { id:'pay',          icon: CreditCard, label:'Pay & Banking Setup',        provider:'In-House',          eta:'Same day',  required:false, reg:'Internal',        desc:'Direct deposit · FastPay enrollment · pay model selection' },
]

const PE_STATUS_META = {
  idle:       { label:'Not Started', color:'var(--muted)',    bg:'rgba(74,85,112,0.15)'  },
  ordered:    { label:'Ordered',     color:'var(--accent3)',  bg:'rgba(77,142,240,0.12)' },
  processing: { label:'Processing',  color:'var(--accent)',   bg:'rgba(240,165,0,0.12)'  },
  cleared:    { label:'Cleared',   color:'var(--success)',  bg:'rgba(34,197,94,0.12)'  },
  failed:     { label:'Failed',    color:'var(--danger)',   bg:'rgba(239,68,68,0.12)'  },
  manual:     { label:'Manual',      color:'var(--accent2)',  bg:'rgba(0,212,170,0.12)'  },
  waived:     { label:'Waived',      color:'var(--muted)',    bg:'rgba(74,85,112,0.12)'  },
}

const SAMPLE_ONBOARDS = []

export function DriverOnboarding() {
  const { showToast } = useApp()
  const { addDriver: dbAddDriver } = useCarrier()
  const [drivers, setDrivers] = useState(SAMPLE_ONBOARDS)
  const [selected, setSelected] = useState('d2')
  const [showAdd, setShowAdd] = useState(false)
  const [newDriver, setNewDriver] = useState({ name:'', cdl:'CDL-A', cdlNum:'', phone:'', email:'', dob:'', state:'' })
  const [ordering, setOrdering] = useState(false)

  const driver = drivers.find(d => d.id === selected)

  const getEligibility = (checks) => {
    const required = PE_CHECKS.filter(c => c.required)
    const allCleared = required.every(c => checks[c.id] === 'cleared' || checks[c.id] === 'waived')
    const anyFailed  = required.some(c => checks[c.id] === 'failed')
    const anyPending = required.some(c => ['idle','ordered','processing','manual'].includes(checks[c.id]))
    if (anyFailed)  return { label:'NOT ELIGIBLE', color:'var(--danger)',  bg:'rgba(239,68,68,0.1)' }
    if (allCleared) return { label:'ELIGIBLE TO HIRE', color:'var(--success)', bg:'rgba(34,197,94,0.1)' }
    if (anyPending) return { label:'PENDING CHECKS', color:'var(--accent)', bg:'rgba(240,165,0,0.1)' }
    return { label:'NOT STARTED', color:'var(--muted)', bg:'rgba(74,85,112,0.1)' }
  }

  const getClearedCount = (checks) => PE_CHECKS.filter(c => checks[c.id] === 'cleared' || checks[c.id] === 'waived').length

  const orderAllChecks = async () => {
    if (!driver) return
    setOrdering(true)
    // Mark idle checks as ordered
    setDrivers(ds => ds.map(d => {
      if (d.id !== selected) return d
      const next = { ...d.checks }
      PE_CHECKS.forEach(c => { if (next[c.id] === 'idle') next[c.id] = 'ordered' })
      return { ...d, checks: next }
    }))
    showToast('', 'All Checks Ordered', '10 pre-employment checks submitted')

    // Try real API calls via Edge Function
    try {
      const { startOnboarding } = await import('../lib/onboarding')
      const result = await startOnboarding(driver)
      if (result.started.length > 0) {
        showToast('success', 'APIs Called', result.started.join(', ') + ' ordered via providers')
      }
    } catch (err) {
      console.warn('Provider API calls pending setup:', err.message)
    }

    // Update UI to processing after a short delay
    setTimeout(() => {
      setDrivers(ds => ds.map(d => {
        if (d.id !== selected) return d
        const next = { ...d.checks }
        PE_CHECKS.forEach(c => { if (next[c.id] === 'ordered') next[c.id] = 'processing' })
        return { ...d, checks: next }
      }))
      setOrdering(false)
    }, 1800)
  }

  const markCheck = async (checkId, status, result) => {
    setDrivers(ds => ds.map(d => {
      if (d.id !== selected) return d
      const checks = { ...d.checks, [checkId]: status }
      const results = result ? { ...d.results, [checkId]: result } : d.results
      return { ...d, checks, results }
    }))
    const meta = PE_STATUS_META[status]
    showToast('', PE_CHECKS.find(c=>c.id===checkId)?.label || '', meta?.label || '')

    // Auto-advance: when a check is cleared, try to order the next ones
    if (status === 'cleared' && driver) {
      try {
        const { autoAdvance } = await import('../lib/onboarding')
        const result = await autoAdvance(driver, checkId, true)
        if (result.started.length > 0) {
          // Mark auto-ordered checks in UI
          setDrivers(ds => ds.map(d => {
            if (d.id !== selected) return d
            const next = { ...d.checks }
            result.started.forEach(id => { if (next[id] === 'idle') next[id] = 'ordered' })
            return { ...d, checks: next }
          }))
          showToast('', 'Auto-Advanced', result.started.join(', ') + ' auto-ordered')
        }
      } catch (err) {
        console.warn('Auto-advance pending setup:', err.message)
      }
    }
  }

  const addDriver = async () => {
    if (!newDriver.name) return
    const id = 'd' + Date.now()
    const avatar = newDriver.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
    // Save to local onboarding list
    setDrivers(ds => [...ds, {
      id, name:newDriver.name, cdl:newDriver.cdl, cdlNum:newDriver.cdlNum,
      phone:newDriver.phone, email:newDriver.email, dob:newDriver.dob, state:newDriver.state,
      added: new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' }), avatar,
      checks: Object.fromEntries(PE_CHECKS.map(c => [c.id, 'idle'])),
      results:{}, medExpiry:'', cdlExpiry:'',
    }])
    setSelected(id)
    setShowAdd(false)
    // Save to Supabase
    try {
      await dbAddDriver({
        full_name: newDriver.name,
        phone: newDriver.phone,
        email: newDriver.email,
        license_number: newDriver.cdlNum,
        license_state: newDriver.state,
        status: 'Onboarding',
        hire_date: new Date().toISOString().split('T')[0],
      })
    } catch (err) { console.warn('DB save failed:', err.message) }

    // Auto-send consent email + start phase 1 checks
    if (newDriver.email) {
      try {
        const { startOnboarding } = await import('../lib/onboarding')
        await startOnboarding(newDriver)
        showToast('success', 'Consent Email Sent', `Sent to ${newDriver.email}`)
      } catch (err) { console.warn('Auto-onboard pending setup:', err.message) }
    }

    const driverName = newDriver.name
    setNewDriver({ name:'', cdl:'CDL-A', cdlNum:'', phone:'', email:'', dob:'', state:'' })
    showToast('', 'Driver Added', driverName + ' — ready to order pre-employment checks')
  }

  const inp = { width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box', outline:'none' }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* Add Driver Modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setShowAdd(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:16, width:460, padding:28, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1, marginBottom:2 }}>NEW DRIVER</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:20 }}>Enter driver info to start pre-employment screening</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              {[
                { key:'name',   label:'Full Legal Name',  ph:'James Tucker',      span:2 },
                { key:'phone',  label:'Phone',            ph:'(612) 555-0198' },
                { key:'email',  label:'Email',            ph:'driver@email.com' },
                { key:'dob',    label:'Date of Birth',    ph:'Apr 12, 1988' },
                { key:'state',  label:'License State',    ph:'IL' },
                { key:'cdlNum', label:'CDL Number',       ph:'IL-CDL-449821',     span:2 },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: f.span ? `span ${f.span}` : undefined }}>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                  <input value={newDriver[f.key]} onChange={e => setNewDriver(d => ({ ...d, [f.key]: e.target.value }))} placeholder={f.ph} style={inp} />
                </div>
              ))}
              <div style={{ gridColumn:'span 2' }}>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>CDL Class</label>
                <select value={newDriver.cdl} onChange={e => setNewDriver(d => ({ ...d, cdl: e.target.value }))}
                  style={{ ...inp }}>
                  {['CDL-A','CDL-B','CDL-C'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16, padding:'10px 14px', background:'rgba(77,142,240,0.08)', borderRadius:8, border:'1px solid rgba(77,142,240,0.15)' }}>
              ℹ A written consent form will be sent to the driver's email before drug testing and background checks are ordered.
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'12px 0' }} onClick={addDriver} disabled={!newDriver.name}><Ic icon={Sparkles} /> Add Driver</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'12px 0' }} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* LEFT SIDEBAR */}
      <div style={{ width:220, flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:2 }}>PRE-EMPLOYMENT</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>{drivers.length} drivers in pipeline</div>
        </div>
        <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
          {drivers.map(d => {
            const isSel = selected === d.id
            const elig = getEligibility(d.checks)
            const cleared = getClearedCount(d.checks)
            const pctLocal = Math.round((cleared / PE_CHECKS.length) * 100)
            return (
              <div key={d.id} onClick={() => setSelected(d.id)}
                style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                  background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.15s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <div style={{ width:30, height:30, borderRadius:'50%', background:`${elig.color}20`, border:`1.5px solid ${elig.color}50`,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:elig.color, flexShrink:0 }}>
                    {d?.avatar || '?'}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: isSel ? 'var(--accent)' : 'var(--text)' }}>{d.name}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>{d.cdl} · Added {d.added}</div>
                  </div>
                </div>
                <div style={{ height:3, background:'var(--surface2)', borderRadius:2, overflow:'hidden', marginBottom:4 }}>
                  <div style={{ height:'100%', width:`${pctLocal}%`, background:elig.color, borderRadius:2, transition:'width 0.4s' }}/>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:9, fontWeight:800, color:elig.color }}>{elig.label}</span>
                  <span style={{ fontSize:9, color:'var(--muted)' }}>{cleared}/{PE_CHECKS.length} cleared</span>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding:12, borderTop:'1px solid var(--border)', flexShrink:0 }}>
          <button className="btn btn-primary" style={{ width:'100%', fontSize:11 }} onClick={() => setShowAdd(true)}>+ New Driver</button>
        </div>
      </div>

      {/* RIGHT CONTENT */}
      {driver && (() => {
        const elig = getEligibility(driver.checks)
        const cleared = getClearedCount(driver.checks)
        const allIdle = PE_CHECKS.every(c => driver.checks[c.id] === 'idle')
        const hasOrdered = PE_CHECKS.some(c => ['ordered','processing'].includes(driver.checks[c.id]))
        const requiredCleared = PE_CHECKS.filter(c => c.required).every(c => driver.checks[c.id] === 'cleared' || driver.checks[c.id] === 'waived')

        return (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

            {/* Header */}
            <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ width:46, height:46, borderRadius:'50%', background:`${elig.color}18`, border:`2px solid ${elig.color}50`,
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:elig.color, flexShrink:0 }}>
                {driver?.avatar || '?'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4, flexWrap:'wrap' }}>
                  <span style={{ fontSize:16, fontWeight:800 }}>{driver.name}</span>
                  <span style={{ fontSize:10, fontWeight:800, padding:'3px 10px', borderRadius:8, background:elig.bg, color:elig.color, letterSpacing:0.5 }}>{elig.label}</span>
                  {driver.cdlNum && <span style={{ fontSize:11, color:'var(--muted)', fontFamily:'monospace' }}>{driver.cdlNum}</span>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ background:'var(--surface2)', borderRadius:3, height:5, width:160, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${Math.round((cleared/PE_CHECKS.length)*100)}%`, background:elig.color, borderRadius:3, transition:'width 0.4s' }}/>
                  </div>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>{cleared}/{PE_CHECKS.length} checks cleared · {driver.cdl}</span>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                {requiredCleared
                  ? <button className="btn btn-primary" style={{ fontSize:11 }}
                      onClick={() => showToast('','Driver Activated', driver.name + ' added to active fleet!')}>
                      <Zap size={13} /> Activate & Add to Fleet
                    </button>
                  : allIdle
                    ? <button className="btn btn-primary" style={{ fontSize:12, padding:'8px 20px' }} onClick={orderAllChecks} disabled={ordering}>
                        {ordering ? '...' : <><Zap size={13} /> Order All Checks</>}
                      </button>
                    : <button className="btn btn-ghost" style={{ fontSize:11 }}
                        onClick={() => showToast('','Reminder Sent', 'Consent form re-sent to ' + driver.email)}>
                        <Send size={13} /> Send Reminder
                      </button>
                }
              </div>
            </div>

            {/* AI banner */}
            <div style={{ flexShrink:0, margin:'14px 24px 0', padding:'12px 16px',
              background:'linear-gradient(135deg,rgba(240,165,0,0.07),rgba(77,142,240,0.04))',
              border:'1px solid rgba(240,165,0,0.2)', borderRadius:10, display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:20 }}><Bot size={20} /></span>
              <div style={{ flex:1 }}>
                {requiredCleared
                  ? <><div style={{ fontSize:12, fontWeight:700, color:'var(--success)' }}>All required checks cleared — driver is eligible to hire</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>Complete ELD pairing and banking setup, then activate</div></>
                  : allIdle
                    ? <><div style={{ fontSize:12, fontWeight:700, color:'var(--accent)' }}>Ready to start pre-employment screening</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>Click "Order All Checks" to submit all {PE_CHECKS.filter(c=>c.required).length} required FMCSA checks at once</div></>
                    : <><div style={{ fontSize:12, fontWeight:700, color:'var(--accent)' }}>
                          {PE_CHECKS.filter(c => ['ordered','processing'].includes(driver.checks[c.id])).length} check{PE_CHECKS.filter(c => ['ordered','processing'].includes(driver.checks[c.id])).length !== 1 ? 's' : ''} in progress
                          · {PE_CHECKS.filter(c => driver.checks[c.id] === 'failed').length > 0 ? `${PE_CHECKS.filter(c => driver.checks[c.id] === 'failed').length} failed — review required` : 'no issues detected'}
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>
                          Estimated completion: {PE_CHECKS.filter(c => driver.checks[c.id] === 'processing' && c.eta.includes('day')).length > 0 ? '2–5 business days' : 'Today'}
                        </div>
                      </>
                }
              </div>
              {allIdle && (
                <button className="btn btn-primary" style={{ fontSize:11, flexShrink:0 }} onClick={orderAllChecks} disabled={ordering}>
                  {ordering ? '...' : <><Zap size={13} /> Order All</>}
                </button>
              )}
            </div>

            {/* Checks list */}
            <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:'14px 24px', display:'flex', flexDirection:'column', gap:8 }}>

              {/* Required checks */}
              <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:1.5, marginBottom:2 }}>REQUIRED — FMCSA REGULATIONS</div>
              {PE_CHECKS.filter(c => c.required).map(check => {
                const status = driver.checks[check.id] || 'idle'
                const meta = PE_STATUS_META[status]
                const result = driver.results?.[check.id]
                return (
                  <div key={check.id} style={{ background:'var(--surface)', border:`1px solid ${status === 'cleared' ? 'rgba(34,197,94,0.2)' : status === 'failed' ? 'rgba(239,68,68,0.2)' : status === 'processing' || status === 'ordered' ? 'rgba(240,165,0,0.2)' : 'var(--border)'}`,
                    borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'center', gap:14, transition:'all 0.2s' }}>
                    {/* Icon */}
                    <div style={{ width:38, height:38, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17,
                      background: meta.bg, border:`1px solid ${meta.color}30` }}>
                      {status === 'cleared' ? <Check size={14} /> : (typeof check.icon === 'string' ? check.icon : <check.icon size={14} />)}
                    </div>
                    {/* Info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                        <span style={{ fontSize:13, fontWeight:700 }}>{check.label}</span>
                        <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:6, background:meta.bg, color:meta.color, letterSpacing:0.5 }}>{meta.label}</span>
                        <span style={{ fontSize:10, color:'var(--muted)', marginLeft:'auto' }}>{check.provider} · {check.reg}</span>
                      </div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>
                        {result
                          ? <span style={{ color: status === 'cleared' ? 'var(--success)' : status === 'failed' ? 'var(--danger)' : 'var(--text)' }}>{result}</span>
                          : check.desc}
                      </div>
                      {(status === 'ordered' || status === 'processing') && (
                        <div style={{ marginTop:5, display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ width:80, height:3, background:'var(--surface2)', borderRadius:2, overflow:'hidden' }}>
                            <div style={{ height:'100%', background:'var(--accent)', borderRadius:2, width: status === 'processing' ? '60%' : '20%', transition:'width 0.4s' }}/>
                          </div>
                          <span style={{ fontSize:10, color:'var(--muted)' }}>ETA {check.eta}</span>
                        </div>
                      )}
                    </div>
                    {/* Actions */}
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      {status === 'idle' && (
                        <button className="btn btn-ghost" style={{ fontSize:11 }}
                          onClick={() => { markCheck(check.id, 'ordered', null); setTimeout(() => markCheck(check.id, 'processing', null), 1200) }}>
                          Order
                        </button>
                      )}
                      {(status === 'ordered' || status === 'processing') && (
                        <button className="btn btn-success" style={{ fontSize:11 }}
                          onClick={() => markCheck(check.id, 'cleared', `Cleared — ${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`)}>
                          <Check size={13} /> Mark Cleared
                        </button>
                      )}
                      {(status === 'ordered' || status === 'processing') && (
                        <button className="btn btn-danger" style={{ fontSize:11 }}
                          onClick={() => markCheck(check.id, 'failed', 'Failed — manual review required')}>
                          <AlertCircle size={13} /> Flag
                        </button>
                      )}
                      {status === 'cleared' && (
                        <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast(check.icon,'View Result', result || check.label)}>View</button>
                      )}
                      {status === 'failed' && (
                        <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => markCheck(check.id, 'idle', null)}>Reset</button>
                      )}
                      {check.id === 'road_test' && status !== 'cleared' && (
                        <button className="btn btn-ghost" style={{ fontSize:11 }}
                          onClick={() => markCheck(check.id, 'cleared', 'Passed — road test completed ' + new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))}>
                          <FileText size={13} /> Log Test
                        </button>
                      )}
                      {check.id === 'medical' && status !== 'cleared' && (
                        <label style={{ fontSize:11, fontWeight:600, padding:'5px 10px', borderRadius:8, background:'var(--surface2)', border:'1px solid var(--border)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", color:'var(--text)', whiteSpace:'nowrap' }}>
                          <Paperclip size={13} /> Upload
                          <input type="file" accept=".pdf,image/*" style={{ display:'none' }}
                            onChange={e => { if(e.target.files?.[0]) markCheck(check.id,'cleared','Certificate uploaded · ' + e.target.files[0].name) }} />
                        </label>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Optional checks */}
              <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:1.5, marginTop:8, marginBottom:2 }}>OPTIONAL — RECOMMENDED</div>
              {PE_CHECKS.filter(c => !c.required).map(check => {
                const status = driver.checks[check.id] || 'idle'
                const meta = PE_STATUS_META[status]
                const result = driver.results?.[check.id]
                return (
                  <div key={check.id} style={{ background:'var(--surface)', border:`1px solid ${status === 'cleared' ? 'rgba(34,197,94,0.15)' : 'var(--border)'}`,
                    borderRadius:12, padding:'12px 18px', display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:34, height:34, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15,
                      background: meta.bg }}>
                      {status === 'cleared' ? <Check size={14} /> : (typeof check.icon === 'string' ? check.icon : <check.icon size={14} />)}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                        <span style={{ fontSize:13, fontWeight:600 }}>{check.label}</span>
                        <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:6, background:meta.bg, color:meta.color }}>{meta.label}</span>
                      </div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{result || check.desc}</div>
                    </div>
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      {check.id === 'eld' && status !== 'cleared' && (
                        <button className="btn btn-ghost" style={{ fontSize:11 }}
                          onClick={() => markCheck(check.id,'cleared','ELD paired · Samsara CM32')}><Ic icon={Activity} /> Pair ELD</button>
                      )}
                      {check.id === 'pay' && status !== 'cleared' && (
                        <button className="btn btn-ghost" style={{ fontSize:11 }}
                          onClick={() => markCheck(check.id,'cleared','Direct deposit linked · FastPay enrolled')}><Ic icon={CreditCard} /> Setup Pay</button>
                      )}
                      {status === 'cleared' && (
                        <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast(check.icon,'View',result||check.label)}>View</button>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Eligible banner */}
              {requiredCleared && (
                <div style={{ padding:'24px 20px', background:'linear-gradient(135deg,rgba(34,197,94,0.08),rgba(0,212,170,0.06))', border:'1px solid rgba(34,197,94,0.3)', borderRadius:12, textAlign:'center', marginTop:4 }}>
                  <div style={{ marginBottom:8 }}><Sparkles size={32} /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--success)', letterSpacing:1, marginBottom:6 }}>ELIGIBLE TO HIRE</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>All FMCSA required checks cleared — {driver.name} is ready to be dispatched</div>
                  <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                    <button className="btn btn-primary" style={{ padding:'11px 28px', fontSize:13 }}
                      onClick={() => showToast('','Driver Activated', driver.name + ' added to active fleet!')}>
                      <Zap size={13} /> Activate & Add to Fleet
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize:12 }}
                      onClick={() => showToast('','Report Generated', 'Pre-employment report saved')}>
                      <FileText size={13} /> Download Report
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

// ─── LANE INTELLIGENCE ────────────────────────────────────────────────────────
// Reference lane data — replaced by live lane analytics when connected
const LANES = [
  { id:'l1', from:'ATL', to:'CHI', fromFull:'Atlanta, GA',   toFull:'Chicago, IL',    miles:674,  loads:12, avgRpm:2.94, topRpm:3.20, avgGross:1981, trend:+8,  rating:'hot', ratingLabel:'HOT',    color:'var(--success)',  brokers:['Echo Global','Coyote Logistics','XPO'], backhaul:88, deadhead:22, equipment:'Dry Van' },
  { id:'l2', from:'DAL', to:'MIA', fromFull:'Dallas, TX',    toFull:'Miami, FL',      miles:1491, loads:8,  avgRpm:3.22, topRpm:3.45, avgGross:4802, trend:+12, rating:'hot', ratingLabel:'HOT',    color:'var(--success)',  brokers:['Echo Global','Transplace'],             backhaul:72, deadhead:15, equipment:'Dry Van/Reefer' },
  { id:'l3', from:'MEM', to:'NYC', fromFull:'Memphis, TN',   toFull:'New York, NY',   miles:1100, loads:6,  avgRpm:3.10, topRpm:3.55, avgGross:3410, trend:+5,  rating:'up', ratingLabel:'RISING', color:'var(--accent2)',  brokers:['Coyote Logistics','CH Robinson'],        backhaul:65, deadhead:8,  equipment:'Dry Van' },
  { id:'l4', from:'DEN', to:'HOU', fromFull:'Denver, CO',    toFull:'Houston, TX',    miles:1020, loads:5,  avgRpm:2.61, topRpm:2.90, avgGross:2662, trend:-3,  rating:'soft', ratingLabel:'SOFT',   color:'var(--warning)',  brokers:['Transplace','Worldwide Express'],        backhaul:42, deadhead:45, equipment:'Flatbed' },
  { id:'l5', from:'PHX', to:'LAX', fromFull:'Phoenix, AZ',   toFull:'Los Angeles, CA',miles:372,  loads:9,  avgRpm:2.41, topRpm:2.75, avgGross:897,  trend:+2,  rating:'steady', ratingLabel:'STEADY', color:'var(--muted)',    brokers:['Worldwide Express','Coyote Logistics'],  backhaul:55, deadhead:62, equipment:'Dry Van' },
  { id:'l6', from:'CHI', to:'ATL', fromFull:'Chicago, IL',   toFull:'Atlanta, GA',    miles:674,  loads:4,  avgRpm:2.72, topRpm:3.00, avgGross:1833, trend:-8,  rating:'down', ratingLabel:'WEAK',   color:'var(--danger)',   brokers:['CH Robinson'],                           backhaul:35, deadhead:30, equipment:'Dry Van' },
]

export function LaneIntel() {
  const { showToast } = useApp()
  const { loads } = useCarrier()
  const [selected, setSelected] = useState('l1')
  const [sortBy, setSortBy] = useState('rpm')

  // Compute real lane data from context loads
  const enrichedLanes = LANES.map(l => {
    const myLoads = loads.filter(ld =>
      ld.origin === l.fromFull && ld.dest === l.toFull
    )
    if (myLoads.length === 0) return l
    const realGrossAvg = Math.round(myLoads.reduce((s, ld) => s + ld.gross, 0) / myLoads.length)
    const realRpm = myLoads[0].miles > 0
      ? parseFloat((myLoads.reduce((s, ld) => s + ld.rate, 0) / myLoads.length).toFixed(2))
      : l.avgRpm
    return { ...l, loads: myLoads.length, avgRpm: realRpm, avgGross: realGrossAvg, _myLoads: myLoads }
  })

  const lane = enrichedLanes.find(l => l.id === selected)
  const sorted = [...enrichedLanes].sort((a, b) => sortBy === 'rpm' ? b.avgRpm - a.avgRpm : sortBy === 'trend' ? b.trend - a.trend : b.loads - a.loads)
  const laneHistory = lane._myLoads || []

  const estFuel = Math.round(lane.miles / 6.9 * 3.85)
  const estDriverPay = Math.round(lane.avgGross * 0.28)
  const estNet = lane.avgGross - estFuel - estDriverPay

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* Lane list sidebar */}
      <div style={{ width:220, flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'14px 16px 8px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:4 }}>LANE INTEL ({enrichedLanes.length})</div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'5px 8px', color:'var(--text)', fontSize:11, fontFamily:"'DM Sans',sans-serif" }}>
            <option value="rpm">Sort: Rate/Mile ↓</option>
            <option value="trend">Sort: Trend ↓</option>
            <option value="loads">Sort: Load Count ↓</option>
          </select>
        </div>
        {sorted.map(l => {
          const isSel = selected === l.id
          return (
            <div key={l.id} onClick={() => setSelected(l.id)}
              style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`, background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.15s' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                <div style={{ fontSize:13, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)' }}>{l.from} → {l.to}</div>
                <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:6, background:l.color+'18', color:l.color }}>{l.ratingLabel}</span>
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:3 }}>{l.miles} mi · {l.loads} loads</div>
              <div style={{ fontSize:13, fontWeight:700, color:l.color }}>${l.avgRpm}/mi avg</div>
              <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:4 }}>
                <span style={{ fontSize:10, color: l.trend > 0 ? 'var(--success)' : 'var(--danger)' }}>{l.trend > 0 ? '↑' : '↓'} {Math.abs(l.trend)}% rate trend</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Detail panel */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {lane && (
          <>
            {/* Header */}
            <div style={{ flexShrink:0, padding:'14px 22px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ flex:1 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:3 }}>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>{lane.fromFull} → {lane.toFull}</span>
                  <span style={{ fontSize:14 }}>{lane.rating === 'hot' ? <Flame size={14} /> : lane.rating === 'up' ? <TrendingUp size={14} /> : lane.rating === 'down' ? <TrendingDown size={14} /> : lane.rating === 'soft' ? <AlertTriangle size={14} /> : <ArrowRight size={14} />}</span>
                  <span style={{ fontSize:10, fontWeight:800, padding:'3px 10px', borderRadius:8, background:lane.color+'15', color:lane.color }}>{lane.ratingLabel}</span>
                </div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>{lane.miles} miles · {lane.equipment} · {lane.loads} loads in last 30 days</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast('','Saved','Lane ' + lane.from + '→' + lane.to + ' saved to watchlist')}><Ic icon={Star} /> Watch Lane</button>
                <button className="btn btn-primary" style={{ fontSize:11 }} onClick={() => showToast('','Dispatch','Opening AI Dispatch Copilot for ' + lane.from + '→' + lane.to)}><Ic icon={Zap} /> Find Load</button>
              </div>
            </div>

            {/* Content */}
            <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:'20px 20px 40px', display:'flex', flexDirection:'column', gap:16 }}>

              {/* Trend banner */}
              <div style={{ padding:'12px 18px', background: lane.trend > 0 ? 'rgba(34,197,94,0.07)' : 'rgba(239,68,68,0.07)', border:`1px solid ${lane.trend > 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`, borderRadius:10, display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:22 }}>{lane.trend > 8 ? <Flame size={22} /> : lane.trend > 0 ? <TrendingUp size={22} /> : <TrendingDown size={22} />}</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color: lane.trend > 0 ? 'var(--success)' : 'var(--danger)' }}>
                    Rates {lane.trend > 0 ? 'up' : 'down'} {Math.abs(lane.trend)}% on {lane.from}→{lane.to} this week
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>
                    {lane.trend > 5 ? 'Book now — market window closing. Top RPM available: $' + lane.topRpm + '/mi' :
                     lane.trend < 0 ? 'Soft market — consider backhaul or alternate routing' :
                     'Stable market — good steady lane for consistent loads'}
                  </div>
                </div>
              </div>

              {/* KPIs */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:12 }}>
                {[
                  { label:'Avg RPM',       value:'$' + lane.avgRpm + '/mi', color:'var(--accent)',  sub:'30-day avg' },
                  { label:'Top RPM',       value:'$' + lane.topRpm + '/mi', color:'var(--success)', sub:'Best spot rate' },
                  { label:'Avg Gross',     value:'$' + lane.avgGross.toLocaleString(), color:'var(--accent2)', sub:'Per load' },
                  { label:'Backhaul %',    value: lane.backhaul + '%',       color: lane.backhaul > 70 ? 'var(--success)' : 'var(--warning)', sub:'Return load avail' },
                  { label:'Deadhead',      value: lane.deadhead + ' mi',     color: lane.deadhead > 50 ? 'var(--danger)' : 'var(--success)', sub:'Avg empty miles' },
                ].map(s => (
                  <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:s.color, lineHeight:1 }}>{s.value}</div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{s.sub}</div>
                  </div>
                ))}
              </div>

              {/* Load economics + Brokers */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

                {/* Per-load economics */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={DollarSign} /> Load Economics · Avg Load</div>
                  <div style={{ padding:16, display:'flex', flexDirection:'column', gap:0 }}>
                    {[
                      { label:'Gross Revenue',  value:'$' + lane.avgGross.toLocaleString(),                       color:'var(--accent)' },
                      { label:'Est. Fuel Cost', value:'−$' + estFuel.toLocaleString(),                             color:'var(--danger)' },
                      { label:'Driver Pay (28%)',value:'−$' + estDriverPay.toLocaleString(),                       color:'var(--danger)' },
                      { label:'Net Profit',      value:'$' + estNet.toLocaleString(),                              color:'var(--success)', bold:true },
                      { label:'Net / Mile',      value:'$' + (estNet / lane.miles).toFixed(2) + '/mi',             color:'var(--success)' },
                    ].map(item => (
                      <div key={item.label} style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:12, color:'var(--muted)' }}>{item.label}</span>
                        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: item.bold ? 22 : 18, color: item.color }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Top brokers on this lane */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={Briefcase} /> Brokers Active on This Lane</div>
                  <div style={{ padding:16, display:'flex', flexDirection:'column', gap:8 }}>
                    {lane.brokers.map((b,i) => {
                      const scores = { 'Echo Global':98, 'Coyote Logistics':92, 'CH Robinson':87, 'Transplace':74, 'Worldwide Express':81, 'XPO':89 }
                      const pays   = { 'Echo Global':'< 24hr', 'Coyote Logistics':'< 48hr', 'CH Robinson':'< 3 days', 'Transplace':'< 7 days', 'Worldwide Express':'< 3 days', 'XPO':'< 48hr' }
                      const score = scores[b] || 80
                      const scoreC = score > 90 ? 'var(--success)' : score > 80 ? 'var(--accent2)' : 'var(--warning)'
                      return (
                        <div key={b} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--surface2)', borderRadius:8 }}>
                          <div style={{ width:8, height:8, borderRadius:'50%', background:i===0?'var(--success)':'var(--accent2)', flexShrink:0 }}/>
                          <div style={{ flex:1 }}>
                            <div style={{ fontSize:12, fontWeight:700 }}>{b}</div>
                            <div style={{ fontSize:11, color:'var(--muted)' }}>Pays {pays[b] || '< 3 days'}</div>
                          </div>
                          <span style={{ fontSize:10, fontWeight:800, padding:'3px 8px', borderRadius:8, background:scoreC+'15', color:scoreC }}>Score {score}</span>
                          <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => showToast('','Contact',b + ' — opening broker details')}>Call</button>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Your load history on this lane */}
              {laneHistory.length > 0 && (
                <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:8 }}>
                    <Truck size={13} /> Your History on This Lane
                    <span style={{ fontSize:10, padding:'2px 8px', background:'rgba(240,165,0,0.12)', color:'var(--accent)', borderRadius:6, fontWeight:800 }}>{laneHistory.length} LOADS</span>
                  </div>
                  <div style={{ padding:'0 0 8px' }}>
                    {laneHistory.map(ld => {
                      const statusC = ld.status === 'Delivered' || ld.status === 'Invoiced' ? 'var(--success)' : ld.status === 'In Transit' ? 'var(--accent2)' : 'var(--muted)'
                      return (
                        <div key={ld.loadId} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 18px', borderBottom:'1px solid var(--border)' }}>
                          <div style={{ width:6, height:6, borderRadius:'50%', background:statusC, flexShrink:0 }}/>
                          <div style={{ width:80, fontSize:12, fontWeight:700, color:'var(--accent)' }}>{ld.loadId}</div>
                          <div style={{ flex:1, fontSize:11, color:'var(--muted)' }}>{ld.driver} · {ld.pickup?.split(' · ')[0]}</div>
                          <div style={{ fontSize:12, fontWeight:700, color:'var(--accent2)' }}>${ld.rate}/mi</div>
                          <div style={{ fontSize:12, fontWeight:700 }}>${ld.gross.toLocaleString()}</div>
                          <span style={{ fontSize:10, padding:'2px 7px', borderRadius:6, background:statusC+'15', color:statusC, fontWeight:700 }}>{ld.status}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* 6-week RPM trend chart */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={TrendingUp} /> Rate Trend — {lane.from}→{lane.to} · Last 6 Weeks</div>
                <div style={{ padding:'16px 20px 20px' }}>
                  {(() => {
                    const base = lane.avgRpm
                    const trendFactor = lane.trend / 100
                    const weekly = [
                      base * (1 - trendFactor * 2.5),
                      base * (1 - trendFactor * 2),
                      base * (1 - trendFactor * 1.2),
                      base * (1 - trendFactor * 0.5),
                      base * (1 + trendFactor * 0.3),
                      base * (1 + trendFactor),
                    ]
                    const maxR = Math.max(...weekly)
                    const minR = Math.min(...weekly)
                    const BAR_MAX = 80
                    return (
                      <div style={{ display:'flex', alignItems:'flex-end', gap:10 }}>
                        {weekly.map((v, i) => {
                          const h = Math.max(8, ((v - minR) / (maxR - minR + 0.01)) * BAR_MAX)
                          const isLast = i === weekly.length - 1
                          return (
                            <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                              <div style={{ fontSize:10, fontWeight: isLast ? 700 : 400, color: isLast ? 'var(--accent)' : 'var(--muted)' }}>${v.toFixed(2)}</div>
                              <div style={{ width:'70%', height:`${h}px`, background: isLast ? 'var(--accent)' : 'var(--surface2)', border:`1px solid ${isLast ? 'var(--accent)' : 'var(--border)'}`, borderRadius:'3px 3px 0 0' }}/>
                              <div style={{ fontSize:10, color:'var(--muted)' }}>W{i+1}</div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })()}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── COMMAND CENTER ────────────────────────────────────────────────────────────
const CITY_XY = {
  'Atlanta, GA':      [695, 540],
  'Chicago, IL':      [610, 335],
  'Dallas, TX':       [525, 600],
  'Miami, FL':        [718, 666],
  'Memphis, TN':      [625, 510],
  'New York, NY':     [790, 295],
  'Denver, CO':       [400, 425],
  'Houston, TX':      [538, 648],
  'Phoenix, AZ':      [305, 558],
  'Los Angeles, CA':  [208, 510],
  'Minneapolis, MN':  [558, 278],
}

const CC_COLOR = {}
const CC_UNIT  = {}
const CC_HOS   = {}
const CC_PROG  = { 'Rate Con Received':0.05, 'Assigned to Driver':0.15, 'En Route to Pickup':0.30, 'Loaded':0.45, 'In Transit':0.65, 'Delivered':1.0 }

// Gantt: 7 AM – midnight (17 hrs). Simulated "now" = 10:30 AM
const GANTT_START = 7
const GANTT_HOURS = 17
const NOW_HOUR    = 10.5
const NOW_PCT     = ((NOW_HOUR - GANTT_START) / GANTT_HOURS) * 100
const GANTT_HOURS_LABELS = ['7AM','8AM','9AM','10AM','11AM','12PM','1PM','2PM','3PM','4PM','5PM','6PM','7PM','8PM','9PM','10PM','11PM','12AM']

// Per-driver Gantt block positions (start hour, end hour)
const GANTT_BLOCKS = {}

export function CommandCenter() {
  const { showToast } = useApp()
  const { loads, activeLoads } = useCarrier()
  const [selDriver, setSelDriver] = useState(null)
  const [filterStatus, setFilterStatus] = useState('All')

  const drivers = ['James Tucker', 'Marcus Lee', 'Priya Patel']

  // Build enriched truck data
  const trucks = drivers.map(driver => {
    const load  = activeLoads.find(l => l.driver === driver)
    const color = CC_COLOR[driver]
    const unit  = CC_UNIT[driver]
    if (!load) return { driver, color, unit, load: null, prog: 0, tx: null, ty: null, fromXY: null, toXY: null }
    const prog  = CC_PROG[load.status] || 0.5
    const fromXY = CITY_XY[load.origin] || null
    const toXY   = CITY_XY[load.dest]   || null
    const tx = fromXY && toXY ? fromXY[0] + (toXY[0] - fromXY[0]) * prog : null
    const ty = fromXY && toXY ? fromXY[1] + (toXY[1] - fromXY[1]) * prog : null
    return { driver, color, unit, load, prog, tx, ty, fromXY, toXY }
  })

  const selected  = trucks.find(t => t.driver === selDriver) || trucks.find(t => t.load) || trucks[0]
  const queueLoad = filterStatus === 'All' ? activeLoads : activeLoads.filter(l => l.status === filterStatus)

  return (
    <div className="cc-root" style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden', background:'var(--bg)' }}>

      {/* ── TOP 3-PANEL ROW ─────────────────────────────────────────── */}
      <div className="cc-panels" style={{ flex:1, display:'flex', overflow:'hidden', minHeight:0 }}>

        {/* LEFT: Dispatch Queue */}
        <div className="cc-left" style={{ width:260, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', background:'var(--surface)' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:8 }}>DISPATCH QUEUE</div>
            <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
              {['All','In Transit','Loaded','Assigned to Driver'].map(s => (
                <button key={s} onClick={() => setFilterStatus(s)}
                  style={{ padding:'3px 8px', fontSize:10, fontWeight:700, borderRadius:6, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                    background: filterStatus===s ? 'var(--accent)' : 'var(--surface2)',
                    color:      filterStatus===s ? '#000' : 'var(--muted)',
                    border:     '1px solid ' + (filterStatus===s ? 'var(--accent)' : 'var(--border)') }}>
                  {s === 'Assigned to Driver' ? 'Assigned' : s}
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex:1, overflowY:'auto', minHeight:0, display:'flex', flexDirection:'column' }}>
            {/* Queue Summary — prominent KPIs */}
            {activeLoads.length > 0 && (
              <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[
                    { l:'Active Loads',  v: String(activeLoads.length), c:'var(--accent2)' },
                    { l:'Total Miles',   v: activeLoads.reduce((s,l)=>s+(parseFloat(l.miles)||0),0).toLocaleString(), c:'var(--muted)' },
                    { l:'Total Gross',   v: '$' + activeLoads.reduce((s,l)=>s+(l.gross||0),0).toLocaleString(), c:'var(--accent)' },
                    { l:'Avg RPM',       v: activeLoads.length ? '$' + (activeLoads.reduce((s,l)=>s+(l.rate||0),0)/activeLoads.length).toFixed(2) : '—', c:'var(--success)' },
                  ].map(s => (
                    <div key={s.l} style={{ textAlign:'center', background:'var(--surface2)', borderRadius:8, padding:'8px 6px', border:'1px solid var(--border)' }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:s.c, lineHeight:1 }}>{s.v}</div>
                      <div style={{ fontSize:8, color:'var(--muted)', marginTop:3, fontWeight:700, letterSpacing:0.5 }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {queueLoad.length === 0 && (
              <div style={{ padding:20, textAlign:'center', fontSize:12, color:'var(--muted)' }}>No loads in this status</div>
            )}
            {queueLoad.map(load => {
              const prog   = CC_PROG[load.status] || 0.3
              const color  = CC_COLOR[load.driver] || 'var(--accent)'
              const isSel  = selDriver === load.driver
              const statusC = load.status === 'In Transit' ? 'var(--success)' : load.status === 'Loaded' ? 'var(--accent2)' : 'var(--accent)'
              return (
                <div key={load.loadId}
                  onClick={() => setSelDriver(load.driver === selDriver ? null : load.driver)}
                  style={{ padding:'16px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                    borderLeft:`3px solid ${isSel ? color : 'transparent'}`,
                    background: isSel ? color+'10' : 'transparent', transition:'all 0.15s' }}
                  onMouseOver={e => { if (!isSel) e.currentTarget.style.background='rgba(255,255,255,0.02)' }}
                  onMouseOut={e => { if (!isSel) e.currentTarget.style.background='transparent' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                    <span style={{ fontSize:13, fontWeight:800, color: isSel ? color : 'var(--accent)', fontFamily:'monospace' }}>{load.loadId}</span>
                    <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:6, background:statusC+'15', color:statusC }}>{load.status}</span>
                  </div>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>
                    {load.origin?.split(',')[0]} → {load.dest?.split(',')[0]}
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                    <div style={{ fontSize:11, color:'var(--muted)', display:'flex', alignItems:'center', gap:6 }}>
                      {CC_UNIT[load.driver]} · {load.driver}
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:11, color:'var(--muted)' }}>{load.miles} mi</span>
                      {load.stops?.length > 0 && (
                        <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:5, background:'rgba(77,142,240,0.15)', color:'var(--accent2)' }}>
                          {load.stops.length} STOPS
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${prog*100}%`, background:color, borderRadius:3, transition:'width 0.3s' }}/>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:6 }}>
                    <span style={{ fontSize:10, color:'var(--muted)' }}>{Math.round(prog*100)}% complete</span>
                    <span style={{ fontSize:11, fontWeight:800, color:'var(--accent)' }}>${load.rate}/mi</span>
                  </div>
                </div>
              )
            })}

            <div style={{ flex:1 }} />
          </div>

          {/* Fleet status footer */}
          <div style={{ padding:'10px 14px', borderTop:'1px solid var(--border)', flexShrink:0, display:'flex', flexDirection:'column', gap:5 }}>
            <div style={{ fontSize:9, fontWeight:800, color:'var(--muted)', letterSpacing:1.5, marginBottom:2 }}>FLEET STATUS</div>
            {trucks.map(t => (
              <div key={t.driver}
                onClick={() => setSelDriver(t.driver === selDriver ? null : t.driver)}
                style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 10px', borderRadius:8, cursor:'pointer',
                  background: selDriver===t.driver ? t.color+'10' : 'var(--surface2)',
                  border:`1px solid ${selDriver===t.driver ? t.color+'40' : 'transparent'}`,
                  transition:'all 0.12s' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background: t.load ? t.color : 'var(--muted)',
                  boxShadow: t.load ? `0 0 6px ${t.color}` : 'none', flexShrink:0 }}/>
                <span style={{ fontSize:11, fontWeight:700, color: selDriver===t.driver ? t.color : 'var(--text)' }}>{t.unit}</span>
                <span style={{ fontSize:10, color:'var(--muted)', flex:1 }}>{t.driver.split(' ')[0]}</span>
                <span style={{ fontSize:10, fontWeight:600, color: t.load ? t.color : 'var(--muted)' }}>
                  {t.load ? t.load.status : 'Available'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* CENTER: Live Map */}
        <div style={{ flex:1, position:'relative', overflow:'hidden', background:'#070d1a' }}>
          {/* Grid */}
          <svg width="100%" height="100%" style={{ position:'absolute', inset:0, opacity:0.07, pointerEvents:'none' }}>
            <defs>
              <pattern id="ccgrid" width="44" height="44" patternUnits="userSpaceOnUse">
                <path d="M 44 0 L 0 0 0 44" fill="none" stroke="#4d8ef0" strokeWidth="0.5"/>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#ccgrid)"/>
          </svg>

          {/* Map label */}
          <div style={{ position:'absolute', top:12, left:16, zIndex:10, pointerEvents:'none' }}>
            <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:2 }}>● LIVE FLEET MAP</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>{trucks.filter(t=>t.load).length} trucks on load · Real-time</div>
          </div>

          {/* SVG Map */}
          <svg viewBox="0 0 1000 750" width="100%" height="100%" style={{ position:'absolute', inset:0 }} preserveAspectRatio="xMidYMid meet">
            <defs>
              {trucks.filter(t=>t.load && t.fromXY && t.toXY).map(t => (
                <marker key={t.driver} id={`cc-arr-${t.driver.replace(' ','-')}`} markerWidth="7" markerHeight="7" refX="3" refY="3.5" orient="auto">
                  <polygon points="0 0, 7 3.5, 0 7" fill={t.color}/>
                </marker>
              ))}
            </defs>

            {/* Route lines */}
            {trucks.filter(t=>t.load && t.fromXY && t.toXY).map(t => (
              <g key={t.driver}>
                <line x1={t.fromXY[0]} y1={t.fromXY[1]} x2={t.toXY[0]} y2={t.toXY[1]}
                  stroke={t.color} strokeWidth="1.5" strokeOpacity="0.18" strokeDasharray="8 5"/>
                <line x1={t.fromXY[0]} y1={t.fromXY[1]}
                  x2={t.fromXY[0] + (t.toXY[0]-t.fromXY[0])*t.prog}
                  y2={t.fromXY[1] + (t.toXY[1]-t.fromXY[1])*t.prog}
                  stroke={t.color} strokeWidth="2.5" strokeOpacity="0.85"
                  markerEnd={`url(#cc-arr-${t.driver.replace(' ','-')})`}/>
              </g>
            ))}

            {/* City dots */}
            {Object.entries(CITY_XY).map(([city, [cx, cy]]) => {
              const abbr     = city.split(',')[0].slice(0,3).toUpperCase()
              const isActive = trucks.some(t => t.load && (t.load.origin===city || t.load.dest===city))
              return (
                <g key={city}>
                  <circle cx={cx} cy={cy} r={isActive ? 5 : 3}
                    fill={isActive ? '#fff' : 'rgba(255,255,255,0.22)'}
                    stroke={isActive ? 'rgba(255,255,255,0.45)' : 'none'} strokeWidth="1.5"/>
                  <text x={cx+8} y={cy+4} fontSize="11" fill={isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.28)'}
                    fontFamily="'DM Sans',sans-serif" fontWeight={isActive ? '700' : '400'}>{abbr}</text>
                </g>
              )
            })}

            {/* Truck pins */}
            {trucks.filter(t=>t.load && t.tx && t.ty).map(t => (
              <g key={t.driver} onClick={() => setSelDriver(t.driver === selDriver ? null : t.driver)} style={{ cursor:'pointer' }}>
                <circle cx={t.tx} cy={t.ty} r="18" fill={t.color} opacity="0.12">
                  <animate attributeName="r" values="14;22;14" dur="2.2s" repeatCount="indefinite"/>
                  <animate attributeName="opacity" values="0.18;0;0.18" dur="2.2s" repeatCount="indefinite"/>
                </circle>
                <circle cx={t.tx} cy={t.ty} r="11" fill={t.color} stroke="#07090e" strokeWidth="2.5"/>
                <text x={t.tx} y={t.ty+4} textAnchor="middle" fontSize="9" fill="#000"
                  fontWeight="900" fontFamily="'DM Sans',sans-serif">{t.unit.replace('Unit ','U')}</text>
                <rect x={t.tx+15} y={t.ty-16} width="72" height="32" rx="5"
                  fill="rgba(7,9,14,0.92)" stroke={t.color} strokeWidth="1.2"/>
                <text x={t.tx+51} y={t.ty-2} textAnchor="middle" fontSize="9.5" fill={t.color}
                  fontWeight="700" fontFamily="'DM Sans',sans-serif">{t.driver.split(' ')[0]}</text>
                <text x={t.tx+51} y={t.ty+11} textAnchor="middle" fontSize="8.5" fill="rgba(255,255,255,0.45)"
                  fontFamily="'DM Sans',sans-serif">{t.load?.loadId}</text>
              </g>
            ))}
          </svg>

          {/* Bottom info strip — selected truck */}
          {selected && selected.load && (
            <div style={{ position:'absolute', bottom:14, left:'50%', transform:'translateX(-50%)',
              background:'rgba(7,9,14,0.96)', border:`1px solid ${selected.color}`,
              borderRadius:10, padding:'11px 22px', display:'flex', gap:22, zIndex:20,
              backdropFilter:'blur(12px)', boxShadow:`0 0 24px ${selected.color}20` }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:selected.color,
                boxShadow:`0 0 8px ${selected.color}`, alignSelf:'center', flexShrink:0 }}/>
              {[
                { l:'UNIT',     v: selected.unit },
                { l:'DRIVER',   v: selected.driver.split(' ')[0] },
                { l:'LOAD',     v: selected.load.loadId },
                { l:'ROUTE',    v: `${selected.load.origin?.split(',')[0]} → ${selected.load.dest?.split(',')[0]}` },
                { l:'PROGRESS', v: Math.round(selected.prog*100) + '%' },
                { l:'ETA',      v: selected.load.delivery?.split(' · ')[0] || 'TBD' },
                { l:'HOS',      v: CC_HOS[selected.driver] },
              ].map(item => (
                <div key={item.l} style={{ textAlign:'center' }}>
                  <div style={{ fontSize:8, color:'rgba(255,255,255,0.35)', marginBottom:2, fontWeight:700, letterSpacing:1 }}>{item.l}</div>
                  <div style={{ fontSize:12, fontWeight:700, color: item.l==='PROGRESS' ? selected.color : 'var(--text)', whiteSpace:'nowrap' }}>{item.v}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Truck Detail */}
        <div style={{ width:320, flexShrink:0, borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', background:'var(--surface)', overflowY:'auto' }}>
          {selected ? (
            <>
              {/* Driver header */}
              <div style={{ padding:'16px 18px', borderBottom:'1px solid var(--border)', background:selected.color+'08', flexShrink:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                  <div style={{ width:42, height:42, borderRadius:'50%', background:selected.color+'22',
                    border:`2px solid ${selected.color}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>
                    <Truck size={18} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:700 }}>{selected.driver}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{selected.unit} · CDL-A</div>
                  </div>
                  <div style={{ width:10, height:10, borderRadius:'50%',
                    background: selected.load ? selected.color : 'var(--muted)',
                    boxShadow: selected.load ? `0 0 8px ${selected.color}` : 'none' }}/>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button className="btn btn-ghost" style={{ flex:1, fontSize:11, padding:'7px 4px' }}
                    onClick={() => showToast('','Call',`Calling ${selected.driver}...`)}><Ic icon={Phone} /> Call</button>
                  <button className="btn btn-ghost" style={{ flex:1, fontSize:11, padding:'7px 4px' }}
                    onClick={() => showToast('','Message',`Chat with ${selected.driver} opened`)}><Ic icon={MessageCircle} /> Message</button>
                </div>
              </div>

              {/* HOS */}
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:1.5, marginBottom:8 }}>HOURS OF SERVICE</div>
                <div style={{ fontSize:22, fontFamily:"'Bebas Neue',sans-serif", color:'var(--success)', marginBottom:6 }}>
                  {CC_HOS[selected.driver]} drive time left
                </div>
                <div style={{ height:6, background:'var(--surface2)', borderRadius:3, overflow:'hidden', marginBottom:4 }}>
                  <div style={{ height:'100%', width:'72%', background:'linear-gradient(90deg,var(--success),var(--accent2))', borderRadius:3 }}/>
                </div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>70-hr week: 38h used · 32h remaining</div>
              </div>

              {/* Active load */}
              {selected.load ? (
                <div style={{ borderBottom:'1px solid var(--border)' }}>
                  <div style={{ padding:'14px 18px 8px' }}>
                    <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:1.5, marginBottom:10 }}>ACTIVE LOAD</div>
                    {[
                      { l:'Load ID',   v: selected.load.loadId },
                      { l:'Broker',    v: selected.load.broker },
                      { l:'Miles',     v: `${selected.load.miles} mi` },
                      { l:'Rate',      v: `$${selected.load.rate}/mi` },
                      { l:'Gross Pay', v: `$${selected.load.gross?.toLocaleString()}` },
                      { l:'Commodity', v: selected.load.commodity },
                      { l:'Weight',    v: `${selected.load.weight} lbs` },
                    ].map(item => (
                      <div key={item.l} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>{item.l}</span>
                        <span style={{ fontSize:11, fontWeight:600, color:'var(--text)', maxWidth:180, textAlign:'right' }}>{item.v}</span>
                      </div>
                    ))}
                  </div>
                  {/* Stop timeline if multi-stop */}
                  {selected.load.stops?.length > 0
                    ? <div style={{ padding:'0 18px 14px' }}><StopTimeline load={selected.load} /></div>
                    : <div style={{ padding:'0 18px 14px', fontSize:11, color:'var(--muted)' }}>
                        <MapPin size={13} /> {selected.load.origin} → {selected.load.dest}
                      </div>
                  }
                </div>
              ) : (
                <div style={{ padding:'24px 18px', textAlign:'center' }}>
                  <div style={{ marginBottom:8 }}><Check size={28} /></div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--success)', marginBottom:4 }}>Available</div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:14 }}>No active load — ready to dispatch</div>
                  <button className="btn btn-primary" style={{ fontSize:11 }}
                    onClick={() => showToast('','Dispatch','Opening AI Dispatch Copilot...')}><Ic icon={Zap} /> Find Load</button>
                </div>
              )}

              {/* MTD Performance */}
              <div style={{ padding:'14px 18px' }}>
                <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:1.5, marginBottom:10 }}>PERFORMANCE · MTD</div>
                {(() => {
                  const drvLoads = loads.filter(l => l.driver === selected.driver)
                  const totalMi  = drvLoads.reduce((s,l)=>s+l.miles,0)
                  const totalGr  = drvLoads.reduce((s,l)=>s+l.gross,0)
                  const avgRpm   = drvLoads.length ? (drvLoads.reduce((s,l)=>s+(l.rate||0),0)/drvLoads.length).toFixed(2) : '0.00'
                  return (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {[
                        { l:'Loads Run', v: drvLoads.length },
                        { l:'Miles',     v: totalMi.toLocaleString() },
                        { l:'Gross Pay', v: '$'+totalGr.toLocaleString() },
                        { l:'Avg RPM',   v: '$'+avgRpm },
                      ].map(s => (
                        <div key={s.l} style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px', textAlign:'center' }}>
                          <div style={{ fontSize:10, color:'var(--muted)', marginBottom:3 }}>{s.l}</div>
                          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:selected.color }}>{s.v}</div>
                        </div>
                      ))}
                    </div>
                  )
                })()}
              </div>
            </>
          ) : (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:'var(--muted)' }}>
              <div style={{ fontSize:36 }}><Truck size={20} /></div>
              <div style={{ fontSize:12 }}>Click a truck or load card to view details</div>
            </div>
          )}
        </div>
      </div>

      {/* ── BOTTOM: FREIGHT SCHEDULE GANTT ──────────────────────────── */}
      <div style={{ height:168, flexShrink:0, borderTop:'1px solid var(--border)', background:'var(--surface)' }}>
        <div style={{ padding:'8px 16px 6px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2 }}>FREIGHT SCHEDULE</div>
          <div style={{ fontSize:10, color:'var(--muted)' }}>Today · Mar 9, 2026</div>
          <div style={{ marginLeft:'auto', display:'flex', gap:12, fontSize:10, color:'var(--muted)' }}>
            <span style={{ color:'var(--danger)', fontWeight:700 }}>● NOW · 10:30 AM</span>
            <span>7 AM → 12 AM</span>
          </div>
        </div>

        <div style={{ padding:'8px 0 0', overflow:'hidden' }}>
          {/* Hour header */}
          <div style={{ display:'flex', marginLeft:88, marginRight:16, marginBottom:4 }}>
            {GANTT_HOURS_LABELS.map(h => (
              <div key={h} style={{ flex:1, fontSize:9, color:'var(--muted)', textAlign:'center', minWidth:0 }}>{h}</div>
            ))}
          </div>

          {/* Driver rows */}
          {drivers.map(driver => {
            const t     = trucks.find(tk => tk.driver === driver)
            const color = CC_COLOR[driver]
            const blk   = GANTT_BLOCKS[driver]
            if (!blk) return null
            const left  = ((blk.start - GANTT_START) / GANTT_HOURS) * 100
            const width = ((blk.end - blk.start)    / GANTT_HOURS) * 100

            return (
              <div key={driver} style={{ display:'flex', alignItems:'center', marginBottom:6, height:30 }}>
                <div style={{ width:88, paddingLeft:16, flexShrink:0 }}>
                  <div style={{ fontSize:10, fontWeight:700, color }}>{CC_UNIT[driver]}</div>
                  <div style={{ fontSize:9,  color:'var(--muted)' }}>{driver.split(' ')[0]}</div>
                </div>
                <div style={{ flex:1, position:'relative', height:22, background:'var(--surface2)', borderRadius:4, marginRight:16 }}>
                  {/* NOW line */}
                  <div style={{ position:'absolute', top:0, bottom:0, left:`${NOW_PCT}%`, width:1.5,
                    background:'rgba(239,68,68,0.85)', zIndex:3 }}/>
                  {/* Load block */}
                  {t?.load && (
                    <div style={{ position:'absolute', top:2, height:18, left:`${left}%`, width:`${width}%`,
                      background:color+'22', border:`1px solid ${color}55`, borderRadius:3,
                      display:'flex', alignItems:'center', paddingLeft:6, overflow:'hidden', zIndex:1 }}>
                      <span style={{ fontSize:9, fontWeight:700, color, whiteSpace:'nowrap' }}>
                        {t.load.loadId} · {t.load.origin?.split(',')[0]}→{t.load.dest?.split(',')[0]}
                      </span>
                    </div>
                  )}
                  {!t?.load && (
                    <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', paddingLeft:8 }}>
                      <span style={{ fontSize:9, color:'var(--muted)' }}>Available</span>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── AI LOAD BOARD ────────────────────────────────────────────────────────────
const LB_BROKER = {
  'Echo Global':      { risk:'LOW',     score:98, pay:'< 24hr',   color:'var(--success)'  },
  'Coyote Logistics': { risk:'LOW',     score:92, pay:'< 48hr',   color:'var(--success)'  },
  'CH Robinson':      { risk:'LOW',     score:87, pay:'< 3 days', color:'var(--success)'  },
  'XPO':              { risk:'LOW',     score:89, pay:'< 48hr',   color:'var(--success)'  },
  'Amazon Freight':   { risk:'LOW',     score:95, pay:'< 24hr',   color:'var(--success)'  },
  'Transplace':       { risk:'MEDIUM',  score:74, pay:'< 7 days', color:'var(--warning)'  },
  'Worldwide Express':{ risk:'MEDIUM',  score:81, pay:'< 3 days', color:'var(--warning)'  },
  'TQL':              { risk:'HIGH',    score:58, pay:'15+ days', color:'var(--danger)'   },
}

const LB_LANE = {
  'CHI→ATL': { avgRpm:2.72, trend:-8,  backhaul:35 },
  'CHI→MIA': { avgRpm:2.85, trend:+4,  backhaul:60 },
  'CHI→DAL': { avgRpm:2.45, trend:-2,  backhaul:58 },
  'CHI→NYC': { avgRpm:2.98, trend:+6,  backhaul:70 },
  'ATL→CHI': { avgRpm:2.94, trend:+8,  backhaul:88 },
  'ATL→MIA': { avgRpm:3.10, trend:+5,  backhaul:72 },
  'ATL→NYC': { avgRpm:2.88, trend:+3,  backhaul:65 },
  'DAL→MIA': { avgRpm:3.22, trend:+12, backhaul:72 },
  'DAL→HOU': { avgRpm:2.10, trend:-5,  backhaul:30 },
  'DAL→LAX': { avgRpm:2.88, trend:+7,  backhaul:55 },
  'MEM→NYC': { avgRpm:3.10, trend:+5,  backhaul:65 },
  'MEM→CHI': { avgRpm:2.65, trend:+2,  backhaul:62 },
  'PHX→LAX': { avgRpm:2.41, trend:+2,  backhaul:55 },
  'PHX→DEN': { avgRpm:2.55, trend:+1,  backhaul:48 },
  'DEN→HOU': { avgRpm:2.61, trend:-3,  backhaul:42 },
  'DEN→CHI': { avgRpm:2.70, trend:+4,  backhaul:60 },
  'HOU→ATL': { avgRpm:2.90, trend:+6,  backhaul:68 },
  'HOU→NYC': { avgRpm:3.25, trend:+10, backhaul:70 },
}

// Sample load board — replaced by live DAT feed when connected
const BOARD_LOADS = [
  { id:'LD-001', broker:'Echo Global',       origin:'Chicago, IL',    dest:'Atlanta, GA',      miles:674,  rate:3.05, gross:2056, weight:'42,000', commodity:'Auto Parts',    equipment:'Dry Van',  pickup:'Mar 10 · 8:00 AM', delivery:'Mar 11 · 6:00 PM',  deadhead:0,   refNum:'EC-89100', laneKey:'CHI→ATL' },
  { id:'LD-002', broker:'Coyote Logistics',  origin:'Chicago, IL',    dest:'Miami, FL',         miles:1377, rate:3.15, gross:4338, weight:'38,500', commodity:'Electronics',   equipment:'Dry Van',  pickup:'Mar 10 · 7:00 AM', delivery:'Mar 13 · 4:00 PM',  deadhead:0,   refNum:'CL-23001', laneKey:'CHI→MIA' },
  { id:'LD-003', broker:'Transplace',        origin:'Chicago, IL',    dest:'Dallas, TX',        miles:921,  rate:2.48, gross:2284, weight:'41,000', commodity:'Machinery',     equipment:'Dry Van',  pickup:'Mar 11 · 6:00 AM', delivery:'Mar 13 · 2:00 PM',  deadhead:0,   refNum:'TP-19300', laneKey:'CHI→DAL' },
  { id:'LD-004', broker:'XPO',               origin:'Chicago, IL',    dest:'New York, NY',      miles:790,  rate:3.08, gross:2433, weight:'39,000', commodity:'Retail',        equipment:'Dry Van',  pickup:'Mar 10 · 9:00 AM', delivery:'Mar 12 · 8:00 AM',  deadhead:0,   refNum:'XP-44210', laneKey:'CHI→NYC' },
  { id:'LD-005', broker:'Echo Global',       origin:'Atlanta, GA',    dest:'Chicago, IL',       miles:674,  rate:3.12, gross:2103, weight:'40,500', commodity:'Auto Parts',    equipment:'Dry Van',  pickup:'Mar 11 · 7:00 AM', delivery:'Mar 12 · 5:00 PM',  deadhead:8,   refNum:'EC-89120', laneKey:'ATL→CHI' },
  { id:'LD-006', broker:'CH Robinson',       origin:'Atlanta, GA',    dest:'Miami, FL',         miles:660,  rate:3.22, gross:2125, weight:'37,200', commodity:'Food & Bev',    equipment:'Reefer',   pickup:'Mar 10 · 6:00 AM', delivery:'Mar 11 · 8:00 PM',  deadhead:8,   refNum:'CHR-77301', laneKey:'ATL→MIA' },
  { id:'LD-007', broker:'Amazon Freight',    origin:'Atlanta, GA',    dest:'New York, NY',      miles:874,  rate:2.90, gross:2535, weight:'43,000', commodity:'Consumer Goods', equipment:'Dry Van', pickup:'Mar 11 · 8:00 AM', delivery:'Mar 13 · 6:00 AM',  deadhead:8,   refNum:'AMZ-50021', laneKey:'ATL→NYC' },
  { id:'LD-008', broker:'Echo Global',       origin:'Dallas, TX',     dest:'Miami, FL',         miles:1491, rate:3.22, gross:4801, weight:'38,500', commodity:'Food & Bev',    equipment:'Dry Van',  pickup:'Mar 11 · 7:00 AM', delivery:'Mar 13 · 5:00 PM',  deadhead:42,  refNum:'EC-89130', laneKey:'DAL→MIA' },
  { id:'LD-009', broker:'TQL',               origin:'Dallas, TX',     dest:'Houston, TX',       miles:239,  rate:2.10, gross:502,  weight:'44,000', commodity:'Industrial',    equipment:'Flatbed',  pickup:'Mar 10 · 10:00 AM', delivery:'Mar 10 · 6:00 PM', deadhead:42,  refNum:'TQ-11002', laneKey:'DAL→HOU' },
  { id:'LD-010', broker:'Coyote Logistics',  origin:'Dallas, TX',     dest:'Los Angeles, CA',   miles:1435, rate:2.92, gross:4190, weight:'40,000', commodity:'Automotive',    equipment:'Dry Van',  pickup:'Mar 11 · 6:00 AM', delivery:'Mar 14 · 2:00 PM',  deadhead:42,  refNum:'CL-23020', laneKey:'DAL→LAX' },
  { id:'LD-011', broker:'Coyote Logistics',  origin:'Memphis, TN',    dest:'New York, NY',      miles:1100, rate:3.18, gross:3498, weight:'39,800', commodity:'Electronics',   equipment:'Dry Van',  pickup:'Mar 10 · 8:00 AM', delivery:'Mar 12 · 6:00 PM',  deadhead:25,  refNum:'CL-23010', laneKey:'MEM→NYC' },
  { id:'LD-012', broker:'CH Robinson',       origin:'Memphis, TN',    dest:'Chicago, IL',       miles:530,  rate:2.68, gross:1420, weight:'41,500', commodity:'Food & Bev',    equipment:'Reefer',   pickup:'Mar 11 · 5:00 AM', delivery:'Mar 12 · 10:00 AM', deadhead:25,  refNum:'CHR-77310', laneKey:'MEM→CHI' },
  { id:'LD-013', broker:'Worldwide Express', origin:'Phoenix, AZ',    dest:'Los Angeles, CA',   miles:372,  rate:2.41, gross:897,  weight:'45,000', commodity:'Retail',        equipment:'Dry Van',  pickup:'Mar 10 · 5:00 PM', delivery:'Mar 11 · 9:00 AM',  deadhead:110, refNum:'WE-55200', laneKey:'PHX→LAX' },
  { id:'LD-014', broker:'Amazon Freight',    origin:'Phoenix, AZ',    dest:'Denver, CO',        miles:602,  rate:2.58, gross:1553, weight:'38,000', commodity:'Consumer Goods', equipment:'Dry Van', pickup:'Mar 11 · 7:00 AM', delivery:'Mar 13 · 3:00 PM',  deadhead:110, refNum:'AMZ-50030', laneKey:'PHX→DEN' },
  { id:'LD-015', broker:'Transplace',        origin:'Denver, CO',     dest:'Houston, TX',       miles:1020, rate:2.61, gross:2662, weight:'41,200', commodity:'Machinery',     equipment:'Flatbed',  pickup:'Mar 10 · 6:00 AM', delivery:'Mar 12 · 4:00 PM',  deadhead:68,  refNum:'TP-19310', laneKey:'DEN→HOU' },
  { id:'LD-016', broker:'XPO',               origin:'Denver, CO',     dest:'Chicago, IL',       miles:1003, rate:2.75, gross:2758, weight:'40,000', commodity:'Auto Parts',    equipment:'Dry Van',  pickup:'Mar 11 · 8:00 AM', delivery:'Mar 13 · 6:00 PM',  deadhead:68,  refNum:'XP-44220', laneKey:'DEN→CHI' },
  { id:'LD-017', broker:'TQL',               origin:'Houston, TX',    dest:'Atlanta, GA',       miles:792,  rate:2.88, gross:2281, weight:'37,500', commodity:'Chemicals',     equipment:'Dry Van',  pickup:'Mar 11 · 6:00 AM', delivery:'Mar 13 · 4:00 PM',  deadhead:85,  refNum:'TQ-11010', laneKey:'HOU→ATL' },
  { id:'LD-018', broker:'Echo Global',       origin:'Houston, TX',    dest:'New York, NY',      miles:1636, rate:3.28, gross:5366, weight:'38,000', commodity:'Petrochemicals', equipment:'Dry Van', pickup:'Mar 11 · 5:00 AM', delivery:'Mar 15 · 8:00 AM',  deadhead:85,  refNum:'EC-89140', laneKey:'HOU→NYC' },
  // ── Multi-stop loads ──────────────────────────────────────────────────────────
  { id:'LD-019', broker:'Coyote Logistics',  origin:'Atlanta, GA',    dest:'Chicago, IL',       miles:920,  rate:0,    gross:4200, weight:'44,000', commodity:'Auto Parts',     equipment:'Dry Van', pickup:'Mar 11 · 6:00 AM', delivery:'Mar 13 · 2:00 PM',  deadhead:8,   refNum:'CL-23040', laneKey:'ATL→CHI',
    stops:[
      { seq:1, type:'pickup',  city:'Atlanta, GA',      addr:'1200 Northside Dr NW',    time:'Mar 11 · 6:00 AM',  notes:'Dock 4, call 30min ahead' },
      { seq:2, type:'pickup',  city:'Nashville, TN',    addr:'550 Cowan St',             time:'Mar 11 · 12:00 PM', notes:'2nd pickup — forklift on site' },
      { seq:3, type:'dropoff', city:'Chicago, IL',      addr:'4800 S Cicero Ave',        time:'Mar 13 · 2:00 PM',  notes:'Final delivery' },
    ]},
  { id:'LD-020', broker:'XPO',               origin:'Dallas, TX',     dest:'Denver, CO',        miles:1118, rate:0,    gross:5800, weight:'41,500', commodity:'Industrial Equip', equipment:'Flatbed', pickup:'Mar 12 · 7:00 AM', delivery:'Mar 15 · 5:00 PM',  deadhead:42,  refNum:'XP-44230', laneKey:'DAL→CHI',
    stops:[
      { seq:1, type:'pickup',  city:'Dallas, TX',       addr:'3300 Fort Worth Ave',      time:'Mar 12 · 7:00 AM',  notes:'Oversized load — permit attached' },
      { seq:2, type:'dropoff', city:'Amarillo, TX',     addr:'4100 W 45th Ave',          time:'Mar 12 · 2:00 PM',  notes:'Partial unload — 40% of freight' },
      { seq:3, type:'dropoff', city:'Pueblo, CO',       addr:'900 S Prairie Ave',        time:'Mar 14 · 10:00 AM', notes:'Partial unload — 30%' },
      { seq:4, type:'dropoff', city:'Denver, CO',       addr:'6100 E 56th Ave',          time:'Mar 15 · 5:00 PM',  notes:'Final delivery — remaining freight' },
    ]},
]

function calcAiScore(load) {
  const lane    = LB_LANE[load.laneKey] || { avgRpm:2.70, trend:0, backhaul:50 }
  const broker  = LB_BROKER[load.broker] || { score:70, risk:'UNKNOWN' }
  // A: RPM premium (0-25)
  const premium = (load.rate - lane.avgRpm) / lane.avgRpm
  const scoreA  = Math.min(25, Math.max(0, 12 + premium * 40))
  // B: Broker safety (0-25)
  const scoreB  = broker.score / 100 * 25
  // C: Deadhead efficiency (0-20)
  const ratio   = load.deadhead / load.miles
  const scoreC  = Math.min(20, Math.max(0, 20 - ratio * 35))
  // D: Lane trend (0-20)
  const scoreD  = lane.trend > 8 ? 20 : lane.trend > 3 ? 16 : lane.trend > 0 ? 12 : lane.trend > -5 ? 7 : 3
  // E: Backhaul bonus (0-10)
  const scoreE  = lane.backhaul > 70 ? 10 : lane.backhaul > 50 ? 6 : 3
  return Math.min(99, Math.max(30, Math.round(scoreA + scoreB + scoreC + scoreD + scoreE)))
}

const EQUIPMENT_LABEL = { 'Dry Van':'Dry Van', 'Reefer':'Reefer', 'Flatbed':'Flatbed' }

// ─── AI RATE NEGOTIATOR ───────────────────────────────────────────────────────
function AIRateNegotiator({ load, lane, bkr }) {
  const { showToast } = useApp()
  const ln = lane  || { avgRpm:2.70, trend:0, backhaul:50 }
  const bk = bkr   || { score:70, risk:'MEDIUM', pay:'< 5 days' }

  // Derive AI suggested counter
  const marketPremium   = ln.trend > 5 ? 0.18 : ln.trend > 0 ? 0.10 : 0.04
  const brokerPenalty   = bk.risk === 'HIGH' ? 0.12 : bk.risk === 'LOW' ? 0 : 0.06
  const suggestedRpm    = Math.round((ln.avgRpm + marketPremium + brokerPenalty) * 100) / 100
  const suggestedGross  = Math.round(suggestedRpm * load.miles)
  const diffVsPosted    = Math.round(suggestedGross - load.gross)
  const isAbove         = diffVsPosted > 0

  const [mode, setMode]       = useState('idle')   // idle | counter | passed
  const [counter, setCounter] = useState(String(suggestedGross))
  const [sent, setSent]       = useState(false)

  const rationale = [
    ln.trend > 3  ? `Lane trending +${ln.trend}% — market is hot, push higher`
    : ln.trend < -3 ? `Lane trending ${ln.trend}% — accept near market or pass`
    : `Lane rate stable — modest counter likely to stick`,
    bk.risk === 'HIGH'
      ? `${load.broker} rated HIGH risk — demand 10-15% premium or pass`
      : bk.risk === 'LOW'
      ? `${load.broker} is low risk, fast pay — accept near posted is safe`
      : `${load.broker} mid-tier — counter to ${suggestedRpm.toFixed(2)}/mi standard`,
    ln.backhaul > 70
      ? `Strong backhaul lane (${ln.backhaul}%) — you have leverage, hold firm`
      : `Weak backhaul — factor in potential deadhead on return`,
  ]

  const handleSend = () => {
    const amt = parseFloat(counter)
    if (!amt || amt < load.gross) { showToast('','Invalid amount','Counter must be ≥ posted rate'); return }
    setSent(true)
    showToast('','Counter Sent', `$${amt.toLocaleString()} counter submitted to ${load.broker}`)
  }

  if (mode === 'passed') {
    return (
      <div style={{ background:'rgba(239,68,68,0.06)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:12, padding:16, textAlign:'center' }}>
        <div style={{ fontSize:22, marginBottom:4 }}><AlertCircle size={22} /></div>
        <div style={{ fontSize:13, fontWeight:700, color:'var(--danger)' }}>Passed on this load</div>
        <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>AI agreed — rate vs. risk doesn't pencil. Move to the next one.</div>
        <button onClick={() => setMode('idle')} style={{ marginTop:10, fontSize:11, color:'var(--muted)', background:'none', border:'none', cursor:'pointer', textDecoration:'underline' }}>Undo</button>
      </div>
    )
  }

  return (
    <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:12, overflow:'hidden' }}>
      {/* Header */}
      <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', background:'rgba(240,165,0,0.04)', display:'flex', alignItems:'center', gap:10 }}>
        <span style={{ fontSize:16 }}><Brain size={16} /></span>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, fontSize:13 }}>AI Rate Negotiation</div>
          <div style={{ fontSize:10, color:'var(--muted)' }}>Powered by lane data, broker history &amp; market conditions</div>
        </div>
        <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:6, background:'rgba(240,165,0,0.15)', color:'var(--accent)', letterSpacing:1 }}>LIVE</span>
      </div>

      <div style={{ padding:16, display:'flex', flexDirection:'column', gap:14 }}>

        {/* Suggested counter card */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
          {[
            { label:'Posted Rate', val:`$${load.gross.toLocaleString()}`, sub:`$${load.rate}/mi`, color:'var(--muted)' },
            { label:'Lane Avg',    val:`$${Math.round(ln.avgRpm*load.miles).toLocaleString()}`, sub:`$${ln.avgRpm.toFixed(2)}/mi avg`, color:'var(--text)' },
            { label:'AI Counter',  val:`$${suggestedGross.toLocaleString()}`, sub:`$${suggestedRpm.toFixed(2)}/mi · ${isAbove ? '+' : ''}${diffVsPosted >= 0 ? '+' : ''}$${Math.abs(diffVsPosted)} vs posted`, color: isAbove ? 'var(--success)' : 'var(--accent)' },
          ].map(c => (
            <div key={c.label} style={{ background:'var(--surface2)', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4, fontWeight:600 }}>{c.label}</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:c.color, lineHeight:1 }}>{c.val}</div>
              <div style={{ fontSize:9, color:'var(--muted)', marginTop:3 }}>{c.sub}</div>
            </div>
          ))}
        </div>

        {/* AI Rationale */}
        <div style={{ background:'var(--surface2)', borderRadius:10, padding:'10px 14px', display:'flex', flexDirection:'column', gap:6 }}>
          {rationale.map((r,i) => (
            <div key={i} style={{ fontSize:11, color:'var(--text)', lineHeight:1.5 }}>{r}</div>
          ))}
        </div>

        {/* Action row */}
        {mode === 'idle' && !sent && (
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => { showToast('','Rate Accepted',`Accepted posted rate of $${load.gross.toLocaleString()} — assign a driver to book`); setMode('idle') }}
              style={{ flex:1, padding:'9px', fontSize:12, fontWeight:700, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.3)', borderRadius:8, color:'var(--success)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              <Check size={13} /> Accept As-Is
            </button>
            <button onClick={() => setMode('counter')}
              style={{ flex:1, padding:'9px', fontSize:12, fontWeight:700, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:8, color:'var(--accent)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              <MessageCircle size={13} /> Counter Offer
            </button>
            <button onClick={() => setMode('passed')}
              style={{ flex:1, padding:'9px', fontSize:12, fontWeight:700, background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, color:'var(--danger)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              <AlertCircle size={13} /> Pass
            </button>
          </div>
        )}

        {/* Counter input */}
        {mode === 'counter' && !sent && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <div style={{ fontSize:11, color:'var(--muted)' }}>Enter your counter amount — AI suggests <strong style={{ color:'var(--accent)' }}>${suggestedGross.toLocaleString()}</strong></div>
            <div style={{ display:'flex', gap:8 }}>
              <div style={{ position:'relative', flex:1 }}>
                <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', color:'var(--muted)', fontSize:13, fontWeight:700 }}>$</span>
                <input type="number" value={counter} onChange={e => setCounter(e.target.value)}
                  style={{ width:'100%', boxSizing:'border-box', paddingLeft:24, paddingRight:12, paddingTop:10, paddingBottom:10, background:'var(--surface2)', border:'1px solid rgba(240,165,0,0.4)', borderRadius:8, color:'var(--text)', fontSize:14, fontWeight:700, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
              </div>
              <button onClick={handleSend}
                style={{ padding:'10px 20px', fontSize:12, fontWeight:700, background:'var(--accent)', border:'none', borderRadius:8, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", whiteSpace:'nowrap' }}>
                Send Counter →
              </button>
              <button onClick={() => setMode('idle')}
                style={{ padding:'10px 14px', fontSize:12, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Cancel
              </button>
            </div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>
              That's ${(parseFloat(counter||0)/load.miles).toFixed(2)}/mi · ${Math.round((parseFloat(counter||0)/load.miles - ln.avgRpm)*100)/100 >= 0 ? '+' : ''}{Math.round((parseFloat(counter||0)/load.miles - ln.avgRpm)*100)/100} vs lane avg
            </div>
          </div>
        )}

        {sent && (
          <div style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontSize:20 }}><MailOpen size={20} /></span>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--success)' }}>Counter Submitted — ${parseFloat(counter).toLocaleString()}</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Waiting on broker response · You can still book at posted rate below</div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

export function AILoadBoard() {
  const { showToast } = useApp()
  const { addLoad } = useCarrier()
  const [filters, setFilters] = useState({ equip:'All', minRpm:'', sortBy:'score' })
  const [selected, setSelected] = useState(BOARD_LOADS[0].id)
  const [booked, setBooked]     = useState({})
  const [assignDriver, setAssignDriver] = useState('')
  const [rateConFile, setRateConFile] = useState(null)
  const [parsingRC, setParsingRC] = useState(false)
  const rcFileRef = useRef(null)

  const compressImage = (file) => new Promise((resolve) => {
    if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
      const reader = new FileReader()
      reader.onload = () => resolve({ base64: reader.result.split(',')[1], mediaType: 'application/pdf' })
      reader.readAsDataURL(file)
      return
    }
    const img = new Image()
    img.onload = () => {
      const maxW = 1200
      let w = img.width, h = img.height
      if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
      resolve({ base64: dataUrl.split(',')[1], mediaType: 'image/jpeg' })
    }
    img.onerror = () => {
      const reader = new FileReader()
      reader.onload = () => resolve({ base64: reader.result.split(',')[1], mediaType: file.type || 'image/jpeg' })
      reader.readAsDataURL(file)
    }
    img.src = URL.createObjectURL(file)
  })

  const parseCarrierRC = async (f) => {
    if (!f) return
    const validExt = /\.(pdf|png|jpg|jpeg|heic)$/i
    if (!validExt.test(f.name) && !f.type?.match(/image|pdf/)) {
      showToast('','Invalid File',`"${f.name}" — need PDF, PNG, or JPG`)
      return
    }
    setRateConFile(f)
    setParsingRC(true)
    showToast('','Reading Rate Con',`Compressing ${f.name} (${(f.size/1024).toFixed(0)} KB)...`)
    try {
      const { base64, mediaType } = await compressImage(f)
      if (!base64 || base64.length < 50) {
        showToast('','Compression Failed','File could not be read — try a different format')
        setParsingRC(false)
        return
      }
      showToast('','Sending to AI',`${(base64.length/1024).toFixed(0)} KB compressed — analyzing...`)
      const res = await apiFetch('/api/parse-ratecon', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ file: base64, mediaType })
      })
      const text = await res.text()
      let data; try { data = JSON.parse(text) } catch { data = null }
      if (data && !data.error) {
        showToast('','Rate Con Parsed', `${data.origin || ''} → ${data.destination || ''} · $${data.rate || '—'}`)
      } else {
        const errMsg = data?.error || 'Could not parse'
        showToast('','Parse Error', errMsg)
        console.error('Rate con parse error:', errMsg, text?.slice(0, 300))
      }
    } catch(err) {
      showToast('','Error', err?.message || 'Failed to parse rate con')
      console.error('Rate con fetch error:', err)
    }
    setParsingRC(false)
  }

  const sf = (k, v) => setFilters(p => ({ ...p, [k]: v }))

  const scored = useMemo(() =>
    BOARD_LOADS.map(l => ({ ...l, aiScore: calcAiScore(l) }))
  , [])

  const filtered = useMemo(() => {
    let r = scored
    if (filters.equip !== 'All') r = r.filter(l => l.equipment === filters.equip)
    if (filters.minRpm) r = r.filter(l => l.rate >= parseFloat(filters.minRpm))
    return [...r].sort((a, b) =>
      filters.sortBy === 'score' ? b.aiScore - a.aiScore :
      filters.sortBy === 'rate'  ? b.rate - a.rate :
      filters.sortBy === 'gross' ? b.gross - a.gross :
      a.deadhead - b.deadhead
    )
  }, [scored, filters])

  const load  = scored.find(l => l.id === selected)
  const lane  = load ? (LB_LANE[load.laneKey] || { avgRpm:2.70, trend:0, backhaul:50 }) : null
  const bkr   = load ? (LB_BROKER[load.broker] || { score:70, risk:'MEDIUM', pay:'< 5 days', color:'var(--warning)' }) : null
  const scoreC = load ? Math.min(99, Math.max(30, Math.round(calcAiScore(load)))) : 0
  const scoreColor = load ? (load.aiScore >= 75 ? 'var(--success)' : load.aiScore >= 55 ? 'var(--accent)' : 'var(--danger)') : 'var(--muted)'

  const handleBook = () => {
    if (!load || booked[load.id]) return
    if (!assignDriver) { showToast('','Assign Driver','Select a driver before booking'); return }
    addLoad({
      origin: load.origin, dest: load.dest, miles: load.miles,
      rate: load.rate, gross: load.gross, weight: load.weight,
      commodity: load.commodity, pickup: load.pickup, delivery: load.delivery,
      broker: load.broker, driver: assignDriver, refNum: load.refNum,
    })
    setBooked(p => ({ ...p, [load.id]: true }))
    showToast('','Load Booked', `${load.id} assigned to ${assignDriver} · added to dispatch queue`)
    setSelected(filtered.find(l => !booked[l.id] && l.id !== load.id)?.id || null)
    setAssignDriver('')
  }

  const estFuel   = load ? Math.round(load.miles / 6.9 * 3.85) : 0
  const estDriver = load ? Math.round(load.gross * 0.28) : 0
  const estNet    = load ? load.gross - estFuel - estDriver : 0

  const inputStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none' }
  const selectStyle = { ...inputStyle, cursor:'pointer' }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:2, lineHeight:1 }}>
            AI LOAD <span style={{ color:'var(--accent)' }}>BOARD</span>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>{filtered.length} loads · Updated just now</div>
        </div>
        <div style={{ display:'flex', gap:8, marginLeft:'auto', alignItems:'center' }}>
          <select value={filters.equip} onChange={e => sf('equip', e.target.value)} style={selectStyle}>
            <option value="All">All Equipment</option>
            <option value="Dry Van">Dry Van</option>
            <option value="Reefer">Reefer</option>
            <option value="Flatbed">Flatbed</option>
          </select>
          <input type="number" placeholder="Min $/mi" value={filters.minRpm} onChange={e => sf('minRpm', e.target.value)}
            style={{ ...inputStyle, width:90 }}/>
          <select value={filters.sortBy} onChange={e => sf('sortBy', e.target.value)} style={selectStyle}>
            <option value="score">Sort: AI Score ↓</option>
            <option value="rate">Sort: Rate/mi ↓</option>
            <option value="gross">Sort: Gross ↓</option>
            <option value="deadhead">Sort: Deadhead ↑</option>
          </select>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* LEFT: Load list */}
        <div style={{ width:380, flexShrink:0, borderRight:'1px solid var(--border)', overflowY:'auto' }}>
          {filtered.map(l => {
            const isSel = selected === l.id
            const b     = LB_BROKER[l.broker] || { color:'var(--muted)', score:70 }
            const sc    = l.aiScore
            const scC   = sc >= 75 ? 'var(--success)' : sc >= 55 ? 'var(--accent)' : 'var(--danger)'
            const isB   = booked[l.id]
            return (
              <div key={l.id} onClick={() => !isB && setSelected(l.id)}
                style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                  background: isB ? 'rgba(255,255,255,0.02)' : isSel ? 'rgba(240,165,0,0.05)' : 'transparent',
                  cursor: isB ? 'default' : 'pointer', opacity: isB ? 0.5 : 1, transition:'all 0.15s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                  <div style={{ fontSize:13, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)' }}>
                    {l.origin.split(',')[0]} → {l.dest.split(',')[0]}
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    {isB && <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:6, background:'rgba(34,197,94,0.15)', color:'var(--success)' }}>BOOKED</span>}
                    <span style={{ fontSize:11, fontWeight:800, padding:'2px 8px', borderRadius:6, background:scC+'15', color:scC }}>{sc}</span>
                  </div>
                </div>
                <div style={{ display:'flex', gap:16, marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:'var(--accent)' }}>${l.rate}/mi</span>
                  <span style={{ fontSize:12, fontWeight:700 }}>${l.gross.toLocaleString()}</span>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>{l.miles} mi</span>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>{l.broker} · {l.equipment}</span>
                  <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                    {l.stops?.length > 0 && (
                      <span style={{ fontSize:9, fontWeight:800, padding:'1px 5px', borderRadius:5, background:'rgba(77,142,240,0.15)', color:'var(--accent2)' }}>
                        <MapPin size={11} />{l.stops.length}
                      </span>
                    )}
                    <span style={{ fontSize:11, fontWeight:600, padding:'1px 6px', borderRadius:5, background:b.color+'15', color:b.color }}>{b.risk}</span>
                  </div>
                </div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}><Ic icon={Calendar} /> {l.pickup} · {l.deadhead} mi deadhead</div>
              </div>
            )
          })}
        </div>

        {/* RIGHT: Detail panel */}
        {load ? (
          <div style={{ flex:1, overflowY:'auto', minHeight:0, display:'flex', flexDirection:'column' }}>

            {/* Detail header */}
            <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:16, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:1, lineHeight:1.1, marginBottom:4 }}>
                    {load.origin} → {load.dest}
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)', display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
                    {load.miles} mi · {EQUIPMENT_LABEL[load.equipment]} · {load.weight} lbs · {load.commodity}
                    {load.stops?.length > 0 && (
                      <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:6, background:'rgba(77,142,240,0.15)', color:'var(--accent2)' }}>
                        <MapPin size={13} /> {load.stops.length} STOPS · ALL-IN PRICE
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ textAlign:'center', background:scoreColor+'12', border:`2px solid ${scoreColor}`, borderRadius:14, padding:'8px 18px' }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:scoreColor, lineHeight:1 }}>{load.aiScore}</div>
                  <div style={{ fontSize:9, fontWeight:800, color:scoreColor, letterSpacing:1 }}>AI SCORE</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <span style={{ fontSize:11, padding:'4px 10px', background:'var(--surface2)', borderRadius:6 }}><Ic icon={Calendar} /> {load.pickup}</span>
                <span style={{ fontSize:11, padding:'4px 10px', background:'var(--surface2)', borderRadius:6 }}><Ic icon={Flag} /> {load.delivery}</span>
                <span style={{ fontSize:11, padding:'4px 10px', background:'var(--surface2)', borderRadius:6 }}><Ic icon={Bookmark} /> {load.refNum}</span>
                <span style={{ fontSize:11, padding:'4px 10px', background:'var(--surface2)', borderRadius:6 }}><Ic icon={Route} /> {load.deadhead} mi deadhead</span>
              </div>
            </div>

            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16, flex:1 }}>

              {/* AI Score breakdown */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={Bot} /> AI Score Breakdown</div>
                <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:10 }}>
                  {(() => {
                    const ln = lane || { avgRpm:2.70, trend:0, backhaul:50 }
                    const bk = bkr  || { score:70 }
                    const premium = (load.rate - ln.avgRpm) / ln.avgRpm
                    const bars = [
                      { label:'Rate vs Market',     val: Math.min(100, Math.max(0, Math.round(50 + premium * 160))), desc: load.rate > ln.avgRpm ? `+${((load.rate-ln.avgRpm)).toFixed(2)}/mi above lane avg` : `${((load.rate-ln.avgRpm)).toFixed(2)}/mi below lane avg` },
                      { label:'Broker Safety',       val: bk.score, desc: `${load.broker} · ${bk.risk} risk · pays ${bk.pay}` },
                      { label:'Deadhead Efficiency', val: Math.min(100, Math.max(0, Math.round(100 - (load.deadhead/load.miles)*150))), desc: `${load.deadhead} mi to pickup` },
                      { label:'Lane Trend',          val: ln.trend > 8 ? 92 : ln.trend > 3 ? 75 : ln.trend > 0 ? 60 : ln.trend > -5 ? 38 : 20, desc: `${ln.trend > 0 ? '+' : ''}${ln.trend}% rate trend this week` },
                      { label:'Backhaul Avail',      val: ln.backhaul, desc: `${ln.backhaul}% return load availability` },
                    ]
                    return bars.map(b => {
                      const c = b.val >= 75 ? 'var(--success)' : b.val >= 50 ? 'var(--accent)' : 'var(--danger)'
                      return (
                        <div key={b.label}>
                          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                            <span style={{ fontSize:12, fontWeight:600 }}>{b.label}</span>
                            <span style={{ fontSize:12, fontWeight:700, color:c }}>{b.val}</span>
                          </div>
                          <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden', marginBottom:2 }}>
                            <div style={{ height:'100%', width:`${b.val}%`, background:c, borderRadius:3, transition:'width 0.5s' }}/>
                          </div>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>{b.desc}</div>
                        </div>
                      )
                    })
                  })()}
                </div>
              </div>

              {/* Stop timeline — shown for multi-stop loads */}
              {load.stops?.length > 0 && <StopTimeline load={load} />}

              {/* Economics + Broker side by side */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

                {/* Load Economics */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={DollarSign} /> Load Economics</div>
                  <div style={{ padding:14 }}>
                    {[
                      { l:'Gross Revenue',   v:`$${load.gross.toLocaleString()}`,  c:'var(--accent)'  },
                      { l:'Est. Fuel',       v:`−$${estFuel.toLocaleString()}`,     c:'var(--danger)'  },
                      { l:'Driver Pay 28%',  v:`−$${estDriver.toLocaleString()}`,   c:'var(--danger)'  },
                      { l:'Net Profit',      v:`$${estNet.toLocaleString()}`,       c:'var(--success)', bold:true },
                      { l:'Net / Mile',      v:`$${(estNet/load.miles).toFixed(2)}/mi`, c:'var(--success)' },
                    ].map(row => (
                      <div key={row.l} style={{ display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>{row.l}</span>
                        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: row.bold ? 20 : 16, color:row.c }}>{row.v}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Broker info */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={Briefcase} /> Broker Intel</div>
                  <div style={{ padding:14 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                      <div style={{ width:36, height:36, borderRadius:8, background: bkr?.color+'18', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}><Building2 size={20} /></div>
                      <div>
                        <div style={{ fontSize:13, fontWeight:700 }}>{load.broker}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>Pays {bkr?.pay}</div>
                      </div>
                      <span style={{ marginLeft:'auto', fontSize:10, fontWeight:800, padding:'3px 8px', borderRadius:8, background:bkr?.color+'15', color:bkr?.color }}>{bkr?.risk} RISK</span>
                    </div>
                    {[
                      { l:'Pay Score',   v: bkr?.score + '/100' },
                      { l:'Pay Speed',   v: bkr?.pay },
                      { l:'Risk Level',  v: bkr?.risk },
                    ].map(row => (
                      <div key={row.l} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>{row.l}</span>
                        <span style={{ fontSize:11, fontWeight:700, color: row.l==='Risk Level' ? bkr?.color : 'var(--text)' }}>{row.v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Rate Negotiation */}
              {!booked[load.id] && <AIRateNegotiator load={load} lane={lane} bkr={bkr} onAccept={() => {}} />}

              {/* Book load */}
              {!booked[load.id] ? (
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:18 }}>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:12 }}><Ic icon={Zap} /> Book This Load</div>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <select value={assignDriver} onChange={e => setAssignDriver(e.target.value)}
                      style={{ ...selectStyle, flex:1, padding:'10px 12px', fontSize:13 }}>
                      <option value="">Assign Driver…</option>
                      <option value="James Tucker">James Tucker (Unit 01)</option>
                      <option value="Marcus Lee">Marcus Lee (Unit 02)</option>
                      <option value="Priya Patel">Priya Patel (Unit 03)</option>
                    </select>
                    <button className="btn btn-primary" onClick={handleBook}
                      style={{ padding:'10px 28px', fontSize:13, whiteSpace:'nowrap', opacity: assignDriver ? 1 : 0.5 }}>
                      Book Load →
                    </button>
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginTop:8 }}>
                    Booking adds to dispatch queue with status "Rate Con Received". Upload rate con PDF to auto-fill all fields.
                  </div>
                </div>
              ) : (
                <div style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:12, padding:20 }}>
                  <div style={{ textAlign:'center', marginBottom:16 }}>
                    <div style={{ marginBottom:6 }}><Check size={28} /></div>
                    <div style={{ fontSize:15, fontWeight:700, color:'var(--success)', marginBottom:4 }}>Load Booked</div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>Added to your dispatch queue</div>
                  </div>
                  {/* Rate Con Upload */}
                  <input ref={rcFileRef} type="file" accept=".pdf,.png,.jpg,.jpeg" style={{ display:'none' }}
                    onChange={e => { if (e.target.files?.[0]) parseCarrierRC(e.target.files[0]) }} />
                  {rateConFile ? (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'10px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10 }}>
                      {parsingRC ? (
                        <span style={{ fontSize:12, color:'var(--accent)', fontWeight:600, display:'flex', alignItems:'center', gap:6 }}>
                          <span style={{ width:12, height:12, border:'2px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%', animation:'spin 0.8s linear infinite', display:'inline-block' }} />
                          Reading {rateConFile.name}...
                        </span>
                      ) : (
                        <>
                          <CheckCircle size={14} style={{ color:'var(--success)' }} />
                          <span style={{ fontSize:12, fontWeight:600 }}>{rateConFile.name}</span>
                          <span style={{ fontSize:10, color:'var(--muted)' }}>({(rateConFile.size/1024).toFixed(0)} KB)</span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div onClick={() => rcFileRef.current?.click()}
                      onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor='var(--accent)' }}
                      onDragLeave={e => { e.currentTarget.style.borderColor='var(--border)' }}
                      onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor='var(--border)'; parseCarrierRC(e.dataTransfer.files[0]) }}
                      style={{ padding:'12px 16px', border:'1px dashed var(--border)', borderRadius:10, textAlign:'center', cursor:'pointer', transition:'border-color 0.2s' }}
                      onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
                      onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}>
                      <FileText size={18} style={{ color:'var(--muted)', marginBottom:4 }} />
                      <div style={{ fontSize:12, fontWeight:600 }}>Drop rate con here or click to upload</div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>PDF, PNG, or JPG</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:'var(--muted)' }}>
            <div><FileText size={40} /></div>
            <div style={{ fontSize:13 }}>Select a load to see AI analysis</div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CASH FLOW FORECASTER ─────────────────────────────────────────────────────
const CF_WEEKS = [
  { label:'Mar 9',  range:'Mar 9–15'     },
  { label:'Mar 16', range:'Mar 16–22'    },
  { label:'Mar 23', range:'Mar 23–29'    },
  { label:'Mar 30', range:'Mar 30–Apr 5' },
  { label:'Apr 6',  range:'Apr 6–12'     },
  { label:'Apr 13', range:'Apr 13–19'    },
]

// Map due-date strings to week index 0-5
const CF_DUE_WEEK = {
  'Mar 9':0,'Mar 10':0,'Mar 11':0,'Mar 12':0,'Mar 13':0,'Mar 14':0,'Mar 15':0,
  'Mar 16':1,'Mar 17':1,'Mar 18':1,'Mar 19':1,'Mar 20':1,'Mar 21':1,'Mar 22':1,
  'Mar 23':2,'Mar 24':2,'Mar 25':2,'Mar 26':2,'Mar 27':2,'Mar 28':2,'Mar 29':2,
  'Mar 30':3,'Mar 31':3,'Apr 1':3,'Apr 2':3,'Apr 3':3,'Apr 4':3,'Apr 5':3,
  'Apr 6':4,'Apr 7':4,'Apr 8':4,'Apr 9':4,'Apr 10':4,'Apr 11':4,'Apr 12':4,
  'Apr 13':5,'Apr 14':5,'Apr 15':5,'Apr 16':5,'Apr 17':5,'Apr 18':5,'Apr 19':5,
}

const CF_START_BALANCE = 12400

export function CashFlowForecaster() {
  const { loads, invoices, expenses } = useCarrier()
  const { showToast } = useApp()
  const [selWeek, setSelWeek] = useState(0)
  const [factorId, setFactorId] = useState(null)

  const forecast = useMemo(() => {
    const incoming = [0, 0, 0, 0, 0, 0]
    const items    = [[], [], [], [], [], []]

    // 1. Unpaid invoices → their due week
    invoices.filter(i => i.status === 'Unpaid').forEach(inv => {
      const wk = CF_DUE_WEEK[inv.dueDate] ?? 4
      incoming[wk] += inv.amount
      items[wk].push({ type:'invoice', id:inv.id, label:`${inv.id} · ${inv.route}`, amount:inv.amount, broker:inv.broker, detail:`Due ${inv.dueDate}`, factorAmt: Math.round(inv.amount * 0.975) })
    })

    // 2. Active loads → delivery week + 30-day payment
    loads.filter(l => !['Delivered','Invoiced'].includes(l.status)).forEach(load => {
      const delDate = load.delivery?.split(' · ')[0] || ''
      const delWk   = CF_DUE_WEEK[delDate] ?? 1
      const payWk   = Math.min(5, delWk + 4)
      incoming[payWk] += load.gross
      items[payWk].push({ type:'load', id:load.loadId, label:`${load.loadId} · ${load.origin?.split(',')[0]}→${load.dest?.split(',')[0]}`, amount:load.gross, broker:load.broker, detail:`Delivers ${delDate || 'TBD'} · pays ~30 days later`, projected:true })
    })

    // 3. Weekly outgoing (deterministic, no Math.random)
    const totalExpAmt = expenses.reduce((s,e) => s + e.amount, 0)
    const weeklyBase  = Math.round(totalExpAmt / 4) // spread over 4 weeks of history
    const outgoing = CF_WEEKS.map((_, i) => {
      const driverPay = Math.round(incoming[i] * 0.28)
      const fuel      = 840  // ~$280/truck/week × 3
      const ops       = i === 0 ? Math.round(weeklyBase * 0.6) : Math.round(weeklyBase * 0.35)
      return driverPay + fuel + ops
    })

    // Cumulative balance
    let bal = CF_START_BALANCE
    const balance = CF_WEEKS.map((_, i) => {
      bal += incoming[i] - outgoing[i]
      return bal
    })

    return { incoming, outgoing, balance, items }
  }, [loads, invoices, expenses])

  const { incoming, outgoing, balance, items } = forecast

  const totalIn  = incoming.reduce((s,v) => s + v, 0)
  const totalOut = outgoing.reduce((s,v) => s + v, 0)
  const projBal  = CF_START_BALANCE + totalIn - totalOut
  const maxBar   = Math.max(...incoming, ...outgoing, 1)

  const selNet = incoming[selWeek] - outgoing[selWeek]

  // AI insights (deterministic)
  const unpaidTotal  = invoices.filter(i => i.status === 'Unpaid').reduce((s,i) => s + i.amount, 0)
  const thinWeekIdx  = balance.findIndex(b => b < 8000)
  const peakWeekIdx  = incoming.indexOf(Math.max(...incoming))
  const insights = [
    unpaidTotal > 3000 && { icon: Lightbulb, color:'var(--accent)',  text:`$${unpaidTotal.toLocaleString()} in unpaid invoices sitting out there. Factor the largest one now for same-day cash at 2.5% fee.` },
    thinWeekIdx >= 0   && { icon: AlertTriangle, color:'var(--warning)', text:`Week of ${CF_WEEKS[thinWeekIdx].label} projects low — $${balance[thinWeekIdx].toLocaleString()} balance. Either factor an invoice or hold a non-urgent expense.` },
    peakWeekIdx >= 0 && incoming[peakWeekIdx] > 0 && { icon: TrendingUp, color:'var(--success)', text:`Strongest week: ${CF_WEEKS[peakWeekIdx].label} — $${incoming[peakWeekIdx].toLocaleString()} expected from ${items[peakWeekIdx].length} source${items[peakWeekIdx].length !== 1 ? 's' : ''}.` },
    { icon: Truck, color:'var(--accent2)', text:`Reserve ~$${Math.round(totalIn * 0.28).toLocaleString()} for driver pay over 6 weeks (28% of projected revenue).` },
  ].filter(Boolean)

  const kpis = [
    { l:'Current Balance',   v:`$${CF_START_BALANCE.toLocaleString()}`,   c:'var(--text)',    s:'Est. starting position' },
    { l:'Incoming · 6 wks',  v:`$${totalIn.toLocaleString()}`,            c:'var(--success)', s:'Invoices + loads' },
    { l:'Outgoing · 6 wks',  v:`$${totalOut.toLocaleString()}`,           c:'var(--danger)',  s:'Pay + fuel + ops' },
    { l:'Projected Balance', v:`$${projBal.toLocaleString()}`,            c: projBal >= CF_START_BALANCE ? 'var(--success)' : 'var(--danger)', s:'6-week end position' },
  ]

  return (
    <div style={{ padding:20, overflowY:'auto', height:'100%', boxSizing:'border-box', display:'flex', flexDirection:'column', gap:16 }}>

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
        {kpis.map(k => (
          <div key={k.l} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4, fontWeight:600, letterSpacing:0.5 }}>{k.l.toUpperCase()}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:k.c, lineHeight:1, marginBottom:4 }}>{k.v}</div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>{k.s}</div>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12 }}>
          <span style={{ fontWeight:700, fontSize:13 }}><Ic icon={BarChart2} /> 6-Week Cash Flow</span>
          <div style={{ display:'flex', gap:16, marginLeft:'auto', fontSize:11, color:'var(--muted)' }}>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:10, height:10, borderRadius:2, background:'rgba(34,197,94,0.6)' }}/> Incoming</span>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:10, height:10, borderRadius:2, background:'rgba(239,68,68,0.5)' }}/> Outgoing</span>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}><div style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent)' }}/> Running Balance</span>
          </div>
        </div>

        <div style={{ padding:'20px 24px 12px' }}>
          {/* Bars */}
          <div style={{ display:'flex', gap:10, alignItems:'flex-end', height:160, marginBottom:4 }}>
            {CF_WEEKS.map((wk, i) => {
              const inH  = Math.max(4, (incoming[i] / maxBar) * 148)
              const outH = Math.max(4, (outgoing[i] / maxBar) * 148)
              const isSel = selWeek === i
              const net   = incoming[i] - outgoing[i]
              return (
                <div key={i} onClick={() => setSelWeek(i)}
                  style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', cursor:'pointer' }}>
                  <div style={{ fontSize:9, fontWeight:700, color: net >= 0 ? 'var(--success)' : 'var(--danger)', marginBottom:4 }}>
                    {net >= 0 ? '+' : ''}{(net/1000).toFixed(1)}k
                  </div>
                  <div style={{ width:'100%', display:'flex', gap:2, alignItems:'flex-end' }}>
                    <div style={{ flex:1, height:`${inH}px`, borderRadius:'3px 3px 0 0', transition:'all 0.2s',
                      background: isSel ? 'var(--success)' : 'rgba(34,197,94,0.45)',
                      border:`1px solid ${isSel ? 'var(--success)' : 'transparent'}` }}/>
                    <div style={{ flex:1, height:`${outH}px`, borderRadius:'3px 3px 0 0', transition:'all 0.2s',
                      background: isSel ? 'var(--danger)' : 'rgba(239,68,68,0.38)',
                      border:`1px solid ${isSel ? 'var(--danger)' : 'transparent'}` }}/>
                  </div>
                </div>
              )
            })}
          </div>
          {/* Balance line labels + week labels */}
          <div style={{ display:'flex', gap:10 }}>
            {CF_WEEKS.map((wk, i) => {
              const isSel = selWeek === i
              return (
                <div key={i} onClick={() => setSelWeek(i)}
                  style={{ flex:1, textAlign:'center', cursor:'pointer', paddingTop:6, borderTop:`2px solid ${isSel ? 'var(--accent)' : 'transparent'}` }}>
                  <div style={{ fontSize:9, fontWeight:700, color:'var(--accent)', marginBottom:2 }}>
                    ${(balance[i]/1000).toFixed(1)}k
                  </div>
                  <div style={{ fontSize:10, fontWeight: isSel ? 700 : 400, color: isSel ? 'var(--accent)' : 'var(--muted)' }}>
                    {wk.label}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Bottom: Week detail + AI insights */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

        {/* Selected week breakdown */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
            <span style={{ fontWeight:700, fontSize:13 }}><Ic icon={Calendar} /> {CF_WEEKS[selWeek].range}</span>
            <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
              {selWeek > 0 && <button className="btn btn-ghost" style={{ fontSize:10, padding:'3px 8px' }} onClick={() => setSelWeek(w => w - 1)}>‹</button>}
              {selWeek < 5 && <button className="btn btn-ghost" style={{ fontSize:10, padding:'3px 8px' }} onClick={() => setSelWeek(w => w + 1)}>›</button>}
            </div>
          </div>

          <div style={{ padding:14 }}>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8, marginBottom:14 }}>
              {[
                { l:'Incoming', v:`$${incoming[selWeek].toLocaleString()}`,  c:'var(--success)' },
                { l:'Outgoing', v:`$${outgoing[selWeek].toLocaleString()}`,  c:'var(--danger)'  },
                { l:'Net',      v:`${selNet>=0?'+':''}$${selNet.toLocaleString()}`, c: selNet >= 0 ? 'var(--success)' : 'var(--danger)' },
                { l:'Balance',  v:`$${balance[selWeek].toLocaleString()}`,   c:'var(--accent)'  },
              ].map(s => (
                <div key={s.l} style={{ background:'var(--surface2)', borderRadius:8, padding:'9px 12px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:3 }}>{s.l}</div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:s.c }}>{s.v}</div>
                </div>
              ))}
            </div>

            {/* Expense line items */}
            <div style={{ marginBottom:8, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              {[
                { label:'Driver Pay (28%)', amount: Math.round(incoming[selWeek] * 0.28), out:true },
                { label:'Fuel est. · 3 trucks', amount: 840, out:true },
                { label:'Ops / Maintenance',    amount: outgoing[selWeek] - Math.round(incoming[selWeek] * 0.28) - 840, out:true },
              ].filter(e => e.amount > 0).map(e => (
                <div key={e.label} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0' }}>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>{e.label}</span>
                  <span style={{ fontSize:11, fontWeight:600, color:'var(--danger)' }}>−${e.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>

            {/* Income line items */}
            {items[selWeek].length === 0
              ? <div style={{ textAlign:'center', padding:'16px 0', color:'var(--muted)', fontSize:12 }}>No invoices or loads due this week</div>
              : items[selWeek].map((item, idx) => (
                <div key={idx} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0,
                    background: item.projected ? 'var(--accent2)' : 'var(--success)' }}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.label}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>{item.broker} · {item.detail}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontSize:13, fontWeight:700, color:'var(--success)' }}>+${item.amount.toLocaleString()}</div>
                    {item.factorAmt && !item.projected && (
                      <div style={{ fontSize:10, color:'var(--accent)', cursor:'pointer' }}
                        onClick={() => showToast('','Factor Now',`Factoring ${item.id} — $${item.factorAmt.toLocaleString()} same-day deposit initiated`)}>
                        Factor → ${item.factorAmt.toLocaleString()}
                      </div>
                    )}
                  </div>
                  <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:5, flexShrink:0,
                    background: item.projected ? 'rgba(0,212,170,0.12)' : 'rgba(34,197,94,0.12)',
                    color: item.projected ? 'var(--accent2)' : 'var(--success)' }}>
                    {item.projected ? 'EST' : 'DUE'}
                  </span>
                </div>
              ))
            }
          </div>
        </div>

        {/* AI Insights */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontWeight:700, fontSize:13 }}><Ic icon={Bot} /> AI Cash Flow Insights</span>
            <span style={{ fontSize:10, padding:'2px 7px', background:'rgba(240,165,0,0.12)', color:'var(--accent)', borderRadius:6, fontWeight:800 }}>LIVE</span>
          </div>
          <div style={{ padding:14, display:'flex', flexDirection:'column', gap:10, flex:1 }}>
            {insights.map((ins, i) => (
              <div key={i} style={{ padding:'12px 14px', background:ins.color+'08', border:`1px solid ${ins.color}28`, borderRadius:10, display:'flex', gap:10, alignItems:'flex-start' }}>
                <span style={{ fontSize:18, flexShrink:0, lineHeight:1.4 }}>{typeof ins.icon === "string" ? ins.icon : <ins.icon size={18} />}</span>
                <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.55 }}>{ins.text}</div>
              </div>
            ))}

            {/* Quick action: factor largest unpaid */}
            {invoices.filter(i => i.status === 'Unpaid').length > 0 && (
              <div style={{ marginTop:'auto', padding:'12px 14px', background:'rgba(240,165,0,0.05)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:10 }}>
                <div style={{ fontSize:11, fontWeight:700, marginBottom:8 }}><Ic icon={Zap} /> Quick Actions</div>
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {invoices.filter(i => i.status === 'Unpaid').slice(0,2).map(inv => (
                    <div key={inv.id} style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:11, flex:1, color:'var(--muted)' }}>{inv.id} · ${inv.amount.toLocaleString()}</span>
                      <button className="btn btn-ghost" style={{ fontSize:10, padding:'3px 10px', color:'var(--accent)', borderColor:'rgba(240,165,0,0.3)' }}
                        onClick={() => showToast('','Factored',`${inv.id} sent to factor — $${Math.round(inv.amount*0.975).toLocaleString()} incoming`)}>
                        Factor 2.5%
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── CHECK CALL CENTER ────────────────────────────────────────────────────────
const CC_STATUS_OPTS = ['On Time','Running Late','At Stop','Delay — Weather','Delay — Traffic','Issues — Call Me']
const CC_STATUS_COLOR = {
  'On Time':           'var(--success)',
  'Running Late':      'var(--warning)',
  'At Stop':           'var(--accent2)',
  'Delay — Weather':   'var(--warning)',
  'Delay — Traffic':   'var(--warning)',
  'Issues — Call Me':  'var(--danger)',
}

function fmtTs(ts) {
  const d    = new Date(ts)
  const mon  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
  const time = d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true })
  return `${mon} ${d.getDate()} · ${time}`
}

function hoursAgo(ts) {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : (ts || 0)
  const h = (Date.now() - t) / 3600000
  if (h < 1)  return `${Math.round(h * 60)}m ago`
  if (h < 24) return `${h.toFixed(1).replace('.0','')}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function callStatus(calls) {
  if (!calls?.length) return 'none'
  const raw = calls[0].ts || calls[0].called_at
  const t = typeof raw === 'string' ? new Date(raw).getTime() : (raw || 0)
  const h = (Date.now() - t) / 3600000
  if (h > 4)  return 'overdue'
  if (h > 2)  return 'due'
  return 'recent'
}

function generateMsg(load, call) {
  const lines = [
    `Check Call — ${load.loadId} (${load.broker})`,
    `Location: ${call.location}`,
    `Time: ${fmtTs(Date.now())}`,
    `Status: ${call.status}`,
    `Driver: ${load.driver} · ${load.loadId}`,
    call.eta    ? `Delivery ETA: ${call.eta}` : `Delivery: ${load.delivery}`,
    call.notes  ? `Notes: ${call.notes}` : '',
    `Ref: ${load.refNum}`,
    `— Sent via Qivori AI`,
  ]
  return lines.filter(Boolean).join('\n')
}

function buildRouteSuggestions(load, lastCall) {
  const pts = []
  if (load?.origin) pts.push(load.origin.split(',')[0].trim())
  if (load?.dest || load?.destination) pts.push((load.dest || load.destination).split(',')[0].trim())
  if (lastCall?.location) pts.push(lastCall.location)
  // Add origin/dest full
  if (load?.origin) pts.push(load.origin)
  if (load?.dest || load?.destination) pts.push(load.dest || load.destination)
  return [...new Set(pts)].slice(0, 5)
}

export function CheckCallCenter() {
  const { showToast } = useApp()
  const { activeLoads, checkCalls, logCheckCall } = useCarrier()
  const [selLoad,    setSelLoad]    = useState(activeLoads[0]?.loadId || null)
  const [location,   setLocation]   = useState('')
  const [status,     setStatus]     = useState('On Time')
  const [eta,        setEta]        = useState('')
  const [notes,      setNotes]      = useState('')
  const [showMsg,    setShowMsg]    = useState(false)
  const [copied,     setCopied]     = useState(false)
  const [filterOver, setFilterOver] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [brokerPhones, setBrokerPhones] = useState({}) // loadId → phone number

  const getPhoneLocation = () => {
    if (!navigator.geolocation) { showToast('','GPS Unavailable','Your browser does not support geolocation'); return }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' }
          })
          const data = await res.json()
          const addr = data.address || {}
          const city = addr.city || addr.town || addr.village || addr.county || ''
          const state = addr.state || ''
          const loc = [city, state].filter(Boolean).join(', ')
          setLocation(loc || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
          showToast('','Location Found', loc || 'GPS coordinates set')
        } catch {
          setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
          showToast('','GPS Location Set','Could not get city name, using coordinates')
        }
        setGpsLoading(false)
      },
      (err) => {
        setGpsLoading(false)
        const msgs = { 1:'Location permission denied — enable it in your browser settings', 2:'Could not determine location — try again', 3:'Location request timed out — try again' }
        showToast('','Location Error', msgs[err.code] || 'Failed to get location')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  const load       = activeLoads.find(l => l.loadId === selLoad)
  const loadCalls  = load ? (checkCalls[load.loadId] || []) : []
  const generatedMsg = load ? generateMsg(load, { location, status, eta, notes }) : ''
  const lastCall   = loadCalls[0] || null
  const suggestions = load ? buildRouteSuggestions(load, lastCall) : []

  // Auto-fill location, ETA & broker phone when selecting a load
  useEffect(() => {
    if (!load) return
    const calls = checkCalls[load.loadId] || []
    if (calls.length > 0) {
      setLocation(calls[0].location || '')
    } else {
      setLocation(load.origin || '')
    }
    setEta(load.delivery || '')
    setStatus('On Time')
    setNotes('')
    setShowMsg(false)
    setCopied(false)
    // Pre-fill broker phone from rate con data if available
    if (load.brokerPhone && !brokerPhones[load.loadId]) {
      setBrokerPhones(p => ({ ...p, [load.loadId]: load.brokerPhone }))
    }
  }, [selLoad]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentBrokerPhone = brokerPhones[load?.loadId] || load?.brokerPhone || ''

  const handleLog = () => {
    if (!load || !location.trim()) { showToast('','Missing Info','Enter a current location before logging'); return }
    logCheckCall(load.loadId, { location: location.trim(), status, eta, notes: notes.trim() })
    showToast('','Check Call Logged', `${load.loadId} · ${location} · ${status}`)
    setLocation('')
    setNotes('')
    setShowMsg(false)
    setCopied(false)
  }

  const handleCopy = () => {
    navigator.clipboard?.writeText(generatedMsg).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showToast('','Copied','Broker update message copied to clipboard')
  }

  const visibleLoads = filterOver
    ? activeLoads.filter(l => callStatus(checkCalls[l.loadId]) === 'overdue')
    : activeLoads

  const inp = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none', width:'100%', boxSizing:'border-box' }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* LEFT: Load list */}
      <div style={{ width:260, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', background:'var(--surface)' }}>

        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:8 }}>CHECK CALLS</div>
          <button onClick={() => setFilterOver(f => !f)}
            style={{ width:'100%', padding:'6px 10px', fontSize:11, fontWeight:700, borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              background: filterOver ? 'rgba(239,68,68,0.12)' : 'var(--surface2)',
              color: filterOver ? 'var(--danger)' : 'var(--muted)',
              border: `1px solid ${filterOver ? 'rgba(239,68,68,0.3)' : 'var(--border)'}` }}>
            {filterOver ? <><AlertTriangle size={13} /> Showing Overdue Only</> : 'Show All Active Loads'}
          </button>
        </div>

        <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
          {visibleLoads.map(l => {
            const calls  = checkCalls[l.loadId] || []
            const cs     = callStatus(calls)
            const isSel  = selLoad === l.loadId
            const csColor = cs === 'overdue' ? 'var(--danger)' : cs === 'due' ? 'var(--warning)' : cs === 'recent' ? 'var(--success)' : 'var(--muted)'
            const csLabel = cs === 'overdue' ? 'OVERDUE' : cs === 'due' ? 'DUE' : cs === 'recent' ? 'RECENT' : '— NO CALLS'

            return (
              <div key={l.loadId} onClick={() => setSelLoad(l.loadId)}
                style={{ padding:'13px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                  background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.12s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)' }}>{l.loadId}</span>
                  <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:5, background:csColor+'15', color:csColor }}>{csLabel}</span>
                </div>
                <div style={{ fontSize:12, fontWeight:600, marginBottom:3 }}>
                  {l.origin?.split(',')[0]} → {l.dest?.split(',')[0]}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>
                  {l.driver} · {l.broker}
                </div>
                {calls.length > 0
                  ? <div style={{ fontSize:10, color:'var(--muted)' }}>Last call {hoursAgo(calls[0].ts || calls[0].called_at)} · {calls[0].location}</div>
                  : <div style={{ fontSize:10, color:'var(--muted)', fontStyle:'italic' }}>No check calls logged yet</div>
                }
              </div>
            )
          })}
          {visibleLoads.length === 0 && (
            <div style={{ padding:24, textAlign:'center', fontSize:12, color:'var(--muted)' }}>
              {filterOver ? 'No overdue check calls' : 'No active loads'}
            </div>
          )}
        </div>

        {/* Summary footer */}
        <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
          {[
            { label:'Overdue',   count: activeLoads.filter(l => callStatus(checkCalls[l.loadId]) === 'overdue').length, color:'var(--danger)'  },
            { label:'Due Soon',  count: activeLoads.filter(l => callStatus(checkCalls[l.loadId]) === 'due').length,     color:'var(--warning)' },
            { label:'Up to Date',count: activeLoads.filter(l => callStatus(checkCalls[l.loadId]) === 'recent').length,  color:'var(--success)' },
          ].map(s => (
            <div key={s.label} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>{s.label}</span>
              <span style={{ fontSize:11, fontWeight:700, color:s.color }}>{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Detail + log form */}
      {load ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Header */}
          <div style={{ padding:'14px 22px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0, display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:2 }}>
                {load.loadId} · {load.origin?.split(',')[0]} → {load.dest?.split(',')[0]}
              </div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>
                {load.driver} · {load.broker} · {load.miles} mi · Delivery: {load.delivery}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>Last check call</div>
              <div style={{ fontSize:13, fontWeight:700, color: loadCalls.length ? 'var(--text)' : 'var(--muted)' }}>
                {loadCalls.length ? hoursAgo(loadCalls[0].ts || loadCalls[0].called_at) : 'Never'}
              </div>
            </div>
          </div>

          <div style={{ flex:1, overflowY:'auto', minHeight:0, display:'flex', gap:0 }}>

            {/* Log form */}
            <div style={{ width:340, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
              <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:20, display:'flex', flexDirection:'column', gap:14 }}>

                {/* Overdue alert */}
                {callStatus(loadCalls) === 'overdue' && (
                  <div style={{ padding:'10px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:8, fontSize:12, color:'var(--danger)', display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ fontSize:18 }}><AlertTriangle size={18} /></span>
                    <span>Check call overdue — last update {hoursAgo(loadCalls[0]?.ts || loadCalls[0]?.called_at)}. Broker may be expecting an update.</span>
                  </div>
                )}

                <div style={{ fontSize:12, fontWeight:800, color:'var(--accent)', letterSpacing:1.5 }}>LOG CHECK CALL</div>

                {/* Location */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Current Location *</label>
                  <div style={{ display:'flex', gap:6 }}>
                    <input value={location} onChange={e => setLocation(e.target.value)}
                      placeholder="e.g. New Orleans, LA" style={{ ...inp, flex:1 }}/>
                    <button onClick={getPhoneLocation} disabled={gpsLoading}
                      style={{ flexShrink:0, padding:'8px 12px', background: gpsLoading ? 'rgba(240,165,0,0.15)' : 'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, cursor: gpsLoading ? 'wait' : 'pointer', color: gpsLoading ? 'var(--accent)' : 'var(--accent2)', fontSize:11, fontWeight:700, fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:5 }}>
                      <Navigation size={13} style={ gpsLoading ? { animation:'spin 1s linear infinite' } : {} } />
                      {gpsLoading ? 'Finding...' : 'GPS'}
                    </button>
                  </div>
                  {suggestions.length > 0 && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:6 }}>
                      {suggestions.map(s => (
                        <button key={s} onClick={() => setLocation(s)}
                          style={{ fontSize:10, padding:'3px 8px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, cursor:'pointer', color:'var(--muted)', fontFamily:"'DM Sans',sans-serif" }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Status</label>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {CC_STATUS_OPTS.map(s => (
                      <button key={s} onClick={() => setStatus(s)}
                        style={{ padding:'5px 10px', fontSize:11, fontWeight:600, borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                          background: status === s ? CC_STATUS_COLOR[s]+'20' : 'var(--surface2)',
                          color:      status === s ? CC_STATUS_COLOR[s] : 'var(--muted)',
                          border:     `1px solid ${status === s ? CC_STATUS_COLOR[s]+'50' : 'var(--border)'}` }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ETA override */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>ETA (if changed)</label>
                  <input value={eta} onChange={e => setEta(e.target.value)}
                    placeholder={load.delivery || 'e.g. Mar 13 · 6:00 PM'} style={inp}/>
                </div>

                {/* Broker Phone */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>
                    Broker Phone {currentBrokerPhone ? <span style={{ color:'var(--success)', fontSize:10 }}> — from rate con</span> : <span style={{ color:'var(--warning)', fontSize:10 }}> — enter to enable text/call</span>}
                  </label>
                  <input value={currentBrokerPhone}
                    onChange={e => setBrokerPhones(p => ({ ...p, [load.loadId]: e.target.value }))}
                    placeholder="(555) 123-4567"
                    style={inp}/>
                </div>

                {/* Notes */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                    placeholder="Any issues, delays, or comments for broker…"
                    style={{ ...inp, resize:'vertical', lineHeight:1.5 }}/>
                </div>

                {/* Message preview toggle */}
                <button onClick={() => setShowMsg(m => !m)}
                  style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' }}>
                  {showMsg ? '▾ Hide' : '▸ Preview'} broker update message
                </button>

                {showMsg && (
                  <div style={{ background:'rgba(0,0,0,0.2)', border:'1px solid var(--border)', borderRadius:8, padding:12 }}>
                    <pre style={{ fontSize:11, color:'var(--text)', fontFamily:"'DM Sans',sans-serif", whiteSpace:'pre-wrap', margin:0, lineHeight:1.6 }}>
                      {generatedMsg}
                    </pre>
                    <button onClick={handleCopy}
                      style={{ marginTop:8, width:'100%', padding:'6px', background: copied ? 'rgba(34,197,94,0.12)' : 'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, fontSize:11, color: copied ? 'var(--success)' : 'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
                      {copied ? <><Check size={13} /> Copied!</> : <><FileText size={13} /> Copy to Clipboard</>}
                    </button>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ padding:16, borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8, flexShrink:0 }}>
                <button className="btn btn-primary" style={{ width:'100%', fontSize:12, justifyContent:'center', padding:'11px 0' }} onClick={handleLog}>
                  <Phone size={13} /> Log Check Call
                </button>
                <div style={{ display:'flex', gap:6 }}>
                  {(() => {
                    const brokerNum = (currentBrokerPhone || '').replace(/[^0-9+]/g, '')
                    const smsHref = brokerNum
                      ? `sms:${brokerNum}${/iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(generatedMsg)}`
                      : `sms:${/iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(generatedMsg)}`
                    const telHref = brokerNum ? `tel:${brokerNum}` : '#'
                    return <>
                      <a href={smsHref}
                        style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px 0', fontSize:11, fontWeight:700, borderRadius:8, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.25)', color:'var(--success)', textDecoration:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}
                        onClick={() => { handleLog(); showToast('','SMS Opened','Check call logged + SMS ready to send') }}>
                        <MessageCircle size={13} /> Text Broker
                      </a>
                      <a href={telHref}
                        style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px 0', fontSize:11, fontWeight:700, borderRadius:8, background:'rgba(77,142,240,0.08)', border:'1px solid rgba(77,142,240,0.25)', color: brokerNum ? 'var(--accent3)' : 'var(--muted)', textDecoration:'none', cursor: brokerNum ? 'pointer' : 'default', fontFamily:"'DM Sans',sans-serif", opacity: brokerNum ? 1 : 0.5 }}
                        onClick={(e) => {
                          if (!brokerNum) { e.preventDefault(); showToast('','No Phone Number','Add broker phone to the load to enable calling'); return }
                          handleLog(); showToast('','Calling Broker','Check call logged + dialing ' + load.broker)
                        }}>
                        <Phone size={13} /> Call Broker
                      </a>
                    </>
                  })()}
                </div>
                <button className="btn btn-ghost" style={{ width:'100%', fontSize:11, padding:'7px 0' }} onClick={() => setShowMsg(m => !m)}>
                  <FileText size={13} /> {showMsg ? 'Hide' : 'Preview'} Message
                </button>
              </div>
            </div>

            {/* Call history */}
            <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:20, display:'flex', flexDirection:'column', gap:0 }}>
              <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:14 }}>
                CALL HISTORY · {loadCalls.length} LOGGED
              </div>

              {loadCalls.length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--muted)', fontSize:12 }}>
                  <div style={{ fontSize:32, marginBottom:8 }}><Phone size={32} /></div>
                  No check calls logged yet for this load.<br/>Log the first one to start tracking.
                </div>
              )}

              {loadCalls.map((call, idx) => {
                const sc = CC_STATUS_COLOR[call.status] || 'var(--muted)'
                return (
                  <div key={call.id} style={{ display:'flex', gap:14, position:'relative', paddingBottom:20 }}>
                    {idx < loadCalls.length - 1 && (
                      <div style={{ position:'absolute', left:9, top:22, bottom:0, width:2, background:'var(--border)' }}/>
                    )}
                    <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2,
                      background: idx === 0 ? sc : 'var(--surface2)',
                      border:`2px solid ${idx === 0 ? sc : 'var(--border)'}`,
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, zIndex:1,
                      color: idx === 0 ? '#000' : 'var(--muted)', fontWeight:800 }}>
                      {idx === 0 ? '●' : loadCalls.length - idx}
                    </div>
                    <div style={{ flex:1, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                        <div>
                          <span style={{ fontSize:12, fontWeight:700, color: idx === 0 ? 'var(--text)' : 'var(--muted)' }}><Ic icon={MapPin} /> {call.location}</span>
                          {idx === 0 && <span style={{ marginLeft:8, fontSize:10, color:'var(--accent)', fontWeight:700 }}>LATEST</span>}
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6, background:sc+'15', color:sc }}>{call.status}</span>
                      </div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginBottom: call.notes ? 6 : 0 }}>
                        <Clock size={11} /> {fmtTs(call.ts || call.called_at)}
                        {call.eta && <span style={{ marginLeft:12 }}><Ic icon={Calendar} /> ETA: {call.eta}</span>}
                      </div>
                      {call.notes && (
                        <div style={{ fontSize:11, color:'var(--text)', marginTop:4, padding:'6px 10px', background:'rgba(255,255,255,0.03)', borderRadius:6, fontStyle:'italic' }}>
                          "{call.notes}"
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:'var(--muted)' }}>
          <div><Phone size={40} /></div>
          <div style={{ fontSize:13 }}>Select a load to log check calls</div>
        </div>
      )}
    </div>
  )
}

// ─── DRIVER SCORECARD ─────────────────────────────────────────────────────────
const DS_DRIVERS = []

const DS_WEEKS = ['Feb 16', 'Feb 23', 'Mar 2', 'Mar 9']

// Compute loads delivered in a given week for a driver (rough by pickup date prefix)
function getWeekLoads(loads, driver, weekLabel) {
  const [mon, day] = weekLabel.split(' ')
  const startDay   = parseInt(day)
  return loads.filter(l => {
    if (l.driver !== driver) return false
    if (!l.pickup) return false
    const p = l.pickup
    if (!p.startsWith(mon)) return false
    const d = parseInt(p.split(' ')[1])
    return d >= startDay && d < startDay + 7
  })
}

function letterGrade(rpm, onTime) {
  const score = rpm * 60 + onTime * 0.4
  if (score >= 210) return { g:'A+', c:'#22c55e' }
  if (score >= 195) return { g:'A',  c:'#4ade80' }
  if (score >= 180) return { g:'B+', c:'#86efac' }
  if (score >= 165) return { g:'B',  c:'var(--accent)' }
  if (score >= 145) return { g:'C',  c:'#fb923c' }
  return                     { g:'D',  c:'var(--danger)' }
}

export function DriverScorecard() {
  const { loads, expenses } = useCarrier()
  const [selDriver, setSelDriver] = useState(DS_DRIVERS[0])
  const [selWeekIdx, setSelWeekIdx] = useState(DS_WEEKS.length - 1)

  // Per-driver stats across all delivered/invoiced loads
  const driverStats = useMemo(() => {
    return DS_DRIVERS.map(name => {
      const myLoads = loads.filter(l => l.driver === name && ['Delivered','Invoiced'].includes(l.status))
      const myExps  = expenses.filter(e => e.driver === name)
      const miles   = myLoads.reduce((s, l) => s + (l.miles || 0), 0)
      const gross   = myLoads.reduce((s, l) => s + (l.gross || 0), 0)
      const rpm     = miles > 0 ? Math.round((gross / miles) * 100) / 100 : 0
      const fuel    = myExps.filter(e => e.cat === 'Fuel').reduce((s, e) => s + e.amount, 0)
      // estimate on-time as 90-100% range based on load count
      const onTime  = myLoads.length >= 3 ? 94 : myLoads.length >= 2 ? 91 : myLoads.length >= 1 ? 88 : 0
      const grade   = letterGrade(rpm, onTime)
      // weekly gross for spark chart
      const weekly  = DS_WEEKS.map(wk => {
        const wl = getWeekLoads(loads, name, wk)
        return wl.reduce((s,l) => s + (l.gross||0), 0)
      })
      return { name, loads:myLoads.length, miles, gross, rpm, fuel, onTime, grade, weekly }
    })
  }, [loads, expenses])

  const d = driverStats.find(d => d.name === selDriver) || driverStats[0]
  const maxGross = Math.max(...driverStats.map(d => d.gross), 1)

  // Week-level detail
  const weekLoads = getWeekLoads(loads, selDriver, DS_WEEKS[selWeekIdx])
  const weekGross = weekLoads.reduce((s,l) => s + (l.gross||0), 0)
  const weekMiles = weekLoads.reduce((s,l) => s + (l.miles||0), 0)

  const statBoxStyle = { background:'var(--surface2)', borderRadius:10, padding:'12px 14px', textAlign:'center', flex:1 }
  const labelStyle   = { fontSize:10, color:'var(--muted)', fontWeight:600, marginBottom:4, textTransform:'uppercase', letterSpacing:0.5 }
  const valStyle     = { fontFamily:"'Bebas Neue',sans-serif", fontSize:26, lineHeight:1 }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:2, lineHeight:1 }}>
            DRIVER <span style={{ color:'var(--accent)' }}>SCORECARD</span>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>Performance report · All drivers · Real-time data</div>
        </div>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* LEFT: Driver list */}
        <div style={{ width:260, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
          <div style={{ padding:'10px 16px 6px', fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:2 }}>DRIVERS</div>
          {driverStats.map(dr => {
            const isSel = selDriver === dr.name
            return (
              <div key={dr.name} onClick={() => setSelDriver(dr.name)}
                style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                  background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent',
                  cursor:'pointer', transition:'all 0.15s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)' }}>{dr.name}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{dr.loads} loads · {dr.miles.toLocaleString()} mi</div>
                  </div>
                  <div style={{ textAlign:'center', background: dr.grade.c+'18', border:`2px solid ${dr.grade.c}`, borderRadius:10, padding:'4px 10px', minWidth:42 }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:dr.grade.c, lineHeight:1 }}>{dr.grade.g}</div>
                  </div>
                </div>
                {/* Mini spark bars */}
                <div style={{ display:'flex', gap:3, alignItems:'flex-end', height:20 }}>
                  {dr.weekly.map((w, i) => {
                    const maxW = Math.max(...dr.weekly, 1)
                    const h    = Math.max(3, Math.round((w / maxW) * 18))
                    return (
                      <div key={i} style={{ flex:1, height:h, borderRadius:2,
                        background: i === selWeekIdx && isSel ? 'var(--accent)' : 'var(--surface3)' }}/>
                    )
                  })}
                </div>
                <div style={{ fontSize:9, color:'var(--muted)', marginTop:2 }}>Weekly gross trend</div>
              </div>
            )
          })}

          {/* Fleet comparison bar chart */}
          <div style={{ padding:'14px 16px', marginTop:'auto', borderTop:'1px solid var(--border)' }}>
            <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:2, marginBottom:10 }}>FLEET GROSS COMPARISON</div>
            {driverStats.map(dr => (
              <div key={dr.name} style={{ marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ fontSize:10, color:'var(--muted)' }}>{dr.name.split(' ')[0]}</span>
                  <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)' }}>${dr.gross.toLocaleString()}</span>
                </div>
                <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${(dr.gross/maxGross)*100}%`, background: dr.name===selDriver ? 'var(--accent)' : 'var(--surface3)', borderRadius:3, transition:'width 0.4s' }}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Detail */}
        <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>

          {/* Driver header */}
          <div style={{ display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ width:52, height:52, borderRadius:14, background:`${d.grade.c}18`, border:`2px solid ${d.grade.c}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}>
              {d.name.charAt(0)}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:1, lineHeight:1 }}>{d.name}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{d.loads} loads delivered · ${d.gross.toLocaleString()} gross revenue</div>
            </div>
            <div style={{ textAlign:'center', background:`${d.grade.c}18`, border:`2px solid ${d.grade.c}`, borderRadius:14, padding:'10px 20px' }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:42, color:d.grade.c, lineHeight:1 }}>{d.grade.g}</div>
              <div style={{ fontSize:9, fontWeight:800, color:d.grade.c, letterSpacing:1, marginTop:2 }}>OVERALL GRADE</div>
            </div>
          </div>

          {/* KPI row */}
          <div style={{ display:'flex', gap:10 }}>
            {[
              { l:'Total Miles',    v: d.miles.toLocaleString(),           c:'var(--text)'    },
              { l:'Gross Revenue',  v:`$${d.gross.toLocaleString()}`,      c:'var(--accent)'  },
              { l:'Avg RPM',        v:`$${d.rpm.toFixed(2)}`,              c: d.rpm>=3.0 ? 'var(--success)' : d.rpm>=2.5 ? 'var(--accent)' : 'var(--danger)' },
              { l:'On-Time %',      v:`${d.onTime}%`,                      c: d.onTime>=95 ? 'var(--success)' : d.onTime>=88 ? 'var(--accent)' : 'var(--danger)' },
              { l:'Fuel Spend',     v:`$${d.fuel.toLocaleString()}`,       c:'var(--muted)'   },
            ].map(k => (
              <div key={k.l} style={statBoxStyle}>
                <div style={labelStyle}>{k.l}</div>
                <div style={{ ...valStyle, color:k.c }}>{k.v}</div>
              </div>
            ))}
          </div>

          {/* Weekly breakdown */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:8 }}>
              <Calendar size={13} /> Weekly Performance
              <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400, marginLeft:4 }}>Click a bar to see loads</span>
            </div>
            <div style={{ padding:'16px 18px' }}>

              {/* Bar chart */}
              <div style={{ display:'flex', gap:8, alignItems:'flex-end', height:80, marginBottom:8 }}>
                {DS_WEEKS.map((wk, i) => {
                  const wl     = getWeekLoads(loads, selDriver, wk)
                  const wg     = wl.reduce((s,l) => s + (l.gross||0), 0)
                  const maxWg  = Math.max(...DS_WEEKS.map(w2 => getWeekLoads(loads, selDriver, w2).reduce((s,l)=>s+(l.gross||0),0)), 1)
                  const barH   = Math.max(4, Math.round((wg / maxWg) * 70))
                  const isSel  = selWeekIdx === i
                  return (
                    <div key={wk} onClick={() => setSelWeekIdx(i)}
                      style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, cursor:'pointer' }}>
                      <div style={{ fontSize:9, fontWeight:700, color: wg > 0 ? (isSel ? 'var(--accent)' : 'var(--text)') : 'var(--muted)' }}>
                        {wg > 0 ? `$${wg.toLocaleString()}` : '—'}
                      </div>
                      <div style={{ width:'100%', height:barH, borderRadius:4,
                        background: isSel ? 'var(--accent)' : wg > 0 ? 'var(--surface3)' : 'var(--surface2)',
                        transition:'all 0.2s',
                        border: isSel ? '1px solid rgba(240,165,0,0.5)' : '1px solid transparent' }}/>
                      <div style={{ fontSize:9, color: isSel ? 'var(--accent)' : 'var(--muted)', fontWeight: isSel ? 700 : 400, textAlign:'center' }}>{wk}</div>
                    </div>
                  )
                })}
              </div>

              {/* Selected week loads */}
              <div style={{ borderTop:'1px solid var(--border)', paddingTop:14 }}>
                <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:2, marginBottom:10 }}>
                  WEEK OF {DS_WEEKS[selWeekIdx].toUpperCase()} · {weekLoads.length} LOAD{weekLoads.length !== 1 ? 'S' : ''} · ${weekGross.toLocaleString()} GROSS · {weekMiles.toLocaleString()} MI
                </div>
                {weekLoads.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'20px', color:'var(--muted)', fontSize:12 }}>No loads this week</div>
                ) : weekLoads.map(l => (
                  <div key={l.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700 }}>{l.loadId} · {l.origin?.split(',')[0]} → {l.dest?.split(',')[0]}</div>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>{l.broker} · {l.miles} mi · {l.commodity}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${l.gross.toLocaleString()}</div>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>${l.rate}/mi</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Performance metrics */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

            {/* Rate performance */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={BarChart2} /> Rate Performance</div>
              <div style={{ padding:14, display:'flex', flexDirection:'column', gap:10 }}>
                {[
                  { label:'Avg RPM',       val: d.rpm,  max:4.0, fmt:`$${d.rpm.toFixed(2)}/mi`, thresh:[3.0, 2.5] },
                  { label:'On-Time Pct',   val: d.onTime, max:100, fmt:`${d.onTime}%`, thresh:[95, 88] },
                  { label:'Loads / Month', val: d.loads,  max:15,  fmt:`${d.loads}`, thresh:[8, 4] },
                ].map(m => {
                  const pct = Math.min(100, Math.round((m.val / m.max) * 100))
                  const c   = m.val >= m.thresh[0] ? 'var(--success)' : m.val >= m.thresh[1] ? 'var(--accent)' : 'var(--danger)'
                  return (
                    <div key={m.label}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>{m.label}</span>
                        <span style={{ fontSize:12, fontWeight:700, color:c }}>{m.fmt}</span>
                      </div>
                      <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:c, borderRadius:3, transition:'width 0.5s' }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* AI Insights */}
            <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.25)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', gap:8, alignItems:'center' }}>
                <Ic icon={Bot} /> AI Insights
                <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:'rgba(240,165,0,0.15)', color:'var(--accent)', fontWeight:800, letterSpacing:1 }}>AI</span>
              </div>
              <div style={{ padding:14, display:'flex', flexDirection:'column', gap:8 }}>
                {d.rpm >= 3.0 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Check} /> <strong>{d.name.split(' ')[0]}</strong> is running above fleet avg RPM. Consider offering premium lanes.</div>
                ) : d.rpm >= 2.5 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Zap} /> RPM is solid. Suggest adding 1–2 longer hauls to push gross higher this month.</div>
                ) : (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={AlertTriangle} /> RPM below target. Review lane assignments — short hauls dragging the average down.</div>
                )}
                {d.onTime >= 95 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Trophy} /> On-time rate excellent. Strong candidate for premium broker relationships.</div>
                ) : d.onTime >= 88 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Calendar} /> On-time rate good. Minor delays logged — review appointment scheduling.</div>
                ) : (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Siren} /> On-time rate needs attention. Chronic delays hurt broker scores and re-book rates.</div>
                )}
                {d.fuel > 500 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Fuel} /> Fuel spend ${d.fuel.toLocaleString()} this period. Avg MPG check recommended — potential savings of $80–120/load.</div>
                ) : (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Fuel} /> Fuel spend within normal range for miles driven.</div>
                )}
                <div style={{ marginTop:4, padding:'8px 10px', background:'var(--surface2)', borderRadius:8, fontSize:10, color:'var(--muted)' }}>
                  Grade {d.grade.g} · Score based on RPM (60%), On-Time (40%)
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ─── DAT ALERT BOT ────────────────────────────────────────────────────────────
const DAT_API = import.meta.env.VITE_DAT_API_URL || ''

const DAT_EQUIP_OPTS = ['All', 'Dry Van', 'Reefer', 'Flatbed']

function scoreColor(s) {
  return s >= 80 ? 'var(--success)' : s >= 65 ? 'var(--accent)' : 'var(--danger)'
}

function ageLabel(postedAgo) {
  if (postedAgo < 1)  return 'Just posted'
  if (postedAgo < 60) return `${postedAgo}m ago`
  return `${Math.round(postedAgo/60)}h ago`
}

function urgencyStyle(score, postedAgo) {
  if (score >= 88 && postedAgo < 10) return { label:'BOOK NOW', bg:'rgba(239,68,68,0.12)', border:'rgba(239,68,68,0.35)', text:'var(--danger)' }
  if (score >= 78)                   return { label:'ACT FAST', bg:'rgba(240,165,0,0.10)', border:'rgba(240,165,0,0.30)', text:'var(--accent)' }
  return                                    { label:'GOOD LOAD', bg:'rgba(34,197,94,0.08)', border:'rgba(34,197,94,0.25)', text:'var(--success)' }
}

export function DATAlertBot() {
  const { addLoad, loads: carrierLoads } = useCarrier()
  const { showToast } = useApp()

  const [connected, setConnected]   = useState(false)
  const [datEnabled, setDatEnabled] = useState(false)
  const [alerts, setAlerts]         = useState([])
  const [dismissed, setDismissed]   = useState(new Set())
  const [booked, setBooked]         = useState(new Set())
  const [minScore, setMinScore]     = useState(72)
  const [equip, setEquip]           = useState('All')
  const [selAlert, setSelAlert]     = useState(null)
  const [sound, setSound]           = useState(true)
  const [searchNow, setSearchNow]   = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)

  // SSE connection
  useEffect(() => {
    if (!DAT_API) return
    const es = new EventSource(`${DAT_API}/api/dat/alerts/stream`)

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'connected') {
          setConnected(true)
          setDatEnabled(msg.datEnabled)
        }
        if (msg.type === 'alerts' && Array.isArray(msg.alerts)) {
          setAlerts(prev => {
            // Prepend new, dedupe by id, cap at 40
            const ids = new Set(prev.map(a => a.id))
            const fresh = msg.alerts.filter(a => !ids.has(a.id))
            if (fresh.length > 0 && sound) {
              // Visual flash indicator — no actual audio API needed
              document.title = `${fresh.length} Hot Load${fresh.length > 1 ? 's' : ''}! — Qivori`
              setTimeout(() => { document.title = 'Qivori AI' }, 4000)
            }
            return [...fresh, ...prev].slice(0, 40)
          })
          // Auto-select first new alert
          setSelAlert(a => a || msg.alerts[0]?.id || null)
        }
      } catch {}
    }

    es.onerror = () => setConnected(false)

    return () => es.close()
  }, [sound])

  // Manual search
  const handleSearch = async () => {
    if (!DAT_API) {
      showToast('', 'DAT API', 'DAT API not configured — showing mock data')
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    try {
      const resp = await fetch(`${DAT_API}/api/dat/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment: equip === 'All' ? undefined : equip }),
      })
      const data = await resp.json()
      if (data.loads) {
        const fresh = data.loads.map(l => ({ ...l, id: `manual-${l.refNum}-${Date.now()}`, ts: Date.now(), msg: '' }))
        setAlerts(prev => {
          const ids = new Set(prev.map(a => a.id))
          return [...fresh.filter(f => !ids.has(f.id)), ...prev].slice(0, 40)
        })
        if (fresh.length > 0) setSelAlert(fresh[0].id)
        showToast('', 'DAT Search', `${fresh.length} loads pulled · top scores shown first`)
      }
    } catch (err) {
      showToast('', 'Search Failed', 'Check that the server is running on port 4000')
    }
    setSearchLoading(false)
  }

  const handleBook = (alert) => {
    addLoad({
      origin: alert.origin, dest: alert.dest, miles: alert.miles,
      rate: alert.rate, gross: alert.gross, weight: alert.weight,
      commodity: alert.commodity, pickup: alert.pickup, delivery: alert.delivery,
      broker: alert.broker, refNum: alert.refNum, driver: '',
    })
    setBooked(s => new Set([...s, alert.id]))
    showToast('', 'Load Booked from DAT', `${alert.origin?.split(',')[0]} → ${alert.dest?.split(',')[0]} · $${alert.gross?.toLocaleString()} · added to dispatch queue`)
  }

  const visibleAlerts = alerts.filter(a =>
    !dismissed.has(a.id) &&
    a.score >= minScore &&
    (equip === 'All' || a.equipment === equip)
  )

  const selLoad = visibleAlerts.find(a => a.id === selAlert) || visibleAlerts[0] || null
  const hotCount = visibleAlerts.filter(a => a.score >= 80).length

  const pill = { fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:6, letterSpacing:0.5 }
  const inputStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none' }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* Header */}
      <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:2, lineHeight:1 }}>
              DAT <span style={{ color:'var(--accent)' }}>ALERT</span> BOT
            </div>
            {/* Live indicator */}
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background: connected ? 'var(--success)' : 'var(--danger)',
                boxShadow: connected ? '0 0 6px var(--success)' : 'none',
                animation: connected ? 'pulse 2s infinite' : 'none' }}/>
              <span style={{ fontSize:10, color: connected ? 'var(--success)' : 'var(--muted)', fontWeight:700 }}>
                {connected ? (datEnabled ? 'DAT LIVE' : 'DEMO MODE') : 'CONNECTING…'}
              </span>
            </div>
            {hotCount > 0 && (
              <span style={{ ...pill, background:'rgba(239,68,68,0.15)', color:'var(--danger)', border:'1px solid rgba(239,68,68,0.3)' }}>
                <Flame size={13} /> {hotCount} HOT
              </span>
            )}
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
            {datEnabled ? 'Connected to DAT Keystone API · Scanning every 90 sec' : 'Demo mode — add DAT_CLIENT_ID + DAT_CLIENT_SECRET to .env to go live'}
          </div>
        </div>
        {/* Controls */}
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select value={equip} onChange={e => setEquip(e.target.value)} style={inputStyle}>
            {DAT_EQUIP_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, color:'var(--muted)' }}>Min score</span>
            <input type="range" min={50} max={90} step={5} value={minScore} onChange={e => setMinScore(Number(e.target.value))}
              style={{ width:70, accentColor:'var(--accent)', cursor:'pointer' }}/>
            <span style={{ fontSize:12, fontWeight:700, color:'var(--accent)', minWidth:20 }}>{minScore}</span>
          </div>
          <button onClick={() => setSound(s => !s)}
            style={{ padding:'6px 10px', fontSize:13, background:'var(--surface2)', border:`1px solid ${sound ? 'var(--accent)' : 'var(--border)'}`, borderRadius:8, cursor:'pointer', color: sound ? 'var(--accent)' : 'var(--muted)' }}>
            {sound ? <Bell size={14} /> : <BellOff size={14} />}
          </button>
          <button onClick={handleSearch} disabled={searchLoading}
            style={{ padding:'7px 16px', fontSize:12, fontWeight:700, background:'var(--accent)', border:'none', borderRadius:8, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity: searchLoading ? 0.7 : 1 }}>
            {searchLoading ? 'Scanning…' : '<Search size={13} /> Scan DAT Now'}
          </button>
        </div>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* LEFT: Alert feed */}
        <div style={{ width:380, flexShrink:0, borderRight:'1px solid var(--border)', overflowY:'auto', display:'flex', flexDirection:'column' }}>

          {/* Bot status banner */}
          <div style={{ padding:'10px 16px', background:'rgba(240,165,0,0.05)', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'flex-start' }}>
            <div style={{ fontSize:20, flexShrink:0 }}><Bot size={20} /></div>
            <div style={{ fontSize:11, color:'var(--text)', lineHeight:1.6 }}>
              {visibleAlerts.length === 0
                ? connected
                  ? 'Watching DAT… first batch arrives in ~3 seconds. I\'ll flag every load scoring ' + minScore + '+ and explain why.'
                  : 'Connecting to server… make sure Qivori backend is running on port 4000.'
                : `Tracking ${visibleAlerts.length} load${visibleAlerts.length !== 1 ? 's' : ''} · ${hotCount} score 80+ · auto-refreshing every 90 sec`
              }
            </div>
          </div>

          {visibleAlerts.length === 0 && connected && (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:'var(--muted)', padding:20 }}>
              <div><Radio size={36} /></div>
              <div style={{ fontSize:12, textAlign:'center' }}>Scanning DAT for loads above score {minScore}…<br/>Hit "Scan DAT Now" for an instant pull.</div>
            </div>
          )}

          {visibleAlerts.map(alert => {
            const urg  = urgencyStyle(alert.score, alert.postedAgo)
            const isSel = selAlert === alert.id
            const isB  = booked.has(alert.id)
            const sc   = scoreColor(alert.score)
            return (
              <div key={alert.id} onClick={() => setSelAlert(alert.id)}
                style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : urg.text}`,
                  background: isB ? 'rgba(255,255,255,0.02)' : isSel ? 'rgba(240,165,0,0.05)' : 'transparent',
                  cursor:'pointer', opacity: isB ? 0.5 : 1, transition:'all 0.15s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:5 }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:800, color: isSel ? 'var(--accent)' : 'var(--text)' }}>
                      {alert.origin?.split(',')[0]} → {alert.dest?.split(',')[0]}
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{alert.broker} · {alert.equipment} · {alert.miles} mi</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                    <span style={{ ...pill, background:sc+'18', color:sc, border:`1px solid ${sc}30` }}>{alert.score}</span>
                    {isB && <span style={{ ...pill, background:'rgba(34,197,94,0.15)', color:'var(--success)' }}>BOOKED</span>}
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <span style={{ fontSize:12, fontWeight:800, color:'var(--accent)' }}>${alert.rate?.toFixed(2)}/mi</span>
                    <span style={{ fontSize:12, fontWeight:700 }}>${alert.gross?.toLocaleString()}</span>
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <span style={{ ...pill, background:urg.bg, color:urg.text, border:`1px solid ${urg.border}` }}>{urg.label}</span>
                  </div>
                </div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                  <Clock size={11} /> {ageLabel(alert.postedAgo)} · {alert.deadhead} mi deadhead
                </div>
              </div>
            )
          })}
        </div>

        {/* RIGHT: Detail + bot message */}
        {selLoad ? (
          <div style={{ flex:1, overflowY:'auto', minHeight:0, display:'flex', flexDirection:'column' }}>

            {/* Load header */}
            <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:16, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:1, lineHeight:1, marginBottom:4 }}>
                    {selLoad.origin?.split(',')[0]} → {selLoad.dest?.split(',')[0]}
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)', display:'flex', gap:8, flexWrap:'wrap' }}>
                    <span>{selLoad.miles} mi</span>
                    <span>·</span>
                    <span>{selLoad.equipment}</span>
                    <span>·</span>
                    <span>{selLoad.weight} lbs</span>
                    <span>·</span>
                    <span>{selLoad.commodity}</span>
                  </div>
                </div>
                <div style={{ textAlign:'center', background:scoreColor(selLoad.score)+'15', border:`2px solid ${scoreColor(selLoad.score)}`, borderRadius:14, padding:'8px 18px' }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:34, color:scoreColor(selLoad.score), lineHeight:1 }}>{selLoad.score}</div>
                  <div style={{ fontSize:9, fontWeight:800, color:scoreColor(selLoad.score), letterSpacing:1 }}>AI SCORE</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {[
                  `${selLoad.pickup}`,
                  `${selLoad.delivery}`,
                  `${selLoad.refNum}`,
                  `${selLoad.deadhead} mi deadhead`,
                  `Posted ${ageLabel(selLoad.postedAgo)}`,
                ].map(tag => (
                  <span key={tag} style={{ fontSize:11, padding:'4px 10px', background:'var(--surface2)', borderRadius:6 }}>{tag}</span>
                ))}
              </div>
            </div>

            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>

              {/* AI Bot Message */}
              {selLoad.msg && (
                <div style={{ background:'rgba(240,165,0,0.05)', border:'1px solid rgba(240,165,0,0.25)', borderRadius:12, padding:16 }}>
                  <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                    <div style={{ width:32, height:32, borderRadius:10, background:'rgba(240,165,0,0.15)', border:'1px solid rgba(240,165,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}><Bot size={20} /></div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:1, marginBottom:6 }}>QIVORI AI · LOAD ANALYSIS</div>
                      {selLoad.msg.split('\n').map((line, i) => (
                        <div key={i} style={{ fontSize:12, lineHeight:1.7, color: i === 0 ? 'var(--text)' : 'var(--muted)', fontWeight: i === 0 ? 700 : 400 }}>{line}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick economics */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:10 }}>
                {[
                  { l:'Gross',    v:`$${selLoad.gross?.toLocaleString()}`,     c:'var(--accent)'  },
                  { l:'Rate/mi',  v:`$${selLoad.rate?.toFixed(2)}`,            c:'var(--text)'    },
                  { l:'Est. Fuel',v:`−$${Math.round(selLoad.miles/6.9*3.85).toLocaleString()}`, c:'var(--danger)' },
                  { l:'Est. Net', v:`$${Math.round(selLoad.gross - selLoad.miles/6.9*3.85 - selLoad.gross*0.28).toLocaleString()}`, c:'var(--success)' },
                ].map(k => (
                  <div key={k.l} style={{ background:'var(--surface2)', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, marginBottom:3 }}>{k.l}</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:k.c }}>{k.v}</div>
                  </div>
                ))}
              </div>

              {/* Urgency + book */}
              {!booked.has(selLoad.id) ? (() => {
                const urg = urgencyStyle(selLoad.score, selLoad.postedAgo)
                return (
                  <div style={{ background:urg.bg, border:`1px solid ${urg.border}`, borderRadius:12, padding:18 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:800, color:urg.text }}>{urg.label}</div>
                        <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                          {selLoad.score >= 88
                            ? 'Top-tier load — high-score loads on this lane disappear in minutes'
                            : selLoad.score >= 78
                            ? 'Strong load — good rate and trusted broker. Move quickly.'
                            : 'Solid option — consider countering for an extra $0.05–0.10/mi before booking'}
                        </div>
                      </div>
                      <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:40, color:urg.text, lineHeight:1 }}>{selLoad.score}</span>
                    </div>
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={() => handleBook(selLoad)} className="btn btn-primary"
                        style={{ flex:1, justifyContent:'center', padding:'12px', fontSize:14 }}>
                        <Zap size={13} /> Book This Load →
                      </button>
                      <button onClick={() => setDismissed(s => new Set([...s, selLoad.id]))}
                        style={{ padding:'12px 16px', fontSize:13, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        Pass
                      </button>
                    </div>
                  </div>
                )
              })() : (
                <div style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:12, padding:20, textAlign:'center' }}>
                  <div style={{ marginBottom:6 }}><Check size={28} /></div>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--success)' }}>Load Booked</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>Added to dispatch queue · Assign a driver to complete booking</div>
                </div>
              )}

              {/* All alerts summary */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={BarChart2} /> This Session</div>
                <div style={{ padding:'10px 18px', display:'flex', gap:24 }}>
                  {[
                    { l:'Loads Scanned',  v: alerts.length },
                    { l:'Above Score',    v: visibleAlerts.length },
                    { l:'Hot (80+)',   v: hotCount },
                    { l:'Booked',         v: booked.size },
                    { l:'Dismissed',      v: dismissed.size },
                  ].map(s => (
                    <div key={s.l} style={{ textAlign:'center' }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color:'var(--accent)' }}>{s.v}</div>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10, color:'var(--muted)' }}>
            <div><Bot size={48} /></div>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>DAT Alert Bot</div>
            <div style={{ fontSize:12, textAlign:'center', maxWidth:320 }}>
              I scan DAT every 90 seconds and flag every load scoring {minScore}+.<br/>
              Hit "Scan DAT Now" for an instant pull or wait for the first auto-alert.
            </div>
            <button onClick={handleSearch} disabled={searchLoading}
              style={{ marginTop:10, padding:'10px 24px', fontSize:13, fontWeight:700, background:'var(--accent)', border:'none', borderRadius:8, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {searchLoading ? 'Scanning…' : '<Search size={13} /> Scan DAT Now'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Accounting Hub helpers ─────────────────────────────────────────────────
const ACCT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
function acctParseDate(str) {
  if (!str) return null
  const parts = str.split(' ')
  const mon = ACCT_MONTHS.indexOf(parts[0])
  const day = parseInt(parts[1])
  if (mon < 0 || isNaN(day)) return null
  return new Date(2026, mon, day)
}
function acctDaysAgo(str) {
  const d = acctParseDate(str)
  if (!d) return 0
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}
function acctDaysUntil(str) {
  const d = acctParseDate(str)
  if (!d) return 0
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

// ─── 1. P&L Dashboard ────────────────────────────────────────────────────────
export function PLDashboard() {
  const { loads, expenses } = useCarrier()
  const [period, setPeriod] = useState('mtd')
  const [breakdown, setBreakdown] = useState('driver')

  const periodLoads = useMemo(() => {
    if (period === 'mtd') return loads.filter(l => {
      const d = acctParseDate(l.pickup?.split(' · ')[0])
      return d && d.getMonth() === 2
    })
    return loads
  }, [loads, period])

  const periodExpenses = useMemo(() => {
    if (period === 'mtd') return expenses.filter(e => {
      const d = acctParseDate(e.date)
      return d && d.getMonth() === 2
    })
    return expenses
  }, [expenses, period])

  const revenue = useMemo(() => periodLoads.reduce((s, l) => s + (l.gross || 0), 0), [periodLoads])
  const totalExp = useMemo(() => periodExpenses.reduce((s, e) => s + (e.amount || 0), 0), [periodExpenses])
  const net = revenue - totalExp
  const margin = revenue > 0 ? ((net / revenue) * 100).toFixed(1) : '0.0'

  const breakdownData = useMemo(() => {
    const key = breakdown === 'lane'
      ? (l) => `${(l.origin||'').split(',')[0]} → ${(l.dest||'').split(',')[0]}`
      : breakdown === 'broker' ? (l) => l.broker : (l) => l.driver
    const map = {}
    periodLoads.forEach(l => {
      const k = key(l)
      if (!k) return
      if (!map[k]) map[k] = { label:k, rev:0, loads:0 }
      map[k].rev += l.gross || 0
      map[k].loads++
    })
    return Object.values(map).sort((a,b) => b.rev - a.rev)
  }, [periodLoads, breakdown])

  const expCats = useMemo(() => {
    const map = {}
    periodExpenses.forEach(e => {
      if (!map[e.cat]) map[e.cat] = 0
      map[e.cat] += e.amount
    })
    return Object.entries(map).sort((a,b) => b[1] - a[1])
  }, [periodExpenses])

  const maxRev = breakdownData.length ? Math.max(...breakdownData.map(d => d.rev)) : 1
  const PERIOD_OPTS = [{ id:'mtd', label:'Mar MTD' }, { id:'q1', label:'Q1 2026' }, { id:'ytd', label:'YTD 2026' }]

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>P&L DASHBOARD</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Profit & Loss — real-time from your loads and expenses</div>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {PERIOD_OPTS.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              style={{ padding:'6px 14px', fontSize:12, fontWeight:700, borderRadius:8, border:'1px solid var(--border)',
                background: period===p.id ? 'var(--accent)' : 'var(--surface2)',
                color: period===p.id ? '#000' : 'var(--text)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div style={S.grid(4)}>
        {[
          { label:'GROSS REVENUE', val:`$${revenue.toLocaleString()}`, color:'var(--accent)', icon: DollarSign },
          { label:'TOTAL EXPENSES', val:`$${totalExp.toLocaleString()}`, color:'var(--danger)', icon: TrendingDown },
          { label:'NET INCOME', val:`$${net.toLocaleString()}`, color: net>=0 ? 'var(--success)' : 'var(--danger)', icon: BarChart2 },
          { label:'NET MARGIN', val:`${margin}%`, color: parseFloat(margin)>=20 ? 'var(--success)' : 'var(--warning)', icon: TrendingUp },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'18px 20px' }}>
            <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>{typeof k.icon === "string" ? k.icon : <k.icon size={11} />} {k.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:34, color:k.color, lineHeight:1 }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16 }}>
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}>Revenue Breakdown</div>
            <div style={{ display:'flex', gap:6 }}>
              {['driver','broker','lane'].map(b => (
                <button key={b} onClick={() => setBreakdown(b)}
                  style={{ padding:'4px 12px', fontSize:11, fontWeight:700, borderRadius:6, border:'1px solid var(--border)',
                    background: breakdown===b ? 'rgba(240,165,0,0.15)' : 'var(--surface2)',
                    color: breakdown===b ? 'var(--accent)' : 'var(--muted)', cursor:'pointer', textTransform:'capitalize', fontFamily:"'DM Sans',sans-serif" }}>
                  {b}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:12 }}>
            {breakdownData.length === 0 && <div style={{ textAlign:'center', padding:40, color:'var(--muted)', fontSize:13 }}>No data for this period</div>}
            {breakdownData.map((row, i) => (
              <div key={i}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                  <div style={{ fontSize:13, fontWeight:600 }}>{row.label}</div>
                  <div style={{ display:'flex', gap:14, alignItems:'center' }}>
                    <span style={{ fontSize:11, color:'var(--muted)' }}>{row.loads} load{row.loads!==1?'s':''}</span>
                    <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${row.rev.toLocaleString()}</span>
                  </div>
                </div>
                <div style={{ height:6, borderRadius:3, background:'var(--surface2)' }}>
                  <div style={{ height:6, borderRadius:3, background:'var(--accent)', width:`${(row.rev/maxRev)*100}%`, transition:'width 0.4s' }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={S.panel}>
          <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={TrendingDown} /> Expenses by Category</div></div>
          <div style={{ padding:'14px 18px', display:'flex', flexDirection:'column', gap:10 }}>
            {expCats.map(([cat, amt]) => {
              const pct = totalExp > 0 ? ((amt/totalExp)*100).toFixed(0) : 0
              return (
                <div key={cat} style={{ flex:1 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                    <span style={{ fontSize:12, fontWeight:600 }}>{cat}</span>
                    <span style={{ fontSize:12, color:'var(--danger)' }}>-${amt.toLocaleString()}</span>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ flex:1, height:5, borderRadius:3, background:'var(--surface2)' }}>
                      <div style={{ height:5, borderRadius:3, background:'var(--danger)', width:`${pct}%`, opacity:0.7 }} />
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', width:28, textAlign:'right' }}>{pct}%</div>
                  </div>
                </div>
              )
            })}
            <div style={{ marginTop:8, paddingTop:10, borderTop:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
              <span style={{ fontSize:12, color:'var(--muted)' }}>Total Expenses</span>
              <span style={{ fontSize:14, fontWeight:700, color:'var(--danger)' }}>-${totalExp.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div style={{ background:'linear-gradient(135deg,rgba(240,165,0,0.06),rgba(77,142,240,0.04))', border:'1px solid rgba(240,165,0,0.15)', borderRadius:12, padding:'14px 18px', display:'flex', gap:14, alignItems:'flex-start' }}>
        <div style={{ fontSize:22 }}><Bot size={20} /></div>
        <div>
          <div style={{ fontWeight:700, marginBottom:4 }}>AI Insight</div>
          <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.7 }}>
            {parseFloat(margin) >= 20
              ? `Strong ${margin}% margin this period. Echo Global is your most profitable broker — consider prioritizing their lanes. Fuel is your largest expense category at ${totalExp>0?((expCats.find(c=>c[0]==='Fuel')?.[1]||0)/totalExp*100).toFixed(0):0}% — fuel-optimizer routes could save ~$180/week.`
              : `Margin is ${margin}% — below the 20% healthy threshold. Review lumper fees and non-revenue expenses. Best performing: ${breakdownData[0]?.label||'N/A'} at $${(breakdownData[0]?.rev||0).toLocaleString()} this period.`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 2. Receivables Aging ────────────────────────────────────────────────────
export function ReceivablesAging() {
  const { invoices } = useCarrier()
  const [reminded, setReminded] = useState({})

  const aging = useMemo(() => invoices.map(inv => {
    const days = acctDaysAgo(inv.date)
    const daysUntilDue = acctDaysUntil(inv.dueDate)
    let bucket = '0–30'
    if (days > 60) bucket = '60+'
    else if (days > 30) bucket = '31–60'
    const risk = days > 60 ? 'high' : days > 30 ? 'medium' : 'low'
    return { ...inv, days, daysUntilDue, bucket, risk }
  }), [invoices])

  const buckets = useMemo(() => {
    const b = { '0–30':[], '31–60':[], '60+':[] }
    aging.forEach(inv => { if (b[inv.bucket]) b[inv.bucket].push(inv) })
    return b
  }, [aging])

  const totalUnpaid = aging.filter(i => i.status==='Unpaid').reduce((s,i) => s+i.amount, 0)
  const pastDue = aging.filter(i => i.status==='Unpaid' && i.daysUntilDue < 0).reduce((s,i) => s+i.amount, 0)
  const avgDays = (() => {
    const u = aging.filter(i => i.status==='Unpaid')
    return u.length ? Math.round(u.reduce((s,i) => s+i.days, 0) / u.length) : 0
  })()

  const riskColor = { low:'var(--success)', medium:'var(--warning)', high:'var(--danger)' }
  const riskBg = { low:'rgba(34,197,94,0.1)', medium:'rgba(245,158,11,0.1)', high:'rgba(239,68,68,0.1)' }
  const bucketColor = { '0–30':'var(--success)', '31–60':'var(--warning)', '60+':'var(--danger)' }
  const bucketBg = { '0–30':'rgba(34,197,94,0.1)', '31–60':'rgba(245,158,11,0.1)', '60+':'rgba(239,68,68,0.1)' }

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>RECEIVABLES AGING</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Track outstanding invoices and collection risk</div>
      </div>

      <div style={S.grid(3)}>
        {[
          { label:'TOTAL OUTSTANDING', val:`$${totalUnpaid.toLocaleString()}`, color:'var(--accent)', sub:`${aging.filter(i=>i.status==='Unpaid').length} open invoices` },
          { label:'PAST DUE', val:`$${pastDue.toLocaleString()}`, color:'var(--danger)', sub:'Requires immediate action' },
          { label:'AVG DAYS OUT', val:`${avgDays}d`, color: avgDays > 30 ? 'var(--warning)' : 'var(--success)', sub:'Industry avg: 35 days' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'18px 20px' }}>
            <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>{k.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:k.color, lineHeight:1 }}>{k.val}</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {Object.entries(buckets).map(([bucket, invs]) => (
        <div key={bucket} style={S.panel}>
          <div style={S.panelHead}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={S.panelTitle}>{bucket === '0–30' ? <CheckCircle size={13} /> : bucket === '31–60' ? <AlertCircle size={13} /> : <AlertCircle size={13} color='var(--danger)' />} {bucket} Days</div>
              <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10, background:bucketBg[bucket], color:bucketColor[bucket] }}>
                {invs.length} invoice{invs.length!==1?'s':''} · ${invs.reduce((s,i)=>s+i.amount,0).toLocaleString()}
              </span>
            </div>
          </div>
          {invs.length === 0
            ? <div style={{ padding:'16px 18px', color:'var(--muted)', fontSize:12 }}>No invoices in this bucket.</div>
            : (
              <table>
                <thead><tr>{['Invoice','Broker','Route','Amount','Status','Age','Due','Action'].map(h => <th key={h}>{h}</th>)}</tr></thead>
                <tbody>
                  {invs.map(inv => (
                    <tr key={inv.id}>
                      <td><span style={{ fontFamily:'monospace', fontSize:12 }}>{inv.id}</span></td>
                      <td style={{ fontSize:12 }}>{inv.broker}</td>
                      <td style={{ fontSize:12 }}>{inv.route}</td>
                      <td><span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${inv.amount.toLocaleString()}</span></td>
                      <td><span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10, background:riskBg[inv.risk], color:riskColor[inv.risk] }}>{inv.status}</span></td>
                      <td style={{ fontSize:12, color: inv.days > 45 ? 'var(--danger)' : 'var(--muted)' }}>{inv.days}d</td>
                      <td style={{ fontSize:12, color: inv.daysUntilDue < 0 ? 'var(--danger)' : inv.daysUntilDue < 7 ? 'var(--warning)' : 'var(--muted)' }}>
                        {inv.daysUntilDue < 0 ? `${Math.abs(inv.daysUntilDue)}d overdue` : `${inv.daysUntilDue}d`}
                      </td>
                      <td>
                        {inv.status === 'Unpaid' && (
                          <button onClick={() => setReminded(prev => ({ ...prev, [inv.id]: true }))}
                            style={{ padding:'4px 10px', fontSize:11, fontWeight:700, borderRadius:6, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                              background: reminded[inv.id] ? 'rgba(34,197,94,0.15)' : 'rgba(240,165,0,0.15)',
                              color: reminded[inv.id] ? 'var(--success)' : 'var(--accent)' }}>
                            {reminded[inv.id] ? <><Check size={11} /> Sent</> : <><Send size={13} /> Remind</>}
                          </button>
                        )}
                        {inv.status === 'Paid' && <span style={{ fontSize:11, color:'var(--success)' }}><Check size={11} /> Collected</span>}
                        {inv.status === 'Factored' && <span style={{ fontSize:11, color:'var(--accent3)' }}><Ic icon={Zap} /> Factored</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      ))}

      <div style={{ background:'linear-gradient(135deg,rgba(240,165,0,0.06),rgba(77,142,240,0.04))', border:'1px solid rgba(240,165,0,0.15)', borderRadius:12, padding:'14px 18px', display:'flex', gap:14, alignItems:'flex-start' }}>
        <div style={{ fontSize:22 }}><Bot size={20} /></div>
        <div>
          <div style={{ fontWeight:700, marginBottom:4 }}>Collection Intelligence</div>
          <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.7 }}>
            {pastDue > 0
              ? `$${pastDue.toLocaleString()} is past due — send reminders now to avoid write-offs. Echo Global typically pays within 30 days. Consider factoring INV-043 for same-day cash at 2-3% fee.`
              : `All invoices are within terms. Average collection time is ${avgDays} days — below industry average of 35 days. You're in great shape.`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 3. Driver Pay Report ─────────────────────────────────────────────────────
export function DriverPayReport() {
  const { loads } = useCarrier()
  const [payRate, setPayRate] = useState(28)
  const [approved, setApproved] = useState({})

  const drivers = useMemo(() => {
    const map = {}
    loads.forEach(l => {
      if (!l.driver) return
      if (!map[l.driver]) map[l.driver] = { name:l.driver, loads:[], totalGross:0, totalMiles:0 }
      map[l.driver].loads.push(l)
      map[l.driver].totalGross += l.gross || 0
      map[l.driver].totalMiles += l.miles || 0
    })
    return Object.values(map).map(d => ({
      ...d,
      totalPay: d.totalGross * (payRate / 100),
      payPerMile: d.totalMiles > 0 ? (d.totalGross * (payRate/100) / d.totalMiles).toFixed(2) : '0.00',
    })).sort((a,b) => b.totalGross - a.totalGross)
  }, [loads, payRate])

  const totalPayroll = drivers.reduce((s,d) => s+d.totalPay, 0)

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>DRIVER PAY REPORT</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Per-driver settlement calculations — approve and export</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 16px' }}>
          <span style={{ fontSize:12, color:'var(--muted)' }}>Pay Rate</span>
          <input type="range" min={20} max={45} value={payRate} onChange={e => setPayRate(Number(e.target.value))}
            style={{ width:100, accentColor:'var(--accent)' }} />
          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--accent)', minWidth:40 }}>{payRate}%</span>
        </div>
      </div>

      <div style={S.grid(3)}>
        {[
          { label:'TOTAL PAYROLL', val:`$${totalPayroll.toLocaleString(undefined,{maximumFractionDigits:0})}`, color:'var(--accent)' },
          { label:'DRIVERS', val:String(drivers.length), color:'var(--accent3)' },
          { label:'PAY RATE', val:`${payRate}% of gross`, color:'var(--success)' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px' }}>
            <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>{k.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:30, color:k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {drivers.map(d => (
        <div key={d.name} style={S.panel}>
          <div style={S.panelHead}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--surface3)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:14 }}>
                {d.name.split(' ').map(n=>n[0]).join('')}
              </div>
              <div>
                <div style={{ fontWeight:700 }}>{d.name}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{d.loads.length} loads · {d.totalMiles.toLocaleString()} mi</div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color:'var(--accent)' }}>${d.totalPay.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>settlement amount</div>
              </div>
              <button onClick={() => setApproved(prev => ({ ...prev, [d.name]: !prev[d.name] }))}
                style={{ padding:'8px 16px', fontSize:12, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                  background: approved[d.name] ? 'rgba(34,197,94,0.15)' : 'var(--accent)',
                  color: approved[d.name] ? 'var(--success)' : '#000' }}>
                {approved[d.name] ? <><Check size={11} /> Approved</> : 'Approve Pay'}
              </button>
            </div>
          </div>
          <table>
            <thead><tr>{['Load ID','Route','Gross','Miles','RPM','Driver Pay'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {d.loads.map(l => (
                <tr key={l.id}>
                  <td><span style={{ fontFamily:'monospace', fontSize:12 }}>{l.loadId}</span></td>
                  <td style={{ fontSize:12 }}>{(l.origin||'').split(',')[0]} → {(l.dest||'').split(',')[0]}</td>
                  <td><span style={{ color:'var(--accent)', fontWeight:700 }}>${(l.gross||0).toLocaleString()}</span></td>
                  <td style={{ fontSize:12 }}>{(l.miles||0).toLocaleString()}</td>
                  <td style={{ fontSize:12, color:'var(--accent3)' }}>${(l.rate||0).toFixed(2)}/mi</td>
                  <td><span style={{ color:'var(--success)', fontWeight:700 }}>${((l.gross||0)*payRate/100).toLocaleString(undefined,{maximumFractionDigits:0})}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

// ─── 4. Cash Runway ────────────────────────────────────────────────────────────
export function CashRunway() {
  const { invoices, expenses } = useCarrier()
  const [cashBalance, setCashBalance] = useState(18400)

  const weeklyExpenses = useMemo(() => {
    const total = expenses.reduce((s,e) => s+(e.amount||0), 0)
    return Math.round(total / 4)
  }, [expenses])

  const incomingRevenue = useMemo(() =>
    invoices.filter(i => i.status==='Unpaid').reduce((s,i) => s+(i.amount||0), 0)
  , [invoices])

  const weeks = useMemo(() => {
    let bal = cashBalance
    const weeklyIncoming = [incomingRevenue * 0.4, incomingRevenue * 0.3, incomingRevenue * 0.2, incomingRevenue * 0.1, 1200, 3800]
    return Array.from({ length:6 }, (_, i) => {
      const incoming = weeklyIncoming[i] || 0
      const outgoing = weeklyExpenses + (i === 2 ? 1200 : 0)
      bal = bal + incoming - outgoing
      return { week:`Wk ${i+1}`, bal: Math.round(bal), incoming: Math.round(incoming), outgoing: Math.round(outgoing) }
    })
  }, [cashBalance, weeklyExpenses, incomingRevenue])

  const runway = weeks.filter(w => w.bal > 0).length
  const maxBal = Math.max(cashBalance, ...weeks.map(w => w.bal))

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>CASH RUNWAY</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>6-week cash flow projection and liquidity gauge</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 16px' }}>
          <span style={{ fontSize:12, color:'var(--muted)' }}>Current Cash $</span>
          <input type="number" value={cashBalance} onChange={e => setCashBalance(Number(e.target.value))}
            style={{ width:100, background:'transparent', border:'none', outline:'none', color:'var(--accent)', fontFamily:"'Bebas Neue',sans-serif", fontSize:22, textAlign:'right' }} />
        </div>
      </div>

      <div style={S.grid(4)}>
        {[
          { label:'CURRENT CASH', val:`$${cashBalance.toLocaleString()}`, color:'var(--accent)', icon: DollarSign },
          { label:'INCOMING A/R', val:`$${incomingRevenue.toLocaleString()}`, color:'var(--success)', icon: Download },
          { label:'WEEKLY BURN', val:`$${weeklyExpenses.toLocaleString()}`, color:'var(--danger)', icon: Flame },
          { label:'RUNWAY', val:`${runway} weeks`, color: runway >= 4 ? 'var(--success)' : runway >= 2 ? 'var(--warning)' : 'var(--danger)', icon: Clock },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px' }}>
            <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>{typeof k.icon === "string" ? k.icon : <k.icon size={11} />} {k.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:30, color:k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={BarChart2} /> 6-Week Cash Flow Projection</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>Includes incoming A/R and projected expenses</div>
        </div>
        <div style={{ padding:20 }}>
          <div style={{ display:'flex', gap:10, alignItems:'flex-end', height:180 }}>
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, flex:1 }}>
              <div style={{ fontSize:11, color:'var(--accent)', fontWeight:700 }}>${cashBalance.toLocaleString()}</div>
              <div style={{ width:'100%', borderRadius:'4px 4px 0 0', background:'var(--accent)', height:`${Math.max(4, (cashBalance/maxBal)*160)}px` }} />
              <div style={{ fontSize:10, color:'var(--muted)' }}>Now</div>
            </div>
            {weeks.map((w, i) => {
              const h = maxBal > 0 ? Math.max(4, (Math.abs(w.bal)/maxBal)*160) : 4
              const isNeg = w.bal < 0
              const barColor = isNeg ? 'var(--danger)' : w.bal < cashBalance*0.3 ? 'var(--warning)' : 'var(--success)'
              return (
                <div key={i} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6, flex:1 }}>
                  <div style={{ fontSize:11, color:barColor, fontWeight:700 }}>{isNeg?'-':''}${Math.abs(w.bal).toLocaleString()}</div>
                  <div style={{ width:'100%', borderRadius:'4px 4px 0 0', background:barColor, height:`${h}px`, opacity:isNeg?0.7:1 }} />
                  <div style={{ fontSize:10, color:'var(--muted)' }}>{w.week}</div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <div style={S.panel}>
        <div style={S.panelHead}><div style={S.panelTitle}>Weekly Cash Flow Detail</div></div>
        <table>
          <thead><tr>{['Week','Incoming A/R','Operating Costs','Net Change','Projected Balance'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {weeks.map((w,i) => {
              const net = w.incoming - w.outgoing
              return (
                <tr key={i}>
                  <td style={{ fontWeight:700 }}>{w.week}</td>
                  <td style={{ color:'var(--success)' }}>+${w.incoming.toLocaleString()}</td>
                  <td style={{ color:'var(--danger)' }}>-${w.outgoing.toLocaleString()}</td>
                  <td style={{ color: net >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight:700 }}>{net >= 0?'+':''}{net.toLocaleString()}</td>
                  <td><span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color: w.bal<0?'var(--danger)':w.bal<cashBalance*0.3?'var(--warning)':'var(--accent)' }}>${w.bal.toLocaleString()}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ background:'linear-gradient(135deg,rgba(240,165,0,0.06),rgba(77,142,240,0.04))', border:'1px solid rgba(240,165,0,0.15)', borderRadius:12, padding:'14px 18px', display:'flex', gap:14, alignItems:'flex-start' }}>
        <div style={{ fontSize:22 }}><Bot size={20} /></div>
        <div>
          <div style={{ fontWeight:700, marginBottom:4 }}>Cash Flow Intelligence</div>
          <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.7 }}>
            {runway >= 4
              ? `${runway}-week runway is healthy. You have $${incomingRevenue.toLocaleString()} in outstanding A/R — collect by end of month to maintain positive trajectory. Consider factoring INV-043 for same-day liquidity at 2.5% fee.`
              : `Cash runway is only ${runway} weeks. Collect outstanding A/R immediately — send reminders from Receivables Aging. Consider factoring to close the gap.`}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 5. QuickBooks Export ─────────────────────────────────────────────────────
export function QuickBooksExport() {
  const { loads, invoices, expenses } = useCarrier()
  const [connected, setConnected] = useState(false)
  const [exported, setExported] = useState({})

  const QB_MAPPING = [
    { qivori:'Gross Revenue',  qb:'Income:Freight Revenue',           type:'Income'  },
    { qivori:'Fuel',           qb:'Expenses:Fuel & Mileage',          type:'Expense' },
    { qivori:'Maintenance',    qb:'Expenses:Repairs & Maintenance',   type:'Expense' },
    { qivori:'Tolls',          qb:'Expenses:Travel:Tolls',            type:'Expense' },
    { qivori:'Lumper',         qb:'Expenses:Lumper Fees',             type:'Expense' },
    { qivori:'Permits',        qb:'Expenses:Permits & Licenses',      type:'Expense' },
    { qivori:'Driver Pay',     qb:'Expenses:Contract Labor',          type:'Expense' },
    { qivori:'Factoring Fees', qb:'Expenses:Factoring Fees',          type:'Expense' },
  ]

  const csvRows = useMemo(() => {
    const rows = []
    invoices.forEach(inv => {
      rows.push({ date:inv.date, type:'Invoice', account:'Income:Freight Revenue',
        description:`${inv.id} - ${inv.broker} - ${inv.route}`, amount:inv.amount, cls:inv.driver||'', status:inv.status })
    })
    expenses.forEach(exp => {
      const acct = QB_MAPPING.find(m => exp.cat.includes(m.qivori))?.qb || 'Expenses:Miscellaneous'
      rows.push({ date:exp.date, type:'Expense', account:acct,
        description:`${exp.cat} - ${exp.merchant}`, amount:-exp.amount, cls:exp.driver||'', status:'Posted' })
    })
    return rows.sort((a,b) => (acctParseDate(b.date)||0) - (acctParseDate(a.date)||0))
  }, [invoices, expenses])

  const downloadCSV = (subset, name) => {
    const headers = ['Date','Type','Account','Description','Amount','Class/Driver','Status']
    const lines = [headers.join(','), ...subset.map(r =>
      [r.date, r.type, `"${r.account}"`, `"${r.description}"`, r.amount, `"${r.cls}"`, r.status].join(',')
    )]
    const blob = new Blob([lines.join('\n')], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href=url; a.download=`qivori-${name}.csv`; a.click()
    URL.revokeObjectURL(url)
    setExported(prev => ({ ...prev, [name]: true }))
  }

  const totalRevenue = invoices.reduce((s,i) => s+i.amount, 0)
  const totalExpAmt = expenses.reduce((s,e) => s+e.amount, 0)

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>QUICKBOOKS EXPORT</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Export freight accounting data with proper QB account mapping</div>
      </div>

      {/* QB Connection Banner */}
      <div style={{ background: connected ? 'rgba(34,197,94,0.08)' : 'rgba(77,142,240,0.08)',
        border: `1px solid ${connected ? 'rgba(34,197,94,0.3)' : 'rgba(77,142,240,0.3)'}`, borderRadius:12, padding:'16px 20px',
        display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ fontSize:32 }}><CheckCircle size={32} /></div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, marginBottom:4 }}>{connected ? 'QuickBooks Online Connected' : 'QuickBooks Online Integration'}</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>
            {connected
              ? 'Auto-sync enabled — transactions push to QuickBooks automatically every night at 2 AM.'
              : 'Connect QuickBooks Online to sync invoices and expenses automatically, or use CSV export below.'}
          </div>
        </div>
        <button onClick={() => setConnected(c => !c)}
          style={{ padding:'10px 20px', fontSize:13, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
            background: connected ? 'rgba(239,68,68,0.15)' : 'var(--accent3)', color: connected ? 'var(--danger)' : '#fff' }}>
          {connected ? 'Disconnect' : '<Paperclip size={13} /> Connect QuickBooks'}
        </button>
      </div>

      {/* Export Cards */}
      <div style={S.grid(3)}>
        {[
          { name:'invoices', icon: FileText, title:'Invoices & Revenue', desc:`${invoices.length} transactions · $${totalRevenue.toLocaleString()} total`, rows:csvRows.filter(r=>r.type==='Invoice') },
          { name:'expenses', icon: TrendingDown, title:'Expenses & Costs',   desc:`${expenses.length} transactions · $${totalExpAmt.toLocaleString()} total`,  rows:csvRows.filter(r=>r.type==='Expense') },
          { name:'all',      icon: Package, title:'Full P&L Export',    desc:`${csvRows.length} total transactions`,                                        rows:csvRows },
        ].map(card => (
          <div key={card.name} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:28, marginBottom:10 }}>{typeof card.icon === "string" ? card.icon : <card.icon size={28} />}</div>
            <div style={{ fontWeight:700, marginBottom:4 }}>{card.title}</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>{card.desc}</div>
            <button onClick={() => downloadCSV(card.rows, card.name)}
              style={{ width:'100%', padding:'10px 0', fontSize:13, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                background: exported[card.name] ? 'rgba(34,197,94,0.15)' : 'var(--accent)',
                color: exported[card.name] ? 'var(--success)' : '#000' }}>
              {exported[card.name] ? <><Check size={11} /> Downloaded</> : <><Download size={13} /> Download CSV</>}
            </button>
          </div>
        ))}
      </div>

      {/* Account Mapping */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Layers} /> Account Mapping</div>
          <span style={{ fontSize:11, color:'var(--muted)' }}>Qivori category → QuickBooks account</span>
        </div>
        <table>
          <thead><tr>{['Qivori Category','QuickBooks Account','Type'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {QB_MAPPING.map(m => (
              <tr key={m.qivori}>
                <td style={{ fontWeight:600 }}>{m.qivori}</td>
                <td style={{ fontFamily:'monospace', fontSize:12, color:'var(--accent3)' }}>{m.qb}</td>
                <td>
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10,
                    background: m.type==='Income' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: m.type==='Income' ? 'var(--success)' : 'var(--danger)' }}>{m.type}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Preview */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Eye} /> Export Preview</div>
          <span style={{ fontSize:11, color:'var(--muted)' }}>Last {Math.min(csvRows.length,8)} rows</span>
        </div>
        <table>
          <thead><tr>{['Date','Type','Account','Description','Amount','Status'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {csvRows.slice(0,8).map((r,i) => (
              <tr key={i}>
                <td style={{ fontSize:12 }}>{r.date}</td>
                <td><span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10,
                  background: r.type==='Invoice'?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',
                  color: r.type==='Invoice'?'var(--success)':'var(--danger)' }}>{r.type}</span></td>
                <td style={{ fontSize:11, color:'var(--accent3)', fontFamily:'monospace' }}>{r.account}</td>
                <td style={{ fontSize:12 }}>{r.description}</td>
                <td style={{ fontWeight:700, color: r.amount>=0?'var(--success)':'var(--danger)' }}>
                  {r.amount>=0?'+':''}${Math.abs(r.amount).toLocaleString()}
                </td>
                <td><span style={{ fontSize:11, color: r.status==='Paid'?'var(--success)':r.status==='Unpaid'?'var(--warning)':'var(--muted)' }}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Carrier Package ──────────────────────────────────────────────────────────
export function CarrierPackage() {
  const { showToast } = useApp()
  const { company } = useCarrier()
  const [tab, setTab] = useState('overview')

  const [insurance, setInsurance] = useState({
    auto:    { company:'Progressive Commercial', policy:'PCT-8821047', amount:'$1,000,000', expiry:'Nov 15, 2026' },
    cargo:   { company:'Great West Casualty',    policy:'GWC-334821',  amount:'$100,000',   expiry:'Nov 15, 2026' },
    general: { company:'Progressive Commercial', policy:'PCG-7720831', amount:'$1,000,000', expiry:'Nov 15, 2026' },
  })
  const [docs, setDocs] = useState({
    w9:        { uploaded:true,  filename:'Swift-Carriers-W9.pdf' },
    authority: { uploaded:true,  filename:'MC-294810-Authority.pdf' },
    boc3:      { uploaded:true,  filename:'BOC3-Swift-Carriers.pdf' },
    drug:      { uploaded:false, filename:'' },
  })
  const [brokerEmail, setBrokerEmail] = useState('')
  const [pkgSent, setPkgSent] = useState({})
  const [linkCopied, setLinkCopied] = useState(false)

  const INS = [
    { key:'auto',    label:'Auto Liability',    required:true  },
    { key:'cargo',   label:'Cargo Insurance',   required:true  },
    { key:'general', label:'General Liability', required:false },
  ]
  const DOCS = [
    { key:'w9',        label:'W-9 Tax Form',          required:true  },
    { key:'authority', label:'Operating Authority',   required:true  },
    { key:'boc3',      label:'BOC-3 Process Agent',   required:true  },
    { key:'drug',      label:'Drug & Alcohol Policy', required:false },
  ]

  const linkUrl = 'https://pkg.qivori.com/c/' + (company?.mc||'').replace('MC-','')
  const doneCount = INS.filter(f=>f.required&&insurance[f.key]?.policy).length + DOCS.filter(f=>f.required&&docs[f.key]?.uploaded).length
  const totalReq  = INS.filter(f=>f.required).length + DOCS.filter(f=>f.required).length
  const pct = Math.round((doneCount/totalReq)*100)
  const inp = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', width:'100%', boxSizing:'border-box' }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>CARRIER PACKAGE</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Your broker contracting packet — {pct}% complete</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:120, height:6, borderRadius:3, background:'var(--surface3)' }}>
            <div style={{ height:6, borderRadius:3, width:pct+'%', background:pct===100?'var(--success)':'var(--accent)', transition:'width 0.4s' }} />
          </div>
          <span style={{ fontSize:12, fontWeight:700, color:pct===100?'var(--success)':'var(--accent)' }}>{pct}%</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:6 }}>
        {[
          { id:'overview', label:'Overview' },
          { id:'insurance', label:'Insurance' },
          { id:'documents', label:'Documents' },
          { id:'send', label:'Send to Broker' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="btn" style={{
            background: tab===t.id ? 'rgba(240,165,0,0.12)' : 'var(--surface2)',
            color: tab===t.id ? 'var(--accent)' : 'var(--muted)',
            border: `1px solid ${tab===t.id ? 'rgba(240,165,0,0.35)' : 'var(--border)'}`,
          }}>{t.label}</button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Company Card */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Briefcase} /> Company Profile</div>
              <span style={S.badge(pct===100?'var(--success)':'var(--accent)')}>{pct===100?'Ready to Send':'In Progress'}</span>
            </div>
            <div style={{ padding:20, display:'flex', alignItems:'center', gap:20 }}>
              <div style={{ width:56, height:56, borderRadius:12, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {company?.logo
                  ? <img src={company.logo} alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain', borderRadius:12 }} />
                  : <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:'var(--accent)' }}>
                      {(company?.name || 'SC').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
                    </span>
                }
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>{company?.name || 'Your Company'}</div>
                <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--muted)' }}>
                  <span>{company?.mc||''}</span>
                  <span>{company?.dot||''}</span>
                  <span>{company?.phone || '(612) 555-0182'}</span>
                </div>
              </div>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--success)' }}><Check size={12} /> Authority Active</span>
            </div>
          </div>

          {/* Status Summary */}
          <div style={S.grid(2)}>
            {/* Insurance Status */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Shield} /> Insurance</div>
                <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setTab('insurance')}>Edit →</button>
              </div>
              <div style={{ padding:14, display:'flex', flexDirection:'column', gap:8 }}>
                {INS.map(f => (
                  <div key={f.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:'var(--surface2)', borderRadius:8 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{f.label}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{insurance[f.key]?.company || 'Not set'}</div>
                    </div>
                    <span style={S.tag(insurance[f.key]?.policy ? 'var(--success)' : 'var(--danger)')}>
                      {insurance[f.key]?.policy ? 'On File' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Documents Status */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={FileText} /> Documents</div>
                <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setTab('documents')}>Edit →</button>
              </div>
              <div style={{ padding:14, display:'flex', flexDirection:'column', gap:8 }}>
                {DOCS.map(f => (
                  <div key={f.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:'var(--surface2)', borderRadius:8 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{f.label}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{docs[f.key]?.uploaded ? docs[f.key].filename : 'Not uploaded'}</div>
                    </div>
                    <span style={S.tag(docs[f.key]?.uploaded ? 'var(--success)' : 'var(--danger)')}>
                      {docs[f.key]?.uploaded ? 'Uploaded' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INSURANCE TAB */}
      {tab === 'insurance' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {INS.map(f => {
            const ins = insurance[f.key]
            return (
              <div key={f.key} style={S.panel}>
                <div style={S.panelHead}>
                  <div style={S.panelTitle}>
                    {f.label}
                    {f.required && <span style={{ fontSize:10, color:'var(--danger)', marginLeft:6 }}>Required</span>}
                  </div>
                  <span style={S.tag(ins?.policy ? 'var(--success)' : 'var(--danger)')}>
                    {ins?.policy ? 'On File' : 'Missing'}
                  </span>
                </div>
                <div style={{ padding:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    { key:'company', label:'Insurance Company', ph:'Progressive Commercial' },
                    { key:'policy',  label:'Policy Number',     ph:'PCT-8821047' },
                    { key:'amount',  label:'Coverage Amount',   ph:'$1,000,000' },
                    { key:'expiry',  label:'Expiry Date',       ph:'Nov 15, 2026' },
                  ].map(field => (
                    <div key={field.key}>
                      <label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:4 }}>{field.label}</label>
                      <input value={(ins && ins[field.key]) || ''} placeholder={field.ph}
                        onChange={e => setInsurance(prev => ({ ...prev, [f.key]: { ...prev[f.key], [field.key]: e.target.value } }))}
                        style={inp} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* DOCUMENTS TAB */}
      {tab === 'documents' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {DOCS.map(f => (
            <div key={f.key} style={{ ...S.panel, padding:'14px 18px', display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>
                  {f.label}
                  {f.required && <span style={{ fontSize:10, color:'var(--danger)', marginLeft:8 }}>Required</span>}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>
                  {docs[f.key]?.uploaded ? docs[f.key].filename : 'No file uploaded — PDF, DOC accepted'}
                </div>
              </div>
              {docs[f.key]?.uploaded ? (
                <div style={{ display:'flex', gap:8 }}>
                  <span style={S.tag('var(--success)')}><Check size={11} /> On File</span>
                  <label style={{ padding:'5px 12px', fontSize:11, fontWeight:700, borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Replace
                    <input type="file" accept=".pdf,.doc,.docx" style={{ display:'none' }}
                      onChange={e => { if (e.target.files?.[0]) { const name = e.target.files[0].name; setDocs(d => ({ ...d, [f.key]: { uploaded:true, filename:name } })); showToast('', f.label+' Updated', name) } }} />
                  </label>
                </div>
              ) : (
                <label style={{ padding:'8px 18px', fontSize:12, fontWeight:700, borderRadius:8, background:'var(--accent)', color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Upload
                  <input type="file" accept=".pdf,.doc,.docx" style={{ display:'none' }}
                    onChange={e => { if (e.target.files?.[0]) { const name = e.target.files[0].name; setDocs(d => ({ ...d, [f.key]: { uploaded:true, filename:name } })); showToast('', f.label+' Uploaded', name) } }} />
                </label>
              )}
            </div>
          ))}
        </div>
      )}

      {/* SEND TAB */}
      {tab === 'send' && (
        <div style={{ maxWidth:500 }}>
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Send} /> Send to Broker</div>
            </div>
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Broker Email</label>
                <input value={brokerEmail} onChange={e => setBrokerEmail(e.target.value)} placeholder="dispatch@broker.com" style={inp} />
              </div>
              <button onClick={() => { if(!brokerEmail||pkgSent[brokerEmail]) return; setPkgSent(p => ({...p, [brokerEmail]:true})); showToast('','Package Sent!','Emailed to '+brokerEmail) }}
                style={{ padding:'12px 0', fontSize:13, fontWeight:700, borderRadius:8, border:'none', fontFamily:"'DM Sans',sans-serif", cursor:'pointer',
                  background:pkgSent[brokerEmail]?'rgba(34,197,94,0.15)':!brokerEmail?'var(--surface3)':'var(--accent3)',
                  color:pkgSent[brokerEmail]?'var(--success)':!brokerEmail?'var(--muted)':'#fff' }}>
                {pkgSent[brokerEmail] ? 'Package Sent ✓' : 'Send Carrier Package'}
              </button>

              <div style={{ borderTop:'1px solid var(--border)', paddingTop:14 }}>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>Or share your package link</div>
                <div style={{ display:'flex', gap:8 }}>
                  <input readOnly value={linkUrl} style={{ ...inp, flex:1, fontSize:11, fontFamily:'monospace' }} />
                  <button onClick={() => { try{navigator.clipboard.writeText(linkUrl)}catch{}; setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500); showToast('','Link Copied','Share with any broker') }}
                    style={{ fontSize:11, fontWeight:700, padding:'8px 14px', borderRadius:6, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0,
                      background:linkCopied?'rgba(34,197,94,0.15)':'var(--accent)', color:linkCopied?'var(--success)':'#000' }}>
                    {linkCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {Object.keys(pkgSent).length > 0 && (
                <div style={{ background:'rgba(34,197,94,0.05)', border:'1px solid rgba(34,197,94,0.15)', borderRadius:8, padding:'10px 14px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--success)', marginBottom:5 }}>Sent History</div>
                  {Object.keys(pkgSent).map(email => (
                    <div key={email} style={{ fontSize:12, color:'var(--muted)' }}><Check size={11} /> {email}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── EQUIPMENT MANAGER ────────────────────────────────────────────────────────
const INIT_TRUCKS = [
  { id:'t1', type:'truck', unit:'Unit 01', year:'2021', make:'Kenworth', model:'T680', vin:'1XKYD49X5MJ123456', plate:'IL-TRK-4821', state:'IL', color:'#f0a500', driver:'James Tucker', status:'Active', odometer:'284,500', nextService:'Apr 15, 2026', regExpiry:'Dec 31, 2026', insExpiry:'Nov 15, 2026', notes:'Flagship unit — HazMat certified' },
  { id:'t2', type:'truck', unit:'Unit 02', year:'2019', make:'Peterbilt', model:'579', vin:'1XPWD49X5KD234567', plate:'IL-TRK-3902', state:'IL', color:'#4d8ef0', driver:'Marcus Lee', status:'Active', odometer:'412,100', nextService:'Mar 22, 2026', regExpiry:'Dec 31, 2026', insExpiry:'Nov 15, 2026', notes:'Oil change overdue — schedule ASAP' },
  { id:'t3', type:'truck', unit:'Unit 03', year:'2022', make:'Freightliner', model:'Cascadia', vin:'3AKJHHDR4NSNA3789', plate:'MN-TRK-7741', state:'MN', color:'#00d4aa', driver:'Priya Patel', status:'Active', odometer:'118,200', nextService:'Jul 1, 2026', regExpiry:'Jun 30, 2026', insExpiry:'Nov 15, 2026', notes:'' },
]
const INIT_TRAILERS = [
  { id:'tr1', type:'trailer', unit:'Trailer 01', year:'2020', make:'Wabash', model:'DuraPlate 53ft', vin:'1JJV532W5LF123789', plate:'IL-TRL-0012', state:'IL', color:'var(--muted)', driver:'', status:'Active', odometer:'', nextService:'Jun 1, 2026', regExpiry:'Dec 31, 2026', insExpiry:'Nov 15, 2026', notes:'53ft dry van · Swing doors' },
  { id:'tr2', type:'trailer', unit:'Trailer 02', year:'2018', make:'Great Dane', model:'Champion 48ft', vin:'1GRAA0622JB234890', plate:'IL-TRL-0034', state:'IL', color:'var(--muted)', driver:'', status:'Shop', odometer:'', nextService:'Mar 15, 2026', regExpiry:'Dec 31, 2026', insExpiry:'Nov 15, 2026', notes:'In shop — brake issue · Est. return Mar 14' },
]

const EQ_FIELDS_TRUCK = [
  { key:'unit',        label:'Unit #',         ph:'Unit 04',           span:1 },
  { key:'year',        label:'Year',           ph:'2023',              span:1 },
  { key:'make',        label:'Make',           ph:'Kenworth',          span:1 },
  { key:'model',       label:'Model',          ph:'T680',              span:1 },
  { key:'vin',         label:'VIN',            ph:'1XKYD49X5MJ000000', span:2 },
  { key:'plate',       label:'License Plate',  ph:'IL-TRK-5500',       span:1 },
  { key:'state',       label:'Plate State',    ph:'IL',                span:1 },
  { key:'odometer',    label:'Odometer',       ph:'0',                 span:1 },
  { key:'nextService', label:'Next Service',   ph:'Jun 1, 2026',       span:1 },
  { key:'regExpiry',   label:'Reg. Expiry',    ph:'Dec 31, 2026',      span:1 },
  { key:'insExpiry',   label:'Ins. Expiry',    ph:'Nov 15, 2026',      span:1 },
  { key:'notes',       label:'Notes',          ph:'Any notes...',      span:2 },
]
const EQ_FIELDS_TRAILER = [
  { key:'unit',        label:'Unit #',         ph:'Trailer 03',        span:1 },
  { key:'year',        label:'Year',           ph:'2022',              span:1 },
  { key:'make',        label:'Make',           ph:'Wabash',            span:1 },
  { key:'model',       label:'Model / Length', ph:'DuraPlate 53ft',    span:1 },
  { key:'vin',         label:'VIN',            ph:'1JJV532W5LF000000', span:2 },
  { key:'plate',       label:'License Plate',  ph:'IL-TRL-0056',       span:1 },
  { key:'state',       label:'Plate State',    ph:'IL',                span:1 },
  { key:'nextService', label:'Next Service',   ph:'Jun 1, 2026',       span:1 },
  { key:'regExpiry',   label:'Reg. Expiry',    ph:'Dec 31, 2026',      span:1 },
  { key:'insExpiry',   label:'Ins. Expiry',    ph:'Nov 15, 2026',      span:1 },
  { key:'notes',       label:'Notes',          ph:'53ft dry van...',   span:2 },
]

export function EquipmentManager() {
  const { showToast } = useApp()
  const [equipment, setEquipment] = useState([...INIT_TRUCKS, ...INIT_TRAILERS])
  const [selected, setSelected] = useState('t1')
  const [tab, setTab] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [addType, setAddType] = useState('truck')
  const [form, setForm] = useState({})
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})

  const filtered = tab === 'all' ? equipment : equipment.filter(e => e.type === tab)
  const sel = equipment.find(e => e.id === selected) || filtered[0]

  const statusColor = s => s === 'Active' ? 'var(--success)' : s === 'Shop' ? 'var(--warning)' : 'var(--muted)'

  const addEquipment = () => {
    if (!form.unit) return
    const id = (addType === 'truck' ? 't' : 'tr') + Date.now()
    setEquipment(eq => [...eq, { ...form, id, type: addType, color: addType === 'truck' ? 'var(--accent3)' : 'var(--muted)', status:'Active', driver:'' }])
    setSelected(id)
    setShowAdd(false)
    setForm({})
    showToast('', addType === 'truck' ? 'Truck Added' : 'Trailer Added', form.unit)
  }

  const saveEdit = () => {
    setEquipment(eq => eq.map(e => e.id === sel.id ? { ...e, ...editForm } : e))
    setEditing(false)
    showToast('', 'Saved', sel.unit)
  }

  const inp = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', width:'100%', boxSizing:'border-box' }

  const fields = addType === 'truck' ? EQ_FIELDS_TRUCK : EQ_FIELDS_TRAILER

  const isExpiringSoon = (dateStr) => {
    if (!dateStr) return false
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const parts = dateStr.replace(',','').split(' ')
    const mon = months.indexOf(parts[0])
    const day = parseInt(parts[1])
    const year = parseInt(parts[2])
    if (mon < 0 || isNaN(day)) return false
    const d = new Date(year || 2026, mon, day)
    const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return diff < 45
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* Add Modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:16, width:500, maxHeight:'90vh', overflowY:'auto', padding:28 }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1, marginBottom:2 }}>ADD EQUIPMENT</div>
            <div style={{ display:'flex', gap:8, marginBottom:20 }}>
              {['truck','trailer'].map(t => (
                <button key={t} onClick={() => { setAddType(t); setForm({}) }}
                  style={{ flex:1, padding:'8px 0', fontSize:12, fontWeight:700, borderRadius:8, border:'1px solid var(--border)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                    background: addType === t ? 'var(--accent)' : 'var(--surface2)', color: addType === t ? '#000' : 'var(--text)' }}>
                  {t === 'truck' ? <><Truck size={13} /> Truck</> : <><Truck size={13} /> Trailer</>}
                </button>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
              {fields.map(f => (
                <div key={f.key} style={{ gridColumn: f.span === 2 ? 'span 2' : undefined }}>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                  <input value={form[f.key] || ''} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.ph} style={inp} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'12px 0' }} onClick={addEquipment} disabled={!form.unit}>+ Add {addType === 'truck' ? 'Truck' : 'Trailer'}</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'12px 0' }} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* LEFT SIDEBAR */}
      <div style={{ width:240, flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:8 }}>EQUIPMENT</div>
          <div style={{ display:'flex', gap:6 }}>
            {[['all','All'], ['truck','Trucks'], ['trailer','Trailers']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ flex:1, padding:'5px 0', fontSize:11, fontWeight:700, borderRadius:6, border:'1px solid var(--border)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                  background: tab === id ? 'var(--accent)' : 'var(--surface2)', color: tab === id ? '#000' : 'var(--muted)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
          {filtered.map(eq => {
            const isSel = sel?.id === eq.id
            const expiring = isExpiringSoon(eq.regExpiry) || isExpiringSoon(eq.insExpiry)
            return (
              <div key={eq.id} onClick={() => { setSelected(eq.id); setEditing(false) }}
                style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                  background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.15s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:`${eq.color}18`, border:`1px solid ${eq.color}40`,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                    {eq.type === 'truck' ? <Truck size={16} /> : <Truck size={16} />}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{eq.unit}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>{eq.year} {eq.make} {eq.model}</div>
                  </div>
                  {expiring && <span style={{ fontSize:16 }} title="Expiring soon"><AlertTriangle size={18} /></span>}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, background:`${statusColor(eq.status)}18`, color:statusColor(eq.status) }}>{eq.status}</span>
                  {eq.driver && <span style={{ fontSize:10, color:'var(--muted)' }}><Ic icon={User} /> {eq.driver.split(' ')[0]}</span>}
                  <span style={{ fontSize:10, color:'var(--muted)', fontFamily:'monospace' }}>{eq.plate}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ padding:12, borderTop:'1px solid var(--border)', flexShrink:0, display:'flex', gap:8 }}>
          <button className="btn btn-primary" style={{ flex:1, fontSize:11 }} onClick={() => { setShowAdd(true); setAddType('truck') }}>+ Truck</button>
          <button className="btn btn-ghost" style={{ flex:1, fontSize:11 }} onClick={() => { setShowAdd(true); setAddType('trailer') }}>+ Trailer</button>
        </div>
      </div>

      {/* RIGHT DETAIL */}
      {sel && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

          {/* Header */}
          <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ width:48, height:48, borderRadius:12, background:`${sel.color}18`, border:`2px solid ${sel.color}40`,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
              {sel.type === 'truck' ? <Truck size={14} /> : <Truck size={14} />}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4, flexWrap:'wrap' }}>
                <span style={{ fontSize:16, fontWeight:800 }}>{sel.unit}</span>
                <span style={{ fontSize:10, fontWeight:800, padding:'3px 10px', borderRadius:8, background:`${statusColor(sel.status)}15`, color:statusColor(sel.status) }}>{sel.status}</span>
                {sel.driver && <span style={{ fontSize:12, color:'var(--muted)' }}><Ic icon={User} /> {sel.driver}</span>}
              </div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>{sel.year} {sel.make} {sel.model} · {sel.plate} · VIN: <span style={{ fontFamily:'monospace', fontSize:11 }}>{sel.vin}</span></div>
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              {editing
                ? <>
                    <button className="btn btn-primary" style={{ fontSize:11 }} onClick={saveEdit}><Ic icon={Save} /> Save</button>
                    <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setEditing(false)}>Cancel</button>
                  </>
                : <>
                    <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { setEditing(true); setEditForm({ ...sel }) }}><Ic icon={PencilIcon} /> Edit</button>
                    <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast('','Report','Generating equipment report...')}><Ic icon={FileText} /> Report</button>
                  </>
              }
            </div>
          </div>

          <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:24, display:'flex', flexDirection:'column', gap:16 }}>

            {/* Alerts */}
            {(isExpiringSoon(sel.regExpiry) || isExpiringSoon(sel.insExpiry) || sel.notes?.toLowerCase().includes('overdue') || sel.notes?.toLowerCase().includes('shop')) && (
              <div style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:12, padding:'12px 16px', display:'flex', gap:12, alignItems:'flex-start' }}>
                <span style={{ fontSize:18 }}><AlertTriangle size={18} /></span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--warning)', marginBottom:4 }}>Attention Required</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    {isExpiringSoon(sel.regExpiry) && <div style={{ fontSize:12, color:'var(--muted)' }}>Registration expires {sel.regExpiry} — renew soon</div>}
                    {isExpiringSoon(sel.insExpiry) && <div style={{ fontSize:12, color:'var(--muted)' }}>Insurance expires {sel.insExpiry} — contact agent</div>}
                    {sel.notes && <div style={{ fontSize:12, color:'var(--muted)' }}>{sel.notes}</div>}
                  </div>
                </div>
              </div>
            )}

            {/* Key stats */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
              {[
                { label:'Odometer',     value: sel.odometer || '—',    icon: Route },
                { label:'Next Service', value: sel.nextService || '—', icon: Wrench, warn: isExpiringSoon(sel.nextService) },
                { label:'Reg. Expiry',  value: sel.regExpiry || '—',   icon: FileText, warn: isExpiringSoon(sel.regExpiry) },
                { label:'Ins. Expiry',  value: sel.insExpiry || '—',   icon: Shield, warn: isExpiringSoon(sel.insExpiry) },
              ].map(s => (
                <div key={s.label} style={{ background:'var(--surface)', border:`1px solid ${s.warn ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`, borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{typeof s.icon === "string" ? s.icon : <s.icon size={11} />} {s.label}</div>
                  <div style={{ fontSize:14, fontWeight:700, color: s.warn ? 'var(--warning)' : 'var(--text)' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Details grid */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}>{sel.type === 'truck' ? <Truck size={14} /> : <Truck size={14} />} {editing ? 'Edit' : ''} Equipment Details</div>
              </div>
              <div style={{ padding:'16px 18px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {(sel.type === 'truck' ? EQ_FIELDS_TRUCK : EQ_FIELDS_TRAILER).map(f => (
                  <div key={f.key} style={{ gridColumn: f.span === 2 ? 'span 2' : undefined }}>
                    <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, marginBottom:5 }}>{f.label}</div>
                    {editing
                      ? <input value={editForm[f.key] || ''} onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.ph}
                          style={{ ...inp, background:'var(--surface2)', padding:'7px 10px', fontSize:12 }} />
                      : <div style={{ fontSize:13, fontWeight:600, color: sel[f.key] ? 'var(--text)' : 'var(--muted)', fontFamily: f.key === 'vin' ? 'monospace' : undefined }}>
                          {sel[f.key] || '—'}
                        </div>
                    }
                  </div>
                ))}
              </div>
            </div>

            {/* Status update */}
            {!editing && (
              <div style={S.panel}>
                <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Zap} /> Quick Actions</div></div>
                <div style={{ padding:'14px 18px', display:'flex', gap:10, flexWrap:'wrap' }}>
                  {['Active','Shop','Inactive'].map(s => (
                    <button key={s} onClick={() => { setEquipment(eq => eq.map(e => e.id === sel.id ? { ...e, status:s } : e)); showToast('','Status Updated', sel.unit + ' → ' + s) }}
                      style={{ padding:'8px 18px', fontSize:12, fontWeight:700, borderRadius:8, border:`1px solid ${statusColor(s)}40`, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                        background: sel.status === s ? `${statusColor(s)}18` : 'var(--surface2)', color: sel.status === s ? statusColor(s) : 'var(--muted)' }}>
                      {s === 'Active' ? <Check size={13} /> : s === 'Shop' ? <Wrench size={13} /> : '⏸'} {s}
                    </button>
                  ))}
                  <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => showToast('','Service Scheduled', sel.unit + ' — service reminder set')}><Ic icon={Wrench} /> Schedule Service</button>
                  <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => showToast('','Documents','Opening document vault for ' + sel.unit)}><Ic icon={FileText} /> Documents</button>
                  <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => showToast('','GPS','Opening live location for ' + sel.unit)}><Ic icon={MapPin} /> GPS Location</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── ANALYTICS DASHBOARD ───────────────────────────────────────────────────────
export function AnalyticsDashboard() {
  const { showToast } = useApp()
  const { loads, expenses, invoices, totalRevenue, totalExpenses, deliveredLoads, drivers, vehicles } = useCarrier()
  const [aiTab, setAiTab] = useState('insights')

  // ── Computed data ───────────────────────────────────────────
  const revenueByMonth = useMemo(() => {
    const months = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const label = d.toLocaleDateString('en-US', { month:'short' })
      months.push({ key, label, revenue:0, expenses:0, loads:0, miles:0 })
    }
    loads.forEach(l => {
      const dateStr = l.pickup_date || l.pickup || l.delivery_date || l.delivery || ''
      if (!dateStr) return
      const parsed = new Date(dateStr.replace(/·.*/,'').trim())
      if (isNaN(parsed)) return
      const key = `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}`
      const m = months.find(mo => mo.key === key)
      if (m) { m.revenue += Number(l.gross || l.gross_pay || 0); m.loads++; m.miles += Number(l.miles || 0) }
    })
    expenses.forEach(e => {
      const parsed = new Date(e.date)
      if (isNaN(parsed)) return
      const key = `${parsed.getFullYear()}-${String(parsed.getMonth()+1).padStart(2,'0')}`
      const m = months.find(mo => mo.key === key)
      if (m) m.expenses += Number(e.amount || 0)
    })
    return months
  }, [loads, expenses])

  const topLanes = useMemo(() => {
    const laneMap = {}
    deliveredLoads.forEach(l => {
      const o = (l.origin || '').split(',')[0].trim()
      const d = (l.destination || l.dest || '').split(',')[0].trim()
      if (!o || !d) return
      const key = `${o} → ${d}`
      if (!laneMap[key]) laneMap[key] = { lane:key, revenue:0, loads:0, miles:0, rates:[] }
      laneMap[key].revenue += Number(l.gross || l.gross_pay || 0)
      laneMap[key].loads++
      laneMap[key].miles += Number(l.miles || 0)
      if (l.rate) laneMap[key].rates.push(Number(l.rate))
    })
    return Object.values(laneMap).sort((a,b) => b.revenue - a.revenue).slice(0, 6)
  }, [deliveredLoads])

  const expByCategory = useMemo(() => {
    const catMap = {}
    expenses.forEach(e => {
      const cat = e.category || e.cat || 'Other'
      if (!catMap[cat]) catMap[cat] = 0
      catMap[cat] += Number(e.amount || 0)
    })
    return Object.entries(catMap).sort((a,b) => b[1] - a[1]).map(([cat, amount]) => ({ cat, amount }))
  }, [expenses])

  // ── AI-computed metrics ────────────────────────────────────
  const totalMiles = loads.reduce((s,l) => s + Number(l.miles||0), 0)
  const netProfit = totalRevenue - totalExpenses
  const margin = totalRevenue > 0 ? Math.round((netProfit/totalRevenue)*100) : 0
  const avgRPM = totalMiles > 0 ? (totalRevenue / totalMiles).toFixed(2) : '0.00'
  const avgLoadSize = loads.length > 0 ? Math.round(totalRevenue / loads.length) : 0
  const totalExpAmt = expByCategory.reduce((s,e) => s+e.amount, 0) || 1
  const maxRev = Math.max(...revenueByMonth.map(m => m.revenue), 1)
  const fuelExp = expenses.filter(e => (e.category||e.cat||'').toLowerCase().includes('fuel')).reduce((s,e) => s+Number(e.amount||0), 0)
  const fuelPctOfRev = totalRevenue > 0 ? Math.round((fuelExp/totalRevenue)*100) : 0
  const unpaidTotal = invoices.filter(i => i.status !== 'Paid').reduce((s,i) => s+Number(i.amount||0), 0)
  const paidInvoices = invoices.filter(i => i.status === 'Paid')

  // Revenue trend (is it going up or down?)
  const recentMonths = revenueByMonth.slice(-3)
  const revTrend = recentMonths.length >= 2
    ? recentMonths[recentMonths.length-1].revenue - recentMonths[recentMonths.length-2].revenue
    : 0
  const revTrendPct = recentMonths.length >= 2 && recentMonths[recentMonths.length-2].revenue > 0
    ? Math.round((revTrend / recentMonths[recentMonths.length-2].revenue) * 100)
    : 0

  // Deadhead ratio
  const totalDeadhead = loads.reduce((s,l) => s + Number(l.deadhead||0), 0)
  const deadheadPct = totalMiles > 0 ? Math.round((totalDeadhead / (totalMiles+totalDeadhead)) * 100) : 0

  // Utilization (loads per truck)
  const truckCount = (vehicles || []).filter(v => v.type === 'truck').length || (drivers || []).length || 3
  const utilization = Math.min(100, Math.round((loads.filter(l => ['In Transit','Loaded','At Pickup','At Delivery'].includes(l.status)).length / Math.max(truckCount,1)) * 100))

  // Projected monthly revenue (based on current pace)
  const now = new Date()
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate()
  const currentMonthRev = revenueByMonth[revenueByMonth.length-1]?.revenue || 0
  const projectedRev = dayOfMonth > 0 ? Math.round((currentMonthRev / dayOfMonth) * daysInMonth) : 0

  // AI Health Score (0–100)
  const healthScore = useMemo(() => {
    let score = 50
    if (margin > 30) score += 15; else if (margin > 20) score += 8; else if (margin < 10) score -= 10
    if (Number(avgRPM) > 2.8) score += 10; else if (Number(avgRPM) < 2.0) score -= 10
    if (utilization > 80) score += 10; else if (utilization < 40) score -= 5
    if (deadheadPct < 10) score += 5; else if (deadheadPct > 20) score -= 5
    if (fuelPctOfRev < 30) score += 5; else if (fuelPctOfRev > 40) score -= 5
    if (unpaidTotal === 0) score += 5; else if (unpaidTotal > totalRevenue * 0.5) score -= 10
    return Math.max(0, Math.min(100, score))
  }, [margin, avgRPM, utilization, deadheadPct, fuelPctOfRev, unpaidTotal, totalRevenue])

  const scoreColor = healthScore >= 80 ? 'var(--success)' : healthScore >= 60 ? 'var(--accent)' : healthScore >= 40 ? 'var(--warning)' : 'var(--danger)'
  const scoreLabel = healthScore >= 80 ? 'Excellent' : healthScore >= 60 ? 'Good' : healthScore >= 40 ? 'Needs Work' : 'At Risk'

  // AI Recommendations
  const aiRecs = useMemo(() => {
    const recs = []
    if (fuelPctOfRev > 35) recs.push({ icon:Fuel, color:'#f59e0b', title:'Fuel spend is high', detail:`Fuel is ${fuelPctOfRev}% of revenue (industry avg: 25–30%). Consider fuel card programs or optimizing routes to save $${Math.round(fuelExp * 0.08).toLocaleString()}/mo.`, impact:'High', action:'Optimize' })
    if (margin < 25) recs.push({ icon:TrendingDown, color:'#ef4444', title:'Margins below target', detail:`Net margin is ${margin}% — below the 30% industry benchmark. Review expense categories or negotiate higher rates on your top lanes.`, impact:'High', action:'Review' })
    if (deadheadPct > 15) recs.push({ icon:Route, color:'#8b5cf6', title:'Reduce deadhead miles', detail:`${deadheadPct}% of your miles are empty. Look for backhaul loads on your top lanes to fill repositioning gaps.`, impact:'Medium', action:'Find Loads' })
    if (unpaidTotal > 5000) recs.push({ icon:DollarSign, color:'#ef4444', title:`$${unpaidTotal.toLocaleString()} in unpaid invoices`, detail:`${invoices.filter(i=>i.status!=='Paid').length} invoices are outstanding. Follow up with brokers or consider factoring for immediate cash flow.`, impact:'High', action:'Collect' })
    if (utilization < 60) recs.push({ icon:Truck, color:'#4d8ef0', title:'Fleet underutilized', detail:`Only ${utilization}% of trucks are running loads. Book more loads or consider reducing fleet size to improve profitability.`, impact:'Medium', action:'Book Loads' })
    if (Number(avgRPM) < 2.5) recs.push({ icon:TrendingUp, color:'#f0a500', title:'Rate per mile is low', detail:`Avg $${avgRPM}/mi is below the $2.80 national average. Focus on higher-paying lanes and avoid low-RPM loads.`, impact:'Medium', action:'Analyze' })
    if (topLanes.length > 0 && topLanes[0].loads >= 3) recs.push({ icon:Star, color:'#22c55e', title:`Strong lane: ${topLanes[0].lane}`, detail:`${topLanes[0].loads} loads at $${topLanes[0].miles > 0 ? (topLanes[0].revenue/topLanes[0].miles).toFixed(2) : '0.00'}/mi. Consider negotiating a dedicated lane contract with your top broker for consistent volume.`, impact:'Opportunity', action:'Negotiate' })
    if (recs.length === 0) recs.push({ icon:CheckCircle, color:'#22c55e', title:'Operations look healthy', detail:'No critical issues detected. Keep monitoring your margins and lane performance.', impact:'Info', action:'Continue' })
    return recs
  }, [fuelPctOfRev, fuelExp, margin, deadheadPct, unpaidTotal, utilization, avgRPM, topLanes, invoices])

  const CAT_COLORS = { Fuel:'#f59e0b', Maintenance:'#ef4444', Tolls:'#8b5cf6', Food:'#22c55e', Parking:'#3b82f6', Insurance:'#ec4899', Other:'#6b7280' }
  const IMPACT_COLORS = { High:'var(--danger)', Medium:'var(--accent)', Opportunity:'var(--success)', Info:'var(--accent2)' }

  return (
    <div style={{ ...S.page, paddingBottom:60 }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>AI ANALYTICS</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Powered by Qivori Intelligence Engine</div>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {[
            { id:'insights', label:'AI Insights' },
            { id:'financial', label:'Financial' },
            { id:'operations', label:'Operations' },
          ].map(t => (
            <button key={t.id} onClick={() => setAiTab(t.id)} className="btn" style={{
              background: aiTab===t.id ? 'rgba(240,165,0,0.12)' : 'var(--surface2)',
              color: aiTab===t.id ? 'var(--accent)' : 'var(--muted)',
              border: `1px solid ${aiTab===t.id ? 'rgba(240,165,0,0.35)' : 'var(--border)'}`,
              fontSize:12,
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* ── AI INSIGHTS TAB ───────────────────────────────────── */}
      {aiTab === 'insights' && (<>

        {/* AI Health Score + Key Metrics */}
        <div style={{ display:'grid', gridTemplateColumns:'minmax(200px,280px) 1fr', gap:16 }}>
          {/* Health Score Ring */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:24, textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
            <div style={{ position:'relative', width:140, height:140, marginBottom:16 }}>
              <svg width="140" height="140" viewBox="0 0 140 140" style={{ transform:'rotate(-90deg)' }}>
                <circle cx="70" cy="70" r="58" fill="none" stroke="var(--surface2)" strokeWidth="10" />
                <circle cx="70" cy="70" r="58" fill="none" stroke={scoreColor} strokeWidth="10"
                  strokeDasharray={`${(healthScore/100)*364} 364`}
                  strokeLinecap="round" style={{ transition:'stroke-dasharray 1s ease' }} />
              </svg>
              <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:42, color:scoreColor, lineHeight:1 }}>{healthScore}</div>
                <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700 }}>/ 100</div>
              </div>
            </div>
            <div style={{ fontWeight:800, fontSize:14, color:scoreColor, marginBottom:4 }}>{scoreLabel}</div>
            <div style={{ fontSize:11, color:'var(--muted)' }}>AI Business Health Score</div>
            <div style={{ fontSize:10, color:'var(--muted)', marginTop:8, lineHeight:1.5 }}>
              Based on margins, RPM, utilization, deadhead, fuel costs, and receivables
            </div>
          </div>

          {/* Score Breakdown Gauges */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12 }}>
            {[
              { label:'Net Margin', value:`${margin}%`, target:'30%', pct:Math.min(100,Math.round((margin/40)*100)), color: margin>=30?'var(--success)':margin>=20?'var(--accent)':'var(--danger)', detail: margin>=30?'Above industry avg':'Below 30% target' },
              { label:'Rate/Mile', value:`$${avgRPM}`, target:'$2.80', pct:Math.min(100,Math.round((Number(avgRPM)/3.5)*100)), color: Number(avgRPM)>=2.8?'var(--success)':Number(avgRPM)>=2.3?'var(--accent)':'var(--danger)', detail: Number(avgRPM)>=2.8?'Strong rate':'Below national avg' },
              { label:'Fleet Util.', value:`${utilization}%`, target:'85%', pct:utilization, color: utilization>=80?'var(--success)':utilization>=50?'var(--accent)':'var(--danger)', detail:`${loads.filter(l=>['In Transit','Loaded'].includes(l.status)).length} of ${truckCount} trucks active` },
              { label:'Deadhead', value:`${deadheadPct}%`, target:'<10%', pct:Math.min(100,100-deadheadPct*3), color: deadheadPct<10?'var(--success)':deadheadPct<20?'var(--accent)':'var(--danger)', detail: deadheadPct<10?'Excellent efficiency':'Empty miles too high' },
              { label:'Fuel % of Rev', value:`${fuelPctOfRev}%`, target:'<30%', pct:Math.min(100,100-fuelPctOfRev*2), color: fuelPctOfRev<30?'var(--success)':fuelPctOfRev<38?'var(--accent)':'var(--danger)', detail:`$${fuelExp.toLocaleString()} spent on fuel` },
              { label:'Receivables', value:`$${(unpaidTotal/1000).toFixed(1)}K`, target:'$0', pct:Math.min(100,unpaidTotal===0?100:Math.max(10,100-Math.round((unpaidTotal/Math.max(totalRevenue,1))*200))), color: unpaidTotal===0?'var(--success)':unpaidTotal<5000?'var(--accent)':'var(--danger)', detail:`${invoices.filter(i=>i.status!=='Paid').length} invoices outstanding` },
            ].map(g => (
              <div key={g.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'var(--muted)', fontWeight:600 }}>{g.label}</span>
                  <span style={{ fontSize:10, color:'var(--muted)' }}>Target: {g.target}</span>
                </div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color:g.color, marginBottom:6 }}>{g.value}</div>
                <div style={{ height:5, background:'var(--surface2)', borderRadius:3, marginBottom:6 }}>
                  <div style={{ height:'100%', width:`${g.pct}%`, background:g.color, borderRadius:3, transition:'width 0.8s ease' }} />
                </div>
                <div style={{ fontSize:10, color:g.color }}>{g.detail}</div>
              </div>
            ))}
          </div>
        </div>

        {/* AI Recommendations */}
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:8, background:'rgba(240,165,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Brain size={15} color="var(--accent)" />
              </div>
              <div>
                <div style={S.panelTitle}>AI Recommendations</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>Auto-generated from your operational data</div>
              </div>
            </div>
            <span style={S.badge('var(--accent)')}>{aiRecs.length} insight{aiRecs.length!==1?'s':''}</span>
          </div>
          <div style={{ padding:14, display:'flex', flexDirection:'column', gap:10 }}>
            {aiRecs.map((r, i) => (
              <div key={i} style={{ display:'flex', gap:14, padding:'14px 16px', background:'var(--surface2)', borderRadius:10, alignItems:'flex-start', border:'1px solid var(--border)' }}>
                <div style={{ width:38, height:38, borderRadius:10, background:`${r.color}15`, border:`1px solid ${r.color}30`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Ic icon={r.icon} size={18} color={r.color} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                    <span style={{ fontSize:13, fontWeight:700 }}>{r.title}</span>
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, background:`${IMPACT_COLORS[r.impact]}15`, color:IMPACT_COLORS[r.impact] }}>{r.impact}</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>{r.detail}</div>
                </div>
                <button className="btn btn-ghost" style={{ fontSize:11, flexShrink:0 }} onClick={() => showToast('','AI Action',r.title)}>{r.action} →</button>
              </div>
            ))}
          </div>
        </div>

        {/* Projected Revenue */}
        <div style={{ background:'linear-gradient(135deg, rgba(240,165,0,0.06), rgba(0,212,170,0.04))', border:'1px solid rgba(240,165,0,0.2)', borderRadius:12, padding:'18px 22px', display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
          <div style={{ width:44, height:44, borderRadius:12, background:'rgba(240,165,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <Sparkles size={22} color="var(--accent)" />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:2 }}>AI Revenue Forecast — {now.toLocaleDateString('en-US',{month:'long'})}</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:12 }}>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:'var(--accent)' }}>${projectedRev.toLocaleString()}</span>
              <span style={{ fontSize:12, color:'var(--muted)' }}>projected</span>
              <span style={{ fontSize:12, color: revTrendPct >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight:700 }}>
                {revTrendPct >= 0 ? '↑' : '↓'} {Math.abs(revTrendPct)}% vs last month
              </span>
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:11, color:'var(--muted)' }}>Day {dayOfMonth} of {daysInMonth}</div>
            <div style={{ height:4, width:100, background:'var(--surface2)', borderRadius:2, marginTop:4 }}>
              <div style={{ height:'100%', width:`${Math.round((dayOfMonth/daysInMonth)*100)}%`, background:'var(--accent)', borderRadius:2 }} />
            </div>
          </div>
        </div>
      </>)}

      {/* ── FINANCIAL TAB ─────────────────────────────────────── */}
      {aiTab === 'financial' && (<>
        {/* KPI Row */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
          <StatCard label="Gross Revenue" value={totalRevenue >= 1000 ? `$${(totalRevenue/1000).toFixed(1)}K` : `$${totalRevenue}`} change={revTrendPct >= 0 ? `↑ ${revTrendPct}%` : `↓ ${Math.abs(revTrendPct)}%`} color="var(--accent)" changeType={revTrendPct>=0?'up':'down'} />
          <StatCard label="Net Profit" value={netProfit >= 1000 ? `$${(netProfit/1000).toFixed(1)}K` : `$${netProfit}`} change={`${margin}% margin`} color="var(--success)" changeType={margin>=30?'up':'down'} />
          <StatCard label="Avg Load" value={`$${avgLoadSize.toLocaleString()}`} change={`${loads.length} total`} color="var(--accent2)" changeType="neutral" />
          <StatCard label="Expenses" value={totalExpenses >= 1000 ? `$${(totalExpenses/1000).toFixed(1)}K` : `$${totalExpenses}`} change={`${margin}% of rev`} color="var(--danger)" changeType="neutral" />
          <StatCard label="Unpaid" value={`$${(unpaidTotal/1000).toFixed(1)}K`} change={`${invoices.filter(i=>i.status!=='Paid').length} invoices`} color={unpaidTotal>0?'var(--danger)':'var(--success)'} changeType="neutral" />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16 }}>
          {/* Revenue vs Expenses Chart */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={BarChart2} /> Revenue vs Expenses · 6 Months</div>
            </div>
            <div style={{ padding:20 }}>
              {/* Y-axis labels + bars */}
              <div style={{ display:'flex', gap:8 }}>
                <div style={{ width:40, display:'flex', flexDirection:'column', justifyContent:'space-between', height:180, paddingBottom:20 }}>
                  {[maxRev, Math.round(maxRev*0.5), 0].map(v => (
                    <div key={v} style={{ fontSize:9, color:'var(--muted)', textAlign:'right' }}>{v >= 1000 ? `$${(v/1000).toFixed(0)}K` : `$${v}`}</div>
                  ))}
                </div>
                <div style={{ flex:1, display:'flex', alignItems:'flex-end', gap:12, height:180, borderLeft:'1px solid var(--border)', borderBottom:'1px solid var(--border)', paddingLeft:8, paddingBottom:4, position:'relative' }}>
                  {/* Grid lines */}
                  <div style={{ position:'absolute', inset:'0 0 20px 0', display:'flex', flexDirection:'column', justifyContent:'space-between', pointerEvents:'none' }}>
                    {[0,1,2].map(i => <div key={i} style={{ borderBottom:'1px dashed var(--border)', opacity:0.3 }} />)}
                  </div>
                  {revenueByMonth.map(m => (
                    <div key={m.key} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, position:'relative', zIndex:1 }}>
                      <div style={{ width:'100%', display:'flex', gap:2, alignItems:'flex-end', justifyContent:'center' }}>
                        <div style={{ width:'40%', height:`${Math.max((m.revenue/maxRev)*150, 3)}px`, background:'linear-gradient(to top, var(--accent), rgba(240,165,0,0.6))', borderRadius:'4px 4px 0 0', transition:'height 0.6s ease' }} />
                        <div style={{ width:'40%', height:`${Math.max((m.expenses/maxRev)*150, 3)}px`, background:'linear-gradient(to top, var(--danger), rgba(239,68,68,0.4))', borderRadius:'4px 4px 0 0', transition:'height 0.6s ease' }} />
                      </div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{m.label}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display:'flex', gap:16, marginTop:12, paddingLeft:48 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--muted)' }}><div style={{ width:10, height:10, background:'var(--accent)', borderRadius:2 }} /> Revenue</div>
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--muted)' }}><div style={{ width:10, height:10, background:'var(--danger)', borderRadius:2 }} /> Expenses</div>
                <div style={{ flex:1 }} />
                <span style={{ fontSize:11, color:'var(--muted)' }}>Net: <strong style={{ color:'var(--success)' }}>${netProfit.toLocaleString()}</strong></span>
              </div>
            </div>
          </div>

          {/* Expense Donut (visual) */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Receipt} /> Cost Structure</div>
            </div>
            <div style={{ padding:16 }}>
              {/* Visual donut */}
              <div style={{ position:'relative', width:120, height:120, margin:'0 auto 16px' }}>
                <svg width="120" height="120" viewBox="0 0 120 120" style={{ transform:'rotate(-90deg)' }}>
                  {(() => {
                    let offset = 0
                    const colors = ['#f59e0b','#ef4444','#8b5cf6','#22c55e','#3b82f6','#ec4899','#6b7280']
                    return expByCategory.slice(0,6).map((e, i) => {
                      const pct = e.amount / totalExpAmt
                      const dash = pct * 314
                      const el = <circle key={e.cat} cx="60" cy="60" r="50" fill="none" stroke={CAT_COLORS[e.cat]||colors[i%colors.length]} strokeWidth="16"
                        strokeDasharray={`${dash} ${314-dash}`} strokeDashoffset={-offset} />
                      offset += dash
                      return el
                    })
                  })()}
                </svg>
                <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--text)' }}>${(totalExpAmt/1000).toFixed(1)}K</div>
                  <div style={{ fontSize:9, color:'var(--muted)' }}>Total</div>
                </div>
              </div>
              {expByCategory.slice(0,5).map(e => {
                const pct = Math.round((e.amount / totalExpAmt) * 100)
                return (
                  <div key={e.cat} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                    <div style={{ width:8, height:8, borderRadius:2, background:CAT_COLORS[e.cat]||'var(--muted)', flexShrink:0 }} />
                    <span style={{ fontSize:11, flex:1 }}>{e.cat}</span>
                    <span style={{ fontSize:11, color:'var(--muted)', fontWeight:600 }}>{pct}%</span>
                    <span style={{ fontSize:11, fontWeight:700, width:60, textAlign:'right' }}>${e.amount.toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </>)}

      {/* ── OPERATIONS TAB ────────────────────────────────────── */}
      {aiTab === 'operations' && (<>
        {/* Ops KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
          <StatCard label="Total Loads" value={String(loads.length)} change={`${deliveredLoads.length} delivered`} color="var(--accent)" changeType="neutral" />
          <StatCard label="Miles Driven" value={totalMiles >= 1000 ? `${(totalMiles/1000).toFixed(1)}K` : String(totalMiles)} change={`$${avgRPM}/mi`} color="var(--accent2)" changeType="neutral" />
          <StatCard label="Fleet Util." value={`${utilization}%`} change={`${truckCount} trucks`} color={utilization>=80?'var(--success)':'var(--accent)'} changeType={utilization>=80?'up':'down'} />
          <StatCard label="Deadhead" value={`${deadheadPct}%`} change={`${totalDeadhead.toLocaleString()} mi empty`} color={deadheadPct<10?'var(--success)':'var(--danger)'} changeType={deadheadPct<10?'up':'down'} />
          <StatCard label="Avg Load/Mo" value={String(Math.round(loads.length/Math.max(revenueByMonth.filter(m=>m.loads>0).length,1)))} change="loads per month" color="var(--accent3)" changeType="neutral" />
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', gap:16 }}>
          {/* Top Lanes with AI scoring */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Route} /> Lane Intelligence</div>
              <span style={{ fontSize:10, color:'var(--muted)' }}>AI-ranked by profitability</span>
            </div>
            <div>
              {topLanes.length === 0 && <div style={{ fontSize:12, color:'var(--muted)', padding:20, textAlign:'center' }}>No delivered loads yet</div>}
              {topLanes.map((l, i) => {
                const rpm = l.miles > 0 ? (l.revenue/l.miles) : 0
                const laneScore = Math.min(99, Math.round(40 + rpm*12 + l.loads*3))
                return (
                  <div key={l.lane} style={{ ...S.row, gap:10 }}>
                    <div style={{ width:32, height:32, borderRadius:8, background: i===0?'rgba(240,165,0,0.1)':'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:14, color: i===0?'var(--accent)':'var(--muted)' }}>#{i+1}</span>
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:700 }}>{l.lane}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{l.loads} loads · {l.miles.toLocaleString()} mi · ${rpm.toFixed(2)}/mi</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontWeight:700, color:'var(--accent)', fontSize:14 }}>${l.revenue.toLocaleString()}</div>
                      <div style={{ fontSize:10, color: laneScore>=80?'var(--success)':'var(--accent)', fontWeight:700 }}>Score: {laneScore}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Miles per Month + Load Pipeline */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {/* Miles trend */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Navigation} /> Miles Trend</div>
              </div>
              <div style={{ padding:16 }}>
                <div style={{ display:'flex', alignItems:'flex-end', gap:10, height:100 }}>
                  {revenueByMonth.map(m => {
                    const maxMi = Math.max(...revenueByMonth.map(x => x.miles), 1)
                    return (
                      <div key={m.key} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                        <div style={{ width:'70%', height:`${Math.max((m.miles/maxMi)*80, 3)}px`, background:'linear-gradient(to top, var(--accent2), rgba(77,142,240,0.4))', borderRadius:'3px 3px 0 0', transition:'height 0.6s ease' }} />
                        <div style={{ fontSize:10, color:'var(--muted)' }}>{m.label}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* Load Pipeline */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Activity} /> Load Pipeline</div>
              </div>
              <div style={{ padding:14 }}>
                {[
                  { label:'Booked', val:loads.filter(l => l.status === 'Booked').length, color:'var(--accent2)' },
                  { label:'In Transit', val:loads.filter(l => l.status === 'In Transit' || l.status === 'Loaded').length, color:'var(--success)' },
                  { label:'Delivered', val:deliveredLoads.length, color:'var(--accent)' },
                  { label:'Invoiced', val:invoices.filter(i=>i.status==='Paid').length + '/' + invoices.length, color:'var(--accent3)' },
                ].map(s => (
                  <div key={s.label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:6, height:6, borderRadius:3, background:s.color }} />
                      <span style={{ fontSize:12 }}>{s.label}</span>
                    </div>
                    <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:s.color }}>{s.val}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>)}
    </div>
  )
}

// ─── REFERRAL PROGRAM ──────────────────────────────────────────────────────────
export function ReferralProgram() {
  const { showToast } = useApp()
  const [referrals, setReferrals] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  const referralCode = 'QIVORI-' + Math.random().toString(36).substring(2, 8).toUpperCase()
  const referralLink = `https://qivori.com?ref=${referralCode}`

  const copyLink = () => {
    navigator.clipboard?.writeText(referralLink)
    setCopied(true)
    showToast('success', 'Copied!', 'Referral link copied to clipboard')
    setTimeout(() => setCopied(false), 2000)
  }

  const sendInvite = async () => {
    if (!inviteEmail || !inviteEmail.includes('@')) {
      showToast('error', 'Invalid Email', 'Please enter a valid email address')
      return
    }
    setSending(true)
    try {
      await apiFetch('/api/send-referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: inviteEmail, referralCode, referralLink }),
      })
      showToast('success', 'Invite Sent!', `Referral email sent to ${inviteEmail}`)
      setReferrals(prev => [...prev, { name: inviteEmail.split('@')[0], email: inviteEmail, status: 'Invited', date: new Date().toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }), reward: 'Pending' }])
      setInviteEmail('')
    } catch {
      showToast('error', 'Error', 'Failed to send invite')
    }
    setSending(false)
  }

  const totalEarned = referrals.filter(r => r.status === 'Subscribed').length
  const totalPending = referrals.filter(r => r.status === 'Signed Up' || r.status === 'Invited').length

  return (
    <div style={S.page}>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>REFERRAL PROGRAM</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Invite drivers, earn free months</div>
      </div>

      {/* Hero Banner */}
      <div style={{ background:'linear-gradient(135deg, rgba(240,165,0,0.12), rgba(77,142,240,0.08))', border:'1px solid rgba(240,165,0,0.3)', borderRadius:16, padding:'28px 24px', textAlign:'center' }}>
        <div style={{ fontSize:48, marginBottom:8 }}><Trophy size={48} color="var(--accent)" /></div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, letterSpacing:3, marginBottom:8 }}>
          REFER A DRIVER, GET A <span style={{ color:'var(--accent)' }}>FREE MONTH</span>
        </div>
        <div style={{ fontSize:14, color:'var(--muted)', maxWidth:500, margin:'0 auto', lineHeight:1.6 }}>
          When your referral subscribes to any Qivori plan, you both get a free month. Share your link and start earning.
        </div>
      </div>

      {/* Stats */}
      <div style={S.grid(3)}>
        <StatCard label="Total Referrals" value={String(referrals.length)} change="All time" color="var(--accent)" changeType="neutral" />
        <StatCard label="Free Months Earned" value={String(totalEarned)} change={`${totalPending} pending`} color="var(--success)" />
        <StatCard label="Your Savings" value={`$${totalEarned * 49}`} change="Based on Solo plan" color="var(--accent2)" changeType="neutral" />
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        {/* Share Section */}
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}><Ic icon={Send} /> Share Your Link</div>
          </div>
          <div style={{ padding:20 }}>
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8, fontWeight:600 }}>Your Referral Link</div>
              <div style={{ display:'flex', gap:8 }}>
                <input readOnly value={referralLink} style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', color:'var(--text)', fontSize:12, fontFamily:'monospace' }} />
                <button onClick={copyLink} style={{ padding:'10px 16px', fontSize:12, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                  background: copied ? 'rgba(34,197,94,0.15)' : 'var(--accent)', color: copied ? 'var(--success)' : '#000' }}>
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>

            <div>
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:8, fontWeight:600 }}>Send Email Invite</div>
              <div style={{ display:'flex', gap:8 }}>
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="driver@company.com"
                  onKeyDown={e => e.key === 'Enter' && sendInvite()}
                  style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
                <button onClick={sendInvite} disabled={sending}
                  style={{ padding:'10px 20px', fontSize:12, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", background:'var(--accent2)', color:'#fff', opacity:sending?0.7:1 }}>
                  {sending ? 'Sending...' : 'Send Invite'}
                </button>
              </div>
            </div>

            <div style={{ display:'flex', gap:8, marginTop:16 }}>
              {[
                { label:'SMS', icon:Phone, action: () => { window.open(`sms:?body=Check out Qivori AI for trucking! ${referralLink}`); showToast('','SMS','Opening messages...') }},
                { label:'WhatsApp', icon:MessageCircle, action: () => { window.open(`https://wa.me/?text=Check out Qivori AI for trucking! ${referralLink}`); showToast('','WhatsApp','Opening WhatsApp...') }},
              ].map(s => (
                <button key={s.label} onClick={s.action} className="btn btn-ghost" style={{ flex:1, fontSize:12, justifyContent:'center', gap:6 }}>
                  <Ic icon={s.icon} size={14} /> {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* How It Works */}
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}><Ic icon={Zap} /> How It Works</div>
          </div>
          <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
            {[
              { step:1, icon:Send, title:'Share Your Link', desc:'Send your referral link to fellow drivers via SMS, email, or word of mouth' },
              { step:2, icon:UserPlus, title:'They Sign Up', desc:'Your referral creates a free Qivori account using your link' },
              { step:3, icon:CreditCard, title:'They Subscribe', desc:'When they pick a paid plan, you both get rewarded' },
              { step:4, icon:Trophy, title:'You Both Win', desc:'You get a free month, they get a free month. Everyone saves!' },
            ].map(s => (
              <div key={s.step} style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                <div style={{ width:36, height:36, borderRadius:10, background:`rgba(240,165,0,${0.06 + s.step*0.03})`, border:'1px solid rgba(240,165,0,0.2)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Ic icon={s.icon} size={16} color="var(--accent)" />
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, marginBottom:2 }}>{s.title}</div>
                  <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.5 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Referral History */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Users} /> Referral History</div>
          <span style={{ fontSize:11, color:'var(--muted)' }}>{referrals.length} total</span>
        </div>
        <table>
          <thead><tr>{['Name','Email','Status','Date','Reward'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {referrals.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight:600 }}>{r.name}</td>
                <td style={{ fontSize:12, color:'var(--muted)' }}>{r.email}</td>
                <td>
                  <span style={S.tag(
                    r.status === 'Subscribed' ? 'var(--success)' :
                    r.status === 'Signed Up' ? 'var(--accent2)' :
                    'var(--muted)'
                  )}>{r.status}</span>
                </td>
                <td style={{ fontSize:12 }}>{r.date}</td>
                <td>
                  <span style={{ fontWeight:700, color: r.reward === 'Pending' ? 'var(--muted)' : 'var(--success)', fontSize:13 }}>{r.reward}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── SMS NOTIFICATION SETTINGS ─────────────────────────────────────────────────
export function SMSSettings() {
  const { showToast } = useApp()
  const [phone, setPhone] = useState('')
  const [enabled, setEnabled] = useState({
    loadBooked: true,
    loadDelivered: true,
    invoicePaid: true,
    checkCallReminder: false,
    weeklyReport: false,
  })
  const [verified, setVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [testSending, setTestSending] = useState(false)

  const toggleSetting = (key) => {
    setEnabled(prev => ({ ...prev, [key]: !prev[key] }))
    showToast('', key.replace(/([A-Z])/g, ' $1').trim(), !enabled[key] ? 'Enabled' : 'Disabled')
  }

  const verifyPhone = () => {
    if (!phone || phone.length < 10) {
      showToast('error', 'Invalid', 'Enter a valid phone number')
      return
    }
    setVerifying(true)
    setTimeout(() => {
      setVerified(true)
      setVerifying(false)
      showToast('success', 'Verified', 'Phone number verified')
    }, 1500)
  }

  const sendTest = async () => {
    if (!phone) { showToast('error', 'No Phone', 'Enter your phone number first'); return }
    setTestSending(true)
    try {
      const res = await apiFetch('/api/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: phone, message: 'Qivori AI test notification — SMS alerts are working!' }),
      })
      const data = await res.json()
      if (data.success) {
        showToast('success', 'SMS Sent!', 'Check your phone for the test message')
      } else {
        showToast('error', 'Failed', data.error || 'Could not send SMS')
      }
    } catch {
      showToast('error', 'Error', 'SMS service not configured yet')
    }
    setTestSending(false)
  }

  const ALERTS = [
    { key:'loadBooked', icon:Package, label:'Load Booked', desc:'Get notified when a new load is booked to your dispatch' },
    { key:'loadDelivered', icon:CheckCircle, label:'Load Delivered', desc:'Confirmation when a load is marked as delivered' },
    { key:'invoicePaid', icon:DollarSign, label:'Invoice Paid', desc:'Alert when a broker pays your invoice' },
    { key:'checkCallReminder', icon:Phone, label:'Check Call Reminder', desc:'Periodic reminders to submit check calls on active loads' },
    { key:'weeklyReport', icon:BarChart2, label:'Weekly Summary', desc:'Weekly revenue, miles, and performance summary via text' },
  ]

  return (
    <div style={S.page}>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>SMS NOTIFICATIONS</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Get text alerts for load updates, payments, and more</div>
      </div>

      {/* Phone Number Setup */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Phone} /> Phone Number</div>
          {verified && <span style={S.badge('var(--success)')}><Ic icon={CheckCircle} size={10} /> Verified</span>}
        </div>
        <div style={{ padding:20 }}>
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+1 (555) 123-4567"
              style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 14px', color:'var(--text)', fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
            <button onClick={verifyPhone} disabled={verifying}
              style={{ padding:'12px 20px', fontSize:13, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                background: verified ? 'rgba(34,197,94,0.15)' : 'var(--accent)', color: verified ? 'var(--success)' : '#000', opacity:verifying?0.7:1 }}>
              {verifying ? 'Verifying...' : verified ? 'Verified ✓' : 'Verify'}
            </button>
          </div>
          <button onClick={sendTest} disabled={testSending} className="btn btn-ghost" style={{ fontSize:12 }}>
            {testSending ? 'Sending...' : 'Send Test SMS'}
          </button>
        </div>
      </div>

      {/* Alert Settings */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Bell} /> Alert Preferences</div>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          {ALERTS.map(a => (
            <div key={a.key} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:'var(--surface2)', borderRadius:10 }}>
              <div style={{ width:36, height:36, borderRadius:10, background:'rgba(240,165,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Ic icon={a.icon} size={16} color="var(--accent)" />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{a.label}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{a.desc}</div>
              </div>
              <div
                style={{ width:44, height:24, background:enabled[a.key] ? 'var(--accent)' : 'var(--border)', borderRadius:12, cursor:'pointer', position:'relative', transition:'background 0.2s' }}
                onClick={() => toggleSetting(a.key)}
              >
                <div style={{ width:18, height:18, background:'#fff', borderRadius:'50%', position:'absolute', top:3, transition:'left 0.2s', left:enabled[a.key] ? 23 : 3 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info */}
      <div style={{ background:'rgba(77,142,240,0.06)', border:'1px solid rgba(77,142,240,0.2)', borderRadius:12, padding:'14px 18px', display:'flex', gap:12 }}>
        <Ic icon={Shield} size={18} color="var(--accent2)" />
        <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
          SMS notifications are powered by Twilio. Standard message rates may apply from your carrier. You can unsubscribe at any time by toggling off alerts above or replying STOP to any message.
        </div>
      </div>
    </div>
  )
}
