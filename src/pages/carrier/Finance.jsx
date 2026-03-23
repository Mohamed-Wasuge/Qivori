import {
  React, useState, useMemo, useEffect, useRef, useCallback,
  Ic, S, StatCard, AiBanner,
  useApp, useCarrier, generateInvoicePDF, apiFetch,
  BarChart2, Flame, Target, DollarSign, AlertTriangle, CheckCircle, Clock,
  Wrench, FileText, Package, Truck, Receipt, Zap, Bot, Star, Activity,
  Shield, Briefcase, Settings, Layers, Eye, Download, Send, Check,
  Calendar, TrendingUp, TrendingDown, Lightbulb, Fuel, Route, Navigation,
  Paperclip, Dumbbell, AlertCircle, Brain, Sparkles, CircleDot
} from './shared'

// ─── ACCOUNTING HELPERS ───────────────────────────────────────────────────────
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

// ─── TRUCK ROI (internal) ─────────────────────────────────────────────────────
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
      const key = (l.origin||'').split(',')[0].substring(0,3).toUpperCase() + '→' + (l.dest||'').split(',')[0].substring(0,3).toUpperCase()
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

  if (!sel) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', flexDirection:'column', gap:12, color:'var(--muted)' }}>
        <div style={{ fontSize:14, fontWeight:600 }}>No truck data yet</div>
        <div style={{ fontSize:12 }}>Add drivers and complete loads to see ROI analysis</div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', gap:16, height:'100%', overflow:'auto' }}>
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
                  { label:'Total Miles',       value:`${(sel.miles||0).toLocaleString()} mi` },
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
                        <td>{(l.origin||'').split(',')[0]} → {(l.dest||'').split(',')[0]}</td>
                        <td style={{ color:'var(--muted)' }}>{(l.miles||0).toLocaleString()}</td>
                        <td style={{ color:'var(--accent2)' }}>${(l.rate||0).toFixed(2)}</td>
                        <td style={{ fontWeight:700 }}>${(l.gross||0).toLocaleString()}</td>
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
  const { loads: ctxLoads, invoices: ctxInvoices, totalRevenue, expenses: ctxExpenses } = useCarrier()
  const totalExp = Array.isArray(ctxExpenses) ? ctxExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0) : 0
  const grossMTD = totalRevenue || 0
  const netMTD = grossMTD - totalExp
  const avgLoadSize = ctxLoads && ctxLoads.length > 0 ? Math.round(grossMTD / ctxLoads.length) : 0
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
            title={grossMTD > 0 ? `AI Revenue Forecast: $${(grossMTD/1000).toFixed(1)}K gross this month` : "AI Revenue Forecast: Add loads to see forecasts"}
            sub={grossMTD > 0 ? `${ctxLoads.length} loads · $${(grossMTD / Math.max(ctxLoads.length, 1)).toFixed(0)} avg per load` : "Start adding loads to generate revenue insights"}
          />
          <div style={S.grid(4)}>
            <StatCard label="Gross MTD"     value={grossMTD > 0 ? `$${(grossMTD/1000).toFixed(1)}K` : "$0"} change={grossMTD > 0 ? `${ctxLoads.length} loads` : "—"} color="var(--accent)" />
            <StatCard label="Net MTD"       value={netMTD !== 0 ? `$${netMTD.toLocaleString()}` : "$0"} change="After all costs" color="var(--success)" />
            <StatCard label="Best Lane RPM" value="—"  change="Add loads to track" color="var(--accent2)" changeType="neutral"/>
            <StatCard label="Avg Load Size" value={avgLoadSize > 0 ? `$${avgLoadSize.toLocaleString()}` : "$0"} change="—" color="var(--accent3)" />
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
                {[].length > 0 ? [].map((l, i) => (
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
                )) : (
                  <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No lane data yet</div>
                )}
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
        <div style={{ flex:1, minHeight:0, overflow:'auto' }}>
          <TruckROI />
        </div>
      )}
    </div>
  )
}

