import React, { useState, useEffect } from 'react'
import { Ic, S } from '../shared'
import { useApp } from '../../../context/AppContext'
import { apiFetch } from '../../../lib/api'
import {
  Shield, Send, Phone, MessageCircle, Package, DollarSign, Clock, Target, Bell, CheckCircle,
} from 'lucide-react'

// ─── SMS NOTIFICATION SETTINGS ─────────────────────────────────────────────────
export function SMSSettings() {
  const { showToast } = useApp()
  const [phone, setPhone] = useState('')
  const [countryCode, setCountryCode] = useState('+1')
  const [enabled, setEnabled] = useState({
    loadStatus: true,
    invoicePaid: true,
    invoiceOverdue: true,
    complianceExpiring: true,
    newLoadMatch: false,
    deliveryReminder: true,
  })
  const [verified, setVerified] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [testSending, setTestSending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [smsHistory, setSmsHistory] = useState([])

  const fullPhone = `${countryCode}${phone.replace(/[^\d]/g, '')}`

  // Load saved preferences from Supabase on mount
  useEffect(() => {
    const loadPrefs = async () => {
      try {
        const res = await apiFetch('/api/user-profile', { method: 'GET' })
        if (res.ok) {
          const data = await res.json()
          if (data.sms_phone) {
            const savedPhone = data.sms_phone || ''
            if (savedPhone.startsWith('+1')) {
              setCountryCode('+1')
              setPhone(savedPhone.slice(2))
            } else if (savedPhone.startsWith('+')) {
              const code = savedPhone.slice(0, savedPhone.length > 11 ? 3 : 2)
              setCountryCode(code)
              setPhone(savedPhone.slice(code.length))
            } else {
              setPhone(savedPhone)
            }
            setVerified(!!data.sms_verified)
          }
          if (data.sms_preferences) {
            setEnabled(prev => ({ ...prev, ...data.sms_preferences }))
          }
        }
      } catch { /* no saved prefs yet */ }
    }
    loadPrefs()
  }, [])

  const ALERTS = [
    { key:'loadStatus',        icon:Package,      label:'Load Status Updates',     desc:'Get notified when load status changes (booked, in transit, delivered)', color:'var(--accent)' },
    { key:'invoicePaid',       icon:DollarSign,   label:'Invoice Paid',            desc:'Alert when a broker pays your invoice with amount details',              color:'var(--success)' },
    { key:'invoiceOverdue',    icon:Clock,         label:'Invoice Overdue Alerts',  desc:'Reminder when invoices are past due with days overdue',                 color:'var(--danger)' },
    { key:'complianceExpiring',icon:Shield,        label:'Compliance Deadlines',    desc:'Alerts when licenses, insurance, or registrations are expiring soon',   color:'#f59e0b' },
    { key:'newLoadMatch',      icon:Target,        label:'New Load Matches',        desc:'Notifications when AI finds loads matching your lanes and equipment',   color:'var(--accent2)' },
    { key:'deliveryReminder',  icon:Bell,          label:'Delivery Reminders',      desc:'Reminders before scheduled delivery dates to stay on track',            color:'#8b5cf6' },
  ]

  const toggleSetting = (key) => {
    setEnabled(prev => ({ ...prev, [key]: !prev[key] }))
    showToast('', ALERTS.find(a => a.key === key)?.label || key, !enabled[key] ? 'Enabled' : 'Disabled')
  }

  const verifyPhone = async () => {
    const digits = phone.replace(/[^\d]/g, '')
    if (!digits || digits.length < 10) {
      showToast('error', 'Invalid', 'Enter a valid phone number (at least 10 digits)')
      return
    }
    setVerifying(true)
    try {
      const res = await apiFetch('/api/sms-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test', to: fullPhone, data: {} }),
      })
      const data = await res.json()
      if (data.success) {
        setVerified(true)
        showToast('success', 'Verified', 'Verification SMS sent — check your phone')
      } else {
        showToast('error', 'Failed', data.error || 'Could not verify number')
      }
    } catch {
      showToast('error', 'Error', 'SMS service unavailable')
    }
    setVerifying(false)
  }

  const sendTest = async () => {
    if (!phone) { showToast('error', 'No Phone', 'Enter your phone number first'); return }
    setTestSending(true)
    try {
      const res = await apiFetch('/api/sms-notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'test', to: fullPhone, data: {} }),
      })
      const data = await res.json()
      if (data.success) {
        showToast('success', 'SMS Sent!', 'Check your phone for the test message')
        setSmsHistory(prev => [{ event: 'test', time: new Date().toLocaleString(), status: 'sent' }, ...prev.slice(0, 4)])
      } else {
        showToast('error', 'Failed', data.error || 'Could not send SMS')
      }
    } catch {
      showToast('error', 'Error', 'SMS service not configured yet')
    }
    setTestSending(false)
  }

  const savePreferences = async () => {
    setSaving(true)
    try {
      const res = await apiFetch('/api/user-profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sms_phone: fullPhone,
          sms_verified: verified,
          sms_preferences: enabled,
        }),
      })
      if (res.ok) {
        showToast('success', 'Saved', 'SMS notification preferences updated')
      } else {
        showToast('error', 'Error', 'Failed to save preferences')
      }
    } catch {
      showToast('error', 'Error', 'Could not save preferences')
    }
    setSaving(false)
  }

  const COUNTRY_CODES = [
    { code: '+1', label: 'US/CA +1' },
    { code: '+44', label: 'UK +44' },
    { code: '+52', label: 'MX +52' },
    { code: '+91', label: 'IN +91' },
    { code: '+61', label: 'AU +61' },
    { code: '+49', label: 'DE +49' },
  ]

  const enabledCount = Object.values(enabled).filter(Boolean).length

  return (
    <div style={S.page}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>SMS NOTIFICATIONS</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Get text alerts for load updates, payments, compliance deadlines, and more</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <span style={S.badge(enabledCount > 0 ? 'var(--success)' : 'var(--muted)')}>
            {enabledCount}/{ALERTS.length} active
          </span>
        </div>
      </div>

      {/* Phone Number Setup */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={S.panelTitle}><Ic icon={Phone} /> Phone Number</div>
          </div>
          {verified && <span style={S.badge('var(--success)')}><Ic icon={CheckCircle} size={10} /> Verified</span>}
        </div>
        <div style={{ padding:20 }}>
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <select
              value={countryCode}
              onChange={e => setCountryCode(e.target.value)}
              style={{ width:100, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 8px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', cursor:'pointer' }}
            >
              {COUNTRY_CODES.map(c => (
                <option key={c.code} value={c.code}>{c.label}</option>
              ))}
            </select>
            <input
              value={phone}
              onChange={e => { setPhone(e.target.value); setVerified(false) }}
              placeholder="(555) 123-4567"
              style={{ flex:1, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'12px 14px', color:'var(--text)', fontSize:14, fontFamily:"'DM Sans',sans-serif", outline:'none' }}
            />
            <button onClick={verifyPhone} disabled={verifying}
              style={{ padding:'12px 20px', fontSize:13, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                background: verified ? 'rgba(34,197,94,0.15)' : 'var(--accent)', color: verified ? 'var(--success)' : '#000', opacity:verifying?0.7:1, whiteSpace:'nowrap' }}>
              {verifying ? 'Verifying...' : verified ? 'Verified' : 'Verify'}
            </button>
          </div>
          <div style={{ display:'flex', gap:8, alignItems:'center' }}>
            <button onClick={sendTest} disabled={testSending} className="btn btn-ghost" style={{ fontSize:12 }}>
              <Ic icon={Send} size={12} /> {testSending ? 'Sending...' : 'Send Test SMS'}
            </button>
            <div style={{ fontSize:11, color:'var(--muted)' }}>
              {fullPhone && phone ? `Will send to: ${countryCode} ${phone}` : 'Enter a phone number to receive alerts'}
            </div>
          </div>
        </div>
      </div>

      {/* Alert Settings */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Bell} /> Alert Preferences</div>
          <div style={{ display:'flex', gap:8 }}>
            <button
              className="btn btn-ghost"
              style={{ fontSize:11, padding:'4px 10px' }}
              onClick={() => {
                const allOn = Object.values(enabled).every(Boolean)
                const newState = {}
                Object.keys(enabled).forEach(k => { newState[k] = !allOn })
                setEnabled(newState)
                showToast('', 'Alerts', allOn ? 'All disabled' : 'All enabled')
              }}
            >
              {Object.values(enabled).every(Boolean) ? 'Disable All' : 'Enable All'}
            </button>
          </div>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:10 }}>
          {ALERTS.map(a => (
            <div key={a.key} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:'var(--surface2)', borderRadius:10, transition:'all 0.15s',
              opacity: enabled[a.key] ? 1 : 0.6 }}>
              <div style={{ width:36, height:36, borderRadius:10, background: (a.color || 'var(--accent)') + '12', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Ic icon={a.icon} size={16} color={a.color || 'var(--accent)'} />
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>{a.label}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{a.desc}</div>
              </div>
              <div
                style={{ width:44, height:24, background:enabled[a.key] ? (a.color || 'var(--accent)') : 'var(--border)', borderRadius:12, cursor:'pointer', position:'relative', transition:'background 0.2s', flexShrink:0 }}
                onClick={() => toggleSetting(a.key)}
              >
                <div style={{ width:18, height:18, background:'#fff', borderRadius:'50%', position:'absolute', top:3, transition:'left 0.2s', left:enabled[a.key] ? 23 : 3 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Message Preview */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={MessageCircle} /> Message Preview</div>
        </div>
        <div style={{ padding:16, display:'flex', flexDirection:'column', gap:8 }}>
          {[
            { event:'load_status',        key:'loadStatus',        msg:'Qivori: Load LD-4821 status \u2192 Delivered. Chicago\u2192Dallas. Open app: qivori.com' },
            { event:'invoice_paid',       key:'invoicePaid',       msg:'Qivori: Invoice INV-1092 PAID! $3,450 received from XPO. Balance: $12,800' },
            { event:'invoice_overdue',    key:'invoiceOverdue',    msg:'Qivori: Invoice INV-1088 is 14 days overdue ($2,100). Follow up with CH Robinson.' },
            { event:'compliance_expiring', key:'complianceExpiring', msg:'Qivori: Your CDL expires in 30 days. Renew now to stay compliant.' },
            { event:'new_load_match',     key:'newLoadMatch',      msg:'Qivori: New load match! ATL\u2192MIA $2,800 ($3.20/mi). Open app to book.' },
            { event:'delivery_reminder',  key:'deliveryReminder',  msg:'Qivori: Reminder \u2014 Load LD-4825 delivery due Mar 18 at Houston, TX.' },
          ].map(p => {
            if (!enabled[p.key]) return null
            return (
              <div key={p.event} style={{ background:'var(--surface2)', borderRadius:10, padding:'12px 14px', fontSize:12, color:'var(--text)', lineHeight:1.5, border:'1px solid var(--border)' }}>
                <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4, fontWeight:700, textTransform:'uppercase', letterSpacing:1 }}>{p.event.replace(/_/g, ' ')}</div>
                {p.msg}
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:6 }}>{p.msg.length} chars {p.msg.length <= 160 ? '(single SMS)' : '(multi-part SMS)'}</div>
              </div>
            )
          }).filter(Boolean)}
          {Object.values(enabled).every(v => !v) && (
            <div style={{ textAlign:'center', padding:20, color:'var(--muted)', fontSize:12 }}>Enable alerts above to see message previews</div>
          )}
        </div>
      </div>

      {/* Recent SMS History */}
      {smsHistory.length > 0 && (
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}><Ic icon={Clock} /> Recent SMS</div>
          </div>
          <div style={{ padding:16, display:'flex', flexDirection:'column', gap:6 }}>
            {smsHistory.map((h, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:'var(--surface2)', borderRadius:8, fontSize:12 }}>
                <span style={{ fontWeight:600 }}>{h.event}</span>
                <span style={{ color:'var(--muted)', fontSize:11 }}>{h.time}</span>
                <span style={S.badge(h.status === 'sent' ? 'var(--success)' : 'var(--danger)')}>{h.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Save Button */}
      <div style={{ display:'flex', gap:12, alignItems:'center' }}>
        <button
          className="btn btn-primary"
          style={{ padding:'12px 32px', fontSize:13, fontWeight:700 }}
          onClick={savePreferences}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Preferences'}
        </button>
        <div style={{ fontSize:11, color:'var(--muted)' }}>Preferences are saved to your Qivori profile</div>
      </div>

      {/* Info */}
      <div style={{ background:'rgba(77,142,240,0.06)', border:'1px solid rgba(77,142,240,0.2)', borderRadius:12, padding:'14px 18px', display:'flex', gap:12 }}>
        <Ic icon={Shield} size={18} color="var(--accent2)" />
        <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
          SMS notifications are powered by Twilio. Standard message rates may apply. Rate limit: 10 SMS per hour. You can unsubscribe at any time by toggling off alerts above or replying STOP to any message.
        </div>
      </div>
    </div>
  )
}
