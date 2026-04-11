import { useState, useEffect, useMemo } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import { Search, MapPin, DollarSign, Truck, Filter, RefreshCw, ChevronRight, Zap } from 'lucide-react'
import { Ic, haptic, fmt$ } from './shared'
import { apiFetch } from '../../lib/api'

export default function MobileLoadBoard({ onNavigate }) {
  const { showToast } = useApp()
  const ctx = useCarrier()
  const [loads, setLoads] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    apiFetch('/api/load-board')
      .then(r => r.ok ? r.json() : { loads: [] })
      .then(d => { if (!cancelled) setLoads(d.loads || d.data || []) })
      .catch(() => { if (!cancelled) setLoads([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const filtered = useMemo(() => {
    let list = loads
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(l =>
        (l.origin || '').toLowerCase().includes(q) ||
        (l.destination || '').toLowerCase().includes(q) ||
        (l.broker || '').toLowerCase().includes(q)
      )
    }
    if (filter !== 'all') {
      list = list.filter(l => (l.equipment_type || '').toLowerCase() === filter)
    }
    return list
  }, [loads, search, filter])

  const refresh = () => {
    haptic('light')
    setLoading(true)
    apiFetch('/api/load-board')
      .then(r => r.ok ? r.json() : { loads: [] })
      .then(d => setLoads(d.loads || d.data || []))
      .catch(() => setLoads([]))
      .finally(() => setLoading(false))
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.2, margin: 0 }}>Find Loads</h2>
          <button onClick={refresh} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Ic icon={RefreshCw} size={14} color="var(--muted)" />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)' }}>Refresh</span>
          </button>
        </div>
        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 8 }}>
          <Ic icon={Search} size={14} color="var(--muted)" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text" placeholder="Search origin, destination, broker..."
            value={search} onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 32px', fontSize: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', outline: 'none', fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }}
          />
        </div>
        {/* Filters */}
        <div style={{ display: 'flex', gap: 6 }}>
          {['all', 'dry van', 'reefer', 'flatbed'].map(f => (
            <button key={f} onClick={() => { haptic('light'); setFilter(f) }}
              style={{ padding: '4px 10px', fontSize: 10, fontWeight: 700, borderRadius: 6, border: '1px solid var(--border)', background: filter === f ? 'var(--accent)' : 'var(--surface)', color: filter === f ? '#000' : 'var(--muted)', cursor: 'pointer', textTransform: 'capitalize' }}>
              {f === 'all' ? 'All' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Load list */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 16px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#000', fontWeight: 800 }}>Q</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Searching loads...</div>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
            <Ic icon={Truck} size={28} color="var(--muted)" style={{ margin: '0 auto 10px', opacity: 0.5 }} />
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>No loads found</div>
            <div style={{ fontSize: 10 }}>Try adjusting your search or filters</div>
          </div>
        ) : (
          filtered.map((load, i) => (
            <div key={load.id || i} style={{ padding: '12px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Ic icon={MapPin} size={11} color="var(--accent)" />
                    <span>{load.origin || 'Unknown'}</span>
                    <span style={{ color: 'var(--muted)', margin: '0 2px' }}>→</span>
                    <span>{load.destination || 'Unknown'}</span>
                  </div>
                  {load.broker && <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{load.broker}</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--success)' }}>{fmt$(load.rate || 0)}</div>
                  {load.miles > 0 && <div style={{ fontSize: 9, color: 'var(--muted)' }}>{fmt$(load.rate / load.miles)}/mi</div>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>
                {load.miles > 0 && <span>{Math.round(load.miles)} mi</span>}
                {load.equipment_type && <span>{load.equipment_type}</span>}
                {load.pickup_date && <span>{load.pickup_date}</span>}
                {load.weight && <span>{load.weight} lbs</span>}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
