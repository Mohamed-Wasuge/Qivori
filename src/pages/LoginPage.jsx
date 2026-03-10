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

        {/* Role tabs */}
        <div style={{ display: 'flex', gap: 6, background: 'var(--surface2)', borderRadius: 10, padding: 4, marginBottom: 24 }}>
          {['admin', 'broker', 'carrier'].map(role => (
            <button key={role} onClick={() => fillDemo(role)}
              style={{ flex: 1, padding: '8px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, background: selectedRole === role ? 'var(--surface3)' : 'transparent', border: selectedRole === role ? '1px solid var(--border)' : '1px solid transparent', color: selectedRole === role ? 'var(--text)' : 'var(--muted)', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <Ic icon={ROLE_ICONS[role]} size={12} /> {role.charAt(0).toUpperCase() + role.slice(1)}
            </button>
          ))}
        </div>

        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder={DEMO[selectedRole].email}
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

        {/* Demo hint */}
        <div style={{ background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>DEMO ACCOUNTS — click role tab to auto-fill</div>
          {Object.entries(DEMO).map(([role, creds]) => (
            <div key={role} style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>
              <span style={{ color: 'var(--text)', fontWeight: 600 }}>{role}:</span> {creds.email} / {creds.password}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8 }}>
          {['admin', 'broker', 'carrier'].map(role => (
            <button key={role} onClick={() => handleDemo(role)}
              style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 4px', fontSize: 11, color: 'var(--muted)', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif", fontWeight: 600, transition: 'all 0.15s' }}
              onMouseOver={e => e.currentTarget.style.color = 'var(--text)'}
              onMouseOut={e => e.currentTarget.style.color = 'var(--muted)'}>
              Demo {role.charAt(0).toUpperCase() + role.slice(1)}
            </button>
          ))}
        </div>

        <div style={{ textAlign: 'center', marginTop: 20, fontSize: 11, color: 'var(--muted)' }}>
          qivori.com · Secure login
        </div>
      </div>
    </div>
  )
}
