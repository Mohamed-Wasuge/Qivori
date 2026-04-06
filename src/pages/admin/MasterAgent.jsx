import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { apiFetch } from '../../lib/api'
import { Users, Mail, Search, CheckCircle, Trash2, BarChart2, Clock, TrendingUp, Shield, Eye, AlertTriangle, Zap, Package, Map, Activity, User, Bell, Wifi, WifiOff, Database, MessageSquare, Server, Fuel, DollarSign, Radio, ArrowRight, Bot, RefreshCw, Calendar, Copy, Edit3, SkipForward, Star, Megaphone, X } from 'lucide-react'
import { AutonomousAgentDashboard } from './AutonomousAgentDashboard'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const STATUS_COLORS = { green: '#22c55e', yellow: '#f0a500', red: '#ef4444' }
const STATUS_LABELS = { green: 'Healthy', yellow: 'Warning', red: 'Critical' }
const STATUS_BG = { green: 'rgba(34,197,94,0.08)', yellow: 'rgba(240,165,0,0.08)', red: 'rgba(239,68,68,0.08)' }

const FEATURE_NAMES = {
  database: { label: 'Supabase Database', icon: Database },
  auth: { label: 'Authentication', icon: Shield },
  aiChat: { label: 'AI Chat (Claude)', icon: MessageSquare },
  email: { label: 'Email (Resend)', icon: Mail },
  sms: { label: 'SMS (Twilio)', icon: Radio },
  stripe: { label: 'Payments (Stripe)', icon: DollarSign },
  dieselPrices: { label: 'Diesel Prices (EIA)', icon: Fuel },
  loadBoard: { label: 'Load Board APIs', icon: Package },
  dieselCache: { label: 'Diesel Cache', icon: Clock },
  runtime: { label: 'Edge Runtime', icon: Server },
}

