import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  Package, DollarSign, TrendingUp, Truck, ChevronRight,
  FileText, CheckCircle, ArrowUpRight, Send, MapPin,
  Camera, ScanLine, Zap, Activity
} from 'lucide-react'
import { Ic, haptic, fmt$, statusColor, QInsightCard, getQSystemState } from './shared'
import { apiFetch } from '../../lib/api'

// Dynamic Q status messages that cycle
const Q_STATUS_LINES = {
  online: ['Monitoring market', 'Analyzing lane rates', 'Scanning load boards', 'Ready to deploy'],
  tracking: ['Tracking active loads', 'Monitoring ETA', 'Route optimization running', 'Watching fuel prices'],
  monitoring: ['Monitoring dispatch', 'Evaluating new opportunities', 'Ready to negotiate', 'Watching market conditions'],
  ready: ['Ready to dispatch', 'Scanning available loads', 'Preparing recommendations', 'Market analysis active'],
  alert: ['Action required', 'Revenue at risk', 'Unpaid invoices detected', 'Immediate attention needed'],
}

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
  const fuelCostPerMile = ctx.fuelCostPerMile || 0
  const [expandedLoad, setExpandedLoad] = useState(null)
  const [qInput, setQInput] = useState('')
  const [qGreeting, setQGreeting] = useState('')
  const greetingSpokenRef = useRef(false)
  const pendingAudioRef = useRef(null)
  const [statusIdx, setStatusIdx] = useState(0)

  const netProfit = totalRevenue - totalExpenses
  const profitMargin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0
  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]

  // Recent activity — last 5 loads sorted by date
  const recentLoads = [...loads].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).slice(0, 5)

  const qState = getQSystemState(ctx)

  // Cycle through dynamic status messages
  const statusLines = Q_STATUS_LINES[qState.state] || Q_STATUS_LINES.online
  useEffect(() => {
    const interval = setInterval(() => {
      setStatusIdx(i => (i + 1) % statusLines.length)
    }, 4000)
    return () => clearInterval(interval)
  }, [statusLines.length])

  // Dynamic subtext based on load state
  const qSubtext = useMemo(() => {
    const inTransit = activeLoads.filter(l => {
      const s = (l.status || '').toLowerCase()
      return s.includes('transit') || s.includes('loaded')
    })
    if (inTransit.length > 0) return `${inTransit.length} load${inTransit.length > 1 ? 's' : ''} in transit`
    if (activeLoads.length > 0) return `${activeLoads.length} active load${activeLoads.length > 1 ? 's' : ''} detected`
    return 'No active load detected'
  }, [activeLoads])

  // Q proactive insight — intelligence-driven with estimated improvement
  const qInsight = useMemo(() => {
    const margin = profitMargin
    const avgRPM = activeLoads.length > 0
      ? activeLoads.reduce((s, l) => s + ((l.gross || l.rate || 0) / Math.max(l.miles || 1, 1)), 0) / activeLoads.length
      : 0

    if (unpaidInvoices.length >= 3) {
      const total = unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0)
      return {
        title: 'Q INSIGHT',
        text: `${unpaidInvoices.length} invoices outstanding totaling ${fmt$(total)}. Factor oldest invoices for same-day cash to improve working capital.`,
        sub: `Estimated cash acceleration: +${fmt$(Math.round(total * 0.97))} within 24hrs`,
        accent: 'var(--danger)',
      }
    }
    if (activeLoads.length === 0 && loads.length > 0) {
      return {
        title: 'Q INSIGHT',
        text: 'No active loads on board. Market conditions are favorable for booking. Q is ready to find your next profitable lane.',
        sub: 'Recommended action: Activate Q to begin',
        accent: 'var(--accent)',
      }
    }
    if (margin > 0 && margin < 18) {
      const gap = 18 - margin
      return {
        title: 'Q INSIGHT',
        text: `Operating margin at ${margin.toFixed(0)}% — below 18% target. ${fuelCostPerMile > 0 ? `Current fuel cost: $${fuelCostPerMile.toFixed(2)}/mi.` : ''} Negotiate higher rates or reduce deadhead miles.`,
        sub: `Estimated profit increase if target reached: +${fmt$(Math.round(totalRevenue * gap / 100))}/mo`,
        accent: '#f59e0b',
      }
    }
    if (margin >= 30) {
      return {
        title: 'Q INSIGHT',
        text: `Strong performance — ${margin.toFixed(0)}% margin with ${activeLoads.length} load${activeLoads.length !== 1 ? 's' : ''} active. ${avgRPM > 0 ? `Averaging $${avgRPM.toFixed(2)}/mi.` : ''} Q recommends maintaining current lane strategy.`,
        sub: null,
        accent: 'var(--success)',
      }
    }
    if (activeLoads.length > 0) {
      return {
        title: 'Q INSIGHT',
        text: `${activeLoads.length} load${activeLoads.length !== 1 ? 's' : ''} being tracked. Revenue MTD: ${fmt$(totalRevenue)}.${avgRPM > 0 ? ` Current avg: $${avgRPM.toFixed(2)}/mi.` : ''} Q is monitoring for optimization opportunities.`,
        sub: margin > 0 ? `Current margin: ${margin.toFixed(0)}%` : null,
        accent: 'var(--accent)',
      }
    }
    return {
      title: 'Q INSIGHT',
      text: 'Q is monitoring the market and ready to find profitable loads. Activate Q to begin dispatch intelligence.',
      sub: 'Recommended action: Activate Q',
      accent: 'var(--accent)',
    }
  }, [activeLoads, loads, unpaidInvoices, profitMargin, totalRevenue, fuelCostPerMile])

  // ── Q speaks on app open ──────────────────────────
  const buildGreetingContext = useCallback(() => {
    const active = loads.filter(l => !['Delivered', 'Invoiced', 'Paid'].includes(l.status))
    const unpaid = invoices.filter(i => i.status !== 'Paid')
    return [
      `DRIVER: ${profile?.full_name || user?.user_metadata?.full_name || 'Driver'}`,
      `Revenue MTD: $${totalRevenue.toLocaleString()} | Net: $${(totalRevenue - totalExpenses).toLocaleString()}`,
      `Active loads (${active.length}): ${active.map(l => `${l.origin}→${l.destination || l.dest} $${l.rate || 0} [${l.status}]`).join(' | ') || 'none'}`,
      `Unpaid invoices: ${unpaid.length}`,
    ].join('\n')
  }, [loads, invoices, totalRevenue, totalExpenses, profile, user])

  useEffect(() => {
    if (greetingSpokenRef.current) return
    if (ctx.dataReady === false) return

    const sessionKey = 'qivori_q_spoken'
    if (sessionStorage.getItem(sessionKey)) return

    greetingSpokenRef.current = true
    sessionStorage.setItem(sessionKey, '1')

    const hour = new Date().getHours()
    const timeGreeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'

    const doGreeting = async () => {
      try {
        const res = await apiFetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: `[SYSTEM: You are Q, an intelligent dispatch system. Generate a brief operational status update for the driver opening their app. ${timeGreeting}. Reference their data — active loads, revenue, unpaid invoices. Use system language (not friendly assistant language). Example tone: "System online. 2 loads active, $12K MTD revenue. Unpaid invoice needs attention." Keep it under 25 words — this will be spoken out loud.]`,
            }],
            context: buildGreetingContext(),
          }),
        })

        if (!res.ok) return
        const data = await res.json()
        const reply = (data.reply || '').replace(/```action[\s\S]*?```/g, '').replace(/\*\*/g, '').trim()
        if (!reply) return

        setQGreeting(reply)

        const ttsRes = await apiFetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: reply }),
        })

        if (ttsRes.ok && ttsRes.status !== 204) {
          const blob = await ttsRes.blob()
          const url = URL.createObjectURL(blob)
          const audio = new Audio(url)
          audio.onended = () => URL.revokeObjectURL(url)
          audio.onerror = () => URL.revokeObjectURL(url)
          try {
            await audio.play()
          } catch {
            pendingAudioRef.current = { url, audio }
            const playOnTap = () => {
              if (pendingAudioRef.current) {
                pendingAudioRef.current.audio.play().catch(() => {})
                pendingAudioRef.current = null
              }
              document.removeEventListener('touchstart', playOnTap)
              document.removeEventListener('click', playOnTap)
            }
            document.addEventListener('touchstart', playOnTap, { once: true })
            document.addEventListener('click', playOnTap, { once: true })
          }
        }
      } catch {
        // Silent fail — greeting is a nice-to-have
      }
    }

    doGreeting()
  }, [ctx.dataReady, buildGreetingContext])

  // Q-routed quick actions
  const getSmartActions = () => {
    const actions = []
    const hasActiveLoad = activeLoads.length > 0
    const currentLoad = activeLoads[0]
    const status = (currentLoad?.status || '').toLowerCase()

    if (hasActiveLoad && (status.includes('transit') || status.includes('loaded'))) {
      actions.push({ icon: CheckCircle, label: 'Mark Delivered', color: 'var(--success)', action: () => onOpenQ?.('Mark my current load as delivered', qGreeting, false) })
      actions.push({ icon: MapPin, label: 'Check Call', color: 'var(--accent2)', action: () => onOpenQ?.('Submit a check call for my current load', qGreeting, false) })
    } else if (hasActiveLoad && (status.includes('booked') || status.includes('dispatched'))) {
      actions.push({ icon: Truck, label: 'Start Trip', color: 'var(--accent)', action: () => onOpenQ?.('Update my load to In Transit', qGreeting, false) })
    }

    if (!hasActiveLoad) {
      actions.push({ icon: Package, label: 'Ask Q for Load', color: 'var(--accent)', action: () => onOpenQ?.('Find me a good paying load', qGreeting, false) })
    }

    actions.push({ icon: ScanLine, label: 'Scan Rate Con', color: 'var(--accent2)', action: () => onNavigate?.('loads') })
    actions.push({ icon: Camera, label: 'Upload Receipt', color: '#8b5cf6', action: () => onNavigate?.('money', 'expenses') })

    return actions.slice(0, 3)
  }

  const smartActions = getSmartActions()

  const handleQSubmit = () => {
    if (!qInput.trim()) return
    haptic()
    onOpenQ?.(qInput.trim(), qGreeting)
    setQInput('')
  }

  // Margin target
  const marginTarget = 18
  const marginReached = profitMargin >= marginTarget

  return (
    <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: '16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── 1. HEADER / TOP STATE — Q Online ── */}
      <div style={{ animation: 'fadeInUp 0.4s ease' }}>
        {/* Q Online header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%', background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'qGlow 3s ease-in-out infinite', flexShrink: 0,
          }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5, color: 'var(--text)' }}>Q ONLINE</span>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: qState.color, animation: 'qStatusPulse 2s ease-in-out infinite' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: 4 }}>
              <span key={statusIdx} style={{ animation: 'fadeInUp 0.4s ease', display: 'inline-block' }}>
                {statusLines[statusIdx]}
              </span>
              <span style={{ color: 'var(--border)' }}>•</span>
              <span>Ready to deploy</span>
            </div>
          </div>
        </div>

        {/* Dynamic subtext */}
        <div style={{
          fontSize: 11, color: qState.state === 'alert' ? 'var(--danger)' : 'var(--muted)',
          fontWeight: 600, marginLeft: 48, marginBottom: 4,
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
          <div style={{ width: 4, height: 4, borderRadius: '50%', background: qState.color, flexShrink: 0 }} />
          {qSubtext}
        </div>

        {/* Q system briefing — replaces old greeting bubble */}
        {qGreeting && (
          <div style={{
            fontSize: 12, color: 'var(--text)', marginTop: 8, padding: '12px 14px',
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: '4px 14px 14px 14px', borderLeft: '3px solid var(--accent)',
            lineHeight: 1.5, animation: 'qInsightSlide 0.4s ease',
          }}>
            <div style={{ fontSize: 8, fontWeight: 700, letterSpacing: 1.5, color: 'var(--accent)', marginBottom: 6 }}>Q BRIEFING</div>
            <span style={{ opacity: 0.9 }}>{qGreeting}</span>
          </div>
        )}
      </div>

      {/* ── 2. Q INSIGHT CARD ── */}
      <QInsightCard
        title={qInsight.title}
        insight={qInsight.text}
        subtext={qInsight.sub}
        accent={qInsight.accent}
      />

      {/* ── 3. MAIN CTA — Activate Q ── */}
      <div style={{ animation: 'fadeInUp 0.4s ease 0.05s both' }}>
        <button onClick={() => onOpenQ?.(null, qGreeting, true)}
          style={{
            width: '100%', padding: '18px 20px',
            background: 'linear-gradient(135deg, var(--accent) 0%, #e6960a 100%)',
            border: 'none', borderRadius: 16, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 14,
            boxShadow: '0 4px 24px rgba(240,165,0,0.3)',
            transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,0,0,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            animation: 'qBreath 3s ease-in-out infinite',
          }}>
            <Ic icon={Zap} size={22} color="#000" />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: 17, fontWeight: 800, color: '#000', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5 }}>ACTIVATE Q</div>
            <div style={{ fontSize: 11, color: 'rgba(0,0,0,0.6)', fontWeight: 500 }}>Voice control • Live intelligence</div>
          </div>
          <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            {[0, 1, 2, 3].map(i => (
              <div key={i} style={{ width: 3, borderRadius: 2, background: 'rgba(0,0,0,0.25)', animation: `voiceWave 0.6s ease-in-out ${i * 0.12}s infinite alternate` }} />
            ))}
          </div>
        </button>

        {/* Dynamic system status below CTA */}
        <div style={{
          textAlign: 'center', marginTop: 8, fontSize: 10, color: 'var(--muted)',
          fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: qState.color, animation: 'qStatusPulse 2s ease-in-out infinite' }} />
          <span key={statusIdx + 'cta'} style={{ animation: 'fadeInUp 0.3s ease' }}>
            Q is {statusLines[statusIdx].toLowerCase()}
          </span>
        </div>

        {/* Text input — secondary */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, marginTop: 10,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 28, padding: '6px 6px 6px 16px',
        }}>
          <input
            value={qInput}
            onChange={e => setQInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleQSubmit()}
            placeholder="Command Q..."
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              color: 'var(--text)', fontSize: 14, fontFamily: "'DM Sans',sans-serif",
            }}
          />
          {qInput.trim() && (
            <button onClick={handleQSubmit}
              style={{ width: 38, height: 38, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic icon={Send} size={16} color="#000" />
            </button>
          )}
        </div>
      </div>

      {/* ── 5. QUICK ACTIONS — Q-routed ── */}
      <div style={{ display: 'flex', gap: 8, animation: 'fadeInUp 0.4s ease 0.1s both' }}>
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

      {/* ── 4. METRICS — Q-driven ── */}
      <div style={{ animation: 'fadeInUp 0.4s ease 0.15s both' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <QMetricCard icon={DollarSign} label="Q Revenue" value={fmt$(totalRevenue)} color="var(--accent)" />
          <QMetricCard
            icon={TrendingUp} label="Q Profit" value={fmt$(netProfit)}
            color={netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}
            sub={`${profitMargin.toFixed(0)}% margin`}
            target={`Target: ${marginTarget}%`}
            targetReached={marginReached}
          />
          <QMetricCard icon={Package} label="Active Loads" value={activeLoads.length} color="var(--accent2)" onClick={() => onNavigate?.('loads')} />
          <QMetricCard
            icon={FileText} label="Unpaid" value={unpaidInvoices.length}
            color={unpaidInvoices.length > 0 ? 'var(--danger)' : 'var(--success)'}
            sub={unpaidInvoices.length > 0 ? fmt$(unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0)) : 'All clear'}
            onClick={() => onNavigate?.('money')}
          />
        </div>
      </div>

      {/* ── Active Loads — Q Tracked ── */}
      {activeLoads.length > 0 && (
        <div style={{ animation: 'fadeInUp 0.4s ease 0.2s both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'qStatusPulse 2s ease-in-out infinite' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2 }}>Q TRACKED LOADS</span>
          </div>
          {activeLoads.slice(0, 3).map((load, index) => {
            const isExpanded = expandedLoad === (load.id || load.load_id)
            return (
              <div key={load.id || load.load_id} style={{ marginBottom: 8, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', animation: `qInsightSlide 0.4s ease ${0.2 + index * 0.06}s both` }}>
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
                  <div style={{ padding: '0 14px 12px', borderTop: '1px solid var(--border)', animation: 'fadeInUp 0.2s ease' }}>
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
                    <button onClick={(e) => { e.stopPropagation(); haptic(); onOpenQ?.(`Give me a status update on load ${load.load_id || load.id}`, qGreeting) }}
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

      {/* ── Q Proactive Alerts ── */}
      {unpaidInvoices.length > 0 && (
        <div onClick={() => onNavigate?.('money')} style={{
          padding: '12px 14px', background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.15)', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
          animation: 'fadeInUp 0.4s ease 0.25s both, qAlertGlow 3s ease-in-out infinite',
        }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 13, color: 'var(--danger)', fontWeight: 800, lineHeight: 1 }}>Q</span>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--danger)', letterSpacing: 1, marginBottom: 2 }}>Q ALERT</div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
              {unpaidInvoices.length} unpaid invoice{unpaidInvoices.length > 1 ? 's' : ''} — {fmt$(unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0))} outstanding
            </div>
          </div>
          <ArrowUpRight size={14} color="var(--danger)" />
        </div>
      )}

      {/* ── Recent Activity ── */}
      {recentLoads.length > 0 && (
        <div style={{ animation: 'fadeInUp 0.4s ease 0.3s both' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Ic icon={Activity} size={10} color="var(--accent)" />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2 }}>Q ACTIVITY LOG</span>
          </div>
          {recentLoads.map((load, index) => (
            <div key={load.id || load.load_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', animation: `fadeInUp 0.3s ease ${0.3 + index * 0.03}s both` }}>
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

// Q-driven metric card with optional target tracking
function QMetricCard({ icon, label, value, color, sub, target, targetReached, onClick }) {
  return (
    <div onClick={onClick} style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
      padding: '14px', cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.15s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Ic icon={icon} size={13} color={color} />
        <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      {target && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 4 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: targetReached ? 'var(--success)' : 'var(--danger)' }} />
          <span style={{ fontSize: 9, color: targetReached ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
            {target} · {targetReached ? 'Reached' : 'Not reached'}
          </span>
        </div>
      )}
    </div>
  )
}
