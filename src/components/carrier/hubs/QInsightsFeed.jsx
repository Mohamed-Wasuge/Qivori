import React, { useState, useCallback, useEffect } from 'react'
import {
  DollarSign, AlertTriangle, Truck, Clock,
  Shield, User, BarChart2, Zap,
} from 'lucide-react'
import { apiFetch } from '../../../lib/api'
import { Ic } from '../shared'

export function QInsightsFeed({ hub, summary, onNavigate }) {
  const [insights, setInsights] = useState([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(null)
  const [dismissed, setDismissed] = useState(new Set())

  const fetchInsights = useCallback(async () => {
    if (!summary || loaded) return
    setLoading(true)
    setError(null)
    try {
      const res = await apiFetch('/api/q-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hub, summary }),
      })
      if (res.insights && res.insights.length > 0) {
        setInsights(res.insights)
      }
    } catch (e) {
      setError('Q is thinking...')
    } finally {
      setLoading(false)
      setLoaded(true)
    }
  }, [hub, summary, loaded])

  useEffect(() => { fetchInsights() }, [fetchInsights])

  const iconMap = {
    dollar: DollarSign, alert: AlertTriangle, truck: Truck, clock: Clock,
    shield: Shield, user: User, chart: BarChart2, zap: Zap,
  }
  const priorityColors = {
    critical: { bg: 'rgba(239,68,68,0.06)', border: 'rgba(239,68,68,0.2)', accent: '#ef4444', glow: 'rgba(239,68,68,0.08)' },
    high: { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.2)', accent: '#f59e0b', glow: 'rgba(245,158,11,0.08)' },
    medium: { bg: 'rgba(59,130,246,0.06)', border: 'rgba(59,130,246,0.2)', accent: '#3b82f6', glow: 'rgba(59,130,246,0.08)' },
    low: { bg: 'rgba(107,114,128,0.04)', border: 'var(--border)', accent: 'var(--muted)', glow: 'transparent' },
  }

  const visible = insights.filter(i => !dismissed.has(i.id))
  if (!loading && visible.length === 0 && !error) return null

  return (
    <div style={{ background: 'linear-gradient(135deg, rgba(240,165,0,0.03) 0%, rgba(240,165,0,0.01) 100%)', border: '1px solid rgba(240,165,0,0.12)', borderRadius: 14, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: visible.length > 0 || loading ? '1px solid rgba(240,165,0,0.08)' : 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ic icon={Zap} size={14} color="var(--accent)" />
          </div>
          <div>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)', fontFamily: "'DM Sans',sans-serif", letterSpacing: 0.5 }}>Q Intelligence</span>
            <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 8 }}>AI-powered insights</span>
          </div>
        </div>
        {loaded && !loading && (
          <button onClick={() => { setLoaded(false); setInsights([]); setDismissed(new Set()) }} style={{ fontSize: 10, color: 'var(--accent)', background: 'none', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontWeight: 600 }}>
            Refresh
          </button>
        )}
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ padding: '20px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 16, height: 16, border: '2px solid var(--accent)', borderTopColor: 'transparent', borderRadius: '50%', animation: 'qspin 0.8s linear infinite' }} />
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>Q is analyzing your operation...</span>
          <style>{`@keyframes qspin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      {/* Insights */}
      {visible.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {visible.map((insight, idx) => {
            const colors = priorityColors[insight.priority] || priorityColors.medium
            const InsightIcon = iconMap[insight.icon] || Zap
            return (
              <div key={insight.id || idx} style={{
                padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start',
                borderBottom: idx < visible.length - 1 ? '1px solid rgba(240,165,0,0.06)' : 'none',
                background: colors.bg, transition: 'background 0.15s',
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                  background: colors.glow, border: `1px solid ${colors.border}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <InsightIcon size={15} color={colors.accent} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: "'DM Sans',sans-serif" }}>{insight.title}</span>
                    {insight.priority === 'critical' && (
                      <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 6px', borderRadius: 4, background: 'rgba(239,68,68,0.15)', color: '#fca5a5', textTransform: 'uppercase', letterSpacing: 0.5 }}>Urgent</span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 10 }}>{insight.body}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                      onClick={() => onNavigate && onNavigate(insight.action_target, insight.action_type, insight)}
                      style={{
                        padding: '5px 14px', borderRadius: 8, fontSize: 11, fontWeight: 700,
                        background: colors.accent, color: '#fff', border: 'none', cursor: 'pointer',
                        fontFamily: "'DM Sans',sans-serif", transition: 'opacity 0.15s',
                      }}
                    >
                      {insight.action_label || 'View'}
                    </button>
                    <button
                      onClick={() => setDismissed(prev => new Set([...prev, insight.id]))}
                      style={{ padding: '5px 10px', borderRadius: 8, fontSize: 10, fontWeight: 500, background: 'none', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }}
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
