import React, { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react'
import { Target, Bot, TrendingUp, AlertTriangle, CheckCircle, XCircle, MessageSquare, Zap, Shield, Package, DollarSign, Truck, ArrowUpRight, ArrowDownRight, Activity, Clock, Plus, Trash2, Upload, FileText, Image, Eye, MapPin, Star, Bell, Share2, Send } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { apiFetch } from '../../lib/api'
import { uploadFile } from '../../lib/storage'
import { createDocument, fetchDocuments, deleteDocument } from '../../lib/database'
import { Ic, HubTabBar } from './shared'
import { DispatchTab } from './DispatchTab'
import { QDispatchAI } from './QDispatchAI'

// Lazy-load LoadBoard components to prevent pulling entire LoadBoard chunk into CarrierLayout
const lazyN = (fn, name) => lazy(() => fn().then(m => ({ default: m[name] })))
const SmartDispatch = lazyN(() => import('../../pages/carrier/LoadBoard'), 'SmartDispatch')
const CommandCenter = lazyN(() => import('../../pages/carrier/LoadBoard'), 'CommandCenter')
const CheckCallCenter = lazyN(() => import('../../pages/carrier/LoadBoard'), 'CheckCallCenter')
const LaneIntel = lazyN(() => import('../../pages/carrier/LoadBoard'), 'LaneIntel')
const RateNegotiation = lazyN(() => import('../../pages/carrier/LoadBoard'), 'RateNegotiation')
// Inline RateBadge to avoid importing entire LoadBoard chunk
function RateBadge({ rpm, equipment, onClick, compact }) {
  const mktAvg = { 'Dry Van': 2.50, 'Reefer': 2.90, 'Flatbed': 3.10, 'Step Deck': 3.30, 'Power Only': 2.10, 'Tanker': 3.30 }
  const avg = mktAvg[equipment] || 2.50
  const rpmNum = Number(rpm) || 0
  if (rpmNum <= 0) return null
  let color, label, emoji
  if (rpmNum >= avg * 1.1) { color = 'var(--success)'; label = 'Good'; emoji = '\u{1F7E2}' }
  else if (rpmNum >= avg * 0.92) { color = 'var(--accent)'; label = 'Fair'; emoji = '\u{1F7E1}' }
  else { color = 'var(--danger)'; label = 'Below'; emoji = '\u{1F534}' }
  if (compact) return <span onClick={onClick} title={label + ' rate'} style={{ fontSize: 10, cursor: onClick ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 2 }}>{emoji}</span>
  return (<div onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, background: color + '12', border: '1px solid ' + color + '25', cursor: onClick ? 'pointer' : 'default', fontSize: 10, fontWeight: 700, color }}>{emoji} {label} &middot; ${rpmNum.toFixed(2)}/mi{onClick && <span style={{ fontSize: 9, opacity: 0.7 }}> Analyze</span>}</div>)
}

// ── Q Load Intelligence Engine ───────────────────────────────────────────────
// Evaluates loads using real trucking profit logic — not just top-line rate.
function qEvaluateLoad(load, { fuelCostPerMile, drivers, brokerStats, allLoads }) {
  const gross = load.gross || load.gross_pay || load.rate_total || 0
  const miles = parseFloat(load.miles) || 0
  const weight = parseFloat(load.weight) || 0
  const rpm = miles > 0 ? gross / miles : 0
  const fuelRate = fuelCostPerMile || 0.55

  // Estimate driver pay (use assigned driver's rate or default 50%)
  const driverRec = (drivers || []).find(d => (d.full_name || d.name) === load.driver)
  const payModel = driverRec?.pay_model || 'percent'
  const payRate = parseFloat(driverRec?.pay_rate) || 50
  const driverPay = payModel === 'permile' ? miles * payRate : payModel === 'flat' ? payRate : gross * (payRate / 100)

  // Fuel cost
  const fuelCost = miles * fuelRate

  // Estimated profit
  const estProfit = gross - driverPay - fuelCost
  const profitPerMile = miles > 0 ? estProfit / miles : 0

  // Profit per day (assume 500 mi/day for transit, + 0.5 day for pickup/delivery)
  const transitDays = miles > 0 ? Math.max(miles / 500, 0.5) + 0.5 : 1
  const profitPerDay = estProfit / transitDays

  // Broker score (from brokerStats or heuristic)
  const brokerName = load.broker || load.broker_name || ''
  const brokerData = brokerStats?.[brokerName]
  let brokerScore = 'B' // default
  let brokerReliability = 'Unknown'
  if (brokerData) {
    const payRate = brokerData.onTimePay || 0.8
    const loadCount = brokerData.totalLoads || 0
    if (payRate >= 0.9 && loadCount >= 5) { brokerScore = 'A'; brokerReliability = 'Reliable' }
    else if (payRate >= 0.75) { brokerScore = 'B'; brokerReliability = 'Average' }
    else { brokerScore = 'C'; brokerReliability = 'Risky' }
  } else {
    // Heuristic: known large brokers
    const knownGood = ['ch robinson','tql','schneider','jb hunt','xpo','echo','coyote','landstar']
    if (knownGood.some(b => brokerName.toLowerCase().includes(b))) { brokerScore = 'A'; brokerReliability = 'Major Broker' }
  }

  // Lane quality — check historical loads on this lane
  const origin3 = (load.origin || '').split(',')[0]?.substring(0,3)?.toUpperCase() || ''
  const dest3 = (load.dest || load.destination || '').split(',')[0]?.substring(0,3)?.toUpperCase() || ''
  const lanePrev = (allLoads || []).filter(l => {
    const lo = (l.origin || '').split(',')[0]?.substring(0,3)?.toUpperCase() || ''
    const ld = (l.dest || l.destination || '').split(',')[0]?.substring(0,3)?.toUpperCase() || ''
    return lo === origin3 && ld === dest3 && l.loadId !== load.loadId
  })
  const laneHistory = lanePrev.length
  const laneAvgRPM = lanePrev.length > 0 ? lanePrev.reduce((s,l) => s + ((l.gross || 0) / Math.max(l.miles || 1, 1)), 0) / lanePrev.length : 0

  // Weight analysis
  const isHeavy = weight > 37000
  const isLight = weight > 0 && weight <= 37000
  const weightNote = weight === 0 ? 'Weight not specified' : isHeavy ? 'Heavy load (>37K lbs)' : 'Light load'

  // Equipment/type detection
  const isPowerOnly = (load.equipment || '').toLowerCase().includes('power only')
  const isDropHook = (load.commodity || '').toLowerCase().includes('drop') || (load.notes || '').toLowerCase().includes('drop & hook')

  // Build decision
  let decision = 'ACCEPT'
  let confidence = 85
  const reasons = []
  const risks = []
  const advantages = []
  let targetRate = null

  // Profit thresholds
  if (estProfit <= 0) {
    decision = 'REJECT'
    confidence = 95
    reasons.push('Negative or zero estimated profit')
    risks.push('Operating at a loss')
  } else if (profitPerMile < 0.50) {
    decision = 'REJECT'
    confidence = 88
    reasons.push('Profit per mile below $0.50 threshold')
    risks.push('Inefficient use of equipment time')
  } else if (profitPerMile < 1.00 && profitPerDay < 400) {
    decision = 'NEGOTIATE'
    confidence = 80
    const targetPPM = 1.20
    targetRate = Math.round(gross + (targetPPM - profitPerMile) * miles)
    reasons.push('Profit per mile below target — counteroffer recommended')
  } else if (profitPerMile >= 1.50) {
    decision = 'ACCEPT'
    confidence = 92
    reasons.push('Strong profit margin')
    advantages.push('High profit per mile')
  }

  // Weight factor
  if (isHeavy) {
    if (decision === 'ACCEPT' && profitPerMile < 1.50) {
      decision = 'NEGOTIATE'
      confidence = Math.min(confidence, 78)
      targetRate = targetRate || Math.round(gross * 1.15)
      reasons.push('Heavy load requires higher rate to justify wear')
      risks.push('Increased fuel consumption and equipment wear')
    }
  } else if (isLight) {
    advantages.push('Light weight — less fuel, less wear')
    if (decision === 'ACCEPT') confidence = Math.min(confidence + 3, 98)
  }

  // Broker risk
  if (brokerScore === 'C') {
    if (decision === 'ACCEPT') decision = 'NEGOTIATE'
    risks.push('Low broker reliability score')
    confidence = Math.min(confidence, 75)
  } else if (brokerScore === 'A') {
    advantages.push(`${brokerReliability} — consistent payments`)
    if (decision === 'ACCEPT') confidence = Math.min(confidence + 5, 98)
  }

  // Lane quality
  if (laneHistory > 0) {
    if (rpm > laneAvgRPM * 1.1) advantages.push(`Above lane average ($${laneAvgRPM.toFixed(2)}/mi)`)
    else if (rpm < laneAvgRPM * 0.85 && decision !== 'REJECT') {
      if (decision === 'ACCEPT') decision = 'NEGOTIATE'
      targetRate = targetRate || Math.round(laneAvgRPM * miles)
      reasons.push(`Below lane average RPM ($${laneAvgRPM.toFixed(2)}/mi)`)
    }
  }

  // Power-only detection
  if (isPowerOnly) {
    advantages.push('Power-only — no trailer needed')
  }

  // Drop & hook
  if (isDropHook) {
    advantages.push('Drop & hook — faster turnaround')
    if (decision === 'ACCEPT') confidence = Math.min(confidence + 2, 98)
  }

  // Build summary reason
  let summaryReason = ''
  if (decision === 'ACCEPT') {
    summaryReason = advantages.length > 0 ? advantages.slice(0,2).join(', ') + '.' : 'Meets profit thresholds.'
    if (reasons.length > 0) summaryReason += ' ' + reasons[0]
  } else if (decision === 'REJECT') {
    summaryReason = reasons[0] || 'Does not meet minimum profit requirements.'
    if (risks.length > 0) summaryReason += ' ' + risks[0] + '.'
  } else {
    summaryReason = reasons[0] || 'Rate below optimal — broker likely flexible.'
    if (advantages.length > 0) summaryReason += ' ' + advantages[0] + '.'
  }

  return {
    decision, confidence, summaryReason, targetRate,
    estProfit: Math.round(estProfit), profitPerMile: profitPerMile.toFixed(2),
    profitPerDay: Math.round(profitPerDay), transitDays: transitDays.toFixed(1),
    fuelCost: Math.round(fuelCost), driverPay: Math.round(driverPay),
    brokerScore, brokerReliability, weightNote, isHeavy, isLight,
    laneHistory, laneAvgRPM: laneAvgRPM.toFixed(2),
    risks, advantages, rpm: rpm.toFixed(2),
    isPowerOnly, isDropHook
  }
}

