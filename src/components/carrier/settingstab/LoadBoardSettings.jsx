import React, { useState, useEffect } from 'react'
import {
  Globe, CheckCircle, ChevronLeft, Plus
} from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { apiFetch } from '../../../lib/api'
import { Ic } from '../shared'

// ── Load Board Connection Settings ────────────────────────────────────────────
export const LB_PROVIDERS = [
  {
    id: 'dat',
    name: 'DAT Load Board',
    desc: 'Premium freight marketplace — 500M+ loads/year. Requires DAT API partnership.',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Your DAT API Client ID' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your DAT API Client Secret' },
    ],
    color: '#22c55e',
    signupUrl: 'https://developer.dat.com',
  },
  {
    id: '123loadboard',
    name: '123Loadboard',
    desc: 'Affordable load board with API access — great for small fleets. $200-500/mo.',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Your 123Loadboard Client ID' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your 123Loadboard Client Secret' },
      { key: 'serviceUsername', label: 'Service Username', placeholder: 'Service account username' },
      { key: 'servicePassword', label: 'Service Password', placeholder: 'Service account password' },
    ],
    color: '#3b82f6',
    signupUrl: 'https://www.123loadboard.com',
  },
  {
    id: 'truckstop',
    name: 'Truckstop.com',
    desc: 'Full-service load board with rate intelligence and carrier tools.',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Your Truckstop Client ID' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your Truckstop Client Secret' },
    ],
    color: '#f0a500',
    signupUrl: 'https://truckstop.com',
  },
]