// ─── BROKER RISK INTEL ────────────────────────────────────────────────────────
export function BrokerRiskIntel() {
  const { showToast } = useApp()
  const { loads, invoices } = useCarrier()
  const [fmcsaLookup, setFmcsaLookup] = useState({}) // { brokerName: { loading, data, error } }

  const lookupBrokerFMCSA = async (brokerName) => {
    setFmcsaLookup(prev => ({ ...prev, [brokerName]: { loading: true } }))
    try {
      const res = await apiFetch(`/api/fmcsa-lookup?q=${encodeURIComponent(brokerName)}`)
      if (!res.ok) throw new Error('Lookup failed')
      const data = await res.json()
      const match = data.results?.[0] || null
      setFmcsaLookup(prev => ({ ...prev, [brokerName]: { loading: false, data: match, error: match ? null : 'Not found' } }))
      if (match) showToast('', 'FMCSA Found', `${match.legalName} · DOT ${match.dotNumber}`)
      else showToast('', 'Not Found', `No FMCSA match for "${brokerName}"`)
    } catch (err) {
      setFmcsaLookup(prev => ({ ...prev, [brokerName]: { loading: false, error: err.message } }))
    }
  }

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
              <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
                {fmcsaLookup[b.name]?.data && (
                  <span style={{ fontSize:10, color:'var(--success)', fontWeight:600 }}>
                    DOT {fmcsaLookup[b.name].data.dotNumber} · {fmcsaLookup[b.name].data.allowedToOperate ? 'Active' : 'Inactive'}
                  </span>
                )}
                {fmcsaLookup[b.name]?.error && <span style={{ fontSize:10, color:'var(--muted)' }}>{fmcsaLookup[b.name].error}</span>}
                <button className="btn btn-ghost" style={{ fontSize:11 }}
                  onClick={() => lookupBrokerFMCSA(b.name)} disabled={fmcsaLookup[b.name]?.loading}>
                  {fmcsaLookup[b.name]?.loading ? '...' : fmcsaLookup[b.name]?.data ? 'Refresh' : 'Verify FMCSA'}
                </button>
              </div>
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

// ─── BROKER DIRECTORY ─────────────────────────────────────────────────────────
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
    <div style={{ display: 'flex', height: '100%', overflow: 'auto' }}>
      {/* List */}
      <div style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflowY: 'auto' }}>
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
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{b.loads} load{b.loads !== 1 ? 's' : ''} · ${b.revenue.toLocaleString()} revenue</div>
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
  const [newExp, setNewExp] = useState({ date:'', cat:'Fuel', amount:'', load:'', notes:'', driver:'', state:'', gallons:'', pricePerGal:'' })
  const [scanning, setScanning] = useState(false)
  const [scanDrag, setScanDrag] = useState(false)
  const [csvPreview, setCsvPreview] = useState(null)
  const csvFileRef = useRef(null)

  // ─── CSV Import ───
  const parseCsvLine = (line) => {
    const fields = []
    let cur = '', inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { fields.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    fields.push(cur.trim())
    return fields
  }

  const mapCsvHeader = (h) => {
    const low = (h || '').trim().toLowerCase()
    if (['date'].includes(low)) return 'date'
    if (['amount','total'].includes(low)) return 'amount'
    if (['category','type','cat'].includes(low)) return 'cat'
    if (['description','notes','memo','note'].includes(low)) return 'notes'
    if (['driver'].includes(low)) return 'driver'
    if (['state'].includes(low)) return 'state'
    if (['gallons'].includes(low)) return 'gallons'
    return null
  }

  const matchCategory = (raw) => {
    if (!raw) return 'Other'
    const low = raw.toLowerCase()
    const match = EXPENSE_CATS.find(c => c.toLowerCase() === low)
    if (match) return match
    // partial match
    const partial = EXPENSE_CATS.find(c => low.includes(c.toLowerCase()) || c.toLowerCase().includes(low))
    return partial || 'Other'
  }

  const handleCsvFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) { showToast('', 'CSV Error', 'File must have a header row and at least one data row'); return }
      const headers = parseCsvLine(lines[0])
      const mapping = headers.map(mapCsvHeader)
      if (!mapping.some(m => m === 'amount')) { showToast('', 'CSV Error', 'No "Amount" or "Total" column found in header'); return }
      const parsed = []
      for (let i = 1; i < lines.length; i++) {
        const vals = parseCsvLine(lines[i])
        if (vals.length === 0 || vals.every(v => !v)) continue
        const row = { date: '', cat: 'Other', amount: '', notes: '', driver: '', state: '', gallons: '' }
        mapping.forEach((field, idx) => {
          if (field && vals[idx]) row[field] = vals[idx]
        })
        if (row.cat) row.cat = matchCategory(row.cat)
        const amt = parseFloat(row.amount)
        if (isNaN(amt) || amt <= 0) continue
        row.amount = amt
        parsed.push(row)
      }
      if (parsed.length === 0) { showToast('', 'CSV Error', 'No valid expense rows found'); return }
      setCsvPreview(parsed)
    }
    reader.readAsText(file)
    if (csvFileRef.current) csvFileRef.current.value = ''
  }

  const importCsvExpenses = () => {
    if (!csvPreview || csvPreview.length === 0) return
    csvPreview.forEach(row => {
      const expData = { date: row.date, cat: row.cat, amount: row.amount, notes: row.notes || '' }
      if (row.driver) expData.driver = row.driver
      if (row.state) expData.state = row.state.toUpperCase().trim()
      if (row.gallons) expData.gallons = parseFloat(row.gallons)
      ctxAddExpense(expData)
    })
    const count = csvPreview.length
    setCsvPreview(null)
    showToast('', 'CSV Imported', `${count} expense${count !== 1 ? 's' : ''} added successfully`)
  }

  const filtered = filterCat === 'All' ? expenses : expenses.filter(e => e.cat === filterCat)
  const totalBycat = EXPENSE_CATS.map(c => ({ cat: c, total: expenses.filter(e => e.cat === c).reduce((s,e) => s+e.amount, 0) })).filter(x => x.total > 0)
  const grandTotal = expenses.reduce((s,e) => s+e.amount, 0)

  const addExpense = () => {
    if (!newExp.amount || !newExp.cat) return
    const expData = { ...newExp, amount: parseFloat(newExp.amount) }
    if (newExp.gallons) expData.gallons = parseFloat(newExp.gallons)
    if (newExp.pricePerGal) expData.price_per_gal = parseFloat(newExp.pricePerGal)
    if (newExp.state) expData.state = newExp.state.toUpperCase().trim()
    // Auto-link: if fuel expense has load, find matching truck/driver
    if (newExp.cat === 'Fuel' && newExp.load) {
      const matchedLoad = (ctx?.loads || []).find(l => (l.loadId || l.load_number || '') === newExp.load)
      if (matchedLoad && !newExp.driver) expData.driver = matchedLoad.driver || matchedLoad.driver_name || ''
      if (matchedLoad && !newExp.state) {
        // Auto-detect state from load origin/destination
        const loc = matchedLoad.origin || matchedLoad.destination || ''
        const stMatch = loc.match(/,\s*([A-Z]{2})$/i)
        if (stMatch) expData.state = stMatch[1].toUpperCase()
      }
    }
    ctxAddExpense(expData)
    setNewExp({ date:'', cat:'Fuel', amount:'', load:'', notes:'', driver:'', state:'', gallons:'', pricePerGal:'' })
    setShowForm(false)
    showToast('', 'Expense Added', `${newExp.cat} · $${newExp.amount}${expData.state ? ' · ' + expData.state : ''}${expData.gallons ? ' · ' + expData.gallons + ' gal' : ''}`)
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
      setNewExp(e => ({
        ...e,
        amount: d.amount || '',
        date: d.date || '',
        cat: d.category || 'Fuel',
        notes: d.notes || d.merchant || '',
        gallons: d.gallons || '',
        pricePerGal: d.price_per_gallon || '',
        state: d.state || '',
      }))
      const iftaInfo = d.gallons ? ` · ${d.gallons} gal` : ''
      const stateInfo = d.state ? ` · ${d.state}` : ''
      showToast('', 'Receipt Scanned', `${d.category || 'Expense'} · $${d.amount}${iftaInfo}${stateInfo} — review and confirm`)
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
        <input ref={csvFileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleCsvFile(e.target.files[0])} />
        <button className="btn" style={{ fontSize: 12, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontWeight: 700, padding: '6px 14px', borderRadius: 8 }} onClick={() => csvFileRef.current?.click()}><Ic icon={Download} /> Import CSV</button>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowForm(s => !s)}>{showForm ? '✕ Cancel' : '+ Add Expense'}</button>
      </div>

      {/* CSV Preview */}
      {csvPreview && (
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}><Ic icon={FileText} /> CSV Preview</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{csvPreview.length} expense{csvPreview.length !== 1 ? 's' : ''} found</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ fontSize: 11, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontWeight: 700, padding: '5px 12px', borderRadius: 8 }} onClick={() => setCsvPreview(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={importCsvExpenses}><Ic icon={Check} /> Import All ({csvPreview.length})</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead>
                <tr>
                  {['#','Date','Category','Amount','Notes','Driver','State'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: 'var(--muted)', fontWeight: 700, borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvPreview.slice(0, 3).map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--muted)' }}>{i + 1}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{row.date || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: CAT_COLORS[row.cat] || 'var(--muted)' }}>{React.createElement(CAT_ICONS[row.cat] || Paperclip, {size:11})} {row.cat}</span></td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>${row.amount.toLocaleString()}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.notes || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{row.driver || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{row.state || '—'}</td>
                  </tr>
                ))}
                {csvPreview.length > 3 && (
                  <tr><td colSpan={7} style={{ padding: '8px 10px', fontSize: 11, color: 'var(--muted)', textAlign: 'center', fontStyle: 'italic' }}>...and {csvPreview.length - 3} more expense{csvPreview.length - 3 !== 1 ? 's' : ''}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 10 }}>
            {[
              { key:'date',   label:'Date',      type:'text', ph:'Mar 12' },
              { key:'amount', label:'Amount ($)', type:'number', ph:'250' },
              { key:'load',   label:'Load ID',   type:'text', ph:'FM-4421 (optional)' },
              { key:'driver', label:'Driver',    type:'text', ph:'Driver name (optional)' },
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
            {newExp.cat === 'Fuel' && <>
              <div>
                <label style={{ fontSize: 11, color: 'var(--accent)', display: 'block', marginBottom: 4 }}>Gallons <span style={{ color:'var(--muted)' }}>(for IFTA)</span></label>
                <input type="number" placeholder="85.2" value={newExp.gallons} onChange={e => setNewExp(x => ({ ...x, gallons: e.target.value }))}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--accent)', display: 'block', marginBottom: 4 }}>$/Gallon <span style={{ color:'var(--muted)' }}>(you paid)</span></label>
                <input type="number" step="0.01" placeholder="3.45" value={newExp.pricePerGal} onChange={e => setNewExp(x => ({ ...x, pricePerGal: e.target.value }))}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--accent)', display: 'block', marginBottom: 4 }}>State <span style={{ color:'var(--muted)' }}>(for IFTA)</span></label>
                <input type="text" placeholder="TX" maxLength={2} value={newExp.state} onChange={e => setNewExp(x => ({ ...x, state: e.target.value.toUpperCase() }))}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box', textTransform: 'uppercase' }} />
              </div>
            </>}
          </div>
          <button className="btn btn-primary" style={{ width: '100%', padding: '11px 0' }} onClick={addExpense}><Ic icon={Check} /> Add Expense</button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX:'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth:600 }}>
          <thead><tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
            {['Date','Category','Amount','Gal','State','Load','Driver','Notes'].map(h => (
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
                <td style={{ padding: '11px 14px', fontSize: 12, color: e.gallons ? 'var(--accent)' : 'var(--muted)' }}>{e.gallons ? e.gallons + 'g' : '—'}</td>
                <td style={{ padding: '11px 14px', fontSize: 12, fontWeight: e.state ? 700 : 400, color: e.state ? 'var(--accent)' : 'var(--muted)' }}>{e.state || '—'}</td>
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
  const { invoices: ctxInvoices, updateInvoiceStatus, company: carrierCompany, updateCompany } = useCarrier()
  const [selected, setSelected] = useState(new Set())
  const [tab, setTab] = useState('invoices')
  const [factoringRate, setFactoringRate] = useState(carrierCompany?.factoring_rate || 2.5)
  const [company, setCompany] = useState(carrierCompany?.factoring_company || '')
  const [factorEmail, setFactorEmail] = useState(carrierCompany?.factoring_email || '')
  const [history, setHistory] = useState(HISTORY)

  // Persist factoring settings to Supabase
  const saveFactoringSettings = (newCompany, newRate, newEmail) => {
    updateCompany({ factoring_company: newCompany, factoring_rate: newRate, factoring_email: newEmail })
    showToast('', 'Settings Saved', `${newCompany} @ ${newRate}% · ${newEmail || 'no email set'}`)
  }

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
                  <option value="">Select your factoring company...</option>
                  {['OTR Solutions', 'RTS Financial', 'Triumph Business Capital', 'Apex Capital', 'TAFS', 'TBS Factoring', 'Thunder Funding', 'WEX Capital', 'Riviera Finance', 'Fleet One Factoring', 'Instapay (Relay)', 'Express Freight Finance', 'Cass Commercial Bank', 'Interstate Capital', 'Compass Funding', 'Porter Freight Funding', 'FactorCloud', 'Bobtail', 'Denim', 'I don\'t use factoring', 'Other'].map(c => <option key={c}>{c}</option>)}
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
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Submission Email</label>
                <input type="email" value={factorEmail} placeholder="invoices@yourfactor.com"
                  onChange={e => setFactorEmail(e.target.value)}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", boxSizing:'border-box' }} />
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>The email your factoring company uses to receive invoice submissions</div>
              </div>
              <button className="btn btn-primary" style={{ padding: '10px 20px', fontSize: 13, marginTop: 4 }}
                onClick={() => saveFactoringSettings(company, factoringRate, factorEmail)}>
                <Ic icon={Check} size={13} /> Save Factoring Settings
              </button>
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
                { label: 'Business Checking', bank: 'Not connected', color: 'var(--muted)' },
                { label: 'Fuel Card',          bank: 'Not connected', color: 'var(--muted)' },
                { label: 'Payroll Account',    bank: 'Not connected', color: 'var(--muted)' },
              ].map(acc => (
                <div key={acc.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: 'var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Briefcase size={16} color="var(--muted)" /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{acc.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{acc.bank}</div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 10, padding: '3px 10px' }} onClick={() => showToast('', 'Coming Soon', 'Bank connection via Plaid is coming soon')}>Connect</button>
                </div>
              ))}
              <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', marginTop: 4 }}>Bank linking via Plaid — coming soon</div>
            </div>
          </div>
        </div>
      )}
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

