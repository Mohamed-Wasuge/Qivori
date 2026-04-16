/**
 * AdminCarrierOnboarding — full carrier onboarding wizard for admin
 *
 * Lets an admin onboard a new carrier from the desktop dashboard:
 *  1. Search by MC# or DOT# → FMCSA lookup auto-fills company info
 *  2. Account info (email, password, full name) → admin creates the login
 *  3. Equipment + home base + plan → set carrier preferences
 *  4. Review → create user → show credentials to share with the carrier
 *
 * Use case: a real OO calls the admin and asks them to set up the account.
 * Admin enters their MC#, the wizard pulls everything from FMCSA, admin
 * fills in email/password, picks plan, hits Create. The carrier can log
 * in immediately with the credentials shown on the success screen.
 */
import { useState, useCallback } from 'react'
import {
  Search, Building2, User, Truck, Sparkles, Check, ArrowLeft, ArrowRight,
  CheckCircle, AlertCircle, Copy, Mail, X, Snowflake, Package, Briefcase, Bot
} from 'lucide-react'
import { apiFetch } from '../lib/api'
import { useApp } from '../context/AppContext'
import { PLAN_DISPLAY } from '../hooks/useSubscription'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const STEPS = ['lookup', 'account', 'preferences', 'review', 'done']

const EQUIPMENT_OPTIONS = [
  { id: 'Dry Van', label: 'Dry Van', icon: Truck, color: '#f0a500' },
  { id: 'Reefer',  label: 'Reefer',  icon: Snowflake, color: '#3b82f6' },
  { id: 'Flatbed', label: 'Flatbed', icon: Package, color: '#22c55e' },
]

const PLAN_ICONS = { tms_pro: Briefcase, ai_dispatch: Bot, autonomous_fleet: Sparkles }
const PLAN_OPTIONS = Object.entries(PLAN_DISPLAY).map(([id, p]) => ({
  id,
  label: p.name,
  price: `$${p.price}/mo first truck`,
  color: p.color,
  icon: PLAN_ICONS[id] || Sparkles,
}))

