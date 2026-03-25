import { useState, useEffect, useRef, useCallback } from 'react'
import { User, CreditCard, Shield, Heart, Check, ChevronRight, ChevronLeft, AlertCircle, Pen, Briefcase, FileSearch, FileText, Building, Upload, Lock, Plus, Trash2, Camera } from 'lucide-react'

const STEPS = [
  { id: 'personal', label: 'Personal Info', icon: User },
  { id: 'cdl', label: 'CDL & Qualifications', icon: CreditCard },
  { id: 'employment', label: 'Employment History', icon: Briefcase },
  { id: 'mvr', label: 'MVR & Background Auth', icon: FileSearch },
  { id: 'w9', label: 'W-9 / Tax Info', icon: FileText },
  { id: 'deposit', label: 'Direct Deposit', icon: Building },
  { id: 'documents', label: 'Document Uploads', icon: Upload },
  { id: 'consent', label: 'Drug & Alcohol Consent', icon: Shield },
  { id: 'emergency', label: 'Emergency Contact & Review', icon: Heart },
]

export default function DriverOnboarding() {
  const [token, setToken] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [inviteInfo, setInviteInfo] = useState(null)
  const [step, setStep] = useState(0)
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [completedSteps, setCompletedSteps] = useState([])

  // Form data
  const [form, setForm] = useState({
    profilePhoto: null,
    fullName: '', dob: '', phone: '', address: '', city: '', state: '', zip: '',
    cdlNumber: '', cdlState: '', cdlClass: 'A', cdlEndorsements: [],
    cdlExpiry: '', medicalExpiry: '', yearsExperience: '',
    equipmentExp: [],
    // Employment history
    employers: [{ companyName: '', phone: '', address: '', cityState: '', position: 'driver', dateFrom: '', dateTo: '', reasonForLeaving: '' }],
    // MVR & Background
    mvrConsent: false,
    hasAccidents: 'no', accidents: [],
    hasViolations: 'no', violations: [],
    backgroundAuthConsent: false,
    // W-9 / Tax
    ssn: '', taxClassification: '', taxLegalName: '', businessName: '', w9Certified: false,
    // Direct Deposit
    bankName: '', routingNumber: '', accountNumber: '', accountType: '', nameOnAccount: '', depositLater: false,
    // Document Uploads
    cdlFrontPhoto: null, cdlBackPhoto: null, medicalCard: null, proofOfInsurance: null, w9Form: null,
    // Drug & Alcohol Consent
    consentAgreed: false, consentSignature: null, consentDate: '',
    // Emergency Contact
    emergencyName: '', emergencyPhone: '', emergencyRelationship: '',
  })

  const updateForm = (key, value) => setForm(f => ({ ...f, [key]: value }))

  // Load invitation info
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || '')
    const t = params.get('token')
    if (!t) { setError('No invitation token found. Please use the link from your email.'); setLoading(false); return }
    setToken(t)

    fetch(`/api/driver-onboarding?token=${t}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); setLoading(false); return }
        setInviteInfo(data)
        if (data.existingSubmission?.status === 'completed') setSubmitted(true)
        if (data.existingSubmission?.completed_steps) setCompletedSteps(data.existingSubmission.completed_steps)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load invitation. Please try again.'); setLoading(false) })
  }, [])

  const saveStep = useCallback(async (stepId, data) => {
    setSaving(true)
    try {
      const res = await fetch('/api/driver-onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, step: stepId, data }),
      })
      const result = await res.json()
      if (result.ok) {
        setCompletedSteps(result.completedSteps || [])
        if (result.status === 'completed') setSubmitted(true)
      }
    } catch {}
    setSaving(false)
  }, [token])

  const handleNext = async () => {
    const stepId = STEPS[step].id
    await saveStep(stepId, form)
    if (step < STEPS.length - 1) setStep(step + 1)
    else setSubmitted(true)
  }

  const handleBack = () => { if (step > 0) setStep(step - 1) }

  // ── Loading / Error states ──
  if (loading) return <PageShell><Loader /></PageShell>
  if (error) return <PageShell><ErrorCard message={error} /></PageShell>
  if (submitted) return <PageShell><SuccessCard companyName={inviteInfo?.companyName} /></PageShell>

  const currentStep = STEPS[step]
  const isValid = validateStep(step, form)

  return (
    <PageShell>
      <div style={{ maxWidth: 580, margin: '0 auto', padding: '24px 16px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: 3, color: '#fff', fontFamily: "'Bebas Neue', sans-serif" }}>
            QI<span style={{ color: '#f0a500' }}>VORI</span>
          </span>
          {inviteInfo?.companyName && (
            <div style={{ fontSize: 14, color: '#8a8a9a', marginTop: 6 }}>
              Onboarding for <strong style={{ color: '#f0a500' }}>{inviteInfo.companyName}</strong>
            </div>
          )}
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 28 }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= step ? '#f0a500' : '#2a2a35',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Step indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(240,165,0,0.15)', border: '2px solid rgba(240,165,0,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {currentStep.icon && <currentStep.icon size={16} color="#f0a500" />}
          </div>
          <div>
            <div style={{ fontSize: 10, color: '#666', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
              Step {step + 1} of {STEPS.length}
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#fff' }}>{currentStep.label}</div>
          </div>
        </div>

        {/* Form Card */}
        <div style={{
          background: '#16161e', border: '1px solid #2a2a35', borderRadius: 14,
          padding: '24px 20px', marginBottom: 20,
        }}>
          {step === 0 && <PersonalInfoStep form={form} updateForm={updateForm} />}
          {step === 1 && <CDLStep form={form} updateForm={updateForm} />}
          {step === 2 && <EmploymentHistoryStep form={form} updateForm={updateForm} />}
          {step === 3 && <MVRBackgroundStep form={form} updateForm={updateForm} />}
          {step === 4 && <W9TaxStep form={form} updateForm={updateForm} />}
          {step === 5 && <DirectDepositStep form={form} updateForm={updateForm} />}
          {step === 6 && <DocumentUploadsStep form={form} updateForm={updateForm} />}
          {step === 7 && <ConsentStep form={form} updateForm={updateForm} />}
          {step === 8 && <EmergencyStep form={form} updateForm={updateForm} />}
        </div>

        {/* Navigation */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
          <button onClick={handleBack} disabled={step === 0} style={{
            padding: '12px 20px', borderRadius: 10, border: '1px solid #2a2a35',
            background: 'transparent', color: step === 0 ? '#444' : '#8a8a9a',
            fontWeight: 600, fontSize: 13, cursor: step === 0 ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'DM Sans', sans-serif",
          }}>
            <ChevronLeft size={14} /> Back
          </button>
          <button onClick={handleNext} disabled={!isValid || saving} style={{
            padding: '12px 28px', borderRadius: 10, border: 'none',
            background: isValid ? '#f0a500' : '#333', color: isValid ? '#000' : '#666',
            fontWeight: 700, fontSize: 13, cursor: isValid ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', gap: 6, fontFamily: "'DM Sans', sans-serif",
            opacity: saving ? 0.6 : 1,
          }}>
            {saving ? 'Saving...' : step === STEPS.length - 1 ? 'Submit' : 'Continue'}
            {!saving && <ChevronRight size={14} />}
          </button>
        </div>
      </div>
    </PageShell>
  )
}

// ── Step Components ──

function PersonalInfoStep({ form, updateForm }) {
  const handlePhoto = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { alert('Photo must be under 5MB'); return }
    const reader = new FileReader()
    reader.onload = () => updateForm('profilePhoto', reader.result)
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Profile Photo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 4 }}>
        <div style={{
          width: 80, height: 80, borderRadius: '50%', flexShrink: 0,
          background: form.profilePhoto ? 'none' : '#1a1a24',
          border: `2px dashed ${form.profilePhoto ? '#f0a500' : '#2a2a35'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', position: 'relative', cursor: 'pointer',
        }} onClick={() => document.getElementById('profile-photo-input').click()}>
          {form.profilePhoto ? (
            <img src={form.profilePhoto} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            <Camera size={24} color="#444" />
          )}
        </div>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 4 }}>Profile Photo *</div>
          <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>Clear photo of your face — used for your driver ID</div>
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 14px',
            borderRadius: 8, border: '1px solid #2a2a35', background: 'transparent',
            color: '#8a8a9a', fontSize: 11, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
          }}>
            <Upload size={12} /> {form.profilePhoto ? 'Change Photo' : 'Upload Photo'}
            <input id="profile-photo-input" type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} />
          </label>
        </div>
      </div>

      <Field label="Full Legal Name" required value={form.fullName} onChange={v => updateForm('fullName', v)} placeholder="John Smith" />
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="Date of Birth" required type="date" value={form.dob} onChange={v => updateForm('dob', v)} style={{ flex: 1 }} />
        <Field label="Phone" required type="tel" value={form.phone} onChange={v => updateForm('phone', v)} placeholder="(555) 123-4567" style={{ flex: 1 }} />
      </div>
      <Field label="Street Address" required value={form.address} onChange={v => updateForm('address', v)} placeholder="123 Main St" />
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="City" required value={form.city} onChange={v => updateForm('city', v)} placeholder="Dallas" style={{ flex: 2 }} />
        <Field label="State" required value={form.state} onChange={v => updateForm('state', v)} placeholder="TX" style={{ flex: 1 }} />
        <Field label="ZIP" required value={form.zip} onChange={v => updateForm('zip', v)} placeholder="75201" style={{ flex: 1 }} />
      </div>
    </div>
  )
}

