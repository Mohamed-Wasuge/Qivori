import React, { useState, useCallback, useEffect, Component } from 'react'
import {
  Monitor, Layers, Receipt, Truck, Shield, Users, Briefcase, Settings as SettingsIcon,
  Search, Bell, Moon, Eye, Zap, Wrench, CreditCard, BarChart2, AlertTriangle,
  TrendingUp, ChevronLeft, ClipboardList, CheckCircle, Map, DollarSign, Droplets, FileCheck, Star, UserPlus,
  User, Building2, Plug, Palette, Scale, Package, MapPin, Smartphone, FileText, AlertCircle, Fuel
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { CarrierProvider, useCarrier } from '../context/CarrierContext'
import { generateInvoicePDF } from '../utils/generatePDF'
import Toast from './Toast'
import {
  SmartDispatch, DriverSettlement, FleetMap, FleetManager,
  LaneIntel, FuelOptimizer, BrokerRiskIntel, DriverOnboarding,
  CarrierIFTA, CarrierDVIR, CarrierClearinghouse,
  DriverProfiles, BrokerDirectory, ExpenseTracker, FactoringCashflow,
  CommandCenter, AILoadBoard, CashFlowForecaster, CheckCallCenter, DriverScorecard, DATAlertBot,
  PLDashboard, ReceivablesAging, DriverPayReport, CashRunway, QuickBooksExport, CarrierPackage, EquipmentManager,
  AnalyticsDashboard, ReferralProgram, SMSSettings,
} from '../pages/CarrierPages'

const Ic = ({ icon: Icon, size = 16, color, style, ...props }) => <Icon size={size} color={color} style={style} {...props} />

// ── Error Boundary ─────────────────────────────────────────────────────────────
class ViewErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  componentDidCatch(err, info) { console.error('[Qivori] View crash:', err, info) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:20, padding:40 }}>
          <div style={{ width:64, height:64, borderRadius:16, background:'rgba(239,68,68,0.1)', border:'1px solid rgba(239,68,68,0.2)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--danger)' }}><AlertTriangle size={28} /></div>
          <div style={{ textAlign:'center' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--danger)', marginBottom:8 }}>Something went wrong</div>
            <div style={{ fontSize:12, color:'var(--muted)', maxWidth:360, lineHeight:1.7, fontFamily:'monospace', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 14px' }}>
              {String(this.state.error).replace('ReferenceError: ','').replace('TypeError: ','')}
            </div>
          </div>
          <button className="btn btn-ghost" onClick={() => this.setState({ error: null })}>
            ↩ Try Again
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// (MODULES array removed — components are now accessed via hub sub-tabs)

// ── Overview tab content ───────────────────────────────────────────────────────
const OV_ALERTS = [
  { icon: AlertTriangle, text:"Unit 03 oil change due in 800 mi — 94% breakdown risk if skipped", color:'var(--warning)', action:'Schedule' },
  { icon: AlertCircle, text:"Maria Santos CDL expires in 18 days — renew before dispatching", color:'var(--danger)',  action:'Renew' },
  { icon: CreditCard, text:"INV-042 ($2,666) ready for FastPay — collect by Mar 12 for best rate", color:'var(--accent)', action:'Collect' },
  { icon: Building2, text:"Transplace payment 8 days overdue on FM-4398 ($2,100)", color:'var(--danger)', action:'Contact' },
]
const STATUS_DOT = { 'In Transit':'var(--success)', 'Loaded':'var(--accent2)', 'Assigned to Driver':'var(--accent)', 'En Route to Pickup':'var(--accent2)', 'Rate Con Received':'var(--accent)', 'Available':'var(--muted)' }

function OverviewTab({ onTabChange }) {
  const { showToast } = useApp()
  const { loads, activeLoads, totalRevenue, totalExpenses, unpaidInvoices, deliveredLoads, drivers, vehicles } = useCarrier()
  const [dismissed, setDismissed] = useState([])
  const alerts = OV_ALERTS.filter((_, i) => !dismissed.includes(i))

  const revDisplay = totalRevenue >= 1000 ? `$${(totalRevenue/1000).toFixed(1)}K` : `$${totalRevenue}`
  const netProfit  = totalRevenue - totalExpenses
  const netDisplay = netProfit >= 1000 ? `$${(netProfit/1000).toFixed(1)}K` : `$${netProfit}`
  const avgRPM     = activeLoads.length
    ? (activeLoads.reduce((s,l) => s + (l.rate || 0), 0) / activeLoads.length).toFixed(2)
    : '—'

  const inTransitCount = activeLoads.filter(l => l.status === 'In Transit' || l.status === 'Loaded').length
  const trucksActive   = activeLoads.length

  // Build fleet status from context drivers + loads
  const fleetRows = drivers.map((d, idx) => {
    const driver = d.name || d.full_name || d.driver_name || 'Driver'
    const unit = d.unit || d.unit_number || `Unit ${String(idx+1).padStart(2,'0')}`
    const load = activeLoads.find(l => l.driver === driver)
    if (load) {
      const oc = load.origin?.split(',')[0]?.substring(0,3)?.toUpperCase() || '—'
      const dc = load.dest?.split(',')[0]?.substring(0,3)?.toUpperCase() || '—'
      return { unit, driver, status: load.status, statusC: STATUS_DOT[load.status] || 'var(--accent)', hos: '—', load: load.loadId, route: `${oc}→${dc}` }
    }
    return { unit, driver, status: 'Available', statusC: 'var(--muted)', hos: '—', load: '—', route: '—' }
  })

  return (
    <div style={{ padding: 20, paddingBottom: 60, overflowY: 'auto', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* AI banner */}
      <div style={{ background: 'linear-gradient(135deg,rgba(240,165,0,0.08),rgba(0,212,170,0.05))', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 12, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(240,165,0,0.12)', border: '1px solid rgba(240,165,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic icon={Zap} size={20} color="var(--accent)" /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', marginBottom: 3 }}>AI Engine Active — {alerts.length} action{alerts.length !== 1 ? 's' : ''} need your attention today</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{trucksActive} truck{trucksActive !== 1 ? 's' : ''} active · {inTransitCount} load{inTransitCount !== 1 ? 's' : ''} in transit · {unpaidInvoices.length} unpaid invoice{unpaidInvoices.length !== 1 ? 's' : ''} · ${totalRevenue.toLocaleString()} revenue MTD</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => onTabChange('loads')}>AI Dispatch →</button>
          <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => onTabChange('loads')}>Booked Loads →</button>
        </div>
      </div>

      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12 }}>
        {[
          { label: 'Revenue MTD',      value: revDisplay,              sub: '↑ 18% vs Feb',         color: 'var(--accent)',  click: () => onTabChange('financials') },
          { label: 'Net Profit MTD',   value: netDisplay,              sub: 'After fuel + pay',      color: 'var(--success)', click: () => onTabChange('financials') },
          { label: 'Active Loads',     value: String(activeLoads.length), sub: `${unpaidInvoices.length} invoice${unpaidInvoices.length !== 1 ? 's' : ''} pending`, color: 'var(--accent2)', click: () => onTabChange('loads') },
          { label: 'Fleet Utilization',value: activeLoads.length ? `${Math.round((activeLoads.length/fleetRows.length)*100)}%` : '0%', sub: `${activeLoads.filter(l=>l.driver).length} of ${fleetRows.length} trucks running`, color: 'var(--accent3)', click: () => onTabChange('fleet') },
          { label: 'Avg RPM',          value: avgRPM === '—' ? '—' : `$${avgRPM}`, sub: 'Active loads',        color: 'var(--accent)',  click: () => onTabChange('financials') },
        ].map(s => (
          <div key={s.label} onClick={s.click} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center', cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(240,165,0,0.03)' }}
            onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface)' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 5 }}>{s.label}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: s.color, lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontSize: 10, color: 'var(--success)', marginTop: 4 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* Pipeline summary bar */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <div style={{ fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Layers} size={14} /> Load Pipeline</div>
          <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => onTabChange('loads')}>Open Pipeline →</button>
        </div>
        <div style={{ display:'flex', gap:4 }}>
          {[
            { label:'Booked', statuses:['Rate Con Received','Booked'], color:'var(--accent)' },
            { label:'Dispatched', statuses:['Assigned to Driver','En Route to Pickup'], color:'var(--accent3)' },
            { label:'In Transit', statuses:['Loaded','In Transit','At Pickup','At Delivery'], color:'var(--success)' },
            { label:'Delivered', statuses:['Delivered'], color:'var(--accent2)' },
            { label:'Invoiced', statuses:['Invoiced'], color:'var(--accent3)' },
            { label:'Paid', statuses:['Paid'], color:'var(--success)' },
          ].map(col => {
            const count = loads.filter(l => col.statuses.includes(l.status)).length
            const total = loads.length || 1
            return (
              <div key={col.label} onClick={() => onTabChange('loads')}
                style={{ flex:1, cursor:'pointer', textAlign:'center', padding:'8px 4px', borderRadius:8, background:'var(--surface2)', border:'1px solid var(--border)', transition:'all 0.12s' }}
                onMouseOver={e => { e.currentTarget.style.borderColor=col.color; e.currentTarget.style.background=col.color+'08' }}
                onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='var(--surface2)' }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:col.color, lineHeight:1 }}>{count}</div>
                <div style={{ fontSize:9, color:'var(--muted)', marginTop:3, fontWeight:600 }}>{col.label}</div>
                <div style={{ height:3, background:'var(--border)', borderRadius:2, marginTop:6, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${Math.min((count/total)*100, 100)}%`, background:col.color, borderRadius:2 }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Middle row: Loads + Fleet */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>

        {/* Active Loads */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 13, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Package} size={14} /> Active Loads</div>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => onTabChange('loads')}>View all →</button>
          </div>
          {activeLoads.length === 0 ? (
            <div style={{ padding:32, textAlign:'center' }}>
              <div style={{ width:44, height:44, borderRadius:10, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
                <Ic icon={Package} size={20} color="var(--accent)" />
              </div>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>No active loads</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>Book a load from the AI Load Board or drop a rate con to get started.</div>
              <button className="btn btn-primary" style={{ fontSize:11 }} onClick={() => onTabChange('load-board')}>Open Load Board →</button>
            </div>
          ) : activeLoads.map(load => {
            const statusColor = STATUS_DOT[load.status] || 'var(--muted)'
            const route = load.origin && load.dest ? load.origin.split(',')[0].substring(0,3).toUpperCase() + ' → ' + load.dest.split(',')[0].substring(0,3).toUpperCase() : '—'
            const pickup = load.pickup ? load.pickup.split(' · ')[0] : '—'
            const rpm = load.rate || '—'
            return (
            <div key={load.loadId} style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12 }}
              onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
              onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
              <div style={{ minWidth: 58 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: 'monospace' }}>{load.loadId}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{pickup}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{route}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{load.broker} · {load.driver}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--accent)' }}>${(load.gross || 0).toLocaleString()}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>${rpm}/mi</div>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 8, background: statusColor + '18', color: statusColor, whiteSpace: 'nowrap' }}>{load.status}</span>
            </div>
          )})}
        </div>

        {/* Fleet Status */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 13, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Truck} size={14} /> Fleet Status</div>
            <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => onTabChange('fleet')}>Live Map →</button>
          </div>
          {fleetRows.length === 0 ? (
            <div style={{ padding:32, textAlign:'center' }}>
              <div style={{ width:44, height:44, borderRadius:10, background:'rgba(0,212,170,0.08)', border:'1px solid rgba(0,212,170,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
                <Ic icon={Truck} size={20} color="var(--success)" />
              </div>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:4 }}>No fleet added</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>Add drivers and vehicles in the Fleet tab to see fleet status here.</div>
              <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => onTabChange('fleet')}>Set Up Fleet →</button>
            </div>
          ) : fleetRows.map(t => (
            <div key={t.unit} style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: t.statusC, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{t.unit}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: t.statusC }}>{t.status}</span>
                    {t.alert && <span style={{ fontSize: 10, color: 'var(--warning)' }}>{t.alert}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.driver} · HOS {t.hos}</div>
                </div>
              </div>
              {t.load !== '—' && <div style={{ padding: '5px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 8 }}>
                <span style={{ color: 'var(--accent)', fontFamily: 'monospace', fontWeight: 700 }}>{t.load}</span>
                <span>{t.route}</span>
              </div>}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom row: Alerts + Activity */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 16 }}>

        {/* Compliance & AI Alerts */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 13, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Zap} size={14} /> Alerts & Actions</div>
            {dismissed.length < OV_ALERTS.length && <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setDismissed(OV_ALERTS.map((_,i)=>i))}>Clear all</button>}
          </div>
          {alerts.length === 0
            ? <div style={{ padding: 28, textAlign: 'center', color: 'var(--success)', fontSize: 13, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><Ic icon={CheckCircle} size={14} color="var(--success)" /> All clear — no alerts today</div>
            : alerts.map((a, i) => (
              <div key={i} style={{ padding: '11px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ flexShrink: 0 }}><Ic icon={a.icon} size={16} color={a.color} /></span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, color: a.color === 'var(--accent)' ? 'var(--text)' : a.color, lineHeight: 1.4 }}>{a.text}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  <button className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 8px', color: a.color }} onClick={() => showToast('', a.action, a.text)}>{a.action}</button>
                  <button onClick={() => setDismissed(d => [...d, OV_ALERTS.indexOf(a)])} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
                </div>
              </div>
            ))
          }
        </div>

        {/* Activity Feed — built from real data */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, display:'flex', alignItems:'center', gap:6 }}><Ic icon={ClipboardList} size={14} /> Recent Activity</div>
          {(() => {
            const activity = [
              ...deliveredLoads.slice(0, 3).map(l => ({
                icon: CheckCircle, color: 'var(--success)',
                text: `${l.loadId} delivered — ${(l.dest || '').split(',')[0]}`,
                time: l.delivery ? l.delivery.split(' · ')[0] : ''
              })),
              ...unpaidInvoices.slice(0, 2).map(i => ({
                icon: FileText, color: 'var(--accent)',
                text: `Invoice ${i.id} · ${i.route || ''} · $${(i.amount || 0).toLocaleString()}`,
                time: i.invoiceDate || ''
              })),
              ...activeLoads.slice(0, 2).map(l => ({
                icon: Package, color: 'var(--accent2)',
                text: `${l.loadId} ${l.status} — ${(l.origin || '').split(',')[0]} → ${(l.dest || '').split(',')[0]}`,
                time: l.pickup ? l.pickup.split(' · ')[0] : ''
              })),
            ].slice(0, 6)
            if (activity.length === 0) return (
              <div style={{ padding:28, textAlign:'center', color:'var(--muted)', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                <Ic icon={ClipboardList} size={14} color="var(--muted)" /> Activity will appear as you book and deliver loads
              </div>
            )
            return activity.map((a, i) => (
              <div key={i} style={{ padding: '10px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: a.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic icon={a.icon} size={14} color={a.color} /></div>
                <div style={{ flex: 1, fontSize: 12, lineHeight: 1.4 }}>{a.text}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>{a.time}</div>
              </div>
            ))
          })()}
        </div>
      </div>

      {/* Quick access */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Zap} size={14} /> Quick Access</div>
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(90px,1fr))', gap: 8 }}>
          {[
            { icon: Package, label:'Loads', nav:'loads' }, { icon: Users, label:'Drivers', nav:'drivers' },
            { icon: Truck, label:'Fleet', nav:'fleet' }, { icon: DollarSign, label:'Financials', nav:'financials' },
            { icon: Shield, label:'Compliance', nav:'compliance' }, { icon: BarChart2, label:'Analytics', nav:'analytics' },
            { icon: Zap, label:'AI Load Board', nav:'load-board' }, { icon: SettingsIcon, label:'Settings', nav:'settings' },
          ].map(m => (
            <div key={m.nav} onClick={() => onTabChange(m.nav)}
              style={{ padding: '10px 8px', background: 'var(--surface2)', borderRadius: 10, cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', border: '1px solid transparent' }}
              onMouseOver={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.background = 'rgba(240,165,0,0.05)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor = 'transparent'; e.currentTarget.style.background = 'var(--surface2)' }}>
              <div style={{ marginBottom: 4, display:'flex', justifyContent:'center' }}><Ic icon={m.icon} size={20} /></div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Billing tab ────────────────────────────────────────────────────────────────
function BillingTab() {
  const { showToast } = useApp()
  const { invoices, vehicles, unpaidInvoices, totalRevenue, totalExpenses } = useCarrier()

  const truckCount = vehicles.length || 3
  const perTruck = 49
  const basePlan = 299
  const totalMonthly = basePlan + (truckCount * perTruck)

  const statusColor = { Unpaid:'var(--warning)', Paid:'var(--success)', Factored:'var(--accent2)', Overdue:'var(--danger)' }

  return (
    <div style={{ padding: 20, paddingBottom: 60, overflowY: 'auto', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Plan summary */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Current Plan</div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.2)' }}>● ACTIVE</span>
        </div>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
          {[
            { label: 'Base Platform', price: `$${basePlan}/mo`, note: 'Unlimited users', color: 'var(--accent)' },
            { label: 'Per Truck', price: `$${perTruck}/truck`, note: `${truckCount} truck${truckCount !== 1 ? 's' : ''} active = $${truckCount * perTruck}/mo`, color: 'var(--accent2)' },
            { label: 'Total Monthly', price: `$${totalMonthly}/mo`, note: 'Next billing: Apr 1', color: 'var(--success)', bold: true },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{item.label}</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: item.color }}>{item.price}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{item.note}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Revenue stats */}
      <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {[
          { label: 'Total Invoices', value: invoices.length, color: 'var(--accent)' },
          { label: 'Unpaid', value: unpaidInvoices.length, color: 'var(--warning)' },
          { label: 'Revenue MTD', value: '$' + totalRevenue.toLocaleString(), color: 'var(--success)' },
          { label: 'Expenses MTD', value: '$' + totalExpenses.toLocaleString(), color: 'var(--danger)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Invoice list */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Invoice History ({invoices.length})</div>
        {invoices.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No invoices yet. Deliver a load to auto-generate one.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
              {['Invoice','Load','Broker','Date','Amount','Status'].map(h => (
                <th key={h} style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {invoices.map(inv => {
                const sc = statusColor[inv.status] || 'var(--muted)'
                return (
                  <tr key={inv.id || inv.invoice_number} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                    onClick={() => showToast('', inv.id || inv.invoice_number, `${inv.broker || '—'} · ${inv.route || ''} · $${(inv.amount || 0).toLocaleString()} · ${inv.status}`)}>
                    <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 700, color: 'var(--accent3)', fontFamily: 'monospace' }}>{inv.id || inv.invoice_number}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12, color: 'var(--muted)' }}>{inv.loadId || inv.load_number || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 12 }}>{inv.broker || '—'}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--muted)', fontSize: 12 }}>{inv.date || '—'}</td>
                    <td style={{ padding: '12px 16px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--accent)' }}>${(inv.amount || 0).toLocaleString()}</td>
                    <td style={{ padding: '12px 16px' }}><span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: sc + '15', color: sc }}>{inv.status}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}


// ── Settings tab ───────────────────────────────────────────────────────────────
function SettingsTab() {
  const { showToast, theme, setTheme } = useApp()
  const { company: ctxCompany, updateCompany } = useCarrier()
  const [company, setCompany] = useState(ctxCompany || { name:'', mc:'', dot:'', address:'', phone:'', email:'', ein:'' })
  const [billing, setBilling] = useState({ factoringRate:'2.5', payDefault:'28%', fastpayEnabled:true, autoInvoice:true })
  const [integrations] = useState([
    { name:'Samsara ELD',      status:'Connected', statusC:'var(--success)', icon: Smartphone, desc:'3 devices active · Last sync 4 min ago' },
    { name:'Comdata Fuel Card', status:'Connected', statusC:'var(--success)', icon: Fuel, desc:'Card ending 4821 · $3,200 available' },
    { name:'QuickBooks Online', status:'Not connected', statusC:'var(--muted)', icon: BarChart2, desc:'Connect to auto-sync expenses & invoices' },
    { name:'DAT Load Board',    status:'Not connected', statusC:'var(--muted)', icon: Truck, desc:'Connect to pull spot rates on your lanes' },
    { name:'FourKites TMS',     status:'Not connected', statusC:'var(--muted)', icon: Map, desc:'Real-time shipment visibility platform' },
  ])
  const [team] = useState([
    { name:'You (Owner)',     email: company.email || '', role:'Admin',    roleC:'var(--accent)' },
  ])
  const [notifPrefs, setNotifPrefs] = useState({ newMatch:true, loadStatus:true, driverAlert:true, payReady:true, compliance:true, marketRates:false })
  const [settingsSec, setSettingsSec] = useState('company')

  const [providerKeys, setProviderKeys] = useState({
    resend_api_key:'', checkr_api_key:'', sambasafety_api_key:'', sambasafety_account_id:'',
    fmcsa_api_key:'', fmcsa_webkey:'', fadv_client_id:'', fadv_client_secret:'',
  })
  const [keysLoaded, setKeysLoaded] = useState(false)

  // Load provider keys from company record
  useEffect(() => {
    if (ctxCompany?.provider_keys) {
      setProviderKeys(prev => ({ ...prev, ...ctxCompany.provider_keys }))
      setKeysLoaded(true)
    }
  }, [ctxCompany])

  const saveProviderKeys = async () => {
    try {
      await updateCompany({ provider_keys: providerKeys })
      showToast('success', 'Keys Saved', 'Provider API keys updated securely')
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to save keys')
    }
  }

  const SECTIONS = [
    { id:'company',        icon: Building2, label:'Company Profile' },
    { id:'billing',        icon: CreditCard, label:'Billing & Pay' },
    { id:'providers',      icon: Shield, label:'Provider Keys' },
    { id:'integrations',   icon: Plug, label:'Integrations' },
    { id:'team',           icon: Users, label:'Team & Access' },
    { id:'notifications',  icon: Bell, label:'Notifications' },
    { id:'appearance',     icon: Palette, label:'Appearance' },
  ]

  const FieldRow = ({ label, value, onChange, type='text' }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <label style={{ fontSize:11, color:'var(--muted)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
    </div>
  )

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>

      {/* Sidebar */}
      <div style={{ width:200, flexShrink:0, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'14px 16px 8px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2 }}>SETTINGS</div>
        </div>
        {SECTIONS.map(s => {
          const isActive = settingsSec === s.id
          return (
            <button key={s.id} onClick={() => setSettingsSec(s.id)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'11px 16px', border:'none', cursor:'pointer', textAlign:'left',
                background: isActive ? 'rgba(240,165,0,0.08)' : 'transparent', borderLeft:`3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                transition:'all 0.15s', fontFamily:"'DM Sans',sans-serif",
                color: isActive ? 'var(--accent)' : 'var(--text)', fontSize:12, fontWeight: isActive ? 700 : 500 }}
              onMouseOver={e => { if(!isActive) e.currentTarget.style.background='rgba(255,255,255,0.03)' }}
              onMouseOut={e => { if(!isActive) e.currentTarget.style.background='transparent' }}>
              <span><Ic icon={s.icon} size={14} /></span>{s.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:24, display:'flex', flexDirection:'column', gap:20 }}>

        {/* Company Profile */}
        {settingsSec === 'company' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>COMPANY PROFILE</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Your carrier identity — used on rate cons, invoices, and FMCSA filings</div>
            </div>

            {/* Logo Upload */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:14 }}>Company Logo</div>
              <div style={{ display:'flex', alignItems:'center', gap:20 }}>
                {/* Preview */}
                <div style={{ width:100, height:100, borderRadius:12, border:'2px dashed var(--border)', background:'var(--surface2)',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, overflow:'hidden', position:'relative' }}>
                  {company.logo
                    ? <img src={company.logo} alt="Company logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                    : (
                      <div style={{ textAlign:'center' }}>
                        <Ic icon={Truck} size={28} color="var(--muted)" />
                        <div style={{ fontSize:9, color:'var(--muted)', marginTop:4 }}>No logo</div>
                      </div>
                    )
                  }
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>
                    {company.logo ? 'Logo uploaded ✓' : 'Upload your company logo'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12, lineHeight:1.6 }}>
                    PNG, JPG, or SVG — max 2 MB<br/>
                    Shown on invoices, rate cons, and sidebar
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <label style={{ padding:'8px 16px', fontSize:12, fontWeight:700, borderRadius:8, background:'var(--accent)', color:'#000',
                      cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'inline-flex', alignItems:'center', gap:6 }}>
                      {company.logo ? 'Replace Logo' : 'Upload Logo'}
                      <input type="file" accept="image/*" style={{ display:'none' }}
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          if (file.size > 2 * 1024 * 1024) { showToast('','File too large','Max 2 MB — try a smaller image'); return }
                          const reader = new FileReader()
                          reader.onload = ev => {
                            setCompany(c => ({ ...c, logo: ev.target.result }))
                            showToast('','Logo Uploaded', file.name + ' — save to apply')
                          }
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                    {company.logo && (
                      <button className="btn btn-ghost" style={{ fontSize:12 }}
                        onClick={() => { setCompany(c => ({ ...c, logo: '' })); showToast('','Logo Removed','Reverted to initials') }}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <FieldRow label="Company Name"   value={company.name}    onChange={v => setCompany(c=>({...c,name:v}))} />
              <FieldRow label="MC Number"      value={company.mc}      onChange={v => setCompany(c=>({...c,mc:v}))} />
              <FieldRow label="DOT Number"     value={company.dot}     onChange={v => setCompany(c=>({...c,dot:v}))} />
              <FieldRow label="EIN"            value={company.ein}     onChange={v => setCompany(c=>({...c,ein:v}))} />
              <FieldRow label="Phone"          value={company.phone}   onChange={v => setCompany(c=>({...c,phone:v}))} />
              <FieldRow label="Email"          value={company.email}   onChange={v => setCompany(c=>({...c,email:v}))} type="email" />
              <div style={{ gridColumn:'1/-1' }}>
                <FieldRow label="Business Address" value={company.address} onChange={v => setCompany(c=>({...c,address:v}))} />
              </div>
            </div>
            <div>
              <button className="btn btn-primary" style={{ padding:'11px 28px' }} onClick={() => { updateCompany(company); showToast('','Saved','Company profile updated') }}>Save Changes</button>
            </div>
          </>
        )}

        {/* Billing & Pay */}
        {settingsSec === 'billing' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>BILLING & PAY SETTINGS</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Factoring rate, default driver pay model, and invoice automation</div>
            </div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Factoring Rate (%)</label>
                  <input type="number" value={billing.factoringRate} onChange={e => setBilling(b=>({...b,factoringRate:e.target.value}))} min="0" max="10" step="0.1"
                    style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", width:'100%', boxSizing:'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Default Driver Pay %</label>
                  <input type="text" value={billing.payDefault} onChange={e => setBilling(b=>({...b,payDefault:e.target.value}))}
                    style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", width:'100%', boxSizing:'border-box' }} />
                </div>
              </div>
              {[
                { key:'fastpayEnabled', label:'FastPay Enabled', sub:'Allow drivers to request same-day pay advances' },
                { key:'autoInvoice',    label:'Auto-Generate Invoices', sub:'Automatically create invoice when load is delivered' },
              ].map(opt => (
                <div key={opt.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'var(--surface2)', borderRadius:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{opt.sub}</div>
                  </div>
                  <div onClick={() => setBilling(b=>({...b,[opt.key]:!b[opt.key]}))}
                    style={{ width:44, height:24, borderRadius:12, background: billing[opt.key] ? 'var(--accent)' : 'var(--border)', cursor:'pointer', position:'relative', transition:'all 0.2s' }}>
                    <div style={{ position:'absolute', top:3, left: billing[opt.key] ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'all 0.2s' }}/>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ padding:'11px 28px', width:'fit-content' }} onClick={() => showToast('','Saved','Billing settings updated')}>Save Changes</button>
          </>
        )}

        {/* Provider Keys */}
        {settingsSec === 'providers' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>PROVIDER API KEYS</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Connect your screening providers to automate driver onboarding checks</div>
            </div>

            <div style={{ background:'rgba(77,142,240,0.06)', border:'1px solid rgba(77,142,240,0.15)', borderRadius:10, padding:'14px 18px', fontSize:12, color:'var(--accent3)', lineHeight:1.6 }}>
              <strong>How it works:</strong> Your API keys are stored securely in your company record (encrypted, RLS-protected). When you add a new driver, Qivori automatically orders checks through your provider accounts. <strong>You only pay the providers directly — Qivori charges nothing extra.</strong>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14, width:'100%' }}>
              {[
                { section: 'Email (Consent Forms)', keys: [
                  { key:'resend_api_key', label:'Resend API Key', ph:'re_xxxxxxxx', link:'https://resend.com', note:'Free: 100 emails/day — sends consent forms to new drivers' },
                ]},
                { section: 'Background & Employment', keys: [
                  { key:'checkr_api_key', label:'Checkr API Key', ph:'xxxxxxxxxxxxxxxx', link:'https://checkr.com', note:'Background checks + 3-year employment verification' },
                ]},
                { section: 'Motor Vehicle Record (MVR)', keys: [
                  { key:'sambasafety_api_key', label:'SambaSafety API Key', ph:'xxxxxxxxxxxxxxxx', link:'https://sambasafety.com', note:'Instant MVR pulls from all 50 states' },
                  { key:'sambasafety_account_id', label:'SambaSafety Account ID', ph:'ACC-xxxxx' },
                ]},
                { section: 'FMCSA (Clearinghouse + PSP + CDL)', keys: [
                  { key:'fmcsa_api_key', label:'FMCSA Clearinghouse API Key', ph:'xxxxxxxxxxxxxxxx', link:'https://clearinghouse.fmcsa.dot.gov', note:'Drug & alcohol violation queries ($1.25/query)' },
                  { key:'fmcsa_webkey', label:'FMCSA WebKey (PSP)', ph:'xxxxxxxxxxxxxxxx', link:'https://www.psp.fmcsa.dot.gov', note:'Safety reports + CDL verification ($10/report)' },
                ]},
                { section: 'Drug & Alcohol Testing', keys: [
                  { key:'fadv_client_id', label:'First Advantage Client ID', ph:'xxxxxxxxxxxxxxxx', link:'https://fadv.com', note:'DOT 5-panel drug & alcohol screening' },
                  { key:'fadv_client_secret', label:'First Advantage Client Secret', ph:'xxxxxxxxxxxxxxxx' },
                ]},
              ].map(group => (
                <div key={group.section} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', width:'100%' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{group.section}</div>
                    {group.keys.every(k => providerKeys[k.key]) && (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(34,197,94,0.1)', color:'var(--success)' }}>Connected</span>
                    )}
                    {group.keys.every(k => !providerKeys[k.key]) && (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(74,85,112,0.15)', color:'var(--muted)' }}>Not set</span>
                    )}
                  </div>
                  <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
                    {group.keys.map(k => (
                      <div key={k.key}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                          <label style={{ fontSize:11, color:'var(--muted)' }}>{k.label}</label>
                          {k.link && <a href={k.link} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, color:'var(--accent3)', textDecoration:'none' }}>Sign up →</a>}
                        </div>
                        <input
                          type="password"
                          value={providerKeys[k.key]}
                          onChange={e => setProviderKeys(p => ({ ...p, [k.key]: e.target.value }))}
                          placeholder={k.ph}
                          style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }}
                        />
                        {k.note && <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{k.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <button className="btn btn-primary" style={{ alignSelf:'flex-start', padding:'12px 32px', fontSize:13, fontWeight:700 }} onClick={saveProviderKeys}>
                Save Provider Keys
              </button>
            </div>
          </>
        )}

        {/* Integrations */}
        {settingsSec === 'integrations' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>INTEGRATIONS</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Connect your ELD, fuel card, accounting, and load board</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {integrations.map(int => (
                <div key={int.name} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:44, height:44, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ic icon={int.icon} size={22} /></div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:3 }}>
                      <span style={{ fontSize:14, fontWeight:700 }}>{int.name}</span>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:int.statusC+'15', color:int.statusC }}>{int.status}</span>
                    </div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>{int.desc}</div>
                  </div>
                  <button className={int.status === 'Connected' ? 'btn btn-ghost' : 'btn btn-primary'} style={{ fontSize:11 }}
                    onClick={() => showToast('', int.status === 'Connected' ? 'Disconnect' : 'Connect', int.name)}>
                    {int.status === 'Connected' ? 'Manage' : '+ Connect'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Team */}
        {settingsSec === 'team' && (
          <>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>TEAM & ACCESS</div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>Manage who can access Qivori and what they can do</div>
              </div>
              <button className="btn btn-primary" style={{ fontSize:12 }} onClick={() => showToast('','Invite','Team invitation sent!')}>+ Invite Member</button>
            </div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead><tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
                  {['Name','Email','Role','Actions'].map(h => <th key={h} style={{ padding:'10px 18px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1 }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {team.map(m => (
                    <tr key={m.email} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'14px 18px', fontSize:13, fontWeight:700 }}>{m.name}</td>
                      <td style={{ padding:'14px 18px', fontSize:12, color:'var(--muted)' }}>{m.email}</td>
                      <td style={{ padding:'14px 18px' }}><span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:m.roleC+'15', color:m.roleC }}>{m.role}</span></td>
                      <td style={{ padding:'14px 18px' }}>
                        {m.role !== 'Admin' && <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast('','Edit',m.name + ' permissions')}>Edit</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Notifications */}
        {settingsSec === 'notifications' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>NOTIFICATION PREFERENCES</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Choose what alerts appear in your notification bell and email</div>
            </div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              {[
                { key:'newMatch',    label:'AI Load Matches',      sub:'When AI finds a high-score load on your lanes' },
                { key:'loadStatus',  label:'Load Status Changes',  sub:'Pickup confirmed, delivered, exceptions' },
                { key:'driverAlert', label:'Driver Alerts',        sub:'HOS violations, CDL expiry, inspection due' },
                { key:'payReady',    label:'Payment Ready',        sub:'FastPay available, invoice paid, factoring funded' },
                { key:'compliance',  label:'Compliance Warnings',  sub:'Registration, insurance, DOT inspection due' },
                { key:'marketRates', label:'Market Rate Alerts',   sub:'When rates spike 10%+ on your active lanes' },
              ].map((opt, i, arr) => (
                <div key={opt.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 20px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{opt.sub}</div>
                  </div>
                  <div onClick={() => setNotifPrefs(p=>({...p,[opt.key]:!p[opt.key]}))}
                    style={{ width:44, height:24, borderRadius:12, background: notifPrefs[opt.key] ? 'var(--accent)' : 'var(--border)', cursor:'pointer', position:'relative', transition:'all 0.2s', flexShrink:0 }}>
                    <div style={{ position:'absolute', top:3, left: notifPrefs[opt.key] ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'all 0.2s' }}/>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ padding:'11px 28px', width:'fit-content' }} onClick={() => showToast('','Saved','Notification preferences saved')}>Save Preferences</button>
          </>
        )}

        {/* Appearance */}
        {settingsSec === 'appearance' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>APPEARANCE & ACCESSIBILITY</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Customize how Qivori looks — including colorblind-safe modes</div>
            </div>

            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Palette} size={14} /> Color Theme</div>
              <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  {
                    id: 'default',
                    label: 'Default Dark',
                    sub: 'The classic Qivori dark theme — gold accents, deep navy background',
                    icon: Moon,
                    preview: ['#07090e','#f0a500','#22c55e','#ef4444'],
                  },
                  {
                    id: 'colorblind',
                    label: 'Colorblind Mode',
                    sub: 'Okabe-Ito palette — designed for deuteranopia & protanopia. Replaces red/green with orange/blue.',
                    icon: Eye,
                    badge: 'RECOMMENDED',
                    preview: ['#07090e','#f0a500','#0072b2','#d55e00'],
                  },
                  {
                    id: 'high-contrast',
                    label: 'High Contrast',
                    sub: 'Pure black background, bold borders, brighter text — ideal for bright sunlight in cab or low-vision users',
                    icon: Zap,
                    preview: ['#000000','#ffc200','#00e676','#ff5252'],
                  },
                ].map(t => {
                  const isActive = theme === t.id
                  return (
                    <div key={t.id} onClick={() => { setTheme(t.id); showToast('', t.label + ' activated', t.sub.split(' — ')[0]) }}
                      style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 16px', borderRadius:10, cursor:'pointer',
                        background: isActive ? 'rgba(240,165,0,0.07)' : 'var(--surface2)',
                        border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                        transition:'all 0.15s' }}>
                      <span style={{ flexShrink:0 }}><Ic icon={t.icon} size={22} /></span>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:13, fontWeight:700, color: isActive ? 'var(--accent)' : 'var(--text)' }}>{t.label}</span>
                          {t.badge && <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:'rgba(240,165,0,0.15)', color:'var(--accent)', letterSpacing:1 }}>{t.badge}</span>}
                          {isActive && <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:'rgba(34,197,94,0.15)', color:'var(--success)', letterSpacing:1 }}>ACTIVE</span>}
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.5 }}>{t.sub}</div>
                      </div>
                      {/* Color swatches */}
                      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                        {t.preview.map((c, i) => (
                          <div key={i} style={{ width:16, height:16, borderRadius:'50%', background:c, border:'1px solid rgba(255,255,255,0.1)' }}/>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:12, padding:'14px 18px' }}>
              <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.7 }}>
                <strong style={{ color:'var(--text)' }}>Why this matters:</strong> ~8% of men have red-green colorblindness — in a male-dominated industry like trucking, that's roughly 1 in 12 dispatchers or drivers. Colorblind mode ensures critical alerts (overdue, high-score loads, danger zones) are always distinguishable regardless of color vision.
              </div>
            </div>
          </>
        )}


      </div>
    </div>
  )
}