const Q_DECISION_COLORS = {
  ACCEPT: { bg:'rgba(52,176,104,0.08)', border:'rgba(52,176,104,0.25)', color:'var(--success)', icon: CheckCircle },
  REJECT: { bg:'rgba(239,68,68,0.08)', border:'rgba(239,68,68,0.25)', color:'var(--danger)', icon: XCircle },
  NEGOTIATE: { bg:'rgba(240,165,0,0.08)', border:'rgba(240,165,0,0.25)', color:'var(--accent)', icon: MessageSquare },
}

function QDecisionBadge({ decision, compact }) {
  const d = Q_DECISION_COLORS[decision] || Q_DECISION_COLORS.ACCEPT
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:compact ? 3 : 4, fontSize: compact ? 8 : 10, fontWeight:800,
      padding: compact ? '1px 5px' : '2px 8px', borderRadius: compact ? 4 : 6,
      background:d.bg, color:d.color, border:`1px solid ${d.border}`, letterSpacing:0.5, whiteSpace:'nowrap' }}>
      <Ic icon={d.icon} size={compact ? 8 : 10} color={d.color} />
      {decision}
    </span>
  )
}

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
    const rate = parseFloat(driverRec?.pay_rate) || 50
    if (model === 'permile') return Math.round(miles * rate)
    if (model === 'flat') return Math.round(rate)
    return Math.round(gross * (rate / 100)) // percent
  }

  const getPayLabel = (driverName) => {
    const driverRec = (ctxDrivers || []).find(d => (d.full_name || d.name) === driverName)
    const model = driverRec?.pay_model || 'percent'
    const rate = parseFloat(driverRec?.pay_rate) || 50
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

export function KanbanCard({ load, onClick, onDragStart, qResult }) {
  const origin = (load.origin || '').split(',')[0] || '—'
  const dest = (load.dest || load.destination || '').split(',')[0] || '—'
  const gross = load.gross || load.gross_pay || 0
  const rpm = load.rate || (load.miles > 0 ? (gross / load.miles).toFixed(2) : '—')
  const dc = qResult ? Q_DECISION_COLORS[qResult.decision] : null
  return (
    <div draggable onDragStart={e => { e.dataTransfer.setData('loadId', load.loadId || load.id); onDragStart?.() }}
      onClick={() => onClick?.(load)}
      style={{ background:'var(--surface2)', border:`1px solid ${dc ? dc.border : 'var(--border)'}`, borderRadius:10, padding:'12px 14px',
        cursor:'pointer', transition:'all 0.12s', marginBottom:8, position:'relative', overflow:'hidden' }}
      onMouseOver={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.transform='translateY(-1px)' }}
      onMouseOut={e => { e.currentTarget.style.borderColor = dc ? dc.border : 'var(--border)'; e.currentTarget.style.transform='none' }}>
      {/* Q decision glow line */}
      {dc && <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, transparent, ${dc.color}60, transparent)` }} />}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ fontSize:11, fontFamily:'monospace', fontWeight:700, color:'var(--accent)' }}>{load.loadId || load.id}</span>
          {load.load_source === 'amazon_relay' && (
            <span style={{ fontSize:8, fontWeight:700, padding:'1px 5px', borderRadius:4, background:'rgba(255,153,0,0.15)', color:'#ff9900', letterSpacing:0.3 }}>RELAY</span>
          )}
        </div>
        {qResult ? <QDecisionBadge decision={qResult.decision} compact /> : (
          <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:6, background:'rgba(240,165,0,0.1)', color:'var(--accent)' }}>{load.status}</span>
        )}
      </div>
      <div style={{ fontSize:13, fontWeight:700, marginBottom:6 }}>{origin} → {dest}</div>
      <div style={{ display:'flex', gap:10, fontSize:11, color:'var(--muted)', marginBottom:4 }}>
        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--accent)' }}>${gross.toLocaleString()}</span>
        <span>${rpm}/mi</span>
        <span>{(load.miles || 0).toLocaleString()} mi</span>
      </div>
      {/* Q profit + broker score row */}
      {qResult && (
        <div style={{ display:'flex', gap:6, alignItems:'center', marginBottom:4, flexWrap:'wrap' }}>
          <span style={{ fontSize:9, fontWeight:700, color: qResult.estProfit > 0 ? 'var(--success)' : 'var(--danger)', fontFamily:"'JetBrains Mono',monospace" }}>
            P: ${qResult.estProfit.toLocaleString()}
          </span>
          <span style={{ fontSize:9, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace" }}>${qResult.profitPerMile}/mi</span>
          {qResult.brokerScore && (
            <span style={{ fontSize:8, fontWeight:700, padding:'1px 4px', borderRadius:3,
              background: qResult.brokerScore === 'A' ? 'rgba(52,176,104,0.12)' : qResult.brokerScore === 'C' ? 'rgba(239,68,68,0.12)' : 'rgba(240,165,0,0.12)',
              color: qResult.brokerScore === 'A' ? 'var(--success)' : qResult.brokerScore === 'C' ? 'var(--danger)' : 'var(--accent)' }}>
              {qResult.brokerScore}
            </span>
          )}
          {load.weight > 0 && <span style={{ fontSize:8, color: qResult.isHeavy ? 'var(--warning)' : 'var(--muted)' }}>{(load.weight/1000).toFixed(0)}K lbs</span>}
        </div>
      )}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:10, color:'var(--muted)' }}>
        <span>{load.driver || 'Unassigned'}</span>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <RateBadge rpm={rpm} equipment={load.equipment} compact />
          <span style={load.load_source === 'amazon_relay' ? { color:'#ff9900', fontWeight:600 } : undefined}>{load.broker || ''}</span>
        </div>
      </div>
      {/* Q one-line reason */}
      {qResult && qResult.summaryReason && (
        <div style={{ marginTop:4, fontSize:9, color:'var(--muted)', fontStyle:'italic', lineHeight:1.3, borderTop:'1px solid var(--border)', paddingTop:4 }}>
          {qResult.summaryReason.length > 80 ? qResult.summaryReason.substring(0, 80) + '...' : qResult.summaryReason}
        </div>
      )}
    </div>
  )
}

// ── Q Scanning State Animation ───────────────────────────────────────────────
function QScanningState({ phase }) {
  const phases = ['Scanning the market', 'Analyzing available loads', 'Checking broker history', 'Calculating true profit', 'Selecting top opportunities']
  const [idx, setIdx] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % phases.length), 1800)
    return () => clearInterval(t)
  }, [])
  return (
    <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', background:'rgba(240,165,0,0.04)', borderRadius:8, border:'1px solid rgba(240,165,0,0.1)' }}>
      <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', animation:'q-scan-pulse 1.5s ease-in-out infinite' }} />
      <span style={{ fontSize:10, fontWeight:600, color:'var(--accent)', fontFamily:"'JetBrains Mono',monospace" }}>{phases[idx]}</span>
    </div>
  )
}

// ── Q Alert Banner ───────────────────────────────────────────────────────────
function QAlertBanner({ alerts, onDismiss }) {
  if (!alerts || alerts.length === 0) return null
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      {alerts.slice(0,3).map((a, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', background:a.bg || 'rgba(240,165,0,0.04)', borderRadius:8, border:`1px solid ${a.borderColor || 'rgba(240,165,0,0.15)'}`, animation:'q-alert-slide 0.3s ease' }}>
          <Ic icon={a.icon || AlertTriangle} size={12} color={a.color || 'var(--accent)'} />
          <span style={{ flex:1, fontSize:10, fontWeight:600, color:a.color || 'var(--accent)' }}>{a.text}</span>
          <button onClick={() => onDismiss(i)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:10, padding:2 }}>✕</button>
        </div>
      ))}
    </div>
  )
}

// ── Q Top Recommendation Card ────────────────────────────────────────────────
function QRecommendationCard({ load, qResult, onOpen }) {
  if (!load || !qResult) return null
  const origin = (load.origin || '').split(',')[0] || '—'
  const dest = (load.dest || load.destination || '').split(',')[0] || '—'
  const gross = load.gross || load.gross_pay || 0
  const dc = Q_DECISION_COLORS[qResult.decision]
  return (
    <div onClick={() => onOpen?.(load.loadId || load.id)}
      style={{
        background:`linear-gradient(135deg, ${dc.bg}, rgba(240,165,0,0.03))`,
        border:`1px solid ${dc.border}`, borderRadius:12, padding:'14px 18px', cursor:'pointer',
        position:'relative', overflow:'hidden', transition:'all 0.2s'
      }}
      onMouseOver={e => { e.currentTarget.style.transform='translateY(-1px)'; e.currentTarget.style.boxShadow=`0 4px 20px ${dc.color}15` }}
      onMouseOut={e => { e.currentTarget.style.transform='none'; e.currentTarget.style.boxShadow='none' }}>
      {/* Top glow */}
      <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, transparent, ${dc.color}60, transparent)` }} />
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'var(--accent)', animation:'q-scan-pulse 1.5s ease-in-out infinite' }} />
            <span style={{ fontSize:9, fontWeight:800, color:'var(--accent)', letterSpacing:1.5 }}>Q RECOMMENDATION</span>
            <span style={{ fontSize:9, color:'var(--muted)', fontWeight:600 }}>Top load detected</span>
          </div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1, marginBottom:4, color:'var(--text)' }}>
            {origin} → {dest}
          </div>
          <div style={{ display:'flex', gap:12, fontSize:11, color:'var(--muted)', flexWrap:'wrap' }}>
            <span>Rate: <b style={{ color:'var(--accent)' }}>${gross.toLocaleString()}</b></span>
            <span>{(load.miles || 0).toLocaleString()} mi</span>
            {load.weight > 0 && <span>{Number(load.weight).toLocaleString()} lbs</span>}
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <QDecisionBadge decision={qResult.decision} />
          <div style={{ marginTop:6, fontFamily:"'JetBrains Mono',monospace", fontSize:9, color:'var(--muted)' }}>
            {qResult.confidence}% confidence
          </div>
        </div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:10 }}>
        {[
          { label:'EST. PROFIT', value:`$${qResult.estProfit.toLocaleString()}`, color: qResult.estProfit > 0 ? 'var(--success)' : 'var(--danger)' },
          { label:'PROFIT/MI', value:`$${qResult.profitPerMile}`, color: parseFloat(qResult.profitPerMile) >= 1.00 ? 'var(--success)' : 'var(--accent)' },
          { label:'BROKER', value: qResult.brokerScore, color: qResult.brokerScore === 'A' ? 'var(--success)' : qResult.brokerScore === 'C' ? 'var(--danger)' : 'var(--accent)' },
          { label:'PROFIT/DAY', value:`$${qResult.profitPerDay.toLocaleString()}`, color: qResult.profitPerDay >= 500 ? 'var(--success)' : 'var(--accent)' },
        ].map(m => (
          <div key={m.label} style={{ background:'rgba(0,0,0,0.15)', borderRadius:6, padding:'6px 8px', textAlign:'center' }}>
            <div style={{ fontSize:7, fontWeight:800, color:'var(--muted)', letterSpacing:1, marginBottom:2 }}>{m.label}</div>
            <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:14, fontWeight:700, color:m.color }}>{m.value}</div>
          </div>
        ))}
      </div>
      {qResult.targetRate && (
        <div style={{ fontSize:10, fontWeight:700, color:'var(--accent)', marginBottom:6, fontFamily:"'JetBrains Mono',monospace" }}>
          Target Counter: ${qResult.targetRate.toLocaleString()}
        </div>
      )}
      <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.4, fontStyle:'italic' }}>
        {qResult.summaryReason}
      </div>
    </div>
  )
}

