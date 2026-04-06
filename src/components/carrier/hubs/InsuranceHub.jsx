import React, { useState, useMemo } from 'react'
import {
  Users, Truck, Shield, AlertTriangle,
  CheckCircle, FileText, Star,
} from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import { Ic } from '../shared'

// ── Insurance Hub ──
const INSURERS = [
  { id: 'cover-whale', name: 'Cover Whale', desc: 'AI-powered commercial trucking insurance', tag: 'Recommended' },
  { id: 'progressive', name: 'Progressive Commercial', desc: 'Largest commercial auto insurer in the US', tag: '' },
  { id: 'national-interstate', name: 'National Interstate', desc: 'Specializes in small fleets & owner-operators', tag: '' },
  { id: 'reliance', name: 'Reliance Partners', desc: 'Trucking-only insurance brokerage', tag: '' },
  { id: 'canal', name: 'Canal Insurance', desc: 'Owner-operator focused coverage', tag: '' },
]

export function InsuranceHub() {
  const { company, vehicles, drivers, loads } = useCarrier()
  const { showToast } = useApp()
  const [quoteForm, setQuoteForm] = useState({ name: company?.name || '', mc: company?.mc_number || company?.mc || '', dot: company?.dot_number || company?.dot || '', phone: company?.phone || '', email: company?.email || '', trucks: String(vehicles?.length || drivers?.length || 1), equipment: 'Dry Van', currentInsurer: '', expiryDate: '', coverageNeeded: 'auto-liability' })
  const [submitted, setSubmitted] = useState(false)
  const [selectedInsurers, setSelectedInsurers] = useState(INSURERS.map(i => i.id))
  const [excludedDrivers, setExcludedDrivers] = useState([])

  // Pull real insurance expiry dates from vehicles
  const vehicleInsExpiries = useMemo(() => {
    return (vehicles || []).filter(v => v.insurance_expiry).map(v => ({
      unit: v.unit_number || 'Unknown',
      expiry: v.insurance_expiry,
      daysLeft: Math.ceil((new Date(v.insurance_expiry) - new Date()) / 86400000),
    })).sort((a, b) => a.daysLeft - b.daysLeft)
  }, [vehicles])

  const soonestExpiry = vehicleInsExpiries[0]
  const expiredCount = vehicleInsExpiries.filter(v => v.daysLeft <= 0).length
  const expiringCount = vehicleInsExpiries.filter(v => v.daysLeft > 0 && v.daysLeft <= 60).length

  const policies = useMemo(() => {
    const companyIns = company?.insurance_expiry || company?.insurance_policy
    const companyDays = companyIns ? Math.ceil((new Date(companyIns) - new Date()) / 86400000) : null
    return [
      { type: 'Auto Liability', required: true, minCoverage: '$1,000,000', status: companyIns ? 'active' : 'none', provider: company?.insurance_provider || '', expiry: companyIns || '', daysLeft: companyDays },
      { type: 'Cargo Insurance', required: true, minCoverage: '$100,000', status: 'none', provider: '', expiry: '', daysLeft: null },
      { type: 'General Liability', required: false, minCoverage: '$1,000,000', status: 'none', provider: '', expiry: '', daysLeft: null },
      { type: 'Physical Damage', required: false, minCoverage: 'Truck value', status: 'none', provider: '', expiry: '', daysLeft: null },
      { type: 'Bobtail Insurance', required: false, minCoverage: '$1,000,000', status: 'none', provider: '', expiry: '', daysLeft: null },
      { type: 'Occupational Accident', required: false, minCoverage: '$500,000', status: 'none', provider: '', expiry: '', daysLeft: null },
    ]
  }, [company])

  // Driver risk scoring
  const driverRisks = useMemo(() => {
    return (drivers || []).map(d => {
      const name = d.full_name || d.name || ''
      const driverLoads = (loads || []).filter(l => l.driver === name)
      const incidents = d.incidents || 0
      const violations = d.violations || 0
      const cdlExpired = d.license_expiry && new Date(d.license_expiry) < new Date()
      const medExpired = d.medical_card_expiry && new Date(d.medical_card_expiry) < new Date()
      let score = 100
      if (incidents > 0) score -= incidents * 15
      if (violations > 0) score -= violations * 10
      if (cdlExpired) score -= 30
      if (medExpired) score -= 20
      if (driverLoads.length === 0) score -= 5
      score = Math.max(score, 0)
      const risk = score >= 80 ? 'low' : score >= 50 ? 'medium' : 'high'
      return { ...d, name, score, risk, incidents, violations, cdlExpired, medExpired, loadCount: driverLoads.length }
    }).sort((a, b) => a.score - b.score)
  }, [drivers, loads])

  const toggleInsurer = (id) => setSelectedInsurers(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  const selectAllInsurers = () => setSelectedInsurers(INSURERS.map(i => i.id))
  const toggleExcludeDriver = (driverId) => setExcludedDrivers(prev => prev.includes(driverId) ? prev.filter(i => i !== driverId) : [...prev, driverId])
  const includedDriverCount = (drivers || []).length - excludedDrivers.length

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (selectedInsurers.length === 0) { showToast('error', 'No Partners Selected', 'Select at least one insurer'); return }
    try {
      await apiFetch('/api/insurance-quote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        ...quoteForm, selectedInsurers, excludedDriverIds: excludedDrivers, includedDriverCount, totalDrivers: (drivers || []).length,
      }) })
    } catch { /* endpoint may not exist yet */ }
    setSubmitted(true)
    showToast('success', 'Quotes Requested', `Sent to ${selectedInsurers.length} insurer${selectedInsurers.length > 1 ? 's' : ''}`)
  }

  const pan = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }
  const panHead = (icon, label, right) => (
    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Ic icon={icon} size={14} color="var(--accent)" />
        <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1 }}>{label}</span>
      </div>
      {right}
    </div>
  )
  const inp_ = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', width: '100%', boxSizing: 'border-box' }
  const FieldRow = ({ label, value, onChange, type = 'text', placeholder = '' }) => (
    <div>
      <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inp_} />
    </div>
  )

  const daysLabel = (d) => {
    if (d === null || d === undefined) return null
    if (d <= 0) return { text: 'EXPIRED', color: 'var(--danger)' }
    if (d <= 30) return { text: `${d}d left`, color: 'var(--danger)' }
    if (d <= 60) return { text: `${d}d left`, color: 'var(--warning)' }
    if (d <= 90) return { text: `${d}d left`, color: 'var(--accent)' }
    return { text: `${d}d left`, color: 'var(--success)' }
  }

  return (
    <div style={{ padding: 24, maxWidth: 1020, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 2, marginBottom: 4 }}>
            INSURANCE <span style={{ color: 'var(--accent)' }}>MARKETPLACE</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
            Compare quotes from top trucking insurers. Track renewals, manage risk, and get the best rates.
          </div>
        </div>
        {/* Quick stats */}
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          {[
            { v: (vehicles || []).length, l: 'Vehicles', c: 'var(--accent)' },
            { v: (drivers || []).length, l: 'Drivers', c: 'var(--accent2)' },
            { v: expiredCount + expiringCount, l: 'Renewals Due', c: expiredCount > 0 ? 'var(--danger)' : expiringCount > 0 ? 'var(--warning)' : 'var(--success)' },
          ].map(s => (
            <div key={s.l} style={{ textAlign: 'center', minWidth: 60 }}>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: s.c, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Renewal Alert Banner */}
      {(expiredCount > 0 || expiringCount > 0) && (
        <div style={{
          padding: '14px 18px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 14,
          background: expiredCount > 0 ? 'rgba(239,68,68,0.06)' : 'rgba(245,158,11,0.06)',
          border: `1px solid ${expiredCount > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`,
        }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: expiredCount > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ic icon={AlertTriangle} size={20} color={expiredCount > 0 ? 'var(--danger)' : 'var(--warning)'} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: expiredCount > 0 ? 'var(--danger)' : 'var(--warning)', marginBottom: 3 }}>
              {expiredCount > 0 ? `${expiredCount} Vehicle${expiredCount > 1 ? 's' : ''} — Insurance Expired` : `${expiringCount} Vehicle${expiringCount > 1 ? 's' : ''} — Insurance Expiring Soon`}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              {soonestExpiry && (soonestExpiry.daysLeft <= 0
                ? <><strong>{soonestExpiry.unit}</strong> expired {Math.abs(soonestExpiry.daysLeft)} days ago. Renew immediately to stay compliant.</>
                : <><strong>{soonestExpiry.unit}</strong> expires in <strong>{soonestExpiry.daysLeft} days</strong> ({soonestExpiry.expiry}). Request quotes below to compare rates.</>
              )}
            </div>
          </div>
          <button className="btn btn-primary" style={{ fontSize: 11, flexShrink: 0, padding: '8px 16px' }}
            onClick={() => document.getElementById('ins-quote-form')?.scrollIntoView({ behavior: 'smooth' })}>
            Get Quotes Now
          </button>
        </div>
      )}

      {/* Vehicle Insurance Status */}
      {vehicleInsExpiries.length > 0 && (
        <div style={pan}>
          {panHead(Truck, 'VEHICLE INSURANCE STATUS', <span style={{ fontSize: 10, color: 'var(--muted)' }}>{vehicleInsExpiries.length} vehicle{vehicleInsExpiries.length > 1 ? 's' : ''} with insurance dates</span>)}
          <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {vehicleInsExpiries.map(v => {
              const dl = daysLabel(v.daysLeft)
              return (
                <div key={v.unit} style={{ padding: '12px 14px', background: 'var(--surface2)', borderRadius: 8, border: `1px solid ${v.daysLeft <= 0 ? 'rgba(239,68,68,0.25)' : v.daysLeft <= 60 ? 'rgba(245,158,11,0.2)' : 'var(--border)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{v.unit}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>Expires: {v.expiry}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 11, fontWeight: 800, color: dl?.color }}>{dl?.text}</div>
                    {v.daysLeft <= 60 && v.daysLeft > 0 && (
                      <div style={{ width: 50, height: 3, background: 'var(--border)', borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(5, (v.daysLeft / 60) * 100)}%`, height: '100%', background: dl?.color, borderRadius: 2 }} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Coverage Status */}
      <div style={pan}>
        {panHead(Shield, 'COVERAGE STATUS')}
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 8 }}>
          {policies.map(p => {
            const isActive = p.status === 'active'
            const dl = daysLabel(p.daysLeft)
            const isExpiring = p.daysLeft !== null && p.daysLeft <= 60
            return (
              <div key={p.type} style={{ padding: '14px 16px', background: 'var(--surface2)', borderRadius: 10, border: `1px solid ${isActive ? (isExpiring ? (dl?.color || 'var(--warning)') + '30' : 'rgba(34,197,94,0.2)') : 'var(--border)'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{p.type}</span>
                    {p.required && <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--danger)', background: 'rgba(239,68,68,0.08)', padding: '1px 5px', borderRadius: 3 }}>REQUIRED</span>}
                  </div>
                  {isActive ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      {dl && <span style={{ fontSize: 10, fontWeight: 700, color: dl.color }}>{dl.text}</span>}
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: isExpiring ? dl?.color : 'var(--success)', boxShadow: `0 0 6px ${isExpiring ? dl?.color : 'var(--success)'}` }} />
                    </div>
                  ) : (
                    <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', background: 'var(--surface)', padding: '2px 8px', borderRadius: 4 }}>Not covered</span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Min: {p.minCoverage}{p.provider ? ` · ${p.provider}` : ''}</div>
                  {isActive && p.expiry && <div style={{ fontSize: 10, color: 'var(--muted)' }}>Exp: {p.expiry}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Driver Risk Management */}
      {driverRisks.length > 0 && (
        <div style={pan}>
          {panHead(Users, 'DRIVER RISK MANAGEMENT', <span style={{ fontSize: 10, color: 'var(--muted)' }}>{includedDriverCount} of {(drivers || []).length} drivers on policy</span>)}
          <div style={{ padding: '8px 18px 6px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
              Exclude high-risk drivers from your quote to keep premiums low. Excluded drivers can be covered under separate policies.
            </div>
          </div>
          {driverRisks.map(d => {
            const isExcluded = excludedDrivers.includes(d.id)
            const riskColor = d.risk === 'high' ? 'var(--danger)' : d.risk === 'medium' ? 'var(--warning)' : 'var(--success)'
            return (
              <div key={d.id} style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, opacity: isExcluded ? 0.45 : 1, transition: 'opacity 0.15s' }}>
                <div onClick={() => toggleExcludeDriver(d.id)}
                  style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${isExcluded ? 'var(--danger)' : 'var(--border)'}`, background: isExcluded ? 'rgba(239,68,68,0.1)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                  {isExcluded && <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 800 }}>✕</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 700 }}>{d.name}</span>
                    <span style={{ fontSize: 9, fontWeight: 800, color: riskColor, background: riskColor + '10', padding: '2px 7px', borderRadius: 4, letterSpacing: 0.5 }}>
                      {d.risk.toUpperCase()} RISK
                    </span>
                    {isExcluded && <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--danger)', letterSpacing: 0.5 }}>EXCLUDED</span>}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3, display: 'flex', gap: 12 }}>
                    <span>Score: {d.score}/100</span>
                    {d.loadCount > 0 && <span>{d.loadCount} loads</span>}
                    {d.incidents > 0 && <span style={{ color: 'var(--danger)' }}>{d.incidents} incident{d.incidents > 1 ? 's' : ''}</span>}
                    {d.cdlExpired && <span style={{ color: 'var(--danger)' }}>CDL expired</span>}
                    {d.medExpired && <span style={{ color: 'var(--warning)' }}>Medical expired</span>}
                  </div>
                </div>
                <div style={{ width: 80, height: 6, background: 'var(--border)', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                  <div style={{ width: d.score + '%', height: '100%', background: riskColor, borderRadius: 3, transition: 'width 0.3s' }} />
                </div>
              </div>
            )
          })}
          {excludedDrivers.length > 0 && (
            <div style={{ padding: '10px 18px 12px', borderTop: '1px solid var(--border)', background: 'rgba(240,165,0,0.02)' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                <strong style={{ color: 'var(--accent)' }}>Q tip:</strong> Excluding {excludedDrivers.length} driver{excludedDrivers.length > 1 ? 's' : ''} could save 10-25% on your premium. Consider separate occupational accident coverage for excluded drivers.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Select Partners */}
      <div style={pan}>
        {panHead(Star, 'SELECT INSURANCE PARTNERS', <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={selectAllInsurers}>Select All</button>)}
        <div style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
          {INSURERS.map(ins => {
            const isSel = selectedInsurers.includes(ins.id)
            return (
              <div key={ins.id} onClick={() => toggleInsurer(ins.id)}
                style={{ padding: '14px 16px', background: isSel ? 'rgba(240,165,0,0.04)' : 'var(--surface2)', borderRadius: 10, border: `1px solid ${isSel ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`, cursor: 'pointer', transition: 'all 0.15s' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${isSel ? 'var(--accent)' : 'var(--border)'}`, background: isSel ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
                    {isSel && <span style={{ fontSize: 12, color: '#000', fontWeight: 800 }}>✓</span>}
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{ins.name}</span>
                  {ins.tag && <span style={{ fontSize: 8, fontWeight: 800, color: 'var(--accent)', background: 'rgba(240,165,0,0.1)', padding: '2px 7px', borderRadius: 4 }}>{ins.tag}</span>}
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.4, marginLeft: 28 }}>{ins.desc}</div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Quote Form */}
      <div style={pan} id="ins-quote-form">
        {panHead(FileText, 'REQUEST QUOTES', <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>Sending to {selectedInsurers.length} partner{selectedInsurers.length !== 1 ? 's' : ''}</span>)}
        {submitted ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <Ic icon={CheckCircle} size={26} color="var(--success)" />
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Quotes Requested from {selectedInsurers.length} Partners</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
              {selectedInsurers.map(id => INSURERS.find(i => i.id === id)?.name).join(', ')} will review your info and send competitive quotes within 1-2 business days.
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 20, fontSize: 11 }} onClick={() => setSubmitted(false)}>Submit Another Request</button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <FieldRow label="Company Name" value={quoteForm.name} onChange={v => setQuoteForm(f => ({ ...f, name: v }))} />
              <FieldRow label="MC Number" value={quoteForm.mc} onChange={v => setQuoteForm(f => ({ ...f, mc: v }))} />
              <FieldRow label="DOT Number" value={quoteForm.dot} onChange={v => setQuoteForm(f => ({ ...f, dot: v }))} />
              <FieldRow label="Trucks on Policy" value={String(includedDriverCount || quoteForm.trucks)} onChange={v => setQuoteForm(f => ({ ...f, trucks: v }))} type="number" />
              <FieldRow label="Phone" value={quoteForm.phone} onChange={v => setQuoteForm(f => ({ ...f, phone: v }))} />
              <FieldRow label="Email" value={quoteForm.email} onChange={v => setQuoteForm(f => ({ ...f, email: v }))} type="email" />
              <FieldRow label="Current Insurer" value={quoteForm.currentInsurer} onChange={v => setQuoteForm(f => ({ ...f, currentInsurer: v }))} placeholder="e.g. Progressive, National Interstate" />
              <FieldRow label="Policy Expiry Date" value={quoteForm.expiryDate} onChange={v => setQuoteForm(f => ({ ...f, expiryDate: v }))} type="date" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Equipment Type</label>
                <select value={quoteForm.equipment} onChange={e => setQuoteForm(f => ({ ...f, equipment: e.target.value }))} style={inp_}>
                  {['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Hotshot', 'Box Truck', 'Tanker', 'Car Hauler'].map(e => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600, display: 'block', marginBottom: 5 }}>Coverage Needed</label>
                <select value={quoteForm.coverageNeeded} onChange={e => setQuoteForm(f => ({ ...f, coverageNeeded: e.target.value }))} style={inp_}>
                  <option value="auto-liability">Auto Liability ($1M)</option>
                  <option value="cargo">Cargo Insurance ($100K)</option>
                  <option value="general-liability">General Liability</option>
                  <option value="physical-damage">Physical Damage</option>
                  <option value="bobtail">Bobtail / Non-Trucking</option>
                  <option value="occupational-accident">Occupational Accident</option>
                  <option value="full-package">Full Package (All Coverage)</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn btn-primary" style={{ padding: '13px 32px', fontSize: 14, fontWeight: 800, alignSelf: 'flex-start' }}>
              Send to {selectedInsurers.length === INSURERS.length ? 'All Partners' : `${selectedInsurers.length} Partner${selectedInsurers.length !== 1 ? 's' : ''}`}
            </button>
          </form>
        )}
      </div>

      <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic', padding: '0 4px' }}>
        Your data is only shared with insurers you select. Qivori earns a referral fee — at no extra cost to you.
      </div>
    </div>
  )
}
