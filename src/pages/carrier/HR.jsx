import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Ic, S, StatCard, useApp, useCarrier, apiFetch } from './shared'
import {
  FileCheck, AlertTriangle, FileText, Shield, User, Users, Upload, Download,
  Plus, Filter, Calendar, Clock, Check, ChevronRight, Eye, Trash2, Search,
  Activity, Briefcase, DollarSign, CreditCard, Hash, Phone, Send, Save,
  Edit3 as PencilIcon, CheckCircle, XCircle, AlertCircle, Bell, Beaker,
  Siren, Award, Truck, Star, TrendingUp, Package, BarChart2
} from 'lucide-react'
import * as db from '../../lib/database'

// ═══════════════════════════════════════════════════════════════════════════════
// FMCSA DQ FILE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

const DQ_DOC_TYPES = [
  { id: 'cdl',                label: 'CDL / License',           required: true,  hasExpiry: true },
  { id: 'medical_card',       label: 'Medical Card (DOT)',      required: true,  hasExpiry: true },
  { id: 'mvr',                label: 'Motor Vehicle Record',    required: true,  hasExpiry: true },
  { id: 'employment_history', label: 'Employment History (10yr)', required: true, hasExpiry: false },
  { id: 'road_test',          label: 'Road Test Certificate',   required: true,  hasExpiry: false },
  { id: 'annual_review',      label: 'Annual Review of Record', required: true,  hasExpiry: true },
  { id: 'drug_pre_employment',label: 'Pre-Employment Drug Test',required: true,  hasExpiry: false },
  { id: 'background_check',   label: 'Background Check',        required: true,  hasExpiry: false },
  { id: 'application',        label: 'Driver Application',      required: true,  hasExpiry: false },
  { id: 'ssp_certification',  label: 'SSP / Entry-Level Training', required: false, hasExpiry: false },
  { id: 'hazmat_endorsement', label: 'Hazmat Endorsement',      required: false, hasExpiry: true },
  { id: 'twic_card',          label: 'TWIC Card',               required: false, hasExpiry: true },
  { id: 'insurance',          label: 'Insurance Certificate',   required: false, hasExpiry: true },
  { id: 'w9',                 label: 'W-9 Form',                required: false, hasExpiry: false },
  { id: 'direct_deposit',     label: 'Direct Deposit Form',     required: false, hasExpiry: false },
  { id: 'offer_letter',       label: 'Offer Letter',            required: false, hasExpiry: false },
  { id: 'other',              label: 'Other Document',          required: false, hasExpiry: false },
]

const DOC_STATUS_COLORS = {
  valid:         { bg: 'rgba(34,197,94,0.1)',  color: 'var(--success)', label: 'Valid' },
  expiring_soon: { bg: 'rgba(240,165,0,0.1)',  color: 'var(--accent)',  label: 'Expiring Soon' },
  expired:       { bg: 'rgba(239,68,68,0.1)',  color: 'var(--danger)',  label: 'Expired' },
  pending:       { bg: 'rgba(77,142,240,0.1)', color: 'var(--accent3)', label: 'Pending' },
  rejected:      { bg: 'rgba(239,68,68,0.1)',  color: 'var(--danger)',  label: 'Rejected' },
}

function getExpiryStatus(expiryDate) {
  if (!expiryDate) return 'valid'
  const days = Math.floor((new Date(expiryDate) - new Date()) / (1000 * 60 * 60 * 24))
  if (days < 0) return 'expired'
  if (days <= 30) return 'expiring_soon'
  return 'valid'
}