function CDLStep({ form, updateForm }) {
  const endorsements = ['H - Hazmat', 'N - Tank', 'P - Passenger', 'S - School Bus', 'T - Doubles/Triples', 'X - Hazmat + Tank']
  const equipment = ['Dry Van', 'Flatbed', 'Reefer', 'Tanker', 'Intermodal', 'Step Deck', 'Lowboy', 'Car Hauler']

  const toggleEndorsement = (e) => {
    const current = form.cdlEndorsements || []
    updateForm('cdlEndorsements', current.includes(e) ? current.filter(x => x !== e) : [...current, e])
  }

  const toggleEquipment = (e) => {
    const current = form.equipmentExp || []
    updateForm('equipmentExp', current.includes(e) ? current.filter(x => x !== e) : [...current, e])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="CDL Number" required value={form.cdlNumber} onChange={v => updateForm('cdlNumber', v)} placeholder="D1234567" style={{ flex: 2 }} />
        <Field label="State" required value={form.cdlState} onChange={v => updateForm('cdlState', v)} placeholder="TX" style={{ flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>CDL Class *</label>
          <select value={form.cdlClass} onChange={e => updateForm('cdlClass', e.target.value)} style={inputStyle}>
            <option value="A">Class A</option>
            <option value="B">Class B</option>
            <option value="C">Class C</option>
          </select>
        </div>
        <Field label="Years Experience" type="number" value={form.yearsExperience} onChange={v => updateForm('yearsExperience', v)} placeholder="5" style={{ flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="CDL Expiry" required type="date" value={form.cdlExpiry} onChange={v => updateForm('cdlExpiry', v)} style={{ flex: 1 }} />
        <Field label="Medical Card Expiry" required type="date" value={form.medicalExpiry} onChange={v => updateForm('medicalExpiry', v)} style={{ flex: 1 }} />
      </div>

      <div>
        <label style={labelStyle}>Endorsements</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {endorsements.map(e => (
            <button key={e} onClick={() => toggleEndorsement(e)} style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
              border: '1px solid ' + ((form.cdlEndorsements || []).includes(e) ? '#f0a500' : '#2a2a35'),
              background: (form.cdlEndorsements || []).includes(e) ? 'rgba(240,165,0,0.15)' : 'transparent',
              color: (form.cdlEndorsements || []).includes(e) ? '#f0a500' : '#8a8a9a',
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}>{e}</button>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>Equipment Experience</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {equipment.map(e => (
            <button key={e} onClick={() => toggleEquipment(e)} style={{
              padding: '6px 12px', borderRadius: 8, fontSize: 11, fontWeight: 600,
              border: '1px solid ' + ((form.equipmentExp || []).includes(e) ? '#4d8ef0' : '#2a2a35'),
              background: (form.equipmentExp || []).includes(e) ? 'rgba(77,142,240,0.15)' : 'transparent',
              color: (form.equipmentExp || []).includes(e) ? '#4d8ef0' : '#8a8a9a',
              cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
            }}>{e}</button>
          ))}
        </div>
      </div>
    </div>
  )
}

function EmploymentHistoryStep({ form, updateForm }) {
  const employers = form.employers || [{ companyName: '', phone: '', address: '', cityState: '', position: 'driver', dateFrom: '', dateTo: '', reasonForLeaving: '' }]

  const updateEmployer = (index, field, value) => {
    const updated = [...employers]
    updated[index] = { ...updated[index], [field]: value }
    updateForm('employers', updated)
  }

  const addEmployer = () => {
    updateForm('employers', [...employers, { companyName: '', phone: '', address: '', cityState: '', position: 'driver', dateFrom: '', dateTo: '', reasonForLeaving: '' }])
  }

  const removeEmployer = (index) => {
    if (employers.length <= 1) return
    updateForm('employers', employers.filter((_, i) => i !== index))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: '#1a1a24', border: '1px solid #2a2a35', borderRadius: 10,
        padding: 14, fontSize: 12, color: '#f0a500', lineHeight: 1.6, fontWeight: 600,
      }}>
        FMCSA requires 10 years of employment history for CMV drivers.
      </div>

      {employers.map((emp, i) => (
        <div key={i} style={{
          border: '1px solid #2a2a35', borderRadius: 10, padding: 16,
          background: '#1a1a24', position: 'relative',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#f0a500', letterSpacing: 1, textTransform: 'uppercase' }}>
              Employer {i + 1}
            </div>
            {employers.length > 1 && (
              <button onClick={() => removeEmployer(i)} style={{
                background: 'transparent', border: '1px solid #3a2020', borderRadius: 6,
                color: '#ef4444', cursor: 'pointer', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4,
                fontSize: 11, fontFamily: "'DM Sans', sans-serif",
              }}>
                <Trash2 size={12} /> Remove
              </button>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <Field label="Company Name" required value={emp.companyName} onChange={v => updateEmployer(i, 'companyName', v)} placeholder="ABC Trucking" style={{ flex: 2 }} />
              <Field label="Phone" value={emp.phone} onChange={v => updateEmployer(i, 'phone', v)} placeholder="(555) 000-0000" style={{ flex: 1 }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Field label="Address" value={emp.address} onChange={v => updateEmployer(i, 'address', v)} placeholder="123 Main St" style={{ flex: 2 }} />
              <Field label="City / State" value={emp.cityState} onChange={v => updateEmployer(i, 'cityState', v)} placeholder="Dallas, TX" style={{ flex: 1 }} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Position *</label>
                <select value={emp.position} onChange={e => updateEmployer(i, 'position', e.target.value)} style={inputStyle}>
                  <option value="driver">Driver</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <Field label="From" required type="date" value={emp.dateFrom} onChange={v => updateEmployer(i, 'dateFrom', v)} style={{ flex: 1 }} />
              <Field label="To" required type="date" value={emp.dateTo} onChange={v => updateEmployer(i, 'dateTo', v)} style={{ flex: 1 }} />
            </div>
            <Field label="Reason for Leaving" value={emp.reasonForLeaving} onChange={v => updateEmployer(i, 'reasonForLeaving', v)} placeholder="e.g. Better opportunity" />
          </div>
        </div>
      ))}

      <button onClick={addEmployer} style={{
        padding: '10px 16px', borderRadius: 10, border: '1px dashed #2a2a35',
        background: 'transparent', color: '#f0a500', fontWeight: 600, fontSize: 12,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        fontFamily: "'DM Sans', sans-serif",
      }}>
        <Plus size={14} /> Add Another Employer
      </button>
    </div>
  )
}

function MVRBackgroundStep({ form, updateForm }) {
  const accidents = form.accidents || []
  const violations = form.violations || []

  const addAccident = () => {
    updateForm('accidents', [...accidents, { date: '', description: '', fatalities: false, injuries: false }])
  }
  const updateAccident = (index, field, value) => {
    const updated = [...accidents]
    updated[index] = { ...updated[index], [field]: value }
    updateForm('accidents', updated)
  }
  const removeAccident = (index) => {
    updateForm('accidents', accidents.filter((_, i) => i !== index))
  }

  const addViolation = () => {
    updateForm('violations', [...violations, { date: '', description: '', state: '' }])
  }
  const updateViolation = (index, field, value) => {
    const updated = [...violations]
    updated[index] = { ...updated[index], [field]: value }
    updateForm('violations', updated)
  }
  const removeViolation = (index) => {
    updateForm('violations', violations.filter((_, i) => i !== index))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* MVR Consent */}
      <div style={{
        background: '#1a1a24', border: '1px solid #2a2a35', borderRadius: 10,
        padding: 16, fontSize: 12, color: '#8a8a9a', lineHeight: 1.7,
      }}>
        <div style={{ fontWeight: 700, color: '#fff', marginBottom: 8, fontSize: 13 }}>
          Motor Vehicle Record (MVR) Authorization
        </div>
        <p>I hereby authorize my employer to obtain my Motor Vehicle Record (MVR) from the state Department of Motor Vehicles (DMV)
        for the purpose of evaluating my qualifications as a commercial motor vehicle driver.</p>
        <div style={{ fontWeight: 700, color: '#fff', marginBottom: 8, marginTop: 16, fontSize: 13 }}>
          Background Check Disclosure (FCRA)
        </div>
        <p>In accordance with the Fair Credit Reporting Act (FCRA), I understand that a consumer report and/or investigative consumer
        report may be obtained for employment purposes. I have the right to request a copy of any report obtained and to dispute
        any inaccurate information contained therein.</p>
      </div>

      {/* Accident History */}
      <div>
        <label style={labelStyle}>Any accidents in the last 3 years? *</label>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={() => { updateForm('hasAccidents', 'yes'); if (accidents.length === 0) addAccident() }} style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: '1px solid ' + (form.hasAccidents === 'yes' ? '#f0a500' : '#2a2a35'),
            background: form.hasAccidents === 'yes' ? 'rgba(240,165,0,0.15)' : 'transparent',
            color: form.hasAccidents === 'yes' ? '#f0a500' : '#8a8a9a',
            fontFamily: "'DM Sans', sans-serif",
          }}>Yes</button>
          <button onClick={() => { updateForm('hasAccidents', 'no'); updateForm('accidents', []) }} style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: '1px solid ' + (form.hasAccidents === 'no' ? '#f0a500' : '#2a2a35'),
            background: form.hasAccidents === 'no' ? 'rgba(240,165,0,0.15)' : 'transparent',
            color: form.hasAccidents === 'no' ? '#f0a500' : '#8a8a9a',
            fontFamily: "'DM Sans', sans-serif",
          }}>No</button>
        </div>
      </div>

      {form.hasAccidents === 'yes' && accidents.map((acc, i) => (
        <div key={i} style={{ border: '1px solid #2a2a35', borderRadius: 10, padding: 14, background: '#1a1a24' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8a8a9a', textTransform: 'uppercase' }}>Accident {i + 1}</div>
            <button onClick={() => removeAccident(i)} style={{
              background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2,
            }}><Trash2 size={14} /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Field label="Date" type="date" value={acc.date} onChange={v => updateAccident(i, 'date', v)} />
            <Field label="Description" value={acc.description} onChange={v => updateAccident(i, 'description', v)} placeholder="Brief description of accident" />
            <div style={{ display: 'flex', gap: 16, marginTop: 4 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#c8c8d0', cursor: 'pointer' }}>
                <input type="checkbox" checked={acc.fatalities} onChange={e => updateAccident(i, 'fatalities', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#f0a500' }} /> Fatalities
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#c8c8d0', cursor: 'pointer' }}>
                <input type="checkbox" checked={acc.injuries} onChange={e => updateAccident(i, 'injuries', e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: '#f0a500' }} /> Injuries
              </label>
            </div>
          </div>
        </div>
      ))}
      {form.hasAccidents === 'yes' && (
        <button onClick={addAccident} style={{
          padding: '8px 14px', borderRadius: 8, border: '1px dashed #2a2a35', background: 'transparent',
          color: '#8a8a9a', fontSize: 11, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
        }}>+ Add Another Accident</button>
      )}

      {/* Violations */}
      <div>
        <label style={labelStyle}>Traffic violations in the last 3 years? *</label>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button onClick={() => { updateForm('hasViolations', 'yes'); if (violations.length === 0) addViolation() }} style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: '1px solid ' + (form.hasViolations === 'yes' ? '#f0a500' : '#2a2a35'),
            background: form.hasViolations === 'yes' ? 'rgba(240,165,0,0.15)' : 'transparent',
            color: form.hasViolations === 'yes' ? '#f0a500' : '#8a8a9a',
            fontFamily: "'DM Sans', sans-serif",
          }}>Yes</button>
          <button onClick={() => { updateForm('hasViolations', 'no'); updateForm('violations', []) }} style={{
            padding: '8px 20px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            border: '1px solid ' + (form.hasViolations === 'no' ? '#f0a500' : '#2a2a35'),
            background: form.hasViolations === 'no' ? 'rgba(240,165,0,0.15)' : 'transparent',
            color: form.hasViolations === 'no' ? '#f0a500' : '#8a8a9a',
            fontFamily: "'DM Sans', sans-serif",
          }}>No</button>
        </div>
      </div>

      {form.hasViolations === 'yes' && violations.map((vio, i) => (
        <div key={i} style={{ border: '1px solid #2a2a35', borderRadius: 10, padding: 14, background: '#1a1a24' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8a8a9a', textTransform: 'uppercase' }}>Violation {i + 1}</div>
            <button onClick={() => removeViolation(i)} style={{
              background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 2,
            }}><Trash2 size={14} /></button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <Field label="Date" type="date" value={vio.date} onChange={v => updateViolation(i, 'date', v)} style={{ flex: 1 }} />
              <Field label="State" value={vio.state} onChange={v => updateViolation(i, 'state', v)} placeholder="TX" style={{ flex: 1 }} />
            </div>
            <Field label="Description" value={vio.description} onChange={v => updateViolation(i, 'description', v)} placeholder="e.g. Speeding" />
          </div>
        </div>
      ))}
      {form.hasViolations === 'yes' && (
        <button onClick={addViolation} style={{
          padding: '8px 14px', borderRadius: 8, border: '1px dashed #2a2a35', background: 'transparent',
          color: '#8a8a9a', fontSize: 11, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
        }}>+ Add Another Violation</button>
      )}

      {/* Authorization checkbox */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginTop: 8 }}>
        <input type="checkbox" checked={form.backgroundAuthConsent}
          onChange={e => updateForm('backgroundAuthConsent', e.target.checked)}
          style={{ width: 18, height: 18, accentColor: '#f0a500', cursor: 'pointer', marginTop: 2, flexShrink: 0 }} />
        <label style={{ fontSize: 13, color: '#c8c8d0', cursor: 'pointer', lineHeight: 1.5 }}
          onClick={() => updateForm('backgroundAuthConsent', !form.backgroundAuthConsent)}>
          I authorize the release of my driving record and background information to my employer for the purpose of evaluating my qualifications as a commercial driver.
        </label>
      </div>
    </div>
  )
}

function W9TaxStep({ form, updateForm }) {
  // Pre-fill tax legal name from personal info
  useEffect(() => {
    if (!form.taxLegalName && form.fullName) {
      updateForm('taxLegalName', form.fullName)
    }
  }, [])

  const formatSSN = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 9)
    if (digits.length <= 3) return digits
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Security notice */}
      <div style={{
        background: '#1a1a24', border: '1px solid #2a2a35', borderRadius: 10,
        padding: 14, fontSize: 12, color: '#8a8a9a', lineHeight: 1.6,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <Lock size={18} color="#22c55e" style={{ flexShrink: 0 }} />
        <span>Your SSN is encrypted and never stored in plain text. All tax information is transmitted securely.</span>
      </div>

      <div>
        <label style={labelStyle}>Social Security Number (SSN) *</label>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            value={form.ssn}
            onChange={e => updateForm('ssn', formatSSN(e.target.value))}
            placeholder="XXX-XX-XXXX"
            maxLength={11}
            style={{ ...inputStyle, paddingLeft: 36 }}
          />
          <Lock size={14} color="#666" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        </div>
        <div style={{ fontSize: 10, color: '#555', marginTop: 4 }}>Encrypted & Secure</div>
      </div>

      <div>
        <label style={labelStyle}>Tax Classification *</label>
        <select value={form.taxClassification} onChange={e => updateForm('taxClassification', e.target.value)} style={inputStyle}>
          <option value="">Select classification...</option>
          <option value="individual">Individual / Sole Proprietor</option>
          <option value="llc">LLC</option>
          <option value="corporation">Corporation</option>
        </select>
      </div>

      <Field label="Legal Name (for tax purposes)" required value={form.taxLegalName} onChange={v => updateForm('taxLegalName', v)} placeholder="John Smith" />

      <Field label="Business Name (if different)" value={form.businessName} onChange={v => updateForm('businessName', v)} placeholder="Smith Trucking LLC" />

      <div style={{
        background: '#1a1a24', border: '1px solid #2a2a35', borderRadius: 10,
        padding: 14, fontSize: 11, color: '#666', lineHeight: 1.6,
      }}>
        Under penalties of perjury, I certify that the number shown on this form is my correct taxpayer identification number,
        and I am not subject to backup withholding. (W-9 Certification, IRS Form W-9)
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="checkbox" checked={form.w9Certified}
          onChange={e => updateForm('w9Certified', e.target.checked)}
          style={{ width: 18, height: 18, accentColor: '#f0a500', cursor: 'pointer' }} />
        <label style={{ fontSize: 13, color: '#c8c8d0', cursor: 'pointer' }}
          onClick={() => updateForm('w9Certified', !form.w9Certified)}>
          I certify the information provided is correct (W-9 certification)
        </label>
      </div>
    </div>
  )
}

function DirectDepositStep({ form, updateForm }) {
  const fieldsDisabled = form.depositLater

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        background: '#1a1a24', border: '1px solid #2a2a35', borderRadius: 10,
        padding: 14, fontSize: 12, color: '#8a8a9a', lineHeight: 1.6,
      }}>
        Settlement payments will be deposited to this account.
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input type="checkbox" checked={form.depositLater}
          onChange={e => updateForm('depositLater', e.target.checked)}
          style={{ width: 18, height: 18, accentColor: '#f0a500', cursor: 'pointer' }} />
        <label style={{ fontSize: 13, color: '#c8c8d0', cursor: 'pointer' }}
          onClick={() => updateForm('depositLater', !form.depositLater)}>
          I'll provide this later
        </label>
      </div>

      <Field label="Bank Name" required={!fieldsDisabled} value={form.bankName}
        onChange={v => updateForm('bankName', v)} placeholder="Chase Bank" />
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Routing Number{!fieldsDisabled && ' *'}</label>
          <input type="text" value={form.routingNumber}
            onChange={e => updateForm('routingNumber', e.target.value.replace(/\D/g, '').slice(0, 9))}
            placeholder="9 digits" maxLength={9} style={inputStyle} />
        </div>
        <Field label="Account Number" required={!fieldsDisabled} value={form.accountNumber}
          onChange={v => updateForm('accountNumber', v.replace(/\D/g, ''))} placeholder="Account number" style={{ flex: 1 }} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Account Type{!fieldsDisabled && ' *'}</label>
          <select value={form.accountType} onChange={e => updateForm('accountType', e.target.value)} style={inputStyle}>
            <option value="">Select...</option>
            <option value="checking">Checking</option>
            <option value="savings">Savings</option>
          </select>
        </div>
        <Field label="Name on Account" required={!fieldsDisabled} value={form.nameOnAccount}
          onChange={v => updateForm('nameOnAccount', v)} placeholder="John Smith" style={{ flex: 1 }} />
      </div>
    </div>
  )
}

function DocumentUploadsStep({ form, updateForm }) {
  const docs = [
    { key: 'cdlFrontPhoto', label: 'CDL Photo (Front)', required: true },
    { key: 'cdlBackPhoto', label: 'CDL Photo (Back)', required: true },
    { key: 'medicalCard', label: 'Medical Card / DOT Physical', required: true },
    { key: 'proofOfInsurance', label: 'Proof of Insurance (if applicable)', required: false },
    { key: 'w9Form', label: 'W-9 Form (physical copy)', required: false },
  ]

  const handleFileChange = (key, e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      updateForm(key, { name: file.name, type: file.type, data: reader.result })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: '#1a1a24', border: '1px solid #2a2a35', borderRadius: 10,
        padding: 14, fontSize: 12, color: '#8a8a9a', lineHeight: 1.6,
      }}>
        Upload clear photos or scans of the required documents. Accepted formats: images and PDF.
      </div>

      {docs.map(({ key, label, required }) => (
        <div key={key} style={{
          border: '1px solid ' + (form[key] ? '#22c55e33' : '#2a2a35'),
          borderRadius: 10, padding: 14, background: form[key] ? '#0f1a14' : '#1a1a24',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: form[key] ? '#22c55e' : '#8a8a9a', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {label}{required && ' *'}
            </label>
            {form[key] && (
              <button onClick={() => updateForm(key, null)} style={{
                background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 11,
                fontFamily: "'DM Sans', sans-serif",
              }}>Remove</button>
            )}
          </div>

          {form[key] ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {form[key].type?.startsWith('image/') ? (
                <img src={form[key].data} alt={label} style={{
                  width: 60, height: 60, objectFit: 'cover', borderRadius: 6, border: '1px solid #2a2a35',
                }} />
              ) : (
                <div style={{
                  width: 60, height: 60, borderRadius: 6, background: '#16161e', border: '1px solid #2a2a35',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <FileText size={20} color="#8a8a9a" />
                </div>
              )}
              <span style={{ fontSize: 12, color: '#c8c8d0', wordBreak: 'break-all' }}>{form[key].name}</span>
              <Check size={16} color="#22c55e" style={{ marginLeft: 'auto', flexShrink: 0 }} />
            </div>
          ) : (
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              padding: '14px 16px', borderRadius: 8, border: '1px dashed #2a2a35',
              background: '#0e0e14', color: '#666', fontSize: 12, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}>
              <Upload size={14} /> Choose File
              <input type="file" accept="image/*,.pdf" onChange={e => handleFileChange(key, e)}
                style={{ display: 'none' }} />
            </label>
          )}
        </div>
      ))}
    </div>
  )
}

function ConsentStep({ form, updateForm }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{
        background: '#1a1a24', border: '1px solid #2a2a35', borderRadius: 10,
        padding: 16, maxHeight: 220, overflowY: 'auto', fontSize: 12, color: '#8a8a9a', lineHeight: 1.7,
      }}>
        <div style={{ fontWeight: 700, color: '#fff', marginBottom: 8, fontSize: 13 }}>
          DOT Drug & Alcohol Testing Consent
        </div>
        <p>Pursuant to 49 CFR Part 382 of the Federal Motor Carrier Safety Regulations, I hereby consent to pre-employment,
        random, post-accident, reasonable suspicion, return-to-duty, and follow-up testing for controlled substances
        and alcohol as a condition of employment.</p>
        <p style={{ marginTop: 10 }}>I understand that:</p>
        <ul style={{ paddingLeft: 18, margin: '8px 0' }}>
          <li>I am required to submit to drug and alcohol testing as mandated by FMCSA regulations.</li>
          <li>Refusal to submit to testing will be treated as a positive test result.</li>
          <li>A confirmed positive result may result in termination and reporting to the FMCSA Clearinghouse.</li>
          <li>I consent to the release of my test results to my employer and to the FMCSA Drug & Alcohol Clearinghouse per 49 CFR § 382.701.</li>
          <li>My employer will conduct a pre-employment query of the Clearinghouse to determine if any drug and alcohol violations exist.</li>
        </ul>

        <div style={{ fontWeight: 700, color: '#fff', marginBottom: 8, marginTop: 16, fontSize: 13 }}>
          FMCSA Clearinghouse Consent
        </div>
        <p>I authorize my employer to conduct both limited and full queries of the FMCSA Commercial Driver's License
        Drug and Alcohol Clearinghouse to determine whether drug or alcohol violation information about me exists
        in the Clearinghouse.</p>
        <p style={{ marginTop: 10 }}>I understand that if the limited query shows that information about me exists in the Clearinghouse,
        I will need to provide electronic consent through the Clearinghouse before my employer can obtain the full record.</p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          type="checkbox"
          checked={form.consentAgreed}
          onChange={e => updateForm('consentAgreed', e.target.checked)}
          style={{ width: 18, height: 18, accentColor: '#f0a500', cursor: 'pointer' }}
        />
        <label style={{ fontSize: 13, color: '#c8c8d0', cursor: 'pointer' }}
          onClick={() => updateForm('consentAgreed', !form.consentAgreed)}>
          I have read, understand, and agree to the above consent
        </label>
      </div>

      {form.consentAgreed && (
        <>
          <div>
            <label style={labelStyle}>Your Signature</label>
            <SignaturePad
              value={form.consentSignature}
              onChange={v => updateForm('consentSignature', v)}
            />
          </div>
          <Field label="Date" type="date" required
            value={form.consentDate || new Date().toISOString().split('T')[0]}
            onChange={v => updateForm('consentDate', v)}
          />
        </>
      )}
    </div>
  )
}

function EmergencyStep({ form, updateForm }) {
  const employers = form.employers || []
  const accidents = form.accidents || []
  const violations = form.violations || []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{
        background: '#1a1a24', border: '1px solid #2a2a35', borderRadius: 10,
        padding: 14, fontSize: 12, color: '#8a8a9a', lineHeight: 1.6,
      }}>
        Please provide an emergency contact who can be reached in case of an incident.
      </div>
      <Field label="Contact Name" required value={form.emergencyName} onChange={v => updateForm('emergencyName', v)} placeholder="Jane Smith" />
      <div style={{ display: 'flex', gap: 10 }}>
        <Field label="Phone" required type="tel" value={form.emergencyPhone} onChange={v => updateForm('emergencyPhone', v)} placeholder="(555) 987-6543" style={{ flex: 1 }} />
        <div style={{ flex: 1 }}>
          <label style={labelStyle}>Relationship *</label>
          <select value={form.emergencyRelationship} onChange={e => updateForm('emergencyRelationship', e.target.value)} style={inputStyle}>
            <option value="">Select...</option>
            <option value="Spouse">Spouse</option>
            <option value="Parent">Parent</option>
            <option value="Sibling">Sibling</option>
            <option value="Child">Child</option>
            <option value="Partner">Partner</option>
            <option value="Friend">Friend</option>
            <option value="Other">Other</option>
          </select>
        </div>
      </div>

      {/* Comprehensive Summary */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: '#f0a500', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
          Complete Submission Summary
        </div>
        <div style={{ background: '#1a1a24', border: '1px solid #2a2a35', borderRadius: 10, padding: 14, fontSize: 12 }}>
          {/* Personal Info */}
          <div style={{ fontSize: 10, color: '#f0a500', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 }}>Personal Info</div>
          <SummaryRow label="Name" value={form.fullName} />
          <SummaryRow label="DOB" value={form.dob} />
          <SummaryRow label="Phone" value={form.phone} />
          <SummaryRow label="Address" value={[form.address, form.city, form.state, form.zip].filter(Boolean).join(', ')} />

          {/* CDL */}
          <div style={{ fontSize: 10, color: '#f0a500', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>CDL & Qualifications</div>
          <SummaryRow label="CDL" value={`${form.cdlNumber} (${form.cdlState}) Class ${form.cdlClass}`} />
          <SummaryRow label="CDL Expiry" value={form.cdlExpiry} />
          <SummaryRow label="Medical Expiry" value={form.medicalExpiry} />
          <SummaryRow label="Experience" value={form.yearsExperience ? `${form.yearsExperience} years` : '—'} />
          <SummaryRow label="Endorsements" value={(form.cdlEndorsements || []).join(', ') || '—'} />
          <SummaryRow label="Equipment" value={(form.equipmentExp || []).join(', ') || '—'} />

          {/* Employment */}
          <div style={{ fontSize: 10, color: '#f0a500', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>Employment History</div>
          {employers.length > 0 ? employers.map((emp, i) => (
            <SummaryRow key={i} label={`Employer ${i + 1}`} value={`${emp.companyName || '—'} (${emp.dateFrom || '?'} to ${emp.dateTo || '?'})`} />
          )) : <SummaryRow label="Employers" value="—" />}

          {/* MVR & Background */}
          <div style={{ fontSize: 10, color: '#f0a500', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>MVR & Background</div>
          <SummaryRow label="Accidents (3yr)" value={form.hasAccidents === 'yes' ? `${accidents.length} reported` : 'None'} />
          <SummaryRow label="Violations (3yr)" value={form.hasViolations === 'yes' ? `${violations.length} reported` : 'None'} />
          <SummaryRow label="Background Auth" value={form.backgroundAuthConsent ? 'Authorized' : 'Not authorized'} color={form.backgroundAuthConsent ? '#22c55e' : '#ef4444'} />

          {/* W-9 */}
          <div style={{ fontSize: 10, color: '#f0a500', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>W-9 / Tax Info</div>
          <SummaryRow label="SSN" value={form.ssn ? `***-**-${form.ssn.slice(-4)}` : '—'} />
          <SummaryRow label="Tax Classification" value={form.taxClassification || '—'} />
          <SummaryRow label="Legal Name" value={form.taxLegalName || '—'} />
          <SummaryRow label="W-9 Certified" value={form.w9Certified ? 'Yes' : 'No'} color={form.w9Certified ? '#22c55e' : '#ef4444'} />

          {/* Direct Deposit */}
          <div style={{ fontSize: 10, color: '#f0a500', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>Direct Deposit</div>
          {form.depositLater ? (
            <SummaryRow label="Status" value="Will provide later" color="#f0a500" />
          ) : (
            <>
              <SummaryRow label="Bank" value={form.bankName || '—'} />
              <SummaryRow label="Routing #" value={form.routingNumber || '—'} />
              <SummaryRow label="Account Type" value={form.accountType || '—'} />
              <SummaryRow label="Name on Account" value={form.nameOnAccount || '—'} />
            </>
          )}

          {/* Documents */}
          <div style={{ fontSize: 10, color: '#f0a500', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>Documents</div>
          <SummaryRow label="CDL Front" value={form.cdlFrontPhoto ? form.cdlFrontPhoto.name : '—'} color={form.cdlFrontPhoto ? '#22c55e' : '#ef4444'} />
          <SummaryRow label="CDL Back" value={form.cdlBackPhoto ? form.cdlBackPhoto.name : '—'} color={form.cdlBackPhoto ? '#22c55e' : '#ef4444'} />
          <SummaryRow label="Medical Card" value={form.medicalCard ? form.medicalCard.name : '—'} color={form.medicalCard ? '#22c55e' : '#ef4444'} />
          <SummaryRow label="Proof of Insurance" value={form.proofOfInsurance ? form.proofOfInsurance.name : '—'} />
          <SummaryRow label="W-9 Form" value={form.w9Form ? form.w9Form.name : '—'} />

          {/* Consent */}
          <div style={{ fontSize: 10, color: '#f0a500', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>Drug & Alcohol Consent</div>
          <SummaryRow label="Consent" value={form.consentAgreed ? 'Agreed & Signed' : 'Not signed'} color={form.consentAgreed ? '#22c55e' : '#ef4444'} />

          {/* Emergency */}
          <div style={{ fontSize: 10, color: '#f0a500', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginTop: 14, marginBottom: 6 }}>Emergency Contact</div>
          <SummaryRow label="Contact" value={form.emergencyName ? `${form.emergencyName} (${form.emergencyRelationship})` : '—'} />
          <SummaryRow label="Phone" value={form.emergencyPhone || '—'} />
        </div>
      </div>
    </div>
  )
}

// ── Signature Pad ──

function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null)
  const [drawing, setDrawing] = useState(false)
  const [hasDrawn, setHasDrawn] = useState(!!value)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    canvas.width = canvas.offsetWidth * 2
    canvas.height = canvas.offsetHeight * 2
    ctx.scale(2, 2)
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.strokeStyle = '#f0a500'

    if (value) {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.offsetWidth, canvas.offsetHeight)
      }
      img.src = value
    }
  }, [])

  const getPos = (e) => {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const touch = e.touches?.[0]
    const clientX = touch ? touch.clientX : e.clientX
    const clientY = touch ? touch.clientY : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const startDraw = (e) => {
    e.preventDefault()
    setDrawing(true)
    setHasDrawn(true)
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(pos.x, pos.y)
  }

  const draw = (e) => {
    if (!drawing) return
    e.preventDefault()
    const ctx = canvasRef.current.getContext('2d')
    const pos = getPos(e)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
  }

  const endDraw = () => {
    if (!drawing) return
    setDrawing(false)
    const dataUrl = canvasRef.current.toDataURL('image/png')
    onChange(dataUrl)
  }

  const clear = () => {
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
    onChange(null)
  }

  return (
    <div>
      <div style={{
        border: '1px solid ' + (hasDrawn ? '#f0a500' : '#2a2a35'),
        borderRadius: 10, overflow: 'hidden', position: 'relative', background: '#0e0e14',
      }}>
        <canvas
          ref={canvasRef}
          style={{ width: '100%', height: 120, display: 'block', cursor: 'crosshair', touchAction: 'none' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
        {!hasDrawn && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', color: '#444', fontSize: 13, gap: 6,
          }}>
            <Pen size={14} /> Draw your signature here
          </div>
        )}
      </div>
      {hasDrawn && (
        <button onClick={clear} style={{
          marginTop: 6, padding: '4px 12px', borderRadius: 6, border: '1px solid #2a2a35',
          background: 'transparent', color: '#8a8a9a', fontSize: 11, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif",
        }}>Clear Signature</button>
      )}
    </div>
  )
}

// ── Shared Components ──

function Field({ label, required, type = 'text', value, onChange, placeholder, style }) {
  return (
    <div style={style}>
      <label style={labelStyle}>{label}{required && ' *'}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  )
}

function SummaryRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #1e1e28' }}>
      <span style={{ color: '#666' }}>{label}</span>
      <span style={{ color: color || '#c8c8d0', fontWeight: 600, textAlign: 'right', maxWidth: '60%' }}>{value || '—'}</span>
    </div>
  )
}

function PageShell({ children }) {
  return (
    <div style={{
      minHeight: '100vh', background: '#0c0c12',
      color: '#c8c8d0', fontFamily: "'DM Sans', sans-serif",
    }}>
      {children}
    </div>
  )
}

function Loader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: 12 }}>
      <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: 3, color: '#fff', fontFamily: "'Bebas Neue', sans-serif" }}>
        QI<span style={{ color: '#f0a500' }}>VORI</span>
      </span>
      <div style={{ width: 40, height: 3, background: '#2a2a35', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: '50%', height: '100%', background: '#f0a500', borderRadius: 2, animation: 'lbar 1s ease-in-out infinite alternate' }} />
      </div>
      <style>{`@keyframes lbar { from { transform: translateX(-100%); } to { transform: translateX(100%); } }`}</style>
    </div>
  )
}

function ErrorCard({ message }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <AlertCircle size={40} color="#ef4444" style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 8 }}>Invitation Error</div>
        <div style={{ fontSize: 13, color: '#8a8a9a', marginBottom: 20 }}>{message}</div>
        <a href="https://qivori.com" style={{
          display: 'inline-block', padding: '10px 24px', borderRadius: 8,
          background: '#f0a500', color: '#000', fontWeight: 700, fontSize: 13, textDecoration: 'none',
        }}>Go to Qivori</a>
      </div>
    </div>
  )
}