const CF_START_BALANCE = 0

export function CashFlowForecaster() {
  const { loads, invoices, expenses, drivers: ctxDrivers, fuelCostPerMile } = useCarrier()
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

    // 2. Active loads → delivery week + payment terms (biweekly for Amazon, ~30d for brokers)
    loads.filter(l => !['Delivered','Invoiced'].includes(l.status)).forEach(load => {
      const delDate = load.delivery?.split(' · ')[0] || ''
      const delWk   = CF_DUE_WEEK[delDate] ?? 1
      const isRelay = load.load_source === 'amazon_relay' || load.payment_terms === 'biweekly'
      const payWk   = Math.min(5, delWk + (isRelay ? 2 : 4)) // Amazon pays ~2 weeks, brokers ~30 days
      incoming[payWk] += load.gross
      const payNote = isRelay ? 'pays biweekly (Amazon Relay)' : 'pays ~30 days later'
      items[payWk].push({ type:'load', id:load.loadId, label:`${load.loadId} · ${load.origin?.split(',')[0]}→${load.dest?.split(',')[0]}`, amount:load.gross, broker:load.broker, detail:`Delivers ${delDate || 'TBD'} · ${payNote}`, projected:true })
    })

    // 3. Weekly outgoing (deterministic, no Math.random)
    // Use avg driver pay rate from driver records
    const avgPayRate = (() => {
      const pctDrivers = (ctxDrivers || []).filter(d => (d.pay_model || 'percent') === 'percent')
      if (pctDrivers.length === 0) return 0.28
      return pctDrivers.reduce((s, d) => s + (parseFloat(d.pay_rate) || 28), 0) / pctDrivers.length / 100
    })()
    const totalExpAmt = expenses.reduce((s,e) => s + e.amount, 0)
    const weeklyBase  = Math.round(totalExpAmt / 4) // spread over 4 weeks of history
    const outgoing = CF_WEEKS.map((_, i) => {
      const driverPay = Math.round(incoming[i] * avgPayRate)
      const fuel      = Math.round((totalExpAmt || 0) / 4)
      const ops       = i === 0 ? Math.round(weeklyBase * 0.6) : Math.round(weeklyBase * 0.35)
      return driverPay + fuel + ops
    })

    // Cumulative balance
    let bal = CF_START_BALANCE
    const balance = CF_WEEKS.map((_, i) => {
      bal += incoming[i] - outgoing[i]
      return bal
    })

    return { incoming, outgoing, balance, items, avgPayRate, totalExpAmt }
  }, [loads, invoices, expenses, ctxDrivers])

  const { incoming, outgoing, balance, items, avgPayRate, totalExpAmt } = forecast

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
    { icon: Truck, color:'var(--accent2)', text:`Reserve ~$${Math.round(totalIn * avgPayRate).toLocaleString()} for driver pay over 6 weeks (${Math.round(avgPayRate * 100)}% avg of projected revenue).` },
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
                { label:`Driver Pay (${Math.round(avgPayRate * 100)}%)`, amount: Math.round(incoming[selWeek] * avgPayRate), out:true },
                { label:`Fuel est. ($${(fuelCostPerMile || 0.22).toFixed(2)}/mi)`, amount: Math.round((totalExpAmt || 0) / 4), out:true },
                { label:'Ops / Maintenance',    amount: Math.max(0, outgoing[selWeek] - Math.round(incoming[selWeek] * avgPayRate) - Math.round((totalExpAmt || 0) / 4)), out:true },
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
                        Factor Now (Coming Soon)
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
                        Factor (Coming Soon)
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
          { label:'WHAT YOU EARNED', val:`$${revenue.toLocaleString()}`, color:'var(--accent)', icon: DollarSign },
          { label:'WHAT IT COST', val:`$${totalExp.toLocaleString()}`, color:'var(--danger)', icon: TrendingDown },
          { label:'WHAT YOU KEPT', val:`$${net.toLocaleString()}`, color: net>=0 ? 'var(--success)' : 'var(--danger)', icon: BarChart2 },
          { label:'NET MARGIN', val:`${margin}%`, color: parseFloat(margin)>=20 ? 'var(--success)' : 'var(--warning)', icon: TrendingUp },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'18px 20px' }}>
            <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>{typeof k.icon === "string" ? k.icon : <k.icon size={11} />} {k.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:34, color:k.color, lineHeight:1 }}>{k.val}</div>
          </div>
        ))}
      </div>

      {revenue === 0 && (
        <div style={{ textAlign:'center', fontSize:12, color:'var(--muted)', padding:'4px 0 8px', lineHeight:1.5 }}>
          Qivori tracks every dollar automatically — no spreadsheets needed.
        </div>
      )}

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

