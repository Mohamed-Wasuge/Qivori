import { useState, useCallback, useRef, useMemo, useEffect, lazy, Suspense } from 'react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { useSubscription } from '../../hooks/useSubscription'
import useQLocation from '../../hooks/useQLocation'
import { Package, DollarSign, X, Clock, Settings, Sparkles, CheckCircle, Phone, Menu, Home, Zap } from 'lucide-react'
import { Ic, mobileAnimations, getQSystemState, haptic, fmt$ } from './shared'
import * as db from '../../lib/database'
import { apiFetch } from '../../lib/api'

// Lazy-load all tabs — only loads the tab JS when first rendered
const LoadOfferPopup = lazy(() => import('./LoadOfferPopup'))
const AutoShell = lazy(() => import('../auto/AutoShell'))
// Q Hunt experience — brought back as a tab inside MobileShell, not a replacement shell
const AutoHome = lazy(() => import('../auto/AutoHome'))
const AutoNegotiation = lazy(() => import('../auto/AutoNegotiation'))
const AutoCardOnFile = lazy(() => import('../auto/AutoCardOnFile'))
const MobileHomeTab = lazy(() => import('./MobileHomeTab'))
const MobileLoadBoard = lazy(() => import('./MobileLoadBoard'))
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

  // ── AutoShell fork DISABLED 2026-04-08 ──────────────────────────
  // 3% Autonomous Fleet users now route through the full MobileShell
  // (this file) so they get DVIR, ELD/HOS, IFTA, Invoices, Expenses,
  // CSA, Clearinghouse, Profit dashboard, and every other feature
  // that's already built. Hiding the full TMS behind AutoShell was
  // undercutting our competitive advantage vs Numeo / DispatchMVP.
  //
  // The AutoShell components stay in src/components/auto/ and will
  // be reintroduced as a "Q Hunt" tab inside this shell, not as a
  // replacement shell.

  const { isTrialing, trialDaysLeft, isActive } = useSubscription()
  const trialExpired = !demoMode && !isActive && profile?.subscription_status && profile.subscription_status !== 'active' && profile.subscription_status !== 'trialing' && profile.subscription_status !== 'none'
  const ctx = useCarrier() || {}
  const activeLoads = ctx.activeLoads || []
  const totalRevenue = ctx.totalRevenue || 0
  const unpaidInvoices = ctx.unpaidInvoices || []
  const qState = getQSystemState(ctx)

  const [activeTab, setActiveTab] = useState('home')
  const [driverLoadDetail, setDriverLoadDetail] = useState(false) // When true, show MobileLoadsTab for driver
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

  // ── UBER POPUP: single source of truth ──
  const [popupLoad, setPopupLoad] = useState(null)
  // Use ref for dismissed set — persisted in localStorage so dismissals survive refresh
  const dismissedRef = useRef(null)
  if (dismissedRef.current === null) {
    try {
      const stored = localStorage.getItem('q_dismissed_offers')
      dismissedRef.current = new Set(stored ? JSON.parse(stored) : [])
    } catch { dismissedRef.current = new Set() }
  }
  const persistDismissed = () => {
    try { localStorage.setItem('q_dismissed_offers', JSON.stringify([...dismissedRef.current])) } catch {}
  }

  // ── Web Audio sound effects (refs to avoid re-render loops) ──
  const audioCtxRef = useRef(null)

  const getAudioCtx = () => {
    if (!audioCtxRef.current) {
      try { audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)() } catch {}
    }
    if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume().catch(() => {})
    return audioCtxRef.current
  }

  const playTone = (freq, duration = 0.15, type = 'sine', volume = 0.5, delay = 0) => {
    const audio = getAudioCtx()
    if (!audio) return
    const t0 = audio.currentTime + delay
    const osc = audio.createOscillator()
    const gain = audio.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t0)
    gain.gain.setValueAtTime(0, t0)
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
    osc.connect(gain).connect(audio.destination)
    osc.start(t0)
    osc.stop(t0 + duration + 0.05)
  }

  // New load — bright rising 3-tone (Uber-style ride request)
  const playNewLoadSound = () => {
    playTone(880, 0.13, 'sine', 0.55, 0)
    playTone(1318, 0.13, 'sine', 0.55, 0.11)
    playTone(1760, 0.22, 'sine', 0.55, 0.22)
  }
  // Accept — major chord burst
  const playAcceptSound = () => {
    playTone(1046, 0.1, 'triangle', 0.5, 0)
    playTone(1318, 0.14, 'triangle', 0.5, 0.06)
    playTone(1568, 0.2, 'triangle', 0.5, 0.12)
  }
  // Pass — soft minor descent
  const playPassSound = () => {
    playTone(523, 0.1, 'sine', 0.3, 0)
    playTone(392, 0.14, 'sine', 0.3, 0.08)
  }

  // Detect first unseen offer — uses ref for dismissed set, no re-render loops
  // Effect only depends on the loads array reference
  const ctxLoads = ctx.loads
  useEffect(() => {
    if (popupLoad) return
    if (!ctxLoads || ctxLoads.length === 0) return
    const unseen = ctxLoads.find(l => {
      const s = (l.status || '').toLowerCase()
      if (s !== 'assigned to driver' && s !== 'dispatched' && s !== 'booked') return false
      const lid = l.id || l.load_id || l.loadId
      return !dismissedRef.current.has(lid)
    })
    if (unseen) {
      setPopupLoad(unseen)
      haptic('success')
      playNewLoadSound()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctxLoads, popupLoad])

  // ── ACCEPT: optimistic, non-blocking, instant feedback ──
  const popupAccept = useCallback((load) => {
    if (!load) return
    const lid = load.id || load.load_id || load.loadId
    haptic('success')
    playAcceptSound()

    // Mark dismissed IMMEDIATELY so it won't re-pop
    dismissedRef.current.add(lid)
    persistDismissed()

    // Card animation handles its own dismissal — clear popup after 1100ms
    setTimeout(() => setPopupLoad(null), 1100)

    // Q decision log — accept
    db.createDecision({
      type: 'load_accepted',
      decision: 'accept',
      confidence: 95,
      summary: `Accepted ${load.broker_name || 'broker'} load — ${(load.origin || '').split(',')[0]} → ${(load.destination || load.dest || '').split(',')[0]}`,
      reasoning: [`$${Number(load.gross || load.rate || 0).toLocaleString()} · ${Number(load.miles || 0)}mi`],
      payload: { gross: Number(load.gross || load.rate || 0), miles: Number(load.miles || 0) },
      load_id: lid,
      driver_id: myDriverForGps?.id || null,
    }).catch(() => {})

    // ── Background work — never blocks UI ──
    ;(async () => {
      try {
        // Optimistic status update
        ctx.updateLoadStatus?.(lid, 'Driver Accepted')

        const brokerPhone = load.broker_phone || load.brokerPhone || ''
        if (!brokerPhone) {
          ctx.updateLoadStatus?.(lid, 'En Route to Pickup')
          showToast?.('info', 'Accepted', 'No broker phone on file')
          return
        }

        const res = await apiFetch('/api/retell-broker-call', {
          method: 'POST',
          body: JSON.stringify({
            phone: brokerPhone,
            brokerName: load.broker_name || load.broker || '',
            loadId: lid,
            rate: Number(load.gross || load.rate || 0),
            miles: Number(load.miles || 0),
            originCity: (load.origin || '').split(',')[0].trim(),
            destinationCity: (load.destination || load.dest || '').split(',')[0].trim(),
            equipment: load.equipment || 'dry van',
            loadDetails: `${(load.origin || '').split(',')[0]} → ${(load.destination || load.dest || '').split(',')[0]}. Rate: $${load.gross || load.rate || 0}${load.miles ? ` (${load.miles}mi)` : ''}. Equipment: ${load.equipment || 'dry van'}.`,
            driverName: profile?.full_name || 'Driver',
          }),
        })
        const data = res?.json ? await res.json() : res
        if (data?.call_id) {
          showToast?.('success', 'Q is calling broker', `${load.broker_name || 'Broker'} — negotiating now`)
        } else {
          showToast?.('error', 'Call failed', data?.error || 'Try again from Loads')
        }
      } catch (err) {
        showToast?.('error', 'Call failed', err?.message || 'Try again from Loads')
      }
    })()
  }, [ctx, profile, showToast])

  // ── PASS: instant local dismiss, no DB write ──
  const popupPass = useCallback((load) => {
    if (!load) return
    const lid = load.id || load.load_id || load.loadId
    haptic()
    playPassSound()
    dismissedRef.current.add(lid)
    persistDismissed()
    setTimeout(() => setPopupLoad(null), 350)

    // Q decision log — pass
    db.createDecision({
      type: 'load_passed',
      decision: 'reject',
      confidence: 80,
      summary: `Passed on ${load.broker_name || 'broker'} load — ${(load.origin || '').split(',')[0]} → ${(load.destination || load.dest || '').split(',')[0]}`,
      reasoning: [`$${Number(load.gross || load.rate || 0).toLocaleString()} · ${Number(load.miles || 0)}mi`],
      payload: { gross: Number(load.gross || load.rate || 0), miles: Number(load.miles || 0) },
      load_id: lid,
    }).catch(() => {})
  }, [])

  // ── Q AUTONOMOUS LOCATION ENGINE ──
  const myDriverForGps = useMemo(
    () => (isDriver ? (ctx.drivers || []).find(d => d.user_id === user?.id) : null),
    [isDriver, ctx.drivers, user?.id]
  )
  const qLocation = useQLocation({
    activeLoads,
    allLoads: ctx.loads || [],
    enabled: activeLoads.length > 0,
    companyAddress: ctx.company?.address || ctx.company?.city,
    driverId: myDriverForGps?.id || null,

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
      // Surface to carrier dashboard
      db.createAlert({
        type: 'arrive_pickup', severity: 'success',
        title: `Arrived at ${shipperName}`,
        message: `${load.driver_name || 'Driver'} checked in at pickup`,
        driver_id: myDriverForGps?.id || null, load_id: load.id || null,
        payload: { lat: coords.lat, lng: coords.lng },
      }).catch(() => {})
      // Advance status
      ctx.updateLoadStatus?.(lid, 'At Pickup')
      haptic('success')
      showToast?.('success', 'Q Auto Check-In', `Arrived at ${shipperName}`)
      // Open Q with announcement
      openQ(null, `Arrived at **${shipperName}**. Checking you in automatically. GPS recorded. Status → **At Pickup**.`)
    }, [ctx, showToast, myDriverForGps]),

    // Auto-arrival at delivery — same pattern
    onArrivedAtDelivery: useCallback((load, coords) => {
      const lid = load.loadId || load.load_id || load.load_number || load.id
      const receiverName = load.consignee_name || load.destination || load.dest || 'receiver'
      db.updateLoad(load.id, {
        delivery_checkin_time: new Date().toISOString(),
        delivery_checkin_lat: coords.lat,
        delivery_checkin_lng: coords.lng,
      }).catch(() => {})
      db.createAlert({
        type: 'arrive_delivery', severity: 'success',
        title: `Arrived at ${receiverName}`,
        message: `${load.driver_name || 'Driver'} checked in at delivery`,
        driver_id: myDriverForGps?.id || null, load_id: load.id || null,
        payload: { lat: coords.lat, lng: coords.lng },
      }).catch(() => {})
      ctx.updateLoadStatus?.(lid, 'At Delivery')
      haptic('success')
      showToast?.('success', 'Q Auto Check-In', `Arrived at ${receiverName}`)
      openQ(null, `Arrived at **${receiverName}**. Checking you in. GPS recorded. Status → **At Delivery**. Snap your POD when unloaded.`)
    }, [ctx, showToast, myDriverForGps]),

    // Auto-departure from pickup — driver loaded and rolling out
    onDepartedPickup: useCallback((load, coords) => {
      const lid = load.loadId || load.load_id || load.load_number || load.id
      const dest = load.destination || load.dest || '?'
      db.updateLoad(load.id, {
        pickup_checkout_time: new Date().toISOString(),
        pickup_checkout_lat: coords.lat,
        pickup_checkout_lng: coords.lng,
      }).catch(() => {})
      db.createAlert({
        type: 'depart_pickup', severity: 'info',
        title: `Loaded — In Transit to ${dest}`,
        message: `${load.driver_name || 'Driver'} departed pickup`,
        driver_id: myDriverForGps?.id || null, load_id: load.id || null,
        payload: { lat: coords.lat, lng: coords.lng, miles: load.miles },
      }).catch(() => {})
      ctx.updateLoadStatus?.(lid, 'In Transit')
      haptic('success')
      showToast?.('', 'Q: Rolling Out', `In Transit → ${dest}`)
      openQ(null, `Rolling out. Marked as **In Transit** → **${dest}**. ${load.miles ? `${load.miles} miles to delivery.` : ''} Drive safe.`)
    }, [ctx, showToast, myDriverForGps]),

    // Auto-departure from delivery — load delivered
    onDepartedDelivery: useCallback((load, coords) => {
      const lid = load.loadId || load.load_id || load.load_number || load.id
      const status = (load.status || '').toLowerCase()
      if (status !== 'delivered' && status !== 'at delivery') {
        ctx.updateLoadStatus?.(lid, 'Delivered')
      }
      db.createAlert({
        type: 'depart_delivery', severity: 'success',
        title: 'Load delivered',
        message: `${load.driver_name || 'Driver'} completed delivery`,
        driver_id: myDriverForGps?.id || null, load_id: load.id || null,
        payload: { lat: coords?.lat, lng: coords?.lng },
      }).catch(() => {})
      haptic('success')
      showToast?.('success', 'Q: Load Delivered', 'Upload POD to get paid')
      openQ(null, `Load delivered. Upload your **POD** and **BOL** so I can generate the invoice and get you paid.`)
    }, [ctx, showToast, myDriverForGps]),

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
      db.createAlert({
        type: 'detention_start', severity: 'warning',
        title: `Detention at ${locationName}`,
        message: `2hr free time expired — billing $75/hr`,
        driver_id: myDriverForGps?.id || null, load_id: load.id || null,
        payload: { locationType, rate: 75 },
      }).catch(() => {})
      haptic('heavy')
      showToast?.('error', 'Detention Started', `2hr free time expired at ${locationName}`)
      openQ(null, `**Detention started** at ${locationName}. Free time (2 hours) expired. Timer running at **$75/hr**. I'll track the charges automatically.`)
    }, [showToast, myDriverForGps]),

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
    // Driver: 'loads' from DriverHomeTab means show detailed load management
    if (tab === 'loads' && isDriver) {
      setDriverLoadDetail(true)
      setActiveTab('loads')
      return
    }
    // Map old tab IDs to new structure
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

  // Q center button handlers — tap opens Q tab, no long-press voice
  // (voice call removed 2026-04-10: cost control + abuse risk)
  const onQTouchStart = () => { setQPressed(true) }
  const onQTouchEnd = () => { setQPressed(false) }
  const onQClick = () => {
    if (!chatOpen) {
      haptic('light')
      setActiveTab('q')
      setMoneySubTab(null)
      setDriverLoadDetail(false)
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

      {/* ═══ UBER POPUP — fullscreen load offer (memoized component) ═══ */}
      {popupLoad && (
        <Suspense fallback={null}>
          <LoadOfferPopup load={popupLoad} onAccept={popupAccept} onPass={popupPass} />
        </Suspense>
      )}

      {/* ── TAB CONTENT ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <Suspense fallback={<TabLoader />}>
          {isDriver ? (
            <>
              {/* Driver: default = load offers (accept/pass), detail = load management */}
              {activeTab === 'loads' && !driverLoadDetail && <DriverHomeTab onNavigate={handleNavigate} onOpenQ={(msg) => { setChatInitMsg(msg); setChatOpen(true) }} />}
              {activeTab === 'loads' && driverLoadDetail && <MobileLoadsTab />}
              {activeTab === 'money' && <DriverPayTab />}
              {activeTab === 'q' && <AutoHome />}
            </>
          ) : (
            <>
              {activeTab === 'home' && <MobileHomeTab onNavigate={handleNavigate} onOpenQ={openChat} />}
              {activeTab === 'loads' && <MobileLoadsTab />}
              {activeTab === 'find' && <MobileLoadBoard onNavigate={handleNavigate} />}
              {activeTab === 'money' && <MobileMoneyTab initialSubTab={moneySubTab} />}
              {activeTab === 'q' && <AutoHome />}
              {activeTab === 'more' && <MobileMoreTab onNavigate={handleNavigate} />}
            </>
          )}
        </Suspense>
      </div>

      {/* ── Q overlays — fire globally regardless of active tab ── */}
      {/*    AutoNegotiation: pops fullscreen when there's an Offered load    */}
      {/*    AutoCardOnFile:  pops bottom sheet after first booked load        */}
      <Suspense fallback={null}>
        <AutoNegotiation />
      </Suspense>
      {profile && !profile.stripe_customer_id && !profile.payment_method_last4 && (() => {
        const hasBookedLoad = (ctx.loads || []).some((l) =>
          ['Booked', 'Dispatched', 'En Route To Pickup', 'Arrived Pickup', 'Loaded',
           'En Route', 'Arrived Delivery', 'Delivered'].includes(l.status)
        )
        const latestBooked = (ctx.loads || []).find((l) => l.status === 'Booked')
        if (!hasBookedLoad) return null
        return (
          <Suspense fallback={null}>
            <AutoCardOnFile
              loadAmount={Number(latestBooked?.rate || latestBooked?.gross_pay || 2500)}
              onComplete={() => {}}
              onClose={() => {}}
            />
          </Suspense>
        )
      })()}

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

      {/* ── BOTTOM NAV: [Home] [Loads] [Q] [Money] [More] ── */}
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
        {/* Home tab */}
        <button onClick={() => { haptic('light'); setActiveTab('home'); setDriverLoadDetail(false); setMoneySubTab(null) }}
          className="premium-btn"
          style={{
            flex: 1, background: 'none', border: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '10px 0', position: 'relative',
          }}>
          <Ic icon={Home} size={20}
            color={activeTab === 'home' ? 'var(--accent)' : 'var(--muted)'}
            strokeWidth={activeTab === 'home' ? 2.5 : 1.5}
          />
          <span style={{
            fontSize: 9, fontWeight: activeTab === 'home' ? 800 : 600,
            color: activeTab === 'home' ? 'var(--accent)' : 'var(--muted)',
            letterSpacing: 0.3,
          }}>Home</span>
          {activeTab === 'home' && (
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 20, height: 2.5, borderRadius: 2, background: 'var(--accent)', boxShadow: '0 1px 6px rgba(240,165,0,0.4)' }} />
          )}
        </button>

        {/* Loads tab */}
        <button onClick={() => { haptic('light'); setActiveTab('loads'); setDriverLoadDetail(false); setMoneySubTab(null) }}
          className="premium-btn"
          style={{
            flex: 1, background: 'none', border: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '10px 0', position: 'relative',
          }}>
          <div style={{ position: 'relative' }}>
            <Ic icon={Package} size={20}
              color={activeTab === 'loads' ? 'var(--accent)' : 'var(--muted)'}
              strokeWidth={activeTab === 'loads' ? 2.5 : 1.5}
            />
            {activeLoads.length > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -8,
                fontSize: 8, fontWeight: 800, background: 'var(--danger)', color: '#fff',
                borderRadius: 8, padding: '1px 4px', minWidth: 14, textAlign: 'center',
                lineHeight: '11px', boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
              }}>{activeLoads.length}</span>
            )}
          </div>
          <span style={{
            fontSize: 9, fontWeight: activeTab === 'loads' ? 800 : 600,
            color: activeTab === 'loads' ? 'var(--accent)' : 'var(--muted)',
            letterSpacing: 0.3,
          }}>Loads</span>
          {activeTab === 'loads' && (
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 20, height: 2.5, borderRadius: 2, background: 'var(--accent)', boxShadow: '0 1px 6px rgba(240,165,0,0.4)' }} />
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
              width: 56, height: 56, borderRadius: '50%',
              background: qState.state === 'alert'
                ? 'linear-gradient(145deg, #ef4444, #dc2626)'
                : 'linear-gradient(145deg, #f5b800, #e09000)',
              border: '3px solid var(--bg)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              position: 'absolute', top: -22,
              boxShadow: qState.state === 'alert'
                ? '0 4px 24px rgba(239,68,68,0.5)'
                : '0 4px 24px rgba(240,165,0,0.45), 0 8px 32px rgba(240,165,0,0.2)',
              animation: qState.state === 'alert' ? 'qCenterPulse 2s ease-in-out infinite' : 'none',
              transform: qPressed ? 'scale(0.88)' : 'scale(1)',
              transition: 'transform 0.15s cubic-bezier(0.4, 0, 0.2, 1)',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <div style={{
              position: 'absolute', inset: -7, borderRadius: '50%',
              border: '1px solid rgba(240,165,0,0.15)',
              animation: qPressed ? 'ringExpand 0.4s ease forwards' : 'none',
              pointerEvents: 'none',
            }} />
            <span style={{
              fontFamily: "'Bebas Neue',sans-serif", fontSize: 24,
              color: qState.state === 'alert' ? '#fff' : '#000',
              fontWeight: 800, lineHeight: 1,
            }}>Q</span>
          </button>
        </div>

        {/* Money tab */}
        <button onClick={() => { haptic('light'); setActiveTab('money'); setMoneySubTab(null) }}
          className="premium-btn"
          style={{
            flex: 1, background: 'none', border: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '10px 0', position: 'relative',
          }}>
          <div style={{ position: 'relative' }}>
            <Ic icon={DollarSign} size={20}
              color={activeTab === 'money' ? 'var(--accent)' : 'var(--muted)'}
              strokeWidth={activeTab === 'money' ? 2.5 : 1.5}
            />
            {unpaidInvoices.length > 0 && (
              <span style={{
                position: 'absolute', top: -4, right: -8,
                fontSize: 8, fontWeight: 800, background: 'var(--danger)', color: '#fff',
                borderRadius: 8, padding: '1px 4px', minWidth: 14, textAlign: 'center',
                lineHeight: '11px', boxShadow: '0 2px 6px rgba(239,68,68,0.4)',
              }}>{unpaidInvoices.length}</span>
            )}
          </div>
          <span style={{
            fontSize: 9, fontWeight: activeTab === 'money' ? 800 : 600,
            color: activeTab === 'money' ? 'var(--accent)' : 'var(--muted)',
            letterSpacing: 0.3,
          }}>Money</span>
          {activeTab === 'money' && (
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 20, height: 2.5, borderRadius: 2, background: 'var(--accent)', boxShadow: '0 1px 6px rgba(240,165,0,0.4)' }} />
          )}
        </button>

        {/* More tab */}
        <button onClick={() => { haptic('light'); setActiveTab('more'); setMoneySubTab(null); setDriverLoadDetail(false) }}
          className="premium-btn"
          style={{
            flex: 1, background: 'none', border: 'none',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '10px 0', position: 'relative',
          }}>
          <Ic icon={Menu} size={20}
            color={activeTab === 'more' ? 'var(--accent)' : 'var(--muted)'}
            strokeWidth={activeTab === 'more' ? 2.5 : 1.5}
          />
          <span style={{
            fontSize: 9, fontWeight: activeTab === 'more' ? 800 : 600,
            color: activeTab === 'more' ? 'var(--accent)' : 'var(--muted)',
            letterSpacing: 0.3,
          }}>More</span>
          {activeTab === 'more' && (
            <div style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 20, height: 2.5, borderRadius: 2, background: 'var(--accent)', boxShadow: '0 1px 6px rgba(240,165,0,0.4)' }} />
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