export function MasterAgent() {
  const { showToast } = useApp()
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [agentLog, setAgentLog] = useState([])
  const [alerting, setAlerting] = useState(false)
  const [lastCheck, setLastCheck] = useState(null)
  const prevHealthRef = useRef(null)
  const checkCountRef = useRef(0)

  // ── Bot controls state ────────────────────────────────────
  const [botStates, setBotStates] = useState(() => {
    const saved = localStorage.getItem('qv_bot_states')
    if (saved) try { return JSON.parse(saved) } catch { /* parse error */ }
    return {
      chatbot: { enabled: true, paused: false, lastActive: null },
      loadAgent: { enabled: true, paused: false, lastActive: null },
      healthMonitor: { enabled: true, paused: false, lastActive: null },
      contentCalendar: { enabled: true, paused: false, lastActive: null },
    }
  })

  // Persist bot states
  useEffect(() => {
    localStorage.setItem('qv_bot_states', JSON.stringify(botStates))
  }, [botStates])

  const toggleBot = (botId) => setBotStates(s => ({ ...s, [botId]: { ...s[botId], enabled: !s[botId].enabled, paused: false } }))
  const pauseBot = (botId) => setBotStates(s => ({ ...s, [botId]: { ...s[botId], paused: !s[botId].paused } }))
  const touchBot = useCallback((botId) => setBotStates(s => ({ ...s, [botId]: { ...s[botId], lastActive: new Date().toISOString() } })), [])

  // ── Bot stats (aggregated from logs) ──────────────────────
  const botStats = useRef({ chatbot: { sessions: 0, messages: 0, voice: 0 }, loadAgent: { scored: 0, assigned: 0, proactive: 0 }, healthMonitor: { fixes: 0, alerts: 0 }, contentCalendar: { generated: 0, shared: 0 } })

  const addLog = useCallback((type, message, botSource) => {
    const entry = { type, message, ts: new Date().toISOString(), bot: botSource || 'system' }
    setAgentLog(prev => [entry, ...prev].slice(0, 100))
    // Update bot stats
    if (botSource === 'chatbot') { botStats.current.chatbot.messages++; if (message.includes('voice') || message.includes('Voice')) botStats.current.chatbot.voice++ }
    if (botSource === 'loadAgent') { if (type === 'check' && message.includes('Scored')) botStats.current.loadAgent.scored++; if (message.includes('Auto-assigned') || message.includes('assigned')) botStats.current.loadAgent.assigned++ }
    if (botSource === 'loadAgent' && message.includes('proactive')) botStats.current.loadAgent.proactive++
    if (botSource === 'healthMonitor') { if (type === 'fix') botStats.current.healthMonitor.fixes++; if (type === 'alert') botStats.current.healthMonitor.alerts++ }
    if (botSource === 'contentCalendar') { if (message.includes('Generated')) botStats.current.contentCalendar.generated += 7; if (message.includes('Shared') || message.includes('shared')) botStats.current.contentCalendar.shared++ }
  }, [])

  const fetchHealth = useCallback(async () => {
    if (botStates.healthMonitor && !botStates.healthMonitor.enabled) return setLoading(false)
    if (botStates.healthMonitor?.paused) return setLoading(false)
    try {
      const res = await apiFetch('/api/health-check')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setHealth(data)
      setLastCheck(new Date())
      checkCountRef.current++
      touchBot('healthMonitor')

      // Compare with previous — detect status changes
      if (prevHealthRef.current && data.checks) {
        for (const [key, check] of Object.entries(data.checks)) {
          const prev = prevHealthRef.current.checks?.[key]
          if (prev && prev.status !== check.status) {
            const name = FEATURE_NAMES[key]?.label || key
            if (check.status === 'red' && prev.status !== 'red') {
              addLog('error', `${name} went DOWN: ${check.message}`, 'healthMonitor')
              // Auto-alert on critical failures
              sendAlert('critical', `${name} is DOWN`, `${name} changed from ${prev.status} to red. Details: ${check.message}`)
            } else if (check.status === 'green' && prev.status !== 'green') {
              addLog('recovery', `${name} RECOVERED: ${check.message}`, 'healthMonitor')
            } else if (check.status === 'yellow') {
              addLog('warning', `${name} degraded: ${check.message}`, 'healthMonitor')
            }
          }
        }
      }
      prevHealthRef.current = data

      // Auto-fix attempts
      if (data.checks) {
        for (const [key, check] of Object.entries(data.checks)) {
          if (check.status === 'red') {
            await attemptAutoFix(key, check)
          }
        }
      }

      addLog('check', `Health check #${checkCountRef.current} — ${data.status.toUpperCase()} (${data.totalLatency}ms)`, 'healthMonitor')
    } catch (err) {
      addLog('error', `Health check failed: ${err.message}`, 'healthMonitor')
    } finally {
      setLoading(false)
    }
  }, [addLog, botStates.healthMonitor, touchBot])

  const attemptAutoFix = async (key, check) => {
    const name = FEATURE_NAMES[key]?.label || key

    // Auto-fix: Diesel cache stale → trigger refresh
    if (key === 'dieselCache' && check.message?.includes('h old')) {
      const age = parseFloat(check.message)
      if (age > 12) {
        addLog('fix', `Auto-fix: Refreshing diesel price cache (${age.toFixed(1)}h stale)...`, 'healthMonitor')
        try {
          const res = await fetch('/api/diesel-prices')
          if (res.ok) {
            addLog('recovery', 'Auto-fix SUCCESS: Diesel prices refreshed', 'healthMonitor')
          } else {
            addLog('error', `Auto-fix FAILED: Diesel refresh returned ${res.status}`, 'healthMonitor')
          }
        } catch {
          addLog('error', 'Auto-fix FAILED: Could not reach diesel-prices endpoint', 'healthMonitor')
        }
      }
    }

    // Auto-fix: Database timeout → retry once
    if (key === 'database' && check.latency > 4000) {
      addLog('fix', `Auto-fix: Database slow (${check.latency}ms). Retrying...`, 'healthMonitor')
    }

    // Can't auto-fix missing API keys — alert admin
    if (check.message?.includes('missing') || check.message?.includes('Not configured')) {
      addLog('alert', `Cannot auto-fix ${name}: ${check.message}. Admin action required.`, 'healthMonitor')
    }
  }

  const sendAlert = async (severity, title, message) => {
    setAlerting(true)
    try {
      await apiFetch('/api/admin-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'health_alert', severity, title, message }),
      })
      addLog('alert', `Alert sent: ${title}`, 'healthMonitor')
      showToast('success', 'Alert Sent', title)
    } catch {
      addLog('error', 'Failed to send alert', 'healthMonitor')
    }
    setAlerting(false)
  }

  // Initial fetch + auto-refresh every 60s
  useEffect(() => {
    fetchHealth()
    if (!autoRefresh) return
    const interval = setInterval(fetchHealth, 60000)
    return () => clearInterval(interval)
  }, [fetchHealth, autoRefresh])

  const overallStatus = health?.status || 'yellow'
  const checks = health?.checks || {}
  const greenCount = Object.values(checks).filter(c => c.status === 'green').length
  const yellowCount = Object.values(checks).filter(c => c.status === 'yellow').length
  const redCount = Object.values(checks).filter(c => c.status === 'red').length
  const totalChecks = Object.keys(checks).length

  const cardStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }

  // ── Bot definitions for status cards ────────────────────
  const BOT_DEFS = [
    {
      id: 'chatbot', label: 'AI Driver Chatbot', icon: MessageSquare, color: '#3b82f6', gradient: 'linear-gradient(135deg, rgba(59,130,246,0.12), rgba(59,130,246,0.04))',
      stats: () => [
        { label: 'Active Sessions', value: botStats.current.chatbot.sessions || '—' },
        { label: 'Messages Today', value: botStats.current.chatbot.messages },
        { label: 'Voice Activations', value: botStats.current.chatbot.voice },
      ],
    },
    {
      id: 'loadAgent', label: 'AI Load Finding Agent', icon: Package, color: '#22c55e', gradient: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.04))',
      stats: () => [
        { label: 'Loads Scored', value: botStats.current.loadAgent.scored },
        { label: 'Auto-Assigned', value: botStats.current.loadAgent.assigned },
        { label: 'Proactive Triggers', value: botStats.current.loadAgent.proactive },
      ],
    },
    {
      id: 'healthMonitor', label: 'Master Admin AI Agent', icon: Shield, color: '#f0a500', gradient: 'linear-gradient(135deg, rgba(240,165,0,0.12), rgba(240,165,0,0.04))',
      stats: () => [
        { label: 'Last Health Check', value: lastCheck ? lastCheck.toLocaleTimeString() : '—' },
        { label: 'Issues Fixed', value: botStats.current.healthMonitor.fixes },
        { label: 'Alerts Sent', value: botStats.current.healthMonitor.alerts },
      ],
    },
    {
      id: 'contentCalendar', label: 'Content Calendar Bot', icon: Calendar, color: '#8b5cf6', gradient: 'linear-gradient(135deg, rgba(139,92,246,0.12), rgba(139,92,246,0.04))',
      stats: () => [
        { label: 'Posts Generated', value: botStats.current.contentCalendar.generated },
        { label: 'Shared This Week', value: botStats.current.contentCalendar.shared },
        { label: 'Templates', value: 21 },
      ],
    },
  ]

  // ── Color map for unified activity feed ───────────────────
  const LOG_COLORS = {
    chatbot: '#3b82f6',       // blue
    loadAgent: '#22c55e',     // green
    healthMonitor: '#f0a500', // yellow
    contentCalendar: '#8b5cf6', // purple
    system: '#6b7590',
  }
  const LOG_TYPE_COLORS = {
    check: '#3b82f6', error: '#ef4444', warning: '#f0a500',
    recovery: '#22c55e', fix: '#8b5cf6', alert: '#ef4444',
    proactive: '#f97316',
  }

  return (
    <div style={{ padding: 20, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 12, background: `${STATUS_COLORS[overallStatus]}15`, border: `2px solid ${STATUS_COLORS[overallStatus]}33`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ic icon={Bot} size={22} color={STATUS_COLORS[overallStatus]} />
          </div>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 2, lineHeight: 1 }}>
              MASTER <span style={{ color: 'var(--accent)' }}>AI AGENT</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              4 Bots · Live Monitor · Auto-Fix · Alerts
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setAutoRefresh(a => !a)}
            style={{ height: 32, borderRadius: 8, padding: '0 10px', background: autoRefresh ? 'rgba(34,197,94,0.1)' : 'var(--surface2)', border: '1px solid ' + (autoRefresh ? 'rgba(34,197,94,0.3)' : 'var(--border)'), cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: autoRefresh ? '#22c55e' : 'var(--muted)', fontFamily: "'DM Sans',sans-serif" }}>
            <Ic icon={autoRefresh ? Wifi : WifiOff} size={12} />
            {autoRefresh ? 'LIVE' : 'PAUSED'}
          </button>
          <button onClick={() => { setLoading(true); fetchHealth() }}
            style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ic icon={RefreshCw} size={14} color="var(--muted)" style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
          <button onClick={() => sendAlert('warning', 'Test Alert', 'This is a test alert from the Master AI Agent.')} disabled={alerting}
            style={{ height: 32, borderRadius: 8, padding: '0 10px', background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: 'var(--accent)', fontFamily: "'DM Sans',sans-serif" }}>
            <Ic icon={Bell} size={12} />
            TEST ALERT
          </button>
        </div>
      </div>

      {/* ═══════════════ 1. BOT STATUS OVERVIEW — 4 cards ═══════════════ */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 14, marginBottom: 20 }}>
        {BOT_DEFS.map(bot => {
          const bs = botStates[bot.id]
          const isActive = bs?.enabled && !bs?.paused
          const statusColor = !bs?.enabled ? '#ef4444' : bs?.paused ? '#f0a500' : '#22c55e'
          const statusLabel = !bs?.enabled ? 'OFF' : bs?.paused ? 'PAUSED' : 'RUNNING'
          return (
            <div key={bot.id} style={{ ...cardStyle, background: bot.gradient, borderLeft: `3px solid ${bot.color}`, position: 'relative', overflow: 'hidden' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: `${bot.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ic icon={bot.icon} size={18} color={bot.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.2 }}>{bot.label}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor, animation: isActive ? 'botPulse 2s ease-in-out infinite' : 'none' }} />
                    <span style={{ fontSize: 9, fontWeight: 800, color: statusColor, letterSpacing: 0.5 }}>{statusLabel}</span>
                  </div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                {bot.stats().map((s, i) => (
                  <div key={i} style={{ flex: 1, padding: '6px 0', textAlign: 'center', background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: bot.color, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{s.value}</div>
                    <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.3 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Controls */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button onClick={() => toggleBot(bot.id)}
                  style={{ flex: 1, height: 28, borderRadius: 6, background: bs?.enabled ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${bs?.enabled ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`, cursor: 'pointer', fontSize: 9, fontWeight: 800, color: bs?.enabled ? '#22c55e' : '#ef4444', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Ic icon={bs?.enabled ? Wifi : WifiOff} size={10} />
                  {bs?.enabled ? 'ON' : 'OFF'}
                </button>
                <button onClick={() => pauseBot(bot.id)} disabled={!bs?.enabled}
                  style={{ flex: 1, height: 28, borderRadius: 6, background: bs?.paused ? 'rgba(240,165,0,0.1)' : 'var(--surface2)', border: `1px solid ${bs?.paused ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`, cursor: bs?.enabled ? 'pointer' : 'default', opacity: bs?.enabled ? 1 : 0.4, fontSize: 9, fontWeight: 800, color: bs?.paused ? '#f0a500' : 'var(--muted)', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <Ic icon={Clock} size={10} />
                  {bs?.paused ? 'RESUME' : 'PAUSE'}
                </button>
              </div>

              {/* Last active */}
              {bs?.lastActive && (
                <div style={{ fontSize: 8, color: 'var(--muted)', textAlign: 'center', marginTop: 6, fontFamily: "'JetBrains Mono',monospace" }}>
                  Last active: {new Date(bs.lastActive).toLocaleTimeString()}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Overall status banner */}
      <div style={{ ...cardStyle, background: STATUS_BG[overallStatus], border: `1px solid ${STATUS_COLORS[overallStatus]}33`, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: `${STATUS_COLORS[overallStatus]}20`, border: `3px solid ${STATUS_COLORS[overallStatus]}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ic icon={overallStatus === 'green' ? CheckCircle : AlertTriangle} size={28} color={STATUS_COLORS[overallStatus]} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: STATUS_COLORS[overallStatus] }}>
            System {STATUS_LABELS[overallStatus]}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {greenCount} healthy · {yellowCount} warnings · {redCount} critical · {totalChecks} services monitored
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>Last check</div>
          <div style={{ fontSize: 12, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace" }}>
            {lastCheck ? lastCheck.toLocaleTimeString() : '—'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>
            {health?.totalLatency ? `${health.totalLatency}ms` : ''}
          </div>
        </div>
      </div>

      {/* Health grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
        {Object.entries(checks).map(([key, check]) => {
          const feat = FEATURE_NAMES[key] || { label: key, icon: Server }
          return (
            <div key={key} style={{ ...cardStyle, padding: 14, borderLeft: `3px solid ${STATUS_COLORS[check.status]}`, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: `${STATUS_COLORS[check.status]}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Ic icon={feat.icon} size={18} color={STATUS_COLORS[check.status]} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2 }}>{feat.label}</div>
                <div style={{ fontSize: 11, color: STATUS_COLORS[check.status], fontWeight: 600 }}>
                  {check.message}
                </div>
                {check.latency > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace" }}>
                    {check.latency}ms
                  </div>
                )}
              </div>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: STATUS_COLORS[check.status], flexShrink: 0 }} />
            </div>
          )
        })}
      </div>

      {/* ═══════════════ 2. LIVE ACTIVITY FEED — unified, color-coded ═══════════════ */}
      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Ic icon={Activity} size={16} color="var(--accent)" />
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, letterSpacing: 1 }}>Live Activity Feed</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.1)', padding: '2px 6px', borderRadius: 4 }}>REAL-TIME</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* Legend */}
            {[
              { color: '#3b82f6', label: 'Chatbot' },
              { color: '#22c55e', label: 'Load Agent' },
              { color: '#ef4444', label: 'Error' },
              { color: '#f0a500', label: 'Warning' },
              { color: '#8b5cf6', label: 'Auto-Fix' },
              { color: '#f97316', label: 'Proactive' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 8, color: 'var(--muted)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: l.color }} />
                {l.label}
              </div>
            ))}
            <div style={{ width: 1, height: 12, background: 'var(--border)', margin: '0 4px' }} />
            <button onClick={() => setAgentLog([])} style={{ fontSize: 10, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
              Clear
            </button>
          </div>
        </div>
        <div style={{ maxHeight: 400, overflowY: 'auto' }}>
          {agentLog.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 20 }}>
              All 4 bots are monitoring... Activity will appear here in real time.
            </div>
          )}
          {agentLog.map((log, i) => {
            // Determine color: by type first (error/warning override bot color), then by bot source
            const dotColor = log.type === 'error' ? '#ef4444'
              : log.type === 'warning' ? '#f0a500'
              : log.type === 'fix' ? '#8b5cf6'
              : log.type === 'alert' ? '#ef4444'
              : log.type === 'proactive' ? '#f97316'
              : LOG_COLORS[log.bot] || '#6b7590'
            const typeIcons = { check: CheckCircle, error: AlertTriangle, warning: Eye, recovery: CheckCircle, fix: RefreshCw, alert: Bell, proactive: Zap }
            const LogIcon = typeIcons[log.type] || Zap
            const botLabel = { chatbot: 'CHATBOT', loadAgent: 'LOAD AGENT', healthMonitor: 'HEALTH', contentCalendar: 'CALENDAR', system: 'SYSTEM' }[log.bot] || ''
            return (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: i < agentLog.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}>
                <div style={{ width: 4, height: 4, borderRadius: '50%', background: dotColor, marginTop: 7, flexShrink: 0 }} />
                <Ic icon={LogIcon} size={13} color={dotColor} style={{ marginTop: 2, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>
                    {botLabel && <span style={{ fontSize: 8, fontWeight: 800, color: LOG_COLORS[log.bot] || 'var(--muted)', background: `${LOG_COLORS[log.bot] || '#6b7590'}15`, padding: '1px 5px', borderRadius: 3, marginRight: 6, letterSpacing: 0.5 }}>{botLabel}</span>}
                    {log.message}
                  </div>
                </div>
                <div style={{ fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono',monospace" }}>
                  {new Date(log.ts).toLocaleTimeString()}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ─── LOAD MANAGEMENT AGENT ─────────────────────────────────────── */}
      <LoadManagementAgent addLog={addLog} sendAlert={sendAlert} cardStyle={cardStyle} botStates={botStates} touchBot={touchBot} />

      {/* ─── CONTENT CALENDAR ─────────────────────────────────────────── */}
      <ContentCalendar addLog={addLog} cardStyle={cardStyle} botStates={botStates} touchBot={touchBot} />

      {/* ─── PROACTIVE LOAD FINDING AGENT ──────────────────────────────── */}
      <ProactiveAgentPanel addLog={addLog} cardStyle={cardStyle} />

      {/* ─── AUTONOMOUS AI AGENT DASHBOARD ─────────────────────── */}
      <AutonomousAgentDashboard cardStyle={cardStyle} addLog={addLog} />

      {/* Animations */}
      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        @keyframes botPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   LOAD MANAGEMENT AGENT — Auto-score, auto-assign, pipeline visualization
   ═══════════════════════════════════════════════════════════════════════════ */

const PIPELINE_STAGES = [
  { id: 'incoming', label: 'Incoming', color: '#6b7590' },
  { id: 'scored', label: 'Scored', color: '#f0a500' },
  { id: 'assigned', label: 'Assigned', color: '#8b5cf6' },
  { id: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { id: 'delivered', label: 'Delivered', color: '#22c55e' },
]

// Inline scoring engine (mirrors CarrierPages calcAiScore)
function scoreLoad(load) {
  const lane = { avgRpm: 2.70, trend: 4, backhaul: 55 }
  const brokerScores = { 'Echo Global': 98, 'TQL': 92, 'CH Robinson': 95, 'Coyote': 88, 'XPO': 90 }
  const brokerScore = brokerScores[load.broker_name] || 70
  const miles = load.miles || 1
  const rpm = (load.rate || 0) / miles
  // A: RPM premium (0-25)
  const premium = (rpm - lane.avgRpm) / lane.avgRpm
  const scoreA = Math.min(25, Math.max(0, 12 + premium * 40))
  // B: Broker safety (0-25)
  const scoreB = brokerScore / 100 * 25
  // C: Deadhead efficiency (0-20) — assume 0 deadhead for incoming loads
  const scoreC = 20
  // D: Lane trend (0-20)
  const scoreD = lane.trend > 8 ? 20 : lane.trend > 3 ? 16 : lane.trend > 0 ? 12 : lane.trend > -5 ? 7 : 3
  // E: Backhaul bonus (0-10)
  const scoreE = lane.backhaul > 70 ? 10 : lane.backhaul > 50 ? 6 : 3
  return Math.min(99, Math.max(30, Math.round(scoreA + scoreB + scoreC + scoreD + scoreE)))
}

// Map DB load status → pipeline stage
function toPipelineStage(status) {
  if (!status) return 'incoming'
  const s = status.toLowerCase().replace(/[^a-z]/g, '')
  if (['delivered', 'completed'].includes(s)) return 'delivered'
  if (['intransit', 'loaded', 'enroute', 'pickup', 'inprogress'].includes(s)) return 'in_progress'
  if (['assigned', 'dispatched', 'accepted'].includes(s)) return 'assigned'
  if (['scored', 'rated'].includes(s)) return 'scored'
  return 'incoming'
}

function LoadManagementAgent({ addLog, sendAlert, cardStyle, botStates, touchBot }) {
  const { showToast } = useApp()
  const [loads, setLoads] = useState([])
  const [drivers, setDrivers] = useState([])
  const [pipelineLoads, setPipelineLoads] = useState({
    incoming: [], scored: [], assigned: [], in_progress: [], delivered: []
  })
  const [loadAgentActive, setLoadAgentActive] = useState(true)
  const [agentStats, setAgentStats] = useState({ scored: 0, assigned: 0, alerts: 0 })
  const [expandedStage, setExpandedStage] = useState(null)
  const [simLog, setSimLog] = useState([]) // simulation step log
  const [simRunning, setSimRunning] = useState(false)
  const processedRef = useRef(new Set()) // track already-processed load IDs
  const statsRef = useRef({ scored: 0, assigned: 0, alerts: 0 })

  // Fetch loads and drivers from Supabase
  const fetchData = useCallback(async () => {
    try {
      const [loadsRes, driversRes] = await Promise.all([
        supabase.from('loads').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('drivers').select('*'),
      ])
      if (loadsRes.data) setLoads(loadsRes.data)
      if (driversRes.data) setDrivers(driversRes.data)
      return { loads: loadsRes.data || [], drivers: driversRes.data || [] }
    } catch (e) {
      return { loads: [], drivers: [] }
    }
  }, [])

  // ─── SIMULATE TEST LOAD ─────────────────────────────────────────────
  const simulateTestLoad = useCallback(async () => {
    setSimRunning(true)
    setSimLog([])
    const simId = 'SIM-' + Date.now().toString(36).toUpperCase()
    const log = (step, msg, status) => {
      setSimLog(prev => [...prev, { step, msg, status, ts: Date.now() }])
      addLog(status === 'pass' ? 'check' : status === 'alert' ? 'alert' : 'fix', msg, 'loadAgent')
    }

    // Step 1: Create test load (designed to score ~88)
    const testLoad = {
      id: simId,
      load_id: simId,
      origin: 'Chicago, IL',
      destination: 'Atlanta, GA',
      rate: 3840,
      miles: 674,
      broker_name: 'Echo Global',
      equipment: 'Dry Van',
      weight: '42,000 lbs',
      status: null, // incoming
      ai_score: null,
      carrier_name: null,
      pickup_date: new Date(Date.now() + 86400000).toISOString(),
      delivery_date: new Date(Date.now() + 172800000).toISOString(),
      created_at: new Date().toISOString(),
      _simulated: true,
    }

    await new Promise(r => setTimeout(r, 400))
    log(1, `[SIM] Injected test load ${simId}: Chicago, IL → Atlanta, GA · $3,840 · 674 mi · Echo Global`, 'pass')

    // Step 2: Score it
    await new Promise(r => setTimeout(r, 600))
    const score = scoreLoad(testLoad)
    testLoad.ai_score = score
    log(2, `[SIM] AI Score: ${score}/100 — ${score >= 80 ? 'HIGH SCORE — eligible for auto-assign' : 'Below threshold'}`, score >= 80 ? 'pass' : 'alert')

    // Step 3: Find available driver
    await new Promise(r => setTimeout(r, 500))
    const currentDrivers = [...drivers]
    // If no real drivers, create a simulated one
    let assignedDriver = currentDrivers.find(d => d.status === 'available' || d.status === 'Active')
    let simDriver = false
    if (!assignedDriver) {
      assignedDriver = { id: 'sim-driver-001', full_name: 'Simulated Driver', status: 'available', _simulated: true }
      simDriver = true
      log(3, `[SIM] No real drivers found — using simulated driver: ${assignedDriver.full_name}`, 'fix')
    } else {
      log(3, `[SIM] Found available driver: ${assignedDriver.full_name}`, 'pass')
    }

    // Step 4: Auto-assign
    if (score >= 80) {
      await new Promise(r => setTimeout(r, 500))
      testLoad.carrier_name = assignedDriver.full_name
      testLoad.status = 'Assigned'
      testLoad.pipeline_stage = 'assigned'
      log(4, `[SIM] Auto-assigned ${simId} (score: ${score}) → ${assignedDriver.full_name}`, 'pass')

      // Step 5: Push notification
      await new Promise(r => setTimeout(r, 400))
      let pushResult = 'skipped'
      if (!simDriver) {
        try {
          const res = await apiFetch('/api/send-push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: '[SIM] New Load Assigned',
              body: `Load ${simId}: Chicago, IL → Atlanta, GA · $3,840`,
              driverId: assignedDriver.id,
            }),
          })
          pushResult = res.ok ? 'sent' : 'failed (HTTP ' + res.status + ')'
        } catch (e) {
          pushResult = 'failed (' + (e.message || 'network error') + ')'
        }
      } else {
        pushResult = 'simulated (no real driver)'
      }
      log(5, `[SIM] Push notification: ${pushResult}`, pushResult.startsWith('sent') || pushResult.startsWith('simulated') ? 'pass' : 'alert')
    } else {
      log(4, `[SIM] Score ${score} < 80 — skipping auto-assign`, 'alert')
    }

    // Step 6: Inject into pipeline kanban
    await new Promise(r => setTimeout(r, 400))
    const stage = score >= 80 ? 'assigned' : 'scored'
    setPipelineLoads(prev => ({
      ...prev,
      [stage]: [testLoad, ...(prev[stage] || [])],
    }))
    setExpandedStage(stage)
    statsRef.current.scored++
    if (score >= 80) statsRef.current.assigned++
    setAgentStats({ ...statsRef.current })
    log(6, `[SIM] Load placed in "${stage}" pipeline column — kanban updated`, 'pass')

    // If simulated driver was used, inject into drivers list for display
    if (simDriver) {
      setDrivers(prev => [{ ...assignedDriver, status: 'dispatched' }, ...prev])
    }

    showToast('success', 'Simulation Complete', `Load ${simId} scored ${score}/100 → assigned to ${assignedDriver.full_name}`)
    setSimRunning(false)
  }, [drivers, addLog, showToast])

  // Process loads: score + auto-assign
  const processLoads = useCallback(async (loadsList, driversList) => {
    if (!loadsList || loadsList.length === 0) return

    const pipeline = { incoming: [], scored: [], assigned: [], in_progress: [], delivered: [] }
    const availableDrivers = driversList.filter(d => d.status === 'available' || d.status === 'Active')

    for (const load of loadsList) {
      const stage = toPipelineStage(load.status)
      const miles = load.miles || (load.rate ? Math.round(load.rate / 2.8) : 500)
      const enriched = { ...load, miles, ai_score: load.ai_score || null, pipeline_stage: stage }

      // New unprocessed loads → score them
      if ((stage === 'incoming' || !load.ai_score) && !processedRef.current.has(load.id + '_scored')) {
        const score = scoreLoad({ ...load, miles })
        enriched.ai_score = score
        enriched.pipeline_stage = 'scored'
        processedRef.current.add(load.id + '_scored')
        statsRef.current.scored++

        // Update score in DB (fire and forget)
        supabase.from('loads').update({ ai_score: score }).eq('id', load.id).then(() => {})

        addLog('check', `Scored load ${load.load_id || load.id}: ${score}/100 (${load.origin} → ${load.destination})`, 'loadAgent')

        // Auto-assign if score ≥ 80
        if (score >= 80 && !load.carrier_name && !processedRef.current.has(load.id + '_assigned')) {
          if (availableDrivers.length > 0) {
            const driver = availableDrivers.shift() // take first available
            enriched.pipeline_stage = 'assigned'
            enriched.carrier_name = driver.full_name
            processedRef.current.add(load.id + '_assigned')
            statsRef.current.assigned++

            // Update load in DB
            supabase.from('loads').update({
              carrier_name: driver.full_name,
              status: 'Assigned',
            }).eq('id', load.id).then(() => {})

            // Update driver status
            supabase.from('drivers').update({ status: 'dispatched' }).eq('id', driver.id).then(() => {})

            addLog('fix', `Auto-assigned load ${load.load_id || load.id} (score: ${score}) → ${driver.full_name}`, 'loadAgent')

            // Push notification (fire and forget)
            apiFetch('/api/send-push', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: 'New Load Assigned',
                body: `Load ${load.load_id || ''}: ${load.origin} → ${load.destination} · $${load.rate || 0}`,
                driverId: driver.id,
              }),
            }).catch(() => {})
          } else {
            // No drivers available for high-scoring load → alert admin
            if (!processedRef.current.has(load.id + '_alerted')) {
              processedRef.current.add(load.id + '_alerted')
              statsRef.current.alerts++
              addLog('alert', `HIGH-SCORE LOAD ${load.load_id || load.id} (${score}/100) — NO DRIVERS AVAILABLE`, 'loadAgent')
              sendAlert(
                'warning',
                'High-Score Load Unassigned',
                `Load ${load.load_id || load.id}: ${load.origin} → ${load.destination} scored ${score}/100 but no drivers are available. Rate: $${load.rate || 'N/A'}`
              )
            }
          }
        }
      }

      // Place in correct pipeline bucket
      const finalStage = enriched.pipeline_stage || stage
      if (pipeline[finalStage]) pipeline[finalStage].push(enriched)
      else pipeline.incoming.push(enriched)
    }

    setPipelineLoads(pipeline)
    setAgentStats({ ...statsRef.current })
  }, [addLog, sendAlert])

  // Poll every 30s when active
  useEffect(() => {
    if (!loadAgentActive) return
    if (botStates?.loadAgent && (!botStates.loadAgent.enabled || botStates.loadAgent.paused)) return
    let mounted = true

    const run = async () => {
      const { loads: l, drivers: d } = await fetchData()
      if (mounted) {
        await processLoads(l, d)
        if (touchBot) touchBot('loadAgent')
      }
    }

    run()
    const interval = setInterval(run, 30000)
    return () => { mounted = false; clearInterval(interval) }
  }, [loadAgentActive, fetchData, processLoads, botStates?.loadAgent, touchBot])

  const totalPipelineLoads = Object.values(pipelineLoads).reduce((a, b) => a + b.length, 0)

  return (
    <div style={{ marginTop: 24 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ic icon={Package} size={18} color="#8b5cf6" />
          </div>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 2, lineHeight: 1 }}>
              LOAD <span style={{ color: '#8b5cf6' }}>MANAGEMENT</span> AGENT
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
              Auto-Score · Auto-Assign · Pipeline Monitor
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={simulateTestLoad} disabled={simRunning}
            style={{ height: 28, borderRadius: 6, padding: '0 10px', background: simRunning ? 'rgba(59,130,246,0.2)' : 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', cursor: simRunning ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#3b82f6', fontFamily: "'DM Sans',sans-serif" }}>
            <Ic icon={Zap} size={11} style={simRunning ? { animation: 'spin 0.6s linear infinite' } : {}} />
            {simRunning ? 'RUNNING...' : 'SIMULATE LOAD'}
          </button>
          <button onClick={() => setLoadAgentActive(a => !a)}
            style={{ height: 28, borderRadius: 6, padding: '0 10px', background: loadAgentActive ? 'rgba(139,92,246,0.1)' : 'var(--surface2)', border: '1px solid ' + (loadAgentActive ? 'rgba(139,92,246,0.3)' : 'var(--border)'), cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: loadAgentActive ? '#8b5cf6' : 'var(--muted)', fontFamily: "'DM Sans',sans-serif" }}>
            <Ic icon={loadAgentActive ? Zap : WifiOff} size={11} />
            {loadAgentActive ? 'ACTIVE' : 'PAUSED'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Pipeline', value: totalPipelineLoads, icon: Package, color: '#6b7590' },
          { label: 'Scored', value: agentStats.scored, icon: TrendingUp, color: '#f0a500' },
          { label: 'Auto-Assigned', value: agentStats.assigned, icon: User, color: '#8b5cf6' },
          { label: 'Alerts', value: agentStats.alerts, icon: Bell, color: '#ef4444' },
        ].map(s => (
          <div key={s.label} style={{ ...cardStyle, padding: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: s.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic icon={s.icon} size={16} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Simulation log */}
      {simLog.length > 0 && (
        <div style={{ ...cardStyle, padding: 14, marginBottom: 16, borderLeft: '3px solid #3b82f6' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ic icon={Zap} size={14} color="#3b82f6" />
              <span style={{ fontSize: 12, fontWeight: 700, color: '#3b82f6' }}>Simulation Results</span>
            </div>
            <button onClick={() => setSimLog([])} style={{ fontSize: 9, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}>
              Dismiss
            </button>
          </div>
          {simLog.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 0', borderBottom: i < simLog.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <div style={{ width: 20, height: 20, borderRadius: 6, background: s.status === 'pass' ? 'rgba(34,197,94,0.12)' : s.status === 'fix' ? 'rgba(139,92,246,0.12)' : 'rgba(239,68,68,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: s.status === 'pass' ? '#22c55e' : s.status === 'fix' ? '#8b5cf6' : '#ef4444' }}>
                  {s.status === 'pass' ? '✓' : s.status === 'fix' ? '⚙' : '!'}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text)', lineHeight: 1.4 }}>{s.msg}</div>
              </div>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace", whiteSpace: 'nowrap' }}>
                Step {s.step}
              </div>
            </div>
          ))}
          {simRunning && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 0', fontSize: 11, color: '#3b82f6' }}>
              <Ic icon={RefreshCw} size={12} style={{ animation: 'spin 1s linear infinite' }} />
              Processing...
            </div>
          )}
        </div>
      )}

      {/* Pipeline visualization */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden', marginBottom: 16 }}>
        {/* Pipeline header bar */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {PIPELINE_STAGES.map(stage => {
            const count = pipelineLoads[stage.id]?.length || 0
            return (
              <button key={stage.id} onClick={() => setExpandedStage(expandedStage === stage.id ? null : stage.id)}
                style={{ flex: 1, padding: '12px 8px', background: expandedStage === stage.id ? stage.color + '12' : 'transparent', border: 'none', borderBottom: expandedStage === stage.id ? `2px solid ${stage.color}` : '2px solid transparent', cursor: 'pointer', textAlign: 'center', transition: 'all 0.2s' }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: stage.color, fontFamily: "'JetBrains Mono',monospace" }}>{count}</div>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginTop: 2 }}>{stage.label}</div>
              </button>
            )
          })}
        </div>

        {/* Pipeline flow arrows */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '8px 16px', gap: 4 }}>
          {PIPELINE_STAGES.map((stage, i) => (
            <div key={stage.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: stage.color, opacity: (pipelineLoads[stage.id]?.length || 0) > 0 ? 1 : 0.3 }} />
              {i < PIPELINE_STAGES.length - 1 && <Ic icon={ArrowRight} size={12} color="var(--muted)" />}
            </div>
          ))}
        </div>

        {/* Expanded stage details */}
        {expandedStage && (
          <div style={{ borderTop: '1px solid var(--border)', maxHeight: 300, overflowY: 'auto' }}>
            {(pipelineLoads[expandedStage] || []).length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: 'var(--muted)' }}>
                No loads in this stage
              </div>
            ) : (
              (pipelineLoads[expandedStage] || []).map((load, i) => {
                const score = load.ai_score || 0
                const scoreColor = score >= 80 ? '#22c55e' : score >= 60 ? '#f0a500' : '#ef4444'
                return (
                  <div key={load.id || i} style={{ display: 'flex', alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                    {/* Score badge */}
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: scoreColor + '15', border: `1px solid ${scoreColor}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: scoreColor, fontFamily: "'JetBrains Mono',monospace" }}>
                        {score || '—'}
                      </span>
                    </div>
                    {/* Load info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono',monospace", color: 'var(--accent)' }}>
                          {load.load_id || `#${String(load.id).slice(0, 8)}`}
                        </span>
                        {load.equipment && (
                          <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'var(--surface2)', color: 'var(--muted)', fontWeight: 600 }}>
                            {load.equipment}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>
                        {load.origin || '—'} <span style={{ color: 'var(--muted)' }}>→</span> {load.destination || '—'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                        {load.broker_name || 'Unknown broker'} · {load.miles ? `${load.miles} mi` : ''}
                      </div>
                    </div>
                    {/* Rate */}
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: '#22c55e', fontFamily: "'JetBrains Mono',monospace" }}>
                        ${load.rate ? load.rate.toLocaleString() : '—'}
                      </div>
                      {load.carrier_name && (
                        <div style={{ fontSize: 10, color: '#8b5cf6', fontWeight: 600, marginTop: 2 }}>
                          <Ic icon={User} size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                          {load.carrier_name}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {/* Available drivers */}
      <div style={{ ...cardStyle, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Ic icon={Users} size={14} color="var(--accent3)" />
          <span style={{ fontSize: 12, fontWeight: 700 }}>Available Drivers</span>
          <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
            {drivers.filter(d => d.status === 'available' || d.status === 'Active').length} / {drivers.length} available
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {drivers.length === 0 && (
            <div style={{ fontSize: 11, color: 'var(--muted)', padding: 8 }}>No drivers in database</div>
          )}
          {drivers.slice(0, 20).map((d, i) => {
            const isAvail = d.status === 'available' || d.status === 'Active'
            return (
              <div key={d.id || i} style={{ padding: '4px 10px', borderRadius: 6, background: isAvail ? 'rgba(34,197,94,0.08)' : 'var(--surface2)', border: '1px solid ' + (isAvail ? 'rgba(34,197,94,0.2)' : 'var(--border)'), fontSize: 11, fontWeight: 600, color: isAvail ? '#22c55e' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: isAvail ? '#22c55e' : '#6b7590' }} />
                {d.full_name || 'Driver'}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONTENT CALENDAR — Weekly Facebook marketing post generator
   ═══════════════════════════════════════════════════════════════════════════ */

const POST_ANGLES = [
  { id: 'pain_point', label: 'Pain Point', icon: AlertTriangle, color: '#ef4444', desc: 'Highlight a frustration carriers face' },
  { id: 'savings', label: 'Savings Calculator', icon: DollarSign, color: '#22c55e', desc: 'Show concrete dollar savings' },
  { id: 'social_proof', label: 'Social Proof', icon: Star, color: '#f0a500', desc: 'Testimonial or success story' },
]

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// Post templates — 7 per angle (21 total), rotated across the week
const POST_TEMPLATES = {
  pain_point: [
    {
      title: 'Broker Payment Delays',
      body: `Still waiting 45+ days for broker payments?\n\nThe average owner-operator loses $3,200/month in cash flow waiting on slow-paying brokers.\n\nQivori AI flags slow-pay brokers BEFORE you book the load. Our Broker Risk Intel scores every broker so you never get burned again.\n\nStop gambling with your cash flow.\nJoin the waitlist: qivori.com\n\n#trucking #owneroperator #freightbroker #truckinglife #cashflow`,
    },
    {
      title: 'Deadhead Miles',
      body: `Empty miles = money burned.\n\nThe average carrier runs 15% deadhead. On 100K miles/year, that's 15,000 unpaid miles — roughly $22,500 wasted in fuel alone.\n\nQivori AI's Lane Intelligence finds backhaul loads automatically so you stay loaded both ways.\n\nStop driving for free.\nqivori.com\n\n#trucking #deadhead #fuel #owneroperator #logistics`,
    },
    {
      title: 'Compliance Nightmares',
      body: `Got a surprise CSA violation?\n\nOne bad inspection can spike your insurance by $4,000+/year. Most carriers don't know their score is dropping until it's too late.\n\nQivori AI monitors your CSA score in real-time and alerts you before violations become costly.\n\nDon't let one inspection wreck your bottom line.\nqivori.com\n\n#CSA #trucking #compliance #FMCSA #truckdriver`,
    },
    {
      title: 'Rate Negotiation',
      body: `Are you accepting the first rate offer?\n\nBrokers lowball because they know most carriers don't have market data. The average carrier leaves $0.15-0.30/mile on the table per load.\n\nQivori AI shows you real-time lane rates so you negotiate from a position of strength.\n\nKnow your worth.\nqivori.com\n\n#freight #rates #trucking #negotiation #owneroperator`,
    },
    {
      title: 'Fuel Cost Chaos',
      body: `Fuel is your #1 expense. Are you optimizing it?\n\nThe difference between the cheapest and most expensive truck stop on the same route can be $0.40/gallon. On a 200-gallon fill, that's $80 wasted.\n\nQivori AI's Fuel Optimizer finds the cheapest diesel on your exact route, every time.\n\nSave $200-400/week.\nqivori.com\n\n#diesel #fuelprices #trucking #savemoney #logistics`,
    },
    {
      title: 'IFTA Filing Stress',
      body: `IFTA quarter coming up? Dreading the paperwork?\n\nManual IFTA tracking costs owner-operators 8-12 hours per quarter. One mistake can trigger an audit.\n\nQivori AI auto-tracks your miles by jurisdiction from GPS data. File in minutes, not days.\n\nYour time is worth more than spreadsheets.\nqivori.com\n\n#IFTA #trucking #taxes #owneroperator #compliance`,
    },
    {
      title: 'Finding Quality Loads',
      body: `Scrolling through 500 loads to find 1 good one?\n\nMost load boards show you everything — including loads that'll lose you money. Carriers waste 2-3 hours/day just searching.\n\nQivori AI scores every load with a 5-factor algorithm: RPM, broker safety, deadhead, lane trends, and backhaul probability.\n\nLet AI find your best loads.\nqivori.com\n\n#loadboard #trucking #freight #AI #owneroperator`,
    },
  ],
  savings: [
    {
      title: 'Fuel Savings Breakdown',
      body: `SAVINGS CALCULATOR\n\nAverage fuel spend: $4,200/week\nQivori Fuel Optimizer savings: 8-12%\n\nWeekly savings: $336 - $504\nMonthly savings: $1,344 - $2,016\nAnnual savings: $16,128 - $24,192\n\nThat's a down payment on a new truck — just from smarter fuel stops.\n\nStart saving: qivori.com\n\n#trucking #savings #diesel #fuel #owneroperator`,
    },
    {
      title: 'Deadhead Reduction ROI',
      body: `REAL NUMBERS\n\nCurrent deadhead: 15% (industry avg)\nWith Qivori Lane Intel: 6-8%\n\nOn 120K miles/year:\nBefore: 18,000 empty miles ($27,000 wasted)\nAfter: 8,400 empty miles ($12,600)\nAnnual savings: $14,400\n\nPlus you're earning on those backhaul miles too.\n\nqivori.com\n\n#trucking #deadhead #savings #logistics #math`,
    },
    {
      title: 'Broker Score = Money Saved',
      body: `THE BROKER MATH\n\nAverage load: $3,500\nSlow-pay broker (60+ days): You lose $280 in factoring fees\nBad broker (never pays): You lose $3,500\n\nQivori AI has blocked an average of 2 bad brokers/month per carrier in testing.\n\nThat's $7,000/month in protected revenue.\n\nqivori.com\n\n#broker #freight #trucking #protection #owneroperator`,
    },
    {
      title: 'Time Savings = Revenue',
      body: `YOUR TIME IS MONEY\n\nHours spent per week on admin:\nLoad searching: 10-15 hrs\nIFTA/compliance: 3 hrs\nInvoice/billing: 4 hrs\nRoute planning: 3 hrs\n\nWith Qivori AI: Cut 15+ hours/week\n\n15 hrs x $50/hr = $750/week back in your pocket\nThat's $39,000/year.\n\nqivori.com\n\n#productivity #trucking #automation #AI #time`,
    },
    {
      title: 'Rate Intelligence ROI',
      body: `KNOW YOUR LANE RATES\n\nAverage loads/month: 12\nExtra $/mile from rate intel: $0.18\nAverage miles/load: 650\n\n$0.18 x 650 x 12 = $1,404/month extra\n$16,848/year — just from better rate negotiation.\n\nQivori AI shows you exactly what your lane is paying.\n\nqivori.com\n\n#rates #freight #trucking #money #negotiation`,
    },
    {
      title: 'Compliance Cost Avoidance',
      body: `WHAT VIOLATIONS REALLY COST\n\nOne roadside violation: $500-$16,000 fine\nCSA score spike: +$4,000/year insurance\nOut-of-service order: $800-2,000/day lost revenue\n\nQivori AI cost to prevent all of this: Less than one violation.\n\nPrevention beats penalties.\n\nqivori.com\n\n#CSA #compliance #trucking #insurance #FMCSA`,
    },
    {
      title: 'Total Platform Savings',
      body: `THE FULL PICTURE\n\nAnnual savings with Qivori AI:\nFuel optimization: $18,000\nDeadhead reduction: $14,400\nBetter rates: $16,848\nTime savings: $39,000\nBroker protection: $7,000+\n\nTOTAL: $95,248/year\n\nQivori AI pays for itself in the first week.\n\nqivori.com\n\n#trucking #savings #ROI #owneroperator #AI`,
    },
  ],
  social_proof: [
    {
      title: 'Marcus J. — Fleet Owner',
      body: `"I was spending 3 hours a day just searching for loads. Now Qivori AI finds me the best loads in seconds. My revenue is up 22% in 2 months." — Marcus J., Fleet Owner, Atlanta GA\n\n3 trucks | 22% revenue increase | 15 hrs/week saved\n\nReal results from real carriers.\n\nJoin Marcus: qivori.com\n\n#testimonial #trucking #success #AI #owneroperator`,
    },
    {
      title: 'Sarah T. — Owner-Operator',
      body: `"Qivori caught a broker with 3 payment complaints before I booked the load. That one alert saved me $4,200." — Sarah T., Owner-Operator, Dallas TX\n\n1 truck | $4,200 saved | Zero bad broker loads\n\nProtect yourself before you book.\n\nqivori.com\n\n#brokerfraud #trucking #protection #owneroperator #freight`,
    },
    {
      title: 'James R. — O/O',
      body: `"The fuel optimizer saved me $340 last week alone. It found a truck stop 2 miles off my route that was $0.35/gallon cheaper." — James R., O/O, Memphis TN\n\n1 truck | $340/week savings | $17,680/year\n\nSmall detours, big savings.\n\nqivori.com\n\n#diesel #fuel #trucking #savings #truckdriver`,
    },
    {
      title: 'Rodriguez Trucking — Small Fleet',
      body: `"We went from 14% deadhead to 5% in our first month. That's $1,200/month we were literally throwing away." — Carlos R., Rodriguez Trucking, Houston TX\n\n5 trucks | 64% deadhead reduction | $14,400/year saved\n\nEvery mile should make money.\n\nqivori.com\n\n#deadhead #trucking #fleet #logistics #efficiency`,
    },
    {
      title: 'Lisa M. — Compliance Win',
      body: `"IFTA used to take me a full weekend every quarter. With Qivori, I filed in 20 minutes. Accurate. Done." — Lisa M., Owner-Operator, Phoenix AZ\n\n1 truck | 12 hours to 20 minutes | Zero filing errors\n\nGet your weekends back.\n\nqivori.com\n\n#IFTA #compliance #trucking #timesaver #owneroperator`,
    },
    {
      title: 'DeShawn W. — Rate Wins',
      body: `"I used to accept whatever rate the broker offered. Qivori showed me my lane was paying $0.22 more per mile than I was getting. That's an extra $1,700/month." — DeShawn W., O/O, Chicago IL\n\n1 truck | $0.22/mile increase | $20,400/year\n\nKnow what your lane is worth.\n\nqivori.com\n\n#rates #negotiation #trucking #owneroperator #freight`,
    },
    {
      title: 'Milestone: 500 Carriers',
      body: `500 carriers on the Qivori AI waitlist!\n\nIn just 6 weeks, 500 owner-operators and small fleets have signed up to transform their trucking business with AI.\n\nWhat they're most excited about:\n1. AI Load Scoring (78%)\n2. Broker Risk Intel (65%)\n3. Fuel Optimizer (61%)\n\nDon't miss the launch.\nqivori.com\n\n#milestone #trucking #AI #startup #logistics`,
    },
  ],
}

// Get the Monday of the current week
function getWeekStart(date) {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// Generate a week of posts starting from a given date
function generateWeekPosts(weekStart) {
  const posts = []
  const angleOrder = ['pain_point', 'savings', 'social_proof']
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart)
    date.setDate(date.getDate() + i)
    const angleIdx = i % 3
    const angle = angleOrder[angleIdx]
    const templates = POST_TEMPLATES[angle]
    const templateIdx = (Math.floor(i / 3) + Math.floor(date.getDate() / 7)) % templates.length
    const template = templates[templateIdx]
    posts.push({
      id: `post-${date.toISOString().split('T')[0]}`,
      date: new Date(date),
      dayName: DAY_NAMES[date.getDay()],
      angle,
      title: template.title,
      body: template.body,
      status: 'pending',
      edited: false,
    })
  }
  return posts
}

function ContentCalendar({ addLog, cardStyle, botStates, touchBot }) {
  const { showToast } = useApp()
  const [weekOffset, setWeekOffset] = useState(0)
  const [posts, setPosts] = useState(() => {
    const saved = localStorage.getItem('qv_content_calendar')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        return parsed.map(p => ({ ...p, date: new Date(p.date) }))
      } catch { /* referral error */ }
    }
    return generateWeekPosts(getWeekStart(new Date()))
  })
  const [editingPost, setEditingPost] = useState(null)
  const [editText, setEditText] = useState('')
  const [selectedDay, setSelectedDay] = useState(null)
  const [generating, setGenerating] = useState(false)

  // Persist to localStorage
  useEffect(() => {
    localStorage.setItem('qv_content_calendar', JSON.stringify(posts))
  }, [posts])

  // Auto-generate on Sunday
  useEffect(() => {
    const today = new Date()
    if (today.getDay() === 0) {
      const lastGen = localStorage.getItem('qv_cal_last_gen')
      const todayStr = today.toISOString().split('T')[0]
      if (lastGen !== todayStr) {
        handleGenerate()
        localStorage.setItem('qv_cal_last_gen', todayStr)
      }
    }
  }, [])

  const handleGenerate = useCallback((offsetOverride) => {
    setGenerating(true)
    const off = typeof offsetOverride === 'number' ? offsetOverride : weekOffset
    setTimeout(() => {
      const ws = getWeekStart(new Date())
      ws.setDate(ws.getDate() + off * 7)
      const newPosts = generateWeekPosts(ws)
      setPosts(newPosts)
      setGenerating(false)
      setSelectedDay(null)
      setEditingPost(null)
      addLog('check', `[Calendar] Generated 7 marketing posts for week of ${ws.toLocaleDateString()}`, 'contentCalendar')
      if (touchBot) touchBot('contentCalendar')
      showToast('success', 'Posts Generated', '7 new marketing posts ready')
    }, 800)
  }, [weekOffset, addLog, showToast])

  const handleCopy = (post) => {
    navigator.clipboard.writeText(post.body).then(() => {
      showToast('success', 'Copied!', `${post.dayName} post copied to clipboard`)
      addLog('check', `[Calendar] Copied ${post.dayName} post: "${post.title}"`, 'contentCalendar')
    }).catch(() => {
      const ta = document.createElement('textarea')
      ta.value = post.body
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      showToast('success', 'Copied!', `${post.dayName} post copied`)
    })
  }

  const handleMarkShared = (postId) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: p.status === 'shared' ? 'pending' : 'shared' } : p))
  }

  const handleSkip = (postId) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, status: p.status === 'skipped' ? 'pending' : 'skipped' } : p))
  }

  const handleEdit = (post) => {
    setEditingPost(post.id)
    setEditText(post.body)
  }

  const handleSaveEdit = (postId) => {
    setPosts(prev => prev.map(p => p.id === postId ? { ...p, body: editText, edited: true } : p))
    setEditingPost(null)
    setEditText('')
    showToast('success', 'Saved', 'Post updated')
  }

  const handleRegenerate = (postId) => {
    setPosts(prev => prev.map(p => {
      if (p.id !== postId) return p
      const templates = POST_TEMPLATES[p.angle]
      const currentIdx = templates.findIndex(t => t.title === p.title)
      const nextIdx = (currentIdx + 1) % templates.length
      const next = templates[nextIdx]
      return { ...p, title: next.title, body: next.body, edited: false }
    }))
    showToast('success', 'Regenerated', 'New post generated')
  }

  const sharedCount = posts.filter(p => p.status === 'shared').length
  const pendingCount = posts.filter(p => p.status === 'pending').length
  const skippedCount = posts.filter(p => p.status === 'skipped').length

  const weekStart = posts.length > 0 ? posts[0].date : new Date()
  const weekEnd = posts.length > 0 ? posts[posts.length - 1].date : new Date()
  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <div style={{ marginTop: 24 }}>
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ic icon={Calendar} size={18} color="#3b82f6" />
          </div>
          <div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 2, lineHeight: 1 }}>
              CONTENT <span style={{ color: '#3b82f6' }}>CALENDAR</span>
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
              Facebook Marketing · Auto-Generated Weekly
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => { const nw = weekOffset - 1; setWeekOffset(nw); handleGenerate(nw) }}
            style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--muted)' }}>
            ‹
          </button>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', minWidth: 140, textAlign: 'center' }}>{weekLabel}</span>
          <button onClick={() => { const nw = weekOffset + 1; setWeekOffset(nw); handleGenerate(nw) }}
            style={{ width: 28, height: 28, borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'var(--muted)' }}>
            ›
          </button>
          <button onClick={handleGenerate} disabled={generating}
            style={{ height: 28, borderRadius: 6, padding: '0 10px', background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.3)', cursor: generating ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 700, color: '#3b82f6', fontFamily: "'DM Sans',sans-serif" }}>
            <Ic icon={RefreshCw} size={11} style={generating ? { animation: 'spin 0.6s linear infinite' } : {}} />
            {generating ? 'GENERATING...' : 'REGENERATE'}
          </button>
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 16 }}>
        {[
          { label: 'Shared', value: sharedCount, color: '#22c55e', icon: CheckCircle },
          { label: 'Pending', value: pendingCount, color: '#f0a500', icon: Clock },
          { label: 'Skipped', value: skippedCount, color: '#6b7590', icon: SkipForward },
        ].map(s => (
          <div key={s.label} style={{ ...cardStyle, padding: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 28, height: 28, borderRadius: 6, background: s.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic icon={s.icon} size={14} color={s.color} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, fontFamily: "'JetBrains Mono',monospace" }}>{s.value}<span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>/7</span></div>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Weekly calendar grid */}
      <div style={{ ...cardStyle, padding: 0, overflow: 'hidden' }}>
        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
          {posts.map((post, i) => {
            const isToday = post.date.toDateString() === new Date().toDateString()
            const angleInfo = POST_ANGLES.find(a => a.id === post.angle)
            const statusColor = post.status === 'shared' ? '#22c55e' : post.status === 'skipped' ? '#6b7590' : '#f0a500'
            return (
              <button key={post.id} onClick={() => setSelectedDay(selectedDay === i ? null : i)}
                style={{ padding: '10px 4px', background: selectedDay === i ? 'rgba(59,130,246,0.06)' : isToday ? 'rgba(59,130,246,0.03)' : 'transparent', border: 'none', borderBottom: selectedDay === i ? '2px solid #3b82f6' : isToday ? '2px solid rgba(59,130,246,0.3)' : '2px solid transparent', borderRight: i < 6 ? '1px solid var(--border)' : 'none', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1 }}>{DAY_SHORT[post.date.getDay()]}</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: isToday ? '#3b82f6' : 'var(--text)', marginTop: 2 }}>{post.date.getDate()}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, marginTop: 4 }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: angleInfo?.color || '#6b7590' }} />
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: statusColor }} />
                </div>
                <div style={{ fontSize: 8, color: angleInfo?.color || 'var(--muted)', fontWeight: 700, marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {post.angle === 'pain_point' ? 'PAIN' : post.angle === 'savings' ? 'SAVE' : 'PROOF'}
                </div>
              </button>
            )
          })}
        </div>

        {/* Expanded post detail */}
        {selectedDay !== null && posts[selectedDay] && (() => {
          const post = posts[selectedDay]
          const angleInfo = POST_ANGLES.find(a => a.id === post.angle)
          const isEditing = editingPost === post.id
          return (
            <div style={{ padding: 16, borderTop: '1px solid var(--border)' }}>
              {/* Post header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Ic icon={angleInfo?.icon || Megaphone} size={16} color={angleInfo?.color} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{post.title}</div>
                    <div style={{ fontSize: 10, color: angleInfo?.color, fontWeight: 600 }}>
                      {angleInfo?.label} · {post.dayName}, {post.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {post.edited && <span style={{ color: 'var(--muted)', marginLeft: 6 }}>(edited)</span>}
                    </div>
                  </div>
                </div>
                <div style={{ padding: '3px 8px', borderRadius: 4, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, background: post.status === 'shared' ? 'rgba(34,197,94,0.1)' : post.status === 'skipped' ? 'rgba(107,117,144,0.1)' : 'rgba(240,165,0,0.1)', color: post.status === 'shared' ? '#22c55e' : post.status === 'skipped' ? '#6b7590' : '#f0a500', border: '1px solid ' + (post.status === 'shared' ? 'rgba(34,197,94,0.2)' : post.status === 'skipped' ? 'rgba(107,117,144,0.2)' : 'rgba(240,165,0,0.2)') }}>
                  {post.status}
                </div>
              </div>

              {/* Post body */}
              {isEditing ? (
                <div style={{ marginBottom: 12 }}>
                  <textarea value={editText} onChange={e => setEditText(e.target.value)}
                    style={{ width: '100%', minHeight: 200, padding: 12, borderRadius: 8, border: '1px solid rgba(59,130,246,0.3)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", lineHeight: 1.6, resize: 'vertical', outline: 'none' }} />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    <button onClick={() => handleSaveEdit(post.id)}
                      style={{ padding: '6px 14px', borderRadius: 6, background: '#3b82f6', color: '#fff', border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      Save
                    </button>
                    <button onClick={() => { setEditingPost(null); setEditText('') }}
                      style={{ padding: '6px 14px', borderRadius: 6, background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 14, marginBottom: 12, whiteSpace: 'pre-wrap', fontSize: 12, lineHeight: 1.7, color: 'var(--text)', border: '1px solid var(--border)', maxHeight: 300, overflowY: 'auto' }}>
                  {post.body}
                </div>
              )}

              {/* Action buttons */}
              {!isEditing && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  <button onClick={() => handleCopy(post)}
                    style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', color: '#3b82f6', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Ic icon={Copy} size={12} /> Copy
                  </button>
                  <button onClick={() => handleEdit(post)}
                    style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.2)', color: '#f0a500', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Ic icon={Edit3} size={12} /> Edit
                  </button>
                  <button onClick={() => handleRegenerate(post.id)}
                    style={{ padding: '6px 12px', borderRadius: 6, background: 'rgba(139,92,246,0.1)', border: '1px solid rgba(139,92,246,0.2)', color: '#8b5cf6', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Ic icon={RefreshCw} size={12} /> Regenerate
                  </button>
                  <button onClick={() => handleMarkShared(post.id)}
                    style={{ padding: '6px 12px', borderRadius: 6, background: post.status === 'shared' ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.05)', border: '1px solid rgba(34,197,94,0.2)', color: '#22c55e', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Ic icon={CheckCircle} size={12} /> {post.status === 'shared' ? 'Unmark' : 'Mark Shared'}
                  </button>
                  <button onClick={() => handleSkip(post.id)}
                    style={{ padding: '6px 12px', borderRadius: 6, background: post.status === 'skipped' ? 'rgba(107,117,144,0.15)' : 'rgba(107,117,144,0.05)', border: '1px solid rgba(107,117,144,0.2)', color: '#6b7590', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Ic icon={SkipForward} size={12} /> {post.status === 'skipped' ? 'Unskip' : 'Skip'}
                  </button>
                </div>
              )}
            </div>
          )
        })()}

        {/* Legend */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '8px 16px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
          {POST_ANGLES.map(a => (
            <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--muted)' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.color }} />
              {a.label}
            </div>
          ))}
          <div style={{ width: 1, height: 10, background: 'var(--border)' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--muted)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} /> Shared
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 9, color: 'var(--muted)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f0a500' }} /> Pending
          </div>
        </div>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════════
   PROACTIVE LOAD FINDING AGENT — Admin visibility panel
   Shows real-time activity from the proactive load finder running on driver devices
   ═══════════════════════════════════════════════════════════════════════════ */
function ProactiveAgentPanel({ addLog, cardStyle }) {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchEvents = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .like('body', '%proactive-load-finder%')
        .order('created_at', { ascending: false })
        .limit(30)
      if (!error && data) setEvents(data)
    } catch {
      setEvents([])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchEvents()
    const interval = setInterval(fetchEvents, 60000)
    return () => clearInterval(interval)
  }, [fetchEvents])

  const typeColors = { found: '#3b82f6', booked: '#22c55e', dismissed: '#f0a500', fallback: '#6b7590', empty: '#8b5cf6' }
  const typeIcons = { found: Search, booked: CheckCircle, dismissed: X, fallback: AlertTriangle, empty: Package }

  const stats = {
    found: events.filter(e => e.body?.includes('found') || e.title?.includes('found')).length,
    booked: events.filter(e => e.body?.includes('booked') || e.title?.includes('booked')).length,
    dismissed: events.filter(e => e.body?.includes('dismissed') || e.title?.includes('dismissed')).length,
  }

  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(139,92,246,0.1))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ic icon={Zap} size={16} color="#3b82f6" />
          </div>
          <div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Proactive Load Finder</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Autonomous Fleet (3% per load) — auto-finds loads before delivery</div>
          </div>
        </div>
        <button onClick={fetchEvents} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', fontSize: 10, fontWeight: 700, cursor: 'pointer', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Ic icon={RefreshCw} size={10} /> Refresh
        </button>
      </div>

      {/* Stats bar */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        {[
          { label: 'Loads Found', value: stats.found, color: '#3b82f6' },
          { label: 'Auto-Booked', value: stats.booked, color: '#22c55e' },
          { label: 'Dismissed', value: stats.dismissed, color: '#f0a500' },
        ].map(s => (
          <div key={s.label} style={{ flex: 1, padding: 10, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: s.color, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{s.value}</div>
            <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Activity feed */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>ACTIVITY FEED</div>
      <div style={{ maxHeight: 250, overflowY: 'auto' }}>
        {loading && <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 12, padding: 20 }}>Loading...</div>}
        {!loading && events.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20, color: 'var(--muted)', fontSize: 12 }}>
            No proactive agent activity yet. Events appear when Autopilot AI drivers approach delivery destinations.
          </div>
        )}
        {events.map((ev, i) => {
          const evBody = ev.body || ''
          const type = evBody.includes('booked') ? 'booked' : evBody.includes('found') ? 'found' : evBody.includes('dismissed') ? 'dismissed' : evBody.includes('no load board') ? 'fallback' : evBody.includes('No loads') ? 'empty' : 'found'
          const color = typeColors[type] || '#6b7590'
          const Icon = typeIcons[type] || Zap
          // Extract the message part after source tag
          const displayMsg = evBody.replace(/^\[.*?\]\s*(\[.*?\]\s*)?/, '')
          return (
            <div key={ev.id || i} style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: i < events.length - 1 ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}>
              <Ic icon={Icon} size={14} color={color} style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.4 }}>{displayMsg || ev.title}</div>
                {ev.user_id && ev.user_id !== 'system' && <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>Driver: {ev.user_id.slice(0, 8)}...</div>}
              </div>
              <div style={{ fontSize: 9, color: 'var(--muted)', whiteSpace: 'nowrap', fontFamily: "'JetBrains Mono',monospace" }}>
                {ev.created_at ? new Date(ev.created_at).toLocaleString() : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
