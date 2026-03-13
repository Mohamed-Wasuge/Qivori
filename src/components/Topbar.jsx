import { useApp } from '../context/AppContext'
import { Search, Bell } from 'lucide-react'

const PAGE_TITLES = {
  dashboard: 'OVERVIEW', loadboard: 'ALL LOADS', carriers: 'USERS',
  brokers: 'BROKERS', support: 'SUPPORT', payments: 'REVENUE',
  settings: 'SETTINGS', waitlist: 'WAITLIST', analytics: 'ANALYTICS',
  activity: 'SECURITY & ACTIVITY',
  // Broker pages
  'broker-dashboard': 'DASHBOARD', 'broker-post': 'POST LOAD',
  'broker-loads': 'MY LOADS', 'broker-carriers': 'FIND CARRIERS',
  'broker-payments': 'PAYMENTS',
}

export default function Topbar() {
  const { currentPage, currentRole, roleConfig, navigatePage, toggleSidebar, showToast } = useApp()

  const handlePrimary = () => {
    if (currentRole === 'carrier') navigatePage('loadboard')
    else if (currentRole === 'admin') showToast('', 'Invite Sent', 'User invitation email sent')
    else showToast('', 'Post Load', 'Opening load posting form...')
  }

  return (
    <div style={{
      height: 52, borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', padding: '0 16px',
      gap: 12, flexShrink: 0, background: 'var(--surface)'
    }}>
      {/* Hamburger - mobile only */}
      <button
        id="mob-menu"
        onClick={toggleSidebar}
        style={{
          background: 'none', border: 'none', color: 'var(--muted)',
          fontSize: 22, cursor: 'pointer', padding: '4px 8px',
          display: 'none'
        }}
        className="mob-menu-btn"
      >
        ☰
      </button>

      <div style={{
        fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, letterSpacing: 2, flex: 1
      }}>
        {PAGE_TITLES[currentPage] || currentPage.toUpperCase()}
      </div>

      {/* Search - hidden on mobile */}
      <div className="search-wrap" style={{
        background: 'var(--surface2)', border: '1px solid var(--border)',
        borderRadius: 8, padding: '7px 12px', display: 'flex', alignItems: 'center', gap: 8,
        minWidth: 180
      }}>
        <Search size={12} />
        <input
          placeholder="Search..."
          style={{
            background: 'none', border: 'none', outline: 'none',
            color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans', sans-serif", width: '100%'
          }}
        />
      </div>

      <button className="btn btn-ghost tb-btn-ghost" style={{ fontSize: 12 }}>
        <Bell size={14} /> <span style={{ background: 'var(--danger)', color: '#fff', fontSize: 9, fontWeight: 700, padding: '0 4px', borderRadius: 8, marginLeft: 2 }}>5</span>
      </button>

      <button className="btn btn-primary tb-btn" onClick={handlePrimary} style={{ fontSize: 12 }}>
        {roleConfig.primaryBtn}
      </button>
    </div>
  )
}
