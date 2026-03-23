import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import {
  Zap, Send, MapPin, Camera, DollarSign, Package, Truck, Phone,
  Navigation, Receipt, Plus, ChevronRight, ArrowLeft, Home, X,
  CheckCircle, Mic, FileText, Clock, Volume2, VolumeX, ScanLine, Download, Mail, Bell, Globe
} from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'
import { Ic, haptic, haversine, ActionBadge, getGPSCoords as getGPSCoordsHelper, mobileAnimations } from './shared'

let BOARD_LOADS = []

// Simple markdown renderer for chat messages
function renderMarkdown(text) {
  if (!text) return text
  const parts = []
  let remaining = text
  let key = 0
  // Split by **bold**, newlines, and [links](url)
  const regex = /(\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)|\n)/g
  let lastIndex = 0
  let match
  while ((match = regex.exec(remaining)) !== null) {
    if (match.index > lastIndex) {
      parts.push(remaining.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={key++} style={{ fontWeight: 800, color: 'var(--accent)' }}>{match[2]}</strong>)
    } else if (match[3] && match[4]) {
      parts.push(<a key={key++} href={match[4]} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>{match[3]}</a>)
    } else if (match[0] === '\n') {
      parts.push(<br key={key++} />)
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < remaining.length) {
    parts.push(remaining.slice(lastIndex))
  }
  return parts.length > 0 ? parts : text
}

