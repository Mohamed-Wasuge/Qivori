import { useState } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  Package, DollarSign, TrendingUp, Truck, ChevronRight, AlertCircle,
  FileText, Clock, CheckCircle, ArrowUpRight, Mic, Send, MapPin,
  Camera, ScanLine
} from 'lucide-react'
import { Ic, haptic, fmt$, statusColor } from './shared'

export default function MobileHomeTab({ onNavigate, onOpenQ }) {
  const ctx = useCarrier() || {}
  const { user, profile } = useApp()
  const loads = ctx.loads || []
  const activeLoads = ctx.activeLoads || []
  const invoices = ctx.invoices || []
  const expenses = ctx.expenses || []
  const totalRevenue = ctx.totalRevenue || 0
  const totalExpenses = ctx.totalExpenses || 0
  const unpaidInvoices = ctx.unpaidInvoices || []
  const [expandedLoad, setExpandedLoad] = useState(null)
  const [qInput, setQInput] = useState('')

  const netProfit = totalRevenue - totalExpenses
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(0) : 0
  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]

  // Recent activity — last 5 loads sorted by date
  const recentLoads = [...loads].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5)

  // Context-aware quick actions — show what matters right now
  const getSmartActions = () => {
    const actions = []
    const hasActiveLoad = activeLoads.length > 0
    const currentLoad = activeLoads[0]
    const status = (currentLoad?.status || '').toLowerCase()

    if (hasActiveLoad && (status.includes('transit') || status.includes('loaded'))) {
      actions.push({ icon: CheckCircle, label: 'Mark Delivered', color: 'var(--success)', action: () => onOpenQ?.('Mark my current load as delivered') })
      actions.push({ icon: MapPin, label: 'Check Call', color: 'var(--accent2)', action: () => onOpenQ?.('Submit a check call for my current load') })
    } else if (hasActiveLoad && (status.includes('booked') || status.includes('dispatched'))) {
      actions.push({ icon: Truck, label: 'Start Trip', color: 'var(--accent)', action: () => onOpenQ?.('Update my load to In Transit') })
    }

    if (!hasActiveLoad) {
      actions.push({ icon: Package, label: 'Find a Load', color: 'var(--accent)', action: () => onOpenQ?.('Find me a good paying load') })
    }

    actions.push({ icon: ScanLine, label: 'Snap Rate Con', color: 'var(--accent2)', action: () => onNavigate?.('loads') })

    if (unpaidInvoices.length > 0) {
      actions.push({ icon: DollarSign, label: 'Send Invoice', color: 'var(--success)', action: () => onNavigate?.('money') })
    }

    actions.push({ icon: Camera, label: 'Scan Receipt', color: '#8b5cf6', action: () => onNavigate?.('money', 'expenses') })

    return actions.slice(0, 3) // Show max 3
  }

  const smartActions = getSmartActions()

  const handleQSubmit = () => {
    if (!qInput.trim()) return
    haptic()
    onOpenQ?.(qInput.trim())
    setQInput('')
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* ── AI Command Center: Greeting + Q Input ── */}
      <div style={{ animation: 'fadeInUp 0.3s ease' }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Hey, {firstName}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          {activeLoads.length > 0
            ? `${activeLoads.length} active load${activeLoads.length > 1 ? 's' : ''} — what do you need?`
            : "No active loads — let's find one"}
        </div>

        {/* Q Input Bar — type or tap mic */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 14,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 28, padding: '6px 6px 6px 16px',
        }}>
          <input
            value={qInput}
            onChange={e => setQInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleQSubmit()}
            placeholder="Ask Q anything..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 14, fontFamily: "'DM Sans',sans-serif",
            }}
          />
          {qInput.trim() ? (
            <button onClick={handleQSubmit}
              style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic icon={Send} size={16} color="#000" />
            </button>
          ) : (
            <button onClick={() => onOpenQ?.()}
              style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic icon={Mic} size={16} color="#000" />
            </button>
          )}
        </div>
      </div>

      {/* ── Smart Actions — context-aware ── */}
      <div style={{ display: 'flex', gap: 8, animation: 'fadeInUp 0.3s ease 0.05s both' }}>
        {smartActions.map((action, i) => (
          <button key={i} onClick={() => { haptic(); action.action() }}
            style={{
              flex: 1, padding: '12px 8px', background: 'var(--surface)',
              border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s ease',
            }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${action.color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic icon={action.icon} size={16} color={action.color} />
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', textAlign: 'center' }}>{action.label}</span>
          </button>
        ))}
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, animation: 'fadeInUp 0.3s ease 0.1s both' }}>
        <KPICard icon={DollarSign} label="Revenue MTD" value={fmt$(totalRevenue)} color="var(--accent)" />
        <KPICard icon={TrendingUp} label="Net Profit" value={fmt$(netProfit)} color={netProfit >= 0 ? 'var(--success)' : 'var(--danger)'} sub={`${profitMargin}% margin`} />
        <KPICard icon={Package} label="Active Loads" value={activeLoads.length} color="var(--accent2)" onClick={() => onNavigate?.('loads')} />
        <KPICard icon={FileText} label="Unpaid" value={unpaidInvoices.length} color={unpaidInvoices.length > 0 ? 'var(--danger)' : 'var(--success)'} sub={unpaidInvoices.length > 0 ? fmt$(unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0)) : 'All clear'} onClick={() => onNavigate?.('money')} />
      </div>

      {/* ── Active Load Card ── */}
      {activeLoads.length > 0 && (
        <div style={{ animation: 'fadeInUp 0.3s ease 0.15s both' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, marginBottom: 8 }}>ACTIVE LOADS</div>
          {activeLoads.slice(0, 3).map((load, index) => {
            const isExpanded = expandedLoad === (load.id || load.load_id)
            return (
              <div key={load.id || load.load_id} style={{ marginBottom: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', animation: `fadeInUp 0.3s ease ${0.15 + index * 0.05}s both` }}>
                <div
                  onClick={() => { haptic(); setExpandedLoad(isExpanded ? null : (load.id || load.load_id)) }}
                  style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(240,165,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ic icon={Truck} size={16} color="var(--accent)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {load.origin || '?'} → {load.destination || load.dest || '?'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ color: statusColor(load.status), fontWeight: 700 }}>{load.status}</span>
                      <span>·</span>
                      <span>{fmt$(load.gross || load.rate)}</span>
                      {load.miles > 0 && <><span>·</span><span>{load.miles} mi</span></>}
                    </div>
                  </div>
                  <ChevronRight size={14} color="var(--muted)" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', transition: '0.2s' }} />
                </div>
                {isExpanded && (
                  <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border)' }}>
                    {[
                      ['Load ID', load.load_id || load.loadId || '—'],
                      ['Broker', load.broker_name || load.broker || '—'],
                      ['Rate', fmt$(load.gross || load.rate)],
                      ['RPM', load.miles > 0 ? `$${((load.gross || load.rate || 0) / load.miles).toFixed(2)}/mi` : '—'],
                      ['Equipment', load.equipment || load.equipment_type || '—'],
                      ['Pickup', load.pickup_date || '—'],
                      ['Delivery', load.delivery_date || '—'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11 }}>
                        <span style={{ color: 'var(--muted)' }}>{k}</span>
                        <span style={{ fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                    {/* Quick action for this load */}
                    <button onClick={(e) => { e.stopPropagation(); haptic(); onOpenQ?.(`What's the status on load ${load.load_id || load.id}?`) }}
                      style={{ width: '100%', marginTop: 8, padding: '8px', background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--accent)', fontFamily: "'DM Sans',sans-serif" }}>
                      Ask Q about this load
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Alerts ── */}
      {unpaidInvoices.length > 0 && (
        <div onClick={() => onNavigate?.('money')} style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', animation: 'fadeInUp 0.3s ease 0.2s both' }}>
          <Ic icon={AlertCircle} size={18} color="var(--danger)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>{unpaidInvoices.length} Unpaid Invoice{unpaidInvoices.length > 1 ? 's' : ''}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Total: {fmt$(unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0))}</div>
          </div>
          <ArrowUpRight size={14} color="var(--danger)" />
        </div>
      )}

      {/* ── Recent Activity ── */}
      {recentLoads.length > 0 && (
        <div style={{ animation: 'fadeInUp 0.3s ease 0.25s both' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, marginBottom: 8 }}>RECENT ACTIVITY</div>
          {recentLoads.map((load, index) => (
            <div key={load.id || load.load_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', animation: `fadeInUp 0.2s ease ${0.25 + index * 0.03}s both` }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(load.status), flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {load.origin || '?'} → {load.destination || load.dest || '?'}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)' }}>{load.status} · {fmt$(load.gross || load.rate)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ height: 80 }} />
    </div>
  )
}

function KPICard({ icon, label, value, color, sub, onClick }) {
  return (
    <div onClick={onClick} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px', cursor: onClick ? 'pointer' : 'default', transition: 'all 0.15s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Ic icon={icon} size={13} color={color} />
        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