export function LoadsPipeline({ onOpenDrawer }) {
  const { loads, updateLoadStatus } = useCarrier()
  const { showToast } = useApp()
  const { drivers, fuelCostPerMile, brokerStats, allLoads } = useCarrier()
  const [pipeTab, setPipeTab] = useState('pipeline')
  const [dragOver, setDragOver] = useState(null)
  const [qFilter, setQFilter] = useState('all') // all | approved | rejected | negotiate
  const [isScanning, setIsScanning] = useState(true)
  const [dismissedAlerts, setDismissedAlerts] = useState([])
  const [dispatchDecisions, setDispatchDecisions] = useState({})

  // Listen for custom event to switch to dispatch tab
  useEffect(() => {
    const handler = () => setPipeTab('dispatch')
    window.addEventListener('switchToDispatch', handler)
    return () => window.removeEventListener('switchToDispatch', handler)
  }, [])

  // Simulate Q scanning state on mount and when loads change
  useEffect(() => {
    setIsScanning(true)
    const t = setTimeout(() => setIsScanning(false), 3200)
    return () => clearTimeout(t)
  }, [loads.length])

  // Run Q evaluation on all loads (frontend fallback)
  const qContext = useMemo(() => ({ fuelCostPerMile, drivers, brokerStats, allLoads: allLoads || loads }), [fuelCostPerMile, drivers, brokerStats, allLoads, loads])
  const qResults = useMemo(() => {
    const map = {}
    loads.forEach(l => {
      map[l.loadId || l.id] = qEvaluateLoad(l, qContext)
    })
    return map
  }, [loads, qContext])

  // Batch evaluate loads via backend dispatch engine
  useEffect(() => {
    const evaluateLoads = async () => {
      const eligible = loads.filter(l =>
        !dispatchDecisions[l.loadId || l.id] &&
        ['Booked', 'Rate Con Received', 'Assigned to Driver'].includes(l.status)
      )
      for (const load of eligible) {
        try {
          const res = await apiFetch('/api/dispatch-evaluate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              load_id: load.loadId || load.id,
              load: {
                gross: load.gross || load.gross_pay || load.rate_total || 0,
                miles: load.miles,
                weight: load.weight,
                origin: load.origin,
                dest: load.dest || load.destination,
                equipment: load.equipment,
                broker: load.broker,
                broker_phone: load.broker_phone,
                book_type: load.book_type,
                instant_book: load.instant_book,
                pickup_date: load.pickup_date,
                delivery_date: load.delivery_date,
              },
              driver_id: load.driver_id || null,
              driver_type: 'owner_operator',
            })
          })
          if (res.ok) {
            const data = await res.json()
            if (data.decision) {
              setDispatchDecisions(prev => ({ ...prev, [load.loadId || load.id]: data }))
            }
          }
        } catch {
          // Backend unavailable — frontend fallback handles it
        }
      }
    }
    if (loads.length > 0) evaluateLoads()
  }, [loads])

  // Q-filtered loads
  const filteredLoads = useMemo(() => {
    if (qFilter === 'all') return loads
    const decisionMap = { approved: 'ACCEPT', rejected: 'REJECT', negotiate: 'NEGOTIATE' }
    const target = decisionMap[qFilter]
    return loads.filter(l => qResults[l.loadId || l.id]?.decision === target)
  }, [loads, qFilter, qResults])

  // Top recommendation: best ACCEPT load by profit/mile
  const topRec = useMemo(() => {
    const accepts = loads
      .map(l => ({ load: l, q: qResults[l.loadId || l.id] }))
      .filter(x => x.q && x.q.decision === 'ACCEPT' && x.q.estProfit > 0)
      .sort((a, b) => parseFloat(b.q.profitPerMile) - parseFloat(a.q.profitPerMile))
    return accepts[0] || null
  }, [loads, qResults])

  // Q Alerts — dynamic real-time alerts
  const qAlerts = useMemo(() => {
    const alerts = []
    // High-profit load detected
    const highProfit = loads.find(l => {
      const q = qResults[l.loadId || l.id]
      return q && q.estProfit > 1500 && q.decision === 'ACCEPT' && ['Rate Con Received','Booked'].includes(l.status)
    })
    if (highProfit) {
      const q = qResults[highProfit.loadId || highProfit.id]
      alerts.push({ icon: TrendingUp, text: `High-profit load detected: ${highProfit.loadId} — $${q.estProfit.toLocaleString()} est. profit`, color: 'var(--success)', bg: 'rgba(52,176,104,0.04)', borderColor: 'rgba(52,176,104,0.15)' })
    }
    // Heavy loads
    const heavy = loads.filter(l => parseFloat(l.weight) > 40000 && ['Rate Con Received','Booked','Assigned to Driver'].includes(l.status))
    if (heavy.length > 0) {
      alerts.push({ icon: AlertTriangle, text: `Heavy load detected: ${heavy[0].loadId} — ${Number(heavy[0].weight).toLocaleString()} lbs. Increased fuel cost.`, color: 'var(--warning)', bg: 'rgba(240,165,0,0.04)', borderColor: 'rgba(240,165,0,0.15)' })
    }
    // Loads with low profit that should be negotiated
    const negotiate = loads.filter(l => qResults[l.loadId || l.id]?.decision === 'NEGOTIATE' && ['Rate Con Received','Booked'].includes(l.status))
    if (negotiate.length > 0) {
      alerts.push({ icon: MessageSquare, text: `${negotiate.length} load${negotiate.length > 1 ? 's' : ''} below target rate — counteroffer recommended`, color: 'var(--accent)', bg: 'rgba(240,165,0,0.04)', borderColor: 'rgba(240,165,0,0.15)' })
    }
    // Rejected loads still active
    const rejected = loads.filter(l => qResults[l.loadId || l.id]?.decision === 'REJECT' && ['Rate Con Received','Booked','Assigned to Driver'].includes(l.status))
    if (rejected.length > 0) {
      alerts.push({ icon: XCircle, text: `${rejected.length} active load${rejected.length > 1 ? 's' : ''} below profit threshold — review recommended`, color: 'var(--danger)', bg: 'rgba(239,68,68,0.04)', borderColor: 'rgba(239,68,68,0.15)' })
    }
    return alerts.filter((_, i) => !dismissedAlerts.includes(i))
  }, [loads, qResults, dismissedAlerts])

  // Q stats
  const qStats = useMemo(() => {
    const vals = Object.values(qResults)
    return {
      total: vals.length,
      accepted: vals.filter(q => q.decision === 'ACCEPT').length,
      rejected: vals.filter(q => q.decision === 'REJECT').length,
      negotiate: vals.filter(q => q.decision === 'NEGOTIATE').length,
      avgProfit: vals.length > 0 ? Math.round(vals.reduce((s,q) => s + q.estProfit, 0) / vals.length) : 0,
      totalProfit: vals.reduce((s,q) => s + Math.max(q.estProfit, 0), 0),
    }
  }, [qResults])

  const handleDrop = (e, col) => {
    e.preventDefault()
    setDragOver(null)
    const loadId = e.dataTransfer.getData('loadId')
    if (!loadId || !col.statuses[0]) return
    updateLoadStatus(loadId, col.statuses[0])
  }

  const PIPE_TABS = [{ id:'pipeline', label:'Pipeline' },{ id:'q-dispatch', label:'Q Dispatch' },{ id:'list', label:'List View' },{ id:'dispatch', label:'Dispatch Board' },{ id:'check-calls', label:'Check Calls' },{ id:'command', label:'Command Center' },{ id:'lane-intel', label:'Lane Intel' },{ id:'rate-check', label:'Rate Check' }]

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', minHeight:0, overflow:'hidden' }}>

      {/* ═══ Q HEADER ═══════════════════════════════════════════════ */}
      <div style={{ flexShrink:0, padding:'12px 20px 0', background:'var(--surface)', borderBottom:'none' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--success)', boxShadow:'0 0 8px var(--success)', animation:'q-scan-pulse 2s ease-in-out infinite' }} />
            <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--text)' }}>
              Q <span style={{ color:'var(--accent)' }}>LOAD INTELLIGENCE</span>
            </span>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {isScanning ? <QScanningState /> : (
              <span style={{ fontSize:9, fontWeight:600, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace" }}>
                Evaluating {loads.length} load{loads.length !== 1 ? 's' : ''} in real time
              </span>
            )}
          </div>
        </div>

        {/* Q Stats Bar */}
        {loads.length > 0 && (
          <div style={{ display:'flex', gap:6, marginBottom:8, flexWrap:'wrap' }}>
            {[
              { label:'ALL', value:qStats.total, filter:'all', color:'var(--text)' },
              { label:'APPROVED', value:qStats.accepted, filter:'approved', color:'var(--success)' },
              { label:'NEGOTIATE', value:qStats.negotiate, filter:'negotiate', color:'var(--accent)' },
              { label:'REJECTED', value:qStats.rejected, filter:'rejected', color:'var(--danger)' },
            ].map(f => (
              <button key={f.filter} onClick={() => setQFilter(f.filter)}
                style={{
                  padding:'4px 12px', borderRadius:6, border:`1px solid ${qFilter === f.filter ? f.color : 'var(--border)'}`,
                  background: qFilter === f.filter ? f.color + '12' : 'transparent',
                  color: qFilter === f.filter ? f.color : 'var(--muted)',
                  fontSize:10, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                  display:'flex', alignItems:'center', gap:4, transition:'all 0.15s'
                }}>
                <span>{f.label}</span>
                <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:11, fontWeight:800 }}>{f.value}</span>
              </button>
            ))}
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:9, color:'var(--muted)', fontWeight:600 }}>Est. Portfolio Profit:</span>
              <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, color: qStats.totalProfit > 0 ? 'var(--success)' : 'var(--danger)' }}>
                ${qStats.totalProfit.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Sub-tabs */}
      <HubTabBar tabs={PIPE_TABS} active={pipeTab} onChange={setPipeTab} />

      <div style={{ flex:1, minHeight:0, overflow:'auto', display:'flex', flexDirection:'column' }}>
        {pipeTab === 'pipeline' && (
          <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>

            {/* Q Alerts */}
            {qAlerts.length > 0 && (
              <div style={{ padding:'8px 10px 0' }}>
                <QAlertBanner alerts={qAlerts} onDismiss={i => setDismissedAlerts(d => [...d, i])} />
              </div>
            )}

            {/* Q Top Recommendation */}
            {topRec && !isScanning && (
              <div style={{ padding:'8px 10px' }}>
                <QRecommendationCard load={topRec.load} qResult={topRec.q} onOpen={onOpenDrawer} />
              </div>
            )}

            {/* Empty State */}
            {loads.length === 0 && !isScanning && (
              <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40 }}>
                <div style={{ textAlign:'center', maxWidth:360 }}>
                  <div style={{ width:48, height:48, borderRadius:12, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.2)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 14px' }}>
                    <Ic icon={Bot} size={22} color="var(--accent)" />
                  </div>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:6, color:'var(--text)' }}>Q has not evaluated any loads yet</div>
                  <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.5, marginBottom:14 }}>
                    Activate Q by uploading a rate confirmation or adding loads from the dispatch board. Q will analyze each load and provide profit-based recommendations.
                  </div>
                  <button className="btn btn-primary" style={{ fontSize:11 }} onClick={() => setPipeTab('list')}>Add Load</button>
                </div>
              </div>
            )}

            {/* Kanban Board */}
            {(loads.length > 0 || isScanning) && (
              <div style={{ display:'flex', gap:6, padding:'8px 10px', flex:1, minHeight:0, overflow:'auto' }}>
                {KANBAN_COLUMNS.map(col => {
                  const colLoads = filteredLoads.filter(l => col.statuses.includes(l.status))
                  const colTotal = colLoads.reduce((s,l) => s + (l.gross || l.gross_pay || 0), 0)
                  const colProfit = colLoads.reduce((s,l) => s + Math.max(qResults[l.loadId || l.id]?.estProfit || 0, 0), 0)
                  return (
                    <div key={col.id}
                      onDragOver={e => { e.preventDefault(); setDragOver(col.id) }}
                      onDragLeave={() => setDragOver(null)}
                      onDrop={e => handleDrop(e, col)}
                      style={{ flex:1, minWidth:0, display:'flex', flexDirection:'column', minHeight:0,
                        background: dragOver === col.id ? 'rgba(240,165,0,0.04)' : 'transparent',
                        border: `1px solid ${dragOver === col.id ? 'var(--accent)' : 'var(--border)'}`, borderRadius:12, transition:'all 0.15s' }}>
                      <div style={{ padding:'10px 12px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <div style={{ width:8, height:8, borderRadius:'50%', background:col.color }} />
                            <span style={{ fontSize:12, fontWeight:700 }}>{col.label}</span>
                          </div>
                          <span style={{ fontSize:11, fontWeight:700, color:col.color, background:col.color+'15', padding:'2px 8px', borderRadius:8 }}>{colLoads.length}</span>
                        </div>
                        <div style={{ display:'flex', justifyContent:'space-between', fontSize:9, color:'var(--muted)' }}>
                          {colTotal > 0 && <span>${colTotal.toLocaleString()}</span>}
                          {colProfit > 0 && <span style={{ color:'var(--success)' }}>P: ${colProfit.toLocaleString()}</span>}
                        </div>
                      </div>
                      <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:8 }}>
                        {colLoads.length === 0 && (
                          <div style={{ padding:20, textAlign:'center', fontSize:10, color:'var(--muted)', border:'1px dashed var(--border)', borderRadius:8 }}>
                            {qFilter !== 'all' ? 'No loads match Q filter' : 'Drop loads here'}
                          </div>
                        )}
                        {colLoads.map(load => (
                          <KanbanCard key={load.loadId || load.id} load={load} qResult={qResults[load.loadId || load.id]} onClick={() => onOpenDrawer?.(load.loadId || load.id)} />
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
        {pipeTab === 'q-dispatch' && <QDispatchAI />}
        {pipeTab === 'list' && <DispatchTab />}
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
          {pipeTab === 'dispatch' && <SmartDispatch />}
          {pipeTab === 'check-calls' && <CheckCallCenter />}
          {pipeTab === 'command' && <CommandCenter />}
          {pipeTab === 'lane-intel' && <LaneIntel />}
          {pipeTab === 'rate-check' && <RateNegotiation />}
        </Suspense>
      </div>

      {/* Q Animations */}
      <style>{`
        @keyframes q-scan-pulse {
          0%, 100% { opacity:1; box-shadow: 0 0 4px var(--success); }
          50% { opacity:0.4; box-shadow: 0 0 12px var(--success); }
        }
        @keyframes q-alert-slide {
          from { opacity:0; transform:translateY(-8px); }
          to { opacity:1; transform:translateY(0); }
        }
      `}</style>
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
  const { loads, invoices, checkCalls, updateLoadStatus, updateInvoiceStatus, removeLoad, drivers, fuelCostPerMile, company: carrierCompany, brokerStats, allLoads } = useCarrier()
  const { showToast, user } = useApp()
  const [invoiceSending, setInvoiceSending] = useState(false)
  const [showInvoicePrompt, setShowInvoicePrompt] = useState(false)
  const [showTONU, setShowTONU] = useState(false)
  const [showFactorPrompt, setShowFactorPrompt] = useState(false)
  const [tonuFee, setTonuFee] = useState('250')
  // Detention tracking
  const [detentionRunning, setDetentionRunning] = useState(false)
  const [detentionStart, setDetentionStart] = useState(null)
  const [detentionElapsed, setDetentionElapsed] = useState(0)
  // Accessorial line items
  const [lineItems, setLineItems] = useState([])
  const [showAddAccessorial, setShowAddAccessorial] = useState(false)
  const [newAccessorial, setNewAccessorial] = useState({ description: '', amount: '' })
  // Documents
  const [loadDocs, setLoadDocs] = useState([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [reminderSending, setReminderSending] = useState(false)
  const load = loads.find(l => (l.loadId || l.id) === loadId)

  // Fetch documents for this load
  useEffect(() => {
    if (!load?.id || String(load.id).startsWith('local') || String(load.id).startsWith('mock')) return
    setDocsLoading(true)
    fetchDocuments(load.id).then(docs => setLoadDocs(docs)).catch(() => {}).finally(() => setDocsLoading(false))
  }, [load?.id])

  const handleDocUpload = useCallback(async (docType) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx,.heic'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      setUploading(true)
      try {
        const result = await uploadFile(file, 'loads/' + (load?.id || 'unknown'))
        const doc = await createDocument({
          name: docType + ' — ' + (load?.loadId || load?.load_number || 'Load'),
          file_url: result.url,
          file_path: result.path,
          doc_type: docType.toLowerCase().replace(/\s+/g, '_'),
          load_id: load?.id || null,
          metadata: { load_number: load?.loadId || load?.load_number, original_name: file.name, size: file.size },
        })
        if (doc) setLoadDocs(prev => [doc, ...prev])
        showToast('success', 'Uploaded', `${docType} attached to ${load?.loadId || 'load'}`)

        // POD uploaded on a Delivered load → auto-create & send invoice
        const isPOD = docType.toLowerCase() === 'pod' || docType.toLowerCase() === 'proof of delivery'
        const isDelivered = load?.status === 'Delivered'
        const notYetInvoiced = load?.status !== 'Invoiced' && load?.status !== 'Paid'
        if (isPOD && isDelivered && notYetInvoiced) {
          try {
            const invRes = await apiFetch('/api/auto-invoice', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ loadId: load._dbId || load.id }),
            })
            const invData = await invRes.json()
            if (invData.success) {
              updateLoadStatus(load.loadId || load.id, 'Invoiced')
              showToast('', 'Invoice Auto-Created', `${invData.invoiceNumber} — $${(load.rate || load.gross || 0).toLocaleString()} ${invData.emailSent ? '— emailed to broker' : ''}`)
            }
          } catch {
            // Invoice API unavailable — user can still create manually
          }
        }
      } catch (err) {
        showToast('error', 'Upload Failed', err.message || 'Could not upload file')
      }
      setUploading(false)
    }
    input.click()
  }, [load, showToast, updateLoadStatus])

  const handleDocDelete = useCallback(async (docId) => {
    if (!window.confirm('Delete this document?')) return
    try {
      await deleteDocument(docId)
      setLoadDocs(prev => prev.filter(d => d.id !== docId))
      showToast('success', 'Deleted', 'Document removed')
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to delete')
    }
  }, [showToast])

  // Initialize line items from load or linked invoice
  useEffect(() => {
    if (!load) return
    const existing = load.line_items || []
    if (existing.length > 0 && lineItems.length === 0) setLineItems(existing)
  }, [load?.loadId])

  // Initialize detention from load data
  useEffect(() => {
    if (!load) return
    if (load.detention_start && !detentionStart) {
      setDetentionStart(new Date(load.detention_start))
      if (load.detention_end) {
        setDetentionElapsed(Math.floor((new Date(load.detention_end) - new Date(load.detention_start)) / 1000))
      } else {
        setDetentionRunning(true)
      }
    }
  }, [load?.loadId])

  // Detention timer tick
  useEffect(() => {
    if (!detentionRunning || !detentionStart) return
    const interval = setInterval(() => {
      setDetentionElapsed(Math.floor((Date.now() - detentionStart.getTime()) / 1000))
    }, 1000)
    return () => clearInterval(interval)
  }, [detentionRunning, detentionStart])

  if (!load) return null

  const detentionHours = detentionElapsed / 3600
  const FREE_TIME_HOURS = 2
  const DETENTION_RATE = 75 // $/hr after free time
  const billableDetention = Math.max(0, detentionHours - FREE_TIME_HOURS)
  const detentionCharge = Math.round(billableDetention * DETENTION_RATE)

  const fmtTime = (secs) => {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = secs % 60
    return `${h}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`
  }

  const startDetention = () => {
    const now = new Date()
    setDetentionStart(now)
    setDetentionRunning(true)
    setDetentionElapsed(0)
    // Save to load
    const dbId = load._dbId || load.id
    if (dbId && !String(dbId).startsWith('mock') && !String(dbId).startsWith('local')) {
      import('../../lib/database.js').then(db => db.updateLoad(dbId, { detention_start: now.toISOString() })).catch(() => {})
    }
    showToast('', 'Detention Started', `Timer running for ${load.loadId}`)
  }

  const stopDetention = () => {
    const end = new Date()
    setDetentionRunning(false)
    // Save to load
    const dbId = load._dbId || load.id
    if (dbId && !String(dbId).startsWith('mock') && !String(dbId).startsWith('local')) {
      import('../../lib/database.js').then(db => db.updateLoad(dbId, {
        detention_end: end.toISOString(),
        detention_hours: parseFloat(detentionHours.toFixed(2)),
      })).catch(() => {})
    }
    // Auto-add detention as line item if billable
    if (billableDetention > 0 && !lineItems.find(li => li.type === 'detention')) {
      const item = { type: 'detention', description: `Detention (${billableDetention.toFixed(1)}hrs @ $${DETENTION_RATE}/hr — ${FREE_TIME_HOURS}hr free time)`, amount: detentionCharge }
      setLineItems(prev => [...prev, item])
      showToast('', 'Detention Charge Added', `$${detentionCharge} added to accessorials (${billableDetention.toFixed(1)}hrs billable)`)
    } else {
      showToast('', 'Detention Stopped', `Total: ${fmtTime(detentionElapsed)} — within free time, no charge`)
    }
  }

  // Calculate total with accessorials
  const accessorialTotal = lineItems.reduce((sum, li) => sum + (parseFloat(li.amount) || 0), 0)

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
        body: JSON.stringify({ loadId: load._dbId || load.id, lineItems: lineItems.length > 0 ? lineItems : undefined }),
      })
      const data = await res.json()
      if (data.success) {
        updateLoadStatus(load.loadId || load.id, 'Invoiced')
        const totalWithAccessorials = gross + accessorialTotal
        showToast('', 'Invoice Sent!', `${data.invoiceNumber} — $${totalWithAccessorials.toLocaleString()}${accessorialTotal > 0 ? ` (incl. $${accessorialTotal} accessorials)` : ''} — ${data.emailSent ? 'Email sent to broker' : 'Invoice created (no broker email on file)'}`)
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

  // Generate and copy tracking link for brokers
  const handleShareTracking = () => {
    const ownerId = load.owner_id || user?.id || ''
    const dbId = load._dbId || load.id || ''
    if (!ownerId || !dbId || String(dbId).startsWith('mock') || String(dbId).startsWith('local')) {
      showToast('', 'Tracking Link', 'Save this load to the database first to generate a tracking link')
      return
    }
    const token = btoa(`${ownerId}:${dbId}`)
    const origin = window.location.origin
    const trackingUrl = `${origin}/#!/track/${token}`
    navigator.clipboard.writeText(trackingUrl).then(() => {
      showToast('success', 'Link Copied!', `Tracking link for ${load.loadId || load.load_number} copied to clipboard. Share with your broker.`)
    }).catch(() => {
      // Fallback: show the URL
      window.prompt('Copy this tracking link:', trackingUrl)
    })
  }

  // Send invoice payment reminder email to broker
  const handleSendReminder = async () => {
    if (!linkedInvoice) { showToast('', 'No Invoice', 'Generate an invoice first'); return }
    if (!load.broker_email) { showToast('', 'No Email', 'Broker email not on file for this load'); return }
    setReminderSending(true)
    try {
      const res = await apiFetch('/api/invoice-reminder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manualTrigger: true, invoiceId: linkedInvoice.id || linkedInvoice._dbId }),
      })
      showToast('success', 'Reminder Sent', `Payment reminder emailed to ${load.broker_email}`)
    } catch {
      showToast('error', 'Failed', 'Could not send reminder — try again later')
    }
    setReminderSending(false)
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
            <button className="btn btn-ghost" style={{ fontSize:11, color:'#4d8ef0', border:'1px solid rgba(77,142,240,0.25)', background:'rgba(77,142,240,0.06)' }}
              onClick={handleShareTracking}>
              <Ic icon={Share2} size={11} /> Share Tracking
            </button>
            {linkedInvoice && (linkedInvoice.status === 'Unpaid' || linkedInvoice.status === 'Overdue') && (
              <button className="btn btn-ghost" style={{ fontSize:11, color:'#f97316', border:'1px solid rgba(249,115,22,0.25)', background:'rgba(249,115,22,0.06)' }}
                onClick={handleSendReminder} disabled={reminderSending}>
                <Ic icon={Send} size={11} /> {reminderSending ? 'Sending...' : 'Send Reminder'}
              </button>
            )}
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

          {/* ═══ Q DECISION PANEL ═══════════════════════════════════ */}
          {(() => {
            // Use backend dispatch decision when available, fall back to frontend eval
            const backendDec = dispatchDecisions[load.loadId || load.id]
            const frontendQr = qEvaluateLoad(load, { fuelCostPerMile, drivers, brokerStats, allLoads: allLoads || loads })
            const qr = backendDec ? {
              ...frontendQr,
              decision: (backendDec.decision || '').toUpperCase() === 'AUTO_BOOK' ? 'ACCEPT' : (backendDec.decision || '').toUpperCase(),
              confidence: backendDec.confidence || frontendQr.confidence,
              estProfit: backendDec.metrics?.estProfit ?? frontendQr.estProfit,
              profitPerMile: backendDec.metrics?.profitPerMile ?? frontendQr.profitPerMile,
              profitPerDay: backendDec.metrics?.profitPerDay ?? frontendQr.profitPerDay,
              fuelCost: backendDec.metrics?.fuelCost ?? frontendQr.fuelCost,
              driverPay: backendDec.metrics?.driverPay ?? frontendQr.driverPay,
              transitDays: backendDec.metrics?.transitDays ?? frontendQr.transitDays,
              summaryReason: (backendDec.reasons || []).join('. ') || frontendQr.summaryReason,
              targetRate: backendDec.negotiation ? Math.round((backendDec.negotiation.targetRate || 0) * (parseFloat(load.miles) || 1)) : frontendQr.targetRate,
              risks: frontendQr.risks,
              advantages: frontendQr.advantages,
              _backendPowered: true,
            } : frontendQr
            const dc = Q_DECISION_COLORS[qr.decision] || Q_DECISION_COLORS.ACCEPT
            return (
              <div style={{ background:`linear-gradient(135deg, ${dc.bg}, rgba(0,0,0,0.02))`, border:`1px solid ${dc.border}`, borderRadius:12, padding:16, position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:`linear-gradient(90deg, transparent, ${dc.color}50, transparent)` }} />
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{ width:5, height:5, borderRadius:'50%', background:dc.color, animation:'q-scan-pulse 2s ease-in-out infinite' }} />
                    <span style={{ fontSize:10, fontWeight:800, color:dc.color, letterSpacing:1.5 }}>Q DECISION{qr._backendPowered ? ' (AI)' : ''}</span>
                  </div>
                  <QDecisionBadge decision={qr.decision} />
                </div>
                {/* Metrics grid */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:10 }}>
                  {[
                    { label:'EST. PROFIT', value:`$${(qr.estProfit || 0).toLocaleString()}`, color: qr.estProfit > 0 ? 'var(--success)' : 'var(--danger)' },
                    { label:'PROFIT/MI', value:`$${qr.profitPerMile}`, color: parseFloat(qr.profitPerMile) >= 1.00 ? 'var(--success)' : 'var(--accent)' },
                    { label:'PROFIT/DAY', value:`$${(qr.profitPerDay || 0).toLocaleString()}`, color: qr.profitPerDay >= 500 ? 'var(--success)' : 'var(--accent)' },
                    { label:'FUEL COST', value:`$${(qr.fuelCost || 0).toLocaleString()}`, color:'var(--warning)' },
                    { label:'DRIVER PAY', value:`$${(qr.driverPay || 0).toLocaleString()}`, color:'var(--muted)' },
                    { label:'BROKER', value:`${qr.brokerScore} — ${qr.brokerReliability}`, color: qr.brokerScore === 'A' ? 'var(--success)' : qr.brokerScore === 'C' ? 'var(--danger)' : 'var(--accent)' },
                  ].map(m => (
                    <div key={m.label} style={{ background:'rgba(0,0,0,0.12)', borderRadius:6, padding:'6px 8px' }}>
                      <div style={{ fontSize:7, fontWeight:800, color:'var(--muted)', letterSpacing:1, marginBottom:2 }}>{m.label}</div>
                      <div style={{ fontSize:11, fontWeight:700, color:m.color, fontFamily:"'JetBrains Mono',monospace" }}>{m.value}</div>
                    </div>
                  ))}
                </div>
                {/* Negotiation script from backend */}
                {backendDec?.negotiation && (
                  <div style={{ padding:'8px 10px', background:'rgba(240,165,0,0.06)', borderRadius:6, marginBottom:8, border:'1px solid rgba(240,165,0,0.15)' }}>
                    <div style={{ fontSize:9, fontWeight:800, color:'var(--accent)', letterSpacing:1, marginBottom:4 }}>NEGOTIATION SCRIPT</div>
                    <div style={{ fontSize:10, color:'var(--text)', lineHeight:1.5 }}>{backendDec.negotiation.script}</div>
                    <div style={{ display:'flex', gap:12, marginTop:6 }}>
                      <span style={{ fontSize:9, color:'var(--muted)' }}>Current: <span style={{ fontWeight:700, color:'var(--text)', fontFamily:"'JetBrains Mono',monospace" }}>${backendDec.negotiation.currentRate}/mi</span></span>
                      <span style={{ fontSize:9, color:'var(--muted)' }}>Target: <span style={{ fontWeight:700, color:'var(--accent)', fontFamily:"'JetBrains Mono',monospace" }}>${backendDec.negotiation.targetRate}/mi</span></span>
                      <span style={{ fontSize:9, color:'var(--muted)' }}>Min: <span style={{ fontWeight:700, color:'var(--warning)', fontFamily:"'JetBrains Mono',monospace" }}>${backendDec.negotiation.minAcceptRate}/mi</span></span>
                    </div>
                  </div>
                )}
                {/* Target counter rate (frontend fallback) */}
                {!backendDec?.negotiation && qr.targetRate && (
                  <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', background:'rgba(240,165,0,0.08)', borderRadius:6, marginBottom:8, border:'1px solid rgba(240,165,0,0.15)' }}>
                    <Ic icon={Target} size={12} color="var(--accent)" />
                    <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)' }}>Target Counter:</span>
                    <span style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:800, color:'var(--accent)' }}>${qr.targetRate.toLocaleString()}</span>
                  </div>
                )}
                {/* Weight */}
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:8 }}>
                  <span style={{ fontSize:9, fontWeight:600, color: qr.isHeavy ? 'var(--warning)' : 'var(--muted)', background: qr.isHeavy ? 'rgba(240,165,0,0.08)' : 'var(--surface2)', padding:'2px 8px', borderRadius:4, border: qr.isHeavy ? '1px solid rgba(240,165,0,0.2)' : '1px solid var(--border)' }}>
                    {qr.weightNote}
                  </span>
                  {qr.laneHistory > 0 && (
                    <span style={{ fontSize:9, fontWeight:600, color:'var(--accent3)', background:'rgba(77,142,240,0.08)', padding:'2px 8px', borderRadius:4, border:'1px solid rgba(77,142,240,0.2)' }}>
                      Lane: {qr.laneHistory} prior load{qr.laneHistory > 1 ? 's' : ''} · Avg ${qr.laneAvgRPM}/mi
                    </span>
                  )}
                  {qr.isPowerOnly && <span style={{ fontSize:9, fontWeight:600, color:'var(--accent2)', background:'rgba(139,92,246,0.08)', padding:'2px 8px', borderRadius:4 }}>Power Only</span>}
                  {qr.isDropHook && <span style={{ fontSize:9, fontWeight:600, color:'var(--success)', background:'rgba(52,176,104,0.08)', padding:'2px 8px', borderRadius:4 }}>Drop & Hook</span>}
                </div>
                {/* Risks & Advantages */}
                {(qr.risks.length > 0 || qr.advantages.length > 0) && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:8 }}>
                    {qr.risks.length > 0 && (
                      <div>
                        <div style={{ fontSize:8, fontWeight:800, color:'var(--danger)', letterSpacing:1, marginBottom:4 }}>RISKS</div>
                        {qr.risks.map((r,i) => (
                          <div key={i} style={{ fontSize:9, color:'var(--muted)', lineHeight:1.4, display:'flex', gap:4, marginBottom:2 }}>
                            <span style={{ color:'var(--danger)', flexShrink:0 }}>•</span> {r}
                          </div>
                        ))}
                      </div>
                    )}
                    {qr.advantages.length > 0 && (
                      <div>
                        <div style={{ fontSize:8, fontWeight:800, color:'var(--success)', letterSpacing:1, marginBottom:4 }}>ADVANTAGES</div>
                        {qr.advantages.map((a,i) => (
                          <div key={i} style={{ fontSize:9, color:'var(--muted)', lineHeight:1.4, display:'flex', gap:4, marginBottom:2 }}>
                            <span style={{ color:'var(--success)', flexShrink:0 }}>•</span> {a}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Summary */}
                <div style={{ fontSize:10, color:'var(--muted)', lineHeight:1.4, fontStyle:'italic', borderTop:'1px solid var(--border)', paddingTop:8 }}>
                  {qr.summaryReason}
                </div>
              </div>
            )
          })()}

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

          {/* ═══ DETENTION TIMER ═══════════════════════════════════ */}
          {['En Route to Pickup','Loaded','In Transit','Delivered'].includes(load.status) && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, display:'flex', alignItems:'center', gap:6 }}>
                  <Ic icon={Clock} size={13} /> Detention Timer
                </div>
                {detentionStart && !detentionRunning && detentionCharge > 0 && (
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(239,68,68,0.1)', color:'var(--danger)' }}>
                    +${detentionCharge} billable
                  </span>
                )}
              </div>

              {!detentionStart ? (
                <div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:10, lineHeight:1.5 }}>
                    Start the timer when driver arrives at shipper/receiver. Industry standard: {FREE_TIME_HOURS}hr free time, then ${DETENTION_RATE}/hr.
                  </div>
                  <button className="btn btn-primary" style={{ fontSize:11, width:'100%' }} onClick={startDetention}>
                    <Ic icon={Clock} size={12} /> Start Detention Timer
                  </button>
                </div>
              ) : (
                <div>
                  <div style={{ textAlign:'center', marginBottom:10 }}>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:28, fontWeight:800, color: detentionRunning ? (billableDetention > 0 ? 'var(--danger)' : 'var(--accent)') : 'var(--text)', letterSpacing:1 }}>
                      {fmtTime(detentionElapsed)}
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                      Started {detentionStart.toLocaleTimeString()} · Free time: {FREE_TIME_HOURS}hr
                      {billableDetention > 0 && <span style={{ color:'var(--danger)', fontWeight:700 }}> · Billable: {billableDetention.toFixed(1)}hr = ${detentionCharge}</span>}
                    </div>
                  </div>
                  {/* Progress bar showing free time vs billable */}
                  <div style={{ height:6, borderRadius:3, background:'var(--surface2)', overflow:'hidden', marginBottom:10 }}>
                    <div style={{
                      height:'100%', borderRadius:3, transition:'width 1s linear',
                      width: `${Math.min(100, (detentionHours / (FREE_TIME_HOURS * 2)) * 100)}%`,
                      background: billableDetention > 0 ? 'linear-gradient(90deg, var(--accent), var(--danger))' : 'var(--accent)',
                    }} />
                  </div>
                  {detentionRunning ? (
                    <button className="btn btn-ghost" style={{ fontSize:11, width:'100%', color:'var(--danger)', border:'1px solid rgba(239,68,68,0.3)' }} onClick={stopDetention}>
                      Stop Timer
                    </button>
                  ) : (
                    <div style={{ fontSize:10, color:'var(--muted)', textAlign:'center' }}>
                      Timer stopped · {billableDetention > 0 ? `$${detentionCharge} detention charge added to accessorials` : 'Within free time — no charge'}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ═══ ACCESSORIAL CHARGES / LINE ITEMS ═══════════════════ */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>
                Charges & Accessorials
              </div>
              <button className="btn btn-ghost" style={{ fontSize:10, padding:'3px 10px', display:'flex', alignItems:'center', gap:4 }}
                onClick={() => setShowAddAccessorial(true)}>
                <Ic icon={Plus} size={11} /> Add
              </button>
            </div>

            {/* Freight (always shown) */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
              <div>
                <div style={{ fontSize:12, fontWeight:600 }}>Freight — {origin.split(',')[0]} → {dest.split(',')[0]}</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>{(load.miles || 0).toLocaleString()} mi · ${rpm}/mi</div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)' }}>${gross.toLocaleString()}</div>
            </div>

            {/* Line items */}
            {lineItems.map((li, idx) => (
              <div key={idx} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:600 }}>{li.description}</div>
                    {li.type && <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5 }}>{li.type}</div>}
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'var(--success)' }}>+${parseFloat(li.amount || 0).toLocaleString()}</span>
                  {!linkedInvoice && (
                    <button onClick={() => setLineItems(prev => prev.filter((_, i) => i !== idx))}
                      style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:2 }}>
                      <Ic icon={Trash2} size={12} />
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* Add accessorial form */}
            {showAddAccessorial && (
              <div style={{ padding:'10px 0', borderBottom:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8 }}>
                <select value={newAccessorial.description}
                  onChange={e => {
                    const val = e.target.value
                    const presets = { 'Detention': detentionCharge || 150, 'Lumper Fee': 0, 'Fuel Surcharge': 0, 'Layover': 250, 'TONU': 250, 'Re-delivery': 150, 'Scale Ticket': 15, 'Toll Charges': 0, 'Other': 0 }
                    setNewAccessorial({ description: val, amount: presets[val] || '' })
                  }}
                  style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif" }}>
                  <option value="">Select charge type...</option>
                  {['Detention','Lumper Fee','Fuel Surcharge','Layover','TONU','Re-delivery','Scale Ticket','Toll Charges','Other'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <div style={{ display:'flex', gap:8 }}>
                  <input type="number" placeholder="Amount ($)" value={newAccessorial.amount}
                    onChange={e => setNewAccessorial(prev => ({ ...prev, amount: e.target.value }))}
                    style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'7px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif" }} />
                  <button className="btn btn-primary" style={{ fontSize:11, padding:'7px 16px' }}
                    disabled={!newAccessorial.description || !newAccessorial.amount}
                    onClick={() => {
                      setLineItems(prev => [...prev, { type: newAccessorial.description.toLowerCase().replace(/\s+/g, '_'), description: newAccessorial.description, amount: parseFloat(newAccessorial.amount) || 0 }])
                      setNewAccessorial({ description: '', amount: '' })
                      setShowAddAccessorial(false)
                    }}>
                    Add
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { setShowAddAccessorial(false); setNewAccessorial({ description: '', amount: '' }) }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Total */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', marginTop:4 }}>
              <span style={{ fontSize:12, fontWeight:700 }}>TOTAL</span>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--accent)' }}>
                ${(gross + accessorialTotal).toLocaleString()}
              </span>
            </div>
            {accessorialTotal > 0 && (
              <div style={{ fontSize:10, color:'var(--muted)', textAlign:'right' }}>
                Freight: ${gross.toLocaleString()} + Accessorials: ${accessorialTotal.toLocaleString()}
              </div>
            )}
          </div>

          {/* ═══ LOAD DOCUMENTS ═══════════════════════════════════ */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>
                Documents ({loadDocs.length})
              </div>
              {uploading && <span style={{ fontSize:10, color:'var(--accent)' }}>Uploading...</span>}
            </div>

            {/* Quick upload buttons */}
            <div style={{ display:'flex', gap:6, marginBottom:10, flexWrap:'wrap' }}>
              {[
                { type:'Rate Con', icon: FileText, color:'var(--accent)' },
                { type:'BOL', icon: FileText, color:'var(--accent2)' },
                { type:'POD', icon: CheckCircle, color:'var(--success)' },
                { type:'Lumper Receipt', icon: DollarSign, color:'var(--warning)' },
                { type:'Scale Ticket', icon: FileText, color:'var(--muted)' },
                { type:'Other', icon: Upload, color:'var(--muted)' },
              ].map(d => {
                const hasDoc = loadDocs.some(doc => (doc.doc_type || '').includes(d.type.toLowerCase().replace(/\s+/g, '_')))
                return (
                  <button key={d.type} onClick={() => handleDocUpload(d.type)} disabled={uploading}
                    style={{ padding:'6px 12px', fontSize:10, fontWeight:700, borderRadius:7, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                      border: hasDoc ? `1px solid ${d.color}40` : '1px solid var(--border)',
                      background: hasDoc ? `${d.color}10` : 'var(--surface2)',
                      color: hasDoc ? d.color : 'var(--muted)', display:'flex', alignItems:'center', gap:5 }}>
                    {hasDoc ? <CheckCircle size={11} /> : <Upload size={11} />} {d.type}
                  </button>
                )
              })}
            </div>

            {/* Document list */}
            {docsLoading ? (
              <div style={{ fontSize:11, color:'var(--muted)', padding:'8px 0' }}>Loading documents...</div>
            ) : loadDocs.length === 0 ? (
              <div style={{ fontSize:11, color:'var(--muted)', padding:'8px 0' }}>No documents attached yet. Upload Rate Con, BOL, or POD above.</div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {loadDocs.map(doc => {
                  const isImage = /\.(jpg|jpeg|png|webp|heic)$/i.test(doc.file_url || doc.file_path || '')
                  return (
                    <div key={doc.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'var(--surface2)', borderRadius:8 }}>
                      <div style={{ width:28, height:28, borderRadius:6, background:'rgba(240,165,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        {isImage ? <Image size={14} color="var(--accent)" /> : <FileText size={14} color="var(--accent)" />}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.name || doc.doc_type || 'Document'}</div>
                        <div style={{ fontSize:9, color:'var(--muted)' }}>{doc.doc_type?.replace(/_/g, ' ')} · {doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleDateString() : ''}</div>
                      </div>
                      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                        {doc.file_url && <button onClick={() => window.open(doc.file_url, '_blank')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--accent)', padding:4 }}><Eye size={14} /></button>}
                        <button onClick={() => handleDocDelete(doc.id)} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:4 }}><Trash2 size={12} /></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ═══ BROKER NOTIFICATIONS ═════════════════════════════ */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:16 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:10, textTransform:'uppercase', letterSpacing:1, display:'flex', alignItems:'center', gap:6 }}>
              <Bell size={12} /> Broker Notifications
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {[
                { status:'Assigned to Driver', label:'Driver Assigned', sent: STATUS_FLOW.indexOf(load.status) >= STATUS_FLOW.indexOf('Assigned to Driver') },
                { status:'En Route to Pickup', label:'En Route to Pickup', sent: STATUS_FLOW.indexOf(load.status) >= STATUS_FLOW.indexOf('En Route to Pickup') },
                { status:'Loaded', label:'Loaded at Shipper', sent: STATUS_FLOW.indexOf(load.status) >= STATUS_FLOW.indexOf('Loaded') },
                { status:'In Transit', label:'In Transit', sent: STATUS_FLOW.indexOf(load.status) >= STATUS_FLOW.indexOf('In Transit') },
                { status:'Delivered', label:'Delivered — POD Sent', sent: STATUS_FLOW.indexOf(load.status) >= STATUS_FLOW.indexOf('Delivered') },
                { status:'Invoiced', label:'Invoice Sent', sent: STATUS_FLOW.indexOf(load.status) >= STATUS_FLOW.indexOf('Invoiced') },
              ].map(n => (
                <div key={n.status} style={{ display:'flex', alignItems:'center', gap:10, padding:'6px 0' }}>
                  <div style={{ width:20, height:20, borderRadius:'50%', border: n.sent ? '2px solid var(--success)' : '2px solid var(--border)',
                    background: n.sent ? 'rgba(34,197,94,0.1)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    {n.sent && <CheckCircle size={12} color="var(--success)" />}
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight: n.sent ? 600 : 400, color: n.sent ? 'var(--text)' : 'var(--muted)' }}>{n.label}</div>
                  </div>
                  <span style={{ fontSize:9, fontWeight:700, color: n.sent ? 'var(--success)' : 'var(--muted)' }}>
                    {n.sent ? 'SENT' : 'PENDING'}
                  </span>
                </div>
              ))}
            </div>
            {load.broker_phone && (
              <div style={{ marginTop:8, padding:'8px 10px', background:'var(--surface2)', borderRadius:8, fontSize:10, color:'var(--muted)' }}>
                Notifications sent to: <strong>{load.broker || load.broker_name}</strong> · {load.broker_phone}{load.broker_email ? ` · ${load.broker_email}` : ''}
              </div>
            )}
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
              const payRate = parseFloat(driverRec?.pay_rate) || 50
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
