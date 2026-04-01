import { useState, useEffect, useMemo } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  Package, DollarSign, TrendingUp, Truck, ChevronRight,
  MapPin, Clock, CheckCircle, ArrowRight, Upload, Camera,
  AlertTriangle, Navigation, Shield, FileText, Activity,
  ThumbsUp, ThumbsDown, Clipboard, Eye
} from 'lucide-react'
import { Ic, haptic, fmt$, statusColor, QInsightCard, getQSystemState } from './shared'
import { calculateCrashRisk } from '../../lib/crashRiskEngine'
import * as db from '../../lib/database'

export default function DriverHomeTab({ onNavigate, onOpenQ }) {
  const ctx = useCarrier() || {}
  const { user, profile } = useApp()
  const loads = ctx.loads || []
  const activeLoads = ctx.activeLoads || []
  const drivers = ctx.drivers || []
  const expenses = ctx.expenses || []
  const company = ctx.company || {}

  // Find current driver record
  const myDriver = useMemo(() => {
    return drivers.find(d => d.user_id === user?.id)
      || drivers.find(d => (d.full_name || d.name || '') === (profile?.full_name || ''))
      || drivers[0]
  }, [drivers, user, profile])

  const firstName = (profile?.full_name || user?.user_metadata?.full_name || 'Driver').split(' ')[0]

  // Time-based greeting
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

  // Current active load (most recent dispatched/in-transit)
  const currentLoad = useMemo(() => {
    const priority = ['in transit', 'loaded', 'en route to pickup', 'at pickup', 'at delivery', 'dispatched']
    for (const p of priority) {
      const found = loads.find(l => (l.status || '').toLowerCase() === p)
      if (found) return found
    }
    return activeLoads[0] || null
  }, [loads, activeLoads])

  // Delivered loads needing docs
  const deliveredLoads = loads.filter(l => {
    const s = (l.status || '').toLowerCase()
    return s === 'delivered' || s === 'at delivery'
  })

  // Completed loads (for earnings)
  const completedLoads = loads.filter(l => {
    const s = (l.status || '').toLowerCase()
    return s === 'delivered' || s === 'invoiced' || s === 'paid' || s === 'settled'
  })

  // Earnings calculation using driver's pay model
  const earnings = useMemo(() => {
    let total = 0, weekTotal = 0
    const now = new Date()
    const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay()); weekStart.setHours(0, 0, 0, 0)

    completedLoads.forEach(l => {
      const rev = l.gross || l.rate || 0
      const miles = l.miles || 0
      let pay = l.driver_pay || 0
      if (!pay && myDriver?.pay_model && myDriver?.pay_rate) {
        const rate = Number(myDriver.pay_rate) || 0
        if (myDriver.pay_model === 'percent') pay = rev * (rate / 100)
        else if (myDriver.pay_model === 'permile') pay = miles * rate
        else if (myDriver.pay_model === 'flat') pay = rate
      }
      if (!pay) pay = rev * 0.28
      total += pay
      const d = new Date(l.delivery_date || l.created_at || 0)
      if (d >= weekStart) weekTotal += pay
    })
    return { total: Math.round(total * 100) / 100, week: Math.round(weekTotal * 100) / 100 }
  }, [completedLoads, myDriver])

  // Compliance alerts
  const complianceAlerts = useMemo(() => {
    if (!myDriver) return []
    const alerts = []
    const now = new Date()
    const check = (field, label) => {
      if (!myDriver[field]) return
      const exp = new Date(myDriver[field])
      const days = Math.ceil((exp - now) / 86400000)
      if (days < 0) alerts.push({ text: `${label} EXPIRED`, color: 'var(--danger)', urgent: true })
      else if (days <= 30) alerts.push({ text: `${label} expires in ${days} days`, color: '#f59e0b', urgent: days <= 7 })
    }
    check('cdl_expiration', 'CDL')
    check('medical_card_expiration', 'Medical Card')
    check('drug_test_date', 'Drug Test')
    return alerts
  }, [myDriver])

  // Next action for the driver
  const nextAction = useMemo(() => {
    if (deliveredLoads.length > 0) return { text: 'Upload BOL/POD for delivered load', action: () => onNavigate('loads'), icon: Upload, color: '#8b5cf6' }
    if (currentLoad) {
      const s = (currentLoad.status || '').toLowerCase()
      if (s === 'dispatched') return { text: `Head to pickup: ${currentLoad.origin || '?'}`, action: () => onNavigate('loads'), icon: Navigation, color: 'var(--accent)' }
      if (s === 'en route to pickup' || s === 'at pickup') return { text: 'Confirm pickup & mark loaded', action: () => onNavigate('loads'), icon: Package, color: 'var(--accent)' }
      if (s === 'loaded' || s === 'in transit') return { text: `Deliver to: ${currentLoad.destination || currentLoad.dest || '?'}`, action: () => onNavigate('loads'), icon: Truck, color: 'var(--success)' }
      if (s === 'at delivery') return { text: 'Confirm delivery & upload POD', action: () => onNavigate('loads'), icon: CheckCircle, color: 'var(--success)' }
    }
    return { text: 'READY TO ROLL', subtext: 'Tap to ask Q for your next load', action: () => onOpenQ?.('Do I have any new loads?'), icon: Truck, color: 'var(--accent)', isReady: true }
  }, [currentLoad, deliveredLoads, onNavigate, onOpenQ])

  // AI Safety score for this driver
  const safetyScore = useMemo(() => {
    if (!myDriver) return null
    try {
      const vehicles = ctx.vehicles || []
      const vehicle = vehicles.find(v =>
        v.assigned_driver === myDriver.id || v.driver_name === (myDriver.full_name || myDriver.name)
      )
      return calculateCrashRisk(myDriver, { vehicle, load: currentLoad ? {
        weight: parseFloat(currentLoad.weight) || 0,
        miles: parseFloat(currentLoad.miles) || 0,
        origin: currentLoad.origin,
        destination: currentLoad.destination || currentLoad.dest,
      } : undefined })
    } catch { return null }
  }, [myDriver, currentLoad, ctx.vehicles])

  // Dispatched loads awaiting driver acceptance
  const dispatchedLoads = loads.filter(l => {
    const s = (l.status || '').toLowerCase()
    return s === 'assigned to driver' || s === 'dispatched'
  })

  // Accept a dispatched load
  const acceptLoad = async (load) => {
    haptic('success')
    const lid = load.id || load.load_id || load.loadId
    if (ctx.updateLoadStatus) {
      await ctx.updateLoadStatus(lid, 'En Route to Pickup')
    }
  }

  // Pay model display
  const payModelText = myDriver?.pay_model === 'percent' ? `${myDriver.pay_rate}% of gross`
    : myDriver?.pay_model === 'permile' ? `$${Number(myDriver.pay_rate || 0).toFixed(2)}/mile`
    : myDriver?.pay_model === 'flat' ? `$${Number(myDriver.pay_rate || 0).toFixed(0)} flat/load`
    : '28% of gross (default)'

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', WebkitOverflowScrolling: 'touch' }}>

        {/* ── Q DRIVER GREETING ── */}
        <div style={{ padding: '20px 0 12px', animation: 'fadeInUp 0.4s ease' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 48, height: 48, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent), #f59e0b)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'qGlow 3s ease-in-out infinite',
              boxShadow: '0 4px 16px rgba(240,165,0,0.3)',
            }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5, lineHeight: 1.2 }}>
                {greeting}, {firstName}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                {dateStr}
              </div>
              {company.name && (
                <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, marginTop: 1, letterSpacing: 0.5 }}>
                  {company.name}
                </div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>
                {activeLoads.length > 0 ? `${activeLoads.length} active` : 'No loads'} · {completedLoads.length} done
              </div>
            </div>
          </div>
        </div>

        {/* ── AI SAFETY SCORE ── */}
        {safetyScore && (
          <div style={{
            background: `${safetyScore.color}10`, border: `1px solid ${safetyScore.color}30`,
            borderRadius: 14, padding: '12px', marginBottom: 10, animation: 'fadeInUp 0.4s ease 0.06s both',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 48, height: 48, borderRadius: 12,
              background: `${safetyScore.color}20`, border: `2px solid ${safetyScore.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: safetyScore.color, fontWeight: 800 }}>
                {safetyScore.score}
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                <Ic icon={Shield} size={12} color={safetyScore.color} />
                <span style={{ fontSize: 10, fontWeight: 700, color: safetyScore.color, letterSpacing: 1 }}>SAFETY SCORE</span>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                {safetyScore.level === 'MINIMAL' || safetyScore.level === 'LOW'
                  ? 'You\'re clear — safe to drive'
                  : safetyScore.level === 'MODERATE'
                  ? 'Moderate risk — drive carefully'
                  : 'High risk — consider rest before driving'}
              </div>
              {safetyScore.recommendations?.length > 0 && safetyScore.score >= 30 && (
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
                  {safetyScore.recommendations[0]?.action}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── DISPATCHED LOADS — ACCEPT/REVIEW ── */}
        {dispatchedLoads.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(52,176,104,0.05))',
            border: '1px solid rgba(240,165,0,0.25)', borderRadius: 14,
            padding: '12px', marginBottom: 10, animation: 'fadeInUp 0.4s ease 0.07s both',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Ic icon={Clipboard} size={12} color="var(--accent)" />
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1 }}>
                NEW DISPATCH{dispatchedLoads.length > 1 ? 'ES' : ''} — REVIEW & ACCEPT
              </span>
            </div>
            {dispatchedLoads.slice(0, 3).map(load => {
              const loadId = load.load_id || load.loadId || ''
              const gross = load.gross || load.rate || 0
              const miles = load.miles || 0
              const rpm = miles > 0 ? (gross / miles).toFixed(2) : '—'
              return (
                <div key={load.id || loadId} style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
                  padding: '10px', marginBottom: 6,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--accent)', fontFamily: 'monospace', fontWeight: 700 }}>{loadId}</span>
                    {load.equipment && <span style={{ fontSize: 9, color: 'var(--muted)', background: 'var(--surface2)', padding: '2px 6px', borderRadius: 4 }}>{load.equipment}</span>}
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>
                    {load.origin || '?'} → {load.destination || load.dest || '?'}
                  </div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--muted)', marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ color: 'var(--success)', fontWeight: 700 }}>{fmt$(gross)}</span>
                    <span>{fmt$(rpm)}/mi</span>
                    <span>{miles} mi</span>
                    {load.pickup_date && <span>{load.pickup_date}</span>}
                  </div>
                  {/* Driver pay estimate */}
                  {myDriver?.pay_model && myDriver?.pay_rate && (
                    <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700, marginBottom: 8 }}>
                      Your pay: {fmt$(
                        myDriver.pay_model === 'percent' ? gross * (Number(myDriver.pay_rate) / 100)
                        : myDriver.pay_model === 'permile' ? miles * Number(myDriver.pay_rate)
                        : Number(myDriver.pay_rate)
                      )} ({payModelText})
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => acceptLoad(load)} style={{
                      flex: 1, padding: '10px', background: 'var(--success)',
                      border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    }}>
                      <Ic icon={ThumbsUp} size={14} color="#fff" />
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>Accept & Go</span>
                    </button>
                    <button onClick={() => { haptic(); onNavigate('loads') }} style={{
                      padding: '10px 14px', background: 'var(--surface2)',
                      border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                    }}>
                      <Ic icon={Eye} size={14} color="var(--muted)" />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── NEXT ACTION CARD ── */}
        <button onClick={nextAction.action} style={{
          width: '100%', padding: nextAction.isReady ? '18px 16px' : '14px', marginBottom: 10,
          background: nextAction.isReady
            ? 'linear-gradient(135deg, rgba(240,165,0,0.15), rgba(240,165,0,0.06))'
            : `${nextAction.color}12`,
          border: `1px solid ${nextAction.color}30`,
          borderRadius: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
          fontFamily: "'DM Sans',sans-serif", animation: 'fadeInUp 0.4s ease 0.05s both',
        }}>
          <div style={{
            width: nextAction.isReady ? 44 : 36, height: nextAction.isReady ? 44 : 36,
            borderRadius: nextAction.isReady ? 12 : 10,
            background: nextAction.isReady ? 'linear-gradient(135deg, var(--accent), #f59e0b)' : nextAction.color,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: nextAction.isReady ? '0 4px 12px rgba(240,165,0,0.3)' : 'none',
          }}>
            <Ic icon={nextAction.icon} size={nextAction.isReady ? 22 : 18} color="#000" />
          </div>
          <div style={{ flex: 1, textAlign: 'left' }}>
            {nextAction.isReady ? (
              <>
                <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: 2, marginBottom: 2, fontFamily: "'Bebas Neue',sans-serif" }}>
                  {nextAction.text}
                </div>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--muted)' }}>
                  {nextAction.subtext}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 9, fontWeight: 700, color: nextAction.color, letterSpacing: 1, marginBottom: 2 }}>NEXT ACTION</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{nextAction.text}</div>
              </>
            )}
          </div>
          <ChevronRight size={16} color={nextAction.isReady ? 'var(--accent)' : 'var(--muted)'} />
        </button>

        {/* ── CURRENT LOAD ── */}
        {currentLoad && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
            padding: '14px', marginBottom: 10, animation: 'fadeInUp 0.4s ease 0.1s both',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(currentLoad.status), animation: 'qStatusPulse 2s infinite' }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(currentLoad.status) }}>{currentLoad.status}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>{currentLoad.load_id || currentLoad.loadId || ''}</span>
            </div>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>
              {currentLoad.origin || '?'} → {currentLoad.destination || currentLoad.dest || '?'}
            </div>
            <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'var(--muted)' }}>
              {currentLoad.miles > 0 && <span><Ic icon={Navigation} size={10} color="var(--muted)" /> {currentLoad.miles} mi</span>}
              {currentLoad.equipment && <span><Ic icon={Truck} size={10} color="var(--muted)" /> {currentLoad.equipment}</span>}
              {(currentLoad.pickup_date || currentLoad.delivery_date) && (
                <span><Ic icon={Clock} size={10} color="var(--muted)" /> {currentLoad.pickup_date || currentLoad.delivery_date}</span>
              )}
            </div>
            {/* Quick actions */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button onClick={() => { haptic('success'); onNavigate('loads') }} style={{
                flex: 1, padding: '10px', background: 'var(--accent)',
                border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                <Ic icon={ArrowRight} size={14} color="#000" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#000' }}>Update Status</span>
              </button>
              {(() => {
                const s = (currentLoad.status || '').toLowerCase()
                const navTarget = (s === 'en route to pickup' || s === 'dispatched' || s === 'assigned to driver')
                  ? (currentLoad.origin || '') : (currentLoad.destination || currentLoad.dest || '')
                if (!navTarget) return null
                const encodedAddr = encodeURIComponent(navTarget)
                const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
                const mapsUrl = isIOS ? `maps://maps.apple.com/?daddr=${encodedAddr}` : `https://www.google.com/maps/dir/?api=1&destination=${encodedAddr}`
                return (
                  <a href={mapsUrl} target="_blank" rel="noopener noreferrer" onClick={() => haptic()}
                    style={{ padding: '10px 14px', background: 'rgba(52,176,104,0.1)', border: '1px solid rgba(52,176,104,0.25)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: "'DM Sans',sans-serif", textDecoration: 'none' }}>
                    <Ic icon={Navigation} size={14} color="var(--success)" />
                  </a>
                )
              })()}
            </div>
          </div>
        )}

        {/* ── DETENTION & DRIVE TIME TRACKER ── */}
        <DetentionTracker loads={activeLoads} currentLoad={currentLoad} />

        {/* ── QUICK ACTIONS GRID ── */}
        <div style={{ marginBottom: 10, animation: 'fadeInUp 0.4s ease 0.12s both' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 8 }}>QUICK ACTIONS</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { icon: Shield, label: 'Pre-Trip', color: '#34b068', action: () => onNavigate('more') },
              { icon: FileText, label: 'Upload BOL', color: '#8b5cf6', action: () => onNavigate('loads') },
              { icon: Clock, label: 'Detention', color: '#f59e0b', action: () => onNavigate('loads') },
              { icon: Camera, label: 'Lumper', color: '#ef4444', action: () => onNavigate('loads') },
              { icon: DollarSign, label: 'Fuel Log', color: '#3b82f6', action: () => onNavigate('more') },
              { icon: null, label: 'Ask Q', color: 'var(--accent)', isQ: true, action: () => onOpenQ?.('What should I do next?') },
            ].map((item, i) => (
              <button key={i} onClick={() => { haptic(); item.action() }} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                gap: 6, padding: '14px 8px',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
                cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                aspectRatio: '1', minHeight: 80,
              }}>
                {item.isQ ? (
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: 'linear-gradient(135deg, var(--accent), #f59e0b)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(240,165,0,0.3)',
                  }}>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: '#000', fontWeight: 800, lineHeight: 1 }}>Q</span>
                  </div>
                ) : (
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, background: `${item.color}15`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ic icon={item.icon} size={16} color={item.color} />
                  </div>
                )}
                <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text)', textAlign: 'center', lineHeight: 1.2 }}>{item.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* ── EARNINGS ── */}
        {earnings.total === 0 && earnings.week === 0 ? (
          <div style={{
            background: 'linear-gradient(135deg, rgba(52,176,104,0.08), rgba(240,165,0,0.05))',
            border: '1px solid rgba(52,176,104,0.2)', borderRadius: 14,
            padding: '16px', marginBottom: 10, animation: 'fadeInUp 0.4s ease 0.15s both',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ic icon={DollarSign} size={12} color="var(--success)" />
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--success)', letterSpacing: 1 }}>YOUR EARNINGS</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
              Complete your first load to start earning
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              Pay model: <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{payModelText}</span>
            </div>
          </div>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10,
            animation: 'fadeInUp 0.4s ease 0.15s both',
          }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px' }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.5 }}>This Week</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--success)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(earnings.week)}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)' }}>earned</div>
            </div>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '12px' }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.5 }}>Total Earned</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(earnings.total)}</div>
              <div style={{ fontSize: 9, color: 'var(--muted)' }}>{payModelText}</div>
            </div>
          </div>
        )}

        {/* ── DELIVERED — NEED ACTION ── */}
        {deliveredLoads.length > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(139,92,246,0.1), rgba(240,165,0,0.06))',
            border: '1px solid rgba(139,92,246,0.2)', borderRadius: 14,
            padding: '12px', marginBottom: 10, animation: 'fadeInUp 0.4s ease 0.2s both',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ic icon={Upload} size={12} color="#8b5cf6" />
              <span style={{ fontSize: 10, fontWeight: 700, color: '#8b5cf6', letterSpacing: 1 }}>UPLOAD DOCS</span>
            </div>
            {deliveredLoads.map(load => (
              <button key={load.id || load.load_id} onClick={() => { haptic(); onNavigate('loads') }} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
                background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                borderTop: '1px solid rgba(139,92,246,0.1)',
              }}>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>
                    {load.origin} → {load.destination || load.dest}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Upload BOL & POD to get paid</div>
                </div>
                <ChevronRight size={14} color="#8b5cf6" />
              </button>
            ))}
          </div>
        )}

        {/* ── COMPLIANCE ALERTS ── */}
        {complianceAlerts.length > 0 && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
            padding: '12px', marginBottom: 10, animation: 'fadeInUp 0.4s ease 0.25s both',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Ic icon={Shield} size={12} color="var(--danger)" />
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', letterSpacing: 1 }}>COMPLIANCE</span>
            </div>
            {complianceAlerts.map((a, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
                borderTop: i > 0 ? '1px solid var(--border)' : 'none',
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: a.color, flexShrink: 0, animation: a.urgent ? 'qStatusPulse 1.5s infinite' : 'none' }} />
                <span style={{ fontSize: 11, color: 'var(--text)', fontWeight: a.urgent ? 700 : 500 }}>{a.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── LOAD STATS (hidden when all zero) ── */}
        {(completedLoads.length > 0 || completedLoads.reduce((s, l) => s + (l.miles || 0), 0) > 0) && (
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
            padding: '12px', marginBottom: 10, animation: 'fadeInUp 0.4s ease 0.3s both',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <Ic icon={TrendingUp} size={12} color="var(--accent)" />
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1 }}>MY STATS</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <div>
                <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>Loads</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif" }}>{completedLoads.length}</div>
              </div>
              <div>
                <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>Miles</div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif" }}>
                  {completedLoads.reduce((s, l) => s + (l.miles || 0), 0).toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 8, color: 'var(--muted)', fontWeight: 600 }}>Avg/Load</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif" }}>
                  {completedLoads.length > 0 ? fmt$(earnings.total / completedLoads.length) : '$0'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── UPCOMING LOADS ── */}
        {loads.filter(l => (l.status || '').toLowerCase() === 'booked' || (l.status || '').toLowerCase() === 'dispatched').length > 0 && (
          <div style={{ animation: 'fadeInUp 0.4s ease 0.35s both' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 6 }}>UPCOMING</div>
            {loads.filter(l => {
              const s = (l.status || '').toLowerCase()
              return s === 'booked' || s === 'dispatched'
            }).slice(0, 3).map(load => (
              <div key={load.id || load.load_id} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 6,
              }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor(load.status), flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {load.origin} → {load.destination || load.dest}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>{load.pickup_date || '—'} · {load.miles || 0} mi</div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, color: statusColor(load.status) }}>{load.status}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ height: 80 }} />
      </div>
    </div>
  )
}

