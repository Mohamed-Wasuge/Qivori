import React, { useState } from 'react'
import { Target } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { apiFetch } from '../../lib/api'
import { Ic, HubTabBar } from './shared'
import { DispatchTab } from './DispatchTab'
import { SmartDispatch, CommandCenter, CheckCallCenter, LaneIntel, RateNegotiation, RateBadge } from '../../pages/carrier/LoadBoard'

// ── Billing tab ────────────────────────────────────────────────────────────────
export function BillingTab() {
  const { showToast, profile, subscription, openBillingPortal } = useApp()
  const { invoices, vehicles, unpaidInvoices, totalRevenue, totalExpenses } = useCarrier()

  const truckCount = vehicles.length || profile?.truck_count || 1
  const planName = 'Qivori AI Dispatch'
  const firstTruck = 199
  const extraTruck = 99
  const totalMonthly = firstTruck + Math.max(0, truckCount - 1) * extraTruck

  const validPlans = ['autonomous_fleet', 'autopilot_ai', 'autopilot']
  const isFreeTier = !subscription?.plan || !validPlans.includes(subscription?.plan)
  const statusLabel = subscription?.isTrial ? 'TRIAL' : subscription?.isActive ? 'ACTIVE' : subscription?.status === 'past_due' ? 'PAST DUE' : isFreeTier ? 'FREE TIER' : 'INACTIVE'
  const statusColor = { Unpaid:'var(--warning)', Paid:'var(--success)', Factored:'var(--accent2)', Overdue:'var(--danger)' }
  const badgeColor = subscription?.isTrial ? 'var(--accent)' : subscription?.isActive ? 'var(--success)' : isFreeTier ? 'var(--accent2)' : 'var(--danger)'

  return (
    <div style={{ padding: 20, paddingBottom: 60, overflowY: 'auto', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Plan summary */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Current Plan — {planName}</div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: `${badgeColor}15`, color: badgeColor, border: `1px solid ${badgeColor}30` }}>{'\u25CF'} {statusLabel}</span>
        </div>
        <div style={{ padding: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 16 }}>
          {[
            { label: 'Plan', price: planName, note: 'Everything included', color: 'var(--accent)' },
            { label: 'Pricing', price: `$${firstTruck} + $${extraTruck}/truck`, note: `${truckCount} truck${truckCount !== 1 ? 's' : ''}`, color: 'var(--accent2)' },
            { label: 'Total Monthly', price: `$${totalMonthly}/mo`, note: profile?.current_period_end ? `Next: ${new Date(profile.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : '', color: 'var(--success)', bold: true },
          ].map(item => (
            <div key={item.label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{item.label}</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: item.color }}>{item.price}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{item.note}</div>
            </div>
          ))}
        </div>
        {subscription?.customerId && (
          <div style={{ padding: '0 20px 16px', display: 'flex', gap: 10 }}>
            <button onClick={openBillingPortal} style={{ padding: '8px 16px', fontSize: 11, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 8, background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
              Manage Subscription
            </button>
          </div>
        )}
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

// ── Settlement tab ─────────────────────────────────────────────────────────────
export function SettlementTab() {
  const { showToast } = useApp()
  const { loads, drivers: ctxDrivers, fuelCostPerMile } = useCarrier()
  const [paid, setPaid] = useState([])

  // Helper: get driver pay from their configured model
  const getDriverPay = (driverName, gross, miles) => {
    const driverRec = (ctxDrivers || []).find(d => (d.full_name || d.name) === driverName)
    const model = driverRec?.pay_model || 'percent'
    const rate = parseFloat(driverRec?.pay_rate) || 28
    if (model === 'permile') return Math.round(miles * rate)
    if (model === 'flat') return Math.round(rate)
    return Math.round(gross * (rate / 100)) // percent
  }

  const getPayLabel = (driverName) => {
    const driverRec = (ctxDrivers || []).find(d => (d.full_name || d.name) === driverName)
    const model = driverRec?.pay_model || 'percent'
    const rate = parseFloat(driverRec?.pay_rate) || 28
    if (model === 'permile') return `$${rate}/mi`
    if (model === 'flat') return `$${rate}/load`
    return `${rate}%`
  }

  const fuelRate = fuelCostPerMile || 0.22

  // Compute driver settlements from delivered/invoiced loads
  const settledLoads = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced')
  const allDrivers = [...new Set(settledLoads.map(l => l.driver).filter(Boolean))]

  const settlements = allDrivers.map(driver => {
    const dLoads = settledLoads.filter(l => l.driver === driver)
    const gross  = dLoads.reduce((s,l) => s + (l.gross || 0), 0)
    const miles  = dLoads.reduce((s,l) => s + (parseFloat(l.miles) || 0), 0)
    const fuel   = Math.round(miles * fuelRate)
    const pay    = getDriverPay(driver, gross, miles)
    const net    = gross - fuel
    const isPaid = paid.includes(driver)
    return { driver, loads: dLoads.length, gross, fuel, pay, net, payLabel: getPayLabel(driver), status: isPaid ? 'Paid' : 'Ready', color: isPaid ? 'var(--muted)' : 'var(--success)' }
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
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{s.loads} load{s.loads !== 1 ? 's' : ''} · Gross: ${s.gross.toLocaleString()} · Fuel est: ${s.fuel.toLocaleString()} · Driver pay ({s.payLabel}): ${s.pay.toLocaleString()}</div>
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

// ── Kanban Pipeline (Loads view) ─────────────────────────────────────────────
export const KANBAN_COLUMNS = [
  { id:'booked',     label:'Booked',     statuses:['Rate Con Received','Booked'], color:'var(--accent)' },
  { id:'dispatched', label:'Dispatched',  statuses:['Assigned to Driver','En Route to Pickup'], color:'var(--accent3)' },
  { id:'in-transit', label:'In Transit',  statuses:['Loaded','In Transit','At Pickup','At Delivery'], color:'var(--success)' },
  { id:'delivered',  label:'Delivered',   statuses:['Delivered'], color:'var(--accent2)' },
  { id:'invoiced',   label:'Invoiced',    statuses:['Invoiced'], color:'var(--accent3)' },
  { id:'paid',       label:'Paid',        statuses:['Paid'], color:'var(--success)' },
]

export function KanbanCard({ load, onClick, onDragStart }) {
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
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ fontSize:11, fontFamily:'monospace', fontWeight:700, color:'var(--accent)' }}>{load.loadId || load.id}</span>
          {load.load_source === 'amazon_relay' && (
            <span style={{ fontSize:8, fontWeight:700, padding:'1px 5px', borderRadius:4, background:'rgba(255,153,0,0.15)', color:'#ff9900', letterSpacing:0.3 }}>RELAY</span>
          )}
        </div>
        <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:6, background:'rgba(240,165,0,0.1)', color:'var(--accent)' }}>{load.status}</span>
      </div>
      <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>{origin} → {dest}</div>
      <div style={{ display:'flex', gap:10, fontSize:11, color:'var(--muted)', marginBottom:6 }}>
        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--accent)' }}>${gross.toLocaleString()}</span>
        <span>${rpm}/mi</span>
        <span>{(load.miles || 0).toLocaleString()} mi</span>
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:10, color:'var(--muted)' }}>
        <span>{load.driver || 'Unassigned'}</span>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <RateBadge rpm={rpm} equipment={load.equipment} compact />
          <span style={load.load_source === 'amazon_relay' ? { color:'#ff9900', fontWeight:600 } : undefined}>{load.broker || ''}</span>
        </div>
      </div>
    </div>
  )
}

export function LoadsPipeline({ onOpenDrawer }) {
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

  const PIPE_TABS = [{ id:'pipeline', label:'Pipeline' },{ id:'list', label:'List View' },{ id:'dispatch', label:'Dispatch Board' },{ id:'check-calls', label:'Check Calls' },{ id:'command', label:'Command Center' },{ id:'lane-intel', label:'Lane Intel' },{ id:'rate-check', label:'Rate Check' }]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, overflow:'hidden' }}>
      <HubTabBar tabs={PIPE_TABS} active={pipeTab} onChange={setPipeTab} />
      <div style={{ flex:1, minHeight:0, overflow:'auto', display:'flex', flexDirection:'column' }}>
        {pipeTab === 'pipeline' && (
          <div style={{ display:'flex', gap:6, padding:'10px 10px', flex:1, minHeight:0, overflow:'auto' }}>
            {KANBAN_COLUMNS.map(col => {
              const colLoads = loads.filter(l => col.statuses.includes(l.status))
              const colTotal = colLoads.reduce((s,l) => s + (l.gross || l.gross_pay || 0), 0)
              return (
                <div key={col.id}
                  onDragOver={e => { e.preventDefault(); setDragOver(col.id) }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={e => handleDrop(e, col)}
                  style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', minHeight:0,
                    background: dragOver === col.id ? 'rgba(240,165,0,0.04)' : 'transparent',
                    border: `1px solid ${dragOver === col.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius:12, transition:'all 0.15s' }}>
                  {/* Column header */}
                  <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
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
                  <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:8 }}>
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
        {pipeTab === 'rate-check' && <RateNegotiation />}
      </div>
    </div>
  )
}

