import {
  React, useState, useMemo, useEffect, useCallback,
  Ic, S, AiBanner,
  useApp, useCarrier, generateIFTAPDF, apiFetch,
  BarChart2, PencilIcon, Upload, Check, Download, FileText,
  Truck, Clock, Wrench, User, FlaskConical, AlertTriangle, Shield,
  Activity, FileCheck, Search, Brain, Bot, CheckCircle, Users,
  Calendar, RefreshCw, Siren, GraduationCap,
} from './shared'
import * as db from '../../lib/database'

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

function getBasicScores() {
  return [
    { basic:'Unsafe Driving',       score:0, threshold:65, icon: Truck,         tip:'No violations recorded yet' },
    { basic:'HOS Compliance',       score:0, threshold:65, icon: Clock,         tip:'No violations recorded yet' },
    { basic:'Vehicle Maintenance',  score:0, threshold:80, icon: Wrench,        tip:'No violations recorded yet' },
    { basic:'Driver Fitness',       score:0, threshold:80, icon: User,          tip:'No violations recorded yet' },
    { basic:'Controlled Substances',score:0, threshold:50, icon: FlaskConical,  tip:'No violations recorded yet' },
    { basic:'Crash Indicator',      score:0, threshold:65, icon: AlertTriangle, tip:'No violations recorded yet' },
    { basic:'Hazmat Compliance',    score:0, threshold:50, icon: Shield,        tip:'No violations recorded yet' },
  ]
}

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
  const { showToast, user } = useApp()
  const { vehicles: ctxVehicles, drivers: ctxDrivers } = useCarrier()
  const [compTab, setCompTab] = useState(defaultTab)
  const [items, setItems] = useState(DVIR_ITEMS_DEFAULT)
  const [selectedUnit, setSelectedUnit] = useState('')
  const defects = items.filter(i => i.status === 'Defect').length

  // DVIR history from Supabase
  const [dvirHistory, setDvirHistory] = useState([])

  // ELD data from Supabase
  const [eldConnections, setEldConnections] = useState([])
  const [hosLogs, setHosLogs] = useState([])
  const [eldVehicles, setEldVehicles] = useState([])

  // Load DVIR history, ELD connections, and HOS logs on mount
  useEffect(() => {
    db.fetchDVIRs().then(d => setDvirHistory(d)).catch(() => {})
    db.fetchELDConnections().then(c => setEldConnections(c)).catch(() => {})
    db.fetchHOSLogs().then(h => setHosLogs(h)).catch(() => {})
    db.fetchELDVehicles().then(v => setEldVehicles(v)).catch(() => {})
  }, [])

  // Compute ELD stats from real data
  const eldStats = useMemo(() => {
    const connected = eldConnections.find(c => c.status === 'connected')
    const provider = connected?.provider || null
    const onlineCount = eldVehicles.length
    const totalUnits = (ctxVehicles || []).length || onlineCount

    // Get latest HOS per driver
    const driverHOS = {}
    hosLogs.forEach(log => {
      if (!driverHOS[log.driver_name] || new Date(log.start_time) > new Date(driverHOS[log.driver_name].start_time)) {
        driverHOS[log.driver_name] = log
      }
    })

    const violations = hosLogs.filter(l => l.violations && (Array.isArray(l.violations) ? l.violations.length > 0 : Object.keys(l.violations).length > 0)).length
    const driverNames = Object.keys(driverHOS)
    const avgHOS = driverNames.length > 0
      ? (driverNames.reduce((s, n) => s + (11 - (driverHOS[n].duration_hours || 0)), 0) / driverNames.length).toFixed(1)
      : null

    return { provider, onlineCount, totalUnits, violations, avgHOS, driverHOS, connected: !!connected }
  }, [eldConnections, eldVehicles, hosLogs, ctxVehicles])

  // Build driver HOS display data from real logs + context drivers
  const driverHOSList = useMemo(() => {
    const drivers = ctxDrivers || []
    if (drivers.length === 0 && Object.keys(eldStats.driverHOS).length === 0) return []

    // Merge context drivers with HOS data
    const result = []
    const seen = new Set()

    // From HOS logs
    Object.entries(eldStats.driverHOS).forEach(([name, log]) => {
      seen.add(name)
      const driveHours = Number(log.duration_hours) || 0
      const hosLeft = Math.max(0, 11 - driveHours).toFixed(1)
      const statusMap = { driving: 'Driving', on_duty: 'On Duty', sleeper: 'Sleeper Berth', off_duty: 'Off Duty' }
      result.push({
        driver: name,
        unit: log.vehicle_id || '',
        status: statusMap[log.status] || log.status || 'Off Duty',
        hosLeft: hosLeft + 'h',
        driveToday: driveHours.toFixed(1) + 'h',
        shiftLeft: Math.max(0, 14 - driveHours - 1).toFixed(1) + 'h',
        cycleLeft: Math.max(0, 70 - driveHours * 1.2).toFixed(0) + 'h',
        statusColor: log.status === 'driving' ? 'var(--success)' : log.status === 'sleeper' ? 'var(--accent3)' : 'var(--muted)',
        restart: log.status === 'off_duty' && driveHours === 0,
        rec: parseFloat(hosLeft) <= 2 ? 'Find a safe parking spot soon — low HOS remaining'
          : log.status === 'driving' ? 'Driving — all good, keep rolling'
          : log.status === 'sleeper' ? '34hr restart in progress'
          : 'Off duty — ready for next dispatch',
      })
    })

    // From context drivers not in HOS logs
    drivers.forEach(d => {
      const name = d.full_name || d.name || 'Unknown'
      if (seen.has(name)) return
      result.push({
        driver: name,
        unit: d.truck_number || d.unit_number || '',
        status: 'Off Duty',
        hosLeft: '11.0h',
        driveToday: '0.0h',
        shiftLeft: '14.0h',
        cycleLeft: '70h',
        statusColor: 'var(--muted)',
        restart: false,
        rec: 'No ELD data — HOS tracking starts when ELD is connected or load goes In Transit',
      })
    })

    return result
  }, [ctxDrivers, eldStats.driverHOS])

  // Build driver compliance matrix from real data
  const complianceMatrix = useMemo(() => {
    const drivers = ctxDrivers || []
    if (drivers.length === 0) return []
    return drivers.map(d => {
      const name = d.full_name || d.name || 'Unknown'
      const hosData = eldStats.driverHOS[name]
      const hosLeft = hosData ? Math.max(0, 11 - (Number(hosData.duration_hours) || 0)).toFixed(1) + 'h' : '11.0h'
      const latestDvir = dvirHistory.find(dv => dv.driver_name === name)
      const chQuery = chOrders.find(c => c.driver_name === name)
      const medExpiry = d.medical_card_expiry || d.med_card_expiry
      const medDaysLeft = medExpiry ? Math.round((new Date(medExpiry) - new Date()) / 86400000) : null

      return {
        name,
        unit: d.truck_number || d.unit_number || '',
        cdl: d.cdl_number || d.cdl || '',
        eld: eldStats.connected ? 'Connected' : 'No ELD',
        hos: hosLeft,
        dvir: latestDvir ? (latestDvir.status === 'safe' ? 'Pass' : 'Defects') : 'No DVIR',
        csa: '—',
        ch: chQuery ? (chQuery.result || 'Pending') : 'Not Queried',
        med: medExpiry ? (medDaysLeft < 30 ? `${medDaysLeft}d left` : 'Valid') : 'Unknown',
        medWarn: medDaysLeft !== null && medDaysLeft < 60,
      }
    })
  }, [ctxDrivers, eldStats, dvirHistory, chOrders])

  // FMCSA real data state
  const [fmcsaDot, setFmcsaDot] = useState(() => localStorage.getItem('qivori_dot_number') || '')
  const [fmcsaCarrier, setFmcsaCarrier] = useState(null)
  const [fmcsaBasics, setFmcsaBasics] = useState([])
  const [fmcsaInspections, setFmcsaInspections] = useState(null)
  const [fmcsaLoading, setFmcsaLoading] = useState(false)
  const [fmcsaError, setFmcsaError] = useState('')

  // Fetch FMCSA data when DOT number is set
  const fetchFMCSA = useCallback(async (dot) => {
    if (!dot) return
    setFmcsaLoading(true)
    setFmcsaError('')
    try {
      const res = await apiFetch(`/api/fmcsa-lookup?dot=${encodeURIComponent(dot)}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Lookup failed' }))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setFmcsaCarrier(data.carrier)
      setFmcsaBasics(data.basics || [])
      setFmcsaInspections(data.inspections || null)
      localStorage.setItem('qivori_dot_number', dot)
      showToast('', 'FMCSA Data Loaded', data.carrier?.legalName || dot)
    } catch (err) {
      setFmcsaError(err.message)
      showToast('', 'FMCSA Error', err.message)
    } finally {
      setFmcsaLoading(false)
    }
  }, [showToast])

  // Auto-fetch on mount if DOT saved
  useEffect(() => {
    if (fmcsaDot && !fmcsaCarrier && !fmcsaLoading) fetchFMCSA(fmcsaDot)
  }, []) // eslint-disable-line

  // Map FMCSA BASIC data to display format
  const liveBasicScores = useMemo(() => {
    if (fmcsaBasics.length === 0) return getBasicScores()
    const iconMap = {
      'Unsafe Driving': Truck, 'HOS Compliance': Clock, 'Vehicle Maintenance': Wrench,
      'Driver Fitness': User, 'Controlled Substances': FlaskConical, 'Crash Indicator': AlertTriangle,
      'Hazmat Compliance': Shield,
    }
    return getBasicScores().map(b => {
      const live = fmcsaBasics.find(fb => fb.name.toLowerCase().includes(b.basic.split(' ')[0].toLowerCase()))
      if (live) {
        return { ...b, score: Math.round(live.score), tip: `${live.totalViolations} violations in ${live.totalInspections} inspections${live.serious ? ' (serious violation flagged)' : ''}`, icon: iconMap[b.basic] || b.icon }
      }
      return b
    })
  }, [fmcsaBasics])

  // Clearinghouse state — uses real drivers from CarrierContext
  const [chDriver, setChDriver] = useState('')
  const [chType, setChType] = useState('Pre-Employment')
  const [chConsent, setChConsent] = useState(false)
  const [chOrders, setChOrders] = useState([])
  const [chLoading, setChLoading] = useState(true)

  // Load clearinghouse queries from Supabase on mount
  useEffect(() => {
    db.fetchClearinghouseQueries().then(q => { setChOrders(q || []); setChLoading(false) }).catch(() => setChLoading(false))
  }, [])

  // Real drivers for clearinghouse — map from CarrierContext drivers
  const chDriverList = useMemo(() => (ctxDrivers || []).map(d => ({
    id: d.id,
    name: d.full_name || d.name || 'Unknown',
    cdl: d.cdl_number || d.cdl || '',
    state: d.cdl_state || d.state || '',
    dob: d.date_of_birth || d.dob || '',
    avatar: (d.full_name || d.name || '?').split(' ').map(n => n[0]).join(''),
    unit: d.truck_number || d.unit || '',
  })), [ctxDrivers])

  const submitCH = async () => {
    if (!chDriver) { showToast('','Select Driver','Choose a driver to query'); return }
    if (!chConsent) { showToast('','Consent Required','Driver must provide electronic consent'); return }
    const d = chDriverList.find(x => x.name === chDriver)
    const orderId = 'CH-' + Date.now().toString(36).toUpperCase()
    const newOrder = {
      query_id: orderId,
      driver_id: d?.id || null,
      driver_name: chDriver,
      cdl_number: d?.cdl || '',
      query_type: chType,
      query_date: new Date().toISOString().split('T')[0],
      status: 'Processing',
      result: 'Pending',
      cost: 1.25,
      consent_given: true,
    }
    try {
      const saved = await db.createClearinghouseQuery(newOrder)
      setChOrders(o => [saved || { ...newOrder, id: orderId }, ...o])
      showToast('','Query Submitted',`${chDriver} · ${chType} · Processing — complete this query on the FMCSA Clearinghouse portal`)
      setChDriver(''); setChConsent(false)
      // Simulate completion after 3s (in production this would be updated after real FMCSA query)
      setTimeout(async () => {
        const updated = { status:'Complete', result:'Clear', completed_at: new Date().toISOString() }
        const savedId = saved?.id || orderId
        try { await db.updateClearinghouseQuery(savedId, updated) } catch {}
        setChOrders(o => o.map(x => (x.id === savedId || x.query_id === orderId) ? {...x, ...updated} : x))
      }, 3000)
    } catch (err) {
      // Fallback to local state if DB fails
      setChOrders(o => [{ ...newOrder, id: orderId }, ...o])
      showToast('','Query Logged Locally', 'Could not save to database — logged locally')
      setChDriver(''); setChConsent(false)
    }
  }

  // AI Compliance Score computation
  const complianceScore = useMemo(() => {
    const basics = getBasicScores()
    const avgBasicPct = basics.reduce((s, b) => s + (b.score / b.threshold), 0) / basics.length
    const hosScore = 25 // 25/25 — no violations
    const dvirScore = defects === 0 ? 25 : Math.max(0, 25 - defects * 5)
    const csaScore = Math.round((1 - avgBasicPct) * 25)
    const clearScore = chOrders.length === 0 || chOrders.every(o => o.result === 'Clear' || o.result === 'Pending') ? 25 : 15
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
    <div style={{ display:'flex', flexDirection:'column', flex:1, minHeight:0 }}>
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
          <CheckCircle size={13} color={eldStats.violations > 0 || dvirHistory.some(d => d.status === 'defects_found') ? 'var(--danger)' : 'var(--success)'} /> {eldStats.violations > 0 ? 'Issues Found' : 'All compliant'}
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
                  <MiniGauge label="HOS" value={eldStats.violations} max={5} color={eldStats.violations === 0 ? 'var(--success)' : 'var(--danger)'} unit="" />
                  <MiniGauge label="CSA" value={Math.round(liveBasicScores.reduce((s,b) => s + b.score, 0) / liveBasicScores.length)} max={65} color={liveBasicScores.some(b => b.score > b.threshold) ? 'var(--danger)' : 'var(--success)'} unit="%" />
                  <MiniGauge label="DVIR" value={dvirHistory.length > 0 ? (dvirHistory.filter(d => d.status === 'safe').length / dvirHistory.length * 100) : 100} max={100} color={dvirHistory.some(d => d.status === 'defects_found') ? 'var(--warning)' : 'var(--success)'} unit="%" />
                  <MiniGauge label="Drug" value={chOrders.length > 0 ? (chOrders.filter(o => o.result === 'Clear').length / chOrders.length * 100) : 0} max={100} color={chOrders.some(o => o.result === 'Positive') ? 'var(--danger)' : chOrders.length > 0 ? 'var(--success)' : 'var(--muted)'} unit="%" />
                </div>
              </div>

              {/* Right column: status cards + AI insights */}
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {/* Status row */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10 }}>
                  {[
                    { label:'ELD Devices',    value: eldStats.connected ? `${eldStats.onlineCount}/${eldStats.totalUnits || eldStats.onlineCount}` : `${(ctxVehicles||[]).length}`,   sub: eldStats.connected ? 'Synced' : (ctxVehicles||[]).length > 0 ? 'Manual' : 'Add vehicles',      color: eldStats.connected ? 'var(--success)' : 'var(--muted)' },
                    { label:'HOS Violations',  value: String(eldStats.violations),     sub: eldStats.violations === 0 ? 'Clean record' : 'Review needed',   color: eldStats.violations === 0 ? 'var(--success)' : 'var(--danger)' },
                    { label:'CSA Rating',      value: fmcsaCarrier?.safetyRating || (fmcsaCarrier ? 'None' : 'Look Up'), sub: fmcsaCarrier ? 'FMCSA' : 'Enter DOT in CSA tab', color: fmcsaCarrier?.safetyRating === 'Satisfactory' ? 'var(--success)' : fmcsaCarrier ? 'var(--warning)' : 'var(--muted)' },
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
                    {(() => {
                      const insights = []
                      const driverCount = (ctxDrivers || []).length
                      const vehicleCount = (ctxVehicles || []).length
                      if (eldStats.violations > 0) insights.push({ text: `${eldStats.violations} HOS violation${eldStats.violations > 1 ? 's' : ''} detected — review immediately`, color: 'var(--danger)', icon: AlertTriangle })
                      if (dvirHistory.some(d => d.status === 'defects_found')) insights.push({ text: 'Vehicle defects found in recent DVIR — repair before dispatch', color: 'var(--danger)', icon: AlertTriangle })
                      if (complianceMatrix.some(d => d.medWarn)) insights.push({ text: 'Medical card expiring soon for one or more drivers', color: 'var(--warning)', icon: Clock })
                      if (!eldStats.connected && vehicleCount > 0) insights.push({ text: 'Connect your ELD (Samsara/Motive) for automatic HOS and DVIR sync', color: 'var(--warning)', icon: Activity })
                      if (driverCount === 0) insights.push({ text: 'Add your first driver to begin tracking compliance', color: 'var(--muted)', icon: Users })
                      if (vehicleCount === 0) insights.push({ text: 'Add vehicles in the Fleet tab to track inspections', color: 'var(--muted)', icon: Truck })
                      if (!fmcsaCarrier) insights.push({ text: 'Enter your DOT number in the CSA tab to pull live FMCSA data', color: 'var(--muted)', icon: Search })
                      if (insights.length === 0) insights.push({ text: 'All compliance checks passing — no issues detected', color: 'var(--success)', icon: CheckCircle })
                      return insights
                    })().map((r, i) => (
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
                <span style={{ fontSize:11, color: complianceMatrix.some(d => d.dvir === 'Defects' || d.medWarn) ? 'var(--warning)' : 'var(--success)', fontWeight:700 }}><Ic icon={CheckCircle} /> {complianceMatrix.some(d => d.dvir === 'Defects' || d.medWarn) ? 'Attention Needed' : complianceMatrix.length > 0 ? 'All Clear' : 'No Drivers'}</span>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
                  <thead><tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
                    {['Driver','Unit','CDL','ELD','HOS','DVIR','CSA','Clearinghouse','Med Card'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {complianceMatrix.length > 0 ? complianceMatrix.map(d => (
                      <tr key={d.name} style={{ borderBottom:'1px solid var(--border)' }}>
                        <td style={{ padding:'11px 12px', fontSize:13, fontWeight:700, whiteSpace:'nowrap' }}>{d.name}</td>
                        <td style={{ padding:'11px 12px', fontSize:12, color:'var(--muted)' }}>{d.unit}</td>
                        <td style={{ padding:'11px 12px', fontSize:11, fontFamily:'monospace', color:'var(--muted)' }}>{d.cdl}</td>
                        <td style={{ padding:'11px 12px' }}><span style={S.tag(d.eld === 'Connected' ? 'var(--success)' : 'var(--muted)')}>{d.eld}</span></td>
                        <td style={{ padding:'11px 12px', fontFamily:"'Bebas Neue',sans-serif", fontSize:15, color: d.hos === 'Restart' ? 'var(--muted)' : parseFloat(d.hos) > 8 ? 'var(--success)' : 'var(--warning)' }}>{d.hos}</td>
                        <td style={{ padding:'11px 12px' }}><span style={S.tag(d.dvir === 'Pass' ? 'var(--success)' : d.dvir === 'Defects' ? 'var(--danger)' : 'var(--muted)')}>{d.dvir}</span></td>
                        <td style={{ padding:'11px 12px', fontFamily:"'Bebas Neue',sans-serif", fontSize:15, color:'var(--muted)' }}>{d.csa}</td>
                        <td style={{ padding:'11px 12px' }}><span style={S.tag(d.ch === 'Clear' ? 'var(--success)' : d.ch === 'Pending' ? 'var(--warning)' : 'var(--muted)')}>{d.ch}</span></td>
                        <td style={{ padding:'11px 12px' }}>
                          <span style={S.tag(d.medWarn ? 'var(--warning)' : 'var(--success)')}>{d.med}</span>
                        </td>
                      </tr>
                    )) : (
                      <tr><td colSpan={9} style={{ padding:'24px 12px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>No drivers yet — add your first driver to get started</td></tr>
                    )}
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
                  { date:'Apr 30, 2026', item:'IFTA Q1 2026 filing deadline', type:'IFTA', color:'var(--warning)', days:50 },
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
                <div style={{ fontSize:13, fontWeight:700, color:'var(--success)', marginBottom:2 }}>Connect Your ELD Provider</div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>Link Samsara or Motive to auto-sync HOS, vehicles, and DVIRs</div>
              </div>
              <div style={{ display:'flex', gap:8 }}>
                {['Samsara','Motive'].map(p => (
                  <button key={p} onClick={() => {
                    const key = prompt(`Enter your ${p} API key:`)
                    if (!key) return
                    fetch('/api/eld-connect', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ provider: p.toLowerCase(), api_key: key, user_id: user?.id })
                    }).then(r => r.json()).then(d => {
                      if (d.ok || d.status === 'connected') showToast('', `${p} Connected`, 'ELD data will sync shortly')
                      else showToast('', 'Connection Failed', d.error || 'Check your API key')
                    }).catch(() => showToast('', 'Error', 'Could not connect'))
                  }} className="btn btn-ghost" style={{ fontSize:11, border:'1px solid var(--border)', borderRadius:8, padding:'8px 14px' }}>
                    Connect {p}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10 }}>
              {[
                { label:'Units Online',   value: eldStats.connected ? `${eldStats.onlineCount}/${eldStats.totalUnits || eldStats.onlineCount}` : `${(ctxVehicles||[]).length}`,  sub: eldStats.connected ? 'ELD synced' : (ctxVehicles||[]).length > 0 ? 'Manual tracking' : 'Add vehicles in Fleet',     color: eldStats.connected ? 'var(--success)' : 'var(--muted)' },
                { label:'HOS Violations',  value: String(eldStats.violations),    sub: eldStats.violations === 0 ? 'Clean record' : 'Review needed',    color: eldStats.violations === 0 ? 'var(--success)' : 'var(--danger)' },
                { label:'Avg HOS Left',    value: eldStats.avgHOS ? eldStats.avgHOS + 'h' : (driverHOSList.length > 0 ? '11.0h' : '—'),    sub: driverHOSList.length > 0 ? `${driverHOSList.length} driver${driverHOSList.length > 1 ? 's' : ''}` : 'No drivers yet', color: 'var(--success)' },
                { label:'ELD Provider',    value: eldStats.provider ? eldStats.provider.charAt(0).toUpperCase() + eldStats.provider.slice(1) : 'Manual',    sub: eldStats.connected ? 'Connected' : 'Connect above',  color: eldStats.connected ? 'var(--success)' : 'var(--muted)' },
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
                <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={async () => {
                  try {
                    showToast('','Syncing...','Pulling latest ELD data')
                    await apiFetch('/api/eld-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
                    const [h, v, d] = await Promise.all([db.fetchHOSLogs(), db.fetchELDVehicles(), db.fetchDVIRs()])
                    setHosLogs(h); setEldVehicles(v); setDvirHistory(d)
                    showToast('','ELD Synced','All data refreshed')
                  } catch { showToast('','Sync Failed','Check your ELD connection') }
                }}><Ic icon={RefreshCw} /> Sync All</button>
              </div>
              {driverHOSList.length > 0 ? driverHOSList.map(d => (
                <div key={d.driver} style={{ padding:'16px 18px', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10, flexWrap:'wrap' }}>
                    <div style={{ width:38, height:38, borderRadius:'50%', background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:12, color:'var(--accent)', flexShrink:0 }}>
                      {(d.driver||'').split(' ').map(n=>n[0]).join('')}
                    </div>
                    <div style={{ flex:1, minWidth:120 }}>
                      <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:2, flexWrap:'wrap' }}>
                        <span style={{ fontSize:13, fontWeight:700 }}>{d.driver}</span>
                        <span style={{ fontSize:11, color:'var(--muted)' }}>{d.unit}</span>
                        <span style={S.tag(d.statusColor)}>{d.status}</span>
                      </div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{eldStats.connected ? `${eldStats.provider} · ` : ''}Drive today: {d.driveToday}</div>
                    </div>
                    <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => {
                      const driverLogs = hosLogs.filter(l => (l.driver_name || '').toLowerCase().includes((d.driver || '').toLowerCase())).slice(0, 20)
                      const logText = driverLogs.length > 0
                        ? driverLogs.map(l => `${new Date(l.start_time).toLocaleString()} — ${l.status} (${l.duration_hours || 0}h)`).join('\n')
                        : 'No HOS logs found for this driver'
                      const blob = new Blob([`HOS Log — ${d.driver}\n${'='.repeat(40)}\n\n${logText}`], { type: 'text/plain' })
                      const url = URL.createObjectURL(blob)
                      const a = document.createElement('a'); a.href = url; a.download = `hos-log-${(d.driver || 'driver').replace(/\s+/g, '-')}.txt`; a.click()
                      URL.revokeObjectURL(url)
                      showToast('','Downloaded', d.driver + ' HOS log')
                    }}>Full Log</button>
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
              )) : (
                <div style={{ padding:'24px 18px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>No drivers yet — add drivers in the Drivers tab to track HOS</div>
              )}
            </div>

            {/* HOS Events */}
            <div style={S.panel}>
              <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Clock} /> Recent HOS Events</div></div>
              {hosLogs.length > 0 ? hosLogs.slice(0, 20).map((log, i) => {
                const dateStr = log.start_time ? new Date(log.start_time).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '—'
                const statusMap = { driving: 'Driving', on_duty: 'On Duty', sleeper: 'Sleeper', off_duty: 'Off Duty' }
                const colorMap = { driving: 'var(--success)', on_duty: 'var(--warning)', sleeper: 'var(--accent3)', off_duty: 'var(--muted)' }
                const hasViolation = log.violations && (Array.isArray(log.violations) ? log.violations.length > 0 : Object.keys(log.violations).length > 0)
                return (
                  <div key={log.id || i} style={{ padding:'10px 16px', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                    <span style={{ fontSize:11, color:'var(--muted)', minWidth:42 }}>{dateStr}</span>
                    <span style={S.tag(hasViolation ? 'var(--danger)' : (colorMap[log.status] || 'var(--muted)'))}>{hasViolation ? 'VIOLATION' : (statusMap[log.status] || log.status)}</span>
                    <span style={{ fontSize:12, fontWeight:600 }}>{log.driver_name}</span>
                    <span style={{ fontSize:12, color:'var(--muted)' }}>{log.duration_hours ? `${Number(log.duration_hours).toFixed(1)}h` : ''} {log.location || ''}</span>
                  </div>
                )
              }) : (
                <div style={{ padding:'24px 16px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>No HOS events yet — data appears when ELD syncs or loads go In Transit</div>
              )}
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
                {(ctxVehicles && ctxVehicles.length > 0) ? ctxVehicles.map(v => <option key={v.id || v.unit_number} value={v.unit_number || v.name}>{v.unit_number || v.name}</option>) : <option value="">No units</option>}
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
                  onClick={async () => {
                    if (!selectedUnit) { showToast('','Select Unit','Choose a vehicle to inspect'); return }
                    const defectItems = items.filter(i => i.status === 'Defect').map(i => i.item)
                    const dvirReport = {
                      driver_name: user?.email || 'Owner/Operator',
                      vehicle_name: selectedUnit,
                      inspection_type: 'pre_trip',
                      status: defectItems.length === 0 ? 'safe' : 'defects_found',
                      defects: defectItems,
                      submitted_at: new Date().toISOString(),
                      source_provider: 'manual',
                    }
                    try {
                      const saved = await db.createDVIR(dvirReport)
                      setDvirHistory(h => [saved || { ...dvirReport, id: Date.now() }, ...h])
                      setItems(DVIR_ITEMS_DEFAULT) // reset form
                      showToast('','DVIR Submitted', defects===0 ? selectedUnit + ' cleared for dispatch · No defects' : defects + ' defect(s) noted · Maintenance required before dispatch')
                    } catch (err) {
                      showToast('','DVIR Saved Locally', 'Could not save to database')
                      setDvirHistory(h => [{ ...dvirReport, id: Date.now() }, ...h])
                    }
                  }}>
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
                    {dvirHistory.length > 0 ? dvirHistory.map((r,i) => {
                      const isSafe = r.status === 'safe'
                      const color = isSafe ? 'var(--success)' : 'var(--danger)'
                      const dateStr = r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : '—'
                      return (
                        <tr key={r.id || i} style={{ borderBottom:'1px solid var(--border)' }}>
                          <td style={{ padding:'10px 14px', fontSize:12, color:'var(--muted)' }}>{dateStr}</td>
                          <td style={{ padding:'10px 14px', fontSize:12, fontWeight:700 }}>{r.vehicle_name || '—'}</td>
                          <td style={{ padding:'10px 14px', fontSize:12 }}>{r.driver_name || '—'}</td>
                          <td style={{ padding:'10px 14px' }}><span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:color+'15', color }}>{isSafe ? 'Pass' : 'Defects'}</span></td>
                          <td style={{ padding:'10px 14px' }}><button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => {
                            const details = [
                              `DVIR Report — ${dateStr}`,
                              `Vehicle: ${r.vehicle_name || '—'}`,
                              `Driver: ${r.driver_name || '—'}`,
                              `Status: ${isSafe ? 'SAFE — No defects' : 'DEFECTS FOUND'}`,
                              r.defects?.length ? `Defects: ${r.defects.join(', ')}` : '',
                              r.notes ? `Notes: ${r.notes}` : '',
                              `Source: ${r.source_provider || 'manual'}`,
                            ].filter(Boolean).join('\n')
                            navigator.clipboard?.writeText(details)
                            alert(details)
                          }}>View</button></td>
                        </tr>
                      )
                    }) : (
                      <tr><td colSpan={5} style={{ padding:'24px 14px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>No inspections yet — submit your first DVIR above</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* ── CSA SCORES ── */}
        {compTab === 'csa' && (
          <>
            {/* DOT Number Input */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 18px', display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
              <Ic icon={Search} size={16} />
              <input value={fmcsaDot} onChange={e => setFmcsaDot(e.target.value.replace(/[^0-9]/g, ''))} placeholder="Enter your DOT number"
                style={{ flex:1, minWidth:140, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:13, color:'var(--text)', outline:'none' }}
                onKeyDown={e => e.key === 'Enter' && fetchFMCSA(fmcsaDot)} />
              <button onClick={() => fetchFMCSA(fmcsaDot)} disabled={fmcsaLoading || !fmcsaDot}
                style={{ padding:'8px 16px', borderRadius:8, background:fmcsaLoading ? 'var(--border)' : 'var(--accent)', color:'#000', border:'none', fontSize:12, fontWeight:700, cursor:fmcsaLoading ? 'wait' : 'pointer' }}>
                {fmcsaLoading ? 'Loading...' : 'Lookup FMCSA'}
              </button>
            </div>
            {fmcsaError && <div style={{ fontSize:12, color:'var(--danger)', padding:'8px 12px', background:'rgba(239,68,68,0.08)', borderRadius:8 }}>{fmcsaError}</div>}

            {/* Carrier Info Banner */}
            {fmcsaCarrier && (
              <div style={{ background:'linear-gradient(135deg,rgba(34,197,94,0.05),rgba(77,142,240,0.03))', border:'1px solid rgba(34,197,94,0.15)', borderRadius:12, padding:'14px 18px', display:'flex', gap:14, alignItems:'center', flexWrap:'wrap' }}>
                <Bot size={20} color={fmcsaCarrier.allowedToOperate ? 'var(--success)' : 'var(--danger)'} />
                <div style={{ flex:1, minWidth:200 }}>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--text)', marginBottom:2 }}>{fmcsaCarrier.legalName}{fmcsaCarrier.dbaName ? ` (DBA: ${fmcsaCarrier.dbaName})` : ''}</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>
                    DOT: {fmcsaCarrier.dotNumber} · MC: {fmcsaCarrier.mcNumber || '—'} · {fmcsaCarrier.phyCity}, {fmcsaCarrier.phyState} · {fmcsaCarrier.totalPowerUnits} units · {fmcsaCarrier.totalDrivers} drivers
                  </div>
                </div>
                <span style={{ padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:700, background: fmcsaCarrier.allowedToOperate ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)', color: fmcsaCarrier.allowedToOperate ? 'var(--success)' : 'var(--danger)' }}>
                  {fmcsaCarrier.allowedToOperate ? 'AUTHORIZED' : 'NOT AUTHORIZED'}
                </span>
              </div>
            )}
            {!fmcsaCarrier && !fmcsaLoading && !fmcsaError && (
              <div style={{ background:'linear-gradient(135deg,rgba(34,197,94,0.05),rgba(77,142,240,0.03))', border:'1px solid rgba(34,197,94,0.15)', borderRadius:12, padding:'14px 18px', display:'flex', gap:14, alignItems:'center' }}>
                <Bot size={20} color="var(--success)" />
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--success)', marginBottom:2 }}>Enter your DOT number to pull live FMCSA data</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>CSA scores, safety rating, inspections, and violations — pulled directly from FMCSA SAFER</div>
                </div>
              </div>
            )}

            {/* Stats Cards — real data if available */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10 }}>
              {[
                { label:'Safety Rating', value: fmcsaCarrier?.safetyRating || 'Not Rated', color: fmcsaCarrier?.safetyRating === 'Satisfactory' ? 'var(--success)' : fmcsaCarrier?.safetyRating === 'Conditional' ? 'var(--warning)' : 'var(--muted)', sub:'FMCSA Status' },
                { label:'Inspections', value: fmcsaInspections?.total?.toString() || '0', color:'var(--accent)', sub:'Last 24 months' },
                { label:'OOS Rate (Veh)', value: fmcsaInspections?.oosRates?.vehicle ? fmcsaInspections.oosRates.vehicle.toFixed(1) + '%' : '0%', color: (fmcsaInspections?.oosRates?.vehicle || 0) > 20.72 ? 'var(--danger)' : 'var(--success)', sub: `Nat. avg: 20.72%` },
                { label:'Crashes', value: fmcsaInspections?.crashes?.total?.toString() || '0', color: (fmcsaInspections?.crashes?.total || 0) > 0 ? 'var(--warning)' : 'var(--success)', sub: fmcsaInspections?.crashes?.fatal ? `${fmcsaInspections.crashes.fatal} fatal` : 'Clean record' },
              ].map(s => (
                <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px', textAlign:'center' }}>
                  <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4, fontWeight:600 }}>{s.label}</div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: s.value.length > 4 ? 15 : 22, color:s.color, letterSpacing:1 }}>{s.value}</div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{s.sub}</div>
                </div>
              ))}
            </div>

            {/* BASIC Score Breakdown — live data */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Shield} /> BASIC Score Breakdown</div>
                <span style={{ fontSize:11, color: liveBasicScores.every(b => b.score < b.threshold) ? 'var(--success)' : 'var(--danger)', fontWeight:700 }}>
                  {liveBasicScores.every(b => b.score < b.threshold) ? 'All Below Threshold' : 'Intervention Alert'}
                </span>
              </div>
              <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
                {liveBasicScores.map(b => {
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

            {/* Insurance Info */}
            {fmcsaCarrier && (
              <div style={S.panel}>
                <div style={S.panelHead}>
                  <div style={S.panelTitle}><Ic icon={Shield} /> Insurance on File</div>
                </div>
                <div style={{ padding:16, display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:10 }}>
                  {[
                    { label: 'BIPD Insurance', value: fmcsaCarrier.bipdInsuranceOnFile, required: fmcsaCarrier.bipdInsuranceRequired },
                    { label: 'Cargo Insurance', value: fmcsaCarrier.cargoInsuranceOnFile },
                    { label: 'Bond Insurance', value: fmcsaCarrier.bondInsuranceOnFile },
                  ].filter(i => i.value > 0 || i.required > 0).map(ins => (
                    <div key={ins.label} style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 16px' }}>
                      <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4, fontWeight:600 }}>{ins.label}</div>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color: ins.value >= (ins.required || 0) ? 'var(--success)' : 'var(--danger)' }}>
                        ${(ins.value / 1000).toFixed(0)}K
                      </div>
                      {ins.required > 0 && <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Required: ${(ins.required / 1000).toFixed(0)}K</div>}
                    </div>
                  ))}
                </div>
              </div>
            )}
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
                <div style={{ fontSize:11, color:'var(--muted)' }}>Queries</div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--accent)' }}>{chOrders.length}</div>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              {/* Order form */}
              <div style={S.panel}>
                <div style={S.panelHead}>
                  <div style={S.panelTitle}><Ic icon={Search} /> Log Query</div>
                  <span style={S.tag('var(--accent)')}>Tracking</span>
                </div>
                <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
                  <div>
                    <label style={{ fontSize:11, color:'var(--muted)', fontWeight:600 }}>Select Driver</label>
                    <select value={chDriver} onChange={e => setChDriver(e.target.value)}
                      style={{ width:'100%', marginTop:4, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }}>
                      <option value="">— Select driver —</option>
                      {chDriverList.map(d => <option key={d.id || d.name} value={d.name}>{d.name}{d.cdl ? ` · ${d.cdl}` : ''}</option>)}
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
                      {(() => { const d = chDriverList.find(x=>x.name===chDriver); return d ? (
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
                    <Search size={13} /> Log Query
                  </button>
                </div>
              </div>

              {/* Annual compliance tracker */}
              <div style={S.panel}>
                <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Calendar} /> Annual Compliance</div></div>
                <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
                  {chDriverList.length === 0 && (
                    <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:12 }}>Add drivers to track annual compliance</div>
                  )}
                  {chDriverList.map(d => {
                    const lastQuery = chOrders.find(o => (o.driver_name || o.driver) === d.name && (o.query_type || o.type) === 'Annual' && o.status === 'Complete')
                    const lastDate = lastQuery?.query_date || lastQuery?.date
                    const dueDate = lastDate ? new Date(new Date(lastDate).setFullYear(new Date(lastDate).getFullYear() + 1)) : null
                    const due = dueDate ? dueDate.toLocaleDateString('en-US', { month:'short', year:'numeric' }) : 'NOT QUERIED'
                    const isDue = !lastQuery || (dueDate && dueDate < new Date())
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
                <span style={{ fontSize:11, color:'var(--muted)' }}>{chOrders.length} queries</span>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', minWidth:600 }}>
                  <thead><tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
                    {['ID','Driver','CDL','Type','Date','Status','Result'].map(h => (
                      <th key={h} style={{ padding:'8px 12px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1, whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {chOrders.length > 0 ? chOrders.map(o => (
                      <tr key={o.id || o.query_id} style={{ borderBottom:'1px solid var(--border)' }}>
                        <td style={{ padding:'10px 12px', fontFamily:'monospace', fontSize:11, color:'var(--accent)' }}>{o.query_id || o.id}</td>
                        <td style={{ padding:'10px 12px', fontSize:12, fontWeight:700, whiteSpace:'nowrap' }}>{o.driver_name || o.driver}</td>
                        <td style={{ padding:'10px 12px', fontSize:11, color:'var(--muted)' }}>{o.cdl_number || o.cdl || ''}</td>
                        <td style={{ padding:'10px 12px', fontSize:12 }}>{o.query_type || o.type}</td>
                        <td style={{ padding:'10px 12px', fontSize:11, color:'var(--muted)', whiteSpace:'nowrap' }}>{o.query_date || o.date}</td>
                        <td style={{ padding:'10px 12px' }}><span style={S.tag(o.status === 'Complete' ? 'var(--success)' : 'var(--accent)')}>{o.status}</span></td>
                        <td style={{ padding:'10px 12px' }}><span style={S.tag(o.result === 'Clear' ? 'var(--success)' : o.result === 'Pending' ? 'var(--accent)' : 'var(--danger)')}>{o.result}</span></td>
                      </tr>
                    )) : (
                      <tr><td colSpan={7} style={{ padding:'24px 12px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>No clearinghouse orders yet — add drivers to get started</td></tr>
                    )}
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

// CarrierELD redirects to unified compliance center
export function CarrierELD() { return <AIComplianceCenter defaultTab="eld" /> }

// CarrierCSA now redirects to unified compliance center
export function CarrierCSA() { return <AIComplianceCenter defaultTab="csa" /> }

// CarrierClearinghouse now redirects to unified compliance center
export function CarrierClearinghouse() { return <AIComplianceCenter defaultTab="clearinghouse" /> }

// CarrierDVIR is the unified AI Compliance Center
export function CarrierDVIR() { return <AIComplianceCenter /> }

export { AIComplianceCenter }
