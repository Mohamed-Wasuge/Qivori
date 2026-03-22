import { useState, useEffect, useRef, useCallback } from 'react'
import { User, CreditCard, Shield, Heart, Check, ChevronRight, ChevronLeft, AlertCircle, Pen } from 'lucide-react'

const STEPS = [
  { id: 'personal', label: 'Personal Info', icon: User },
  { id: 'cdl', label: 'CDL & Qualifications', icon: CreditCard },
  { id: 'consent', label: 'Drug & Alcohol Consent', icon: Shield },
  { id: 'emergency', label: 'Emergency Contact', icon: Heart },
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
    fullName: '', dob: '', phone: '', address: '', city: '', state: '', zip: '',
    cdlNumber: '', cdlState: '', cdlClass: 'A', cdlEndorsements: [],
    cdlExpiry: '', medicalExpiry: '', yearsExperience: '',
    equipmentExp: [],
    consentAgreed: false, consentSignature: null, consentDate: '',
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
          {step === 2 && <ConsentStep form={form} updateForm={updateForm} />}
          {step === 3 && <EmergencyStep form={form} updateForm={updateForm} />}
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

      {/* Summary */}
      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: 12, color: '#f0a500', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>
          Submission Summary
        </div>
        <div style={{ background: '#1a1a24', border: '1px solid #2a2a35', borderRadius: 10, padding: 14, fontSize: 12 }}>
          <SummaryRow label="Name" value={form.fullName} />
          <SummaryRow label="DOB" value={form.dob} />
          <SummaryRow label="Phone" value={form.phone} />
          <SummaryRow label="Address" value={[form.address, form.city, form.state, form.zip].filter(Boolean).join(', ')} />
          <SummaryRow label="CDL" value={`${form.cdlNumber} (${form.cdlState}) Class ${form.cdlClass}`} />
          <SummaryRow label="CDL Expiry" value={form.cdlExpiry} />
          <SummaryRow label="Medical Expiry" value={form.medicalExpiry} />
          <SummaryRow label="Drug Consent" value={form.consentAgreed ? 'Agreed & Signed' : 'Not signed'} color={form.consentAgreed ? '#22c55e' : '#ef4444'} />
          <SummaryRow label="Emergency" value={form.emergencyName ? `${form.emergencyName} (${form.emergencyRelationship})` : '—'} />
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
    case 0: return form.fullName && form.dob && form.phone && form.address && form.city && form.state && form.zip
    case 1: return form.cdlNumber && form.cdlState && form.cdlExpiry && form.medicalExpiry
    case 2: return form.consentAgreed && form.consentSignature
    case 3: return form.emergencyName && form.emergencyPhone && form.emergencyRelationship
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
