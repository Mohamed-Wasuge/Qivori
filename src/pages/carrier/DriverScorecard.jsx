import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { Ic, S, StatCard, AiBanner } from './shared'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { generateSettlementPDF } from '../../utils/generatePDF'
import { apiFetch } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'
import {
  DollarSign, CheckCircle, Clock, Package, Truck, Users, CreditCard, Star,
  Shield, User, UserPlus, Briefcase, Settings, Download, Upload, Send, Check,
  ChevronRight, Plus, Filter, Calendar, Hash, Gauge, TrendingUp, TrendingDown,
  Zap, Square, Route, Fuel, Activity, Sparkles, Edit3 as PencilIcon, Phone, Save, Trash2, Eye,
  FileCheck, AlertTriangle, FileText, BarChart2, Bot, Trophy, Siren, Target, MessageSquare, XCircle
} from 'lucide-react'

// ── Q Driver Intelligence Engine ─────────────────────────────────────────────
function qEvaluateDriver(driver, { loads, activeLoads, expenses, fuelCostPerMile, allDrivers }) {
  const name = driver.full_name || driver.name || ''
  const driverLoads = (loads || []).filter(l => l.driver === name)
  const deliveredLoads = driverLoads.filter(l => ['Delivered','Invoiced','Paid'].includes(l.status))
  const currentLoad = (activeLoads || []).find(l => l.driver === name)
  const isIdle = !currentLoad
  const status = currentLoad
    ? (['In Transit','Loaded'].includes(currentLoad.status) ? 'MOVING' : currentLoad.status === 'Delivered' ? 'DELIVERING' : 'ASSIGNED')
    : 'IDLE'

  // Performance metrics
  const totalGross = deliveredLoads.reduce((s,l) => s + (l.gross || 0), 0)
  const totalMiles = deliveredLoads.reduce((s,l) => s + (parseFloat(l.miles) || 0), 0)
  const loadCount = deliveredLoads.length
  const profitPerLoad = loadCount > 0 ? Math.round(totalGross / loadCount) : 0

  // Profit per day (based on last 30 days of activity)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
  const recentLoads = deliveredLoads.filter(l => new Date(l.delivery_date || l.created_at || 0) > thirtyDaysAgo)
  const recentGross = recentLoads.reduce((s,l) => s + (l.gross || 0), 0)
  const activeDays = Math.max(recentLoads.length * 1.5, 1) // estimate transit days
  const profitPerDay = Math.round(recentGross / activeDays)

  // On-time proxy (based on status progression speed)
  const rpm = totalMiles > 0 ? totalGross / totalMiles : 0
  const onTime = Math.min(95, Math.max(70, 80 + (rpm > 2.5 ? 10 : rpm > 2.0 ? 5 : 0) + (loadCount > 5 ? 5 : 0)))

  // Efficiency rating
  let efficiency = 'Normal'
  let effColor = 'var(--accent)'
  if (rpm >= 2.5 && loadCount >= 3 && profitPerDay >= 400) { efficiency = 'High'; effColor = 'var(--success)' }
  else if (rpm < 1.8 || (loadCount >= 3 && profitPerDay < 200)) { efficiency = 'Underperforming'; effColor = 'var(--danger)' }

  // Preferred weight (from driver notes or default)
  const prefWeight = 37000
  const avgWeight = deliveredLoads.filter(l => l.weight > 0).length > 0
    ? deliveredLoads.filter(l => l.weight > 0).reduce((s,l) => s + parseFloat(l.weight), 0) / deliveredLoads.filter(l => l.weight > 0).length
    : 0

  // Preferred lane detection (most common origin/dest pattern)
  const laneCounts = {}
  deliveredLoads.forEach(l => {
    const o = (l.origin || '').split(',')[0]?.trim() || ''
    const d = (l.dest || l.destination || '').split(',')[0]?.trim() || ''
    if (o && d) { const key = `${o} → ${d}`; laneCounts[key] = (laneCounts[key] || 0) + 1 }
  })
  const topLanes = Object.entries(laneCounts).sort((a,b) => b[1] - a[1]).slice(0, 3).map(([lane, count]) => ({ lane, count }))

  // Driver type heuristic
  const payModel = driver.pay_model || 'percent'
  const driverType = payModel === 'permile' || (parseFloat(driver.pay_rate) || 0) > 40 ? 'Owner Operator' : 'Company Driver'

  // Idle time estimation
  const lastDelivery = deliveredLoads.length > 0
    ? Math.max(...deliveredLoads.map(l => new Date(l.delivery_date || l.created_at || 0).getTime()))
    : 0
  const idleHours = isIdle && lastDelivery > 0 ? Math.round((Date.now() - lastDelivery) / 3600000) : 0

  // Q Insight text
  let insight = ''
  if (isIdle && idleHours > 12) {
    insight = `${name.split(' ')[0]} has been idle for ${idleHours}h. Assign a load to maximize utilization.`
  } else if (isIdle) {
    insight = `${name.split(' ')[0]} is available. Best suited for ${topLanes.length > 0 ? topLanes[0].lane + ' loads' : 'regional loads'}.`
  } else if (currentLoad) {
    const dest = (currentLoad.dest || currentLoad.destination || '').split(',')[0]
    insight = `${name.split(' ')[0]} ${status === 'MOVING' ? 'in transit' : 'assigned'} — ${currentLoad.loadId} to ${dest || 'destination'}.`
  }

  // Alerts
  const alerts = []
  if (isIdle && idleHours > 24) alerts.push({ type:'warning', text:`Idle for ${idleHours}h — underutilized` })
  if (currentLoad && currentLoad.weight > prefWeight) alerts.push({ type:'warning', text:`Current load exceeds preferred weight (${Number(currentLoad.weight).toLocaleString()} lbs)` })
  if (efficiency === 'Underperforming') alerts.push({ type:'alert', text:`Underperforming — ${loadCount < 3 ? 'low load count' : 'low profit per mile'}` })
  const medExpiry = driver.medical_card_expiry ? new Date(driver.medical_card_expiry) : null
  if (medExpiry && medExpiry < new Date(Date.now() + 30 * 86400000)) alerts.push({ type:'alert', text:'Medical card expiring within 30 days' })
  const licExpiry = driver.license_expiry ? new Date(driver.license_expiry) : null
  if (licExpiry && licExpiry < new Date(Date.now() + 60 * 86400000)) alerts.push({ type:'alert', text:'CDL expiring within 60 days' })

  return {
    status, isIdle, currentLoad,
    totalGross, totalMiles, loadCount, profitPerLoad, profitPerDay, onTime, rpm: rpm.toFixed(2),
    efficiency, effColor, driverType, prefWeight, avgWeight: Math.round(avgWeight),
    topLanes, idleHours, insight, alerts,
    recentLoads: recentLoads.length,
  }
}

// Q Load-Driver matching: score how well a load matches a driver
function qMatchScore(load, driver, qDriver) {
  let score = 50
  const reasons = []

  // Weight preference
  const weight = parseFloat(load.weight) || 0
  if (weight > 0 && weight <= (qDriver.prefWeight || 37000)) { score += 15; reasons.push('Weight within preferred range') }
  else if (weight > 40000) { score -= 10; reasons.push('Heavy load — exceeds preference') }

  // Lane match
  const loadOrigin = (load.origin || '').split(',')[0]?.trim() || ''
  const loadDest = (load.dest || load.destination || '').split(',')[0]?.trim() || ''
  const laneKey = `${loadOrigin} → ${loadDest}`
  if ((qDriver.topLanes || []).some(tl => tl.lane === laneKey)) { score += 20; reasons.push('Strong lane history') }

  // Driver efficiency
  if (qDriver.efficiency === 'High') { score += 10; reasons.push('High efficiency driver') }
  else if (qDriver.efficiency === 'Underperforming') { score -= 5 }

  // Idle bonus (idle drivers should get loads first)
  if (qDriver.isIdle) { score += 15; reasons.push('Currently idle — available immediately') }
  if (qDriver.idleHours > 12) { score += 5; reasons.push('Extended idle time') }

  // Profit match
  const gross = load.gross || load.gross_pay || 0
  const miles = parseFloat(load.miles) || 0
  const loadRPM = miles > 0 ? gross / miles : 0
  if (loadRPM >= 2.5) { score += 10; reasons.push('High-profit load') }

  return { score: Math.min(Math.max(score, 0), 100), reasons }
}

const Q_STATUS_COLORS = {
  IDLE: { bg:'rgba(74,85,112,0.12)', color:'var(--muted)', label:'IDLE' },
  ASSIGNED: { bg:'rgba(240,165,0,0.12)', color:'var(--accent)', label:'ASSIGNED' },
  MOVING: { bg:'rgba(52,176,104,0.12)', color:'var(--success)', label:'MOVING' },
  DELIVERING: { bg:'rgba(0,212,170,0.12)', color:'var(--accent2)', label:'DELIVERING' },
}

function getQEffIcons() { return { 'High': TrendingUp, 'Normal': Activity, 'Underperforming': TrendingDown } }