export default function MobileChatTab({ onNavigate, initialMessage, greetingContext, isOverlay, autoCall }) {
  const { logout, showToast, subscription, user, profile } = useApp()
  const { language: currentLang, setLanguage } = useTranslation()
  const ctx = useCarrier() || {}
  const loads = ctx.loads || []
  const activeLoads = ctx.activeLoads || []
  const invoices = ctx.invoices || []
  const expenses = ctx.expenses || []
  const company = ctx.company || {}
  const totalRevenue = ctx.totalRevenue || 0
  const totalExpenses = ctx.totalExpenses || 0
  const addExpense = ctx.addExpense || (() => {})
  const logCheckCall = ctx.logCheckCall || (() => {})
  const updateLoadStatus = ctx.updateLoadStatus || (() => {})
  const updateInvoiceStatus = ctx.updateInvoiceStatus || (() => {})
  const unpaidInvoices = ctx.unpaidInvoices || []
  const addLoad = ctx.addLoad || (() => {})
  const qMemories = ctx.qMemories || []
  const addQMemory = ctx.addQMemory || (() => {})
  const brokerStats = ctx.brokerStats || []

  const dataReady = ctx.dataReady !== false

  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem('qivori_chat_history')
      return saved ? JSON.parse(saved) : []
    } catch { return [] }
  })
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(true)
  const [pendingUpload, setPendingUpload] = useState(null)
  const [gpsLocation, setGpsLocation] = useState(null)
  const [listening, setListening] = useState(false)
  const [voiceText, setVoiceText] = useState('')
  const [speakerOn, setSpeakerOn] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [handsFree, setHandsFree] = useState(false)
  const [inCall, setInCall] = useState(false)
  const [callConnecting, setCallConnecting] = useState(false)
  const retellClientRef = useRef(null) // legacy — kept for safety
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const rateConInputRef = useRef(null)
  const recognitionRef = useRef(null)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [showNotifBanner, setShowNotifBanner] = useState(false)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const contextMemoryRef = useRef([])
  const lastMemoryExtractRef = useRef(0)
  const [hosStartTime, setHosStartTime] = useState(() => {
    const saved = localStorage.getItem('qivori_hos_start')
    return saved ? parseInt(saved) : null
  })
  const [showLoadDetail, setShowLoadDetail] = useState(false)
  const [showLangPicker, setShowLangPicker] = useState(false)
  const langPickerRef = useRef(null)
  const hosWarningShownRef = useRef(false)
  const escalateAttemptRef = useRef(0)
  const loadingSafetyRef = useRef(null)
  const sendMessageRef = useRef(null)
  const lastInputWasVoiceRef = useRef(false)
  const startListeningRef = useRef(null)

  // ── PROACTIVE LOAD FINDING AGENT state ──────────────────
  const proactiveTriggeredRef = useRef(false)
  const proactiveDismissedRef = useRef(null)
  const proactiveLoadsRef = useRef([])
  const [proactiveLoadId, setProactiveLoadId] = useState(null)

  // ── AI DISPATCH INTELLIGENCE proactive state ──────────────
  const reloadAlertShownRef = useRef({})
  const backhaulAlertShownRef = useRef({})
  const repositionAlertShownRef = useRef(false)
  const weeklyTargetAlertShownRef = useRef(false)

  // Auto-scroll to bottom with smooth behavior
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, loading])

  // Close language picker on outside click
  useEffect(() => {
    if (!showLangPicker) return
    const handler = (e) => {
      if (langPickerRef.current && !langPickerRef.current.contains(e.target)) {
        setShowLangPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [showLangPicker])

  // Persist chat history to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        // Keep last 50 messages to avoid localStorage bloat
        const toSave = messages.slice(-50)
        localStorage.setItem('qivori_chat_history', JSON.stringify(toSave))
      } catch { /* storage full — ignore */ }
    }
    // Auto-extract memories every 10 new messages (text chat)
    if (messages.length > 0 && messages.length - lastMemoryExtractRef.current >= 10 && !inCall) {
      lastMemoryExtractRef.current = messages.length
      extractMemories(messages)
    }
  }, [messages])

  // Fetch live load board data for AI context
  useEffect(() => {
    let cancelled = false
    async function fetchBoard() {
      try {
        const res = await apiFetch('/api/load-board')
        if (!res.ok) return
        const data = await res.json()
        if (!cancelled && data.loads?.length > 0) {
          BOARD_LOADS = data.loads
        }
      } catch { /* silent */ }
    }
    fetchBoard()
    const interval = setInterval(fetchBoard, 15 * 60 * 1000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  // iOS detection for install banner fallback (Safari has no beforeinstallprompt)
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
  const isInStandaloneMode = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone

  // PWA install prompt — capture the event but don't show banner yet
  useEffect(() => {
    if (localStorage.getItem('qivori_install_dismissed')) return
    if (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone) return
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Gate install banner on 2+ user messages so it's not intrusive on first visit
  useEffect(() => {
    if (localStorage.getItem('qivori_install_dismissed')) return
    if (isInStandaloneMode) return
    const userMsgCount = messages.filter(m => m.role === 'user').length
    if (userMsgCount >= 2 && (deferredPrompt || isIOS)) {
      setShowInstallBanner(true)
    }
  }, [messages, deferredPrompt, isIOS, isInStandaloneMode])

  // Online/offline detection + sync
  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => {
      setIsOffline(false)
      showToast('success', 'Back Online', 'Syncing queued actions...')
      navigator.serviceWorker?.ready?.then(reg => {
        reg.active?.postMessage('replay-queue')
        reg.sync?.register('qivori-sync').catch(() => {})
      })
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline) }
  }, [showToast])

  // iOS keyboard: adjust layout when keyboard opens
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => {
      const offset = window.innerHeight - vv.height
      document.documentElement.style.setProperty('--kb-offset', offset + 'px')
    }
    vv.addEventListener('resize', onResize)
    vv.addEventListener('scroll', onResize)
    return () => {
      vv.removeEventListener('resize', onResize)
      vv.removeEventListener('scroll', onResize)
      document.documentElement.style.setProperty('--kb-offset', '0px')
    }
  }, [])

  // Check notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      const timer = setTimeout(() => setShowNotifBanner(true), 3000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleEnableNotifications = async () => {
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        showToast('success', 'Notifications Enabled', 'You\'ll get load alerts and updates')
        const reg = await navigator.serviceWorker?.ready
        if (reg) {
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY || undefined,
          }).catch(() => null)

          if (sub) {
            const { user } = await import('../../lib/supabase').then(m => ({ user: null })).catch(() => ({ user: null }))
            apiFetch('/api/push-subscribe', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ userId: 'anonymous', subscription: sub.toJSON() }),
            }).catch(() => {})
          }
        }
      }
    } catch {}
    setShowNotifBanner(false)
  }

  const handleInstallClick = async () => {
    if (!deferredPrompt) return
    deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') {
      showToast('success', 'Installed!', 'Q added to your home screen')
    }
    setDeferredPrompt(null)
    setShowInstallBanner(false)
    localStorage.setItem('qivori_install_dismissed', '1')
  }

  const handleDismissInstall = () => {
    setShowInstallBanner(false)
    localStorage.setItem('qivori_install_dismissed', '1')
  }

  // Build context for AI
  const driverName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]

  const buildContext = useCallback(() => {
    const active = loads.filter(l => !['Delivered', 'Invoiced'].includes(l.status))
    const delivered = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid')
    const unpaid = invoices.filter(i => i.status !== 'Paid')
    const netProfit = totalRevenue - totalExpenses
    const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(1) : '0'

    // Driver intelligence — lane history & avg RPM per lane
    const laneCounts = {}
    const laneRates = {}
    delivered.forEach(l => {
      const o = (l.origin || '').split(',')[0].trim()
      const d = (l.destination || l.dest || '').split(',')[0].trim()
      if (!o || !d) return
      const lane = `${o}\u2192${d}`
      laneCounts[lane] = (laneCounts[lane] || 0) + 1
      if (!laneRates[lane]) laneRates[lane] = []
      if (Number(l.miles) > 0) laneRates[lane].push(Number(l.rate || l.gross || 0) / Number(l.miles))
    })
    const topLanes = Object.entries(laneCounts)
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([lane, count]) => {
        const rates = laneRates[lane] || []
        const avg = rates.length > 0 ? (rates.reduce((s, r) => s + r, 0) / rates.length).toFixed(2) : '?'
        return `${lane} (${count}x, avg $${avg}/mi)`
      })

    // Overall avg RPM
    const rpmVals = delivered.filter(l => Number(l.miles) > 0 && Number(l.rate || l.gross || 0) > 0)
      .map(l => Number(l.rate || l.gross || 0) / Number(l.miles))
    const avgRpm = rpmVals.length > 0 ? (rpmVals.reduce((s, r) => s + r, 0) / rpmVals.length).toFixed(2) : 'N/A'

    // Expense breakdown by category
    const expByCat = {}
    expenses.forEach(e => { expByCat[e.category] = (expByCat[e.category] || 0) + Number(e.amount || 0) })
    const topExp = Object.entries(expByCat).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([cat, amt]) => `${cat}: $${amt.toLocaleString()}`).join(', ')

    // Overdue invoices (30+ days)
    const now = Date.now()
    const overdue = unpaid.filter(i => (now - new Date(i.created_at || i.date).getTime()) > 30 * 86400000)

    return [
      `DRIVER: ${profile?.full_name || user?.user_metadata?.full_name || 'Driver'} | ${user?.email || ''}`,
      `CARRIER: ${company?.name || 'Unknown'} | MC#: ${company?.mc_number || 'N/A'} | DOT#: ${company?.dot_number || 'N/A'}`,
      `FINANCIALS: Revenue $${totalRevenue.toLocaleString()} | Expenses $${totalExpenses.toLocaleString()} | Net $${netProfit.toLocaleString()} | Margin ${margin}%`,
      `AVG RPM: $${avgRpm} | Completed loads: ${delivered.length}`,
      topLanes.length > 0 ? `TOP LANES: ${topLanes.join(' | ')}` : '',
      `ACTIVE (${active.length}): ${active.map(l => `${l.load_id || l.id} ${l.origin}\u2192${l.destination} $${Number(l.rate || 0).toLocaleString()} [${l.status}]`).join(' | ') || 'none'}`,
      `UNPAID: ${unpaid.length} totaling $${unpaid.reduce((s, i) => s + Number(i.amount || 0), 0).toLocaleString()}`,
      overdue.length > 0 ? `\u26A0 OVERDUE 30+ DAYS: ${overdue.length} invoices $${overdue.reduce((s, i) => s + Number(i.amount || 0), 0).toLocaleString()}` : '',
      topExp ? `EXPENSES: ${topExp}` : '',
      brokerStats.length > 0 ? `BROKER INTEL: ${brokerStats.slice(0, 5).map(b => {
        let risk = ''
        if (b.avgDaysToPay !== null && b.avgDaysToPay < 20 && b.onTimeRate !== null && b.onTimeRate > 90) risk = ' [TRUSTED]'
        else if (b.avgDaysToPay !== null && b.avgDaysToPay > 45) risk = ' [SLOW PAYER]'
        else if (b.onTimeRate !== null && b.onTimeRate < 70) risk = ' [UNRELIABLE]'
        return `${b.name} (${b.totalLoads} loads, $${b.avgRpm}/mi RPM, ${b.avgDaysToPay !== null ? b.avgDaysToPay + 'd pay' : 'pay N/A'}, ${b.onTimeRate !== null ? b.onTimeRate + '% reliable' : 'reliability N/A'}${risk})`
      }).join(' | ')}` : '',
      gpsLocation ? `LOCATION: ${gpsLocation}` : '',
      qMemories.length > 0 ? `\nQ MEMORY (things you remember about this driver):\n${qMemories.slice(0, 20).map(m => `- [${m.memory_type}] ${m.content}`).join('\n')}` : '',
    ].filter(Boolean).join('\n')
  }, [loads, invoices, expenses, totalRevenue, totalExpenses, company, gpsLocation, profile, user, qMemories])

  // Build load board context for AI
  const buildLoadBoard = useCallback(() => {
    const boardData = loads.length > 0 ? loads : BOARD_LOADS
    return boardData.map(l =>
      `${l.load_number || l.id} | ${l.origin_city || l.origin || ''}, ${l.origin_state || ''} \u2192 ${l.destination_city || l.dest || ''}, ${l.destination_state || ''} | ${l.miles || 0}mi | $${l.rate || 0} | ${l.equipment_type || l.equipment || ''} | ${l.broker_name || l.broker || ''}`
    ).join('\n') || 'No loads available yet.'
  }, [loads])

  // ── HOS 11-hour driving clock ──────────────────────
  const getHosRemaining = useCallback(() => {
    if (!hosStartTime) return null
    const elapsed = (Date.now() - hosStartTime) / 3600000
    const remaining = Math.max(0, 11 - elapsed)
    return { elapsed: +elapsed.toFixed(1), remaining: +remaining.toFixed(1) }
  }, [hosStartTime])

  // Start HOS clock when driver departs
  useEffect(() => {
    const inTransit = activeLoads.find(l => l.status === 'In Transit' || l.status === 'Loaded')
    if (inTransit && !hosStartTime) {
      const now = Date.now()
      setHosStartTime(now)
      localStorage.setItem('qivori_hos_start', String(now))
    }
  }, [activeLoads, hosStartTime])

  // HOS proactive warning — check every 5 min
  useEffect(() => {
    if (!hosStartTime) return
    const check = () => {
      const hos = getHosRemaining()
      if (hos && hos.remaining <= 2 && hos.remaining > 0 && !hosWarningShownRef.current) {
        hosWarningShownRef.current = true
        const hrs = hos.remaining < 1 ? `${Math.round(hos.remaining * 60)} minutes` : `${hos.remaining} hours`
        setMessages(m => [...m, {
          role: 'assistant',
          content: `**HOS Warning** \u2014 You have ${hrs} left on your 11-hour driving clock. Start looking for a safe place to stop.`,
        }])
        speak(`Warning. You have ${hrs} left on your 11-hour driving clock. Start looking for a safe place to stop.`)
      }
    }
    check()
    const interval = setInterval(check, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [hosStartTime, getHosRemaining])

  // Reset HOS
  const resetHOS = useCallback(() => {
    setHosStartTime(null)
    localStorage.removeItem('qivori_hos_start')
    hosWarningShownRef.current = false
  }, [])

  // ── SMART RATE ALERTS — monitor driver's top lanes for rate spikes ──
  const rateAlertShownRef = useRef({})
  useEffect(() => {
    if (!brokerStats.length && !qMemories.length) return
    if (BOARD_LOADS.length === 0) return

    // Get driver's top lanes from their load history
    const delivered = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid')
    const laneAvgs = {}
    delivered.forEach(l => {
      const o = (l.origin || '').split(',')[0].trim()
      const d = (l.destination || l.dest || '').split(',')[0].trim()
      if (!o || !d || !Number(l.miles) || !Number(l.rate || l.gross)) return
      const lane = `${o}\u2192${d}`
      if (!laneAvgs[lane]) laneAvgs[lane] = []
      laneAvgs[lane].push(Number(l.rate || l.gross) / Number(l.miles))
    })

    // Check load board for rates on driver's lanes
    for (const [lane, rpms] of Object.entries(laneAvgs)) {
      if (rpms.length < 2) continue // need history to compare
      const avg = rpms.reduce((s, r) => s + r, 0) / rpms.length
      const [origin, dest] = lane.split('\u2192')
      if (!origin || !dest) continue

      // Find matching loads on the board
      const matching = BOARD_LOADS.filter(l => {
        const lo = (l.origin_city || l.origin || '').toLowerCase()
        const ld = (l.destination_city || l.dest || l.destination || '').toLowerCase()
        return lo.includes(origin.toLowerCase()) && ld.includes(dest.toLowerCase())
      })

      for (const load of matching) {
        const rpm = Number(load.miles) > 0 ? Number(load.rate || 0) / Number(load.miles) : 0
        if (rpm <= 0) continue
        const spike = ((rpm - avg) / avg) * 100
        if (spike >= 15 && !rateAlertShownRef.current[lane]) {
          rateAlertShownRef.current[lane] = true
          setMessages(m => [...m, {
            role: 'assistant',
            content: `**Rate Alert** \u2014 Your **${lane}** lane is paying **$${rpm.toFixed(2)}/mi** right now \u2014 that's **${Math.round(spike)}% above** your average of $${avg.toFixed(2)}/mi. Worth jumping on.`,
            isProactive: true,
          }])
          break
        }
      }
    }
  }, [loads, qMemories, brokerStats])

  // ── PROACTIVE LOAD FINDING AGENT ─────────────────────────────────────
  useEffect(() => {
    if (!subscription?.plan || subscription.plan !== 'autopilot') return
    if (!subscription?.isActive) return

    const checkProximity = async () => {
      const inTransitLoad = activeLoads.find(l => {
        const s = (l.status || '').toLowerCase()
        return ['in transit', 'intransit', 'loaded', 'en route'].some(x => s.includes(x.replace(' ', ''))) || s.includes('in transit')
      })
      if (!inTransitLoad) { proactiveTriggeredRef.current = false; return }

      const loadKey = inTransitLoad.id || inTransitLoad.load_id
      if (proactiveTriggeredRef.current && proactiveLoadId === loadKey) return
      if (proactiveDismissedRef.current && Date.now() - proactiveDismissedRef.current < 30 * 60 * 1000) return

      const coords = await getGPSCoords()
      if (!coords) return

      const dest = inTransitLoad.destination || inTransitLoad.destination_city || ''
      if (!dest) return

      try {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(dest)}&count=1&language=en&format=json`)
        const geoData = await geoRes.json()
        if (!geoData.results?.[0]) return

        const destLat = geoData.results[0].latitude
        const destLng = geoData.results[0].longitude
        const distMiles = haversine(coords.lat, coords.lng, destLat, destLng)
        const estimatedMinutes = (distMiles / 55) * 60

        if (estimatedMinutes > 75) return

        proactiveTriggeredRef.current = true
        setProactiveLoadId(loadKey)

        try {
          const searchRes = await apiFetch(`/api/load-board?origin=${encodeURIComponent(dest)}&limit=10`)
          const searchData = await searchRes.json()

          if (searchData.error?.includes('Connect your load board')) {
            setMessages(m => [...m, {
              role: 'assistant',
              content: `**Proactive Load Finder** \u2014 You're about ${Math.round(estimatedMinutes)} min from delivery in ${dest}.\n\nConnect your load board in **Settings \u2192 Load Boards** to enable automatic load finding from your delivery city.\n\nI'll find your next load before you even deliver this one.`,
              isProactive: true,
            }])
            speak(`You're about ${Math.round(estimatedMinutes)} minutes from delivery. Connect your load board in settings to enable proactive load finding.`)
            logProactiveActivity('fallback', `Driver near ${dest} \u2014 no load board connected`)
            return
          }

          const foundLoads = searchData.loads || []
          // Weak market detection — cities known for poor outbound freight
          const weakMarkets = ['Jacksonville', 'Miami', 'Tampa', 'Orlando', 'Savannah', 'El Paso', 'Laredo', 'Brownsville', 'McAllen', 'Nogales', 'Tucson']
          const destCity = (dest || '').split(',')[0].trim()
          const isWeakMarket = weakMarkets.some(w => destCity.toLowerCase().includes(w.toLowerCase()))

          if (foundLoads.length === 0) {
            const weakMsg = isWeakMarket
              ? `**\u26A0 Deadhead Warning** \u2014 You're ~${Math.round(estimatedMinutes)} min from ${dest}, which is a **weak outbound market**. No loads available right now. Consider repositioning to a stronger market nearby. I'll keep checking.`
              : `**Proactive Load Finder** \u2014 You're ~${Math.round(estimatedMinutes)} min from ${dest}. I searched for loads but nothing available right now. I'll check again in 15 min.`
            setMessages(m => [...m, {
              role: 'assistant',
              content: weakMsg,
              isProactive: true,
            }])
            speak(isWeakMarket
              ? `Warning. ${dest} is a weak outbound market. No loads found. You might need to reposition. I'll keep checking.`
              : `You're approaching delivery. No loads found from ${dest} right now, I'll check again soon.`)
            proactiveTriggeredRef.current = false
            logProactiveActivity(isWeakMarket ? 'weak-market' : 'empty', `${isWeakMarket ? 'WEAK MARKET ' : ''}No loads found from ${dest}`)
            return
          }

          const scored = foundLoads.map(l => {
            const miles = l.miles || 1
            const rpm = (l.rate || 0) / miles
            const lane = { avgRpm: 2.70, trend: 4, backhaul: 55 }
            const brokerScores = { 'Echo Global': 98, 'TQL': 92, 'CH Robinson': 95, 'Coyote': 88, 'XPO': 90 }
            const brokerScore = brokerScores[l.broker_name || l.broker] || 70
            const premium = (rpm - lane.avgRpm) / lane.avgRpm
            const scoreA = Math.min(25, Math.max(0, 12 + premium * 40))
            const scoreB = brokerScore / 100 * 25
            const scoreC = 20
            const scoreD = lane.trend > 8 ? 20 : lane.trend > 3 ? 16 : lane.trend > 0 ? 12 : lane.trend > -5 ? 7 : 3
            const scoreE = lane.backhaul > 70 ? 10 : lane.backhaul > 50 ? 6 : 3
            const score = Math.min(99, Math.max(30, Math.round(scoreA + scoreB + scoreC + scoreD + scoreE)))
            return { ...l, _aiScore: score }
          }).sort((a, b) => b._aiScore - a._aiScore)

          proactiveLoadsRef.current = scored

          const best = scored[0]
          const bestRpm = best.miles ? (best.rate / best.miles).toFixed(2) : '\u2014'
          const origin = best.origin_city || best.origin || dest
          const destination = best.destination_city || best.dest || best.destination || '?'

          const weakNote = isWeakMarket ? `\n\u26A0 **${destCity} is a weak outbound market** \u2014 grab a load fast or consider repositioning.\n` : ''
          const msg = [
            `**Proactive Load Finder** \u2014 You're ~${Math.round(estimatedMinutes)} min from delivery!`,
            weakNote,
            `I found **${scored.length} loads** from ${dest}. Here's the best one:`,
            ``,
            `**${origin} \u2192 ${destination}**`,
            `$${Number(best.rate || 0).toLocaleString()} \u00b7 $${bestRpm}/mi \u00b7 ${best.miles || '?'} mi`,
            `${best.broker_name || best.broker || 'Unknown Broker'} \u00b7 ${best.equipment_type || best.equipment || 'Dry Van'}`,
            `AI Score: **${best._aiScore}/99**`,
            ``,
            `Say **"book it"** to auto-book, **"show me more"** for top 3, or **"no thanks"** to dismiss.`,
          ].join('\n')

          setMessages(m => [...m, { role: 'assistant', content: msg, isProactive: true }])
          speak(`Heads up! You're ${Math.round(estimatedMinutes)} minutes from delivery. I found a ${best._aiScore} point load from ${origin} to ${destination} for $${Number(best.rate || 0).toLocaleString()}. Say book it to grab it, or show me more for options.`)

          logProactiveActivity('found', `${scored.length} loads from ${dest}, best: ${origin}\u2192${destination} $${best.rate} (${best._aiScore}/99)`)

        } catch (err) {
          // Load search error
        }
      } catch (err) {
        // Geocode error
      }
    }

    checkProximity()
    const interval = setInterval(checkProximity, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [activeLoads, subscription, proactiveLoadId])

  // Log proactive agent activity
  const logProactiveActivity = useCallback(async (type, message) => {
    try {
      await apiFetch('/api/admin-alert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          severity: 'info',
          title: `[Proactive Agent] ${type}`,
          message,
          source: 'proactive-load-finder',
          userId: user?.id,
        }),
      })
    } catch { /* silent */ }
  }, [user])

  // ── PROACTIVE: Post-Delivery Reload Chain ──────────────────
  useEffect(() => {
    if (loads.length === 0 || BOARD_LOADS.length === 0) return
    // Check for loads that just became "Delivered"
    const justDelivered = loads.filter(l => l.status === 'Delivered')
    justDelivered.forEach(load => {
      const loadKey = load.id || load.load_id
      if (reloadAlertShownRef.current[loadKey]) return
      const dest = (load.destination || load.dest || '').split(',')[0].trim()
      if (!dest) return
      reloadAlertShownRef.current[loadKey] = true
      // Find reloads from destination
      const destLower = dest.toLowerCase()
      const reloads = BOARD_LOADS.filter(l => (l.origin_city || l.origin || '').toLowerCase().includes(destLower))
        .map(l => {
          const rpm = Number(l.miles) > 0 ? Number(l.rate || 0) / Number(l.miles) : 0
          return { ...l, _rpm: rpm }
        }).sort((a, b) => b._rpm - a._rpm).slice(0, 3)
      if (reloads.length === 0) return
      // Calculate driver avg RPM
      const dlvd = loads.filter(l => ['Delivered', 'Invoiced', 'Paid'].includes(l.status))
      const rpmVals = dlvd.filter(l => Number(l.miles) > 0 && Number(l.rate || l.gross || 0) > 0).map(l => Number(l.rate || l.gross || 0) / Number(l.miles))
      const avgRpm = rpmVals.length > 0 ? rpmVals.reduce((s, r) => s + r, 0) / rpmVals.length : 2.50
      proactiveLoadsRef.current = reloads
      const lines = reloads.map((l, i) => {
        const o = l.origin_city || l.origin || dest
        const d = l.destination_city || l.dest || l.destination || '?'
        return `${o}\u2192${d} **$${l._rpm.toFixed(2)}/mi**`
      })
      setMessages(m => [...m, {
        role: 'assistant',
        content: `**Reload Chain** \u2014 Load delivered to ${dest}. Here are ${reloads.length} reloads:\n\n${lines.map((l, i) => `**${i + 1}.** ${l}`).join('\n')}\n\nYour avg: $${avgRpm.toFixed(2)}/mi. Say **"book 1"**, **"book 2"**, or **"book 3"**.`,
        isProactive: true,
      }])
      speak(`Load delivered. Found ${reloads.length} reloads from ${dest}. Best is $${reloads[0]._rpm.toFixed(2)} per mile. Say book 1, 2, or 3.`)
    })
  }, [loads])

  // ── PROACTIVE: Backhaul Finder (In Transit loads) ──────────────────
  useEffect(() => {
    if (BOARD_LOADS.length === 0) return
    const inTransit = activeLoads.filter(l => {
      const s = (l.status || '').toLowerCase()
      return s.includes('in transit') || s === 'loaded'
    })
    inTransit.forEach(load => {
      const loadKey = load.id || load.load_id
      if (backhaulAlertShownRef.current[loadKey]) return
      const dest = (load.destination || load.dest || load.destination_city || '').split(',')[0].trim()
      if (!dest) return
      const destLower = dest.toLowerCase()
      const backhauls = BOARD_LOADS.filter(l => (l.origin_city || l.origin || '').toLowerCase().includes(destLower))
        .map(l => ({ ...l, _rpm: Number(l.miles) > 0 ? Number(l.rate || 0) / Number(l.miles) : 0 }))
        .sort((a, b) => b._rpm - a._rpm).slice(0, 3)
      if (backhauls.length === 0) return
      backhaulAlertShownRef.current[loadKey] = true
      const best = backhauls[0]
      const bestDest = best.destination_city || best.dest || best.destination || '?'
      setMessages(m => [...m, {
        role: 'assistant',
        content: `**Backhaul Alert** \u2014 You're delivering in ${dest}. I found **${backhauls.length} backhaul options**. Best: **${dest}\u2192${bestDest}** at **$${best._rpm.toFixed(2)}/mi** ($${Number(best.rate || 0).toLocaleString()}). Zero deadhead.\n\nSay **"find backhaul from ${dest}"** for full list.`,
        isProactive: true,
      }])
      speak(`Heads up. You're delivering to ${dest}. I found ${backhauls.length} backhaul options. Best is $${best._rpm.toFixed(2)} per mile to ${bestDest}.`)
    })
  }, [activeLoads])

  // ── PROACTIVE: Smart Repositioning (between loads) ──────────────────
  useEffect(() => {
    if (repositionAlertShownRef.current) return
    if (activeLoads.length > 0) return // Only when between loads
    if (BOARD_LOADS.length < 5) return
    const lastDelivery = loads.filter(l => ['Delivered', 'Invoiced', 'Paid'].includes(l.status))
      .sort((a, b) => new Date(b.delivery_date || b.updated_at || 0) - new Date(a.delivery_date || a.updated_at || 0))[0]
    const currentCity = (gpsLocation?.split(',')[0]?.trim() || lastDelivery?.destination?.split(',')[0]?.trim() || lastDelivery?.dest?.split(',')[0]?.trim() || '').toLowerCase()
    if (!currentCity) return
    // Group board loads by origin
    const marketRpms = {}
    BOARD_LOADS.forEach(l => {
      const city = (l.origin_city || l.origin || '').split(',')[0].trim()
      if (!city) return
      const rpm = Number(l.miles) > 0 ? Number(l.rate || 0) / Number(l.miles) : 0
      if (rpm <= 0) return
      if (!marketRpms[city]) marketRpms[city] = []
      marketRpms[city].push(rpm)
    })
    const markets = Object.entries(marketRpms).map(([city, rpms]) => ({
      city, avgRpm: rpms.reduce((s, r) => s + r, 0) / rpms.length, count: rpms.length
    })).filter(m => m.count >= 2).sort((a, b) => b.avgRpm - a.avgRpm)
    const currentMarket = markets.find(m => m.city.toLowerCase() === currentCity)
    const currentRpm = currentMarket?.avgRpm || 0
    const better = markets.find(m => m.city.toLowerCase() !== currentCity && m.avgRpm > currentRpm + 0.30)
    if (!better) return
    repositionAlertShownRef.current = true
    const diff = (better.avgRpm - currentRpm).toFixed(2)
    setMessages(m => [...m, {
      role: 'assistant',
      content: `**Repositioning Opportunity** \u2014 Outbound rates from **${better.city}** average **$${better.avgRpm.toFixed(2)}/mi** \u2014 that's **$${diff}/mi higher** than ${currentCity || 'your area'}. ${better.count} loads available. Worth the deadhead.`,
      isProactive: true,
    }])
    speak(`Repositioning tip. ${better.city} is paying $${diff} per mile more than your current area. Worth the move.`)
  }, [activeLoads, loads, gpsLocation])

  // ── PROACTIVE: Weekly Revenue Target (check on load changes) ──────────────────
  useEffect(() => {
    if (weeklyTargetAlertShownRef.current) return
    const target = Number(localStorage.getItem('qivori_weekly_target') || '5000')
    if (!target) return
    const dlvd = loads.filter(l => ['Delivered', 'Invoiced', 'Paid'].includes(l.status))
    if (dlvd.length < 2) return // Need some history
    const now = new Date()
    const dayOfWeek = now.getDay()
    if (dayOfWeek < 2) return // Only alert Tue-Sat
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - dayOfWeek)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekStart.getDate() + 7)
    const weekLoads = loads.filter(l => {
      if (!['Delivered', 'Invoiced', 'Paid'].includes(l.status)) return false
      const d = new Date(l.delivery_date || l.updated_at || l.created_at)
      return d >= weekStart && d < weekEnd
    })
    const weekRevenue = weekLoads.reduce((s, l) => s + Number(l.rate || l.gross || 0), 0)
    const pct = (weekRevenue / target) * 100
    const expectedPct = (dayOfWeek / 6) * 100 // Linear pace
    if (pct < expectedPct * 0.7 && weekRevenue < target) {
      weeklyTargetAlertShownRef.current = true
      const remaining = target - weekRevenue
      const daysLeft = Math.max(1, 6 - dayOfWeek)
      const avgLoadVal = dlvd.length > 0 ? dlvd.reduce((s, l) => s + Number(l.rate || l.gross || 0), 0) / dlvd.length : 1500
      const loadsNeeded = Math.ceil(remaining / avgLoadVal)
      setMessages(m => [...m, {
        role: 'assistant',
        content: `**Weekly Target Alert** \u2014 You're at **$${weekRevenue.toLocaleString()}** this week \u2014 need **$${remaining.toLocaleString()} more** (~${loadsNeeded} loads) to hit your **$${target.toLocaleString()}** target. ${daysLeft} days left. Push hard.`,
        isProactive: true,
      }])
      speak(`Weekly target check. You're at $${weekRevenue.toLocaleString()}. Need $${remaining.toLocaleString()} more, about ${loadsNeeded} loads, to hit your target.`)
    }
  }, [loads])

  // ── Next stop helper ──────────────────────────────
  const getNextStop = useCallback(() => {
    const load = activeLoads[0]
    if (!load) return null
    const status = (load.status || '').toLowerCase()
    const isBeforePickup = ['booked', 'dispatched', 'assigned'].some(s => status.includes(s))
    if (isBeforePickup) {
      return {
        type: 'Pickup',
        location: load.origin || load.origin_city || 'Unknown',
        address: load.pickup_address || load.origin_address || load.origin || '',
        date: load.pickup_date || 'Not set',
        loadId: load.load_id || load.id,
      }
    }
    return {
      type: 'Delivery',
      location: load.destination || load.destination_city || 'Unknown',
      address: load.delivery_address || load.destination_address || load.destination || '',
      date: load.delivery_date || 'Not set',
      loadId: load.load_id || load.id,
    }
  }, [activeLoads])

  // ── Weather fetch ──────────────────────────────────
  const fetchWeather = useCallback(async () => {
    try {
      const loc = await getGPSCoords()
      if (!loc) return { error: 'Could not get GPS location.' }
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${loc.lat}&longitude=${loc.lng}&current=temperature_2m,weathercode,windspeed_10m,precipitation&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=auto`)
      if (!res.ok) return { error: 'Weather service unavailable.' }
      const data = await res.json()
      const c = data.current
      const weatherCodes = { 0:'Clear skies', 1:'Mostly clear', 2:'Partly cloudy', 3:'Overcast', 45:'Foggy', 48:'Icy fog', 51:'Light drizzle', 53:'Drizzle', 55:'Heavy drizzle', 61:'Light rain', 63:'Rain', 65:'Heavy rain', 71:'Light snow', 73:'Snow', 75:'Heavy snow', 77:'Snow grains', 80:'Light showers', 81:'Showers', 82:'Heavy showers', 85:'Light snow showers', 86:'Heavy snow showers', 95:'Thunderstorm', 96:'Thunderstorm + hail', 99:'Severe thunderstorm + hail' }
      const condition = weatherCodes[c.weathercode] || 'Unknown'
      const temp = Math.round(c.temperature_2m)
      const wind = Math.round(c.windspeed_10m)
      const precip = c.precipitation
      let destWeather = null
      const load = activeLoads[0]
      if (load) {
        const dest = load.destination || load.destination_city || ''
        if (dest) {
          try {
            const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(dest)}&count=1&language=en&format=json`)
            const geoData = await geoRes.json()
            if (geoData.results?.[0]) {
              const { latitude, longitude } = geoData.results[0]
              const dRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weathercode,windspeed_10m,precipitation&temperature_unit=fahrenheit&windspeed_unit=mph&precipitation_unit=inch&timezone=auto`)
              if (dRes.ok) {
                const dData = await dRes.json()
                const dc = dData.current
                destWeather = { location: dest, temp: Math.round(dc.temperature_2m), condition: weatherCodes[dc.weathercode] || 'Unknown', wind: Math.round(dc.windspeed_10m), precip: dc.precipitation }
              }
            }
          } catch {}
        }
      }
      return { current: { temp, condition, wind, precip }, dest: destWeather }
    } catch {
      return { error: 'Could not fetch weather data.' }
    }
  }, [activeLoads])

  // Parse action blocks from AI response
  const parseActions = (text) => {
    const actionRegex = /```action\s*\n?([\s\S]*?)```/g
    const actions = []
    let match
    while ((match = actionRegex.exec(text)) !== null) {
      try { actions.push(JSON.parse(match[1].trim())) } catch {}
    }
    const displayText = text.replace(/```action\s*\n?[\s\S]*?```/g, '').trim()
    return { actions, displayText }
  }

  // Execute an action from the AI
  const executeAction = async (action) => {
    try {
      switch (action.type) {
        case 'add_expense': {
          await addExpense({
            category: action.category || 'Other',
            amount: parseFloat(action.amount) || 0,
            merchant: action.merchant || '',
            notes: action.notes || '',
            date: new Date().toISOString().split('T')[0],
            gallons: action.gallons ? parseFloat(action.gallons) : null,
            price_per_gallon: action.price_per_gallon ? parseFloat(action.price_per_gallon) : null,
            state: action.state || null,
          })
          const iftaNote = action.gallons && action.state ? ` (${action.gallons} gal, ${action.state} \u2014 IFTA logged)` : ''
          showToast('success', 'Expense Added', `$${action.amount} \u2014 ${action.category}${iftaNote}`)
          return true
        }
        case 'mark_invoice_paid': {
          const inv = invoices.find(i => i.id === action.invoice_id || i.invoice_number === action.invoice_id || i._dbId === action.invoice_id) || unpaidInvoices[0]
          if (!inv) { showToast('error', 'Error', 'No unpaid invoice found'); return false }
          if (updateInvoiceStatus) {
            await updateInvoiceStatus(inv.id || inv.invoice_number || inv._dbId, 'Paid')
            haptic('success')
            showToast('success', 'Invoice Paid', `${inv.invoice_number || inv.id} \u2014 $${Number(inv.amount || 0).toLocaleString()}`)
          }
          return true
        }
        case 'check_call': {
          const load = loads.find(l => l.id === action.load_id || l.load_id === action.load_id) || activeLoads[0]
          if (!load) { showToast('error', 'Error', 'No active load found'); return false }
          const loadNumber = load.loadId || load.load_id || load.load_number || load.id
          await logCheckCall(loadNumber, {
            location: action.location || gpsLocation || 'Unknown',
            status: action.status || 'On Time',
            notes: action.notes || '',
            called_at: new Date().toISOString(),
          })
          showToast('success', 'Check Call Submitted', action.location || gpsLocation)
          return true
        }
        case 'get_gps': {
          // Check if the conversation context is about finding loads
          const recentMsgs = messages.slice(-4).map(m => m.content?.toLowerCase() || '').join(' ')
          const wantsLoads = /load|freight|haul|shipment|find.*load|book/i.test(recentMsgs)
          getGPS(wantsLoads)
          return true
        }
        case 'call_broker': {
          if (!action.phone) {
            showToast('error', 'No Number', 'No broker phone number available')
            return true
          }
          // Get load details for context
          const brokerLoad = activeLoads[0]
          const loadDetails = brokerLoad
            ? `${brokerLoad.origin} to ${brokerLoad.destination || brokerLoad.dest}, ${brokerLoad.miles} miles, $${brokerLoad.rate || brokerLoad.gross}, ${brokerLoad.equipment || 'Dry Van'}`
            : ''
          try {
            const callRes = await apiFetch('/api/retell-broker-call', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                phone: action.phone,
                brokerName: action.broker || brokerLoad?.broker_name || 'the broker',
                loadDetails,
                driverName: driverName || 'Driver',
              }),
            })
            const callData = await callRes.json()
            if (callRes.ok) {
              haptic('success')
              setMessages(m => [...m, { role: 'assistant', content: `Calling ${action.broker || 'the broker'} now at ${action.phone}. Q is handling the negotiation \u2014 I'll update you when done.` }])
              showToast('success', 'Calling Broker', `Q is dialing ${action.phone}`)
            } else {
              // Fallback to regular phone call
              window.location.href = `tel:${action.phone}`
            }
          } catch {
            // Fallback to regular phone call
            window.location.href = `tel:${action.phone}`
          }
          return true
        }
        case 'update_load_status': {
          const load = loads.find(l => l.id === action.load_id || l.load_id === action.load_id) || activeLoads[0]
          if (load && updateLoadStatus) {
            await updateLoadStatus(load.id, action.status)
            showToast('success', 'Load Updated', `${load.load_id || load.id} \u2192 ${action.status}`)
          }
          return true
        }
        case 'book_load': {
          try {
            const newLoad = await addLoad({
              origin: action.origin,
              destination: action.destination || action.dest,
              miles: action.miles,
              rate: action.gross || action.rate,
              rate_per_mile: action.rate,
              equipment: action.equipment || 'Dry Van',
              broker_name: action.broker,
              weight: action.weight,
              commodity: action.commodity,
              pickup_date: action.pickup,
              delivery_date: action.delivery,
              reference_number: action.refNum,
              status: 'Booked',
              load_type: 'FTL',
            })
            showToast('success', 'Load Booked!', `${action.origin} \u2192 ${action.destination || action.dest} \u2014 $${Number(action.gross || 0).toLocaleString()}`)
          } catch (err) {
            showToast('error', 'Booking Failed', err.message)
          }
          return true
        }
        case 'snap_ratecon': {
          if (rateConInputRef.current) rateConInputRef.current.click()
          return true
        }
        case 'upload_doc': {
          setPendingUpload({ doc_type: action.doc_type, load_id: action.load_id, prompt: action.prompt })
          return true
        }
        case 'search_nearby': {
          if ((action.query || '').toLowerCase().match(/weigh|scale|coop/)) {
            return executeAction({ type: 'check_weigh_station', state: action.state, highway: action.highway, radius: action.radius })
          }
          const rawQuery = (action.query || '').toLowerCase()
          const query = (!rawQuery || /fuel|gas|stop|truck\s*stop|diesel|refuel/.test(rawQuery))
            ? "Pilot Flying J OR Love's Travel Stop OR Petro truck stop"
            : action.query
          const loc = await getGPSCoords()
          if (!loc) {
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
            setMessages(m => [...m, { role: 'assistant', content: isIOS
              ? '**GPS not available.** To fix:\n1. Open **Settings \u2192 Privacy \u2192 Location Services** \u2192 turn ON\n2. Scroll to **Safari** \u2192 set to **While Using**\n3. Come back and try again'
              : '**GPS not available.** To fix:\n1. Tap the lock icon in your browser bar\n2. Allow **Location** permission\n3. Try again'
            }])
            return true
          }
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
          const url = isIOS
            ? `maps://maps.apple.com/?q=${encodeURIComponent(query)}&sll=${loc.lat},${loc.lng}&z=12`
            : `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${loc.lat},${loc.lng},13z`
          window.open(url, '_blank')
          showToast('success', 'Maps Opened', `Searching nearby truck stops`)
          return true
        }
        case 'check_weigh_station': {
          try {
            const loc = await getGPSCoords()
            const body = {}
            if (loc) { body.lat = loc.lat; body.lng = loc.lng }
            if (action.state) body.state = action.state
            if (action.highway) body.highway = action.highway
            if (action.radius) body.radius = action.radius
            const wsRes = await apiFetch('/api/weigh-stations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            const wsData = await wsRes.json()
            if (wsData.stations && wsData.stations.length > 0) {
              const stations = wsData.stations.slice(0, 5)
              const openCount = stations.filter(s => s.open === true).length
              const closedCount = stations.filter(s => s.open === false).length
              setMessages(m => [...m, {
                role: 'assistant',
                content: `__ws_summary__`,
                weighStations: stations,
                wsSummary: { total: stations.length, open: openCount, closed: closedCount },
              }])
              speak(`Found ${stations.length} weigh station${stations.length > 1 ? 's' : ''}. ${openCount} open, ${closedCount} closed. ${stations[0].name} is ${stations[0].open ? 'open' : 'closed'}. ${stations[0].status}`)
            } else {
              setMessages(m => [...m, { role: 'assistant', content: 'No weigh stations found in your area. Try expanding your search radius.' }])
            }
          } catch (err) {
            setMessages(m => [...m, { role: 'assistant', content: 'Couldn\'t check weigh stations right now. Try again in a moment.' }])
          }
          return true
        }
        case 'open_maps': {
          if ((action.query || '').toLowerCase().match(/weigh|scale|coop/)) {
            return executeAction({ type: 'check_weigh_station', state: action.state, highway: action.highway, radius: action.radius })
          }
          const q = encodeURIComponent(action.query || 'truck stop')
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
          const url = isIOS
            ? `maps://maps.apple.com/?q=${q}&sll=${action.lat || ''},${action.lng || ''}`
            : `https://www.google.com/maps/search/${q}/@${action.lat || ''},${action.lng || ''},14z`
          window.open(url, '_blank')
          return true
        }
        case 'load_stops': {
          const targetLoad = action.load_id
            ? loads.find(l => l.id === action.load_id || l.load_id === action.load_id)
            : activeLoads[0]
          if (!targetLoad) {
            setMessages(m => [...m, { role: 'assistant', content: 'No load found. Book a load first.' }])
          } else if (targetLoad.stops && targetLoad.stops.length > 0) {
            const stopsText = targetLoad.stops.map((s, i) => {
              const typeLabel = s.type === 'pickup' ? 'PICKUP' : 'DELIVERY'
              const statusIcon = s.status === 'complete' ? ' [done]' : s.status === 'current' ? ' [current]' : ''
              return `${i + 1}. **${typeLabel}**${statusIcon} — ${s.city}${s.scheduled_date ? ' · ' + s.scheduled_date : ''}${s.contact_name ? ' · ' + s.contact_name : ''}`
            }).join('\n')
            setMessages(m => [...m, { role: 'assistant', content: `**Load ${targetLoad.load_id || targetLoad.id} — ${targetLoad.stops.length} Stops**\n${stopsText}` }])
          } else {
            setMessages(m => [...m, { role: 'assistant', content: `**Load ${targetLoad.load_id || targetLoad.id}**\n1. **PICKUP** — ${targetLoad.origin}\n2. **DELIVERY** — ${targetLoad.destination || targetLoad.dest}` }])
          }
          return true
        }
        case 'next_stop': {
          const stop = getNextStop()
          if (!stop) {
            setMessages(m => [...m, { role: 'assistant', content: 'No active load right now. Book a load first and I\'ll track your stops.' }])
          } else {
            let etaText = ''
            const loc = await getGPSCoords()
            if (loc && stop.address) {
              const miles = Number(activeLoads[0]?.miles || 0)
              if (miles > 0) {
                const etaHours = (miles / 55).toFixed(1)
                etaText = `\nETA: ~${etaHours} hrs (${miles} mi at 55 mph avg)`
              }
            }
            setMessages(m => [...m, { role: 'assistant', content: `**Next Stop: ${stop.type}**\n${stop.location}\n${stop.address !== stop.location ? `${stop.address}\n` : ''}${stop.date}\nLoad ${stop.loadId}${etaText}` }])
          }
          return true
        }
        case 'hos_check': {
          const hos = getHosRemaining()
          if (!hos) {
            setMessages(m => [...m, { role: 'assistant', content: 'HOS clock not started yet. It starts automatically when a load goes In Transit. Want me to start it now?' }])
          } else {
            const hrs = hos.remaining < 1 ? `${Math.round(hos.remaining * 60)} minutes` : `${hos.remaining} hours`
            const driven = hos.elapsed < 1 ? `${Math.round(hos.elapsed * 60)} min` : `${hos.elapsed} hrs`
            setMessages(m => [...m, { role: 'assistant', content: `**HOS Status**\nDriven: ${driven}\nRemaining: ${hrs}\n${hos.remaining <= 2 ? '\n**Start looking for a safe place to stop.**' : ''}` }])
          }
          return true
        }
        case 'start_hos': {
          const now = Date.now()
          setHosStartTime(now)
          localStorage.setItem('qivori_hos_start', String(now))
          hosWarningShownRef.current = false
          setMessages(m => [...m, { role: 'assistant', content: '**HOS clock started.** You have 11 hours of driving time. I\'ll warn you when 2 hours remain.' }])
          return true
        }
        case 'reset_hos': {
          resetHOS()
          setMessages(m => [...m, { role: 'assistant', content: '**HOS clock reset.** Your 11-hour driving clock is cleared. It will restart when your next load goes In Transit.' }])
          return true
        }
        case 'weather_check': {
          setMessages(m => [...m, { role: 'assistant', content: 'Checking weather conditions...' }])
          const weather = await fetchWeather()
          if (weather.error) {
            setMessages(m => { const updated = [...m]; updated[updated.length - 1] = { role: 'assistant', content: weather.error }; return updated })
          } else {
            let msg = `**Weather at Your Location**\n${weather.current.temp}\u00b0F \u2014 ${weather.current.condition}\nWind: ${weather.current.wind} mph\nPrecipitation: ${weather.current.precip}"`
            if (weather.dest) {
              msg += `\n\n**Weather at Destination (${weather.dest.location})**\n${weather.dest.temp}\u00b0F \u2014 ${weather.dest.condition}\nWind: ${weather.dest.wind} mph\nPrecipitation: ${weather.dest.precip}"`
            }
            const dangerous = [65, 75, 77, 82, 85, 86, 95, 96, 99]
            const currentDangerous = dangerous.includes(weather.current?.weathercode)
            const destDangerous = weather.dest && dangerous.includes(weather.dest?.weathercode)
            if (currentDangerous || destDangerous) msg += '\n\n**Severe conditions detected. Drive cautiously and consider stopping if visibility is poor.**'
            setMessages(m => { const updated = [...m]; updated[updated.length - 1] = { role: 'assistant', content: msg }; return updated })
          }
          return true
        }
        case 'send_invoice': {
          try {
            const res = await apiFetch('/api/send-invoice', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: action.to,
                carrierName: company?.name || 'Carrier',
                invoiceNumber: action.invoiceNumber || `INV-${Math.floor(1000 + Math.random() * 9000)}`,
                loadNumber: action.loadNumber || '',
                route: action.route || '',
                amount: action.amount || 0,
                dueDate: action.dueDate || 'Net 30',
                brokerName: action.brokerName || '',
              }),
            })
            const data = await res.json()
            if (data.success) {
              showToast('success', 'Invoice Sent!', `Emailed to ${action.to}`)
            } else {
              showToast('error', 'Invoice Failed', data.error || 'Could not send')
            }
          } catch (err) {
            showToast('error', 'Invoice Error', err.message)
          }
          return true
        }
        case 'rate_analysis': {
          try {
            const origin = action.origin || activeLoads[0]?.origin || ''
            const dest = action.destination || activeLoads[0]?.dest || activeLoads[0]?.destination || ''
            const miles = action.miles || activeLoads[0]?.miles || 0
            const rate = action.rate || activeLoads[0]?.gross || activeLoads[0]?.gross_pay || 0
            const equip = action.equipment || activeLoads[0]?.equipment || 'Dry Van'
            if (!origin || !dest || !miles || !rate) {
              setMessages(m => [...m, { role: 'assistant', content: 'I need more info to check the rate. Tell me the origin, destination, miles, and rate amount. For example: "Check rate $2500 Chicago to Atlanta 700 miles"' }])
              return true
            }
            setMessages(m => [...m, { role: 'assistant', content: 'Analyzing rate...' }])
            const res = await apiFetch('/api/rate-analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ origin, destination: dest, miles: Number(miles), rate: Number(rate), equipment_type: equip, weight: action.weight || '' }),
            })
            const data = await res.json()
            if (data.error) {
              setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: 'Could not analyze rate: ' + data.error }; return u })
            } else {
              const verdictLabel = data.verdict === 'below_market' ? 'Below Market' : data.verdict === 'fair' ? 'Fair' : data.verdict === 'good' ? 'Good Deal' : 'Excellent'
              const msg = `**Rate Check: ${verdictLabel}** (Score: ${data.score}/100)\n\n` +
                `**${origin} \u2192 ${dest}** (${miles} mi)\n` +
                `Your rate: **$${rate.toLocaleString()}** ($${data.offered_rpm}/mi)\n` +
                `Market avg: **$${data.market_rpm.avg}/mi** ($${data.market_rpm.low}-$${data.market_rpm.high})\n` +
                `Suggested counter: **$${data.suggested_counter}/mi** ($${data.suggested_gross?.toLocaleString()})\n\n` +
                `Est. profit: **$${data.profit_estimate.net.toLocaleString()}** after fuel ($${data.profit_estimate.fuel}), driver pay ($${data.profit_estimate.driver_pay || 0}), and expenses\n\n` +
                `${data.reasoning}\n\n` +
                `**Counter script:** "${data.negotiation_script}"`
              setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: msg, rateAnalysis: data }; return u })
              speak(`This rate is ${data.verdict === 'below_market' ? 'below market' : data.verdict}. Score ${data.score} out of 100. Your rate is $${data.offered_rpm} per mile, market average is $${data.market_rpm.avg}. I suggest countering at $${data.suggested_counter} per mile.`)
            }
          } catch (err) {
            setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: 'Rate analysis failed. Try again.' }; return u })
          }
          return true
        }
        case 'navigate': {
          const tabMap = { loads: 'loads', invoices: 'money', money: 'money', expenses: 'money', ifta: 'ifta', home: 'home', chat: 'chat', 'check-call': 'chat', 'add-expense': 'money' }
          const tab = tabMap[action.to] || action.to
          if (onNavigate && ['home', 'loads', 'money', 'ifta', 'chat'].includes(tab)) {
            onNavigate(tab, action.to === 'expenses' || action.to === 'add-expense' ? 'expenses' : null)
          }
          return true
        }
        case 'start_detention': {
          const now = Date.now()
          const freeTime = action.free_time_hours || 2
          localStorage.setItem('qivori_detention_start', String(now))
          localStorage.setItem('qivori_detention_location', action.location_type || 'shipper')
          localStorage.setItem('qivori_detention_free_time', String(freeTime))
          if (action.load_id) localStorage.setItem('qivori_detention_load_id', action.load_id)
          else localStorage.removeItem('qivori_detention_load_id')
          haptic('success')
          showToast('success', 'Detention Timer Started', `${freeTime}h free time at ${action.location_type || 'shipper'}`)
          setMessages(m => [...m, { role: 'assistant', content: `**Detention timer started** at the ${action.location_type || 'shipper'}.\n\nFree time: **${freeTime} hours**\nAfter that: **$75/hour** detention pay\n\nI'll track it for you. Ask me "what's my detention?" anytime to check.` }])
          speak(`Detention timer started at the ${action.location_type || 'shipper'}. You have ${freeTime} hours of free time. After that, detention accrues at $75 per hour.`)
          return true
        }
        case 'check_detention': {
          const detStart = localStorage.getItem('qivori_detention_start')
          if (!detStart) {
            setMessages(m => [...m, { role: 'assistant', content: 'No detention timer is running. Say **"start detention at shipper"** to begin tracking wait time.' }])
            speak('No detention timer is running. Tell me to start detention when you arrive at a shipper or receiver.')
          } else {
            const startMs = Number(detStart)
            const elapsedMs = Date.now() - startMs
            const elapsedMin = Math.round(elapsedMs / 60000)
            const freeHours = Number(localStorage.getItem('qivori_detention_free_time') || '2')
            const locType = localStorage.getItem('qivori_detention_location') || 'shipper'
            const overtimeHours = Math.max(0, (elapsedMs / (1000 * 60 * 60)) - freeHours)
            const amountOwed = Math.round(overtimeHours * 75 * 100) / 100
            const freeRemaining = Math.max(0, freeHours * 60 - elapsedMin)
            const elapsed = elapsedMin >= 60 ? `${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m` : `${elapsedMin}m`
            if (overtimeHours > 0) {
              setMessages(m => [...m, { role: 'assistant', content: `**Detention Status** (${locType})\n\nWait time: **${elapsed}**\nFree time: **expired**\nOvertime: **${overtimeHours.toFixed(1)} hours**\n\n**Amount owed: $${amountOwed.toFixed(2)}** ($75/hr)\n\nSay **"stop detention"** when you're done to log the final amount.` }])
              speak(`You've been waiting ${elapsed}. Free time is up. You're owed $${amountOwed.toFixed(2)} in detention pay.`)
            } else {
              setMessages(m => [...m, { role: 'assistant', content: `**Detention Status** (${locType})\n\nWait time: **${elapsed}**\nFree time remaining: **${Math.round(freeRemaining)} minutes**\n\nDetention pay hasn't started yet. I'll let you know when free time expires.` }])
              speak(`You've been here ${elapsed}. You still have ${Math.round(freeRemaining)} minutes of free time left.`)
            }
          }
          return true
        }
        case 'stop_detention': {
          const detStart = localStorage.getItem('qivori_detention_start')
          if (!detStart) {
            setMessages(m => [...m, { role: 'assistant', content: 'No detention timer is running.' }])
            speak('No detention timer is running.')
          } else {
            const startMs = Number(detStart)
            const elapsedMs = Date.now() - startMs
            const elapsedMin = Math.round(elapsedMs / 60000)
            const freeHours = Number(localStorage.getItem('qivori_detention_free_time') || '2')
            const locType = localStorage.getItem('qivori_detention_location') || 'shipper'
            const loadId = localStorage.getItem('qivori_detention_load_id') || null
            const overtimeHours = Math.max(0, (elapsedMs / (1000 * 60 * 60)) - freeHours)
            const amountOwed = Math.round(overtimeHours * 75 * 100) / 100
            const elapsed = elapsedMin >= 60 ? `${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m` : `${elapsedMin}m`
            // Clear localStorage
            localStorage.removeItem('qivori_detention_start')
            localStorage.removeItem('qivori_detention_location')
            localStorage.removeItem('qivori_detention_free_time')
            localStorage.removeItem('qivori_detention_load_id')
            haptic('success')
            if (amountOwed > 0) {
              // Auto-log as expense
              try {
                await addExpense({
                  amount: amountOwed,
                  category: 'Other',
                  merchant: `Detention - ${locType}`,
                  notes: `Detention pay: ${elapsed} total wait, ${overtimeHours.toFixed(1)}h overtime at $75/hr${loadId ? ` (Load ${loadId})` : ''}`,
                  date: new Date().toISOString().split('T')[0],
                })
                showToast('success', 'Detention Logged', `$${amountOwed.toFixed(2)} added as expense`)
                setMessages(m => [...m, { role: 'assistant', content: `**Detention timer stopped.**\n\nTotal wait: **${elapsed}** at ${locType}\nOvertime: **${overtimeHours.toFixed(1)} hours**\n**Amount owed: $${amountOwed.toFixed(2)}**\n\nI've logged this as an expense so you can bill the broker. Make sure to note it on the BOL and get a signature.` }])
                speak(`Detention stopped. You're owed $${amountOwed.toFixed(2)} for ${overtimeHours.toFixed(1)} hours of overtime. I've logged it as an expense.`)
              } catch {
                setMessages(m => [...m, { role: 'assistant', content: `**Detention timer stopped.**\n\nTotal wait: **${elapsed}** at ${locType}\n**Amount owed: $${amountOwed.toFixed(2)}**\n\nCouldn't auto-log the expense, but make sure to bill the broker for this detention.` }])
                speak(`Detention stopped. You're owed $${amountOwed.toFixed(2)}. I couldn't log the expense automatically, so make sure to add it manually.`)
              }
            } else {
              showToast('info', 'Detention Stopped', 'No detention pay accrued')
              setMessages(m => [...m, { role: 'assistant', content: `**Detention timer stopped.** Total wait: **${elapsed}** at ${locType}. Free time didn't expire, so no detention pay is owed.` }])
              speak(`Detention timer stopped. You waited ${elapsed}. No detention pay since free time didn't expire.`)
            }
          }
          return true
        }
        case 'fuel_route': {
          const origin = action.origin || ''
          const dest = action.destination || ''
          if (!origin || !dest) {
            setMessages(m => [...m, { role: 'assistant', content: 'Tell me the origin and destination to find fuel stops. Example: **"find fuel Chicago to Dallas"**' }])
            return true
          }
          setMessages(m => [...m, { role: 'assistant', content: `Searching for fuel stops along **${origin} → ${dest}**...` }])
          try {
            const geocode = async (place) => {
              const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`)
              const data = await res.json()
              return data[0] ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null
            }
            const [origCoords, destCoords] = await Promise.all([geocode(origin), geocode(dest)])
            if (!origCoords || !destCoords) {
              setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: `Couldn't locate ${!origCoords ? origin : dest}. Try a more specific city.` }; return u })
              return true
            }
            const points = [0.25, 0.5, 0.75].map(pct => ({
              lat: origCoords.lat + (destCoords.lat - origCoords.lat) * pct,
              lng: origCoords.lng + (destCoords.lng - origCoords.lng) * pct,
            }))
            const allStops = []
            for (const pt of points) {
              try {
                const query = `[out:json][timeout:10];(node["amenity"="fuel"]["brand"](around:40000,${pt.lat},${pt.lng}););out body 8;`
                const ovRes = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(query) })
                const ovData = await ovRes.json()
                ;(ovData.elements || []).forEach(el => {
                  const name = el.tags?.name || el.tags?.brand || 'Fuel Station'
                  const brand = el.tags?.brand || ''
                  const distFromOrig = haversine(origCoords.lat, origCoords.lng, el.lat, el.lon)
                  if (!allStops.find(s => s.name === name && Math.abs(s.lat - el.lat) < 0.01)) {
                    allStops.push({ name, brand, miles_from_origin: Math.round(distFromOrig) })
                  }
                })
              } catch { /* skip */ }
            }
            allStops.sort((a, b) => a.miles_from_origin - b.miles_from_origin)
            const top = allStops.slice(0, 8)
            if (top.length > 0) {
              const lines = top.map((s, i) => {
                const discount = s.brand === 'Loves' ? ' (My Love Rewards)' : s.brand === 'Pilot' || s.brand === 'Flying J' ? ' (myRewards Plus)' : s.brand === 'TA' || s.brand === 'Petro' ? ' (UltraONE)' : ''
                return `**${i + 1}. ${s.name}**${discount}\n${s.miles_from_origin} mi from ${origin}`
              })
              setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: `**Fuel Stops: ${origin} \u2192 ${dest}**\n\n${lines.join('\n\n')}\n\n**Tip:** Major chains (Loves, Pilot, TA) typically have the best diesel prices. Use loyalty programs to save 3-10\u00a2/gallon.` }; return u })
              speak(`Found ${top.length} fuel stops along your route. ${top.filter(s => s.brand).length} are major chains with discount programs.`)
            } else {
              setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: 'No fuel stations found along that route. Try fueling before departure.' }; return u })
            }
          } catch {
            setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: 'Fuel search failed. Try again.' }; return u })
          }
          return true
        }
        case 'trip_pnl': {
          const delivered = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid')
          const tripLoad = action.load_id
            ? loads.find(l => l.id === action.load_id || l.load_id === action.load_id || l.load_number === action.load_id)
            : delivered.sort((a, b) => new Date(b.delivery_date || b.updated_at || 0) - new Date(a.delivery_date || a.updated_at || 0))[0]
          if (!tripLoad) {
            setMessages(m => [...m, { role: 'assistant', content: 'No delivered loads found yet. Complete a load to see your per-trip P&L.' }])
            return true
          }
          const loadId = tripLoad.load_id || tripLoad.id || tripLoad.load_number
          const gross = Number(tripLoad.rate || tripLoad.gross || tripLoad.gross_pay || 0)
          const miles = Number(tripLoad.miles || 0)
          const grossRpm = miles > 0 ? (gross / miles).toFixed(2) : '0'
          const pickupDate = tripLoad.pickup_date ? new Date(tripLoad.pickup_date) : null
          const deliveryDate = tripLoad.delivery_date ? new Date(tripLoad.delivery_date) : null
          let fuelCost = 0, tollCost = 0, foodCost = 0, maintCost = 0, otherCost = 0, isEstimated = false
          if (pickupDate && deliveryDate) {
            const start = pickupDate.getTime() - 86400000
            const end = deliveryDate.getTime() + 86400000
            const tripExp = expenses.filter(e => {
              const d = new Date(e.date || e.created_at).getTime()
              return d >= start && d <= end
            })
            fuelCost = tripExp.filter(e => e.category === 'Fuel').reduce((s, e) => s + Number(e.amount || 0), 0)
            tollCost = tripExp.filter(e => e.category === 'Tolls').reduce((s, e) => s + Number(e.amount || 0), 0)
            foodCost = tripExp.filter(e => e.category === 'Food').reduce((s, e) => s + Number(e.amount || 0), 0)
            maintCost = tripExp.filter(e => e.category === 'Maintenance').reduce((s, e) => s + Number(e.amount || 0), 0)
            otherCost = tripExp.filter(e => !['Fuel', 'Tolls', 'Food', 'Maintenance'].includes(e.category)).reduce((s, e) => s + Number(e.amount || 0), 0)
          } else {
            const totalMiles = loads.filter(l => Number(l.miles) > 0).reduce((s, l) => s + Number(l.miles), 0)
            const avgExpPerMile = totalMiles > 0 ? totalExpenses / totalMiles : 1.50
            fuelCost = Math.round(avgExpPerMile * miles * 0.6) // ~60% is fuel
            tollCost = Math.round(avgExpPerMile * miles * 0.1)
            otherCost = Math.round(avgExpPerMile * miles * 0.3)
            isEstimated = true
          }
          const totalExp = fuelCost + tollCost + foodCost + maintCost + otherCost
          const netProfit = gross - totalExp
          const netRpm = miles > 0 ? (netProfit / miles).toFixed(2) : '0'
          const marginPct = gross > 0 ? ((netProfit / gross) * 100).toFixed(1) : '0'
          const verdict = netProfit > 0 ? (Number(marginPct) >= 30 ? 'Excellent' : Number(marginPct) >= 15 ? 'Good' : 'Thin Margin') : 'Loss'
          let msg = `**Per-Trip P&L: Load ${loadId}**\n**${tripLoad.origin} \u2192 ${tripLoad.destination || tripLoad.dest}** | ${miles} mi\n\n`
          msg += `**Revenue:** $${gross.toLocaleString()} ($${grossRpm}/mi)\n\n`
          msg += `**Expenses${isEstimated ? ' (estimated)' : ''}:**\n`
          if (fuelCost > 0) msg += `\u00b7 Fuel: $${fuelCost.toLocaleString()}\n`
          if (tollCost > 0) msg += `\u00b7 Tolls: $${tollCost.toLocaleString()}\n`
          if (foodCost > 0) msg += `\u00b7 Food: $${foodCost.toLocaleString()}\n`
          if (maintCost > 0) msg += `\u00b7 Maintenance: $${maintCost.toLocaleString()}\n`
          if (otherCost > 0) msg += `\u00b7 Other: $${otherCost.toLocaleString()}\n`
          msg += `**Total: $${totalExp.toLocaleString()}**\n\n`
          msg += `**Net Profit: $${netProfit.toLocaleString()}** ($${netRpm}/mi net)\n`
          msg += `**Margin: ${marginPct}%** — ${verdict}`
          if (isEstimated) msg += `\n\n_Expenses estimated from your averages. Log fuel/tolls during trips for exact numbers._`
          setMessages(m => [...m, { role: 'assistant', content: msg }])
          speak(`Load ${loadId}: Gross $${gross.toLocaleString()}, expenses $${totalExp.toLocaleString()}, net profit $${netProfit.toLocaleString()}. That's a ${marginPct} percent margin. ${verdict}.`)
          return true
        }
        case 'reload_chain': {
          const dest = action.destination || ''
          if (!dest) { setMessages(m => [...m, { role: 'assistant', content: 'Tell me the delivery city to find reloads. Example: **"reloads from Memphis"**' }]); return true }
          setMessages(m => [...m, { role: 'assistant', content: `Searching for reload options from **${dest}**...` }])
          const destCity = dest.split(',')[0].trim().toLowerCase()
          // Calculate driver's avg RPM
          const dlvd = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid')
          const rpmVals = dlvd.filter(l => Number(l.miles) > 0 && Number(l.rate || l.gross || 0) > 0).map(l => Number(l.rate || l.gross || 0) / Number(l.miles))
          const driverAvgRpm = rpmVals.length > 0 ? rpmVals.reduce((s, r) => s + r, 0) / rpmVals.length : 2.50
          // Search board loads from destination
          const reloads = BOARD_LOADS.filter(l => {
            const orig = (l.origin_city || l.origin || '').toLowerCase()
            return orig.includes(destCity)
          }).map(l => {
            const rpm = Number(l.miles) > 0 ? Number(l.rate || 0) / Number(l.miles) : 0
            return { ...l, _rpm: rpm }
          }).sort((a, b) => b._rpm - a._rpm).slice(0, 3)
          if (reloads.length === 0) {
            // Fallback: try API
            try {
              const lbRes = await apiFetch(`/api/load-board?origin=${encodeURIComponent(dest)}&limit=5`)
              const lbData = await lbRes.json()
              const apiLoads = (lbData.loads || []).map(l => ({ ...l, _rpm: Number(l.miles) > 0 ? Number(l.rate || 0) / Number(l.miles) : 0 })).sort((a, b) => b._rpm - a._rpm).slice(0, 3)
              if (apiLoads.length > 0) {
                reloads.push(...apiLoads)
              }
            } catch {}
          }
          if (reloads.length === 0) {
            setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: `No reload options found from **${dest}** right now. I'll keep checking.` }; return u })
            return true
          }
          proactiveLoadsRef.current = reloads
          const lines = reloads.map((l, i) => {
            const o = l.origin_city || l.origin || dest
            const d = l.destination_city || l.dest || l.destination || '?'
            const rpmDiff = l._rpm - driverAvgRpm
            const rpmTag = rpmDiff >= 0 ? `+$${rpmDiff.toFixed(2)} vs avg` : `-$${Math.abs(rpmDiff).toFixed(2)} vs avg`
            const brokerName = l.broker_name || l.broker || 'Unknown'
            // Check broker risk inline
            const bs = brokerStats.find(b => b.name?.toLowerCase() === brokerName.toLowerCase())
            const brokerWarn = bs && bs.avgDaysToPay > 45 ? ' (SLOW PAYER)' : bs && bs.onTimeRate !== null && bs.onTimeRate < 70 ? ' (UNRELIABLE)' : ''
            return `**${i + 1}. ${o} \u2192 ${d}**\n$${Number(l.rate || 0).toLocaleString()} \u00b7 **$${l._rpm.toFixed(2)}/mi** (${rpmTag}) \u00b7 ${l.miles || '?'} mi\n${brokerName}${brokerWarn} \u00b7 ${l.equipment_type || l.equipment || 'Dry Van'}`
          })
          const chainMsg = `**Reload Options from ${dest}**\nYour avg RPM: **$${driverAvgRpm.toFixed(2)}/mi**\n\n${lines.join('\n\n')}\n\nSay **"book 1"**, **"book 2"**, or **"book 3"** to grab one.`
          setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: chainMsg }; return u })
          speak(`Found ${reloads.length} reloads from ${dest.split(',')[0]}. Best is $${reloads[0]._rpm.toFixed(2)} per mile. Say book 1, 2, or 3.`)
          return true
        }
        case 'rate_trend': {
          const tOrigin = (action.origin || '').split(',')[0].trim()
          const tDest = (action.destination || '').split(',')[0].trim()
          if (!tOrigin || !tDest) { setMessages(m => [...m, { role: 'assistant', content: 'Tell me the lane. Example: **"rate trend Dallas to Atlanta"**' }]); return true }
          const lane = `${tOrigin}\u2192${tDest}`
          const dlvd = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid')
          const laneLoads = dlvd.filter(l => {
            const o = (l.origin || '').split(',')[0].trim().toLowerCase()
            const d = (l.destination || l.dest || '').split(',')[0].trim().toLowerCase()
            return o.includes(tOrigin.toLowerCase()) && d.includes(tDest.toLowerCase())
          }).filter(l => Number(l.miles) > 0 && Number(l.rate || l.gross || 0) > 0)
          if (laneLoads.length < 2) {
            setMessages(m => [...m, { role: 'assistant', content: `Not enough history on **${lane}** to analyze trends. You need at least 2 completed loads on this lane.` }])
            return true
          }
          // Sort by date
          laneLoads.sort((a, b) => new Date(a.delivery_date || a.pickup_date || a.created_at || 0) - new Date(b.delivery_date || b.pickup_date || b.created_at || 0))
          const allRpms = laneLoads.map(l => Number(l.rate || l.gross || 0) / Number(l.miles))
          const overallAvg = allRpms.reduce((s, r) => s + r, 0) / allRpms.length
          // Split into recent vs older
          const midpoint = Math.floor(laneLoads.length / 2)
          const olderRpms = allRpms.slice(0, midpoint)
          const recentRpms = allRpms.slice(midpoint)
          const olderAvg = olderRpms.reduce((s, r) => s + r, 0) / olderRpms.length
          const recentAvg = recentRpms.reduce((s, r) => s + r, 0) / recentRpms.length
          const trendPct = ((recentAvg - olderAvg) / olderAvg) * 100
          const trendDir = trendPct > 5 ? 'UP' : trendPct < -5 ? 'DOWN' : 'FLAT'
          // Check current board rate
          const boardMatches = BOARD_LOADS.filter(l => {
            const o = (l.origin_city || l.origin || '').toLowerCase()
            const d = (l.destination_city || l.dest || l.destination || '').toLowerCase()
            return o.includes(tOrigin.toLowerCase()) && d.includes(tDest.toLowerCase())
          })
          const boardRpms = boardMatches.filter(l => Number(l.miles) > 0).map(l => Number(l.rate || 0) / Number(l.miles))
          const boardAvg = boardRpms.length > 0 ? boardRpms.reduce((s, r) => s + r, 0) / boardRpms.length : null
          let trendMsg = `**Rate Trend: ${lane}**\n\n`
          trendMsg += `**Your History:** ${laneLoads.length} loads\n`
          trendMsg += `Overall avg: **$${overallAvg.toFixed(2)}/mi**\n`
          trendMsg += `Older loads avg: $${olderAvg.toFixed(2)}/mi\n`
          trendMsg += `Recent loads avg: $${recentAvg.toFixed(2)}/mi\n`
          trendMsg += `**Trend: ${trendDir}** (${trendPct > 0 ? '+' : ''}${trendPct.toFixed(1)}%)\n`
          if (boardAvg !== null) {
            const boardVsAvg = ((boardAvg - overallAvg) / overallAvg) * 100
            trendMsg += `\n**Current Board Rate:** $${boardAvg.toFixed(2)}/mi (${boardVsAvg > 0 ? '+' : ''}${boardVsAvg.toFixed(1)}% vs your avg)\n`
            if (boardVsAvg >= 15) trendMsg += `\nRates are **hot** on this lane right now. Strike while it's up.`
            else if (boardVsAvg <= -10) trendMsg += `\nRates are **soft** on this lane. Hold if you can, or negotiate hard.`
          }
          setMessages(m => [...m, { role: 'assistant', content: trendMsg }])
          speak(`${lane}: Your average is $${overallAvg.toFixed(2)} per mile. Rates are trending ${trendDir.toLowerCase()}, ${Math.abs(trendPct).toFixed(0)} percent.${boardAvg ? ` Current board rate is $${boardAvg.toFixed(2)}.` : ''}`)
          return true
        }
        case 'find_backhaul': {
          const bhDest = action.destination || ''
          if (!bhDest) { setMessages(m => [...m, { role: 'assistant', content: 'Tell me the delivery city. Example: **"find backhaul from Atlanta"**' }]); return true }
          setMessages(m => [...m, { role: 'assistant', content: `Searching for backhaul loads from **${bhDest}**...` }])
          const bhCity = bhDest.split(',')[0].trim().toLowerCase()
          let backhauls = BOARD_LOADS.filter(l => {
            const orig = (l.origin_city || l.origin || '').toLowerCase()
            return orig.includes(bhCity)
          }).map(l => {
            const rpm = Number(l.miles) > 0 ? Number(l.rate || 0) / Number(l.miles) : 0
            return { ...l, _rpm: rpm, _deadheadMiles: 0 }
          }).sort((a, b) => b._rpm - a._rpm).slice(0, 4)
          if (backhauls.length === 0) {
            try {
              const lbRes = await apiFetch(`/api/load-board?origin=${encodeURIComponent(bhDest)}&limit=5`)
              const lbData = await lbRes.json()
              backhauls = (lbData.loads || []).map(l => ({ ...l, _rpm: Number(l.miles) > 0 ? Number(l.rate || 0) / Number(l.miles) : 0, _deadheadMiles: 0 })).sort((a, b) => b._rpm - a._rpm).slice(0, 4)
            } catch {}
          }
          if (backhauls.length === 0) {
            setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: `No backhaul loads from **${bhDest}** right now. Consider repositioning to a stronger market.` }; return u })
            return true
          }
          proactiveLoadsRef.current = backhauls
          const lines = backhauls.map((l, i) => {
            const o = l.origin_city || l.origin || bhDest
            const d = l.destination_city || l.dest || l.destination || '?'
            const brokerName = l.broker_name || l.broker || 'Unknown'
            const bs = brokerStats.find(b => b.name?.toLowerCase() === brokerName.toLowerCase())
            const brokerWarn = bs && bs.avgDaysToPay > 45 ? ' (SLOW PAYER)' : ''
            return `**${i + 1}. ${o} \u2192 ${d}**\n$${Number(l.rate || 0).toLocaleString()} \u00b7 **$${l._rpm.toFixed(2)}/mi** \u00b7 ${l.miles || '?'} mi \u00b7 0 mi deadhead\n${brokerName}${brokerWarn}`
          })
          const bhMsg = `**Backhaul Options from ${bhDest}**\n\n${lines.join('\n\n')}\n\nSay **"book 1"**, **"book 2"**, etc. to lock one in.`
          setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: bhMsg }; return u })
          speak(`Found ${backhauls.length} backhaul options from ${bhDest.split(',')[0]}. Best is $${backhauls[0]._rpm.toFixed(2)} per mile with zero deadhead. Say book 1 to grab it.`)
          return true
        }
        case 'smart_reposition': {
          setMessages(m => [...m, { role: 'assistant', content: 'Analyzing nearby markets for repositioning...' }])
          // Get current location
          const lastDelivery = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid')
            .sort((a, b) => new Date(b.delivery_date || b.updated_at || 0) - new Date(a.delivery_date || a.updated_at || 0))[0]
          const currentCity = gpsLocation?.split(',')[0]?.trim() || lastDelivery?.destination?.split(',')[0]?.trim() || lastDelivery?.dest?.split(',')[0]?.trim() || ''
          if (!currentCity && BOARD_LOADS.length === 0) {
            setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: 'Need your location or load board data to analyze markets. Share your GPS or wait for load board to refresh.' }; return u })
            return true
          }
          // Group BOARD_LOADS by origin city, calculate avg RPM per market
          const marketRpms = {}
          BOARD_LOADS.forEach(l => {
            const city = (l.origin_city || l.origin || '').split(',')[0].trim()
            if (!city) return
            const rpm = Number(l.miles) > 0 ? Number(l.rate || 0) / Number(l.miles) : 0
            if (rpm <= 0) return
            if (!marketRpms[city]) marketRpms[city] = []
            marketRpms[city].push(rpm)
          })
          const markets = Object.entries(marketRpms).map(([city, rpms]) => ({
            city,
            avgRpm: rpms.reduce((s, r) => s + r, 0) / rpms.length,
            loadCount: rpms.length,
          })).filter(m => m.loadCount >= 2).sort((a, b) => b.avgRpm - a.avgRpm)
          if (markets.length === 0) {
            setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: 'Not enough load board data to compare markets. Check back when more loads are available.' }; return u })
            return true
          }
          const currentMarket = markets.find(m => m.city.toLowerCase() === currentCity.toLowerCase())
          const currentRpm = currentMarket?.avgRpm || 0
          const betterMarkets = markets.filter(m => m.city.toLowerCase() !== currentCity.toLowerCase() && m.avgRpm > currentRpm + 0.30).slice(0, 3)
          let repoMsg = `**Market Analysis**\n`
          if (currentCity) repoMsg += `Current location: **${currentCity}** ${currentRpm > 0 ? `(avg $${currentRpm.toFixed(2)}/mi, ${currentMarket?.loadCount || 0} loads)` : '(no loads available)'}\n\n`
          if (betterMarkets.length > 0) {
            repoMsg += `**Better Markets Nearby:**\n\n`
            betterMarkets.forEach((m, i) => {
              const diff = m.avgRpm - currentRpm
              repoMsg += `**${i + 1}. ${m.city}** \u2014 avg **$${m.avgRpm.toFixed(2)}/mi** (+$${diff.toFixed(2)}/mi) \u00b7 ${m.loadCount} loads available\n`
            })
            repoMsg += `\nRepositioning could net you **$${(betterMarkets[0].avgRpm - currentRpm).toFixed(2)}/mi more** per load.`
          } else {
            repoMsg += `**Top Markets:**\n\n`
            markets.slice(0, 5).forEach((m, i) => {
              repoMsg += `**${i + 1}. ${m.city}** \u2014 avg $${m.avgRpm.toFixed(2)}/mi \u00b7 ${m.loadCount} loads\n`
            })
            if (currentCity) repoMsg += `\nYou're already in a competitive market. Hold position.`
          }
          setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: repoMsg }; return u })
          if (betterMarkets.length > 0) {
            speak(`${betterMarkets[0].city} is paying $${(betterMarkets[0].avgRpm - currentRpm).toFixed(2)} more per mile than ${currentCity || 'your current area'}. Worth repositioning.`)
          } else {
            speak(`Your current market looks solid. Top market is ${markets[0]?.city} at $${markets[0]?.avgRpm.toFixed(2)} per mile.`)
          }
          return true
        }
        case 'broker_risk': {
          const brokerName = action.broker || ''
          if (!brokerName) { setMessages(m => [...m, { role: 'assistant', content: 'Tell me the broker name. Example: **"check broker XPO Logistics"**' }]); return true }
          const bs = brokerStats.find(b => b.name?.toLowerCase().includes(brokerName.toLowerCase()))
          if (!bs) {
            setMessages(m => [...m, { role: 'assistant', content: `No history with **${brokerName}**. This would be your first load with them. Proceed with caution \u2014 get the rate con in writing and consider factoring.` }])
            speak(`No history with ${brokerName}. First time working with them. Get everything in writing.`)
            return true
          }
          // Determine risk level
          let riskLevel = 'Unknown'
          let riskColor = ''
          if (bs.avgDaysToPay !== null && bs.avgDaysToPay < 20 && bs.onTimeRate !== null && bs.onTimeRate > 90) { riskLevel = 'TRUSTED'; riskColor = 'green' }
          else if (bs.avgDaysToPay !== null && bs.avgDaysToPay > 45) { riskLevel = 'SLOW PAYER'; riskColor = 'red' }
          else if (bs.onTimeRate !== null && bs.onTimeRate < 70) { riskLevel = 'UNRELIABLE'; riskColor = 'red' }
          else { riskLevel = 'MODERATE'; riskColor = 'yellow' }
          // Check for unpaid invoices > 60 days
          const brokerInvoices = invoices.filter(i => (i.broker_name || i.broker || '').toLowerCase().includes(brokerName.toLowerCase()))
          const now = Date.now()
          const ghostRisk = brokerInvoices.some(i => i.status !== 'Paid' && (now - new Date(i.created_at || i.date).getTime()) > 60 * 86400000)
          if (ghostRisk) { riskLevel = 'PAYMENT RISK'; riskColor = 'red' }
          let riskMsg = `**Broker Risk: ${bs.name}**\n\n`
          riskMsg += `**Risk Level: ${riskLevel}**\n\n`
          riskMsg += `**Your History:**\n`
          riskMsg += `\u00b7 Total loads: ${bs.totalLoads}\n`
          riskMsg += `\u00b7 Avg RPM: $${bs.avgRpm || 'N/A'}/mi\n`
          riskMsg += `\u00b7 Avg days to pay: ${bs.avgDaysToPay !== null ? bs.avgDaysToPay + ' days' : 'N/A'}\n`
          riskMsg += `\u00b7 On-time rate: ${bs.onTimeRate !== null ? bs.onTimeRate + '%' : 'N/A'}\n`
          if (ghostRisk) riskMsg += `\n**WARNING:** You have unpaid invoices over 60 days with this broker.`
          if (riskLevel === 'TRUSTED') riskMsg += `\nThis broker pays fast and delivers consistently. Good to work with.`
          else if (riskLevel === 'SLOW PAYER') riskMsg += `\nConsider factoring or requiring quik-pay on loads with this broker.`
          setMessages(m => [...m, { role: 'assistant', content: riskMsg }])
          speak(`${bs.name}: ${riskLevel}. ${bs.totalLoads} loads, ${bs.avgDaysToPay !== null ? bs.avgDaysToPay + ' days to pay' : 'payment data unavailable'}. ${riskLevel === 'TRUSTED' ? 'Good broker.' : riskLevel === 'SLOW PAYER' ? 'Slow payer. Consider factoring.' : 'Proceed with caution.'}`)
          return true
        }
        case 'weekly_target': {
          const targetInput = action.target ? Number(action.target) : null
          const storedTarget = Number(localStorage.getItem('qivori_weekly_target') || '5000')
          const target = targetInput || storedTarget
          // Check if setting a new target
          if (action.set_target && targetInput) {
            localStorage.setItem('qivori_weekly_target', String(targetInput))
            setMessages(m => [...m, { role: 'assistant', content: `Weekly target set to **$${targetInput.toLocaleString()}**. I'll track your progress.` }])
            speak(`Weekly target set to $${targetInput.toLocaleString()}.`)
            return true
          }
          // Calculate this week's revenue (Sunday to Saturday)
          const now = new Date()
          const dayOfWeek = now.getDay() // 0=Sun
          const weekStart = new Date(now)
          weekStart.setDate(now.getDate() - dayOfWeek)
          weekStart.setHours(0, 0, 0, 0)
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekStart.getDate() + 7)
          const weekLoads = loads.filter(l => {
            if (!['Delivered', 'Invoiced', 'Paid'].includes(l.status)) return false
            const d = new Date(l.delivery_date || l.updated_at || l.created_at)
            return d >= weekStart && d < weekEnd
          })
          const weekRevenue = weekLoads.reduce((s, l) => s + Number(l.rate || l.gross || 0), 0)
          const remaining = Math.max(0, target - weekRevenue)
          const pct = target > 0 ? Math.min(100, (weekRevenue / target) * 100) : 0
          // Avg load value from history
          const allDlvd = loads.filter(l => ['Delivered', 'Invoiced', 'Paid'].includes(l.status) && Number(l.rate || l.gross || 0) > 0)
          const avgLoadValue = allDlvd.length > 0 ? allDlvd.reduce((s, l) => s + Number(l.rate || l.gross || 0), 0) / allDlvd.length : 1500
          const loadsNeeded = remaining > 0 ? Math.ceil(remaining / avgLoadValue) : 0
          const daysLeft = Math.max(1, 6 - dayOfWeek) // Days remaining in the week
          const dailyPace = remaining > 0 ? (remaining / daysLeft) : 0
          let wtMsg = `**Weekly Revenue Target**\n\n`
          wtMsg += `**Target:** $${target.toLocaleString()}\n`
          wtMsg += `**This Week:** $${weekRevenue.toLocaleString()} (${weekLoads.length} loads)\n`
          wtMsg += `**Progress:** ${pct.toFixed(0)}%\n\n`
          if (remaining > 0) {
            wtMsg += `**Remaining:** $${remaining.toLocaleString()}\n`
            wtMsg += `\u00b7 ~${loadsNeeded} more load${loadsNeeded !== 1 ? 's' : ''} needed (avg $${Math.round(avgLoadValue).toLocaleString()}/load)\n`
            wtMsg += `\u00b7 ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left \u2014 need **$${Math.round(dailyPace).toLocaleString()}/day**\n`
            if (pct < 50 && dayOfWeek >= 3) wtMsg += `\nYou're behind pace. Push hard the next ${daysLeft} days.`
            else if (pct >= 75) wtMsg += `\nAlmost there. One more solid load closes it out.`
          } else {
            wtMsg += `**TARGET HIT!** You've exceeded your $${target.toLocaleString()} goal by $${Math.abs(remaining).toLocaleString()}. Solid week.`
          }
          setMessages(m => [...m, { role: 'assistant', content: wtMsg }])
          if (remaining > 0) {
            speak(`You're at $${weekRevenue.toLocaleString()} this week. ${pct.toFixed(0)} percent of your $${target.toLocaleString()} target. Need about ${loadsNeeded} more loads.`)
          } else {
            speak(`You hit your weekly target. $${weekRevenue.toLocaleString()} on a $${target.toLocaleString()} goal. Solid week.`)
          }
          return true
        }
        default:
          return false
      }
    } catch (err) {
      showToast('error', 'Action Failed', err.message)
      return false
    }
  }

  // Get GPS location — if followUpLoads is true, auto-search for loads after getting position
  const getGPS = (followUpLoads) => {
    if (!navigator.geolocation) { showToast('error', 'Error', 'GPS not available'); return }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json&addressdetails=1`)
        const data = await res.json()
        const addr = data.address || {}
        const city = addr.city || addr.town || addr.village || ''
        const state = addr.state || ''
        const loc = [city, state].filter(Boolean).join(', ')
        setGpsLocation(loc)
        showToast('success', 'Location Found', loc)

        // Auto-search loads after getting location
        if (followUpLoads) {
          try {
            const params = new URLSearchParams({ limit: '10', lat: pos.coords.latitude, lng: pos.coords.longitude })
            const inTransit = activeLoads.find(l => ['In Transit', 'Loaded', 'At Delivery'].includes(l.status))
            if (inTransit) {
              const dest = inTransit.destination || inTransit.dest || ''
              if (dest) params.set('origin', dest)
            }
            const lbRes = await apiFetch(`/api/load-board?${params}`)
            const lbData = await lbRes.json()
            const foundLoads = lbData.loads || BOARD_LOADS || []
            if (foundLoads.length > 0) {
              const top5 = foundLoads.slice(0, 5)
              const lines = top5.map((l, i) => {
                const orig = l.origin_city || l.origin || '?'
                const dest2 = l.destination_city || l.dest || l.destination || '?'
                const rpm = l.miles ? `$${(l.rate / l.miles).toFixed(2)}/mi` : ''
                return `**${i + 1}. ${orig} \u2192 ${dest2}**\n$${Number(l.rate || 0).toLocaleString()} \u00b7 ${rpm} \u00b7 ${l.miles || '?'} mi \u00b7 ${l.broker_name || l.broker || '?'}`
              })
              proactiveLoadsRef.current = top5
              setMessages(m => [...m, { role: 'assistant', content: `Found you near **${loc}**. Here's what's available:\n\n${lines.join('\n\n')}\n\nSay **"book 1"**, **"book 2"**, etc. to grab one.` }])
              speak(`Found ${top5.length} loads near ${city || 'your location'}. Say book 1 or book 2 to grab one.`)
            } else {
              setMessages(m => [...m, { role: 'assistant', content: `You're near **${loc}**. Nothing available right now — I'll keep checking. Connect your load board in **Settings** for more results.` }])
            }
          } catch {
            setMessages(m => [...m, { role: 'assistant', content: `Got your location: **${loc}**. Couldn't search loads right now — try again.` }])
          }
        }
      } catch {
        const loc = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`
        setGpsLocation(loc)
      }
    }, () => { showToast('error', 'Error', 'Location permission denied') })
  }

  // ── TEXT-TO-SPEECH ──────────────────────────────
  const ttsUnlockedRef = useRef(false)
  const unlockTTS = useCallback(() => {
    if (ttsUnlockedRef.current) return
    // Unlock browser TTS
    if (window.speechSynthesis) {
      const u = new SpeechSynthesisUtterance('')
      u.volume = 0
      window.speechSynthesis.speak(u)
      window.speechSynthesis.getVoices()
    }
    // Unlock Audio element for iOS (must play from user gesture)
    if (audioRef.current) {
      audioRef.current.src = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA/+M4wAAAAAAAAAAAAEluZm8AAAAPAAAAAwAAAbAAqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dX///////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAbDMJgoNAAAAAAAAAAAAAAAAAAAA/+MYxAALCAKkGABHAQA0AAANIAAAAABM'
      audioRef.current.volume = 0
      audioRef.current.play().catch(() => {})
      audioRef.current.volume = 1
    }
    ttsUnlockedRef.current = true
  }, [])

  // Persistent audio element for iOS compatibility (must be created from user gesture)
  const audioRef = useRef(null)
  if (!audioRef.current && typeof Audio !== 'undefined') {
    audioRef.current = new Audio()
  }

  // ── HANDLE REALTIME FUNCTION CALLS — Q takes actions during voice call ──
  const handleRealtimeFunctionCall = useCallback(async (dc, event) => {
    const { name, arguments: argsStr, call_id } = event
    let args = {}
    try { args = JSON.parse(argsStr) } catch {}
    let result = { success: true }

    try {
      switch (name) {
        case 'add_expense': {
          await addExpense({
            amount: args.amount || 0,
            category: args.category || 'Other',
            merchant: args.merchant || '',
            notes: args.notes || '',
            date: new Date().toISOString().split('T')[0],
          })
          haptic('success')
          showToast('success', 'Expense Added', `$${args.amount} ${args.category}`)
          result = { success: true, message: `Added $${args.amount} ${args.category} expense${args.merchant ? ` at ${args.merchant}` : ''}` }
          break
        }
        case 'update_load_status': {
          const load = args.load_id
            ? loads.find(l => l.id === args.load_id || l.load_id === args.load_id)
            : activeLoads[0]
          if (load) {
            await updateLoadStatus(load.id || load.load_id, args.status)
            haptic('success')
            showToast('success', 'Load Updated', `${load.origin} → ${load.destination || load.dest}: ${args.status}`)
            result = { success: true, message: `Load ${load.load_id || load.id} updated to ${args.status}` }
          } else {
            result = { success: false, message: 'No active load found' }
          }
          break
        }
        case 'submit_check_call': {
          const ccLoad = activeLoads[0]
          if (ccLoad) {
            await logCheckCall(ccLoad.load_id || ccLoad.id, {
              status: args.status || 'Check-in',
              location: args.location || gpsLocation || '',
              timestamp: new Date().toISOString(),
            })
            haptic('success')
            showToast('success', 'Check Call', 'Submitted')
            result = { success: true, message: `Check call submitted for load ${ccLoad.load_id || ccLoad.id}: ${args.status}` }
          } else {
            result = { success: false, message: 'No active load for check call' }
          }
          break
        }
        case 'search_loads': {
          try {
            const params = new URLSearchParams({ limit: '5' })
            if (args.origin) params.set('origin', args.origin)
            if (args.destination) params.set('destination', args.destination)
            if (args.equipment) params.set('equipment', args.equipment)
            const lbRes = await apiFetch(`/api/load-board?${params}`)
            const lbData = await lbRes.json()
            const found = lbData.loads || []
            if (found.length > 0) {
              result = {
                success: true,
                loads: found.slice(0, 5).map(l => ({
                  origin: l.origin_city || l.origin,
                  destination: l.destination_city || l.dest || l.destination,
                  rate: l.rate,
                  miles: l.miles,
                  rpm: l.miles ? (l.rate / l.miles).toFixed(2) : null,
                  broker: l.broker_name || l.broker,
                  equipment: l.equipment_type || l.equipment,
                })),
                message: `Found ${found.length} loads`
              }
            } else {
              result = { success: true, loads: [], message: 'No loads available right now' }
            }
          } catch {
            result = { success: false, message: 'Could not search loads right now' }
          }
          break
        }
        case 'send_invoice': {
          const invLoad = args.load_id
            ? loads.find(l => l.id === args.load_id || l.load_id === args.load_id)
            : loads.find(l => l.status === 'Delivered') || activeLoads[0]
          if (invLoad) {
            const brokerEmail = invLoad.broker_email || args.to || ''
            const carrierName = company?.name || 'Carrier'
            const invNum = args.invoiceNumber || `INV-${(invLoad.load_id || invLoad.id || '').replace(/[^0-9]/g, '').slice(-4) || Date.now()}`
            if (brokerEmail) {
              try {
                await apiFetch('/api/send-invoice', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    to: brokerEmail, carrierName, invoiceNumber: invNum,
                    loadNumber: invLoad.load_id || invLoad.id || '',
                    route: `${invLoad.origin || ''} → ${invLoad.destination || invLoad.dest || ''}`,
                    amount: invLoad.rate || invLoad.gross || 0,
                    dueDate: args.dueDate || 'Net 30',
                    brokerName: invLoad.broker_name || invLoad.broker || '',
                  }),
                })
              } catch {}
            }
            await updateInvoiceStatus(invLoad.id || invLoad.load_id, 'Invoiced')
            haptic('success')
            showToast('success', 'Invoice Sent', `${invLoad.origin} → ${invLoad.destination || invLoad.dest}`)
            result = { success: true, message: `Invoice ${invNum} sent for load ${invLoad.load_id || invLoad.id}: $${invLoad.rate || invLoad.gross || 0}${brokerEmail ? ' — emailed to ' + brokerEmail : ''}` }
          } else {
            result = { success: false, message: 'No delivered load to invoice' }
          }
          break
        }
        case 'get_driver_location': {
          try {
            const pos = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
            })
            const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${pos.coords.latitude}&lon=${pos.coords.longitude}&format=json`)
            const geoData = await geoRes.json()
            const city = geoData.address?.city || geoData.address?.town || geoData.address?.village || ''
            const state = geoData.address?.state || ''
            const loc = [city, state].filter(Boolean).join(', ')
            setGpsLocation(loc)
            result = { success: true, location: loc, lat: pos.coords.latitude, lng: pos.coords.longitude }
          } catch {
            result = { success: false, message: 'Could not get location — GPS may be disabled' }
          }
          break
        }
        case 'find_truck_stops': {
          try {
            const pos = await new Promise((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 })
            })
            const lat = pos.coords.latitude
            const lng = pos.coords.longitude
            // Use Overpass API to find real truck stops/fuel/rest areas nearby
            const typeMap = {
              truck_stop: '["amenity"="fuel"]["hgv"="yes"]',
              fuel: '["amenity"="fuel"]',
              rest_area: '["highway"="rest_area"]',
              weigh_station: '["amenity"="weighbridge"]',
            }
            const tag = typeMap[args.type] || typeMap.truck_stop
            const radius = 25000 // 25km ≈ 15 miles
            const query = `[out:json][timeout:10];(node${tag}(around:${radius},${lat},${lng}););out body 10;`
            const ovRes = await fetch('https://overpass-api.de/api/interpreter', {
              method: 'POST',
              body: 'data=' + encodeURIComponent(query),
            })
            const ovData = await ovRes.json()
            const stops = (ovData.elements || []).slice(0, 5).map(el => {
              const d = haversine(lat, lng, el.lat, el.lon)
              return {
                name: el.tags?.name || el.tags?.brand || 'Unknown Stop',
                brand: el.tags?.brand || '',
                distance_miles: d.toFixed(1),
                lat: el.lat,
                lng: el.lon,
              }
            }).sort((a, b) => a.distance_miles - b.distance_miles)
            if (stops.length > 0) {
              result = { success: true, stops, message: `Found ${stops.length} nearby ${args.type || 'truck stop'}s` }
            } else {
              result = { success: true, stops: [], message: 'No truck stops found within 15 miles. Try expanding your search.' }
            }
          } catch {
            result = { success: false, message: 'Could not search — GPS may be disabled' }
          }
          break
        }
        case 'get_load_details': {
          const detailLoad = args.load_id
            ? loads.find(l => l.id === args.load_id || l.load_id === args.load_id)
            : activeLoads[0]
          if (detailLoad) {
            result = {
              success: true,
              load: {
                id: detailLoad.load_id || detailLoad.id,
                origin: detailLoad.origin,
                destination: detailLoad.destination || detailLoad.dest,
                status: detailLoad.status,
                rate: detailLoad.rate || detailLoad.gross,
                miles: detailLoad.miles,
                rpm: detailLoad.miles ? ((detailLoad.rate || detailLoad.gross || 0) / detailLoad.miles).toFixed(2) : null,
                broker: detailLoad.broker_name || detailLoad.broker,
                equipment: detailLoad.equipment || detailLoad.equipment_type,
                pickup_date: detailLoad.pickup_date,
                delivery_date: detailLoad.delivery_date,
              }
            }
          } else {
            result = { success: false, message: 'No load found' }
          }
          break
        }
        case 'get_load_stops': {
          const stopsLoad = args.load_id
            ? loads.find(l => l.id === args.load_id || l.load_id === args.load_id)
            : activeLoads[0]
          if (stopsLoad && stopsLoad.stops && stopsLoad.stops.length > 0) {
            const currentIdx = stopsLoad.stops.findIndex(s => s.status === 'current')
            result = {
              success: true,
              load_id: stopsLoad.load_id || stopsLoad.id,
              total_stops: stopsLoad.stops.length,
              current_stop: currentIdx >= 0 ? currentIdx + 1 : null,
              stops: stopsLoad.stops.map((s, i) => ({
                number: i + 1,
                type: s.type === 'pickup' ? 'Pickup' : 'Delivery',
                city: s.city || '',
                state: s.state || '',
                address: s.address || '',
                scheduled_date: s.scheduled_date || '',
                contact_name: s.contact_name || '',
                contact_phone: s.contact_phone || '',
                reference_number: s.reference_number || '',
                status: s.status || 'pending',
              })),
              message: `Load has ${stopsLoad.stops.length} stops. ${currentIdx >= 0 ? `Currently at stop ${currentIdx + 1}.` : ''}`,
            }
          } else if (stopsLoad) {
            result = {
              success: true,
              load_id: stopsLoad.load_id || stopsLoad.id,
              total_stops: 2,
              stops: [
                { number: 1, type: 'Pickup', city: stopsLoad.origin, status: 'pending' },
                { number: 2, type: 'Delivery', city: stopsLoad.destination || stopsLoad.dest, status: 'pending' },
              ],
              message: `Standard 2-stop load: pickup at ${stopsLoad.origin}, deliver to ${stopsLoad.destination || stopsLoad.dest}.`,
            }
          } else {
            result = { success: false, message: 'No active load found' }
          }
          break
        }
        case 'get_revenue_summary': {
          const deliveredLoads = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid')
          const rpmAll = deliveredLoads.filter(l => Number(l.miles) > 0 && Number(l.rate || l.gross || 0) > 0)
            .map(l => Number(l.rate || l.gross || 0) / Number(l.miles))
          const avgRpmVal = rpmAll.length > 0 ? (rpmAll.reduce((s, r) => s + r, 0) / rpmAll.length).toFixed(2) : null
          const totalMiles = deliveredLoads.reduce((s, l) => s + Number(l.miles || 0), 0)
          const costPerMile = totalMiles > 0 ? (totalExpenses / totalMiles).toFixed(2) : null
          const projectedAnnual = totalRevenue > 0 ? Math.round(totalRevenue * 12) : null
          const expCats = {}
          expenses.forEach(e => { expCats[e.category] = (expCats[e.category] || 0) + Number(e.amount || 0) })
          const topCats = Object.entries(expCats).sort((a, b) => b[1] - a[1]).slice(0, 3)
            .map(([c, a]) => `${c}: $${a.toLocaleString()}`).join(', ')
          result = {
            success: true,
            revenue: totalRevenue,
            expenses: totalExpenses,
            net_profit: totalRevenue - totalExpenses,
            margin: totalRevenue > 0 ? ((totalRevenue - totalExpenses) / totalRevenue * 100).toFixed(1) + '%' : '0%',
            avg_rpm: avgRpmVal,
            cost_per_mile: costPerMile,
            total_miles: totalMiles,
            completed_loads: deliveredLoads.length,
            active_loads: activeLoads.length,
            unpaid_invoices: unpaidInvoices.length,
            unpaid_total: unpaidInvoices.reduce((s, i) => s + Number(i.amount || 0), 0),
            projected_annual: projectedAnnual,
            top_expense_categories: topCats,
          }
          break
        }
        case 'prompt_scan_document': {
          const docLabels = { bol: 'BOL', pod: 'Proof of Delivery', rate_con: 'Rate Confirmation', fuel_receipt: 'Fuel Receipt', scale_ticket: 'Scale Ticket', lumper_receipt: 'Lumper Receipt', insurance: 'Insurance', other: 'Document' }
          const docLabel = docLabels[args.doc_type] || 'Document'
          const targetLoad = args.load_id ? loads.find(l => l.id === args.load_id || l.load_id === args.load_id) : activeLoads[0]
          setPendingUpload({ doc_type: args.doc_type, load_id: targetLoad?.id || targetLoad?.load_id, prompt: `Scan ${docLabel}` })
          haptic('medium')
          // Auto-open camera after a short delay (lets UI update first)
          setTimeout(() => { if (fileInputRef.current) fileInputRef.current.click() }, 300)
          result = { success: true, message: `Camera is opening for ${docLabel}. The driver can snap a photo now.` }
          break
        }
        case 'start_detention_timer': {
          const now = Date.now()
          const freeTime = args.free_time_hours || 2
          localStorage.setItem('qivori_detention_start', String(now))
          localStorage.setItem('qivori_detention_location', args.location_type || 'shipper')
          localStorage.setItem('qivori_detention_free_time', String(freeTime))
          if (args.load_id) localStorage.setItem('qivori_detention_load_id', args.load_id)
          else localStorage.removeItem('qivori_detention_load_id')
          haptic('success')
          showToast('success', 'Detention Timer Started', `${freeTime}h free time at ${args.location_type}`)
          result = {
            success: true,
            message: `Detention timer started at ${args.location_type}. Free time is ${freeTime} hours. After that, detention accrues at $75/hour. I'll track it for you.`,
            start_time: new Date(now).toLocaleTimeString(),
            free_time_hours: freeTime,
            location_type: args.location_type,
          }
          break
        }
        case 'find_fuel_on_route': {
          try {
            const origin = args.origin || ''
            const dest = args.destination || ''
            // Geocode origin and destination to get coordinates
            const geocode = async (place) => {
              const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(place)}&format=json&limit=1`)
              const data = await res.json()
              return data[0] ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null
            }
            const [origCoords, destCoords] = await Promise.all([geocode(origin), geocode(dest)])
            if (!origCoords || !destCoords) {
              result = { success: false, message: `Could not locate ${!origCoords ? origin : dest}. Try a more specific city name.` }
              break
            }
            // Sample 3 points along the route (25%, 50%, 75%) to find fuel stops
            const points = [0.25, 0.5, 0.75].map(pct => ({
              lat: origCoords.lat + (destCoords.lat - origCoords.lat) * pct,
              lng: origCoords.lng + (destCoords.lng - origCoords.lng) * pct,
            }))
            const allStops = []
            for (const pt of points) {
              try {
                const query = `[out:json][timeout:10];(node["amenity"="fuel"]["brand"](around:40000,${pt.lat},${pt.lng}););out body 8;`
                const ovRes = await fetch('https://overpass-api.de/api/interpreter', {
                  method: 'POST',
                  body: 'data=' + encodeURIComponent(query),
                })
                const ovData = await ovRes.json()
                ;(ovData.elements || []).forEach(el => {
                  const name = el.tags?.name || el.tags?.brand || 'Fuel Station'
                  const brand = el.tags?.brand || ''
                  // Rough distance from origin for sorting
                  const distFromOrig = haversine(origCoords.lat, origCoords.lng, el.lat, el.lon)
                  // Avoid duplicates by name+lat
                  if (!allStops.find(s => s.name === name && Math.abs(s.lat - el.lat) < 0.01)) {
                    allStops.push({
                      name, brand,
                      lat: el.lat, lng: el.lon,
                      miles_from_origin: Math.round(distFromOrig),
                      discount_programs: brand === 'Loves' ? 'My Love Rewards' : brand === 'Pilot' || brand === 'Flying J' ? 'myRewards Plus' : brand === 'TA' || brand === 'Petro' ? 'UltraONE' : '',
                    })
                  }
                })
              } catch { /* skip this sample point */ }
            }
            // Sort by distance from origin
            allStops.sort((a, b) => a.miles_from_origin - b.miles_from_origin)
            const topStops = allStops.slice(0, 8)
            if (topStops.length > 0) {
              result = {
                success: true,
                route: `${origin} → ${dest}`,
                fuel_stops: topStops,
                tip: 'Major chains (Loves, Pilot, TA) typically have the best diesel prices. Use rewards programs to save 3-10¢/gallon.',
                message: `Found ${topStops.length} fuel stops along ${origin} to ${dest}. ${topStops.filter(s => s.discount_programs).length} have loyalty discount programs.`,
              }
            } else {
              result = { success: true, fuel_stops: [], message: `No fuel stations found along the route. Try fueling before departure.` }
            }
          } catch {
            result = { success: false, message: 'Fuel search failed. Try again.' }
          }
          break
        }
        case 'get_trip_pnl': {
          const deliveredAll = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid')
          const tripLoad = args.load_id
            ? loads.find(l => l.id === args.load_id || l.load_id === args.load_id || l.load_number === args.load_id)
            : deliveredAll.sort((a, b) => new Date(b.delivery_date || b.updated_at || 0) - new Date(a.delivery_date || a.updated_at || 0))[0]
          if (!tripLoad) {
            result = { success: false, message: 'No delivered load found. Complete a load first to see trip P&L.' }
          } else {
            const loadId = tripLoad.load_id || tripLoad.id || tripLoad.load_number
            const gross = Number(tripLoad.rate || tripLoad.gross || tripLoad.gross_pay || 0)
            const miles = Number(tripLoad.miles || 0)
            const rpm = miles > 0 ? (gross / miles).toFixed(2) : '0'
            // Find expenses tied to this load's date range
            const pickupDate = tripLoad.pickup_date ? new Date(tripLoad.pickup_date) : null
            const deliveryDate = tripLoad.delivery_date ? new Date(tripLoad.delivery_date) : null
            let tripExpenses = []
            if (pickupDate && deliveryDate) {
              const start = pickupDate.getTime() - 86400000 // 1 day buffer before pickup
              const end = deliveryDate.getTime() + 86400000 // 1 day buffer after delivery
              tripExpenses = expenses.filter(e => {
                const d = new Date(e.date || e.created_at).getTime()
                return d >= start && d <= end
              })
            } else {
              // Fallback: estimate from overall averages
              const avgExpPerMile = totalRevenue > 0 ? totalExpenses / loads.filter(l => Number(l.miles) > 0).reduce((s, l) => s + Number(l.miles), 0) : 1.50
              tripExpenses = [{ category: 'Estimated', amount: Math.round(avgExpPerMile * miles) }]
            }
            const fuelCost = tripExpenses.filter(e => e.category === 'Fuel').reduce((s, e) => s + Number(e.amount || 0), 0)
            const tollCost = tripExpenses.filter(e => e.category === 'Tolls').reduce((s, e) => s + Number(e.amount || 0), 0)
            const foodCost = tripExpenses.filter(e => e.category === 'Food').reduce((s, e) => s + Number(e.amount || 0), 0)
            const maintenanceCost = tripExpenses.filter(e => e.category === 'Maintenance').reduce((s, e) => s + Number(e.amount || 0), 0)
            const otherCost = tripExpenses.filter(e => !['Fuel', 'Tolls', 'Food', 'Maintenance', 'Estimated'].includes(e.category)).reduce((s, e) => s + Number(e.amount || 0), 0)
            const estimatedCost = tripExpenses.find(e => e.category === 'Estimated')
            const totalTripExp = estimatedCost
              ? Number(estimatedCost.amount)
              : fuelCost + tollCost + foodCost + maintenanceCost + otherCost
            const netProfit = gross - totalTripExp
            const netRpm = miles > 0 ? (netProfit / miles).toFixed(2) : '0'
            const marginPct = gross > 0 ? ((netProfit / gross) * 100).toFixed(1) : '0'
            result = {
              success: true,
              load_id: loadId,
              origin: tripLoad.origin,
              destination: tripLoad.destination || tripLoad.dest,
              miles,
              gross_revenue: gross,
              gross_rpm: rpm,
              expenses: estimatedCost ? { estimated_total: totalTripExp, note: 'Based on your average cost-per-mile. Add expenses with dates matching this trip for exact numbers.' }
                : { fuel: fuelCost, tolls: tollCost, food: foodCost, maintenance: maintenanceCost, other: otherCost, total: totalTripExp },
              net_profit: netProfit,
              net_rpm: netRpm,
              margin: marginPct + '%',
              broker: tripLoad.broker_name || tripLoad.broker || 'Unknown',
              verdict: netProfit > 0 ? (Number(marginPct) >= 30 ? 'Excellent trip' : Number(marginPct) >= 15 ? 'Good trip' : 'Thin margin — watch expenses') : 'Lost money on this trip',
              message: `Load ${loadId}: ${tripLoad.origin} → ${tripLoad.destination || tripLoad.dest} | Gross $${gross.toLocaleString()} | Expenses $${totalTripExp.toLocaleString()} | Net $${netProfit.toLocaleString()} (${marginPct}% margin, $${netRpm}/mi net)`,
            }
          }
          break
        }
        case 'check_detention_status': {
          const detStart = localStorage.getItem('qivori_detention_start')
          if (!detStart) {
            result = { success: true, message: 'No detention timer is running. Say "start detention at shipper" to begin tracking.' }
          } else {
            const startMs = Number(detStart)
            const elapsedMs = Date.now() - startMs
            const elapsedHours = elapsedMs / (1000 * 60 * 60)
            const freeHours = Number(localStorage.getItem('qivori_detention_free_time') || '2')
            const locType = localStorage.getItem('qivori_detention_location') || 'shipper'
            const loadId = localStorage.getItem('qivori_detention_load_id') || null
            const overtimeHours = Math.max(0, elapsedHours - freeHours)
            const amountOwed = Math.round(overtimeHours * 75 * 100) / 100
            const elapsedMin = Math.round(elapsedMs / 60000)
            const freeRemaining = Math.max(0, freeHours * 60 - elapsedMin)
            result = {
              success: true,
              location_type: locType,
              load_id: loadId,
              elapsed_minutes: elapsedMin,
              elapsed_display: elapsedMin >= 60 ? `${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m` : `${elapsedMin}m`,
              free_time_hours: freeHours,
              free_time_remaining_minutes: Math.round(freeRemaining),
              overtime_hours: Math.round(overtimeHours * 100) / 100,
              amount_owed: amountOwed,
              rate_per_hour: 75,
              message: overtimeHours > 0
                ? `You've been at the ${locType} for ${elapsedMin >= 60 ? Math.floor(elapsedMin / 60) + 'h ' + (elapsedMin % 60) + 'm' : elapsedMin + ' minutes'}. Free time expired. You're owed $${amountOwed.toFixed(2)} in detention pay ($75/hr x ${overtimeHours.toFixed(1)}h overtime).`
                : `You've been at the ${locType} for ${elapsedMin} minutes. ${Math.round(freeRemaining)} minutes of free time remaining before detention kicks in.`,
            }
          }
          break
        }
        case 'get_reload_options': {
          const dest = args.current_destination || ''
          const destCity = dest.split(',')[0].trim().toLowerCase()
          // Driver avg RPM
          const dlvd = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid')
          const rpmVals = dlvd.filter(l => Number(l.miles) > 0 && Number(l.rate || l.gross || 0) > 0).map(l => Number(l.rate || l.gross || 0) / Number(l.miles))
          const driverAvgRpm = rpmVals.length > 0 ? rpmVals.reduce((s, r) => s + r, 0) / rpmVals.length : 2.50
          let reloads = BOARD_LOADS.filter(l => (l.origin_city || l.origin || '').toLowerCase().includes(destCity))
            .map(l => ({ origin: l.origin_city || l.origin, destination: l.destination_city || l.dest || l.destination, rate: l.rate, miles: l.miles, rpm: Number(l.miles) > 0 ? (Number(l.rate || 0) / Number(l.miles)).toFixed(2) : '0', broker: l.broker_name || l.broker, equipment: l.equipment_type || l.equipment }))
            .sort((a, b) => Number(b.rpm) - Number(a.rpm)).slice(0, 3)
          if (reloads.length === 0) {
            try {
              const lbRes = await apiFetch(`/api/load-board?origin=${encodeURIComponent(dest)}&limit=5`)
              const lbData = await lbRes.json()
              reloads = (lbData.loads || []).map(l => ({ origin: l.origin_city || l.origin, destination: l.destination_city || l.dest || l.destination, rate: l.rate, miles: l.miles, rpm: Number(l.miles) > 0 ? (Number(l.rate || 0) / Number(l.miles)).toFixed(2) : '0', broker: l.broker_name || l.broker, equipment: l.equipment_type || l.equipment }))
                .sort((a, b) => Number(b.rpm) - Number(a.rpm)).slice(0, 3)
            } catch {}
          }
          result = {
            success: true,
            driver_avg_rpm: driverAvgRpm.toFixed(2),
            reloads,
            message: reloads.length > 0
              ? `Found ${reloads.length} reloads from ${dest}. Best: ${reloads[0].origin} to ${reloads[0].destination} at $${reloads[0].rpm}/mi (your avg: $${driverAvgRpm.toFixed(2)}/mi). Say book 1, 2, or 3.`
              : `No reloads available from ${dest} right now.`
          }
          break
        }
        case 'get_rate_trend': {
          const tOrigin = (args.origin || '').split(',')[0].trim()
          const tDest = (args.destination || '').split(',')[0].trim()
          const dlvd = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid')
          const laneLoads = dlvd.filter(l => {
            const o = (l.origin || '').split(',')[0].trim().toLowerCase()
            const d = (l.destination || l.dest || '').split(',')[0].trim().toLowerCase()
            return o.includes(tOrigin.toLowerCase()) && d.includes(tDest.toLowerCase())
          }).filter(l => Number(l.miles) > 0 && Number(l.rate || l.gross || 0) > 0)
          if (laneLoads.length < 2) {
            result = { success: true, message: `Not enough history on ${tOrigin} to ${tDest} — need at least 2 completed loads on this lane.` }
            break
          }
          laneLoads.sort((a, b) => new Date(a.delivery_date || a.pickup_date || a.created_at || 0) - new Date(b.delivery_date || b.pickup_date || b.created_at || 0))
          const allRpms = laneLoads.map(l => Number(l.rate || l.gross || 0) / Number(l.miles))
          const overallAvg = allRpms.reduce((s, r) => s + r, 0) / allRpms.length
          const midpoint = Math.floor(laneLoads.length / 2)
          const olderAvg = allRpms.slice(0, midpoint).reduce((s, r) => s + r, 0) / midpoint
          const recentAvg = allRpms.slice(midpoint).reduce((s, r) => s + r, 0) / (allRpms.length - midpoint)
          const trendPct = ((recentAvg - olderAvg) / olderAvg) * 100
          const trendDir = trendPct > 5 ? 'UP' : trendPct < -5 ? 'DOWN' : 'FLAT'
          // Check board
          const boardMatches = BOARD_LOADS.filter(l => (l.origin_city || l.origin || '').toLowerCase().includes(tOrigin.toLowerCase()) && (l.destination_city || l.dest || l.destination || '').toLowerCase().includes(tDest.toLowerCase()))
          const boardRpms = boardMatches.filter(l => Number(l.miles) > 0).map(l => Number(l.rate || 0) / Number(l.miles))
          const boardAvg = boardRpms.length > 0 ? boardRpms.reduce((s, r) => s + r, 0) / boardRpms.length : null
          result = {
            success: true,
            lane: `${tOrigin} to ${tDest}`,
            total_loads: laneLoads.length,
            overall_avg_rpm: overallAvg.toFixed(2),
            older_avg_rpm: olderAvg.toFixed(2),
            recent_avg_rpm: recentAvg.toFixed(2),
            trend_direction: trendDir,
            trend_percent: trendPct.toFixed(1),
            current_board_rpm: boardAvg?.toFixed(2) || null,
            message: `${tOrigin} to ${tDest}: Your avg $${overallAvg.toFixed(2)}/mi over ${laneLoads.length} loads. Trend ${trendDir} ${Math.abs(trendPct).toFixed(0)}%.${boardAvg ? ` Current board: $${boardAvg.toFixed(2)}/mi.` : ''}`
          }
          break
        }
        case 'find_backhaul': {
          const bhCity = (args.delivery_city || '').split(',')[0].trim().toLowerCase()
          let backhauls = BOARD_LOADS.filter(l => (l.origin_city || l.origin || '').toLowerCase().includes(bhCity))
            .map(l => ({ origin: l.origin_city || l.origin, destination: l.destination_city || l.dest || l.destination, rate: l.rate, miles: l.miles, rpm: Number(l.miles) > 0 ? (Number(l.rate || 0) / Number(l.miles)).toFixed(2) : '0', broker: l.broker_name || l.broker, equipment: l.equipment_type || l.equipment }))
            .sort((a, b) => Number(b.rpm) - Number(a.rpm)).slice(0, 4)
          if (backhauls.length === 0) {
            try {
              const lbRes = await apiFetch(`/api/load-board?origin=${encodeURIComponent(args.delivery_city)}&limit=5`)
              const lbData = await lbRes.json()
              backhauls = (lbData.loads || []).map(l => ({ origin: l.origin_city || l.origin, destination: l.destination_city || l.dest || l.destination, rate: l.rate, miles: l.miles, rpm: Number(l.miles) > 0 ? (Number(l.rate || 0) / Number(l.miles)).toFixed(2) : '0', broker: l.broker_name || l.broker, equipment: l.equipment_type || l.equipment }))
                .sort((a, b) => Number(b.rpm) - Number(a.rpm)).slice(0, 4)
            } catch {}
          }
          result = {
            success: true,
            backhauls,
            message: backhauls.length > 0
              ? `Found ${backhauls.length} backhaul loads from ${args.delivery_city}. Best: ${backhauls[0].origin} to ${backhauls[0].destination} at $${backhauls[0].rpm}/mi, zero deadhead.`
              : `No backhaul loads from ${args.delivery_city} right now. May need to reposition.`
          }
          break
        }
        case 'check_repositioning': {
          const lastDelivery = loads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid')
            .sort((a, b) => new Date(b.delivery_date || b.updated_at || 0) - new Date(a.delivery_date || a.updated_at || 0))[0]
          const currentCity = gpsLocation?.split(',')[0]?.trim() || lastDelivery?.destination?.split(',')[0]?.trim() || ''
          const marketRpms = {}
          BOARD_LOADS.forEach(l => {
            const city = (l.origin_city || l.origin || '').split(',')[0].trim()
            if (!city) return
            const rpm = Number(l.miles) > 0 ? Number(l.rate || 0) / Number(l.miles) : 0
            if (rpm <= 0) return
            if (!marketRpms[city]) marketRpms[city] = []
            marketRpms[city].push(rpm)
          })
          const markets = Object.entries(marketRpms).map(([city, rpms]) => ({
            city, avgRpm: +(rpms.reduce((s, r) => s + r, 0) / rpms.length).toFixed(2), loadCount: rpms.length
          })).filter(m => m.loadCount >= 2).sort((a, b) => b.avgRpm - a.avgRpm)
          const currentMarket = markets.find(m => m.city.toLowerCase() === currentCity.toLowerCase())
          const currentRpm = currentMarket?.avgRpm || 0
          const betterMarkets = markets.filter(m => m.city.toLowerCase() !== currentCity.toLowerCase() && m.avgRpm > currentRpm + 0.30).slice(0, 3)
          result = {
            success: true,
            current_location: currentCity || 'Unknown',
            current_avg_rpm: currentRpm,
            better_markets: betterMarkets,
            top_markets: markets.slice(0, 5),
            message: betterMarkets.length > 0
              ? `${betterMarkets[0].city} is paying $${(betterMarkets[0].avgRpm - currentRpm).toFixed(2)}/mi more than ${currentCity || 'your area'}. Worth repositioning.`
              : `You're in a solid market. Top: ${markets[0]?.city} at $${markets[0]?.avgRpm}/mi.`
          }
          break
        }
        case 'check_broker_risk': {
          const brokerName = args.broker_name || ''
          const bs = brokerStats.find(b => b.name?.toLowerCase().includes(brokerName.toLowerCase()))
          if (!bs) {
            result = { success: true, risk_level: 'UNKNOWN', message: `No history with ${brokerName}. First time — get everything in writing and consider factoring.` }
            break
          }
          let riskLevel = 'MODERATE'
          if (bs.avgDaysToPay !== null && bs.avgDaysToPay < 20 && bs.onTimeRate !== null && bs.onTimeRate > 90) riskLevel = 'TRUSTED'
          else if (bs.avgDaysToPay !== null && bs.avgDaysToPay > 45) riskLevel = 'SLOW PAYER'
          else if (bs.onTimeRate !== null && bs.onTimeRate < 70) riskLevel = 'UNRELIABLE'
          const brokerInvs = invoices.filter(i => (i.broker_name || i.broker || '').toLowerCase().includes(brokerName.toLowerCase()))
          const ghostRisk = brokerInvs.some(i => i.status !== 'Paid' && (Date.now() - new Date(i.created_at || i.date).getTime()) > 60 * 86400000)
          if (ghostRisk) riskLevel = 'PAYMENT RISK'
          result = {
            success: true,
            broker: bs.name,
            risk_level: riskLevel,
            total_loads: bs.totalLoads,
            avg_rpm: bs.avgRpm,
            avg_days_to_pay: bs.avgDaysToPay,
            on_time_rate: bs.onTimeRate,
            has_unpaid_over_60_days: ghostRisk,
            message: `${bs.name}: ${riskLevel}. ${bs.totalLoads} loads, ${bs.avgDaysToPay !== null ? bs.avgDaysToPay + ' days to pay' : 'pay N/A'}, ${bs.onTimeRate !== null ? bs.onTimeRate + '% reliable' : 'reliability N/A'}.`
          }
          break
        }
        case 'check_weekly_target': {
          const targetInput = args.target ? Number(args.target) : null
          const storedTarget = Number(localStorage.getItem('qivori_weekly_target') || '5000')
          const target = targetInput || storedTarget
          if (args.set_target && targetInput) {
            localStorage.setItem('qivori_weekly_target', String(targetInput))
            result = { success: true, message: `Weekly target set to $${targetInput.toLocaleString()}.` }
            break
          }
          const now = new Date()
          const dayOfWeek = now.getDay()
          const weekStart = new Date(now)
          weekStart.setDate(now.getDate() - dayOfWeek)
          weekStart.setHours(0, 0, 0, 0)
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekStart.getDate() + 7)
          const weekLoads = loads.filter(l => {
            if (!['Delivered', 'Invoiced', 'Paid'].includes(l.status)) return false
            const d = new Date(l.delivery_date || l.updated_at || l.created_at)
            return d >= weekStart && d < weekEnd
          })
          const weekRevenue = weekLoads.reduce((s, l) => s + Number(l.rate || l.gross || 0), 0)
          const remaining = Math.max(0, target - weekRevenue)
          const pct = target > 0 ? Math.min(100, (weekRevenue / target) * 100) : 0
          const allDlvd = loads.filter(l => ['Delivered', 'Invoiced', 'Paid'].includes(l.status) && Number(l.rate || l.gross || 0) > 0)
          const avgLoadValue = allDlvd.length > 0 ? allDlvd.reduce((s, l) => s + Number(l.rate || l.gross || 0), 0) / allDlvd.length : 1500
          const loadsNeeded = remaining > 0 ? Math.ceil(remaining / avgLoadValue) : 0
          const daysLeft = Math.max(1, 6 - dayOfWeek)
          result = {
            success: true,
            target,
            week_revenue: weekRevenue,
            week_loads: weekLoads.length,
            progress_percent: +pct.toFixed(0),
            remaining,
            loads_needed: loadsNeeded,
            avg_load_value: Math.round(avgLoadValue),
            days_left: daysLeft,
            daily_pace_needed: remaining > 0 ? Math.round(remaining / daysLeft) : 0,
            message: remaining > 0
              ? `$${weekRevenue.toLocaleString()} of $${target.toLocaleString()} target (${pct.toFixed(0)}%). Need ~${loadsNeeded} more loads in ${daysLeft} days.`
              : `Target hit! $${weekRevenue.toLocaleString()} on a $${target.toLocaleString()} goal.`
          }
          break
        }
        default:
          result = { success: false, message: `Unknown action: ${name}` }
      }
    } catch (err) {
      result = { success: false, message: err.message || 'Action failed' }
    }

    // Send result back to OpenAI so Q can respond based on what happened
    if (dc.readyState === 'open') {
      dc.send(JSON.stringify({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: call_id,
          output: JSON.stringify(result),
        },
      }))
      // Tell OpenAI to generate a response based on the tool result
      dc.send(JSON.stringify({ type: 'response.create' }))
    }
  }, [loads, activeLoads, invoices, unpaidInvoices, expenses, totalRevenue, totalExpenses, addExpense, updateLoadStatus, updateInvoiceStatus, logCheckCall, gpsLocation, showToast])

  // ── OPENAI REALTIME VOICE — real-time conversation with Q ──
  const realtimePcRef = useRef(null) // RTCPeerConnection
  const realtimeDcRef = useRef(null) // data channel
  const realtimeAudioRef = useRef(null) // <audio> for playback

  const startVoiceCall = useCallback(async () => {
    if (inCall || callConnecting) return
    setCallConnecting(true)
    haptic('medium')

    // Kill any playing TTS/audio so two Q's don't talk at once
    window.speechSynthesis?.cancel()
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    document.querySelectorAll('audio').forEach(a => { a.pause(); a.src = '' })

    try {
      // 1. Get ephemeral token from our backend
      const res = await apiFetch('/api/realtime-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverName: driverName || 'Driver',
          context: buildContext(),
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to create session')
      }
      const { client_secret } = await res.json()
      if (!client_secret) throw new Error('No session token')

      // 2. Create RTCPeerConnection
      const pc = new RTCPeerConnection()
      realtimePcRef.current = pc

      // 3. Play remote audio (Q's voice)
      const audioEl = document.createElement('audio')
      audioEl.autoplay = true
      realtimeAudioRef.current = audioEl
      pc.ontrack = (e) => {
        audioEl.srcObject = e.streams[0]
      }

      // 4. Capture mic and add to peer connection
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      // 5. Data channel for events
      const dc = pc.createDataChannel('oai-events')
      realtimeDcRef.current = dc

      dc.onopen = () => {
        setInCall(true)
        setCallConnecting(false)
        haptic('success')
        setMessages(m => [...m, { role: 'assistant', content: 'Connected. Q is listening — talk naturally.' }])
      }

      dc.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data)
          if (event.type === 'response.audio.started' || event.type === 'output_audio_buffer.speech_started') {
            setSpeaking(true)
          }
          if (event.type === 'response.audio.done' || event.type === 'output_audio_buffer.speech_stopped' || event.type === 'response.done') {
            setSpeaking(false)
          }
          // Show Q's text response in chat
          if (event.type === 'response.audio_transcript.done' && event.transcript) {
            setMessages(m => [...m, { role: 'assistant', content: event.transcript }])
          }
          // Show driver's transcribed speech
          if (event.type === 'conversation.item.input_audio_transcription.completed' && event.transcript) {
            setMessages(m => [...m, { role: 'user', content: event.transcript }])
          }
          // Handle function calls from Q — execute actions and return results
          if (event.type === 'response.function_call_arguments.done') {
            handleRealtimeFunctionCall(dc, event)
          }
        } catch {}
      }

      dc.onclose = () => {
        endVoiceCall()
        setMessages(m => [...m, { role: 'assistant', content: 'Call ended. Tap the phone to call again or type below.' }])
      }

      // 6. Create SDP offer and connect to OpenAI Realtime
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      const sdpRes = await fetch('https://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2025-06-03', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${client_secret}`,
          'Content-Type': 'application/sdp',
        },
        body: offer.sdp,
      })

      if (!sdpRes.ok) {
        throw new Error('Failed to connect to OpenAI Realtime')
      }

      const answer = { type: 'answer', sdp: await sdpRes.text() }
      await pc.setRemoteDescription(answer)

    } catch (err) {
      setCallConnecting(false)
      setInCall(false)
      showToast('error', 'Call Failed', err.message || 'Could not connect')
      // Cleanup on failure
      if (realtimePcRef.current) {
        realtimePcRef.current.close()
        realtimePcRef.current = null
      }
    }
  }, [inCall, callConnecting, driverName, buildContext, showToast])

  // Extract memories from conversation transcript (runs in background after calls/chats)
  const extractMemories = useCallback(async (msgs) => {
    if (!msgs || msgs.length < 3) return
    const transcript = msgs.slice(-30).map(m => `${m.role === 'user' ? 'Driver' : 'Q'}: ${m.content}`).join('\n')
    try {
      await apiFetch('/api/q-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'extract', transcript }),
      })
    } catch { /* silent — memory extraction is best-effort */ }
  }, [])

  const endVoiceCall = useCallback(() => {
    if (realtimeDcRef.current) {
      realtimeDcRef.current.close()
      realtimeDcRef.current = null
    }
    if (realtimePcRef.current) {
      realtimePcRef.current.getSenders().forEach(s => { if (s.track) s.track.stop() })
      realtimePcRef.current.close()
      realtimePcRef.current = null
    }
    if (realtimeAudioRef.current) {
      realtimeAudioRef.current.srcObject = null
      realtimeAudioRef.current = null
    }
    setInCall(false)
    setCallConnecting(false)
    setSpeaking(false)
    // Extract memories from the voice call conversation (background)
    extractMemories(messages)
  }, [messages, extractMemories])

  // Cleanup call on unmount
  useEffect(() => {
    return () => {
      if (realtimePcRef.current) {
        realtimePcRef.current.getSenders().forEach(s => { if (s.track) s.track.stop() })
        realtimePcRef.current.close()
        realtimePcRef.current = null
      }
      if (realtimeDcRef.current) {
        realtimeDcRef.current.close()
        realtimeDcRef.current = null
      }
    }
  }, [])

  // AI TTS via OpenAI — for text chat responses only
  const speakWithAI = useCallback(async (text, onDone) => {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const res = await apiFetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      if (!res.ok || res.status === 204) { onDone?.(); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = audioRef.current || new Audio()
      audio.src = url
      audio.onplay = () => setSpeaking(true)
      audio.onended = () => { setSpeaking(false); URL.revokeObjectURL(url); onDone?.() }
      audio.onerror = () => { setSpeaking(false); URL.revokeObjectURL(url); onDone?.() }
      await audio.play()
      setTimeout(() => setSpeaking(false), 30000)
    } catch { onDone?.() }
  }, [])

  const speak = useCallback(async (text, onDone) => {
    // Don't TTS if in a Retell call (Retell handles voice) or speaker is off
    if (inCall || !speakerOn || !text) { onDone?.(); return }
    speakWithAI(text, onDone)
  }, [inCall, speakerOn, speakWithAI])

  // Stop speaking when speaker is toggled off
  useEffect(() => {
    if (!speakerOn) {
      window.speechSynthesis?.cancel()
      if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = '' }
    }
  }, [speakerOn])

  // When hands-free is enabled, ensure speaker is on
  useEffect(() => {
    if (handsFree) setSpeakerOn(true)
  }, [handsFree])

  // ── WEIGH STATION REPORT ──────────────────────
  const reportWeighStation = async (ws, reportStatus) => {
    try {
      await apiFetch('/api/weigh-stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'report',
          station_key: ws.key,
          station_name: ws.name,
          state: ws.state,
          highway: ws.highway,
          lat: ws.lat,
          lng: ws.lng,
          status: reportStatus,
        }),
      })
      showToast('success', 'Report Submitted', `${ws.name} marked ${reportStatus}`)
      setMessages(msgs => msgs.map(m => {
        if (!m.weighStations) return m
        return {
          ...m,
          weighStations: m.weighStations.map(s =>
            s.key === ws.key
              ? { ...s, open: reportStatus === 'open', status: reportStatus === 'open' ? 'Open \u2014 you reported just now' : 'Closed \u2014 you reported just now', reportedBy: 'you' }
              : s
          ),
        }
      }))
    } catch (err) {
      showToast('error', 'Report Failed', 'Could not submit \u2014 try again')
    }
  }

  // ── GPS COORDS (returns promise with lat/lng) ──
  const getGPSCoords = () => new Promise((resolve) => {
    if (!navigator.geolocation) {
      showToast('error', 'GPS Unavailable', 'Your browser does not support GPS')
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => {
        const msgs = {
          1: 'Location permission denied. Go to Settings \u2192 Safari \u2192 Location and allow for qivori.com',
          2: 'Could not determine your location. Make sure GPS is turned on.',
          3: 'Location request timed out. Try again in an open area.',
        }
        showToast('error', 'Location Error', msgs[err.code] || 'Failed to get location')
        resolve(null)
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    )
  })

  // ── PUSH-TO-TALK (MediaRecorder + Whisper) ──────────────────────────
  const mediaRecorderRef = useRef(null)
  const audioChunksRef = useRef([])
  const recordingTimerRef = useRef(null)

  const startListening = useCallback(async () => {
    unlockTTS()

    // If already recording, stop and transcribe
    if (listening) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop()
      }
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []

      // Use webm if supported, fall back to mp4 for iOS
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : ''
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream)
      mediaRecorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop())
        setListening(false)
        if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current)

        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        if (blob.size < 1000) return

        // Immediately show processing state — feels instant
        haptic('light')
        setMessages(m => [...m, { role: 'user', content: 'Voice message...', _processing: true }])
        setLoading(true)

        try {
          const form = new FormData()
          form.append('audio', blob, 'recording.webm')
          const res = await apiFetch('/api/transcribe', { method: 'POST', body: form })
          const data = await res.json()
          const text = (data.text || '').trim()
          if (text && text.length > 1) {
            // Replace processing message with actual text
            setMessages(m => m.map((msg, i) => i === m.length - 1 && msg._processing ? { role: 'user', content: text } : msg))
            setLoading(false)
            lastInputWasVoiceRef.current = true
            sendMessageRef.current?.(text)
          } else {
            // Remove processing message
            setMessages(m => m.filter(msg => !msg._processing))
            setLoading(false)
            showToast('', 'No Speech', 'Tap the mic and speak clearly')
          }
        } catch {
          setMessages(m => m.filter(msg => !msg._processing))
          setLoading(false)
          showToast('error', 'Try Again', 'Could not process audio')
        }
      }

      recorder.start()
      setListening(true)
      haptic('medium')

      // Auto-stop after 30 seconds
      recordingTimerRef.current = setTimeout(() => {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop()
        }
      }, 30000)
    } catch (err) {
      setListening(false)
      if (err.name === 'NotAllowedError') {
        showToast('error', 'Mic Blocked', 'Allow microphone in your browser settings')
      } else {
        showToast('error', 'Mic Error', err.message || 'Could not access microphone')
      }
    }
  }, [listening, unlockTTS, showToast, haptic])

  // Keep startListening ref in sync for hands-free callback
  startListeningRef.current = startListening

  // Format parsed document data for chat display
  const formatParsedDoc = (data) => {
    if (!data || !data.type) return null
    const lines = []
    switch (data.type) {
      case 'rate_con':
        lines.push('**Rate Confirmation Parsed**')
        if (data.origin && data.destination) lines.push(`${data.origin.city || ''}, ${data.origin.state || ''} \u2192 ${data.destination.city || ''}, ${data.destination.state || ''}`)
        if (data.rate) lines.push(`Rate: $${Number(data.rate).toLocaleString()}`)
        if (data.broker) lines.push(`Broker: ${data.broker}`)
        if (data.equipment) lines.push(`Equipment: ${data.equipment}`)
        if (data.weight) lines.push(`Weight: ${data.weight} lbs`)
        if (data.pickup_date) lines.push(`Pickup: ${data.pickup_date}${data.pickup_time ? ' ' + data.pickup_time : ''}`)
        if (data.delivery_date) lines.push(`Delivery: ${data.delivery_date}${data.delivery_time ? ' ' + data.delivery_time : ''}`)
        if (data.reference) lines.push(`Ref: ${data.reference}`)
        break
      case 'bol':
        lines.push('**Bill of Lading Parsed**')
        if (data.bol_number) lines.push(`BOL #: ${data.bol_number}`)
        if (data.shipper) lines.push(`Shipper: ${data.shipper}`)
        if (data.consignee) lines.push(`Consignee: ${data.consignee}`)
        if (data.pieces) lines.push(`Pieces: ${data.pieces}`)
        if (data.weight) lines.push(`Weight: ${data.weight} lbs`)
        if (data.commodity) lines.push(`Commodity: ${data.commodity}`)
        if (data.hazmat) lines.push(`\u26a0\ufe0f HAZMAT: ${data.hazmat_class || 'Yes'}`)
        if (data.seal_number) lines.push(`Seal: ${data.seal_number}`)
        if (data.po_numbers?.length) lines.push(`PO #s: ${data.po_numbers.join(', ')}`)
        break
      case 'pod':
        lines.push('**Proof of Delivery Parsed**')
        if (data.receiver_name) lines.push(`Receiver: ${data.receiver_name}`)
        lines.push(`Signature: ${data.signature ? 'Yes' : 'No'}`)
        if (data.delivery_date) lines.push(`Delivered: ${data.delivery_date}${data.delivery_time ? ' ' + data.delivery_time : ''}`)
        if (data.pieces_received) lines.push(`Pieces: ${data.pieces_received}`)
        if (data.damage_noted) lines.push(`\u26a0\ufe0f Damage noted: ${data.damage_description || 'Yes'}`)
        if (data.shortage_noted) lines.push(`\u26a0\ufe0f Shortage noted`)
        if (data.notes) lines.push(`Notes: ${data.notes}`)
        break
      case 'fuel_receipt':
        lines.push('**Fuel Receipt Parsed**')
        if (data.station) lines.push(`Station: ${data.station}`)
        if (data.location?.city) lines.push(`Location: ${data.location.city}, ${data.location.state || ''}`)
        if (data.gallons) lines.push(`Gallons: ${data.gallons}`)
        if (data.price_per_gallon) lines.push(`Price/gal: $${data.price_per_gallon}`)
        if (data.total) lines.push(`Total: $${Number(data.total).toLocaleString()}`)
        if (data.fuel_type) lines.push(`Fuel: ${data.fuel_type}`)
        if (data.date) lines.push(`Date: ${data.date}`)
        if (data.odometer) lines.push(`Odometer: ${data.odometer}`)
        break
      case 'scale_ticket':
        lines.push('**Scale Ticket Parsed**')
        if (data.ticket_number) lines.push(`Ticket #: ${data.ticket_number}`)
        if (data.weight_gross) lines.push(`Gross: ${Number(data.weight_gross).toLocaleString()} lbs`)
        if (data.weight_tare) lines.push(`Tare: ${Number(data.weight_tare).toLocaleString()} lbs`)
        if (data.weight_net) lines.push(`Net: ${Number(data.weight_net).toLocaleString()} lbs`)
        if (data.location) lines.push(`Location: ${data.location}`)
        if (data.date) lines.push(`Date: ${data.date}`)
        break
      case 'insurance':
        lines.push('**Insurance Certificate Parsed**')
        if (data.carrier) lines.push(`Carrier: ${data.carrier}`)
        if (data.insurer) lines.push(`Insurer: ${data.insurer}`)
        if (data.policy_number) lines.push(`Policy: ${data.policy_number}`)
        if (data.coverage_type) lines.push(`Coverage: ${data.coverage_type}`)
        if (data.effective_date) lines.push(`Effective: ${data.effective_date}`)
        if (data.expiration_date) lines.push(`Expires: ${data.expiration_date}`)
        break
      default:
        return null
    }
    if (data._meta?.overall_confidence != null) {
      lines.push(`\nConfidence: ${Math.round(data._meta.overall_confidence * 100)}%`)
    }
    if (data.warnings?.length) {
      lines.push(`\n\u26a0\ufe0f ${data.warnings.join('; ')}`)
    }
    return lines.filter(Boolean).join('\n')
  }

  // Handle document photo upload
  const handleDocUpload = async (file) => {
    if (!file || !pendingUpload) return
    const { doc_type, load_id } = pendingUpload
    const docLabels = { bol: 'BOL', signed_bol: 'Signed BOL', rate_con: 'Rate Confirmation', pod: 'Proof of Delivery', lumper_receipt: 'Lumper Receipt', scale_ticket: 'Scale Ticket', fuel_receipt: 'Fuel Receipt', insurance: 'Insurance Certificate', other: 'Document' }
    const label = docLabels[doc_type] || 'Document'

    const parseableTypes = ['rate_con', 'bol', 'pod', 'fuel_receipt', 'scale_ticket', 'insurance']
    const shouldParse = parseableTypes.includes(doc_type) || doc_type === 'other' || doc_type === 'signed_bol' || doc_type === 'lumper_receipt'
    const parseDocType = parseableTypes.includes(doc_type) ? doc_type : 'auto'

    try {
      const { uploadFile } = await import('../../lib/storage')
      const { createDocument } = await import('../../lib/database')
      const uploaded = await uploadFile(file, 'documents')

      const load = loads.find(l => l.id === load_id || l.load_id === load_id) || activeLoads[0]

      await createDocument({
        name: `${label} \u2014 ${load?.load_id || 'Unknown'}`,
        type: doc_type,
        url: uploaded.url,
        load_id: load?.id,
        company_id: company?.id,
        uploaded_at: new Date().toISOString(),
      })

      showToast('success', `${label} Uploaded`, file.name)

      setPendingUpload(null)
      setMessages(m => [
        ...m,
        { role: 'user', content: `[Uploaded ${label} photo: ${file.name}]`, isDoc: true },
      ])

      if (shouldParse) {
        setLoading(true)
        try {
          const base64 = await new Promise((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => resolve(reader.result.split(',')[1])
            reader.onerror = reject
            reader.readAsDataURL(file)
          })

          const mediaType = file.type || 'image/jpeg'
          const res = await apiFetch('/api/parse-document', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ file: base64, mediaType, documentType: parseDocType }),
          })
          const result = await res.json()

          if (result.success && result.data) {
            const formatted = formatParsedDoc(result.data)
            if (formatted) {
              setMessages(m => [...m, { role: 'assistant', content: formatted }])
            } else {
              sendMessage(`I just uploaded the ${label} for load ${load?.load_id || load_id}. Here is the extracted data: ${JSON.stringify(result.data)}`)
            }
          } else {
            sendMessage(`I just uploaded the ${label} for load ${load?.load_id || load_id}`)
          }
        } catch (parseErr) {
          sendMessage(`I just uploaded the ${label} for load ${load?.load_id || load_id}`)
        } finally {
          setLoading(false)
        }
      } else {
        sendMessage(`I just uploaded the ${label} for load ${load?.load_id || load_id}`)
      }
    } catch (err) {
      showToast('warning', 'Saved Locally', `${label} saved \u2014 will sync when online`)
      setPendingUpload(null)
      setMessages(m => [
        ...m,
        { role: 'user', content: `[${label} photo captured: ${file.name}]`, isDoc: true },
      ])
    }
  }

  // Handle rate con photo — parse and auto-book
  const handleRateConPhoto = async (file) => {
    if (!file) return
    setShowQuickActions(false)
    setMessages(m => [...m, { role: 'user', content: `[Snapped rate confirmation: ${file.name}]`, isDoc: true }])
    setLoading(true)

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const mediaType = file.type || 'image/jpeg'

      const res = await apiFetch('/api/parse-ratecon', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: base64, mediaType }),
      })
      const parsed = await res.json()

      if (parsed.error) {
        setMessages(m => [...m, { role: 'assistant', content: `Could not read that rate con: ${parsed.error}. Try a clearer photo.` }])
        setLoading(false)
        return
      }

      const details = [
        `**Rate Con Parsed!**`,
        ``,
        parsed.origin && parsed.destination ? `${parsed.origin} \u2192 ${parsed.destination}` : '',
        parsed.rate ? `Rate: $${Number(parsed.rate).toLocaleString()}` : '',
        parsed.broker ? `Broker: ${parsed.broker}` : '',
        parsed.miles ? `Miles: ${parsed.miles}` : '',
        parsed.equipment ? `Equipment: ${parsed.equipment}` : '',
        parsed.weight ? `Weight: ${parsed.weight} lbs` : '',
        parsed.commodity ? `Commodity: ${parsed.commodity}` : '',
        parsed.pickup_date ? `Pickup: ${parsed.pickup_date}${parsed.pickup_time ? ' ' + parsed.pickup_time : ''}` : '',
        parsed.delivery_date ? `Delivery: ${parsed.delivery_date}${parsed.delivery_time ? ' ' + parsed.delivery_time : ''}` : '',
        parsed.load_number ? `Load #: ${parsed.load_number}` : '',
        parsed.reference_number ? `Ref #: ${parsed.reference_number}` : '',
        ``,
        `Booking this load now...`,
      ].filter(Boolean).join('\n')

      setMessages(m => [...m, { role: 'assistant', content: details }])

      try {
        await addLoad({
          origin: parsed.origin || '',
          destination: parsed.destination || '',
          miles: parsed.miles || 0,
          rate: parsed.rate || 0,
          rate_per_mile: parsed.miles && parsed.rate ? (parsed.rate / parsed.miles).toFixed(2) : 0,
          equipment: parsed.equipment || 'Dry Van',
          broker_name: parsed.broker || '',
          weight: parsed.weight || '',
          commodity: parsed.commodity || '',
          pickup_date: parsed.pickup_date || '',
          delivery_date: parsed.delivery_date || '',
          reference_number: parsed.reference_number || parsed.load_number || '',
          status: 'Booked',
          load_type: parsed.load_type || 'FTL',
          shipper_name: parsed.shipper_name || '',
          consignee_name: parsed.consignee_name || '',
          notes: parsed.special_instructions || parsed.notes || '',
        })

        const confirmMsg = `Booked! ${parsed.origin || 'Origin'} \u2192 ${parsed.destination || 'Destination'}, $${Number(parsed.rate || 0).toLocaleString()}, ${parsed.broker || 'Unknown Broker'}`
        setMessages(m => [...m, { role: 'assistant', content: confirmMsg }])
        speak(confirmMsg)
        showToast('success', 'Load Booked!', `${parsed.origin} \u2192 ${parsed.destination} \u2014 $${Number(parsed.rate || 0).toLocaleString()}`)
      } catch (err) {
        setMessages(m => [...m, { role: 'assistant', content: `Parsed the rate con but couldn't book: ${err.message}. You can book it manually.` }])
        showToast('error', 'Booking Failed', err.message)
      }
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: `Error processing the rate con: ${err.message || 'Try again.'}` }])
    } finally {
      setLoading(false)
    }
  }

  // Send message
  const sendMessage = async (text) => {
    const userText = text || input.trim()
    if (!userText) return
    if (loading) return
    unlockTTS()
    setShowQuickActions(false)
    const newMessages = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    // Safety: force-clear loading after 15s so chat NEVER gets stuck
    if (loadingSafetyRef.current) clearTimeout(loadingSafetyRef.current)
    loadingSafetyRef.current = setTimeout(() => setLoading(false), 15000)

    const lowerText = userText.toLowerCase()

    // ── PROACTIVE LOAD FINDING AGENT — driver response handling ──
    if (proactiveLoadsRef.current.length > 0) {
      if (/\b(book\s*it|yes|accept|grab\s*it|take\s*it|let'?s?\s*go|book\s*that)\b/.test(lowerText)) {
        const best = proactiveLoadsRef.current[0]
        try {
          await addLoad({
            origin: best.origin_city || best.origin || '',
            destination: best.destination_city || best.dest || best.destination || '',
            miles: best.miles || 0,
            rate: best.rate || 0,
            rate_per_mile: best.miles ? (best.rate / best.miles).toFixed(2) : 0,
            equipment: best.equipment_type || best.equipment || 'Dry Van',
            broker_name: best.broker_name || best.broker || '',
            weight: best.weight || '',
            pickup_date: best.pickup_date || '',
            delivery_date: best.delivery_date || '',
            status: 'Booked',
            load_type: 'FTL',
          })
          const dest = best.destination_city || best.dest || best.destination || '?'
          haptic('success')
          setMessages(m => [...m, { role: 'assistant', content: `**Load Booked!** ${best.origin_city || best.origin} \u2192 ${dest}\n$${Number(best.rate || 0).toLocaleString()} \u00b7 ${best.miles} mi \u00b7 AI Score ${best._aiScore}/99\n\nYour next load is locked in before you even delivered this one.`, isProactive: true }])
          speak(`Load booked! ${best.origin_city || best.origin} to ${dest} for $${Number(best.rate || 0).toLocaleString()}.`)
          showToast('success', 'Load Booked!', `${best.origin_city || best.origin} \u2192 ${dest}`)
          logProactiveActivity('booked', `Auto-booked: ${best.origin_city || best.origin}\u2192${dest} $${best.rate} (${best._aiScore}/99)`)
          proactiveLoadsRef.current = []
        } catch (err) {
          setMessages(m => [...m, { role: 'assistant', content: `Couldn't book that load: ${err.message}. Try again or say "show me more".` }])
        }
        setLoading(false)
        return
      }

      if (/\b(show\s*me\s*more|more\s*options|more\s*loads|other\s*loads|what\s*else|top\s*3)\b/.test(lowerText)) {
        const top3 = proactiveLoadsRef.current.slice(0, 3)
        const lines = top3.map((l, i) => {
          const orig = l.origin_city || l.origin || '?'
          const dest = l.destination_city || l.dest || l.destination || '?'
          const rpm = l.miles ? (l.rate / l.miles).toFixed(2) : '\u2014'
          return `**${i + 1}. ${orig} \u2192 ${dest}**\n$${Number(l.rate || 0).toLocaleString()} \u00b7 $${rpm}/mi \u00b7 ${l.miles || '?'} mi \u00b7 ${l.broker_name || l.broker || '?'} \u00b7 Score: ${l._aiScore}/99`
        })
        setMessages(m => [...m, {
          role: 'assistant',
          content: `**Top ${top3.length} Loads from your delivery city:**\n\n${lines.join('\n\n')}\n\nSay **"book 1"**, **"book 2"**, or **"book 3"** to grab one.`,
          isProactive: true,
        }])
        speak(`Here are your top ${top3.length} options.`)
        setLoading(false)
        return
      }

      const bookMatch = lowerText.match(/\bbook\s*(\d)\b/)
      if (bookMatch) {
        const idx = parseInt(bookMatch[1]) - 1
        const load = proactiveLoadsRef.current[idx]
        if (load) {
          try {
            await addLoad({
              origin: load.origin_city || load.origin || '',
              destination: load.destination_city || load.dest || load.destination || '',
              miles: load.miles || 0,
              rate: load.rate || 0,
              rate_per_mile: load.miles ? (load.rate / load.miles).toFixed(2) : 0,
              equipment: load.equipment_type || load.equipment || 'Dry Van',
              broker_name: load.broker_name || load.broker || '',
              status: 'Booked',
              load_type: 'FTL',
            })
            const dest = load.destination_city || load.dest || load.destination
            haptic('success')
            setMessages(m => [...m, { role: 'assistant', content: `**Booked load #${idx + 1}!** ${load.origin_city || load.origin} \u2192 ${dest} \u00b7 $${Number(load.rate || 0).toLocaleString()} \u00b7 Score ${load._aiScore}/99`, isProactive: true }])
            speak(`Load number ${idx + 1} booked!`)
            showToast('success', 'Load Booked!', `${load.origin_city || load.origin} \u2192 ${dest}`)
            logProactiveActivity('booked', `Booked option #${idx + 1}: ${load.origin_city || load.origin}\u2192${dest} $${load.rate}`)
            proactiveLoadsRef.current = []
          } catch (err) {
            setMessages(m => [...m, { role: 'assistant', content: `Couldn't book: ${err.message}` }])
          }
          setLoading(false)
          return
        }
      }

      if (/\b(no\s*thanks?|no|dismiss|not\s*now|skip|pass|later|nah)\b/.test(lowerText)) {
        proactiveDismissedRef.current = Date.now()
        proactiveTriggeredRef.current = false
        proactiveLoadsRef.current = []
        setMessages(m => [...m, { role: 'assistant', content: `Got it \u2014 I'll check again in 30 minutes for new loads.`, isProactive: true }])
        speak('No problem. I\'ll check again in 30 minutes.')
        logProactiveActivity('dismissed', 'Driver dismissed proactive suggestion')
        setLoading(false)
        return
      }
    }

    // ── ACCOUNT MANAGEMENT — upgrade/downgrade plan ──
    if (/\b(upgrade|downgrade|change)\s*(my\s*)?(plan|subscription|account|tier)\b/.test(lowerText) || /\b(upgrade\s*to|switch\s*to)\s*(basic|pro|autopilot|autopilot\s*ai|solo|fleet|enterprise|growing|autonomous)\b/.test(lowerText)) {
      const targetPlan = { id: 'autonomous_fleet', name: 'Qivori AI Dispatch', price: '$199/mo + $99/truck (founder pricing)' }
      try {
        const res = await apiFetch('/api/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: targetPlan.id, email: user?.email, userId: user?.id }),
        })
        const data = await res.json()
        if (data.url) {
          setMessages(m => [...m, { role: 'assistant', content: `**Subscribe to ${targetPlan.name} (${targetPlan.price})**\n\nI've generated your checkout link. Tap below to complete:\n\n[Subscribe Now](${data.url})\n\nIncludes a 14-day free trial. Cancel anytime. Everything included, no upsells.` }])
          speak(`Opening checkout for the Qivori AI Dispatch plan at 199 dollars per month plus 99 per truck.`)
          setTimeout(() => window.open(data.url, '_blank'), 1500)
        } else {
          setMessages(m => [...m, { role: 'assistant', content: `Couldn't create checkout: ${data.error || 'Try again later.'}` }])
        }
      } catch (err) {
        setMessages(m => [...m, { role: 'assistant', content: `Error creating checkout: ${err.message}` }])
      }
      setLoading(false)
      return
    }

    // ── ACCOUNT MANAGEMENT — activate/deactivate features ──
    if (/\b(activate|enable|turn\s*on|start|deactivate|disable|turn\s*off|stop)\s+(load\s*find|proactive|autopilot|eld|hos\s*track|ifta|fuel\s*optim|broker\s*risk|csa|compliance|dvir|clearinghouse|notifications?|push)\b/i.test(lowerText)) {
      const isActivate = /\b(activate|enable|turn\s*on|start)\b/i.test(lowerText)
      const featureMatch = lowerText.match(/\b(load\s*find\w*|proactive|autopilot|eld|hos\s*track\w*|ifta|fuel\s*optim\w*|broker\s*risk|csa|compliance|dvir|clearinghouse|notifications?|push)\b/i)
      const feature = featureMatch ? featureMatch[1].trim() : 'unknown'

      const featureNames = {
        'load find': 'Proactive Load Finding', 'proactive': 'Proactive Load Finding', 'autopilot': 'Autopilot AI',
        'eld': 'ELD/HOS Tracking', 'hos track': 'HOS Tracking', 'ifta': 'IFTA Reporting',
        'fuel optim': 'Fuel Optimizer', 'broker risk': 'Broker Risk Intel', 'csa': 'CSA Score Monitor',
        'compliance': 'AI Compliance Center', 'dvir': 'DVIR', 'clearinghouse': 'Drug & Alcohol Clearinghouse',
        'notification': 'Push Notifications', 'notifications': 'Push Notifications', 'push': 'Push Notifications',
      }
      const friendlyName = Object.entries(featureNames).find(([k]) => feature.includes(k))?.[1] || feature

      try {
        const { supabase: sb } = await import('../../lib/supabase')
        const settingKey = `feature_${feature.replace(/\s+/g, '_')}`
        await sb.from('platform_settings').upsert({
          owner_id: user?.id,
          key: settingKey,
          value: isActivate ? 'true' : 'false',
        }, { onConflict: 'owner_id,key' })

        const action = isActivate ? 'activated' : 'deactivated'
        setMessages(m => [...m, { role: 'assistant', content: `**${friendlyName}** has been **${action}**.\n\n${isActivate ? 'This feature is now active on your account.' : 'This feature has been turned off. You can re-enable it anytime by saying "activate ' + feature + '".'}` }])
        speak(`${friendlyName} has been ${action}.`)
        showToast('success', `Feature ${isActivate ? 'Activated' : 'Deactivated'}`, friendlyName)
      } catch (err) {
        setMessages(m => [...m, { role: 'assistant', content: `Couldn't update that setting: ${err.message}. Try going to Settings manually.` }])
      }
      setLoading(false)
      return
    }

    // ── ACCOUNT MANAGEMENT — help / how-to questions ──
    if (/\b(help\s*(me\s*)?(with|using|about|understand)|how\s*(do\s*i|to|can\s*i)|what\s*is|explain|show\s*me\s*(how|my))\s+(bol|bill\s*of\s*lading|ifta|rate\s*con|invoice|expense|check\s*call|eld|hos|dvir|csa|clearinghouse|fuel|dispatch|load\s*board|settlement|factoring|quickbooks)\b/i.test(lowerText)) {
      // Let the AI handle this with extra context
    }

    // ── ACCOUNT MANAGEMENT — escalate to admin ──
    if (/\b(talk\s*to\s*(a\s*)?(human|admin|support|person|agent)|escalate|can'?t\s*(figure|solve|fix)|need\s*help\s*from\s*(admin|support|team))\b/i.test(lowerText)) {
      try {
        await apiFetch('/api/admin-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            severity: 'warning',
            title: 'Support Escalation',
            message: `Driver ${user?.email || 'unknown'} requested human support. Message: "${userText}"`,
            source: 'chatbot-escalation',
            userId: user?.id,
          }),
        })
        setMessages(m => [...m, { role: 'assistant', content: `I've escalated your request to the admin team. They'll get back to you via email at **${user?.email || 'your registered email'}**.\n\nIn the meantime, can you tell me more about what you need help with? I might be able to assist.` }])
        speak("I've sent your request to the admin team. They'll reach out to you soon.")
        showToast('success', 'Escalated', 'Admin team notified')
      } catch {
        setMessages(m => [...m, { role: 'assistant', content: 'I had trouble sending that escalation. Please email **hello@qivori.com** directly for support.' }])
      }
      setLoading(false)
      return
    }

    // ── VOICE MODE — just use push-to-talk mic ──
    if (/\b(call\s*q|talk\s*to\s*q|voice\s*mode|hands[\s-]*free)\b/i.test(lowerText)) {
      setMessages(m => [...m, { role: 'assistant', content: 'Just tap the mic button and speak. Q is always listening.' }])
      setLoading(false)
      return
    }

    // ── SHOW MY SUBSCRIPTION ──
    if (/\b(show|what'?s?|view|check)\s*(my\s*)?(subscription|plan|current\s*plan|account\s*status|billing\s*status)\b/i.test(lowerText) && !/upgrade|downgrade|change|cancel/i.test(lowerText)) {
      const plan = subscription?.plan || 'Free'
      const status = subscription?.status || 'inactive'
      const trial = subscription?.isTrial
      const trialEnd = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null
      const planPrices = { autonomous_fleet: '$199/mo + $99/truck', autopilot: '$199/mo + $99/truck', autopilot_ai: '$199/mo + $99/truck' }
      const price = planPrices[plan] || 'Free'
      let msg = `**Your Subscription**\n\n**Plan:** ${plan.charAt(0).toUpperCase() + plan.slice(1)}\n**Price:** ${price}\n**Status:** ${status.charAt(0).toUpperCase() + status.slice(1)}`
      if (trial && trialEnd) msg += `\n**Trial ends:** ${trialEnd}`
      msg += `\n\nSay **"upgrade my plan"** to change plans or **"update payment method"** to manage billing.`
      setMessages(m => [...m, { role: 'assistant', content: msg }])
      speak(`You're on the ${plan} plan, status ${status}.`)
      setLoading(false)
      return
    }

    // ── WHEN DOES MY TRIAL END ──
    if (/\b(when|how\s*long).*(trial|free\s*period)\s*(end|expire|left|over|finish)\b/i.test(lowerText) || /\btrial\s*(end|expir)\b/i.test(lowerText)) {
      if (subscription?.isTrial && subscription?.trialEndsAt) {
        const endDate = new Date(subscription.trialEndsAt)
        const daysLeft = Math.max(0, Math.ceil((endDate - Date.now()) / 86400000))
        const formatted = endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
        setMessages(m => [...m, { role: 'assistant', content: `**Your trial ends ${formatted}** (${daysLeft} day${daysLeft !== 1 ? 's' : ''} left).\n\nAfter your trial, you'll be charged automatically. Say **"upgrade my plan"** to see plan options or **"cancel my subscription"** to cancel before the trial ends.` }])
        speak(`Your trial ends in ${daysLeft} days, on ${formatted}.`)
      } else if (subscription?.isActive) {
        setMessages(m => [...m, { role: 'assistant', content: `You're not on a trial \u2014 you have an **active subscription**. Say **"show my subscription"** for details.` }])
        speak("You're not on a trial. You have an active subscription.")
      } else {
        setMessages(m => [...m, { role: 'assistant', content: `You don't have an active trial. Say **"upgrade my plan"** to get started with a 14-day free trial.` }])
        speak("You don't have an active trial. Say upgrade my plan to start one.")
      }
      setLoading(false)
      return
    }

    // ── CANCEL SUBSCRIPTION ──
    if (/\b(cancel)\s*(my\s*)?(subscription|plan|account|membership)\b/i.test(lowerText)) {
      if (subscription?.customerId) {
        setMessages(m => [...m, { role: 'assistant', content: `**Are you sure you want to cancel?**\n\nYou'll lose access to premium features at the end of your billing period. I'm opening the billing portal where you can manage or cancel your subscription.\n\nIf you're having issues, say **"report a problem"** and we'll help resolve it.` }])
        speak("I'm opening the billing portal for you.")
        try {
          const res = await apiFetch('/api/create-portal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerId: subscription.customerId }),
          })
          const data = await res.json()
          if (data.url) setTimeout(() => window.open(data.url, '_blank'), 1500)
        } catch {}
      } else {
        setMessages(m => [...m, { role: 'assistant', content: `You don't have an active subscription to cancel. Say **"upgrade my plan"** to see available plans.` }])
        speak("You don't have an active subscription to cancel.")
      }
      setLoading(false)
      return
    }

    // ── UPDATE PAYMENT METHOD ──
    if (/\b(update|change|edit|manage)\s*(my\s*)?(payment|card|billing|credit\s*card|payment\s*method)\b/i.test(lowerText)) {
      if (subscription?.customerId) {
        setMessages(m => [...m, { role: 'assistant', content: `Opening the **billing portal** where you can update your payment method, view invoices, and manage your subscription.` }])
        speak("Opening your billing portal now.")
        try {
          const res = await apiFetch('/api/create-portal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ customerId: subscription.customerId }),
          })
          const data = await res.json()
          if (data.url) setTimeout(() => window.open(data.url, '_blank'), 1500)
        } catch {
          setMessages(m => [...m, { role: 'assistant', content: 'Had trouble opening the portal. Please try again or email **hello@qivori.com**.' }])
        }
      } else {
        setMessages(m => [...m, { role: 'assistant', content: `You need an active subscription first. Say **"upgrade my plan"** to get started.` }])
      }
      setLoading(false)
      return
    }

    // ── SHOW MY INVOICES ──
    if (/\b(show|view|list|see|pull\s*up)\s*(my\s*)?(invoices?|bills?|receipts?|billing\s*history|payment\s*history)\b/i.test(lowerText)) {
      if (invoices && invoices.length > 0) {
        const recent = invoices.slice(0, 5)
        const lines = recent.map((inv, i) => {
          const date = inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '\u2014'
          const status = inv.status || 'draft'
          const statusIcon = status === 'paid' ? '[Paid]' : status === 'sent' ? '[Sent]' : '[Draft]'
          return `${i + 1}. **${inv.invoice_number || `INV-${i + 1}`}** \u2014 $${Number(inv.total || 0).toLocaleString()} \u00b7 ${date} ${statusIcon} ${status}`
        })
        setMessages(m => [...m, { role: 'assistant', content: `**Your Recent Invoices:**\n\n${lines.join('\n')}\n\n${invoices.length > 5 ? `Showing 5 of ${invoices.length}. ` : ''}Say **"update payment method"** to manage billing.` }])
        speak(`You have ${invoices.length} invoices. The most recent is for $${Number(recent[0]?.total || 0).toLocaleString()}.`)
      } else {
        setMessages(m => [...m, { role: 'assistant', content: `No invoices found yet. Invoices are generated when you complete loads and submit for billing.\n\nSay **"show my subscription"** to check your plan status.` }])
        speak("No invoices found yet.")
      }
      setLoading(false)
      return
    }

    // ── CONNECT LOAD BOARD ──
    if (/\b(connect|link|set\s*up|configure|add)\s*(my\s*)?(dat|load\s*board|123\s*load|truckstop|broker)\s*(account|credentials?|api|key)?\b/i.test(lowerText)) {
      setMessages(m => [...m, { role: 'assistant', content: `**Connect Your Load Board**\n\nTo connect your load board accounts (DAT, 123Loadboard, Truckstop), go to:\n\n**Settings \u2192 Load Board Connections**\n\nYou'll need your API credentials from each provider. Once connected, I can automatically search for loads and help you book them.\n\nSay **"activate load finding"** after connecting to enable the Proactive Load Agent.` }])
      speak("Go to Settings, then Load Board Connections to add your API credentials.")
      setLoading(false)
      return
    }

    // ── REPORT A PROBLEM / BUG ──
    if (/\b(report\s*(a\s*)?(problem|bug|issue|error)|something'?s?\s*(wrong|broken|not\s*work)|file\s*(a\s*)?(complaint|ticket)|i\s*have\s*(a\s*)?(problem|issue|bug))\b/i.test(lowerText)) {
      const problemDesc = userText.replace(/^(report\s*a?\s*(problem|bug|issue)|something'?s?\s*(wrong|broken))\s*/i, '').trim() || userText
      try {
        await apiFetch('/api/admin-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            severity: 'warning',
            title: 'Bug Report from Driver',
            message: `User: ${user?.email || 'unknown'}\nPlan: ${subscription?.plan || 'none'}\nDescription: ${problemDesc}\nTimestamp: ${new Date().toISOString()}`,
            source: 'chatbot-bug-report',
            userId: user?.id,
          }),
        })
        setMessages(m => [...m, { role: 'assistant', content: `**Problem reported.** Mohamed will review it shortly.\n\nHere's what I logged:\n- **User:** ${user?.email || 'your account'}\n- **Issue:** ${problemDesc}\n- **Time:** ${new Date().toLocaleString()}\n\nYou'll receive an update via email. Is there anything else I can help with in the meantime?` }])
        speak("Your problem has been reported. Mohamed will review it shortly.")
        showToast('success', 'Problem Reported', 'Admin notified')
      } catch {
        setMessages(m => [...m, { role: 'assistant', content: 'Had trouble submitting the report. Please email **hello@qivori.com** directly.' }])
      }
      setLoading(false)
      return
    }

    // ── ACCOUNT MANAGEMENT — show IFTA / reports ──
    if (/\b(show|view|open|pull\s*up)\s+(my\s*)?(ifta|csa|eld|compliance|dvir)\s*(report|score|data|status)?\b/i.test(lowerText)) {
      const reportMatch = lowerText.match(/\b(ifta|csa|eld|compliance|dvir)\b/i)
      const report = reportMatch ? reportMatch[1].toUpperCase() : ''
      const pageMap = { IFTA: 'carrier-ifta', CSA: 'carrier-csa', ELD: 'carrier-eld', COMPLIANCE: 'carrier-dvir', DVIR: 'carrier-dvir' }
      const page = pageMap[report] || 'carrier-dashboard'
      setMessages(m => [...m, { role: 'assistant', content: `Opening your **${report} report**... Go to your carrier dashboard and navigate to the ${report} section to see the full details.\n\nIs there anything specific about your ${report} you'd like me to help with?` }])
      speak(`Here's your ${report} report.`)
      setLoading(false)
      return
    }

    // Rate check
    if (/\b(is\s*this\s*rate\s*good|check\s*rate|rate\s*check|is\s*this\s*(a\s*)?(good|fair|bad)\s*(rate|deal)|analyze\s*(this\s*)?rate|rate\s*analysis|is\s*\$?\d+.*good|should\s*i\s*take\s*this\s*(rate|load|deal))\b/i.test(lowerText)) {
      const rateMatch = lowerText.match(/\$\s*([\d,]+)/); const milesMatch = lowerText.match(/(\d+)\s*mi/)
      const cityPattern = /(?:from|)\s*([a-z\s]+?)(?:\s*to\s*)([a-z\s]+?)(?:\s*\d|\s*$|\s*for)/i; const cityMatch = userText.match(cityPattern)
      const parsedRate = rateMatch ? Number(rateMatch[1].replace(/,/g, '')) : null
      const parsedMiles = milesMatch ? Number(milesMatch[1]) : null
      const parsedOrigin = cityMatch ? cityMatch[1].trim() : null; const parsedDest = cityMatch ? cityMatch[2].trim() : null
      await executeAction({
        type: 'rate_analysis',
        rate: parsedRate || activeLoads[0]?.gross || activeLoads[0]?.gross_pay || 0,
        miles: parsedMiles || activeLoads[0]?.miles || 0,
        origin: parsedOrigin || activeLoads[0]?.origin || '',
        destination: parsedDest || activeLoads[0]?.dest || activeLoads[0]?.destination || '',
        equipment: activeLoads[0]?.equipment || 'Dry Van',
      })
      setLoading(false)
      return
    }

    // Sleep/tired/rest
    if (/\b(sleep|tired|exhausted|rest\s*area|nap|drowsy|fatigue|pull\s*over|need\s*rest|need\s*sleep)\b/.test(lowerText)) {
      await executeAction({ type: 'search_nearby', query: 'rest area OR truck stop parking' })
      setLoading(false)
      return
    }

    // Find loads — search load board, NOT maps
    if (/\b(find|show|get|search|look\s*for|any)\s*(me\s*)?(a\s*)?(good\s*|best\s*|cheap\s*|available\s*|paying\s*|high\s*|nearby\s*|local\s*|new\s*|open\s*|hot\s*)*(load|freight|shipment|haul)s?\b/i.test(lowerText) || /\bload\s*board\b/i.test(lowerText)) {
      try {
        const loc = await getGPSCoords()
        const params = new URLSearchParams({ limit: '10' })
        if (loc) { params.set('lat', loc.lat); params.set('lng', loc.lng) }
        // Use delivery city of active load as origin if available
        const inTransit = activeLoads.find(l => ['In Transit', 'Loaded', 'At Delivery'].includes(l.status))
        if (inTransit) {
          const dest = inTransit.destination || inTransit.dest || ''
          if (dest) params.set('origin', dest)
        }
        const res = await apiFetch(`/api/load-board?${params}`)
        const data = await res.json()
        const foundLoads = data.loads || BOARD_LOADS || []
        if (foundLoads.length > 0) {
          const top5 = foundLoads.slice(0, 5)
          const lines = top5.map((l, i) => {
            const orig = l.origin_city || l.origin || '?'
            const dest = l.destination_city || l.dest || l.destination || '?'
            const rpm = l.miles ? `$${(l.rate / l.miles).toFixed(2)}/mi` : ''
            return `**${i + 1}. ${orig} \u2192 ${dest}**\n$${Number(l.rate || 0).toLocaleString()} \u00b7 ${rpm} \u00b7 ${l.miles || '?'} mi \u00b7 ${l.broker_name || l.broker || '?'}`
          })
          proactiveLoadsRef.current = top5
          setMessages(m => [...m, { role: 'assistant', content: `Here's what I found:\n\n${lines.join('\n\n')}\n\nSay **"book 1"**, **"book 2"**, etc. to grab one. Or **"show me more"** for more options.` }])
          speak(`Found ${top5.length} loads. Say book 1, book 2, or show me more.`)
        } else {
          setMessages(m => [...m, { role: 'assistant', content: "Nothing available right now. I'll keep checking. Connect your load board in **Settings** to get more results from DAT and 123Loadboard." }])
          speak("Nothing available right now. I'll keep checking.")
        }
      } catch {
        setMessages(m => [...m, { role: 'assistant', content: "Couldn't search loads right now. Try again in a sec." }])
      }
      setLoading(false)
      return
    }

    // Nearest truck stop
    if (/\b(nearest|closest|find\s*(me\s*)?(a\s*)?)(truck\s*stop|fuel|gas\s*station|loves|love'?s|pilot|petro|ta\b|flying\s*j)\b/.test(lowerText) || /\bnear(by|est)?\s*truck\s*stop\b/.test(lowerText)) {
      await executeAction({ type: 'search_nearby', query: 'truck stop' })
      setLoading(false)
      return
    }

    // Next stop
    if (/\b(next\s*stop|where.*(go|head|deliver|pick\s*up)|my\s*next|next\s*(pickup|delivery))\b/.test(lowerText)) {
      await executeAction({ type: 'next_stop' })
      setLoading(false)
      return
    }

    // HOS
    if (/\b(hos\b|hours?\s*(of\s*service|left|remaining|do\s*i\s*have)|driving\s*clock|how\s*(long|many\s*hours)|11.hour|fourteen.hour|break\s*time)\b/.test(lowerText)) {
      await executeAction({ type: 'hos_check' })
      setLoading(false)
      return
    }

    // Weather
    if (/\b(weather|forecast|rain|snow|storm|ice|fog|road\s*condition|temperature|wind\s*chill)\b/.test(lowerText)) {
      await executeAction({ type: 'weather_check' })
      setLoading(false)
      return
    }

    // ── VOICE MODE — start Retell call ──
    if (/\b(turn\s*on|enable|start|activate)\s*(voice\s*mode|hands[\s-]*free|voice|call)\b/i.test(lowerText) || /\bgo\s*hands[\s-]*free\b/i.test(lowerText) || /\bcall\s*q\b/i.test(lowerText) || /\btalk\s*to\s*q\b/i.test(lowerText)) {
      setMessages(m => [...m, { role: 'assistant', content: 'Connecting you to Q...' }])
      startVoiceCall()
      setLoading(false)
      return
    }

    // Start/reset HOS
    if (/\b(start|begin)\s*(my\s*)?(hos|clock|driving)\b/.test(lowerText)) {
      await executeAction({ type: 'start_hos' })
      setLoading(false)
      return
    }
    if (/\b(reset|clear|restart)\s*(my\s*)?(hos|clock|driving)\b/.test(lowerText)) {
      await executeAction({ type: 'reset_hos' })
      setLoading(false)
      return
    }

    try {
      const memoryContext = contextMemoryRef.current.length > 0
        ? [{ role: 'user', content: '[Previous conversation context for follow-ups]\n' + contextMemoryRef.current.map(m => `${m.role}: ${m.content}`).join('\n') },
           { role: 'assistant', content: 'Got it, I have context from our previous conversation. How can I help?' }]
        : []
      const fullMessages = [...memoryContext, ...newMessages].slice(-20)

      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: fullMessages,
          context: buildContext(),
          loadBoard: buildLoadBoard(),
          language: currentLang,
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`)
      }
      const data = await res.json()
      const rawReply = data.reply || data.error || 'Something went wrong.'

      const { actions, displayText } = parseActions(rawReply)

      for (const action of actions) {
        const q = (action.query || '').toLowerCase()
        if ((action.type === 'search_nearby' || action.type === 'open_maps') && q.match(/weigh|scale|coop/)) {
          await executeAction({ type: 'check_weigh_station', state: action.state, highway: action.highway, radius: action.radius })
        } else {
          await executeAction(action)
        }
      }

      const replyText = displayText || rawReply
      escalateAttemptRef.current = 0
      // Show text immediately — voice plays in background (no blocking)
      setMessages(m => [...m, {
        role: 'assistant',
        content: replyText,
        actions,
      }])
      // Fire TTS in background — when hands-free, auto-listen after Q finishes speaking
      const wasVoice = lastInputWasVoiceRef.current
      speak(replyText, () => {
        if (handsFree && wasVoice) {
          // Small pause so it doesn't feel robotic, then auto-listen
          setTimeout(() => {
            if (handsFree) startListeningRef.current?.()
          }, 600)
        }
      }).catch(() => {})
    } catch (err) {
      escalateAttemptRef.current += 1
      if (escalateAttemptRef.current >= 2) {
        escalateAttemptRef.current = 0
        const recentChat = newMessages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n')
        apiFetch('/api/admin-alert', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            severity: 'warning',
            title: 'Auto-Escalation: AI Failed 2x',
            message: `User: ${user?.email || 'unknown'}\nPlan: ${subscription?.plan || 'none'}\nError: ${err.message}\n\nConversation:\n${recentChat}`,
            source: 'chatbot-auto-escalation',
            userId: user?.id,
          }),
        }).catch(() => {})
        setMessages(m => [...m, { role: 'assistant', content: `I'm having trouble answering that. I've **automatically escalated** this to Mohamed \u2014 he'll review the conversation and get back to you via email at **${user?.email || 'your registered email'}**.\n\nYou can also email **hello@qivori.com** directly.` }])
        speak("I've escalated this to the admin team. They'll follow up with you.")
      } else {
        setMessages(m => [...m, { role: 'assistant', content: 'Connection error: ' + (err.message || 'check your internet.') + '\n\nTry again \u2014 if it fails once more, I\'ll escalate to the admin team.' }])
      }
    } finally {
      if (loadingSafetyRef.current) clearTimeout(loadingSafetyRef.current)
      setLoading(false)
    }
  }

  // Keep ref in sync so voice callbacks always call the latest sendMessage
  sendMessageRef.current = sendMessage

  // Seed Q's greeting from home screen so conversation continues naturally
  const greetingSeededRef = useRef(null)
  useEffect(() => {
    if (greetingContext && greetingContext !== greetingSeededRef.current && messages.length === 0) {
      greetingSeededRef.current = greetingContext
      setMessages([{ role: 'assistant', content: greetingContext }])
    }
  }, [greetingContext])

  // Auto-send initialMessage when opened from FAB or home screen
  const initialMessageSentRef = useRef(null)
  useEffect(() => {
    if (initialMessage && initialMessage !== initialMessageSentRef.current && !loading) {
      initialMessageSentRef.current = initialMessage
      setTimeout(() => sendMessageRef.current?.(initialMessage), 150)
    }
  }, [initialMessage, loading])

  // Auto-start Retell call when opened as overlay (AI-first experience)
  const autoCallTriggeredRef = useRef(false)
  useEffect(() => {
    if (autoCall && isOverlay && !autoCallTriggeredRef.current && !inCall && !callConnecting) {
      autoCallTriggeredRef.current = true
      // Small delay for overlay animation to finish
      setTimeout(() => startVoiceCall(), 400)
    }
  }, [autoCall, isOverlay, inCall, callConnecting, startVoiceCall])

  // Quick action chips
  const quickActions = [
    { icon: ScanLine, label: 'Snap Rate Con', msg: '__snap_ratecon__' },
    { icon: Truck, label: 'Find Loads', msg: 'Find me the best available loads right now' },
    { icon: Navigation, label: 'Check In', msg: 'Submit a check call with my GPS location' },
    { icon: MapPin, label: 'At Pickup', msg: "I'm at the pickup location" },
    { icon: CheckCircle, label: 'Delivered', msg: 'I just delivered the load' },
    { icon: Camera, label: 'Upload BOL', msg: 'I need to upload a BOL' },
    { icon: Receipt, label: 'Add Expense', msg: 'I need to add an expense' },
    { icon: Package, label: 'My Loads', msg: 'Show me my active loads' },
    { icon: DollarSign, label: 'Revenue', msg: "What's my revenue and profit this month?" },
    { icon: DollarSign, label: 'Rate Check', msg: 'Is this rate good for my current load?' },
    { icon: MapPin, label: 'My Location', msg: 'Where am I right now? Share my current GPS location.' },
    { icon: Navigation, label: 'Next Stop', msg: "What's my next stop or delivery?" },
    { icon: Clock, label: 'Weather', msg: "What's the weather on my route?" },
    { icon: Clock, label: 'HOS Status', msg: 'How many driving hours do I have left today?' },
  ]

  const suggestions = [
    { icon: Truck, text: 'Find me the best loads from Dallas' },
    { icon: DollarSign, text: 'Log $85 fuel at Loves, 52 gallons, Texas' },
    { icon: CheckCircle, text: 'I just delivered the load' },
    { icon: DollarSign, text: "What's my profit this month?" },
    { icon: FileText, text: 'Send invoice to the broker' },
    { icon: MapPin, text: 'Find me the nearest truck stop' },
  ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── OFFLINE INDICATOR ────────────────────────── */}
      {isOffline && (
        <div style={{ flexShrink: 0, background: '#ef4444', color: '#fff', textAlign: 'center', padding: '8px', fontSize: '13px', fontWeight: 600 }}>
          You're offline — messages will sync when reconnected
        </div>
      )}

      {/* ── CHAT HEADER BAR (hidden in overlay — shell provides its own) ── */}
      {!isOverlay && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px 4px', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', letterSpacing: 0.5 }}>Q</div>
            {messages.length > 0 && (
              <button onClick={() => { setMessages([]); setShowQuickActions(true); try { localStorage.removeItem('qivori_chat_history') } catch {} }}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: 'none', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontSize: 11, fontWeight: 600, color: 'var(--muted)', transition: 'all 0.2s' }}>
                <Ic icon={Plus} size={11} color="var(--muted)" /> New
              </button>
            )}
          </div>
          <div ref={langPickerRef} style={{ position: 'relative' }}>
            <button
              onClick={() => { haptic?.('light'); setShowLangPicker(v => !v) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px', background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
              }}
            >
              <Globe size={14} color="var(--accent)" />
              <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {currentLang || 'en'}
              </span>
            </button>
            {showLangPicker && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: 4,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 10, padding: '6px 0', zIndex: 9999,
                boxShadow: '0 8px 24px rgba(0,0,0,0.4)', minWidth: 160,
                maxHeight: 320, overflowY: 'auto',
              }}>
                {[
                  { code: 'en', label: 'English' },
                  { code: 'es', label: 'Español' },
                  { code: 'fr', label: 'Français' },
                  { code: 'pt', label: 'Português' },
                  { code: 'so', label: 'Soomaali' },
                  { code: 'am', label: 'አማርኛ' },
                  { code: 'ar', label: 'العربية' },
                  { code: 'hi', label: 'हिन्दी' },
                  { code: 'zh', label: '中文' },
                  { code: 'ru', label: 'Русский' },
                  { code: 'ko', label: '한국어' },
                  { code: 'vi', label: 'Tiếng Việt' },
                ].map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => { setLanguage(lang.code); setShowLangPicker(false); haptic?.('light') }}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      width: '100%', padding: '9px 14px', background: 'none', border: 'none',
                      cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", textAlign: 'left',
                      color: currentLang === lang.code ? 'var(--accent)' : 'var(--text)',
                      fontWeight: currentLang === lang.code ? 700 : 400,
                      fontSize: 13,
                    }}
                  >
                    <span>{lang.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>{lang.code}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── PWA INSTALL BANNER ──────────────────────── */}
      {showInstallBanner && (
        <div style={{ flexShrink: 0, margin: '8px 16px 0', padding: '8px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Ic icon={Download} size={15} color="var(--accent)" />
          <div style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>
            {isIOS && !deferredPrompt
              ? <>Tap <span style={{ fontWeight: 800 }}>Share</span> <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: 'middle', margin: '0 2px' }}><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg> <span style={{ fontWeight: 800 }}>Add to Home Screen</span></>
              : 'Add Q to Home Screen'}
          </div>
          {!isIOS || deferredPrompt ? (
            <button onClick={handleInstallClick} style={{ padding: '5px 12px', background: 'var(--accent)', border: 'none', borderRadius: 7, fontSize: 11, fontWeight: 700, color: '#000', cursor: 'pointer', flexShrink: 0, fontFamily: "'DM Sans',sans-serif" }}>Install</button>
          ) : null}
          <button onClick={handleDismissInstall} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 2, flexShrink: 0, lineHeight: 0 }}>
            <Ic icon={X} size={14} />
          </button>
        </div>
      )}

      {/* ── NOTIFICATION PERMISSION BANNER ──────────── */}
      {showNotifBanner && !showInstallBanner && (
        <div style={{ flexShrink: 0, margin: '8px 16px 0', padding: '10px 14px', background: 'linear-gradient(135deg, rgba(0,212,170,0.08), rgba(240,165,0,0.06))', border: '1px solid rgba(0,212,170,0.25)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,212,170,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ic icon={Bell} size={16} color="var(--success)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Enable Notifications</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Get alerts for loads, payments & updates</div>
          </div>
          <button onClick={handleEnableNotifications} style={{ padding: '6px 14px', background: 'var(--success)', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#000', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>Enable</button>
          <button onClick={() => setShowNotifBanner(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
            <Ic icon={X} size={14} />
          </button>
        </div>
      )}

      {/* ── LIVE CALL BANNER ──────────────────── */}
      {(inCall || callConnecting) && (
        <div style={{ flexShrink: 0, margin: '8px 16px 0', padding: '10px 14px', background: 'linear-gradient(135deg, rgba(0,212,170,0.1), rgba(0,212,170,0.04))', border: '1px solid rgba(0,212,170,0.3)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, animation: 'fadeInUp 0.2s ease' }}>
          <div style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, animation: 'pulseGlow 2s ease-in-out infinite' }}>
            <Ic icon={Phone} size={14} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>{callConnecting ? 'Connecting to Q...' : 'Live Call with Q'}</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Talk naturally — Q hears everything</div>
          </div>
          <button onClick={endVoiceCall} style={{ padding: '5px 12px', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 7, fontSize: 10, fontWeight: 700, color: 'var(--danger)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>End Call</button>
        </div>
      )}

      {/* ── ACTIVE LOAD STATUS BAR ────────────────────── */}
      {activeLoads.length > 0 && (
        <div style={{ flexShrink: 0, maxHeight: showLoadDetail ? 220 : 60, overflowY: 'auto', transition: 'max-height 0.2s ease' }}>
          <div style={{ margin: '8px 16px 0', padding: '10px 14px', background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)', borderRadius: showLoadDetail ? '10px 10px 0 0' : 10, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            onClick={() => setShowLoadDetail(d => !d)}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic icon={Truck} size={16} color="var(--accent)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeLoads[0].origin} \u2192 {activeLoads[0].destination}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>{activeLoads[0].load_id}</span>
                <span>\u00b7</span>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{activeLoads[0].status}</span>
                {activeLoads[0].delivery_date && <>
                  <span>\u00b7</span>
                  <span>Due {activeLoads[0].delivery_date}</span>
                </>}
                {activeLoads[0].miles && <>
                  <span>\u00b7</span>
                  <span>{activeLoads[0].miles} mi</span>
                </>}
              </div>
            </div>
            <ChevronRight size={14} color="var(--muted)" style={{ transform: showLoadDetail ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }} />
          </div>
          {showLoadDetail && (
            <div style={{ margin: '0 16px', padding: '10px 14px', background: 'var(--surface)', border: '1px solid rgba(240,165,0,0.15)', borderTop: 'none', borderRadius: '0 0 10px 10px' }}>
              {[
                ['Rate', `$${Number(activeLoads[0].rate || 0).toLocaleString()}`],
                ['RPM', activeLoads[0].miles ? `$${(Number(activeLoads[0].rate || 0) / Number(activeLoads[0].miles)).toFixed(2)}/mi` : '\u2014'],
                ['Equipment', activeLoads[0].equipment || activeLoads[0].equipment_type || '\u2014'],
                ['Broker', activeLoads[0].broker_name || '\u2014'],
                ['Pickup', activeLoads[0].pickup_date || '\u2014'],
                ['Delivery', activeLoads[0].delivery_date || '\u2014'],
                ['Weight', activeLoads[0].weight ? `${activeLoads[0].weight} lbs` : '\u2014'],
                ['Ref #', activeLoads[0].reference_number || '\u2014'],
              ].map(([label, value]) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11 }}>
                  <span style={{ color: 'var(--muted)' }}>{label}</span>
                  <span style={{ fontWeight: 600 }}>{value}</span>
                </div>
              ))}
              {(() => {
                const hos = getHosRemaining()
                if (!hos) return null
                const urgency = hos.remaining <= 2 ? 'var(--danger)' : hos.remaining <= 4 ? 'var(--accent)' : 'var(--success)'
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 11, borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 8 }}>
                    <span style={{ color: 'var(--muted)' }}>HOS Remaining</span>
                    <span style={{ fontWeight: 700, color: urgency }}>{hos.remaining < 1 ? `${Math.round(hos.remaining * 60)} min` : `${hos.remaining} hrs`}</span>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* ── CHAT MESSAGES ───────────────────────────── */}
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10, WebkitOverflowScrolling: 'touch', scrollBehavior: 'smooth' }}>

        {/* Empty state — Q welcome (skip if initialMessage is about to fire) */}
        {messages.length === 0 && !initialMessage && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, padding: '0 20px', animation: 'fadeInUp 0.3s ease' }}>
            {/* Q mark — smaller in overlay since header already shows Q */}
            <div style={{ width: isOverlay ? 48 : 64, height: isOverlay ? 48 : 64, borderRadius: '50%', background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14, boxShadow: '0 0 30px rgba(240,165,0,0.15)', animation: 'pulseGlowAmber 3s ease-in-out infinite' }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: isOverlay ? 24 : 32, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 4, fontFamily: "'DM Sans',sans-serif" }}>
              What can I do?
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20, textAlign: 'center', lineHeight: 1.5 }}>
              {activeLoads.length > 0
                ? `${activeLoads[0].origin} \u2192 ${activeLoads[0].destination || activeLoads[0].dest} \u00b7 ${activeLoads[0].status}`
                : 'Ask me anything or try one of these'}
            </div>

            {/* Suggestion grid — 2 columns */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', maxWidth: 360 }}>
              {suggestions.slice(0, 4).map((s, idx) => (
                <button key={s.text} onClick={() => sendMessage(s.text)}
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 12px', fontSize: 12, color: 'var(--text)', cursor: 'pointer', textAlign: 'center', fontFamily: "'DM Sans',sans-serif", display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, transition: 'all 0.15s ease', animation: `fadeInUp 0.25s ease ${idx * 0.05}s both` }}>
                  <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(240,165,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Ic icon={s.icon} size={16} color="var(--accent)" />
                  </div>
                  <span style={{ lineHeight: 1.3, fontWeight: 600 }}>{s.text}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Messages */}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', animation: i >= messages.length - 2 ? 'msgSlideIn 0.25s ease' : 'none' }}>
            {m.role === 'assistant' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ic icon={Zap} size={10} color="var(--accent)" />
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>Q</span>
                <button onClick={(e) => { e.stopPropagation(); speak(m.content) }}
                  style={{ width: 20, height: 20, borderRadius: '50%', background: speaking ? 'rgba(0,212,170,0.2)' : 'transparent', border: '1px solid rgba(0,212,170,0.2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0, marginLeft: 2 }}
                  title="Replay">
                  <Ic icon={Volume2} size={9} color="var(--success)" />
                </button>
              </div>
            )}
            <div style={{
              maxWidth: '88%',
              padding: '11px 14px',
              borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
              background: m.role === 'user' ? 'var(--accent)' : 'var(--surface)',
              color: m.role === 'user' ? '#000' : 'var(--text)',
              border: m.role === 'assistant' ? '1px solid var(--border)' : 'none',
              fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap',
              wordBreak: 'break-word', overflow: 'hidden',
            }}>
              {m.wsSummary ? (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Ic icon={MapPin} size={13} color="var(--accent)" /> Weigh Stations Nearby
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,212,170,0.1)', borderRadius: 8, padding: '5px 10px' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--success)' }} />
                      <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--success)', fontFamily: "'Bebas Neue',sans-serif" }}>{m.wsSummary.open}</span>
                      <span style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>Open</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(239,68,68,0.1)', borderRadius: 8, padding: '5px 10px' }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--danger)' }} />
                      <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--danger)', fontFamily: "'Bebas Neue',sans-serif" }}>{m.wsSummary.closed}</span>
                      <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>Closed</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Tap a station for directions {'\u00b7'} Report status to help other drivers</div>
                </div>
              ) : renderMarkdown(m.content)}
            </div>

            {/* Action confirmation badges */}
            {m.actions && m.actions.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {m.actions.map((a, j) => (
                  <ActionBadge key={j} action={a} />
                ))}
              </div>
            )}

            {/* Place results */}
            {m.places && m.places.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, maxWidth: '88%' }}>
                {m.places.map((p, j) => {
                  const placeIsIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
                  const dirUrl = placeIsIOS
                    ? `maps://maps.apple.com/?daddr=${p.lat},${p.lng}`
                    : `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`
                  return (
                    <a key={j} href={dirUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(0,212,170,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Ic icon={Navigation} size={14} color="var(--success)" />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.brand || p.name}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.dist} mi away</div>
                        </div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)', whiteSpace: 'nowrap' }}>Directions</div>
                        <ChevronRight size={14} color="var(--success)" />
                      </div>
                    </a>
                  )
                })}
              </div>
            )}

            {/* Weigh station results */}
            {m.weighStations && m.weighStations.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, maxWidth: '92%' }}>
                {m.weighStations.map((ws, j) => {
                  const wsIsIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
                  const wsDirUrl = wsIsIOS
                    ? `maps://maps.apple.com/?daddr=${ws.lat},${ws.lng}`
                    : `https://www.google.com/maps/dir/?api=1&destination=${ws.lat},${ws.lng}`
                  const wsStatusColor = ws.open === true ? 'var(--success)' : ws.open === false ? 'var(--danger)' : 'var(--muted)'
                  return (
                    <div key={j} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                      <a href={wsDirUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: ws.open ? 'rgba(0,212,170,0.1)' : 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <div style={{ width: 12, height: 12, borderRadius: '50%', background: wsStatusColor }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.name}</div>
                          <div style={{ fontSize: 11, color: wsStatusColor, fontWeight: 600 }}>{ws.status}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                            {ws.highway} {ws.direction} {'\u00b7'} {ws.bypass}{ws.distance ? ` \u00b7 ${ws.distance} mi` : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <Ic icon={Navigation} size={14} color="var(--success)" />
                          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--success)' }}>GO</span>
                        </div>
                      </a>
                      <div style={{ display: 'flex', borderTop: '1px solid var(--border)', background: 'var(--bg)' }}>
                        <button onClick={() => reportWeighStation(ws, 'open')}
                          style={{ flex: 1, padding: '8px 0', background: 'none', border: 'none', borderRight: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontFamily: "'DM Sans',sans-serif" }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--success)' }}>Open</span>
                        </button>
                        <button onClick={() => reportWeighStation(ws, 'closed')}
                          style={{ flex: 1, padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, fontFamily: "'DM Sans',sans-serif" }}>
                          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)' }} />
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>Closed</span>
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))}

        {/* Loading indicator */}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Ic icon={Zap} size={10} color="var(--accent)" />
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px 14px 14px 4px', padding: '10px 16px' }}>
              <div style={{ display: 'flex', gap: 4 }}>
                <span className="ai-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'aipulse 1.2s ease-in-out infinite' }} />
                <span className="ai-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'aipulse 1.2s ease-in-out 0.2s infinite' }} />
                <span className="ai-dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'aipulse 1.2s ease-in-out 0.4s infinite' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── DOCUMENT UPLOAD PROMPT ─────────────────── */}
      {pendingUpload && (
        <div style={{ flexShrink: 0, margin: '0 12px', padding: '12px 16px', background: 'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(0,212,170,0.05))', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ic icon={Camera} size={20} color="var(--accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{pendingUpload.prompt || 'Take a photo'}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Tap the camera button or choose a file</div>
          </div>
          <button onClick={() => setPendingUpload(null)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
            <Ic icon={X} size={16} />
          </button>
        </div>
      )}

      {/* ── QUICK ACTION CHIPS ──────────────────────── */}
      <div className="hide-scrollbar" style={{ flexShrink: 0, padding: '6px 16px', display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {quickActions.map(a => (
          <button key={a.label} onClick={() => { haptic('light'); if (a.msg === '__snap_ratecon__') { if (rateConInputRef.current) rateConInputRef.current.click() } else { sendMessage(a.msg) } }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 12, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'DM Sans',sans-serif", flexShrink: 0 }}>
            <Ic icon={a.icon} size={13} color={a.label === 'Check In' ? 'var(--success)' : 'var(--accent)'} />
            {a.label}
          </button>
        ))}
      </div>

      {/* ── INPUT BAR ───────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: '8px 16px calc(12px + env(safe-area-inset-bottom, 0px))', borderTop: '1px solid var(--border)', background: 'var(--surface)', marginBottom: 'var(--kb-offset, 0px)', transition: 'margin-bottom 0.2s ease' }}>

        {/* In-call state — Retell real-time voice */}
        {(inCall || callConnecting) ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, animation: 'fadeInUp 0.15s ease' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: callConnecting ? 'var(--accent)' : 'var(--success)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, animation: callConnecting ? 'micPulse 1s ease-in-out infinite' : (speaking ? 'micPulse 1.5s ease-in-out infinite' : 'none') }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: callConnecting ? '#000' : '#fff', fontWeight: 800, lineHeight: 1 }}>Q</span>
            </div>
            <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 24, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              {callConnecting ? (
                <span style={{ fontSize: 14, color: 'var(--accent)', fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>Connecting...</span>
              ) : speaking ? (
                <>
                  <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                    {[0, 1, 2, 3, 4].map(i => (
                      <div key={i} style={{ width: 3, borderRadius: 2, background: 'var(--success)', animation: `voiceWave 0.5s ease-in-out ${i * 0.1}s infinite alternate` }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 14, color: 'var(--success)', fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>Q is speaking...</span>
                </>
              ) : (
                <span style={{ fontSize: 14, color: 'var(--success)', fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>Listening... talk naturally</span>
              )}
            </div>
            <button onClick={endVoiceCall}
              style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--danger)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s ease' }}>
              <Ic icon={Phone} size={18} color="#fff" />
            </button>
          </div>
        ) : listening ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, animation: 'fadeInUp 0.15s ease' }}>
            {/* Red pulse dot */}
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444', flexShrink: 0, animation: 'micPulse 1.2s ease-in-out infinite' }} />
            <div style={{ flex: 1, background: 'var(--surface2)', borderRadius: 24, padding: '12px 16px', fontSize: 15, color: handsFree ? 'var(--success)' : 'var(--muted)', fontFamily: "'DM Sans',sans-serif" }}>
              {handsFree ? 'Your turn — speak...' : 'Listening...'}
            </div>
            {/* Stop & send */}
            <button onClick={() => { haptic('medium'); if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop() }}
              style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s ease' }}>
              <Ic icon={Send} size={18} color="#000" />
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {/* + button */}
            <button onClick={() => { haptic('light'); if (fileInputRef.current) fileInputRef.current.click() }}
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'none', border: '1.5px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s ease' }}>
              <Ic icon={Plus} size={16} color="var(--muted)" />
            </button>
            <input ref={fileInputRef} type="file" accept="image/*,.pdf" capture="environment" style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                if (pendingUpload) {
                  handleDocUpload(file)
                } else {
                  setPendingUpload({ doc_type: 'other', load_id: activeLoads[0]?.id, prompt: 'Uploading document...' })
                  handleDocUpload(file)
                }
                e.target.value = ''
              }} />

            {/* Input */}
            <input
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); lastInputWasVoiceRef.current = false; sendMessage() } }}
              placeholder="Ask Q anything..."
              style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 24, padding: '12px 16px', color: 'var(--text)', fontSize: 15, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }}
            />

            {/* Call Q — start Retell real-time voice */}
            <button onClick={() => { haptic('light'); startVoiceCall() }}
              style={{ width: 36, height: 36, borderRadius: '50%', background: 'none', border: '1.5px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s ease' }}
              title="Call Q — real-time voice conversation">
              <Ic icon={Phone} size={14} color="var(--success)" />
            </button>

            {/* Send or Mic */}
            {input.trim() ? (
              <button onClick={() => { haptic('light'); lastInputWasVoiceRef.current = false; sendMessage() }} disabled={loading}
                style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s ease' }}>
                <Ic icon={Send} size={18} color="#000" />
              </button>
            ) : (
              <button onClick={() => startListening()}
                style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s ease' }}>
                <Ic icon={Mic} size={18} color="#000" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Hidden rate con file input */}
      <input ref={rateConInputRef} type="file" accept="image/*,.pdf" capture="environment" style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleRateConPhoto(file)
          e.target.value = ''
        }} />

    </div>
  )
}