// ── DETENTION & TRUCKING TIME TRACKER ──
function DetentionTracker({ loads, currentLoad }) {
  const [timers, setTimers] = useState(() => {
    try { return JSON.parse(localStorage.getItem('q_detention_timers') || '{}') } catch { return {} }
  })
  const [now, setNow] = useState(Date.now())

  // Tick every second for active timers
  useEffect(() => {
    const hasActive = Object.values(timers).some(t => t.active)
    if (!hasActive) return
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [timers])

  // Persist timers (prune entries older than 7 days)
  useEffect(() => {
    const now = Date.now()
    const MAX_AGE = 7 * 24 * 60 * 60 * 1000
    const pruned = Object.fromEntries(
      Object.entries(timers).filter(([, t]) => now - (t.end || t.start) < MAX_AGE)
    )
    localStorage.setItem('q_detention_timers', JSON.stringify(pruned))
  }, [timers])

  const startTimer = (loadId, type) => {
    haptic('success')
    setTimers(prev => ({
      ...prev,
      [`${loadId}_${type}`]: { start: Date.now(), active: true, type, loadId },
    }))
  }

  const stopTimer = (loadId, type) => {
    haptic()
    setTimers(prev => {
      const key = `${loadId}_${type}`
      const t = prev[key]
      if (!t) return prev
      const endTime = Date.now()
      const elapsed = endTime - t.start
      const detentionHrs = Math.max(0, (elapsed - FREE_TIME_MS) / 3600000)
      const charge = Math.round(detentionHrs * DETENTION_RATE * 100) / 100
      // Persist to database
      if (type === 'pickup' || type === 'delivery') {
        db.updateLoad(loadId, {
          [`detention_${type}_start`]: new Date(t.start).toISOString(),
          [`detention_${type}_end`]: new Date(endTime).toISOString(),
          [`detention_${type}_charge`]: charge > 0 ? charge : 0,
        }).catch(() => {})
      }
      return { ...prev, [key]: { ...t, active: false, end: endTime } }
    })
  }

  const formatDuration = (ms) => {
    const totalSec = Math.floor(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) return `${h}h ${m.toString().padStart(2, '0')}m`
    return `${m}m ${s.toString().padStart(2, '0')}s`
  }

  const FREE_TIME_MS = 2 * 60 * 60 * 1000 // 2 hours free time
  const DETENTION_RATE = 75 // $75/hr after free time

  // Get relevant load for showing timer
  const load = currentLoad || (loads && loads[0])
  if (!load) return null

  const lid = load.id || load.load_id || load.loadId
  const status = (load.status || '').toLowerCase()

  // Determine which timer type to show
  const isAtPickup = status === 'en route to pickup' || status === 'at pickup' || status === 'dispatched'
  const isAtDelivery = status === 'at delivery' || status === 'delivered'
  const isInTransit = status === 'in transit' || status === 'loaded'

  const pickupKey = `${lid}_pickup`
  const deliveryKey = `${lid}_delivery`
  const driveKey = `${lid}_drive`
  const pickupTimer = timers[pickupKey]
  const deliveryTimer = timers[deliveryKey]
  const driveTimer = timers[driveKey]

  // Calculate elapsed
  const calcElapsed = (timer) => {
    if (!timer) return 0
    return timer.active ? (now - timer.start) : ((timer.end || now) - timer.start)
  }

  const calcDetention = (elapsed) => {
    if (elapsed <= FREE_TIME_MS) return 0
    const detentionHrs = (elapsed - FREE_TIME_MS) / 3600000
    return Math.round(detentionHrs * DETENTION_RATE * 100) / 100
  }

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14,
      padding: '12px', marginBottom: 10, animation: 'fadeInUp 0.4s ease 0.12s both',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
        <Ic icon={Clock} size={12} color="var(--accent)" />
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1 }}>DETENTION & DRIVE TIME</span>
      </div>

      {/* Pickup detention */}
      {(isAtPickup || pickupTimer) && (
        <TimerRow
          label="Pickup Wait"
          sublabel={load.origin || '?'}
          timer={pickupTimer}
          elapsed={calcElapsed(pickupTimer)}
          detention={calcDetention(calcElapsed(pickupTimer))}
          freeTime={FREE_TIME_MS}
          onStart={() => startTimer(lid, 'pickup')}
          onStop={() => stopTimer(lid, 'pickup')}
          formatDuration={formatDuration}
        />
      )}

      {/* Drive time */}
      {(isInTransit || driveTimer) && (
        <TimerRow
          label="Drive Time"
          sublabel={`${load.origin || '?'} → ${load.destination || load.dest || '?'}`}
          timer={driveTimer}
          elapsed={calcElapsed(driveTimer)}
          isDriveTime
          onStart={() => startTimer(lid, 'drive')}
          onStop={() => stopTimer(lid, 'drive')}
          formatDuration={formatDuration}
        />
      )}

      {/* Delivery detention */}
      {(isAtDelivery || deliveryTimer) && (
        <TimerRow
          label="Delivery Wait"
          sublabel={load.destination || load.dest || '?'}
          timer={deliveryTimer}
          elapsed={calcElapsed(deliveryTimer)}
          detention={calcDetention(calcElapsed(deliveryTimer))}
          freeTime={FREE_TIME_MS}
          onStart={() => startTimer(lid, 'delivery')}
          onStop={() => stopTimer(lid, 'delivery')}
          formatDuration={formatDuration}
        />
      )}

      {/* No timer active prompt */}
      {!pickupTimer && !driveTimer && !deliveryTimer && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => startTimer(lid, 'pickup')} style={{
            flex: 1, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 8,
            cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif",
          }}>
            Start Pickup Timer
          </button>
          <button onClick={() => startTimer(lid, 'drive')} style={{
            flex: 1, padding: '10px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
            cursor: 'pointer', fontSize: 11, fontWeight: 700, color: 'var(--text)', fontFamily: "'DM Sans',sans-serif",
          }}>
            Start Drive Timer
          </button>
        </div>
      )}

      {/* Detention summary */}
      {(() => {
        const totalDetention = calcDetention(calcElapsed(pickupTimer)) + calcDetention(calcElapsed(deliveryTimer))
        const totalDrive = driveTimer ? calcElapsed(driveTimer) : 0
        if (totalDetention <= 0 && totalDrive <= 0) return null
        return (
          <div style={{
            marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)',
            display: 'flex', justifyContent: 'space-between', fontSize: 10,
          }}>
            {totalDrive > 0 && (
              <span style={{ color: 'var(--muted)' }}>Total drive: <span style={{ color: 'var(--text)', fontWeight: 700 }}>{formatDuration(totalDrive)}</span></span>
            )}
            {totalDetention > 0 && (
              <span style={{ color: 'var(--danger)', fontWeight: 700 }}>
                Detention: {fmt$(totalDetention)} billable
              </span>
            )}
          </div>
        )
      })()}
    </div>
  )
}

