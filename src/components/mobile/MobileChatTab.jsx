import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import {
  Zap, Send, MapPin, Camera, DollarSign, Package, Truck, Phone,
  Navigation, Receipt, Plus, ChevronRight, ArrowLeft, Home, X,
  CheckCircle, Mic, FileText, Clock, Volume2, VolumeX, ScanLine, Download, Mail, Bell
} from 'lucide-react'
import { apiFetch } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'
import { Ic, haptic, haversine, ActionBadge, getGPSCoords as getGPSCoordsHelper, mobileAnimations } from './shared'

let BOARD_LOADS = []

export default function MobileChatTab() {
  const { logout, showToast, subscription, user, profile } = useApp()
  const { language: currentLang } = useTranslation()
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
  const [hosStartTime, setHosStartTime] = useState(() => {
    const saved = localStorage.getItem('qivori_hos_start')
    return saved ? parseInt(saved) : null
  })
  const [showLoadDetail, setShowLoadDetail] = useState(false)
  const hosWarningShownRef = useRef(false)
  const escalateAttemptRef = useRef(0)

  // ── PROACTIVE LOAD FINDING AGENT state ──────────────────
  const proactiveTriggeredRef = useRef(false)
  const proactiveDismissedRef = useRef(null)
  const proactiveLoadsRef = useRef([])
  const [proactiveLoadId, setProactiveLoadId] = useState(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

  // Persist chat history to localStorage
  useEffect(() => {
    if (messages.length > 0) {
      try {
        // Keep last 50 messages to avoid localStorage bloat
        const toSave = messages.slice(-50)
        localStorage.setItem('qivori_chat_history', JSON.stringify(toSave))
      } catch { /* storage full — ignore */ }
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
      navigator.serviceWorker?.ready?.then(reg => {
        reg.active?.postMessage('replay-queue')
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
      showToast('success', 'Installed!', 'Alex added to your home screen')
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
      `Active loads (${active.length}): ${active.map(l => `${l.load_id || l.id} ${l.origin}\u2192${l.destination} $${Number(l.rate || 0).toLocaleString()} [${l.status}]`).join(' | ') || 'none'}`,
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
          if (foundLoads.length === 0) {
            setMessages(m => [...m, {
              role: 'assistant',
              content: `**Proactive Load Finder** \u2014 You're ~${Math.round(estimatedMinutes)} min from ${dest}. I searched for loads but nothing available right now. I'll check again in 15 min.`,
              isProactive: true,
            }])
            speak(`You're approaching delivery. No loads found from ${dest} right now, I'll check again soon.`)
            proactiveTriggeredRef.current = false
            logProactiveActivity('empty', `No loads found from ${dest}`)
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

          const msg = [
            `**Proactive Load Finder** \u2014 You're ~${Math.round(estimatedMinutes)} min from delivery!`,
            ``,
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
            setMessages(m => [...m, { role: 'assistant', content: `**Next Stop: ${stop.type}**\n\ud83d\udccd ${stop.location}\n${stop.address !== stop.location ? `\ud83d\udceb ${stop.address}\n` : ''}\ud83d\udcc5 ${stop.date}\n\ud83d\udd16 Load ${stop.loadId}${etaText}` }])
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
            const urgency = hos.remaining <= 2 ? '\ud83d\udd34' : hos.remaining <= 4 ? '\ud83d\udfe1' : '\ud83d\udfe2'
            setMessages(m => [...m, { role: 'assistant', content: `${urgency} **HOS Status**\n\u23f1 Driven: ${driven}\n\u23f3 Remaining: ${hrs}\n${hos.remaining <= 2 ? '\n\u26a0\ufe0f **Start looking for a safe place to stop!**' : ''}` }])
          }
          return true
        }
        case 'start_hos': {
          const now = Date.now()
          setHosStartTime(now)
          localStorage.setItem('qivori_hos_start', String(now))
          hosWarningShownRef.current = false
          setMessages(m => [...m, { role: 'assistant', content: '\ud83d\udfe2 **HOS clock started.** You have 11 hours of driving time. I\'ll warn you when 2 hours remain.' }])
          return true
        }
        case 'reset_hos': {
          resetHOS()
          setMessages(m => [...m, { role: 'assistant', content: '\ud83d\udd04 **HOS clock reset.** Your 11-hour driving clock is cleared. It will restart when your next load goes In Transit.' }])
          return true
        }
        case 'weather_check': {
          setMessages(m => [...m, { role: 'assistant', content: '\ud83c\udf24 Checking weather conditions...' }])
          const weather = await fetchWeather()
          if (weather.error) {
            setMessages(m => { const updated = [...m]; updated[updated.length - 1] = { role: 'assistant', content: weather.error }; return updated })
          } else {
            let msg = `**Weather at Your Location**\n\ud83c\udf21 ${weather.current.temp}\u00b0F \u2014 ${weather.current.condition}\n\ud83d\udca8 Wind: ${weather.current.wind} mph\n\ud83c\udf27 Precipitation: ${weather.current.precip}"`
            if (weather.dest) {
              msg += `\n\n**Weather at Destination (${weather.dest.location})**\n\ud83c\udf21 ${weather.dest.temp}\u00b0F \u2014 ${weather.dest.condition}\n\ud83d\udca8 Wind: ${weather.dest.wind} mph\n\ud83c\udf27 Precipitation: ${weather.dest.precip}"`
            }
            const dangerous = [65, 75, 77, 82, 85, 86, 95, 96, 99]
            const currentDangerous = dangerous.includes(weather.current?.weathercode)
            const destDangerous = weather.dest && dangerous.includes(weather.dest?.weathercode)
            if (currentDangerous || destDangerous) msg += '\n\n\u26a0\ufe0f **Severe conditions detected. Drive cautiously and consider stopping if visibility is poor.**'
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
            setMessages(m => [...m, { role: 'assistant', content: '\ud83d\udcca Analyzing rate...' }])
            const res = await apiFetch('/api/rate-analysis', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ origin, destination: dest, miles: Number(miles), rate: Number(rate), equipment_type: equip, weight: action.weight || '' }),
            })
            const data = await res.json()
            if (data.error) {
              setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: 'Could not analyze rate: ' + data.error }; return u })
            } else {
              const emoji = data.verdict === 'excellent' ? '\u2b50' : data.verdict === 'good' ? '\ud83d\udfe2' : data.verdict === 'fair' ? '\ud83d\udfe1' : '\ud83d\udd34'
              const msg = `${emoji} **Rate Check: ${data.verdict === 'below_market' ? 'Below Market' : data.verdict === 'fair' ? 'Fair' : data.verdict === 'good' ? 'Good Deal' : 'Excellent'}** (Score: ${data.score}/100)\n\n` +
                `**${origin} \u2192 ${dest}** (${miles} mi)\n` +
                `\ud83d\udcb0 Your rate: **$${rate.toLocaleString()}** ($${data.offered_rpm}/mi)\n` +
                `\ud83d\udcc8 Market avg: **$${data.market_rpm.avg}/mi** ($${data.market_rpm.low}-$${data.market_rpm.high})\n` +
                `\ud83d\udca1 Suggested counter: **$${data.suggested_counter}/mi** ($${data.suggested_gross?.toLocaleString()})\n\n` +
                `\ud83d\udcca Est. profit: **$${data.profit_estimate.net.toLocaleString()}** after fuel ($${data.profit_estimate.fuel}), driver pay ($${data.profit_estimate.driver_pay || 0}), and expenses\n\n` +
                `${data.reasoning}\n\n` +
                `\ud83d\udde3\ufe0f **Counter script:** "${data.negotiation_script}"`
              setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: msg, rateAnalysis: data }; return u })
              speak(`This rate is ${data.verdict === 'below_market' ? 'below market' : data.verdict}. Score ${data.score} out of 100. Your rate is $${data.offered_rpm} per mile, market average is $${data.market_rpm.avg}. I suggest countering at $${data.suggested_counter} per mile.`)
            }
          } catch (err) {
            setMessages(m => { const u = [...m]; u[u.length - 1] = { role: 'assistant', content: 'Rate analysis failed. Try again.' }; return u })
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
    window.speechSynthesis.cancel()
    const clean = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/-?\d+\.\d{4,},\s*-?\d+\.\d{4,}/g, '')
      .replace(/\[.*?\]/g, '')
      .replace(/\*\*/g, '')
      .replace(/[#*_~`]/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (!clean) { onDone?.(); return }
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

  // ── VOICE RECOGNITION ──────────────────────────
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream
  const hasSpeechRecognition = !!(window.SpeechRecognition || window.webkitSpeechRecognition)

  const startListening = useCallback(() => {
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

      if (event.results[event.results.length - 1].isFinal) {
        setTimeout(() => {
          sendMessage(transcript)
          setVoiceText('')
        }, 300)
      }
    }

    recognition.onerror = (event) => {
      setListening(false)
      if (event.error === 'not-allowed') {
        showToast('error', 'Mic Blocked', 'Allow microphone access in browser settings')
      } else if (event.error === 'no-speech') {
        // Silently end
      }
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognition.start()
  }, [listening, unlockTTS, hasSpeechRecognition, isIOS, showToast])

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
    if (!userText || loading) return
    unlockTTS()
    setShowQuickActions(false)
    const newMessages = [...messages, { role: 'user', content: userText }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

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
      const targetPlan = { id: 'autonomous_fleet', name: 'Autonomous Fleet AI', price: '$399/truck/mo (founder pricing)' }
      try {
        const res = await apiFetch('/api/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planId: targetPlan.id, email: user?.email, userId: user?.id }),
        })
        const data = await res.json()
        if (data.url) {
          setMessages(m => [...m, { role: 'assistant', content: `**Subscribe to ${targetPlan.name} (${targetPlan.price})**\n\nI've generated your checkout link. Tap below to complete:\n\n[Subscribe Now](${data.url})\n\nIncludes a 14-day free trial. Cancel anytime. Everything included, no upsells.` }])
          speak(`Opening checkout for the Autonomous Fleet AI plan at 399 dollars per truck per month.`)
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
      const planPrices = { autonomous_fleet: '$399/truck/mo', autopilot: '$399/truck/mo', autopilot_ai: '$399/truck/mo' }
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
          const statusIcon = status === 'paid' ? '\u2705' : status === 'sent' ? '\ud83d\udce4' : '\ud83d\udcdd'
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
    }

    // Nearest truck stop
    if (/\b(nearest|closest|find\s*(me\s*)?(a\s*)?)(truck\s*stop|fuel|gas\s*station|love'?s|pilot|petro|ta\b|flying\s*j)\b/.test(lowerText) || /\bnear(by|est)?\s*truck\s*stop\b/.test(lowerText)) {
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
      setMessages(m => [...m, {
        role: 'assistant',
        content: replyText,
        actions,
      }])
      speak(replyText, () => {
        if (handsFree && hasSpeechRecognition) {
          setTimeout(() => startListening(), 400)
        }
      })
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
    { icon: DollarSign, label: 'Rate Check', msg: 'Is this rate good for my current load?' },
    { icon: MapPin, label: 'My Location', msg: 'Where am I right now? Share my current GPS location.' },
    { icon: Navigation, label: 'Next Stop', msg: "What's my next stop or delivery?" },
    { icon: Clock, label: 'Weather', msg: "What's the weather on my route?" },
    { icon: Clock, label: 'HOS Status', msg: 'How many driving hours do I have left today?' },
  ]

  const suggestions = activeLoads.length > 0
    ? [
        "What's my next stop?",
        'Submit a check call',
        'I just delivered',
        'How many hours do I have left?',
        'Nearest truck stop',
        "What's the weather on my route?",
        'Find me a reload',
        'Add fuel expense',
      ]
    : [
        'Find me the best loads right now',
        'Snap a rate con to book',
        'Show my revenue this month',
        'How many unpaid invoices do I have?',
        'Nearest truck stop',
        'Show my IFTA status',
        'Report a problem',
        'Help me get started',
      ]

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── OFFLINE INDICATOR ────────────────────────── */}
      {isOffline && (
        <div style={{ flexShrink: 0, background: '#ef4444', color: '#fff', textAlign: 'center', padding: '8px', fontSize: '13px', fontWeight: 600 }}>
          You're offline — messages will sync when reconnected
        </div>
      )}

      {/* ── PWA INSTALL BANNER ──────────────────────── */}
      {showInstallBanner && (
        <div style={{ flexShrink: 0, margin: '8px 16px 0', padding: '10px 14px', background: 'linear-gradient(135deg, rgba(240,165,0,0.1), rgba(0,212,170,0.06))', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ic icon={Download} size={16} color="var(--accent)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700 }}>Install Alex</div>
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
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* Empty state */}
        {messages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 16 }}>
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <button onClick={startListening}
                style={{ width: 80, height: 80, borderRadius: '50%', background: listening ? 'var(--danger)' : 'linear-gradient(135deg, rgba(240,165,0,0.15), rgba(0,212,170,0.1))', border: '2px solid ' + (listening ? 'var(--danger)' : 'rgba(240,165,0,0.3)'), display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px', cursor: 'pointer', transition: 'all 0.2s', animation: listening ? 'micPulse 1.5s ease-in-out infinite' : 'none', boxShadow: listening ? '0 0 30px rgba(239,68,68,0.3)' : '0 0 20px rgba(240,165,0,0.15)' }}>
                <Ic icon={listening ? Mic : Zap} size={32} color={listening ? '#fff' : 'var(--accent)'} />
              </button>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>
                {listening ? 'Listening...' : `Hey ${(profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]}, it's Alex`}
              </div>
              {listening ? (
                <div style={{ fontSize: 14, color: 'var(--text)', minHeight: 20, fontWeight: 600 }}>
                  {voiceText || 'Speak now...'}
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>
                    {activeLoads.length > 0
                      ? `${activeLoads[0].origin} \u2192 ${activeLoads[0].destination || activeLoads[0].dest} \u00b7 ${activeLoads[0].status}`
                      : 'Your AI dispatcher \u2014 tell me what you need'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 6, fontWeight: 600 }}>
                    <Ic icon={Mic} size={11} /> Tap to talk \u2014 or type below
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
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>Alex</span>
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
                    <span>{'\u2696\ufe0f'}</span> Weigh Stations Nearby
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
              ) : m.content}
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
      <div style={{ flexShrink: 0, padding: '6px 16px', display: 'flex', gap: 8, overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
        {quickActions.map(a => (
          <button key={a.label} onClick={() => { haptic('light'); if (a.msg === '__snap_ratecon__') { if (rateConInputRef.current) rateConInputRef.current.click() } else { sendMessage(a.msg) } }}
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
                setPendingUpload({ doc_type: 'other', load_id: activeLoads[0]?.id, prompt: 'Uploading document...' })
                handleDocUpload(file)
              }
              e.target.value = ''
            }} />
        </label>

        {/* Text input */}
        <div style={{ flex: 1, position: 'relative' }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            placeholder={gpsLocation ? `\ud83d\udccd ${gpsLocation} \u2014 Ask me anything...` : 'Tell me what you need...'}
            style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 12, padding: '11px 14px', color: 'var(--text)', fontSize: 16, fontFamily: "'DM Sans',sans-serif", outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        {/* Mic / Send button */}
        {input.trim() ? (
          <button onClick={() => { haptic('light'); sendMessage() }} disabled={loading}
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
            {voiceText || 'Speak now \u2014 "Find me a load from Dallas"'}
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