export function LoadBoardSettings() {
  const { showToast } = useApp()
  const [connections, setConnections] = useState({}) // { dat: { status, connected_at }, ... }
  const [credentials, setCredentials] = useState({}) // { dat: { clientId:'', clientSecret:'' }, ... }
  const [testing, setTesting] = useState(null) // provider being tested
  const [saving, setSaving] = useState(null) // provider being saved
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null) // which provider form is expanded

  // Fetch existing connections on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/load-board-credentials')
        if (res.ok) {
          const { credentials: creds } = await res.json()
          const connMap = {}
          for (const c of (creds || [])) {
            connMap[c.provider] = { status: c.status, connected_at: c.connected_at, last_tested: c.last_tested }
          }
          setConnections(connMap)
        }
      } catch { /* non-critical: load board credentials fetch failed */ }
      setLoading(false)
    })()
  }, [])

  const saveCredentials = async (provider) => {
    const creds = credentials[provider]
    if (!creds) return
    setSaving(provider)
    try {
      const res = await apiFetch('/api/load-board-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, credentials: creds }),
      })
      const data = await res.json()
      if (data.success) {
        setConnections(prev => ({ ...prev, [provider]: { status: data.status, connected_at: new Date().toISOString(), last_tested: new Date().toISOString() } }))
        showToast('success', data.status === 'connected' ? 'Connected!' : 'Saved', data.testResult?.message || `${provider} credentials saved`)
        if (data.status === 'connected') setExpanded(null)
      } else {
        showToast('error', 'Error', data.error || 'Failed to save')
      }
    } catch (err) {
      showToast('error', 'Error', err.message || 'Network error')
    }
    setSaving(null)
  }

  const testConnection = async (provider) => {
    const creds = credentials[provider]
    if (!creds) return
    setTesting(provider)
    try {
      const res = await apiFetch('/api/load-board-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, credentials: creds, action: 'test' }),
      })
      const data = await res.json()
      if (data.success) {
        setConnections(prev => ({ ...prev, [provider]: { ...prev[provider], status: 'connected', last_tested: new Date().toISOString() } }))
        showToast('success', 'Test Passed', data.message)
      } else {
        showToast('error', 'Test Failed', data.message)
      }
    } catch { /* non-critical error */
      showToast('error', 'Test Failed', 'Could not reach server')
    }
    setTesting(null)
  }

  const disconnect = async (provider) => {
    try {
      await apiFetch('/api/load-board-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, action: 'disconnect' }),
      })
      setConnections(prev => { const n = { ...prev }; delete n[provider]; return n })
      setCredentials(prev => { const n = { ...prev }; delete n[provider]; return n })
      showToast('success', 'Disconnected', `${provider} removed`)
    } catch { /* non-critical: disconnect request failed */ }
  }

  const connectedCount = Object.values(connections).filter(c => c.status === 'connected').length

  return (
    <>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>LOAD BOARD CONNECTIONS</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Connect your own load board accounts so Qivori AI can find loads for you automatically</div>
      </div>

      {/* Info banner */}
      <div style={{ background:'rgba(59,130,246,0.06)', border:'1px solid rgba(59,130,246,0.15)', borderRadius:10, padding:'14px 18px', fontSize:12, color:'var(--accent3)', lineHeight:1.6 }}>
        <strong>How it works:</strong> Enter your load board API credentials below. They're encrypted with AES-256 and stored securely — only used to search loads on your behalf. <strong>Your credentials are never shared with other users or exposed in the app.</strong>
      </div>

      {/* Connection status summary */}
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background: connectedCount > 0 ? '#22c55e' : '#6b7590' }} />
        <span style={{ fontSize:12, fontWeight:700 }}>
          {connectedCount > 0 ? `${connectedCount} load board${connectedCount > 1 ? 's' : ''} connected` : 'No load boards connected'}
        </span>
      </div>

      {/* Provider cards */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {LB_PROVIDERS.map(prov => {
          const conn = connections[prov.id]
          const isConnected = conn?.status === 'connected'
          const isExpanded = expanded === prov.id
          const creds = credentials[prov.id] || {}
          const isSaving = saving === prov.id
          const isTesting = testing === prov.id

          return (
            <div key={prov.id} style={{ background:'var(--surface)', border:`1px solid ${isConnected ? prov.color + '40' : 'var(--border)'}`, borderRadius:12, overflow:'hidden' }}>
              {/* Header row */}
              <div style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 20px', cursor:'pointer' }}
                onClick={() => setExpanded(isExpanded ? null : prov.id)}>
                <div style={{ width:44, height:44, borderRadius:10, background: isConnected ? prov.color + '15' : 'var(--surface2)', border:`1px solid ${isConnected ? prov.color + '30' : 'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Ic icon={Globe} size={22} color={isConnected ? prov.color : 'var(--muted)'} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:3 }}>
                    <span style={{ fontSize:14, fontWeight:700 }}>{prov.name}</span>
                    {isConnected ? (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background: prov.color + '15', color: prov.color, display:'flex', alignItems:'center', gap:3 }}>
                        <Ic icon={CheckCircle} size={10} /> Connected
                      </span>
                    ) : conn?.status === 'error' ? (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(239,68,68,0.1)', color:'#ef4444' }}>
                        Connection Error
                      </span>
                    ) : (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(107,117,144,0.1)', color:'var(--muted)' }}>
                        Not Connected
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{prov.desc}</div>
                </div>
                <Ic icon={isExpanded ? ChevronLeft : Plus} size={16} color="var(--muted)" style={{ transform: isExpanded ? 'rotate(-90deg)' : 'none', transition:'transform 0.2s' }} />
              </div>

              {/* Expanded credential form */}
              {isExpanded && (
                <div style={{ padding:'0 20px 20px', borderTop:'1px solid var(--border)' }}>
                  <div style={{ paddingTop:16, display:'flex', flexDirection:'column', gap:12 }}>
                    {prov.fields.map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                        <input
                          type="password"
                          value={creds[f.key] || ''}
                          onChange={e => setCredentials(prev => ({ ...prev, [prov.id]: { ...prev[prov.id], [f.key]: e.target.value } }))}
                          placeholder={f.placeholder}
                          style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', color:'var(--text)', fontSize:13, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }}
                        />
                      </div>
                    ))}
                    <div style={{ fontSize:10, color:'var(--muted)' }}>
                      Don't have an account? <a href={prov.signupUrl} target="_blank" rel="noopener noreferrer" style={{ color:'var(--accent3)', textDecoration:'none' }}>Sign up at {prov.signupUrl} {'\u2192'}</a>
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:4 }}>
                      <button className="btn btn-primary" style={{ fontSize:12, padding:'9px 20px' }}
                        disabled={isSaving || !prov.fields.every(f => creds[f.key])}
                        onClick={() => saveCredentials(prov.id)}>
                        {isSaving ? 'Saving...' : isConnected ? 'Update & Test' : 'Connect & Test'}
                      </button>
                      {isConnected && (
                        <>
                          <button className="btn btn-ghost" style={{ fontSize:12 }}
                            disabled={isTesting}
                            onClick={() => testConnection(prov.id)}>
                            {isTesting ? 'Testing...' : 'Test Connection'}
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize:12, color:'#ef4444' }}
                            onClick={() => disconnect(prov.id)}>
                            Disconnect
                          </button>
                        </>
                      )}
                    </div>
                    {conn?.last_tested && (
                      <div style={{ fontSize:10, color:'var(--muted)' }}>
                        Last tested: {new Date(conn.last_tested).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
