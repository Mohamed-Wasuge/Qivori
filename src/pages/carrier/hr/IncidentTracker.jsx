import { useState, useEffect, useMemo } from 'react'
import { Ic, S } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { Siren, Shield, AlertTriangle, Package, Clock, Users, FileText, AlertCircle, Truck, Plus, Search, Filter, Calendar, Eye, Trash2, User, Upload } from 'lucide-react'
import * as db from '../../../lib/database'
import { inp } from './helpers'
import { apiFetch } from '../../../lib/api'

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
      const { uploadFile } = await import('../../../lib/storage')
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
