import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { CarrierProvider, useCarrier } from '../context/CarrierContext'
import {
  Zap, Send, MapPin, Camera, DollarSign, Package, Truck, Phone,
  Navigation, Receipt, Plus, ChevronRight, ArrowLeft, Home, X,
  CheckCircle, Mic, FileText, Clock, Volume2, VolumeX, ScanLine, Download, Mail, Bell
} from 'lucide-react'
import { apiFetch } from '../lib/api'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

// Haversine distance in miles
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959 // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Load board data — populated from API, falls back to empty ───────────
let BOARD_LOADS = []

export default function MobileLayout() {
  return (
    <CarrierProvider>
      <MobileAI />
    </CarrierProvider>
  )
}

// ── MAIN AI-DRIVEN MOBILE APP ─────────────────────────────
function MobileAI() {
  const { logout, showToast, subscription, user } = useApp()
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
  const addLoad = ctx.addLoad || (() => {})

  const dataReady = ctx.dataReady !== false // default true if not set

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [showQuickActions, setShowQuickActions] = useState(true)
  const [pendingUpload, setPendingUpload] = useState(null) // { doc_type, load_id, prompt }
  const [gpsLocation, setGpsLocation] = useState(null)
  const [listening, setListening] = useState(false)
  const [voiceText, setVoiceText] = useState('')
  const [speakerOn, setSpeakerOn] = useState(true)
  const [speaking, setSpeaking] = useState(false)
  const [handsFree, setHandsFree] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const rateConInputRef = useRef(null)
  const recognitionRef = useRef(null)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [showNotifBanner, setShowNotifBanner] = useState(false)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)
  const contextMemoryRef = useRef([]) // stores last 5 messages from previous conversations
  const [hosStartTime, setHosStartTime] = useState(() => {
    const saved = localStorage.getItem('qivori_hos_start')
    return saved ? parseInt(saved) : null
  })
  const [showLoadDetail, setShowLoadDetail] = useState(false)
  const hosWarningShownRef = useRef(false)
  const escalateAttemptRef = useRef(0) // track failed AI attempts for auto-escalation

  // ── PROACTIVE LOAD FINDING AGENT state ──────────────────
  const proactiveTriggeredRef = useRef(false) // prevent re-triggering within same delivery
  const proactiveDismissedRef = useRef(null) // timestamp of last "no" response
  const proactiveLoadsRef = useRef([]) // cached scored loads from last search
  const [proactiveLoadId, setProactiveLoadId] = useState(null) // track which load triggered it

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

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

  // PWA install prompt
  useEffect(() => {
    const handler = (e) => {
      e.preventDefault()
      setDeferredPrompt(e)
      setShowInstallBanner(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  // Online/offline detection + sync
  useEffect(() => {
    const goOffline = () => setIsOffline(true)
    const goOnline = () => {
      setIsOffline(false)
      showToast('success', 'Back Online', 'Syncing queued actions...')
      // Tell service worker to replay queued requests
      navigator.serviceWorker?.ready?.then(reg => {
        reg.active?.postMessage('replay-queue')
        // Also try Background Sync API
        reg.sync?.register('qivori-sync').catch(() => {})
      })
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => { window.removeEventListener('offline', goOffline); window.removeEventListener('online', goOnline) }
  }, [showToast])

  // Check notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      // Show banner after 3 seconds so it doesn't overwhelm on first load
      const timer = setTimeout(() => setShowNotifBanner(true), 3000)
      return () => clearTimeout(timer)
    }
  }, [])

  const handleEnableNotifications = async () => {
    try {
      const permission = await Notification.requestPermission()
      if (permission === 'granted') {
        showToast('success', 'Notifications Enabled', 'You\'ll get load alerts and updates')
        // Register push subscription
        const reg = await navigator.serviceWorker?.ready
        if (reg) {
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY || undefined,
          }).catch(() => null)

          if (sub) {
            const { user } = await import('../lib/supabase').then(m => ({ user: null })).catch(() => ({ user: null }))
            // Save subscription — will work once VAPID keys are configured
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
      showToast('success', 'Installed!', 'Qivori AI added to your home screen')
    }
    setDeferredPrompt(null)
    setShowInstallBanner(false)
  }

  // Build context for AI
  const buildContext = useCallback(() => {
    const active = loads.filter(l => !['Delivered', 'Invoiced'].includes(l.status))
    const unpaid = invoices.filter(i => i.status !== 'Paid')
    const netProfit = totalRevenue - totalExpenses
    return [
      `CARRIER: ${company?.name || 'Unknown'}`,
      `Revenue MTD: $${totalRevenue.toLocaleString()} | Expenses: $${totalExpenses.toLocaleString()} | Net: $${netProfit.toLocaleString()}`,
      `Active loads (${active.length}): ${active.map(l => `${l.load_id || l.id} ${l.origin}→${l.destination} $${Number(l.rate || 0).toLocaleString()} [${l.status}]`).join(' | ') || 'none'}`,
      `Total loads: ${loads.length}`,
      `Unpaid invoices: ${unpaid.length} totaling $${unpaid.reduce((s, i) => s + Number(i.amount || 0), 0).toLocaleString()}`,
      `Recent expenses: ${expenses.slice(0, 5).map(e => `${e.category} $${e.amount} ${e.merchant || ''}`).join(', ') || 'none'}`,
      gpsLocation ? `Driver current location: ${gpsLocation}` : '',
    ].filter(Boolean).join('\n')
  }, [loads, invoices, expenses, totalRevenue, totalExpenses, company, gpsLocation])

  // Build load board context for AI
  const buildLoadBoard = useCallback(() => {
    const boardData = loads.length > 0 ? loads : BOARD_LOADS
    return boardData.map(l =>
      `${l.load_number || l.id} | ${l.origin_city || l.origin || ''}, ${l.origin_state || ''} → ${l.destination_city || l.dest || ''}, ${l.destination_state || ''} | ${l.miles || 0}mi | $${l.rate || 0} | ${l.equipment_type || l.equipment || ''} | ${l.broker_name || l.broker || ''}`
    ).join('\n') || 'No loads available yet.'
  }, [loads])

  // ── HOS 11-hour driving clock ──────────────────────
  const getHosRemaining = useCallback(() => {
    if (!hosStartTime) return null
    const elapsed = (Date.now() - hosStartTime) / 3600000 // hours
    const remaining = Math.max(0, 11 - elapsed)
    return { elapsed: +elapsed.toFixed(1), remaining: +remaining.toFixed(1) }
  }, [hosStartTime])

  // Start HOS clock when driver departs (status changes to In Transit)
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
          content: `**HOS Warning** — You have ${hrs} left on your 11-hour driving clock. Start looking for a safe place to stop.`,
        }])
        speak(`Warning. You have ${hrs} left on your 11-hour driving clock. Start looking for a safe place to stop.`)
      }
    }
    check()
    const interval = setInterval(check, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [hosStartTime, getHosRemaining])

  // Reset HOS when all loads delivered or driver manually resets
  const resetHOS = useCallback(() => {
    setHosStartTime(null)
    localStorage.removeItem('qivori_hos_start')
    hosWarningShownRef.current = false
  }, [])

  // ── PROACTIVE LOAD FINDING AGENT ─────────────────────────────────────
  // Trigger: driver within ~60min of delivery destination
  // Requires Autopilot AI plan ($499) and connected load board
  useEffect(() => {
    if (!subscription?.plan || subscription.plan !== 'autopilot') return
    if (!subscription?.isActive) return

    const checkProximity = async () => {
      // Find active load that's in transit with a delivery destination
      const inTransitLoad = activeLoads.find(l => {
        const s = (l.status || '').toLowerCase()
        return ['in transit', 'intransit', 'loaded', 'en route'].some(x => s.includes(x.replace(' ', ''))) || s.includes('in transit')
      })
      if (!inTransitLoad) { proactiveTriggeredRef.current = false; return }

      // Don't re-trigger for same load
      const loadKey = inTransitLoad.id || inTransitLoad.load_id
      if (proactiveTriggeredRef.current && proactiveLoadId === loadKey) return

      // Respect 30-min cooldown after driver says "no"
      if (proactiveDismissedRef.current && Date.now() - proactiveDismissedRef.current < 30 * 60 * 1000) return

      // Get current GPS coords
      const coords = await getGPSCoords()
      if (!coords) return

      // Geocode delivery destination to get coords
      const dest = inTransitLoad.destination || inTransitLoad.destination_city || ''
      if (!dest) return

      try {
        const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(dest)}&count=1&language=en&format=json`)
        const geoData = await geoRes.json()
        if (!geoData.results?.[0]) return

        const destLat = geoData.results[0].latitude
        const destLng = geoData.results[0].longitude
        const distMiles = haversine(coords.lat, coords.lng, destLat, destLng)

        // Estimate ~60 mph average → 60 miles = ~1 hour
        const estimatedMinutes = (distMiles / 55) * 60 // 55 mph average for trucks

        if (estimatedMinutes > 75) return // not close enough yet (75 min buffer)

        // TRIGGER: Driver is within ~60 min of delivery
        proactiveTriggeredRef.current = true
        setProactiveLoadId(loadKey)

        // Search for loads from delivery city using driver's credentials
        try {
          const searchRes = await apiFetch(`/api/load-board?origin=${encodeURIComponent(dest)}&limit=10`)
          const searchData = await searchRes.json()

          if (searchData.error?.includes('Connect your load board')) {
            // No load board connected — show fallback
            setMessages(m => [...m, {
              role: 'assistant',
              content: `**Proactive Load Finder** — You're about ${Math.round(estimatedMinutes)} min from delivery in ${dest}.\n\nConnect your load board in **Settings → Load Boards** to enable automatic load finding from your delivery city.\n\nI'll find your next load before you even deliver this one.`,
              isProactive: true,
            }])
            speak(`You're about ${Math.round(estimatedMinutes)} minutes from delivery. Connect your load board in settings to enable proactive load finding.`)
            // Log to admin
            logProactiveActivity('fallback', `Driver near ${dest} — no load board connected`)
            return
          }

          const foundLoads = searchData.loads || []
          if (foundLoads.length === 0) {
            setMessages(m => [...m, {
              role: 'assistant',
              content: `**Proactive Load Finder** — You're ~${Math.round(estimatedMinutes)} min from ${dest}. I searched for loads but nothing available right now. I'll check again in 15 min.`,
              isProactive: true,
            }])
            speak(`You're approaching delivery. No loads found from ${dest} right now, I'll check again soon.`)
            // Retry in 15 min
            proactiveTriggeredRef.current = false
            logProactiveActivity('empty', `No loads found from ${dest}`)
            return
          }

          // Score all found loads
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

          // Present best load to driver
          const best = scored[0]
          const bestRpm = best.miles ? (best.rate / best.miles).toFixed(2) : '—'
          const origin = best.origin_city || best.origin || dest
          const destination = best.destination_city || best.dest || best.destination || '?'

          const msg = [
            `**Proactive Load Finder** — You're ~${Math.round(estimatedMinutes)} min from delivery!`,
            ``,
            `I found **${scored.length} loads** from ${dest}. Here's the best one:`,
            ``,
            `**${origin} → ${destination}**`,
            `$${Number(best.rate || 0).toLocaleString()} · $${bestRpm}/mi · ${best.miles || '?'} mi`,
            `${best.broker_name || best.broker || 'Unknown Broker'} · ${best.equipment_type || best.equipment || 'Dry Van'}`,
            `AI Score: **${best._aiScore}/99**`,
            ``,
            `Say **"book it"** to auto-book, **"show me more"** for top 3, or **"no thanks"** to dismiss.`,
          ].join('\n')

          setMessages(m => [...m, { role: 'assistant', content: msg, isProactive: true }])
          speak(`Heads up! You're ${Math.round(estimatedMinutes)} minutes from delivery. I found a ${best._aiScore} point load from ${origin} to ${destination} for $${Number(best.rate || 0).toLocaleString()}. Say book it to grab it, or show me more for options.`)

          logProactiveActivity('found', `${scored.length} loads from ${dest}, best: ${origin}→${destination} $${best.rate} (${best._aiScore}/99)`)

        } catch (err) {
          console.warn('[ProactiveAgent] Load search error:', err)
        }
      } catch (err) {
        console.warn('[ProactiveAgent] Geocode error:', err)
      }
    }

    // Check every 5 minutes
    checkProximity()
    const interval = setInterval(checkProximity, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [activeLoads, subscription, proactiveLoadId])

  // Log proactive agent activity for admin dashboard
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

  // ── Next stop helper ──────────────────────────────
  const getNextStop = useCallback(() => {
    const load = activeLoads[0]
    if (!load) return null
    const status = (load.status || '').toLowerCase()
    const isBeforePickup = ['booked', 'dispatched', 'assigned'].some(s => status.includes(s))
    const isAtOrAfterPickup = ['pickup', 'loaded', 'in transit', 'at delivery'].some(s => status.includes(s))
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
      // Get destination weather if active load
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
    // Clean display text (remove action blocks)
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
          })
          showToast('success', 'Expense Added', `$${action.amount} — ${action.category}`)
          return true
        }
        case 'check_call': {
          // logCheckCall expects loadNumber (e.g. "QV-4026"), not a UUID
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
          getGPS()
          return true
        }
        case 'call_broker': {
          if (action.phone) window.location.href = `tel:${action.phone}`
          return true
        }
        case 'update_load_status': {
          const load = loads.find(l => l.id === action.load_id || l.load_id === action.load_id) || activeLoads[0]
          if (load && updateLoadStatus) {
            await updateLoadStatus(load.id, action.status)
            showToast('success', 'Load Updated', `${load.load_id || load.id} → ${action.status}`)
          }
          return true
        }
        case 'book_load': {
          try {
            const newLoad = await addLoad({
              origin: action.origin,
              destination: action.destination || action.dest,
              miles: action.miles,
              rate: action.gross || action.rate, // gross pay
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
            showToast('success', 'Load Booked!', `${action.origin} → ${action.destination || action.dest} — $${Number(action.gross || 0).toLocaleString()}`)
          } catch (err) {
            showToast('error', 'Booking Failed', err.message)
          }
          return true
        }
        case 'snap_ratecon': {
          // Trigger the rate con camera input
          if (rateConInputRef.current) rateConInputRef.current.click()
          return true
        }
        case 'upload_doc': {
          // Trigger the camera/file picker for document upload
          setPendingUpload({ doc_type: action.doc_type, load_id: action.load_id, prompt: action.prompt })
          return true
        }
        case 'search_nearby': {
          // Intercept weigh station queries — redirect to check_weigh_station
          if ((action.query || '').toLowerCase().match(/weigh|scale|coop/)) {
            return executeAction({ type: 'check_weigh_station', state: action.state, highway: action.highway, radius: action.radius })
          }
          // Force truck-stop-specific query so Maps shows real truck stops, not gas stations
          const rawQuery = (action.query || '').toLowerCase()
          const query = (!rawQuery || /fuel|gas|stop|truck\s*stop|diesel|refuel/.test(rawQuery))
            ? "Pilot Flying J OR Love's Travel Stop OR Petro truck stop"
            : action.query
          // Get GPS — required for useful results
          const loc = await getGPSCoords()
          if (!loc) {
            setMessages(m => [...m, { role: 'assistant', content: 'Could not get your location. Please enable GPS and try again.' }])
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
            console.error('Weigh station check error:', err)
            setMessages(m => [...m, { role: 'assistant', content: 'Couldn\'t check weigh stations right now. Try again in a moment.' }])
          }
          return true
        }
        case 'open_maps': {
          // Intercept weigh station queries here too
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
                const etaHours = (miles / 55).toFixed(1) // ~55 mph avg for trucks
                etaText = `\nETA: ~${etaHours} hrs (${miles} mi at 55 mph avg)`
              }
            }
            setMessages(m => [...m, { role: 'assistant', content: `**Next Stop: ${stop.type}**\n📍 ${stop.location}\n${stop.address !== stop.location ? `📫 ${stop.address}\n` : ''}📅 ${stop.date}\n🔖 Load ${stop.loadId}${etaText}` }])
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
            const urgency = hos.remaining <= 2 ? '🔴' : hos.remaining <= 4 ? '🟡' : '🟢'
            setMessages(m => [...m, { role: 'assistant', content: `${urgency} **HOS Status**\n⏱ Driven: ${driven}\n⏳ Remaining: ${hrs}\n${hos.remaining <= 2 ? '\n⚠️ **Start looking for a safe place to stop!**' : ''}` }])
          }
          return true
        }
        case 'start_hos': {
          const now = Date.now()
          setHosStartTime(now)
          localStorage.setItem('qivori_hos_start', String(now))
          hosWarningShownRef.current = false
          setMessages(m => [...m, { role: 'assistant', content: '🟢 **HOS clock started.** You have 11 hours of driving time. I\'ll warn you when 2 hours remain.' }])
          return true
        }
        case 'reset_hos': {
          resetHOS()
          setMessages(m => [...m, { role: 'assistant', content: '🔄 **HOS clock reset.** Your 11-hour driving clock is cleared. It will restart when your next load goes In Transit.' }])
          return true
        }
        case 'weather_check': {
          setMessages(m => [...m, { role: 'assistant', content: '🌤 Checking weather conditions...' }])
          const weather = await fetchWeather()
          if (weather.error) {
            setMessages(m => { const updated = [...m]; updated[updated.length - 1] = { role: 'assistant', content: weather.error }; return updated })
          } else {
            let msg = `**Weather at Your Location**\n🌡 ${weather.current.temp}°F — ${weather.current.condition}\n💨 Wind: ${weather.current.wind} mph\n🌧 Precipitation: ${weather.current.precip}"`
            if (weather.dest) {
              msg += `\n\n**Weather at Destination (${weather.dest.location})**\n🌡 ${weather.dest.temp}°F — ${weather.dest.condition}\n💨 Wind: ${weather.dest.wind} mph\n🌧 Precipitation: ${weather.dest.precip}"`
            }
            const dangerous = [65, 75, 77, 82, 85, 86, 95, 96, 99]
            const currentDangerous = dangerous.includes(weather.current?.weathercode)
            const destDangerous = weather.dest && dangerous.includes(weather.dest?.weathercode)
            if (currentDangerous || destDangerous) msg += '\n\n⚠️ **Severe conditions detected. Drive cautiously and consider stopping if visibility is poor.**'
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
        case 'navigate': {
          showToast('info', 'Navigate', `Opening ${action.to}`)
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

  // Get GPS location
  const getGPS = () => {
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
      } catch {
        const loc = `${pos.coords.latitude.toFixed(4)}, ${pos.coords.longitude.toFixed(4)}`
        setGpsLocation(loc)
      }
    }, () => { showToast('error', 'Error', 'Location permission denied') })
  }

  // ── TEXT-TO-SPEECH ──────────────────────────────
  // iOS requires unlocking speechSynthesis with a user gesture first
  const ttsUnlockedRef = useRef(false)
  const unlockTTS = useCallback(() => {
    if (ttsUnlockedRef.current || !window.speechSynthesis) return
    const u = new SpeechSynthesisUtterance('')
    u.volume = 0
    window.speechSynthesis.speak(u)
    ttsUnlockedRef.current = true
  }, [])

  const speak = useCallback((text, onDone) => {
    if (!speakerOn || !text || !window.speechSynthesis) { onDone?.(); return }
    // Cancel any current speech
    window.speechSynthesis.cancel()
    // Clean text — remove markdown, URLs, coordinates, brackets, code blocks
    const clean = text
      .replace(/```[\s\S]*?```/g, '')          // code blocks
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // markdown links → keep label
      .replace(/https?:\/\/\S+/g, '')          // URLs
      .replace(/-?\d+\.\d{4,},\s*-?\d+\.\d{4,}/g, '') // lat,lng coordinates
      .replace(/\[.*?\]/g, '')                 // anything in brackets
      .replace(/\*\*/g, '')                    // bold
      .replace(/[#*_~`]/g, '')                 // other markdown
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (!clean) { onDone?.(); return }
    // iOS workaround: split long text into chunks under 200 chars
    const chunks = []
    let remaining = clean
    while (remaining.length > 0) {
      if (remaining.length <= 180) {
        chunks.push(remaining)
        break
      }
      let splitAt = remaining.lastIndexOf('. ', 180)
      if (splitAt < 50) splitAt = remaining.lastIndexOf(', ', 180)
      if (splitAt < 50) splitAt = remaining.lastIndexOf(' ', 180)
      if (splitAt < 50) splitAt = 180
      chunks.push(remaining.slice(0, splitAt + 1))
      remaining = remaining.slice(splitAt + 1).trim()
    }

    let resumeInterval = null
    chunks.forEach((chunk, i) => {
      const utterance = new SpeechSynthesisUtterance(chunk)
      utterance.rate = 1.1
      utterance.pitch = 1.0
      utterance.volume = 1.0
      utterance.lang = 'en-US'
      if (i === 0) utterance.onstart = () => {
        setSpeaking(true)
        resumeInterval = setInterval(() => {
          window.speechSynthesis.pause()
          window.speechSynthesis.resume()
        }, 10000)
      }
      if (i === chunks.length - 1) {
        utterance.onend = () => { setSpeaking(false); clearInterval(resumeInterval); onDone?.() }
        utterance.onerror = () => { setSpeaking(false); clearInterval(resumeInterval); onDone?.() }
      }
      window.speechSynthesis.speak(utterance)
    })
  }, [speakerOn])

  // Stop speaking when speaker is toggled off
  useEffect(() => {
    if (!speakerOn) window.speechSynthesis?.cancel()
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
      // Update the message in place to reflect the new status
      setMessages(msgs => msgs.map(m => {
        if (!m.weighStations) return m
        return {
          ...m,
          weighStations: m.weighStations.map(s =>
            s.key === ws.key
              ? { ...s, open: reportStatus === 'open', status: reportStatus === 'open' ? 'Open — you reported just now' : 'Closed — you reported just now', reportedBy: 'you' }
              : s
          ),
        }
      }))
    } catch (err) {
      showToast('error', 'Report Failed', 'Could not submit — try again')
    }
  }

  // ── GPS COORDS (returns promise with lat/lng) ──
  const getGPSCoords = () => new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  })

  // ── VOICE RECOGNITION ──────────────────────────
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
  const hasSpeechRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  const startListening = useCallback(() => {
    // Unlock TTS on any user gesture (needed for iOS)
    unlockTTS()
    if (!hasSpeechRecognition) {
      if (isIOS) {
        showToast('info', 'Voice on iPhone', 'For voice input, use the mic button on your keyboard.')
      } else {
        showToast('error', 'Not Supported', 'Voice not supported on this browser. Please type your message.')
      }
      return
    }

    if (listening) {
      recognitionRef.current?.stop()
      return
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.interimResults = true
    recognition.continuous = false
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    recognition.onstart = () => {
      setListening(true)
      setVoiceText('')
    }

    recognition.onresult = (event) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setVoiceText(transcript)
      setInput(transcript)

      // If final result, auto-send
      if (event.results[event.results.length - 1].isFinal) {
        setTimeout(() => {
          sendMessage(transcript)
          setVoiceText('')
        }, 300)
      }
    }

    recognition.onerror = (event) => {
      console.error('Speech error:', event.error)
      setListening(false)
      if (event.error === 'not-allowed') {
        showToast('error', 'Mic Blocked', 'Allow microphone access in browser settings')
      } else if (event.error === 'no-speech') {
        // Silently end — user just didn't speak
      }
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognition.start()
  }, [listening, unlockTTS, hasSpeechRecognition, isIOS, showToast])

  // Handle document photo upload
  const handleDocUpload = async (file) => {
    if (!file || !pendingUpload) return
    const { doc_type, load_id } = pendingUpload
    const docLabels = { bol: 'BOL', signed_bol: 'Signed BOL', rate_con: 'Rate Confirmation', pod: 'Proof of Delivery', lumper_receipt: 'Lumper Receipt', scale_ticket: 'Scale Ticket', other: 'Document' }
    const label = docLabels[doc_type] || 'Document'

    try {
      // Upload to Supabase Storage
      const { uploadFile } = await import('../lib/storage')
      const { createDocument } = await import('../lib/database')
      const uploaded = await uploadFile(file, 'documents')

      // Find load
      const load = loads.find(l => l.id === load_id || l.load_id === load_id) || activeLoads[0]

      // Save document record
      await createDocument({
        name: `${label} — ${load?.load_id || 'Unknown'}`,
        type: doc_type,
        url: uploaded.url,
        load_id: load?.id,
        company_id: company?.id,
        uploaded_at: new Date().toISOString(),
      })

      showToast('success', `${label} Uploaded`, file.name)

      // Send confirmation to AI chat
      setPendingUpload(null)
      setMessages(m => [
        ...m,
        { role: 'user', content: `[Uploaded ${label} photo: ${file.name}]`, isDoc: true },
      ])
      // Tell AI the doc was uploaded
      sendMessage(`I just uploaded the ${label} for load ${load?.load_id || load_id}`)
    } catch (err) {
      console.warn('Doc upload failed, saving locally:', err.message)
      showToast('warning', 'Saved Locally', `${label} saved — will sync when online`)
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
      // Convert file to base64
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(reader.result.split(',')[1])
        reader.onerror = reject
        reader.readAsDataURL(file)
      })

      const mediaType = file.type || 'image/jpeg'

      // Send to parse-ratecon API
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

      // Show extracted details in chat
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

      // Auto-book the load
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
      console.error('Rate con parse error:', err)
      setMessages(m => [...m, { role: 'assistant', content: `Error processing the rate con: ${err.message || 'Try again.'}` }])
    } finally {
      setLoading(false)
    }
  }

  // Send message
  const sendMessage = async (text) => {
    const userText = text || input.trim()
    if (!userText || loading) return
    // Unlock TTS on user interaction (iOS requires gesture)
    unlockTTS()
    setShowQuickActions(false)
    const newMessages = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    // Smart intent detection
    const lowerText = userText.toLowerCase()

    // ── PROACTIVE LOAD FINDING AGENT — driver response handling ──
    if (proactiveLoadsRef.current.length > 0) {
      // "book it" / "yes" → auto-book the best load
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
          setMessages(m => [...m, { role: 'assistant', content: `**Load Booked!** ${best.origin_city || best.origin} → ${dest}\n$${Number(best.rate || 0).toLocaleString()} · ${best.miles} mi · AI Score ${best._aiScore}/99\n\nYour next load is locked in before you even delivered this one.`, isProactive: true }])
          speak(`Load booked! ${best.origin_city || best.origin} to ${dest} for $${Number(best.rate || 0).toLocaleString()}.`)
          showToast('success', 'Load Booked!', `${best.origin_city || best.origin} → ${dest}`)
          logProactiveActivity('booked', `Auto-booked: ${best.origin_city || best.origin}→${dest} $${best.rate} (${best._aiScore}/99)`)
          proactiveLoadsRef.current = []
        } catch (err) {
          setMessages(m => [...m, { role: 'assistant', content: `Couldn't book that load: ${err.message}. Try again or say "show me more".` }])
        }
        setLoading(false)
        return
      }

      // "show me more" / "more options" → show top 3
      if (/\b(show\s*me\s*more|more\s*options|more\s*loads|other\s*loads|what\s*else|top\s*3)\b/.test(lowerText)) {
        const top3 = proactiveLoadsRef.current.slice(0, 3)
        const lines = top3.map((l, i) => {
          const orig = l.origin_city || l.origin || '?'
          const dest = l.destination_city || l.dest || l.destination || '?'
          const rpm = l.miles ? (l.rate / l.miles).toFixed(2) : '—'
          return `**${i + 1}. ${orig} → ${dest}**\n$${Number(l.rate || 0).toLocaleString()} · $${rpm}/mi · ${l.miles || '?'} mi · ${l.broker_name || l.broker || '?'} · Score: ${l._aiScore}/99`
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

      // "book 1/2/3" → book specific load from top 3
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
            setMessages(m => [...m, { role: 'assistant', content: `**Booked load #${idx + 1}!** ${load.origin_city || load.origin} → ${dest} · $${Number(load.rate || 0).toLocaleString()} · Score ${load._aiScore}/99`, isProactive: true }])
            speak(`Load number ${idx + 1} booked!`)
            showToast('success', 'Load Booked!', `${load.origin_city || load.origin} → ${dest}`)
            logProactiveActivity('booked', `Booked option #${idx + 1}: ${load.origin_city || load.origin}→${dest} $${load.rate}`)
            proactiveLoadsRef.current = []
          } catch (err) {
            setMessages(m => [...m, { role: 'assistant', content: `Couldn't book: ${err.message}` }])
          }
          setLoading(false)
          return
        }
      }

      // "no" / "dismiss" / "not now" → dismiss, retry in 30 min
      if (/\b(no\s*thanks?|no|dismiss|not\s*now|skip|pass|later|nah)\b/.test(lowerText)) {
        proactiveDismissedRef.current = Date.now()
        proactiveTriggeredRef.current = false
        proactiveLoadsRef.current = []
        setMessages(m => [...m, { role: 'assistant', content: `Got it — I'll check again in 30 minutes for new loads.`, isProactive: true }])
        speak('No problem. I\'ll check again in 30 minutes.')
        logProactiveActivity('dismissed', 'Driver dismissed proactive suggestion')
        setLoading(false)
        return
      }
    }

    // ── ACCOUNT MANAGEMENT — upgrade/downgrade plan ──
    if (/\b(upgrade|downgrade|change)\s*(my\s*)?(plan|subscription|account|tier)\b/.test(lowerText) || /\b(upgrade\s*to|switch\s*to)\s*(solo|fleet|enterprise|autopilot|growing)\b/.test(lowerText)) {
      // Detect which plan they want
      let targetPlan = null
      if (/solo/i.test(lowerText)) targetPlan = { id: 'solo', name: 'Solo', price: '$99/mo' }
      else if (/fleet/i.test(lowerText)) targetPlan = { id: 'fleet', name: 'Fleet', price: '$299/mo' }
      else if (/enterprise|growing/i.test(lowerText)) targetPlan = { id: 'growing', name: 'Enterprise', price: '$599/mo' }

      if (targetPlan) {
        // Generate Stripe checkout link
        try {
          const res = await apiFetch('/api/create-checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ planId: targetPlan.id, email: user?.email, userId: user?.id }),
          })
          const data = await res.json()
          if (data.url) {
            setMessages(m => [...m, { role: 'assistant', content: `**Upgrade to ${targetPlan.name} (${targetPlan.price})**\n\nI've generated your checkout link. Tap below to complete:\n\n[Upgrade Now](${data.url})\n\nIncludes a 14-day free trial. Cancel anytime.` }])
            speak(`Opening checkout for the ${targetPlan.name} plan at ${targetPlan.price}.`)
            setTimeout(() => window.open(data.url, '_blank'), 1500)
          } else {
            setMessages(m => [...m, { role: 'assistant', content: `Couldn't create checkout: ${data.error || 'Try again later.'}` }])
          }
        } catch (err) {
          setMessages(m => [...m, { role: 'assistant', content: `Error creating checkout: ${err.message}` }])
        }
      } else {
        // No specific plan mentioned — show options
        setMessages(m => [...m, { role: 'assistant', content: `**Available Plans:**\n\n**Solo** — $99/mo\nPerfect for owner-operators. AI dispatch, load scoring, compliance.\n\n**Fleet** — $299/mo\nFor small fleets. Everything in Solo + fleet management, driver scorecards.\n\n**Enterprise** — $599/mo\nFull platform. Everything in Fleet + Autopilot AI, priority support.\n\nSay **"upgrade to Solo"**, **"upgrade to Fleet"**, or **"upgrade to Enterprise"** to get started.` }])
        speak('I have three plans available. Solo at 99, Fleet at 299, and Enterprise at 599 per month. Which would you like?')
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

      // Save setting to Supabase
      try {
        const { supabase: sb } = await import('../lib/supabase')
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
      // Let the AI handle this with extra context — don't return, fall through to AI
      // But add platform context to help it answer
    }

    // ── ACCOUNT MANAGEMENT — escalate to admin ──
    if (/\b(talk\s*to\s*(a\s*)?(human|admin|support|person|agent)|escalate|can'?t\s*(figure|solve|fix)|need\s*help\s*from\s*(admin|support|team))\b/i.test(lowerText)) {
      // Send escalation email
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

    // ── VOICE MODE TOGGLE ──
    if (/\b(turn\s*on|enable|start|activate)\s*(voice\s*mode|hands[\s-]*free|voice)\b/i.test(lowerText) || /\bgo\s*hands[\s-]*free\b/i.test(lowerText)) {
      setHandsFree(true)
      setSpeakerOn(true)
      setMessages(m => [...m, { role: 'assistant', content: '**Hands-free mode activated.** I\'ll listen continuously and speak all responses. Say **"turn off hands-free"** to stop.' }])
      speak('Hands-free mode is now on. I\'m listening.')
      setTimeout(() => startListening(), 500)
      setLoading(false)
      return
    }
    if (/\b(turn\s*off|disable|stop|deactivate)\s*(voice\s*mode|hands[\s-]*free|voice)\b/i.test(lowerText)) {
      setHandsFree(false)
      setMessages(m => [...m, { role: 'assistant', content: '**Hands-free mode off.** I\'ll stop listening automatically. You can still tap the mic to speak.' }])
      speak('Hands-free mode turned off.')
      setLoading(false)
      return
    }

    // ── SHOW MY SUBSCRIPTION ──
    if (/\b(show|what'?s?|view|check)\s*(my\s*)?(subscription|plan|current\s*plan|account\s*status|billing\s*status)\b/i.test(lowerText) && !/upgrade|downgrade|change|cancel/i.test(lowerText)) {
      const plan = subscription?.plan || 'Free'
      const status = subscription?.status || 'inactive'
      const trial = subscription?.isTrial
      const trialEnd = subscription?.trialEndsAt ? new Date(subscription.trialEndsAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : null
      const planPrices = { solo: '$99/mo', fleet: '$299/mo', growing: '$599/mo', enterprise: '$599/mo' }
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
        setMessages(m => [...m, { role: 'assistant', content: `You're not on a trial — you have an **active subscription**. Say **"show my subscription"** for details.` }])
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
          const date = inv.created_at ? new Date(inv.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'
          const status = inv.status || 'draft'
          const statusIcon = status === 'paid' ? '✅' : status === 'sent' ? '📤' : '📝'
          return `${i + 1}. **${inv.invoice_number || `INV-${i + 1}`}** — $${Number(inv.total || 0).toLocaleString()} · ${date} ${statusIcon} ${status}`
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

    // ── CONNECT LOAD BOARD (DAT, 123LoadBoard, Truckstop) ──
    if (/\b(connect|link|set\s*up|configure|add)\s*(my\s*)?(dat|load\s*board|123\s*load|truckstop|broker)\s*(account|credentials?|api|key)?\b/i.test(lowerText)) {
      setMessages(m => [...m, { role: 'assistant', content: `**Connect Your Load Board**\n\nTo connect your load board accounts (DAT, 123Loadboard, Truckstop), go to:\n\n**Settings → Load Board Connections**\n\nYou'll need your API credentials from each provider. Once connected, I can automatically search for loads and help you book them.\n\nSay **"activate load finding"** after connecting to enable the Proactive Load Agent.` }])
      speak("Go to Settings, then Load Board Connections to add your API credentials.")
      setLoading(false)
      return
    }

    // ── REPORT A PROBLEM / BUG ──
    if (/\b(report\s*(a\s*)?(problem|bug|issue|error)|something'?s?\s*(wrong|broken|not\s*work)|file\s*(a\s*)?(complaint|ticket)|i\s*have\s*(a\s*)?(problem|issue|bug))\b/i.test(lowerText)) {
      // Log to admin with full context
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

    // Sleep/tired/rest → auto-search rest areas
    if (/\b(sleep|tired|exhausted|rest\s*area|nap|drowsy|fatigue|pull\s*over|need\s*rest|need\s*sleep)\b/.test(lowerText)) {
      await executeAction({ type: 'search_nearby', query: 'rest area OR truck stop parking' })
    }

    // Nearest truck stop / fuel / gas → instant maps open (no AI delay)
    if (/\b(nearest|closest|find\s*(me\s*)?(a\s*)?)(truck\s*stop|fuel|gas\s*station|love'?s|pilot|petro|ta\b|flying\s*j)\b/.test(lowerText) || /\bnear(by|est)?\s*truck\s*stop\b/.test(lowerText)) {
      await executeAction({ type: 'search_nearby', query: 'truck stop' })
      setLoading(false)
      return
    }

    // Next stop / where am I going → show next stop
    if (/\b(next\s*stop|where.*(go|head|deliver|pick\s*up)|my\s*next|next\s*(pickup|delivery))\b/.test(lowerText)) {
      await executeAction({ type: 'next_stop' })
      setLoading(false)
      return // handled locally, no need to call AI
    }

    // HOS / hours / driving clock → check HOS
    if (/\b(hos\b|hours?\s*(of\s*service|left|remaining|do\s*i\s*have)|driving\s*clock|how\s*(long|many\s*hours)|11.hour|fourteen.hour|break\s*time)\b/.test(lowerText)) {
      await executeAction({ type: 'hos_check' })
      setLoading(false)
      return
    }

    // Weather / road conditions → fetch weather
    if (/\b(weather|forecast|rain|snow|storm|ice|fog|road\s*condition|temperature|wind\s*chill)\b/.test(lowerText)) {
      await executeAction({ type: 'weather_check' })
      setLoading(false)
      return
    }

    // Start/reset HOS commands
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
      // Build messages with context memory from previous conversations
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
        }),
      })
      if (!res.ok) {
        const errText = await res.text()
        throw new Error(`API ${res.status}: ${errText.slice(0, 200)}`)
      }
      const data = await res.json()
      const rawReply = data.reply || data.error || 'Something went wrong.'

      // Parse actions from the response
      const { actions, displayText } = parseActions(rawReply)

      // Execute any actions — intercept weigh station queries before they open maps
      for (const action of actions) {
        const q = (action.query || '').toLowerCase()
        if ((action.type === 'search_nearby' || action.type === 'open_maps') && q.match(/weigh|scale|coop/)) {
          await executeAction({ type: 'check_weigh_station', state: action.state, highway: action.highway, radius: action.radius })
        } else {
          await executeAction(action)
        }
      }

      const replyText = displayText || rawReply
      // Reset escalation counter on successful AI response
      escalateAttemptRef.current = 0
      setMessages(m => [...m, {
        role: 'assistant',
        content: replyText,
        actions,
      }])
      // AI speaks the response — in hands-free mode, restart mic when done
      speak(replyText, () => {
        if (handsFree && hasSpeechRecognition) {
          setTimeout(() => startListening(), 400)
        }
      })
    } catch (err) {
      console.error('Chat error:', err)
      escalateAttemptRef.current += 1
      if (escalateAttemptRef.current >= 2) {
        // Auto-escalate after 2 failed attempts
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
        setMessages(m => [...m, { role: 'assistant', content: `I'm having trouble answering that. I've **automatically escalated** this to Mohamed — he'll review the conversation and get back to you via email at **${user?.email || 'your registered email'}**.\n\nYou can also email **hello@qivori.com** directly.` }])
        speak("I've escalated this to the admin team. They'll follow up with you.")
      } else {
        setMessages(m => [...m, { role: 'assistant', content: 'Connection error: ' + (err.message || 'check your internet.') + '\n\nTry again — if it fails once more, I\'ll escalate to the admin team.' }])
      }
    } finally {
      setLoading(false)
    }
  }

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
  ]

  // Suggested prompts for empty state — includes account management
  const suggestions = [
    'Upgrade my plan',
    'Show my subscription',
    'Activate load finding',
    'Help me with BOL',
    'Report a problem',
    'Nearest truck stop',
    'How many hours do I have left?',
    "What's my next stop?",
  ]

  return (
    <div style={{ height: '100dvh', width: '100vw', display: 'flex', flexDirection: 'column', background: 'var(--bg)', fontFamily: "'DM Sans',sans-serif", overflow: 'hidden', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>

      {/* ── HEADER ──────────────────────────────────── */}
      <div style={{ height: 56, background: 'var(--surface)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0 }}>
        <button onClick={startListening}
          style={{ width: 36, height: 36, borderRadius: '50%', background: listening ? 'var(--danger)' : 'linear-gradient(135deg, rgba(240,165,0,0.15), rgba(0,212,170,0.1))', border: '1px solid ' + (listening ? 'var(--danger)' : 'rgba(240,165,0,0.3)'), display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', animation: listening ? 'micPulse 1.5s ease-in-out infinite' : 'none', padding: 0 }}>
          <Ic icon={listening ? Mic : Zap} size={18} color={listening ? '#fff' : 'var(--accent)'} />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 3 }}>
            QI<span style={{ color: 'var(--accent)' }}>VORI</span>
            <span style={{ fontSize: 11, color: 'var(--accent2)', letterSpacing: 1, fontFamily: "'DM Sans',sans-serif", fontWeight: 700, marginLeft: 6 }}>AI</span>
          </div>
          <div style={{ fontSize: 10, color: 'var(--success)', display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--success)' }} />
            {activeLoads.length > 0 ? `${activeLoads.length} active load${activeLoads.length > 1 ? 's' : ''}` : 'Ready to help'}
          </div>
        </div>

        {/* Mini stats */}
        <div style={{ display: 'flex', gap: 8 }}>
          <MiniStat label="MTD" value={'$' + totalRevenue.toLocaleString()} color="var(--accent)" />
          <MiniStat label="Loads" value={activeLoads.length} color="var(--accent2)" />
        </div>

        {/* Hands-Free toggle */}
        <button onClick={() => { unlockTTS(); setHandsFree(h => { const next = !h; if (next) { setSpeakerOn(true) }; return next }) }}
          style={{ height: 32, borderRadius: 8, padding: '0 8px', background: handsFree ? 'rgba(0,212,170,0.15)' : 'var(--surface2)', border: '1px solid ' + (handsFree ? 'rgba(0,212,170,0.3)' : 'var(--border)'), cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <Ic icon={handsFree ? Volume2 : VolumeX} size={12} color={handsFree ? 'var(--success)' : 'var(--muted)'} />
          <span style={{ fontSize: 9, fontWeight: 700, color: handsFree ? 'var(--success)' : 'var(--muted)', letterSpacing: 0.5 }}>{handsFree ? 'HANDS-FREE' : 'MANUAL'}</span>
        </button>

        {/* New Chat / Home button — only show when in conversation */}
        {messages.length > 0 && (
          <button onClick={() => { if (messages.length > 0) contextMemoryRef.current = messages.slice(-5); setMessages([]); setInput(''); setPendingUpload(null); setShowQuickActions(true); window.speechSynthesis?.cancel() }}
            style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
            <Ic icon={Plus} size={16} color="var(--text)" />
          </button>
        )}

        <button onClick={logout} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', color: 'var(--danger)', cursor: 'pointer', fontSize: 10, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>
          Log Out
        </button>
      </div>

      {/* ── OFFLINE INDICATOR ────────────────────────── */}
      {isOffline && (
        <div style={{ flexShrink: 0, padding: '6px 16px', background: 'rgba(239,68,68,0.12)', borderBottom: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)' }} />
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>Offline — actions will sync when connected</span>
        </div>
      )}

      {/* ── PWA INSTALL BANNER ──────────────────────── */}
      {showInstallBanner && (
        <div style={{ flexShrink: 0, margin: '8px 16px 0', padding: '10px 14px', background: 'linear-gradient(135deg, rgba(240,165,0,0.1), rgba(0,212,170,0.06))', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ic icon={Download} size={16} color="var(--accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Install Qivori AI</div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>Add to home screen for quick access</div>
          </div>
          <button onClick={handleInstallClick} style={{ padding: '6px 14px', background: 'var(--accent)', border: 'none', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#000', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>Install</button>
          <button onClick={() => setShowInstallBanner(false)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', padding: 4 }}>
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

      {/* ── ACTIVE LOAD STATUS BAR ────────────────────── */}
      {activeLoads.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <div style={{ margin: '8px 16px 0', padding: '10px 14px', background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)', borderRadius: showLoadDetail ? '10px 10px 0 0' : 10, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
            onClick={() => setShowLoadDetail(d => !d)}>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Ic icon={Truck} size={16} color="var(--accent)" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeLoads[0].origin} → {activeLoads[0].destination}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>{activeLoads[0].load_id}</span>
                <span>·</span>
                <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{activeLoads[0].status}</span>
                {activeLoads[0].delivery_date && <>
                  <span>·</span>
                  <span>Due {activeLoads[0].delivery_date}</span>
                </>}
                {activeLoads[0].miles && <>
                  <span>·</span>
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
                ['RPM', activeLoads[0].miles ? `$${(Number(activeLoads[0].rate || 0) / Number(activeLoads[0].miles)).toFixed(2)}/mi` : '—'],
                ['Equipment', activeLoads[0].equipment || activeLoads[0].equipment_type || '—'],
                ['Broker', activeLoads[0].broker_name || '—'],
                ['Pickup', activeLoads[0].pickup_date || '—'],
                ['Delivery', activeLoads[0].delivery_date || '—'],
                ['Weight', activeLoads[0].weight ? `${activeLoads[0].weight} lbs` : '—'],
                ['Ref #', activeLoads[0].reference_number || '—'],
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
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Empty state — tap to talk + suggestions */}
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 16 }}>
            {/* Tappable AI logo — starts voice */}
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <button onClick={startListening}
                style={{ width: 80, height: 80, borderRadius: '50%', background: listening ? 'var(--danger)' : 'linear-gradient(135deg, rgba(240,165,0,0.15), rgba(0,212,170,0.1))', border: '2px solid ' + (listening ? 'var(--danger)' : 'rgba(240,165,0,0.3)'), display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', cursor: 'pointer', transition: 'all 0.2s', animation: listening ? 'micPulse 1.5s ease-in-out infinite' : 'none', boxShadow: listening ? '0 0 30px rgba(239,68,68,0.3)' : '0 0 20px rgba(240,165,0,0.15)' }}>
                <Ic icon={listening ? Mic : Zap} size={32} color={listening ? '#fff' : 'var(--accent)'} />
              </button>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                {listening ? 'Listening...' : 'Hey, Driver'}
              </div>
              {listening ? (
                <div style={{ fontSize: 14, color: 'var(--text)', minHeight: 20, fontWeight: 600 }}>
                  {voiceText || 'Speak now...'}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                    Tap the mic and tell me what you need
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 6, fontWeight: 600 }}>
                    <Ic icon={Mic} size={11} /> Tap to talk — or type below
                  </div>
                </>
              )}
            </div>

            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, marginTop: 8 }}>OR TAP A SUGGESTION</div>
            {suggestions.map(s => (
              <button key={s} onClick={() => sendMessage(s)}
                style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', fontSize: 13, color: 'var(--text)', cursor: 'pointer', textAlign: 'left', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', gap: 10 }}>
                <Ic icon={Send} size={12} color="var(--accent)" style={{ flexShrink: 0 }} />
                <span>{s}</span>
              </button>
            ))}
          </div>
        )}

        {/* Messages */}
        {messages.map((m, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
            {m.role === 'assistant' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ic icon={Zap} size={10} color="var(--accent)" />
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>Qivori AI</span>
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
            }}>
              {m.wsSummary ? (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>⚖️</span> Weigh Stations Nearby
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
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Tap a station for directions · Report status to help other drivers</div>
                </div>
              ) : m.content}
            </div>

            {/* Show action confirmation badges */}
            {m.actions && m.actions.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                {m.actions.map((a, j) => (
                  <ActionBadge key={j} action={a} />
                ))}
              </div>
            )}

            {/* Place results — tappable cards with directions */}
            {m.places && m.places.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, maxWidth: '88%' }}>
                {m.places.map((p, j) => {
                  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
                  const dirUrl = isIOS
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

            {/* Weigh station results — status + directions + report */}
            {m.weighStations && m.weighStations.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8, maxWidth: '92%' }}>
                {m.weighStations.map((ws, j) => {
                  const wsIsIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
                  const wsDirUrl = wsIsIOS
                    ? `maps://maps.apple.com/?daddr=${ws.lat},${ws.lng}`
                    : `https://www.google.com/maps/dir/?api=1&destination=${ws.lat},${ws.lng}`
                  const statusColor = ws.open === true ? 'var(--success)' : ws.open === false ? 'var(--danger)' : 'var(--muted)'
                  return (
                    <div key={j} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
                      {/* Station info + directions */}
                      <a href={wsDirUrl} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px' }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, background: ws.open ? 'rgba(0,212,170,0.1)' : 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <div style={{ width: 12, height: 12, borderRadius: '50%', background: statusColor }} />
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ws.name}</div>
                          <div style={{ fontSize: 11, color: statusColor, fontWeight: 600 }}>{ws.status}</div>
                          <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                            {ws.highway} {ws.direction} · {ws.bypass}{ws.distance ? ` · ${ws.distance} mi` : ''}
                          </div>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <Ic icon={Navigation} size={14} color="var(--success)" />
                          <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--success)' }}>GO</span>
                        </div>
                      </a>
                      {/* Report buttons */}
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
      <div style={{ flexShrink: 0, padding: '6px 16px', display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {quickActions.map(a => (
          <button key={a.label} onClick={() => { if (a.msg === '__snap_ratecon__') { if (rateConInputRef.current) rateConInputRef.current.click() } else { sendMessage(a.msg) } }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20, fontSize: 12, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'DM Sans',sans-serif", flexShrink: 0 }}>
            <Ic icon={a.icon} size={13} color={a.label === 'Check In' ? 'var(--success)' : 'var(--accent)'} />
            {a.label}
          </button>
        ))}
      </div>

      {/* ── INPUT BAR ───────────────────────────────── */}
      <div style={{ flexShrink: 0, padding: '8px 12px 12px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        {/* GPS quick button */}
        <button onClick={getGPS}
          style={{ width: 40, height: 40, borderRadius: 12, background: gpsLocation ? 'rgba(0,212,170,0.12)' : 'var(--surface2)', border: '1px solid ' + (gpsLocation ? 'rgba(0,212,170,0.3)' : 'var(--border)'), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ic icon={Navigation} size={16} color={gpsLocation ? 'var(--success)' : 'var(--muted)'} />
        </button>

        {/* Camera / document upload button */}
        <label style={{ width: 40, height: 40, borderRadius: 12, background: pendingUpload ? 'rgba(240,165,0,0.12)' : 'var(--surface2)', border: '1px solid ' + (pendingUpload ? 'rgba(240,165,0,0.3)' : 'var(--border)'), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ic icon={Camera} size={16} color={pendingUpload ? 'var(--accent)' : 'var(--muted)'} />
          <input ref={fileInputRef} type="file" accept="image/*,.pdf" capture="environment" style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0]
              if (!file) return
              if (pendingUpload) {
                handleDocUpload(file)
              } else {
                // No pending upload — ask AI what this is
                setPendingUpload({ doc_type: 'other', load_id: activeLoads[0]?.id, prompt: 'Uploading document...' })
                handleDocUpload(file)
              }
              e.target.value = '' // reset so same file can be re-selected
            }} />
        </label>

        {/* Text input */}
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder={gpsLocation ? `📍 ${gpsLocation} — Ask me anything...` : 'Tell me what you need...'}
            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px', color: 'var(--text)', fontSize: 16, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Mic / Send button — mic when empty, send when has text */}
        {input.trim() ? (
          <button onClick={() => sendMessage()} disabled={loading}
            style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent)', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
            <Ic icon={Send} size={16} color="#000" />
          </button>
        ) : (
          <button onClick={startListening}
            style={{ width: 40, height: 40, borderRadius: 12, background: listening ? 'var(--danger)' : 'var(--surface2)', border: '1px solid ' + (listening ? 'var(--danger)' : 'var(--border)'), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s', animation: listening ? 'micPulse 1.5s ease-in-out infinite' : 'none' }}>
            <Ic icon={Mic} size={16} color={listening ? '#fff' : 'var(--muted)'} />
          </button>
        )}
      </div>

      {/* Listening overlay */}
      {listening && (
        <div style={{ position: 'fixed', bottom: 80, left: 16, right: 16, padding: '16px 20px', background: 'var(--surface)', border: '2px solid var(--danger)', borderRadius: 16, boxShadow: '0 8px 32px rgba(239,68,68,0.3)', zIndex: 200, textAlign: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 8 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--danger)', animation: 'micPulse 1s ease-in-out infinite' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--danger)' }}>Listening...</span>
          </div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', minHeight: 24 }}>
            {voiceText || 'Speak now — "Find me a load from Dallas"'}
          </div>
          <button onClick={() => recognitionRef.current?.stop()}
            style={{ marginTop: 10, background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 16px', color: 'var(--muted)', cursor: 'pointer', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
            Cancel
          </button>
        </div>
      )}

      {/* Hidden rate con file input */}
      <input ref={rateConInputRef} type="file" accept="image/*,.pdf" capture="environment" style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleRateConPhoto(file)
          e.target.value = ''
        }} />

      {/* Animations */}
      <style>{`
        @keyframes aipulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes micPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.7; transform: scale(1.15); }
        }
      `}</style>
    </div>
  )
}

// ── MINI STAT ──────────────────────────────────────────
function MiniStat({ label, value, color }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 800, color, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{value}</div>
    </div>
  )
}

// ── ACTION BADGE ────────────────────────────────────────
function ActionBadge({ action }) {
  const docLabels = { bol: 'BOL', signed_bol: 'Signed BOL', rate_con: 'Rate Con', pod: 'POD', lumper_receipt: 'Lumper', scale_ticket: 'Scale Ticket' }
  const icons = {
    add_expense: Receipt,
    check_call: MapPin,
    get_gps: Navigation,
    call_broker: Phone,
    navigate: ArrowLeft,
    snap_ratecon: ScanLine,
    upload_doc: Camera,
    update_load_status: Truck,
    book_load: Package,
    send_invoice: Mail,
  }
  const labels = {
    add_expense: `Expense: $${action.amount} ${action.category || ''}`,
    check_call: `Check Call: ${action.location || action.status || 'submitted'}`,
    get_gps: 'Getting location...',
    call_broker: 'Calling broker',
    navigate: `Opening ${action.to}`,
    snap_ratecon: 'Snap Rate Con',
    upload_doc: `Upload ${docLabels[action.doc_type] || 'Document'}`,
    update_load_status: `Load → ${action.status}`,
    book_load: `Booked: ${action.origin} → ${action.destination || action.dest}`,
    send_invoice: `Invoice sent to ${action.to || 'broker'}`,
  }
  const Icon = icons[action.type] || CheckCircle
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', background: 'rgba(0,212,170,0.08)', border: '1px solid rgba(0,212,170,0.2)', borderRadius: 8, fontSize: 10, fontWeight: 600, color: 'var(--success)' }}>
      <Ic icon={Icon} size={11} />
      <Ic icon={CheckCircle} size={9} />
      {labels[action.type] || action.type}
    </div>
  )
}
