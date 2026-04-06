import React, { useState, useMemo } from 'react'
import { BarChart2, Flame, Target, DollarSign, Truck, FileText } from 'lucide-react'
import { Ic, S, StatCard, AiBanner } from '../shared'
import { useCarrier } from '../../../context/CarrierContext'

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

  // Compute weekly revenue from real load data
  const { weeks, gross, net, maxVal } = useMemo(() => {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    const wks = ['W1','W2','W3','W4']
    const g = [0,0,0,0]
    const n = [0,0,0,0]
    ;(ctxLoads || []).forEach(l => {
      const d = new Date(l.created_at || l.pickup || l.pickupDate || Date.now())
      if (d >= monthStart) {
        const weekIdx = Math.min(3, Math.floor((d.getDate() - 1) / 7))
        g[weekIdx] += Number(l.gross || l.rate || 0)
      }
    })
    const weekExp = [0,0,0,0]
    ;(ctxExpenses || []).forEach(e => {
      const d = new Date(e.date || e.created_at || Date.now())
      if (d >= monthStart) {
        const weekIdx = Math.min(3, Math.floor((d.getDate() - 1) / 7))
        weekExp[weekIdx] += Number(e.amount || 0)
      }
    })
    for (let i = 0; i < 4; i++) n[i] = g[i] - weekExp[i]
    const mv = Math.max(1, ...g, ...n.map(Math.abs))
    return { weeks: wks, gross: g, net: n, maxVal: mv }
  }, [ctxLoads, ctxExpenses])

  // Compute top lanes and best lane RPM from real data
  const topLanes = useMemo(() => {
    const laneMap = {}
    ;(ctxLoads || []).forEach(l => {
      const origin = (l.origin || '').split(',')[0].trim()
      const dest = (l.dest || l.destination || '').split(',')[0].trim()
      if (!origin || !dest) return
      const key = `${origin} → ${dest}`
      if (!laneMap[key]) laneMap[key] = { lane: key, gross: 0, miles: 0, loads: 0 }
      laneMap[key].gross += Number(l.gross || l.rate || 0)
      laneMap[key].miles += Number(l.miles || 0)
      laneMap[key].loads += 1
    })
    return Object.values(laneMap)
      .map(l => ({ ...l, rpm: l.miles > 0 ? (l.gross / l.miles).toFixed(2) : '0', net: `$${l.gross.toLocaleString()}` }))
      .sort((a, b) => b.gross - a.gross)
      .slice(0, 5)
  }, [ctxLoads])

  const bestLaneRPM = topLanes.length > 0 ? `$${Math.max(...topLanes.map(l => parseFloat(l.rpm))).toFixed(2)}` : '—'

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
            <StatCard label="Best Lane RPM" value={bestLaneRPM}  change={topLanes.length > 0 ? topLanes[0].lane : "Add loads to track"} color="var(--accent2)" changeType={topLanes.length > 0 ? "up" : "neutral"}/>
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
