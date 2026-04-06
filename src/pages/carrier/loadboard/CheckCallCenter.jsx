import { useState, useEffect } from 'react'
import { AlertTriangle, Navigation, Check, FileText, Phone, MessageCircle, MapPin, Clock, Calendar } from 'lucide-react'
import { Ic } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'

const CC_STATUS_OPTS = ['On Time','Running Late','At Stop','Delay — Weather','Delay — Traffic','Issues — Call Me']
const CC_STATUS_COLOR = {
  'On Time':           'var(--success)',
  'Running Late':      'var(--warning)',
  'At Stop':           'var(--accent2)',
  'Delay — Weather':   'var(--warning)',
  'Delay — Traffic':   'var(--warning)',
  'Issues — Call Me':  'var(--danger)',
}

function fmtTs(ts) {
  const d    = new Date(ts)
  const mon  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()]
  const time = d.toLocaleTimeString('en-US', { hour:'numeric', minute:'2-digit', hour12:true })
  return `${mon} ${d.getDate()} · ${time}`
}

function hoursAgo(ts) {
  const t = typeof ts === 'string' ? new Date(ts).getTime() : (ts || 0)
  const h = (Date.now() - t) / 3600000
  if (h < 1)  return `${Math.round(h * 60)}m ago`
  if (h < 24) return `${h.toFixed(1).replace('.0','')}h ago`
  return `${Math.floor(h / 24)}d ago`
}

function callStatus(calls) {
  if (!calls?.length) return 'none'
  const raw = calls[0].ts || calls[0].called_at
  const t = typeof raw === 'string' ? new Date(raw).getTime() : (raw || 0)
  const h = (Date.now() - t) / 3600000
  if (h > 4)  return 'overdue'
  if (h > 2)  return 'due'
  return 'recent'
}

function generateMsg(load, call) {
  const lines = [
    `Check Call — ${load.loadId} (${load.broker})`,
    `Location: ${call.location}`,
    `Time: ${fmtTs(Date.now())}`,
    `Status: ${call.status}`,
    `Driver: ${load.driver} · ${load.loadId}`,
    call.eta    ? `Delivery ETA: ${call.eta}` : `Delivery: ${load.delivery}`,
    call.notes  ? `Notes: ${call.notes}` : '',
    `Ref: ${load.refNum}`,
    `— Sent via Qivori AI`,
  ]
  return lines.filter(Boolean).join('\n')
}

function buildRouteSuggestions(load, lastCall) {
  const pts = []
  if (load?.origin) pts.push(load.origin.split(',')[0].trim())
  if (load?.dest || load?.destination) pts.push((load.dest || load.destination).split(',')[0].trim())
  if (lastCall?.location) pts.push(lastCall.location)
  // Add origin/dest full
  if (load?.origin) pts.push(load.origin)
  if (load?.dest || load?.destination) pts.push(load.dest || load.destination)
  return [...new Set(pts)].slice(0, 5)
}


