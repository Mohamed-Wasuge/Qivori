import React, { useState, useMemo } from 'react'
import { BarChart2, Briefcase, Star } from 'lucide-react'
import { Ic, S, StatCard, AiBanner } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'

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
    <div style={{ display: 'flex', minHeight: 0 }}>
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