// ── Invoice Status Badge ─────────────────────────────────────────────────────
export function InvoiceStatusBadge({ status }) {
  const styles = {
    Unpaid:   { bg:'rgba(240,165,0,0.12)', color:'#f0a500', label:'Sent' },
    Sent:     { bg:'rgba(240,165,0,0.12)', color:'#f0a500', label:'Sent' },
    Viewed:   { bg:'rgba(59,130,246,0.12)', color:'#3b82f6', label:'Viewed' },
    Paid:     { bg:'rgba(34,197,94,0.12)', color:'#22c55e', label:'Paid' },
    Overdue:  { bg:'rgba(239,68,68,0.12)', color:'#ef4444', label:'Overdue' },
    Factored: { bg:'rgba(139,92,246,0.12)', color:'#8b5cf6', label:'Factored' },
    Disputed: { bg:'rgba(239,68,68,0.12)', color:'#ef4444', label:'Disputed' },
  }
  const st = styles[status] || styles.Unpaid
  return (
    <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:8, background:st.bg, color:st.color, letterSpacing:0.5 }}>
      {st.label}
    </span>
  )
}

// ── Load Detail Drawer ─────────────────────────────────────────────────────
export function LoadDetailDrawer({ loadId, onClose }) {
  const { loads, invoices, checkCalls, updateLoadStatus, updateInvoiceStatus, removeLoad, drivers, fuelCostPerMile, company: carrierCompany } = useCarrier()
  const { showToast } = useApp()
  const [invoiceSending, setInvoiceSending] = useState(false)
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false)
  const [showTONU, setShowTONU] = useState(false)
  const [showFactorPrompt, setShowFactorPrompt] = useState(false)
  const [tonuFee, setTonuFee] = useState('250')
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

  // Auto-invoice: generate and send invoice via API
  const handleAutoInvoice = async () => {
    setInvoiceSending(true)
    try {
      const res = await apiFetch('/api/auto-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loadId: load._dbId || load.id }),
      })
      const data = await res.json()
      if (data.success) {
        updateLoadStatus(load.loadId || load.id, 'Invoiced')
        showToast('', 'Invoice Sent!', `${data.invoiceNumber} — ${data.emailSent ? 'Email sent to broker' : 'Invoice created (no broker email on file)'}`)
        setShowInvoicePrompt(false)
      } else {
        showToast('', 'Invoice Error', data.error || 'Could not generate invoice')
      }
    } catch (err) {
      // Fallback: still create local invoice via status update
      updateLoadStatus(load.loadId || load.id, 'Invoiced')
      showToast('', 'Invoice Created', `${load.loadId} — created locally (API unavailable)`)
      setShowInvoicePrompt(false)
    }
    setInvoiceSending(false)
  }

  // Show invoice prompt after advancing to Delivered
  const handleAdvanceToDelivered = () => {
    updateLoadStatus(load.loadId || load.id, 'Delivered')
    showToast('', 'Status Updated', `${load.loadId} → Delivered`)
    setShowInvoicePrompt(true)
  }

  return (
    <>
      <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:900 }} />
      <div style={{ position:'fixed', top:48, right:0, bottom:0, width:480, maxWidth:'100vw', background:'var(--bg)',
        borderLeft:'1px solid var(--border)', zIndex:901, display:'flex', flexDirection:'column',
        boxShadow:'-8px 0 32px rgba(0,0,0,0.3)', animation:'slideInRight 0.2s ease' }}>
        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontFamily:'monospace', fontSize:14, fontWeight:700, color:'var(--accent)' }}>{load.loadId || load.id}</span>
              {load.load_source === 'amazon_relay' && (
                <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(255,153,0,0.15)', color:'#ff9900' }}>AMAZON RELAY</span>
              )}
            </div>
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
            {nextStatus && nextStatus !== 'Delivered' && (
              <button className="btn btn-primary" style={{ fontSize:11, flex:1 }}
                onClick={() => { updateLoadStatus(load.loadId || load.id, nextStatus); showToast('','Status Updated', `${load.loadId} → ${nextStatus}`) }}>
                Advance → {nextStatus}
              </button>
            )}
            {load.status !== 'Cancelled' && load.status !== 'Paid' && (
              <button className="btn btn-ghost" style={{ fontSize:11, color:'var(--warning)', border:'1px solid rgba(240,165,0,0.25)', background:'rgba(240,165,0,0.06)' }}
                onClick={() => setShowTONU(true)}>
                Cancel Load
              </button>
            )}
            {nextStatus === 'Delivered' && (
              <button className="btn btn-primary" style={{ fontSize:11, flex:1 }}
                onClick={handleAdvanceToDelivered}>
                Advance → Delivered
              </button>
            )}
            {load.status === 'Delivered' && !linkedInvoice && (
              <button className="btn btn-ghost" style={{ fontSize:11, flex:1, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.25)', color:'var(--accent)' }}
                onClick={() => setShowInvoicePrompt(true)} disabled={invoiceSending}>
                {invoiceSending ? 'Sending...' : 'Generate & Send Invoice'}
              </button>
            )}
            <button className="btn btn-ghost" style={{ fontSize:11, color:'var(--danger)', border:'1px solid rgba(239,68,68,0.25)', background:'rgba(239,68,68,0.06)' }}
              onClick={() => {
                if (window.confirm(`Delete load ${load.loadId || load.id}? This cannot be undone.`)) {
                  removeLoad(load.loadId || load.id)
                  showToast('', 'Load Deleted', `${load.loadId || load.id} removed`)
                  onClose()
                }
              }}>
              Delete Load
            </button>
          </div>

          {/* Auto-Invoice Prompt */}
          {showInvoicePrompt && !linkedInvoice && (
            <div style={{ background:'linear-gradient(135deg,rgba(240,165,0,0.08),rgba(0,212,170,0.04))', border:'1px solid rgba(240,165,0,0.25)', borderRadius:12, padding:16 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
                <span style={{ fontSize:18 }}>&#9993;</span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>Generate & Send Invoice?</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Auto-generate a professional invoice and email it to the broker</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary" style={{ fontSize:11, flex:1 }} onClick={handleAutoInvoice} disabled={invoiceSending}>
                  {invoiceSending ? 'Generating...' : 'Yes, Send Invoice'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setShowInvoicePrompt(false)}>
                  Not Now
                </button>
              </div>
            </div>
          )}

          {/* TONU — Truck Order Not Used */}
          {showTONU && (
            <div style={{ background:'linear-gradient(135deg,rgba(239,68,68,0.06),rgba(240,165,0,0.04))', border:'1px solid rgba(239,68,68,0.25)', borderRadius:12, padding:16 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--danger)', marginBottom:4 }}>Cancel Load — {load.loadId}</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12 }}>If the broker cancelled after dispatch, you can charge a TONU (Truck Order Not Used) fee.</div>
              <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
                <label style={{ fontSize:11, color:'var(--muted)', fontWeight:600, flexShrink:0 }}>TONU Fee ($)</label>
                <input type="number" value={tonuFee} onChange={e => setTonuFee(e.target.value)} placeholder="250"
                  style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' }} />
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary" style={{ fontSize:11, flex:1, background:'var(--danger)' }}
                  onClick={async () => {
                    const fee = parseFloat(tonuFee) || 0
                    updateLoadStatus(load.loadId || load.id, 'Cancelled')
                    if (fee > 0) {
                      // Generate TONU invoice via API
                      try {
                        await apiFetch('/api/auto-invoice', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ loadId: load._dbId || load.id, tonuFee: fee, isTONU: true }),
                        })
                      } catch {}
                      showToast('', 'Load Cancelled + TONU', `${load.loadId} cancelled — $${fee} TONU fee invoiced to ${load.broker || 'broker'}`)
                    } else {
                      showToast('', 'Load Cancelled', `${load.loadId} marked as cancelled`)
                    }
                    setShowTONU(false)
                  }}>
                  Cancel + Invoice TONU ${tonuFee || '0'}
                </button>
                <button className="btn btn-ghost" style={{ fontSize:11 }}
                  onClick={() => {
                    updateLoadStatus(load.loadId || load.id, 'Cancelled')
                    showToast('', 'Load Cancelled', `${load.loadId} cancelled — no TONU fee`)
                    setShowTONU(false)
                  }}>
                  Cancel (No Fee)
                </button>
              </div>
              <button onClick={() => setShowTONU(false)} style={{ marginTop:8, fontSize:11, color:'var(--muted)', background:'none', border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                Go Back
              </button>
            </div>
          )}

          {/* Rate Analysis Badge */}
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <RateBadge rpm={rpm} equipment={load.equipment} />
            <button className="btn btn-ghost" style={{ fontSize:11, padding:'6px 12px' }}
              onClick={() => { const url = new URL(window.location); url.searchParams.set('rateCheck', JSON.stringify({ origin: load.origin, dest: load.dest || load.destination, miles: load.miles, gross, equipment: load.equipment })); showToast('', 'Rate Check', 'Open Rate Check tab in Loads → Rate Check to analyze this rate') }}>
              <Ic icon={Target} size={12} /> Analyze Rate
            </button>
          </div>

          {/* Details grid */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>Load Details</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { label:'Broker', value: load.broker || '—', highlight: load.load_source === 'amazon_relay' ? '#ff9900' : null },
                { label:'Driver', value: load.driver || 'Unassigned' },
                { label:'Ref #', value: load.amazon_block_id || load.refNum || load.ref_number || '—' },
                { label:'Equipment', value: load.equipment || '—' },
                { label:'Weight', value: load.weight ? `${load.weight} lbs` : '—' },
                { label:'Commodity', value: load.commodity || '—' },
                { label:'Pickup', value: load.pickup || '—' },
                { label:'Delivery', value: load.delivery || '—' },
                ...(load.load_source === 'amazon_relay' ? [
                  { label:'Source', value: 'Amazon Relay', highlight: '#ff9900' },
                  { label:'Payment Terms', value: 'Biweekly', highlight: '#ff9900' },
                ] : []),
              ].map(d => (
                <div key={d.label}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{d.label}</div>
                  <div style={{ fontSize:12, fontWeight:600, color: d.highlight || 'inherit' }}>{d.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Invoice */}
          {linkedInvoice && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1 }}>Invoice</div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>{linkedInvoice.invoice_number}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>${Number(linkedInvoice.amount || 0).toLocaleString()} {linkedInvoice.dueDate ? `· Due ${linkedInvoice.dueDate}` : ''}</div>
                </div>
                <InvoiceStatusBadge status={linkedInvoice.status} />
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <button className="btn btn-ghost" style={{ fontSize:10, padding:'4px 12px' }}
                  onClick={() => { window.open(`/api/invoice-pdf?invoiceId=${encodeURIComponent(linkedInvoice._dbId || linkedInvoice.id)}`, '_blank') }}>
                  View Invoice
                </button>
                <button className="btn btn-ghost" style={{ fontSize:10, padding:'4px 12px' }}
                  onClick={() => handleAutoInvoice()}>
                  Resend to Broker
                </button>
                {linkedInvoice.status === 'Unpaid' && (
                  <button className="btn btn-ghost" style={{ fontSize:10, padding:'4px 12px', color:'var(--accent2)', borderColor:'rgba(139,92,246,0.3)' }}
                    onClick={() => setShowFactorPrompt(true)}>
                    Factor This Invoice
                  </button>
                )}
              </div>

              {/* Factor Invoice Prompt */}
              {showFactorPrompt && linkedInvoice.status === 'Unpaid' && (() => {
                const factorCompany = carrierCompany?.factoring_company || ''
                const factorRate = parseFloat(carrierCompany?.factoring_rate) || 2.5
                const invAmount = Number(linkedInvoice.amount || 0)
                const fee = Math.round(invAmount * (factorRate / 100) * 100) / 100
                const net = invAmount - fee
                return (
                  <div style={{ marginTop:12, background:'linear-gradient(135deg,rgba(139,92,246,0.08),rgba(240,165,0,0.04))', border:'1px solid rgba(139,92,246,0.25)', borderRadius:12, padding:14 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:'var(--accent2)', marginBottom:10 }}>Submit to Factoring</div>
                    {!factorCompany ? (
                      <div style={{ fontSize:11, color:'var(--muted)' }}>
                        No factoring company set up. Go to <b>Financials → Factoring → Settings</b> to select your factor.
                      </div>
                    ) : (
                      <>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
                          {[
                            { label:'Factor', value: factorCompany },
                            { label:'Rate', value: factorRate + '%' },
                            { label:'Invoice Amount', value: '$' + invAmount.toLocaleString() },
                            { label:'Fee', value: '−$' + fee.toLocaleString() },
                          ].map(item => (
                            <div key={item.label} style={{ padding:'6px 10px', background:'var(--surface2)', borderRadius:8 }}>
                              <div style={{ fontSize:9, color:'var(--muted)', fontWeight:600 }}>{item.label}</div>
                              <div style={{ fontSize:12, fontWeight:700 }}>{item.value}</div>
                            </div>
                          ))}
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 10px', background:'rgba(139,92,246,0.1)', borderRadius:8, marginBottom:10 }}>
                          <span style={{ fontSize:11, fontWeight:600 }}>You Receive (24hr deposit)</span>
                          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--accent2)' }}>${net.toLocaleString()}</span>
                        </div>
                        <div style={{ fontSize:10, color:'var(--muted)', marginBottom:10 }}>
                          Documents included: Invoice + Rate Con + BOL + POD (if uploaded)
                        </div>
                        <div style={{ display:'flex', gap:8 }}>
                          <button className="btn btn-primary" style={{ flex:1, fontSize:11, padding:'8px 0', background:'var(--accent2)' }}
                            onClick={async () => {
                              try {
                                const res = await apiFetch('/api/factor-invoice', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    invoiceId: linkedInvoice._dbId || linkedInvoice.id,
                                    factoringCompany: factorCompany,
                                    factoringRate: factorRate,
                                  }),
                                })
                                const data = await res.json()
                                if (data.success) {
                                  updateInvoiceStatus(linkedInvoice.id || linkedInvoice.invoice_number, 'Factored')
                                  showToast('', 'Invoice Factored!', `${data.invoiceNumber} → ${data.sentTo} · $${data.net.toLocaleString()} depositing in 24hrs`)
                                } else {
                                  updateInvoiceStatus(linkedInvoice.id || linkedInvoice.invoice_number, 'Factored')
                                  showToast('', 'Invoice Factored', `${linkedInvoice.invoice_number} marked as factored (email not sent: ${data.error || 'API unavailable'})`)
                                }
                              } catch {
                                updateInvoiceStatus(linkedInvoice.id || linkedInvoice.invoice_number, 'Factored')
                                showToast('', 'Invoice Factored', `${linkedInvoice.invoice_number} → ${factorCompany} · marked locally`)
                              }
                              setShowFactorPrompt(false)
                            }}>
                            Submit to {factorCompany}
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize:11, padding:'8px 12px' }}
                            onClick={() => setShowFactorPrompt(false)}>
                            Cancel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )
              })()}
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
            {(() => {
              const driverRec = (drivers || []).find(d => (d.full_name || d.name) === load.driver)
              const payModel = driverRec?.pay_model || 'percent'
              const payRate = parseFloat(driverRec?.pay_rate) || 28
              const miles = load.miles || 0
              const driverPay = payModel === 'permile' ? Math.round(miles * payRate) : payModel === 'flat' ? Math.round(payRate) : Math.round(gross * (payRate / 100))
              const payLabel = payModel === 'permile' ? `$${payRate}/mi` : payModel === 'flat' ? `$${payRate}/load` : `${payRate}%`
              const fuelRate = fuelCostPerMile || 0.22
              const fuelCost = Math.round(miles * fuelRate)
              const estNet = gross - driverPay - fuelCost
              return [
                { label:'Gross Revenue', value:`$${gross.toLocaleString()}`, color:'var(--accent)' },
                { label:`Est. Driver Pay (${payLabel})`, value:`-$${driverPay.toLocaleString()}`, color:'var(--danger)' },
                { label:`Est. Fuel ($${fuelRate.toFixed(2)}/mi)`, value:`-$${fuelCost.toLocaleString()}`, color:'var(--danger)' },
                { label:'Est. Net', value:`$${estNet.toLocaleString()}`, color:'var(--success)', bold:true },
              ]
            })().map(r => (
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