function SuccessCard({ companyName }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: 20 }}>
      <div style={{ textAlign: 'center', maxWidth: 420 }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.15)',
          border: '2px solid rgba(34,197,94,0.3)', display: 'flex', alignItems: 'center',
          justifyContent: 'center', margin: '0 auto 16px',
        }}>
          <Check size={28} color="#22c55e" />
        </div>
        <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginBottom: 8 }}>You're All Set!</div>
        <div style={{ fontSize: 14, color: '#8a8a9a', lineHeight: 1.6, marginBottom: 24 }}>
          Your onboarding documents have been submitted to {companyName || 'your company'}.
          They'll review everything and get you on the road.
        </div>
        <div style={{
          background: '#16161e', border: '1px solid #2a2a35', borderRadius: 12,
          padding: 16, fontSize: 12, color: '#8a8a9a', lineHeight: 1.6,
        }}>
          <strong style={{ color: '#f0a500' }}>What happens next?</strong><br />
          Your carrier will verify your CDL and run the required Clearinghouse query.
          You may receive a separate email from the FMCSA Clearinghouse to provide electronic consent for the full query.
        </div>
      </div>
    </div>
  )
}

// ── Validation ──

function validateStep(step, form) {
  switch (step) {
    case 0: return form.profilePhoto && form.fullName && form.dob && form.phone && form.address && form.city && form.state && form.zip
    case 1: return form.cdlNumber && form.cdlState && form.cdlExpiry && form.medicalExpiry
    case 2: {
      // Employment history: at least 1 employer with required fields
      const employers = form.employers || []
      return employers.length >= 1 && employers.every(e => e.companyName && e.dateFrom && e.dateTo)
    }
    case 3: return form.backgroundAuthConsent
    case 4: {
      // W-9: SSN (9 digits), tax classification, legal name, certification
      const ssnDigits = (form.ssn || '').replace(/\D/g, '')
      return ssnDigits.length === 9 && form.taxClassification && form.taxLegalName && form.w9Certified
    }
    case 5: {
      // Direct deposit: either "later" or all fields filled
      if (form.depositLater) return true
      return form.bankName && form.routingNumber?.length === 9 && form.accountNumber && form.accountType && form.nameOnAccount
    }
    case 6: {
      // Document uploads: required docs must be present
      return form.cdlFrontPhoto && form.cdlBackPhoto && form.medicalCard
    }
    case 7: return form.consentAgreed && form.consentSignature
    case 8: return form.emergencyName && form.emergencyPhone && form.emergencyRelationship
    default: return false
  }
}

// ── Styles ──

const labelStyle = {
  display: 'block', fontSize: 11, fontWeight: 700, color: '#8a8a9a',
  letterSpacing: 0.5, marginBottom: 5, textTransform: 'uppercase',
}

const inputStyle = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: '1px solid #2a2a35', background: '#0e0e14', color: '#fff',
  fontSize: 13, fontFamily: "'DM Sans', sans-serif", outline: 'none',
  boxSizing: 'border-box',
}
