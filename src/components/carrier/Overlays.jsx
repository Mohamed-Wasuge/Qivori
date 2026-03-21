import React, { useState, useEffect, useCallback } from 'react'
import {
  Search, Package, Receipt, DollarSign, User, Building2, Zap, FileText, Fuel, Truck, BarChart2
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { apiFetch } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'
import { Ic } from './shared'

// ── GLOBAL SEARCH MODAL ────────────────────────────────────────────────────────
export function SearchModal({ open, onClose, onTabChange }) {
  const { loads, invoices, expenses } = useCarrier()
  const [q, setQ] = useState('')
  const inputRef = useCallback(el => { if (el && open) el.focus() }, [open])

  useEffect(() => {
    if (!open) { setQ(''); return }
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  const results = q.trim().length < 2 ? [] : [
    ...loads.filter(l =>
      [l.loadId, l.broker, l.driver, l.origin, l.dest, l.status, l.commodity]
        .some(v => v && String(v).toLowerCase().includes(q.toLowerCase()))
    ).map(l => ({
      type: 'Load', icon: Package, label: l.loadId,
      sub: `${l.origin?.split(',')[0]} → ${l.dest?.split(',')[0]} · ${l.broker} · ${l.status}`,
      color: 'var(--accent)',
      action: () => { onTabChange('loads'); onClose() }
    })),
    ...invoices.filter(i =>
      [i.id, i.loadId, i.broker, i.route, i.status]
        .some(v => v && String(v).toLowerCase().includes(q.toLowerCase()))
    ).map(i => ({
      type: 'Invoice', icon: Receipt, label: i.id,
      sub: `${i.route} · ${i.broker} · $${i.amount?.toLocaleString()} · ${i.status}`,
      color: 'var(--accent2)',
      action: () => { onTabChange('financials'); onClose() }
    })),
    ...expenses.filter(e =>
      [e.cat, e.merchant, e.load, e.driver, e.notes]
        .some(v => v && String(v).toLowerCase().includes(q.toLowerCase()))
    ).map(e => ({
      type: 'Expense', icon: DollarSign, label: e.merchant || e.cat,
      sub: `${e.cat} · $${e.amount} · ${e.date}${e.load ? ' · ' + e.load : ''}`,
      color: 'var(--accent3)',
      action: () => { onTabChange('financials'); onClose() }
    })),
  ].slice(0, 12)

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 80, background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ width: 560, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        {/* Search input */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
          <Ic icon={Search} size={16} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Search loads, invoices, expenses, drivers, brokers…"
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 14, fontFamily: "'DM Sans',sans-serif" }} />
          {q && <button onClick={() => setQ('')} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: 16 }}>✕</button>}
          <span style={{ fontSize: 10, color: 'var(--muted)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>ESC</span>
        </div>

        {/* Results */}
        {q.trim().length >= 2 && (
          <div style={{ maxHeight: 420, overflowY: 'auto' }}>
            {results.length === 0
              ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No results for "{q}"</div>
              : results.map((r, i) => (
                <div key={i} onClick={r.action}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', cursor: 'pointer', borderBottom: '1px solid var(--border)' }}
                  onMouseOver={e => e.currentTarget.style.background = 'var(--surface2)'}
                  onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 34, height: 34, borderRadius: 8, background: r.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic icon={r.icon} size={16} color={r.color} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: r.color, marginBottom: 2 }}>{r.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.sub}</div>
                  </div>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: r.color + '15', color: r.color }}>{r.type}</span>
                </div>
              ))
            }
          </div>
        )}

        {/* Shortcuts hint */}
        {q.trim().length < 2 && (
          <div style={{ padding: '16px 18px', display: 'flex', gap: 16 }}>
            {[[Package,'Loads'],[Receipt,'Invoices'],[DollarSign,'Expenses'],[User,'Drivers'],[Building2,'Brokers']].map(([icon, label]) => (
              <button key={label} onClick={() => setQ(label.toLowerCase())}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 11, color: 'var(--muted)', fontFamily: "'DM Sans',sans-serif" }}>
                <Ic icon={icon} size={12} /> {label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ── AI CHATBOX ─────────────────────────────────────────────────────────────────
export const SUGGESTED_QUESTIONS = [
  'Is $2.50/mi good for a dry van right now?',
  'What\'s my profit margin this month?',
  'Which of my invoices are overdue?',
  'What should I charge per mile right now?',
  'How much am I saving vs a human dispatcher?',
  'When is my IFTA filing due?',
]

export function AIChatbox() {
  const { language: currentLang } = useTranslation()
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useCallback(el => { if (el) el.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  const { loads, invoices, expenses, totalRevenue, totalExpenses } = useCarrier()

  const buildContext = () => {
    const activeLoads  = loads.filter(l => !['Delivered','Invoiced'].includes(l.status))
    const unpaid       = invoices.filter(i => i.status === 'Unpaid')
    const netProfit    = totalRevenue - totalExpenses
    return [
      `CARRIER ACCOUNT SNAPSHOT (as of today):`,
      `- Revenue MTD: $${totalRevenue.toLocaleString()}`,
      `- Expenses MTD: $${totalExpenses.toLocaleString()}`,
      `- Net Profit MTD: $${netProfit.toLocaleString()}`,
      `- Active loads: ${activeLoads.length} (${activeLoads.map(l => `${l.loadId} ${l.origin?.split(',')[0]}→${l.dest?.split(',')[0]} $${l.gross}`).join(', ')})`,
      `- Unpaid invoices: ${unpaid.length} totaling $${unpaid.reduce((s,i)=>s+(i.amount||0),0).toLocaleString()}`,
      `- Recent expenses: ${expenses.slice(0,3).map(e=>`${e.cat} $${e.amount} ${e.merchant||''}`).join(', ')}`,
    ].join('\n')
  }

  const send = async (text) => {
    const userText = text || input.trim()
    if (!userText) return
    const newMessages = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages, context: buildContext(), language: currentLang }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`)
      }
      const data = await res.json()
      setMessages(m => [...m, { role: 'assistant', content: data.reply || data.error || 'No response.' }])
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: 'Connection error: ' + (err.message || 'Check your internet connection.') }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {/* Chat toggle button */}
      <button onClick={() => setOpen(o => !o)}
        style={{ position: 'fixed', bottom: 24, right: 24, width: 52, height: 52, borderRadius: '50%', background: open ? 'var(--surface2)' : 'var(--accent)', border: '2px solid ' + (open ? 'var(--border)' : 'var(--accent)'), boxShadow: '0 4px 20px rgba(240,165,0,0.4)', cursor: 'pointer', fontSize: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900, transition: 'all 0.2s' }}>
        {open ? '✕' : <Ic icon={Zap} size={22} color="#000" />}
      </button>

      {/* Chat panel */}
      {open && (
        <div style={{ position: 'fixed', bottom: 88, right: 24, width: 360, height: 520, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: '0 16px 48px rgba(0,0,0,0.5)', display: 'flex', flexDirection: 'column', zIndex: 900, overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'linear-gradient(135deg,rgba(240,165,0,0.08),rgba(0,212,170,0.05))', display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(240,165,0,0.15)', border: '1px solid rgba(240,165,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic icon={Zap} size={16} color="var(--accent)" /></div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Qivori AI</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>Ask me anything about your business</div>
            </div>
            <div style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {messages.length === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: '8px 0' }}>Try asking:</div>
                {SUGGESTED_QUESTIONS.map(q => (
                  <button key={q} onClick={() => send(q)}
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', fontSize: 12, color: 'var(--text)', cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans',sans-serif", transition: 'border-color 0.15s' }}
                    onMouseOver={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onMouseOut={e => e.currentTarget.style.borderColor = 'var(--border)'}>
                    {q}
                  </button>
                ))}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '85%', padding: '10px 13px', borderRadius: m.role === 'user' ? '12px 12px 4px 12px' : '12px 12px 12px 4px',
                  background: m.role === 'user' ? 'var(--accent)' : 'var(--surface2)',
                  color: m.role === 'user' ? '#000' : 'var(--text)',
                  fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display: 'flex', alignItems: 'flex-start' }}>
                <div style={{ background: 'var(--surface2)', borderRadius: '12px 12px 12px 4px', padding: '10px 14px', fontSize: 18, letterSpacing: 4 }}>
                  <span style={{ animation: 'pulse 1s infinite' }}>···</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div style={{ padding: '10px 12px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8 }}>
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="Ask Q..."
              style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none' }}
            />
            <button onClick={() => send()} disabled={loading || !input.trim()}
              style={{ background: input.trim() ? 'var(--accent)' : 'var(--surface2)', border: 'none', borderRadius: 10, width: 38, cursor: input.trim() ? 'pointer' : 'default', fontSize: 16, color: input.trim() ? '#000' : 'var(--muted)', transition: 'all 0.15s' }}>
              ↑
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ── QUICK ACTIONS BAR ──────────────────────────────────────────────────────────
export function QuickActions({ onTabChange }) {
  const { showToast } = useApp()
  const [open, setOpen] = useState(false)

  const actions = [
    { icon: FileText, label: 'Log Rate Con',      color: 'var(--accent)',  onClick: () => { onTabChange('loads'); setOpen(false); showToast('', 'Loads', 'Drop a rate confirmation to log a new load') } },
    { icon: Fuel, label: 'Add Expense',        color: 'var(--warning)', onClick: () => { onTabChange('financials'); setOpen(false) } },
    { icon: Package, label: 'Update Load Status', color: 'var(--accent2)', onClick: () => { onTabChange('loads'); setOpen(false); showToast('', 'Loads', 'Drag a load card to update its status') } },
    { icon: Truck, label: 'Assign Driver',      color: 'var(--accent3)', onClick: () => { onTabChange('loads'); setOpen(false); showToast('', 'Loads', 'Click a load card to assign a driver') } },
    { icon: DollarSign, label: 'Pay a Driver',       color: 'var(--success)', onClick: () => { onTabChange('drivers'); setOpen(false) } },
    { icon: BarChart2, label: 'View P&L',           color: 'var(--accent)',  onClick: () => { onTabChange('financials'); setOpen(false) } },
  ]

  return (
    <div style={{ position: 'fixed', bottom: 24, left: 24, zIndex: 900, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
      {/* Action items */}
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 }}>
          {actions.map((a, i) => (
            <button key={a.label} onClick={a.onClick}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', background: 'var(--surface)', border: `1px solid ${a.color}30`, borderRadius: 10, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", boxShadow: '0 4px 16px rgba(0,0,0,0.4)', animation: `slideUp 0.2s ease ${i * 0.04}s both`, whiteSpace: 'nowrap' }}>
              <span><Ic icon={a.icon} size={16} /></span>
              <span style={{ fontSize: 12, fontWeight: 700, color: a.color }}>{a.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button onClick={() => setOpen(o => !o)}
        style={{ width: 52, height: 52, borderRadius: '50%', background: open ? 'var(--surface2)' : 'var(--surface)', border: `2px solid ${open ? 'var(--border)' : 'rgba(240,165,0,0.4)'}`, boxShadow: '0 4px 16px rgba(0,0,0,0.3)', cursor: 'pointer', fontSize: open ? 20 : 22, display: 'flex', alignItems: 'center', justifyContent: 'center', color: open ? 'var(--muted)' : 'var(--accent)', transition: 'all 0.2s', transform: open ? 'rotate(45deg)' : 'none' }}>
        {open ? '✕' : <Ic icon={Zap} size={22} color="var(--accent)" />}
      </button>

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.2; }
        }
      `}</style>
    </div>
  )
}
