import { useState, useEffect, useMemo } from 'react'
import {
  Bell, BellOff, Bot, Radio, Flame, Clock, Zap, Check,
  BarChart2, Search, Target, Brain, Activity, TrendingUp,
  TrendingDown, DollarSign, MessageCircle, Save, Phone,
} from 'lucide-react'
import { Ic, S } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'

const DAT_API = import.meta.env.VITE_DAT_API_URL || ''

const DAT_EQUIP_OPTS = ['All', 'Dry Van', 'Reefer', 'Flatbed']

function scoreColor(s) {
  return s >= 80 ? 'var(--success)' : s >= 65 ? 'var(--accent)' : 'var(--danger)'
}

function ageLabel(postedAgo) {
  if (postedAgo < 1)  return 'Just posted'
  if (postedAgo < 60) return `${postedAgo}m ago`
  return `${Math.round(postedAgo/60)}h ago`
}

function urgencyStyle(score, postedAgo) {
  if (score >= 88 && postedAgo < 10) return { label:'BOOK NOW', bg:'rgba(239,68,68,0.12)', border:'rgba(239,68,68,0.35)', text:'var(--danger)' }
  if (score >= 78)                   return { label:'ACT FAST', bg:'rgba(240,165,0,0.10)', border:'rgba(240,165,0,0.30)', text:'var(--accent)' }
  return                                    { label:'GOOD LOAD', bg:'rgba(34,197,94,0.08)', border:'rgba(34,197,94,0.25)', text:'var(--success)' }
}


