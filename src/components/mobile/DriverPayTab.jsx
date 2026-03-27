import { useState, useMemo } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  DollarSign, TrendingUp, CheckCircle, Clock, FileText, ChevronRight
} from 'lucide-react'
import { Ic, haptic, fmt$ } from './shared'

function calcDriverPay(revenue, miles, driver) {
  if (driver?.pay_model && driver?.pay_rate) {
    const rate = Number(driver.pay_rate) || 0
    if (driver.pay_model === 'percent') return revenue * (rate / 100)
    if (driver.pay_model === 'permile') return (miles || 0) * rate
    if (driver.pay_model === 'flat') return rate
  }
  return revenue * 0.28
}

export default function DriverPayTab() {
  const ctx = useCarrier() || {}
  const { user, profile } = useApp()
  const loads = ctx.loads || []
  const drivers = ctx.drivers || []
  const [period, setPeriod] = useState('all') // all, week, month

  const myDriver = useMemo(() => {
    return drivers.find(d => d.user_id === user?.id)
      || drivers.find(d => (d.full_name || d.name || '') === (profile?.full_name || ''))
      || drivers[0]
  }, [drivers, user, profile])

  const payModelText = myDriver?.pay_model === 'percent' ? `${myDriver.pay_rate}% of gross`
    : myDriver?.pay_model === 'permile' ? `$${Number(myDriver.pay_rate || 0).toFixed(2)}/mile`
    : myDriver?.pay_model === 'flat' ? `$${Number(myDriver.pay_rate || 0).toFixed(0)} flat per load`
    : '28% of gross (default)'

  // Completed loads with pay calculation
  const payHistory = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0)
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

    return loads
      .filter(l => {
        const s = (l.status || '').toLowerCase()
        return s === 'delivered' || s === 'invoiced' || s === 'paid' || s === 'settled'
      })
      .map(l => {
        const rev = l.gross || l.rate || 0
        const miles = l.miles || 0
        const pay = l.driver_pay || calcDriverPay(rev, miles, myDriver)
        const date = l.delivery_date || l.created_at || ''
        return { ...l, driverPay: Math.round(pay * 100) / 100, date }
      })
      .filter(l => {
        if (period === 'all') return true
        const d = new Date(l.date || 0)
        if (period === 'week') return d >= weekStart
        if (period === 'month') return d >= monthStart
        return true
      })
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
  }, [loads, myDriver, period])

  const totalPay = payHistory.reduce((s, l) => s + l.driverPay, 0)
  const totalMiles = payHistory.reduce((s, l) => s + (l.miles || 0), 0)
  const paidLoads = payHistory.filter(l => (l.status || '').toLowerCase() === 'paid' || (l.status || '').toLowerCase() === 'settled')
  const pendingPay = payHistory.filter(l => (l.status || '').toLowerCase() !== 'paid' && (l.status || '').toLowerCase() !== 'settled')
  const paidTotal = paidLoads.reduce((s, l) => s + l.driverPay, 0)
  const pendingTotal = pendingPay.reduce((s, l) => s + l.driverPay, 0)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 15, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5 }}>MY PAY</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{payModelText}</div>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div style={{ flexShrink: 0, padding: '12px 16px', display: 'flex', gap: 8 }}>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>Total Earned</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(totalPay)}</div>
          <div style={{ fontSize: 9, color: 'var(--muted)' }}>{payHistory.length} loads · {totalMiles.toLocaleString()} mi</div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>Paid</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(paidTotal)}</div>
          <div style={{ fontSize: 9, color: 'var(--muted)' }}>{paidLoads.length} settlements</div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>Pending</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: pendingTotal > 0 ? '#f59e0b' : 'var(--muted)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(pendingTotal)}</div>
          <div style={{ fontSize: 9, color: 'var(--muted)' }}>{pendingPay.length} loads</div>
        </div>
      </div>

      {/* Period filter */}
      <div style={{ flexShrink: 0, padding: '0 16px 8px', display: 'flex', gap: 6 }}>
        {[{ id: 'week', label: 'This Week' }, { id: 'month', label: 'This Month' }, { id: 'all', label: 'All Time' }].map(p => (
          <button key={p.id} onClick={() => { haptic(); setPeriod(p.id) }}
            style={{
              padding: '6px 14px', borderRadius: 20, whiteSpace: 'nowrap',
              background: period === p.id ? 'var(--accent)' : 'var(--surface)',
              border: `1px solid ${period === p.id ? 'var(--accent)' : 'var(--border)'}`,
              color: period === p.id ? '#000' : 'var(--text)',
              fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Pay history list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', WebkitOverflowScrolling: 'touch' }}>
        {payHistory.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--muted)' }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--accent)', fontWeight: 800 }}>Q</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>No pay history yet</div>
            <div style={{ fontSize: 11, marginTop: 4 }}>Complete loads to see your earnings here.</div>
          </div>
        )}

        {payHistory.map((load, i) => {
          const isPaid = (load.status || '').toLowerCase() === 'paid' || (load.status || '').toLowerCase() === 'settled'
          return (
            <div key={load.id || load.load_id || i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '12px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
              marginBottom: 6, animation: `fadeInUp 0.2s ease ${i * 0.03}s both`,
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: isPaid ? 'rgba(0,212,170,0.08)' : 'rgba(245,158,11,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Ic icon={isPaid ? CheckCircle : Clock} size={16} color={isPaid ? 'var(--success)' : '#f59e0b'} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {load.origin || '?'} → {load.destination || load.dest || '?'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                  {load.date || '—'} · {load.miles || 0} mi
                  {isPaid && <span style={{ color: 'var(--success)', fontWeight: 700 }}> · PAID</span>}
                  {!isPaid && <span style={{ color: '#f59e0b' }}> · Pending</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: isPaid ? 'var(--success)' : 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif" }}>
                  {fmt$(load.driverPay)}
                </div>
                <div style={{ fontSize: 9, color: 'var(--muted)' }}>
                  of {fmt$(load.gross || load.rate)}
                </div>
              </div>
            </div>
          )
        })}

        <div style={{ height: 80 }} />
      </div>
    </div>
  )
}