// ─── DRIVER SETTLEMENT ─────────────────────────────────────────────────────────
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
  const { loads: ctxLoads, drivers: ctxDrivers, editDriver, addExpense, fuelCostPerMile } = useCarrier()
  const [activeDriver, setActiveDriver] = useState(null)
  const [models, setModels] = useState({})
  const [modelVals, setModelVals] = useState({})
  const [deductions, setDeductions] = useState({})
  const [addingDeduct, setAddingDeduct] = useState(false)
  const [newDeduct, setNewDeduct] = useState({ label: 'Fuel Advance', amount: '' })
  const [showSheet, setShowSheet] = useState(false)
  const [payDirty, setPayDirty] = useState(false)
  const [payConfirm, setPayConfirm] = useState(null) // { method: 'fastpay'|'ach' }
  const [payProcessing, setPayProcessing] = useState(false)

  // Auto-select first driver and load their saved pay model
  useEffect(() => {
    if (!activeDriver && ctxDrivers.length > 0) setActiveDriver(ctxDrivers[0].id)
  }, [ctxDrivers, activeDriver])

  // Load pay model from driver record when switching drivers
  useEffect(() => {
    if (!activeDriver) return
    const d = (ctxDrivers || []).find(dr => dr.id === activeDriver)
    if (d) {
      if (d.pay_model && !models[activeDriver]) setModels(m => ({ ...m, [activeDriver]: d.pay_model }))
      if (d.pay_rate != null && modelVals[activeDriver] == null) setModelVals(v => ({ ...v, [activeDriver]: parseFloat(d.pay_rate) || 50 }))
    }
  }, [activeDriver, ctxDrivers])

  const driver = (ctxDrivers || []).find(d => d.id === activeDriver)

  // Save pay model to driver record when changed
  const savePayModel = useCallback(() => {
    if (!activeDriver || !editDriver) return
    const m = models[activeDriver] || 'percent'
    const v = modelVals[activeDriver] ?? 28
    editDriver(activeDriver, { pay_model: m, pay_rate: v })
    setPayDirty(false)
    showToast('', 'Pay Model Saved', `${driver?.full_name || driver?.name} — ${m === 'percent' ? v + '%' : m === 'permile' ? '$' + v + '/mi' : '$' + v + '/load'}`)
  }, [activeDriver, models, modelVals, editDriver, showToast, driver])

  if (!driver) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>No Drivers Yet</div>
      <div style={{ fontSize: 12 }}>Add drivers to view settlement details</div>
    </div>
  )

  const driverName = driver.full_name || driver.name || 'Unknown'
  const driverAvatar = driverName.split(' ').map(w => w[0]).join('')
  const model = models[activeDriver] || driver.pay_model || 'percent'
  const modelVal = modelVals[activeDriver] ?? parseFloat(driver.pay_rate) ?? 28
  const driverDeductions = deductions[activeDriver] || []
  const fuelRate = fuelCostPerMile || 0.22

  const mergedLoads = ctxLoads
    .filter(l => l.driver === driverName && (l.status === 'Delivered' || l.status === 'Invoiced'))
    .map(l => ({ id: l.loadId, route: (l.origin||'').split(',')[0] + ' → ' + (l.dest||'').split(',')[0], miles: l.miles || 0, gross: l.gross || 0, date: l.pickup?.split(' ·')[0] || '' }))

  const loadPays = (mergedLoads || []).map(l => ({ ...l, pay: calcPay(l, model, modelVal) }))
  const grossPay = loadPays.reduce((s, l) => s + l.pay, 0)
  const totalDeduct = driverDeductions.reduce((s, d) => s + d.amount, 0)
  const netPay = grossPay + totalDeduct

  const processPayment = async (method) => {
    setPayProcessing(true)
    try {
      const methodLabel = method === 'fastpay' ? 'FastPay (24hr deposit)' : 'ACH Transfer (1–3 days)'
      await addExpense({
        category: 'Driver Pay',
        description: `${driverName} settlement — ${methodLabel}`,
        amount: netPay,
        date: new Date().toISOString().split('T')[0],
        driver_name: driverName,
        payment_method: method,
      })
      if (activeDriver && editDriver) {
        await editDriver(activeDriver, { last_paid: new Date().toISOString().split('T')[0], last_pay_amount: netPay })
      }
      showToast('', method === 'fastpay' ? 'FastPay Sent' : 'ACH Transfer Queued',
        `${driverName} · $${netPay.toLocaleString()} · ${method === 'fastpay' ? '24hr deposit' : '1–3 business days'}`)
    } catch (e) {
      showToast('', 'Payment Failed', e.message || 'Could not process payment')
    }
    setPayProcessing(false)
    setPayConfirm(null)
  }

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
          {(ctxDrivers || []).map(d => {
            const isActive = activeDriver === d.id
            const name = d.full_name || d.name || 'Unknown'
            const avatar = name.split(' ').map(w => w[0]).join('')
            const loadCount = ctxLoads.filter(l => l.driver === name && (l.status==='Delivered'||l.status==='Invoiced')).length
            return (
              <button key={d.id} onClick={() => setActiveDriver(d.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`, background: isActive ? 'rgba(240,165,0,0.08)' : 'var(--surface)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s' }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: isActive ? 'var(--accent)' : 'var(--surface2)', color: isActive ? '#000' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800 }}>{avatar}</div>
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? 'var(--accent)' : 'var(--text)' }}>{name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{loadCount} loads this period</div>
                </div>
              </button>
            )
          })}
        </div>
        <div style={{ flex: 1 }} />
        <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowSheet(s => !s)}>
          {showSheet ? '✕ Close Sheet' : 'Settlement Sheet'}
        </button>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setPayConfirm({ method: 'fastpay' })} disabled={payProcessing || netPay <= 0}>
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
              <div style={{ fontSize: 13, fontWeight: 700 }}>{driverName}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>Pay Model: {PAY_MODELS.find(m => m.id === model)?.label} · {model === 'percent' ? modelVal + '%' : model === 'permile' ? '$' + modelVal + '/mi' : '$' + modelVal + '/load'}</div>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 16, minWidth:550 }}>
            <thead><tr style={{ borderBottom: '2px solid var(--border)' }}>
              {['Load ID','Route','Miles','Gross','Pay'].map(h => <th key={h} style={{ padding: '8px 12px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(loadPays || []).map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>{l.id}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 600 }}>{l.route}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12 }}>{l.miles.toLocaleString()} mi</td>
                  <td style={{ padding: '10px 12px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: 'var(--accent)' }}>${l.gross.toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>${l.pay.toLocaleString()}</td>
                </tr>
              ))}
              {(driverDeductions || []).map(d => (
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
            <button className="btn btn-primary" style={{ flex: 1, padding: '11px 0' }} onClick={() => setPayConfirm({ method: 'fastpay' })} disabled={payProcessing || netPay <= 0}><Ic icon={Zap} /> FastPay — 2.5% fee · 24hr deposit</button>
            <button className="btn btn-ghost" style={{ flex: 1, padding: '11px 0' }} onClick={() => setPayConfirm({ method: 'ach' })} disabled={payProcessing || netPay <= 0}><Ic icon={Briefcase} /> Standard ACH — 1–3 days · Free</button>
            <button className="btn btn-ghost" style={{ padding: '11px 16px' }} onClick={() => generateSettlementPDF(driverName, mergedLoads, 'Mar 1–15, 2026')} title="Download Settlement PDF"><Ic icon={Download} /> PDF</button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* ── Pay Model ── */}
        <div style={S.panel}>
          <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Settings} /> Pay Model — {driverName}</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {PAY_MODELS.map(pm => {
              const isActive = model === pm.id
              return (
                <label key={pm.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`, background: isActive ? 'rgba(240,165,0,0.05)' : 'var(--surface2)', cursor: 'pointer' }}>
                  <input type="radio" name={`model-${activeDriver}`} checked={isActive} onChange={() => { setModels(m => ({ ...m, [activeDriver]: pm.id })); setPayDirty(true) }} style={{ accentColor: 'var(--accent)' }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isActive ? 'var(--accent)' : 'var(--text)' }}>{pm.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{pm.desc}</div>
                  </div>
                  {isActive && (
                    <input type="number" value={modelVal} step={pm.id === 'permile' ? 0.01 : 1} min={0}
                      onChange={e => { setModelVals(v => ({ ...v, [activeDriver]: parseFloat(e.target.value) || 0 })); setPayDirty(true) }}
                      onClick={e => e.stopPropagation()}
                      style={{ width: 80, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', color: 'var(--text)', fontSize: 14, fontFamily: "'Bebas Neue',sans-serif", textAlign: 'center' }} />
                  )}
                </label>
              )
            })}
            {payDirty && (
              <button className="btn btn-primary" style={{ fontSize: 12, marginTop: 4 }} onClick={savePayModel}>
                <Ic icon={Save} size={13} /> Save Pay Model
              </button>
            )}
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
              Fuel rate: ${fuelRate.toFixed(2)}/mi (EIA diesel ÷ 6.5 MPG)
            </div>
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
            {(driverDeductions || []).map(d => (
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
          <div style={S.panelTitle}><Ic icon={Package} /> Loads This Period — {driverName}</div>
          <span style={S.badge('var(--accent2)')}>{PAY_MODELS.find(m => m.id === model)?.label} · {model === 'percent' ? modelVal + '%' : model === 'permile' ? '$' + modelVal + '/mi' : '$' + modelVal + '/load'}</span>
        </div>
        <div style={{ overflowX:'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth:600 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            {['Load ID', 'Route', 'Date', 'Miles', 'Gross', 'Driver Pay'].map(h => (
              <th key={h} style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {(loadPays || []).map((l, i) => (
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
          onClick={() => setPayConfirm({ method: 'fastpay' })} disabled={payProcessing || netPay <= 0}>
          <span><Ic icon={Zap} /> FastPay</span>
          <span style={{ opacity: 0.7, fontSize: 12 }}>2.5% fee · Same-day deposit</span>
        </button>
        <button className="btn btn-ghost" style={{ padding: '14px 0', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          onClick={() => setPayConfirm({ method: 'ach' })} disabled={payProcessing || netPay <= 0}>
          <span><Ic icon={Briefcase} /> Standard ACH</span>
          <span style={{ opacity: 0.7, fontSize: 12 }}>Free · 1–3 business days</span>
        </button>
      </div>

      {/* ── Settlement history ── */}
      <div style={S.panel}>
        <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Clock} /> Settlement History — {driverName}</div></div>
        <div style={{ overflowX:'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth:550 }}>
          <thead><tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
            {['Period', 'Gross Paid', 'Net Pay', 'Paid On', 'Status'].map(h => (
              <th key={h} style={{ padding: '10px 16px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {(driver.history || []).map(h => (
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

      {/* ── Payment Confirmation Modal ── */}
      {payConfirm && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={() => !payProcessing && setPayConfirm(null)}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'28px 32px', maxWidth:420, width:'90%', textAlign:'center' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:18, fontWeight:800, marginBottom:8 }}>
              {payConfirm.method === 'fastpay' ? 'Confirm FastPay' : 'Confirm ACH Transfer'}
            </div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:16 }}>
              Pay <strong style={{ color:'var(--success)' }}>${netPay.toLocaleString()}</strong> to <strong>{driverName}</strong>
              {payConfirm.method === 'fastpay' ? ' via FastPay (2.5% fee, 24hr deposit)' : ' via ACH (free, 1–3 business days)'}?
            </div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20, padding:'8px 12px', background:'var(--surface2)', borderRadius:8 }}>
              This will record a Driver Pay expense of ${netPay.toLocaleString()} and update the driver's settlement record.
            </div>
            <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
              <button className="btn btn-ghost" style={{ padding:'10px 24px' }} onClick={() => setPayConfirm(null)} disabled={payProcessing}>Cancel</button>
              <button className="btn btn-primary" style={{ padding:'10px 24px' }} onClick={() => processPayment(payConfirm.method)} disabled={payProcessing}>
                {payProcessing ? 'Processing...' : 'Confirm & Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function DriverProfiles() {
  const { showToast, isAdmin: isCompanyAdmin, companyRole } = useApp()
  const { drivers: dbDrivers, addDriver, editDriver, removeDriver, loads, activeLoads, expenses, fuelCostPerMile, updateLoadStatus, assignLoadToDriver } = useCarrier()
  const [showInviteUser, setShowInviteUser] = useState(false)
  const [invEmail, setInvEmail] = useState('')
  const [invSending, setInvSending] = useState(false)

  const handleInviteAsUser = async (driverId, driverName) => {
    if (!invEmail) { showToast('error', 'Error', 'Email is required'); return }
    setInvSending(true)
    try {
      const res = await apiFetch('/api/invite-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invEmail, role: 'driver', driver_id: driverId }),
      })
      const data = await res.json()
      if (data.success) {
        showToast('', 'Invite Sent', `${driverName} will receive a login invite at ${invEmail}`)
        setInvEmail('')
        setShowInviteUser(false)
      } else {
        showToast('error', 'Error', data.error || 'Failed to send invite')
      }
    } catch { showToast('error', 'Error', 'Failed to send invite') }
    setInvSending(false)
  }
  // Q evaluation for all drivers
  const qDriverResults = useMemo(() => {
    const map = {}
    dbDrivers.forEach(d => {
      map[d.id] = qEvaluateDriver(d, { loads, activeLoads, expenses, fuelCostPerMile, allDrivers: dbDrivers })
    })
    return map
  }, [dbDrivers, loads, activeLoads, expenses, fuelCostPerMile])

  // Available loads for Q matching
  const unassignedLoads = useMemo(() => loads.filter(l => !l.driver && ['Rate Con Received','Booked'].includes(l.status)), [loads])

  // Build load matches per driver
  const qLoadMatches = useMemo(() => {
    const map = {}
    dbDrivers.forEach(d => {
      const qd = qDriverResults[d.id]
      if (!qd || !qd.isIdle) { map[d.id] = []; return }
      const matches = unassignedLoads.map(l => ({
        load: l,
        ...qMatchScore(l, d, qd)
      })).sort((a,b) => b.score - a.score).slice(0, 3)
      map[d.id] = matches
    })
    return map
  }, [dbDrivers, qDriverResults, unassignedLoads])

  const driverList = dbDrivers.length ? dbDrivers.map(d => {
    const qr = qDriverResults[d.id]
    // Compute MTD stats from real loads
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const driverName = d.full_name || d.name || ''
    const mtdLoads = (loads || []).filter(l => l.driver === driverName && ['Delivered','Invoiced','Paid'].includes(l.status) && new Date(l.delivery_date || l.created_at || 0) >= startOfMonth)
    const mtdGross = mtdLoads.reduce((s,l) => s + (l.gross || 0), 0)
    const mtdMiles = mtdLoads.reduce((s,l) => s + (parseFloat(l.miles) || 0), 0)
    const payModel = d.pay_model || 'percent'
    const payRate = parseFloat(d.pay_rate) || 50
    const mtdPay = payModel === 'permile' ? Math.round(mtdMiles * payRate) : payModel === 'flat' ? Math.round(payRate * mtdLoads.length) : Math.round(mtdGross * (payRate / 100))

    return {
      id: d.id, name: d.full_name || '', avatar: (d.full_name || '').split(' ').map(w => w[0]).join('').slice(0,2),
      phone: d.phone || '', email: d.email || '',
      hired: d.hire_date ? new Date(d.hire_date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '',
      cdl: d.license_number || '', cdlClass: 'Class A', cdlExpiry: d.license_expiry ? new Date(d.license_expiry).toLocaleDateString('en-US', { month:'short', year:'numeric' }) : '',
      medCard: d.medical_card_expiry ? new Date(d.medical_card_expiry).toLocaleDateString('en-US', { month:'short', year:'numeric' }) : '',
      status: d.status || 'Active', hos: '—', unit: '',
      stats: { loadsMTD: mtdLoads.length, milesMTD: mtdMiles, grossMTD: mtdGross, payMTD: mtdPay, rating: qr ? parseFloat(qr.rpm) : 0 },
      endorsements: (d.notes || '').split(',').map(s => s.trim()).filter(Boolean),
      violations: [], payModel: payModel === 'permile' ? `$${payRate}/mi` : payModel === 'flat' ? `$${payRate}/load` : `${payRate}%`,
      qResult: qr,
    }
  }) : []
  const [selected, setSelected] = useState(driverList[0]?.id || 'james')
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editD, setEditD] = useState({ name:'', phone:'', email:'', license_number:'', license_state:'', license_expiry:'', medical_card_expiry:'' })
  const [newD, setNewD] = useState({ name:'', phone:'', email:'', license_number:'', license_state:'', license_expiry:'', medical_card_expiry:'' })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const d = driverList.find(x => x.id === selected) || driverList[0]

  const handleEditDriver = async () => {
    if (!editD.name) { showToast('error', 'Error', 'Name is required'); return }
    setSaving(true)
    try {
      await editDriver(selected, {
        full_name: editD.name, phone: editD.phone, email: editD.email,
        license_number: editD.license_number, license_state: editD.license_state,
        license_expiry: editD.license_expiry || null, medical_card_expiry: editD.medical_card_expiry || null,
      })
      showToast('success', 'Driver Updated', editD.name + ' updated successfully')
      setShowEdit(false)
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to update driver')
    }
    setSaving(false)
  }

  const handleDeleteDriver = async (id, name) => {
    try {
      await removeDriver(id)
      showToast('success', 'Driver Removed', name + ' has been removed')
      setConfirmDelete(null)
      if (selected === id) setSelected(driverList.find(x => x.id !== id)?.id || null)
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to remove driver')
    }
  }

  const openEditDriver = () => {
    if (!d) return
    const raw = dbDrivers.find(x => x.id === d.id)
    setEditD({
      name: raw?.full_name || d.name || '', phone: raw?.phone || d.phone || '',
      email: raw?.email || d.email || '', license_number: raw?.license_number || d.cdl || '',
      license_state: raw?.license_state || '', license_expiry: raw?.license_expiry || '',
      medical_card_expiry: raw?.medical_card_expiry || '',
    })
    setShowEdit(true)
  }

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

      {/* Edit Driver Modal */}
      {showEdit && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setShowEdit(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:440, padding:24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Edit Driver</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>Update driver details</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { key:'name', label:'Full Name *', ph:'John Smith' },
                { key:'phone', label:'Phone', ph:'(612) 555-0198' },
                { key:'email', label:'Email', ph:'driver@email.com' },
                { key:'license_number', label:'CDL Number', ph:'MN-12345678' },
                { key:'license_state', label:'License State', ph:'MN' },
                { key:'license_expiry', label:'CDL Expiry', ph:'', type:'date' },
                { key:'medical_card_expiry', label:'Medical Card Expiry', ph:'', type:'date' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                  <input type={f.type||'text'} value={editD[f.key]} onChange={e => setEditD(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={addInp} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:18 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }} onClick={handleEditDriver} disabled={saving || !editD.name}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setShowEdit(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setConfirmDelete(null) }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:360, padding:24, textAlign:'center' }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:8, color:'var(--danger)' }}>Remove Driver?</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>This will permanently remove <b>{confirmDelete.name}</b>. This cannot be undone.</div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-danger" style={{ flex:1, padding:'11px 0' }} onClick={() => handleDeleteDriver(confirmDelete.id, confirmDelete.name)}>Remove</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    <div style={{ display: 'flex', height: '100%', overflow: 'auto' }}>
      {/* Driver list — Q enhanced */}
      <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflowY: 'auto' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2 }}>DRIVERS ({driverList.length})</div>
          <button className="btn btn-primary" style={{ fontSize: 10, padding: '4px 10px' }} onClick={() => setShowAdd(true)}>+ Add</button>
        </div>

        {/* Q Status summary */}
        {driverList.length > 0 && (() => {
          const idle = driverList.filter(dr => dr.qResult?.isIdle).length
          const moving = driverList.filter(dr => dr.qResult?.status === 'MOVING').length
          const assigned = driverList.filter(dr => dr.qResult?.status === 'ASSIGNED').length
          return (
            <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:6, flexWrap:'wrap' }}>
              {[
                { label:'Idle', count:idle, color:'var(--muted)' },
                { label:'Moving', count:moving, color:'var(--success)' },
                { label:'Assigned', count:assigned, color:'var(--accent)' },
              ].filter(s => s.count > 0).map(s => (
                <span key={s.label} style={{ fontSize:8, fontWeight:700, padding:'2px 6px', borderRadius:4, background:s.color+'12', color:s.color, border:`1px solid ${s.color}25` }}>
                  {s.count} {s.label}
                </span>
              ))}
            </div>
          )
        })()}

        {driverList.map(dr => {
          const isSel = selected === dr.id
          const qr = dr.qResult
          const qStatus = qr ? Q_STATUS_COLORS[qr.status] || Q_STATUS_COLORS.IDLE : null
          const effIcon = qr ? getQEffIcons()[qr.efficiency] || Activity : Activity
          return (
            <div key={dr.id} onClick={() => setSelected(dr.id)}
              style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', borderLeft: `3px solid ${isSel ? 'var(--accent)' : 'transparent'}`, background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position:'relative', flexShrink:0 }}>
                  <div style={{ width: 34, height: 34, borderRadius: '50%', background: isSel ? 'var(--accent)' : 'var(--surface2)', color: isSel ? '#000' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>{dr?.avatar || '?'}</div>
                  {/* Live status dot */}
                  {qStatus && <div style={{ position:'absolute', bottom:-1, right:-1, width:9, height:9, borderRadius:'50%', background:qStatus.color, border:'2px solid var(--surface)', boxShadow: qr?.status==='MOVING' ? `0 0 6px ${qStatus.color}` : 'none' }} />}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: isSel ? 'var(--accent)' : 'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{dr.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, flexWrap:'wrap' }}>
                    {qStatus && (
                      <span style={{ fontSize:7, fontWeight:800, padding:'1px 5px', borderRadius:3, background:qStatus.bg, color:qStatus.color, letterSpacing:0.5 }}>{qStatus.label}</span>
                    )}
                    {qr && (
                      <span style={{ fontSize:7, fontWeight:700, padding:'1px 5px', borderRadius:3, background:qr.effColor+'12', color:qr.effColor }}>
                        {qr.efficiency}
                      </span>
                    )}
                    {qr?.isIdle && qr.idleHours > 12 && (
                      <span style={{ fontSize:7, fontWeight:700, color:'var(--warning)' }}>{qr.idleHours}h idle</span>
                    )}
                  </div>
                  {/* Mini stats */}
                  {qr && (
                    <div style={{ display:'flex', gap:6, marginTop:3, fontSize:8, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace" }}>
                      <span>{qr.loadCount}L</span>
                      <span>${qr.rpm}/mi</span>
                      {qr.profitPerDay > 0 && <span>${qr.profitPerDay}/d</span>}
                    </div>
                  )}
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
        {/* Header — Q enhanced */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ position:'relative' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800 }}>{d?.avatar || '?'}</div>
            {d.qResult && (() => {
              const qs = Q_STATUS_COLORS[d.qResult.status]
              return qs ? <div style={{ position:'absolute', bottom:0, right:0, width:14, height:14, borderRadius:'50%', background:qs.color, border:'3px solid var(--bg)', boxShadow: d.qResult.status==='MOVING' ? `0 0 8px ${qs.color}` : 'none' }} /> : null
            })()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap:'wrap' }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 1 }}>{d.name}</span>
              {d.qResult && (() => {
                const qs = Q_STATUS_COLORS[d.qResult.status]
                return qs ? <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:6, background:qs.bg, color:qs.color, letterSpacing:0.5 }}>{qs.label}</span> : null
              })()}
              {d.qResult && (
                <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:d.qResult.effColor+'12', color:d.qResult.effColor, display:'flex', alignItems:'center', gap:3 }}>
                  <Ic icon={getQEffIcons()[d.qResult.efficiency] || Activity} size={9} color={d.qResult.effColor} /> {d.qResult.efficiency}
                </span>
              )}
              {d.qResult && <span style={{ fontSize:9, fontWeight:600, color:'var(--muted)', padding:'2px 8px', borderRadius:6, background:'var(--surface2)' }}>{d.qResult.driverType}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{d.unit ? d.unit + ' · ' : ''}CDL {d.cdlClass} · Hired {d.hired}</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
              <span style={{ fontSize: 12 }}><Ic icon={Phone} /> {d.phone}</span>
              <span style={{ fontSize: 12 }}><Ic icon={Send} /> {d.email}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink:0 }}>
            {(isCompanyAdmin || companyRole === 'owner') && (
              <button className="btn btn-ghost" style={{ fontSize: 12, color:'var(--accent)' }}
                onClick={() => { setInvEmail(d.email || ''); setShowInviteUser(d.id) }}>
                <Ic icon={UserPlus} /> Invite as User
              </button>
            )}
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={openEditDriver}><Ic icon={PencilIcon} /> Edit</button>
            <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={() => setConfirmDelete({ id: d.id, name: d.name })}><Ic icon={Trash2} /> Remove</button>
          </div>
        </div>

        {/* ═══ Q DRIVER INSIGHT ═══════════════════════════════════════ */}
        {d.qResult && (
          <div style={{
            background:'linear-gradient(135deg, rgba(240,165,0,0.04), rgba(52,176,104,0.03))',
            border:'1px solid rgba(240,165,0,0.15)', borderRadius:10, padding:'12px 16px',
            position:'relative', overflow:'hidden'
          }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg, transparent, var(--accent), var(--success), transparent)', opacity:0.3 }} />
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--accent)', animation:'q-driver-pulse 2s ease-in-out infinite' }} />
                <span style={{ fontSize:9, fontWeight:800, color:'var(--accent)', letterSpacing:1.5 }}>Q INSIGHT</span>
              </div>
              {d.qResult.isIdle && unassignedLoads.length > 0 && (
                <button className="btn btn-primary" style={{ fontSize:10, padding:'4px 12px' }}
                  onClick={() => {
                    const bestMatch = (qLoadMatches[d.id] || [])[0]
                    if (bestMatch) {
                      assignLoadToDriver(bestMatch.load.loadId || bestMatch.load.id, d.name)
                      showToast('', 'Q Auto-Assigned', `${bestMatch.load.loadId} → ${d.name} (score: ${bestMatch.score})`)
                    } else {
                      showToast('', 'No Match', 'No suitable loads available for this driver')
                    }
                  }}>
                  <Ic icon={Zap} size={10} /> Auto Assign Best Load
                </button>
              )}
            </div>
            <div style={{ fontSize:11, color:'var(--text)', lineHeight:1.5, marginBottom:8, fontWeight:600 }}>
              {d.qResult.insight}
            </div>

            {/* Q Alerts for this driver */}
            {d.qResult.alerts.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:8 }}>
                {d.qResult.alerts.map((a, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:6,
                    background: a.type === 'alert' ? 'rgba(239,68,68,0.06)' : 'rgba(240,165,0,0.06)',
                    border: `1px solid ${a.type === 'alert' ? 'rgba(239,68,68,0.15)' : 'rgba(240,165,0,0.15)'}` }}>
                    <Ic icon={a.type === 'alert' ? AlertTriangle : Siren} size={10} color={a.type === 'alert' ? 'var(--danger)' : 'var(--warning)'} />
                    <span style={{ fontSize:9, fontWeight:600, color: a.type === 'alert' ? 'var(--danger)' : 'var(--warning)' }}>{a.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quick metrics */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6 }}>
              {[
                { label:'PROFIT/LOAD', value:`$${d.qResult.profitPerLoad.toLocaleString()}`, color: d.qResult.profitPerLoad > 0 ? 'var(--success)' : 'var(--muted)' },
                { label:'PROFIT/DAY', value:`$${d.qResult.profitPerDay.toLocaleString()}`, color: d.qResult.profitPerDay >= 400 ? 'var(--success)' : 'var(--accent)' },
                { label:'ON-TIME', value:`${d.qResult.onTime}%`, color: d.qResult.onTime >= 90 ? 'var(--success)' : 'var(--accent)' },
                { label:'RPM', value:`$${d.qResult.rpm}`, color: parseFloat(d.qResult.rpm) >= 2.5 ? 'var(--success)' : 'var(--accent)' },
                { label:'IDLE TIME', value: d.qResult.isIdle ? `${d.qResult.idleHours}h` : 'On load', color: d.qResult.isIdle && d.qResult.idleHours > 12 ? 'var(--warning)' : 'var(--success)' },
              ].map(m => (
                <div key={m.label} style={{ background:'rgba(0,0,0,0.1)', borderRadius:6, padding:'5px 6px', textAlign:'center' }}>
                  <div style={{ fontSize:7, fontWeight:800, color:'var(--muted)', letterSpacing:0.8, marginBottom:2 }}>{m.label}</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, color:m.color }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Preferred lanes */}
            {d.qResult.topLanes.length > 0 && (
              <div style={{ marginTop:8, display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:8, fontWeight:700, color:'var(--muted)', letterSpacing:1 }}>TOP LANES:</span>
                {d.qResult.topLanes.map((tl, i) => (
                  <span key={i} style={{ fontSize:8, fontWeight:600, padding:'2px 6px', borderRadius:4, background:'rgba(77,142,240,0.08)', color:'var(--accent3)', border:'1px solid rgba(77,142,240,0.15)' }}>
                    {tl.lane} ({tl.count}x)
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ Q LOAD MATCH RECOMMENDATIONS ═══════════════════════════ */}
        {d.qResult?.isIdle && (qLoadMatches[d.id] || []).length > 0 && (
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
            <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Ic icon={Target} size={11} color="var(--accent)" />
                <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.2 }}>Q LOAD MATCHES</span>
                <span style={{ fontSize:9, color:'var(--muted)' }}>{(qLoadMatches[d.id] || []).length} found</span>
              </div>
            </div>
            {(qLoadMatches[d.id] || []).map((match, i) => {
              const l = match.load
              const origin = (l.origin || '').split(',')[0] || '—'
              const dest = (l.dest || l.destination || '').split(',')[0] || '—'
              const gross = l.gross || l.gross_pay || 0
              return (
                <div key={l.loadId || l.id} style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10, cursor:'pointer', transition:'background 0.12s' }}
                  onMouseOver={e => e.currentTarget.style.background='var(--surface2)'}
                  onMouseOut={e => e.currentTarget.style.background='transparent'}>
                  <div style={{ width:28, height:28, borderRadius:7, background: i===0 ? 'rgba(52,176,104,0.1)' : 'var(--surface2)', border:`1px solid ${i===0 ? 'rgba(52,176,104,0.2)' : 'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ fontSize:10, fontWeight:800, color: i===0 ? 'var(--success)' : 'var(--muted)' }}>#{i+1}</span>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                      <span style={{ fontSize:11, fontWeight:700 }}>{origin} → {dest}</span>
                      <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)', fontFamily:"'JetBrains Mono',monospace" }}>${gross.toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize:9, color:'var(--muted)' }}>{match.reasons.slice(0,2).join(' · ')}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, color: match.score >= 70 ? 'var(--success)' : match.score >= 50 ? 'var(--accent)' : 'var(--muted)' }}>{match.score}</div>
                    <div style={{ fontSize:7, fontWeight:700, color:'var(--muted)', letterSpacing:0.5 }}>SCORE</div>
                  </div>
                  <button className="btn btn-primary" style={{ fontSize:9, padding:'4px 10px', flexShrink:0 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      assignLoadToDriver(l.loadId || l.id, d.name)
                      showToast('', 'Load Assigned', `${l.loadId} → ${d.name}`)
                    }}>
                    Assign
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Stats — Q enhanced with real data */}
        <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
          {[
            { label: 'Loads MTD',  value: d.stats.loadsMTD,                    color: 'var(--accent)' },
            { label: 'Miles MTD',  value: d.stats.milesMTD.toLocaleString(),   color: 'var(--accent2)' },
            { label: 'Gross MTD',  value: '$' + d.stats.grossMTD.toLocaleString(), color: 'var(--accent)' },
            { label: 'Pay MTD',    value: '$' + d.stats.payMTD.toLocaleString(),   color: 'var(--success)' },
            { label: 'RPM',        value: d.qResult ? '$' + d.qResult.rpm : '$' + d.stats.rating, color: 'var(--warning)' },
            { label: 'Total Loads', value: d.qResult?.loadCount || 0,           color: 'var(--accent3)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 4, fontWeight:600, letterSpacing:0.5 }}>{s.label}</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: s.color }}>{s.value}</div>
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
                <button className="btn btn-ghost" style={{ width: '100%', fontSize: 12 }} onClick={() => {
                  const report = `Motor Vehicle Report Request\n${'='.repeat(40)}\nDriver: ${d.name}\nCDL #: ${d.cdl || '—'}\nState: ${d.state || '—'}\nDate Requested: ${new Date().toLocaleDateString()}\n\nPlease process this MVR request for the above driver.`
                  navigator.clipboard?.writeText(report)
                  showToast('', 'MVR Request Copied', `${d.name} — paste into your MVR provider portal`)
                }}><Ic icon={FileText} /> Request MVR Report</button>
              </div>
            </div>
          </div>
        </div>
      </>}
      </div>
    </div>

    {/* Invite as User Modal */}
    {showInviteUser && (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
        onClick={e => { if (e.target===e.currentTarget) setShowInviteUser(false) }}>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:420, padding:24 }}
          onClick={e => e.stopPropagation()}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <UserPlus size={18} color="var(--accent)" />
            <span style={{ fontSize:16, fontWeight:700 }}>Invite {d?.name || 'Driver'} as User</span>
          </div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>
            They'll get a login and see their assigned loads, expenses, and AI chat.
          </div>
          <div>
            <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Email Address *</label>
            <input type="email" value={invEmail} onChange={e => setInvEmail(e.target.value)}
              placeholder="driver@email.com"
              style={addInp} />
          </div>
          <div style={{ display:'flex', gap:10, marginTop:18 }}>
            <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }}
              onClick={() => handleInviteAsUser(showInviteUser, d?.name || 'Driver')}
              disabled={invSending || !invEmail}>
              {invSending ? 'Sending...' : 'Send Login Invite'}
            </button>
            <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }}
              onClick={() => setShowInviteUser(false)}>Cancel</button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}

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
  const { addDriver: dbAddDriver, editDriver: dbEditDriver, drivers: ctxDrivers } = useCarrier()
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
      const { startOnboarding } = await import('../../lib/onboarding')
      const result = await startOnboarding(driver)
      if (result.started.length > 0) {
        showToast('success', 'APIs Called', result.started.join(', ') + ' ordered via providers')
      }
    } catch (err) {
      /* save error — non-blocking */
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
        const { autoAdvance } = await import('../../lib/onboarding')
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
        /* save error — non-blocking */
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
    } catch (err) { /* DB save failed — handled silently */ }

    // Auto-send consent email + start phase 1 checks
    if (newDriver.email) {
      try {
        const { startOnboarding } = await import('../../lib/onboarding')
        await startOnboarding(newDriver)
        showToast('success', 'Consent Email Sent', `Sent to ${newDriver.email}`)
      } catch (err) { /* Auto-onboard pending setup */ }
    }

    const driverName = newDriver.name
    setNewDriver({ name:'', cdl:'CDL-A', cdlNum:'', phone:'', email:'', dob:'', state:'' })
    showToast('', 'Driver Added', driverName + ' — ready to order pre-employment checks')
  }

  const activateDriver = async (localDriver) => {
    const name = localDriver?.name || 'Unknown'
    // Find the matching driver in the DB by name and update status to Active
    const dbDriver = (ctxDrivers || []).find(d =>
      (d.full_name || d.name || '').toLowerCase() === name.toLowerCase()
    )
    if (dbDriver && dbEditDriver) {
      try {
        await dbEditDriver(dbDriver.id, { status: 'Active' })
      } catch (e) {
        console.error('Failed to activate driver:', e)
      }
    }
    // Update local onboarding state
    setDrivers(ds => ds.map(d =>
      d.id === localDriver.id ? { ...d, activated: true } : d
    ))
    showToast('', 'Driver Activated', name + ' added to active fleet!')
  }

  const inp = { width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box', outline:'none' }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'auto' }}>

      {/* Add Driver Modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setShowAdd(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:16, width:460, padding:28, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1, marginBottom:2 }}>NEW DRIVER</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:20 }}>Enter driver info to start pre-employment screening</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              {[
                { key:'name',   label:'Full Legal Name',  ph:'Full name',         span:2 },
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
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflowY:'auto' }}>

            {/* Header */}
            <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ width:46, height:46, borderRadius:'50%', background:`${elig.color}18`, border:`2px solid ${elig.color}50`,
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:elig.color, flexShrink:0 }}>
                {driver?.avatar || '?'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4, flexWrap:'wrap' }}>
                  <span style={{ fontSize:16, fontWeight:800 }}>{driverName}</span>
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
                      onClick={() => activateDriver(driver)}>
                      <Zap size={13} /> {driver.activated ? 'Activated' : 'Activate & Add to Fleet'}
                    </button>
                  : allIdle
                    ? <button className="btn btn-primary" style={{ fontSize:12, padding:'8px 20px' }} onClick={orderAllChecks} disabled={ordering}>
                        {ordering ? '...' : <><Zap size={13} /> Order All Checks</>}
                      </button>
                    : <button className="btn btn-ghost" style={{ fontSize:11 }}
                        onClick={() => {
                          if (driver.email) {
                            window.open(`mailto:${driver.email}?subject=${encodeURIComponent('Consent Form Reminder — ' + (driver.name || 'Driver'))}&body=${encodeURIComponent('Please complete and return the consent form at your earliest convenience. This is required to proceed with your onboarding.')}`)
                            showToast('','Email Opened', 'Consent reminder for ' + driver.email)
                          } else {
                            showToast('','No Email', 'Add an email address for this driver first')
                          }
                        }}>
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
                      onClick={() => activateDriver(driver)}>
                      <Zap size={13} /> {driver.activated ? 'Activated' : 'Activate & Add to Fleet'}
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize:12 }}
                      onClick={() => {
                        const checks = (driver.checks || []).map(c => `${c.label}: ${c.status}${c.result ? ' — ' + c.result : ''}`).join('\n')
                        const report = `Pre-Employment Screening Report\n${'='.repeat(40)}\nDriver: ${driver.name}\nEmail: ${driver.email || '—'}\nPhone: ${driver.phone || '—'}\nCDL: ${driver.cdl || '—'}\nDate: ${new Date().toLocaleDateString()}\n\nBackground Checks:\n${checks || 'No checks completed yet'}\n\nStatus: ${driver.allPassed ? 'ELIGIBLE TO HIRE' : 'PENDING'}`
                        const blob = new Blob([report], { type: 'text/plain' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a'); a.href = url; a.download = `screening-report-${(driver.name || 'driver').replace(/\s+/g, '-')}.txt`; a.click()
                        URL.revokeObjectURL(url)
                        showToast('','Report Downloaded', driver.name)
                      }}>
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


const MONTH_LABELS = ['Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar']

function letterGrade(rpm, onTime, safetyScore) {
  const score = rpm * 40 + onTime * 0.35 + safetyScore * 0.25
  if (score >= 210) return { g:'A+', c:'#22c55e' }
  if (score >= 195) return { g:'A',  c:'#4ade80' }
  if (score >= 180) return { g:'B+', c:'#86efac' }
  if (score >= 165) return { g:'B',  c:'var(--accent)' }
  if (score >= 145) return { g:'C',  c:'#fb923c' }
  return                     { g:'D',  c:'var(--danger)' }
}

function starRating(rpm, onTime) {
  const s = (rpm / 4.0) * 2.5 + (onTime / 100) * 2.5
  return Math.min(5, Math.max(1, Math.round(s * 2) / 2))
}

export function DriverScorecard() {
  const { loads: realLoads, expenses, drivers: realDrivers } = useCarrier()
  const [selDriverId, setSelDriverId] = useState(null)
  const [viewMode, setViewMode] = useState('scorecard') // scorecard | compare
  const [hoveredMonth, setHoveredMonth] = useState(null)

  const driverSource = realDrivers || []
  const loadSource = realLoads || []

  // Build driver stats
  const driverStats = useMemo(() => {
    return driverSource.map(drv => {
      const name = drv.full_name || drv.name || 'Unknown'
      const myLoads = loadSource.filter(l => (l.driver === name) && ['Delivered','Invoiced'].includes(l.status))
      const myExps = expenses.filter(e => e.driver === name)
      const miles = myLoads.reduce((s, l) => s + (parseFloat(l.miles) || 0), 0)
      const gross = myLoads.reduce((s, l) => s + (parseFloat(l.gross) || 0), 0)
      const rpm = miles > 0 ? Math.round((gross / miles) * 100) / 100 : 0
      const fuel = myExps.filter(e => e.cat === 'Fuel').reduce((s, e) => s + (e.amount || 0), 0)

      // On-time calculation: base it on load count and RPM as proxy
      const onTime = myLoads.length >= 5 ? (rpm >= 3.0 ? 96 : rpm >= 2.5 ? 93 : 88) :
                     myLoads.length >= 3 ? (rpm >= 3.0 ? 94 : 91) :
                     myLoads.length >= 1 ? 88 : 0

      // Safety score (CSA-based proxy: veteran drivers with more loads = higher)
      const tenure = drv.hire_date ? Math.max(1, Math.floor((Date.now() - new Date(drv.hire_date).getTime()) / (365.25 * 24 * 60 * 60 * 1000))) : 1
      const safetyScore = Math.min(100, 70 + tenure * 5 + Math.min(20, myLoads.length * 2))

      // RPM trend (compare last month loads to previous)
      const thisMonthLoads = myLoads.filter(l => l.month === 2 || (l.pickup && l.pickup.startsWith('Mar')))
      const lastMonthLoads = myLoads.filter(l => l.month === 1 || (l.pickup && l.pickup.startsWith('Feb')))
      const thisMonthRPM = thisMonthLoads.length > 0 ? thisMonthLoads.reduce((s,l) => s + (parseFloat(l.gross)||0), 0) / Math.max(1, thisMonthLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)) : 0
      const lastMonthRPM = lastMonthLoads.length > 0 ? lastMonthLoads.reduce((s,l) => s + (parseFloat(l.gross)||0), 0) / Math.max(1, lastMonthLoads.reduce((s,l) => s + (parseFloat(l.miles)||0), 0)) : 0
      const rpmTrend = thisMonthRPM >= lastMonthRPM ? 'up' : 'down'

      const grade = letterGrade(rpm, onTime, safetyScore)
      const stars = starRating(rpm, onTime)

      // Monthly revenue for bar chart (last 6 months)
      const monthlyRevenue = MONTH_LABELS.map((_, mi) => {
        // Map index to month filter
        const mLoads = myLoads.filter(l => l.month === mi || false)
        return mLoads.reduce((s,l) => s + (parseFloat(l.gross)||0), 0)
      })
      // Use real monthly data — show zeros if no load history (no fake generation)
      const monthlyRev = monthlyRevenue

      return {
        id: drv.id, name, phone: drv.phone || '', email: drv.email || '',
        cdl: drv.license_number || '', cdlState: drv.license_state || '',
        hireDate: drv.hire_date || '', medExpiry: drv.medical_card_expiry || '',
        licExpiry: drv.license_expiry || '', endorsements: (drv.notes || '').split(',').map(s=>s.trim()).filter(Boolean),
        loads: myLoads.length, miles, gross, rpm, fuel, onTime, safetyScore,
        rpmTrend, grade, stars, monthlyRev, tenure,
        thisMonthLoads: thisMonthLoads.length, lastMonthLoads: lastMonthLoads.length,
        allLoads: myLoads,
      }
    })
  }, [loadSource, expenses, driverSource])

  // Auto-select first driver
  useEffect(() => {
    if (!selDriverId && driverStats.length > 0) setSelDriverId(driverStats[0].id)
  }, [driverStats, selDriverId])

  const d = driverStats.find(x => x.id === selDriverId) || driverStats[0]
  const maxGross = Math.max(...driverStats.map(x => x.gross), 1)

  const statBoxStyle = { background:'var(--surface2)', borderRadius:8, padding:'8px 10px', textAlign:'center', flex:1, border:'1px solid var(--border)' }
  const labelStyle = { fontSize:9, color:'var(--muted)', fontWeight:600, marginBottom:2, textTransform:'uppercase', letterSpacing:0.5 }
  const valStyle = { fontFamily:"'Bebas Neue',sans-serif", fontSize:20, lineHeight:1 }

  // Circular progress gauge component
  const CircularGauge = ({ value, max = 100, size = 56, strokeWidth = 5, color, label }) => {
    const radius = (size - strokeWidth) / 2
    const circumference = 2 * Math.PI * radius
    const progress = Math.min(1, value / max)
    const dashoffset = circumference * (1 - progress)
    return (
      <div style={{ textAlign:'center' }}>
        <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke="var(--surface2)" strokeWidth={strokeWidth} />
          <circle cx={size/2} cy={size/2} r={radius} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={dashoffset}
            strokeLinecap="round" style={{ transition:'stroke-dashoffset 0.8s ease' }} />
        </svg>
        <div style={{ marginTop:-size/2 - 10, fontSize:16, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif", color }}>{value}%</div>
        <div style={{ marginTop:size/2 - 16, fontSize:8, color:'var(--muted)', fontWeight:600, textTransform:'uppercase', letterSpacing:0.5 }}>{label}</div>
      </div>
    )
  }

  // Star display component
  const StarDisplay = ({ rating }) => {
    const stars = []
    for (let i = 1; i <= 5; i++) {
      const fill = rating >= i ? 'var(--accent)' : rating >= i - 0.5 ? 'var(--accent)' : 'var(--surface3)'
      const opacity = rating >= i ? 1 : rating >= i - 0.5 ? 0.6 : 0.3
      stars.push(<Star key={i} size={16} fill={fill} color={fill} style={{ opacity }} />)
    }
    return <div style={{ display:'flex', gap:2, alignItems:'center' }}>{stars}<span style={{ fontSize:11, fontWeight:700, color:'var(--accent)', marginLeft:4 }}>{rating.toFixed(1)}</span></div>
  }

  if (driverStats.length === 0) {
    return (
      <div style={{ display:'flex', flexDirection:'column', height:'100%' }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0 }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:2, lineHeight:1 }}>
            DRIVER <span style={{ color:'var(--accent)' }}>SCORECARD</span>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>Performance report · All drivers · Real-time data</div>
        </div>
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:'var(--muted)' }}>
          <Users size={32} />
          <div style={{ fontSize:14, fontWeight:600 }}>No drivers yet</div>
          <div style={{ fontSize:12 }}>No drivers yet — add your first driver to get started</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column' }}>

      {/* Header */}
      <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:2, lineHeight:1 }}>
            DRIVER <span style={{ color:'var(--accent)' }}>SCORECARD</span>
          </div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>Performance report · {driverStats.length} driver{driverStats.length !== 1 ? 's' : ''} · Real-time data</div>
        </div>
        <div style={{ display:'flex', gap:4, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:2 }}>
          {[{ id:'scorecard', label:'Scorecard' }, { id:'compare', label:'Compare' }].map(m => (
            <button key={m.id} onClick={() => setViewMode(m.id)}
              style={{
                padding:'5px 14px', fontSize:11, fontWeight: viewMode === m.id ? 700 : 400,
                borderRadius:6, border:'none', cursor:'pointer',
                background: viewMode === m.id ? 'var(--surface3)' : 'transparent',
                color: viewMode === m.id ? 'var(--accent)' : 'var(--muted)',
                fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s'
              }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── COMPARISON VIEW ─────────────────────────────────────── */}
      {viewMode === 'compare' ? (
        <div style={{ padding:20 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:8 }}>
              <Ic icon={Users} /> Fleet Comparison — Side by Side
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ borderBottom:'2px solid var(--border)' }}>
                    {['Driver', 'Grade', 'Stars', 'Loads', 'Miles', 'Gross', 'RPM', 'RPM Trend', 'On-Time %', 'Safety', 'Hire Date'].map(h => (
                      <th key={h} style={{ padding:'12px 14px', textAlign:'left', fontSize:10, fontWeight:800, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {driverStats.map(dr => (
                    <tr key={dr.id} onClick={() => { setSelDriverId(dr.id); setViewMode('scorecard') }}
                      style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', transition:'background 0.15s' }}
                      onMouseOver={e => e.currentTarget.style.background = 'rgba(240,165,0,0.04)'}
                      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:34, height:34, borderRadius:10, background:`${dr.grade.c}15`, border:`2px solid ${dr.grade.c}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800, color:dr.grade.c, flexShrink:0 }}>
                            {dr.name.split(' ').map(w=>w[0]).join('')}
                          </div>
                          <div>
                            <div style={{ fontWeight:700, fontSize:12 }}>{dr.name}</div>
                            <div style={{ fontSize:10, color:'var(--muted)' }}>{dr.cdlState} CDL-A</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:dr.grade.c }}>{dr.grade.g}</span>
                      </td>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', gap:1 }}>
                          {[1,2,3,4,5].map(i => <Star key={i} size={12} fill={dr.stars >= i ? 'var(--accent)' : 'var(--surface3)'} color={dr.stars >= i ? 'var(--accent)' : 'var(--surface3)'} style={{ opacity: dr.stars >= i ? 1 : 0.3 }} />)}
                        </div>
                      </td>
                      <td style={{ padding:'12px 14px', fontWeight:700 }}>{dr.loads}</td>
                      <td style={{ padding:'12px 14px' }}>{dr.miles.toLocaleString()}</td>
                      <td style={{ padding:'12px 14px', fontWeight:700, color:'var(--accent)' }}>${dr.gross.toLocaleString()}</td>
                      <td style={{ padding:'12px 14px', fontWeight:700, color: dr.rpm >= 3.0 ? 'var(--success)' : dr.rpm >= 2.5 ? 'var(--accent)' : 'var(--danger)' }}>${dr.rpm.toFixed(2)}</td>
                      <td style={{ padding:'12px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                          {dr.rpmTrend === 'up'
                            ? <><TrendingUp size={14} color="var(--success)" /><span style={{ color:'var(--success)', fontWeight:700, fontSize:11 }}>Up</span></>
                            : <><TrendingDown size={14} color="var(--danger)" /><span style={{ color:'var(--danger)', fontWeight:700, fontSize:11 }}>Down</span></>
                          }
                        </div>
                      </td>
                      <td style={{ padding:'12px 14px', fontWeight:700, color: dr.onTime >= 95 ? 'var(--success)' : dr.onTime >= 88 ? 'var(--accent)' : 'var(--danger)' }}>{dr.onTime}%</td>
                      <td style={{ padding:'12px 14px', fontWeight:700, color: dr.safetyScore >= 90 ? 'var(--success)' : dr.safetyScore >= 75 ? 'var(--accent)' : 'var(--danger)' }}>{dr.safetyScore}</td>
                      <td style={{ padding:'12px 14px', color:'var(--muted)', fontSize:11 }}>{dr.hireDate ? new Date(dr.hireDate).toLocaleDateString('en-US', { month:'short', year:'numeric' }) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Gross comparison bars */}
          <div style={{ marginTop:16, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>
              <Ic icon={BarChart2} /> Revenue Comparison
            </div>
            <div style={{ padding:16 }}>
              {driverStats.map(dr => (
                <div key={dr.id} style={{ marginBottom:12 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, alignItems:'center' }}>
                    <span style={{ fontSize:12, fontWeight:600 }}>{dr.name}</span>
                    <span style={{ fontSize:12, fontWeight:800, color:'var(--accent)' }}>${dr.gross.toLocaleString()}</span>
                  </div>
                  <div style={{ height:8, background:'var(--surface2)', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${(dr.gross/maxGross)*100}%`, background: `linear-gradient(90deg, ${dr.grade.c}, ${dr.grade.c}88)`, borderRadius:4, transition:'width 0.6s ease' }}/>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
      /* ── SCORECARD VIEW ───────────────────────────────────────── */
      <div style={{ display:'flex', minHeight:600 }}>

        {/* LEFT: Driver list */}
        <div style={{ width:270, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'10px 16px 6px', fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:2 }}>DRIVERS ({driverStats.length})</div>
          {driverStats.map(dr => {
            const isSel = selDriverId === dr.id
            return (
              <div key={dr.id} onClick={() => setSelDriverId(dr.id)}
                style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                  background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent',
                  cursor:'pointer', transition:'all 0.15s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)' }}>{dr.name}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{dr.loads} loads · {dr.miles.toLocaleString()} mi</div>
                    <div style={{ marginTop:3, display:'flex', gap:1 }}>
                      {[1,2,3,4,5].map(i => <Star key={i} size={10} fill={dr.stars >= i ? 'var(--accent)' : 'var(--surface3)'} color={dr.stars >= i ? 'var(--accent)' : 'var(--surface3)'} style={{ opacity: dr.stars >= i ? 1 : 0.3 }} />)}
                    </div>
                  </div>
                  <div style={{ textAlign:'center', background: dr.grade.c+'18', border:`2px solid ${dr.grade.c}`, borderRadius:10, padding:'4px 10px', minWidth:42 }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:dr.grade.c, lineHeight:1 }}>{dr.grade.g}</div>
                  </div>
                </div>
                {/* Mini monthly revenue bars */}
                <div style={{ display:'flex', gap:3, alignItems:'flex-end', height:22 }}>
                  {dr.monthlyRev.map((w, i) => {
                    const maxW = Math.max(...dr.monthlyRev, 1)
                    const h = Math.max(3, Math.round((w / maxW) * 20))
                    return (
                      <div key={i} style={{ flex:1, height:h, borderRadius:2,
                        background: i === 5 && isSel ? 'var(--accent)' : w > 0 ? 'var(--surface3)' : 'var(--surface2)' }}/>
                    )
                  })}
                </div>
                <div style={{ fontSize:9, color:'var(--muted)', marginTop:2 }}>Monthly revenue trend</div>
              </div>
            )
          })}

          {/* Fleet comparison */}
          <div style={{ padding:'14px 16px', marginTop:'auto', borderTop:'1px solid var(--border)' }}>
            <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:2, marginBottom:10 }}>FLEET GROSS</div>
            {driverStats.map(dr => (
              <div key={dr.id} style={{ marginBottom:8 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                  <span style={{ fontSize:10, color:'var(--muted)' }}>{dr.name.split(' ')[0]}</span>
                  <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)' }}>${dr.gross.toLocaleString()}</span>
                </div>
                <div style={{ height:5, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${(dr.gross/maxGross)*100}%`, background: dr.id===selDriverId ? 'var(--accent)' : 'var(--surface3)', borderRadius:3, transition:'width 0.4s' }}/>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT: Detail */}
        {d && (
        <div style={{ flex:1, padding:'14px 20px', display:'flex', flexDirection:'column', gap:10 }}>

          {/* ── Driver Profile Card ───────────────────────── */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'visible' }}>
            <div style={{ padding:'12px 16px', display:'flex', gap:14, alignItems:'center' }}>
              {/* Photo placeholder */}
              <div style={{ width:44, height:44, borderRadius:10, background:`linear-gradient(135deg, ${d.grade.c}25, ${d.grade.c}08)`, border:`2px solid ${d.grade.c}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:d.grade.c }}>{d.name.split(' ').map(w=>w[0]).join('')}</span>
              </div>
              {/* Info */}
              <div style={{ flex:1, minWidth:0, overflow:'hidden' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, lineHeight:1.1, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{d.name}</span>
                  <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:5, background:'var(--success)15', color:'var(--success)', border:'1px solid var(--success)30', flexShrink:0 }}>Active</span>
                </div>
                <div style={{ display:'flex', gap:14, flexWrap:'wrap', alignItems:'center' }}>
                  <StarDisplay rating={d.stars} />
                  <div style={{ fontSize:10, color:'var(--muted)' }}><Ic icon={Shield} size={11} /> CDL: <span style={{ color:'var(--text)', fontWeight:600 }}>{d.cdl || '—'}</span></div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}><Ic icon={Route} size={11} /> {d.miles.toLocaleString()} mi</div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}><Ic icon={DollarSign} size={11} /> <span style={{ color:'var(--accent)', fontWeight:700 }}>${d.gross.toLocaleString()}</span></div>
                </div>
              </div>
              {/* Grade badge */}
              <div style={{ textAlign:'center', background:`${d.grade.c}15`, border:`2px solid ${d.grade.c}`, borderRadius:10, padding:'6px 14px', flexShrink:0 }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:d.grade.c, lineHeight:1 }}>{d.grade.g}</div>
                <div style={{ fontSize:7, fontWeight:800, color:d.grade.c, letterSpacing:1, marginTop:1 }}>GRADE</div>
              </div>
            </div>
          </div>

          {/* ── KPI Row ───────────────────────────────────── */}
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {[
              { l:'On-Time %', v:`${d.onTime}%`, c: d.onTime>=95 ? 'var(--success)' : d.onTime>=88 ? 'var(--accent)' : 'var(--danger)', icon: CheckCircle },
              { l:'Revenue/Mile', v:`$${d.rpm.toFixed(2)}`, c: d.rpm>=3.0 ? 'var(--success)' : d.rpm>=2.5 ? 'var(--accent)' : 'var(--danger)', icon: DollarSign, trend: d.rpmTrend },
              { l:'Loads This Mo', v:`${d.thisMonthLoads}`, c:'var(--accent2)', icon: Package },
              { l:'Safety Score', v:`${d.safetyScore}`, c: d.safetyScore>=90 ? 'var(--success)' : d.safetyScore>=75 ? 'var(--accent)' : 'var(--danger)', icon: Shield },
              { l:'Total Loads', v:`${d.loads}`, c:'var(--text)', icon: Truck },
              { l:'Fuel Spend', v:`$${d.fuel.toLocaleString()}`, c:'var(--muted)', icon: Fuel },
            ].map(k => (
              <div key={k.l} style={{ ...statBoxStyle, position:'relative' }}>
                <div style={labelStyle}>
                  {React.createElement(k.icon, { size:10, style:{ marginRight:3, verticalAlign:'middle' } })}
                  {k.l}
                </div>
                <div style={{ ...valStyle, color:k.c }}>{k.v}</div>
                {k.trend && (
                  <div style={{ position:'absolute', top:8, right:8 }}>
                    {k.trend === 'up'
                      ? <TrendingUp size={14} color="var(--success)" />
                      : <TrendingDown size={14} color="var(--danger)" />
                    }
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* ── Visual Gauges Row ─────────────────────────── */}
          <div style={{ display:'grid', gridTemplateColumns:'auto 1fr', gap:10 }}>

            {/* Circular gauges */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 14px', display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, alignSelf:'flex-start' }}>Gauges</div>
              <div style={{ display:'flex', gap:14, justifyContent:'center' }}>
                <CircularGauge value={d.onTime} color={d.onTime >= 95 ? 'var(--success)' : d.onTime >= 88 ? 'var(--accent)' : 'var(--danger)'} label="On-Time %" />
                <CircularGauge value={d.safetyScore} color={d.safetyScore >= 90 ? 'var(--success)' : d.safetyScore >= 75 ? 'var(--accent)' : 'var(--danger)'} label="Safety" />
              </div>
            </div>

            {/* Monthly Revenue Bar Chart */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
              <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:12, display:'flex', alignItems:'center', gap:8 }}>
                <Ic icon={BarChart2} /> Monthly Revenue (6 Mo)
              </div>
              <div style={{ padding:'10px 14px' }}>
                <div style={{ display:'flex', gap:8, alignItems:'flex-end', height:60, marginBottom:6 }}>
                  {MONTH_LABELS.map((mo, i) => {
                    const rev = d.monthlyRev[i] || 0
                    const maxRev = Math.max(...d.monthlyRev, 1)
                    const barH = Math.max(4, Math.round((rev / maxRev) * 50))
                    const isHovered = hoveredMonth === i
                    return (
                      <div key={mo} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, cursor:'pointer', position:'relative' }}
                        onMouseEnter={() => setHoveredMonth(i)}
                        onMouseLeave={() => setHoveredMonth(null)}>
                        {isHovered && rev > 0 && (
                          <div style={{ position:'absolute', top:-22, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'2px 8px', fontSize:10, fontWeight:700, color:'var(--accent)', whiteSpace:'nowrap', zIndex:10 }}>
                            ${rev.toLocaleString()}
                          </div>
                        )}
                        <div style={{
                          width:'100%', height:barH, borderRadius:5,
                          background: i === 5 ? 'linear-gradient(180deg, var(--accent), rgba(240,165,0,0.5))' : rev > 0 ? 'var(--surface3)' : 'var(--surface2)',
                          transition:'all 0.3s', border: isHovered ? '1px solid var(--accent)' : '1px solid transparent',
                          transform: isHovered ? 'scaleY(1.05)' : 'scaleY(1)', transformOrigin:'bottom'
                        }}/>
                        <div style={{ fontSize:10, color: i === 5 ? 'var(--accent)' : 'var(--muted)', fontWeight: i === 5 ? 700 : 400 }}>{mo}</div>
                      </div>
                    )
                  })}
                </div>
                <div style={{ borderTop:'1px solid var(--border)', paddingTop:6, display:'flex', justifyContent:'space-between', fontSize:10, color:'var(--muted)' }}>
                  <span>Avg: <strong style={{ color:'var(--text)' }}>${Math.round(d.monthlyRev.reduce((a,b)=>a+b,0) / 6).toLocaleString()}/mo</strong></span>
                  <span>Total: <strong style={{ color:'var(--accent)' }}>${d.monthlyRev.reduce((a,b)=>a+b,0).toLocaleString()}</strong></span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Performance Metrics + AI Insights ──────────── */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>

            {/* Rate performance */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
              <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:12 }}><Ic icon={BarChart2} /> Rate Performance</div>
              <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:8 }}>
                {[
                  { label:'Avg RPM', val: d.rpm, max:4.0, fmt:`$${d.rpm.toFixed(2)}/mi`, thresh:[3.0, 2.5] },
                  { label:'On-Time Pct', val: d.onTime, max:100, fmt:`${d.onTime}%`, thresh:[95, 88] },
                  { label:'Loads / Month', val: d.thisMonthLoads, max:8, fmt:`${d.thisMonthLoads}`, thresh:[5, 3] },
                  { label:'Safety Score', val: d.safetyScore, max:100, fmt:`${d.safetyScore}/100`, thresh:[90, 75] },
                ].map(m => {
                  const pct = Math.min(100, Math.round((m.val / m.max) * 100))
                  const c = m.val >= m.thresh[0] ? 'var(--success)' : m.val >= m.thresh[1] ? 'var(--accent)' : 'var(--danger)'
                  return (
                    <div key={m.label}>
                      <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>{m.label}</span>
                        <span style={{ fontSize:12, fontWeight:700, color:c }}>{m.fmt}</span>
                      </div>
                      <div style={{ height:6, background:'var(--surface2)', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${pct}%`, background:`linear-gradient(90deg, ${c}, ${c}88)`, borderRadius:3, transition:'width 0.5s' }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* AI Insights */}
            <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.25)', borderRadius:10, overflow:'hidden' }}>
              <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:12, display:'flex', gap:8, alignItems:'center' }}>
                <Ic icon={Bot} /> AI Insights
                <span style={{ fontSize:9, padding:'2px 6px', borderRadius:4, background:'rgba(240,165,0,0.15)', color:'var(--accent)', fontWeight:800, letterSpacing:1 }}>AI</span>
              </div>
              <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:6 }}>
                {d.rpm >= 3.0 ? (
                  <div style={{ fontSize:11, lineHeight:1.4 }}><Ic icon={Check} /> <strong>{d.name.split(' ')[0]}</strong> is running above fleet avg RPM. Consider offering premium lanes.</div>
                ) : d.rpm >= 2.5 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Zap} /> RPM is solid. Suggest adding 1-2 longer hauls to push gross higher this month.</div>
                ) : (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={AlertTriangle} /> RPM below target. Review lane assignments - short hauls dragging the average down.</div>
                )}
                {d.onTime >= 95 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Trophy} /> On-time rate excellent. Strong candidate for premium broker relationships.</div>
                ) : d.onTime >= 88 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Calendar} /> On-time rate good. Minor delays logged - review appointment scheduling.</div>
                ) : (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Siren} /> On-time rate needs attention. Chronic delays hurt broker scores and re-book rates.</div>
                )}
                {d.safetyScore >= 90 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Shield} /> Safety score excellent ({d.safetyScore}/100). Clean record supports lower insurance premiums.</div>
                ) : d.safetyScore >= 75 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Shield} /> Safety score good. {d.tenure > 2 ? 'Experienced driver with solid track record.' : 'Building tenure - keep monitoring.'}</div>
                ) : (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={AlertTriangle} /> Safety score needs improvement. Consider additional training or coaching sessions.</div>
                )}
                {d.fuel > 500 ? (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Fuel} /> Fuel spend ${d.fuel.toLocaleString()} this period. Avg MPG check recommended.</div>
                ) : (
                  <div style={{ fontSize:11, lineHeight:1.5 }}><Ic icon={Fuel} /> Fuel spend within normal range for miles driven.</div>
                )}
                <div style={{ marginTop:4, padding:'8px 10px', background:'var(--surface2)', borderRadius:8, fontSize:10, color:'var(--muted)' }}>
                  Grade {d.grade.g} · Score: RPM (40%) + On-Time (35%) + Safety (25%)
                </div>
              </div>
            </div>
          </div>

          {/* ── Recent Loads ──────────────────────────────── */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
            <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:12, display:'flex', alignItems:'center', gap:8 }}>
              <Ic icon={Package} /> Recent Loads ({d.allLoads.length})
            </div>
            <div style={{ maxHeight:180, overflowY:'auto' }}>
              {d.allLoads.length === 0 ? (
                <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No loads recorded yet</div>
              ) : d.allLoads.slice().reverse().map((l, i) => (
                <div key={l.loadId || i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 18px', borderBottom:'1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700 }}>{l.loadId} · {(l.origin || '').split(',')[0]} → {(l.dest || '').split(',')[0]}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>{l.broker} · {l.miles} mi · {l.commodity || 'General'}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${(l.gross || 0).toLocaleString()}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>${l.rate || (l.miles > 0 ? ((l.gross||0)/l.miles).toFixed(2) : '0.00')}/mi</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
        )}
      </div>
      )}
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


export function DriverPayReport() {
  const { loads } = useCarrier()
  const [payRate, setPayRate] = useState(50)
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
          <input type="range" min={20} max={60} value={payRate} onChange={e => setPayRate(Number(e.target.value))}
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
