import { useState, useCallback } from 'react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { useSubscription } from '../../hooks/useSubscription'
import { Home, Package, DollarSign, MoreHorizontal, X, Clock } from 'lucide-react'
import { Ic, mobileAnimations, getQSystemState, haptic } from './shared'
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
  const { logout, user, profile, demoMode, showToast } = useApp()
  const { isTrialing, trialDaysLeft, isActive } = useSubscription()
  const trialExpired = !demoMode && !isActive && profile?.subscription_status && profile.subscription_status !== 'active' && profile.subscription_status !== 'trialing'
  const ctx = useCarrier() || {}
  const activeLoads = ctx.activeLoads || []
  const totalRevenue = ctx.totalRevenue || 0
  const unpaidInvoices = ctx.unpaidInvoices || []
  const qState = getQSystemState(ctx)

  const [activeTab, setActiveTab] = useState('home')
  const [moneySubTab, setMoneySubTab] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInitMsg, setChatInitMsg] = useState(null)
  const [qGreetingForChat, setQGreetingForChat] = useState(null)
  const [chatAutoCall, setChatAutoCall] = useState(false)
  const [qOverlayState, setQOverlayState] = useState('idle') // idle | listening | analyzing | speaking

  const handleNavigate = useCallback((tab, extra) => {
    if (tab === 'chat') {
      setChatInitMsg(extra || null)
      setChatAutoCall(false)
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

  const openQ = useCallback((msg, greeting, startCall) => {
    // Stop any playing audio (home screen greeting) before opening Q
    document.querySelectorAll('audio').forEach(a => { a.pause(); a.src = '' })
    window.speechSynthesis?.cancel()
    setChatInitMsg(msg || null)
    if (greeting) setQGreetingForChat(greeting)
    setChatAutoCall(!!startCall)
    setChatOpen(true)
    if (msg) setTimeout(() => setChatInitMsg(null), 500)
  }, [])

  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]

  return (
    <div style={{ height: '100dvh', width: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: "'DM Sans',sans-serif", overflow: 'hidden' }}>

      {/* Trial countdown */}
      {!demoMode && isTrialing && trialDaysLeft !== null && (
        <div style={{
          background: trialDaysLeft <= 3 ? 'rgba(239,68,68,0.12)' : 'rgba(240,165,0,0.1)',
          padding: '6px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 0,
        }}>
          <Clock size={12} color={trialDaysLeft <= 3 ? '#ef4444' : '#f0a500'} />
          <span style={{ fontSize: 11, fontWeight: 600, color: trialDaysLeft <= 3 ? '#ef4444' : '#f0a500' }}>
            {trialDaysLeft === 0 ? 'Trial ends today!' : `${trialDaysLeft} day${trialDaysLeft !== 1 ? 's' : ''} left in trial`}
          </span>
        </div>
      )}

      {/* Trial expired overlay */}
      {trialExpired && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
        }}>
          <div style={{ textAlign: 'center', maxWidth: 360 }}>
            <Clock size={40} color="#ef4444" style={{ marginBottom: 16 }} />
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 1, color: '#fff', marginBottom: 8 }}>
              TRIAL ENDED
            </div>
            <div style={{ fontSize: 13, color: '#8a8a9a', lineHeight: 1.6, marginBottom: 20 }}>
              Your 14-day trial is over. Upgrade to keep your data and continue using Qivori.
            </div>
            <div style={{ background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 10, padding: 14, marginBottom: 20 }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: '#f0a500' }}>$99</span>
              <span style={{ fontSize: 12, color: '#8a8a9a' }}>/mo starting · 3 plans available</span>
            </div>
            <button onClick={() => {
              import('../../lib/api').then(({ apiFetch }) => {
                apiFetch('/api/create-checkout', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ planId: 'autonomous_fleet', email: profile?.email, userId: profile?.id, truckCount: 1 }),
                }).then(r => r.json()).then(d => { if (d.url) window.location.href = d.url })
                  .catch(() => showToast('error', 'Error', 'Could not start checkout'))
              })
            }} style={{
              width: '100%', padding: '14px', border: 'none', borderRadius: 10, cursor: 'pointer',
              background: '#f0a500', color: '#000', fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
              marginBottom: 8,
            }}>
              Upgrade — $199/mo
            </button>
            <button onClick={logout} style={{
              width: '100%', padding: '10px', border: '1px solid #2a2a35', borderRadius: 10,
              cursor: 'pointer', background: 'transparent', color: '#8a8a9a', fontSize: 12,
              fontFamily: "'DM Sans',sans-serif",
            }}>
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <div style={{ height: 48, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, flexShrink: 0 }}>
        <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: 3, color: 'var(--text)', fontFamily: "'Bebas Neue',sans-serif" }}>QI<span style={{ color: 'var(--accent)' }}>VORI</span></span>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: `${qState.color}10`, borderRadius: 20 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: qState.color, animation: 'qStatusPulse 2s ease-in-out infinite' }} />
          <span style={{ fontSize: 9, color: qState.color, fontWeight: 700, letterSpacing: 0.3 }}>{qState.label}</span>
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
          onClick={() => openQ(null, null, true)}
          style={{
            position: 'fixed', bottom: `calc(68px + env(safe-area-inset-bottom, 0px))`, right: 16, zIndex: 100,
            width: 48, height: 48, borderRadius: '50%',
            background: qState.state === 'alert' ? 'var(--danger)' : 'var(--accent)',
            border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 20px rgba(240,165,0,0.25)',
            animation: 'fabPop 0.3s ease, qBreath 3s ease-in-out 0.5s infinite',
            transition: 'transform 0.15s ease, background 0.3s ease',
          }}
        >
          <span style={{
            fontFamily: "'Bebas Neue',sans-serif", fontSize: 22,
            color: qState.state === 'alert' ? '#fff' : '#000', fontWeight: 800, lineHeight: 1,
          }}>Q</span>
        </button>
      )}

      {/* ── Q CHAT OVERLAY — premium slide-up with dimmed backdrop ── */}
      {chatOpen && (
        <>
          {/* Backdrop dim */}
          <div style={{
            position: 'fixed', inset: 0, zIndex: 199,
            background: 'rgba(0,0,0,0.5)',
            animation: 'qOverlayDim 0.2s ease',
          }} />
          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 200, display: 'flex', flexDirection: 'column',
            background: 'var(--bg)',
            animation: 'qOverlayIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          }}>
            {/* Overlay header — live Q state */}
            <div style={{
              flexShrink: 0, display: 'flex', alignItems: 'center',
              padding: '0 16px', gap: 12, background: 'var(--surface)',
              borderBottom: '1px solid var(--border)',
              paddingTop: 'env(safe-area-inset-top, 0px)',
              minHeight: 54,
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: '50%', background: 'var(--accent)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                animation: 'qGlow 3s ease-in-out infinite',
              }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 17, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>Q ACTIVE</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--success)', animation: 'qStatusPulse 2s ease-in-out infinite' }} />
                  <span style={{ color: 'var(--success)', fontWeight: 600 }}>Voice control active</span>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)}
                style={{
                  width: 36, height: 36, borderRadius: '50%', background: 'var(--surface2)',
                  border: '1px solid var(--border)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.15s ease',
                }}>
                <Ic icon={X} size={18} color="var(--muted)" />
              </button>
            </div>

            {/* Chat content */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <MobileChatTab onNavigate={(tab, extra) => { setChatOpen(false); handleNavigate(tab, extra) }} initialMessage={chatInitMsg} greetingContext={qGreetingForChat} isOverlay autoCall={chatAutoCall} />
            </div>
          </div>
        </>
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
            <button key={tab.id} onClick={() => { haptic('light'); setActiveTab(tab.id); setMoneySubTab(null) }}
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
