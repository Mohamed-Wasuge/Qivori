import { useState } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  Package, DollarSign, TrendingUp, Truck, ChevronRight, AlertCircle,
  FileText, Clock, CheckCircle, ArrowUpRight
} from 'lucide-react'
import { Ic, haptic, fmt$, statusColor } from './shared'

export default function MobileHomeTab({ onNavigate }) {
  const ctx = useCarrier() || {}
  const { user, profile } = useApp()
  const loads = ctx.loads || []
  const activeLoads = ctx.activeLoads || []
  const invoices = ctx.invoices || []
  const expenses = ctx.expenses || []
  const totalRevenue = ctx.totalRevenue || 0
  const totalExpenses = ctx.totalExpenses || 0
  const unpaidInvoices = ctx.unpaidInvoices || []
  const deliveredLoads = ctx.deliveredLoads || []
  const [expandedLoad, setExpandedLoad] = useState(null)

  const netProfit = totalRevenue - totalExpenses
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(0) : 0
  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]

  // Recent activity — last 5 loads sorted by date
  const recentLoads = [...loads].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5)

  return (
    <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px', display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Greeting */}
      <div style={{ animation: 'fadeInUp 0.3s ease' }}>
        <div style={{ fontSize: 20, fontWeight: 700 }}>Hey, {firstName}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
          {activeLoads.length > 0 ? `${activeLoads.length} active load${activeLoads.length > 1 ? 's' : ''} right now` : 'No active loads — time to find one'}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <KPICard icon={DollarSign} label="Revenue MTD" value={fmt$(totalRevenue)} color="var(--accent)" delay={0} />
        <KPICard icon={TrendingUp} label="Net Profit" value={fmt$(netProfit)} color={netProfit >= 0 ? 'var(--success)' : 'var(--danger)'} sub={`${profitMargin}% margin`} delay={0.05} />
        <KPICard icon={Package} label="Active Loads" value={activeLoads.length} color="var(--accent2)" onClick={() => onNavigate?.('loads')} delay={0.1} />
        <KPICard icon={FileText} label="Unpaid Invoices" value={unpaidInvoices.length} color={unpaidInvoices.length > 0 ? 'var(--danger)' : 'var(--success)'} sub={unpaidInvoices.length > 0 ? fmt$(unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0)) : 'All clear'} onClick={() => onNavigate?.('money')} delay={0.15} />
      </div>

      {/* Active Load Card — expandable */}
      {activeLoads.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, marginBottom: 8, animation: 'fadeInUp 0.2s ease' }}>ACTIVE LOADS</div>
          {activeLoads.slice(0, 3).map((load, index) => {
            const isExpanded = expandedLoad === (load.id || load.load_id)
            return (
              <div key={load.id || load.load_id} style={{ marginBottom: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', animation: `fadeInUp 0.3s ease ${index * 0.05}s both` }}>
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
                  <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border)', transition: 'all 0.2s ease' }}>
                    {[
                      ['Load ID', load.load_id || load.loadId || '—'],
                      ['Broker', load.broker_name || load.broker || '—'],
                      ['Rate', fmt$(load.gross || load.rate)],
                      ['RPM', load.miles > 0 ? `$${((load.gross || load.rate || 0) / load.miles).toFixed(2)}/mi` : '—'],
                      ['Equipment', load.equipment || load.equipment_type || '—'],
                      ['Pickup', load.pickup_date || '—'],
                      ['Delivery', load.delivery_date || '—'],
                      ['Weight', load.weight ? `${load.weight} lbs` : '—'],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', fontSize: 11 }}>
                        <span style={{ color: 'var(--muted)' }}>{k}</span>
                        <span style={{ fontWeight: 600 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, marginBottom: 8, animation: 'fadeInUp 0.2s ease' }}>QUICK ACTIONS</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          <QuickAction icon={Package} label="Find Loads" onClick={() => onNavigate?.('loads')} index={0} />
          <QuickAction icon={DollarSign} label="Invoices" onClick={() => onNavigate?.('money')} color="var(--success)" index={1} />
          <QuickAction icon={FileText} label="IFTA" onClick={() => onNavigate?.('ifta')} color="#8b5cf6" index={2} />
          <QuickAction icon={Truck} label="Add Expense" onClick={() => onNavigate?.('money', 'expenses')} color="var(--accent)" index={3} />
          <QuickAction icon={Clock} label="Ask Q" onClick={() => onNavigate?.('chat')} color="var(--accent2)" index={4} />
          <QuickAction icon={AlertCircle} label="HOS Check" onClick={() => onNavigate?.('chat', 'How many driving hours do I have left?')} color="var(--danger)" index={5} />
        </div>
      </div>

      {/* Alerts */}
      {unpaidInvoices.length > 0 && (
        <div onClick={() => onNavigate?.('money')} style={{ padding: '12px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
          <Ic icon={AlertCircle} size={18} color="var(--danger)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>{unpaidInvoices.length} Unpaid Invoice{unpaidInvoices.length > 1 ? 's' : ''}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Total: {fmt$(unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0))}</div>
          </div>
          <ArrowUpRight size={14} color="var(--danger)" />
        </div>
      )}

      {/* Recent Activity */}
      {recentLoads.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, marginBottom: 8, animation: 'fadeInUp 0.2s ease' }}>RECENT ACTIVITY</div>
          {recentLoads.map((load, index) => (
            <div key={load.id || load.load_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', animation: `fadeInUp 0.2s ease ${index * 0.03}s both` }}>
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

      <div style={{ height: 20 }} />
    </div>
  )
}

function KPICard({ icon, label, value, color, sub, onClick, delay }) {
  return (
    <div onClick={onClick} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px', cursor: onClick ? 'pointer' : 'default', animation: `fadeInUp 0.3s ease ${delay || 0}s both`, transition: 'all 0.15s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Ic icon={icon} size={13} color={color} />
        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function QuickAction({ icon, label, onClick, color = 'var(--accent)', index = 0 }) {
  return (
    <button onClick={() => { haptic(); onClick?.() }} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 8px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, fontFamily: "'DM Sans',sans-serif", animation: `fadeInUp 0.25s ease ${index * 0.04}s both` }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Ic icon={icon} size={16} color={color} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)' }}>{label}</span>
    </button>
  )
}
