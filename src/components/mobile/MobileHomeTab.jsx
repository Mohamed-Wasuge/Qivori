import { useState, useMemo } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  Package, DollarSign, TrendingUp, Truck, ChevronRight, AlertCircle,
  FileText, CheckCircle, ArrowUpRight, Send, MapPin,
  Camera, ScanLine, ArrowRight
} from 'lucide-react'
import { Ic, haptic, fmt$, statusColor } from './shared'

// Generate Q's contextual greeting based on driver's real situation
function buildQGreeting(firstName, activeLoads, unpaidInvoices, totalRevenue, totalExpenses, loads) {
  const hour = new Date().getHours()
  const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const currentLoad = activeLoads[0]
  const status = (currentLoad?.status || '').toLowerCase()

  // Priority 1: In transit — Q focuses on the active haul
  if (currentLoad && (status.includes('transit') || status.includes('loaded'))) {
    const dest = currentLoad.destination || currentLoad.dest || '?'
    const miles = currentLoad.miles ? `${currentLoad.miles} mi` : ''
    return {
      greeting: `${timeGreeting}, ${firstName}.`,
      message: `You're hauling to **${dest}**${miles ? ` — ${miles} to go` : ''}. Need to submit a check call, mark delivered, or find your next load?`,
      actions: [
        { label: 'Mark Delivered', icon: CheckCircle, color: 'var(--success)', msg: 'Mark my current load as delivered' },
        { label: 'Check Call', icon: MapPin, color: 'var(--accent2)', msg: 'Submit a check call for my current load' },
        { label: 'Find Next Load', icon: Package, color: 'var(--accent)', msg: `Find me loads from ${dest}` },
      ],
    }
  }

  // Priority 2: Booked/dispatched — driver needs to get moving
  if (currentLoad && (status.includes('booked') || status.includes('dispatched'))) {
    return {
      greeting: `${timeGreeting}, ${firstName}.`,
      message: `You've got a load booked: **${currentLoad.origin} → ${currentLoad.destination || currentLoad.dest}** for ${fmt$(currentLoad.gross || currentLoad.rate)}. Ready to hit the road?`,
      actions: [
        { label: 'Start Trip', icon: Truck, color: 'var(--accent)', msg: 'Update my load to In Transit' },
        { label: 'Load Details', icon: FileText, color: 'var(--accent2)', msg: `Tell me about my current load ${currentLoad.load_id || ''}` },
        { label: 'Navigate to Pickup', icon: ArrowRight, color: 'var(--success)', msg: 'Navigate me to my pickup location' },
      ],
    }
  }

  // Priority 3: Delivered but unpaid invoices — get paid
  if (unpaidInvoices.length > 0 && activeLoads.length === 0) {
    const total = unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0)
    return {
      greeting: `${timeGreeting}, ${firstName}.`,
      message: `You have **${unpaidInvoices.length} unpaid invoice${unpaidInvoices.length > 1 ? 's' : ''}** totaling **${fmt$(total)}**. Want me to send them out or find your next load?`,
      actions: [
        { label: 'Send Invoices', icon: DollarSign, color: 'var(--success)', nav: 'money' },
        { label: 'Find a Load', icon: Package, color: 'var(--accent)', msg: 'Find me the best available loads right now' },
        { label: 'Snap Rate Con', icon: ScanLine, color: 'var(--accent2)', nav: 'loads' },
      ],
    }
  }

  // Priority 4: No active loads — time to hustle
  if (activeLoads.length === 0) {
    const netProfit = totalRevenue - totalExpenses
    const profitNote = totalRevenue > 0 ? ` You're at **${fmt$(netProfit)}** net profit this month.` : ''
    return {
      greeting: `${timeGreeting}, ${firstName}.`,
      message: `No active loads right now.${profitNote} Ready to find your next one?`,
      actions: [
        { label: 'Find a Load', icon: Package, color: 'var(--accent)', msg: 'Find me a good paying load' },
        { label: 'Snap Rate Con', icon: ScanLine, color: 'var(--accent2)', nav: 'loads' },
        { label: 'Log Expense', icon: Camera, color: '#8b5cf6', nav: 'money', navExtra: 'expenses' },
      ],
    }
  }

  // Fallback: multiple active loads
  return {
    greeting: `${timeGreeting}, ${firstName}.`,
    message: `You have **${activeLoads.length} active loads** rolling. What do you need help with?`,
    actions: [
      { label: 'Check Loads', icon: Package, color: 'var(--accent)', nav: 'loads' },
      { label: 'Check Call', icon: MapPin, color: 'var(--accent2)', msg: 'Submit a check call for my current load' },
      { label: 'Find Next Load', icon: Truck, color: 'var(--success)', msg: 'Find me the best available loads' },
    ],
  }
}

