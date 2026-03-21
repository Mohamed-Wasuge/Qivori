import { useState, useCallback } from 'react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { Home, Package, DollarSign, FileText, Zap } from 'lucide-react'
import { Ic, MiniStat, mobileAnimations } from './shared'
import MobileHomeTab from './MobileHomeTab'
import MobileLoadsTab from './MobileLoadsTab'
import MobileMoneyTab from './MobileMoneyTab'
import MobileIFTATab from './MobileIFTATab'
import MobileChatTab from './MobileChatTab'

const TABS = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'loads', label: 'Loads', icon: Package },
  { id: 'money', label: 'Money', icon: DollarSign },
  { id: 'ifta', label: 'IFTA', icon: FileText },
  { id: 'chat', label: 'Q', icon: Zap },
]

export default function MobileShell() {
  const { logout, user, profile } = useApp()
  const ctx = useCarrier() || {}
  const activeLoads = ctx.activeLoads || []
  const totalRevenue = ctx.totalRevenue || 0
  const unpaidInvoices = ctx.unpaidInvoices || []

  const [activeTab, setActiveTab] = useState('chat')
  const [moneySubTab, setMoneySubTab] = useState(null)
  const [chatInitMsg, setChatInitMsg] = useState(null)

  // Navigate between tabs — called from child components
  const handleNavigate = useCallback((tab, extra) => {
    if (tab === 'money' && extra === 'expenses') {
      setMoneySubTab('expenses')
    } else {
      setMoneySubTab(null)
    }
    if (tab === 'chat' && extra) {
      setChatInitMsg(extra)
    }
    setActiveTab(tab)
  }, [])

  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]

  return (
    <div style={{ height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: "'DM Sans',sans-serif", overflow: 'hidden' }}>

      {/* ── HEADER ── */}
      <div style={{ height: 50, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 3, lineHeight: 1 }}>
            QI<span style={{ color: 'var(--accent)' }}>VORI</span>
            <span style={{ fontSize: 11, color: 'var(--accent2)', letterSpacing: 1, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, marginLeft: 6 }}>AI</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <MiniStat label="MTD" value={'$' + totalRevenue.toLocaleString()} color="var(--accent)" />
          <MiniStat label="Loads" value={activeLoads.length} color="var(--accent2)" />
        </div>
        <button onClick={logout} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', color: 'var(--danger)', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>
          Out
        </button>
      </div>

      {/* ── TAB CONTENT ── */}
      {/* All tabs stay mounted to preserve state */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, display: activeTab === 'home' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', animation: 'slideUp 0.15s ease' }}>
          <MobileHomeTab onNavigate={handleNavigate} />
        </div>
        <div style={{ flex: 1, display: activeTab === 'loads' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', animation: 'slideUp 0.15s ease' }}>
          <MobileLoadsTab />
        </div>
        <div style={{ flex: 1, display: activeTab === 'money' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', animation: 'slideUp 0.15s ease' }}>
          <MobileMoneyTab initialSubTab={moneySubTab} />
        </div>
        <div style={{ flex: 1, display: activeTab === 'ifta' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', animation: 'slideUp 0.15s ease' }}>
          <MobileIFTATab />
        </div>
        <div style={{ flex: 1, display: activeTab === 'chat' ? 'flex' : 'none', flexDirection: 'column', overflow: 'hidden', animation: 'slideUp 0.15s ease' }}>
          <MobileChatTab onNavigate={handleNavigate} />
        </div>
      </div>

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
                transition: 'all 0.15s',
              }}>
              <div style={{ position: 'relative' }}>
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
