import { useState, useCallback, useRef, lazy, Suspense } from 'react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { useSubscription } from '../../hooks/useSubscription'
import useQLocation from '../../hooks/useQLocation'
import { Package, DollarSign, X, Clock, Settings, Sparkles } from 'lucide-react'
import { Ic, mobileAnimations, getQSystemState, haptic, fmt$ } from './shared'
import * as db from '../../lib/database'

// Lazy-load all tabs — only loads the tab JS when first rendered
const MobileHomeTab = lazy(() => import('./MobileHomeTab'))
const MobileLoadsTab = lazy(() => import('./MobileLoadsTab'))
const MobileMoneyTab = lazy(() => import('./MobileMoneyTab'))
const MobileMoreTab = lazy(() => import('./MobileMoreTab'))
const MobileChatTab = lazy(() => import('./MobileChatTab'))
const DriverHomeTab = lazy(() => import('./DriverHomeTab'))
const DriverPayTab = lazy(() => import('./DriverPayTab'))
const DriverMoreTab = lazy(() => import('./DriverMoreTab'))
const DVIROverlay = lazy(() => import('./DriverMoreTab').then(m => ({ default: m.DVIRInspection })))

// Minimal loading spinner for tab suspense
const TabLoader = () => (
  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
    <div style={{ textAlign: 'center' }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
        <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#000', fontWeight: 800 }}>Q</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>Loading...</div>
    </div>
  </div>
)

export default function MobileShell() {
  const { logout, user, profile, demoMode, showToast, isDriver, goToLogin } = useApp()
  const { isTrialing, trialDaysLeft, isActive } = useSubscription()
  const trialExpired = !demoMode && !isActive && profile?.subscription_status && profile.subscription_status !== 'active' && profile.subscription_status !== 'trialing' && profile.subscription_status !== 'none'
  const ctx = useCarrier() || {}
  const activeLoads = ctx.activeLoads || []
  const totalRevenue = ctx.totalRevenue || 0
  const unpaidInvoices = ctx.unpaidInvoices || []
  const qState = getQSystemState(ctx)

  const [activeTab, setActiveTab] = useState('loads')
  const [moneySubTab, setMoneySubTab] = useState(null)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatInitMsg, setChatInitMsg] = useState(null)
  const [qGreetingForChat, setQGreetingForChat] = useState(null)
  const [chatAutoCall, setChatAutoCall] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsClosing, setSettingsClosing] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)

  // DVIR overlay state
  const [showDVIR, setShowDVIR] = useState(false)
  const [dvirLoad, setDvirLoad] = useState(null)

  // ── Q AUTONOMOUS LOCATION ENGINE ──
  const qLocation = useQLocation({
    activeLoads,
    allLoads: ctx.loads || [],
    enabled: activeLoads.length > 0,
    companyAddress: ctx.company?.address || ctx.company?.city,

    // Auto-arrival at pickup — Q checks driver in, advances status, announces
    onArrivedAtPickup: useCallback((load, coords) => {
      const lid = load.loadId || load.load_id || load.load_number || load.id
      const shipperName = load.shipper_name || load.origin || 'shipper'
      // Write GPS check-in to DB
      db.updateLoad(load.id, {
        pickup_checkin_time: new Date().toISOString(),
        pickup_checkin_lat: coords.lat,
        pickup_checkin_lng: coords.lng,
      }).catch(() => {})
      // Advance status
      ctx.updateLoadStatus?.(lid, 'At Pickup')
      haptic('success')
      showToast?.('success', 'Q Auto Check-In', `Arrived at ${shipperName}`)
      // Open Q with announcement
      openQ(null, `Arrived at **${shipperName}**. Checking you in automatically. GPS recorded. Status → **At Pickup**.`)
    }, [ctx, showToast]),

    // Auto-arrival at delivery — same pattern
    onArrivedAtDelivery: useCallback((load, coords) => {
      const lid = load.loadId || load.load_id || load.load_number || load.id
      const receiverName = load.consignee_name || load.destination || load.dest || 'receiver'
      db.updateLoad(load.id, {
        delivery_checkin_time: new Date().toISOString(),
        delivery_checkin_lat: coords.lat,
        delivery_checkin_lng: coords.lng,
      }).catch(() => {})
      ctx.updateLoadStatus?.(lid, 'At Delivery')
      haptic('success')
      showToast?.('success', 'Q Auto Check-In', `Arrived at ${receiverName}`)
      openQ(null, `Arrived at **${receiverName}**. Checking you in. GPS recorded. Status → **At Delivery**. Snap your POD when unloaded.`)
    }, [ctx, showToast]),

    // Auto-departure from pickup — driver loaded and rolling out
    onDepartedPickup: useCallback((load, coords) => {
      const lid = load.loadId || load.load_id || load.load_number || load.id
      const dest = load.destination || load.dest || '?'
      db.updateLoad(load.id, {
        pickup_checkout_time: new Date().toISOString(),
        pickup_checkout_lat: coords.lat,
        pickup_checkout_lng: coords.lng,
      }).catch(() => {})
      ctx.updateLoadStatus?.(lid, 'In Transit')
      haptic('success')
      showToast?.('', 'Q: Rolling Out', `In Transit → ${dest}`)
      openQ(null, `Rolling out. Marked as **In Transit** → **${dest}**. ${load.miles ? `${load.miles} miles to delivery.` : ''} Drive safe.`)
    }, [ctx, showToast]),

    // Auto-departure from delivery — load delivered
    onDepartedDelivery: useCallback((load, coords) => {
      const lid = load.loadId || load.load_id || load.load_number || load.id
      const status = (load.status || '').toLowerCase()
      if (status !== 'delivered' && status !== 'at delivery') {
        ctx.updateLoadStatus?.(lid, 'Delivered')
      }
      haptic('success')
      showToast?.('success', 'Q: Load Delivered', 'Upload POD to get paid')
      openQ(null, `Load delivered. Upload your **POD** and **BOL** so I can generate the invoice and get you paid.`)
    }, [ctx, showToast]),

    // Auto-detention — 2 hours at shipper/receiver
    onDetentionStart: useCallback((load, locationType) => {
      const locationName = locationType === 'pickup'
        ? (load.shipper_name || load.origin || 'shipper')
        : (load.consignee_name || load.destination || load.dest || 'receiver')
      // Start detention timer (same localStorage pattern as DetentionTimer component)
      if (!localStorage.getItem(`detention_${load.id}`)) {
        // Set it to 2 hours ago since we just detected it now
        localStorage.setItem(`detention_${load.id}`, String(Date.now() - 7_200_000))
      }
      haptic('heavy')
      showToast?.('error', 'Detention Started', `2hr free time expired at ${locationName}`)
      openQ(null, `**Detention started** at ${locationName}. Free time (2 hours) expired. Timer running at **$75/hr**. I'll track the charges automatically.`)
    }, [showToast]),

    // DVIR prompt — driver near yard with dispatched load
    onNearYard: useCallback((load) => {
      haptic('medium')
      setDvirLoad(load)
      setShowDVIR(true)
      showToast?.('', 'Pre-Trip Required', 'Complete DVIR before departure')
      openQ(null, `Pre-trip inspection required before departure. **DVIR checklist** is ready — complete it before rolling out to **${load.origin || '?'}**.`)
    }, [showToast]),

    // New load dispatched — Q announces it
    onDispatchedLoad: useCallback((load) => {
      const origin = load.origin || '?'
      const dest = load.destination || load.dest || '?'
      const rate = load.rate || load.gross || 0
      haptic('success')
      showToast?.('success', 'New Load Dispatched', `${origin} → ${dest}`)
      openQ(null, `**New load dispatched.** ${origin} → ${dest}, **${fmt$(rate)}**${load.miles ? ` · ${load.miles} mi` : ''}. Navigate to pickup?`)
    }, [showToast]),
  })

  // Q center button long-press
  const longPressTimer = useRef(null)
  const [qPressed, setQPressed] = useState(false)

  const handleNavigate = useCallback((tab, extra) => {
    if (tab === 'chat') {
      setChatInitMsg(extra || null)
      setChatAutoCall(false)
      setChatOpen(true)
      return
    }
    // Map old tab IDs to new structure
    if (tab === 'home') {
      setActiveTab('loads')
      return
    }
    if (tab === 'more') {
      setSettingsOpen(true)
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
    // Stop any playing audio before opening Q
    document.querySelectorAll('audio').forEach(a => { a.pause(); a.src = '' })
    window.speechSynthesis?.cancel()
    setChatInitMsg(msg || null)
    if (greeting) setQGreetingForChat(greeting)
    setChatAutoCall(!!startCall)
    setChatOpen(true)
    if (msg) setTimeout(() => setChatInitMsg(null), 500)
  }, [])

  const closeSettings = useCallback(() => {
    setSettingsClosing(true)
    setTimeout(() => {
      setSettingsOpen(false)
      setSettingsClosing(false)
    }, 250)
  }, [])

  // Q center button handlers
  const onQTouchStart = () => {
    setQPressed(true)
    longPressTimer.current = setTimeout(() => {
      haptic('medium')
      openQ(null, null, true) // long press = voice call
    }, 500)
  }
  const onQTouchEnd = () => {
    setQPressed(false)
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }
  const onQClick = () => {
    // Only fires if long press didn't trigger
    if (!chatOpen) {
      haptic('light')
      openQ(null, null, false) // tap = chat
    }
  }

  return (
    <div style={{ height: '100dvh', width: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: "'DM Sans',sans-serif", overflow: 'hidden', paddingTop: 'env(safe-area-inset-top, 0px)' }}>

      {/* Demo banner */}
      {demoMode && (
        <div style={{ background:'linear-gradient(90deg, #f0a500, #e09000)', padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'center', gap:10, flexShrink:0, flexWrap:'wrap' }}>
          <Sparkles size={13} color="#000" />
          <span style={{ fontSize:12, fontWeight:700, color:'#000' }}>Demo mode</span>
          <button onClick={goToLogin} style={{ background:'#000', color:'#f0a500', border:'none', borderRadius:8, padding:'7px 20px', fontSize:12, fontWeight:800, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", boxShadow:'0 2px 6px rgba(0,0,0,0.3)' }}>
            Create Real Account
          </button>
        </div>
      )}

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
            <button disabled={checkoutLoading} onClick={async () => {
              if (checkoutLoading) return
              setCheckoutLoading(true)
              try {
                const { apiFetch } = await import('../../lib/api')
                const res = await apiFetch('/api/create-checkout', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ planId: 'autonomous_fleet', email: profile?.email, userId: profile?.id, truckCount: 1 }),
                })
                const d = await res.json()
                if (d.url) window.location.href = d.url
                else { showToast('error', 'Error', 'Could not start checkout'); setCheckoutLoading(false) }
              } catch {
                showToast('error', 'Error', 'Could not start checkout')
                setCheckoutLoading(false)
              }
            }} style={{
              width: '100%', padding: '14px', border: 'none', borderRadius: 10, cursor: 'pointer',
              background: '#f0a500', color: '#000', fontSize: 14, fontWeight: 700, fontFamily: "'DM Sans',sans-serif",
              marginBottom: 8,
            }}>
              {checkoutLoading ? 'Loading...' : 'Upgrade — $199/mo'}
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
      <div style={{
        height: 52, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0,
        background: 'var(--surface)', borderBottom: '1px solid rgba(255,255,255,0.04)',
        boxShadow: '0 1px 8px rgba(0,0,0,0.06)',
      }}>
        <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: 4, color: 'var(--text)', fontFamily: "'Bebas Neue',sans-serif" }}>QI<span style={{ color: 'var(--accent)' }}>VORI</span></span>
        <div style={{ flex: 1 }} />
        {/* Q status pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
          background: `${qState.color}0D`, borderRadius: 20,
          border: `1px solid ${qState.color}20`,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: qState.color, animation: 'qStatusPulse 2s ease-in-out infinite' }} />
          <span style={{ fontSize: 9, color: qState.color, fontWeight: 700, letterSpacing: 0.3 }}>{qState.label}</span>
        </div>
        {/* Gear icon → settings */}
        <button onClick={() => { haptic(); setSettingsOpen(true) }}
          style={{
            width: 36, height: 36, borderRadius: '50%', background: 'var(--surface2)',
            border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.15s ease',
          }}>
          <Ic icon={Settings} size={17} color="var(--muted)" />
        </button>
      </div>

      {/* ── TAB CONTENT ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Suspense fallback={<TabLoader />}>
          {isDriver ? (
            <>
              {/* Driver: Loads = MobileLoadsTab (shared), Money = DriverPayTab */}
              {activeTab === 'loads' && <MobileLoadsTab />}
              {activeTab === 'money' && <DriverPayTab />}
            </>
          ) : (
            <>
              {activeTab === 'loads' && <MobileLoadsTab />}
              {activeTab === 'money' && <MobileMoneyTab initialSubTab={moneySubTab} />}
            </>
          )}
        </Suspense>
      </div>

      {/* ── SETTINGS SLIDE-IN PANEL ── */}
      {settingsOpen && (
        <>
          <div onClick={closeSettings} style={{
            position: 'fixed', inset: 0, zIndex: 299,
            background: 'rgba(0,0,0,0.4)',
            animation: settingsClosing ? 'qOverlayDim 0.25s ease reverse' : 'qOverlayDim 0.25s ease',
          }} />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: '85%', maxWidth: 380,
            zIndex: 300, background: 'var(--bg)', display: 'flex', flexDirection: 'column',
            animation: settingsClosing ? 'settingsSlideOut 0.25s cubic-bezier(0.4, 0, 1, 1) forwards' : 'settingsSlideIn 0.3s cubic-bezier(0, 0, 0.2, 1)',
            boxShadow: '-8px 0 40px rgba(0,0,0,0.35), -2px 0 10px rgba(0,0,0,0.15)',
            borderLeft: '1px solid rgba(255,255,255,0.04)',
          }}>
            <Suspense fallback={<TabLoader />}>
              {isDriver
                ? <DriverMoreTab onClose={closeSettings} />
                : <MobileMoreTab onNavigate={handleNavigate} onClose={closeSettings} />
              }
            </Suspense>
          </div>
        </>
      )}

      {/* ── DVIR PRE-TRIP OVERLAY ── */}
      {showDVIR && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 250, background: 'var(--bg)',
          display: 'flex', flexDirection: 'column', overflow: 'auto',
          animation: 'qOverlayIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
          paddingTop: 'env(safe-area-inset-top, 0px)',
        }}>
          <div style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px', borderBottom: '1px solid var(--border)',
          }}>
            <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5 }}>PRE-TRIP INSPECTION</span>
            <button onClick={() => { setShowDVIR(false); qLocation.dismissDVIR(dvirLoad?.id || dvirLoad?.load_id) }}
              style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic icon={X} size={16} color="var(--muted)" />
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'auto' }}>
            <Suspense fallback={<TabLoader />}>
              <DVIROverlay
                myDriver={isDriver ? (ctx.drivers || []).find(d => d.user_id === user?.id) || {} : {}}
                vehicles={ctx.vehicles || []}
                BackButton={() => (
                  <button onClick={() => setShowDVIR(false)}
                    style={{ padding: '8px 16px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: "'DM Sans',sans-serif" }}>
                    Done
                  </button>
                )}
              />
            </Suspense>
          </div>
        </div>
      )}

      {/* ── Q CHAT OVERLAY ── */}
      {chatOpen && (
        <>
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
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <MobileChatTab onNavigate={(tab, extra) => { setChatOpen(false); handleNavigate(tab, extra) }} initialMessage={chatInitMsg} greetingContext={qGreetingForChat} isOverlay autoCall={chatAutoCall} qLocation={qLocation} />
            </div>
          </div>
        </>
      )}

      {/* ── BOTTOM NAV: [Loads] [Q] [Money] ── */}
      <div style={{
        flexShrink: 0,
        minHeight: 64,
        background: 'var(--surface)',
        borderTop: '1px solid rgba(255,255,255,0.04)',
        boxShadow: '0 -2px 20px rgba(0,0,0,0.1)',
        display: 'flex',
        alignItems: 'center',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        position: 'relative',
      }}>
        {/* Loads tab — left */}
        <button onClick={() => { haptic('light'); setActiveTab('loads'); setMoneySubTab(null) }}
          className="premium-btn"
          style={{
            flex: 2, background: 'none', border: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '12px 0', position: 'relative',
          }}>
          <div style={{ position: 'relative' }}>
            <Ic icon={Package} size={22}
              color={activeTab === 'loads' ? 'var(--accent)' : 'var(--muted)'}
              strokeWidth={activeTab === 'loads' ? 2.5 : 1.5}
            />
            {activeLoads.length > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -10,
                fontSize: 9, fontWeight: 800, background: 'var(--danger)', color: '#fff',
                borderRadius: 10, padding: '2px 5px', minWidth: 16, textAlign: 'center',
                lineHeight: '12px', animation: 'badgePop 0.3s ease',
                boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
              }}>{activeLoads.length}</span>
            )}
          </div>
          <span style={{
            fontSize: 10, fontWeight: activeTab === 'loads' ? 800 : 600,
            color: activeTab === 'loads' ? 'var(--accent)' : 'var(--muted)',
            letterSpacing: 0.5,
            transition: 'color 0.2s ease',
          }}>Loads</span>
          {activeTab === 'loads' && (
            <div style={{
              position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
              width: 24, height: 3, borderRadius: 2, background: 'var(--accent)',
              boxShadow: '0 1px 6px rgba(240,165,0,0.4)',
            }} />
          )}
        </button>

        {/* Q Center Button — premium floating gold orb */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', position: 'relative' }}>
          <button
            onTouchStart={onQTouchStart}
            onTouchEnd={onQTouchEnd}
            onMouseDown={onQTouchStart}
            onMouseUp={onQTouchEnd}
            onClick={onQClick}
            className="premium-btn"
            style={{
              width: 62, height: 62, borderRadius: '50%',
              background: qState.state === 'alert'
                ? 'linear-gradient(145deg, #ef4444, #dc2626)'
                : 'linear-gradient(145deg, #f5b800, #e09000)',
              border: '4px solid var(--bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'absolute', top: -24,
              boxShadow: qState.state === 'alert'
                ? '0 4px 24px rgba(239,68,68,0.5), 0 0 0 0 rgba(239,68,68,0.2)'
                : '0 4px 24px rgba(240,165,0,0.45), 0 8px 32px rgba(240,165,0,0.2)',
              animation: qState.state === 'alert' ? 'qCenterPulse 2s ease-in-out infinite' : 'none',
              transform: qPressed ? 'scale(0.88)' : 'scale(1)',
              transition: 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            {/* Outer ring for premium feel */}
            <div style={{
              position: 'absolute', inset: -8, borderRadius: '50%',
              border: '1px solid rgba(240,165,0,0.15)',
              animation: qPressed ? 'ringExpand 0.4s ease forwards' : 'none',
              pointerEvents: 'none',
            }} />
            <span style={{
              fontFamily: "'Bebas Neue',sans-serif", fontSize: 26,
              color: qState.state === 'alert' ? '#fff' : '#000',
              fontWeight: 800, lineHeight: 1,
              textShadow: qState.state === 'alert' ? 'none' : '0 1px 2px rgba(0,0,0,0.1)',
            }}>Q</span>
          </button>
        </div>

        {/* Money tab — right */}
        <button onClick={() => { haptic('light'); setActiveTab('money'); setMoneySubTab(null) }}
          className="premium-btn"
          style={{
            flex: 2, background: 'none', border: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            padding: '12px 0', position: 'relative',
          }}>
          <div style={{ position: 'relative' }}>
            <Ic icon={DollarSign} size={22}
              color={activeTab === 'money' ? 'var(--accent)' : 'var(--muted)'}
              strokeWidth={activeTab === 'money' ? 2.5 : 1.5}
            />
            {unpaidInvoices.length > 0 && (
              <span style={{
                position: 'absolute', top: -5, right: -10,
                fontSize: 9, fontWeight: 800, background: 'var(--danger)', color: '#fff',
                borderRadius: 10, padding: '2px 5px', minWidth: 16, textAlign: 'center',
                lineHeight: '12px', animation: 'badgePop 0.3s ease',
                boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
              }}>{unpaidInvoices.length}</span>
            )}
          </div>
          <span style={{
            fontSize: 10, fontWeight: activeTab === 'money' ? 800 : 600,
            color: activeTab === 'money' ? 'var(--accent)' : 'var(--muted)',
            letterSpacing: 0.5,
            transition: 'color 0.2s ease',
          }}>Money</span>
          {activeTab === 'money' && (
            <div style={{
              position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)',
              width: 24, height: 3, borderRadius: 2, background: 'var(--accent)',
              boxShadow: '0 1px 6px rgba(240,165,0,0.4)',
            }} />
          )}
        </button>
      </div>

      <style>{mobileAnimations + `
     .hide-scrollbar::-webkit-scrollbar { display: none; }
     .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
   `}</style>
    </div>
  )
}
