import { useState, useEffect, useMemo, useCallback } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  Package, DollarSign, Truck, MapPin, Clock, CheckCircle,
  ArrowRight, Navigation, AlertTriangle, X, ChevronDown, ChevronUp,
  Phone, Loader, Power, Radar
} from 'lucide-react'
import { Ic, haptic, fmt$, statusColor } from './shared'
import * as db from '../../lib/database'
import { apiFetch } from '../../lib/api'

export default function DriverHomeTab({ onNavigate, onOpenQ }) {
  const ctx = useCarrier() || {}
  const { user, profile, showToast } = useApp()
  const loads = ctx.loads || []
  const drivers = ctx.drivers || []

  // Track which loads Q is currently calling brokers for
  const [callingLoads, setCallingLoads] = useState({})
  // Uber-style popup: show first unseen offer as fullscreen overlay
  const [dismissedOffers, setDismissedOffers] = useState({})
  const [popupLoad, setPopupLoad] = useState(null)

  // Current driver record
  const myDriver = useMemo(() => {
    return drivers.find(d => d.user_id === user?.id)
      || drivers.find(d => (d.full_name || d.name || '') === (profile?.full_name || ''))
      || drivers[0]
  }, [drivers, user, profile])

  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]

  // Pay calculation helper
  const calcDriverPay = useCallback((gross, miles) => {
    if (!myDriver?.pay_model || !myDriver?.pay_rate) return null
    const rate = Number(myDriver.pay_rate) || 0
    if (myDriver.pay_model === 'percent') return gross * (rate / 100)
    if (myDriver.pay_model === 'permile') return miles * rate
    if (myDriver.pay_model === 'flat') return rate
    return null
  }, [myDriver])

  // ── ACTIVE LOAD (currently driving/picking up) ──
  const activeLoad = useMemo(() => {
    const priority = ['in transit', 'loaded', 'en route to pickup', 'at pickup', 'at delivery']
    for (const p of priority) {
      const found = loads.find(l => (l.status || '').toLowerCase() === p)
      if (found) return found
    }
    return null
  }, [loads])

  // ── LOAD OFFERS (dispatched by Q — waiting for Accept/Pass) ──
  const loadOffers = useMemo(() => {
    return loads.filter(l => {
      const s = (l.status || '').toLowerCase()
      return s === 'assigned to driver' || s === 'dispatched' || s === 'booked'
    })
  }, [loads])

  // ── EARNINGS (this week) ──
  const weekEarnings = useMemo(() => {
    const now = new Date()
    const weekStart = new Date(now)
    weekStart.setDate(now.getDate() - now.getDay())
    weekStart.setHours(0, 0, 0, 0)
    let total = 0, loadCount = 0
    loads.forEach(l => {
      const s = (l.status || '').toLowerCase()
      if (s !== 'delivered' && s !== 'invoiced' && s !== 'paid' && s !== 'settled') return
      const d = new Date(l.delivery_date || l.created_at || 0)
      if (d < weekStart) return
      const rev = l.gross || l.rate || 0
      const pay = l.driver_pay || calcDriverPay(Number(rev), l.miles || 0) || Number(rev) * 0.28
      total += pay
      loadCount++
    })
    return { total: Math.round(total * 100) / 100, loads: loadCount }
  }, [loads, calcDriverPay])

  // ── Pop up first unseen offer like Uber ──
  useEffect(() => {
    if (popupLoad) return // already showing one
    const unseen = loadOffers.find(l => {
      const lid = l.id || l.load_id || l.loadId
      return !dismissedOffers[lid] && !callingLoads[lid]
    })
    if (unseen) {
      setPopupLoad(unseen)
      haptic('success')
    }
  }, [loadOffers, dismissedOffers, callingLoads, popupLoad])

  // ── ACCEPT a load offer → Q calls the broker ──
  const acceptLoad = async (load) => {
    haptic('success')
    const lid = load.id || load.load_id || load.loadId
    const brokerPhone = load.broker_phone || load.brokerPhone || ''

    // Dismiss popup
    setPopupLoad(null)
    setDismissedOffers(prev => ({ ...prev, [lid]: true }))

    // Update status to show driver accepted
    if (ctx.updateLoadStatus) {
      await ctx.updateLoadStatus(lid, 'Driver Accepted')
    }

    // If we have broker phone, trigger Q to call broker and negotiate
    if (brokerPhone) {
      setCallingLoads(prev => ({ ...prev, [lid]: 'calling' }))
      try {
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
            driverName: profile?.full_name || firstName,
          }),
        })
        if (res.call_id) {
          setCallingLoads(prev => ({ ...prev, [lid]: 'in_progress' }))
          if (showToast) showToast('Q is calling the broker now', 'success')
        }
      } catch (err) {
        setCallingLoads(prev => ({ ...prev, [lid]: 'failed' }))
        if (showToast) showToast('Could not reach broker — try again', 'error')
      }
    } else {
      // No broker phone — just move to En Route
      if (ctx.updateLoadStatus) {
        await ctx.updateLoadStatus(lid, 'En Route to Pickup')
      }
      if (showToast) showToast('Load accepted — no broker phone on file', 'info')
    }
  }

  // ── READY TO DISPATCH TOGGLE ──
  // Reads/writes drivers.is_available — Q's matching pipeline only assigns loads to available drivers
  const isReady = !!(myDriver?.is_available)
  const [readyToggling, setReadyToggling] = useState(false)
  const toggleReady = useCallback(async () => {
    if (!myDriver?.id || readyToggling) return
    setReadyToggling(true)
    haptic('success')
    const next = !isReady
    try {
      // Try to grab GPS in background — non-blocking
      let coords = null
      if (next && navigator.geolocation) {
        coords = await new Promise(resolve => {
          navigator.geolocation.getCurrentPosition(
            p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
            () => resolve(null),
            { timeout: 4000, maximumAge: 60_000 }
          )
        })
      }
      const updates = {
        is_available: next,
        availability_status: next ? 'ready' : 'off_duty',
        last_location_lat: coords?.lat || null,
        last_location_lng: coords?.lng || null,
        last_location_updated: new Date().toISOString(),
      }
      // editDriver writes to DB AND updates local context state
      if (ctx.editDriver) {
        await ctx.editDriver(myDriver.id, updates)
      } else {
        await db.updateDriverAvailability(myDriver.id, updates)
      }
      if (showToast) {
        showToast(next ? 'success' : 'info',
          next ? 'You\'re ready' : 'Off duty',
          next ? 'Q is hunting for loads in your area' : 'Q won\'t send you load offers')
      }
    } catch (err) {
      if (showToast) showToast('error', 'Could not update', err?.message || 'Try again')
    } finally {
      setReadyToggling(false)
    }
  }, [myDriver, isReady, readyToggling, ctx, showToast])

  // ── PASS on a load offer ──
  const passLoad = async (load) => {
    haptic()
    const lid = load.id || load.load_id || load.loadId
    setPopupLoad(null)
    setDismissedOffers(prev => ({ ...prev, [lid]: true }))
    if (ctx.updateLoadStatus) {
      await ctx.updateLoadStatus(lid, 'Available')
    }
  }

  // ── Navigation helper ──
  const openMaps = (address) => {
    if (!address) return
    const encoded = encodeURIComponent(address)
    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    const url = isIOS ? `maps://maps.apple.com/?daddr=${encoded}` : `https://www.google.com/maps/dir/?api=1&destination=${encoded}`
    window.open(url, '_blank')
  }

  // Status text for active load
  const statusAction = (status) => {
    const s = (status || '').toLowerCase()
    if (s === 'en route to pickup' || s === 'dispatched') return 'Head to pickup'
    if (s === 'at pickup') return 'Confirm pickup'
    if (s === 'loaded' || s === 'in transit') return 'Delivering'
    if (s === 'at delivery') return 'Confirm delivery'
    return status
  }

  // Popup load data
  const pu = popupLoad
  const puGross = pu ? Number(pu.gross || pu.rate || 0) : 0
  const puMiles = pu ? Number(pu.miles || 0) : 0
  const puRpm = puMiles > 0 ? (puGross / puMiles).toFixed(2) : '—'
  const puPay = pu ? calcDriverPay(puGross, puMiles) : null
  const puOrigin = pu ? (pu.origin || '?').split(',')[0] : ''
  const puDest = pu ? (pu.destination || pu.dest || '?').split(',')[0] : ''
  const puLid = pu ? (pu.id || pu.load_id || pu.loadId) : null
  const puCallState = puLid ? callingLoads[puLid] : null

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>

      {/* ═══════════════════════════════════════════════════════════════
          UBER-STYLE POPUP — slides up from bottom when Q finds a load
          ═══════════════════════════════════════════════════════════════ */}
      {pu && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)',
          display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
          animation: 'fadeIn 0.2s ease',
        }}>
          {/* Top bar — Q badge */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0,
            padding: '20px', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), #f59e0b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(240,165,0,0.4)',
            }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: '#000', fontWeight: 800 }}>Q</span>
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Q found you a load</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                {pu.broker_name || 'Broker'} • {pu.equipment || 'Dry Van'}
              </div>
            </div>
          </div>

          {/* Main card — slides up */}
          <div style={{
            background: 'var(--bg)', borderRadius: '24px 24px 0 0',
            padding: '28px 24px 32px', animation: 'slideUp 0.35s ease',
          }}>
            {/* Route — massive */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', lineHeight: 1.1, letterSpacing: -0.5 }}>
                {puOrigin}
              </div>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                margin: '8px 0', color: 'var(--muted)',
              }}>
                <div style={{ width: 40, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 12, fontWeight: 700 }}>{puMiles} MI</span>
                <div style={{ width: 40, height: 1, background: 'var(--border)' }} />
              </div>
              <div style={{ fontSize: 28, fontWeight: 900, color: 'var(--text)', lineHeight: 1.1, letterSpacing: -0.5 }}>
                {puDest}
              </div>
            </div>

            {/* Pay / Rate / RPM — big numbers row */}
            <div style={{
              display: 'flex', justifyContent: 'space-around', marginBottom: 20,
              padding: '16px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 4 }}>RATE</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(puGross)}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 4 }}>RPM</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--text)', fontFamily: "'Bebas Neue',sans-serif" }}>${puRpm}</div>
              </div>
              {puPay !== null && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--success)', letterSpacing: 1, marginBottom: 4 }}>YOUR PAY</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: 'var(--success)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(puPay)}</div>
                </div>
              )}
            </div>

            {/* Pickup details */}
            {(pu.pickup_date || pu.broker_name) && (
              <div style={{
                display: 'flex', justifyContent: 'center', gap: 16,
                marginBottom: 20, fontSize: 11, color: 'var(--muted)',
              }}>
                {pu.pickup_date && <span>Pickup: {pu.pickup_date}</span>}
                {pu.broker_name && <span>Broker: {pu.broker_name}</span>}
              </div>
            )}

            {/* Q calling state */}
            {(puCallState === 'calling' || puCallState === 'in_progress') ? (
              <div style={{
                padding: '18px', borderRadius: 16,
                background: 'linear-gradient(135deg, rgba(240,165,0,0.1), rgba(240,165,0,0.03))',
                border: '2px solid rgba(240,165,0,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent), #f59e0b)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: 'pulse 1.5s infinite',
                }}>
                  <Ic icon={Phone} size={16} color="#000" />
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)' }}>Q is calling the broker</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>Negotiating your rate now...</div>
                </div>
              </div>
            ) : (
              /* ── ACCEPT / PASS — Uber style ── */
              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => passLoad(pu)}
                  style={{
                    flex: 1, padding: '18px', background: 'none',
                    border: '2px solid var(--border)', borderRadius: 16, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontFamily: "'DM Sans',sans-serif",
                  }}
                >
                  <Ic icon={X} size={20} color="var(--muted)" />
                  <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--muted)' }}>Pass</span>
                </button>
                <button
                  onClick={() => acceptLoad(pu)}
                  style={{
                    flex: 2, padding: '18px',
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    border: 'none', borderRadius: 16, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    fontFamily: "'DM Sans',sans-serif",
                    boxShadow: '0 6px 24px rgba(34,197,94,0.4)',
                  }}
                >
                  <Ic icon={CheckCircle} size={22} color="#fff" />
                  <span style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>Accept</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', WebkitOverflowScrolling: 'touch' }}>

        {/* ── HEADER: minimal greeting + earnings ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 0 12px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), #f59e0b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: '#000', fontWeight: 800 }}>Q</span>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, fontFamily: "'DM Sans',sans-serif" }}>
                Hey {firstName}
              </div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                {activeLoad ? 'You\'re on a load' : loadOffers.length > 0 ? `${loadOffers.length} load${loadOffers.length > 1 ? 's' : ''} waiting` : 'No loads right now'}
              </div>
            </div>
          </div>
          {weekEarnings.total > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)', fontFamily: "'Bebas Neue',sans-serif" }}>
                {fmt$(weekEarnings.total)}
              </div>
              <div style={{ fontSize: 9, color: 'var(--muted)' }}>this week</div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════
            READY TO DISPATCH — Big toggle (only when no active load)
            ══════════════════════════════════════════════════════════ */}
        {!activeLoad && (
          <button
            onClick={toggleReady}
            disabled={readyToggling}
            style={{
              width: '100%', marginBottom: 14, padding: '20px 18px',
              borderRadius: 18, border: 'none', cursor: readyToggling ? 'default' : 'pointer',
              background: isReady
                ? 'linear-gradient(135deg, #22c55e, #16a34a)'
                : 'var(--surface2)',
              boxShadow: isReady
                ? '0 10px 32px rgba(34,197,94,0.35), inset 0 1px 0 rgba(255,255,255,0.2)'
                : '0 2px 8px rgba(0,0,0,0.1)',
              display: 'flex', alignItems: 'center', gap: 14,
              fontFamily: "'DM Sans',sans-serif",
              transition: 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              opacity: readyToggling ? 0.7 : 1,
            }}
          >
            <div style={{
              width: 52, height: 52, borderRadius: '50%',
              background: isReady ? 'rgba(255,255,255,0.22)' : 'var(--surface)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: isReady ? 'pulse 2s ease-in-out infinite' : 'none',
              flexShrink: 0,
            }}>
              <Ic icon={isReady ? Radar : Power} size={26} color={isReady ? '#fff' : 'var(--muted)'} />
            </div>
            <div style={{ textAlign: 'left', flex: 1 }}>
              <div style={{
                fontSize: 18, fontWeight: 900, letterSpacing: 0.3,
                color: isReady ? '#fff' : 'var(--text)',
                fontFamily: "'Bebas Neue',sans-serif",
              }}>
                {isReady ? 'Q IS HUNTING' : 'TAP TO GO ONLINE'}
              </div>
              <div style={{
                fontSize: 11, marginTop: 2,
                color: isReady ? 'rgba(255,255,255,0.85)' : 'var(--muted)',
              }}>
                {isReady ? 'Searching loads near you — offers will pop up' : 'You won\'t get load offers while off duty'}
              </div>
            </div>
            {/* Toggle pill */}
            <div style={{
              width: 44, height: 26, borderRadius: 13,
              background: isReady ? 'rgba(255,255,255,0.3)' : 'var(--border)',
              display: 'flex', alignItems: 'center',
              padding: 3, flexShrink: 0,
              transition: 'background 0.3s ease',
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: '#fff',
                marginLeft: isReady ? 18 : 0,
                transition: 'margin-left 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }} />
            </div>
          </button>
        )}

        {/* ══════════════════════════════════════════════════════════
            ACTIVE LOAD — Big hero card when driver is on a load
            ══════════════════════════════════════════════════════════ */}
        {activeLoad && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(52,176,104,0.08), rgba(52,176,104,0.02))',
            border: '2px solid rgba(52,176,104,0.3)',
            borderRadius: 16, padding: '16px', marginBottom: 12,
            animation: 'fadeInUp 0.3s ease',
          }}>
            {/* Status badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: statusColor(activeLoad.status),
                boxShadow: `0 0 8px ${statusColor(activeLoad.status)}`,
                animation: 'pulse 2s infinite',
              }} />
              <span style={{ fontSize: 11, fontWeight: 700, color: statusColor(activeLoad.status), letterSpacing: 0.5 }}>
                {statusAction(activeLoad.status).toUpperCase()}
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace', marginLeft: 'auto' }}>
                {activeLoad.load_id || activeLoad.loadId || ''}
              </span>
            </div>

            {/* Route */}
            <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 8, lineHeight: 1.2 }}>
              {(activeLoad.origin || '?').split(',')[0]}
              <span style={{ color: 'var(--muted)', margin: '0 6px', fontSize: 14 }}>→</span>
              {(activeLoad.destination || activeLoad.dest || '?').split(',')[0]}
            </div>

            {/* Quick stats */}
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
              <span style={{ fontWeight: 700, color: 'var(--success)' }}>{fmt$(activeLoad.gross || activeLoad.rate || 0)}</span>
              <span>{activeLoad.miles || 0} mi</span>
              {activeLoad.miles > 0 && (
                <span>{fmt$(Number(activeLoad.gross || activeLoad.rate || 0) / activeLoad.miles)}/mi</span>
              )}
            </div>

            {/* Navigate button */}
            <button
              onClick={() => {
                haptic('success')
                const s = (activeLoad.status || '').toLowerCase()
                const dest = (s === 'en route to pickup' || s === 'dispatched' || s === 'at pickup')
                  ? activeLoad.origin
                  : (activeLoad.destination || activeLoad.dest)
                openMaps(dest)
              }}
              style={{
                width: '100%', padding: '14px', background: 'var(--success)',
                border: 'none', borderRadius: 12, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontFamily: "'DM Sans',sans-serif",
              }}
            >
              <Ic icon={Navigation} size={18} color="#fff" />
              <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Navigate</span>
            </button>

            {/* Update status */}
            <button
              onClick={() => { haptic(); onNavigate('loads') }}
              style={{
                width: '100%', padding: '10px', background: 'none',
                border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer',
                marginTop: 8, fontFamily: "'DM Sans',sans-serif",
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}
            >
              <Ic icon={ArrowRight} size={14} color="var(--muted)" />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>Update Status</span>
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            LOAD OFFERS — Uber-style Accept / Pass cards
            Q found these loads. Driver just picks.
            ══════════════════════════════════════════════════════════ */}
        {loadOffers.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10,
            }}>
              <div style={{
                width: 20, height: 20, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--accent), #f59e0b)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 10, color: '#000', fontWeight: 800 }}>Q</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 0.5 }}>
                Q FOUND {loadOffers.length === 1 ? 'A LOAD' : `${loadOffers.length} LOADS`} FOR YOU
              </span>
            </div>

            {loadOffers.map((load, idx) => {
              const gross = Number(load.gross || load.rate || 0)
              const miles = Number(load.miles || 0)
              const rpm = miles > 0 ? (gross / miles).toFixed(2) : '—'
              const driverPay = calcDriverPay(gross, miles)
              const originCity = (load.origin || '?').split(',')[0]
              const destCity = (load.destination || load.dest || '?').split(',')[0]

              return (
                <div key={load.id || load.load_id || idx} style={{
                  background: 'var(--surface)',
                  border: '2px solid var(--border)',
                  borderRadius: 16, padding: '16px', marginBottom: 10,
                  animation: `fadeInUp 0.3s ease ${idx * 0.08}s both`,
                }}>
                  {/* Route — big and bold */}
                  <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 6, lineHeight: 1.2 }}>
                    {originCity}
                    <span style={{ color: 'var(--muted)', margin: '0 6px', fontSize: 14 }}>→</span>
                    {destCity}
                  </div>

                  {/* Load details row */}
                  <div style={{
                    display: 'flex', gap: 12, fontSize: 12, color: 'var(--muted)',
                    marginBottom: 10, flexWrap: 'wrap', alignItems: 'center',
                  }}>
                    <span style={{ fontWeight: 700, color: 'var(--success)', fontSize: 14 }}>{fmt$(gross)}</span>
                    <span>{fmt$(rpm)}/mi</span>
                    <span>{miles} mi</span>
                    {load.equipment && (
                      <span style={{
                        background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4,
                        fontSize: 10, fontWeight: 600,
                      }}>{load.equipment}</span>
                    )}
                  </div>

                  {/* Pickup info */}
                  {(load.pickup_date || load.broker_name) && (
                    <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>
                      {load.pickup_date && (
                        <span><Ic icon={Clock} size={10} color="var(--muted)" /> Pickup: {load.pickup_date}</span>
                      )}
                      {load.broker_name && (
                        <span>Broker: {load.broker_name}</span>
                      )}
                    </div>
                  )}

                  {/* YOUR PAY — this is what the driver cares about */}
                  {driverPay !== null && (
                    <div style={{
                      background: 'rgba(52,176,104,0.06)', border: '1px solid rgba(52,176,104,0.15)',
                      borderRadius: 10, padding: '10px 12px', marginBottom: 12,
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)' }}>Your Pay</span>
                      <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)', fontFamily: "'Bebas Neue',sans-serif" }}>
                        {fmt$(driverPay)}
                      </span>
                    </div>
                  )}

                  {/* ── ACCEPT / PASS buttons or Calling state ── */}
                  {(() => {
                    const lid = load.id || load.load_id || load.loadId
                    const callState = callingLoads[lid]

                    // Q is calling the broker
                    if (callState === 'calling' || callState === 'in_progress') {
                      return (
                        <div style={{
                          padding: '14px', borderRadius: 12,
                          background: 'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(240,165,0,0.03))',
                          border: '2px solid rgba(240,165,0,0.3)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                        }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%',
                            background: 'linear-gradient(135deg, var(--accent), #f59e0b)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            animation: 'pulse 1.5s infinite',
                          }}>
                            <Ic icon={Phone} size={12} color="#000" />
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)' }}>
                              Q is calling the broker
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                              Negotiating rate — you'll be notified when it's booked
                            </div>
                          </div>
                        </div>
                      )
                    }

                    // Call failed — show retry
                    if (callState === 'failed') {
                      return (
                        <div style={{ display: 'flex', gap: 10 }}>
                          <button
                            onClick={() => passLoad(load)}
                            style={{
                              flex: 1, padding: '14px', background: 'none',
                              border: '2px solid var(--border)', borderRadius: 12, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              fontFamily: "'DM Sans',sans-serif",
                            }}
                          >
                            <Ic icon={X} size={16} color="var(--muted)" />
                            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>Pass</span>
                          </button>
                          <button
                            onClick={() => acceptLoad(load)}
                            style={{
                              flex: 2, padding: '14px',
                              background: 'linear-gradient(135deg, #ef4444, #dc2626)',
                              border: 'none', borderRadius: 12, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                              fontFamily: "'DM Sans',sans-serif",
                            }}
                          >
                            <Ic icon={Phone} size={18} color="#fff" />
                            <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Retry Call</span>
                          </button>
                        </div>
                      )
                    }

                    // Default: Accept / Pass
                    return (
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button
                          onClick={() => passLoad(load)}
                          style={{
                            flex: 1, padding: '14px', background: 'none',
                            border: '2px solid var(--border)', borderRadius: 12, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            fontFamily: "'DM Sans',sans-serif",
                          }}
                        >
                          <Ic icon={X} size={16} color="var(--muted)" />
                          <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--muted)' }}>Pass</span>
                        </button>
                        <button
                          onClick={() => acceptLoad(load)}
                          style={{
                            flex: 2, padding: '14px',
                            background: 'linear-gradient(135deg, var(--success), #22c55e)',
                            border: 'none', borderRadius: 12, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            fontFamily: "'DM Sans',sans-serif",
                            boxShadow: '0 4px 16px rgba(52,176,104,0.3)',
                          }}
                        >
                          <Ic icon={CheckCircle} size={18} color="#fff" />
                          <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>Accept</span>
                        </button>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════
            EMPTY STATE — No active load, no offers
            ══════════════════════════════════════════════════════════ */}
        {!activeLoad && loadOffers.length === 0 && (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: '48px 24px', textAlign: 'center',
          }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(135deg, rgba(240,165,0,0.15), rgba(240,165,0,0.05))',
              border: '2px solid rgba(240,165,0,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16,
            }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--accent)', fontWeight: 800 }}>Q</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>
              Q is finding loads for you
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 260 }}>
              When Q books a load that matches your lane, it'll show up here. Just accept and go.
            </div>
          </div>
        )}

        {/* ── DELIVERED LOADS needing docs ── */}
        {loads.filter(l => (l.status || '').toLowerCase() === 'delivered').length > 0 && (
          <button
            onClick={() => { haptic(); onNavigate('loads') }}
            style={{
              width: '100%', padding: '12px 14px',
              background: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.2)',
              borderRadius: 12, cursor: 'pointer', marginBottom: 10,
              display: 'flex', alignItems: 'center', gap: 10,
              fontFamily: "'DM Sans',sans-serif",
            }}
          >
            <Ic icon={AlertTriangle} size={16} color="#8b5cf6" />
            <div style={{ flex: 1, textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#8b5cf6' }}>Upload docs to get paid</div>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}>
                {loads.filter(l => (l.status || '').toLowerCase() === 'delivered').length} delivered load{loads.filter(l => (l.status || '').toLowerCase() === 'delivered').length > 1 ? 's' : ''} need BOL/POD
              </div>
            </div>
            <ArrowRight size={14} color="#8b5cf6" />
          </button>
        )}

        <div style={{ height: 80 }} />
      </div>
    </div>
  )
}