export function CheckCallCenter() {
  const { showToast } = useApp()
  const { activeLoads, checkCalls, logCheckCall } = useCarrier()
  const [selLoad,    setSelLoad]    = useState(activeLoads[0]?.loadId || null)
  const [location,   setLocation]   = useState('')
  const [status,     setStatus]     = useState('On Time')
  const [eta,        setEta]        = useState('')
  const [notes,      setNotes]      = useState('')
  const [showMsg,    setShowMsg]    = useState(false)
  const [copied,     setCopied]     = useState(false)
  const [filterOver, setFilterOver] = useState(false)
  const [gpsLoading, setGpsLoading] = useState(false)
  const [brokerPhones, setBrokerPhones] = useState({}) // loadId → phone number

  const getPhoneLocation = () => {
    if (!navigator.geolocation) { showToast('','GPS Unavailable','Your browser does not support geolocation'); return }
    setGpsLoading(true)
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`, {
            headers: { 'Accept-Language': 'en' }
          })
          const data = await res.json()
          const addr = data.address || {}
          const city = addr.city || addr.town || addr.village || addr.county || ''
          const state = addr.state || ''
          const loc = [city, state].filter(Boolean).join(', ')
          setLocation(loc || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
          showToast('','Location Found', loc || 'GPS coordinates set')
        } catch {
          setLocation(`${latitude.toFixed(4)}, ${longitude.toFixed(4)}`)
          showToast('','GPS Location Set','Could not get city name, using coordinates')
        }
        setGpsLoading(false)
      },
      (err) => {
        setGpsLoading(false)
        const msgs = { 1:'Location permission denied — enable it in your browser settings', 2:'Could not determine location — try again', 3:'Location request timed out — try again' }
        showToast('','Location Error', msgs[err.code] || 'Failed to get location')
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    )
  }

  const load       = activeLoads.find(l => l.loadId === selLoad)
  const loadCalls  = load ? (checkCalls[load.loadId] || []) : []
  const generatedMsg = load ? generateMsg(load, { location, status, eta, notes }) : ''
  const lastCall   = loadCalls[0] || null
  const suggestions = load ? buildRouteSuggestions(load, lastCall) : []

  // Auto-fill location, ETA & broker phone when selecting a load
  useEffect(() => {
    if (!load) return
    const calls = checkCalls[load.loadId] || []
    if (calls.length > 0) {
      setLocation(calls[0].location || '')
    } else {
      setLocation(load.origin || '')
    }
    setEta(load.delivery || '')
    setStatus('On Time')
    setNotes('')
    setShowMsg(false)
    setCopied(false)
    // Pre-fill broker phone from rate con data if available
    if (load.brokerPhone && !brokerPhones[load.loadId]) {
      setBrokerPhones(p => ({ ...p, [load.loadId]: load.brokerPhone }))
    }
  }, [selLoad]) // eslint-disable-line react-hooks/exhaustive-deps

  const currentBrokerPhone = brokerPhones[load?.loadId] || load?.brokerPhone || ''

  const handleLog = () => {
    if (!load || !location.trim()) { showToast('','Missing Info','Enter a current location before logging'); return }
    logCheckCall(load.loadId, { location: location.trim(), status, eta, notes: notes.trim() })
    showToast('','Check Call Logged', `${load.loadId} · ${location} · ${status}`)
    setLocation('')
    setNotes('')
    setShowMsg(false)
    setCopied(false)
  }

  const handleCopy = () => {
    navigator.clipboard?.writeText(generatedMsg).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
    showToast('','Copied','Broker update message copied to clipboard')
  }

  const visibleLoads = filterOver
    ? activeLoads.filter(l => callStatus(checkCalls[l.loadId]) === 'overdue')
    : activeLoads

  const inp = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif", outline:'none', width:'100%', boxSizing:'border-box' }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'auto' }}>

      {/* LEFT: Load list */}
      <div style={{ width:260, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', background:'var(--surface)' }}>

        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:8 }}>CHECK CALLS</div>
          <button onClick={() => setFilterOver(f => !f)}
            style={{ width:'100%', padding:'6px 10px', fontSize:11, fontWeight:700, borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              background: filterOver ? 'rgba(239,68,68,0.12)' : 'var(--surface2)',
              color: filterOver ? 'var(--danger)' : 'var(--muted)',
              border: `1px solid ${filterOver ? 'rgba(239,68,68,0.3)' : 'var(--border)'}` }}>
            {filterOver ? <><AlertTriangle size={13} /> Showing Overdue Only</> : 'Show All Active Loads'}
          </button>
        </div>

        <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
          {visibleLoads.map(l => {
            const calls  = checkCalls[l.loadId] || []
            const cs     = callStatus(calls)
            const isSel  = selLoad === l.loadId
            const csColor = cs === 'overdue' ? 'var(--danger)' : cs === 'due' ? 'var(--warning)' : cs === 'recent' ? 'var(--success)' : 'var(--muted)'
            const csLabel = cs === 'overdue' ? 'OVERDUE' : cs === 'due' ? 'DUE' : cs === 'recent' ? 'RECENT' : '— NO CALLS'

            return (
              <div key={l.loadId} onClick={() => setSelLoad(l.loadId)}
                style={{ padding:'13px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                  background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.12s' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:4 }}>
                  <span style={{ fontSize:12, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)' }}>{l.loadId}</span>
                  <span style={{ fontSize:9, fontWeight:800, padding:'2px 6px', borderRadius:5, background:csColor+'15', color:csColor }}>{csLabel}</span>
                </div>
                <div style={{ fontSize:12, fontWeight:600, marginBottom:3 }}>
                  {l.origin?.split(',')[0]} → {l.dest?.split(',')[0]}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>
                  {l.driver} · {l.broker}
                </div>
                {calls.length > 0
                  ? <div style={{ fontSize:10, color:'var(--muted)' }}>Last call {hoursAgo(calls[0].ts || calls[0].called_at)} · {calls[0].location}</div>
                  : <div style={{ fontSize:10, color:'var(--muted)', fontStyle:'italic' }}>No check calls logged yet</div>
                }
              </div>
            )
          })}
          {visibleLoads.length === 0 && (
            <div style={{ padding:24, textAlign:'center', fontSize:12, color:'var(--muted)' }}>
              {filterOver ? 'No overdue check calls' : 'No active loads'}
            </div>
          )}
        </div>

        {/* Summary footer */}
        <div style={{ padding:'10px 16px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
          {[
            { label:'Overdue',   count: activeLoads.filter(l => callStatus(checkCalls[l.loadId]) === 'overdue').length, color:'var(--danger)'  },
            { label:'Due Soon',  count: activeLoads.filter(l => callStatus(checkCalls[l.loadId]) === 'due').length,     color:'var(--warning)' },
            { label:'Up to Date',count: activeLoads.filter(l => callStatus(checkCalls[l.loadId]) === 'recent').length,  color:'var(--success)' },
          ].map(s => (
            <div key={s.label} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:11, color:'var(--muted)' }}>{s.label}</span>
              <span style={{ fontSize:11, fontWeight:700, color:s.color }}>{s.count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* RIGHT: Detail + log form */}
      {load ? (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflowY:'auto' }}>

          {/* Header */}
          <div style={{ padding:'14px 22px', borderBottom:'1px solid var(--border)', background:'var(--surface)', flexShrink:0, display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ flex:1 }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:2 }}>
                {load.loadId} · {load.origin?.split(',')[0]} → {load.dest?.split(',')[0]}
              </div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>
                {load.driver} · {load.broker} · {load.miles} mi · Delivery: {load.delivery}
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>Last check call</div>
              <div style={{ fontSize:13, fontWeight:700, color: loadCalls.length ? 'var(--text)' : 'var(--muted)' }}>
                {loadCalls.length ? hoursAgo(loadCalls[0].ts || loadCalls[0].called_at) : 'Never'}
              </div>
            </div>
          </div>

          <div style={{ flex:1, overflowY:'auto', minHeight:0, display:'flex', gap:0 }}>

            {/* Log form */}
            <div style={{ width:340, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflow:'hidden' }}>
              <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:20, display:'flex', flexDirection:'column', gap:14 }}>

                {/* Overdue alert */}
                {callStatus(loadCalls) === 'overdue' && (
                  <div style={{ padding:'10px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:8, fontSize:12, color:'var(--danger)', display:'flex', gap:8, alignItems:'center' }}>
                    <span style={{ fontSize:18 }}><AlertTriangle size={18} /></span>
                    <span>Check call overdue — last update {hoursAgo(loadCalls[0]?.ts || loadCalls[0]?.called_at)}. Broker may be expecting an update.</span>
                  </div>
                )}

                <div style={{ fontSize:12, fontWeight:800, color:'var(--accent)', letterSpacing:1.5 }}>LOG CHECK CALL</div>

                {/* Location */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Current Location *</label>
                  <div style={{ display:'flex', gap:6 }}>
                    <input value={location} onChange={e => setLocation(e.target.value)}
                      placeholder="e.g. New Orleans, LA" style={{ ...inp, flex:1 }}/>
                    <button onClick={getPhoneLocation} disabled={gpsLoading}
                      style={{ flexShrink:0, padding:'8px 12px', background: gpsLoading ? 'rgba(240,165,0,0.15)' : 'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, cursor: gpsLoading ? 'wait' : 'pointer', color: gpsLoading ? 'var(--accent)' : 'var(--accent2)', fontSize:11, fontWeight:700, fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:5 }}>
                      <Navigation size={13} style={ gpsLoading ? { animation:'spin 1s linear infinite' } : {} } />
                      {gpsLoading ? 'Finding...' : 'GPS'}
                    </button>
                  </div>
                  {suggestions.length > 0 && (
                    <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginTop:6 }}>
                      {suggestions.map(s => (
                        <button key={s} onClick={() => setLocation(s)}
                          style={{ fontSize:10, padding:'3px 8px', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, cursor:'pointer', color:'var(--muted)', fontFamily:"'DM Sans',sans-serif" }}>
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Status */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Status</label>
                  <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                    {CC_STATUS_OPTS.map(s => (
                      <button key={s} onClick={() => setStatus(s)}
                        style={{ padding:'5px 10px', fontSize:11, fontWeight:600, borderRadius:8, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                          background: status === s ? CC_STATUS_COLOR[s]+'20' : 'var(--surface2)',
                          color:      status === s ? CC_STATUS_COLOR[s] : 'var(--muted)',
                          border:     `1px solid ${status === s ? CC_STATUS_COLOR[s]+'50' : 'var(--border)'}` }}>
                        {s}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ETA override */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>ETA (if changed)</label>
                  <input value={eta} onChange={e => setEta(e.target.value)}
                    placeholder={load.delivery || 'e.g. Mar 13 · 6:00 PM'} style={inp}/>
                </div>

                {/* Broker Phone */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>
                    Broker Phone {currentBrokerPhone ? <span style={{ color:'var(--success)', fontSize:10 }}> — from rate con</span> : <span style={{ color:'var(--warning)', fontSize:10 }}> — enter to enable text/call</span>}
                  </label>
                  <input value={currentBrokerPhone}
                    onChange={e => setBrokerPhones(p => ({ ...p, [load.loadId]: e.target.value }))}
                    placeholder="(555) 123-4567"
                    style={inp}/>
                </div>

                {/* Notes */}
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:5 }}>Notes</label>
                  <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3}
                    placeholder="Any issues, delays, or comments for broker…"
                    style={{ ...inp, resize:'vertical', lineHeight:1.5 }}/>
                </div>

                {/* Message preview toggle */}
                <button onClick={() => setShowMsg(m => !m)}
                  style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", textAlign:'left' }}>
                  {showMsg ? '▾ Hide' : '▸ Preview'} broker update message
                </button>

                {showMsg && (
                  <div style={{ background:'rgba(0,0,0,0.2)', border:'1px solid var(--border)', borderRadius:8, padding:12 }}>
                    <pre style={{ fontSize:11, color:'var(--text)', fontFamily:"'DM Sans',sans-serif", whiteSpace:'pre-wrap', margin:0, lineHeight:1.6 }}>
                      {generatedMsg}
                    </pre>
                    <button onClick={handleCopy}
                      style={{ marginTop:8, width:'100%', padding:'6px', background: copied ? 'rgba(34,197,94,0.12)' : 'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, fontSize:11, color: copied ? 'var(--success)' : 'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", fontWeight:600 }}>
                      {copied ? <><Check size={13} /> Copied!</> : <><FileText size={13} /> Copy to Clipboard</>}
                    </button>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div style={{ padding:16, borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:8, flexShrink:0 }}>
                <button className="btn btn-primary" style={{ width:'100%', fontSize:12, justifyContent:'center', padding:'11px 0' }} onClick={handleLog}>
                  <Phone size={13} /> Log Check Call
                </button>
                <div style={{ display:'flex', gap:6 }}>
                  {(() => {
                    const brokerNum = (currentBrokerPhone || '').replace(/[^0-9+]/g, '')
                    const smsHref = brokerNum
                      ? `sms:${brokerNum}${/iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(generatedMsg)}`
                      : `sms:${/iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?'}body=${encodeURIComponent(generatedMsg)}`
                    const telHref = brokerNum ? `tel:${brokerNum}` : '#'
                    return <>
                      <a href={smsHref}
                        style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px 0', fontSize:11, fontWeight:700, borderRadius:8, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.25)', color:'var(--success)', textDecoration:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}
                        onClick={() => { handleLog(); showToast('','SMS Opened','Check call logged + SMS ready to send') }}>
                        <MessageCircle size={13} /> Text Broker
                      </a>
                      <a href={telHref}
                        style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:6, padding:'9px 0', fontSize:11, fontWeight:700, borderRadius:8, background:'rgba(77,142,240,0.08)', border:'1px solid rgba(77,142,240,0.25)', color: brokerNum ? 'var(--accent3)' : 'var(--muted)', textDecoration:'none', cursor: brokerNum ? 'pointer' : 'default', fontFamily:"'DM Sans',sans-serif", opacity: brokerNum ? 1 : 0.5 }}
                        onClick={(e) => {
                          if (!brokerNum) { e.preventDefault(); showToast('','No Phone Number','Add broker phone to the load to enable calling'); return }
                          handleLog(); showToast('','Calling Broker','Check call logged + dialing ' + load.broker)
                        }}>
                        <Phone size={13} /> Call Broker
                      </a>
                    </>
                  })()}
                </div>
                <button className="btn btn-ghost" style={{ width:'100%', fontSize:11, padding:'7px 0' }} onClick={() => setShowMsg(m => !m)}>
                  <FileText size={13} /> {showMsg ? 'Hide' : 'Preview'} Message
                </button>
              </div>
            </div>

            {/* Call history */}
            <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:20, display:'flex', flexDirection:'column', gap:0 }}>
              <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:14 }}>
                CALL HISTORY · {loadCalls.length} LOGGED
              </div>

              {loadCalls.length === 0 && (
                <div style={{ textAlign:'center', padding:'40px 20px', color:'var(--muted)', fontSize:12 }}>
                  <div style={{ fontSize:32, marginBottom:8 }}><Phone size={32} /></div>
                  No check calls logged yet for this load.<br/>Log the first one to start tracking.
                </div>
              )}

              {loadCalls.map((call, idx) => {
                const sc = CC_STATUS_COLOR[call.status] || 'var(--muted)'
                return (
                  <div key={call.id} style={{ display:'flex', gap:14, position:'relative', paddingBottom:20 }}>
                    {idx < loadCalls.length - 1 && (
                      <div style={{ position:'absolute', left:9, top:22, bottom:0, width:2, background:'var(--border)' }}/>
                    )}
                    <div style={{ width:20, height:20, borderRadius:'50%', flexShrink:0, marginTop:2,
                      background: idx === 0 ? sc : 'var(--surface2)',
                      border:`2px solid ${idx === 0 ? sc : 'var(--border)'}`,
                      display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, zIndex:1,
                      color: idx === 0 ? '#000' : 'var(--muted)', fontWeight:800 }}>
                      {idx === 0 ? '●' : loadCalls.length - idx}
                    </div>
                    <div style={{ flex:1, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 14px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                        <div>
                          <span style={{ fontSize:12, fontWeight:700, color: idx === 0 ? 'var(--text)' : 'var(--muted)' }}><Ic icon={MapPin} /> {call.location}</span>
                          {idx === 0 && <span style={{ marginLeft:8, fontSize:10, color:'var(--accent)', fontWeight:700 }}>LATEST</span>}
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:6, background:sc+'15', color:sc }}>{call.status}</span>
                      </div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginBottom: call.notes ? 6 : 0 }}>
                        <Clock size={11} /> {fmtTs(call.ts || call.called_at)}
                        {call.eta && <span style={{ marginLeft:12 }}><Ic icon={Calendar} /> ETA: {call.eta}</span>}
                      </div>
                      {call.notes && (
                        <div style={{ fontSize:11, color:'var(--text)', marginTop:4, padding:'6px 10px', background:'rgba(255,255,255,0.03)', borderRadius:6, fontStyle:'italic' }}>
                          "{call.notes}"
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:8, color:'var(--muted)' }}>
          <div><Phone size={40} /></div>
          <div style={{ fontSize:13 }}>Select a load to log check calls</div>
        </div>
      )}
    </div>
  )
}
