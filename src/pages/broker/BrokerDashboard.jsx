import { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { fetchLoads } from '../../lib/database'
import {
  Package, Truck, DollarSign, Clock, CheckCircle,
  FileText, ArrowRight, Timer, Route
} from 'lucide-react'
import { Ic, panel, panelHead, statCard, getState } from './helpers'

export function BrokerDashboard() {
  const { navigatePage } = useApp()
  const [loads, setLoads] = useState([])
  const [loadingData, setLoadingData] = useState(true)

  const loadData = async () => {
    const data = await fetchLoads()
    setLoads(data || [])
    setLoadingData(false)
  }

  useEffect(() => { loadData() }, [])

  // Real-time polling every 15 seconds
  useEffect(() => {
    const interval = setInterval(loadData, 15000)
    return () => clearInterval(interval)
  }, [])

  const activeLoads = loads.filter(l => ['open', 'in_transit', 'booked'].includes(l.status))
  const deliveredLoads = loads.filter(l => l.status === 'delivered')
  const totalRevenue = loads.reduce((sum, l) => sum + (l.rate || 0), 0)
  const recentLoads = loads.slice(0, 6)

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2 }}>BROKER DASHBOARD</div>

      {/* ── Top Stats ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Active Loads', value: activeLoads.length, color: 'var(--accent)', icon: Package },
          { label: 'Total Loads', value: loads.length, color: 'var(--success)', icon: CheckCircle },
          { label: 'Delivered', value: deliveredLoads.length, color: 'var(--accent2)', icon: Truck },
          { label: 'Total Revenue', value: '$' + (totalRevenue / 1000).toFixed(1) + 'K', color: 'var(--accent3)', icon: DollarSign },
        ].map(s => (
          <div key={s.label} style={statCard(s.color)}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
              <Ic icon={s.icon} size={16} style={{ color: s.color, opacity: 0.5 }} />
            </div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Performance Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Avg Rate', value: loads.length ? '$' + Math.round(totalRevenue / loads.length).toLocaleString() : '—', icon: Timer, color: 'var(--accent)' },
          { label: 'Open Loads', value: loads.filter(l => l.status === 'open').length, icon: Package, color: 'var(--warning)' },
          { label: 'In Transit', value: loads.filter(l => l.status === 'in_transit').length, icon: Route, color: 'var(--success)' },
          { label: 'Booked', value: loads.filter(l => l.status === 'booked').length, icon: CheckCircle, color: 'var(--accent3)' },
        ].map(s => (
          <div key={s.label} style={{ ...panel, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: s.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic icon={s.icon} size={16} style={{ color: s.color }} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>{s.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* ── Recent Loads ── */}
        <div style={panel}>
          <div style={panelHead}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Clock} size={14} /> Recent Loads</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {loadingData ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>Loading...</div>
            ) : recentLoads.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No loads yet</div>
            ) : recentLoads.map((l, i) => (
              <div key={l.id} onClick={() => navigatePage('broker-loads')}
                style={{ padding: '10px 16px', borderBottom: i < recentLoads.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <Ic icon={Package} size={14} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{l.load_id} — {getState(l.origin)} → {getState(l.destination)}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{l.equipment || '—'}{l.weight ? ' · ' + Number(l.weight).toLocaleString() + ' lbs' : ''} · ${Number(l.rate || 0).toLocaleString()}</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 12, background: l.status === 'open' ? 'rgba(240,165,0,0.12)' : l.status === 'delivered' ? 'rgba(34,197,94,0.12)' : 'var(--surface2)', color: l.status === 'open' ? 'var(--warning)' : l.status === 'delivered' ? 'var(--success)' : 'var(--muted)' }}>{l.status}</span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Quick Actions ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { icon: Package, label: 'Post a Load', sub: 'Post and let AI match the best carrier', color: 'rgba(240,165,0,0.1)', border: 'rgba(240,165,0,0.3)', iconColor: 'var(--accent)', page: 'broker-post' },
            { icon: FileText, label: 'View My Loads', sub: 'Track all loads and carrier assignments', color: 'rgba(77,142,240,0.1)', border: 'rgba(77,142,240,0.3)', iconColor: 'var(--accent2)', page: 'broker-loads' },
            { icon: Truck, label: 'Find Carriers', sub: 'Browse verified carriers on the platform', color: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', iconColor: 'var(--success)', page: 'broker-carriers' },
          ].map(a => (
            <div key={a.label} style={{ ...panel, padding: 20, display: 'flex', alignItems: 'center', gap: 16, cursor: 'pointer' }}
              onClick={() => navigatePage(a.page)}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: a.color, border: '1px solid ' + a.border, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Ic icon={a.icon} size={22} style={{ color: a.iconColor }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>{a.label}</div>
                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.sub}</div>
              </div>
              <Ic icon={ArrowRight} size={16} style={{ color: 'var(--muted)' }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
