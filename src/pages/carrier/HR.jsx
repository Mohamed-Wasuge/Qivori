import React, { useState, useMemo, useEffect, useCallback } from 'react'
import { Ic, S, StatCard } from './shared'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { apiFetch } from '../../lib/api'
import {
  FileCheck, AlertTriangle, FileText, Shield, User, Users, Upload, Download,
  Plus, Filter, Calendar, Clock, Check, ChevronRight, Eye, Trash2, Search,
  Activity, Briefcase, DollarSign, CreditCard, Hash, Phone, Send, Save,
  Edit3 as PencilIcon, CheckCircle, XCircle, AlertCircle, Bell, Beaker,
  Siren, Award, Truck, Star, TrendingUp, Package, BarChart2, UserPlus, Printer
} from 'lucide-react'
import * as db from '../../lib/database'
import { generateSettlementPDF } from '../../utils/generatePDF'

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

function getIncidentTypes() {
  return [
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
}

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
      showToast('success','Incident Recorded', getIncidentTypes().find(t=>t.id===newInc.incident_type)?.label + ' logged')
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
      const type = getIncidentTypes().find(t => t.id === inc.incident_type)
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
                    {getIncidentTypes().map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
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
        {getIncidentTypes().slice(0,6).map(t => (
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
            const type = getIncidentTypes().find(t => t.id === inc.incident_type)
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
  const [selectedDriverId, setSelectedDriverId] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab] = useState('overview')
  // Run Payroll state
  const [runPeriod, setRunPeriod] = useState('this-week')
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')
  const [runDeductions, setRunDeductions] = useState([])
  const [runStep, setRunStep] = useState('select') // select | review | confirmed
  // Bank info state (Supabase-backed)
  const [bankInfo, setBankInfo] = useState({})
  // Recurring deductions config (Supabase-backed)
  const [recurringDeductions, setRecurringDeductions] = useState({})
  // Stripe Connect state
  const [connectStatus, setConnectStatus] = useState(null) // null | { connected, payouts_enabled, ... }
  const [connectLoading, setConnectLoading] = useState(false)
  const [payingDriverId, setPayingDriverId] = useState(null)

  useEffect(() => {
    apiFetch('/api/stripe-connect').then(r => r.json()).then(data => setConnectStatus(data)).catch(() => {})
  }, [])

  useEffect(() => {
    Promise.all([
      db.fetchPayroll(),
      db.fetchBankInfo(),
      db.fetchRecurringDeductions(),
    ]).then(([p, banks, deducts]) => {
      setPayroll(p)
      // Convert bank info array to map by driver_id
      const bankMap = {}
      ;(banks || []).forEach(b => {
        bankMap[b.driver_id] = { method: b.method, bankName: b.bank_name, accountType: b.account_type, routing: b.routing_number, last4: b.account_last4, otherDetails: b.other_details }
      })
      setBankInfo(bankMap)
      // Convert deductions array to map by driver_id
      const dedMap = {}
      ;(deducts || []).forEach(d => {
        if (!dedMap[d.driver_id]) dedMap[d.driver_id] = []
        dedMap[d.driver_id].push({ label: d.label, amount: d.amount, type: d.deduction_type })
      })
      setRecurringDeductions(dedMap)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedDriverId && drivers.length > 0) setSelectedDriverId(drivers[0].id)
  }, [drivers, selectedDriverId])

  const driverMap = useMemo(() => Object.fromEntries(drivers.map(d => [d.id, d.full_name || d.name || 'Unknown'])), [drivers])

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
  const totalDeductions = Object.values(ytd).reduce((s, d) => s + d.deductions, 0)

  const filteredDrivers = useMemo(() => {
    if (!searchQuery) return drivers
    const q = searchQuery.toLowerCase()
    return drivers.filter(d => (d.full_name || d.name || '').toLowerCase().includes(q))
  }, [drivers, searchQuery])

  const selectedDriver = drivers.find(d => d.id === selectedDriverId)
  const selYtd = ytd[selectedDriverId] || { gross:0, net:0, deductions:0, perDiem:0, fuel:0, loads:0, miles:0 }
  const selPayroll = payroll.filter(p => p.driver_id === selectedDriverId)
  const selNeeds1099 = selYtd.gross >= 600

  // Run Payroll: compute date range
  const getDateRange = useCallback(() => {
    const now = new Date()
    const day = now.getDay()
    if (runPeriod === 'this-week') {
      const start = new Date(now); start.setDate(now.getDate() - day)
      const end = new Date(start); end.setDate(start.getDate() + 6)
      return { start, end }
    } else if (runPeriod === 'last-week') {
      const start = new Date(now); start.setDate(now.getDate() - day - 7)
      const end = new Date(start); end.setDate(start.getDate() + 6)
      return { start, end }
    } else if (runPeriod === 'this-month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { start, end }
    } else if (runPeriod === 'last-month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start, end }
    } else {
      return { start: customStart ? new Date(customStart) : now, end: customEnd ? new Date(customEnd) : now }
    }
  }, [runPeriod, customStart, customEnd])

  // Run Payroll: calculate settlements for all drivers in the period
  const runPayrollData = useMemo(() => {
    const { start, end } = getDateRange()
    const startStr = start.toISOString?.() || ''
    const endStr = end.toISOString?.() || ''
    return drivers.map(d => {
      const name = d.full_name || d.name || ''
      const driverLoads = loads.filter(l => {
        if (l.driver !== name) return false
        if (!['Delivered','Invoiced','Paid'].includes(l.status)) return false
        const delivDate = l.delivery_date || l.updated_at || l.created_at
        if (!delivDate) return true
        const ld = new Date(delivDate)
        return ld >= start && ld <= end
      })
      const totalMiles = driverLoads.reduce((s, l) => s + (Number(l.miles) || 0), 0)
      const totalGross = driverLoads.reduce((s, l) => s + (Number(l.rate) || 0), 0)
      let driverPay = 0
      if (d.pay_model === 'permile') driverPay = totalMiles * (Number(d.pay_rate) || 0)
      else if (d.pay_model === 'flat') driverPay = driverLoads.length * (Number(d.pay_rate) || 0)
      else driverPay = totalGross * ((Number(d.pay_rate) || 28) / 100)
      const recurring = recurringDeductions[d.id] || []
      const totalRecurring = recurring.reduce((s, r) => s + (Number(r.amount) || 0), 0)
      const manual = runDeductions.filter(rd => rd.driverId === d.id)
      const totalManual = manual.reduce((s, r) => s + (Number(r.amount) || 0), 0)
      const netPay = driverPay - totalRecurring - totalManual
      return {
        driver: d, name, loads: driverLoads, totalMiles, totalGross, driverPay,
        deductions: totalRecurring + totalManual, recurringDeductions: recurring, manualDeductions: manual, netPay,
      }
    }).filter(d => d.loads.length > 0)
  }, [drivers, loads, getDateRange, runDeductions, recurringDeductions])

  const exportCSV = () => {
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
  }

  const downloadSettlement = (driverData) => {
    const { start, end } = getDateRange()
    const d = driverData
    const period = `${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} - ${end.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`
    const pdfLoads = d.loads.map(l => {
      let pay = 0
      if (d.driver.pay_model === 'permile') pay = (Number(l.miles)||0) * (Number(d.driver.pay_rate)||0)
      else if (d.driver.pay_model === 'flat') pay = Number(d.driver.pay_rate) || 0
      else pay = (Number(l.rate)||0) * ((Number(d.driver.pay_rate)||28)/100)
      return {
        id: l.load_number || l.id?.toString().slice(0,8) || '—',
        route: `${l.origin||'?'} to ${l.destination||'?'}`,
        miles: Number(l.miles) || 0,
        gross: Number(l.rate) || 0,
        pay: Math.round(pay),
      }
    })
    const allDeductions = [...d.recurringDeductions, ...d.manualDeductions]
    generateSettlementPDF(d.name, pdfLoads, period, {
      payModel: d.driver.pay_model,
      payRate: d.driver.pay_rate,
      deductions: allDeductions,
      totalDeductions: d.deductions,
      driverPay: d.driverPay,
      netPay: d.netPay,
    })
    showToast('','Downloaded',`Settlement PDF for ${d.name}`)
  }

  const approvePayroll = async () => {
    const { start, end } = getDateRange()
    for (const d of runPayrollData) {
      try {
        await db.createPayroll({
          driver_id: d.driver.id,
          period_start: start.toISOString().slice(0,10),
          period_end: end.toISOString().slice(0,10),
          gross_pay: d.driverPay,
          deductions: d.deductions,
          net_pay: d.netPay,
          per_diem: 0,
          fuel_advance: 0,
          loads_completed: d.loads.length,
          miles_driven: d.totalMiles,
          status: 'approved',
        })
      } catch { /* skip */ }
    }
    const refreshed = await db.fetchPayroll().catch(() => [])
    setPayroll(refreshed)
    setRunStep('confirmed')
    showToast('','Payroll Approved',`${runPayrollData.length} driver settlements created`)
  }

  const connectBank = async () => {
    setConnectLoading(true)
    try {
      const res = await apiFetch('/api/stripe-connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create-account' }) })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else if (data.error) showToast('', 'Error', data.error)
    } catch (err) {
      showToast('', 'Error', err.message || 'Failed to start bank connection')
    }
    setConnectLoading(false)
  }

  const payDriver = async (payrollId, speed = 'standard') => {
    setPayingDriverId(payrollId)
    try {
      const res = await apiFetch('/api/pay-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payrollId, paymentSpeed: speed }),
      })
      const data = await res.json()
      if (data.ok) {
        showToast('', 'Payment Sent', `$${data.amount.toLocaleString()} → ${data.driver} (${data.estimated_arrival})`)
        setPayroll(prev => prev.map(p => p.id === payrollId ? { ...p, status: 'paid', payment_status: 'in_transit', payment_method: speed === 'instant' ? 'ach_instant' : 'ach_standard' } : p))
      } else {
        showToast('', 'Payment Failed', data.error || 'Unknown error')
      }
    } catch (err) {
      showToast('', 'Payment Failed', err.message || 'Could not process payment')
    }
    setPayingDriverId(null)
  }

  const saveBankInfo = (driverId, info) => {
    const updated = { ...bankInfo, [driverId]: info }
    setBankInfo(updated)
    db.upsertBankInfo(driverId, info).catch(() => {})
    showToast('','Saved','Bank info updated')
  }

  const saveRecurringDeduction = (driverId, deductions) => {
    const updated = { ...recurringDeductions, [driverId]: deductions }
    setRecurringDeductions(updated)
    db.setRecurringDeductions(driverId, deductions).catch(() => {})
  }

  const fmtPay = (d) => d.pay_model === 'percent' ? `${d.pay_rate || 28}%` : d.pay_model === 'permile' ? `$${Number(d.pay_rate||0).toFixed(2)}/mi` : d.pay_model === 'flat' ? `$${d.pay_rate} flat` : '28%'
  const fmtMoney = (n) => `$${Number(n||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}`
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'

  const ps = {
    panel: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 },
    sectionTitle: { fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1.2, marginBottom:12 },
    row: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0', borderBottom:'1px solid var(--border)' },
    rowLast: { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 0' },
    label: { fontSize:13, color:'var(--text-secondary,#94a3b8)' },
    value: { fontSize:13, fontWeight:600 },
    input: { background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'var(--text)', outline:'none', width:'100%' },
  }

  const dSelBank = bankInfo[selectedDriverId] || {}
  const dSelRecurring = recurringDeductions[selectedDriverId] || []

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      {/* Header bar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:1.5 }}>PAYROLL</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Settlements, 1099s & driver compensation</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => { setActiveTab('run-payroll'); setRunStep('select') }}>
            <Ic icon={DollarSign} size={14} /> Run Payroll
          </button>
          <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={exportCSV}>
            <Ic icon={Download} size={14} /> Export 1099s
          </button>
        </div>
      </div>

      {/* Stripe Connect Banner */}
      {connectStatus && !connectStatus.onboarding_complete && (
        <div style={{ background: 'rgba(77,142,240,0.08)', border: '1px solid rgba(77,142,240,0.25)', borderRadius: 12, padding: '14px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 14 }}>
          <CreditCard size={24} color="var(--accent3)" />
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>Connect Your Bank for One-Click Driver Payments</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Link your business bank account to pay drivers instantly via ACH. Free standard transfers, 1.5% for instant.</div>
          </div>
          <button onClick={connectBank} disabled={connectLoading}
            style={{ padding: '10px 20px', fontSize: 13, fontWeight: 700, borderRadius: 8, border: 'none', cursor: 'pointer', background: 'var(--accent3)', color: '#fff', opacity: connectLoading ? 0.5 : 1, whiteSpace: 'nowrap' }}>
            {connectLoading ? 'Loading...' : 'Connect Bank →'}
          </button>
        </div>
      )}
      {connectStatus?.onboarding_complete && (
        <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: '10px 20px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <CheckCircle size={16} color="var(--success)" />
          <span style={{ fontWeight: 600, color: 'var(--success)' }}>Bank Connected</span>
          <span style={{ color: 'var(--muted)' }}>— One-click driver payments enabled via Stripe</span>
        </div>
      )}

      {/* Company-wide summary strip */}
      <div style={{ ...ps.panel, padding:'16px 20px', display:'flex', gap:32, flexWrap:'wrap', marginBottom:16 }}>
        {[
          { label:'Total Gross Pay', val: fmtMoney(totalGross), color:'var(--accent)' },
          { label:'Total Net Pay', val: fmtMoney(totalNet), color:'var(--success)' },
          { label:'Total Deductions', val: fmtMoney(totalDeductions), color:'var(--danger)' },
          { label:'Active Drivers', val: String(drivers.length), color:'var(--accent3)' },
          { label:'Pay Periods', val: String(payroll.length), color:'var(--muted)' },
        ].map(s => (
          <div key={s.label} style={{ minWidth:120 }}>
            <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8, marginBottom:2 }}>{s.label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:s.color, fontFamily:"'DM Sans',sans-serif" }}>{s.val}</div>
          </div>
        ))}
      </div>

      {/* RUN PAYROLL — full-width flow (no two-panel) */}
      {activeTab === 'run-payroll' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <button onClick={() => setActiveTab('overview')} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:12 }}>← Back</button>
              <div style={{ fontSize:16, fontWeight:700 }}>Run Payroll</div>
              <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background: runStep === 'confirmed' ? 'rgba(34,197,94,0.1)' : 'rgba(240,165,0,0.1)', color: runStep === 'confirmed' ? 'var(--success)' : 'var(--accent)' }}>
                {runStep === 'select' ? 'Step 1: Select Period' : runStep === 'review' ? 'Step 2: Review & Approve' : 'Approved'}
              </span>
            </div>
          </div>

          {runStep === 'select' && (
            <div style={{ ...ps.panel, padding:'24px' }}>
              <div style={ps.sectionTitle}>Pay Period</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
                {[
                  { id:'this-week', label:'This Week' },{ id:'last-week', label:'Last Week' },
                  { id:'this-month', label:'This Month' },{ id:'last-month', label:'Last Month' },{ id:'custom', label:'Custom Range' },
                ].map(p => (
                  <button key={p.id} onClick={() => setRunPeriod(p.id)} style={{
                    padding:'8px 16px', fontSize:12, fontWeight: runPeriod === p.id ? 700 : 500, borderRadius:8, cursor:'pointer',
                    background: runPeriod === p.id ? 'var(--accent)' : 'var(--bg)', color: runPeriod === p.id ? '#000' : 'var(--text)',
                    border: runPeriod === p.id ? 'none' : '1px solid var(--border)',
                  }}>{p.label}</button>
                ))}
              </div>
              {runPeriod === 'custom' && (
                <div style={{ display:'flex', gap:12, marginBottom:16 }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Start Date</div>
                    <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} style={ps.input} />
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>End Date</div>
                    <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} style={ps.input} />
                  </div>
                </div>
              )}
              <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
                Period: {getDateRange().start.toLocaleDateString()} — {getDateRange().end.toLocaleDateString()} · {runPayrollData.length} driver{runPayrollData.length !== 1 ? 's' : ''} with delivered loads
              </div>
              <button onClick={() => setRunStep('review')} disabled={runPayrollData.length === 0}
                style={{ padding:'10px 24px', fontSize:13, fontWeight:700, background: runPayrollData.length > 0 ? 'var(--accent)' : 'var(--border)', color: runPayrollData.length > 0 ? '#000' : 'var(--muted)', border:'none', borderRadius:10, cursor: runPayrollData.length > 0 ? 'pointer' : 'default' }}>
                Review Settlements ({runPayrollData.length} drivers) →
              </button>
            </div>
          )}

          {runStep === 'review' && (
            <>
              {runPayrollData.map(d => (
                <div key={d.driver.id} style={{ ...ps.panel, padding:'20px 24px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                      <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--accent)', color:'#000', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:800 }}>
                        {d.name.split(' ').map(w => w[0]).join('').slice(0,2)}
                      </div>
                      <div>
                        <div style={{ fontSize:14, fontWeight:700 }}>{d.name}</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>{fmtPay(d.driver)} · {d.loads.length} loads · {d.totalMiles.toLocaleString()} mi</div>
                      </div>
                    </div>
                    <button onClick={() => downloadSettlement(d)} className="btn btn-ghost" style={{ fontSize:11, padding:'5px 10px' }}>
                      <Ic icon={Download} size={12} /> Settlement
                    </button>
                  </div>
                  {/* Load detail table */}
                  <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:12 }}>
                    <thead><tr style={{ borderBottom:'1px solid var(--border)' }}>
                      {['Load','Route','Miles','Gross','Driver Pay'].map(h => (
                        <th key={h} style={{ padding:'6px 10px', fontSize:9, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1 }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>
                      {d.loads.map(l => {
                        let lPay = 0
                        if (d.driver.pay_model === 'permile') lPay = (Number(l.miles)||0) * (Number(d.driver.pay_rate)||0)
                        else if (d.driver.pay_model === 'flat') lPay = Number(d.driver.pay_rate) || 0
                        else lPay = (Number(l.rate)||0) * ((Number(d.driver.pay_rate)||28)/100)
                        return (
                          <tr key={l.id} style={{ borderBottom:'1px solid var(--border)' }}>
                            <td style={{ padding:'8px 10px', fontSize:11, fontFamily:"'JetBrains Mono',monospace" }}>{l.load_number || l.id?.slice(0,8)}</td>
                            <td style={{ padding:'8px 10px', fontSize:12 }}>{l.origin || '?'} → {l.destination || '?'}</td>
                            <td style={{ padding:'8px 10px', fontSize:12 }}>{Number(l.miles||0).toLocaleString()}</td>
                            <td style={{ padding:'8px 10px', fontSize:12, color:'var(--accent)' }}>{fmtMoney(l.rate)}</td>
                            <td style={{ padding:'8px 10px', fontSize:12, fontWeight:700, color:'var(--success)' }}>{fmtMoney(lPay)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {/* Deductions */}
                  {d.recurringDeductions.length > 0 && (
                    <div style={{ background:'var(--bg)', borderRadius:8, padding:'10px 14px', marginBottom:8 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', marginBottom:6 }}>Recurring Deductions</div>
                      {d.recurringDeductions.map((r, i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', fontSize:12, padding:'3px 0' }}>
                          <span>{r.label}</span><span style={{ color:'var(--danger)' }}>-{fmtMoney(r.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Totals */}
                  <div style={{ borderTop:'2px solid var(--border)', paddingTop:10, display:'flex', justifyContent:'space-between' }}>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>
                      Gross: {fmtMoney(d.driverPay)} {d.deductions > 0 ? `· Deductions: -${fmtMoney(d.deductions)}` : ''}
                    </div>
                    <div style={{ fontSize:16, fontWeight:800, color:'var(--success)' }}>Net: {fmtMoney(d.netPay)}</div>
                  </div>
                </div>
              ))}
              <div style={{ display:'flex', gap:12 }}>
                <button onClick={() => setRunStep('select')} className="btn btn-ghost" style={{ fontSize:12 }}>← Back</button>
                <button onClick={approvePayroll} style={{ padding:'12px 28px', fontSize:13, fontWeight:700, background:'var(--success)', color:'#fff', border:'none', borderRadius:10, cursor:'pointer' }}>
                  <Ic icon={CheckCircle} size={15} /> Approve & Create Settlements
                </button>
              </div>
            </>
          )}

          {runStep === 'confirmed' && (
            <div style={{ ...ps.panel, padding:48, textAlign:'center' }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(34,197,94,0.1)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                <Ic icon={CheckCircle} size={28} color="var(--success)" />
              </div>
              <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Payroll Approved</div>
              <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>{runPayrollData.length} settlements created for {getDateRange().start.toLocaleDateString()} — {getDateRange().end.toLocaleDateString()}</div>
              <div style={{ display:'flex', gap:10, justifyContent:'center', flexWrap:'wrap' }}>
                {connectStatus?.onboarding_complete && (
                  <button onClick={async () => {
                    const approved = payroll.filter(p => p.status === 'approved')
                    if (!approved.length) { showToast('','No Settlements','No approved settlements to pay'); return }
                    for (const p of approved) { await payDriver(p.id, 'standard') }
                  }} style={{ padding:'8px 20px', fontSize:12, fontWeight:700, background:'var(--success)', color:'#fff', border:'none', borderRadius:8, cursor:'pointer' }}>
                    <Ic icon={DollarSign} size={13} /> Pay All Drivers (ACH)
                  </button>
                )}
                <button onClick={() => { setRunStep('select'); setActiveTab('overview') }} className="btn btn-ghost" style={{ fontSize:12 }}>Back to Overview</button>
                <button onClick={() => { setRunStep('select'); setRunPeriod('this-week') }} style={{ padding:'8px 20px', fontSize:12, fontWeight:600, background:'var(--accent)', color:'#000', border:'none', borderRadius:8, cursor:'pointer' }}>Run Another</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Two-panel layout (all tabs except run-payroll) */}
      {activeTab !== 'run-payroll' && (
        <div style={{ display:'grid', gridTemplateColumns:'280px 1fr', gap:16, minHeight:500 }}>

          {/* LEFT: Driver list */}
          <div style={{ ...ps.panel, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)' }}>
              <div style={{ position:'relative' }}>
                <Ic icon={Search} size={14} color="var(--muted)" style={{ position:'absolute', left:10, top:9 }} />
                <input
                  value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search drivers..."
                  style={{ width:'100%', background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px 8px 32px', fontSize:12, color:'var(--text)', outline:'none' }}
                />
              </div>
            </div>
            <div style={{ flex:1, overflowY:'auto' }}>
              {filteredDrivers.length === 0 ? (
                <div style={{ padding:24, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No drivers found</div>
              ) : filteredDrivers.map(d => {
                const name = d.full_name || d.name || 'Unknown'
                const initials = name.split(' ').map(w => w[0]).join('').slice(0,2)
                const isActive = d.id === selectedDriverId
                const dYtd = ytd[d.id] || { gross:0, net:0 }
                return (
                  <div key={d.id} onClick={() => setSelectedDriverId(d.id)}
                    style={{
                      padding:'12px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10,
                      background: isActive ? 'rgba(240,165,0,0.06)' : 'transparent',
                      borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent',
                      transition:'all 0.15s',
                    }}>
                    <div style={{ width:36, height:36, borderRadius:'50%', background: isActive ? 'var(--accent)' : 'var(--border)', color: isActive ? '#000' : 'var(--muted)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, flexShrink:0 }}>{initials}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight: isActive ? 700 : 500, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>{fmtPay(d)} · {dYtd.gross > 0 ? fmtMoney(dYtd.gross) + ' YTD' : 'No pay yet'}</div>
                    </div>
                    {(ytd[d.id]?.gross || 0) >= 600 && (
                      <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }} title="1099 Required" />
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* RIGHT: Selected driver detail */}
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {!selectedDriver ? (
              <div style={{ ...ps.panel, padding:60, textAlign:'center', color:'var(--muted)' }}>
                <Ic icon={Users} size={32} color="var(--muted)" />
                <div style={{ marginTop:12, fontSize:14 }}>Select a driver to view payroll</div>
              </div>
            ) : (
              <>
                {/* Driver header card */}
                <div style={{ ...ps.panel, padding:'20px 24px' }}>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                      <div style={{ width:48, height:48, borderRadius:'50%', background:'var(--accent)', color:'#000', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800 }}>
                        {(selectedDriver.full_name || selectedDriver.name || 'U').split(' ').map(w => w[0]).join('').slice(0,2)}
                      </div>
                      <div>
                        <div style={{ fontSize:18, fontWeight:700 }}>{selectedDriver.full_name || selectedDriver.name}</div>
                        <div style={{ fontSize:12, color:'var(--muted)', display:'flex', gap:12, marginTop:2, flexWrap:'wrap' }}>
                          <span>Pay: {fmtPay(selectedDriver)}</span>
                          <span>·</span>
                          <span>{selectedDriver.phone || 'No phone'}</span>
                          <span>·</span>
                          <span style={{ color: selNeeds1099 ? 'var(--accent)' : 'var(--muted)' }}>
                            {selNeeds1099 ? '1099 Required' : '1099 N/A'}
                          </span>
                          {dSelBank.method && (
                            <>
                              <span>·</span>
                              <span style={{ color:'var(--success)' }}>
                                {dSelBank.method === 'direct' ? `ACH ····${dSelBank.last4 || '0000'}` : dSelBank.method === 'check' ? 'Check' : 'Zelle/Venmo'}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8 }}>
                      <button className="btn btn-ghost" style={{ fontSize:11, padding:'6px 12px' }} onClick={() => {
                        const rows = [['Period','Gross','Deductions','Net','Per Diem','Fuel Adv','Status']]
                        selPayroll.forEach(p => rows.push([
                          `${p.period_start||''} - ${p.period_end||''}`, Number(p.gross_pay||0).toFixed(2), Number(p.deductions||0).toFixed(2),
                          Number(p.net_pay||0).toFixed(2), Number(p.per_diem||0).toFixed(2), Number(p.fuel_advance||0).toFixed(2), p.status||'pending'
                        ]))
                        const csv = rows.map(r=>r.join(',')).join('\n')
                        const blob = new Blob([csv],{type:'text/csv'})
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a'); a.href=url; a.download=`settlement-${(selectedDriver.full_name||'driver').replace(/\s/g,'-')}.csv`; a.click()
                        URL.revokeObjectURL(url)
                        showToast('','Downloaded','Settlement exported')
                      }}><Ic icon={Download} size={13} /> Export</button>
                    </div>
                  </div>
                </div>

                {/* Tabs */}
                <div style={{ display:'flex', gap:0, borderBottom:'1px solid var(--border)' }}>
                  {[{id:'overview',label:'Overview'},{id:'settlements',label:'Settlements'},{id:'bank',label:'Bank & Payment'},{id:'deductions',label:'Deductions'},{id:'1099',label:'1099'}].map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
                      padding:'10px 16px', fontSize:12, fontWeight: activeTab === t.id ? 700 : 500, cursor:'pointer', border:'none', background:'none',
                      color: activeTab === t.id ? 'var(--accent)' : 'var(--muted)',
                      borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
                      transition:'all 0.15s',
                    }}>{t.label}</button>
                  ))}
                </div>

                {activeTab === 'overview' && (
                  <>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                      {[
                        { label:'YTD Gross', val: fmtMoney(selYtd.gross), sub:`${selYtd.loads} loads · ${selYtd.miles.toLocaleString()} mi`, color:'var(--accent)' },
                        { label:'YTD Net', val: fmtMoney(selYtd.net), sub:'After deductions', color:'var(--success)' },
                        { label:'YTD Deductions', val: fmtMoney(selYtd.deductions), sub:`Per diem: ${fmtMoney(selYtd.perDiem)}`, color:'var(--danger)' },
                      ].map(c => (
                        <div key={c.label} style={{ ...ps.panel, padding:'16px 20px' }}>
                          <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8, marginBottom:6 }}>{c.label}</div>
                          <div style={{ fontSize:22, fontWeight:800, color:c.color, fontFamily:"'DM Sans',sans-serif" }}>{c.val}</div>
                          <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{c.sub}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ ...ps.panel, padding:'20px 24px' }}>
                      <div style={ps.sectionTitle}>Compensation Breakdown</div>
                      {[
                        { label:'Gross Revenue (Driver Share)', val: fmtMoney(selYtd.gross), color:'var(--accent)' },
                        { label:'Deductions', val: selYtd.deductions > 0 ? `-${fmtMoney(selYtd.deductions)}` : '$0.00', color:'var(--danger)' },
                        { label:'Per Diem Allowance', val: fmtMoney(selYtd.perDiem), color:'var(--text)' },
                        { label:'Fuel Advances', val: selYtd.fuel > 0 ? `-${fmtMoney(selYtd.fuel)}` : '$0.00', color:'var(--danger)' },
                      ].map((r, i, arr) => (
                        <div key={r.label} style={i < arr.length - 1 ? ps.row : ps.rowLast}>
                          <span style={ps.label}>{r.label}</span>
                          <span style={{ ...ps.value, color: r.color }}>{r.val}</span>
                        </div>
                      ))}
                      <div style={{ borderTop:'2px solid var(--border)', marginTop:8, paddingTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                        <span style={{ fontSize:14, fontWeight:700 }}>Net Pay (YTD)</span>
                        <span style={{ fontSize:20, fontWeight:800, color:'var(--success)' }}>{fmtMoney(selYtd.net)}</span>
                      </div>
                    </div>
                  </>
                )}

                {activeTab === 'settlements' && (
                  <div style={{ ...ps.panel, overflow:'hidden' }}>
                    {selPayroll.length === 0 ? (
                      <div style={{ padding:48, textAlign:'center' }}>
                        <Ic icon={Calendar} size={28} color="var(--muted)" />
                        <div style={{ marginTop:10, fontSize:13, color:'var(--muted)' }}>No settlement periods yet</div>
                        <button onClick={() => { setActiveTab('run-payroll'); setRunStep('select') }} style={{ marginTop:12, padding:'8px 20px', fontSize:12, fontWeight:600, background:'var(--accent)', color:'#000', border:'none', borderRadius:8, cursor:'pointer' }}>Run First Payroll</button>
                      </div>
                    ) : (
                      <table style={{ width:'100%', borderCollapse:'collapse' }}>
                        <thead>
                          <tr style={{ background:'var(--bg)' }}>
                            {['Period','Loads','Miles','Gross Pay','Deductions','Net Pay','Status',''].map(h => (
                              <th key={h} style={{ padding:'10px 14px', fontSize:9, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1, borderBottom:'1px solid var(--border)' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selPayroll.map((p, i) => {
                            const statusColors = { paid: { bg:'rgba(34,197,94,0.1)', text:'var(--success)' }, approved: { bg:'rgba(240,165,0,0.1)', text:'var(--accent)' } }
                            const sc = statusColors[p.status] || { bg:'rgba(74,85,112,0.1)', text:'var(--muted)' }
                            return (
                              <tr key={p.id || i} style={{ borderBottom:'1px solid var(--border)' }}>
                                <td style={{ padding:'12px 14px', fontSize:12, fontWeight:600 }}>{fmtDate(p.period_start)} — {fmtDate(p.period_end)}</td>
                                <td style={{ padding:'12px 14px', fontSize:12 }}>{p.loads_completed || 0}</td>
                                <td style={{ padding:'12px 14px', fontSize:12 }}>{Number(p.miles_driven||0).toLocaleString()}</td>
                                <td style={{ padding:'12px 14px', fontSize:13, fontWeight:700, color:'var(--accent)' }}>{fmtMoney(p.gross_pay)}</td>
                                <td style={{ padding:'12px 14px', fontSize:12, color:'var(--danger)' }}>-{fmtMoney(p.deductions)}</td>
                                <td style={{ padding:'12px 14px', fontSize:13, fontWeight:700, color:'var(--success)' }}>{fmtMoney(p.net_pay)}</td>
                                <td style={{ padding:'12px 14px' }}>
                                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background: sc.bg, color: sc.text, textTransform:'capitalize' }}>{p.status || 'pending'}</span>
                                </td>
                                <td style={{ padding:'12px 14px' }}>
                                  {p.status === 'approved' && connectStatus?.onboarding_complete && (
                                    <div style={{ display:'flex', gap:4 }}>
                                      <button onClick={() => payDriver(p.id, 'standard')} disabled={payingDriverId === p.id}
                                        style={{ fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:6, background:'rgba(34,197,94,0.15)', color:'var(--success)', border:'none', cursor:'pointer' }}>
                                        {payingDriverId === p.id ? '...' : 'Pay ACH'}
                                      </button>
                                      <button onClick={() => payDriver(p.id, 'instant')} disabled={payingDriverId === p.id}
                                        style={{ fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:6, background:'rgba(240,165,0,0.15)', color:'var(--accent)', border:'none', cursor:'pointer' }}
                                        title={`Instant: $${(Number(p.net_pay||0)*0.015).toFixed(2)} fee`}>
                                        {payingDriverId === p.id ? '...' : '⚡ Instant'}
                                      </button>
                                    </div>
                                  )}
                                  {p.status === 'approved' && !connectStatus?.onboarding_complete && (
                                    <button onClick={async () => {
                                      await db.updatePayroll(p.id, { status: 'paid' })
                                      setPayroll(prev => prev.map(pp => pp.id === p.id ? { ...pp, status: 'paid' } : pp))
                                      showToast('','Marked Paid','Settlement marked as paid (manual)')
                                    }} style={{ fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:6, background:'rgba(34,197,94,0.1)', color:'var(--success)', border:'none', cursor:'pointer' }}>Mark Paid</button>
                                  )}
                                  {p.payment_status === 'in_transit' && <span style={{ fontSize:10, color:'var(--accent3)', fontWeight:600 }}>⏳ In Transit</span>}
                                  {p.payment_status === 'paid' && <span style={{ fontSize:10, color:'var(--success)', fontWeight:600 }}>✓ Deposited</span>}
                                  {p.payment_status === 'failed' && (
                                    <button onClick={() => payDriver(p.id, 'standard')} style={{ fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:6, background:'rgba(239,68,68,0.15)', color:'var(--danger)', border:'none', cursor:'pointer' }}>
                                      Retry
                                    </button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}

                {activeTab === 'bank' && (
                  <div style={{ ...ps.panel, padding:'24px' }}>
                    <div style={ps.sectionTitle}>Payment Method</div>
                    <div style={{ display:'flex', gap:8, marginBottom:20 }}>
                      {[
                        { id:'direct', label:'Direct Deposit (ACH)', icon: CreditCard },
                        { id:'check', label:'Paper Check', icon: FileText },
                        { id:'other', label:'Zelle / Venmo / Other', icon: Send },
                      ].map(m => (
                        <button key={m.id} onClick={() => saveBankInfo(selectedDriverId, { ...dSelBank, method: m.id })} style={{
                          flex:1, padding:'14px', borderRadius:10, cursor:'pointer', textAlign:'center',
                          background: dSelBank.method === m.id ? 'rgba(240,165,0,0.08)' : 'var(--bg)',
                          border: dSelBank.method === m.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                        }}>
                          <Ic icon={m.icon} size={20} color={dSelBank.method === m.id ? 'var(--accent)' : 'var(--muted)'} />
                          <div style={{ fontSize:11, fontWeight: dSelBank.method === m.id ? 700 : 500, marginTop:6, color: dSelBank.method === m.id ? 'var(--accent)' : 'var(--text)' }}>{m.label}</div>
                        </button>
                      ))}
                    </div>

                    {dSelBank.method === 'direct' && (
                      <>
                        <div style={ps.sectionTitle}>Bank Account Details</div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                          <div>
                            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Bank Name</div>
                            <input value={dSelBank.bankName || ''} onChange={e => saveBankInfo(selectedDriverId, { ...dSelBank, bankName: e.target.value })} placeholder="Chase, Wells Fargo..." style={ps.input} />
                          </div>
                          <div>
                            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Account Type</div>
                            <select value={dSelBank.accountType || 'checking'} onChange={e => saveBankInfo(selectedDriverId, { ...dSelBank, accountType: e.target.value })} style={ps.input}>
                              <option value="checking">Checking</option>
                              <option value="savings">Savings</option>
                            </select>
                          </div>
                        </div>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                          <div>
                            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Routing Number</div>
                            <input value={dSelBank.routing || ''} onChange={e => saveBankInfo(selectedDriverId, { ...dSelBank, routing: e.target.value })} placeholder="9 digits" maxLength={9} style={ps.input} />
                          </div>
                          <div>
                            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Account Number (last 4)</div>
                            <input value={dSelBank.last4 || ''} onChange={e => saveBankInfo(selectedDriverId, { ...dSelBank, last4: e.target.value })} placeholder="Last 4 digits" maxLength={4} style={ps.input} />
                          </div>
                        </div>
                        <div style={{ padding:'10px 14px', background:'rgba(34,197,94,0.06)', borderRadius:8, border:'1px solid rgba(34,197,94,0.15)', fontSize:11, color:'var(--success)', display:'flex', alignItems:'center', gap:8 }}>
                          <Ic icon={Shield} size={14} /> Bank details are encrypted and stored securely in your Supabase database with row-level security.
                        </div>
                      </>
                    )}

                    {dSelBank.method === 'other' && (
                      <div>
                        <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Payment Details (Zelle email/phone, Venmo handle, etc.)</div>
                        <input value={dSelBank.otherDetails || ''} onChange={e => saveBankInfo(selectedDriverId, { ...dSelBank, otherDetails: e.target.value })} placeholder="e.g., @driver-venmo or driver@email.com" style={ps.input} />
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'deductions' && (
                  <div style={{ ...ps.panel, padding:'24px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                      <div>
                        <div style={ps.sectionTitle}>Recurring Deductions</div>
                        <div style={{ fontSize:11, color:'var(--muted)', marginTop:-8 }}>Automatically applied each pay period</div>
                      </div>
                      <button onClick={() => {
                        const updated = [...dSelRecurring, { label: '', amount: 0, type: 'flat' }]
                        saveRecurringDeduction(selectedDriverId, updated)
                      }} style={{ padding:'6px 14px', fontSize:11, fontWeight:700, background:'var(--accent)', color:'#000', border:'none', borderRadius:8, cursor:'pointer' }}>
                        <Ic icon={Plus} size={12} /> Add Deduction
                      </button>
                    </div>

                    {dSelRecurring.length === 0 ? (
                      <div style={{ padding:32, textAlign:'center', background:'var(--bg)', borderRadius:10, color:'var(--muted)', fontSize:12 }}>
                        No recurring deductions configured. Add items like insurance, escrow, phone, or equipment lease.
                      </div>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {dSelRecurring.map((d, i) => (
                          <div key={i} style={{ display:'flex', gap:10, alignItems:'center', background:'var(--bg)', padding:'10px 14px', borderRadius:10 }}>
                            <div style={{ flex:2 }}>
                              <input value={d.label} onChange={e => {
                                const updated = [...dSelRecurring]; updated[i] = { ...d, label: e.target.value }
                                saveRecurringDeduction(selectedDriverId, updated)
                              }} placeholder="e.g., Health Insurance, Phone, Escrow" style={{ ...ps.input, background:'var(--surface)' }} />
                            </div>
                            <div style={{ flex:1 }}>
                              <input type="number" value={d.amount || ''} onChange={e => {
                                const updated = [...dSelRecurring]; updated[i] = { ...d, amount: e.target.value }
                                saveRecurringDeduction(selectedDriverId, updated)
                              }} placeholder="Amount" style={{ ...ps.input, background:'var(--surface)' }} />
                            </div>
                            <select value={d.type || 'flat'} onChange={e => {
                              const updated = [...dSelRecurring]; updated[i] = { ...d, type: e.target.value }
                              saveRecurringDeduction(selectedDriverId, updated)
                            }} style={{ ...ps.input, background:'var(--surface)', width:100 }}>
                              <option value="flat">$/period</option>
                              <option value="percent">% of gross</option>
                            </select>
                            <button onClick={() => {
                              const updated = dSelRecurring.filter((_, j) => j !== i)
                              saveRecurringDeduction(selectedDriverId, updated)
                            }} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--danger)', padding:4 }}>
                              <Ic icon={Trash2} size={14} />
                            </button>
                          </div>
                        ))}
                        <div style={{ borderTop:'1px solid var(--border)', paddingTop:10, display:'flex', justifyContent:'space-between', fontSize:12 }}>
                          <span style={{ color:'var(--muted)' }}>Total per period</span>
                          <span style={{ fontWeight:700, color:'var(--danger)' }}>-{fmtMoney(dSelRecurring.reduce((s, d) => s + (Number(d.amount) || 0), 0))}</span>
                        </div>
                      </div>
                    )}

                    {/* Common deduction templates */}
                    <div style={{ marginTop:20 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>Quick Add</div>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        {[
                          { label:'Health Insurance', amount:200 },{ label:'Phone/ELD', amount:25 },{ label:'Escrow', amount:100 },
                          { label:'Equipment Lease', amount:500 },{ label:'Cargo Insurance', amount:50 },{ label:'Occupational Accident', amount:40 },
                        ].map(t => (
                          <button key={t.label} onClick={() => {
                            const updated = [...dSelRecurring, { label: t.label, amount: t.amount, type: 'flat' }]
                            saveRecurringDeduction(selectedDriverId, updated)
                          }} style={{ padding:'5px 12px', fontSize:10, fontWeight:600, background:'var(--bg)', border:'1px solid var(--border)', borderRadius:6, cursor:'pointer', color:'var(--text)' }}>
                            + {t.label} (${t.amount})
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === '1099' && (
                  <div style={{ ...ps.panel, padding:'24px' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background: selNeeds1099 ? 'rgba(240,165,0,0.1)' : 'rgba(74,85,112,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        <Ic icon={FileText} size={18} color={selNeeds1099 ? 'var(--accent)' : 'var(--muted)'} />
                      </div>
                      <div>
                        <div style={{ fontSize:16, fontWeight:700 }}>1099-NEC Status</div>
                        <div style={{ fontSize:12, color:'var(--muted)' }}>Tax year {new Date().getFullYear()}</div>
                      </div>
                      <div style={{ marginLeft:'auto' }}>
                        <span style={{
                          fontSize:11, fontWeight:700, padding:'5px 14px', borderRadius:20,
                          background: selNeeds1099 ? 'rgba(240,165,0,0.15)' : 'rgba(34,197,94,0.1)',
                          color: selNeeds1099 ? 'var(--accent)' : 'var(--success)',
                        }}>{selNeeds1099 ? '1099 Required' : 'Under Threshold'}</span>
                      </div>
                    </div>
                    <div style={{ background:'var(--bg)', borderRadius:10, padding:'16px 20px', marginBottom:16 }}>
                      {[
                        { label:'Total Compensation', val: fmtMoney(selYtd.gross) },
                        { label:'1099 Threshold', val: '$600.00' },
                        { label: selNeeds1099 ? 'Amount Over Threshold' : 'Remaining Before Threshold', val: selNeeds1099 ? fmtMoney(selYtd.gross - 600) : fmtMoney(600 - selYtd.gross) },
                      ].map((r, i, arr) => (
                        <div key={r.label} style={i < arr.length - 1 ? ps.row : ps.rowLast}>
                          <span style={ps.label}>{r.label}</span>
                          <span style={ps.value}>{r.val}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize:12, color:'var(--muted)', lineHeight:1.6 }}>
                      {selNeeds1099
                        ? `A 1099-NEC must be issued to ${selectedDriver.full_name || selectedDriver.name} by January 31, ${new Date().getFullYear() + 1} for non-employee compensation totaling ${fmtMoney(selYtd.gross)}.`
                        : `${selectedDriver.full_name || selectedDriver.name} has earned ${fmtMoney(selYtd.gross)} YTD. A 1099-NEC is only required if total compensation reaches $600 or more.`
                      }
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════════
// HIRING PIPELINE
// ═══════════════════════════════════════════════════════════════════════════════

const HIRING_STAGES = [
  { id:'applied', label:'Applied', color:'var(--muted)' },
  { id:'screening', label:'Screening', color:'var(--accent3,#8b5cf6)' },
  { id:'interview', label:'Interview', color:'var(--accent)' },
  { id:'offer', label:'Offer Sent', color:'var(--accent2,#06b6d4)' },
  { id:'hired', label:'Hired', color:'var(--success)' },
  { id:'rejected', label:'Rejected', color:'var(--danger)' },
]

export function HiringPipeline() {
  const { showToast } = useApp()
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name:'', phone:'', email:'', position:'CDL-A Driver', cdlClass:'A', experience:'', notes:'' })
  const [filterStage, setFilterStage] = useState('all')

  useEffect(() => {
    db.fetchHiringCandidates().then(data => {
      // Map DB fields to component fields
      setCandidates((data || []).map(c => ({
        id: c.id, name: c.name, phone: c.phone, email: c.email,
        position: c.position, cdlClass: c.cdl_class, experience: c.experience,
        notes: c.notes, stage: c.stage, appliedDate: c.applied_date, history: c.history || [],
      })))
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const addCandidate = async () => {
    if (!form.name.trim()) return
    const history = [{ stage:'applied', date: new Date().toISOString() }]
    try {
      const saved = await db.createHiringCandidate({
        name: form.name, phone: form.phone, email: form.email,
        position: form.position, cdl_class: form.cdlClass, experience: form.experience,
        notes: form.notes, stage: 'applied', applied_date: new Date().toISOString(), history,
      })
      const c = { id: saved.id, ...form, stage: 'applied', appliedDate: saved.applied_date, history }
      setCandidates(prev => [c, ...prev])
      setForm({ name:'', phone:'', email:'', position:'CDL-A Driver', cdlClass:'A', experience:'', notes:'' })
      setShowForm(false)
      showToast('','Added',`${form.name} added to pipeline`)
    } catch { showToast('','Error','Failed to save candidate') }
  }

  const advanceStage = async (id) => {
    const c = candidates.find(c => c.id === id)
    if (!c) return
    const stageIdx = HIRING_STAGES.findIndex(s => s.id === c.stage)
    if (stageIdx >= 4) return
    const nextStage = HIRING_STAGES[stageIdx + 1].id
    const newHistory = [...(c.history||[]), { stage: nextStage, date: new Date().toISOString() }]
    try {
      await db.updateHiringCandidate(id, { stage: nextStage, history: newHistory })
      setCandidates(prev => prev.map(cc => cc.id === id ? { ...cc, stage: nextStage, history: newHistory } : cc))
    } catch { showToast('','Error','Failed to update candidate') }
  }

  const rejectCandidate = async (id) => {
    const c = candidates.find(c => c.id === id)
    if (!c) return
    const newHistory = [...(c.history||[]), { stage:'rejected', date: new Date().toISOString() }]
    try {
      await db.updateHiringCandidate(id, { stage: 'rejected', history: newHistory })
      setCandidates(prev => prev.map(cc => cc.id === id ? { ...cc, stage: 'rejected', history: newHistory } : cc))
    } catch { showToast('','Error','Failed to reject candidate') }
  }

  const deleteCandidate = async (id) => {
    try {
      await db.deleteHiringCandidate(id)
      setCandidates(prev => prev.filter(c => c.id !== id))
      showToast('','Removed','Candidate removed from pipeline')
    } catch { showToast('','Error','Failed to delete candidate') }
  }

  const filtered = filterStage === 'all' ? candidates.filter(c => c.stage !== 'rejected') : candidates.filter(c => c.stage === filterStage)
  const stageCounts = HIRING_STAGES.reduce((m, s) => { m[s.id] = candidates.filter(c => c.stage === s.id).length; return m }, {})

  const ps = {
    panel: { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 },
    input: { background:'var(--bg)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'var(--text)', outline:'none', width:'100%' },
  }

  return (
    <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:1.5 }}>HIRING PIPELINE</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Applicant tracking & recruitment workflow</div>
        </div>
        <button onClick={() => setShowForm(!showForm)} style={{ padding:'8px 18px', fontSize:12, fontWeight:700, background:'var(--accent)', color:'#000', border:'none', borderRadius:8, cursor:'pointer' }}>
          <Ic icon={Plus} size={14} /> New Applicant
        </button>
      </div>

      {/* Pipeline stage counts */}
      <div style={{ display:'flex', gap:8 }}>
        <button onClick={() => setFilterStage('all')} style={{
          padding:'8px 16px', fontSize:11, fontWeight: filterStage === 'all' ? 700 : 500, borderRadius:8, cursor:'pointer',
          background: filterStage === 'all' ? 'var(--accent)' : 'var(--surface)', color: filterStage === 'all' ? '#000' : 'var(--text)',
          border: filterStage === 'all' ? 'none' : '1px solid var(--border)',
        }}>All ({candidates.filter(c => c.stage !== 'rejected').length})</button>
        {HIRING_STAGES.map(s => (
          <button key={s.id} onClick={() => setFilterStage(s.id)} style={{
            padding:'8px 14px', fontSize:11, fontWeight: filterStage === s.id ? 700 : 500, borderRadius:8, cursor:'pointer',
            background: filterStage === s.id ? s.color : 'var(--surface)', color: filterStage === s.id ? '#fff' : 'var(--text)',
            border: filterStage === s.id ? 'none' : '1px solid var(--border)', display:'flex', alignItems:'center', gap:6,
          }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background: filterStage === s.id ? '#fff' : s.color }} />
            {s.label} ({stageCounts[s.id] || 0})
          </button>
        ))}
      </div>

      {/* Add candidate form */}
      {showForm && (
        <div style={{ ...ps.panel, padding:'20px 24px' }}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:14 }}>New Applicant</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Full Name *</div>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="John Smith" style={ps.input} />
            </div>
            <div>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Phone</div>
              <input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} placeholder="(555) 123-4567" style={ps.input} />
            </div>
            <div>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Email</div>
              <input value={form.email} onChange={e => setForm({...form, email: e.target.value})} placeholder="john@email.com" style={ps.input} />
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
            <div>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Position</div>
              <select value={form.position} onChange={e => setForm({...form, position: e.target.value})} style={ps.input}>
                <option>CDL-A Driver</option><option>CDL-B Driver</option><option>Owner Operator</option><option>Dispatcher</option><option>Mechanic</option><option>Other</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>CDL Class</div>
              <select value={form.cdlClass} onChange={e => setForm({...form, cdlClass: e.target.value})} style={ps.input}>
                <option value="A">Class A</option><option value="B">Class B</option><option value="none">No CDL</option>
              </select>
            </div>
            <div>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Years Experience</div>
              <input value={form.experience} onChange={e => setForm({...form, experience: e.target.value})} placeholder="e.g., 5" style={ps.input} />
            </div>
          </div>
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>Notes</div>
            <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} placeholder="Referral source, special qualifications, etc." rows={2} style={{ ...ps.input, resize:'vertical' }} />
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={addCandidate} style={{ padding:'8px 20px', fontSize:12, fontWeight:700, background:'var(--accent)', color:'#000', border:'none', borderRadius:8, cursor:'pointer' }}>Add to Pipeline</button>
            <button onClick={() => setShowForm(false)} className="btn btn-ghost" style={{ fontSize:12 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Candidate list */}
      {filtered.length === 0 ? (
        <div style={{ ...ps.panel, padding:48, textAlign:'center', color:'var(--muted)' }}>
          <Ic icon={UserPlus} size={28} color="var(--muted)" />
          <div style={{ marginTop:10, fontSize:13 }}>{filterStage === 'all' ? 'No applicants yet. Add your first candidate above.' : 'No candidates in this stage.'}</div>
        </div>
      ) : (
        <div style={{ ...ps.panel, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'var(--bg)' }}>
                {['Applicant','Position','CDL','Experience','Applied','Stage','Actions'].map(h => (
                  <th key={h} style={{ padding:'10px 14px', fontSize:9, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1, borderBottom:'1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => {
                const stage = HIRING_STAGES.find(s => s.id === c.stage) || HIRING_STAGES[0]
                const nextStage = HIRING_STAGES[HIRING_STAGES.findIndex(s => s.id === c.stage) + 1]
                return (
                  <tr key={c.id} style={{ borderBottom:'1px solid var(--border)' }}>
                    <td style={{ padding:'12px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:34, height:34, borderRadius:'50%', background: stage.color, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, flexShrink:0 }}>
                          {c.name.split(' ').map(w => w[0]).join('').slice(0,2)}
                        </div>
                        <div>
                          <div style={{ fontSize:13, fontWeight:600 }}>{c.name}</div>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>{c.phone || c.email || 'No contact'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'12px 14px', fontSize:12 }}>{c.position}</td>
                    <td style={{ padding:'12px 14px', fontSize:12 }}>{c.cdlClass === 'none' ? '—' : `Class ${c.cdlClass}`}</td>
                    <td style={{ padding:'12px 14px', fontSize:12 }}>{c.experience ? `${c.experience} yr` : '—'}</td>
                    <td style={{ padding:'12px 14px', fontSize:11, color:'var(--muted)' }}>{new Date(c.appliedDate).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</td>
                    <td style={{ padding:'12px 14px' }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'3px 10px', borderRadius:20, background: `${stage.color}15`, color: stage.color }}>{stage.label}</span>
                    </td>
                    <td style={{ padding:'12px 14px' }}>
                      <div style={{ display:'flex', gap:4 }}>
                        {nextStage && c.stage !== 'hired' && c.stage !== 'rejected' && (
                          <button onClick={() => advanceStage(c.id)} title={`Move to ${nextStage.label}`}
                            style={{ fontSize:9, fontWeight:700, padding:'4px 8px', borderRadius:6, background:'rgba(34,197,94,0.1)', color:'var(--success)', border:'none', cursor:'pointer' }}>
                            → {nextStage.label}
                          </button>
                        )}
                        {c.stage !== 'rejected' && c.stage !== 'hired' && (
                          <button onClick={() => rejectCandidate(c.id)} title="Reject"
                            style={{ fontSize:9, fontWeight:700, padding:'4px 8px', borderRadius:6, background:'rgba(239,68,68,0.1)', color:'var(--danger)', border:'none', cursor:'pointer' }}>
                            Reject
                          </button>
                        )}
                        <button onClick={() => deleteCandidate(c.id)} title="Delete"
                          style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:'4px' }}>
                          <Ic icon={Trash2} size={12} />
                        </button>
                      </div>
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

  // Pay model info
  const payModel = driver.pay_model || 'percent'
  const payRate = Number(driver.pay_rate) || 28
  const payModelText = payModel === 'percent' ? `${payRate}% of gross`
    : payModel === 'permile' ? `$${payRate.toFixed(2)}/mile`
    : payModel === 'flat' ? `$${payRate} flat/load` : `${payRate}%`

  // Avg per load
  const avgPerLoad = delivered.length > 0 ? Math.round(totalGross / delivered.length) : 0

  // Status color
  const statusColor = (driver.status || 'Active') === 'Active' ? 'var(--success)' : '#f59e0b'

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      {/* ── Driver Selector Panel ── */}
      <div style={{ width:220, flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--bg)', overflowY:'auto', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'16px 18px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:9, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:4 }}>DRIVER PORTAL</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>{drivers.length} driver{drivers.length !== 1 ? 's' : ''}</div>
        </div>
        {drivers.map(d => {
          const isSel = selectedDriver === d.id
          const n = d.full_name || d.name || '?'
          const initials = n.split(' ').map(w => w[0]).join('').slice(0,2)
          const dLoads = loads.filter(l => l.driver === n || l.driver_name === n)
          const dStatus = d.status || 'Active'
          return (
            <div key={d.id} onClick={() => setSelectedDriver(d.id)}
              style={{
                padding:'12px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10,
                borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                background: isSel ? 'rgba(240,165,0,0.06)' : 'transparent',
                borderBottom:'1px solid var(--border)',
                transition:'all 0.15s ease',
              }}>
              <div style={{
                width:36, height:36, borderRadius:'50%', flexShrink:0,
                background: isSel ? 'var(--accent)' : 'var(--surface)',
                border: isSel ? 'none' : '1px solid var(--border)',
                color: isSel ? '#000' : 'var(--muted)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:12, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif",
              }}>{initials}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight: isSel ? 700 : 500, color: isSel ? 'var(--text)' : 'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n}</div>
                <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                  <div style={{ width:5, height:5, borderRadius:'50%', background: dStatus === 'Active' ? 'var(--success)' : '#f59e0b' }} />
                  <span style={{ fontSize:9, color:'var(--muted)' }}>{dLoads.length} load{dLoads.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Portal Content ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'24px 28px', display:'flex', flexDirection:'column', gap:20 }}>

        {/* ── HEADER — Driver Profile Card ── */}
        <div style={{
          background:'linear-gradient(135deg, var(--surface) 0%, rgba(240,165,0,0.04) 100%)',
          border:'1px solid var(--border)', borderRadius:16, padding:'24px 28px',
          display:'flex', alignItems:'center', gap:20,
        }}>
          <div style={{
            width:72, height:72, borderRadius:'50%',
            background:'linear-gradient(135deg, var(--accent), #d4940a)',
            color:'#000', display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:26, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif",
            boxShadow:'0 4px 20px rgba(240,165,0,0.2)',
          }}>{avatar}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, letterSpacing:1.5 }}>{name}</div>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:4 }}>
              <span style={{ fontSize:12, color:'var(--muted)' }}>CDL: <span style={{ color:'var(--text)', fontWeight:600 }}>{driver.license_number || driver.cdl_number || '—'}</span></span>
              <span style={{ width:1, height:12, background:'var(--border)' }} />
              <span style={{ fontSize:12, color:'var(--muted)' }}>Class: <span style={{ color:'var(--text)', fontWeight:600 }}>{driver.license_class || 'A'}</span></span>
              <span style={{ width:1, height:12, background:'var(--border)' }} />
              <span style={{ fontSize:12, color:'var(--muted)' }}>Pay: <span style={{ color:'var(--accent)', fontWeight:700 }}>{payModelText}</span></span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
              <span style={{
                display:'inline-flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700,
                padding:'3px 10px', borderRadius:20,
                background: statusColor === 'var(--success)' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                color: statusColor,
              }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:statusColor }} />
                {driver.status || 'Active'}
              </span>
              {driver.endorsements && (
                <span style={{ fontSize:10, color:'var(--muted)', padding:'3px 10px', background:'var(--surface2)', borderRadius:20 }}>
                  {driver.endorsements}
                </span>
              )}
              {driver.equipment_experience && (
                <span style={{ fontSize:10, color:'var(--muted)', padding:'3px 10px', background:'var(--surface2)', borderRadius:20 }}>
                  {driver.equipment_experience}
                </span>
              )}
            </div>
          </div>
          {/* Right side — quick contact */}
          <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end' }}>
            {driver.phone && (
              <a href={`tel:${driver.phone}`} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--accent)', textDecoration:'none', fontWeight:600 }}>
                <Phone size={12} /> {driver.phone}
              </a>
            )}
            {driver.email && (
              <a href={`mailto:${driver.email}`} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--muted)', textDecoration:'none' }}>
                <Send size={12} /> {driver.email}
              </a>
            )}
          </div>
        </div>

        {/* ── STATS ROW ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
          {[
            { label:'Loads Completed', value:String(delivered.length), icon:Package, color:'var(--accent)' },
            { label:'Total Miles', value:totalMiles.toLocaleString(), icon:Truck, color:'var(--text)' },
            { label:'Gross Earnings', value:`$${totalGross.toLocaleString()}`, icon:DollarSign, color:'var(--accent)' },
            { label:'Avg / Load', value:`$${avgPerLoad.toLocaleString()}`, icon:TrendingUp, color:'#8b5cf6' },
            { label:'YTD Net Pay', value:`$${ytdPay.toLocaleString(undefined,{maximumFractionDigits:0})}`, icon:CreditCard, color:'var(--success)' },
          ].map(k => (
            <div key={k.label} style={{
              background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14,
              padding:'16px 18px', position:'relative', overflow:'hidden',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                <div style={{ width:28, height:28, borderRadius:8, background:`${k.color}12`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Ic icon={k.icon} size={14} color={k.color} />
                </div>
                <span style={{ fontSize:9, fontWeight:700, color:'var(--muted)', letterSpacing:0.8, textTransform:'uppercase' }}>{k.label}</span>
              </div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:k.color, letterSpacing:0.5 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* ── TWO-COLUMN LAYOUT ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

          {/* Compliance status */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'20px', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:32, height:32, borderRadius:8, background: compliancePct === 100 ? 'rgba(34,197,94,0.1)' : 'rgba(240,165,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Shield size={16} style={{ color: compliancePct === 100 ? 'var(--success)' : 'var(--accent)' }} />
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>Compliance Status</div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>DQ file requirements</div>
                </div>
              </div>
              <div style={{
                fontSize:18, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif",
                color: compliancePct === 100 ? 'var(--success)' : compliancePct >= 50 ? 'var(--accent)' : 'var(--danger)',
              }}>{compliancePct}%</div>
            </div>
            {/* Progress bar */}
            <div style={{ height:6, background:'var(--bg)', borderRadius:3, overflow:'hidden', marginBottom:14 }}>
              <div style={{
                height:'100%', borderRadius:3, transition:'width 0.5s ease',
                width:`${compliancePct}%`,
                background: compliancePct === 100 ? 'var(--success)' : compliancePct >= 50 ? 'var(--accent)' : 'var(--danger)',
              }} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, flex:1 }}>
              {[
                { label:'CDL License', ok: uploadedTypes.has('cdl') },
                { label:'Medical Card', ok: uploadedTypes.has('medical_card') },
                { label:'MVR Record', ok: uploadedTypes.has('mvr') },
                { label:'Drug Test', ok: uploadedTypes.has('drug_pre_employment') },
                { label:'Background', ok: uploadedTypes.has('background_check') },
                { label:'Road Test', ok: uploadedTypes.has('road_test') },
              ].map(c => (
                <div key={c.label} style={{
                  display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
                  background: c.ok ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
                  border:`1px solid ${c.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}`,
                  borderRadius:10,
                }}>
                  {c.ok ? <CheckCircle size={14} style={{ color:'var(--success)', flexShrink:0 }} /> : <XCircle size={14} style={{ color:'var(--danger)', flexShrink:0 }} />}
                  <span style={{ fontSize:11, fontWeight:600, color: c.ok ? 'var(--success)' : 'var(--danger)' }}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Documents on file */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:'rgba(139,92,246,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <FileText size={16} style={{ color:'#8b5cf6' }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>Documents on File</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>{dqFiles.length} document{dqFiles.length !== 1 ? 's' : ''} uploaded</div>
              </div>
            </div>
            {dqFiles.length === 0 ? (
              <div style={{ padding:32, textAlign:'center', color:'var(--muted)', flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(240,165,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12 }}>
                  <Upload size={20} style={{ color:'var(--accent)' }} />
                </div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:4 }}>No documents yet</div>
                <div style={{ fontSize:11 }}>Upload DQ files from the DQ Files tab</div>
              </div>
            ) : (
              <div style={{ flex:1, overflowY:'auto', maxHeight:280 }}>
                {dqFiles.map((f, i) => {
                  const type = DQ_DOC_TYPES.find(t => t.id === f.doc_type)
                  const status = DOC_STATUS_COLORS[getExpiryStatus(f.expiry_date)] || DOC_STATUS_COLORS.valid
                  return (
                    <div key={f.id} style={{
                      display:'flex', alignItems:'center', gap:12, padding:'10px 20px',
                      borderBottom: i < dqFiles.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:status.color, flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{type?.label || f.doc_type}</div>
                        <div style={{ fontSize:10, color:'var(--muted)' }}>{f.file_name}</div>
                      </div>
                      <span style={{ fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:20, background:status.bg, color:status.color }}>{status.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RECENT LOADS ── */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(240,165,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Package size={16} style={{ color:'var(--accent)' }} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700 }}>Recent Loads</div>
              <div style={{ fontSize:10, color:'var(--muted)' }}>{driverLoads.length} total · {delivered.length} delivered</div>
            </div>
          </div>
          {driverLoads.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--muted)' }}>
              <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(240,165,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
                <Package size={20} style={{ color:'var(--accent)' }} />
              </div>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:4 }}>No loads assigned</div>
              <div style={{ fontSize:11 }}>Assign loads from the Dispatch tab</div>
            </div>
          ) : (
            <div style={{ maxHeight:300, overflowY:'auto' }}>
              {/* Table header */}
              <div style={{ display:'grid', gridTemplateColumns:'40px 1fr 1fr 100px 80px 100px', gap:8, padding:'8px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg)' }}>
                {['', 'Load ID', 'Route', 'Status', 'Miles', 'Gross'].map(h => (
                  <span key={h} style={{ fontSize:9, fontWeight:700, color:'var(--muted)', letterSpacing:0.8, textTransform:'uppercase' }}>{h}</span>
                ))}
              </div>
              {driverLoads.slice(0,12).map((l, i) => {
                const st = l.status || ''
                const stColor = st === 'Delivered' || st === 'Paid' ? 'var(--success)' : st === 'In Transit' ? 'var(--accent)' : st === 'Invoiced' ? '#8b5cf6' : 'var(--muted)'
                return (
                  <div key={l.id || i} style={{
                    display:'grid', gridTemplateColumns:'40px 1fr 1fr 100px 80px 100px', gap:8,
                    padding:'10px 20px', alignItems:'center',
                    borderBottom: i < Math.min(driverLoads.length, 12) - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:stColor }} />
                    <div style={{ fontSize:12, fontWeight:600, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.loadId || l.load_id || '—'}</div>
                    <div style={{ fontSize:12, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{(l.origin||'').split(',')[0]} → {(l.dest||l.destination||'').split(',')[0]}</div>
                    <span style={{ fontSize:10, fontWeight:700, color:stColor, padding:'2px 8px', background:`${stColor}12`, borderRadius:20, textAlign:'center', whiteSpace:'nowrap' }}>{st}</span>
                    <span style={{ fontSize:12, color:'var(--muted)' }}>{(l.miles || 0).toLocaleString()}</span>
                    <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--accent)' }}>${(l.gross || l.rate || 0).toLocaleString()}</span>
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

// ═══════════════════════════════════════════════════════════════════════════════
// DRIVER CONTRACTS — Lease Agreements & Independent Contractor Agreements
// ═══════════════════════════════════════════════════════════════════════════════

import { CONTRACT_TYPES, LEASE_SECTIONS, IC_SECTIONS, LEASE_LEGAL_TEXT, IC_LEGAL_TEXT, payDescription as payDesc } from '../../lib/contractLegalText'

function printContract(contract, company) {
  const isLease = contract.contract_type === 'lease'
  const sections = isLease ? LEASE_SECTIONS : IC_SECTIONS
  const legalText = isLease ? LEASE_LEGAL_TEXT : IC_LEGAL_TEXT
  const typeLabel = CONTRACT_TYPES.find(t => t.id === contract.contract_type)?.label || contract.contract_type
  const payDesc = contract.pay_structure === 'percent' ? `${contract.pay_rate}% of gross revenue` : contract.pay_structure === 'permile' ? `$${contract.pay_rate} per mile` : `$${contract.pay_rate} per load`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><title>${typeLabel} — ${contract.driver_name}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Times New Roman', Georgia, serif; color:#1a1a1a; padding:60px 72px; line-height:1.6; max-width:900px; margin:0 auto; }
  h1 { font-size:22px; text-align:center; text-transform:uppercase; letter-spacing:2px; margin-bottom:4px; }
  .subtitle { text-align:center; font-size:13px; color:#666; margin-bottom:32px; }
  .parties { margin-bottom:28px; font-size:14px; }
  .parties strong { font-weight:700; }
  .summary-table { width:100%; border-collapse:collapse; margin-bottom:28px; }
  .summary-table td { padding:8px 12px; border:1px solid #ddd; font-size:13px; }
  .summary-table td:first-child { font-weight:700; background:#f8f8f8; width:200px; }
  .section { margin-bottom:24px; page-break-inside:avoid; }
  .section-num { font-size:14px; font-weight:700; margin-bottom:6px; text-transform:uppercase; color:#333; }
  .section-body { font-size:13px; text-align:justify; }
  .terms-box { background:#f9f9f4; border:1px solid #e0dcc8; padding:16px; border-radius:4px; margin-bottom:28px; }
  .terms-box h3 { font-size:13px; font-weight:700; margin-bottom:6px; }
  .terms-box p { font-size:12px; white-space:pre-wrap; }
  .sig-block { margin-top:48px; display:flex; justify-content:space-between; gap:48px; }
  .sig-col { flex:1; }
  .sig-line { border-bottom:1px solid #333; height:50px; margin-bottom:6px; position:relative; }
  .sig-line img { position:absolute; bottom:4px; left:0; height:44px; }
  .sig-label { font-size:11px; color:#666; }
  .sig-date { font-size:12px; margin-top:4px; }
  .footer { margin-top:48px; text-align:center; font-size:10px; color:#999; border-top:1px solid #ddd; padding-top:16px; }
  .fmcsa-note { background:#fffbe6; border:1px solid #f0d060; padding:12px 16px; border-radius:4px; margin-bottom:28px; font-size:11px; }
  @media print {
    body { padding:40px 48px; }
    .no-print { display:none; }
  }
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:24px">
  <button onclick="window.print()" style="padding:10px 32px;font-size:14px;background:#f0a500;color:#000;border:none;border-radius:6px;cursor:pointer;font-weight:700">Print Contract</button>
  <button onclick="window.close()" style="padding:10px 24px;font-size:14px;background:#eee;color:#333;border:none;border-radius:6px;cursor:pointer;margin-left:8px">Close</button>
</div>

<h1>${typeLabel}</h1>
<div class="subtitle">${isLease ? '49 CFR §376.12 Compliant' : 'Independent Contractor Relationship'}</div>

<div class="parties">
  <p>This agreement ("Agreement") is entered into as of <strong>${contract.start_date || '___________'}</strong> by and between:</p>
  <p style="margin:12px 0"><strong>CARRIER:</strong> ${contract.company_name || company || '___________'} ("Carrier")</p>
  <p><strong>OWNER-OPERATOR / CONTRACTOR:</strong> ${contract.driver_name || '___________'} ("Owner-Operator")</p>
</div>

${isLease ? '<div class="fmcsa-note"><strong>FMCSA Compliance Notice:</strong> This lease agreement is prepared in accordance with the requirements of 49 CFR §376.12 (Lease and Interchange of Vehicles). All required provisions are included herein. Both parties should review all sections carefully before signing.</div>' : ''}

<table class="summary-table">
  <tr><td>Agreement Type</td><td>${typeLabel}</td></tr>
  <tr><td>Compensation</td><td>${payDesc}</td></tr>
  <tr><td>Start Date</td><td>${contract.start_date || 'Upon execution'}</td></tr>
  <tr><td>End Date</td><td>${contract.end_date || 'Open-ended (terminable with 30-day notice)'}</td></tr>
  <tr><td>Vehicle</td><td>${contract.vehicle_info || 'See Exhibit A'} ${contract.vehicle_vin ? '— VIN: ' + contract.vehicle_vin : ''}</td></tr>
  <tr><td>Status</td><td>${(contract.status || 'active').toUpperCase()}</td></tr>
</table>

${sections.map((s, i) => `
<div class="section">
  <div class="section-num">Section ${i + 1}: ${s}</div>
  <div class="section-body">${legalText[s] || ''}</div>
</div>`).join('')}

${contract.custom_terms ? `
<div class="terms-box">
  <h3>Additional Terms & Conditions</h3>
  <p>${contract.custom_terms}</p>
</div>` : ''}

<div class="section">
  <div class="section-num">Entire Agreement</div>
  <div class="section-body">This Agreement constitutes the entire understanding between the parties and supersedes all prior agreements, negotiations, and discussions. This Agreement may not be amended except by a written instrument signed by both parties. If any provision is held to be unenforceable, the remaining provisions shall continue in full force and effect.</div>
</div>

<div class="sig-block">
  <div class="sig-col">
    <div class="sig-line">${contract.carrier_signature ? `<img src="${contract.carrier_signature}" alt="Carrier Signature"/>` : ''}</div>
    <div class="sig-label"><strong>Carrier Authorized Signature</strong></div>
    <div class="sig-date">${contract.company_name || company || '___________'}</div>
    <div class="sig-date">Date: ${contract.signed_date ? new Date(contract.signed_date).toLocaleDateString() : '___________'}</div>
  </div>
  <div class="sig-col">
    <div class="sig-line">${contract.driver_signature ? `<img src="${contract.driver_signature}" alt="Driver Signature"/>` : ''}</div>
    <div class="sig-label"><strong>Owner-Operator / Contractor Signature</strong></div>
    <div class="sig-date">${contract.driver_name || '___________'}</div>
    <div class="sig-date">Date: ${contract.driver_signed_date ? new Date(contract.driver_signed_date).toLocaleDateString() : '___________'}</div>
  </div>
</div>
${contract.fully_executed ? `<div style="margin-top:24px;padding:12px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:4px;text-align:center;font-size:12px;color:#166534"><strong>FULLY EXECUTED</strong> — Both parties have signed this agreement electronically.${contract.driver_signed_ip ? ' Driver IP: ' + contract.driver_signed_ip : ''}${contract.driver_signed_date ? ' | Signed: ' + new Date(contract.driver_signed_date).toLocaleString() : ''}</div>` : ''}

<div class="footer">
  <p>Generated by Qivori AI — Transportation Management System</p>
  <p>This document is legally binding when signed by both parties. Retain copies for your records.</p>
  ${isLease ? '<p>Prepared in compliance with 49 CFR §376.12 — FMCSA Lease & Interchange of Vehicles</p>' : ''}
</div>
</body></html>`)
  win.document.close()
}

export function DriverContracts() {
  const { showToast, user } = useApp()
  const { drivers, vehicles, company } = useCarrier()
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [selDriver, setSelDriver] = useState('')
  const [selType, setSelType] = useState('lease')
  const [customTerms, setCustomTerms] = useState('')
  const [payStructure, setPayStructure] = useState('percent')
  const [payRate, setPayRate] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState('')
  const [signing, setSigning] = useState(false)
  const [sigCanvas, setSigCanvas] = useState(null)
  const [sigDrawing, setSigDrawing] = useState(false)
  const [hasSig, setHasSig] = useState(false)
  const [viewContract, setViewContract] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [sendingContract, setSendingContract] = useState(null)
  const [sendMethod, setSendMethod] = useState('both')
  const [amendingContract, setAmendingContract] = useState(null)
  const [amendReason, setAmendReason] = useState('')

  // Load contracts
  useEffect(() => {
    db.fetchDriverContracts().then(d => setContracts(d || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const saveContract = async (sigDataUrl) => {
    const driver = drivers.find(d => d.full_name === selDriver || d.id === selDriver)
    if (!driver) { showToast('','Error','Select a driver'); return }
    const vehicle = vehicles?.find(v => v.driver_id === driver.id || v.assigned_driver === driver.full_name)

    const contractData = {
      driver_id: driver.id,
      driver_name: driver.full_name,
      contract_type: selType,
      pay_structure: payStructure,
      pay_rate: parseFloat(payRate) || 0,
      start_date: startDate,
      end_date: endDate || null,
      vehicle_vin: vehicle?.vin || null,
      vehicle_info: vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : null,
      company_name: company?.company_name || company?.name || 'Carrier',
      custom_terms: customTerms || null,
      carrier_signature: sigDataUrl || null,
      carrier_signed_user_agent: navigator.userAgent,
      status: 'active',
      signed_date: new Date().toISOString(),
      ...(amendingContract ? {
        parent_contract_id: amendingContract.id,
        amendment_number: (amendingContract.amendment_number || 0) + 1,
        amendment_reason: amendReason || null,
      } : {}),
    }

    try {
      const saved = await db.createDriverContract(contractData)
      setContracts(prev => [saved, ...prev])
      showToast('','Contract Created',`${CONTRACT_TYPES.find(t=>t.id===selType)?.label} for ${driver.full_name}`)
      setShowNew(false)
      setSelDriver(''); setCustomTerms(''); setPayRate(''); setEndDate(''); setAmendingContract(null); setAmendReason('')
    } catch {
      showToast('','Error','Failed to save contract')
    }
  }

  const uploadCustomContract = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { uploadFile } = await import('../../lib/storage')
      const result = await uploadFile(file, `contracts/${selDriver || 'general'}`)
      setCustomTerms(result.url || result.path)
      showToast('','Uploaded', file.name)
    } catch { showToast('','Error','Upload failed') }
    setUploading(false)
  }

  const terminateContract = async (id) => {
    try {
      await db.updateDriverContract(id, { status: 'terminated', end_date: new Date().toISOString().split('T')[0] })
      setContracts(prev => prev.map(c => c.id === id ? { ...c, status: 'terminated', end_date: new Date().toISOString().split('T')[0] } : c))
      showToast('','Contract Terminated','Contract has been ended')
    } catch { showToast('','Error','Failed to terminate') }
  }

  const sendToDriver = async (contractId) => {
    setSendingContract(contractId)
    try {
      const res = await apiFetch('/api/send-contract', {
        method: 'POST',
        body: JSON.stringify({ contractId, sendMethod }),
      })
      if (res.ok) {
        setContracts(prev => prev.map(c => c.id === contractId ? { ...c, sent_at: new Date().toISOString(), sent_via: sendMethod } : c))
        showToast('', 'Contract Sent', `Sent to ${res.driverName} via ${sendMethod}`)
      } else {
        showToast('', 'Error', res.error || 'Failed to send')
      }
    } catch { showToast('', 'Error', 'Failed to send contract') }
    setSendingContract(null)
  }

  const createAmendment = (parentContract) => {
    setAmendingContract(parentContract)
    setSelDriver(parentContract.driver_name)
    setSelType(parentContract.contract_type)
    setPayStructure(parentContract.pay_structure)
    setPayRate(String(parentContract.pay_rate))
    setStartDate(new Date().toISOString().split('T')[0])
    setEndDate(parentContract.end_date || '')
    setCustomTerms('')
    setAmendReason('')
    setShowNew(true)
  }

  // Signature pad helpers
  const initSigCanvas = useCallback(node => {
    if (!node) return
    setSigCanvas(node)
    const ctx = node.getContext('2d')
    ctx.strokeStyle = '#f0a500'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
  }, [])

  const sigStart = (e) => {
    if (!sigCanvas) return
    const ctx = sigCanvas.getContext('2d')
    const rect = sigCanvas.getBoundingClientRect()
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
    ctx.beginPath(); ctx.moveTo(x, y)
    setSigDrawing(true)
  }
  const sigMove = (e) => {
    if (!sigDrawing || !sigCanvas) return
    e.preventDefault()
    const ctx = sigCanvas.getContext('2d')
    const rect = sigCanvas.getBoundingClientRect()
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
    ctx.lineTo(x, y); ctx.stroke()
    setHasSig(true)
  }
  const sigEnd = () => setSigDrawing(false)
  const sigClear = () => {
    if (!sigCanvas) return
    const ctx = sigCanvas.getContext('2d')
    ctx.clearRect(0, 0, sigCanvas.width, sigCanvas.height)
    setHasSig(false)
  }

  const handleSign = () => {
    if (!hasSig || !sigCanvas) { showToast('','Sign Required','Please draw your signature'); return }
    const dataUrl = sigCanvas.toDataURL('image/png')
    saveContract(dataUrl)
  }

  const activeContracts = contracts.filter(c => c.status === 'active')
  const expiredContracts = contracts.filter(c => c.status !== 'active')

  const sections = selType === 'lease' ? LEASE_SECTIONS : selType === 'ic' ? IC_SECTIONS : []

  return (
    <div style={{ padding:20, maxWidth:1200, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700 }}>Driver Contracts</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>Lease agreements, IC agreements & compliance documents</div>
        </div>
        <button className="btn btn-primary" style={{ fontSize:12 }} onClick={() => setShowNew(true)}>
          <Ic icon={Plus} /> New Contract
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Active Contracts', val: activeContracts.length, color:'var(--success)' },
          { label:'Lease Agreements', val: contracts.filter(c=>c.contract_type==='lease' && c.status==='active').length, color:'var(--accent)' },
          { label:'IC Agreements', val: contracts.filter(c=>c.contract_type==='ic' && c.status==='active').length, color:'var(--accent3)' },
          { label:'Drivers Without Contract', val: Math.max(0, drivers.length - new Set(activeContracts.map(c=>c.driver_id)).size), color: drivers.length - new Set(activeContracts.map(c=>c.driver_id)).size > 0 ? 'var(--danger)' : 'var(--muted)' },
        ].map(s => (
          <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px', textAlign:'center' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* New Contract Form */}
      {showNew && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--accent)', borderRadius:12, padding:24, marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--accent)', marginBottom:16 }}>Create New Contract</div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Driver</label>
              <select className="form-input" value={selDriver} onChange={e => setSelDriver(e.target.value)} style={{ width:'100%' }}>
                <option value="">Select driver...</option>
                {drivers.map(d => <option key={d.id} value={d.full_name}>{d.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Contract Type</label>
              <select className="form-input" value={selType} onChange={e => setSelType(e.target.value)} style={{ width:'100%' }}>
                {CONTRACT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Pay Structure</label>
              <select className="form-input" value={payStructure} onChange={e => setPayStructure(e.target.value)} style={{ width:'100%' }}>
                <option value="percent">Percentage of Gross (%)</option>
                <option value="permile">Per Mile ($)</option>
                <option value="flat">Flat Rate per Load ($)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Pay Rate</label>
              <input className="form-input" type="number" placeholder={payStructure === 'percent' ? 'e.g. 88' : payStructure === 'permile' ? 'e.g. 0.65' : 'e.g. 500'} value={payRate} onChange={e => setPayRate(e.target.value)} style={{ width:'100%' }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Start Date</label>
              <input className="form-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width:'100%' }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>End Date (optional)</label>
              <input className="form-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width:'100%' }} />
            </div>
          </div>

          {/* Contract sections preview */}
          {sections.length > 0 && (
            <div style={{ background:'var(--surface2)', borderRadius:8, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', marginBottom:8 }}>
                {selType === 'lease' ? 'FMCSA §376.12 REQUIRED SECTIONS' : 'IC AGREEMENT SECTIONS'}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {sections.map((s, i) => (
                  <div key={i} style={{ fontSize:11, color:'var(--text)', display:'flex', alignItems:'center', gap:6 }}>
                    <Check size={12} color="var(--success)" /> {s}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom upload for custom type */}
          {selType === 'custom' && (
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Upload Contract Document</label>
              <input type="file" accept=".pdf,.doc,.docx" onChange={uploadCustomContract} style={{ fontSize:12 }} />
              {uploading && <span style={{ fontSize:11, color:'var(--accent)' }}> Uploading...</span>}
              {customTerms && <div style={{ fontSize:11, color:'var(--success)', marginTop:4 }}>Document uploaded</div>}
            </div>
          )}

          {/* Amendment reason */}
          {amendingContract && (
            <div style={{ marginBottom:16, background:'rgba(240,165,0,0.06)', border:'1px solid var(--accent)', borderRadius:8, padding:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', marginBottom:6 }}>AMENDMENT TO CONTRACT #{amendingContract.id?.slice(0,8)}</div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Reason for Amendment</label>
              <input className="form-input" placeholder="e.g. Pay rate adjustment, new vehicle assigned..." value={amendReason} onChange={e => setAmendReason(e.target.value)} style={{ width:'100%' }} />
            </div>
          )}

          {/* Additional terms */}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Additional Terms / Notes</label>
            <textarea className="form-input" rows={3} placeholder="Any additional terms, special conditions, or notes..." value={selType === 'custom' ? '' : customTerms} onChange={e => setCustomTerms(e.target.value)} style={{ width:'100%', resize:'vertical' }} />
          </div>

          {/* Signature */}
          {!signing ? (
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" style={{ fontSize:12 }} onClick={() => setSigning(true)} disabled={!selDriver}>
                <Ic icon={PencilIcon} /> Sign & Create
              </button>
              <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => setShowNew(false)}>Cancel</button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', marginBottom:6 }}>Carrier Signature</div>
              <div style={{ position:'relative', marginBottom:8 }}>
                <canvas ref={initSigCanvas} width={500} height={100}
                  style={{ width:'100%', height:100, background:'var(--bg)', border:`2px solid ${hasSig ? 'var(--accent)' : 'var(--border)'}`, borderRadius:8, cursor:'crosshair', touchAction:'none' }}
                  onMouseDown={sigStart} onMouseMove={sigMove} onMouseUp={sigEnd} onMouseLeave={sigEnd}
                  onTouchStart={sigStart} onTouchMove={sigMove} onTouchEnd={sigEnd} />
                {!hasSig && <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', fontSize:12, color:'var(--muted)', pointerEvents:'none' }}>Draw your signature here</div>}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary" style={{ fontSize:12 }} onClick={handleSign} disabled={!hasSig}>
                  <Ic icon={Check} /> Create Contract
                </button>
                <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={sigClear}>Clear</button>
                <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => { setSigning(false); sigClear() }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active Contracts */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Loading contracts...</div>
      ) : contracts.length === 0 && !showNew ? (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'40px 20px', textAlign:'center' }}>
          <FileText size={32} color="var(--muted)" style={{ marginBottom:12 }} />
          <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>No Contracts Yet</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>Create lease agreements and IC contracts for your drivers</div>
          <button className="btn btn-primary" style={{ fontSize:12 }} onClick={() => setShowNew(true)}>
            <Ic icon={Plus} /> Create First Contract
          </button>
        </div>
      ) : (
        <>
          {activeContracts.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--accent)', marginBottom:8, letterSpacing:1 }}>ACTIVE CONTRACTS</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {activeContracts.map(c => {
                  const typeLabel = CONTRACT_TYPES.find(t => t.id === c.contract_type)?.label || c.contract_type
                  const daysActive = Math.round((new Date() - new Date(c.start_date || c.created_at)) / 86400000)
                  const isExpiringSoon = c.end_date && ((new Date(c.end_date) - new Date()) / 86400000) < 30
                  return (
                    <div key={c.id} style={{ background:'var(--surface)', border:`1px solid ${isExpiringSoon ? 'var(--warning)' : 'var(--border)'}`, borderRadius:10, padding:'14px 18px', display:'flex', alignItems:'center', gap:16 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:'rgba(240,165,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <FileText size={18} color="var(--accent)" />
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                          <span style={{ fontSize:13, fontWeight:700 }}>{c.driver_name}</span>
                          <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(34,197,94,0.12)', color:'var(--success)' }}>ACTIVE</span>
                          {isExpiringSoon && <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(245,158,11,0.12)', color:'var(--warning)' }}>EXPIRING SOON</span>}
                          {c.fully_executed && <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(34,197,94,0.12)', color:'var(--success)' }}>FULLY EXECUTED</span>}
                          {!c.fully_executed && c.sent_at && !c.driver_signature && <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(240,165,0,0.12)', color:'var(--accent)' }}>AWAITING DRIVER SIGNATURE</span>}
                          {!c.fully_executed && !c.sent_at && <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(128,128,128,0.12)', color:'var(--muted)' }}>NOT SENT</span>}
                          {c.amendment_number > 0 && <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(77,142,240,0.12)', color:'var(--accent3)' }}>AMENDMENT #{c.amendment_number}</span>}
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>
                          {typeLabel} · {c.pay_structure === 'percent' ? `${c.pay_rate}% of gross` : c.pay_structure === 'permile' ? `$${c.pay_rate}/mi` : `$${c.pay_rate}/load`} · {daysActive} days active
                        </div>
                        {c.vehicle_info && <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Vehicle: {c.vehicle_info} {c.vehicle_vin ? `· VIN: ${c.vehicle_vin}` : ''}</div>}
                      </div>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => setViewContract(viewContract === c.id ? null : c.id)}>
                          <Ic icon={Eye} /> View
                        </button>
                        <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => printContract(c, company?.company_name || company?.name)}>
                          <Ic icon={Printer} /> Print
                        </button>
                        {!c.fully_executed && (
                          <button className="btn btn-ghost" style={{ fontSize:10, color:'var(--accent)' }} onClick={() => sendToDriver(c.id)} disabled={sendingContract === c.id}>
                            <Ic icon={Send} /> {sendingContract === c.id ? 'Sending...' : c.sent_at ? 'Resend' : 'Send to Driver'}
                          </button>
                        )}
                        {c.fully_executed && (
                          <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => printContract(c, company?.company_name || company?.name)}>
                            <Ic icon={Download} /> PDF
                          </button>
                        )}
                        <button className="btn btn-ghost" style={{ fontSize:10, color:'var(--accent3)' }} onClick={() => createAmendment(c)}>
                          <Ic icon={PencilIcon} /> Amend
                        </button>
                        <button className="btn btn-ghost" style={{ fontSize:10, color:'var(--danger)' }} onClick={() => { if (confirm('Terminate this contract?')) terminateContract(c.id) }}>
                          <Ic icon={XCircle} /> Terminate
                        </button>
                      </div>
                      {/* Expandable contract detail */}
                      {viewContract === c.id && (
                        <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:10, padding:18, marginTop:12, width:'100%' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                            {[
                              { l:'Contract Type', v: typeLabel },
                              { l:'Driver', v: c.driver_name },
                              { l:'Pay Structure', v: c.pay_structure === 'percent' ? `${c.pay_rate}% of gross revenue` : c.pay_structure === 'permile' ? `$${c.pay_rate} per mile` : `$${c.pay_rate} per load` },
                              { l:'Company', v: c.company_name || '—' },
                              { l:'Start Date', v: c.start_date || '—' },
                              { l:'End Date', v: c.end_date || 'Open-ended' },
                              { l:'Vehicle', v: c.vehicle_info || '—' },
                              { l:'VIN', v: c.vehicle_vin || '—' },
                              { l:'Signed', v: c.signed_date ? new Date(c.signed_date).toLocaleDateString() : '—' },
                              { l:'Status', v: c.status?.toUpperCase() || 'ACTIVE' },
                            ].map(item => (
                              <div key={item.l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                                <span style={{ fontSize:11, color:'var(--muted)' }}>{item.l}</span>
                                <span style={{ fontSize:11, fontWeight:600 }}>{item.v}</span>
                              </div>
                            ))}
                          </div>
                          {/* Required sections */}
                          {(c.contract_type === 'lease' || c.contract_type === 'ic') && (
                            <div style={{ marginBottom:14 }}>
                              <div style={{ fontSize:10, fontWeight:700, color:'var(--accent)', marginBottom:6 }}>
                                {c.contract_type === 'lease' ? 'FMCSA §376.12 SECTIONS' : 'IC AGREEMENT SECTIONS'}
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                                {(c.contract_type === 'lease' ? LEASE_SECTIONS : IC_SECTIONS).map((s, i) => (
                                  <div key={i} style={{ fontSize:10, color:'var(--text)', display:'flex', alignItems:'center', gap:4 }}>
                                    <Check size={10} color="var(--success)" /> {s}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {c.custom_terms && (
                            <div style={{ marginBottom:14 }}>
                              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4 }}>ADDITIONAL TERMS</div>
                              <div style={{ fontSize:11, color:'var(--text)', background:'var(--bg)', padding:10, borderRadius:6, whiteSpace:'pre-wrap' }}>{c.custom_terms}</div>
                            </div>
                          )}
                          {/* Amendment info */}
                          {c.amendment_number > 0 && (
                            <div style={{ marginBottom:14, background:'rgba(77,142,240,0.06)', border:'1px solid var(--accent3)', borderRadius:8, padding:12 }}>
                              <div style={{ fontSize:10, fontWeight:700, color:'var(--accent3)', marginBottom:4 }}>AMENDMENT #{c.amendment_number}</div>
                              {c.amendment_reason && <div style={{ fontSize:11, color:'var(--text)' }}>Reason: {c.amendment_reason}</div>}
                              {c.parent_contract_id && <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Original contract: {c.parent_contract_id.slice(0,8)}...</div>}
                            </div>
                          )}
                          {/* Signatures */}
                          <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
                            {c.carrier_signature && (
                              <div>
                                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4 }}>CARRIER SIGNATURE</div>
                                <img src={c.carrier_signature} alt="Carrier Signature" style={{ height:60, background:'var(--bg)', borderRadius:6, padding:4, border:'1px solid var(--border)' }} />
                                <div style={{ fontSize:9, color:'var(--muted)', marginTop:4 }}>Signed {c.signed_date ? new Date(c.signed_date).toLocaleString() : ''}</div>
                              </div>
                            )}
                            {c.driver_signature ? (
                              <div>
                                <div style={{ fontSize:10, fontWeight:700, color:'var(--success)', marginBottom:4 }}>DRIVER SIGNATURE</div>
                                <img src={c.driver_signature} alt="Driver Signature" style={{ height:60, background:'var(--bg)', borderRadius:6, padding:4, border:'1px solid var(--border)' }} />
                                <div style={{ fontSize:9, color:'var(--muted)', marginTop:4 }}>
                                  Signed {c.driver_signed_date ? new Date(c.driver_signed_date).toLocaleString() : ''}{c.driver_signed_ip ? ` · IP: ${c.driver_signed_ip}` : ''}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div style={{ fontSize:10, fontWeight:700, color:'var(--warning)', marginBottom:4 }}>DRIVER SIGNATURE</div>
                                <div style={{ fontSize:11, color:'var(--muted)', fontStyle:'italic' }}>
                                  {c.sent_at ? `Sent via ${c.sent_via || 'email'} on ${new Date(c.sent_at).toLocaleDateString()} — awaiting signature` : 'Not yet sent to driver'}
                                </div>
                              </div>
                            )}
                          </div>
                          {/* Send to driver inline controls */}
                          {!c.fully_executed && (
                            <div style={{ marginTop:14, display:'flex', alignItems:'center', gap:8, padding:12, background:'var(--bg)', borderRadius:8 }}>
                              <select className="form-input" style={{ width:120, fontSize:11 }} value={sendMethod} onChange={e => setSendMethod(e.target.value)}>
                                <option value="both">Email + SMS</option>
                                <option value="email">Email Only</option>
                                <option value="sms">SMS Only</option>
                              </select>
                              <button className="btn btn-primary" style={{ fontSize:11 }} onClick={() => sendToDriver(c.id)} disabled={sendingContract === c.id}>
                                <Ic icon={Send} /> {sendingContract === c.id ? 'Sending...' : 'Send Contract to Driver for Signing'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Expired / Terminated */}
          {expiredContracts.length > 0 && (
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:8, letterSpacing:1 }}>TERMINATED / EXPIRED</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {expiredContracts.map(c => {
                  const typeLabel = CONTRACT_TYPES.find(t => t.id === c.contract_type)?.label || c.contract_type
                  return (
                    <div key={c.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 18px', display:'flex', alignItems:'center', gap:16, opacity:0.6 }}>
                      <FileText size={16} color="var(--muted)" />
                      <div style={{ flex:1 }}>
                        <span style={{ fontSize:12, fontWeight:600 }}>{c.driver_name}</span>
                        <span style={{ fontSize:11, color:'var(--muted)', marginLeft:8 }}>{typeLabel} · Ended {c.end_date || '—'}</span>
                      </div>
                      <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(217,85,85,0.12)', color:'var(--danger)' }}>TERMINATED</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