export default function MobileHomeTab({ onNavigate, onOpenQ }) {
  const ctx = useCarrier() || {}
  const { user, profile } = useApp()
  const loads = ctx.loads || []
  const activeLoads = ctx.activeLoads || []
  const invoices = ctx.invoices || []
  const totalRevenue = ctx.totalRevenue || 0
  const totalExpenses = ctx.totalExpenses || 0
  const unpaidInvoices = ctx.unpaidInvoices || []
  const [expandedLoad, setExpandedLoad] = useState(null)
  const [qInput, setQInput] = useState('')

  const netProfit = totalRevenue - totalExpenses
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(0) : 0
  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]

  const recentLoads = [...loads].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5)

  // Q's contextual greeting — recalculates when data changes
  const qBrief = useMemo(() =>
    buildQGreeting(firstName, activeLoads, unpaidInvoices, totalRevenue, totalExpenses, loads),
    [firstName, activeLoads, unpaidInvoices, totalRevenue, totalExpenses, loads]
  )

  const handleQSubmit = () => {
    if (!qInput.trim()) return
    haptic()
    onOpenQ?.(qInput.trim())
    setQInput('')
  }

  const handleAction = (action) => {
    haptic()
    if (action.msg) onOpenQ?.(action.msg)
    else if (action.nav) onNavigate?.(action.nav, action.navExtra)
  }

  // Simple bold markdown for Q's greeting
  const renderBold = (text) => {
    const parts = text.split(/(\*\*[^*]+\*\*)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ color: 'var(--accent)', fontWeight: 700 }}>{part.slice(2, -2)}</strong>
      }
      return part
    })
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── Q's Proactive Greeting ── */}
      <div style={{ animation: 'fadeInUp 0.3s ease' }}>
        {/* Q avatar + greeting */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 0 20px rgba(240,165,0,0.15)' }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginBottom: 4, letterSpacing: 0.5 }}>Q</div>
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: '2px 14px 14px 14px', padding: '12px 14px',
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>{qBrief.greeting}</div>
              <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5, opacity: 0.85 }}>
                {renderBold(qBrief.message)}
              </div>
            </div>
          </div>
        </div>

        {/* Q's suggested actions — pill buttons */}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, paddingLeft: 46, flexWrap: 'wrap' }}>
          {qBrief.actions.map((action, i) => (
            <button key={i} onClick={() => handleAction(action)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '8px 14px', background: 'var(--surface)',
                border: '1px solid var(--border)', borderRadius: 20,
                cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                transition: 'all 0.15s ease',
                animation: `fadeInUp 0.25s ease ${0.1 + i * 0.05}s both`,
              }}>
              <Ic icon={action.icon} size={13} color={action.color} />
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{action.label}</span>
            </button>
          ))}
        </div>

        {/* Reply to Q — input bar */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, paddingLeft: 46,
        }}>
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 24, padding: '4px 4px 4px 14px',
          }}>
            <input
              value={qInput}
              onChange={e => setQInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleQSubmit()}
              placeholder="Reply to Q..."
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif",
              }}
            />
            <button onClick={qInput.trim() ? handleQSubmit : () => onOpenQ?.()}
              style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic icon={Send} size={14} color="#000" />
            </button>
          </div>
        </div>
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
                    <button onClick={(e) => { e.stopPropagation(); haptic(); onOpenQ?.(`Tell me about load ${load.load_id || load.id}`) }}
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
