import { useState, useEffect, useMemo } from 'react'
import { Ic, S } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { Beaker, AlertTriangle, Calendar, Clock, Check, CheckCircle, XCircle, User, Plus, Search } from 'lucide-react'
import * as db from '../../../lib/database'
import { inp } from './helpers'

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