// ── Profit IQ tab ──────────────────────────────────────────────────────────────
// ── PROFIT IQ ─────────────────────────────────────────────────────────────────
const PIQ_TABS = ['Overview', 'Per Load', 'By Driver', 'By Broker']

function ProfitIQTab() {
  const { loads, expenses, totalRevenue, totalExpenses, drivers: ctxDrivers } = useCarrier()
  const [tab, setTab] = useState('Overview')

  // ── computed base data ──────────────────────────────────────────────────────
  const completedLoads = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced')
  const activeLoads    = loads.filter(l => !['Delivered','Invoiced'].includes(l.status))

  // Per-load profit: gross minus estimated driver pay (28%) and fuel ($0.22/mi)
  const loadProfit = completedLoads.map(l => {
    const gross      = l.gross || 0
    const miles      = parseFloat(l.miles) || 0
    const driverPay  = Math.round(gross * 0.28)
    const fuelCost   = Math.round(miles * 0.22)
    const net        = gross - driverPay - fuelCost
    const margin     = gross > 0 ? ((net / gross) * 100).toFixed(1) : '0.0'
    const rpm        = parseFloat(l.rate) || (miles > 0 ? gross / miles : 0)
    return { ...l, driverPay, fuelCost, net, margin: parseFloat(margin), rpm }
  }).sort((a,b) => b.net - a.net)

  // Expense breakdown from real context
  const expCats = ['Fuel','Driver Pay','Insurance','Maintenance','Tolls','Lumper','Permits','Other']
  const catColors = { Fuel:'var(--warning)', 'Driver Pay':'var(--accent)', Insurance:'var(--accent2)', Maintenance:'var(--danger)', Tolls:'var(--accent3)', Lumper:'var(--success)', Permits:'var(--muted)', Other:'var(--muted)' }
  const realFuel = expenses.filter(e => e.cat === 'Fuel').reduce((s,e) => s + e.amount, 0)
  const estimatedDriverPay = completedLoads.reduce((s,l) => s + Math.round((l.gross||0)*0.28), 0)
  const otherExpenses = expenses.filter(e => e.cat !== 'Fuel')
  const otherTotal = otherExpenses.reduce((s,e) => s + e.amount, 0)
  const totalForBreakdown = realFuel + estimatedDriverPay + otherTotal || 1
  const expBreakdown = [
    { label:'Driver Pay',  amount: estimatedDriverPay, color:'var(--accent)' },
    { label:'Fuel',        amount: realFuel, color:'var(--warning)' },
    ...['Maintenance','Insurance','Tolls','Lumper','Permits'].map(cat => ({
      label: cat,
      amount: expenses.filter(e=>e.cat===cat).reduce((s,e)=>s+e.amount,0),
      color: catColors[cat] || 'var(--muted)',
    })).filter(x => x.amount > 0),
  ].map(x => ({ ...x, pct: Math.round((x.amount/totalForBreakdown)*100) }))

  // Per driver
  const drivers = [...new Set(completedLoads.map(l => l.driver).filter(Boolean))]
  const driverStats = drivers.map(name => {
    const dLoads  = loadProfit.filter(l => l.driver === name)
    const gross   = dLoads.reduce((s,l) => s + l.gross, 0)
    const net     = dLoads.reduce((s,l) => s + l.net, 0)
    const miles   = dLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)
    const avgRPM  = miles > 0 ? (gross/miles).toFixed(2) : '—'
    const margin  = gross > 0 ? ((net/gross)*100).toFixed(1) : '0.0'
    return { name, loads: dLoads.length, gross, net, miles, avgRPM, margin: parseFloat(margin) }
  }).sort((a,b) => b.net - a.net)

  // Per broker
  const brokers = [...new Set(completedLoads.map(l => l.broker).filter(Boolean))]
  const brokerStats = brokers.map(name => {
    const bLoads   = loadProfit.filter(l => l.broker === name)
    const gross    = bLoads.reduce((s,l) => s + l.gross, 0)
    const net      = bLoads.reduce((s,l) => s + l.net, 0)
    const miles    = bLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)
    const avgRPM   = miles > 0 ? (gross/miles).toFixed(2) : '—'
    const avgLoad  = bLoads.length > 0 ? Math.round(gross/bLoads.length) : 0
    return { name, loads: bLoads.length, gross, net, avgRPM, avgLoad, margin: gross>0?((net/gross)*100).toFixed(1):'0.0' }
  }).sort((a,b) => b.gross - a.gross)

  // Historical months for chart (generate from current month going back 6)
  const histMonths  = (() => {
    const m = []; const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      m.push(d.toLocaleDateString('en-US', { month:'short' }))
    }
    return m
  })()
  const histRev     = histMonths.map((_, i) => i < 5 ? 0 : totalRevenue)
  const histExp     = histMonths.map((_, i) => i < 5 ? 0 : totalExpenses)
  // Fill earlier months from loads data
  ;(() => {
    const now = new Date()
    loads.forEach(l => {
      const dateStr = l.pickup_date || l.pickupDate || l.delivery_date || l.created_at
      if (!dateStr) return
      const d = new Date(dateStr)
      if (isNaN(d)) return
      const diffMonths = (now.getFullYear()-d.getFullYear())*12 + now.getMonth()-d.getMonth()
      const idx = 5 - diffMonths
      if (idx >= 0 && idx < 5) histRev[idx] += Number(l.gross || l.gross_pay || 0)
    })
    expenses.forEach(e => {
      const d = new Date(e.date)
      if (isNaN(d)) return
      const diffMonths = (now.getFullYear()-d.getFullYear())*12 + now.getMonth()-d.getMonth()
      const idx = 5 - diffMonths
      if (idx >= 0 && idx < 5) histExp[idx] += Number(e.amount || 0)
    })
  })()
  const histNet     = histRev.map((r,i) => r - histExp[i])
  const maxBar      = Math.max(...histRev, 1)

  const netProfit   = totalRevenue - totalExpenses
  const margin      = totalRevenue > 0 ? ((netProfit/totalRevenue)*100).toFixed(1) : '0.0'
  const totalMiles  = completedLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)
  const cpm         = totalMiles > 0 ? (totalExpenses/totalMiles).toFixed(2) : '—'
  const truckCt     = Math.max((ctxDrivers || []).length || 1, 1)
  const revPerTruck = Math.round(totalRevenue / truckCt)
  const breakEven   = Math.round(totalExpenses * 0.8) || 10000

  const statBg  = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px', textAlign:'center' }
  const valStyle= (color, size=26) => ({ fontFamily:"'Bebas Neue',sans-serif", fontSize:size, color, lineHeight:1.1 })

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>

      {/* Sub-tab bar */}
      <div style={{ flexShrink:0, background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'0 20px', display:'flex', alignItems:'center', gap:2 }}>
        {PIQ_TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding:'11px 18px', border:'none', borderBottom: tab===t ? '2px solid var(--accent)' : '2px solid transparent', background:'transparent', color: tab===t ? 'var(--accent)' : 'var(--muted)', fontSize:13, fontWeight: tab===t ? 700 : 500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:-1 }}>
            {t}
          </button>
        ))}
        <div style={{ flex:1 }} />
        <div style={{ fontSize:11, color:'var(--muted)', padding:'0 8px' }}>
          {completedLoads.length} completed loads · ${totalRevenue.toLocaleString()} MTD
        </div>
      </div>

      <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>

        {/* ── OVERVIEW ── */}
        {tab === 'Overview' && (<>
          {/* KPIs */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))', gap:12 }}>
            {[
              { label:'Gross Revenue MTD', value:'$'+totalRevenue.toLocaleString(), color:'var(--accent)' },
              { label:'Total Expenses MTD', value:'$'+totalExpenses.toLocaleString(), color:'var(--danger)' },
              { label:'Net Profit MTD', value:'$'+netProfit.toLocaleString(), color:'var(--success)', big:true },
              { label:'Profit Margin', value:margin+'%', color: parseFloat(margin)>=30?'var(--success)':parseFloat(margin)>=20?'var(--warning)':'var(--danger)' },
              { label:'Cost Per Mile', value: cpm==='—'?'—':'$'+cpm, color:'var(--accent2)' },
            ].map(s => (
              <div key={s.label} style={statBg}>
                <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                <div style={valStyle(s.color, s.big?32:24)}>{s.value}</div>
              </div>
            ))}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:16 }}>
            {/* P&L Bar Chart */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={BarChart2} size={14} /> 6-Month P&L</div>
                <div style={{ display:'flex', gap:14 }}>
                  {[{c:'var(--accent)',l:'Revenue'},{c:'var(--danger)',l:'Expenses'},{c:'var(--success)',l:'Net'}].map(x=>(
                    <div key={x.l} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'var(--muted)' }}>
                      <div style={{ width:8,height:8,borderRadius:2,background:x.c }}/>
                      {x.l}
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ padding:'16px 20px 8px' }}>
                <div style={{ display:'flex', alignItems:'flex-end', gap:10, height:140 }}>
                  {histMonths.map((m,i) => {
                    const isCurrent = i === histMonths.length - 1
                    return (
                      <div key={m} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                        <div style={{ width:'100%', display:'flex', gap:2, alignItems:'flex-end', height:120, justifyContent:'center' }}>
                          <div style={{ width:'30%', height:`${(histRev[i]/maxBar)*120}px`, background:'var(--accent)', borderRadius:'3px 3px 0 0', opacity: isCurrent?1:0.55 }} title={`$${histRev[i].toLocaleString()}`}/>
                          <div style={{ width:'30%', height:`${(histExp[i]/maxBar)*120}px`, background:'var(--danger)', borderRadius:'3px 3px 0 0', opacity: isCurrent?1:0.55 }} title={`$${histExp[i].toLocaleString()}`}/>
                          <div style={{ width:'30%', height:`${(Math.max(histNet[i],0)/maxBar)*120}px`, background:'var(--success)', borderRadius:'3px 3px 0 0' }} title={`$${histNet[i].toLocaleString()}`}/>
                        </div>
                        <div style={{ fontSize:10, color: isCurrent?'var(--accent)':'var(--muted)', fontWeight: isCurrent?700:400 }}>{m}</div>
                        {isCurrent && <div style={{ fontSize:9, color:'var(--accent)', fontWeight:700 }}>LIVE</div>}
                      </div>
                    )
                  })}
                </div>
                {/* Value labels */}
                <div style={{ display:'flex', gap:10, paddingTop:8, borderTop:'1px solid var(--border)', marginTop:4 }}>
                  {histMonths.map((m,i) => (
                    <div key={m} style={{ flex:1, textAlign:'center' }}>
                      <div style={{ fontSize:9, color:'var(--success)', fontWeight:700 }}>${(histNet[i]/1000).toFixed(1)}K</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Expense Mix — real from context */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={DollarSign} size={14} /> Expense Mix</div>
              <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
                {expBreakdown.length === 0
                  ? <div style={{ color:'var(--muted)', fontSize:12, padding:'8px 0' }}>No expenses logged yet</div>
                  : expBreakdown.map(e => (
                    <div key={e.label}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:3 }}>
                        <span style={{ color:'var(--muted)' }}>{e.label}</span>
                        <span style={{ fontWeight:700 }}>${e.amount.toLocaleString()} <span style={{ color:'var(--muted)', fontWeight:400 }}>({e.pct}%)</span></span>
                      </div>
                      <div style={{ height:5, background:'var(--border)', borderRadius:3 }}>
                        <div style={{ height:'100%', width:`${e.pct}%`, background:e.color, borderRadius:3, transition:'width 0.5s' }}/>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>
          </div>

          {/* Bottom stat row */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
            {[
              { icon: Scale, label:'Break-Even Point', value:`$${breakEven.toLocaleString()}/mo`, sub:'Fixed cost floor', color:'var(--accent)' },
              { icon: Truck, label:'Revenue per Truck', value:`$${revPerTruck.toLocaleString()}`, sub:'3-truck fleet avg', color:'var(--accent2)' },
              { icon: Package, label:'Loads Completed', value:String(completedLoads.length), sub:`${activeLoads.length} active now`, color:'var(--success)' },
              { icon: MapPin, label:'Total Miles Run', value:totalMiles.toLocaleString(), sub:'Completed loads only', color:'var(--warning)' },
            ].map(s => (
              <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px', display:'flex', gap:12, alignItems:'center' }}>
                <span><Ic icon={s.icon} size={22} color={s.color} /></span>
                <div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{s.label}</div>
                  <div style={valStyle(s.color, 22)}>{s.value}</div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>{s.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </>)}

        {/* ── PER LOAD ── */}
        {tab === 'Per Load' && (<>
          {/* Top 3 summary */}
          {loadProfit.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12 }}>
              {[
                { label:'Best Load', load: loadProfit[0], color:'var(--success)' },
                { label:'Avg Net Profit', load: null, avg: loadProfit.length ? Math.round(loadProfit.reduce((s,l)=>s+l.net,0)/loadProfit.length) : 0, color:'var(--accent)' },
                { label:'Worst Load', load: loadProfit[loadProfit.length-1], color:'var(--danger)' },
              ].map(s => (
                <div key={s.label} style={statBg}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                  {s.load
                    ? <>
                        <div style={valStyle(s.color, 22)}>${s.load.net.toLocaleString()}</div>
                        <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{s.load.loadId} · {s.load.broker}</div>
                      </>
                    : <div style={valStyle(s.color, 22)}>${s.avg.toLocaleString()}</div>
                  }
                </div>
              ))}
            </div>
          )}

          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Package} size={14} /> Load Profitability — Ranked by Net</div>
              <span style={{ fontSize:11, color:'var(--muted)' }}>{loadProfit.length} completed loads</span>
            </div>
            {loadProfit.length === 0
              ? <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No completed loads yet — mark loads as Delivered to see profitability.</div>
              : <>
                  <div style={{ display:'grid', gridTemplateColumns:'80px 1fr 90px 80px 80px 80px 80px 80px', padding:'8px 18px', borderBottom:'1px solid var(--border)', gap:8 }}>
                    {['Load ID','Route / Broker','Driver','Gross','Driver Pay','Fuel Est','Net','Margin'].map(h => (
                      <div key={h} style={{ fontSize:9, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>{h}</div>
                    ))}
                  </div>
                  {loadProfit.map((l, i) => {
                    const mc = l.margin >= 35 ? 'var(--success)' : l.margin >= 25 ? 'var(--accent)' : l.margin >= 15 ? 'var(--warning)' : 'var(--danger)'
                    const route = l.origin && l.dest ? l.origin.split(',')[0].substring(0,3).toUpperCase() + ' → ' + l.dest.split(',')[0].substring(0,3).toUpperCase() : l.loadId
                    return (
                      <div key={l.loadId} style={{ display:'grid', gridTemplateColumns:'80px 1fr 90px 80px 80px 80px 80px 80px', padding:'12px 18px', borderBottom:'1px solid var(--border)', gap:8, alignItems:'center', background: i===0 ? 'rgba(34,197,94,0.03)' : 'transparent' }}>
                        <div style={{ fontFamily:'monospace', fontSize:11, fontWeight:700, color:'var(--accent)' }}>{l.loadId}</div>
                        <div>
                          <div style={{ fontSize:12, fontWeight:700, marginBottom:2 }}>{route}</div>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>{l.broker} · {l.miles}mi · ${parseFloat(l.rate||0).toFixed(2)}/mi</div>
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{l.driver || '—'}</div>
                        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--accent)' }}>${l.gross.toLocaleString()}</div>
                        <div style={{ fontSize:12, color:'var(--danger)' }}>−${l.driverPay.toLocaleString()}</div>
                        <div style={{ fontSize:12, color:'var(--warning)' }}>−${l.fuelCost.toLocaleString()}</div>
                        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--success)' }}>${l.net.toLocaleString()}</div>
                        <div>
                          <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:8, background:mc+'18', color:mc }}>{l.margin}%</span>
                        </div>
                      </div>
                    )
                  })}
                </>
            }
          </div>
        </>)}

        {/* ── BY DRIVER ── */}
        {tab === 'By Driver' && (<>
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.max(driverStats.length,1)},1fr)`, gap:12 }}>
            {driverStats.length === 0
              ? <div style={{ ...statBg, color:'var(--muted)', fontSize:13 }}>No completed loads yet</div>
              : driverStats.map((d,i) => (
                <div key={d.name} style={{ background:'var(--surface)', border:`1px solid ${i===0?'rgba(34,197,94,0.35)':'var(--border)'}`, borderRadius:12, padding:18 }}>
                  {i===0 && <div style={{ fontSize:9, fontWeight:800, color:'var(--success)', letterSpacing:2, marginBottom:6 }}>TOP PERFORMER</div>}
                  <div style={{ fontSize:15, fontWeight:800, marginBottom:12, display:'flex', alignItems:'center', gap:6 }}><Ic icon={User} size={15} /> {d.name}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {[
                      { label:'Loads',        value: String(d.loads),          color:'var(--accent2)' },
                      { label:'Gross Rev',    value: '$'+d.gross.toLocaleString(), color:'var(--accent)' },
                      { label:'Net Profit',   value: '$'+d.net.toLocaleString(),   color:'var(--success)' },
                      { label:'Avg RPM',      value: '$'+d.avgRPM,             color:'var(--accent3)' },
                      { label:'Miles Run',    value: d.miles.toLocaleString(),  color:'var(--muted)' },
                      { label:'Margin',       value: d.margin+'%',              color: d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)' },
                    ].map(s => (
                      <div key={s.label} style={{ background:'var(--surface2)', borderRadius:8, padding:'10px 12px' }}>
                        <div style={{ fontSize:9, color:'var(--muted)', marginBottom:2, textTransform:'uppercase', letterSpacing:1 }}>{s.label}</div>
                        <div style={valStyle(s.color, 18)}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  {/* Margin bar */}
                  <div style={{ marginTop:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)', marginBottom:4 }}>
                      <span>Profit Margin</span><span style={{ fontWeight:700, color: d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)' }}>{d.margin}%</span>
                    </div>
                    <div style={{ height:6, background:'var(--border)', borderRadius:3 }}>
                      <div style={{ height:'100%', width:`${Math.min(d.margin,60)}%`, background: d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)', borderRadius:3, transition:'width 0.5s' }}/>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>

          {/* Driver efficiency table */}
          {driverStats.length > 0 && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={BarChart2} size={14} /> Driver Comparison</div>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ borderBottom:'1px solid var(--border)' }}>
                    {['Driver','Loads','Total Miles','Gross Revenue','Net Profit','Avg RPM','Margin'].map(h => (
                      <th key={h} style={{ padding:'10px 16px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {driverStats.map(d => (
                    <tr key={d.name} style={{ borderBottom:'1px solid var(--border)' }}>
                      <td style={{ padding:'12px 16px', fontSize:13, fontWeight:700 }}>{d.name}</td>
                      <td style={{ padding:'12px 16px', color:'var(--muted)', fontSize:12 }}>{d.loads}</td>
                      <td style={{ padding:'12px 16px', color:'var(--muted)', fontSize:12 }}>{d.miles.toLocaleString()}</td>
                      <td style={{ padding:'12px 16px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${d.gross.toLocaleString()}</td>
                      <td style={{ padding:'12px 16px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--success)' }}>${d.net.toLocaleString()}</td>
                      <td style={{ padding:'12px 16px', fontSize:12, fontWeight:700, color:'var(--accent2)' }}>${d.avgRPM}</td>
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:8, background:(d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)')+'18', color:d.margin>=30?'var(--success)':d.margin>=20?'var(--warning)':'var(--danger)' }}>{d.margin}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>)}

        {/* ── BY BROKER ── */}
        {tab === 'By Broker' && (<>
          {brokerStats.length === 0
            ? <div style={{ ...statBg, color:'var(--muted)', fontSize:13, textAlign:'center', padding:40 }}>No completed loads yet</div>
            : <>
                {/* Broker cards */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:12 }}>
                  {brokerStats.map((b,i) => {
                    const mc = parseFloat(b.margin)>=30?'var(--success)':parseFloat(b.margin)>=20?'var(--accent)':'var(--warning)'
                    return (
                      <div key={b.name} style={{ background:'var(--surface)', border:`1px solid ${i===0?'rgba(240,165,0,0.35)':'var(--border)'}`, borderRadius:12, padding:18 }}>
                        {i===0 && <div style={{ fontSize:9, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:6 }}>MOST VOLUME</div>}
                        <div style={{ fontSize:14, fontWeight:800, marginBottom:4, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Building2} size={14} /> {b.name}</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:9, color:'var(--muted)' }}>LOADS</div>
                            <div style={valStyle('var(--accent2)',20)}>{b.loads}</div>
                          </div>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:9, color:'var(--muted)' }}>AVG RPM</div>
                            <div style={valStyle('var(--accent)',20)}>${b.avgRPM}</div>
                          </div>
                          <div style={{ textAlign:'center' }}>
                            <div style={{ fontSize:9, color:'var(--muted)' }}>AVG LOAD</div>
                            <div style={valStyle('var(--accent3)',20)}>${b.avgLoad.toLocaleString()}</div>
                          </div>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:4 }}>
                          <span style={{ color:'var(--muted)' }}>Total Gross</span>
                          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${b.gross.toLocaleString()}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, marginBottom:8 }}>
                          <span style={{ color:'var(--muted)' }}>Net Profit</span>
                          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--success)' }}>${b.net.toLocaleString()}</span>
                        </div>
                        <div style={{ height:6, background:'var(--border)', borderRadius:3 }}>
                          <div style={{ height:'100%', width:`${Math.min(parseFloat(b.margin),60)}%`, background:mc, borderRadius:3 }}/>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)', marginTop:4 }}>
                          <span>Net margin</span>
                          <span style={{ fontWeight:700, color:mc }}>{b.margin}%</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Broker table */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={BarChart2} size={14} /> Broker Ranking</div>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ borderBottom:'1px solid var(--border)' }}>
                        {['#','Broker','Loads','Total Gross','Net Profit','Avg RPM','Avg Load','Margin'].map(h => (
                          <th key={h} style={{ padding:'10px 16px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {brokerStats.map((b,i) => (
                        <tr key={b.name} style={{ borderBottom:'1px solid var(--border)', background: i===0?'rgba(240,165,0,0.02)':'transparent' }}>
                          <td style={{ padding:'12px 16px', color:'var(--muted)', fontSize:12 }}>#{i+1}</td>
                          <td style={{ padding:'12px 16px', fontSize:13, fontWeight:700 }}>{b.name}</td>
                          <td style={{ padding:'12px 16px', color:'var(--muted)', fontSize:12 }}>{b.loads}</td>
                          <td style={{ padding:'12px 16px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${b.gross.toLocaleString()}</td>
                          <td style={{ padding:'12px 16px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--success)' }}>${b.net.toLocaleString()}</td>
                          <td style={{ padding:'12px 16px', fontSize:12, fontWeight:700, color:'var(--accent2)' }}>${b.avgRPM}</td>
                          <td style={{ padding:'12px 16px', fontSize:12, color:'var(--muted)' }}>${b.avgLoad.toLocaleString()}</td>
                          <td style={{ padding:'12px 16px' }}>
                            <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:8, background:(parseFloat(b.margin)>=30?'var(--success)':parseFloat(b.margin)>=20?'var(--accent)':'var(--warning)')+'18', color:parseFloat(b.margin)>=30?'var(--success)':parseFloat(b.margin)>=20?'var(--accent)':'var(--warning)' }}>{b.margin}%</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
          }
        </>)}

      </div>
    </div>
  )
}

// ── Dispatch tab ───────────────────────────────────────────────────────────────
const DRIVERS = ['James Tucker', 'Marcus Lee', 'Priya Patel']
const STATUS_FLOW = ['Rate Con Received', 'Assigned to Driver', 'En Route to Pickup', 'Loaded', 'In Transit', 'Delivered', 'Invoiced']
const STATUS_COLORS = {
  'Rate Con Received': 'var(--accent)',
  'Assigned to Driver': 'var(--accent3)',
  'En Route to Pickup': 'var(--accent2)',
  'Loaded': 'var(--accent2)',
  'In Transit': 'var(--success)',
  'Delivered': 'var(--muted)',
  'Invoiced': 'var(--success)',
}

// ── Rate Con parser — calls Claude API via backend ────────────────────────────
async function parseRateConWithAI(file) {
  // Compress image before sending
  let b64, mt
  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Compression timed out')), 15000)
      if ((file.type || '').includes('pdf') || file.name.endsWith('.pdf')) {
        const reader = new FileReader()
        reader.onload = () => { clearTimeout(timeout); resolve({ b64: reader.result.split(',')[1], mt: 'application/pdf' }) }
        reader.onerror = () => { clearTimeout(timeout); reject(new Error('Could not read PDF')) }
        reader.readAsDataURL(file)
        return
      }
      const img = new Image()
      img.onload = () => {
        clearTimeout(timeout)
        const maxW = 800; let w = img.width, h = img.height
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW }
        const c = document.createElement('canvas'); c.width = w; c.height = h
        c.getContext('2d').drawImage(img, 0, 0, w, h)
        resolve({ b64: c.toDataURL('image/jpeg', 0.6).split(',')[1], mt: 'image/jpeg' })
      }
      img.onerror = () => {
        clearTimeout(timeout)
        const reader = new FileReader()
        reader.onload = () => resolve({ b64: reader.result.split(',')[1], mt: file.type || 'image/jpeg' })
        reader.onerror = () => reject(new Error('Could not read file'))
        reader.readAsDataURL(file)
      }
      img.src = URL.createObjectURL(file)
    })
    b64 = result.b64
    mt = result.mt
  } catch (compErr) {
    console.error('[RC] Compression error:', compErr)
    throw compErr
  }

  const res = await fetch('/api/parse-ratecon', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file: b64, mediaType: mt })
  })
  const text = await res.text()
  let data; try { data = JSON.parse(text) } catch { throw new Error('Invalid response: ' + text.slice(0, 100)) }
  if (data.error) throw new Error(data.error)
  return {
    loadId: data.load_number || '',
    broker: data.broker || '',
    brokerPhone: data.broker_phone || '',
    brokerEmail: data.broker_email || '',
    driver: '',
    refNum: data.reference_number || data.po_number || '',
    origin: data.origin || '',
    originAddress: data.origin_address || '',
    originZip: data.origin_zip || '',
    shipperName: data.shipper_name || '',
    shipperPhone: data.shipper_phone || '',
    dest: data.destination || '',
    destAddress: data.destination_address || '',
    destZip: data.destination_zip || '',
    consigneeName: data.consignee_name || '',
    consigneePhone: data.consignee_phone || '',
    rate: data.rate ? String(data.rate) : '',
    miles: data.miles ? String(data.miles) : '',
    weight: data.weight ? String(data.weight) : '',
    commodity: data.commodity || '',
    pickup: data.pickup_date || '',
    pickupTime: data.pickup_time || '',
    delivery: data.delivery_date || '',
    deliveryTime: data.delivery_time || '',
    equipment: data.equipment || '',
    notes: data.notes || '',
    specialInstructions: data.special_instructions || '',
    gross: data.rate ? parseFloat(data.rate) : 0,
  }
}

const DOC_TYPES = ['Rate Con', 'BOL', 'POD', 'Lumper Receipt', 'Scale Ticket', 'Other']
const DOC_ICONS = { 'Rate Con': FileText, 'BOL': ClipboardList, 'POD': CheckCircle, 'Lumper Receipt': Receipt, 'Scale Ticket': Scale, 'Other': FileText }
const DOC_COLORS = { 'Rate Con': 'var(--accent)', 'BOL': 'var(--accent2)', 'POD': 'var(--success)', 'Lumper Receipt': 'var(--accent3)', 'Scale Ticket': 'var(--warning)', 'Other': 'var(--muted)' }

function BookedLoads() {
  const { showToast } = useApp()
  const { loads: bookedLoads, addLoad: ctxAddLoad, updateLoadStatus: ctxUpdateStatus, company } = useCarrier()
  const [loadDocs, setLoadDocs] = useState({
    1: [{ id: 1, name: 'EC-88421-ratecon.pdf', type: 'Rate Con', size: '124 KB', uploadedAt: 'Mar 8', dataUrl: null }],
    2: [{ id: 2, name: 'CL-22910-ratecon.pdf', type: 'Rate Con', size: '98 KB',  uploadedAt: 'Mar 8', dataUrl: null }],
  })
  const [docsOpenId, setDocsOpenId] = useState(null)
  const [uploadingFor, setUploadingFor] = useState(null)
  const [docType, setDocType] = useState('BOL')
  const [showForm, setShowForm] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [form, setForm] = useState({ loadId: '', broker: '', origin: '', dest: '', miles: '', rate: '', pickup: '', delivery: '', weight: '', commodity: '', refNum: '', driver: '', gross: 0 })

  const handleDocUpload = useCallback(async (loadId, file, type) => {
    if (!file) return
    const sizeLabel = file.size > 1024 * 1024 ? (file.size / 1024 / 1024).toFixed(1) + ' MB' : Math.round(file.size / 1024) + ' KB'

    // Upload to Supabase Storage + save to documents table
    try {
      const { uploadFile } = await import('../lib/storage')
      const { createDocument } = await import('../lib/database')
      const uploaded = await uploadFile(file, `loads/${loadId}`)
      const dbDoc = await createDocument({
        load_id: loadId,
        name: file.name,
        type,
        file_url: uploaded.url,
        file_size: file.size,
      })
      const doc = {
        id: dbDoc?.id || Date.now(),
        name: file.name,
        type,
        size: sizeLabel,
        uploadedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        fileUrl: uploaded.url,
      }
      setLoadDocs(d => ({ ...d, [loadId]: [...(d[loadId] || []), doc] }))
      showToast('success', type + ' Uploaded', file.name)
    } catch (err) {
      console.warn('Storage upload failed, saving locally:', err.message)
      // Fallback: save locally with dataUrl
      const reader = new FileReader()
      reader.onload = e => {
        const doc = { id: Date.now(), name: file.name, type, size: sizeLabel, uploadedAt: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), dataUrl: e.target.result }
        setLoadDocs(d => ({ ...d, [loadId]: [...(d[loadId] || []), doc] }))
        showToast('', type + ' Uploaded (local)', file.name)
      }
      reader.readAsDataURL(file)
    }
    setUploadingFor(null)
  }, [showToast])

  const removeDoc = async (loadId, docId) => {
    setLoadDocs(d => ({ ...d, [loadId]: d[loadId].filter(doc => doc.id !== docId) }))
    try {
      const { deleteDocument } = await import('../lib/database')
      await deleteDocument(docId)
    } catch (err) { console.warn('DB delete failed:', err.message) }
    showToast('', 'Document Removed', '')
  }

  const [invoiceLoad, setInvoiceLoad] = useState(null)

  const viewDoc = (doc) => {
    if (doc.fileUrl) {
      window.open(doc.fileUrl, '_blank')
      return
    }
    if (doc.dataUrl) {
      const w = window.open()
      w.document.write(`<iframe src="${doc.dataUrl}" style="width:100%;height:100vh;border:none"></iframe>`)
    } else {
      showToast('', doc.name, 'No preview available for seed documents')
    }
  }

  const handleFile = useCallback(async (file) => {
    if (!file) return
    const isImage = file.type.startsWith('image/')
    const isPDF   = file.type === 'application/pdf'
    const validExt = /\.(pdf|png|jpg|jpeg)$/i
    if (!isPDF && !isImage && !validExt.test(file.name)) { showToast('', 'Unsupported File', 'Drop a PDF or image (photo, scan) of the rate confirmation'); return }
    setParsing(true)
    setShowForm(true)
    showToast('', 'Reading Rate Con', `Compressing ${file.name} (${(file.size/1024).toFixed(0)} KB)...`)
    try {
      const parsed = await parseRateConWithAI(file)
      setForm(parsed)
      const filled = Object.values(parsed).filter(v => v && v !== 0 && v !== '').length
      showToast('', 'Rate Con Parsed', `${filled} fields auto-filled — review and confirm`)
    } catch (e) {
      console.error('Rate con error:', e)
      showToast('', 'Parse Failed', e.message || 'Check your API key and try again')
      setShowForm(false)
    } finally {
      setParsing(false)
    }
  }, [showToast])

  const updateStatus = (loadId, newStatus) => {
    ctxUpdateStatus(loadId, newStatus)
    if (newStatus === 'Delivered') showToast('', 'Invoice Created', 'Load ' + loadId + ' — invoice auto-generated')
    else showToast('', 'Status Updated', newStatus)
  }

  const assignDriver = (loadId, driver) => {
    ctxUpdateStatus(loadId, 'Assigned to Driver')
    showToast('', 'Driver Assigned', driver)
  }

  const addLoad = () => {
    if (!form.origin || !form.dest) { showToast('', 'Missing Fields', 'Origin and destination required'); return }
    const gross = parseFloat(form.rate) || form.gross || 0
    const miles = parseFloat(form.miles) || 0
    const autoId = form.loadId || ('RC-' + Date.now().toString(36).toUpperCase())
    // Map form fields to DB schema
    ctxAddLoad({
      load_id: autoId,
      origin: form.origin,
      destination: form.dest,
      rate: gross,
      broker_name: form.broker || 'Direct',
      carrier_name: form.driver || null,
      equipment: form.equipment || 'Dry Van',
      weight: form.weight || null,
      notes: form.commodity || null,
      pickup_date: form.pickup || null,
      delivery_date: form.delivery || null,
      status: 'Rate Con Received',
      // Keep extra fields for local display
      miles, refNum: form.refNum, rateCon: true,
    })
    setForm({ loadId: '', broker: '', origin: '', dest: '', miles: '', rate: '', pickup: '', delivery: '', weight: '', commodity: '', refNum: '', driver: '', gross: 0 })
    setShowForm(false)
    showToast('', 'Load Added', autoId + ' · ' + form.origin + ' → ' + form.dest)
  }

  return (
    <div style={{ padding: 20, paddingBottom: 60, overflowY: 'auto', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 1 }}>BOOKED LOADS</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>Loads confirmed via rate confirmation — assign drivers and track to invoice</div>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(s => !s)}>
          {showForm ? '✕ Cancel' : '+ Add Rate Con'}
        </button>
      </div>

      {/* Drop Zone */}
      {!showForm && (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
          onClick={() => document.getElementById('ratecon-input').click()}
          style={{ border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer', background: dragOver ? 'rgba(240,165,0,0.04)' : 'transparent', transition: 'all 0.2s' }}>
          <input id="ratecon-input" type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
          <div style={{ marginBottom: 10, display:'flex', justifyContent:'center' }}><Ic icon={FileText} size={36} /></div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6 }}>Drop Rate Confirmation Here</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>PDF or image · AI will auto-fill all fields</div>
        </div>
      )}

      {/* Parsing spinner */}
      {parsing && (
        <div style={{ background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 12, padding: '20px', textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><Ic icon={Zap} size={14} color="var(--accent)" /> Parsing rate confirmation...</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Extracting load details, rates, and dates</div>
        </div>
      )}

      {/* Auto-filled form */}
      {showForm && !parsing && (
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, color: 'var(--accent)', display:'flex', alignItems:'center', gap:6 }}><Ic icon={FileText} size={14} /> Rate Confirmation — Review & Confirm</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" style={{ fontSize: 11 }}
                onClick={() => { document.getElementById('ratecon-input2').click() }}>
                Re-upload
              </button>
              <input id="ratecon-input2" type="file" accept=".pdf,image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files[0])} />
              <button className="btn btn-ghost" style={{ fontSize: 11 }}
                onClick={() => { setShowForm(false); setForm({ loadId:'',broker:'',origin:'',dest:'',miles:'',rate:'',pickup:'',delivery:'',weight:'',commodity:'',refNum:'',driver:'',gross:0 }) }}>
                ✕ Cancel
              </button>
            </div>
          </div>
          {/* Broker / Load Info */}
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 8 }}>LOAD INFO</div>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { key: 'loadId',    label: 'Load / Order #',  ph: 'Auto-generated if empty' },
              { key: 'refNum',    label: 'Reference / PO #', ph: 'Broker ref' },
              { key: 'broker',    label: 'Broker',           ph: 'TQL, Echo, CH Robinson...' },
              { key: 'brokerPhone', label: 'Broker Phone',   ph: '(555) 123-4567' },
              { key: 'brokerEmail', label: 'Broker Email',   ph: 'dispatch@broker.com' },
              { key: 'equipment', label: 'Equipment',        ph: 'Dry Van' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: form[f.key] ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  {form[f.key] ? '+ ' : ''}{f.label}
                </label>
                <input value={form[f.key] || ''} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', background: form[f.key] ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form[f.key] ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>

          {/* Shipper / Origin */}
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--success)', letterSpacing: 1.5, marginBottom: 8 }}>PICKUP / SHIPPER</div>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { key: 'shipperName',   label: 'Shipper Name',    ph: 'Company name' },
              { key: 'shipperPhone',  label: 'Shipper Phone',   ph: '(555) 123-4567' },
              { key: 'origin',        label: 'Origin City, ST', ph: 'Atlanta, GA' },
              { key: 'originAddress', label: 'Street Address',  ph: '123 Warehouse Dr' },
              { key: 'originZip',     label: 'ZIP',             ph: '30301' },
              { key: 'pickup',        label: 'Pickup Date',     ph: '2024-03-10' },
              { key: 'pickupTime',    label: 'Pickup Time',     ph: '08:00 AM' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: form[f.key] ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  {form[f.key] ? '+ ' : ''}{f.label}
                </label>
                <input value={form[f.key] || ''} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', background: form[f.key] ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form[f.key] ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>

          {/* Consignee / Destination */}
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--danger)', letterSpacing: 1.5, marginBottom: 8 }}>DELIVERY / CONSIGNEE</div>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 16 }}>
            {[
              { key: 'consigneeName',  label: 'Consignee Name',    ph: 'Company name' },
              { key: 'consigneePhone', label: 'Consignee Phone',   ph: '(555) 123-4567' },
              { key: 'dest',           label: 'Dest City, ST',     ph: 'Dallas, TX' },
              { key: 'destAddress',    label: 'Street Address',    ph: '456 Distribution Blvd' },
              { key: 'destZip',        label: 'ZIP',               ph: '75201' },
              { key: 'delivery',       label: 'Delivery Date',     ph: '2024-03-12' },
              { key: 'deliveryTime',   label: 'Delivery Time',     ph: '06:00 PM' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: form[f.key] ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  {form[f.key] ? '+ ' : ''}{f.label}
                </label>
                <input value={form[f.key] || ''} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', background: form[f.key] ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form[f.key] ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>

          {/* Rate / Weight / Commodity */}
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 8 }}>RATE & CARGO</div>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 12 }}>
            {[
              { key: 'rate',      label: 'Total Rate ($)', ph: '3500' },
              { key: 'miles',     label: 'Miles',          ph: '674' },
              { key: 'weight',    label: 'Weight (lbs)',   ph: '42000' },
              { key: 'commodity', label: 'Commodity',      ph: 'Auto Parts' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 10, color: form[f.key] ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                  {form[f.key] ? '+ ' : ''}{f.label}
                </label>
                <input value={form[f.key] || ''} onChange={e => setForm(fm => ({ ...fm, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', background: form[f.key] ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${form[f.key] ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
            {/* Notes */}
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 10, color: form.notes || form.specialInstructions ? 'var(--accent2)' : 'var(--muted)', display: 'block', marginBottom: 3 }}>
                {form.notes || form.specialInstructions ? '+ ' : ''}Notes / Special Instructions
              </label>
              <input value={form.notes || form.specialInstructions || ''} onChange={e => setForm(fm => ({ ...fm, notes: e.target.value }))}
                placeholder="Temperature requirements, appointment notes, etc."
                style={{ width: '100%', background: (form.notes || form.specialInstructions) ? 'rgba(0,212,170,0.05)' : 'var(--surface2)', border: `1px solid ${(form.notes || form.specialInstructions) ? 'rgba(0,212,170,0.3)' : 'var(--border)'}`, borderRadius: 6, padding: '7px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
            </div>
          </div>

          {/* Driver */}
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 10, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Assign Driver</label>
            <select value={form.driver} onChange={e => setForm(fm => ({ ...fm, driver: e.target.value }))}
              style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '7px 10px', color: form.driver ? 'var(--text)' : 'var(--muted)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
              <option value="">— Assign later —</option>
              {DRIVERS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          {form.rate && (
            <div style={{ marginBottom: 12, padding: '10px 14px', background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 8, fontSize: 12, display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              <span>Gross: <b style={{ color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18 }}>${parseFloat(form.rate||0).toLocaleString(undefined,{maximumFractionDigits:0})}</b></span>
              {form.miles && <span>RPM: <b style={{ color: 'var(--accent2)' }}>${(parseFloat(form.rate||0) / parseFloat(form.miles||1)).toFixed(2)}</b>/mi</span>}
              {form.miles && <span>Est. Fuel: <b style={{ color: 'var(--danger)' }}>${Math.round(parseFloat(form.miles||0)/6.8*3.89).toLocaleString()}</b></span>}
              {form.miles && <span>Est. Net: <b style={{ color: 'var(--success)' }}>${Math.round(parseFloat(form.rate||0) - parseFloat(form.miles||0)/6.8*3.89 - parseFloat(form.rate||0)*0.28).toLocaleString()}</b></span>}
            </div>
          )}
          <button className="btn btn-primary" style={{ width: '100%', padding: '12px 0', fontSize: 14 }} onClick={addLoad}>
            Confirm & Add Load
          </button>
        </div>
      )}

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {[
          { label: 'Total Booked',   value: bookedLoads.length,                                      color: 'var(--accent)' },
          { label: 'In Transit',     value: bookedLoads.filter(l => l.status === 'In Transit').length, color: 'var(--success)' },
          { label: 'Needs Driver',   value: bookedLoads.filter(l => !l.driver).length,                color: 'var(--warning)' },
          { label: 'Gross Revenue',  value: '$' + bookedLoads.reduce((s, l) => s + l.gross, 0).toLocaleString(undefined, { maximumFractionDigits: 0 }), color: 'var(--accent2)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Invoice Modal */}
      {invoiceLoad && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if (e.target === e.currentTarget) setInvoiceLoad(null) }}>
          <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:16, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto', padding:28 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:2, color:'var(--accent)' }}>INVOICE</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>INV-{String(invoiceLoad.id).slice(-4).padStart(4,'0')} · {new Date().toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})}</div>
              </div>
              <button onClick={() => setInvoiceLoad(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
              <div style={{ background:'var(--surface2)', borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:8, letterSpacing:1 }}>FROM</div>
                <div style={{ fontSize:13, fontWeight:700 }}>{company?.name || 'Your Company'}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{company?.mc || ''} · {company?.dot || ''}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{company?.email || 'ops@swiftcarriers.com'}</div>
              </div>
              <div style={{ background:'var(--surface2)', borderRadius:10, padding:14 }}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:8, letterSpacing:1 }}>BILL TO</div>
                <div style={{ fontSize:13, fontWeight:700 }}>{invoiceLoad.broker}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>Ref: {invoiceLoad.refNum || '—'}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>Load ID: {invoiceLoad.loadId}</div>
              </div>
            </div>

            <div style={{ background:'var(--surface2)', borderRadius:10, padding:14, marginBottom:16 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:10, letterSpacing:1 }}>LOAD DETAILS</div>
              {[
                { label:'Route',      value: invoiceLoad.origin + ' → ' + invoiceLoad.dest },
                { label:'Pickup',     value: invoiceLoad.pickup },
                { label:'Delivery',   value: invoiceLoad.delivery },
                { label:'Miles',      value: invoiceLoad.miles.toLocaleString() + ' mi' },
                { label:'Commodity',  value: invoiceLoad.commodity },
                { label:'Weight',     value: invoiceLoad.weight + ' lbs' },
                { label:'Driver',     value: invoiceLoad.driver || '—' },
              ].map(item => (
                <div key={item.label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                  <span style={{ fontSize:12, color:'var(--muted)' }}>{item.label}</span>
                  <span style={{ fontSize:12, fontWeight:600 }}>{item.value}</span>
                </div>
              ))}
            </div>

            <div style={{ background:'rgba(240,165,0,0.05)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:10, padding:16, marginBottom:16 }}>
              {[
                { label:'Freight Charge', value: '$' + invoiceLoad.gross.toLocaleString(undefined,{maximumFractionDigits:0}), main:false },
                { label:'Fuel Surcharge', value: '$0.00', main:false },
                { label:'TOTAL DUE', value: '$' + invoiceLoad.gross.toLocaleString(undefined,{maximumFractionDigits:0}), main:true },
              ].map(item => (
                <div key={item.label} style={{ display:'flex', justifyContent:'space-between', padding: item.main ? '10px 0 0' : '6px 0', borderTop: item.main ? '2px solid var(--border)' : 'none', marginTop: item.main ? 6 : 0 }}>
                  <span style={{ fontSize: item.main ? 14 : 12, fontWeight: item.main ? 800 : 400, color: item.main ? 'var(--text)' : 'var(--muted)' }}>{item.label}</span>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: item.main ? 26 : 18, color: item.main ? 'var(--accent)' : 'var(--text)' }}>{item.value}</span>
                </div>
              ))}
            </div>

            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16, padding:'10px 14px', background:'var(--surface2)', borderRadius:8 }}>
              Payment Terms: Net 30 · Please reference invoice number {`INV-${String(invoiceLoad.id).slice(-4).padStart(4,'0')}`} on payment.
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'12px 0' }} onClick={() => { showToast('','Invoice Sent', invoiceLoad.broker + ' · $' + invoiceLoad.gross.toLocaleString(undefined,{maximumFractionDigits:0})); setInvoiceLoad(null) }}><Ic icon={FileText} size={14} /> Send to Broker</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'12px 0' }} onClick={() => {
                const invId = 'INV-' + String(invoiceLoad.id).slice(-4).padStart(4,'0')
                const route = invoiceLoad.origin?.split(',')[0]?.substring(0,3)?.toUpperCase() + ' → ' + invoiceLoad.dest?.split(',')[0]?.substring(0,3)?.toUpperCase()
                generateInvoicePDF({ id: invId, loadId: invoiceLoad.loadId, broker: invoiceLoad.broker, route, amount: invoiceLoad.gross, date: new Date().toLocaleDateString('en-US',{month:'short',day:'numeric'}), dueDate: 'Net 30', driver: invoiceLoad.driver, status: 'Unpaid' })
                showToast('','PDF Downloaded', invId + '.pdf')
                setInvoiceLoad(null)
              }}>Download PDF</button>
            </div>
          </div>
        </div>
      )}

      {/* Load cards */}
      {bookedLoads.length === 0 && (
        <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)', fontSize: 13 }}>
          No booked loads yet. Click <b>+ Add Rate Con</b> to log your first confirmed load.
        </div>
      )}
      {bookedLoads.map(load => {
        const isExpanded = expandedId === load.id
        const statusColor = STATUS_COLORS[load.status] || 'var(--muted)'
        const stepIdx = STATUS_FLOW.indexOf(load.status)
        return (
          <div key={load.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            {/* Card header */}
            <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer', borderBottom: isExpanded ? '1px solid var(--border)' : 'none' }}
              onClick={() => setExpandedId(isExpanded ? null : load.id)}>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                  <span style={{ fontWeight: 800, fontSize: 15 }}>{load.origin} <span style={{ color: 'var(--accent)' }}>→</span> {load.dest}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: statusColor + '15', color: statusColor, border: '1px solid ' + statusColor + '30' }}>{load.status}</span>
                  {load.rateCon && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', border: '1px solid rgba(34,197,94,0.2)' }}>Rate Con</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                  {load.loadId} · {load.broker} · {load.miles.toLocaleString()} mi · {load.commodity}
                  {load.driver ? <span> · <b style={{ color: 'var(--accent2)' }}>{load.driver}</b></span> : <span style={{ color: 'var(--warning)' }}> · No driver assigned</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', marginRight: 8 }}>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: 'var(--accent)', lineHeight: 1 }}>${load.gross.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>${load.rate}/mi</div>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
            </div>

            {/* Expanded detail */}
            {isExpanded && (
              <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Progress bar */}
                <div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>Load Progress</div>
                  <div style={{ display: 'flex', gap: 3 }}>
                    {STATUS_FLOW.map((s, i) => (
                      <div key={s} style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ height: 4, borderRadius: 2, background: i <= stepIdx ? STATUS_COLORS[s] || 'var(--accent)' : 'var(--border)', marginBottom: 4 }} />
                        <div style={{ fontSize: 9, color: i === stepIdx ? STATUS_COLORS[s] : 'var(--muted)', fontWeight: i === stepIdx ? 700 : 400, lineHeight: 1.2 }}>{s}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Details grid */}
                <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
                  {[
                    { label: 'Ref #',        value: load.refNum || '—' },
                    { label: 'Pickup',        value: load.pickup },
                    { label: 'Delivery',      value: load.delivery },
                    { label: 'Weight',        value: load.weight + ' lbs' },
                  ].map(item => (
                    <div key={item.label} style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px' }}>
                      <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{item.label}</div>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* Assign driver */}
                {!load.driver && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: 'var(--warning)', fontWeight: 700, display:'inline-flex', alignItems:'center', gap:4 }}><Ic icon={AlertTriangle} size={12} color="var(--warning)" /> Assign a driver to dispatch this load:</span>
                    {DRIVERS.map(d => (
                      <button key={d} className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => assignDriver(load.loadId, d)}>{d}</button>
                    ))}
                  </div>
                )}

                {/* Status actions */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)', alignSelf: 'center' }}>Update status:</span>
                  {STATUS_FLOW.filter((_, i) => i > stepIdx).slice(0, 3).map(s => (
                    <button key={s} className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => updateStatus(load.loadId, s)}>{s} →</button>
                  ))}
                  {load.status === 'Delivered' && (
                    <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => { updateStatus(load.loadId, 'Invoiced'); setInvoiceLoad(load) }}>
                      Generate Invoice
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ fontSize: 11, marginLeft: 'auto', color: docsOpenId === load.id ? 'var(--accent)' : undefined }}
                    onClick={() => setDocsOpenId(docsOpenId === load.id ? null : load.id)}>
                    Documents {loadDocs[load.id]?.length ? `(${loadDocs[load.id].length})` : ''}
                  </button>
                </div>

                {/* Documents panel */}
                {docsOpenId === load.id && (
                  <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, display:'flex', alignItems:'center', gap:6 }}><Ic icon={FileText} size={12} /> Load Documents</div>
                      <button className="btn btn-primary" style={{ fontSize: 11 }}
                        onClick={() => setUploadingFor(uploadingFor === load.id ? null : load.id)}>
                        {uploadingFor === load.id ? '✕ Cancel' : '+ Upload Doc'}
                      </button>
                    </div>

                    {/* Upload form */}
                    {uploadingFor === load.id && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 12px', background: 'var(--surface)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 8 }}>
                        <select value={docType} onChange={e => setDocType(e.target.value)}
                          style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                          {DOC_TYPES.map(t => <option key={t}>{t}</option>)}
                        </select>
                        <label style={{ flex: 1, cursor: 'pointer' }}>
                          <input type="file" accept=".pdf,image/*" style={{ display: 'none' }}
                            onChange={e => { if (e.target.files[0]) handleDocUpload(load.id, e.target.files[0], docType) }} />
                          <div style={{ border: '1px dashed var(--border)', borderRadius: 6, padding: '6px 14px', textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                            Click to choose file (PDF or image)
                          </div>
                        </label>
                      </div>
                    )}

                    {/* Doc list */}
                    {(loadDocs[load.id] || []).length === 0 && (
                      <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>No documents yet — upload a BOL or POD</div>
                    )}
                    {(loadDocs[load.id] || []).map(doc => (
                      <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border)' }}>
                        <span><Ic icon={DOC_ICONS[doc.type] || FileText} size={18} /></span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{doc.size} · {doc.uploadedAt}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: (DOC_COLORS[doc.type] || 'var(--muted)') + '15', color: DOC_COLORS[doc.type] || 'var(--muted)', border: '1px solid ' + (DOC_COLORS[doc.type] || 'var(--muted)') + '30', whiteSpace: 'nowrap' }}>{doc.type}</span>
                        <button className="btn btn-ghost" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => viewDoc(doc)}>View</button>
                        <button style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 13, padding: '0 4px' }} onClick={() => removeDoc(load.id, doc.id)}>✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DispatchTab() {
  return (
    <div style={{ height: '100%', overflow: 'auto' }}>
      <BookedLoads />
    </div>
  )
}

// ── Settlement tab ─────────────────────────────────────────────────────────────
function SettlementTab() {
  const { showToast } = useApp()
  const { loads } = useCarrier()
  const [paid, setPaid] = useState([])

  // Compute driver settlements from delivered/invoiced loads
  const settledLoads = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced')
  const allDrivers = [...new Set(settledLoads.map(l => l.driver).filter(Boolean))]

  const settlements = allDrivers.map(driver => {
    const dLoads = settledLoads.filter(l => l.driver === driver)
    const gross  = dLoads.reduce((s,l) => s + (l.gross || 0), 0)
    const miles  = dLoads.reduce((s,l) => s + (parseFloat(l.miles) || 0), 0)
    const fuel   = Math.round(miles * 0.22)
    const pay    = Math.round(gross * 0.28)
    const net    = gross - fuel
    const isPaid = paid.includes(driver)
    return { driver, loads: dLoads.length, gross, fuel, pay, net, status: isPaid ? 'Paid' : 'Ready', color: isPaid ? 'var(--muted)' : 'var(--success)' }
  })

  const totalGross  = settlements.reduce((s,d) => s + d.gross, 0)
  const totalPay    = settlements.reduce((s,d) => s + d.pay, 0)
  const totalFuel   = settlements.reduce((s,d) => s + d.fuel, 0)
  const totalNet    = settlements.reduce((s,d) => s + d.net, 0)

  const fmt = (v) => v >= 1000 ? `$${(v/1000).toFixed(1)}K` : `$${v}`

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {[
          { label: 'Total Gross',      value: fmt(totalGross), color: 'var(--accent)' },
          { label: 'Total Driver Pay', value: fmt(totalPay),   color: 'var(--danger)' },
          { label: 'Total Fuel Est.',  value: fmt(totalFuel),  color: 'var(--warning)' },
          { label: 'Net Carrier Pay',  value: fmt(totalNet),   color: 'var(--success)' },
        ].map(s => (
          <div key={s.label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Driver Settlements — This Period</div>
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => { setPaid(settlements.filter(s=>s.status==='Ready').map(s=>s.driver)); showToast('', 'Settlements Processed', 'All ready settlements pushed to payroll') }}>Process All Ready</button>
        </div>
        {settlements.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No completed loads yet — mark loads as Delivered to calculate settlements.</div>
        )}
        {settlements.map(s => (
          <div key={s.driver} style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, color: 'var(--accent)', flexShrink: 0 }}>
              {s.driver.split(' ').map(n => n[0]).join('')}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>{s.driver}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.loads} load{s.loads !== 1 ? 's' : ''} · Gross: ${s.gross.toLocaleString()} · Fuel est: ${s.fuel.toLocaleString()} · Driver pay (28%): ${s.pay.toLocaleString()}</div>
            </div>
            <div style={{ textAlign: 'right', marginRight: 12 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: s.status === 'Paid' ? 'var(--muted)' : 'var(--success)' }}>${s.net.toLocaleString()}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>Net this period</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: s.color + '15', color: s.color, border: '1px solid ' + s.color + '30', marginRight: 8 }}>{s.status}</span>
            {s.status === 'Ready' && (
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => { setPaid(p => [...p, s.driver]); showToast('', 'Settlement Sent', s.driver + ' · $' + s.net.toLocaleString() + ' via FastPay') }}>Pay Now</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── GLOBAL SEARCH MODAL ────────────────────────────────────────────────────────
function SearchModal({ open, onClose, onTabChange }) {
  const { loads, invoices, expenses } = useCarrier()
  const [q, setQ] = useState('')
  const inputRef = useCallback(el => { if (el && open) el.focus() }, [open])

  useEffect(() => {
    if (!open) { setQ(''); return }
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const results = q.trim().length < 2 ? [] : [
    ...loads.filter(l =>
      [l.loadId, l.broker, l.driver, l.origin, l.dest, l.status, l.commodity]
        .some(v => v && String(v).toLowerCase().includes(q.toLowerCase()))
    ).map(l => ({
      type: 'Load', icon: Package, label: l.loadId,
      sub: `${l.origin?.split(',')[0]} → ${l.dest?.split(',')[0]} · ${l.broker} · ${l.status}`,
      color: 'var(--accent)',
      action: () => { onTabChange('loads'); onClose() }
    })),
    ...invoices.filter(i =>
      [i.id, i.loadId, i.broker, i.route, i.status]
        .some(v => v && String(v).toLowerCase().includes(q.toLowerCase()))
    ).map(i => ({
      type: 'Invoice', icon: Receipt, label: i.id,
      sub: `${i.route} · ${i.broker} · $${i.amount?.toLocaleString()} · ${i.status}`,
      color: 'var(--accent2)',
      action: () => { onTabChange('financials'); onClose() }
    })),
    ...expenses.filter(e =>
      [e.cat, e.merchant, e.load, e.driver, e.notes]
        .some(v => v && String(v).toLowerCase().includes(q.toLowerCase()))
    ).map(e => ({
      type: 'Expense', icon: DollarSign, label: e.merchant || e.cat,
      sub: `${e.cat} · $${e.amount} · ${e.date}${e.load ? ' · ' + e.load : ''}`,
      color: 'var(--accent3)',
      action: () => { onTabChange('financials'); onClose() }
    })),
  ].slice(0, 12)

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80, background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: 560, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <Ic icon={Search} size={16} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search loads, invoices, expenses, drivers, brokers…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }} />
          {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>}
          <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>ESC</span>
        </div>

        {/* Results */}
        {q.trim().length >= 2 && (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {results.length === 0
              ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No results for "{q}"</div>
              : results.map((r, i) => (
                <div key={i} onClick={r.action}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: r.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic icon={r.icon} size={16} color={r.color} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: r.color, marginBottom: 2 }}>{r.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: r.color + '15', color: r.color }}>{r.type}</span>
                </div>
              ))
            }
          </div>
        )}

        {/* Shortcuts hint */}
        {q.trim().length < 2 && (
          <div style={{ padding: '16px 18px', display: 'flex', gap: 16 }}>
            {[[Package,'Loads'],[Receipt,'Invoices'],[DollarSign,'Expenses'],[User,'Drivers'],[Building2,'Brokers']].map(([icon, label]) => (
              <button key={label} onClick={() => setQ(label.toLowerCase())}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Sans',sans-serif" }}>
                <Ic icon={icon} size={12} /> {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── AI CHATBOX ─────────────────────────────────────────────────────────────────
const SUGGESTED_QUESTIONS = [
  'What\'s my most profitable lane this month?',
  'Which broker pays the fastest?',
  'Is Unit 03 safe to dispatch?',
  'How do I improve my CSA score?',
  'What should I charge per mile right now?',
  'How does FastPay work?',
]

function AIChatbox() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useCallback(el => { if (el) el.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  const { loads, invoices, expenses, totalRevenue, totalExpenses } = useCarrier()

  const buildContext = () => {
    const activeLoads  = loads.filter(l => !['Delivered','Invoiced'].includes(l.status))
    const unpaid       = invoices.filter(i => i.status === 'Unpaid')
    const netProfit    = totalRevenue - totalExpenses
    return [
      `CARRIER ACCOUNT SNAPSHOT (as of today):`,
      `- Revenue MTD: $${totalRevenue.toLocaleString()}`,
      `- Expenses MTD: $${totalExpenses.toLocaleString()}`,
      `- Net Profit MTD: $${netProfit.toLocaleString()}`,
      `- Active loads: ${activeLoads.length} (${activeLoads.map(l => `${l.loadId} ${l.origin?.split(',')[0]}→${l.dest?.split(',')[0]} $${l.gross}`).join(', ')})`,
      `- Unpaid invoices: ${unpaid.length} totaling $${unpaid.reduce((s,i)=>s+(i.amount||0),0).toLocaleString()}`,
      `- Recent expenses: ${expenses.slice(0,3).map(e=>`${e.cat} $${e.amount} ${e.merchant||''}`).join(', ')}`,
    ].join('\n')
  }

  const send = async (text) => {
    const userText = text || input.trim()
    if (!userText) return
    const newMessages = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, context: buildContext() }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`)
      }
      const data = await res.json()
      setMessages(m => [...m, { role: 'assistant', content: data.reply || data.error || 'No response.' }])
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: 'Connection error: ' + (err.message || 'Check your internet connection.') }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Chat toggle button */}
      <button onClick={() => setOpen(o => !o)}
        style={{ position: 'fixed', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%', background: open ? 'var(--surface2)' : 'var(--accent)', border: '2px solid ' + (open ? 'var(--border)' : 'var(--accent)'), boxShadow: '0 4px 20px rgba(240,165,0,0.4)', cursor: 'pointer', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900, transition: 'all 0.2s' }}>
        {open ? '✕' : <Ic icon={Zap} size={22} color="#000" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{ position: 'fixed', bottom: 88, right: 24, width: 360, height: 520, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', zIndex: 900, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(240,165,0,0.08),rgba(0,212,170,0.05))', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(240,165,0,0.15)', border: '1px solid rgba(240,165,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic icon={Zap} size={16} color="var(--accent)" /></div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Qivori AI</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>Ask me anything about your business</div>
            </div>
            <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>Try asking:</div>
                {SUGGESTED_QUESTIONS.map(q => (
                  <button key={q} onClick={() => send(q)}
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', fontSize: 12, color: 'var(--text)', cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans',sans-serif", transition: 'border-color 0.15s' }}
                    onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: '10px 13px', borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                  color: m.role === 'user' ? '#000' : 'var(--text)',
                  fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={{ background: 'var(--surface2)', borderRadius: '12px 12px 12px 4px', padding: '10px 14px', fontSize: 18, letterSpacing: 4 }}>
                  <span style={{ animation: 'pulse 1s infinite' }}>···</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask Qivori AI..."
              style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none' }}
            />
            <button onClick={() => send()} disabled={loading || !input.trim()}
              style={{ background: input.trim() ? 'var(--accent)' : 'var(--surface2)', border: 'none', borderRadius: 10, width: 38, cursor: input.trim() ? 'pointer' : 'default', fontSize: 16, color: input.trim() ? '#000' : 'var(--muted)', transition: 'all 0.15s' }}>
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ── QUICK ACTIONS BAR ──────────────────────────────────────────────────────────
function QuickActions({ onTabChange }) {
  const { showToast } = useApp()
  const [open, setOpen] = useState(false)

  const actions = [
    { icon: FileText, label: 'Log Rate Con',      color: 'var(--accent)',  onClick: () => { onTabChange('loads'); setOpen(false); showToast('', 'Loads', 'Drop a rate confirmation to log a new load') } },
    { icon: Fuel, label: 'Add Expense',        color: 'var(--warning)', onClick: () => { onTabChange('financials'); setOpen(false) } },
    { icon: Package, label: 'Update Load Status', color: 'var(--accent2)', onClick: () => { onTabChange('loads'); setOpen(false); showToast('', 'Loads', 'Drag a load card to update its status') } },
    { icon: Truck, label: 'Assign Driver',      color: 'var(--accent3)', onClick: () => { onTabChange('loads'); setOpen(false); showToast('', 'Loads', 'Click a load card to assign a driver') } },
    { icon: DollarSign, label: 'Pay a Driver',       color: 'var(--success)', onClick: () => { onTabChange('drivers'); setOpen(false) } },
    { icon: BarChart2, label: 'View P&L',           color: 'var(--accent)',  onClick: () => { onTabChange('financials'); setOpen(false) } },
  ]

  return (
    <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 900, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
      {/* Action items */}
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
          {actions.map((a, i) => (
            <button key={a.label} onClick={a.onClick}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'var(--surface)', border: `1px solid ${a.color}30`, borderRadius: 10, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", boxShadow: '0 4px 16px rgba(0,0,0,0.4)', animation: `slideUp 0.2s ease ${i * 0.04}s both`, whiteSpace: 'nowrap' }}>
              <span><Ic icon={a.icon} size={16} /></span>
              <span style={{ fontSize: 12, fontWeight: 700, color: a.color }}>{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button onClick={() => setOpen(o => !o)}
        style={{ width: 52, height: 52, borderRadius: '50%', background: open ? 'var(--surface2)' : 'var(--surface)', border: `2px solid ${open ? 'var(--border)' : 'rgba(240,165,0,0.4)'}`, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', cursor: 'pointer', fontSize: open ? 20 : 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: open ? 'var(--muted)' : 'var(--accent)', transition: 'all 0.2s', transform: open ? 'rotate(45deg)' : 'none' }}>
        {open ? '✕' : <Ic icon={Zap} size={22} color="var(--accent)" />}
      </button>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </div>
  )
}


// ── MAIN CARRIER LAYOUT ────────────────────────────────────────────────────────
export default function CarrierLayout() {
  return <CarrierProvider><CarrierLayoutInner /></CarrierProvider>
}

// ── CRM Sidebar nav (flat, no nesting) ──────────────────────────────────────
const NAV = [
  { id:'dashboard',   icon: Monitor,      label:'Dashboard'    },
  { id:'loads',        icon: Package,      label:'Loads',       badgeKey:'loads'  },
  { id:'drivers',      icon: Users,        label:'Drivers'      },
  { id:'fleet',        icon: Truck,        label:'Fleet'        },
  { id:'financials',   icon: DollarSign,   label:'Financials',  badgeKey:'finance' },
  { id:'compliance',   icon: Shield,       label:'Compliance'   },
  { id:'settings',     icon: SettingsIcon, label:'Settings'     },
  { id:'_divider' },
  { id:'analytics',    icon: BarChart2,    label:'Analytics'    },
  { id:'load-board',   icon: Zap,          label:'AI Load Board' },
]

// ── Hub sub-tab wrapper ─────────────────────────────────────────────────────
function HubTabBar({ tabs, active, onChange }) {
  return (
    <div style={{ flexShrink:0, display:'flex', gap:2, padding:'0 20px', background:'var(--surface)', borderBottom:'1px solid var(--border)', overflowX:'auto' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{ padding:'10px 16px', border:'none', borderBottom: active===t.id ? '2px solid var(--accent)' : '2px solid transparent',
            background:'transparent', color: active===t.id ? 'var(--accent)' : 'var(--muted)',
            fontSize:12, fontWeight: active===t.id ? 700 : 500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
            marginBottom:-1, whiteSpace:'nowrap' }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}

// ── Drivers Hub ──
function DriversHub() {
  const [tab, setTab] = useState('profiles')
  const TABS = [{ id:'profiles', label:'Profiles' },{ id:'settlement', label:'Settlement' },{ id:'scorecards', label:'Scorecards' },{ id:'pay-reports', label:'Pay Reports' },{ id:'onboarding', label:'Onboarding' }]
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, overflow:'hidden' }}>
        {tab === 'profiles' && <DriverProfiles />}
        {tab === 'settlement' && <DriverSettlement />}
        {tab === 'scorecards' && <DriverScorecard />}
        {tab === 'pay-reports' && <DriverPayReport />}
        {tab === 'onboarding' && <DriverOnboarding />}
      </div>
    </div>
  )
}

// ── Fleet Hub ──
function FleetHub() {
  const [tab, setTab] = useState('overview')
  const TABS = [{ id:'overview', label:'Fleet Overview' },{ id:'map', label:'Live Map' },{ id:'fuel', label:'Fuel' },{ id:'equipment', label:'Equipment' }]
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, overflow:'hidden' }}>
        {tab === 'overview' && <FleetManager />}
        {tab === 'map' && <FleetMap />}
        {tab === 'fuel' && <FuelOptimizer />}
        {tab === 'equipment' && <EquipmentManager />}
      </div>
    </div>
  )
}

// ── Financials Hub ──
function FinancialsHub() {
  const [tab, setTab] = useState('pl')
  const TABS = [{ id:'pl', label:'P&L' },{ id:'profit-iq', label:'Profit IQ' },{ id:'receivables', label:'Receivables' },{ id:'cash-flow', label:'Cash Flow' },{ id:'expenses', label:'Expenses' },{ id:'factoring', label:'Factoring' },{ id:'quickbooks', label:'QuickBooks' }]
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, overflow:'hidden' }}>
        {tab === 'pl' && <PLDashboard />}
        {tab === 'profit-iq' && <ProfitIQTab />}
        {tab === 'receivables' && <ReceivablesAging />}
        {tab === 'cash-flow' && <CashFlowForecaster />}
        {tab === 'expenses' && <ExpenseTracker />}
        {tab === 'factoring' && <FactoringCashflow />}
        {tab === 'quickbooks' && <QuickBooksExport />}
      </div>
    </div>
  )
}

// ── Compliance Hub ──
function ComplianceHub() {
  const [tab, setTab] = useState('center')
  const TABS = [{ id:'center', label:'Compliance Center' },{ id:'ifta', label:'IFTA & DOT' },{ id:'broker-risk', label:'Broker Risk' },{ id:'clearinghouse', label:'Drug & Alcohol' }]
  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, overflow:'hidden' }}>
        {tab === 'center' && <CarrierDVIR />}
        {tab === 'ifta' && <CarrierIFTA />}
        {tab === 'broker-risk' && <BrokerRiskIntel />}
        {tab === 'clearinghouse' && <CarrierClearinghouse />}
      </div>
    </div>
  )
}

// ── Kanban Pipeline (Loads view) ─────────────────────────────────────────────
const KANBAN_COLUMNS = [
  { id:'booked',     label:'Booked',     statuses:['Rate Con Received','Booked'], color:'var(--accent)' },
  { id:'dispatched', label:'Dispatched',  statuses:['Assigned to Driver','En Route to Pickup'], color:'var(--accent3)' },
  { id:'in-transit', label:'In Transit',  statuses:['Loaded','In Transit','At Pickup','At Delivery'], color:'var(--success)' },
  { id:'delivered',  label:'Delivered',   statuses:['Delivered'], color:'var(--accent2)' },
  { id:'invoiced',   label:'Invoiced',    statuses:['Invoiced'], color:'var(--accent3)' },
  { id:'paid',       label:'Paid',        statuses:['Paid'], color:'var(--success)' },
]

function KanbanCard({ load, onClick, onDragStart }) {
  const origin = (load.origin || '').split(',')[0] || '—'
  const dest = (load.dest || load.destination || '').split(',')[0] || '—'
  const gross = load.gross || load.gross_pay || 0
  const rpm = load.rate || (load.miles > 0 ? (gross / load.miles).toFixed(2) : '—')
  return (
    <div draggable onDragStart={e => { e.dataTransfer.setData('loadId', load.loadId || load.id); onDragStart?.() }}
      onClick={() => onClick?.(load)}
      style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px',
        cursor:'pointer', transition:'all 0.12s', marginBottom:8 }}
      onMouseOver={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.transform='translateY(-1px)' }}
      onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.transform='none' }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <span style={{ fontSize:11, fontFamily:'monospace', fontWeight:700, color:'var(--accent)' }}>{load.loadId || load.id}</span>
        <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:6, background:'rgba(240,165,0,0.1)', color:'var(--accent)' }}>{load.status}</span>
      </div>
      <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>{origin} → {dest}</div>
      <div style={{ display:'flex', gap:10, fontSize:11, color:'var(--muted)', marginBottom:6 }}>
        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--accent)' }}>${gross.toLocaleString()}</span>
        <span>${rpm}/mi</span>
        <span>{(load.miles || 0).toLocaleString()} mi</span>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)' }}>
        <span>{load.driver || 'Unassigned'}</span>
        <span>{load.broker || ''}</span>
      </div>
    </div>
  )
}