export function DATAlertBot() {
  const { addLoad, loads: carrierLoads, drivers: dbDrivers } = useCarrier()
  const { showToast } = useApp()

  const boardPayPct = useMemo(() => {
    const pctDrivers = (dbDrivers || []).filter(d => d.pay_model === 'percent' && d.pay_rate)
    if (pctDrivers.length > 0) return pctDrivers.reduce((s, d) => s + Number(d.pay_rate), 0) / pctDrivers.length / 100
    return 0 // fallback — per-driver rate preferred
  }, [dbDrivers])

  const [connected, setConnected]   = useState(false)
  const [datEnabled, setDatEnabled] = useState(false)
  const [alerts, setAlerts]         = useState([])
  const [dismissed, setDismissed]   = useState(new Set())
  const [booked, setBooked]         = useState(new Set())
  const [minScore, setMinScore]     = useState(72)
  const [equip, setEquip]           = useState('All')
  const [selAlert, setSelAlert]     = useState(null)
  const [sound, setSound]           = useState(true)
  const [searchNow, setSearchNow]   = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)

  // SSE connection
  useEffect(() => {
    if (!DAT_API) return
    const es = new EventSource(`${DAT_API}/api/dat/alerts/stream`)

    es.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data)
        if (msg.type === 'connected') {
          setConnected(true)
          setDatEnabled(msg.datEnabled)
        }
        if (msg.type === 'alerts' && Array.isArray(msg.alerts)) {
          setAlerts(prev => {
            // Prepend new, dedupe by id, cap at 40
            const ids = new Set(prev.map(a => a.id))
            const fresh = msg.alerts.filter(a => !ids.has(a.id))
            if (fresh.length > 0 && sound) {
              // Visual flash indicator — no actual audio API needed
              document.title = `${fresh.length} Hot Load${fresh.length > 1 ? 's' : ''}! — Qivori`
              setTimeout(() => { document.title = 'Qivori AI' }, 4000)
            }
            return [...fresh, ...prev].slice(0, 40)
          })
          // Auto-select first new alert
          setSelAlert(a => a || msg.alerts[0]?.id || null)
        }
      } catch { /* SSE parse error — skip frame */ }
    }

    es.onerror = () => setConnected(false)

    return () => es.close()
  }, [sound])

  // Manual search
  const handleSearch = async () => {
    if (!DAT_API) {
      showToast('', 'DAT API', 'DAT API not connected — connect in Settings to see live loads')
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    try {
      const resp = await fetch(`${DAT_API}/api/dat/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment: equip === 'All' ? undefined : equip }),
      })
      const data = await resp.json()
      if (data.loads) {
        const fresh = data.loads.map(l => ({ ...l, id: `manual-${l.refNum}-${Date.now()}`, ts: Date.now(), msg: '' }))
        setAlerts(prev => {
          const ids = new Set(prev.map(a => a.id))
          return [...fresh.filter(f => !ids.has(f.id)), ...prev].slice(0, 40)
        })
        if (fresh.length > 0) setSelAlert(fresh[0].id)
        showToast('', 'DAT Search', `${fresh.length} loads pulled · top scores shown first`)
      }
    } catch (err) {
      showToast('', 'Search Failed', 'Search unavailable — please try again later')
    }
    setSearchLoading(false)
  }

  const handleBook = (alert) => {
    addLoad({
      origin: alert.origin, dest: alert.dest, miles: alert.miles,
      rate: alert.rate, gross: alert.gross, weight: alert.weight,
      commodity: alert.commodity, pickup: alert.pickup, delivery: alert.delivery,
      broker: alert.broker, refNum: alert.refNum, driver: '',
    })
    setBooked(s => new Set([...s, alert.id]))
    showToast('', 'Load Booked from DAT', `${alert.origin?.split(',')[0]} → ${alert.dest?.split(',')[0]} · $${alert.gross?.toLocaleString()} · added to dispatch queue`)
  }

  const visibleAlerts = alerts.filter(a =>
    !dismissed.has(a.id) &&
    a.score >= minScore &&
    (equip === 'All' || a.equipment === equip)
  )

  const selLoad = visibleAlerts.find(a => a.id === selAlert) || visibleAlerts[0] || null
  const hotCount = visibleAlerts.filter(a => a.score >= 80).length

  const pill = { fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:6, letterSpacing:0.5 }
  const inputStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 10px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none' }

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', overflow:'auto' }}>

      {/* Header */}
      <div style={{ padding:'12px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)', display:'flex', alignItems:'center', gap:12, flexShrink:0 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:2, lineHeight:1 }}>
              DAT <span style={{ color:'var(--accent)' }}>ALERT</span> BOT
            </div>
            {/* Live indicator */}
            <div style={{ display:'flex', alignItems:'center', gap:5 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background: connected ? 'var(--success)' : 'var(--danger)',
                boxShadow: connected ? '0 0 6px var(--success)' : 'none',
                animation: connected ? 'pulse 2s infinite' : 'none' }}/>
              <span style={{ fontSize:10, color: connected ? 'var(--success)' : 'var(--muted)', fontWeight:700 }}>
                {connected ? (datEnabled ? 'DAT LIVE' : 'DEMO MODE') : 'CONNECTING…'}
              </span>
            </div>
            {hotCount > 0 && (
              <span style={{ ...pill, background:'rgba(239,68,68,0.15)', color:'var(--danger)', border:'1px solid rgba(239,68,68,0.3)' }}>
                <Flame size={13} /> {hotCount} HOT
              </span>
            )}
          </div>
          <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
            {datEnabled ? 'Connected to DAT Keystone API · Scanning every 90 sec' : 'Demo mode — add DAT_CLIENT_ID + DAT_CLIENT_SECRET to .env to go live'}
          </div>
        </div>
        {/* Controls */}
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select value={equip} onChange={e => setEquip(e.target.value)} style={inputStyle}>
            {DAT_EQUIP_OPTS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:11, color:'var(--muted)' }}>Min score</span>
            <input type="range" min={50} max={90} step={5} value={minScore} onChange={e => setMinScore(Number(e.target.value))}
              style={{ width:70, accentColor:'var(--accent)', cursor:'pointer' }}/>
            <span style={{ fontSize:12, fontWeight:700, color:'var(--accent)', minWidth:20 }}>{minScore}</span>
          </div>
          <button onClick={() => setSound(s => !s)}
            style={{ padding:'6px 10px', fontSize:13, background:'var(--surface2)', border:`1px solid ${sound ? 'var(--accent)' : 'var(--border)'}`, borderRadius:8, cursor:'pointer', color: sound ? 'var(--accent)' : 'var(--muted)' }}>
            {sound ? <Bell size={14} /> : <BellOff size={14} />}
          </button>
          <button onClick={handleSearch} disabled={searchLoading}
            style={{ padding:'7px 16px', fontSize:12, fontWeight:700, background:'var(--accent)', border:'none', borderRadius:8, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", opacity: searchLoading ? 0.7 : 1 }}>
            {searchLoading ? 'Scanning…' : <><Ic icon={Search} size={13} /> Scan DAT Now</>}
          </button>
        </div>
      </div>

      <div style={{ flex:1, display:'flex', overflow:'auto' }}>

        {/* LEFT: Alert feed */}
        <div style={{ width:380, flexShrink:0, borderRight:'1px solid var(--border)', overflowY:'auto', display:'flex', flexDirection:'column' }}>

          {/* Bot status banner */}
          <div style={{ padding:'10px 16px', background:'rgba(240,165,0,0.05)', borderBottom:'1px solid var(--border)', display:'flex', gap:10, alignItems:'flex-start' }}>
            <div style={{ fontSize:20, flexShrink:0 }}><Bot size={20} /></div>
            <div style={{ fontSize:11, color:'var(--text)', lineHeight:1.6 }}>
              {visibleAlerts.length === 0
                ? connected
                  ? 'Watching DAT… first batch arrives in ~3 seconds. I\'ll flag every load scoring ' + minScore + '+ and explain why.'
                  : 'Connecting to server… make sure Qivori backend is running on port 4000.'
                : `Tracking ${visibleAlerts.length} load${visibleAlerts.length !== 1 ? 's' : ''} · ${hotCount} score 80+ · auto-refreshing every 90 sec`
              }
            </div>
          </div>

          {visibleAlerts.length === 0 && connected && (
            <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:'var(--muted)', padding:20 }}>
              <div><Radio size={36} /></div>
              <div style={{ fontSize:12, textAlign:'center' }}>Scanning DAT for loads above score {minScore}…<br/>Hit "Scan DAT Now" for an instant pull.</div>
            </div>
          )}

          {visibleAlerts.map(alert => {
            const urg  = urgencyStyle(alert.score, alert.postedAgo)
            const isSel = selAlert === alert.id
            const isB  = booked.has(alert.id)
            const sc   = scoreColor(alert.score)
            return (
              <div key={alert.id} onClick={() => setSelAlert(alert.id)}
                style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : urg.text}`,
                  background: isB ? 'rgba(255,255,255,0.02)' : isSel ? 'rgba(240,165,0,0.05)' : 'transparent',
                  cursor:'pointer', opacity: isB ? 0.5 : 1, transition:'all 0.15s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:5 }}>
                  <div>
                    <div style={{ fontSize:12, fontWeight:800, color: isSel ? 'var(--accent)' : 'var(--text)' }}>
                      {alert.origin?.split(',')[0]} → {alert.dest?.split(',')[0]}
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{alert.broker} · {alert.equipment} · {alert.miles} mi</div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:3 }}>
                    <span style={{ ...pill, background:sc+'18', color:sc, border:`1px solid ${sc}30` }}>{alert.score}</span>
                    {isB && <span style={{ ...pill, background:'rgba(34,197,94,0.15)', color:'var(--success)' }}>BOOKED</span>}
                  </div>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center' }}>
                    <span style={{ fontSize:12, fontWeight:800, color:'var(--accent)' }}>${alert.rate?.toFixed(2)}/mi</span>
                    <span style={{ fontSize:12, fontWeight:700 }}>${alert.gross?.toLocaleString()}</span>
                  </div>
                  <div style={{ display:'flex', gap:6, alignItems:'center' }}>
                    <span style={{ ...pill, background:urg.bg, color:urg.text, border:`1px solid ${urg.border}` }}>{urg.label}</span>
                  </div>
                </div>
                <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>
                  <Clock size={11} /> {ageLabel(alert.postedAgo)} · {alert.deadhead} mi deadhead
                </div>
              </div>
            )
          })}
        </div>

        {/* RIGHT: Detail + bot message */}
        {selLoad ? (
          <div style={{ flex:1, overflowY:'auto', minHeight:0, display:'flex', flexDirection:'column' }}>

            {/* Load header */}
            <div style={{ padding:'18px 24px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'flex-start', gap:16, marginBottom:12 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:1, lineHeight:1, marginBottom:4 }}>
                    {selLoad.origin?.split(',')[0]} → {selLoad.dest?.split(',')[0]}
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)', display:'flex', gap:8, flexWrap:'wrap' }}>
                    <span>{selLoad.miles} mi</span>
                    <span>·</span>
                    <span>{selLoad.equipment}</span>
                    <span>·</span>
                    <span>{selLoad.weight} lbs</span>
                    <span>·</span>
                    <span>{selLoad.commodity}</span>
                  </div>
                </div>
                <div style={{ textAlign:'center', background:scoreColor(selLoad.score)+'15', border:`2px solid ${scoreColor(selLoad.score)}`, borderRadius:14, padding:'8px 18px' }}>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:34, color:scoreColor(selLoad.score), lineHeight:1 }}>{selLoad.score}</div>
                  <div style={{ fontSize:9, fontWeight:800, color:scoreColor(selLoad.score), letterSpacing:1 }}>AI SCORE</div>
                </div>
              </div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {[
                  `${selLoad.pickup}`,
                  `${selLoad.delivery}`,
                  `${selLoad.refNum}`,
                  `${selLoad.deadhead} mi deadhead`,
                  `Posted ${ageLabel(selLoad.postedAgo)}`,
                ].map(tag => (
                  <span key={tag} style={{ fontSize:11, padding:'4px 10px', background:'var(--surface2)', borderRadius:6 }}>{tag}</span>
                ))}
              </div>
            </div>

            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>

              {/* AI Bot Message */}
              {selLoad.msg && (
                <div style={{ background:'rgba(240,165,0,0.05)', border:'1px solid rgba(240,165,0,0.25)', borderRadius:12, padding:16 }}>
                  <div style={{ display:'flex', gap:10, alignItems:'flex-start' }}>
                    <div style={{ width:32, height:32, borderRadius:10, background:'rgba(240,165,0,0.15)', border:'1px solid rgba(240,165,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}><Bot size={20} /></div>
                    <div>
                      <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:1, marginBottom:6 }}>QIVORI AI · LOAD ANALYSIS</div>
                      {selLoad.msg.split('\n').map((line, i) => (
                        <div key={i} style={{ fontSize:12, lineHeight:1.7, color: i === 0 ? 'var(--text)' : 'var(--muted)', fontWeight: i === 0 ? 700 : 400 }}>{line}</div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Quick economics */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:10 }}>
                {[
                  { l:'Gross',    v:`$${selLoad.gross?.toLocaleString()}`,     c:'var(--accent)'  },
                  { l:'Rate/mi',  v:`$${selLoad.rate?.toFixed(2)}`,            c:'var(--text)'    },
                  { l:'Est. Fuel',v:`−$${Math.round(selLoad.miles/6.9*3.85).toLocaleString()}`, c:'var(--danger)' },
                  { l:'Est. Net', v:`$${Math.round(selLoad.gross - selLoad.miles/6.9*3.85 - selLoad.gross*boardPayPct).toLocaleString()}`, c:'var(--success)' },
                ].map(k => (
                  <div key={k.l} style={{ background:'var(--surface2)', borderRadius:10, padding:'10px 12px', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', fontWeight:600, marginBottom:3 }}>{k.l}</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:k.c }}>{k.v}</div>
                  </div>
                ))}
              </div>

              {/* Urgency + book */}
              {!booked.has(selLoad.id) ? (() => {
                const urg = urgencyStyle(selLoad.score, selLoad.postedAgo)
                return (
                  <div style={{ background:urg.bg, border:`1px solid ${urg.border}`, borderRadius:12, padding:18 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                      <div>
                        <div style={{ fontSize:15, fontWeight:800, color:urg.text }}>{urg.label}</div>
                        <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>
                          {selLoad.score >= 88
                            ? 'Top-tier load — high-score loads on this lane disappear in minutes'
                            : selLoad.score >= 78
                            ? 'Strong load — good rate and trusted broker. Move quickly.'
                            : 'Solid option — consider countering for an extra $0.05–0.10/mi before booking'}
                        </div>
                      </div>
                      <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:40, color:urg.text, lineHeight:1 }}>{selLoad.score}</span>
                    </div>
                    <div style={{ display:'flex', gap:10 }}>
                      <button onClick={() => handleBook(selLoad)} className="btn btn-primary"
                        style={{ flex:1, justifyContent:'center', padding:'12px', fontSize:14 }}>
                        <Zap size={13} /> Book This Load →
                      </button>
                      <button onClick={() => setDismissed(s => new Set([...s, selLoad.id]))}
                        style={{ padding:'12px 16px', fontSize:13, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, color:'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                        Pass
                      </button>
                    </div>
                  </div>
                )
              })() : (
                <div style={{ background:'rgba(34,197,94,0.07)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:12, padding:20, textAlign:'center' }}>
                  <div style={{ marginBottom:6 }}><Check size={28} /></div>
                  <div style={{ fontSize:14, fontWeight:700, color:'var(--success)' }}>Load Booked</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>Added to dispatch queue · Assign a driver to complete booking</div>
                </div>
              )}

              {/* All alerts summary */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={BarChart2} /> This Session</div>
                <div style={{ padding:'10px 18px', display:'flex', gap:24 }}>
                  {[
                    { l:'Loads Scanned',  v: alerts.length },
                    { l:'Above Score',    v: visibleAlerts.length },
                    { l:'Hot (80+)',   v: hotCount },
                    { l:'Booked',         v: booked.size },
                    { l:'Dismissed',      v: dismissed.size },
                  ].map(s => (
                    <div key={s.l} style={{ textAlign:'center' }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color:'var(--accent)' }}>{s.v}</div>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          </div>
        ) : (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10, color:'var(--muted)' }}>
            <div><Bot size={48} /></div>
            <div style={{ fontSize:14, fontWeight:700, color:'var(--text)' }}>DAT Alert Bot</div>
            <div style={{ fontSize:12, textAlign:'center', maxWidth:320 }}>
              I scan DAT every 90 seconds and flag every load scoring {minScore}+.<br/>
              Hit "Scan DAT Now" for an instant pull or wait for the first auto-alert.
            </div>
            <button onClick={handleSearch} disabled={searchLoading}
              style={{ marginTop:10, padding:'10px 24px', fontSize:13, fontWeight:700, background:'var(--accent)', border:'none', borderRadius:8, color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              {searchLoading ? 'Scanning…' : <><Ic icon={Search} size={13} /> Scan DAT Now</>}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}


export function RateNegotiation() {
  const { showToast } = useApp()
  const ctx = useCarrier() || {}
  const loads = ctx.loads || []
  const activeLoads = ctx.activeLoads || []
  const [form, setForm] = useState({ origin: '', destination: '', miles: '', rate: '', equipment_type: 'Dry Van', weight: '' })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [history, setHistory] = useState(() => { try { return JSON.parse(localStorage.getItem('qivori_rate_history') || '[]') } catch { return [] } })
  const [showHistory, setShowHistory] = useState(false)
  const [copiedScript, setCopiedScript] = useState(false)
  const autoFill = (load) => { const gross = load.gross || load.gross_pay || load.rate || 0; setForm({ origin: load.origin || '', destination: load.dest || load.destination || '', miles: String(load.miles || ''), rate: String(gross || ''), equipment_type: load.equipment || 'Dry Van', weight: String(load.weight || '').replace(/[^0-9]/g, '') }); setResult(null) }
  const analyze = async () => {
    if (!form.origin || !form.destination || !form.miles || !form.rate) { showToast('error', 'Missing Info', 'Fill in origin, destination, miles, and rate'); return }
    setLoading(true); setResult(null)
    try {
      const res = await apiFetch('/api/rate-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ origin: form.origin, destination: form.destination, miles: Number(form.miles), rate: Number(form.rate), equipment_type: form.equipment_type, weight: form.weight }) })
      const data = await res.json()
      if (data.error) { showToast('error', 'Analysis Failed', data.error) }
      else { setResult(data); const entry = { ...data, origin: form.origin, destination: form.destination, miles: form.miles, rate: form.rate, equipment: form.equipment_type, timestamp: Date.now() }; const nh = [entry, ...history].slice(0, 20); setHistory(nh); try { localStorage.setItem('qivori_rate_history', JSON.stringify(nh)) } catch {} }
    } catch { showToast('error', 'Error', 'Could not analyze rate. Try again.') }
    setLoading(false)
  }
  const copyScript = () => { if (!result?.negotiation_script) return; navigator.clipboard?.writeText(result.negotiation_script); setCopiedScript(true); showToast('success', 'Copied!', 'Counter-offer script copied to clipboard'); setTimeout(() => setCopiedScript(false), 2000) }
  const VC = { below_market: { label: 'BELOW MARKET', color: 'var(--danger)', emoji: '\u{1F534}', bg: 'rgba(239,68,68,0.08)' }, fair: { label: 'FAIR RATE', color: 'var(--accent)', emoji: '\u{1F7E1}', bg: 'rgba(240,165,0,0.08)' }, good: { label: 'GOOD DEAL', color: 'var(--success)', emoji: '\u{1F7E2}', bg: 'rgba(34,197,94,0.08)' }, excellent: { label: 'EXCELLENT', color: 'var(--success)', emoji: '\u{2B50}', bg: 'rgba(34,197,94,0.12)' } }
  const inpS = { background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", outline: 'none', width: '100%' }
  return (
    <div style={S.page}>
      <div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 2 }}>RATE <span style={{ color: 'var(--accent)' }}>NEGOTIATION AI</span></div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Know if a rate is fair and get counter-offer scripts</div>
      </div>
      {(activeLoads?.length > 0 || loads?.length > 0) && <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11, color: 'var(--muted)', alignSelf: 'center' }}>Quick fill:</span>
        {[...(activeLoads || []), ...(loads || [])].slice(0, 5).map(l => <button key={l.id} onClick={() => autoFill(l)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>{(l.origin || '').split(',')[0]} &rarr; {(l.dest || l.destination || '').split(',')[0]}</button>)}
      </div>}
      <div style={S.panel}>
        <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Target} /> Rate Check</div>
          <button onClick={() => setShowHistory(!showHistory)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, background: showHistory ? 'rgba(240,165,0,0.12)' : 'var(--surface2)', border: '1px solid var(--border)', color: showHistory ? 'var(--accent)' : 'var(--muted)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}><Ic icon={Clock} size={11} /> History ({history.length})</button>
        </div>
        <div style={{ padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Origin</label><input value={form.origin} onChange={e => setForm(f => ({ ...f, origin: e.target.value }))} placeholder="Chicago, IL" style={inpS} /></div>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Destination</label><input value={form.destination} onChange={e => setForm(f => ({ ...f, destination: e.target.value }))} placeholder="Atlanta, GA" style={inpS} /></div>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Miles</label><input type="number" value={form.miles} onChange={e => setForm(f => ({ ...f, miles: e.target.value }))} placeholder="716" style={inpS} /></div>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Rate (Gross $)</label><input type="number" value={form.rate} onChange={e => setForm(f => ({ ...f, rate: e.target.value }))} placeholder="1850" style={inpS} /></div>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Equipment</label><select value={form.equipment_type} onChange={e => setForm(f => ({ ...f, equipment_type: e.target.value }))} style={{ ...inpS, cursor: 'pointer' }}><option value="Dry Van">Dry Van</option><option value="Reefer">Reefer</option><option value="Flatbed">Flatbed</option><option value="Step Deck">Step Deck</option><option value="Power Only">Power Only</option></select></div>
            <div><label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Weight (lbs)</label><input type="number" value={form.weight} onChange={e => setForm(f => ({ ...f, weight: e.target.value }))} placeholder="42000" style={inpS} /></div>
          </div>
          <button onClick={analyze} disabled={loading} style={{ marginTop: 16, width: '100%', padding: '12px 20px', fontSize: 14, fontWeight: 700, borderRadius: 10, border: 'none', cursor: loading ? 'wait' : 'pointer', fontFamily: "'DM Sans',sans-serif", background: loading ? 'var(--surface2)' : 'var(--accent)', color: loading ? 'var(--muted)' : '#000', transition: 'all 0.2s' }}>{loading ? 'Analyzing Rate...' : 'Analyze Rate'}</button>
        </div>
      </div>
      {result && (() => { const vc = VC[result.verdict] || VC.fair; return (<>
        <div style={{ ...S.panel, background: vc.bg, borderColor: vc.color + '30' }}><div style={{ padding: 20, textAlign: 'center' }}>
          <div style={{ fontSize: 36, marginBottom: 4 }}>{vc.emoji}</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2, color: vc.color }}>{vc.label}</div>
          <div style={{ position: 'relative', width: 200, height: 110, margin: '16px auto 0' }}>
            <svg viewBox="0 0 200 110" width="200" height="110"><path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="var(--surface2)" strokeWidth="12" strokeLinecap="round" /><path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={result.score >= 70 ? 'var(--success)' : result.score >= 45 ? 'var(--accent)' : 'var(--danger)'} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(result.score / 100) * 251.2} 251.2`} style={{ transition: 'stroke-dasharray 1s ease' }} /></svg>
            <div style={{ position: 'absolute', bottom: 4, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, lineHeight: 1, color: result.score >= 70 ? 'var(--success)' : result.score >= 45 ? 'var(--accent)' : 'var(--danger)' }}>{result.score}</div><div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, letterSpacing: 1 }}>SCORE</div></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 16 }}>
            <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>Your Rate</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: vc.color }}>${result.offered_rpm}/mi</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>Market Avg</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--accent2)' }}>${result.market_rpm.avg}/mi</div></div>
            <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>Suggested</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--success)' }}>${result.suggested_counter}/mi</div></div>
          </div>
        </div></div>
        <div style={S.panel}><div style={S.panelHead}><div style={S.panelTitle}><Ic icon={BarChart2} /> Market Comparison</div></div><div style={{ padding: 16 }}><div style={{ position: 'relative', height: 40, background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden', marginBottom: 8 }}><div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(result.market_rpm.low / (result.market_rpm.high * 1.3)) * 100}%`, right: `${(1 - result.market_rpm.high / (result.market_rpm.high * 1.3)) * 100}%`, background: 'rgba(77,142,240,0.12)', borderRadius: 4 }} /><div style={{ position: 'absolute', top: 4, bottom: 4, left: `${Math.min(95, Math.max(5, (result.offered_rpm / (result.market_rpm.high * 1.3)) * 100))}%`, width: 4, borderRadius: 2, background: vc.color, transform: 'translateX(-50%)' }} /><div style={{ position: 'absolute', top: 4, bottom: 4, left: `${(result.market_rpm.avg / (result.market_rpm.high * 1.3)) * 100}%`, width: 2, borderRadius: 1, background: 'var(--accent2)', opacity: 0.6, transform: 'translateX(-50%)' }} /></div><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)' }}><span>Low ${result.market_rpm.low}/mi</span><span>Avg ${result.market_rpm.avg}/mi</span><span>High ${result.market_rpm.high}/mi</span></div></div></div>
        <div style={S.panel}><div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Brain} /> AI Analysis</div></div><div style={{ padding: 16, fontSize: 13, lineHeight: 1.7, color: 'var(--text)' }}>{result.reasoning}</div></div>
        {result.factors && result.factors.length > 0 && <div style={S.panel}><div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Activity} /> Rate Factors</div></div><div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>{result.factors.map((f, i) => { const ic = f.impact === 'positive' ? 'var(--success)' : f.impact === 'negative' ? 'var(--danger)' : 'var(--accent)'; const Imp = f.impact === 'positive' ? TrendingUp : f.impact === 'negative' ? TrendingDown : Activity; return (<div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface2)', borderRadius: 8 }}><div style={{ width: 32, height: 32, borderRadius: 8, background: ic + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic icon={Imp} size={14} color={ic} /></div><div style={{ flex: 1 }}><div style={{ fontSize: 12, fontWeight: 700 }}>{f.name}</div><div style={{ fontSize: 11, color: 'var(--muted)' }}>{f.detail}</div></div><span style={S.badge(ic)}>{f.impact.toUpperCase()}</span></div>) })}</div></div>}
        <div style={S.panel}><div style={S.panelHead}><div style={S.panelTitle}><Ic icon={DollarSign} /> Profit Breakdown</div></div><div style={{ padding: 16 }}><div style={{ display: 'flex', gap: 20, alignItems: 'center' }}><div style={{ width: 120, height: 120, flexShrink: 0, borderRadius: '50%', position: 'relative', background: (() => { const p = result.profit_estimate; const t = p.gross || 1; let o = 0; const s = []; const a = (v, c) => { const pc = (v / t) * 100; s.push(`${c} ${o}% ${o + pc}%`); o += pc }; a(p.fuel, '#ef4444'); a(p.insurance, '#f59e0b'); a(p.maintenance, '#8b5cf6'); a(p.tires || 0, '#ec4899'); a(p.truck_payment || 0, '#6366f1'); a(p.driver_pay || 0, '#f97316'); a(Math.max(0, p.net), '#22c55e'); return `conic-gradient(${s.join(', ')})` })() }}><div style={{ position: 'absolute', inset: 20, borderRadius: '50%', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: result.profit_estimate.net >= 0 ? 'var(--success)' : 'var(--danger)' }}>${result.profit_estimate.net.toLocaleString()}</div><div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 700 }}>NET</div></div></div><div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>{[{ l: 'Fuel', v: result.profit_estimate.fuel, c: '#ef4444' }, { l: 'Insurance', v: result.profit_estimate.insurance, c: '#f59e0b' }, { l: 'Maintenance', v: result.profit_estimate.maintenance, c: '#8b5cf6' }, { l: 'Tires', v: result.profit_estimate.tires || 0, c: '#ec4899' }, { l: 'Truck Pmt', v: result.profit_estimate.truck_payment || 0, c: '#6366f1' }, { l: 'Driver Pay', v: result.profit_estimate.driver_pay || 0, c: '#f97316' }, { l: 'Net Profit', v: result.profit_estimate.net, c: '#22c55e' }].map(it => <div key={it.l} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}><div style={{ width: 10, height: 10, borderRadius: 2, background: it.c, flexShrink: 0 }} /><span style={{ flex: 1, color: 'var(--muted)' }}>{it.l}</span><span style={{ fontWeight: 700, fontFamily: 'monospace' }}>${it.v.toLocaleString()}</span></div>)}</div></div></div></div>
        <div style={S.panel}><div style={S.panelHead}><div style={S.panelTitle}><Ic icon={MessageCircle} /> Counter-Offer Script</div><button onClick={copyScript} style={{ fontSize: 11, padding: '4px 12px', borderRadius: 6, background: copiedScript ? 'rgba(34,197,94,0.12)' : 'var(--accent)', border: 'none', color: copiedScript ? 'var(--success)' : '#000', cursor: 'pointer', fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }}>{copiedScript ? 'Copied!' : 'Copy Script'}</button></div><div style={{ padding: 16 }}><div style={{ fontSize: 13, lineHeight: 1.8, padding: 14, background: 'var(--surface2)', borderRadius: 8, borderLeft: '3px solid var(--accent)', fontStyle: 'italic', color: 'var(--text)' }}>&ldquo;{result.negotiation_script}&rdquo;</div><div style={{ display: 'flex', gap: 8, marginTop: 12 }}><button onClick={copyScript} className="btn btn-primary" style={{ flex: 1, fontSize: 12 }}><Ic icon={Save} size={12} /> Copy Counter Script</button><button onClick={() => showToast('', 'Suggested Counter', '$' + (result.suggested_gross || 0).toLocaleString() + ' ($' + result.suggested_counter + '/mi)')} className="btn btn-ghost" style={{ flex: 1, fontSize: 12 }}><Ic icon={Phone} size={12} /> Call Broker</button></div></div></div>
      </>) })()}
      {showHistory && history.length > 0 && <div style={S.panel}><div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Clock} /> Analysis History</div><button onClick={() => { setHistory([]); localStorage.removeItem('qivori_rate_history') }} style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: 'var(--danger)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>Clear</button></div><div style={{ maxHeight: 300, overflowY: 'auto' }}>{history.map((h, i) => { const hvc = VC[h.verdict] || VC.fair; return (<div key={i} onClick={() => { setForm({ origin: h.origin || '', destination: h.destination || '', miles: String(h.miles || ''), rate: String(h.rate || ''), equipment_type: h.equipment || 'Dry Van', weight: '' }); setResult(h); setShowHistory(false) }} style={{ ...S.row, gap: 10 }}><div style={{ width: 32, height: 32, borderRadius: 8, background: hvc.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{hvc.emoji}</div><div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(h.origin || '').split(',')[0]} &rarr; {(h.destination || '').split(',')[0]}</div><div style={{ fontSize: 10, color: 'var(--muted)' }}>${Number(h.rate || 0).toLocaleString()} &middot; ${h.offered_rpm}/mi &middot; Score: {h.score}</div></div><span style={S.badge(hvc.color)}>{hvc.label}</span></div>) })}</div></div>}
    </div>
  )
}


export function RateBadge({ rpm, equipment, onClick, compact }) {
  const mktAvg = { 'Dry Van': 2.50, 'Reefer': 2.90, 'Flatbed': 3.10, 'Step Deck': 3.30, 'Power Only': 2.10, 'Tanker': 3.30 }
  const avg = mktAvg[equipment] || 2.50
  const rpmNum = Number(rpm) || 0
  if (rpmNum <= 0) return null
  let color, label, emoji
  if (rpmNum >= avg * 1.1) { color = 'var(--success)'; label = 'Good'; emoji = '\u{1F7E2}' }
  else if (rpmNum >= avg * 0.92) { color = 'var(--accent)'; label = 'Fair'; emoji = '\u{1F7E1}' }
  else { color = 'var(--danger)'; label = 'Below'; emoji = '\u{1F534}' }
  if (compact) return <span onClick={onClick} title={label + ' rate'} style={{ fontSize: 10, cursor: onClick ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', gap: 2 }}>{emoji}</span>
  return (<div onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 6, background: color + '12', border: '1px solid ' + color + '25', cursor: onClick ? 'pointer' : 'default', fontSize: 10, fontWeight: 700, color }}>{emoji} {label} &middot; ${rpmNum.toFixed(2)}/mi{onClick && <span style={{ fontSize: 9, opacity: 0.7 }}> Analyze</span>}</div>)
}
