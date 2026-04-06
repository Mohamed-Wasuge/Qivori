import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { apiFetch } from '../../lib/api'
import { Users, CheckCircle, Shield, Zap, Package, DollarSign, Server, Bot, RefreshCw, Bell, Clock, AlertTriangle, X, Monitor, Brain } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const PRIORITY_COLORS = { critical: '#ef4444', high: '#f97316', medium: '#f0a500', low: '#22c55e' }
const CATEGORY_ICONS = { revenue: DollarSign, customer: Users, load_ops: Package, security: Shield, technical: Server, general: Bot }
const STATUS_BADGE = { pending: { bg: 'rgba(240,165,0,0.12)', color: '#f0a500', label: 'Pending' }, approved: { bg: 'rgba(34,197,94,0.12)', color: '#22c55e', label: 'Approved' }, rejected: { bg: 'rgba(239,68,68,0.12)', color: '#ef4444', label: 'Rejected' }, expired: { bg: 'rgba(107,117,144,0.12)', color: '#6b7590', label: 'Expired' } }

export function AutonomousAgentDashboard({ cardStyle, addLog }) {
  const { showToast } = useApp()
  const [runs, setRuns] = useState([])
  const [actions, setActions] = useState([])
  const [escalations, setEscalations] = useState([])
  const [decisions, setDecisions] = useState([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  const fetchData = useCallback(async () => {
    try {
      const [runsRes, actionsRes, escRes, decRes] = await Promise.all([
        supabase.from('agent_runs').select('*').order('started_at', { ascending: false }).limit(10),
        supabase.from('agent_actions').select('*').order('created_at', { ascending: false }).limit(50),
        supabase.from('agent_escalations').select('*').order('created_at', { ascending: false }).limit(20),
        supabase.from('agent_decisions').select('*').order('created_at', { ascending: false }).limit(50),
      ])
      setRuns(runsRes.data || [])
      setActions(actionsRes.data || [])
      setEscalations(escRes.data || [])
      setDecisions(decRes.data || [])
    } catch { /* tables may not exist yet */ }
    setLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const triggerRun = async () => {
    setTriggering(true)
    try {
      const res = await apiFetch('/api/agent-autonomous', { method: 'POST' })
      if (res.ok) {
        showToast('success', 'Agent Run Complete', `${res.decisions_count || 0} decisions, ${res.actions_count || 0} actions`)
        addLog?.('check', `Autonomous agent completed: ${res.actions_count || 0} actions taken`, 'system')
        fetchData()
      } else {
        showToast('error', 'Agent Run Failed', res.error || 'Unknown error')
      }
    } catch (e) {
      showToast('error', 'Agent Error', e.message)
    }
    setTriggering(false)
  }

  const handleEscalation = async (id, status) => {
    try {
      await supabase.from('agent_escalations').update({ status, resolved_at: new Date().toISOString() }).eq('id', id)
      showToast('success', status === 'approved' ? 'Approved' : 'Rejected', 'Escalation updated')
      fetchData()
    } catch { showToast('error', 'Error', 'Failed to update') }
  }

  const pendingEsc = escalations.filter(e => e.status === 'pending')
  const lastRun = runs[0]
  const totalActions24h = actions.filter(a => new Date(a.created_at) > Date.now() - 86400000).length
  const totalDecisions24h = decisions.filter(d => new Date(d.created_at) > Date.now() - 86400000).length

  const TABS = [
    { id: 'overview', label: 'Overview', icon: Monitor },
    { id: 'decisions', label: 'Decisions', icon: Brain || Bot },
    { id: 'actions', label: 'Actions', icon: Zap },
    { id: 'escalations', label: `Escalations${pendingEsc.length ? ` (${pendingEsc.length})` : ''}`, icon: Bell },
    { id: 'history', label: 'Run History', icon: Clock },
  ]

  return (
    <div style={{ marginTop: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, rgba(240,165,0,0.2), rgba(139,92,246,0.2))', border: '2px solid rgba(240,165,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ic icon={Bot} size={22} color="#f0a500" />
          </div>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2, lineHeight: 1 }}>
              AUTONOMOUS <span style={{ color: '#8b5cf6' }}>AI ENGINE</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              Claude-powered decision engine · Hourly analysis · Auto-actions
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={fetchData} style={{ height: 32, borderRadius: 8, padding: '0 12px', background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', fontSize: 10, fontWeight: 700, color: 'var(--muted)', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', gap: 4 }}>
            <Ic icon={RefreshCw} size={12} /> Refresh
          </button>
          <button onClick={triggerRun} disabled={triggering} style={{ height: 32, borderRadius: 8, padding: '0 14px', background: 'rgba(240,165,0,0.15)', border: '1px solid rgba(240,165,0,0.4)', cursor: triggering ? 'wait' : 'pointer', fontSize: 10, fontWeight: 700, color: '#f0a500', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', gap: 4 }}>
            <Ic icon={Zap} size={12} /> {triggering ? 'Running...' : 'Run Agent Now'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Decisions (24h)', value: totalDecisions24h, color: '#4d8ef0', icon: Bot },
          { label: 'Actions Taken (24h)', value: totalActions24h, color: '#22c55e', icon: Zap },
          { label: 'Pending Escalations', value: pendingEsc.length, color: pendingEsc.length > 0 ? '#ef4444' : '#6b7590', icon: Bell },
          { label: 'Last Run', value: lastRun ? new Date(lastRun.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—', color: '#f0a500', icon: Clock },
        ].map(k => (
          <div key={k.label} style={{ ...cardStyle, padding: '14px 16px', borderLeft: `3px solid ${k.color}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Ic icon={k.icon} size={14} color={k.color} />
              <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{k.label}</span>
            </div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: 'var(--surface2)', borderRadius: 10, padding: 3 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 0', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", background: activeTab === t.id ? 'var(--surface)' : 'transparent', color: activeTab === t.id ? 'var(--accent)' : 'var(--muted)', transition: 'all 0.15s' }}>
            <Ic icon={t.icon} size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div style={cardStyle}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading agent data...</div>
        ) : activeTab === 'overview' ? (
          /* ── Overview ── */
          <div>
            <div style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>Agent Status</div>
              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                {lastRun ? `Last run: ${new Date(lastRun.started_at).toLocaleString()} · ${lastRun.decisions_count || 0} decisions · ${lastRun.actions_count || 0} actions · ${lastRun.duration_ms || 0}ms` : 'No runs yet — click "Run Agent Now" to start'}
              </div>
              {lastRun?.summary && <div style={{ fontSize: 12, color: 'var(--text)', marginTop: 8, padding: 12, background: 'var(--surface2)', borderRadius: 8, lineHeight: 1.5 }}>{lastRun.summary}</div>}
            </div>
            {/* Recent actions feed */}
            <div style={{ padding: '12px 18px' }}>
              <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Recent Autonomous Actions</div>
              {actions.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>No actions yet. The agent will start taking actions after the first run.</div>
              ) : actions.slice(0, 10).map(a => (
                <div key={a.id} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)', alignItems: 'flex-start' }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.success ? '#22c55e' : '#ef4444', marginTop: 6, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{a.description}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{a.reasoning}</div>
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono',monospace" }}>
                    {new Date(a.created_at).toLocaleTimeString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

        ) : activeTab === 'decisions' ? (
          /* ── Decisions ── */
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {decisions.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No decisions recorded yet.</div>
            ) : decisions.map(d => {
              const CatIcon = CATEGORY_ICONS[d.category] || Bot
              return (
                <div key={d.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${PRIORITY_COLORS[d.priority]}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Ic icon={CatIcon} size={16} color={PRIORITY_COLORS[d.priority]} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{d.title}</span>
                      <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: `${PRIORITY_COLORS[d.priority]}18`, color: PRIORITY_COLORS[d.priority], textTransform: 'uppercase', letterSpacing: 0.5 }}>{d.priority}</span>
                      <span style={{ fontSize: 8, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--muted)' }}>{d.category}</span>
                      {d.confidence && <span style={{ fontSize: 9, color: 'var(--muted)' }}>{Math.round(d.confidence * 100)}% conf</span>}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>{d.analysis}</div>
                    {d.recommendation && <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4 }}>→ {d.recommendation}</div>}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(d.created_at).toLocaleString()}</div>
                </div>
              )
            })}
          </div>

        ) : activeTab === 'actions' ? (
          /* ── Actions ── */
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {actions.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No autonomous actions taken yet.</div>
            ) : actions.map(a => (
              <div key={a.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: a.success ? '#22c55e' : '#ef4444', marginTop: 6, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{a.description}</span>
                    <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--muted)', textTransform: 'uppercase' }}>{a.action_type?.replace(/_/g, ' ')}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4, marginTop: 2 }}>{a.reasoning}</div>
                  {a.target && <div style={{ fontSize: 10, color: 'var(--accent)', marginTop: 2 }}>Target: {a.target}</div>}
                  {a.result && <div style={{ fontSize: 10, color: a.success ? '#22c55e' : '#ef4444', marginTop: 2 }}>Result: {a.result}</div>}
                </div>
                <div style={{ fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{new Date(a.created_at).toLocaleString()}</div>
              </div>
            ))}
          </div>

        ) : activeTab === 'escalations' ? (
          /* ── Escalations ── */
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {escalations.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No escalations. The AI is handling everything autonomously.</div>
            ) : escalations.map(e => {
              const badge = STATUS_BADGE[e.status] || STATUS_BADGE.pending
              return (
                <div key={e.id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', background: e.status === 'pending' ? 'rgba(240,165,0,0.03)' : 'transparent' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: `${PRIORITY_COLORS[e.priority]}18`, color: PRIORITY_COLORS[e.priority], textTransform: 'uppercase' }}>{e.priority}</span>
                    <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>{e.title}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 5, background: badge.bg, color: badge.color }}>{badge.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 6 }}>{e.summary}</div>
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginBottom: 8 }}>Recommended: {e.recommended_action}</div>
                  {e.confidence && <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>Confidence: {Math.round(e.confidence * 100)}%</div>}
                  {e.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleEscalation(e.id, 'approved')} style={{ padding: '6px 16px', borderRadius: 6, background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#22c55e', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Ic icon={CheckCircle} size={12} /> Approve
                      </button>
                      <button onClick={() => handleEscalation(e.id, 'rejected')} style={{ padding: '6px 16px', borderRadius: 6, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Ic icon={X} size={12} /> Reject
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

        ) : (
          /* ── Run History ── */
          <div style={{ maxHeight: 500, overflowY: 'auto' }}>
            {runs.length === 0 ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No agent runs yet.</div>
            ) : runs.map(r => (
              <div key={r.id} style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: r.error ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ic icon={r.error ? AlertTriangle : CheckCircle} size={18} color={r.error ? '#ef4444' : '#22c55e'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{new Date(r.started_at).toLocaleString()}</span>
                    <span style={{ fontSize: 9, color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace" }}>{r.duration_ms || 0}ms</span>
                    <span style={{ fontSize: 8, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--muted)' }}>{r.trigger}</span>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {r.decisions_count || 0} decisions · {r.actions_count || 0} actions · {r.escalations_count || 0} escalations
                    {r.modules_run?.length > 0 && ` · Modules: ${r.modules_run.join(', ')}`}
                  </div>
                  {r.summary && <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 4 }}>{r.summary}</div>}
                  {r.error && <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>{r.error}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
