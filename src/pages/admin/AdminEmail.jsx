import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { apiFetch } from '../../lib/api'
import { Mail, Send, Eye, AlertTriangle, X, Bot, RefreshCw, MessageSquare, Edit3, Inbox, Trash2 } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const EMAIL_GROUPS = [
  { value: 'custom', label: 'Custom Email' },
  { value: 'all', label: 'All Users' },
  { value: 'carriers', label: 'All Carriers' },
  { value: 'brokers', label: 'All Brokers' },
  { value: 'trial', label: 'Trial Users' },
  { value: 'demo', label: 'Demo Leads' },
]

export function AdminEmail() {
  const { showToast } = useApp()
  const [tab, setTab] = useState('compose')
  const [toGroup, setToGroup] = useState('custom')
  const [customTo, setCustomTo] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [groupCount, setGroupCount] = useState(null)
  const [groupEmails, setGroupEmails] = useState([])
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [botThreads, setBotThreads] = useState([])
  const [botLoading, setBotLoading] = useState(false)
  const [selectedThread, setSelectedThread] = useState(null)
  const [botFilter, setBotFilter] = useState('all')

  // Fetch group count when group changes
  useEffect(() => {
    if (toGroup === 'custom') { setGroupCount(null); setGroupEmails([]); return }
    let cancelled = false;
    (async () => {
      let query = supabase.from(toGroup === 'demo' ? 'demo_requests' : 'profiles').select('email')
      if (toGroup === 'carriers') query = query.eq('role', 'carrier')
      else if (toGroup === 'brokers') query = query.eq('role', 'broker')
      else if (toGroup === 'trial') query = query.in('subscription_status', ['trialing', 'trial'])
      // 'all' and 'demo' don't need extra filters
      const { data } = await query
      if (!cancelled) {
        const emails = (data || []).map(d => d.email).filter(Boolean)
        setGroupCount(emails.length)
        setGroupEmails(emails)
      }
    })()
    return () => { cancelled = true }
  }, [toGroup])

  // Fetch sent history
  const fetchLogs = useCallback(async () => {
    setLogsLoading(true)
    const { data } = await supabase
      .from('email_logs')
      .select('*')
      .eq('template', 'admin_broadcast')
      .order('created_at', { ascending: false })
      .limit(100)
    setLogs(data || [])
    setLogsLoading(false)
  }, [])

  useEffect(() => { if (tab === 'history') fetchLogs() }, [tab, fetchLogs])

  // Fetch bot email threads
  const fetchBotThreads = useCallback(async () => {
    setBotLoading(true)
    let query = supabase
      .from('ai_email_threads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)
    if (botFilter === 'escalated') query = query.eq('escalated', true)
    else if (botFilter === 'failed') query = query.eq('status', 'failed')
    const { data } = await query
    setBotThreads(data || [])
    setBotLoading(false)
  }, [botFilter])

  useEffect(() => { if (tab === 'bot-inbox') fetchBotThreads() }, [tab, fetchBotThreads])

  // Stats
  const today = new Date().toDateString()
  const todayCount = logs.filter(l => new Date(l.created_at).toDateString() === today).length
  const weekAgo = new Date(Date.now() - 7 * 86400000)
  const weekCount = logs.filter(l => new Date(l.created_at) > weekAgo).length

  const getRecipients = () => {
    if (toGroup === 'custom') {
      return customTo.split(',').map(e => e.trim()).filter(e => e && e.includes('@'))
    }
    return groupEmails
  }

  const buildHtml = () => {
    const paragraphs = body.split('\n\n').map(p => p.trim()).filter(Boolean)
    return paragraphs.map(p =>
      `<p style="color:#c8c8d0;font-size:14px;line-height:1.7;margin:0 0 14px;">${p.replace(/\n/g, '<br>')}</p>`
    ).join('')
  }

  const previewHtml = () => {
    const content = buildHtml()
    return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0a0a0e;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:560px;margin:0 auto;padding:40px 20px;">
<div style="text-align:center;margin-bottom:32px;">
<span style="font-size:32px;letter-spacing:4px;color:#fff;font-weight:800;">QI<span style="color:#f0a500;">VORI</span></span>
<span style="font-size:12px;color:#4d8ef0;letter-spacing:2px;font-weight:700;margin-left:6px;">AI</span>
</div>
<div style="background:#16161e;border:1px solid #2a2a35;border-radius:16px;padding:32px 24px;margin-bottom:24px;">
${content}
</div>
<div style="text-align:center;padding-top:16px;">
<p style="color:#555;font-size:11px;margin:0;">Qivori AI - AI-Powered TMS for Trucking</p>
<p style="color:#555;font-size:11px;margin:4px 0 0;">Questions? Reply to this email - hello@qivori.com</p>
</div></div></body></html>`
  }

  const handleSend = async () => {
    const recipients = getRecipients()
    if (recipients.length === 0) { showToast('', 'Error', 'No recipients'); return }
    if (!subject.trim()) { showToast('', 'Error', 'Subject is required'); return }
    if (!body.trim()) { showToast('', 'Error', 'Message body is required'); return }

    setShowConfirm(false)
    setSending(true)
    try {
      const res = await apiFetch('/api/admin-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: recipients, subject: subject.trim(), html: buildHtml() }),
      })
      const data = await res.json()
      if (data.sent > 0) {
        showToast('', 'Emails Sent', `${data.sent} sent, ${data.failed} failed`)
        setSubject('')
        setBody('')
        setCustomTo('')
      } else if (data.error) {
        showToast('', 'Error', data.error)
      } else {
        showToast('', 'Failed', 'No emails were sent')
      }
    } catch (e) {
      showToast('', 'Error', 'Failed to send emails')
    }
    setSending(false)
  }

  const formatDate = (d) => {
    if (!d) return '—'
    const date = new Date(d)
    const now = new Date()
    const diff = now - date
    if (diff < 3600000) return Math.floor(diff / 60000) + 'min ago'
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'hr ago'
    if (diff < 604800000) return Math.floor(diff / 86400000) + ' day(s) ago'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100vh', maxHeight: '100%', display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 100 }}>
      {/* Stats */}
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Sent Today', value: todayCount, color: todayCount > 0 ? 'var(--accent)' : 'var(--muted)' },
          { label: 'Sent This Week', value: weekCount, color: weekCount > 0 ? 'var(--success)' : 'var(--muted)' },
          { label: 'Total Logged', value: logs.length, color: 'var(--accent2)' },
          { label: 'Bounce Rate', value: '—', color: 'var(--muted)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4 }}>
        {[{ id: 'compose', label: 'Compose', icon: Edit3 }, { id: 'bot-inbox', label: 'Bot Inbox', icon: Bot }, { id: 'history', label: 'Sent History', icon: Inbox }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              background: tab === t.id ? 'var(--accent)' : 'var(--surface)',
              border: tab === t.id ? 'none' : '1px solid var(--border)',
              color: tab === t.id ? '#000' : 'var(--muted)',
              padding: '8px 18px', borderRadius: 8, cursor: 'pointer',
              fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
            }}>
            <Ic icon={t.icon} size={13} /> {t.label}
          </button>
        ))}
      </div>

      {/* Compose Tab */}
      {tab === 'compose' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* Left: Form */}
          <div className="panel fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="panel-header">
              <div className="panel-title"><Ic icon={Edit3} size={14} /> New Email</div>
            </div>
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
              {/* To */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>To</label>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <select className="form-input" value={toGroup} onChange={e => setToGroup(e.target.value)}
                    style={{ width: 180, height: 36, fontSize: 12 }}>
                    {EMAIL_GROUPS.map(g => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                  {toGroup !== 'custom' && groupCount !== null && (
                    <span style={{ background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 20, padding: '3px 12px', fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
                      {groupCount} recipient{groupCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                {toGroup === 'custom' && (
                  <input className="form-input" value={customTo} onChange={e => setCustomTo(e.target.value)}
                    placeholder="email@example.com, another@example.com"
                    style={{ marginTop: 6, fontSize: 12, height: 36 }} />
                )}
              </div>

              {/* Subject */}
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Subject</label>
                <input className="form-input" value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="Email subject line" style={{ fontSize: 12, height: 36 }} />
              </div>

              {/* Body */}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', marginBottom: 6 }}>Message</label>
                <textarea className="form-input" value={body} onChange={e => setBody(e.target.value)}
                  placeholder="Write your message here (plain text — auto-wrapped in Qivori branded template)..."
                  style={{ fontSize: 12, lineHeight: 1.6, resize: 'vertical', minHeight: 180, flex: 1 }} />
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
                <button className="btn btn-ghost" onClick={() => setShowPreview(true)}
                  disabled={!body.trim()} style={{ fontSize: 12, flex: 1, justifyContent: 'center', padding: '10px 0' }}>
                  <Ic icon={Eye} size={13} /> Preview
                </button>
                <button className="btn btn-primary" onClick={() => setShowConfirm(true)}
                  disabled={sending || !subject.trim() || !body.trim() || (toGroup === 'custom' && !customTo.trim())}
                  style={{ fontSize: 12, flex: 1, justifyContent: 'center', padding: '10px 0', opacity: sending ? 0.7 : 1 }}>
                  <Ic icon={Send} size={13} /> {sending ? 'Sending...' : 'Send Email'}
                </button>
              </div>
            </div>
          </div>

          {/* Right: Live Preview */}
          <div className="panel fade-in" style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="panel-header">
              <div className="panel-title"><Ic icon={Eye} size={14} /> Live Preview</div>
              {subject && <span style={{ fontSize: 11, color: 'var(--muted)' }}>{subject}</span>}
            </div>
            <div style={{ flex: 1, padding: 0, minHeight: 400 }}>
              {body.trim() ? (
                <iframe title="Email Preview" srcDoc={previewHtml()}
                  style={{ width: '100%', height: '100%', minHeight: 400, border: 'none', borderRadius: '0 0 12px 12px' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, color: 'var(--muted)', fontSize: 13, flexDirection: 'column', gap: 8 }}>
                  <Ic icon={Mail} size={28} style={{ opacity: 0.3 }} />
                  Start typing to see preview
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bot Inbox Tab */}
      {tab === 'bot-inbox' && (
        <div style={{ display: 'flex', gap: 16 }}>
          {/* Left: Thread List */}
          <div className="panel fade-in" style={{ flex: 1, minWidth: 0 }}>
            <div className="panel-header" style={{ flexWrap: 'wrap', gap: 8 }}>
              <div className="panel-title"><Ic icon={Bot} size={14} /> AI Email Conversations</div>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                {['all', 'escalated', 'failed'].map(f => (
                  <button key={f} onClick={() => setBotFilter(f)}
                    style={{
                      background: botFilter === f ? 'var(--accent)' : 'transparent',
                      border: botFilter === f ? 'none' : '1px solid var(--border)',
                      color: botFilter === f ? '#000' : 'var(--muted)',
                      padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                    }}>
                    {f}
                  </button>
                ))}
                <button className="btn btn-ghost" onClick={fetchBotThreads} style={{ fontSize: 11, padding: '4px 8px' }}>
                  <Ic icon={RefreshCw} size={12} />
                </button>
              </div>
            </div>
            {botLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading bot conversations...</div>
            ) : botThreads.length === 0 ? (
              <div style={{ padding: 50, textAlign: 'center', color: 'var(--muted)', fontSize: 13, flexDirection: 'column', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Ic icon={Bot} size={28} style={{ opacity: 0.3 }} />
                {botFilter === 'all' ? 'No AI email conversations yet. Set up Resend inbound webhooks to start.' : `No ${botFilter} conversations.`}
              </div>
            ) : (
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {botThreads.map(t => (
                  <div key={t.id} onClick={() => setSelectedThread(t)}
                    style={{
                      padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer',
                      background: selectedThread?.id === t.id ? 'rgba(240,165,0,0.06)' : 'transparent',
                    }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{t.sender_email}</span>
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                        {t.escalated && <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>Escalated</span>}
                        <span style={{
                          background: t.status === 'sent' ? 'rgba(34,197,94,0.15)' : t.status === 'failed' ? 'rgba(239,68,68,0.15)' : 'rgba(240,165,0,0.15)',
                          color: t.status === 'sent' ? '#22c55e' : t.status === 'failed' ? '#ef4444' : '#f0a500',
                          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
                        }}>{t.status}</span>
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{t.subject || '(no subject)'}</div>
                    <div style={{ fontSize: 11, color: 'var(--text)', opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {t.sender_message?.substring(0, 80)}...
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{formatDate(t.created_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Thread Detail */}
          <div className="panel fade-in" style={{ flex: 1, minWidth: 0 }}>
            {selectedThread ? (
              <>
                <div className="panel-header">
                  <div className="panel-title" style={{ fontSize: 12 }}>{selectedThread.subject || '(no subject)'}</div>
                  <button className="btn btn-ghost" onClick={() => setSelectedThread(null)} style={{ fontSize: 11, padding: '4px 8px' }}>
                    <Ic icon={X} size={14} />
                  </button>
                </div>
                <div style={{ padding: 18, overflowY: 'auto', maxHeight: 500 }}>
                  {/* Sender info */}
                  <div style={{ marginBottom: 16, padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700 }}>{selectedThread.sender_email}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{new Date(selectedThread.created_at).toLocaleString()}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {selectedThread.escalated && <span style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>ESCALATED</span>}
                        <span style={{
                          background: selectedThread.status === 'sent' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                          color: selectedThread.status === 'sent' ? '#22c55e' : '#ef4444',
                          fontSize: 9, fontWeight: 700, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase',
                        }}>{selectedThread.status}</span>
                      </div>
                    </div>
                  </div>

                  {/* Inbound message */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      <Ic icon={Mail} size={10} /> Customer Message
                    </div>
                    <div style={{ background: 'rgba(77,142,240,0.06)', border: '1px solid rgba(77,142,240,0.15)', borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                      {selectedThread.sender_message}
                    </div>
                  </div>

                  {/* AI Reply */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                      <Ic icon={Bot} size={10} /> AI Reply
                    </div>
                    <div style={{ background: 'rgba(240,165,0,0.04)', border: '1px solid rgba(240,165,0,0.12)', borderRadius: 10, padding: 14, fontSize: 13, lineHeight: 1.6, color: 'var(--text)', whiteSpace: 'pre-wrap' }}>
                      {selectedThread.ai_reply}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: 8, paddingTop: 8 }}>
                    <button className="btn btn-ghost" onClick={async () => {
                      const { error } = await supabase.from('ai_email_threads').update({ escalated: true, status: 'escalated' }).eq('id', selectedThread.id)
                      if (!error) {
                        showToast('', 'Escalated', 'Thread marked for human review')
                        setSelectedThread({ ...selectedThread, escalated: true, status: 'escalated' })
                        fetchBotThreads()
                      }
                    }} style={{ fontSize: 11 }} disabled={selectedThread.escalated}>
                      <Ic icon={AlertTriangle} size={12} /> {selectedThread.escalated ? 'Escalated' : 'Escalate to Team'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => {
                      setTab('compose')
                      setToGroup('custom')
                      setCustomTo(selectedThread.sender_email)
                      setSubject(selectedThread.subject?.startsWith('Re:') ? selectedThread.subject : `Re: ${selectedThread.subject}`)
                    }} style={{ fontSize: 11 }}>
                      <Ic icon={Send} size={12} /> Reply Manually
                    </button>
                    <button className="btn btn-ghost" onClick={async () => {
                      if (!confirm('Delete this conversation?')) return
                      const { error } = await supabase.from('ai_email_threads').delete().eq('id', selectedThread.id)
                      if (!error) {
                        showToast('', 'Deleted', 'Conversation removed')
                        setSelectedThread(null)
                        fetchBotThreads()
                      }
                    }} style={{ fontSize: 11, color: '#ef4444' }}>
                      <Ic icon={Trash2} size={12} /> Delete
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: 400, color: 'var(--muted)', fontSize: 13, flexDirection: 'column', gap: 8 }}>
                <Ic icon={MessageSquare} size={28} style={{ opacity: 0.3 }} />
                Select a conversation to view details
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sent History Tab */}
      {tab === 'history' && (
        <div className="panel fade-in">
          <div className="panel-header">
            <div className="panel-title"><Ic icon={Inbox} size={14} /> Sent Emails</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-ghost" onClick={fetchLogs} style={{ fontSize: 11 }}>
                <Ic icon={RefreshCw} size={12} /> Refresh
              </button>
              {logs.length > 0 && (
                <button className="btn btn-ghost" style={{ fontSize: 11, color: 'var(--danger)' }}
                  onClick={async () => {
                    if (!confirm('Clear all sent history?')) return
                    await supabase.from('email_logs').delete().eq('template', 'admin_broadcast')
                    setLogs([])
                    showToast('', 'Cleared', 'Sent history cleared')
                  }}>
                  <Ic icon={Trash2} size={12} /> Clear All
                </button>
              )}
            </div>
          </div>
          {logsLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading sent history...</div>
          ) : logs.length === 0 ? (
            <div style={{ padding: 50, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
              <Ic icon={Mail} size={28} style={{ marginBottom: 10, opacity: 0.3 }} /><br />
              No emails sent yet. Use the Compose tab to send your first email.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Recipient</th>
                  <th>Subject</th>
                  <th>Sent By</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontSize: 12 }}>{l.email || '—'}</td>
                    <td style={{ fontSize: 12, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {l.metadata?.subject || '—'}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{l.metadata?.sent_by || '—'}</td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(l.created_at)}</td>
                    <td>
                      <button className="btn btn-ghost" style={{ padding: '2px 6px', color: 'var(--danger)' }}
                        onClick={async () => {
                          await supabase.from('email_logs').delete().eq('id', l.id)
                          setLogs(prev => prev.filter(x => x.id !== l.id))
                        }}>
                        <Ic icon={Trash2} size={11} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowPreview(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, width: 640, maxWidth: '95%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Email Preview</div>
              <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer' }}>
                <Ic icon={X} size={18} />
              </button>
            </div>
            <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
              <div style={{ marginBottom: 12, fontSize: 12, color: 'var(--muted)' }}>
                <strong>Subject:</strong> {subject || '(no subject)'}
              </div>
              <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <iframe title="Email Preview" srcDoc={previewHtml()}
                  style={{ width: '100%', height: 450, border: 'none', background: '#0a0a0e' }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Send Modal */}
      {showConfirm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 999, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowConfirm(false)}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 24, width: 420, maxWidth: '90%' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Ic icon={Send} size={16} color="var(--accent)" /> Confirm Send
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>Sending to</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
                {toGroup === 'custom'
                  ? getRecipients().length + ' recipient' + (getRecipients().length !== 1 ? 's' : '')
                  : (groupCount || 0) + ' ' + EMAIL_GROUPS.find(g => g.value === toGroup)?.label}
              </div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Subject</div>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{subject}</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-ghost" onClick={() => setShowConfirm(false)} style={{ fontSize: 12, flex: 1, justifyContent: 'center', padding: 10 }}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSend} style={{ fontSize: 12, flex: 1, justifyContent: 'center', padding: 10 }}>
                <Ic icon={Send} size={13} /> Send Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
