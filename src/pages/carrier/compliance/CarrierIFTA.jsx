import React, { useState, useMemo } from 'react'
import { Ic, AiBanner } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { generateIFTAPDF } from '../../../utils/generatePDF'
import {
  BarChart2, Edit3 as PencilIcon, Upload, Check, Download, FileText,
} from 'lucide-react'
import { ALL_IFTA_RATES, estimateStateMiles } from './helpers'

export function CarrierIFTA() {
  const { showToast } = useApp()
  const ctx = useCarrier ? useCarrier() : {}
  const loads = ctx?.loads || []
  const expenses = ctx?.expenses || []
  const company = ctx?.company || {}
  const [iftaTab, setIftaTab] = useState('report')
  const [avgMpg, setAvgMpg] = useState('6.9')
  const [manualOverrides, setManualOverrides] = useState({})
  const [showReturn, setShowReturn] = useState(false)

  // Pull actual fuel purchases from expenses for IFTA
  const fuelPurchases = useMemo(() => {
    const byState = {}
    expenses.forEach(e => {
      if ((e.cat || e.category || '').toLowerCase() !== 'fuel') return
      if (!e.state || !e.gallons) return
      const st = e.state.toUpperCase().trim()
      if (!byState[st]) byState[st] = { gallons: 0, amount: 0, count: 0 }
      byState[st].gallons += Number(e.gallons) || 0
      byState[st].amount += Number(e.amount) || 0
      byState[st].count += 1
    })
    return byState
  }, [expenses])

  const totalFuelGallons = Object.values(fuelPurchases).reduce((s, v) => s + v.gallons, 0)
  const totalFuelSpend = Object.values(fuelPurchases).reduce((s, v) => s + v.amount, 0)

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
      // Use actual fuel purchases for this state if available
      const fuelData = fuelPurchases[state]
      const purchasedGal = fuelData ? Math.round(fuelData.gallons) : 0
      const taxOwed = parseFloat((gal * rate).toFixed(2))
      const taxCredit = parseFloat((purchasedGal * rate).toFixed(2))
      const tax = parseFloat((taxOwed - taxCredit).toFixed(2))
      const isAutoCalc = !(state in manualOverrides) && state in autoMilesByState
      return { state, miles, gal, rate, tax, purchasedGal, taxOwed, taxCredit, status: 'Pending', isAutoCalc, hasFuelData: !!fuelData }
    })
    .sort((a, b) => b.miles - a.miles)

  const totalMiles = stateData.reduce((s, r) => s + r.miles, 0)
  const totalTax = stateData.reduce((s, r) => s + r.tax, 0)
  const refund = stateData.filter(r => r.tax < 0).reduce((s, r) => s + Math.abs(r.tax), 0)
  const owed = stateData.filter(r => r.tax > 0).reduce((s, r) => s + r.tax, 0)

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'auto' }}>
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
        <AiBanner title={`AI Auto-Calculated: ${Object.keys(autoMilesByState).length} states from ${loads.filter(l => ['Delivered','Invoiced','In Transit','Loaded'].includes(l.status)).length} loads${totalFuelGallons > 0 ? ` · ${Math.round(totalFuelGallons)} gal fuel logged` : ''}`} sub={totalMiles > 0 ? `${totalMiles.toLocaleString()} miles · Avg ${avgMpg} MPG · Net tax $${totalTax.toFixed(2)}${totalFuelSpend > 0 ? ` · Fuel spend $${totalFuelSpend.toLocaleString()}` : ' · Log fuel expenses with state + gallons for automatic IFTA credits'}` : 'No delivered loads this quarter yet — enter mileage manually or deliver loads to auto-calculate'} />

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
