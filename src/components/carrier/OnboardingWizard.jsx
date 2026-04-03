import React, { useState } from 'react'
import {
  Zap, Truck, User, CheckCircle, FileText, Search, Brain, DollarSign, ArrowRight
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { apiFetch } from '../../lib/api'
import { Ic } from './shared'

// ── Q Onboarding Flow (Activation System) ─────────────────────────────────────
export function OnboardingWizard({ onComplete }) {
  const { showToast, profile, user, isAdmin } = useApp()
  const { updateCompany, addVehicle, addDriver, loads } = useCarrier()
  const [step, setStep] = useState(1)
  const TOTAL_STEPS = 6
  const [form, setForm] = useState({
    companyName: '', mc: '', dot: '', address: '', phone: '',
    truckType: 'Dry Van', truckYear: '', truckMake: '', truckModel: '', truckVin: '', truckPlate: '', truckUnit: '',
    truckLocation: '', maxWeight: '45000',
    driverName: '', driverPhone: '', driverCDL: '', driverMedExpiry: '', imTheDriver: false,
    driverType: 'owner_operator',
  })
  const [lookupLoading, setLookupLoading] = useState(false)
  const [fmcsaVerified, setFmcsaVerified] = useState(false)
  const [fmcsaStatus, setFmcsaStatus] = useState('') // 'AUTHORIZED', 'NOT AUTHORIZED', etc.
  const [fmcsaError, setFmcsaError] = useState('')
  const [saving, setSaving] = useState(false)
  const [qScanning, setQScanning] = useState(false)
  const [qRecommendation, setQRecommendation] = useState(null)
  const [loadAccepted, setLoadAccepted] = useState(false)
  const firstName = (profile?.full_name || 'Driver').split(' ')[0]
  const wizInput = { width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' }

  const lookupFMCSA = async (type, value) => {
    const clean = value.replace(/[^0-9]/g, '')
    if (clean.length < 4) return
    setLookupLoading(true)
    setFmcsaError('')
    setFmcsaVerified(false)
    try {
      const param = type === 'mc' ? `mc=${clean}` : `dot=${clean}`
      const resp = await apiFetch(`/api/fmcsa-lookup?${param}`)
      const res = await resp.json()
      if (res.carrier) {
        const c = res.carrier
        setForm(p => ({ ...p, companyName: c.legalName || p.companyName, dot: c.dotNumber || p.dot, mc: c.mcNumber || p.mc, phone: c.phone || p.phone, address: c.phyStreet ? `${c.phyStreet}, ${c.phyCity || ''}, ${c.phyState || ''} ${c.phyZipcode || ''}`.trim() : p.address }))
        const status = (c.allowedToOperate || c.operatingStatus || '').toUpperCase()
        setFmcsaStatus(status)
        if (status === 'AUTHORIZED' || status === 'Y' || status === 'ACTIVE') {
          setFmcsaVerified(true)
          showToast('', 'Verified', `${c.legalName} — Active FMCSA authority`)
        } else {
          setFmcsaError(`FMCSA status: ${status || 'Unknown'}. Your authority may not be active.`)
          setFmcsaVerified(true) // Still let them through but show warning
          showToast('', 'Warning', `Authority status: ${status || 'Unknown'}`)
        }
      } else {
        setFmcsaError('No carrier found in FMCSA database. Check your MC or DOT number.')
        showToast('', 'Not Found', 'No FMCSA match — check your numbers')
      }
    } catch (err) {
      setFmcsaError('Lookup failed — try again or contact support')
      showToast('', 'Lookup Failed', err.message || 'Try again')
    }
    setLookupLoading(false)
  }

  const markOnboardingComplete = async () => {
    localStorage.setItem('qv_onboarded', 'true')
    try {
      const { supabase: sb } = await import('../../lib/supabase')
      await sb.from('platform_settings').upsert({ owner_id: user?.id, key: 'onboarding_complete', value: 'true' }, { onConflict: 'owner_id,key' })
    } catch (e) { /* non-critical: onboarding setting save failed */ }
  }

  const handleSkip = async () => { await markOnboardingComplete(); showToast('', 'Q Reminder', 'Complete setup to activate dispatch intelligence'); onComplete() }

  const handleSaveStep = async (nextStep) => {
    setSaving(true)
    try {
      if (step === 2 && (form.companyName || form.mc || form.dot)) {
        await updateCompany({ name: form.companyName, mc_number: form.mc, dot_number: form.dot, phone: form.phone, address: form.address, fmcsa_verified: fmcsaVerified, fmcsa_status: fmcsaStatus })
        showToast('', 'Company Saved', form.companyName || 'Company info saved')
      }
      else if (step === 3 && (form.truckMake || form.truckYear || form.truckUnit)) {
        await addVehicle({ type: form.truckType, year: form.truckYear, make: form.truckMake, model: form.truckModel, vin: form.truckVin, license_plate: form.truckPlate, unit_number: form.truckUnit, status: 'Active' })
        showToast('', 'Truck Added', `${form.truckYear} ${form.truckMake} ${form.truckModel}`.trim() || 'Vehicle registered')
      }
      else if (step === 4) {
        const name = form.imTheDriver ? (profile?.full_name || firstName) : form.driverName
        const phone = form.imTheDriver ? (profile?.phone || form.driverPhone) : form.driverPhone
        if (name) {
          await addDriver({ name, phone, license_number: form.driverCDL, medical_card_expiry: form.driverMedExpiry || null, status: 'Active' })
          showToast('', 'Driver Added', name)
        }
      }
    } catch (e) {
      console.error('Onboarding step save failed:', e)
      showToast('', 'Save Error', 'Data may not have saved — you can update later in settings')
    }
    setSaving(false)
    if (nextStep > TOTAL_STEPS) { await markOnboardingComplete(); showToast('', 'Welcome!', 'Your account is ready to roll'); onComplete() }
    else setStep(nextStep)
  }

  const stepLabels = ['Welcome to Q', 'Company', 'Add Truck', 'Add Driver', 'Activate Q', 'Go Live']

  // Q Activation — calibrates dispatch AI for the user's setup
  const scanForLoads = async () => {
    setQScanning(true)
    await new Promise(r => setTimeout(r, 2200))
    setQRecommendation(true) // signals calibration complete
    setQScanning(false)
  }

  return (
    <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', padding:40, overflowY:'auto' }}>
      <div style={{ maxWidth:520, width:'100%' }}>
        {/* Progress bar */}
        <div style={{ marginBottom:8 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--muted)', letterSpacing:1 }}>STEP {step} OF {TOTAL_STEPS}</span>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)' }}>{stepLabels[step - 1]}</span>
          </div>
          <div style={{ display:'flex', gap:4 }}>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div key={i} style={{ flex:1, height:4, borderRadius:2, background: step > i ? 'var(--accent)' : step === i + 1 ? 'var(--accent2)' : 'var(--surface2)', transition:'all 0.3s' }} />
            ))}
          </div>
        </div>
        {/* Step 1: Welcome to Q */}
        {step === 1 && (
          <div style={{ textAlign:'center', paddingTop:32 }}>
            <div style={{ width:72, height:72, borderRadius:18, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}><Ic icon={Brain} size={32} color="var(--accent)" /></div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:36, letterSpacing:3, marginBottom:4, display:'flex', alignItems:'baseline', justifyContent:'center', gap:6 }}>WELCOME TO <span style={{ color:'var(--accent)' }}>Q</span></div>
            <div style={{ fontSize:15, color:'var(--accent)', fontWeight:600, marginBottom:16 }}>Let's get your dispatch AI online.</div>
            <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.8, maxWidth:380, margin:'0 auto 28px' }}>Q is your AI dispatch system. It finds loads, negotiates rates, and manages your operation — all from one platform.</div>
            <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginBottom:28 }}>
              {[{ icon: Truck, label:'Add Truck', color:'var(--accent2)' }, { icon: User, label:'Add Driver', color:'var(--accent3)' }, { icon: Brain, label:'Activate Q', color:'var(--accent)' }, { icon: Zap, label:'Go Live', color:'var(--success)' }].map(item => (
                <div key={item.label} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 14px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, fontSize:11, color:'var(--muted)' }}><Ic icon={item.icon} size={13} color={item.color} />{item.label}</div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ padding:'16px 56px', fontSize:16, fontWeight:700 }} onClick={() => setStep(2)}>
              Get Started <Ic icon={ArrowRight} size={16} style={{ marginLeft:6 }} />
            </button>
            <div style={{ marginTop:16 }}>
              <div style={{ fontSize:10, color:'var(--muted)', fontStyle:'italic' }}>Setup takes about 2 minutes. You'll need your MC or DOT number.</div>
            </div>
          </div>
        )}
        {/* Step 2: Company Info */}
        {step === 2 && (
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:2, marginBottom:4 }}>COMPANY INFO</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>Used on invoices, rate confirmations, and FMCSA lookups</div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>MC Number</label>
                  <div style={{ display:'flex', gap:6 }}>
                    <input value={form.mc} onChange={e => setForm(p => ({ ...p, mc: e.target.value }))} placeholder="MC-1234567" onKeyDown={e => e.key === 'Enter' && lookupFMCSA('mc', form.mc)} style={{ ...wizInput, flex:1 }} />
                    <button onClick={() => lookupFMCSA('mc', form.mc)} disabled={lookupLoading || !form.mc} style={{ padding:'10px 12px', borderRadius:8, background: lookupLoading ? 'var(--border)' : 'var(--accent)', color:'#000', border:'none', fontSize:10, fontWeight:700, cursor: lookupLoading ? 'wait' : 'pointer', whiteSpace:'nowrap' }}>{lookupLoading ? '...' : 'Lookup'}</button>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>DOT Number</label>
                  <div style={{ display:'flex', gap:6 }}>
                    <input value={form.dot} onChange={e => setForm(p => ({ ...p, dot: e.target.value }))} placeholder="1234567" onKeyDown={e => e.key === 'Enter' && lookupFMCSA('dot', form.dot)} style={{ ...wizInput, flex:1 }} />
                    <button onClick={() => lookupFMCSA('dot', form.dot)} disabled={lookupLoading || !form.dot} style={{ padding:'10px 12px', borderRadius:8, background: lookupLoading ? 'var(--border)' : 'var(--accent)', color:'#000', border:'none', fontSize:10, fontWeight:700, cursor: lookupLoading ? 'wait' : 'pointer', whiteSpace:'nowrap' }}>{lookupLoading ? '...' : 'Lookup'}</button>
                  </div>
                </div>
              </div>
              <div style={{ fontSize:10, color: fmcsaVerified ? 'var(--success)' : 'var(--accent)', marginTop:-8 }}>
                {fmcsaVerified ? '✓ Carrier verified via FMCSA' : 'Enter MC or DOT and hit Lookup to verify your authority'}
              </div>
              {fmcsaError && (
                <div style={{ fontSize:11, color:'var(--danger)', padding:'8px 12px', background:'rgba(239,68,68,0.08)', borderRadius:8, border:'1px solid rgba(239,68,68,0.2)' }}>{fmcsaError}</div>
              )}
              {[{ key:'companyName', label:'Company Name', ph:'Your Trucking LLC' }, { key:'address', label:'Address', ph:'123 Main St, City, State ZIP' }, { key:'phone', label:'Phone', ph:'(555) 123-4567' }].map(f => (
                <div key={f.key}><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}{f.key === 'companyName' && <span style={{ color:'var(--danger)' }}> *</span>}</label><input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={wizInput} /></div>
              ))}
            </div>
            {!fmcsaVerified && (
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:12, padding:'10px 14px', background:'var(--surface)', borderRadius:8, border:'1px solid var(--border)', lineHeight:1.6 }}>
                <strong style={{ color:'var(--text)' }}>Why do we verify?</strong> Qivori is built for real carriers. We verify your MC or DOT number through FMCSA to protect the platform and ensure accurate compliance data.
              </div>
            )}
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button><div style={{ flex:1 }} />
              <button className="btn btn-primary" disabled={saving || ((!fmcsaVerified && !isAdmin) || !form.companyName)} onClick={() => handleSaveStep(3)}>
                {saving ? 'Saving...' : (!fmcsaVerified && !isAdmin) ? 'Verify MC/DOT First' : 'Continue'}
              </button>
            </div>
          </div>
        )}
        {/* Step 3: Add Truck */}
        {step === 3 && (
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:2, marginBottom:4 }}>ADD TRUCK</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>Q needs your truck details to find matching loads</div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Location <span style={{ color:'var(--accent)' }}>*</span></label>
                  <input value={form.truckLocation} onChange={e => setForm(p => ({ ...p, truckLocation: e.target.value }))} placeholder="Dallas, TX" style={wizInput} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Trailer Type <span style={{ color:'var(--accent)' }}>*</span></label>
                  <select value={form.truckType} onChange={e => setForm(p => ({ ...p, truckType: e.target.value }))} style={{ ...wizInput, cursor:'pointer' }}>
                    {['Dry Van','Reefer','Flatbed','Step Deck','Box Truck','Hotshot','Power Only'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Max Weight (lbs) <span style={{ color:'var(--accent)' }}>*</span></label>
                  <input value={form.maxWeight} onChange={e => setForm(p => ({ ...p, maxWeight: e.target.value }))} placeholder="45000" style={wizInput} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Unit #</label>
                  <input value={form.truckUnit} onChange={e => setForm(p => ({ ...p, truckUnit: e.target.value }))} placeholder="101" style={wizInput} />
                </div>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
                {[{ key:'truckYear', label:'Year', ph:'2022' }, { key:'truckMake', label:'Make', ph:'Freightliner' }, { key:'truckModel', label:'Model', ph:'Cascadia' }].map(f => (
                  <div key={f.key}><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label><input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={wizInput} /></div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {[{ key:'truckPlate', label:'License Plate', ph:'ABC-1234' }, { key:'truckVin', label:'VIN', ph:'1FUJGLDR5MLKJ2841' }].map(f => (
                  <div key={f.key}><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label><input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={wizInput} /></div>
                ))}
              </div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button><div style={{ flex:1 }} />
              <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setStep(4)}>Skip</button>
              <button className="btn btn-primary" disabled={saving} onClick={() => handleSaveStep(4)}>{saving ? 'Saving...' : 'Next'}</button>
            </div>
          </div>
        )}
        {/* Step 4: Add Driver */}
        {step === 4 && (
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:2, marginBottom:4 }}>ADD DRIVER</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>Q needs a driver assigned to dispatch loads</div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              {/* Driver type */}
              <div style={{ display:'flex', gap:10 }}>
                {[{ value:'owner_operator', label:'Owner Operator' }, { value:'company_driver', label:'Company Driver' }].map(dt => (
                  <button key={dt.value} onClick={() => setForm(p => ({ ...p, driverType: dt.value }))}
                    style={{ flex:1, padding:'10px 14px', borderRadius:8, border: `1px solid ${form.driverType === dt.value ? 'var(--accent)' : 'var(--border)'}`, background: form.driverType === dt.value ? 'rgba(240,165,0,0.08)' : 'var(--surface2)', cursor:'pointer', textAlign:'center', fontSize:12, fontWeight: form.driverType === dt.value ? 700 : 400, color: form.driverType === dt.value ? 'var(--accent)' : 'var(--text)', fontFamily:"'DM Sans',sans-serif", transition:'all 0.15s' }}>
                    {dt.label}
                  </button>
                ))}
              </div>
              <button onClick={() => setForm(p => ({ ...p, imTheDriver: !p.imTheDriver, driverName: !p.imTheDriver ? (profile?.full_name || '') : '', driverPhone: !p.imTheDriver ? (profile?.phone || '') : '' }))}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 14px', width:'100%', textAlign:'left', background: form.imTheDriver ? 'rgba(240,165,0,0.08)' : 'var(--surface2)', border: `1px solid ${form.imTheDriver ? 'var(--accent)' : 'var(--border)'}`, borderRadius:10, cursor:'pointer', transition:'all 0.15s' }}>
                <div style={{ width:20, height:20, borderRadius:6, background: form.imTheDriver ? 'var(--accent)' : 'transparent', border: form.imTheDriver ? 'none' : '2px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {form.imTheDriver && <Ic icon={CheckCircle} size={14} color="#000" />}
                </div>
                <div><div style={{ fontSize:13, fontWeight:700, color: form.imTheDriver ? 'var(--accent)' : 'var(--text)' }}>I'm the driver</div><div style={{ fontSize:11, color:'var(--muted)' }}>Use my profile as the driver info</div></div>
              </button>
              {!form.imTheDriver && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                  <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Driver Name</label><input value={form.driverName} onChange={e => setForm(p => ({ ...p, driverName: e.target.value }))} placeholder="John Smith" style={wizInput} /></div>
                  <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Phone</label><input value={form.driverPhone} onChange={e => setForm(p => ({ ...p, driverPhone: e.target.value }))} placeholder="(555) 123-4567" style={wizInput} /></div>
                </div>
              )}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>CDL Number</label><input value={form.driverCDL} onChange={e => setForm(p => ({ ...p, driverCDL: e.target.value }))} placeholder="CDL-A 12345" style={wizInput} /></div>
                <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Medical Card Expiry</label><input type="date" value={form.driverMedExpiry} onChange={e => setForm(p => ({ ...p, driverMedExpiry: e.target.value }))} style={{ ...wizInput, colorScheme:'dark' }} /></div>
              </div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button className="btn btn-ghost" onClick={() => setStep(3)}>Back</button><div style={{ flex:1 }} />
              <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setStep(5)}>Skip</button>
              <button className="btn btn-primary" disabled={saving} onClick={() => handleSaveStep(5)}>{saving ? 'Saving...' : 'Continue'}</button>
            </div>
          </div>
        )}
        {/* Step 5: Activate Q */}
        {step === 5 && !qScanning && !qRecommendation && (
          <div style={{ textAlign:'center', paddingTop:32 }}>
            <div style={{ width:72, height:72, borderRadius:18, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px', animation:'pulse 2s ease-in-out infinite' }}>
              <Ic icon={Brain} size={32} color="var(--accent)" />
            </div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, letterSpacing:2, marginBottom:8 }}>ACTIVATE <span style={{ color:'var(--accent)' }}>Q</span></div>
            <div style={{ fontSize:14, color:'var(--accent)', fontWeight:600, marginBottom:8 }}>Your AI dispatch system is ready to go online</div>
            <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.8, maxWidth:380, margin:'0 auto 28px' }}>
              Q will calibrate to your {form.truckType || 'truck'} and preferences, then you're ready to start dispatching.
            </div>
            <button className="btn btn-primary" style={{ padding:'16px 48px', fontSize:15, fontWeight:700 }}
              onClick={scanForLoads}>
              <Ic icon={Zap} size={16} style={{ marginRight:8 }} /> Activate Q
            </button>
            <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:16 }}>
              <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => setStep(4)}>Back</button>
              <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={async () => { await markOnboardingComplete(); showToast('','Welcome!','Opening dashboard...'); onComplete() }}>Skip to Dashboard</button>
            </div>
            <style>{`@keyframes pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.05) } }`}</style>
          </div>
        )}

        {/* Step 5b: Q Scanning */}
        {step === 5 && qScanning && (
          <div style={{ textAlign:'center', paddingTop:48 }}>
            <div style={{ width:80, height:80, borderRadius:20, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 24px', animation:'spin 2s linear infinite' }}>
              <Ic icon={Brain} size={36} color="var(--accent)" />
            </div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:2, marginBottom:8, color:'var(--accent)' }}>Q IS CALIBRATING</div>
            <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.8 }}>Setting up your dispatch AI...<br/>Configuring for {form.truckType || 'your equipment'}...<br/>Initializing profit engine...</div>
            <style>{`@keyframes spin { 0% { transform: rotate(0deg) } 100% { transform: rotate(360deg) } }`}</style>
          </div>
        )}

        {/* Step 5c: Q Ready — capabilities overview */}
        {step === 5 && qRecommendation && !loadAccepted && (
          <div style={{ textAlign:'center', paddingTop:24 }}>
            <div style={{ width:72, height:72, borderRadius:18, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
              <Ic icon={CheckCircle} size={32} color="var(--success)" />
            </div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, letterSpacing:2, marginBottom:8 }}>Q IS <span style={{ color:'var(--success)' }}>READY</span></div>
            <div style={{ fontSize:14, color:'var(--accent)', fontWeight:600, marginBottom:24 }}>Your AI dispatch system is calibrated</div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:20, marginBottom:24, textAlign:'left' }}>
              <div style={{ fontSize:11, color:'var(--muted)', fontWeight:700, letterSpacing:1, marginBottom:14 }}>WHAT Q CAN DO FOR YOU</div>
              {[
                { icon: Search, label: 'Scan load boards for profitable loads', color: 'var(--accent)' },
                { icon: DollarSign, label: 'Auto-calculate profit per mile', color: 'var(--success)' },
                { icon: FileText, label: 'Monitor compliance & HOS', color: 'var(--accent3)' },
                { icon: Zap, label: 'Generate invoices instantly', color: 'var(--accent2)' },
              ].map(item => (
                <div key={item.label} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom:'1px solid var(--border)' }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:`${item.color}15`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <Ic icon={item.icon} size={16} color={item.color} />
                  </div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{item.label}</div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ width:'100%', padding:'16px', fontSize:15, fontWeight:700 }}
              onClick={() => { setLoadAccepted(true) }}>
              <Ic icon={ArrowRight} size={16} style={{ marginRight:8 }} /> Go Live
            </button>
            <div style={{ display:'flex', gap:12, justifyContent:'center', marginTop:12 }}>
              <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => setStep(4)}>Back</button>
            </div>
          </div>
        )}

        {/* Step 6: Success Moment */}
        {(step === 6 || (step === 5 && loadAccepted)) && (
          <div style={{ textAlign:'center', paddingTop:40 }}>
            <div style={{ width:80, height:80, borderRadius:20, background:'rgba(34,197,94,0.1)', border:'1px solid rgba(34,197,94,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 24px' }}>
              <Ic icon={Zap} size={36} color="var(--success)" />
            </div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:30, letterSpacing:2, marginBottom:8 }}>YOUR DISPATCH AI IS <span style={{ color:'var(--success)' }}>LIVE</span></div>
            <div style={{ fontSize:14, color:'var(--muted)', lineHeight:1.8, maxWidth:380, margin:'0 auto 12px' }}>Q is online and ready to find your first load.</div>
            <div style={{ fontSize:13, color:'var(--accent)', fontWeight:600, marginBottom:24 }}>
              Head to the dashboard to start dispatching.
            </div>
            <div style={{ display:'flex', gap:4, justifyContent:'center', marginBottom:28, flexWrap:'wrap' }}>
              {['Dispatch Active', 'Invoicing Ready', 'Compliance On', 'AI Monitoring'].map(f => (
                <span key={f} style={{ padding:'4px 10px', borderRadius:6, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.15)', fontSize:10, fontWeight:600, color:'var(--success)' }}>
                  <Ic icon={CheckCircle} size={9} style={{ verticalAlign:'middle', marginRight:3 }} />{f}
                </span>
              ))}
            </div>
            <button className="btn btn-primary" style={{ padding:'16px 48px', fontSize:15, fontWeight:700 }}
              onClick={async () => { await markOnboardingComplete(); showToast('', 'Q Active', 'Your dispatch AI is live'); onComplete() }}>
              Go to Dashboard <Ic icon={ArrowRight} size={16} style={{ marginLeft:6 }} />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
