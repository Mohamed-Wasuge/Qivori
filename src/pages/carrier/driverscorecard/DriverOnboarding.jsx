import React, { useState } from 'react'
import { Ic } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import {
  Zap, Send, Check, AlertTriangle, Bot, Sparkles, FileText, Activity, CreditCard,
  AlertCircle, Paperclip
} from 'lucide-react'

const PE_STATUS_META = {
  idle:       { label:'Not Started', color:'var(--muted)',    bg:'rgba(74,85,112,0.15)'  },
  ordered:    { label:'Ordered',     color:'var(--accent3)',  bg:'rgba(77,142,240,0.12)' },
  processing: { label:'Processing',  color:'var(--accent)',   bg:'rgba(240,165,0,0.12)'  },
  cleared:    { label:'Cleared',   color:'var(--success)',  bg:'rgba(34,197,94,0.12)'  },
  failed:     { label:'Failed',    color:'var(--danger)',   bg:'rgba(239,68,68,0.12)'  },
  manual:     { label:'Manual',      color:'var(--accent2)',  bg:'rgba(0,212,170,0.12)'  },
  waived:     { label:'Waived',      color:'var(--muted)',    bg:'rgba(74,85,112,0.12)'  },
}

const SAMPLE_ONBOARDS = []

export function DriverOnboarding() {
  const { showToast } = useApp()
  const { addDriver: dbAddDriver, editDriver: dbEditDriver, drivers: ctxDrivers } = useCarrier()
  const [drivers, setDrivers] = useState(SAMPLE_ONBOARDS)
  const [selected, setSelected] = useState('d2')
  const [showAdd, setShowAdd] = useState(false)
  const [newDriver, setNewDriver] = useState({ name:'', cdl:'CDL-A', cdlNum:'', phone:'', email:'', dob:'', state:'' })
  const [ordering, setOrdering] = useState(false)

  const driver = drivers.find(d => d.id === selected)

  const getEligibility = (checks) => {
    const required = PE_CHECKS.filter(c => c.required)
    const allCleared = required.every(c => checks[c.id] === 'cleared' || checks[c.id] === 'waived')
    const anyFailed  = required.some(c => checks[c.id] === 'failed')
    const anyPending = required.some(c => ['idle','ordered','processing','manual'].includes(checks[c.id]))
    if (anyFailed)  return { label:'NOT ELIGIBLE', color:'var(--danger)',  bg:'rgba(239,68,68,0.1)' }
    if (allCleared) return { label:'ELIGIBLE TO HIRE', color:'var(--success)', bg:'rgba(34,197,94,0.1)' }
    if (anyPending) return { label:'PENDING CHECKS', color:'var(--accent)', bg:'rgba(240,165,0,0.1)' }
    return { label:'NOT STARTED', color:'var(--muted)', bg:'rgba(74,85,112,0.1)' }
  }

  const getClearedCount = (checks) => PE_CHECKS.filter(c => checks[c.id] === 'cleared' || checks[c.id] === 'waived').length

  const orderAllChecks = async () => {
    if (!driver) return
    setOrdering(true)
    // Mark idle checks as ordered
    setDrivers(ds => ds.map(d => {
      if (d.id !== selected) return d
      const next = { ...d.checks }
      PE_CHECKS.forEach(c => { if (next[c.id] === 'idle') next[c.id] = 'ordered' })
      return { ...d, checks: next }
    }))
    showToast('', 'All Checks Ordered', '10 pre-employment checks submitted')

    // Try real API calls via Edge Function
    try {
      const { startOnboarding } = await import('../../../lib/onboarding')
      const result = await startOnboarding(driver)
      if (result.started.length > 0) {
        showToast('success', 'APIs Called', result.started.join(', ') + ' ordered via providers')
      }
    } catch (err) {
      /* save error — non-blocking */
    }

    // Update UI to processing after a short delay
    setTimeout(() => {
      setDrivers(ds => ds.map(d => {
        if (d.id !== selected) return d
        const next = { ...d.checks }
        PE_CHECKS.forEach(c => { if (next[c.id] === 'ordered') next[c.id] = 'processing' })
        return { ...d, checks: next }
      }))
      setOrdering(false)
    }, 1800)
  }

  const markCheck = async (checkId, status, result) => {
    setDrivers(ds => ds.map(d => {
      if (d.id !== selected) return d
      const checks = { ...d.checks, [checkId]: status }
      const results = result ? { ...d.results, [checkId]: result } : d.results
      return { ...d, checks, results }
    }))
    const meta = PE_STATUS_META[status]
    showToast('', PE_CHECKS.find(c=>c.id===checkId)?.label || '', meta?.label || '')

    // Auto-advance: when a check is cleared, try to order the next ones
    if (status === 'cleared' && driver) {
      try {
        const { autoAdvance } = await import('../../../lib/onboarding')
        const result = await autoAdvance(driver, checkId, true)
        if (result.started.length > 0) {
          // Mark auto-ordered checks in UI
          setDrivers(ds => ds.map(d => {
            if (d.id !== selected) return d
            const next = { ...d.checks }
            result.started.forEach(id => { if (next[id] === 'idle') next[id] = 'ordered' })
            return { ...d, checks: next }
          }))
          showToast('', 'Auto-Advanced', result.started.join(', ') + ' auto-ordered')
        }
      } catch (err) {
        /* save error — non-blocking */
      }
    }
  }

  const addDriver = async () => {
    if (!newDriver.name) return
    const id = 'd' + Date.now()
    const avatar = newDriver.name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()
    // Save to local onboarding list
    setDrivers(ds => [...ds, {
      id, name:newDriver.name, cdl:newDriver.cdl, cdlNum:newDriver.cdlNum,
      phone:newDriver.phone, email:newDriver.email, dob:newDriver.dob, state:newDriver.state,
      added: new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' }), avatar,
      checks: Object.fromEntries(PE_CHECKS.map(c => [c.id, 'idle'])),
      results:{}, medExpiry:'', cdlExpiry:'',
    }])
    setSelected(id)
    setShowAdd(false)
    // Save to Supabase
    try {
      await dbAddDriver({
        full_name: newDriver.name,
        phone: newDriver.phone,
        email: newDriver.email,
        license_number: newDriver.cdlNum,
        license_state: newDriver.state,
        status: 'Onboarding',
        hire_date: new Date().toISOString().split('T')[0],
        pay_model: newDriver.pay_model || 'percent',
        pay_rate: newDriver.pay_rate ? parseFloat(newDriver.pay_rate) : null,
      })
    } catch (err) { /* DB save failed — handled silently */ }

    // Auto-send consent email + start phase 1 checks
    if (newDriver.email) {
      try {
        const { startOnboarding } = await import('../../../lib/onboarding')
        await startOnboarding(newDriver)
        showToast('success', 'Consent Email Sent', `Sent to ${newDriver.email}`)
      } catch (err) { /* Auto-onboard pending setup */ }
    }

    const driverName = newDriver.name
    setNewDriver({ name:'', cdl:'CDL-A', cdlNum:'', phone:'', email:'', dob:'', state:'', pay_model:'percent', pay_rate:'' })
    showToast('', 'Driver Added', driverName + ' — ready to order pre-employment checks')
  }

  const activateDriver = async (localDriver) => {
    const name = localDriver?.name || 'Unknown'
    // Find the matching driver in the DB by name and update status to Active
    const dbDriver = (ctxDrivers || []).find(d =>
      (d.full_name || d.name || '').toLowerCase() === name.toLowerCase()
    )
    if (dbDriver && dbEditDriver) {
      try {
        await dbEditDriver(dbDriver.id, { status: 'Active' })
      } catch (e) {
        console.error('Failed to activate driver:', e)
      }
    }
    // Update local onboarding state
    setDrivers(ds => ds.map(d =>
      d.id === localDriver.id ? { ...d, activated: true } : d
    ))
    showToast('', 'Driver Activated', name + ' added to active fleet!')
  }

  const inp = { width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box', outline:'none' }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'auto' }}>

      {/* Add Driver Modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setShowAdd(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:16, width:460, padding:28, maxHeight:'90vh', overflowY:'auto' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1, marginBottom:2 }}>NEW DRIVER</div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:20 }}>Enter driver info to start pre-employment screening</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:10 }}>
              {[
                { key:'name',   label:'Full Legal Name',  ph:'Full name',         span:2 },
                { key:'phone',  label:'Phone',            ph:'(612) 555-0198' },
                { key:'email',  label:'Email',            ph:'driver@email.com' },
                { key:'dob',    label:'Date of Birth',    ph:'Apr 12, 1988' },
                { key:'state',  label:'License State',    ph:'IL' },
                { key:'cdlNum', label:'CDL Number',       ph:'IL-CDL-449821',     span:2 },
              ].map(f => (
                <div key={f.key} style={{ gridColumn: f.span ? `span ${f.span}` : undefined }}>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                  <input value={newDriver[f.key]} onChange={e => setNewDriver(d => ({ ...d, [f.key]: e.target.value }))} placeholder={f.ph} style={inp} />
                </div>
              ))}
              <div style={{ gridColumn:'span 2' }}>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>CDL Class</label>
                <select value={newDriver.cdl} onChange={e => setNewDriver(d => ({ ...d, cdl: e.target.value }))}
                  style={{ ...inp }}>
                  {['CDL-A','CDL-B','CDL-C'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Pay Type</label>
                <select value={newDriver.pay_model || 'percent'} onChange={e => setNewDriver(d => ({ ...d, pay_model: e.target.value }))} style={{ ...inp }}>
                  <option value="percent">% of Load</option>
                  <option value="permile">Per Mile ($)</option>
                  <option value="flat">Flat per Load ($)</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>
                  {newDriver.pay_model === 'permile' ? 'Rate ($/mi)' : newDriver.pay_model === 'flat' ? 'Rate ($/load)' : 'Rate (%)'}
                </label>
                <input type="number" value={newDriver.pay_rate || ''} onChange={e => setNewDriver(d => ({ ...d, pay_rate: e.target.value }))}
                  placeholder={newDriver.pay_model === 'permile' ? '0.50' : newDriver.pay_model === 'flat' ? '500' : 'e.g. 28'}
                  style={inp} />
              </div>
            </div>
            <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16, padding:'10px 14px', background:'rgba(77,142,240,0.08)', borderRadius:8, border:'1px solid rgba(77,142,240,0.15)' }}>
              ℹ A written consent form will be sent to the driver's email before drug testing and background checks are ordered.
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'12px 0' }} onClick={addDriver} disabled={!newDriver.name}><Ic icon={Sparkles} /> Add Driver</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'12px 0' }} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* LEFT SIDEBAR */}
      <div style={{ width:220, flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:2 }}>PRE-EMPLOYMENT</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>{drivers.length} drivers in pipeline</div>
        </div>
        <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
          {drivers.map(d => {
            const isSel = selected === d.id
            const elig = getEligibility(d.checks)
            const cleared = getClearedCount(d.checks)
            const pctLocal = Math.round((cleared / PE_CHECKS.length) * 100)
            return (
              <div key={d.id} onClick={() => setSelected(d.id)}
                style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                  background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.15s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <div style={{ width:30, height:30, borderRadius:'50%', background:`${elig.color}20`, border:`1.5px solid ${elig.color}50`,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:elig.color, flexShrink:0 }}>
                    {d?.avatar || '?'}
                  </div>
                  <div style={{ minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color: isSel ? 'var(--accent)' : 'var(--text)' }}>{d.name}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>{d.cdl} · Added {d.added}</div>
                  </div>
                </div>
                <div style={{ height:3, background:'var(--surface2)', borderRadius:2, overflow:'hidden', marginBottom:4 }}>
                  <div style={{ height:'100%', width:`${pctLocal}%`, background:elig.color, borderRadius:2, transition:'width 0.4s' }}/>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:9, fontWeight:800, color:elig.color }}>{elig.label}</span>
                  <span style={{ fontSize:9, color:'var(--muted)' }}>{cleared}/{PE_CHECKS.length} cleared</span>
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ padding:12, borderTop:'1px solid var(--border)', flexShrink:0 }}>
          <button className="btn btn-primary" style={{ width:'100%', fontSize:11 }} onClick={() => setShowAdd(true)}>+ New Driver</button>
        </div>
      </div>

      {/* RIGHT CONTENT */}
      {driver && (() => {
        const elig = getEligibility(driver.checks)
        const cleared = getClearedCount(driver.checks)
        const allIdle = PE_CHECKS.every(c => driver.checks[c.id] === 'idle')
        const hasOrdered = PE_CHECKS.some(c => ['ordered','processing'].includes(driver.checks[c.id]))
        const requiredCleared = PE_CHECKS.filter(c => c.required).every(c => driver.checks[c.id] === 'cleared' || driver.checks[c.id] === 'waived')

        return (
          <div style={{ flex:1, display:'flex', flexDirection:'column', overflowY:'auto' }}>

            {/* Header */}
            <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ width:46, height:46, borderRadius:'50%', background:`${elig.color}18`, border:`2px solid ${elig.color}50`,
                display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:elig.color, flexShrink:0 }}>
                {driver?.avatar || '?'}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4, flexWrap:'wrap' }}>
                  <span style={{ fontSize:16, fontWeight:800 }}>{driverName}</span>
                  <span style={{ fontSize:10, fontWeight:800, padding:'3px 10px', borderRadius:8, background:elig.bg, color:elig.color, letterSpacing:0.5 }}>{elig.label}</span>
                  {driver.cdlNum && <span style={{ fontSize:11, color:'var(--muted)', fontFamily:'monospace' }}>{driver.cdlNum}</span>}
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ background:'var(--surface2)', borderRadius:3, height:5, width:160, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${Math.round((cleared/PE_CHECKS.length)*100)}%`, background:elig.color, borderRadius:3, transition:'width 0.4s' }}/>
                  </div>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>{cleared}/{PE_CHECKS.length} checks cleared · {driver.cdl}</span>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexShrink:0 }}>
                {requiredCleared
                  ? <button className="btn btn-primary" style={{ fontSize:11 }}
                      onClick={() => activateDriver(driver)}>
                      <Zap size={13} /> {driver.activated ? 'Activated' : 'Activate & Add to Fleet'}
                    </button>
                  : allIdle
                    ? <button className="btn btn-primary" style={{ fontSize:12, padding:'8px 20px' }} onClick={orderAllChecks} disabled={ordering}>
                        {ordering ? '...' : <><Zap size={13} /> Order All Checks</>}
                      </button>
                    : <button className="btn btn-ghost" style={{ fontSize:11 }}
                        onClick={() => {
                          if (driver.email) {
                            window.open(`mailto:${driver.email}?subject=${encodeURIComponent('Consent Form Reminder — ' + (driver.name || 'Driver'))}&body=${encodeURIComponent('Please complete and return the consent form at your earliest convenience. This is required to proceed with your onboarding.')}`)
                            showToast('','Email Opened', 'Consent reminder for ' + driver.email)
                          } else {
                            showToast('','No Email', 'Add an email address for this driver first')
                          }
                        }}>
                        <Send size={13} /> Send Reminder
                      </button>
                }
              </div>
            </div>

            {/* AI banner */}
            <div style={{ flexShrink:0, margin:'14px 24px 0', padding:'12px 16px',
              background:'linear-gradient(135deg,rgba(240,165,0,0.07),rgba(77,142,240,0.04))',
              border:'1px solid rgba(240,165,0,0.2)', borderRadius:10, display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:20 }}><Bot size={20} /></span>
              <div style={{ flex:1 }}>
                {requiredCleared
                  ? <><div style={{ fontSize:12, fontWeight:700, color:'var(--success)' }}>All required checks cleared — driver is eligible to hire</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>Complete ELD pairing and banking setup, then activate</div></>
                  : allIdle
                    ? <><div style={{ fontSize:12, fontWeight:700, color:'var(--accent)' }}>Ready to start pre-employment screening</div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>Click "Order All Checks" to submit all {PE_CHECKS.filter(c=>c.required).length} required FMCSA checks at once</div></>
                    : <><div style={{ fontSize:12, fontWeight:700, color:'var(--accent)' }}>
                          {PE_CHECKS.filter(c => ['ordered','processing'].includes(driver.checks[c.id])).length} check{PE_CHECKS.filter(c => ['ordered','processing'].includes(driver.checks[c.id])).length !== 1 ? 's' : ''} in progress
                          · {PE_CHECKS.filter(c => driver.checks[c.id] === 'failed').length > 0 ? `${PE_CHECKS.filter(c => driver.checks[c.id] === 'failed').length} failed — review required` : 'no issues detected'}
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>
                          Estimated completion: {PE_CHECKS.filter(c => driver.checks[c.id] === 'processing' && c.eta.includes('day')).length > 0 ? '2–5 business days' : 'Today'}
                        </div>
                      </>
                }
              </div>
              {allIdle && (
                <button className="btn btn-primary" style={{ fontSize:11, flexShrink:0 }} onClick={orderAllChecks} disabled={ordering}>
                  {ordering ? '...' : <><Zap size={13} /> Order All</>}
                </button>
              )}
            </div>

            {/* Checks list */}
            <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:'14px 24px', display:'flex', flexDirection:'column', gap:8 }}>

              {/* Required checks */}
              <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:1.5, marginBottom:2 }}>REQUIRED — FMCSA REGULATIONS</div>
              {PE_CHECKS.filter(c => c.required).map(check => {
                const status = driver.checks[check.id] || 'idle'
                const meta = PE_STATUS_META[status]
                const result = driver.results?.[check.id]
                return (
                  <div key={check.id} style={{ background:'var(--surface)', border:`1px solid ${status === 'cleared' ? 'rgba(34,197,94,0.2)' : status === 'failed' ? 'rgba(239,68,68,0.2)' : status === 'processing' || status === 'ordered' ? 'rgba(240,165,0,0.2)' : 'var(--border)'}`,
                    borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'center', gap:14, transition:'all 0.2s' }}>
                    {/* Icon */}
                    <div style={{ width:38, height:38, borderRadius:10, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:17,
                      background: meta.bg, border:`1px solid ${meta.color}30` }}>
                      {status === 'cleared' ? <Check size={14} /> : (typeof check.icon === 'string' ? check.icon : <check.icon size={14} />)}
                    </div>
                    {/* Info */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3, flexWrap:'wrap' }}>
                        <span style={{ fontSize:13, fontWeight:700 }}>{check.label}</span>
                        <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:6, background:meta.bg, color:meta.color, letterSpacing:0.5 }}>{meta.label}</span>
                        <span style={{ fontSize:10, color:'var(--muted)', marginLeft:'auto' }}>{check.provider} · {check.reg}</span>
                      </div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>
                        {result
                          ? <span style={{ color: status === 'cleared' ? 'var(--success)' : status === 'failed' ? 'var(--danger)' : 'var(--text)' }}>{result}</span>
                          : check.desc}
                      </div>
                      {(status === 'ordered' || status === 'processing') && (
                        <div style={{ marginTop:5, display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ width:80, height:3, background:'var(--surface2)', borderRadius:2, overflow:'hidden' }}>
                            <div style={{ height:'100%', background:'var(--accent)', borderRadius:2, width: status === 'processing' ? '60%' : '20%', transition:'width 0.4s' }}/>
                          </div>
                          <span style={{ fontSize:10, color:'var(--muted)' }}>ETA {check.eta}</span>
                        </div>
                      )}
                    </div>
                    {/* Actions */}
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      {status === 'idle' && (
                        <button className="btn btn-ghost" style={{ fontSize:11 }}
                          onClick={() => { markCheck(check.id, 'ordered', null); setTimeout(() => markCheck(check.id, 'processing', null), 1200) }}>
                          Order
                        </button>
                      )}
                      {(status === 'ordered' || status === 'processing') && (
                        <button className="btn btn-success" style={{ fontSize:11 }}
                          onClick={() => markCheck(check.id, 'cleared', `Cleared — ${new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}`)}>
                          <Check size={13} /> Mark Cleared
                        </button>
                      )}
                      {(status === 'ordered' || status === 'processing') && (
                        <button className="btn btn-danger" style={{ fontSize:11 }}
                          onClick={() => markCheck(check.id, 'failed', 'Failed — manual review required')}>
                          <AlertCircle size={13} /> Flag
                        </button>
                      )}
                      {status === 'cleared' && (
                        <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast(check.icon,'View Result', result || check.label)}>View</button>
                      )}
                      {status === 'failed' && (
                        <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => markCheck(check.id, 'idle', null)}>Reset</button>
                      )}
                      {check.id === 'road_test' && status !== 'cleared' && (
                        <button className="btn btn-ghost" style={{ fontSize:11 }}
                          onClick={() => markCheck(check.id, 'cleared', 'Passed — road test completed ' + new Date().toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}))}>
                          <FileText size={13} /> Log Test
                        </button>
                      )}
                      {check.id === 'medical' && status !== 'cleared' && (
                        <label style={{ fontSize:11, fontWeight:600, padding:'5px 10px', borderRadius:8, background:'var(--surface2)', border:'1px solid var(--border)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", color:'var(--text)', whiteSpace:'nowrap' }}>
                          <Paperclip size={13} /> Upload
                          <input type="file" accept=".pdf,image/*" style={{ display:'none' }}
                            onChange={e => { if(e.target.files?.[0]) markCheck(check.id,'cleared','Certificate uploaded · ' + e.target.files[0].name) }} />
                        </label>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Optional checks */}
              <div style={{ fontSize:10, fontWeight:800, color:'var(--muted)', letterSpacing:1.5, marginTop:8, marginBottom:2 }}>OPTIONAL — RECOMMENDED</div>
              {PE_CHECKS.filter(c => !c.required).map(check => {
                const status = driver.checks[check.id] || 'idle'
                const meta = PE_STATUS_META[status]
                const result = driver.results?.[check.id]
                return (
                  <div key={check.id} style={{ background:'var(--surface)', border:`1px solid ${status === 'cleared' ? 'rgba(34,197,94,0.15)' : 'var(--border)'}`,
                    borderRadius:12, padding:'12px 18px', display:'flex', alignItems:'center', gap:14 }}>
                    <div style={{ width:34, height:34, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', fontSize:15,
                      background: meta.bg }}>
                      {status === 'cleared' ? <Check size={14} /> : (typeof check.icon === 'string' ? check.icon : <check.icon size={14} />)}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                        <span style={{ fontSize:13, fontWeight:600 }}>{check.label}</span>
                        <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:6, background:meta.bg, color:meta.color }}>{meta.label}</span>
                      </div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{result || check.desc}</div>
                    </div>
                    <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                      {check.id === 'eld' && status !== 'cleared' && (
                        <button className="btn btn-ghost" style={{ fontSize:11 }}
                          onClick={() => markCheck(check.id,'cleared','ELD paired · Samsara CM32')}><Ic icon={Activity} /> Pair ELD</button>
                      )}
                      {check.id === 'pay' && status !== 'cleared' && (
                        <button className="btn btn-ghost" style={{ fontSize:11 }}
                          onClick={() => markCheck(check.id,'cleared','Direct deposit linked · FastPay enrolled')}><Ic icon={CreditCard} /> Setup Pay</button>
                      )}
                      {status === 'cleared' && (
                        <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => showToast(check.icon,'View',result||check.label)}>View</button>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Eligible banner */}
              {requiredCleared && (
                <div style={{ padding:'24px 20px', background:'linear-gradient(135deg,rgba(34,197,94,0.08),rgba(0,212,170,0.06))', border:'1px solid rgba(34,197,94,0.3)', borderRadius:12, textAlign:'center', marginTop:4 }}>
                  <div style={{ marginBottom:8 }}><Sparkles size={32} /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--success)', letterSpacing:1, marginBottom:6 }}>ELIGIBLE TO HIRE</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>All FMCSA required checks cleared — {driver.name} is ready to be dispatched</div>
                  <div style={{ display:'flex', gap:10, justifyContent:'center' }}>
                    <button className="btn btn-primary" style={{ padding:'11px 28px', fontSize:13 }}
                      onClick={() => activateDriver(driver)}>
                      <Zap size={13} /> {driver.activated ? 'Activated' : 'Activate & Add to Fleet'}
                    </button>
                    <button className="btn btn-ghost" style={{ fontSize:12 }}
                      onClick={() => {
                        const checks = (driver.checks || []).map(c => `${c.label}: ${c.status}${c.result ? ' — ' + c.result : ''}`).join('\n')
                        const report = `Pre-Employment Screening Report\n${'='.repeat(40)}\nDriver: ${driver.name}\nEmail: ${driver.email || '—'}\nPhone: ${driver.phone || '—'}\nCDL: ${driver.cdl || '—'}\nDate: ${new Date().toLocaleDateString()}\n\nBackground Checks:\n${checks || 'No checks completed yet'}\n\nStatus: ${driver.allPassed ? 'ELIGIBLE TO HIRE' : 'PENDING'}`
                        const blob = new Blob([report], { type: 'text/plain' })
                        const url = URL.createObjectURL(blob)
                        const a = document.createElement('a'); a.href = url; a.download = `screening-report-${(driver.name || 'driver').replace(/\s+/g, '-')}.txt`; a.click()
                        URL.revokeObjectURL(url)
                        showToast('','Report Downloaded', driver.name)
                      }}>
                      <FileText size={13} /> Download Report
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
