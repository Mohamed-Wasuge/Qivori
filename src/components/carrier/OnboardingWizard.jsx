import React, { useState } from 'react'
import {
  Zap, Building2, Truck, User, Package, CheckCircle, FileText, Search
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { apiFetch } from '../../lib/api'
import { Ic } from './shared'

// ── New User Onboarding Wizard (5 steps) ─────────────────────────────────────
export function OnboardingWizard({ onComplete }) {
  const { showToast, profile, user } = useApp()
  const { updateCompany, addVehicle, addDriver } = useCarrier()
  const [step, setStep] = useState(1)
  const TOTAL_STEPS = 5
  const [form, setForm] = useState({
    companyName: '', mc: '', dot: '', address: '', phone: '',
    truckType: 'Dry Van', truckYear: '', truckMake: '', truckModel: '', truckVin: '', truckPlate: '', truckUnit: '',
    driverName: '', driverPhone: '', driverCDL: '', driverMedExpiry: '', imTheDriver: false,
  })
  const [lookupLoading, setLookupLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const firstName = (profile?.full_name || 'Driver').split(' ')[0]
  const wizInput = { width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', boxSizing:'border-box' }

  const lookupFMCSA = async (type, value) => {
    const clean = value.replace(/[^0-9]/g, '')
    if (clean.length < 4) return
    setLookupLoading(true)
    try {
      const param = type === 'mc' ? `mc=${clean}` : `dot=${clean}`
      const resp = await apiFetch(`/api/fmcsa-lookup?${param}`)
      const res = await resp.json()
      if (res.carrier) {
        const c = res.carrier
        setForm(p => ({ ...p, companyName: c.legalName || p.companyName, dot: c.dotNumber || p.dot, mc: c.mcNumber || p.mc, phone: c.phone || p.phone, address: c.phyStreet ? `${c.phyStreet}, ${c.phyCity || ''}, ${c.phyState || ''} ${c.phyZipcode || ''}`.trim() : p.address }))
        showToast('', 'FMCSA Found', c.legalName || 'Company info loaded')
      } else { showToast('', 'Not Found', 'No FMCSA match — enter info manually') }
    } catch (err) { showToast('', 'Lookup Failed', err.message || 'Try entering info manually') }
    setLookupLoading(false)
  }

  const markOnboardingComplete = async () => {
    localStorage.setItem('qv_onboarded', 'true')
    try {
      const { supabase: sb } = await import('../../lib/supabase')
      await sb.from('platform_settings').upsert({ owner_id: user?.id, key: 'onboarding_complete', value: 'true' }, { onConflict: 'owner_id,key' })
    } catch (e) { /* non-critical: onboarding setting save failed */ }
  }

  const handleSkip = async () => { await markOnboardingComplete(); onComplete() }

  const handleSaveStep = async (nextStep) => {
    setSaving(true)
    try {
      if (step === 2 && (form.companyName || form.mc || form.dot)) await updateCompany({ name: form.companyName, mc_number: form.mc, dot_number: form.dot, phone: form.phone, address: form.address }).catch(() => {})
      else if (step === 3 && (form.truckMake || form.truckYear || form.truckUnit)) await addVehicle({ type: form.truckType, year: form.truckYear, make: form.truckMake, model: form.truckModel, vin: form.truckVin, license_plate: form.truckPlate, unit_number: form.truckUnit, status: 'Active' }).catch(() => {})
      else if (step === 4) { const name = form.imTheDriver ? (profile?.full_name || firstName) : form.driverName; const phone = form.imTheDriver ? (profile?.phone || form.driverPhone) : form.driverPhone; if (name) await addDriver({ name, phone, license_number: form.driverCDL, medical_card_expiry: form.driverMedExpiry || null, status: 'Active' }).catch(() => {}) }
    } catch (e) { /* non-critical: step save error */ }
    setSaving(false)
    if (nextStep > TOTAL_STEPS) { await markOnboardingComplete(); showToast('', 'Welcome!', 'Your account is ready to roll'); onComplete() }
    else setStep(nextStep)
  }

  const stepLabels = ['Welcome', 'Company', 'Truck', 'Driver', 'First Load']

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
        {/* Step 1: Welcome */}
        {step === 1 && (
          <div style={{ textAlign:'center', paddingTop:32 }}>
            <div style={{ width:64, height:64, borderRadius:16, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}><Ic icon={Zap} size={28} color="var(--accent)" /></div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, letterSpacing:3, marginBottom:8 }}>WELCOME TO <span style={{ color:'var(--accent)' }}>QIVORI AI</span></div>
            <div style={{ fontSize:14, color:'var(--muted)', lineHeight:1.8, maxWidth:400, margin:'0 auto 32px' }}>Let's set up your account in 3 minutes.<br/>AI-powered dispatch, invoicing, compliance, and load matching — all in one platform built for carriers.</div>
            <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap', marginBottom:28 }}>
              {[{ icon: Building2, label:'Company Info', color:'var(--accent)' }, { icon: Truck, label:'Add Truck', color:'var(--accent2)' }, { icon: User, label:'Add Driver', color:'var(--accent3)' }, { icon: Package, label:'First Load', color:'var(--success)' }].map(item => (
                <div key={item.label} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:8, fontSize:11, color:'var(--muted)' }}><Ic icon={item.icon} size={13} color={item.color} />{item.label}</div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ padding:'14px 48px', fontSize:15, fontWeight:700 }} onClick={() => setStep(2)}>Let's Go</button>
            <div style={{ marginTop:16 }}><button className="btn btn-ghost" style={{ fontSize:12 }} onClick={handleSkip}>Skip for now</button></div>
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
              <div style={{ fontSize:10, color:'var(--accent)', marginTop:-8 }}>Enter MC or DOT and hit Lookup to auto-fill from FMCSA</div>
              {[{ key:'companyName', label:'Company Name', ph:'Your Trucking LLC' }, { key:'address', label:'Address', ph:'123 Main St, City, State ZIP' }, { key:'phone', label:'Phone', ph:'(555) 123-4567' }].map(f => (
                <div key={f.key}><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label><input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={wizInput} /></div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button><div style={{ flex:1 }} />
              <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setStep(3)}>Skip</button>
              <button className="btn btn-primary" disabled={saving} onClick={() => handleSaveStep(3)}>{saving ? 'Saving...' : 'Continue'}</button>
            </div>
          </div>
        )}
        {/* Step 3: First Truck */}
        {step === 3 && (
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:2, marginBottom:4 }}>ADD YOUR FIRST TRUCK</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>Add your primary vehicle — you can always add more later from Fleet</div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Equipment Type</label>
                <select value={form.truckType} onChange={e => setForm(p => ({ ...p, truckType: e.target.value }))} style={{ ...wizInput, cursor:'pointer' }}>
                  {['Dry Van','Reefer','Flatbed','Step Deck','Box Truck','Hotshot','Power Only'].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
                {[{ key:'truckUnit', label:'Unit #', ph:'101' }, { key:'truckYear', label:'Year', ph:'2022' }, { key:'truckMake', label:'Make', ph:'Freightliner' }].map(f => (
                  <div key={f.key}><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label><input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={wizInput} /></div>
                ))}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {[{ key:'truckModel', label:'Model', ph:'Cascadia' }, { key:'truckPlate', label:'License Plate', ph:'ABC-1234' }].map(f => (
                  <div key={f.key}><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label><input value={form[f.key]} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={wizInput} /></div>
                ))}
              </div>
              <div><label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>VIN</label><input value={form.truckVin} onChange={e => setForm(p => ({ ...p, truckVin: e.target.value }))} placeholder="1FUJGLDR5MLKJ2841" style={wizInput} /></div>
            </div>
            <div style={{ display:'flex', gap:10, marginTop:20 }}>
              <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button><div style={{ flex:1 }} />
              <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setStep(4)}>Skip</button>
              <button className="btn btn-primary" disabled={saving} onClick={() => handleSaveStep(4)}>{saving ? 'Saving...' : 'Continue'}</button>
            </div>
          </div>
        )}
        {/* Step 4: Add Driver */}
        {step === 4 && (
          <div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, letterSpacing:2, marginBottom:4 }}>ADD A DRIVER</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:20 }}>Add your first driver to start dispatching loads</div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
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
        {/* Step 5: First Load CTA */}
        {step === 5 && (
          <div style={{ textAlign:'center', paddingTop:24 }}>
            <div style={{ width:64, height:64, borderRadius:16, background:'rgba(52,176,104,0.1)', border:'1px solid rgba(52,176,104,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}><Ic icon={CheckCircle} size={28} color="var(--success)" /></div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, letterSpacing:2, marginBottom:8 }}>YOU'RE ALL <span style={{ color:'var(--success)' }}>SET</span></div>
            <div style={{ fontSize:14, color:'var(--muted)', lineHeight:1.8, maxWidth:380, margin:'0 auto 32px' }}>Ready to book your first load? Scan a rate confirmation or search the AI-powered load board.</div>
            <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
              <button className="btn btn-primary" style={{ padding:'14px 28px', fontSize:13, fontWeight:700, display:'flex', alignItems:'center', gap:8 }} onClick={async () => { await markOnboardingComplete(); showToast('','Welcome!','Opening AI Load Board...'); onComplete('load-board') }}><Ic icon={Search} size={14} /> Search Load Board</button>
              <button style={{ padding:'14px 28px', fontSize:13, fontWeight:700, borderRadius:10, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.3)', color:'var(--accent)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:8 }} onClick={async () => { await markOnboardingComplete(); showToast('','Welcome!','Opening Dispatch...'); onComplete('loads') }}><Ic icon={FileText} size={14} /> Scan Rate Con</button>
            </div>
            <div style={{ marginTop:20 }}><button className="btn btn-ghost" style={{ fontSize:12 }} onClick={async () => { await markOnboardingComplete(); showToast('','Welcome!','Your account is ready'); onComplete() }}>Go to Dashboard</button></div>
          </div>
        )}
      </div>
    </div>
  )
}
