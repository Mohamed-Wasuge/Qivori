import { useState, useEffect } from 'react'
import { useApp } from '../context/AppContext'
import { useCarrier } from '../context/CarrierContext'
import { supabase } from '../lib/supabase'
import { Settings as SettingsIcon, Smartphone, Wrench, Bot, Landmark, Search, Check, Globe, Shield, Bell, Users, CreditCard, Mail, Zap, Truck, ArrowRight, CheckCircle, SkipForward, User } from 'lucide-react'
import { apiFetch } from '../lib/api'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

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

export function AIEngine() {
  const { navigatePage } = useApp()
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: 'var(--muted)' }}>AI engine settings have moved to platform Settings.</div>
      <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigatePage('settings')}>Go to Settings →</button>
    </div>
  )
}

export function Settings() {
  const { showToast } = useApp()
  const [toggles, setToggles] = useState({
    autoApprove: false,
    emailNotifs: true,
    aiMatching: true,
    maintenance: false,
  })
  const [loading, setLoading] = useState(true)
  const [planCount, setPlanCount] = useState(0)

  useEffect(() => {
    (async () => {
      const [settingsRes, profilesRes] = await Promise.all([
        supabase.from('platform_settings').select('key, value'),
        supabase.from('profiles').select('subscription_status, plan').neq('plan', 'trial').neq('plan', 'owner'),
      ])
      if (!settingsRes.error && settingsRes.data) {
        const obj = {}
        settingsRes.data.forEach(r => { obj[r.key] = r.value === true || r.value === 'true' })
        setToggles(prev => ({ ...prev, ...obj }))
      }
      const paying = (profilesRes.data || []).filter(p => p.subscription_status === 'active' && p.plan)
      setPlanCount(paying.length)
      setLoading(false)
    })()
  }, [])

  const toggle = async (key, label) => {
    const newVal = !toggles[key]
    setToggles(prev => ({ ...prev, [key]: newVal }))
    showToast('', label, newVal ? 'Enabled' : 'Disabled')
    const { data: { session } } = await supabase.auth.getSession()
    const userId = session?.user?.id
    if (!userId) return
    const { error } = await supabase
      .from('platform_settings')
      .upsert({ owner_id: userId, key, value: String(newVal), updated_at: new Date().toISOString() }, { onConflict: 'owner_id,key' })
    if (error) showToast('', label, 'Failed to save setting')
  }

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%' }}>
      <div style={{ maxWidth: 700 }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2, marginBottom: 20 }}>PLATFORM SETTINGS</div>

        {/* General */}
        <div className="panel fade-in" style={{ marginBottom: 16 }}>
          <div className="panel-header"><div className="panel-title"><Ic icon={Globe} size={14} /> General</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Platform Name</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Displayed to all users</div>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Qivori AI</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Domain</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Primary website URL</div>
              </div>
              <span className="mono" style={{ fontSize: 12, color: 'var(--accent2)' }}>qivori.com</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700 }}>Support Email</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Where tickets are sent</div>
              </div>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text)' }}>hello@qivori.com</span>
            </div>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="panel fade-in" style={{ marginBottom: 16 }}>
          <div className="panel-header"><div className="panel-title"><Ic icon={Zap} size={14} /> Feature Toggles</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { key: 'autoApprove', label: 'Auto-Approve New Users', sub: 'Skip manual approval for new carrier/broker signups', color: 'var(--accent)' },
              { key: 'emailNotifs', label: 'Email Notifications', sub: 'Send email alerts for signups, payments, and tickets', color: 'var(--success)' },
              { key: 'aiMatching', label: 'AI Load Matching', sub: 'Enable AI-powered load scoring and carrier matching', color: 'var(--accent3)' },
              { key: 'maintenance', label: 'Maintenance Mode', sub: 'Show maintenance page to all users (emergency only)', color: 'var(--danger)' },
            ].map(t => (
              <div key={t.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{t.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.sub}</div>
                </div>
                <div
                  style={{ width: 44, height: 24, background: toggles[t.key] ? t.color : 'var(--border)', borderRadius: 12, cursor: 'pointer', position: 'relative', transition: 'background 0.2s' }}
                  onClick={() => toggle(t.key, t.label)}
                >
                  <div style={{ width: 18, height: 18, background: '#fff', borderRadius: '50%', position: 'absolute', top: 3, transition: 'left 0.2s', left: toggles[t.key] ? 23 : 3 }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Subscription Plans */}
        <div className="panel fade-in" style={{ marginBottom: 16 }}>
          <div className="panel-header"><div className="panel-title"><Ic icon={CreditCard} size={14} /> Subscription Plans</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { name: 'Qivori AI', price: 'Plans from $79/mo', users: planCount + ' users', color: '#f0a500' },
            ].map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 4, height: 32, borderRadius: 2, background: p.color }} />
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.users}</div>
                  </div>
                </div>
                <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: p.color }}>{p.price}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Referral Program */}
        <ReferralPanel />

        {/* Integrations */}
        <div className="panel fade-in">
          <div className="panel-header"><div className="panel-title"><Ic icon={Wrench} size={14} /> Integrations</div></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              { icon: CreditCard, name: 'Stripe', sub: 'Subscription billing & payouts', connected: true },
              { icon: Mail, name: 'Resend', sub: 'Transactional email & notifications', connected: true },
              { icon: Bot, name: 'Claude AI', sub: 'Load matching & document OCR', connected: true },
              { icon: Search, name: 'FMCSA API', sub: 'MC/DOT carrier verification', connected: true },
              { icon: Smartphone, name: 'Twilio', sub: 'SMS & voice calling', connected: true },
            ].map(int => (
              <div key={int.name} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 12, background: 'var(--surface2)', borderRadius: 10 }}>
                <Ic icon={int.icon} size={22} color="var(--muted)" />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>{int.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{int.sub}</div>
                </div>
                {int.connected ? (
                  <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', padding: '3px 8px', borderRadius: 20, display: 'flex', alignItems: 'center', gap: 4 }}>Connected <Ic icon={Check} size={10} /></span>
                ) : (
                  <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10 }}
                    onClick={() => showToast('', 'Connect ' + int.name, 'Opening integration setup...')}>Connect</button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function ReferralPanel() {
  const { showToast } = useApp()
  const [referralData, setReferralData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const { apiFetch } = await import('../lib/api')
        const res = await apiFetch('/api/referral')
        if (res.ok) setReferralData(await res.json())
      } catch { /* referral fetch error */ }
      setLoading(false)
    })()
  }, [])

  const copyLink = () => {
    if (referralData?.link) {
      navigator.clipboard.writeText(referralData.link).then(() => {
        showToast('', 'Link Copied!', referralData.link)
      })
    }
  }

  return (
    <div className="panel fade-in" style={{ marginBottom: 16 }}>
      <div className="panel-header">
        <div className="panel-title"><Ic icon={Users} size={14} /> Referral Program</div>
        <span style={{ fontSize: 10, fontWeight: 700, background: 'rgba(34,197,94,0.1)', color: 'var(--success)', padding: '3px 8px', borderRadius: 20 }}>Earn Free Months</span>
      </div>
      <div style={{ padding: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 20 }}>Loading referral data...</div>
        ) : referralData ? (
          <>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>YOUR REFERRAL LINK</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input value={referralData.link || ''} readOnly style={{ flex: 1, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--text)' }} />
                <button className="btn btn-ghost" style={{ padding: '8px 14px', fontSize: 11, fontWeight: 700 }} onClick={copyLink}>Copy</button>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Share this link. When someone signs up and pays, you get <strong style={{ color: 'var(--success)' }}>1 month free</strong>. They get <strong style={{ color: 'var(--accent)' }}>14 extra days</strong> on their trial.</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Clicks', value: referralData.totalClicks || 0, color: 'var(--accent)' },
                { label: 'Signups', value: referralData.signups || 0, color: 'var(--accent2)' },
                { label: 'Paid', value: referralData.paid || 0, color: 'var(--success)' },
                { label: 'Rewards', value: referralData.rewardsEarned || 0, color: '#f0a500' },
              ].map(s => (
                <div key={s.label} style={{ background: 'var(--surface2)', borderRadius: 10, padding: '12px 14px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div style={{ textAlign: 'center', color: 'var(--muted)', fontSize: 13, padding: 20 }}>Sign in to see your referral link</div>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// PUBLIC LOAD TRACKING PAGE — no auth required
// Brokers/shippers use this to track load status via shared link
// ═══════════════════════════════════════════════════════════════
export function LoadTrackingPage({ token }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) return
    const apiBase = window.location.origin
    // Try new /api/track endpoint first, fall back to legacy /api/load-tracking
    fetch(`${apiBase}/api/track?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else setData(d)
      })
      .catch(() => setError('Unable to load tracking information'))
      .finally(() => setLoading(false))
  }, [token])

  const STATUS_COLORS = {
    'Rate Con Received': '#8a8a9a',
    'Booked': '#f0a500',
    'Dispatched': '#a78bfa',
    'En Route to Pickup': '#38bdf8',
    'Loaded': '#a78bfa',
    'In Transit': '#4d8ef0',
    'Delivered': '#22c55e',
    'Invoiced': '#f97316',
    'Paid': '#22c55e',
  }

  const statusColor = STATUS_COLORS[data?.status] || '#f0a500'

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0e', fontFamily: "'DM Sans',-apple-system,BlinkMacSystemFont,sans-serif" }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #1e1e2a', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <a href="https://qivori.com" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center' }}>
          <span style={{ fontSize: 24, letterSpacing: 4, color: '#fff', fontWeight: 800 }}>QI<span style={{ color: '#f0a500' }}>VORI</span></span>
          <span style={{ fontSize: 10, color: '#4d8ef0', letterSpacing: 2, fontWeight: 700, marginLeft: 6 }}>AI</span>
        </a>
        <span style={{ fontSize: 11, color: '#8a8a9a', marginLeft: 16, letterSpacing: 1 }}>SHIPMENT TRACKING</span>
      </div>

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '32px 16px 60px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ width: 32, height: 32, border: '3px solid #2a2a35', borderTopColor: '#f0a500', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
            <div style={{ color: '#8a8a9a', fontSize: 13 }}>Loading tracking info...</div>
          </div>
        )}

        {error && (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>&#128722;</div>
            <div style={{ color: '#ef4444', fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
              {error === 'Tracking link expired' ? 'Link Expired' : 'Load Not Found'}
            </div>
            <div style={{ color: '#8a8a9a', fontSize: 13 }}>
              {error === 'Tracking link expired'
                ? 'This tracking link has expired. Please request a new link from your carrier.'
                : 'This tracking link may be expired or invalid.'}
            </div>
          </div>
        )}

        {data && (
          <>
            {/* Status Banner */}
            <div style={{ background: '#16161e', border: '1px solid #2a2a35', borderRadius: 16, padding: 24, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#8a8a9a', letterSpacing: 1, marginBottom: 4 }}>LOAD</div>
                  <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 800, color: '#f0a500' }}>{data.load_number}</div>
                </div>
                <div style={{ padding: '6px 16px', borderRadius: 8, background: statusColor + '18', border: '1px solid ' + statusColor + '40' }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: statusColor }}>{data.status}</span>
                </div>
              </div>

              {/* Route */}
              <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1, marginBottom: 8 }}>
                {(data.origin || '').split(',')[0]} &rarr; {(data.destination || '').split(',')[0]}
              </div>

              {/* Details row */}
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, color: '#8a8a9a' }}>
                {data.miles && <span>{Number(data.miles).toLocaleString()} mi</span>}
                {data.equipment && <span>{data.equipment}</span>}
                {data.commodity && <span>{data.commodity}</span>}
                {data.weight && <span>{Number(data.weight).toLocaleString()} lbs</span>}
              </div>
            </div>

            {/* Progress Timeline */}
            <div style={{ background: '#16161e', border: '1px solid #2a2a35', borderRadius: 16, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#8a8a9a', letterSpacing: 1, marginBottom: 16, fontWeight: 700 }}>SHIPMENT PROGRESS</div>

              {/* Progress bar */}
              <div style={{ display: 'flex', gap: 3, marginBottom: 20 }}>
                {(data.timeline || []).map((step, i) => (
                  <div key={i} style={{ flex: 1, height: 6, borderRadius: 3, background: step.completed ? '#f0a500' : '#2a2a35', transition: 'background 0.3s' }} />
                ))}
              </div>

              {/* Timeline steps */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {(data.timeline || []).map((step, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: step.completed ? '#f0a500' : step.current ? '#1e1e2a' : '#2a2a35',
                      border: step.current ? '2px solid #f0a500' : 'none',
                    }}>
                      {step.completed ? (
                        <span style={{ color: '#000', fontSize: 12, fontWeight: 800 }}>&#10003;</span>
                      ) : (
                        <span style={{ color: '#555', fontSize: 10 }}>{i + 1}</span>
                      )}
                    </div>
                    <span style={{
                      fontSize: 13,
                      fontWeight: step.current ? 700 : 400,
                      color: step.current ? '#f0a500' : step.completed ? '#fff' : '#555',
                    }}>{step.status}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Dates & Details */}
            <div style={{ background: '#16161e', border: '1px solid #2a2a35', borderRadius: 16, padding: 24, marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#8a8a9a', letterSpacing: 1, marginBottom: 16, fontWeight: 700 }}>SHIPMENT DETAILS</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {[
                  { label: 'Pickup Date', value: data.pickup_date ? new Date(data.pickup_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014' },
                  { label: 'Delivery Date', value: data.delivery_date ? new Date(data.delivery_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '\u2014' },
                  ...(data.driver_first_name ? [{ label: 'Driver', value: data.driver_first_name }] : []),
                  { label: 'Equipment', value: data.equipment || '\u2014' },
                  ...(data.eta && data.status !== 'Delivered' ? [{ label: 'ETA', value: new Date(data.eta).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) }] : []),
                ].map(d => (
                  <div key={d.label} style={{ background: '#1e1e2a', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 10, color: '#8a8a9a', letterSpacing: 0.5, marginBottom: 4 }}>{d.label}</div>
                    <div style={{ fontSize: 13, color: '#fff', fontWeight: 600 }}>{d.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Multi-stop info */}
            {data.stops && data.stops.length > 0 && (
              <div style={{ background: '#16161e', border: '1px solid #2a2a35', borderRadius: 16, padding: 24, marginBottom: 16 }}>
                <div style={{ fontSize: 11, color: '#8a8a9a', letterSpacing: 1, marginBottom: 16, fontWeight: 700 }}>STOPS</div>
                {data.stops.map((stop, i) => {
                  const isDone = stop.status === 'completed' || !!stop.departed_at
                  const isActive = stop.status === 'current' || (!!stop.arrived_at && !stop.departed_at)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', borderBottom: i < data.stops.length - 1 ? '1px solid #2a2a35' : 'none' }}>
                      <div style={{
                        width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                        background: isDone ? '#22c55e' : isActive ? '#f0a500' : '#2a2a35',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 9, color: isDone || isActive ? '#000' : '#555', fontWeight: 700,
                      }}>{isDone ? '\u2713' : i + 1}</div>
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{stop.city}{stop.state ? `, ${stop.state}` : ''}</span>
                        <span style={{ fontSize: 10, color: '#8a8a9a', marginLeft: 8, textTransform: 'uppercase' }}>{stop.type}</span>
                      </div>
                      {stop.arrived_at && <span style={{ fontSize: 10, color: '#8a8a9a' }}>Arrived {new Date(stop.arrived_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Footer */}
            <div style={{ textAlign: 'center', padding: '24px 16px' }}>
              <a href="https://qivori.com" style={{ textDecoration: 'none' }}>
                <div style={{ color: '#555', fontSize: 11 }}>Powered by <strong style={{ color: '#f0a500' }}>Qivori AI</strong> &mdash; AI-Powered TMS for Trucking</div>
              </a>
              <div style={{ color: '#444', fontSize: 10, marginTop: 4 }}>Last updated: {new Date(data.last_updated).toLocaleString()}</div>
            </div>
          </>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
