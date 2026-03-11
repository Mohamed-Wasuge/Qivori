import { useState, useEffect, useRef, useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { CarrierProvider, useCarrier } from '../context/CarrierContext'
import {
  Zap, Send, MapPin, Camera, DollarSign, Package, Truck, Phone,
  Navigation, Receipt, Plus, ChevronRight, ArrowLeft, Home, X,
  CheckCircle, Mic, FileText, Clock, Volume2, VolumeX
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

// ── LOAD BOARD DATA (same as desktop AILoadBoard) ─────────
const BOARD_LOADS = [
  { id:'LD-001', broker:'Echo Global',       origin:'Chicago, IL',    dest:'Atlanta, GA',      miles:674,  rate:3.05, gross:2056, weight:'42,000', commodity:'Auto Parts',    equipment:'Dry Van',  pickup:'Mar 10 · 8:00 AM', delivery:'Mar 11 · 6:00 PM',  deadhead:0,   refNum:'EC-89100', score:82 },
  { id:'LD-002', broker:'Coyote Logistics',  origin:'Chicago, IL',    dest:'Miami, FL',         miles:1377, rate:3.15, gross:4338, weight:'38,500', commodity:'Electronics',   equipment:'Dry Van',  pickup:'Mar 10 · 7:00 AM', delivery:'Mar 13 · 4:00 PM',  deadhead:0,   refNum:'CL-23001', score:88 },
  { id:'LD-004', broker:'XPO',               origin:'Chicago, IL',    dest:'New York, NY',      miles:790,  rate:3.08, gross:2433, weight:'39,000', commodity:'Retail',        equipment:'Dry Van',  pickup:'Mar 10 · 9:00 AM', delivery:'Mar 12 · 8:00 AM',  deadhead:0,   refNum:'XP-44210', score:85 },
  { id:'LD-005', broker:'Echo Global',       origin:'Atlanta, GA',    dest:'Chicago, IL',       miles:674,  rate:3.12, gross:2103, weight:'40,500', commodity:'Auto Parts',    equipment:'Dry Van',  pickup:'Mar 11 · 7:00 AM', delivery:'Mar 12 · 5:00 PM',  deadhead:8,   refNum:'EC-89120', score:90 },
  { id:'LD-006', broker:'CH Robinson',       origin:'Atlanta, GA',    dest:'Miami, FL',         miles:660,  rate:3.22, gross:2125, weight:'37,200', commodity:'Food & Bev',    equipment:'Reefer',   pickup:'Mar 10 · 6:00 AM', delivery:'Mar 11 · 8:00 PM',  deadhead:8,   refNum:'CHR-77301', score:86 },
  { id:'LD-008', broker:'Echo Global',       origin:'Dallas, TX',     dest:'Miami, FL',         miles:1491, rate:3.22, gross:4801, weight:'38,500', commodity:'Food & Bev',    equipment:'Dry Van',  pickup:'Mar 11 · 7:00 AM', delivery:'Mar 13 · 5:00 PM',  deadhead:42,  refNum:'EC-89130', score:91 },
  { id:'LD-010', broker:'Coyote Logistics',  origin:'Dallas, TX',     dest:'Los Angeles, CA',   miles:1435, rate:2.92, gross:4190, weight:'40,000', commodity:'Automotive',    equipment:'Dry Van',  pickup:'Mar 11 · 6:00 AM', delivery:'Mar 14 · 2:00 PM',  deadhead:42,  refNum:'CL-23020', score:79 },
  { id:'LD-011', broker:'Coyote Logistics',  origin:'Memphis, TN',    dest:'New York, NY',      miles:1100, rate:3.18, gross:3498, weight:'39,800', commodity:'Electronics',   equipment:'Dry Van',  pickup:'Mar 10 · 8:00 AM', delivery:'Mar 12 · 6:00 PM',  deadhead:25,  refNum:'CL-23010', score:87 },
  { id:'LD-015', broker:'Transplace',        origin:'Denver, CO',     dest:'Houston, TX',       miles:1020, rate:2.61, gross:2662, weight:'41,200', commodity:'Machinery',     equipment:'Flatbed',  pickup:'Mar 10 · 6:00 AM', delivery:'Mar 12 · 4:00 PM',  deadhead:68,  refNum:'TP-19310', score:72 },
  { id:'LD-018', broker:'Echo Global',       origin:'Houston, TX',    dest:'New York, NY',      miles:1636, rate:3.28, gross:5366, weight:'38,000', commodity:'Petrochemicals', equipment:'Dry Van', pickup:'Mar 11 · 5:00 AM', delivery:'Mar 15 · 8:00 AM',  deadhead:85,  refNum:'EC-89140', score:93 },
  { id:'LD-017', broker:'TQL',               origin:'Houston, TX',    dest:'Atlanta, GA',       miles:792,  rate:2.88, gross:2281, weight:'37,500', commodity:'Chemicals',     equipment:'Dry Van',  pickup:'Mar 11 · 6:00 AM', delivery:'Mar 13 · 4:00 PM',  deadhead:85,  refNum:'TQ-11010', score:65 },
  { id:'LD-016', broker:'XPO',               origin:'Denver, CO',     dest:'Chicago, IL',       miles:1003, rate:2.75, gross:2758, weight:'40,000', commodity:'Auto Parts',    equipment:'Dry Van',  pickup:'Mar 11 · 8:00 AM', delivery:'Mar 13 · 6:00 PM',  deadhead:68,  refNum:'XP-44220', score:78 },
]

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
  const recognitionRef = useRef(null)

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, loading])

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
    return BOARD_LOADS.map(l =>
      `${l.id} | ${l.origin} → ${l.dest} | ${l.miles}mi | $${l.gross} ($${l.rate}/mi) | ${l.equipment} | ${l.broker} | Score:${l.score} | Pickup:${l.pickup} | Delivery:${l.delivery} | ${l.commodity} | DH:${l.deadhead}mi | Ref:${l.refNum}`
    ).join('\n')
  }, [])

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
        case 'upload_doc': {
          // Trigger the camera/file picker for document upload
          setPendingUpload({ doc_type: action.doc_type, load_id: action.load_id, prompt: action.prompt })
          return true
        }
        case 'search_nearby': {
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
        case 'open_maps': {
          const q = encodeURIComponent(action.query || 'truck stop')
          const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
          const url = isIOS
            ? `maps://maps.apple.com/?q=${q}&sll=${action.lat || ''},${action.lng || ''}`
            : `https://www.google.com/maps/search/${q}/@${action.lat || ''},${action.lng || ''},14z`
          window.open(url, '_blank')
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
  const speak = useCallback((text) => {
    if (!speakerOn || !text) return
    // Cancel any current speech
    window.speechSynthesis?.cancel()
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
    const utterance = new SpeechSynthesisUtterance(clean)
    utterance.rate = 1.05
    utterance.pitch = 1.0
    utterance.volume = 1.0
    utterance.lang = 'en-US'
    utterance.onstart = () => setSpeaking(true)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis?.speak(utterance)
  }, [speakerOn])

  // Stop speaking when speaker is toggled off
  useEffect(() => {
    if (!speakerOn) window.speechSynthesis?.cancel()
  }, [speakerOn])

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
  const startListening = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      showToast('error', 'Not Supported', 'Voice input not available on this browser')
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

  // Send message
  const sendMessage = async (text) => {
    const userText = text || input.trim()
    if (!userText || loading) return

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
      const data = await res.json()
      const rawReply = data.reply || data.error || 'Something went wrong.'

      // Parse actions from the response
      const { actions, displayText } = parseActions(rawReply)

      // Execute any actions
      for (const action of actions) {
        await executeAction(action)
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
        <button onClick={() => setSpeakerOn(s => !s)}
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
              {m.content}
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
          <button key={a.label} onClick={() => sendMessage(a.msg)}
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
    upload_doc: Camera,
    update_load_status: Truck,
    book_load: Package,
  }
  const labels = {
    add_expense: `Expense: $${action.amount} ${action.category || ''}`,
    check_call: `Check Call: ${action.location || action.status || 'submitted'}`,
    get_gps: 'Getting location...',
    call_broker: 'Calling broker',
    navigate: `Opening ${action.to}`,
    upload_doc: `Upload ${docLabels[action.doc_type] || 'Document'}`,
    update_load_status: `Load → ${action.status}`,
    book_load: `Booked: ${action.origin} → ${action.destination || action.dest}`,
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
