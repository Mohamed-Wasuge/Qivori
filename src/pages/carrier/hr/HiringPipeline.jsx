import { useState, useEffect } from 'react'
import { Ic, S } from '../shared'
import { useApp } from '../../../context/AppContext'
import { UserPlus, User, Clock, Check, CheckCircle, XCircle, Plus, Search, Phone, Calendar, ChevronRight, Trash2 } from 'lucide-react'
import * as db from '../../../lib/database'
import { inp } from './helpers'

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