function TimerRow({ label, sublabel, timer, elapsed, detention, freeTime, isDriveTime, onStart, onStop, formatDuration }) {
  const isActive = timer?.active
  const freeRemaining = freeTime ? Math.max(0, freeTime - elapsed) : 0
  const inDetention = !isDriveTime && freeTime && elapsed > freeTime

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: inDetention ? 'var(--danger)' : 'var(--text)' }}>{label}</div>
        <div style={{ fontSize: 9, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sublabel}</div>
        {!isDriveTime && timer && !inDetention && (
          <div style={{ fontSize: 9, color: '#f59e0b' }}>Free time: {formatDuration(freeRemaining)} left</div>
        )}
        {inDetention && detention > 0 && (
          <div style={{ fontSize: 9, color: 'var(--danger)', fontWeight: 700 }}>
            DETENTION: {fmt$(detention)} billable ($75/hr)
          </div>
        )}
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{
          fontSize: 18, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif",
          color: isActive ? (inDetention ? 'var(--danger)' : 'var(--accent)') : 'var(--muted)',
          fontVariantNumeric: 'tabular-nums',
        }}>
          {timer ? formatDuration(elapsed) : '0m 00s'}
        </div>
      </div>
      {!timer ? (
        <button onClick={onStart} style={{
          padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: 6,
          cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif",
        }}>Start</button>
      ) : isActive ? (
        <button onClick={onStop} style={{
          padding: '6px 12px', background: 'var(--danger)', border: 'none', borderRadius: 6,
          cursor: 'pointer', fontSize: 10, fontWeight: 700, color: '#fff', fontFamily: "'DM Sans',sans-serif",
        }}>Stop</button>
      ) : (
        <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--success)', padding: '6px 8px' }}>Done</div>
      )}
    </div>
  )
}