function LoadsPipeline({ onOpenDrawer }) {
  const { loads, updateLoadStatus, showToast: _st } = { ...useCarrier(), ...useApp() }
  const [pipeTab, setPipeTab] = useState('pipeline')
  const [dragOver, setDragOver] = useState(null)

  const handleDrop = (e, col) => {
    e.preventDefault()
    setDragOver(null)
    const loadId = e.dataTransfer.getData('loadId')
    if (!loadId || !col.statuses[0]) return
    updateLoadStatus(loadId, col.statuses[0])
  }

  const PIPE_TABS = [{ id:'pipeline', label:'Pipeline' },{ id:'list', label:'List View' },{ id:'dispatch', label:'Dispatch Board' },{ id:'check-calls', label:'Check Calls' },{ id:'command', label:'Command Center' },{ id:'lane-intel', label:'Lane Intel' }]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'hidden' }}>
      <HubTabBar tabs={PIPE_TABS} active={pipeTab} onChange={setPipeTab} />
      <div style={{ flex:1, overflow:'hidden' }}>
        {pipeTab === 'pipeline' && (
          <div style={{ display:'flex', gap:12, padding:16, height:'100%', overflowX:'auto' }}>
            {KANBAN_COLUMNS.map(col => {
              const colLoads = loads.filter(l => col.statuses.includes(l.status))
              const colTotal = colLoads.reduce((s,l) => s + (l.gross || l.gross_pay || 0), 0)
              return (
                <div key={col.id}
                  onDragOver={e => { e.preventDefault(); setDragOver(col.id) }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => handleDrop(e, col)}
                  style={{ width:280, flexShrink:0, display:'flex', flexDirection:'column', background: dragOver === col.id ? 'rgba(240,165,0,0.04)' : 'transparent',
                    border: `1px solid ${dragOver === col.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius:12, transition:'all 0.15s' }}>
                  {/* Column header */}
                  <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:col.color }} />
                        <span style={{ fontSize:12, fontWeight:700 }}>{col.label}</span>
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:col.color, background:col.color+'15', padding:'2px 8px', borderRadius:8 }}>{colLoads.length}</span>
                    </div>
                    {colTotal > 0 && <div style={{ fontSize:10, color:'var(--muted)' }}>${colTotal.toLocaleString()} total</div>}
                  </div>
                  {/* Cards */}
                  <div style={{ flex:1, overflowY:'auto', padding:8, paddingBottom:40 }}>
                    {colLoads.length === 0 && (
                      <div style={{ padding:20, textAlign:'center', fontSize:11, color:'var(--muted)', border:'1px dashed var(--border)', borderRadius:8 }}>
                        Drop loads here
                      </div>
                    )}
                    {colLoads.map(load => (
                      <KanbanCard key={load.loadId || load.id} load={load} onClick={() => onOpenDrawer?.(load.loadId || load.id)} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
        {pipeTab === 'list' && <DispatchTab />}
        {pipeTab === 'dispatch' && <SmartDispatch />}
        {pipeTab === 'check-calls' && <CheckCallCenter />}
        {pipeTab === 'command' && <CommandCenter />}
        {pipeTab === 'lane-intel' && <LaneIntel />}
      </div>
    </div>
  )
}

// ── Load Detail Drawer ─────────────────────────────────────────────────────
function LoadDetailDrawer({ loadId, onClose }) {
  const { loads, invoices, checkCalls, updateLoadStatus, drivers } = useCarrier()
  const { showToast } = useApp()
  const load = loads.find(l => (l.loadId || l.id) === loadId)
  if (!load) return null

  const origin = load.origin || '—'
  const dest = load.dest || load.destination || '—'
  const gross = load.gross || load.gross_pay || 0
  const rpm = load.rate || (load.miles > 0 ? (gross / load.miles).toFixed(2) : '—')
  const linkedInvoice = invoices.find(i => i.load_number === load.loadId || i.loadId === load.loadId)
  const loadCalls = checkCalls[load.loadId] || []

  const STATUS_FLOW = ['Rate Con Received','Assigned to Driver','En Route to Pickup','Loaded','In Transit','Delivered','Invoiced','Paid']
  const currentIdx = STATUS_FLOW.indexOf(load.status)
  const nextStatus = currentIdx < STATUS_FLOW.length - 1 ? STATUS_FLOW[currentIdx + 1] : null

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:900 }} />
      <div style={{ position:'fixed', top:48, right:0, bottom:0, width:480, maxWidth:'100vw', background:'var(--bg)',
        borderLeft:'1px solid var(--border)', zIndex:901, display:'flex', flexDirection:'column',
        boxShadow:'-8px 0 32px rgba(0,0,0,0.3)', animation:'slideInRight 0.2s ease' }}>
        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <span style={{ fontFamily:'monospace', fontSize:14, fontWeight:700, color:'var(--accent)' }}>{load.loadId || load.id}</span>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:8, background:'rgba(240,165,0,0.1)', color:'var(--accent)' }}>{load.status}</span>
              <button onClick={onClose} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:18 }}>✕</button>
            </div>
          </div>
          <div style={{ fontSize:18, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:1, marginBottom:4 }}>
            {origin.split(',')[0]} → {dest.split(',')[0]}
          </div>
          <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--muted)' }}>
            <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--accent)' }}>${gross.toLocaleString()}</span>
            <span>${rpm}/mi</span>
            <span>{(load.miles || 0).toLocaleString()} mi</span>
          </div>
        </div>

        {/* Scrollable content */}
        <div style={{ flex:1, overflowY:'auto', padding:20, paddingBottom:60, display:'flex', flexDirection:'column', gap:16 }}>
          {/* Progress bar */}
          <div style={{ display:'flex', gap:2 }}>
            {STATUS_FLOW.slice(0,7).map((s, i) => (
              <div key={s} style={{ flex:1, height:4, borderRadius:2, background: i <= currentIdx ? 'var(--accent)' : 'var(--surface2)', transition:'background 0.3s' }}
                title={s} />
            ))}
          </div>

          {/* Quick actions */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {nextStatus && (
              <button className="btn btn-primary" style={{ fontSize:11, flex:1 }}
                onClick={() => { updateLoadStatus(load.loadId || load.id, nextStatus); showToast('','Status Updated', `${load.loadId} → ${nextStatus}`) }}>
                Advance → {nextStatus}
              </button>
            )}
            {load.status === 'Delivered' && !linkedInvoice && (
              <button className="btn btn-ghost" style={{ fontSize:11, flex:1 }}
                onClick={() => { updateLoadStatus(load.loadId || load.id, 'Invoiced'); showToast('','Invoice Created', load.loadId) }}>
                Generate Invoice
              </button>
            )}
          </div>

          {/* Details grid */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>Load Details</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { label:'Broker', value: load.broker || '—' },
                { label:'Driver', value: load.driver || 'Unassigned' },
                { label:'Ref #', value: load.refNum || load.ref_number || '—' },
                { label:'Equipment', value: load.equipment || '—' },
                { label:'Weight', value: load.weight ? `${load.weight} lbs` : '—' },
                { label:'Commodity', value: load.commodity || '—' },
                { label:'Pickup', value: load.pickup || '—' },
                { label:'Delivery', value: load.delivery || '—' },
              ].map(d => (
                <div key={d.label}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{d.label}</div>
                  <div style={{ fontSize:12, fontWeight:600 }}>{d.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Invoice */}
          {linkedInvoice && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>Invoice</div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{linkedInvoice.invoice_number}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>${Number(linkedInvoice.amount || 0).toLocaleString()}</div>
                </div>
                <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:8,
                  background: linkedInvoice.status === 'Paid' ? 'rgba(34,197,94,0.1)' : 'rgba(240,165,0,0.1)',
                  color: linkedInvoice.status === 'Paid' ? 'var(--success)' : 'var(--accent)' }}>
                  {linkedInvoice.status}
                </span>
              </div>
            </div>
          )}

          {/* Check calls */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>Check Calls ({loadCalls.length})</div>
            {loadCalls.length === 0
              ? <div style={{ fontSize:12, color:'var(--muted)' }}>No check calls logged yet</div>
              : loadCalls.slice(-5).reverse().map((c, i) => (
                <div key={i} style={{ padding:'8px 0', borderBottom:'1px solid var(--border)', fontSize:12 }}>
                  <div style={{ fontWeight:600 }}>{c.note || c.message}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{c.time || c.timestamp}</div>
                </div>
              ))
            }
          </div>

          {/* Financial summary */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>Financial Summary</div>
            {[
              { label:'Gross Revenue', value:`$${gross.toLocaleString()}`, color:'var(--accent)' },
              { label:'Est. Driver Pay (28%)', value:`-$${Math.round(gross * 0.28).toLocaleString()}`, color:'var(--danger)' },
              { label:'Est. Fuel', value:`-$${Math.round((load.miles || 0) * 0.55).toLocaleString()}`, color:'var(--danger)' },
              { label:'Est. Net', value:`$${Math.round(gross - gross * 0.28 - (load.miles || 0) * 0.55).toLocaleString()}`, color:'var(--success)', bold:true },
            ].map(r => (
              <div key={r.label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid var(--border)' }}>
                <span style={{ fontSize:12, color:'var(--muted)' }}>{r.label}</span>
                <span style={{ fontSize: r.bold ? 16 : 13, fontWeight: r.bold ? 800 : 600, color:r.color, fontFamily: r.bold ? "'Bebas Neue',sans-serif" : 'inherit' }}>{r.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

function resolveView(viewId, navTo, onOpenDrawer) {
  switch (viewId) {
    case 'dashboard':   return <OverviewTab onTabChange={(viewId) => navTo(viewId)} />
    case 'loads':       return <LoadsPipeline onOpenDrawer={onOpenDrawer} />
    case 'drivers':     return <DriversHub />
    case 'fleet':       return <FleetHub />
    case 'financials':  return <FinancialsHub />
    case 'compliance':  return <ComplianceHub />
    case 'settings':    return <SettingsTab />
    case 'analytics':   return <AnalyticsDashboard />
    case 'load-board':  return <AILoadBoard />
    default:            return <OverviewTab onTabChange={(viewId) => navTo(viewId)} />
  }
}

function CarrierLayoutInner() {
  const { logout, showToast, theme, setTheme } = useApp()
  const { activeLoads, unpaidInvoices, company } = useCarrier()

  const [activeView,    setActiveView]    = useState('dashboard')
  const [drawerLoadId,  setDrawerLoadId]  = useState(null)
  const [searchOpen,    setSearchOpen]    = useState(false)
  const [notifOpen,     setNotifOpen]     = useState(false)
  const [mobileNav,     setMobileNav]     = useState(false)
  const [dismissedNotifs, setDismissedNotifs] = useState([])

  const navTo = (viewId) => {
    setActiveView(viewId)
    setMobileNav(false)
  }

  useEffect(() => {
    const h = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); setSearchOpen(o => !o) } }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const ALL_NOTIFS = [
    { icon: Zap,             title:'AI Match: ATL→CHI',     sub:'$3,840 · Score 96 · Pickup today',       color:'var(--accent)',  view:'loads' },
    { icon: Wrench,          title:'Unit 03 — Service Due',  sub:'800 miles remaining · Schedule now',      color:'var(--warning)', view:'fleet' },
    { icon: CreditCard,      title:'FastPay Available',       sub:'INV-042 · $2,666 ready for collection',  color:'var(--success)', view:'financials' },
    { icon: BarChart2,       title:'IFTA Refund Detected',   sub:'$112.81 credit this quarter',             color:'var(--accent3)', view:'compliance' },
    { icon: AlertTriangle,   title:'Broker Alert',           sub:'Transplace — payment 8 days overdue',    color:'var(--danger)',  view:'compliance' },
    { icon: Truck,           title:'Unit 02 Available',       sub:'Marcus Lee · Chicago · 11hr HOS',        color:'var(--accent2)', view:'fleet' },
  ]
  const notifs = ALL_NOTIFS.filter((_, i) => !dismissedNotifs.includes(i))

  // Badges per nav item
  const BADGES = {
    loads:      activeLoads.length    || null,
    finance:    unpaidInvoices.length || null,
  }

  const sStyle = { fontFamily:"'DM Sans',sans-serif", width:'100vw', height:'100vh', display:'flex', flexDirection:'column', background:'var(--bg)', overflow:'hidden' }
  const inp    = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', color:'var(--text)', fontSize:12, outline:'none', fontFamily:"'DM Sans',sans-serif" }

  return (
    <div style={sStyle}>

      {/* ── TOP BAR ───────────────────────────────────────────────── */}
      <div className="carrier-topbar" style={{ height:48, background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', padding:'0 16px', gap:12, flexShrink:0, zIndex:100 }}>
        {/* Mobile hamburger */}
        <button className="mobile-nav-btn" onClick={() => setMobileNav(o => !o)}
          style={{ display:'none', background:'none', border:'none', color:'var(--text)', cursor:'pointer', fontSize:20, padding:'4px 8px', flexShrink:0 }}>
          {mobileNav ? '✕' : '☰'}
        </button>
        {/* Logo */}
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:17, letterSpacing:3, marginRight:4, flexShrink:0 }}>
          QI<span style={{ color:'var(--accent)' }}>VORI</span>
          <span style={{ fontSize:11, color:'var(--accent2)', letterSpacing:1, fontFamily:"'DM Sans',sans-serif", fontWeight:700, marginLeft:6 }}>AI</span>
        </div>

        {/* Search */}
        <div className="search-bar" onClick={() => setSearchOpen(true)}
          style={{ flex:1, maxWidth:380, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 12px', display:'flex', alignItems:'center', gap:8, cursor:'pointer', transition:'border-color 0.15s' }}
          onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
          onMouseOut={e  => e.currentTarget.style.borderColor='var(--border)'}>
          <Search size={13} style={{ color:'var(--muted)' }} />
          <span style={{ color:'var(--muted)', fontSize:12, flex:1, userSelect:'none' }}>Search loads, drivers, brokers…</span>
          <span style={{ fontSize:10, color:'var(--muted)', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:4, padding:'1px 5px' }}>⌘K</span>
        </div>

        <div style={{ flex:1 }} />

        {/* Theme toggle */}
        {(() => {
          const THEMES = [
            { id:'default',       icon: Moon,  label:'Default Dark',   title:'Standard dark theme' },
            { id:'colorblind',    icon: Eye,   label:'Colorblind',      title:'Okabe-Ito palette — safe for deuteranopia & protanopia' },
            { id:'high-contrast', icon: Zap,   label:'High Contrast',  title:'Maximum contrast for low-light or bright environments' },
          ]
          return (
            <div className="theme-toggle" style={{ display:'flex', alignItems:'center', gap:2, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:2 }}>
              {THEMES.map(t => (
                <button key={t.id} onClick={() => setTheme(t.id)} title={t.title}
                  style={{ padding:'4px 9px', fontSize:12, borderRadius:6, border:'none', cursor:'pointer',
                    background: theme === t.id ? 'var(--surface3)' : 'transparent',
                    color: theme === t.id ? 'var(--accent)' : 'var(--muted)',
                    fontFamily:"'DM Sans',sans-serif", fontWeight: theme === t.id ? 700 : 400,
                    outline: theme === t.id ? '1px solid var(--border)' : 'none',
                    transition:'all 0.15s' }}>
                  {React.createElement(t.icon, { size:14 })}
                </button>
              ))}
            </div>
          )
        })()}

        {/* AI status pill */}
        <div className="ai-status" style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:8, padding:'5px 12px' }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', boxShadow:'0 0 6px var(--accent)' }}/>
          <span style={{ fontSize:11, fontWeight:700, color:'var(--accent)' }}>AI ACTIVE</span>
        </div>

        {/* Notifications */}
        <div style={{ position:'relative' }}>
          <button onClick={() => setNotifOpen(o => !o)}
            style={{ ...inp, display:'flex', alignItems:'center', gap:6, cursor:'pointer', padding:'5px 10px' }}>
            <Bell size={15} />
            {notifs.length > 0 && <span style={{ background:'var(--danger)', color:'#fff', fontSize:9, fontWeight:800, padding:'1px 5px', borderRadius:10 }}>{notifs.length}</span>}
          </button>
          {notifOpen && (
            <div style={{ position:'absolute', top:42, right:0, width:320, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, boxShadow:'0 16px 48px rgba(0,0,0,0.6)', zIndex:999, overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span>Notifications {notifs.length > 0 && <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400 }}>· {notifs.length} new</span>}</span>
                <div style={{ display:'flex', gap:8 }}>
                  {notifs.length > 0 && <button onClick={() => setDismissedNotifs(ALL_NOTIFS.map((_,i)=>i))} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:11, fontFamily:"'DM Sans',sans-serif" }}>Clear all</button>}
                  <button onClick={() => setNotifOpen(false)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:16 }}>✕</button>
                </div>
              </div>
              {notifs.length === 0
                ? <div style={{ padding:28, textAlign:'center', color:'var(--muted)', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><CheckCircle size={14} color="var(--success)" /> All caught up</div>
                : ALL_NOTIFS.map((n, i) => dismissedNotifs.includes(i) ? null : (
                  <div key={i} style={{ padding:'11px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', display:'flex', gap:10, alignItems:'flex-start' }}
                    onMouseOver={e => e.currentTarget.style.background='var(--surface2)'}
                    onMouseOut={e  => e.currentTarget.style.background='transparent'}
                    onClick={() => { navTo(n.view); setNotifOpen(false) }}>
                    <div style={{ width:30, height:30, borderRadius:8, background:n.color+'15', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, color:n.color }}>{React.createElement(n.icon, { size:14 })}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:700, marginBottom:2 }}>{n.title}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{n.sub}</div>
                    </div>
                    <button onClick={e => { e.stopPropagation(); setDismissedNotifs(d => [...d, i]) }}
                      style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:14, padding:0 }}>✕</button>
                  </div>
                ))
              }
            </div>
          )}
        </div>

        {/* Controls */}
        <button className="btn btn-primary" style={{ fontSize:12, fontWeight:700, padding:'5px 14px' }}
          onClick={() => showToast('','Post Truck','Opening truck availability posting...')}>
          <Truck size={13} /> Post Truck
        </button>
      </div>

      {/* ── BODY: SIDEBAR + CONTENT ───────────────────────────────── */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

        {/* Mobile sidebar overlay */}
        {mobileNav && <div className="mobile-nav-overlay" onClick={() => setMobileNav(false)}
          style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:998, display:'none' }} />}

        {/* LEFT SIDEBAR */}
        <div className={`carrier-sidebar${mobileNav ? ' mobile-open' : ''}`} style={{ width:220, flexShrink:0, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflowY:'auto', overflowX:'hidden' }}>

          {/* Company badge */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
              {/* Logo or initials */}
              <div style={{ width:36, height:36, borderRadius:8, background:'var(--surface2)', border:'1px solid var(--border)',
                display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0 }}>
                {company?.logo
                  ? <img src={company.logo} alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                  : <span style={{ fontSize:12, fontWeight:800, color:'var(--accent)' }}>
                      {(company?.name || 'SC').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()}
                    </span>
                }
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:800, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {company?.name || 'Your Company'}
                </div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>{company?.mc ? `${company.mc} · ` : ''}{activeLoads.length} loads active</div>
              </div>
            </div>
            {/* Quick status */}
            <div style={{ fontSize:10, color:'var(--success)', display:'flex', alignItems:'center', gap:5, padding:'4px 10px', background:'rgba(0,212,170,0.06)', borderRadius:6, border:'1px solid rgba(0,212,170,0.15)' }}>
              <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--success)', boxShadow:'0 0 5px var(--success)' }}/>
              <span style={{ fontWeight:700 }}>System Online</span>
            </div>
          </div>

          {/* Nav items — flat */}
          <div style={{ flex:1, padding:'8px 0' }}>
            {NAV.map(item => {
              if (item.id === '_divider') return <div key="_div" style={{ margin:'6px 16px', borderTop:'1px solid var(--border)' }} />
              const isActive = activeView === item.id
              const badge = BADGES[item.badgeKey]
              return (
                <div key={item.id} onClick={() => navTo(item.id)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 16px', cursor:'pointer',
                    borderLeft:`3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    background: isActive ? 'rgba(240,165,0,0.06)' : 'transparent',
                    transition:'all 0.12s', marginBottom:1 }}
                  onMouseOver={e => { if (!isActive) e.currentTarget.style.background='rgba(255,255,255,0.03)' }}
                  onMouseOut={e  => { if (!isActive) e.currentTarget.style.background='transparent' }}>
                  <span style={{ width:22, display:'flex', justifyContent:'center', alignItems:'center', flexShrink:0 }}>
                    {React.createElement(item.icon, { size:16, color: isActive ? 'var(--accent)' : undefined })}
                  </span>
                  <span style={{ fontSize:13, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--accent)' : 'var(--text)', flex:1 }}>{item.label}</span>
                  {badge && <span style={{ fontSize:9, fontWeight:800, background:'var(--danger)', color:'#fff', borderRadius:10, padding:'1px 6px', flexShrink:0 }}>{badge}</span>}
                </div>
              )
            })}
          </div>

          {/* Bottom: AI Intelligence + Log Out */}
          <div style={{ padding:'12px 14px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
            <div onClick={() => navTo('load-board')}
              style={{ background:'linear-gradient(135deg, rgba(240,165,0,0.12), rgba(240,165,0,0.04))', border:'1px solid rgba(240,165,0,0.35)', borderRadius:10, padding:'12px 14px', cursor:'pointer', marginBottom:8, transition:'all 0.15s' }}
              onMouseOver={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.boxShadow='0 0 16px rgba(240,165,0,0.15)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor='rgba(240,165,0,0.35)'; e.currentTarget.style.boxShadow='none' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <div style={{ width:28, height:28, borderRadius:8, background:'rgba(240,165,0,0.2)', border:'1px solid rgba(240,165,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Ic icon={Zap} size={14} color="var(--accent)" />
                </div>
                <div>
                  <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:1.5 }}>AI FREIGHT INTEL</div>
                  <div style={{ fontSize:9, color:'var(--success)', fontWeight:700, display:'flex', alignItems:'center', gap:3 }}>
                    <div style={{ width:4, height:4, borderRadius:'50%', background:'var(--success)', boxShadow:'0 0 4px var(--success)' }}/>
                    Live scoring
                  </div>
                </div>
              </div>
              <div style={{ fontSize:12, color:'var(--text)', lineHeight:1.5, fontWeight:600 }}>
                HOU→NYC <span style={{ color:'var(--accent)', fontWeight:800, fontFamily:"'Bebas Neue',sans-serif", fontSize:16 }}>99</span><span style={{ fontSize:10, color:'var(--muted)' }}>/100</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:6 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'var(--accent)' }}>$3.28/mi</span>
                <span style={{ fontSize:10, color:'var(--accent)', fontWeight:700 }}>Open Board →</span>
              </div>
            </div>
            <button onClick={logout} style={{ width:'100%', padding:'8px', background:'transparent', border:'1px solid var(--border)', borderRadius:8, color:'var(--muted)', fontSize:12, fontWeight:600, cursor:'pointer', transition:'all 0.15s' }}
              onMouseOver={e => { e.currentTarget.style.borderColor='var(--danger)'; e.currentTarget.style.color='var(--danger)' }}
              onMouseOut={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--muted)' }}>
              Log Out
            </button>
          </div>
        </div>

        {/* MAIN CONTENT */}
        <div style={{ flex:1, minHeight:0, overflow:'hidden', display:'flex', flexDirection:'column', position:'relative' }}>
          <ViewErrorBoundary key={activeView}>
            {resolveView(activeView, navTo, setDrawerLoadId)}
          </ViewErrorBoundary>
          {drawerLoadId && <LoadDetailDrawer loadId={drawerLoadId} onClose={() => setDrawerLoadId(null)} />}
        </div>
      </div>

      <Toast />
      <QuickActions onTabChange={(viewId) => navTo(viewId)} />
      <AIChatbox />
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)}
        onTabChange={(viewId) => { navTo(viewId); setSearchOpen(false) }} />
    </div>
  )
}
