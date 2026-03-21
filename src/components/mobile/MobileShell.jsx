import { useState, useCallback } from 'react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { Home, Package, DollarSign, MoreHorizontal, X } from 'lucide-react'
import { Ic, MiniStat, mobileAnimations } from './shared'
import MobileHomeTab from './MobileHomeTab'
import MobileLoadsTab from './MobileLoadsTab'
import MobileMoneyTab from './MobileMoneyTab'
import MobileMoreTab from './MobileMoreTab'
import MobileChatTab from './MobileChatTab'

const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'loads', label: 'Loads', icon: Package },
  { id: 'money', label: 'Money', icon: DollarSign },
  { id: 'more', label: 'More', icon: MoreHorizontal },
]

export default function MobileShell() {
  const { logout, user, profile } = useApp()
  const ctx = useCarrier() || {}
  const activeLoads = ctx.activeLoads || []
  const totalRevenue = ctx.totalRevenue || 0
  const unpaidInvoices = ctx.unpaidInvoices || []

  const [activeTab, setActiveTab] = useState('home')
  const [moneySubTab, setMoneySubTab] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInitMsg, setChatInitMsg] = useState(null)

  const handleNavigate = useCallback((tab, extra) => {
    if (tab === 'chat') {
      setChatInitMsg(extra || null)
      setChatOpen(true)
      return
    }
    if (tab === 'money' && extra === 'expenses') {
      setMoneySubTab('expenses')
    } else {
      setMoneySubTab(null)
    }
    setActiveTab(tab)
  }, [])

  const openQ = useCallback((msg) => {
    setChatInitMsg(msg || null)
    setChatOpen(true)
  }, [])

  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]

  return (
    <div style={{ height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: "'DM Sans',sans-serif", overflow: 'hidden' }}>

      {/* ── HEADER ── */}
      <div style={{ height: 50, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', lineHeight: 1 }}>
            <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 2, color: 'var(--text)', fontFamily: "'Bebas Neue',sans-serif" }}>Q</span>
            <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500, marginLeft: 6, letterSpacing: 0.5, fontFamily: "'DM Sans',sans-serif" }}>by Qivori</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <MiniStat label="MTD" value={'$' + totalRevenue.toLocaleString()} color="var(--accent)" />
          <MiniStat label="Loads" value={activeLoads.length} color="var(--accent2)" />
        </div>
      </div>

      {/* ── TAB CONTENT ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: activeTab === 'home' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', animation: 'tabSlide 0.2s ease-out', WebkitOverflowScrolling: 'touch' }}>
          <MobileHomeTab onNavigate={handleNavigate} onOpenQ={openQ} />
        </div>
        <div style={{ flex: 1, display: activeTab === 'loads' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', animation: 'tabSlide 0.2s ease-out', WebkitOverflowScrolling: 'touch' }}>
          <MobileLoadsTab />
        </div>
        <div style={{ flex: 1, display: activeTab === 'money' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', animation: 'tabSlide 0.2s ease-out', WebkitOverflowScrolling: 'touch' }}>
          <MobileMoneyTab initialSubTab={moneySubTab} />
        </div>
        <div style={{ flex: 1, display: activeTab === 'more' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', animation: 'tabSlide 0.2s ease-out', WebkitOverflowScrolling: 'touch' }}>
          <MobileMoreTab />
        </div>
      </div>

      {/* ── FLOATING Q BUTTON ── */}
      {!chatOpen && (
        <button
          onClick={() => openQ()}
          style={{
            position: 'fixed',
            bottom: `calc(72px + env(safe-area-inset-bottom, 0px))`,
            right: 16,
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--accent)',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(240,165,0,0.3), 0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 100,
            animation: 'fabPop 0.3s ease',
            transition: 'transform 0.15s ease',
          }}
        >
          <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
        </button>
      )}

      {/* ── Q CHAT OVERLAY ── */}
      {chatOpen && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          background: 'var(--bg)',
          animation: 'overlaySlideUp 0.25s ease-out',
        }}>
          {/* Overlay header */}
          <div style={{
            height: 50, flexShrink: 0, display: 'flex', alignItems: 'center',
            padding: '0 16px', gap: 12, background: 'var(--surface)',
            borderBottom: '1px solid var(--border)',
          }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700 }}>Q</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>Your AI copilot</div>
            </div>
            <button onClick={() => setChatOpen(false)}
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface2)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic icon={X} size={18} color="var(--muted)" />
            </button>
          </div>

          {/* Chat content */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <MobileChatTab onNavigate={handleNavigate} initialMessage={chatInitMsg} isOverlay />
          </div>
        </div>
      )}

      {/* ── BOTTOM TAB BAR ── */}
      <div style={{
        flexShrink: 0,
        minHeight: 56,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
      }}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.id
          const badge = tab.id === 'loads' && activeLoads.length > 0 ? activeLoads.length
            : tab.id === 'money' && unpaidInvoices.length > 0 ? unpaidInvoices.length
            : null
          return (
            <button key={tab.id} onClick={() => { setActiveTab(tab.id); setMoneySubTab(null) }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                padding: '10px 16px', position: 'relative',
                transition: 'all 0.2s ease',
              }}>
              <div style={{ position: 'relative', transform: isActive ? 'scale(1)' : 'scale(0.95)', transition: 'all 0.15s ease' }}>
                <Ic icon={tab.icon} size={20}
                  color={isActive ? 'var(--accent)' : 'var(--muted)'}
                  strokeWidth={isActive ? 2.5 : 1.5}
                />
                {badge && (
                  <span style={{
                    position: 'absolute', top: -4, right: -8,
                    fontSize: 8, fontWeight: 800, background: 'var(--danger)', color: '#fff',
                    borderRadius: 10, padding: '1px 4px', minWidth: 14, textAlign: 'center',
                    lineHeight: '12px',
                  }}>{badge}</span>
                )}
              </div>
              <span style={{
                fontSize: 9, fontWeight: isActive ? 800 : 600,
                color: isActive ? 'var(--accent)' : 'var(--muted)',
                letterSpacing: isActive ? 0.5 : 0,
              }}>{tab.label}</span>
              {isActive && (
                <div style={{
                  position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
                  width: 20, height: 2, borderRadius: 1, background: 'var(--accent)',
                }} />
              )}
            </button>
          )
        })}
      </div>

      <style>{mobileAnimations + `
     .hide-scrollbar::-webkit-scrollbar { display: none; }
     .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
   `}</style>
    </div>
  )
}
