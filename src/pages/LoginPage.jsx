import { useState } from 'react'
import { useApp } from '../context/AppContext'
import { Zap, Building2, Truck, AlertTriangle } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const DEMO = {
  admin:   { email: 'admin@qivori.com',  password: 'admin123' },
  broker:  { email: 'sarah@elitelogistics.com',  password: 'broker2024' },
  carrier: { email: 'james@rjtransport.com',    password: 'freight2024' },
}

const ROLE_ICONS = { admin: Zap, broker: Building2, carrier: Truck }

export default function LoginPage() {
  const { login, loginWithCredentials } = useApp()
  const [selectedRole, setSelectedRole] = useState('carrier')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)

  const handleSignIn = () => {
    if (!email || !password) { setError('Please enter your email and password.'); return }
    setLoading(true)
    setError('')
    setTimeout(() => {          // simulate network delay
      const result = loginWithCredentials(email, password)
      if (result.error) setError(result.error)
      setLoading(false)
    }, 400)
  }

  const handleDemo = (role) => {
    setError('')
    login(role)
  }

  const fillDemo = (role) => {
    setSelectedRole(role)
    setEmail(DEMO[role].email)
    setPassword(DEMO[role].password)
    setError('')
  }

  return (
    <div id="view-login" style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      overflow: 'hidden'
    }}>
      {/* Background glows */}
      <div style={{ position: 'absolute', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,165,0,0.06) 0%, transparent 70%)', top: -100, left: -100, pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(77,142,240,0.05) 0%, transparent 70%)', bottom: -50, right: -50, pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 420, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, padding: '40px 24px', margin: '0 16px', position: 'relative', zIndex: 1, boxShadow: '0 40px 80px rgba(0,0,0,0.5)' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 36, letterSpacing: 4, textAlign: 'center', marginBottom: 4 }}>
          QI<span style={{ color: 'var(--accent)' }}>VORI</span>
          <span style={{ fontSize: 14, color: 'var(--accent2)', letterSpacing: 2, fontFamily: "'DM Sans', sans-serif", fontWeight: 600, marginLeft: 8 }}>AI</span>
        </div>
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--muted)', marginBottom: 28 }}>AI-Powered Freight Brokerage Platform</div>


        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="you@company.com"
            onKeyDown={e => e.key === 'Enter' && handleSignIn()} />
        </div>

        <div className="form-group" style={{ marginBottom: error ? 12 : 20 }}>
          <label className="form-label">Password</label>
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
          style={{ width: '100%', padding: '13px', fontSize: 14, marginBottom: 16, justifyContent: 'center', opacity: loading ? 0.7 : 1 }}>
          {loading ? 'Signing in…' : 'Sign In to Qivori AI →'}
        </button>

        <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>
          <a href="#" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>Forgot password?</a>
        </div>

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 11, color: 'var(--muted)' }}>
          qivori.com · Secure login
        </div>
      </div>
    </div>
  )
}
