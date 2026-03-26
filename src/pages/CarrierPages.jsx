// ═══════════════════════════════════════════════════════════════
// CarrierPages — Barrel export + CarrierDashboard
// Split into domain files under ./carrier/ for maintainability
// ═══════════════════════════════════════════════════════════════

import React, { useState, useMemo } from 'react'
import {
  DollarSign, AlertTriangle, CheckCircle, Clock, MapPin, Receipt, Phone, Package, Truck, Users,
  Plus, Activity, TrendingUp, Bot, Briefcase, AlertCircle, Flag
} from 'lucide-react'
import { useApp } from '../context/AppContext'
import { useCarrier } from '../context/CarrierContext'
import { Ic, S, StatCard, AiBanner } from './carrier/shared'

// Domain files are imported directly from their source modules (not re-exported here)
// to prevent barrel-file bundling that causes chunk initialization (TDZ) errors

// ─── AI DASHBOARD ─────────────────────────────────────────────────────────────
export function CarrierDashboard() {
  const { navigatePage, showToast, subscription } = useApp()
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
  const deliveredLoads = ctx.deliveredLoads || []
  const checkCalls = ctx.checkCalls || {}

  const totalMiles = loads.reduce((s, l) => s + (Number(l.miles) || 0), 0)
  const netProfit = totalRevenue - totalExpenses
  const fmtCurrency = (v) => v >= 1000 ? '$' + (v / 1000).toFixed(1) + 'K' : '$' + v.toLocaleString()
  const [dismissed, setDismissed] = useState([])

  // ── Computed: Today's tasks ──
  const today = new Date().toISOString().split('T')[0]
  const todayTasks = useMemo(() => {
    const tasks = []
    // Loads arriving today
    loads.forEach(l => {
      if (l.pickup_date && l.pickup_date.startsWith(today)) tasks.push({ icon: MapPin, color: 'var(--accent2)', text: `Pickup: ${l.loadId || l.load_id} — ${l.origin || ''}`, type: 'pickup' })
      if (l.delivery_date && l.delivery_date.startsWith(today)) tasks.push({ icon: Flag, color: 'var(--success)', text: `Delivery: ${l.loadId || l.load_id} — ${l.destination || l.dest || ''}`, type: 'delivery' })
    })
    // Overdue invoices
    unpaidInvoices.forEach(inv => {
      if (inv.due_date && inv.due_date < today) tasks.push({ icon: Receipt, color: 'var(--danger)', text: `Overdue: ${inv.invoice_number || inv.id} — $${(inv.amount || 0).toLocaleString()}`, type: 'overdue' })
    })
    // Expiring docs (drivers medical card within 30 days)
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
    drivers.forEach(d => {
      if (d.medical_card_expiry && d.medical_card_expiry <= in30) tasks.push({ icon: AlertCircle, color: 'var(--warning)', text: `Medical card expiring: ${d.name || 'Driver'} — ${d.medical_card_expiry}`, type: 'doc' })
    })
    // Pending check calls for active loads
    activeLoads.forEach(l => {
      const calls = checkCalls[l.loadId] || checkCalls[l.load_number] || []
      if (calls.length === 0 && (l.status === 'In Transit' || l.status === 'Loaded')) tasks.push({ icon: Phone, color: 'var(--accent3)', text: `Check call needed: ${l.loadId || l.load_id}`, type: 'checkcall' })
    })
    return tasks
  }, [loads, unpaidInvoices, drivers, activeLoads, checkCalls, today])

  // ── Computed: Week revenue ──
  const weekRevenue = useMemo(() => {
    const now = new Date()
    const weekAgo = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0]
    return deliveredLoads.filter(l => l.delivery_date && l.delivery_date >= weekAgo).reduce((s, l) => s + (l.gross || l.gross_pay || 0), 0)
  }, [deliveredLoads])

  // ── Computed: Unpaid total ──
  const unpaidTotal = unpaidInvoices.reduce((s, i) => s + (Number(i.amount) || 0), 0)

  // ── Computed: Month miles ──
  const monthMiles = useMemo(() => {
    const monthStart = new Date(); monthStart.setDate(1); const ms = monthStart.toISOString().split('T')[0]
    return loads.filter(l => (l.pickup_date || '') >= ms).reduce((s, l) => s + (Number(l.miles) || 0), 0)
  }, [loads])

  // ── Computed: Alerts ──
  const alerts = useMemo(() => {
    const a = []
    const in30 = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
    // Trial ending soon
    if (subscription?.isTrial && subscription?.trialDaysLeft && subscription.trialDaysLeft <= 7) a.push({ color: 'var(--warning)', icon: Clock, text: `Trial ending in ${subscription.trialDaysLeft} day${subscription.trialDaysLeft !== 1 ? 's' : ''} — upgrade to keep access`, severity: 'warning' })
    // Docs expiring within 30 days
    drivers.forEach(d => {
      if (d.medical_card_expiry && d.medical_card_expiry <= in30 && d.medical_card_expiry >= today) a.push({ color: 'var(--warning)', icon: AlertCircle, text: `${d.name || 'Driver'}'s medical card expires ${d.medical_card_expiry}`, severity: 'warning' })
      if (d.medical_card_expiry && d.medical_card_expiry < today) a.push({ color: 'var(--danger)', icon: AlertTriangle, text: `${d.name || 'Driver'}'s medical card EXPIRED ${d.medical_card_expiry}`, severity: 'critical' })
    })
    // Unpaid invoices > 30 days
    const ago30 = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
    unpaidInvoices.forEach(inv => {
      if (inv.invoice_date && inv.invoice_date < ago30) a.push({ color: 'var(--danger)', icon: Receipt, text: `Invoice ${inv.invoice_number || inv.id} unpaid for 30+ days — $${(inv.amount || 0).toLocaleString()}`, severity: 'critical' })
    })
    return a
  }, [subscription, drivers, unpaidInvoices, today])

  // ── Computed: Recent activity ──
  const recentActivity = useMemo(() => {
    const activity = []
    deliveredLoads.slice(0, 3).forEach(l => activity.push({ icon: CheckCircle, color: 'var(--success)', text: `Load ${l.loadId || l.load_id} delivered`, time: l.delivery || '', ts: l.delivery_date || '' }))
    invoices.slice(0, 2).forEach(i => activity.push({ icon: Receipt, color: 'var(--accent)', text: `Invoice ${i.invoice_number || i.id} — $${(i.amount || 0).toLocaleString()} (${i.status})`, time: i.date || '', ts: i.invoice_date || '' }))
    expenses.slice(0, 2).forEach(e => activity.push({ icon: DollarSign, color: 'var(--accent2)', text: `Expense: ${e.description || e.category || '—'} — $${(e.amount || 0).toLocaleString()}`, time: e.date || '', ts: e.date || '' }))
    activeLoads.slice(0, 2).forEach(l => activity.push({ icon: Truck, color: 'var(--accent3)', text: `Load ${l.loadId || l.load_id} ${l.status}`, time: l.pickup || '', ts: l.pickup_date || '' }))
    return activity.sort((a, b) => (b.ts || '').localeCompare(a.ts || '')).slice(0, 5)
  }, [deliveredLoads, invoices, expenses, activeLoads])

  // ── Computed: Broker stats ──
  const brokerStats = useMemo(() => {
    const stats = {}
    loads.forEach(l => { const name = l.broker_name || l.broker || 'Unknown'; if (!stats[name]) stats[name] = { name, loads: 0, revenue: 0 }; stats[name].loads++; stats[name].revenue += Number(l.rate) || Number(l.gross) || 0 })
    return Object.values(stats).sort((a, b) => b.revenue - a.revenue).slice(0, 5)
  }, [loads])

  const fuelExpenses = expenses.filter(e => (e.category || '').toLowerCase().includes('fuel')).reduce((s, e) => s + (Number(e.amount) || 0), 0)

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      {/* ── Alerts Banner ── */}
      {alerts.length > 0 && (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {alerts.map((a, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', borderRadius:10, background: a.severity === 'critical' ? 'rgba(239,68,68,0.08)' : 'rgba(240,165,0,0.06)', border: `1px solid ${a.severity === 'critical' ? 'rgba(239,68,68,0.2)' : 'rgba(240,165,0,0.2)'}` }}>
              <Ic icon={a.icon} size={14} color={a.color} />
              <div style={{ flex:1, fontSize:12, color:a.color, fontWeight:600 }}>{a.text}</div>
              <button className="btn btn-ghost" style={{ fontSize:10, padding:'3px 8px' }} onClick={() => setDismissed(d => [...d, `alert-${i}`])}>Dismiss</button>
            </div>
          ))}
        </div>
      )}

      <AiBanner
        title={activeLoads.length > 0 ? `AI Engine Active — ${activeLoads.length} load${activeLoads.length > 1 ? 's' : ''} in transit` : 'AI Engine Active — Add loads to get started'}
        sub={totalRevenue > 0 ? `Revenue MTD: ${fmtCurrency(totalRevenue)} · ${loads.length} total loads · ${activeLoads.length} active` : 'Start by adding loads, drivers, and vehicles to see insights'}
        action="Smart Dispatch →"
        onAction={() => navigatePage('carrier-dispatch')}
      />

      {/* ── Quick Stats Row (4 mini cards) ── */}
      <div style={S.grid(4)}>
        <StatCard label="Active Loads" value={String(activeLoads.length)} change={activeLoads.length > 0 ? `${activeLoads.filter(l => l.status === 'In Transit').length} in transit` : 'No active loads'} color="var(--accent)" changeType="neutral" />
        <StatCard label="This Week Revenue" value={weekRevenue > 0 ? fmtCurrency(weekRevenue) : '$0'} change={deliveredLoads.length > 0 ? `${deliveredLoads.length} delivered` : 'No deliveries yet'} color="var(--success)" changeType="up" />
        <StatCard label="Unpaid Invoices" value={unpaidTotal > 0 ? fmtCurrency(unpaidTotal) : '$0'} change={unpaidInvoices.length > 0 ? `${unpaidInvoices.length} pending` : 'All paid'} color={unpaidInvoices.length > 0 ? 'var(--warning)' : 'var(--success)'} changeType={unpaidInvoices.length > 0 ? 'down' : 'up'} />
        <StatCard label="Miles This Month" value={monthMiles > 0 ? monthMiles.toLocaleString() : '0'} change={totalMiles > 0 ? `${totalMiles.toLocaleString()} total` : 'No miles yet'} color="var(--accent2)" changeType="neutral" />
      </div>

      {/* ── Middle Row: Today's Tasks + Recent Activity ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1fr', gap:16 }}>
        {/* Today's Tasks */}
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}><Ic icon={Clock} /> Today's Tasks</div>
            <span style={S.badge(todayTasks.length > 0 ? 'var(--accent)' : 'var(--success)')}>{todayTasks.length > 0 ? `${todayTasks.length} items` : 'Clear'}</span>
          </div>
          <div>
            {todayTasks.length === 0 ? (
              <div style={{ padding:24, textAlign:'center', color:'var(--success)', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}><Ic icon={CheckCircle} size={13} color="var(--success)" /> Nothing due today</div>
            ) : todayTasks.slice(0, 6).map((t, i) => (
              <div key={i} style={{ padding:'9px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:26, height:26, borderRadius:7, background:t.color + '12', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ic icon={t.icon} size={12} color={t.color} /></div>
                <div style={{ fontSize:12, flex:1, lineHeight:1.4 }}>{t.text}</div>
                <span style={{ ...S.tag(t.color), fontSize:9 }}>{t.type.toUpperCase()}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}><Ic icon={Activity} /> Recent Activity</div>
          </div>
          <div>
            {recentActivity.length === 0 ? (
              <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:12 }}>Activity appears as you operate</div>
            ) : recentActivity.map((a, i) => (
              <div key={i} style={{ padding:'9px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:26, height:26, borderRadius:7, background:a.color + '12', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ic icon={a.icon} size={12} color={a.color} /></div>
                <div style={{ flex:1, fontSize:12, lineHeight:1.4 }}>{a.text}</div>
                <div style={{ fontSize:10, color:'var(--muted)', flexShrink:0 }}>{a.time}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom Row: Financials + Broker Leaderboard ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1.6fr 1fr', gap:16 }}>
        {/* AI Recommendations + Financials */}
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* AI Recommendations */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Bot} /> AI Recommendations</div>
              <span style={S.badge('var(--accent)')}>{loads.length === 0 && drivers.length === 0 ? 'Setup' : unpaidInvoices.length > 0 ? `${unpaidInvoices.length} action${unpaidInvoices.length > 1 ? 's' : ''}` : 'Active'}</span>
            </div>
            <div>
              {(() => {
                const recs = []
                let id = 1
                if (loads.length === 0) recs.push({ id: id++, type:'GET STARTED', color:'var(--accent)', icon:Plus, title:'Add your first load to start tracking revenue', sub:'Go to Loads to create a new shipment', action:'Add Load', onAction:() => navigatePage('carrier-loads') })
                if (drivers.length === 0) recs.push({ id: id++, type:'DRIVERS', color:'var(--accent2)', icon:Users, title:'Add drivers to enable dispatch', sub:'Go to Drivers to add your team', action:'Add Driver', onAction:() => navigatePage('carrier-drivers') })
                if (unpaidInvoices.length > 0) recs.push({ id: id++, type:'INVOICES', color:'var(--warning)', icon:Receipt, title:`${unpaidInvoices.length} unpaid invoice${unpaidInvoices.length > 1 ? 's' : ''} ($${unpaidTotal.toLocaleString()})`, sub:'Follow up on outstanding payments', action:'View', onAction:() => navigatePage('carrier-invoicing') })
                if (activeLoads.length > 0) recs.push({ id: id++, type:'IN TRANSIT', color:'var(--accent3)', icon:Truck, title:`${activeLoads.length} active load${activeLoads.length > 1 ? 's' : ''}`, sub:'Monitor dispatch', action:'Track', onAction:() => navigatePage('carrier-dispatch') })
                const filtered = recs.filter(r => !dismissed.includes(r.id))
                if (filtered.length === 0) return <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:13 }}>All caught up!</div>
                return filtered.map(r => (
                  <div key={r.id} style={{ ...S.row, borderBottom:'1px solid var(--border)' }} onMouseOver={e => e.currentTarget.style.background='var(--surface2)'} onMouseOut={e => e.currentTarget.style.background='transparent'}>
                    <div style={{ fontSize:22 }}>{typeof r.icon === 'string' ? r.icon : <r.icon size={22} />}</div>
                    <div style={{ flex:1 }}><div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:3 }}><span style={S.tag(r.color)}>{r.type}</span><span style={{ fontSize:12, fontWeight:700 }}>{r.title}</span></div><div style={{ fontSize:11, color:'var(--muted)' }}>{r.sub}</div></div>
                    <div style={{ display:'flex', gap:6 }}>
                      <button className="btn btn-primary" style={{ fontSize:11, padding:'5px 10px' }} onClick={() => r.onAction?.()}>{r.action}</button>
                      <button className="btn btn-ghost" style={{ fontSize:11, padding:'5px 8px' }} onClick={() => setDismissed(d => [...d, r.id])}>✕</button>
                    </div>
                  </div>
                ))
              })()}
            </div>
          </div>

          {/* Financials Overview */}
          <div style={S.panel}>
            <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={TrendingUp} /> Financials Overview</div></div>
            <div style={S.panelBody}>
              {totalRevenue > 0 || totalExpenses > 0 ? [
                { label:'Gross Revenue', value:fmtCurrency(totalRevenue), color:'var(--accent)' },
                { label:'Fuel Costs', value:fuelExpenses > 0 ? `−${fmtCurrency(fuelExpenses)}` : '$0', color:'var(--danger)' },
                { label:'Total Expenses', value:totalExpenses > 0 ? `−${fmtCurrency(totalExpenses)}` : '$0', color:'var(--danger)' },
                { label:'Net Profit', value:netProfit >= 0 ? fmtCurrency(netProfit) : `−${fmtCurrency(Math.abs(netProfit))}`, color:netProfit >= 0 ? 'var(--success)' : 'var(--danger)', bold:true },
              ].map(item => (
                <div key={item.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{item.label}</div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:item.bold ? 22 : 18, color:item.color }}>{item.value}</div>
                </div>
              )) : <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No financial data yet. Add loads to see projections.</div>}
            </div>
          </div>
        </div>

        {/* Broker Leaderboard */}
        <div style={S.panel}>
          <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Briefcase} /> Broker Leaderboard</div></div>
          <div>
            {brokerStats.length > 0 ? brokerStats.map(b => (
              <div key={b.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 16px', borderBottom:'1px solid var(--border)' }}>
                <div style={{ flex:1 }}><div style={{ fontSize:12, fontWeight:700 }}>{b.name}</div><div style={{ fontSize:11, color:'var(--muted)' }}>{b.loads} load{b.loads > 1 ? 's' : ''} · ${(b.revenue||0).toLocaleString()}</div></div>
                <span style={S.badge('var(--accent)')}>{b.loads} loads</span>
              </div>
            )) : <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No broker data yet. Add loads with broker info.</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
