import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { Users, TrendingUp, AlertTriangle, Activity, Package, Map, Truck, Brain, Shield, Server } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

function PlatformInsights({ loads, carriers, leaderboard, hotLanes, weeklyTrend }) {
  const insights = []
  const now = new Date()
  const ic = { critical: { bg: '#fef2f2', border: '#fecaca', color: '#dc2626', icon: AlertTriangle }, warning: { bg: '#fffbeb', border: '#fde68a', color: '#d97706', icon: AlertTriangle }, success: { bg: '#f0fdf4', border: '#bbf7d0', color: '#16a34a', icon: TrendingUp }, info: { bg: '#eff6ff', border: '#bfdbfe', color: '#2563eb', icon: Activity } }

  // 1. Churning carriers — signed up but no loads in 14+ days
  carriers.forEach(c => {
    const carrierLoads = loads.filter(l => l.owner_id === c.id)
    const daysSinceSignup = Math.floor((now - new Date(c.created_at)) / 86400000)
    if (carrierLoads.length === 0 && daysSinceSignup >= 3 && daysSinceSignup <= 30) {
      insights.push({ type: 'critical', title: `${c.company_name || c.full_name || c.email} signed up ${daysSinceSignup}d ago — zero loads`, action: 'Call them. They need onboarding help or they\'ll churn.', carrier: c.email })
    }
  })

  // 2. Inactive carriers — had loads but stopped
  leaderboard.forEach(c => {
    const carrierLoads = loads.filter(l => l.owner_id === c.id)
    const lastLoad = carrierLoads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]
    if (lastLoad) {
      const daysSince = Math.floor((now - new Date(lastLoad.created_at)) / 86400000)
      if (daysSince >= 14) {
        insights.push({ type: 'warning', title: `${c.name} hasn't moved a load in ${daysSince} days`, action: 'At risk of churning. Reach out — ask if they need help or found another platform.' })
      }
    }
  })

  // 3. Unpaid invoices aging
  const oldUnpaid = loads.filter(l => l.status === 'Invoiced' && l.created_at).filter(l => {
    const days = Math.floor((now - new Date(l.created_at)) / 86400000)
    return days > 30
  })
  if (oldUnpaid.length > 0) {
    insights.push({ type: 'warning', title: `${oldUnpaid.length} load(s) invoiced over 30 days ago — still unpaid`, action: 'Carriers may need factoring help. Promote QuickPay/Same Day Pay.' })
  }

  // 4. Top performer
  if (leaderboard.length > 0 && leaderboard[0].loads >= 3) {
    const top = leaderboard[0]
    insights.push({ type: 'success', title: `Top carrier: ${top.name} — $${top.gross.toLocaleString()} revenue, ${top.loads} loads, ${top.onTime}% on-time`, action: 'Feature them in marketing. Ask for a testimonial.' })
  }

  // 5. Hot lane detection
  if (hotLanes.length > 0) {
    const hottest = hotLanes[0]
    insights.push({ type: 'info', title: `Hottest lane: ${hottest.origin} → ${hottest.dest} — ${hottest.count} loads, $${Math.round(hottest.gross).toLocaleString()} gross`, action: 'Tell your carriers about this lane. High demand = higher rates.' })
  }

  // 6. Growth trend
  if (weeklyTrend.length >= 2) {
    const latest = weeklyTrend[weeklyTrend.length - 1]
    const prev = weeklyTrend[weeklyTrend.length - 2]
    const pctChange = prev.loads > 0 ? Math.round((latest.loads - prev.loads) / prev.loads * 100) : 0
    if (pctChange > 10) {
      insights.push({ type: 'success', title: `Load volume up ${pctChange}% week-over-week (${prev.loads} → ${latest.loads})`, action: 'Growth accelerating. Keep pushing carrier acquisition.' })
    } else if (pctChange < -20) {
      insights.push({ type: 'critical', title: `Load volume down ${Math.abs(pctChange)}% week-over-week (${prev.loads} → ${latest.loads})`, action: 'Volume dropping. Check if carriers are active. Run outreach.' })
    }
  }

  // 7. Onboarded but no truck/driver
  carriers.forEach(c => {
    const hasLoads = loads.some(l => l.owner_id === c.id)
    const daysSince = Math.floor((now - new Date(c.created_at)) / 86400000)
    if (!hasLoads && daysSince >= 1 && daysSince <= 7 && c.subscription_status === 'trialing') {
      insights.push({ type: 'info', title: `${c.company_name || c.full_name || c.email} is on day ${daysSince} of trial — no loads yet`, action: 'Send them a quick tutorial or offer a setup call.' })
    }
  })

  // 8. Platform milestone
  const totalGross = loads.reduce((s, l) => s + (parseFloat(l.rate) || 0), 0)
  if (totalGross > 0) {
    const monthlyPace = totalGross * (30 / Math.max(1, Math.floor((now - new Date(Math.min(...loads.map(l => new Date(l.created_at).getTime())))) / 86400000)))
    insights.push({ type: 'info', title: `Platform revenue pace: $${Math.round(monthlyPace).toLocaleString()}/month based on current activity`, action: carriers.length < 10 ? 'Get to 10 carriers to validate product-market fit.' : 'Scale carrier acquisition. Product is working.' })
  }

  if (insights.length === 0) {
    insights.push({ type: 'info', title: 'No actionable insights yet', action: 'Get more carriers on the platform to generate intelligence.' })
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      <div style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Ic icon={Brain} size={16} color="#f0a500" />
        <span style={{ fontSize: 14, fontWeight: 800, color: '#111827' }}>Q PLATFORM INSIGHTS</span>
        <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 4 }}>{insights.length} actionable items</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {insights.slice(0, 8).map((insight, i) => {
          const style = ic[insight.type] || ic.info
          const InsightIcon = style.icon
          return (
            <div key={i} style={{ padding: '12px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', gap: 12, alignItems: 'flex-start', background: i % 2 === 0 ? '#fff' : '#fafafa' }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: style.bg, border: `1px solid ${style.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                <Ic icon={InsightIcon} size={13} color={style.color} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#111827', marginBottom: 2 }}>{insight.title}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{insight.action}</div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function PlatformIntelligence() {
  const [loads, setLoads] = useState([])
  const [carriers, setCarriers] = useState([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('month') // week, month, quarter, year
  const [customRange, setCustomRange] = useState({ from: '', to: '' })

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        // Calculate date range
        const now = new Date()
        let fromDate = new Date()
        if (period === 'week') fromDate.setDate(now.getDate() - 7)
        else if (period === 'month') fromDate.setMonth(now.getMonth() - 1)
        else if (period === 'quarter') fromDate.setMonth(now.getMonth() - 3)
        else if (period === 'year') fromDate.setFullYear(now.getFullYear() - 1)
        else if (period === 'custom' && customRange.from) fromDate = new Date(customRange.from)
        const toDate = period === 'custom' && customRange.to ? new Date(customRange.to) : now

        const [loadsRes, profilesRes] = await Promise.all([
          supabase.from('loads').select('*').gte('created_at', fromDate.toISOString()).lte('created_at', toDate.toISOString()).order('created_at', { ascending: false }).limit(1000),
          supabase.from('profiles').select('id,full_name,email,company_name,plan,subscription_status,created_at').eq('role', 'carrier'),
        ])
        setLoads(loadsRes.data || [])
        setCarriers(profilesRes.data || [])
      } catch {}
      setLoading(false)
    })()
  }, [period, customRange.from, customRange.to])

  // ── Aggregate metrics ──
  const totalLoads = loads.length
  const deliveredLoads = loads.filter(l => ['Delivered', 'Invoiced', 'Paid'].includes(l.status))
  const totalGross = loads.reduce((s, l) => s + (parseFloat(l.rate) || 0), 0)
  const avgRPM = loads.filter(l => l.miles > 0).length > 0
    ? loads.filter(l => l.miles > 0).reduce((s, l) => s + (l.rate / l.miles), 0) / loads.filter(l => l.miles > 0).length : 0
  const deliveryRate = totalLoads > 0 ? Math.round(deliveredLoads.length / totalLoads * 100) : 0

  // ── Carrier leaderboard ──
  const carrierStats = {}
  loads.forEach(l => {
    const cid = l.owner_id
    if (!cid) return
    if (!carrierStats[cid]) carrierStats[cid] = { loads: 0, gross: 0, delivered: 0, miles: 0 }
    carrierStats[cid].loads++
    carrierStats[cid].gross += parseFloat(l.rate) || 0
    carrierStats[cid].miles += parseInt(l.miles) || 0
    if (['Delivered', 'Invoiced', 'Paid'].includes(l.status)) carrierStats[cid].delivered++
  })
  const leaderboard = Object.entries(carrierStats).map(([cid, stats]) => {
    const profile = carriers.find(c => c.id === cid)
    return {
      id: cid,
      name: profile?.company_name || profile?.full_name || profile?.email || cid.slice(0, 8),
      plan: profile?.plan || '—',
      ...stats,
      onTime: stats.loads > 0 ? Math.round(stats.delivered / stats.loads * 100) : 0,
      avgRpm: stats.miles > 0 ? Math.round(stats.gross / stats.miles * 100) / 100 : 0,
    }
  }).sort((a, b) => b.gross - a.gross)

  // ── Market heatmap (origin state → destination state) ──
  const marketMap = {}
  loads.forEach(l => {
    const oState = extractSt(l.origin)
    const dState = extractSt(l.destination)
    if (!oState || !dState) return
    const key = `${oState}→${dState}`
    if (!marketMap[key]) marketMap[key] = { lane: key, origin: oState, dest: dState, count: 0, gross: 0, miles: 0 }
    marketMap[key].count++
    marketMap[key].gross += parseFloat(l.rate) || 0
    marketMap[key].miles += parseInt(l.miles) || 0
  })
  const hotLanes = Object.values(marketMap).sort((a, b) => b.count - a.count).slice(0, 10)

  // ── Weekly trend ──
  const weeklyData = {}
  loads.forEach(l => {
    const d = new Date(l.created_at)
    const weekKey = `${d.getFullYear()}-W${String(Math.ceil((d.getDate() + new Date(d.getFullYear(), d.getMonth(), 1).getDay()) / 7)).padStart(2, '0')}`
    if (!weeklyData[weekKey]) weeklyData[weekKey] = { week: weekKey, loads: 0, gross: 0 }
    weeklyData[weekKey].loads++
    weeklyData[weekKey].gross += parseFloat(l.rate) || 0
  })
  const weeklyTrend = Object.values(weeklyData).sort((a, b) => a.week.localeCompare(b.week))
  const maxWeekLoads = Math.max(...weeklyTrend.map(w => w.loads), 1)

  // ── Equipment breakdown ──
  const equipCounts = {}
  loads.forEach(l => { const e = l.equipment || 'Dry Van'; equipCounts[e] = (equipCounts[e] || 0) + 1 })
  const equipData = Object.entries(equipCounts).sort((a, b) => b[1] - a[1])

  // ── Status breakdown ──
  const statusCounts = {}
  loads.forEach(l => { statusCounts[l.status || 'Unknown'] = (statusCounts[l.status || 'Unknown'] || 0) + 1 })

  const S = {
    card: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 24px', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
    label: { fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 },
    val: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 32, letterSpacing: 1, color: '#111827' },
    panel: { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
    panelHead: { padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    panelTitle: { fontSize: 13, fontWeight: 700, color: '#111827' },
    row: { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: '1px solid #f3f4f6' },
  }
  const sc = { 'Delivered': '#34b068', 'Invoiced': '#8b5cf6', 'Dispatched': '#f0a500', 'In Transit': '#3b82f6', 'Rate Con Received': '#6b7280', 'Paid': '#22c55e', 'Cancelled': '#ef4444' }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: 3, margin: 0, color: '#f0a500' }}>PLATFORM INTELLIGENCE</h1>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Carrier performance, market trends, and operational metrics</div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['week', 'month', 'quarter', 'year'].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ padding: '6px 14px', borderRadius: 8, border: period === p ? '1px solid #f0a500' : '1px solid #e5e7eb', background: period === p ? 'rgba(240,165,0,0.1)' : '#fff', color: period === p ? '#f0a500' : '#6b7280', fontSize: 11, fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase' }}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>Loading platform data...</div> : (
        <>
          {/* AI Platform Insights */}
          <PlatformInsights loads={loads} carriers={carriers} leaderboard={leaderboard} hotLanes={hotLanes} weeklyTrend={weeklyTrend} />

          {/* KPI Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
            {[
              { label: 'Total Loads', val: totalLoads.toLocaleString(), color: '#f0a500' },
              { label: 'Gross Revenue', val: `$${Math.round(totalGross).toLocaleString()}`, color: '#34b068' },
              { label: 'Avg RPM', val: `$${avgRPM.toFixed(2)}`, color: '#3b82f6' },
              { label: 'Delivery Rate', val: `${deliveryRate}%`, color: deliveryRate >= 90 ? '#34b068' : '#f0a500' },
              { label: 'Active Carriers', val: leaderboard.length.toString(), color: '#8b5cf6' },
            ].map(k => (
              <div key={k.label} style={S.card}>
                <div style={S.label}>{k.label}</div>
                <div style={{ ...S.val, color: k.color }}>{k.val}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {/* Carrier Leaderboard */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Users} size={14} style={{ marginRight: 8, color: '#f0a500' }} />Carrier Leaderboard</div>
                <span style={{ fontSize: 10, color: '#6b7280' }}>{leaderboard.length} carriers</span>
              </div>
              {leaderboard.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>No carrier data for this period</div>
              ) : leaderboard.slice(0, 10).map((c, i) => (
                <div key={c.id} style={S.row}>
                  <div style={{ width: 24, height: 24, borderRadius: '50%', background: i < 3 ? 'rgba(240,165,0,0.15)' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: i < 3 ? '#f0a500' : '#6b7280' }}>{i + 1}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>{c.loads} loads · {c.onTime}% on-time · ${c.avgRpm}/mi</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#34b068' }}>${c.gross.toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: '#6b7280' }}>{c.plan}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Hot Lanes */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Map} size={14} style={{ marginRight: 8, color: '#f0a500' }} />Hottest Lanes</div>
                <span style={{ fontSize: 10, color: '#6b7280' }}>by volume</span>
              </div>
              {hotLanes.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>No lane data for this period</div>
              ) : hotLanes.map((lane, i) => (
                <div key={lane.lane} style={S.row}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: i < 3 ? 'rgba(59,130,246,0.15)' : '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: i < 3 ? '#3b82f6' : '#6b7280' }}>{i + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{lane.origin} <span style={{ color: '#6b7280' }}> → </span> {lane.dest}</div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>{lane.count} loads · {lane.miles > 0 ? Math.round(lane.miles / lane.count) : '—'} avg mi</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#f0a500' }}>${Math.round(lane.gross).toLocaleString()}</div>
                    <div style={{ fontSize: 9, color: '#6b7280' }}>${lane.miles > 0 ? (lane.gross / lane.miles).toFixed(2) : '—'}/mi</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Weekly Trend + Equipment + Status */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 16 }}>
            {/* Weekly Trend */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={TrendingUp} size={14} style={{ marginRight: 8, color: '#f0a500' }} />Weekly Trend</div>
              </div>
              <div style={{ padding: 16 }}>
                {weeklyTrend.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#6b7280', fontSize: 12, padding: 20 }}>No trend data yet</div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 120 }}>
                    {weeklyTrend.slice(-12).map((w, i) => (
                      <div key={w.week} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                        <div style={{ fontSize: 9, color: '#f0a500', fontWeight: 700 }}>{w.loads}</div>
                        <div style={{ width: '100%', height: Math.max(4, (w.loads / maxWeekLoads) * 90), background: 'linear-gradient(180deg, #f0a500, rgba(240,165,0,0.3))', borderRadius: 3 }} />
                        <div style={{ fontSize: 8, color: '#6b7280', transform: 'rotate(-45deg)', whiteSpace: 'nowrap' }}>{w.week.slice(-3)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Equipment Breakdown */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Truck} size={14} style={{ marginRight: 8 }} />Equipment</div>
              </div>
              <div style={{ padding: 12 }}>
                {equipData.map(([eq, count]) => (
                  <div key={eq} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', fontSize: 12 }}>
                    <span>{eq}</span>
                    <span style={{ fontWeight: 700, color: '#f0a500' }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status Breakdown */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Activity} size={14} style={{ marginRight: 8 }} />Status</div>
              </div>
              <div style={{ padding: 12 }}>
                {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).map(([status, count]) => (
                  <div key={status} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 8px', fontSize: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: sc[status] || '#6b7280' }} />
                      {status}
                    </span>
                    <span style={{ fontWeight: 700 }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function extractSt(loc) {
  if (!loc) return ''
  const parts = loc.split(',')
  const last = (parts[parts.length - 1] || '').trim().replace(/[^A-Za-z]/g, '').toUpperCase()
  return last.length === 2 ? last : ''
}
