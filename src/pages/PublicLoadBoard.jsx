import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, MapPin, Truck, Calendar, Filter, ChevronDown, ChevronLeft, ChevronRight, Lock, ArrowRight, Star, Shield, Zap, Eye, X } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const EQUIPMENT_TYPES = ['All', 'Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Power Only', 'Tanker']
const US_STATES = [
  '', 'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY'
]

export default function PublicLoadBoard({ onSignUp, onLogin }) {
  const [loads, setLoads] = useState([])
  const [loading, setLoading] = useState(true)
  const [totalLoads, setTotalLoads] = useState(0)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [mobileFilters, setMobileFilters] = useState(false)

  // Filters
  const [originState, setOriginState] = useState('')
  const [destState, setDestState] = useState('')
  const [equipment, setEquipment] = useState('All')
  const [minMiles, setMinMiles] = useState('')
  const [maxMiles, setMaxMiles] = useState('')

  const fetchLoads = useCallback(async (pg = 1) => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (originState) params.set('origin_state', originState)
      if (destState) params.set('dest_state', destState)
      if (equipment && equipment !== 'All') params.set('equipment', equipment)
      if (minMiles) params.set('min_miles', minMiles)
      if (maxMiles) params.set('max_miles', maxMiles)
      params.set('page', String(pg))

      const res = await fetch(`/api/public-loads?${params}`)
      const data = await res.json()
      setLoads(data.loads || [])
      setTotalLoads(data.total || 0)
      setHasMore(data.hasMore || false)
      setPage(pg)
    } catch {
      setLoads([])
    }
    setLoading(false)
  }, [originState, destState, equipment, minMiles, maxMiles])

  useEffect(() => {
    fetchLoads(1)
  }, [fetchLoads])

  const handleSearch = (e) => {
    e.preventDefault()
    fetchLoads(1)
  }

  const formatDate = (d) => {
    if (!d) return '--'
    try {
      return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    } catch { return '--' }
  }

  const formatTimeAgo = (d) => {
    if (!d) return ''
    const mins = Math.floor((Date.now() - new Date(d).getTime()) / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    return `${Math.floor(hrs / 24)}d ago`
  }

  const scoreColor = (s) => {
    if (s >= 80) return '#22c55e'
    if (s >= 60) return '#f0a500'
    return '#ef4444'
  }

  return (
    <div style={{ background: '#0a0a0e', color: '#c8d0dc', fontFamily: "'DM Sans', sans-serif", minHeight: '100dvh', display: 'flex', flexDirection: 'column' }}>

      {/* SEO meta — set via document head */}
      <MetaTags />

      {/* ── HEADER ──────────────────────────────────────────────────── */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(7,9,14,0.9)', borderBottom: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', padding: '0 24px', height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <a href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 2 }}>
          <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 24, letterSpacing: 4, color: '#c8d0dc' }}>
            QI<span style={{ color: '#f0a500' }}>VORI</span>
          </span>
          <span style={{ fontSize: 10, color: '#00d4aa', letterSpacing: 1, fontFamily: "'DM Sans', sans-serif", fontWeight: 800, marginLeft: 6, padding: '2px 6px', background: 'rgba(0,212,170,0.1)', borderRadius: 4 }}>AI</span>
        </a>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onLogin}
            className="plb-btn-ghost"
            style={{ background: 'none', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: '8px 18px', color: '#c8d0dc', fontSize: 13, cursor: 'pointer', fontWeight: 600, transition: 'all 0.2s' }}>
            Login
          </button>
          <button onClick={onSignUp}
            style={{ background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', borderRadius: 10, padding: '9px 22px', color: '#000', fontSize: 13, cursor: 'pointer', fontWeight: 700, boxShadow: '0 4px 16px rgba(240,165,0,0.3)', transition: 'all 0.2s' }}>
            Sign Up Free
          </button>
        </div>
      </header>

      {/* ── HERO / SEARCH ───────────────────────────────────────────── */}
      <section style={{ padding: '48px 24px 32px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '-40%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(240,165,0,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />

        <h1 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 48, letterSpacing: 3, marginBottom: 12, lineHeight: 1.1 }}>
          Find <span style={{ color: '#f0a500' }}>Freight Loads</span> Nationwide
        </h1>
        <p style={{ fontSize: 16, color: '#8891a5', maxWidth: 560, margin: '0 auto 32px', lineHeight: 1.6 }}>
          Search thousands of available loads from top freight brokers. AI-scored for profitability.
          Sign up to see full rates, broker details, and book instantly.
        </p>

        {/* Search bar */}
        <form onSubmit={handleSearch} className="plb-search-form" style={{ maxWidth: 800, margin: '0 auto', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 140 }}>
            <Ic icon={MapPin} size={14} color="#f0a500" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <select value={originState} onChange={e => setOriginState(e.target.value)}
              style={selectStyle}>
              <option value="">Origin State</option>
              {US_STATES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ position: 'relative', flex: '1 1 160px', minWidth: 140 }}>
            <Ic icon={MapPin} size={14} color="#00d4aa" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <select value={destState} onChange={e => setDestState(e.target.value)}
              style={selectStyle}>
              <option value="">Destination State</option>
              {US_STATES.filter(Boolean).map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div style={{ position: 'relative', flex: '1 1 140px', minWidth: 130 }}>
            <Ic icon={Truck} size={14} color="#8891a5" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
            <select value={equipment} onChange={e => setEquipment(e.target.value)}
              style={selectStyle}>
              {EQUIPMENT_TYPES.map(e => <option key={e} value={e}>{e}</option>)}
            </select>
          </div>

          <button type="submit"
            style={{ padding: '12px 28px', background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', borderRadius: 12, color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap' }}>
            <Ic icon={Search} size={16} color="#000" />
            Search Loads
          </button>

          <button type="button" onClick={() => setMobileFilters(!mobileFilters)}
            className="plb-filter-toggle"
            style={{ padding: '12px 16px', background: '#16161e', border: '1px solid #2a2a3a', borderRadius: 12, color: '#8891a5', fontSize: 13, cursor: 'pointer', display: 'none', alignItems: 'center', gap: 6 }}>
            <Ic icon={Filter} size={14} /> Filters
          </button>
        </form>

        {/* Load count badge */}
        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px rgba(34,197,94,0.4)' }} />
          <span style={{ fontSize: 14, color: '#8891a5' }}>
            <strong style={{ color: '#f0a500' }}>{totalLoads > 0 ? `${totalLoads.toLocaleString()}` : '2,847'}</strong> loads available today
          </span>
        </div>
      </section>

      {/* ── MAIN CONTENT ────────────────────────────────────────────── */}
      <div className="plb-main" style={{ flex: 1, display: 'flex', maxWidth: 1200, margin: '0 auto', width: '100%', padding: '0 24px 60px', gap: 24 }}>

        {/* Sidebar Filters (desktop) */}
        <aside className="plb-sidebar" style={{ width: 240, flexShrink: 0, position: 'sticky', top: 80, alignSelf: 'flex-start' }}>
          <div style={{ background: '#16161e', border: '1px solid #2a2a3a', borderRadius: 16, padding: 20 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#c8d0dc', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Ic icon={Filter} size={14} color="#f0a500" /> Filters
            </div>

            <FilterGroup label="Equipment Type">
              {EQUIPMENT_TYPES.map(e => (
                <label key={e} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#8891a5', cursor: 'pointer', padding: '4px 0' }}>
                  <input type="radio" name="equipment" checked={equipment === e} onChange={() => { setEquipment(e); fetchLoads(1) }}
                    style={{ accentColor: '#f0a500' }} />
                  {e}
                </label>
              ))}
            </FilterGroup>

            <FilterGroup label="Miles Range">
              <div style={{ display: 'flex', gap: 8 }}>
                <input placeholder="Min" value={minMiles} onChange={e => setMinMiles(e.target.value.replace(/\D/g, ''))}
                  style={filterInputStyle} />
                <input placeholder="Max" value={maxMiles} onChange={e => setMaxMiles(e.target.value.replace(/\D/g, ''))}
                  style={filterInputStyle} />
              </div>
              <button onClick={() => fetchLoads(1)}
                style={{ marginTop: 8, width: '100%', padding: '8px', background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 8, color: '#f0a500', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                Apply
              </button>
            </FilterGroup>

            {/* CTA in sidebar */}
            <div style={{ marginTop: 20, padding: 16, background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 12, textAlign: 'center' }}>
              <Ic icon={Zap} size={18} color="#f0a500" />
              <div style={{ fontSize: 12, fontWeight: 700, color: '#c8d0dc', marginTop: 8, marginBottom: 4 }}>Unlock Full Details</div>
              <div style={{ fontSize: 11, color: '#8891a5', marginBottom: 12, lineHeight: 1.5 }}>See rates, broker info & book loads with AI scoring</div>
              <button onClick={onSignUp}
                style={{ width: '100%', padding: '10px', background: '#f0a500', border: 'none', borderRadius: 8, color: '#000', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                Sign Up Free
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile Filters Drawer */}
        {mobileFilters && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
            onClick={(e) => { if (e.target === e.currentTarget) setMobileFilters(false) }}>
            <div style={{ width: 300, maxWidth: '85vw', background: '#16161e', height: '100%', overflowY: 'auto', padding: 24, borderLeft: '1px solid #2a2a3a' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Filters</span>
                <button onClick={() => setMobileFilters(false)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                  <Ic icon={X} size={18} color="#8891a5" />
                </button>
              </div>
              <FilterGroup label="Equipment Type">
                {EQUIPMENT_TYPES.map(e => (
                  <label key={e} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#8891a5', cursor: 'pointer', padding: '6px 0' }}>
                    <input type="radio" name="mob-equipment" checked={equipment === e} onChange={() => setEquipment(e)}
                      style={{ accentColor: '#f0a500' }} />
                    {e}
                  </label>
                ))}
              </FilterGroup>
              <FilterGroup label="Miles Range">
                <div style={{ display: 'flex', gap: 8 }}>
                  <input placeholder="Min" value={minMiles} onChange={e => setMinMiles(e.target.value.replace(/\D/g, ''))}
                    style={filterInputStyle} />
                  <input placeholder="Max" value={maxMiles} onChange={e => setMaxMiles(e.target.value.replace(/\D/g, ''))}
                    style={filterInputStyle} />
                </div>
              </FilterGroup>
              <button onClick={() => { fetchLoads(1); setMobileFilters(false) }}
                style={{ marginTop: 16, width: '100%', padding: '12px', background: '#f0a500', border: 'none', borderRadius: 10, color: '#000', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                Apply Filters
              </button>
            </div>
          </div>
        )}

        {/* Load Results */}
        <main style={{ flex: 1, minWidth: 0 }}>
          {/* Results header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 13, color: '#8891a5' }}>
              Showing <strong style={{ color: '#c8d0dc' }}>{loads.length}</strong> loads
              {(originState || destState || equipment !== 'All') && (
                <span> &middot; Filtered</span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ic icon={Shield} size={12} color="#22c55e" />
              <span style={{ fontSize: 11, color: '#6b7590' }}>AI-scored for profitability</span>
            </div>
          </div>

          {/* Loading state */}
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[1,2,3,4,5].map(i => (
                <div key={i} style={{ background: '#16161e', border: '1px solid #2a2a3a', borderRadius: 14, padding: 20, animation: 'pulse 1.5s ease-in-out infinite' }}>
                  <div style={{ display: 'flex', gap: 16 }}>
                    <div style={{ width: 180, height: 16, background: '#2a2a3a', borderRadius: 4 }} />
                    <div style={{ width: 100, height: 16, background: '#2a2a3a', borderRadius: 4 }} />
                    <div style={{ flex: 1 }} />
                    <div style={{ width: 60, height: 16, background: '#2a2a3a', borderRadius: 4 }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Load cards */}
          {!loading && loads.length === 0 && (
            <div style={{ textAlign: 'center', padding: '60px 20px', background: '#16161e', borderRadius: 16, border: '1px solid #2a2a3a' }}>
              <Ic icon={Search} size={32} color="#3a3a4a" />
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 16, color: '#c8d0dc' }}>No loads found</div>
              <div style={{ fontSize: 13, color: '#8891a5', marginTop: 8 }}>Try adjusting your filters or search criteria</div>
            </div>
          )}

          {!loading && loads.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {loads.map((load, idx) => (
                <LoadCard key={load.id || idx} load={load} onSignUp={onSignUp} formatDate={formatDate} formatTimeAgo={formatTimeAgo} scoreColor={scoreColor} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && loads.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 24 }}>
              <button onClick={() => fetchLoads(page - 1)} disabled={page <= 1}
                style={{ ...paginationBtnStyle, opacity: page <= 1 ? 0.3 : 1 }}>
                <Ic icon={ChevronLeft} size={16} />
              </button>
              <span style={{ fontSize: 13, color: '#8891a5' }}>Page {page}</span>
              <button onClick={() => fetchLoads(page + 1)} disabled={!hasMore}
                style={{ ...paginationBtnStyle, opacity: !hasMore ? 0.3 : 1 }}>
                <Ic icon={ChevronRight} size={16} />
              </button>
            </div>
          )}

          {/* Bottom CTA */}
          <div style={{ marginTop: 40, padding: '40px 24px', background: 'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(0,212,170,0.04))', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 20, textAlign: 'center' }}>
            <h2 style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 32, letterSpacing: 2, marginBottom: 12 }}>
              See Full Rates & <span style={{ color: '#f0a500' }}>Book Instantly</span>
            </h2>
            <p style={{ fontSize: 14, color: '#8891a5', maxWidth: 480, margin: '0 auto 20px', lineHeight: 1.6 }}>
              Create a free account to unlock rate-per-mile, broker details, AI load scoring, and one-click booking. No credit card required.
            </p>
            <button onClick={onSignUp}
              style={{ padding: '14px 40px', background: 'linear-gradient(135deg, #f0a500, #e09000)', border: 'none', borderRadius: 12, color: '#000', fontSize: 15, fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 32px rgba(240,165,0,0.3)' }}>
              Sign Up Free — See Full Details
            </button>
            <div style={{ fontSize: 12, color: '#6b7590', marginTop: 12 }}>14-day free trial &middot; No credit card required</div>
          </div>
        </main>
      </div>

      {/* ── FOOTER ──────────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid #2a2a3a', padding: '32px 24px', background: '#0d0d12' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 3, color: '#c8d0dc' }}>
              QI<span style={{ color: '#f0a500' }}>VORI</span>
              <span style={{ fontSize: 9, color: '#00d4aa', fontFamily: "'DM Sans',sans-serif", fontWeight: 800, marginLeft: 4 }}>AI</span>
            </span>
            <span style={{ fontSize: 12, color: '#6b7590' }}>The AI-powered trucking platform</span>
          </div>
          <div style={{ display: 'flex', gap: 24 }}>
            <a href="/" style={{ fontSize: 12, color: '#6b7590', textDecoration: 'none' }}>Home</a>
            <a href="#/terms" style={{ fontSize: 12, color: '#6b7590', textDecoration: 'none' }}>Terms</a>
            <a href="#/privacy" style={{ fontSize: 12, color: '#6b7590', textDecoration: 'none' }}>Privacy</a>
          </div>
        </div>
        <div style={{ maxWidth: 1200, margin: '12px auto 0', fontSize: 11, color: '#4a4a5a' }}>
          &copy; 2026 Qivori AI. All rights reserved.
        </div>
      </footer>

      {/* ── STYLES ──────────────────────────────────────────────────── */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }

        .plb-search-form select, .plb-search-form input {
          appearance: none; -webkit-appearance: none;
        }

        @media (max-width: 780px) {
          .plb-sidebar { display: none !important; }
          .plb-filter-toggle { display: flex !important; }
          .plb-btn-ghost { display: none !important; }
          .plb-main { padding: 0 12px 40px !important; }
          h1 { font-size: 32px !important; }
        }

        @media (max-width: 520px) {
          .plb-search-form { flex-direction: column; }
          .plb-search-form > div, .plb-search-form > button { width: 100%; flex: unset !important; }
        }
      `}</style>
    </div>
  )
}

// ── Load Card Component ───────────────────────────────────────────────────────

function LoadCard({ load, onSignUp, formatDate, formatTimeAgo, scoreColor }) {
  return (
    <div className="plb-load-card" style={{
      background: '#16161e', border: '1px solid #2a2a3a', borderRadius: 14, padding: '16px 20px',
      transition: 'all 0.2s', cursor: 'default', position: 'relative', overflow: 'hidden'
    }}
      onMouseOver={e => { e.currentTarget.style.borderColor = 'rgba(240,165,0,0.3)'; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.3)' }}
      onMouseOut={e => { e.currentTarget.style.borderColor = '#2a2a3a'; e.currentTarget.style.boxShadow = 'none' }}>

      {/* Top row: Lane + meta */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        {/* Origin -> Dest */}
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: '#e8ecf0' }}>{load.origin || 'Unknown'}</span>
            <Ic icon={ArrowRight} size={14} color="#f0a500" />
            <span style={{ fontSize: 15, fontWeight: 700, color: '#e8ecf0' }}>{load.dest || 'Unknown'}</span>
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Tag label={load.equipment || 'Dry Van'} color="#f0a500" />
            <Tag label={`${load.miles || 0} mi`} color="#4d8ef0" />
            {load.pickup && <Tag label={`Pickup: ${formatDate(load.pickup)}`} color="#00d4aa" />}
            {load.weight && <Tag label={load.weight} color="#8891a5" />}
          </div>
        </div>

        {/* AI Score */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ fontSize: 11, color: '#6b7590' }}>AI Score</div>
            <div style={{
              padding: '4px 10px', borderRadius: 8, fontSize: 13, fontWeight: 700,
              background: `${scoreColor(load.aiScore)}15`, color: scoreColor(load.aiScore),
              border: `1px solid ${scoreColor(load.aiScore)}30`
            }}>
              {load.aiScore || '--'}
            </div>
          </div>
          {load.postedAt && (
            <div style={{ fontSize: 10, color: '#4a5060' }}>{formatTimeAgo(load.postedAt)}</div>
          )}
        </div>
      </div>

      {/* Bottom row: Blurred data + CTA */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTop: '1px solid #1e1e2e', gap: 12, flexWrap: 'wrap' }}>
        {/* Blurred rate */}
        <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <BlurredField label="Rate/mi" value="$X.XX" />
          <BlurredField label="Gross" value="$X,XXX" />
          <BlurredField label="Broker" value="XXXXXXXX Inc." />
          <BlurredField label="MC#" value="XXXXXX" />
        </div>

        <button onClick={onSignUp}
          style={{ padding: '8px 16px', background: 'rgba(240,165,0,0.1)', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 8, color: '#f0a500', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0 }}>
          <Ic icon={Lock} size={12} color="#f0a500" />
          Sign up to view
        </button>
      </div>
    </div>
  )
}

// ── Small UI components ───────────────────────────────────────────────────────

function Tag({ label, color }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color, padding: '3px 8px', background: `${color}10`, borderRadius: 6, border: `1px solid ${color}20`, whiteSpace: 'nowrap' }}>
      {label}
    </span>
  )
}

function BlurredField({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <div style={{ fontSize: 10, color: '#4a5060', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#c8d0dc', filter: 'blur(6px)', userSelect: 'none', WebkitUserSelect: 'none' }}>{value}</div>
    </div>
  )
}

function FilterGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7590', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  )
}

function MetaTags() {
  useEffect(() => {
    document.title = 'Find Freight Loads Nationwide | Qivori AI Load Board'
    setMeta('description', 'Search thousands of available trucking loads from top freight brokers. AI-scored for profitability. Dry van, reefer, flatbed loads updated in real-time. Free to browse.')
    setMeta('og:title', 'Qivori AI Load Board - Find Freight Loads Nationwide')
    setMeta('og:description', 'Search AI-scored trucking loads from top brokers. Dry van, reefer, flatbed. Updated in real-time.')
    setMeta('og:type', 'website')
    return () => {
      document.title = 'Qivori AI - The AI-Powered Trucking Platform'
    }
  }, [])
  return null
}

function setMeta(name, content) {
  const attr = name.startsWith('og:') ? 'property' : 'name'
  let el = document.querySelector(`meta[${attr}="${name}"]`)
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

// ── Shared styles ─────────────────────────────────────────────────────────────

const selectStyle = {
  width: '100%', padding: '12px 14px 12px 36px', fontSize: 13, fontWeight: 500,
  background: '#16161e', border: '1px solid #2a2a3a', borderRadius: 12,
  color: '#c8d0dc', outline: 'none', cursor: 'pointer',
  fontFamily: "'DM Sans', sans-serif",
}

const filterInputStyle = {
  flex: 1, padding: '8px 10px', fontSize: 12, background: '#0a0a0e',
  border: '1px solid #2a2a3a', borderRadius: 8, color: '#c8d0dc', outline: 'none',
  fontFamily: "'DM Sans', sans-serif", width: '100%',
}

const paginationBtnStyle = {
  width: 36, height: 36, borderRadius: 10, background: '#16161e',
  border: '1px solid #2a2a3a', color: '#c8d0dc', cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
