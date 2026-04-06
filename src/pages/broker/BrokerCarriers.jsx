import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useApp } from '../../context/AppContext'
import { Search, Phone, Truck } from 'lucide-react'
import { Ic, panel } from './helpers'

export function BrokerCarriers() {
  const { showToast } = useApp()
  const [search, setSearch] = useState('')
  const [carriers, setCarriers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('profiles').select('*').eq('role', 'carrier').eq('status', 'active').order('created_at', { ascending: false })
      setCarriers(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  const filtered = carriers.filter(c => {
    if (!search) return true
    const q = search.toLowerCase()
    return (c.full_name || '').toLowerCase().includes(q) ||
      (c.company_name || '').toLowerCase().includes(q) ||
      (c.mc_number || '').toLowerCase().includes(q) ||
      (c.city || '').toLowerCase().includes(q) ||
      (c.state || '').toLowerCase().includes(q) ||
      (c.equipment_type || '').toLowerCase().includes(q)
  })

  const getInitials = (name) => {
    if (!name) return 'CR'
    return name.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2)
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading carriers...</div>

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, letterSpacing: 2 }}>FIND CARRIERS</div>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{carriers.length} active carriers</span>
      </div>

      <div style={{ position: 'relative' }}>
        <Ic icon={Search} size={14} style={{ position: 'absolute', left: 12, top: 11, color: 'var(--muted)' }} />
        <input className="form-input" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, company, MC#, location, or equipment..."
          style={{ paddingLeft: 34, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>
          <Ic icon={Truck} size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>{carriers.length === 0 ? 'No carriers on the platform yet' : 'No carriers match your search'}</div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
          {filtered.map(c => (
            <div key={c.id} style={{ ...panel, padding: 18 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: 'var(--success)' }}>{getInitials(c.full_name)}</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{c.full_name || 'Unknown'}</div>
                  {c.company_name && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{c.company_name}</div>}
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {[c.mc_number, c.dot_number].filter(Boolean).join(' · ') || 'No MC/DOT'}
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Location</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{[c.city, c.state].filter(Boolean).join(', ') || '—'}</div>
                </div>
                <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 2 }}>Equipment</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{c.equipment_type || '—'}</div>
                </div>
              </div>

              {c.phone && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, fontSize: 12, color: 'var(--muted)' }}>
                  <Ic icon={Phone} size={12} /> {c.phone}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" style={{ flex: 1, padding: '9px 0', fontSize: 12, justifyContent: 'center' }}
                  onClick={() => showToast('', 'Request Sent', `Booking request sent to ${c.full_name}`)}>
                  Book Direct
                </button>
                <button className="btn btn-ghost" style={{ padding: '9px 12px', fontSize: 12 }}
                  onClick={() => showToast('', c.full_name, `${c.email || '—'} · ${c.phone || '—'}`)}>
                  <Ic icon={Phone} size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
