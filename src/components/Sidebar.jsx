import React from 'react'
import { useApp, ROLES } from '../context/AppContext'
import { LogOut, ArrowLeftRight } from 'lucide-react'

export default function Sidebar() {
  const { currentRole, currentPage, navigatePage, logout, sidebarOpen, closeSidebar, switchView } = useApp()
  const r = ROLES[currentRole]

  const badgeColors = {
    blue: { bg: 'rgba(77,142,240,0.15)', color: 'var(--accent3)' },
    green: { bg: 'rgba(34,197,94,0.15)', color: 'var(--success)' },
    yellow: { bg: 'rgba(240,165,0,0.15)', color: 'var(--accent)' },
    red: { bg: 'rgba(239,68,68,0.15)', color: 'var(--danger)' }
  }

  const roleColors = {
    admin: 'var(--accent)',
    shipper: 'var(--accent3)',
    carrier: 'var(--accent2)'
  }

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          onClick={closeSidebar}
          style={{
            position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)',
            zIndex: 200, display: 'block'
          }}
        />
      )}

      <div
        className="sidebar"
        style={{
          width: 220, minWidth: 220,
          background: 'var(--surface)',
          borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column',
          height: '100%', flexShrink: 0,
          position: window.innerWidth <= 780 ? 'absolute' : 'relative',
          top: 0, left: 0, zIndex: window.innerWidth <= 780 ? 250 : 'auto',
          transform: window.innerWidth <= 780 ? (sidebarOpen ? 'translateX(0)' : 'translateX(-100%)') : 'none',
          transition: 'transform 0.3s ease',
          boxShadow: window.innerWidth <= 780 && sidebarOpen ? '4px 0 24px rgba(0,0,0,0.5)' : 'none'
        }}
      >
        {/* Logo */}
        <div style={{
          padding: '18px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'baseline'
        }}>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 3, color: 'var(--text)', fontFamily: "'Bebas Neue', sans-serif" }}>QIVORI</span>
        </div>

        {/* User */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '50%',
            background: roleColors[currentRole] + '22',
            border: '2px solid ' + roleColors[currentRole] + '44',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 700, fontSize: 12, color: roleColors[currentRole]
          }}>
            {r.initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
            <div style={{
              fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
              color: roleColors[currentRole],
              background: roleColors[currentRole] + '15',
              padding: '1px 6px', borderRadius: 10, display: 'inline-block', marginTop: 2
            }}>
              {r.badgeText}
            </div>
          </div>
        </div>

        {/* Nav */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '10px 8px' }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', padding: '6px 8px', marginBottom: 4 }}>
            Navigation
          </div>
          {r.nav.map((item, i) => {
            if (item.section) return (
              <div key={item.section + i} style={{
                fontSize: 9, color: 'var(--muted)', fontWeight: 700, letterSpacing: 1.5,
                textTransform: 'uppercase', padding: '10px 8px 4px', marginTop: i > 0 ? 4 : 0
              }}>{item.section}</div>
            )
            const active = currentPage === item.id
            const bc = item.badge && badgeColors[item.badgeClass]
            return (
              <button
                key={item.id}
                onClick={() => { navigatePage(item.id); closeSidebar() }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: active ? 'rgba(240,165,0,0.1)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--muted)',
                  fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13,
                  marginBottom: 2, transition: 'all 0.15s', textAlign: 'left',
                  borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent'
                }}
                onMouseOver={e => { if (!active) e.currentTarget.style.color = 'var(--text)' }}
                onMouseOut={e => { if (!active) e.currentTarget.style.color = 'var(--muted)' }}
              >
                <span style={{ width: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{React.createElement(item.icon, { size: 15 })}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.badge && bc && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                    background: bc.bg, color: bc.color
                  }}>{item.badge}</span>
                )}
              </button>
            )
          })}
        </div>

        {/* Switch View + Logout */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid var(--border)' }}>
          {currentRole === 'admin' && (
            <button
              onClick={() => { switchView('carrier'); navigatePage('overview') }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: 'rgba(240,165,0,0.08)', color: 'var(--accent)',
                fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13,
                marginBottom: 6, transition: 'all 0.15s'
              }}
            >
              <ArrowLeftRight size={15} /> Carrier View
            </button>
          )}
          <button
            onClick={logout}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              padding: '9px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: 'transparent', color: 'var(--muted)',
              fontFamily: "'DM Sans', sans-serif", fontWeight: 600, fontSize: 13,
              transition: 'all 0.15s'
            }}
            onMouseOver={e => e.currentTarget.style.color = 'var(--danger)'}
            onMouseOut={e => e.currentTarget.style.color = 'var(--muted)'}
          >
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </div>
    </>
  )
}