// ─── 4. Cash Runway ────────────────────────────────────────────────────────────
export function CashRunway() {
  const { invoices, expenses } = useCarrier()
  const [cashBalance, setCashBalance] = useState(0)

  const weeklyExpenses = useMemo(() => {
    const total = expenses.reduce((s,e) => s+(e.amount||0), 0)
    return Math.round(total / 4)
  }, [expenses])

  const incomingRevenue = useMemo(() =>
    invoices.filter(i => i.status==='Unpaid').reduce((s,i) => s+(i.amount||0), 0)
  , [invoices])

  const weeks = useMemo(() => {
    let bal = cashBalance
    const weeklyIncoming = [incomingRevenue * 0.4, incomingRevenue * 0.3, incomingRevenue * 0.2, incomingRevenue * 0.1, 0, 0]
    return Array.from({ length:6 }, (_, i) => {
      const incoming = weeklyIncoming[i] || 0
      const outgoing = weeklyExpenses
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
  const { loads, invoices, expenses, user } = useCarrier()
  const [connected, setConnected] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [exported, setExported] = useState({})

  // Check QB connection status on mount
  useEffect(() => {
    if (!user?.id) return
    fetch('/api/quickbooks-auth', {
      headers: { 'Authorization': `Bearer ${user.access_token || ''}` }
    }).then(r => r.json()).then(data => {
      if (data.connected) {
        setConnected(true)
        setCompanyName(data.company_name || '')
      }
    }).catch(() => {})
  }, [user?.id])

  const handleConnect = async () => {
    if (connected) {
      setLoading(true)
      try {
        await fetch('/api/quickbooks-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.access_token || ''}` },
          body: JSON.stringify({ action: 'disconnect' })
        })
        setConnected(false)
        setCompanyName('')
      } catch {}
      setLoading(false)
    } else {
      setLoading(true)
      try {
        const res = await fetch(`/api/quickbooks-auth?action=authorize&user_id=${user.id}`)
        const data = await res.json()
        if (data.url) window.location.href = data.url
      } catch {}
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setLoading(true)
    try {
      await fetch('/api/quickbooks-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.access_token || ''}` },
        body: JSON.stringify({ user_id: user.id })
      })
    } catch {}
    setLoading(false)
  }

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
          <div style={{ fontWeight:700, marginBottom:4 }}>{connected ? `QuickBooks Online Connected${companyName ? ` — ${companyName}` : ''}` : 'QuickBooks Online Integration'}</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>
            {connected
              ? 'Auto-sync enabled — transactions push to QuickBooks automatically every night at 2 AM.'
              : 'Connect QuickBooks Online to sync invoices and expenses automatically, or use CSV export below.'}
          </div>
        </div>
        {connected && (
          <button onClick={handleSync} disabled={loading}
            style={{ padding:'10px 16px', fontSize:13, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              background:'rgba(34,197,94,0.15)', color:'var(--success)', opacity: loading ? 0.5 : 1 }}>
            Sync Now
          </button>
        )}
        <button onClick={handleConnect} disabled={loading}
          style={{ padding:'10px 20px', fontSize:13, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
            background: connected ? 'rgba(239,68,68,0.15)' : 'var(--accent3)', color: connected ? 'var(--danger)' : '#fff', opacity: loading ? 0.5 : 1 }}>
          {loading ? '...' : connected ? 'Disconnect' : <><Paperclip size={13} /> Connect QuickBooks</>}
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

// ─── AI ANALYTICS DASHBOARD ──────────────────────────────────────────────────
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

  // Utilization — count trucks from vehicles, drivers, OR drivers assigned to active loads
  const activeInTransit = loads.filter(l => ['In Transit','Loaded','At Pickup','At Delivery'].includes(l.status))
  const uniqueActiveDrivers = new Set(activeInTransit.map(l => l.driver || l.driver_name).filter(Boolean))
  const vehicleTrucks = (vehicles || []).filter(v => v.type === 'truck').length
  const truckCount = Math.max(vehicleTrucks, (drivers || []).length, uniqueActiveDrivers.size, activeInTransit.length > 0 ? 1 : 0)
  const utilization = truckCount > 0 ? Math.min(100, Math.round((activeInTransit.length / truckCount) * 100)) : 0

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
    if (margin < 25 && totalRevenue > 0) recs.push({ icon:TrendingDown, color:'#ef4444', title:'Margins below target', detail:`Net margin is ${margin}% — below the 30% industry benchmark. Review expense categories or negotiate higher rates on your top lanes.`, impact:'High', action:'Review' })
    if (deadheadPct > 15 && totalMiles > 0) recs.push({ icon:Route, color:'#8b5cf6', title:'Reduce deadhead miles', detail:`${deadheadPct}% of your miles are empty. Look for backhaul loads on your top lanes to fill repositioning gaps.`, impact:'Medium', action:'Find Loads' })
    if (unpaidTotal > 5000) recs.push({ icon:DollarSign, color:'#ef4444', title:`$${unpaidTotal.toLocaleString()} in unpaid invoices`, detail:`${invoices.filter(i=>i.status!=='Paid').length} invoices are outstanding. Follow up with brokers or consider factoring for immediate cash flow.`, impact:'High', action:'Collect' })
    if (utilization < 60 && truckCount > 0 && loads.length > 0) recs.push({ icon:Truck, color:'#4d8ef0', title:'Fleet underutilized', detail:`Only ${utilization}% of trucks are running loads. Book more loads or consider reducing fleet size to improve profitability.`, impact:'Medium', action:'Book Loads' })
    if (Number(avgRPM) < 2.5 && loads.length > 0) recs.push({ icon:TrendingUp, color:'#f0a500', title:'Rate per mile is low', detail:`Avg $${avgRPM}/mi is below the $2.80 national average. Focus on higher-paying lanes and avoid low-RPM loads.`, impact:'Medium', action:'Analyze' })
    if (topLanes.length > 0 && topLanes[0].loads >= 3) recs.push({ icon:Star, color:'#22c55e', title:`Strong lane: ${topLanes[0].lane}`, detail:`${topLanes[0].loads} loads at $${topLanes[0].miles > 0 ? (topLanes[0].revenue/topLanes[0].miles).toFixed(2) : '0.00'}/mi. Consider negotiating a dedicated lane contract with your top broker for consistent volume.`, impact:'Opportunity', action:'Negotiate' })
    if (recs.length === 0) recs.push({ icon:CheckCircle, color:'#22c55e', title:'Operations look healthy', detail:'No critical issues detected. Keep monitoring your margins and lane performance.', impact:'Info', action:'Continue' })
    return recs
  }, [fuelPctOfRev, fuelExp, margin, deadheadPct, unpaidTotal, utilization, avgRPM, topLanes, invoices])

  const AD_CAT_COLORS = { Fuel:'#f59e0b', Maintenance:'#ef4444', Tolls:'#8b5cf6', Food:'#22c55e', Parking:'#3b82f6', Insurance:'#ec4899', Other:'#6b7280' }
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
              <div key={i} style={{ display:'flex', gap:14, padding:'14px 16px', background:'var(--surface2)', borderRadius:10, alignItems:'flex-start', border:'1px solid var(--border)', flexWrap:'wrap' }}>
                <div style={{ width:38, height:38, borderRadius:10, background:`${r.color}15`, border:`1px solid ${r.color}30`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Ic icon={r.icon} size={18} color={r.color} />
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                    <span style={{ fontSize:13, fontWeight:700 }}>{r.title}</span>
                    <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, background:`${IMPACT_COLORS[r.impact]}15`, color:IMPACT_COLORS[r.impact] }}>{r.impact}</span>
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>{r.detail}</div>
                </div>
                <button className="btn btn-ghost" style={{ fontSize:11, flexShrink:0, whiteSpace:'nowrap' }} onClick={() => showToast('','AI Action',r.title)}>{r.action} →</button>
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
                      const el = <circle key={e.cat} cx="60" cy="60" r="50" fill="none" stroke={AD_CAT_COLORS[e.cat]||colors[i%colors.length]} strokeWidth="16"
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
                    <div style={{ width:8, height:8, borderRadius:2, background:AD_CAT_COLORS[e.cat]||'var(--muted)', flexShrink:0 }} />
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
