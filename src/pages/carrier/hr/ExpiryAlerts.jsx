import { useState, useEffect, useMemo } from 'react'
import { Ic, S } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { AlertTriangle, Calendar, Clock, Bell, CheckCircle, XCircle, AlertCircle } from 'lucide-react'
import * as db from '../../../lib/database'
import { DQ_DOC_TYPES, getExpiryStatus } from './helpers'

export function ExpiryAlerts() {
  const { showToast } = useApp()
  const { drivers } = useCarrier()
  const [allFiles, setAllFiles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    db.fetchDQFiles().then(files => {
      setAllFiles(files)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const alerts = useMemo(() => {
    const items = []
    allFiles.forEach(f => {
      if (!f.expiry_date) return
      const days = Math.floor((new Date(f.expiry_date) - new Date()) / (1000 * 60 * 60 * 24))
      if (days > 30) return
      const driver = drivers.find(d => d.id === f.driver_id)
      const type = DQ_DOC_TYPES.find(t => t.id === f.doc_type)
      items.push({
        ...f,
        driverName: driver?.full_name || driver?.name || 'Unknown',
        docLabel: type?.label || f.doc_type,
        daysLeft: days,
        urgency: days < 0 ? 'expired' : days <= 7 ? 'critical' : days <= 14 ? 'urgent' : 'warning',
      })
    })
    return items.sort((a, b) => a.daysLeft - b.daysLeft)
  }, [allFiles, drivers])

  const expired = alerts.filter(a => a.daysLeft < 0)
  const critical = alerts.filter(a => a.daysLeft >= 0 && a.daysLeft <= 7)
  const warning = alerts.filter(a => a.daysLeft > 7)

  const sendReminder = (alert) => {
    showToast('success', 'Reminder Sent', `Expiry alert sent for ${alert.driverName} — ${alert.docLabel}`)
  }

  const AlertRow = ({ a }) => (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10 }}>
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:36, height:36, borderRadius:'50%', background: a.daysLeft < 0 ? 'rgba(239,68,68,0.15)' : a.daysLeft <= 7 ? 'rgba(240,165,0,0.15)' : 'rgba(240,165,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          {a.daysLeft < 0 ? <XCircle size={16} style={{ color:'var(--danger)' }} /> : <AlertCircle size={16} style={{ color:'var(--accent)' }} />}
        </div>
        <div>
          <div style={{ fontSize:13, fontWeight:600 }}>{a.driverName} — {a.docLabel}</div>
          <div style={{ fontSize:11, color: a.daysLeft < 0 ? 'var(--danger)' : 'var(--accent)' }}>
            {a.daysLeft < 0 ? `Expired ${Math.abs(a.daysLeft)} days ago` : a.daysLeft === 0 ? 'Expires today' : `Expires in ${a.daysLeft} days`}
          </div>
        </div>
      </div>
      <div style={{ display:'flex', gap:8 }}>
        <button className="btn btn-ghost" style={{ fontSize:11, padding:'5px 12px' }} onClick={() => sendReminder(a)}><Ic icon={Bell} /> Remind</button>
      </div>
    </div>
  )

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Loading expiry data...</div>

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>DOCUMENT EXPIRY ALERTS</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>CDL, medical card, and compliance document expiry tracking</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
        {[
          { label:'EXPIRED', value:String(expired.length), color: expired.length > 0 ? 'var(--danger)' : 'var(--success)' },
          { label:'EXPIRING 7 DAYS', value:String(critical.length), color: critical.length > 0 ? 'var(--accent)' : 'var(--success)' },
          { label:'EXPIRING 30 DAYS', value:String(warning.length), color: warning.length > 0 ? 'var(--accent)' : 'var(--success)' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:0.5, marginBottom:4 }}>{k.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {alerts.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:'var(--success)', fontSize:14 }}>
          <Ic icon={CheckCircle} /> All documents are current — no upcoming expirations within 30 days
        </div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {expired.length > 0 && <div style={{ fontSize:11, fontWeight:800, color:'var(--danger)', letterSpacing:1, marginTop:8 }}>EXPIRED</div>}
          {expired.map(a => <AlertRow key={a.id} a={a} />)}
          {critical.length > 0 && <div style={{ fontSize:11, fontWeight:800, color:'var(--accent)', letterSpacing:1, marginTop:8 }}>EXPIRING THIS WEEK</div>}
          {critical.map(a => <AlertRow key={a.id} a={a} />)}
          {warning.length > 0 && <div style={{ fontSize:11, fontWeight:800, color:'var(--muted)', letterSpacing:1, marginTop:8 }}>EXPIRING WITHIN 30 DAYS</div>}
          {warning.map(a => <AlertRow key={a.id} a={a} />)}
        </div>
      )}
    </div>
  )
}
