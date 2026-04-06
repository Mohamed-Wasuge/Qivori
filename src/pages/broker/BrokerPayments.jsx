import { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { fetchLoads } from '../../lib/database'
import { Clock, CheckCircle, CreditCard } from 'lucide-react'
import { Ic, panel, panelHead, statCard, badge, payColor, getState } from './helpers'

export function BrokerPayments() {
  const { showToast } = useApp()
  const [loads, setLoads] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      const data = await fetchLoads()
      setLoads(data || [])
      setLoading(false)
    }
    loadData()
  }, [])

  const totalRevenue = loads.reduce((s, l) => s + (l.rate || 0), 0)
  const deliveredRevenue = loads.filter(l => l.status === 'delivered').reduce((s, l) => s + (l.rate || 0), 0)
  const pendingRevenue = loads.filter(l => l.status !== 'delivered' && l.status !== 'cancelled').reduce((s, l) => s + (l.rate || 0), 0)

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading payments...</div>

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2 }}>PAYMENTS</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
        {[
          { label: 'Total Revenue', value: '$' + totalRevenue.toLocaleString(), color: 'var(--accent)' },
          { label: 'Completed', value: '$' + deliveredRevenue.toLocaleString(), color: 'var(--success)' },
          { label: 'Pending', value: '$' + pendingRevenue.toLocaleString(), color: 'var(--warning)' },
          { label: 'Total Loads', value: loads.length, color: 'var(--accent2)' },
        ].map(s => (
          <div key={s.label} style={statCard(s.color)}>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</div>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, color: s.color, lineHeight: 1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      <div style={panel}>
        <div style={panelHead}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={CreditCard} size={14} /> Load Payments</span>
        </div>
        {loads.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No loads yet</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Load', 'Route', 'Rate', 'Status', 'Payment', 'Posted'].map(h => (
                  <th key={h} style={{ padding: '10px 14px', fontSize: 11, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loads.map(l => {
                const payStatus = l.status === 'delivered' ? 'Paid' : l.status === 'cancelled' ? 'Cancelled' : 'Pending'
                const pc = payColor(payStatus)
                return (
                  <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--accent3)' }}>{l.load_id}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 600 }}>{getState(l.origin)} → {getState(l.destination)}</td>
                    <td style={{ padding: '10px 14px', fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>${Number(l.rate || 0).toLocaleString()}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: l.status === 'delivered' ? 'rgba(34,197,94,0.12)' : l.status === 'open' ? 'rgba(240,165,0,0.12)' : 'var(--surface2)', color: l.status === 'delivered' ? 'var(--success)' : l.status === 'open' ? 'var(--warning)' : 'var(--muted)' }}>
                        {l.status}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <span style={badge((pc || 'var(--muted)') + '18', pc || 'var(--muted)')}>
                        {payStatus === 'Pending' && <Ic icon={Clock} size={10} />}
                        {payStatus === 'Paid' && <Ic icon={CheckCircle} size={10} />}
                        {payStatus}
                      </span>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 11, color: 'var(--muted)' }}>{l.posted_at ? new Date(l.posted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
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
