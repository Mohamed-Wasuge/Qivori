import { useState, useEffect, useCallback } from 'react'
import { Ic, S, StatCard } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { FileCheck, AlertTriangle, FileText, User, Users, Upload, Plus, Calendar, Clock, Check, Eye, Trash2, Search, CheckCircle, XCircle, Printer } from 'lucide-react'
import * as db from '../../../lib/database'
import { DQ_DOC_TYPES, DOC_STATUS_COLORS, getExpiryStatus, inp } from './helpers'

export function DQFileManager() {
  const { showToast } = useApp()
  const { drivers } = useCarrier()
  const [selectedDriver, setSelectedDriver] = useState(null)
  const [dqFiles, setDqFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [newDoc, setNewDoc] = useState({ doc_type: 'cdl', file_name: '', expiry_date: '', issued_date: '', notes: '', file: null })
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
      let fileUrl = null
      let fileSize = null
      if (newDoc.file) {
        const { uploadFile } = await import('../../../lib/storage')
        const result = await uploadFile(newDoc.file, `dq-files/${selectedDriver}`)
        fileUrl = result.url
        fileSize = result.size
      }
      const file = await db.createDQFile({
        driver_id: selectedDriver,
        doc_type: newDoc.doc_type,
        file_name: newDoc.file_name,
        file_url: fileUrl,
        file_size: fileSize,
        expiry_date: newDoc.expiry_date || null,
        issued_date: newDoc.issued_date || null,
        notes: newDoc.notes || null,
        status: newDoc.expiry_date ? getExpiryStatus(newDoc.expiry_date) : 'valid',
      })
      setDqFiles(prev => [file, ...prev])
      showToast('success', 'Document Added', `${DQ_DOC_TYPES.find(t => t.id === newDoc.doc_type)?.label} uploaded`)
      setNewDoc({ doc_type: 'cdl', file_name: '', expiry_date: '', issued_date: '', notes: '', file: null })
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
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Upload File</label>
                {newDoc.file ? (
                  <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'rgba(34,197,94,0.06)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:8 }}>
                    <Check size={14} style={{ color:'var(--success)', flexShrink:0 }} />
                    <span style={{ fontSize:12, color:'var(--text)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{newDoc.file.name}</span>
                    <span style={{ fontSize:10, color:'var(--muted)' }}>{(newDoc.file.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => setNewDoc(p => ({ ...p, file: null }))} style={{ background:'none', border:'none', color:'var(--danger)', cursor:'pointer', fontSize:11, fontFamily:"'DM Sans',sans-serif" }}>Remove</button>
                  </div>
                ) : (
                  <label style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8, padding:'14px 16px', borderRadius:8, border:'1px dashed var(--border)', background:'var(--surface2)', color:'var(--muted)', fontSize:12, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    <Upload size={14} /> Choose File (image or PDF)
                    <input type="file" accept="image/*,.pdf" onChange={e => {
                      const f = e.target.files?.[0]
                      if (f) setNewDoc(p => ({ ...p, file: f, file_name: p.file_name || f.name }))
                    }} style={{ display:'none' }} />
                  </label>
                )}
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
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              {f.file_url && (
                                <>
                                  <button onClick={() => window.open(f.file_url, '_blank')} style={{ background:'none', border:'none', color:'var(--accent)', cursor:'pointer', padding:4 }} title="View">
                                    <Eye size={13} />
                                  </button>
                                  <button onClick={() => {
                                    const w = window.open('', '_blank')
                                    if (w) {
                                      const isImg = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(f.file_url)
                                      w.document.write(`<html><head><title>${f.file_name}</title><style>@media print{body{margin:0}img{max-width:100%;height:auto}}</style></head><body style="margin:20px;font-family:sans-serif">`)
                                      w.document.write(`<h2>${DQ_DOC_TYPES.find(t=>t.id===f.doc_type)?.label || f.doc_type}</h2>`)
                                      w.document.write(`<p><strong>Driver:</strong> ${driverName} | <strong>File:</strong> ${f.file_name}</p>`)
                                      if (f.issued_date) w.document.write(`<p><strong>Issued:</strong> ${new Date(f.issued_date).toLocaleDateString()}</p>`)
                                      if (f.expiry_date) w.document.write(`<p><strong>Expires:</strong> ${new Date(f.expiry_date).toLocaleDateString()}</p>`)
                                      if (isImg) { w.document.write(`<img src="${f.file_url}" style="max-width:100%;margin-top:16px" />`) }
                                      else { w.document.write(`<iframe src="${f.file_url}" style="width:100%;height:80vh;border:1px solid #ccc;margin-top:16px"></iframe>`) }
                                      w.document.write('</body></html>')
                                      w.document.close()
                                      setTimeout(() => w.print(), 500)
                                    }
                                  }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:4 }} title="Print">
                                    <Printer size={13} />
                                  </button>
                                </>
                              )}
                              <button onClick={() => handleDelete(f.id, f.file_name)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:4 }} title="Delete">
                                <Trash2 size={13} />
                              </button>
                            </div>
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