const inp = { width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box', outline:'none' }

// ═══════════════════════════════════════════════════════════════════════════════
// 1. DQ FILE MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════

export function DQFileManager() {
  const { showToast } = useApp()
  const { drivers } = useCarrier()
  const [selectedDriver, setSelectedDriver] = useState(null)
  const [dqFiles, setDqFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [newDoc, setNewDoc] = useState({ doc_type: 'cdl', file_name: '', expiry_date: '', issued_date: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [filterStatus, setFilterStatus] = useState('all')

  useEffect(() => {
    if (!selectedDriver && drivers.length > 0) setSelectedDriver(drivers[0].id)
  }, [drivers, selectedDriver])

  useEffect(() => {
    if (!selectedDriver) return
    setLoading(true)
    db.fetchDQFiles(selectedDriver).then(files => {
      setDqFiles(files)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [selectedDriver])

  const driver = drivers.find(d => d.id === selectedDriver)
  const driverName = driver?.full_name || driver?.name || 'Unknown'

  // Calculate DQ file completion
  const requiredTypes = DQ_DOC_TYPES.filter(t => t.required)
  const uploadedTypes = new Set(dqFiles.map(f => f.doc_type))
  const completedRequired = requiredTypes.filter(t => uploadedTypes.has(t.id)).length
  const completionPct = requiredTypes.length > 0 ? Math.round((completedRequired / requiredTypes.length) * 100) : 0

  const expiringSoon = dqFiles.filter(f => getExpiryStatus(f.expiry_date) === 'expiring_soon').length
  const expired = dqFiles.filter(f => getExpiryStatus(f.expiry_date) === 'expired').length

  const filteredFiles = filterStatus === 'all' ? dqFiles
    : filterStatus === 'missing' ? [] // handled separately
    : dqFiles.filter(f => getExpiryStatus(f.expiry_date) === filterStatus || f.status === filterStatus)

  const missingRequired = requiredTypes.filter(t => !uploadedTypes.has(t.id))

  const handleUpload = async () => {
    if (!newDoc.doc_type || !newDoc.file_name) { showToast('error', 'Error', 'Document type and name are required'); return }
    setSaving(true)
    try {
      const file = await db.createDQFile({
        driver_id: selectedDriver,
        doc_type: newDoc.doc_type,
        file_name: newDoc.file_name,
        expiry_date: newDoc.expiry_date || null,
        issued_date: newDoc.issued_date || null,
        notes: newDoc.notes || null,
        status: newDoc.expiry_date ? getExpiryStatus(newDoc.expiry_date) : 'valid',
      })
      setDqFiles(prev => [file, ...prev])
      showToast('success', 'Document Added', `${DQ_DOC_TYPES.find(t => t.id === newDoc.doc_type)?.label} uploaded`)
      setNewDoc({ doc_type: 'cdl', file_name: '', expiry_date: '', issued_date: '', notes: '' })
      setShowUpload(false)
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to save document')
    }
    setSaving(false)
  }

  const handleDelete = async (id, name) => {
    try {
      await db.deleteDQFile(id)
      setDqFiles(prev => prev.filter(f => f.id !== id))
      showToast('success', 'Deleted', name + ' removed')
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to delete')
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Upload Modal */}
      {showUpload && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setShowUpload(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:480, padding:24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Add DQ File</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>Upload document for {driverName}</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Document Type *</label>
                <select value={newDoc.doc_type} onChange={e => setNewDoc(p => ({ ...p, doc_type: e.target.value }))} style={inp}>
                  {DQ_DOC_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}{t.required ? ' *' : ''}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>File Name / Description *</label>
                <input value={newDoc.file_name} onChange={e => setNewDoc(p => ({ ...p, file_name: e.target.value }))} placeholder="e.g. CDL Front + Back" style={inp} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Issued Date</label>
                  <input type="date" value={newDoc.issued_date} onChange={e => setNewDoc(p => ({ ...p, issued_date: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Expiry Date</label>
                  <input type="date" value={newDoc.expiry_date} onChange={e => setNewDoc(p => ({ ...p, expiry_date: e.target.value }))} style={inp} />
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Notes</label>
                <textarea value={newDoc.notes} onChange={e => setNewDoc(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes..." rows={2} style={{ ...inp, resize:'vertical' }} />
              </div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:18 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }} onClick={handleUpload} disabled={saving || !newDoc.file_name}>
                {saving ? 'Saving...' : 'Add Document'}
              </button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setShowUpload(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Driver sidebar */}
      <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface)', overflowY: 'auto' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2 }}>DQ FILES</div>
        </div>
        {drivers.map(d => {
          const isSel = selectedDriver === d.id
          const name = d.full_name || d.name || 'Unknown'
          const avatar = name.split(' ').map(w => w[0]).join('').slice(0,2)
          return (
            <div key={d.id} onClick={() => setSelectedDriver(d.id)}
              style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', borderLeft: `3px solid ${isSel ? 'var(--accent)' : 'transparent'}`, background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: isSel ? 'var(--accent)' : 'var(--surface2)', color: isSel ? '#000' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, flexShrink: 0 }}>{avatar}</div>
                <div style={{ fontSize: 12, fontWeight: 600, color: isSel ? 'var(--accent)' : 'var(--text)' }}>{name}</div>
              </div>
            </div>
          )
        })}
        {drivers.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No drivers yet</div>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!driver ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>
            <div style={{ textAlign:'center' }}>
              <FileCheck size={32} style={{ marginBottom:8 }} />
              <div style={{ fontSize:14, fontWeight:600 }}>Add drivers to manage DQ files</div>
            </div>
          </div>
        ) : <>
          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>DQ FILE — {driverName.toUpperCase()}</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>FMCSA Driver Qualification File management</div>
            </div>
            <button className="btn btn-primary" style={{ fontSize:12 }} onClick={() => setShowUpload(true)}><Ic icon={Plus} /> Add Document</button>
          </div>

          {/* KPI cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
            {[
              { label:'COMPLETION', value:`${completionPct}%`, sub:`${completedRequired}/${requiredTypes.length} required`, color: completionPct === 100 ? 'var(--success)' : completionPct >= 70 ? 'var(--accent)' : 'var(--danger)' },
              { label:'TOTAL DOCS', value:String(dqFiles.length), sub:'uploaded files', color:'var(--accent3)' },
              { label:'EXPIRING', value:String(expiringSoon), sub:'within 30 days', color: expiringSoon > 0 ? 'var(--accent)' : 'var(--success)' },
              { label:'EXPIRED', value:String(expired), sub:'needs renewal', color: expired > 0 ? 'var(--danger)' : 'var(--success)' },
            ].map(k => (
              <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' }}>
                <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:0.5, marginBottom:4 }}>{k.label}</div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:k.color }}>{k.value}</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>{k.sub}</div>
              </div>
            ))}
          </div>

          {/* Completion bar */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
              <span style={{ fontSize:12, fontWeight:700 }}>DQ File Completion</span>
              <span style={{ fontSize:12, fontWeight:700, color: completionPct === 100 ? 'var(--success)' : 'var(--accent)' }}>{completionPct}%</span>
            </div>
            <div style={{ height:8, background:'var(--surface2)', borderRadius:4, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${completionPct}%`, background: completionPct === 100 ? 'var(--success)' : 'var(--accent)', borderRadius:4, transition:'width 0.3s' }} />
            </div>
            {missingRequired.length > 0 && (
              <div style={{ marginTop:10, display:'flex', flexWrap:'wrap', gap:6 }}>
                {missingRequired.map(t => (
                  <span key={t.id} style={{ fontSize:10, fontWeight:600, padding:'3px 8px', borderRadius:6, background:'rgba(239,68,68,0.1)', color:'var(--danger)', border:'1px solid rgba(239,68,68,0.2)' }}>
                    Missing: {t.label}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Filter tabs */}
          <div style={{ display:'flex', gap:6 }}>
            {[
              { id:'all', label:'All' },
              { id:'missing', label:`Missing (${missingRequired.length})` },
              { id:'expiring_soon', label:`Expiring (${expiringSoon})` },
              { id:'expired', label:`Expired (${expired})` },
            ].map(f => (
              <button key={f.id} onClick={() => setFilterStatus(f.id)}
                style={{ padding:'6px 14px', borderRadius:8, fontSize:11, fontWeight:700, border:`1px solid ${filterStatus===f.id?'var(--accent)':'var(--border)'}`, background:filterStatus===f.id?'rgba(240,165,0,0.08)':'var(--surface)', color:filterStatus===f.id?'var(--accent)':'var(--muted)', cursor:'pointer' }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Missing docs list */}
          {filterStatus === 'missing' && (
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {missingRequired.length === 0 ? (
                <div style={{ padding:24, textAlign:'center', color:'var(--success)', fontSize:13 }}><Ic icon={CheckCircle} /> All required documents are on file</div>
              ) : missingRequired.map(t => (
                <div key={t.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', background:'rgba(239,68,68,0.04)', border:'1px solid rgba(239,68,68,0.15)', borderRadius:10 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <AlertTriangle size={14} style={{ color:'var(--danger)' }} />
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{t.label}</div>
                      <div style={{ fontSize:10, color:'var(--danger)' }}>Required — not uploaded</div>
                    </div>
                  </div>
                  <button className="btn btn-primary" style={{ fontSize:11, padding:'6px 14px' }} onClick={() => { setNewDoc(p => ({ ...p, doc_type: t.id })); setShowUpload(true) }}>Upload</button>
                </div>
              ))}
            </div>
          )}

          {/* Documents table */}
          {filterStatus !== 'missing' && (
            loading ? (
              <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:13 }}>Loading...</div>
            ) : filteredFiles.length === 0 ? (
              <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No documents found</div>
            ) : (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead><tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
                    {['Document','Status','Issued','Expires','Notes',''].map(h => (
                      <th key={h} style={{ padding:'10px 14px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {filteredFiles.map(f => {
                      const type = DQ_DOC_TYPES.find(t => t.id === f.doc_type)
                      const status = DOC_STATUS_COLORS[getExpiryStatus(f.expiry_date)] || DOC_STATUS_COLORS[f.status] || DOC_STATUS_COLORS.valid
                      return (
                        <tr key={f.id} style={{ borderBottom:'1px solid var(--border)' }}>
                          <td style={{ padding:'12px 14px' }}>
                            <div style={{ fontSize:13, fontWeight:600 }}>{type?.label || f.doc_type}</div>
                            <div style={{ fontSize:11, color:'var(--muted)' }}>{f.file_name}</div>
                          </td>
                          <td style={{ padding:'12px 14px' }}>
                            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6, background:status.bg, color:status.color }}>{status.label}</span>
                          </td>
                          <td style={{ padding:'12px 14px', fontSize:12, color:'var(--muted)' }}>{f.issued_date ? new Date(f.issued_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</td>
                          <td style={{ padding:'12px 14px', fontSize:12, color: getExpiryStatus(f.expiry_date) === 'expired' ? 'var(--danger)' : getExpiryStatus(f.expiry_date) === 'expiring_soon' ? 'var(--accent)' : 'var(--muted)' }}>
                            {f.expiry_date ? new Date(f.expiry_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}
                          </td>
                          <td style={{ padding:'12px 14px', fontSize:11, color:'var(--muted)', maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{f.notes || '—'}</td>
                          <td style={{ padding:'12px 14px' }}>
                            <button onClick={() => handleDelete(f.id, f.file_name)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:4 }} title="Delete">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
        </>}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. DOCUMENT EXPIRY ALERTS
// ═══════════════════════════════════════════════════════════════════════════════

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

// ═══════════════════════════════════════════════════════════════════════════════
// 3. DRUG & ALCOHOL COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════════

const TEST_TYPES = [
  { id:'pre_employment', label:'Pre-Employment' },
  { id:'random', label:'Random' },
  { id:'post_accident', label:'Post-Accident' },
  { id:'reasonable_suspicion', label:'Reasonable Suspicion' },
  { id:'return_to_duty', label:'Return to Duty' },
  { id:'follow_up', label:'Follow-Up' },
]

const RESULT_COLORS = {
  negative:  { bg:'rgba(34,197,94,0.1)',  color:'var(--success)', label:'Negative' },
  positive:  { bg:'rgba(239,68,68,0.1)',  color:'var(--danger)',  label:'Positive' },
  refused:   { bg:'rgba(239,68,68,0.1)',  color:'var(--danger)',  label:'Refused' },
  cancelled: { bg:'rgba(74,85,112,0.1)',  color:'var(--muted)',   label:'Cancelled' },
  pending:   { bg:'rgba(240,165,0,0.1)',  color:'var(--accent)',  label:'Pending' },
}

export function DrugAlcoholCompliance() {
  const { showToast } = useApp()
  const { drivers } = useCarrier()
  const [tests, setTests] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newTest, setNewTest] = useState({ driver_id:'', test_type:'random', substance:'both', test_date:'', result:'pending', lab_name:'', notes:'' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    db.fetchDrugTests().then(t => { setTests(t); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const driverMap = useMemo(() => Object.fromEntries(drivers.map(d => [d.id, d.full_name || d.name || 'Unknown'])), [drivers])

  // Random pool stats
  const thisYear = new Date().getFullYear()
  const yearTests = tests.filter(t => new Date(t.test_date).getFullYear() === thisYear)
  const randomTests = yearTests.filter(t => t.test_type === 'random')
  const poolSize = drivers.length
  // DOT requires 50% drug, 10% alcohol random testing rate
  const drugTarget = Math.ceil(poolSize * 0.5)
  const alcoholTarget = Math.ceil(poolSize * 0.1)
  const randomDrug = randomTests.filter(t => t.substance === 'drug' || t.substance === 'both').length
  const randomAlcohol = randomTests.filter(t => t.substance === 'alcohol' || t.substance === 'both').length

  const handleAdd = async () => {
    if (!newTest.driver_id || !newTest.test_date) { showToast('error','Error','Driver and date required'); return }
    setSaving(true)
    try {
      const t = await db.createDrugTest(newTest)
      setTests(prev => [t, ...prev])
      showToast('success','Test Recorded', `${TEST_TYPES.find(x=>x.id===newTest.test_type)?.label} test added`)
      setNewTest({ driver_id:'', test_type:'random', substance:'both', test_date:'', result:'pending', lab_name:'', notes:'' })
      setShowAdd(false)
    } catch (err) {
      showToast('error','Error', err.message || 'Failed to save')
    }
    setSaving(false)
  }

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      {/* Add Test Modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setShowAdd(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:480, padding:24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Record Drug/Alcohol Test</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>DOT-compliant test record</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Driver *</label>
                <select value={newTest.driver_id} onChange={e => setNewTest(p => ({...p, driver_id:e.target.value}))} style={inp}>
                  <option value="">Select driver...</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name || d.name}</option>)}
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Test Type *</label>
                  <select value={newTest.test_type} onChange={e => setNewTest(p => ({...p, test_type:e.target.value}))} style={inp}>
                    {TEST_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Substance</label>
                  <select value={newTest.substance} onChange={e => setNewTest(p => ({...p, substance:e.target.value}))} style={inp}>
                    <option value="both">Drug & Alcohol</option>
                    <option value="drug">Drug Only</option>
                    <option value="alcohol">Alcohol Only</option>
                  </select>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Test Date *</label>
                  <input type="date" value={newTest.test_date} onChange={e => setNewTest(p => ({...p, test_date:e.target.value}))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Result</label>
                  <select value={newTest.result} onChange={e => setNewTest(p => ({...p, result:e.target.value}))} style={inp}>
                    {Object.entries(RESULT_COLORS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Lab / Collection Site</label>
                <input value={newTest.lab_name} onChange={e => setNewTest(p => ({...p, lab_name:e.target.value}))} placeholder="Lab name" style={inp} />
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Notes</label>
                <textarea value={newTest.notes} onChange={e => setNewTest(p => ({...p, notes:e.target.value}))} rows={2} placeholder="Optional" style={{...inp, resize:'vertical'}} />
              </div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:18 }}>
              <button className="btn btn-primary" style={{ flex:1 }} onClick={handleAdd} disabled={saving}>{saving ? 'Saving...' : 'Record Test'}</button>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>DRUG & ALCOHOL COMPLIANCE</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>DOT/FMCSA random pool tracking & Clearinghouse reporting</div>
        </div>
        <button className="btn btn-primary" style={{ fontSize:12 }} onClick={() => setShowAdd(true)}><Ic icon={Plus} /> Record Test</button>
      </div>

      {/* Random pool compliance */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'POOL SIZE', value:String(poolSize), sub:'active drivers', color:'var(--accent3)' },
          { label:'DRUG TESTS (50%)', value:`${randomDrug}/${drugTarget}`, sub:`${drugTarget > 0 ? Math.round(randomDrug/drugTarget*100) : 0}% complete`, color: randomDrug >= drugTarget ? 'var(--success)' : 'var(--accent)' },
          { label:'ALCOHOL TESTS (10%)', value:`${randomAlcohol}/${alcoholTarget}`, sub:`${alcoholTarget > 0 ? Math.round(randomAlcohol/alcoholTarget*100) : 0}% complete`, color: randomAlcohol >= alcoholTarget ? 'var(--success)' : 'var(--accent)' },
          { label:'TOTAL THIS YEAR', value:String(yearTests.length), sub:`${thisYear} tests recorded`, color:'var(--accent)' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:0.5, marginBottom:4 }}>{k.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Test history */}
      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Loading...</div>
      ) : tests.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No test records yet. Click "Record Test" to add one.</div>
      ) : (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
              {['Driver','Type','Substance','Date','Result','Lab','Clearinghouse'].map(h => (
                <th key={h} style={{ padding:'10px 14px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {tests.map(t => {
                const res = RESULT_COLORS[t.result] || RESULT_COLORS.pending
                return (
                  <tr key={t.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'12px 14px', fontSize:13, fontWeight:600 }}>{driverMap[t.driver_id] || 'Unknown'}</td>
                    <td style={{ padding:'12px 14px', fontSize:12 }}>{TEST_TYPES.find(x=>x.id===t.test_type)?.label || t.test_type}</td>
                    <td style={{ padding:'12px 14px', fontSize:12, textTransform:'capitalize' }}>{t.substance}</td>
                    <td style={{ padding:'12px 14px', fontSize:12, color:'var(--muted)' }}>{new Date(t.test_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</td>
                    <td style={{ padding:'12px 14px' }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6, background:res.bg, color:res.color }}>{res.label}</span>
                    </td>
                    <td style={{ padding:'12px 14px', fontSize:11, color:'var(--muted)' }}>{t.lab_name || '—'}</td>
                    <td style={{ padding:'12px 14px' }}>
                      {t.clearinghouse_reported
                        ? <span style={{ fontSize:10, color:'var(--success)' }}><Ic icon={CheckCircle} /> Reported</span>
                        : <span style={{ fontSize:10, color:'var(--muted)' }}>Not reported</span>
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. INCIDENT & VIOLATION TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

const INCIDENT_TYPES = [
  { id:'accident', label:'Accident', icon: Siren },
  { id:'dot_inspection', label:'DOT Inspection', icon: Shield },
  { id:'traffic_violation', label:'Traffic Violation', icon: AlertTriangle },
  { id:'cargo_damage', label:'Cargo Damage', icon: Package },
  { id:'late_delivery', label:'Late Delivery', icon: Clock },
  { id:'customer_complaint', label:'Customer Complaint', icon: Users },
  { id:'policy_violation', label:'Policy Violation', icon: FileText },
  { id:'safety_violation', label:'Safety Violation', icon: AlertCircle },
  { id:'equipment_damage', label:'Equipment Damage', icon: Truck },
  { id:'other', label:'Other', icon: FileText },
]

const SEVERITY_COLORS = {
  critical: { bg:'rgba(239,68,68,0.1)', color:'var(--danger)', label:'Critical' },
  major:    { bg:'rgba(240,165,0,0.1)', color:'var(--accent)', label:'Major' },
  minor:    { bg:'rgba(77,142,240,0.1)', color:'var(--accent3)', label:'Minor' },
  info:     { bg:'rgba(74,85,112,0.1)', color:'var(--muted)', label:'Info' },
}

export function IncidentTracker() {
  const { showToast } = useApp()
  const { drivers } = useCarrier()
  const [incidents, setIncidents] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [newInc, setNewInc] = useState({ driver_id:'', incident_type:'accident', severity:'minor', incident_date:'', location:'', description:'', csa_points:0, dot_reportable:false, preventable:false })
  const [saving, setSaving] = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [pendingFiles, setPendingFiles] = useState([]) // files to upload with new incident
  const [uploadingDoc, setUploadingDoc] = useState(null) // incident id currently uploading doc to
  const [generatingReport, setGeneratingReport] = useState(null) // incident id generating AI report

  useEffect(() => {
    db.fetchIncidents().then(i => { setIncidents(i); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const driverMap = useMemo(() => Object.fromEntries(drivers.map(d => [d.id, d.full_name || d.name || 'Unknown'])), [drivers])

  const totalCSA = incidents.reduce((s, i) => s + (i.csa_points || 0), 0)
  const openCount = incidents.filter(i => i.status === 'open' || i.status === 'investigating').length
  const dotReportable = incidents.filter(i => i.dot_reportable).length

  const filtered = filterType === 'all' ? incidents : incidents.filter(i => i.incident_type === filterType)

  const handleAdd = async () => {
    if (!newInc.driver_id || !newInc.description) { showToast('error','Error','Driver and description required'); return }
    setSaving(true)
    try {
      const inc = await db.createIncident({ ...newInc, csa_points: parseInt(newInc.csa_points) || 0 })
      setIncidents(prev => [inc, ...prev])
      showToast('success','Incident Recorded', INCIDENT_TYPES.find(t=>t.id===newInc.incident_type)?.label + ' logged')
      setNewInc({ driver_id:'', incident_type:'accident', severity:'minor', incident_date:'', location:'', description:'', csa_points:0, dot_reportable:false, preventable:false })
      setShowAdd(false)
    } catch (err) {
      showToast('error','Error', err.message || 'Failed to save')
    }
    setSaving(false)
  }

  const resolveIncident = async (id) => {
    try {
      await db.updateIncident(id, { status:'resolved', resolved_at: new Date().toISOString() })
      setIncidents(prev => prev.map(i => i.id === id ? {...i, status:'resolved', resolved_at: new Date().toISOString()} : i))
      showToast('success','Resolved','Incident marked as resolved')
    } catch (err) {
      showToast('error','Error', err.message)
    }
  }

  // Upload documents to an incident
  const uploadIncidentDoc = async (incidentId, files) => {
    if (!files || files.length === 0) return
    setUploadingDoc(incidentId)
    try {
      const { uploadFile } = await import('../../lib/storage')
      const uploaded = []
      for (const file of files) {
        const result = await uploadFile(file, `incidents/${incidentId}`)
        if (result?.url) uploaded.push({ name: file.name, url: result.url, type: file.type, uploaded_at: new Date().toISOString() })
      }
      if (uploaded.length > 0) {
        const inc = incidents.find(i => i.id === incidentId)
        const existingDocs = inc?.documents || []
        const allDocs = [...existingDocs, ...uploaded]
        await db.updateIncident(incidentId, { documents: allDocs })
        setIncidents(prev => prev.map(i => i.id === incidentId ? { ...i, documents: allDocs } : i))
        showToast('success', 'Documents Uploaded', `${uploaded.length} file${uploaded.length > 1 ? 's' : ''} attached to incident`)
      }
    } catch (err) {
      showToast('error', 'Upload Error', err.message || 'Failed to upload')
    }
    setUploadingDoc(null)
  }

  // AI generate incident report
  const generateAIReport = async (incidentId) => {
    const inc = incidents.find(i => i.id === incidentId)
    if (!inc) return
    setGeneratingReport(incidentId)
    try {
      const driverName = driverMap[inc.driver_id] || 'Unknown Driver'
      const type = INCIDENT_TYPES.find(t => t.id === inc.incident_type)
      const sev = SEVERITY_COLORS[inc.severity] || SEVERITY_COLORS.minor
      const prompt = `Generate a professional DOT-compliant incident report for a trucking company. Format it clearly with sections.

INCIDENT DETAILS:
- Type: ${type?.label || inc.incident_type}
- Severity: ${sev.label}
- Driver: ${driverName}
- Date: ${inc.incident_date || 'Not specified'}
- Location: ${inc.location || 'Not specified'}
- Description: ${inc.description}
- DOT Reportable: ${inc.dot_reportable ? 'Yes' : 'No'}
- Preventable: ${inc.preventable ? 'Yes' : 'No'}
- CSA Points: ${inc.csa_points || 0}

Generate a formal incident report with these sections:
1. INCIDENT SUMMARY
2. DETAILS & CIRCUMSTANCES
3. CONTRIBUTING FACTORS
4. CORRECTIVE ACTIONS RECOMMENDED
5. FOLLOW-UP REQUIREMENTS
6. REGULATORY NOTES (if DOT reportable)

Keep it professional, factual, and compliant with FMCSA reporting standards.`

      const res = await apiFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: prompt }], max_tokens: 1500 })
      })
      const data = await res.json()
      const report = data?.choices?.[0]?.message?.content || data?.content?.[0]?.text || data?.text || ''
      if (report) {
        await db.updateIncident(incidentId, { ai_report: report, report_generated_at: new Date().toISOString() })
        setIncidents(prev => prev.map(i => i.id === incidentId ? { ...i, ai_report: report, report_generated_at: new Date().toISOString() } : i))
        showToast('success', 'Report Generated', 'AI incident report created — click to view')
      } else {
        showToast('error', 'Error', 'Could not generate report')
      }
    } catch (err) {
      showToast('error', 'Error', err.message || 'AI report generation failed')
    }
    setGeneratingReport(null)
  }

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      {/* Add Modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setShowAdd(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:520, padding:24, maxHeight:'90vh', overflowY:'auto' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Log Incident</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>Record accident, violation, or safety event</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Driver *</label>
                <select value={newInc.driver_id} onChange={e => setNewInc(p => ({...p, driver_id:e.target.value}))} style={inp}>
                  <option value="">Select driver...</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name || d.name}</option>)}
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Incident Type *</label>
                  <select value={newInc.incident_type} onChange={e => setNewInc(p => ({...p, incident_type:e.target.value}))} style={inp}>
                    {INCIDENT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Severity</label>
                  <select value={newInc.severity} onChange={e => setNewInc(p => ({...p, severity:e.target.value}))} style={inp}>
                    {Object.entries(SEVERITY_COLORS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Date *</label>
                  <input type="date" value={newInc.incident_date} onChange={e => setNewInc(p => ({...p, incident_date:e.target.value}))} style={inp} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Location</label>
                  <input value={newInc.location} onChange={e => setNewInc(p => ({...p, location:e.target.value}))} placeholder="City, State" style={inp} />
                </div>
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Description *</label>
                <textarea value={newInc.description} onChange={e => setNewInc(p => ({...p, description:e.target.value}))} rows={3} placeholder="Describe the incident..." style={{...inp, resize:'vertical'}} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>CSA Points</label>
                  <input type="number" min={0} value={newInc.csa_points} onChange={e => setNewInc(p => ({...p, csa_points:e.target.value}))} style={inp} />
                </div>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'8px 0' }}>
                  <input type="checkbox" checked={newInc.dot_reportable} onChange={e => setNewInc(p => ({...p, dot_reportable:e.target.checked}))} style={{ accentColor:'var(--accent)' }} />
                  <span style={{ fontSize:12 }}>DOT Reportable</span>
                </label>
                <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', padding:'8px 0' }}>
                  <input type="checkbox" checked={newInc.preventable} onChange={e => setNewInc(p => ({...p, preventable:e.target.checked}))} style={{ accentColor:'var(--accent)' }} />
                  <span style={{ fontSize:12 }}>Preventable</span>
                </label>
              </div>
            </div>
            {/* Document upload */}
            <div style={{ marginTop:10 }}>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Attach Documents (photos, police report, insurance)</label>
              <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" onChange={e => setPendingFiles(Array.from(e.target.files || []))}
                style={{ fontSize:12, color:'var(--text)' }} />
              {pendingFiles.length > 0 && (
                <div style={{ fontSize:11, color:'var(--accent)', marginTop:4 }}>{pendingFiles.length} file{pendingFiles.length > 1 ? 's' : ''} ready to upload</div>
              )}
            </div>

            <div style={{ display:'flex', gap:10, marginTop:18 }}>
              <button className="btn btn-primary" style={{ flex:1 }} onClick={async () => {
                await handleAdd()
                // Upload pending files to the newly created incident
                if (pendingFiles.length > 0 && incidents.length > 0) {
                  const newest = incidents[0]
                  if (newest) await uploadIncidentDoc(newest.id, pendingFiles)
                  setPendingFiles([])
                }
              }} disabled={saving}>{saving ? 'Saving...' : 'Log Incident'}</button>
              <button className="btn btn-ghost" style={{ flex:1 }} onClick={() => { setShowAdd(false); setPendingFiles([]) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>INCIDENTS & VIOLATIONS</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Accidents, DOT inspections, CSA tracking</div>
        </div>
        <button className="btn btn-primary" style={{ fontSize:12 }} onClick={() => setShowAdd(true)}><Ic icon={Plus} /> Log Incident</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'TOTAL INCIDENTS', value:String(incidents.length), color:'var(--accent3)' },
          { label:'OPEN', value:String(openCount), color: openCount > 0 ? 'var(--danger)' : 'var(--success)' },
          { label:'CSA POINTS', value:String(totalCSA), color: totalCSA > 0 ? 'var(--danger)' : 'var(--success)' },
          { label:'DOT REPORTABLE', value:String(dotReportable), color: dotReportable > 0 ? 'var(--accent)' : 'var(--success)' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:0.5, marginBottom:4 }}>{k.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Filter */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        <button onClick={() => setFilterType('all')} style={{ padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:700, border:`1px solid ${filterType==='all'?'var(--accent)':'var(--border)'}`, background:filterType==='all'?'rgba(240,165,0,0.08)':'var(--surface)', color:filterType==='all'?'var(--accent)':'var(--muted)', cursor:'pointer' }}>All</button>
        {INCIDENT_TYPES.slice(0,6).map(t => (
          <button key={t.id} onClick={() => setFilterType(t.id)} style={{ padding:'5px 12px', borderRadius:8, fontSize:11, fontWeight:700, border:`1px solid ${filterType===t.id?'var(--accent)':'var(--border)'}`, background:filterType===t.id?'rgba(240,165,0,0.08)':'var(--surface)', color:filterType===t.id?'var(--accent)':'var(--muted)', cursor:'pointer' }}>{t.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:'var(--success)', fontSize:13 }}><Ic icon={Shield} /> Clean record — no incidents</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filtered.map(inc => {
            const type = INCIDENT_TYPES.find(t => t.id === inc.incident_type)
            const sev = SEVERITY_COLORS[inc.severity] || SEVERITY_COLORS.minor
            const TypeIcon = type?.icon || FileText
            return (
              <div key={inc.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:12 }}>
                  <div style={{ display:'flex', gap:12 }}>
                    <div style={{ width:36, height:36, borderRadius:8, background:sev.bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <TypeIcon size={16} style={{ color:sev.color }} />
                    </div>
                    <div>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                        <span style={{ fontSize:13, fontWeight:700 }}>{type?.label || inc.incident_type}</span>
                        <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:4, background:sev.bg, color:sev.color }}>{sev.label}</span>
                        {inc.dot_reportable && <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:4, background:'rgba(239,68,68,0.1)', color:'var(--danger)' }}>DOT</span>}
                        {inc.preventable && <span style={{ fontSize:9, fontWeight:700, padding:'1px 6px', borderRadius:4, background:'rgba(240,165,0,0.1)', color:'var(--accent)' }}>PREV</span>}
                      </div>
                      <div style={{ fontSize:12, fontWeight:600 }}>{driverMap[inc.driver_id] || 'Unknown'}</div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{inc.description}</div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                        {inc.incident_date && new Date(inc.incident_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                        {inc.location && ` · ${inc.location}`}
                        {inc.csa_points > 0 && ` · ${inc.csa_points} CSA pts`}
                      </div>
                    </div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6, flexShrink:0 }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6, background: inc.status==='resolved'||inc.status==='closed' ? 'rgba(34,197,94,0.1)' : 'rgba(240,165,0,0.1)', color: inc.status==='resolved'||inc.status==='closed' ? 'var(--success)' : 'var(--accent)', textTransform:'capitalize' }}>{inc.status}</span>
                    {(inc.status === 'open' || inc.status === 'investigating') && (
                      <button className="btn btn-ghost" style={{ fontSize:10, padding:'4px 10px' }} onClick={() => resolveIncident(inc.id)}>Resolve</button>
                    )}
                  </div>
                </div>

                {/* Action buttons: Upload docs + AI Report */}
                <div style={{ display:'flex', gap:6, marginTop:10, flexWrap:'wrap' }}>
                  <label style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', cursor:'pointer', fontSize:10, fontWeight:600, color:'var(--muted)' }}>
                    <Upload size={11} /> {uploadingDoc === inc.id ? 'Uploading...' : 'Upload Docs'}
                    <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.doc,.docx" style={{ display:'none' }}
                      onChange={e => uploadIncidentDoc(inc.id, Array.from(e.target.files || []))} disabled={uploadingDoc === inc.id} />
                  </label>
                  <button onClick={() => generateAIReport(inc.id)} disabled={generatingReport === inc.id}
                    style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'4px 10px', borderRadius:6, border:'1px solid rgba(240,165,0,0.25)', background:'rgba(240,165,0,0.06)', cursor:'pointer', fontSize:10, fontWeight:600, color:'var(--accent)', fontFamily:"'DM Sans',sans-serif" }}>
                    <FileText size={11} /> {generatingReport === inc.id ? 'Generating...' : inc.ai_report ? 'Regenerate Report' : 'AI Incident Report'}
                  </button>
                </div>

                {/* Attached documents */}
                {inc.documents && inc.documents.length > 0 && (
                  <div style={{ marginTop:8, display:'flex', gap:6, flexWrap:'wrap' }}>
                    {inc.documents.map((doc, idx) => (
                      <a key={idx} href={doc.url} target="_blank" rel="noopener noreferrer"
                        style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:6, background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.2)', fontSize:10, fontWeight:600, color:'var(--accent3)', textDecoration:'none' }}>
                        <Eye size={10} /> {doc.name.length > 20 ? doc.name.slice(0, 18) + '...' : doc.name}
                      </a>
                    ))}
                  </div>
                )}

                {/* AI Report display */}
                {inc.ai_report && (
                  <details style={{ marginTop:8 }}>
                    <summary style={{ fontSize:11, fontWeight:700, color:'var(--accent)', cursor:'pointer', marginBottom:6 }}>
                      View AI Incident Report {inc.report_generated_at && <span style={{ fontSize:9, color:'var(--muted)', fontWeight:400 }}>· {new Date(inc.report_generated_at).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</span>}
                    </summary>
                    <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:14, fontSize:12, lineHeight:1.7, whiteSpace:'pre-wrap', color:'var(--text)', maxHeight:400, overflowY:'auto' }}>
                      {inc.ai_report}
                    </div>
                  </details>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. 1099 & PAYROLL TRACKING
// ═══════════════════════════════════════════════════════════════════════════════

export function PayrollTracker() {
  const { showToast } = useApp()
  const { drivers, loads } = useCarrier()
  const [payroll, setPayroll] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    db.fetchPayroll().then(p => { setPayroll(p); setLoading(false) }).catch(() => setLoading(false))
  }, [])

  const driverMap = useMemo(() => Object.fromEntries(drivers.map(d => [d.id, d.full_name || d.name || 'Unknown'])), [drivers])

  // YTD summary per driver
  const ytd = useMemo(() => {
    const map = {}
    payroll.forEach(p => {
      if (!map[p.driver_id]) map[p.driver_id] = { gross:0, net:0, deductions:0, perDiem:0, fuel:0, loads:0, miles:0 }
      map[p.driver_id].gross += Number(p.gross_pay) || 0
      map[p.driver_id].net += Number(p.net_pay) || 0
      map[p.driver_id].deductions += Number(p.deductions) || 0
      map[p.driver_id].perDiem += Number(p.per_diem) || 0
      map[p.driver_id].fuel += Number(p.fuel_advance) || 0
      map[p.driver_id].loads += Number(p.loads_completed) || 0
      map[p.driver_id].miles += Number(p.miles_driven) || 0
    })
    return map
  }, [payroll])

  const totalGross = Object.values(ytd).reduce((s, d) => s + d.gross, 0)
  const totalNet = Object.values(ytd).reduce((s, d) => s + d.net, 0)

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>1099 & PAYROLL TRACKING</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>YTD earnings, per diem, W9, direct deposit management</div>
        </div>
        <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => {
          const rows = [['Driver','Gross Pay','Net Pay','Deductions','Per Diem','Fuel Advance','Loads','Miles','1099 Required']]
          Object.entries(ytd).forEach(([dId, d]) => {
            rows.push([driverMap[dId] || dId, d.gross.toFixed(2), d.net.toFixed(2), d.deductions.toFixed(2), d.perDiem.toFixed(2), d.fuel.toFixed(2), d.loads, d.miles, d.gross >= 600 ? 'Yes' : 'No'])
          })
          const csv = rows.map(r => r.join(',')).join('\n')
          const blob = new Blob([csv], { type: 'text/csv' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url; a.download = `1099-report-${new Date().getFullYear()}.csv`; a.click()
          URL.revokeObjectURL(url)
          showToast('','Exported',`1099 data for ${Object.keys(ytd).length} drivers downloaded`)
        }}><Ic icon={Download} /> Export 1099s</button>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
        {[
          { label:'YTD GROSS', value:`$${totalGross.toLocaleString(undefined,{maximumFractionDigits:0})}`, color:'var(--accent)' },
          { label:'YTD NET', value:`$${totalNet.toLocaleString(undefined,{maximumFractionDigits:0})}`, color:'var(--success)' },
          { label:'DRIVERS', value:String(Object.keys(ytd).length), color:'var(--accent3)' },
          { label:'PERIODS', value:String(payroll.length), color:'var(--muted)' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:0.5, marginBottom:4 }}>{k.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Per-driver YTD */}
      {drivers.length === 0 ? (
        <div style={{ padding:40, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No drivers yet</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {drivers.map(d => {
            const name = d.full_name || d.name || 'Unknown'
            const avatar = name.split(' ').map(w => w[0]).join('').slice(0,2)
            const dYtd = ytd[d.id] || { gross:0, net:0, deductions:0, perDiem:0, fuel:0, loads:0, miles:0 }
            return (
              <div key={d.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'16px 20px' }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--surface2)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800 }}>{avatar}</div>
                    <div>
                      <div style={{ fontSize:14, fontWeight:700 }}>{name}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{dYtd.loads} loads · {dYtd.miles.toLocaleString()} mi YTD</div>
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color:'var(--accent)' }}>${dYtd.gross.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>YTD gross earnings</div>
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8 }}>
                  {[
                    { label:'Net Pay', value:`$${dYtd.net.toLocaleString(undefined,{maximumFractionDigits:0})}`, color:'var(--success)' },
                    { label:'Deductions', value:`$${dYtd.deductions.toLocaleString(undefined,{maximumFractionDigits:0})}`, color:'var(--danger)' },
                    { label:'Per Diem', value:`$${dYtd.perDiem.toLocaleString(undefined,{maximumFractionDigits:0})}`, color:'var(--accent2)' },
                    { label:'Fuel Adv.', value:`$${dYtd.fuel.toLocaleString(undefined,{maximumFractionDigits:0})}`, color:'var(--accent)' },
                    { label:'1099 Status', value: dYtd.gross >= 600 ? 'Required' : 'Under $600', color: dYtd.gross >= 600 ? 'var(--accent)' : 'var(--muted)' },
                  ].map(s => (
                    <div key={s.label} style={{ background:'var(--surface2)', borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                      <div style={{ fontSize:9, color:'var(--muted)', marginBottom:2 }}>{s.label}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Recent payroll records */}
      {payroll.length > 0 && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}>Recent Settlement Periods</div>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead><tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
              {['Driver','Period','Gross','Deductions','Net Pay','Status'].map(h => (
                <th key={h} style={{ padding:'10px 14px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {payroll.slice(0,20).map(p => (
                <tr key={p.id} style={{ borderBottom:'1px solid var(--border)' }}>
                  <td style={{ padding:'12px 14px', fontSize:13, fontWeight:600 }}>{driverMap[p.driver_id] || '?'}</td>
                  <td style={{ padding:'12px 14px', fontSize:12, color:'var(--muted)' }}>{p.period_start && new Date(p.period_start).toLocaleDateString('en-US',{month:'short',day:'numeric'})} — {p.period_end && new Date(p.period_end).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
                  <td style={{ padding:'12px 14px', fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--accent)' }}>${Number(p.gross_pay||0).toLocaleString()}</td>
                  <td style={{ padding:'12px 14px', fontSize:12, color:'var(--danger)' }}>-${Number(p.deductions||0).toLocaleString()}</td>
                  <td style={{ padding:'12px 14px', fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--success)' }}>${Number(p.net_pay||0).toLocaleString()}</td>
                  <td style={{ padding:'12px 14px' }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6, textTransform:'capitalize',
                      background: p.status==='paid' ? 'rgba(34,197,94,0.1)' : p.status==='approved' ? 'rgba(240,165,0,0.1)' : 'rgba(74,85,112,0.1)',
                      color: p.status==='paid' ? 'var(--success)' : p.status==='approved' ? 'var(--accent)' : 'var(--muted)' }}>{p.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. DRIVER SELF-SERVICE PORTAL (Preview / Read-only view)
// ═══════════════════════════════════════════════════════════════════════════════

export function DriverPortal() {
  const { showToast } = useApp()
  const { drivers, loads } = useCarrier()
  const [selectedDriver, setSelectedDriver] = useState(null)
  const [dqFiles, setDqFiles] = useState([])
  const [payroll, setPayroll] = useState([])

  useEffect(() => {
    if (!selectedDriver && drivers.length > 0) setSelectedDriver(drivers[0].id)
  }, [drivers, selectedDriver])

  useEffect(() => {
    if (!selectedDriver) return
    Promise.all([
      db.fetchDQFiles(selectedDriver),
      db.fetchPayroll(selectedDriver),
    ]).then(([files, pay]) => {
      setDqFiles(files)
      setPayroll(pay)
    })
  }, [selectedDriver])

  const driver = drivers.find(d => d.id === selectedDriver)
  if (!driver) return <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>No drivers</div>

  const name = driver.full_name || driver.name || 'Unknown'
  const avatar = name.split(' ').map(w => w[0]).join('').slice(0,2)
  const driverLoads = loads.filter(l => l.driver === name || l.driver_name === name)
  const delivered = driverLoads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid')
  const totalGross = delivered.reduce((s, l) => s + (l.gross || 0), 0)
  const totalMiles = delivered.reduce((s, l) => s + (l.miles || 0), 0)
  const ytdPay = payroll.reduce((s, p) => s + (Number(p.net_pay) || 0), 0)

  const requiredTypes = DQ_DOC_TYPES.filter(t => t.required)
  const uploadedTypes = new Set(dqFiles.map(f => f.doc_type))
  const completedRequired = requiredTypes.filter(t => uploadedTypes.has(t.id)).length
  const compliancePct = requiredTypes.length > 0 ? Math.round((completedRequired / requiredTypes.length) * 100) : 0

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      {/* Driver selector */}
      <div style={{ width:200, flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--surface)', overflowY:'auto' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2 }}>DRIVER PORTAL</div>
        {drivers.map(d => {
          const isSel = selectedDriver === d.id
          const n = d.full_name || d.name || '?'
          return (
            <div key={d.id} onClick={() => setSelectedDriver(d.id)}
              style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', cursor:'pointer', borderLeft:`3px solid ${isSel?'var(--accent)':'transparent'}`, background:isSel?'rgba(240,165,0,0.05)':'transparent' }}>
              <div style={{ fontSize:12, fontWeight:600, color:isSel?'var(--accent)':'var(--text)' }}>{n}</div>
            </div>
          )
        })}
      </div>

      {/* Portal content */}
      <div style={{ flex:1, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ width:56, height:56, borderRadius:'50%', background:'var(--accent)', color:'#000', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:800 }}>{avatar}</div>
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:1 }}>{name}</div>
            <div style={{ fontSize:12, color:'var(--muted)' }}>CDL: {driver.license_number || '—'} · Status: {driver.status || 'Active'}</div>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
          {[
            { label:'LOADS COMPLETED', value:String(delivered.length), color:'var(--accent3)' },
            { label:'TOTAL MILES', value:totalMiles.toLocaleString(), color:'var(--accent)' },
            { label:'GROSS EARNINGS', value:`$${totalGross.toLocaleString()}`, color:'var(--accent)' },
            { label:'YTD NET PAY', value:`$${ytdPay.toLocaleString(undefined,{maximumFractionDigits:0})}`, color:'var(--success)' },
          ].map(k => (
            <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px' }}>
              <div style={{ fontSize:10, color:'var(--muted)', letterSpacing:0.5, marginBottom:4 }}>{k.label}</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color:k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Compliance status */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'16px 20px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
            <span style={{ fontSize:13, fontWeight:700 }}><Ic icon={Shield} /> Compliance Status</span>
            <span style={{ fontSize:13, fontWeight:700, color: compliancePct === 100 ? 'var(--success)' : 'var(--accent)' }}>{compliancePct}%</span>
          </div>
          <div style={{ height:8, background:'var(--surface2)', borderRadius:4, overflow:'hidden' }}>
            <div style={{ height:'100%', width:`${compliancePct}%`, background: compliancePct === 100 ? 'var(--success)' : 'var(--accent)', borderRadius:4 }} />
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:12 }}>
            {[
              { label:'CDL', ok: uploadedTypes.has('cdl') },
              { label:'Medical Card', ok: uploadedTypes.has('medical_card') },
              { label:'MVR', ok: uploadedTypes.has('mvr') },
              { label:'Drug Test', ok: uploadedTypes.has('drug_pre_employment') },
              { label:'Background', ok: uploadedTypes.has('background_check') },
              { label:'Road Test', ok: uploadedTypes.has('road_test') },
            ].map(c => (
              <div key={c.label} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 10px', background: c.ok ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)', borderRadius:6 }}>
                {c.ok ? <CheckCircle size={12} style={{ color:'var(--success)' }} /> : <XCircle size={12} style={{ color:'var(--danger)' }} />}
                <span style={{ fontSize:11, color: c.ok ? 'var(--success)' : 'var(--danger)' }}>{c.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Recent loads */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={Package} /> Recent Loads</div>
          {driverLoads.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No loads yet</div>
          ) : (
            <div style={{ maxHeight:250, overflowY:'auto' }}>
              {driverLoads.slice(0,10).map((l, i) => (
                <div key={l.id || i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:700 }}>{l.loadId || l.load_id} · {(l.origin||'').split(',')[0]} → {(l.dest||l.destination||'').split(',')[0]}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>{l.status} · {l.miles || 0} mi</div>
                  </div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--accent)' }}>${(l.gross||0).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Documents on file */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={FileText} /> Documents on File ({dqFiles.length})</div>
          {dqFiles.length === 0 ? (
            <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No documents uploaded</div>
          ) : (
            <div style={{ maxHeight:200, overflowY:'auto' }}>
              {dqFiles.map(f => {
                const type = DQ_DOC_TYPES.find(t => t.id === f.doc_type)
                const status = DOC_STATUS_COLORS[getExpiryStatus(f.expiry_date)] || DOC_STATUS_COLORS.valid
                return (
                  <div key={f.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px', borderBottom:'1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:600 }}>{type?.label || f.doc_type}</div>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>{f.file_name}</div>
                    </div>
                    <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:6, background:status.bg, color:status.color }}>{status.label}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
