import { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { supabase } from '../../lib/supabase'
import { Truck, ArrowRight, CheckCircle, SkipForward, User, Check } from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { Ic } from './helpers'

export function Onboarding() {
  const { navigatePage, showToast, user } = useApp()
  let carrier = null
  try { carrier = useCarrier() } catch { /* CarrierProvider may not be mounted yet */ }
  const [step, setStep] = useState(1)
  const [companyInfo, setCompanyInfo] = useState({ name: '', mc: '', dot: '', phone: '' })
  const [selectedProvider, setSelectedProvider] = useState(null)
  const [lbCredentials, setLbCredentials] = useState({})
  const [connecting, setConnecting] = useState(false)
  const [connected, setConnected] = useState(false)
  const [driverForm, setDriverForm] = useState({ full_name: '', phone: '', cdl_number: '', pay_model: 'percent', pay_rate: '' })
  const [driverSaving, setDriverSaving] = useState(false)
  const [driverAdded, setDriverAdded] = useState(false)
  const [vehicleForm, setVehicleForm] = useState({ unit_number: '', year: '', make: '', model: '', type: 'truck', vin: '' })
  const [vehicleSaving, setVehicleSaving] = useState(false)
  const [vehicleAdded, setVehicleAdded] = useState(false)

  const STEPS = [
    { num: 1, label: 'Welcome' },
    { num: 2, label: 'Company Info' },
    { num: 3, label: 'Load Board' },
    { num: 4, label: 'Driver' },
    { num: 5, label: 'Vehicle' },
    { num: 6, label: 'Ready!' },
  ]

  const LB_OPTIONS = [
    { id: 'dat', name: 'DAT Load Board', desc: 'Premium freight marketplace', color: '#22c55e', fields: [{ key: 'clientId', label: 'Client ID' }, { key: 'clientSecret', label: 'Client Secret' }] },
    { id: '123loadboard', name: '123Loadboard', desc: 'Affordable API access', color: '#3b82f6', fields: [{ key: 'apiKey', label: 'API Key' }] },
    { id: 'truckstop', name: 'Truckstop.com', desc: 'Full-service load board', color: '#f0a500', fields: [{ key: 'clientId', label: 'Client ID' }, { key: 'clientSecret', label: 'Client Secret' }] },
  ]

  const connectLoadBoard = async () => {
    if (!selectedProvider) return
    setConnecting(true)
    try {
      const res = await apiFetch('/api/load-board-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: selectedProvider, credentials: lbCredentials }),
      })
      const data = await res.json()
      if (data.success && data.status === 'connected') {
        setConnected(true)
        showToast('success', 'Connected!', `${selectedProvider} is now linked to your account`)
      } else {
        showToast('error', 'Connection Failed', data.testResult?.message || data.error || 'Check your credentials')
      }
    } catch {
      showToast('error', 'Error', 'Could not connect. Try again later.')
    }
    setConnecting(false)
  }

  const saveCompanyInfo = async () => {
    if (!user?.id) return
    try {
      await supabase.from('companies').upsert({
        owner_id: user.id,
        name: companyInfo.name,
        mc_number: companyInfo.mc,
        dot_number: companyInfo.dot,
        phone: companyInfo.phone,
      }, { onConflict: 'owner_id' })
    } catch { /* company info save error */ }
    setStep(3)
  }

  const finishOnboarding = () => {
    localStorage.setItem('qv_onboarded', 'true')
    navigatePage('carrier-dashboard')
  }

  const selectedProv = LB_OPTIONS.find(p => p.id === selectedProvider)

  return (
    <div style={{ padding: 40, maxWidth: 600, margin: '0 auto' }}>
      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 32 }}>
        {STEPS.map((s, i) => (
          <div key={s.num} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: step >= s.num ? 'var(--accent)' : 'var(--surface2)', border: '2px solid ' + (step >= s.num ? 'var(--accent)' : 'var(--border)'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: step >= s.num ? '#000' : 'var(--muted)', flexShrink: 0 }}>
              {step > s.num ? <Ic icon={Check} size={14} /> : s.num}
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: step > s.num ? 'var(--accent)' : 'var(--border)', margin: '0 4px' }} />}
          </div>
        ))}
      </div>

      {/* Step 1: Welcome */}
      {step === 1 && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', marginBottom: 8 }}>
            <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, letterSpacing: 3 }}>Welcome to </span>
            <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: 3, color: 'var(--text)', fontFamily: "'Bebas Neue',sans-serif" }}>QIVORI</span>
          </div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 32, lineHeight: 1.7 }}>
            Let's get your account set up in a few quick steps.<br />
            AI-powered load matching, fleet management, and compliance — all in one place.
          </div>
          <button className="btn btn-primary" style={{ padding: '14px 40px', fontSize: 14 }} onClick={() => setStep(2)}>
            Get Started <Ic icon={ArrowRight} size={16} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
          </button>
        </div>
      )}

      {/* Step 2: Company Info */}
      {step === 2 && (
        <>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 2, marginBottom: 4 }}>COMPANY INFO</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>Tell us about your trucking operation</div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { key: 'name', label: 'Company Name', ph: 'Your Trucking LLC' },
              { key: 'mc', label: 'MC Number', ph: 'MC-1234567' },
              { key: 'dot', label: 'DOT Number', ph: '1234567' },
              { key: 'phone', label: 'Phone', ph: '(555) 123-4567' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input value={companyInfo[f.key]} onChange={e => setCompanyInfo(c => ({ ...c, [f.key]: e.target.value }))}
                  placeholder={f.ph}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }} />
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button className="btn btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn btn-primary" style={{ padding: '12px 32px' }} onClick={saveCompanyInfo}>
              Continue <Ic icon={ArrowRight} size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
            </button>
          </div>
        </>
      )}

      {/* Step 3: Connect Load Board */}
      {step === 3 && (
        <>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 2, marginBottom: 4 }}>CONNECT YOUR LOAD BOARD</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>
            Already have DAT, 123Loadboard, or Truckstop? Connect it and let Qivori AI find loads for you automatically.
          </div>
          <div style={{ fontSize: 11, color: 'var(--accent3)', marginBottom: 20 }}>
            Your credentials are encrypted with AES-256 and never shared with anyone.
          </div>

          {/* Provider selection */}
          {!selectedProvider && !connected && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {LB_OPTIONS.map(p => (
                <button key={p.id} onClick={() => setSelectedProvider(p.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, cursor: 'pointer', textAlign: 'left', width: '100%', fontFamily: "'DM Sans',sans-serif" }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: p.color + '15', border: '1px solid ' + p.color + '30', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Ic icon={Truck} size={20} color={p.color} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.desc}</div>
                  </div>
                  <Ic icon={ArrowRight} size={16} color="var(--muted)" />
                </button>
              ))}
            </div>
          )}

          {/* Credential entry form */}
          {selectedProvider && !connected && selectedProv && (
            <div style={{ background: 'var(--surface)', border: '1px solid ' + selectedProv.color + '30', borderRadius: 12, padding: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Ic icon={Truck} size={18} color={selectedProv.color} />
                <span style={{ fontSize: 14, fontWeight: 700 }}>{selectedProv.name}</span>
                <button onClick={() => { setSelectedProvider(null); setLbCredentials({}) }}
                  style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--muted)', background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
                  Change
                </button>
              </div>
              {selectedProv.fields.map(f => (
                <div key={f.key} style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input type="password" value={lbCredentials[f.key] || ''} onChange={e => setLbCredentials(c => ({ ...c, [f.key]: e.target.value }))}
                    placeholder={'Enter your ' + f.label}
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'monospace', outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
              <button className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 12 }}
                disabled={connecting || !selectedProv.fields.every(f => lbCredentials[f.key])}
                onClick={connectLoadBoard}>
                {connecting ? 'Connecting...' : 'Connect & Test'}
              </button>
            </div>
          )}

          {/* Connected success */}
          {connected && (
            <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: 24, textAlign: 'center' }}>
              <Ic icon={CheckCircle} size={36} color="#22c55e" />
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>{selectedProv?.name} Connected!</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Qivori AI will now search loads using your account.</div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button className="btn btn-ghost" onClick={() => setStep(2)}>Back</button>
            <button className="btn btn-primary" style={{ padding: '12px 32px' }} onClick={() => setStep(4)}>
              {connected ? 'Continue' : 'Skip for Now'} <Ic icon={connected ? ArrowRight : SkipForward} size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
            </button>
          </div>
          {!connected && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
              You can connect your load board anytime from Settings → Load Boards
            </div>
          )}
        </>
      )}

      {/* Step 4: Add Your First Driver */}
      {step === 4 && (
        <>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 2, marginBottom: 4 }}>ADD YOUR FIRST DRIVER</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>Set up a driver profile with pay configuration</div>
          {driverAdded ? (
            <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: 24, textAlign: 'center' }}>
              <Ic icon={CheckCircle} size={36} color="#22c55e" />
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>Driver Added</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{driverForm.full_name} has been added to your fleet.</div>
            </div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { key: 'full_name', label: 'Full Name', ph: 'John Smith' },
                { key: 'phone', label: 'Phone', ph: '(555) 123-4567' },
                { key: 'cdl_number', label: 'CDL Number', ph: 'CDL-1234567' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                  <input value={driverForm[f.key]} onChange={e => setDriverForm(d => ({ ...d, [f.key]: e.target.value }))}
                    placeholder={f.ph}
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                </div>
              ))}
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Pay Model</label>
                  <select value={driverForm.pay_model} onChange={e => setDriverForm(d => ({ ...d, pay_model: e.target.value }))}
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }}>
                    <option value="percent">Percentage</option>
                    <option value="permile">Per Mile</option>
                    <option value="flat">Flat Rate</option>
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Pay Rate</label>
                  <input value={driverForm.pay_rate} onChange={e => setDriverForm(d => ({ ...d, pay_rate: e.target.value }))}
                    placeholder={driverForm.pay_model === 'percent' ? '28' : driverForm.pay_model === 'permile' ? '0.55' : '1500'}
                    type="number"
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <button className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 12 }}
                disabled={driverSaving || !driverForm.full_name}
                onClick={async () => {
                  setDriverSaving(true)
                  try {
                    if (carrier?.addDriver) {
                      await carrier.addDriver({ ...driverForm, pay_rate: Number(driverForm.pay_rate) || 0 })
                    }
                    setDriverAdded(true)
                    showToast('', 'Driver Added', `${driverForm.full_name} is ready to go`)
                  } catch { showToast('error', 'Error', 'Could not add driver') }
                  setDriverSaving(false)
                }}>
                {driverSaving ? 'Adding...' : 'Add Driver'} <Ic icon={User} size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button className="btn btn-ghost" onClick={() => setStep(3)}>Back</button>
            <button className="btn btn-primary" style={{ padding: '12px 32px' }} onClick={() => setStep(5)}>
              {driverAdded ? 'Continue' : 'Skip for Now'} <Ic icon={driverAdded ? ArrowRight : SkipForward} size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
            </button>
          </div>
          {!driverAdded && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
              You can add drivers anytime from Fleet & GPS
            </div>
          )}
        </>
      )}

      {/* Step 5: Add Your First Vehicle */}
      {step === 5 && (
        <>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 2, marginBottom: 4 }}>ADD YOUR FIRST VEHICLE</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>Register a truck or trailer to your fleet</div>
          {vehicleAdded ? (
            <div style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: 12, padding: 24, textAlign: 'center' }}>
              <Ic icon={CheckCircle} size={36} color="#22c55e" />
              <div style={{ fontSize: 16, fontWeight: 700, marginTop: 10 }}>Vehicle Added</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Unit {vehicleForm.unit_number} — {vehicleForm.year} {vehicleForm.make} {vehicleForm.model}</div>
            </div>
          ) : (
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Unit Number</label>
                  <input value={vehicleForm.unit_number} onChange={e => setVehicleForm(v => ({ ...v, unit_number: e.target.value }))}
                    placeholder="T-101"
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Type</label>
                  <select value={vehicleForm.type} onChange={e => setVehicleForm(v => ({ ...v, type: e.target.value }))}
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }}>
                    <option value="truck">Truck</option>
                    <option value="trailer">Trailer</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Year</label>
                  <input value={vehicleForm.year} onChange={e => setVehicleForm(v => ({ ...v, year: e.target.value }))}
                    placeholder="2024" type="number"
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Make</label>
                  <input value={vehicleForm.make} onChange={e => setVehicleForm(v => ({ ...v, make: e.target.value }))}
                    placeholder="Freightliner"
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Model</label>
                  <input value={vehicleForm.model} onChange={e => setVehicleForm(v => ({ ...v, model: e.target.value }))}
                    placeholder="Cascadia"
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>VIN (optional)</label>
                  <input value={vehicleForm.vin} onChange={e => setVehicleForm(v => ({ ...v, vin: e.target.value }))}
                    placeholder="1FUJGBDV7CLBP8834"
                    style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }} />
                </div>
              </div>
              <button className="btn btn-primary" style={{ padding: '10px 24px', fontSize: 12 }}
                disabled={vehicleSaving || !vehicleForm.unit_number}
                onClick={async () => {
                  setVehicleSaving(true)
                  try {
                    if (carrier?.addVehicle) {
                      await carrier.addVehicle({ ...vehicleForm, year: Number(vehicleForm.year) || null })
                    }
                    setVehicleAdded(true)
                    showToast('', 'Vehicle Added', `Unit ${vehicleForm.unit_number} is in your fleet`)
                  } catch { showToast('error', 'Error', 'Could not add vehicle') }
                  setVehicleSaving(false)
                }}>
                {vehicleSaving ? 'Adding...' : 'Add Vehicle'} <Ic icon={Truck} size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
              </button>
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
            <button className="btn btn-ghost" onClick={() => setStep(4)}>Back</button>
            <button className="btn btn-primary" style={{ padding: '12px 32px' }} onClick={() => setStep(6)}>
              {vehicleAdded ? 'Continue' : 'Skip for Now'} <Ic icon={vehicleAdded ? ArrowRight : SkipForward} size={14} style={{ verticalAlign: 'middle', marginLeft: 4 }} />
            </button>
          </div>
          {!vehicleAdded && (
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 8 }}>
              You can add vehicles anytime from Fleet & GPS
            </div>
          )}
        </>
      )}

      {/* Step 6: All Done */}
      {step === 6 && (
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.1)', border: '2px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Ic icon={CheckCircle} size={32} color="#22c55e" />
          </div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, letterSpacing: 2, marginBottom: 8 }}>
            YOU'RE ALL SET!
          </div>
          <div style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 32, lineHeight: 1.7 }}>
            Your Qivori AI dashboard is ready. Start finding loads,<br />
            managing your fleet, and growing your business.
          </div>
          <button className="btn btn-primary" style={{ padding: '14px 40px', fontSize: 14 }} onClick={finishOnboarding}>
            Go to Dashboard <Ic icon={ArrowRight} size={16} style={{ verticalAlign: 'middle', marginLeft: 6 }} />
          </button>
        </div>
      )}
    </div>
  )
}