export default function AdminCarrierOnboarding({ onClose, onCreated }) {
  const { showToast } = useApp()
  const [step, setStep] = useState('lookup')
  const [searching, setSearching] = useState(false)
  const [creating, setCreating] = useState(false)

  // Form state
  const [searchMc, setSearchMc] = useState('')
  const [searchDot, setSearchDot] = useState('')
  const [carrier, setCarrier] = useState({
    legal_name: '',
    dba_name: '',
    mc_number: '',
    dot_number: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    power_units: 0,
    drivers: 0,
    safety_rating: '',
  })
  const [account, setAccount] = useState({
    email: '',
    password: '',
    full_name: '',
  })
  const [prefs, setPrefs] = useState({
    equipment: 'Dry Van',
    home_base_city: '',
    home_base_state: '',
    subscription_plan: 'autonomous_fleet',
  })
  const [createdUserId, setCreatedUserId] = useState(null)

  const handleLookup = useCallback(async () => {
    if (!searchMc && !searchDot) {
      showToast?.('error', 'Need MC or DOT', 'Enter at least one number')
      return
    }
    setSearching(true)
    try {
      // Existing /api/fmcsa-lookup uses GET with query params + auth
      const params = new URLSearchParams()
      if (searchDot) params.set('dot', searchDot)
      else if (searchMc) params.set('mc', searchMc)
      const res = await apiFetch(`/api/fmcsa-lookup?${params.toString()}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.carrier) {
        // Existing endpoint returns { carrier: { dotNumber, legalName, ... } }
        // Map the camelCase shape into the wizard's snake_case fields
        const c = data.carrier
        setCarrier({
          legal_name:  c.legalName || c.dbaName || '',
          dba_name:    c.dbaName || '',
          mc_number:   c.docketNumber ? String(c.docketNumber).replace(/^MC-?/i, '') : (searchMc || ''),
          dot_number:  c.dotNumber ? String(c.dotNumber) : (searchDot || ''),
          phone:       c.telephone || '',
          address:     c.phyStreet || c.physicalAddress || '',
          city:        c.phyCity || '',
          state:       c.phyState || '',
          zip:         c.phyZipcode || '',
          power_units: Number(c.totalPowerUnits || 0),
          drivers:     Number(c.totalDrivers || 0),
          safety_rating: c.safetyRating || '',
        })
        if (c.phyCity) setPrefs((p) => ({ ...p, home_base_city: c.phyCity, home_base_state: c.phyState || '' }))
        showToast?.('success', 'Found in FMCSA', c.legalName || c.dbaName || 'Carrier loaded')
        setStep('account')
      } else {
        // Not found — let admin fill manually
        setCarrier((c) => ({ ...c, mc_number: searchMc, dot_number: searchDot }))
        showToast?.('info', data.error || 'Not in FMCSA', 'Fill in details manually')
        setStep('account')
      }
    } catch (e) {
      // Network or other error — still let admin continue with manual entry
      setCarrier((c) => ({ ...c, mc_number: searchMc, dot_number: searchDot }))
      showToast?.('warning', 'Lookup failed', 'Continuing with manual entry')
      setStep('account')
    }
    setSearching(false)
  }, [searchMc, searchDot, showToast])

  const handleCreate = useCallback(async () => {
    if (!account.email || !account.password || !account.full_name) {
      showToast?.('error', 'Missing info', 'Fill email, password, and full name')
      return
    }
    setCreating(true)
    try {
      const res = await apiFetch('/api/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: account.email,
          password: account.password,
          full_name: account.full_name,
          company_name: carrier.legal_name || carrier.dba_name || null,
          role: 'carrier',
          mc_number: carrier.mc_number || null,
          dot_number: carrier.dot_number || null,
          phone: carrier.phone || null,
          address: carrier.address || null,
          city: carrier.city || null,
          state: carrier.state || null,
          zip: carrier.zip || null,
          equipment: prefs.equipment || null,
          home_base_city: prefs.home_base_city || null,
          home_base_state: prefs.home_base_state || null,
          subscription_plan: prefs.subscription_plan || 'autonomous_fleet',
        }),
      })
      const data = await res.json()
      if (data.id) {
        setCreatedUserId(data.id)
        setStep('done')
        onCreated?.(data)
      } else {
        showToast?.('error', 'Create failed', data.error || 'Try again')
      }
    } catch (e) {
      showToast?.('error', 'Create failed', e.message || 'Network error')
    }
    setCreating(false)
  }, [account, carrier, prefs, onCreated, showToast])

  const generatePassword = useCallback(() => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    let pwd = ''
    for (let i = 0; i < 10; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
    pwd += '!'
    setAccount((a) => ({ ...a, password: pwd }))
  }, [])

  const copyToClipboard = useCallback((text) => {
    navigator.clipboard?.writeText(text).then(() => {
      showToast?.('success', 'Copied', '')
    })
  }, [showToast])

  const stepIndex = STEPS.indexOf(step)

  return (
    <div style={OVERLAY}>
      <div style={MODAL}>
        {/* Header */}
        <div style={HEADER}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={Q_BADGE}>
              <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#f0a500', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                ONBOARD CARRIER
              </div>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 }}>
                {step === 'lookup'      && 'STEP 1 — SEARCH FMCSA'}
                {step === 'account'     && 'STEP 2 — ACCOUNT INFO'}
                {step === 'preferences' && 'STEP 3 — PREFERENCES'}
                {step === 'review'      && 'STEP 4 — REVIEW'}
                {step === 'done'        && 'CARRIER CREATED ✓'}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={CLOSE_BTN} aria-label="Close">
            <Ic icon={X} size={18} color="rgba(255,255,255,0.6)" />
          </button>
        </div>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 6, padding: '0 24px 16px' }}>
          {STEPS.slice(0, 4).map((s, i) => (
            <div key={s} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= stepIndex ? '#f0a500' : 'rgba(255,255,255,0.08)',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Body */}
        <div style={BODY}>
          {/* STEP 1 — LOOKUP */}
          {step === 'lookup' && (
            <div>
              <p style={SECTION_HELP}>
                Enter the carrier's MC number OR DOT number. We'll pull their company info from FMCSA SAFER automatically.
              </p>
              <Field label="MC Number" placeholder="123456" value={searchMc} onChange={setSearchMc} />
              <div style={{ textAlign: 'center', margin: '8px 0', fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: 1 }}>OR</div>
              <Field label="DOT Number" placeholder="2345678" value={searchDot} onChange={setSearchDot} />

              <button
                onClick={handleLookup}
                disabled={searching || (!searchMc && !searchDot)}
                style={{
                  ...PRIMARY_BTN,
                  width: '100%',
                  marginTop: 18,
                  opacity: searching || (!searchMc && !searchDot) ? 0.6 : 1,
                }}
              >
                <Ic icon={Search} size={18} color="#fff" />
                <span>{searching ? 'Searching FMCSA…' : 'LOOK UP CARRIER'}</span>
              </button>
            </div>
          )}

          {/* STEP 2 — ACCOUNT */}
          {step === 'account' && (
            <div>
              {/* Carrier card from FMCSA */}
              <div style={CARRIER_CARD}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <Building2 size={18} color="#f0a500" />
                  <div style={{ fontSize: 11, fontWeight: 800, color: '#f0a500', letterSpacing: 1.5 }}>FMCSA RECORD</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#fff', marginBottom: 6, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 }}>
                  {carrier.legal_name || 'NEW CARRIER'}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  {carrier.mc_number && <span>MC {carrier.mc_number}</span>}
                  {carrier.dot_number && <span>DOT {carrier.dot_number}</span>}
                  {carrier.power_units > 0 && <span>{carrier.power_units} truck{carrier.power_units !== 1 ? 's' : ''}</span>}
                </div>
                {carrier.address && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
                    {carrier.address}, {carrier.city}, {carrier.state} {carrier.zip}
                  </div>
                )}
              </div>

              <p style={SECTION_HELP}>
                Create the carrier's login credentials. They'll use these to access the app.
              </p>

              <Field label="Full Name" placeholder="John Smith" value={account.full_name} onChange={(v) => setAccount({ ...account, full_name: v })} />
              <Field label="Email" placeholder="john@trucking.com" value={account.email} onChange={(v) => setAccount({ ...account, email: v })} type="email" />
              <div style={{ position: 'relative' }}>
                <Field label="Password" placeholder="Min 8 characters" value={account.password} onChange={(v) => setAccount({ ...account, password: v })} />
                <button
                  onClick={generatePassword}
                  style={{
                    position: 'absolute', top: 24, right: 8,
                    padding: '6px 12px',
                    background: 'rgba(240,165,0,0.1)',
                    border: '1px solid rgba(240,165,0,0.3)',
                    borderRadius: 8,
                    fontSize: 10, fontWeight: 700,
                    color: '#f0a500',
                    cursor: 'pointer',
                  }}
                >
                  GENERATE
                </button>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button onClick={() => setStep('lookup')} style={SECONDARY_BTN}>
                  <ArrowLeft size={16} color="rgba(255,255,255,0.6)" />
                  <span>Back</span>
                </button>
                <button
                  onClick={() => setStep('preferences')}
                  disabled={!account.email || !account.password || !account.full_name}
                  style={{ ...PRIMARY_BTN, flex: 1, opacity: (!account.email || !account.password || !account.full_name) ? 0.5 : 1 }}
                >
                  <span>Continue</span>
                  <ArrowRight size={16} color="#fff" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3 — PREFERENCES */}
          {step === 'preferences' && (
            <div>
              <p style={SECTION_HELP}>
                Set the carrier's equipment, home base, and plan. These can be changed later from the carrier's settings.
              </p>

              <div style={INPUT_LABEL_STYLE}>EQUIPMENT</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
                {EQUIPMENT_OPTIONS.map((opt) => {
                  const selected = prefs.equipment === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setPrefs({ ...prefs, equipment: opt.id })}
                      style={{
                        flex: 1, padding: '14px 8px',
                        background: selected ? `${opt.color}15` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${selected ? opt.color : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: 12,
                        cursor: 'pointer',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                      }}
                    >
                      <Ic icon={opt.icon} size={20} color={selected ? opt.color : 'rgba(255,255,255,0.5)'} />
                      <span style={{ fontSize: 11, fontWeight: 700, color: selected ? opt.color : 'rgba(255,255,255,0.7)' }}>
                        {opt.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 2 }}>
                  <Field label="Home City" placeholder="Dallas" value={prefs.home_base_city} onChange={(v) => setPrefs({ ...prefs, home_base_city: v })} />
                </div>
                <div style={{ flex: 1 }}>
                  <Field label="State" placeholder="TX" value={prefs.home_base_state} onChange={(v) => setPrefs({ ...prefs, home_base_state: v.toUpperCase().slice(0, 2) })} />
                </div>
              </div>

              <div style={{ ...INPUT_LABEL_STYLE, marginTop: 14 }}>PLAN</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {PLAN_OPTIONS.map((opt) => {
                  const selected = prefs.subscription_plan === opt.id
                  return (
                    <button
                      key={opt.id}
                      onClick={() => setPrefs({ ...prefs, subscription_plan: opt.id })}
                      style={{
                        padding: '14px 16px',
                        background: selected ? `${opt.color}15` : 'rgba(255,255,255,0.04)',
                        border: `1px solid ${selected ? opt.color : 'rgba(255,255,255,0.08)'}`,
                        borderRadius: 12,
                        cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 12,
                        textAlign: 'left',
                      }}
                    >
                      <div style={{
                        width: 38, height: 38, borderRadius: 10,
                        background: `${opt.color}1f`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Ic icon={opt.icon} size={18} color={opt.color} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{opt.label}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{opt.price}</div>
                      </div>
                      {selected && <Check size={18} color={opt.color} />}
                    </button>
                  )
                })}
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button onClick={() => setStep('account')} style={SECONDARY_BTN}>
                  <ArrowLeft size={16} color="rgba(255,255,255,0.6)" />
                  <span>Back</span>
                </button>
                <button onClick={() => setStep('review')} style={{ ...PRIMARY_BTN, flex: 1 }}>
                  <span>Review</span>
                  <ArrowRight size={16} color="#fff" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4 — REVIEW */}
          {step === 'review' && (
            <div>
              <p style={SECTION_HELP}>
                Verify everything looks right, then create the account. The carrier can log in immediately.
              </p>

              <ReviewSection title="CARRIER" items={[
                ['Legal Name', carrier.legal_name || '—'],
                ['MC #', carrier.mc_number || '—'],
                ['DOT #', carrier.dot_number || '—'],
                ['Address', carrier.address ? `${carrier.address}, ${carrier.city}, ${carrier.state}` : '—'],
              ]} />

              <ReviewSection title="ACCOUNT" items={[
                ['Full Name', account.full_name],
                ['Email', account.email],
                ['Password', account.password],
              ]} />

              <ReviewSection title="PREFERENCES" items={[
                ['Equipment', prefs.equipment],
                ['Home Base', `${prefs.home_base_city}${prefs.home_base_state ? ', ' + prefs.home_base_state : ''}` || '—'],
                ['Plan', PLAN_OPTIONS.find(p => p.id === prefs.subscription_plan)?.label || prefs.subscription_plan],
              ]} />

              <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
                <button onClick={() => setStep('preferences')} style={SECONDARY_BTN}>
                  <ArrowLeft size={16} color="rgba(255,255,255,0.6)" />
                  <span>Back</span>
                </button>
                <button onClick={handleCreate} disabled={creating} style={{ ...PRIMARY_BTN, flex: 1, opacity: creating ? 0.7 : 1 }}>
                  <CheckCircle size={18} color="#fff" />
                  <span>{creating ? 'Creating…' : 'CREATE CARRIER'}</span>
                </button>
              </div>
            </div>
          )}

          {/* STEP 5 — DONE */}
          {step === 'done' && (
            <div style={{ textAlign: 'center' }}>
              <div style={{
                width: 80, height: 80, borderRadius: '50%',
                background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 18px',
                boxShadow: '0 0 60px rgba(34,197,94,0.4)',
              }}>
                <CheckCircle size={42} color="#fff" strokeWidth={2.6} />
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, marginBottom: 8 }}>
                CARRIER CREATED
              </div>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 24 }}>
                Share these credentials with the carrier:
              </p>

              <div style={{ ...CARRIER_CARD, textAlign: 'left', marginBottom: 14 }}>
                <CredRow label="Email" value={account.email} onCopy={() => copyToClipboard(account.email)} />
                <CredRow label="Password" value={account.password} onCopy={() => copyToClipboard(account.password)} />
                <CredRow label="Login URL" value="qivori.com" onCopy={() => copyToClipboard('https://qivori.com')} />
              </div>

              <button onClick={onClose} style={{ ...PRIMARY_BTN, width: '100%' }}>
                <span>Done</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ───── Sub-components ─────
function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={INPUT_LABEL_STYLE}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={INPUT_STYLE}
      />
    </div>
  )
}

function ReviewSection({ title, items }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={INPUT_LABEL_STYLE}>{title}</div>
      <div style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, padding: '12px 14px',
      }}>
        {items.map(([k, v], i) => (
          <div key={i} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '6px 0',
            borderBottom: i < items.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
          }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{k}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#fff', textAlign: 'right', maxWidth: '60%', wordBreak: 'break-word' }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function CredRow({ label, value, onCopy }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <div>
        <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{value}</div>
      </div>
      <button onClick={onCopy} style={{
        padding: '6px 10px',
        background: 'rgba(240,165,0,0.1)',
        border: '1px solid rgba(240,165,0,0.3)',
        borderRadius: 8,
        display: 'flex', alignItems: 'center', gap: 5,
        cursor: 'pointer',
      }}>
        <Copy size={12} color="#f0a500" />
        <span style={{ fontSize: 10, fontWeight: 700, color: '#f0a500' }}>COPY</span>
      </button>
    </div>
  )
}

// ───── Styles ─────
const OVERLAY = {
  position: 'fixed', inset: 0, zIndex: 9999,
  background: 'rgba(0,0,0,0.85)',
  backdropFilter: 'blur(12px)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: 20, fontFamily: "'DM Sans', sans-serif",
}

const MODAL = {
  width: '100%', maxWidth: 520,
  maxHeight: '92vh',
  background: 'linear-gradient(180deg, #0c0f17 0%, #07090e 100%)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 24,
  boxShadow: '0 20px 80px rgba(0,0,0,0.5)',
  display: 'flex', flexDirection: 'column',
  // Force dark theme tokens regardless of broader Qivori theme
  '--bg': '#07090e',
  '--text': '#ffffff',
  '--muted': 'rgba(255,255,255,0.5)',
  '--accent': '#f0a500',
}

const HEADER = {
  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
  padding: '20px 24px 14px',
}

const Q_BADGE = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 4px 16px rgba(240,165,0,0.35)',
}

const CLOSE_BTN = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(255,255,255,0.1)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  cursor: 'pointer',
}

const BODY = {
  flex: 1, overflowY: 'auto',
  padding: '12px 24px 24px',
  WebkitOverflowScrolling: 'touch',
}

const SECTION_HELP = {
  fontSize: 12, color: 'rgba(255,255,255,0.55)',
  lineHeight: 1.5, marginTop: 0, marginBottom: 16,
}

const INPUT_LABEL_STYLE = {
  display: 'block',
  fontSize: 10, fontWeight: 800,
  color: 'rgba(255,255,255,0.5)',
  letterSpacing: 1.2, textTransform: 'uppercase',
  marginBottom: 6,
}

const INPUT_STYLE = {
  width: '100%',
  padding: '12px 14px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: 10,
  fontSize: 14, fontWeight: 600,
  color: '#fff',
  fontFamily: "'DM Sans', sans-serif",
  outline: 'none',
  WebkitAppearance: 'none',
  boxSizing: 'border-box',
}

const CARRIER_CARD = {
  padding: '14px 16px',
  background: 'linear-gradient(135deg, rgba(240,165,0,0.06), rgba(245,158,11,0.02))',
  border: '1px solid rgba(240,165,0,0.2)',
  borderRadius: 14,
  marginBottom: 18,
}

const PRIMARY_BTN = {
  padding: '14px 20px',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  border: 'none', borderRadius: 12,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  fontSize: 13, fontWeight: 900, color: '#fff',
  letterSpacing: 0.5, fontFamily: "'DM Sans', sans-serif",
  cursor: 'pointer',
  boxShadow: '0 6px 20px rgba(240,165,0,0.35)',
}

const SECONDARY_BTN = {
  padding: '14px 16px',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 12,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)',
  fontFamily: "'DM Sans', sans-serif",
  cursor: 'pointer',
}
