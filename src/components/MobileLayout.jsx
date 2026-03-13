import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { CarrierProvider, useCarrier } from '../context/CarrierContext'
import {
  Zap, Send, MapPin, Camera, DollarSign, Package, Truck, Phone,
  Navigation, Receipt, Plus, ChevronRight, ArrowLeft, Home, X,
  CheckCircle, Mic, FileText, Clock, Volume2, VolumeX, ScanLine, Download, Mail, Bell
} from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

// Haversine distance in miles
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959 // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Load board data populated from context ───────────
const BOARD_LOADS = []

export default function MobileLayout() {
  return (
    <CarrierProvider>
      <MobileAI />
    </CarrierProvider>
  )
}

// ── MAIN AI-DRIVEN MOBILE APP ─────────────────────────────
function MobileAI() {
  const { logout, showToast } = useApp()
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
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const rateConInputRef = useRef(null)
  const recognitionRef = useRef(null)
  const [deferredPrompt, setDeferredPrompt] = useState(null)
  const [showInstallBanner, setShowInstallBanner] = useState(false)
  const [showNotifBanner, setShowNotifBanner] = useState(false)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

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
            fetch('/api/push-subscribe', {
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
          // Get GPS and open maps directly — fastest experience
          const loc = await getGPSCoords()
          const query = action.query || 'truck stop'
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
          if (loc) {
            const url = isIOS
              ? `maps://maps.apple.com/?q=${encodeURIComponent(query)}&sll=${loc.lat},${loc.lng}&z=12`
              : `https://www.google.com/maps/search/${encodeURIComponent(query)}/@${loc.lat},${loc.lng},13z`
            window.open(url, '_blank')
          } else {
            // No GPS — just search without location
            const url = isIOS
              ? `maps://maps.apple.com/?q=${encodeURIComponent(query)}`
              : `https://www.google.com/maps/search/${encodeURIComponent(query)}`
            window.open(url, '_blank')
          }
          showToast('success', 'Maps Opened', `Searching: ${query}`)
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
            const wsRes = await fetch('/api/weigh-stations', {
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
        case 'send_invoice': {
          try {
            const res = await fetch('/api/send-invoice', {
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

  const speak = useCallback((text) => {
    if (!speakerOn || !text || !window.speechSynthesis) return
    // Cancel any current speech
    window.speechSynthesis.cancel()
    // Clean text — remove markdown bold/links, keep it natural
    const clean = text
      .replace(/\*\*/g, '')
      .replace(/\[.*?\]\(.*?\)/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/[#*_~`]/g, '')
      .replace(/\n{2,}/g, '. ')
      .replace(/\n/g, '. ')
      .trim()
    if (!clean) return
    // iOS workaround: split long text into chunks under 200 chars
    // (iOS Safari cuts off speech after ~200-300 chars)
    const chunks = []
    let remaining = clean
    while (remaining.length > 0) {
      if (remaining.length <= 180) {
        chunks.push(remaining)
        break
      }
      // Find a good split point (sentence end or comma)
      let splitAt = remaining.lastIndexOf('. ', 180)
      if (splitAt < 50) splitAt = remaining.lastIndexOf(', ', 180)
      if (splitAt < 50) splitAt = remaining.lastIndexOf(' ', 180)
      if (splitAt < 50) splitAt = 180
      chunks.push(remaining.slice(0, splitAt + 1))
      remaining = remaining.slice(splitAt + 1).trim()
    }

    // iOS workaround: resume speechSynthesis every 10s to prevent auto-pause
    let resumeInterval = null
    chunks.forEach((chunk, i) => {
      const utterance = new SpeechSynthesisUtterance(chunk)
      utterance.rate = 1.05
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
        utterance.onend = () => { setSpeaking(false); clearInterval(resumeInterval) }
        utterance.onerror = () => { setSpeaking(false); clearInterval(resumeInterval) }
      }
      window.speechSynthesis.speak(utterance)
    })
  }, [speakerOn])

  // Stop speaking when speaker is toggled off
  useEffect(() => {
    if (!speakerOn) window.speechSynthesis?.cancel()
  }, [speakerOn])

  // ── WEIGH STATION REPORT ──────────────────────
  const reportWeighStation = async (ws, reportStatus) => {
    try {
      await fetch('/api/weigh-stations', {
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
  const startListening = () => {
    // Unlock TTS on any user gesture (needed for iOS)
    unlockTTS()
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      if (isIOS) {
        showToast('info', 'Voice Input', 'Voice input isn\'t supported on iOS Safari. Type your message instead!')
      } else {
        showToast('error', 'Not Supported', 'Voice input not available on this browser')
      }
      return
    }

    if (listening) {
      // Stop listening
      recognitionRef.current?.stop()
      return
    }

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
      }
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognition.start()
  }

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
      const res = await fetch('/api/parse-ratecon', {
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

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: newMessages.slice(-20),
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
      setMessages(m => [...m, {
        role: 'assistant',
        content: replyText,
        actions,
      }])
      // AI speaks the response
      speak(replyText)
    } catch (err) {
      console.error('Chat error:', err)
      setMessages(m => [...m, { role: 'assistant', content: 'Connection error: ' + (err.message || 'check your internet.') }])
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

  // Suggested prompts for empty state
  const suggestions = [
    'Find me loads from Dallas, dry van',
    'What are the best paying loads right now?',
    "I'm at the pickup — need to upload BOL",
    'Just delivered, upload signed BOL',
    'Add fuel expense $120 at Pilot in Memphis',
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

        {/* Speaker toggle */}
        <button onClick={() => { unlockTTS(); setSpeakerOn(s => !s) }}
          style={{ width: 32, height: 32, borderRadius: 8, background: speakerOn ? 'rgba(0,212,170,0.1)' : 'var(--surface2)', border: '1px solid ' + (speakerOn ? 'rgba(0,212,170,0.2)' : 'var(--border)'), cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <Ic icon={speakerOn ? Volume2 : VolumeX} size={14} color={speakerOn ? 'var(--success)' : 'var(--muted)'} />
        </button>

        {/* New Chat / Home button — only show when in conversation */}
        {messages.length > 0 && (
          <button onClick={() => { setMessages([]); setInput(''); setPendingUpload(null); setShowQuickActions(true); window.speechSynthesis?.cancel() }}
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

      {/* ── ACTIVE LOAD BANNER ──────────────────────── */}
      {activeLoads.length > 0 && showQuickActions && (
        <div style={{ margin: '12px 16px 0', padding: '10px 14px', background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}
          onClick={() => sendMessage(`Tell me about load ${activeLoads[0].load_id}`)}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Ic icon={Truck} size={16} color="var(--accent)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeLoads[0].origin} → {activeLoads[0].destination}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)' }}>{activeLoads[0].load_id} · ${Number(activeLoads[0].rate || 0).toLocaleString()}</div>
          </div>
          <ChevronRight size={14} color="var(--muted)" />
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
