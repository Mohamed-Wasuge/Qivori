import React, { useState, useEffect, useCallback } from 'react'
import { Ic, S } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { generateSettlementPDF } from '../../../utils/generatePDF'
import {
  Settings, Package, Clock, Zap, Briefcase, Download, Save, Square
} from 'lucide-react'
import { calcPay, PAY_MODELS, DEDUCT_PRESETS } from './helpers'

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

  const settlementPeriod = (() => {
    const now = new Date()
    const month = now.toLocaleDateString('en-US', { month: 'short' })
    const week = Math.ceil(now.getDate() / 7)
    return `${month} W${week}`
  })()
  const driverDeductions = deductions[activeDriver] || []
  const fuelRate = fuelCostPerMile || 0.55

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
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>Qivori TMS · Period: {settlementPeriod} · Generated {new Date().toLocaleDateString()}</div>
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
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: d.amount < 0 ? 'var(--danger)' : 'var(--success)' }}>
                  <span style={{ fontSize:9, fontWeight:700, marginRight:4, opacity:0.7 }}>{d.amount < 0 ? 'DEDUCTION' : 'REIMBURSE'}</span>
                  {d.amount < 0 ? '−' : '+'}${Math.abs(d.amount).toLocaleString()}
                </td>
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
            <button className="btn btn-ghost" style={{ padding: '11px 16px' }} onClick={() => generateSettlementPDF(driverName, mergedLoads, settlementPeriod)} title="Download Settlement PDF"><Ic icon={Download} /> PDF</button>
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
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:8, fontWeight:700, color: d.amount < 0 ? 'var(--danger)' : 'var(--success)', opacity:0.7, letterSpacing:0.5 }}>{d.amount < 0 ? 'DEDUCTION' : 'REIMBURSEMENT'}</div>
                  <div style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Bebas Neue',sans-serif", color: d.amount < 0 ? 'var(--danger)' : 'var(--success)' }}>
                    {d.amount < 0 ? '−' : '+'}${Math.abs(d.amount).toLocaleString()}
                  </div>
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
