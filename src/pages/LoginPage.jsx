import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { useTranslation, LanguageToggle } from '../lib/i18n'
import { trackSignup, trackLogin } from '../lib/analytics'
import { Zap, Building2, Truck, AlertTriangle, CheckCircle, ArrowLeft } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export default function LoginPage() {
  const { loginWithCredentials, signUp, resetPassword } = useApp()
  const { t } = useTranslation()
  const [mode, setMode] = useState('login') // 'login' | 'signup' | 'forgot' | 'confirm'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [selectedRole, setSelectedRole] = useState('carrier')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const ROLE_OPTIONS = [
    { id: 'carrier', icon: Truck, label: t('login.carrier'), sub: t('login.carrierSub') },
    { id: 'broker', icon: Building2, label: t('login.broker'), sub: t('login.brokerSub') },
  ]

  const handleSignIn = async () => {
    if (!email || !password) { setError(t('login.error.emailPassword')); return }
    setLoading(true)
    setError('')
    const result = await loginWithCredentials(email, password)
    if (result.error) setError(result.error)
    else trackLogin('email')
    setLoading(false)
  }

  const handleSignUp = async () => {
    if (!fullName || !email || !password) { setError(t('login.error.fillRequired')); return }
    if (password.length < 8) { setError(t('login.error.passwordMin')); return }
    setLoading(true)
    setError('')
    const result = await signUp(email, password, selectedRole, fullName, companyName)
    if (result.error) {
      setError(result.error)
    } else {
      trackSignup('email', selectedRole)
      if (result.needsConfirmation) {
        setMode('confirm')
      } else {
        setMessage(t('login.accountCreated'))
      }
    }
    setLoading(false)
  }

  const handleForgot = async () => {
    if (!email) { setError(t('login.error.enterEmail')); return }
    setLoading(true)
    setError('')
    const result = await resetPassword(email)
    if (result.error) {
      setError(result.error)
    } else {
      setMessage(t('login.error.resetSent') + email)
    }
    setLoading(false)
  }

  const resetForm = (newMode) => {
    setMode(newMode)
    setError('')
    setMessage('')
  }

  return (
    <div id="view-login" style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'auto'
    }}>
      {/* Background glows */}
      <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,165,0,0.06) 0%, transparent 70%)', top: -100, left: -100, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(77,142,240,0.05) 0%, transparent 70%)', bottom: -50, right: -50, pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '40px 24px', margin: '16px', position: 'relative', zIndex: 1, boxShadow: '0 40px 80px rgba(0,0,0,0.5)' }}>
        {/* Language toggle */}
        <div style={{ position: 'absolute', top: 16, right: 16 }}>
          <LanguageToggle />
        </div>

        {/* Logo */}
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, letterSpacing: 4, textAlign: 'center', marginBottom: 4 }}>
          QI<span style={{ color: 'var(--accent)' }}>VORI</span>
          <span style={{ fontSize: 14, color: 'var(--accent2)', letterSpacing: 2, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginLeft: 8 }}>AI</span>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginBottom: 28 }}>
          {mode === 'login' && t('login.signInToAccount')}
          {mode === 'signup' && t('login.createYourAccount')}
          {mode === 'forgot' && t('login.resetYourPassword')}
          {mode === 'confirm' && t('login.checkYourEmail')}
        </div>

        {/* -- Confirmation Screen -- */}
        {mode === 'confirm' && (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <Ic icon={CheckCircle} size={48} color="var(--success)" />
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 16, marginBottom: 8 }}>{t('login.verifyEmail')}</div>
            <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 24 }}>
              {t('login.verifyEmailDesc')} <strong style={{ color: 'var(--text)' }}>{email}</strong>{t('login.clickToActivate')}
            </div>
            <button className="btn btn-primary" onClick={() => resetForm('login')} style={{ width: '100%', padding: 13, fontSize: 14, justifyContent: 'center' }}>
              {t('login.backToSignIn')}
            </button>
          </div>
        )}

        {/* -- Login Form -- */}
        {mode === 'login' && (<>
          <div className="form-group">
            <label className="form-label">{t('login.emailAddress')}</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              onKeyDown={e => e.key === 'Enter' && handleSignIn()} />
          </div>

          <div className="form-group" style={{ marginBottom: error ? 12 : 20 }}>
            <label className="form-label">{t('login.password')}</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleSignIn()} />
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: 'var(--danger)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ic icon={AlertTriangle} size={14} /> {error}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleSignIn} disabled={loading}
            style={{ width: '100%', padding: 13, fontSize: 14, marginBottom: 16, justifyContent: 'center', opacity: loading ? 0.7 : 1 }}>
            {loading ? t('login.signingIn') : t('login.signInBtn')}
          </button>

          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); resetForm('forgot') }} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              {t('login.forgotPassword')}
            </a>
            <a href="#" onClick={(e) => { e.preventDefault(); resetForm('signup') }} style={{ color: 'var(--accent2)', textDecoration: 'none', fontWeight: 600 }}>
              {t('login.createAccount')}
            </a>
          </div>
        </>)}

        {/* -- Sign Up Form -- */}
        {mode === 'signup' && (<>
          <div className="form-group">
            <label className="form-label">{t('login.iAmA')}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {ROLE_OPTIONS.map(r => (
                <div key={r.id} onClick={() => setSelectedRole(r.id)} style={{
                  flex: 1, padding: '12px 10px', border: `1px solid ${selectedRole === r.id ? 'var(--accent)' : 'var(--border)'}`,
                  borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                  background: selectedRole === r.id ? 'rgba(240,165,0,0.06)' : 'var(--surface2)',
                  transition: 'all 0.2s'
                }}>
                  <Ic icon={r.icon} size={20} color={selectedRole === r.id ? 'var(--accent)' : 'var(--muted)'} />
                  <div style={{ fontSize: 12, fontWeight: 700, marginTop: 4 }}>{r.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{r.sub}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">{t('login.fullName')}</label>
            <input className="form-input" value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="John Smith" />
          </div>

          <div className="form-group">
            <label className="form-label">{t('login.companyName')}</label>
            <input className="form-input" value={companyName} onChange={e => setCompanyName(e.target.value)}
              placeholder="ABC Trucking LLC" />
          </div>

          <div className="form-group">
            <label className="form-label">{t('login.emailRequired')}</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com" />
          </div>

          <div className="form-group" style={{ marginBottom: error ? 12 : 20 }}>
            <label className="form-label">{t('login.passwordMin')}</label>
            <input className="form-input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleSignUp()} />
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: 'var(--danger)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ic icon={AlertTriangle} size={14} /> {error}
            </div>
          )}

          {message && (
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: 'var(--success)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ic icon={CheckCircle} size={14} /> {message}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleSignUp} disabled={loading}
            style={{ width: '100%', padding: 13, fontSize: 14, marginBottom: 16, justifyContent: 'center', opacity: loading ? 0.7 : 1 }}>
            {loading ? t('login.creatingAccount') : t('login.createAccountBtn')}
          </button>

          <div style={{ textAlign: 'center', fontSize: 12 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); resetForm('login') }} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              <Ic icon={ArrowLeft} size={12} /> {t('login.backToSignIn')}
            </a>
          </div>
        </>)}

        {/* -- Forgot Password Form -- */}
        {mode === 'forgot' && (<>
          <div className="form-group" style={{ marginBottom: error || message ? 12 : 20 }}>
            <label className="form-label">{t('login.emailAddress')}</label>
            <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@company.com"
              onKeyDown={e => e.key === 'Enter' && handleForgot()} />
          </div>

          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: 'var(--danger)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ic icon={AlertTriangle} size={14} /> {error}
            </div>
          )}

          {message && (
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: 8, padding: '9px 12px', fontSize: 12, color: 'var(--success)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ic icon={CheckCircle} size={14} /> {message}
            </div>
          )}

          <button className="btn btn-primary" onClick={handleForgot} disabled={loading}
            style={{ width: '100%', padding: 13, fontSize: 14, marginBottom: 16, justifyContent: 'center', opacity: loading ? 0.7 : 1 }}>
            {loading ? t('login.sending') : t('login.sendResetLink')}
          </button>

          <div style={{ textAlign: 'center', fontSize: 12 }}>
            <a href="#" onClick={(e) => { e.preventDefault(); resetForm('login') }} style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>
              <Ic icon={ArrowLeft} size={12} /> {t('login.backToSignIn')}
            </a>
          </div>
        </>)}

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--muted)' }}>
          {t('login.secureLogin')}
        </div>
      </div>
    </div>
  )
}
