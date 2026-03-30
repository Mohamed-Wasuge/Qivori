import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Play, Pause, SkipForward, RefreshCw, Truck, Package, DollarSign, Clock, MapPin, AlertTriangle, CheckCircle, XCircle, MessageSquare, Activity, Fuel, Coffee, Moon, Zap, TrendingUp, Users, FileText, Radio, ChevronRight, ChevronDown } from 'lucide-react'
import { Ic } from './shared'

// ── Live Event Feed ─────────────────────────────────────────────────────────
const EVENT_ICONS = {
  day_start: { icon: Clock, color: 'var(--accent)' },
  load_offered: { icon: Package, color: 'var(--info, #3b82f6)' },
  ai_decision: { icon: Zap, color: 'var(--accent)' },
  driver_assigned: { icon: Users, color: 'var(--success)' },
  status_change: { icon: Activity, color: 'var(--text)' },
  check_call: { icon: Radio, color: '#8b5cf6' },
  fuel_stop: { icon: Fuel, color: '#f59e0b' },
  hos_break: { icon: Coffee, color: '#f97316' },
  hos_sleep: { icon: Moon, color: '#6366f1' },
  detention: { icon: AlertTriangle, color: 'var(--danger)' },
  delivery_complete: { icon: CheckCircle, color: 'var(--success)' },
  invoice_generated: { icon: FileText, color: 'var(--accent)' },
  broker_negotiation: { icon: MessageSquare, color: '#8b5cf6' },
  broker_response: { icon: MessageSquare, color: '#8b5cf6' },
  missed_opportunity: { icon: XCircle, color: 'var(--danger)' },
  issue_reported: { icon: AlertTriangle, color: '#f97316' },
  day_end: { icon: Moon, color: 'var(--muted)' },
}

function EventRow({ event, isNew }) {
  const cfg = EVENT_ICONS[event.type] || { icon: Activity, color: 'var(--muted)' }
  return (
    <div style={{
      display: 'flex', gap: 10, padding: '8px 12px', borderBottom: '1px solid var(--border)',
      background: isNew ? 'rgba(240,165,0,0.04)' : 'transparent',
      transition: 'background 0.6s ease',
      animation: isNew ? 'fadeInEvent 0.4s ease' : 'none',
    }}>
      <div style={{ minWidth: 55, fontSize: 11, fontFamily: 'monospace', color: 'var(--muted)', paddingTop: 2 }}>
        {event.time}
      </div>
      <div style={{ minWidth: 22, paddingTop: 1 }}>
        <Ic icon={cfg.icon} size={14} color={cfg.color} />
      </div>
      <div style={{ flex: 1, fontSize: 12, lineHeight: 1.6, color: 'var(--text)' }}>
        {typeof event.detail === 'string' ? event.detail : JSON.stringify(event.detail)}
      </div>
    </div>
  )
}

// ── KPI Card ────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, icon, color }) {
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      padding: '14px 16px', minWidth: 130, flex: 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <Ic icon={icon} size={14} color={color || 'var(--accent)'} />
        <span style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.8, fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || 'var(--text)', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

// ── Driver Status Card ──────────────────────────────────────────────────────
function DriverCard({ driver, day }) {
  if (!driver) return null
  const statusColors = {
    driving: 'var(--success)', on_duty: 'var(--accent)', off_duty: 'var(--muted)',
    sleeping: '#6366f1', fueling: '#f59e0b', resting: '#f97316',
  }
  const statusLabels = {
    driving: 'Driving', on_duty: 'On Duty', off_duty: 'Off Duty',
    sleeping: 'Sleeping', fueling: 'Fueling', resting: 'Break',
  }
  const status = day?.driverStatus?.status || 'off_duty'
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: 'rgba(240,165,0,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Ic icon={Truck} size={18} color="var(--accent)" />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{driver.name}</div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>{driver.license} · {driver.equipment} · {driver.experience}yr exp</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColors[status] || 'var(--muted)', boxShadow: `0 0 6px ${statusColors[status] || 'transparent'}` }} />
          <span style={{ fontSize: 11, fontWeight: 600, color: statusColors[status] || 'var(--muted)' }}>
            {statusLabels[status] || status}
          </span>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>LOCATION</div>
          <div style={{ fontSize: 11, fontWeight: 600 }}>{day?.driverStatus?.location || driver.homeBase}</div>
        </div>
        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>HOS LEFT</div>
          <div style={{ fontSize: 11, fontWeight: 600 }}>{day?.driverStatus?.hoursLeft ?? 11}h</div>
        </div>
        <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 2 }}>CURRENT LOAD</div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--accent)' }}>{day?.driverStatus?.currentLoad || '—'}</div>
        </div>
      </div>
    </div>
  )
}

// ── Day Summary Card ────────────────────────────────────────────────────────
function DaySummary({ day, isActive, onClick }) {
  if (!day) return null
  const profit = day.financials?.profit || 0
  return (
    <div
      onClick={onClick}
      style={{
        background: isActive ? 'rgba(240,165,0,0.06)' : 'var(--surface)',
        border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 10, padding: '10px 14px', cursor: 'pointer', transition: 'all 0.2s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ fontWeight: 700, fontSize: 12 }}>Day {day.day} — {day.dayOfWeek}</div>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{day.date}</span>
      </div>
      <div style={{ display: 'flex', gap: 12, fontSize: 10 }}>
        <span><strong style={{ color: 'var(--success)' }}>{day.loads?.accepted || 0}</strong> accepted</span>
        <span><strong style={{ color: 'var(--danger)' }}>{day.loads?.rejected || 0}</strong> rejected</span>
        <span><strong style={{ color: 'var(--accent)' }}>{day.loads?.negotiated || 0}</strong> negotiated</span>
        <span style={{ marginLeft: 'auto', fontWeight: 700, color: profit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
          ${profit.toLocaleString()}
        </span>
      </div>
    </div>
  )
}

// ── Weekly Summary Panel ────────────────────────────────────────────────────
function WeeklySummary({ summary }) {
  if (!summary) return null
  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20,
    }}>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, letterSpacing: 2, color: 'var(--accent)', marginBottom: 16 }}>
        WEEKLY REPORT
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        <StatBox label="Revenue" value={`$${(summary.totalRevenue || 0).toLocaleString()}`} color="var(--text)" />
        <StatBox label="Expenses" value={`$${((summary.totalFuelCost || 0) + (summary.totalDriverPay || 0)).toLocaleString()}`} color="var(--danger)" />
        <StatBox label="Net Profit" value={`$${(summary.totalProfit || 0).toLocaleString()}`} color={summary.totalProfit >= 0 ? 'var(--success)' : 'var(--danger)'} />
        <StatBox label="Loads Delivered" value={summary.totalDelivered || 0} color="var(--accent)" />
        <StatBox label="Total Miles" value={`${(summary.totalMilesDriven || 0).toLocaleString()} mi`} color="var(--text)" />
        <StatBox label="Avg RPM" value={`$${(summary.avgRPM || 0).toFixed(2)}`} color="var(--accent)" />
        <StatBox label="Avg Profit/Load" value={`$${(summary.avgProfitPerLoad || 0).toLocaleString()}`} color="var(--success)" />
        <StatBox label="Check Calls" value={summary.totalCheckCalls || 0} color="#8b5cf6" />
        <StatBox label="Accepted" value={`${summary.totalAccepted || 0}/${summary.totalLoadsOffered || 0}`} color="var(--success)" />
        <StatBox label="Target" value={summary.targetMet ? 'MET' : `$${Math.abs(summary.targetDiff || 0).toLocaleString()} short`} color={summary.targetMet ? 'var(--success)' : 'var(--danger)'} />
      </div>

      {summary.bestLoad && (
        <div style={{ marginTop: 14, padding: '10px 14px', background: 'rgba(52,176,104,0.06)', border: '1px solid rgba(52,176,104,0.2)', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700, marginBottom: 4 }}>BEST LOAD</div>
          <div style={{ fontSize: 12 }}>{typeof summary.bestLoad === 'string' ? summary.bestLoad : `${summary.bestLoad?.id || ''} — $${summary.bestLoad?.profit || 0}`}</div>
        </div>
      )}

      {summary.missedOpportunities?.length > 0 && (
        <div style={{ marginTop: 10, padding: '10px 14px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8 }}>
          <div style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 700, marginBottom: 4 }}>MISSED OPPORTUNITIES</div>
          {summary.missedOpportunities.slice(0, 3).map((m, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 2 }}>{typeof m === 'string' ? m : `${m?.lane || m?.loadId || 'Load'} — $${m?.rate || 0} (${m?.reason || ''})`}</div>
          ))}
        </div>
      )}

      {summary.brokerBreakdown && Object.keys(summary.brokerBreakdown).length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 }}>Broker Breakdown</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {Object.entries(summary.brokerBreakdown).map(([name, data]) => (
              <span key={name} style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 6, background: 'var(--bg)',
                border: '1px solid var(--border)',
              }}>
                {name}: <strong>{data.accepted || 0}</strong>/{data.offered || 0}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function StatBox({ label, value, color }) {
  return (
    <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{value}</div>
    </div>
  )
}

// ── Main Dashboard ──────────────────────────────────────────────────────────
export function SimulationDashboard() {
  const [simulation, setSimulation] = useState(null)
  const [running, setRunning] = useState(false)
  const [paused, setPaused] = useState(false)
  const [activeDay, setActiveDay] = useState(0)
  const [visibleEvents, setVisibleEvents] = useState([])
  const [eventIndex, setEventIndex] = useState(0)
  const [speed, setSpeed] = useState(1) // 1x, 2x, 5x, 10x
  const feedRef = useRef(null)
  const timerRef = useRef(null)
  const simDataRef = useRef(null)

  // Default company config
  const config = useMemo(() => ({
    companyName: 'Wasuge Trucking LLC',
    dot: '4012938',
    mc: '1289445',
    truckCount: 1,
    driver: {
      name: 'Marcus Johnson',
      experience: 8,
      license: 'CDL-A',
      equipment: 'Dry Van',
      payModel: 'percent',
      payRate: 30,
      homeBase: 'Dallas, TX',
    },
    weeklyTarget: 5000,
    fuelCostPerMile: 0.58,
  }), [])

  const startSimulation = useCallback(async () => {
    setRunning(true)
    setPaused(false)
    setVisibleEvents([])
    setEventIndex(0)
    setActiveDay(0)

    try {
      // Dynamic import to avoid loading simulation code until needed
      const { runCompanySimulation } = await import('../../lib/companySimulation')
      const result = runCompanySimulation(config)
      simDataRef.current = result
      setSimulation(result)
    } catch (err) {
      console.error('[Simulation] Failed:', err)
      setRunning(false)
    }
  }, [config])

  // Event drip feed — plays events one by one for real-time feel
  useEffect(() => {
    if (!simulation || paused || !running) return
    const allEvents = simulation.eventLog || []
    if (eventIndex >= allEvents.length) {
      setRunning(false)
      return
    }

    const baseDelay = {
      day_start: 1200, day_end: 800,
      load_offered: 600, ai_decision: 800,
      driver_assigned: 500, status_change: 400,
      check_call: 700, fuel_stop: 500,
      hos_break: 600, hos_sleep: 600,
      detention: 800, delivery_complete: 1000,
      invoice_generated: 600, broker_negotiation: 900,
      broker_response: 700, missed_opportunity: 800,
      issue_reported: 700,
    }
    const event = allEvents[eventIndex]
    const delay = (baseDelay[event?.type] || 500) / speed

    timerRef.current = setTimeout(() => {
      setVisibleEvents(prev => [...prev, { ...event, _isNew: true }])
      setEventIndex(prev => prev + 1)

      // Track which day we're on
      if (event?.type === 'day_start' && event?.data?.day) {
        setActiveDay(event.data.day - 1)
      }

      // Clear "new" flag after animation
      setTimeout(() => {
        setVisibleEvents(prev => prev.map((e, i) => i === prev.length - 1 ? { ...e, _isNew: false } : e))
      }, 600)
    }, delay)

    return () => clearTimeout(timerRef.current)
  }, [simulation, eventIndex, paused, running, speed])

  // Auto-scroll feed
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [visibleEvents.length])

  const skipToEnd = useCallback(() => {
    if (!simulation) return
    setVisibleEvents(simulation.eventLog || [])
    setEventIndex((simulation.eventLog || []).length)
    setActiveDay((simulation.days?.length || 1) - 1)
    setRunning(false)
  }, [simulation])

  const currentDay = simulation?.days?.[activeDay]
  const totalEvents = simulation?.eventLog?.length || 0
  const progress = totalEvents > 0 ? Math.round((eventIndex / totalEvents) * 100) : 0

  // Running totals up to current day
  const runningTotals = useMemo(() => {
    if (!simulation?.days) return { revenue: 0, expenses: 0, profit: 0, delivered: 0, miles: 0 }
    let revenue = 0, expenses = 0, profit = 0, delivered = 0, miles = 0
    for (let i = 0; i <= activeDay && i < simulation.days.length; i++) {
      const d = simulation.days[i]
      revenue += d.financials?.revenue || 0
      expenses += (d.financials?.fuelCost || 0) + (d.financials?.driverPay || 0)
      profit += d.financials?.profit || 0
      delivered += d.loads?.delivered || 0
      miles += d.financials?.miles || 0
    }
    return { revenue, expenses, profit, delivered, miles }
  }, [simulation, activeDay])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, height: '100%', overflow: 'auto', padding: '0 0 40px' }}>
      <style>{`
        @keyframes fadeInEvent { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 3, color: 'var(--accent)' }}>
            LIVE SIMULATION
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {simulation ? `${config.companyName} — ${config.driver.name} — ${config.driver.equipment}` : 'Run a 5-day trucking company simulation'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {running && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--muted)' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: paused ? 'var(--muted)' : 'var(--success)', animation: paused ? 'none' : 'pulse-dot 1.2s infinite' }} />
                {paused ? 'PAUSED' : 'LIVE'}
              </div>
              <select
                value={speed}
                onChange={e => setSpeed(Number(e.target.value))}
                style={{
                  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
                  padding: '4px 8px', fontSize: 10, color: 'var(--text)', cursor: 'pointer',
                }}
              >
                <option value={1}>1x</option>
                <option value={2}>2x</option>
                <option value={5}>5x</option>
                <option value={10}>10x</option>
              </select>
            </>
          )}
          {!simulation && (
            <button onClick={startSimulation} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8,
              background: 'var(--accent)', color: '#000', border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 12, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1.5,
            }}>
              <Ic icon={Play} size={14} color="#000" /> START SIMULATION
            </button>
          )}
          {running && (
            <>
              <button onClick={() => setPaused(p => !p)} className="btn btn-ghost" style={{ padding: '6px 10px' }}>
                <Ic icon={paused ? Play : Pause} size={14} />
              </button>
              <button onClick={skipToEnd} className="btn btn-ghost" style={{ padding: '6px 10px' }}>
                <Ic icon={SkipForward} size={14} />
              </button>
            </>
          )}
          {simulation && !running && (
            <button onClick={() => { setSimulation(null); simDataRef.current = null }} className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 11 }}>
              <Ic icon={RefreshCw} size={12} /> New Simulation
            </button>
          )}
        </div>
      </div>

      {/* Progress bar */}
      {simulation && (
        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${progress}%`, background: 'var(--accent)', transition: 'width 0.3s ease', borderRadius: 2 }} />
        </div>
      )}

      {/* KPIs */}
      {simulation && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <KPI label="Revenue" value={`$${runningTotals.revenue.toLocaleString()}`} icon={DollarSign} color="var(--text)" sub={`Target: $${config.weeklyTarget.toLocaleString()}`} />
          <KPI label="Profit" value={`$${runningTotals.profit.toLocaleString()}`} icon={TrendingUp} color={runningTotals.profit >= 0 ? 'var(--success)' : 'var(--danger)'} />
          <KPI label="Delivered" value={runningTotals.delivered} icon={CheckCircle} color="var(--success)" sub={`Day ${activeDay + 1} of 5`} />
          <KPI label="Miles" value={runningTotals.miles.toLocaleString()} icon={MapPin} color="var(--accent)" />
        </div>
      )}

      {/* Main content */}
      {simulation && (
        <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16, minHeight: 0, flex: 1 }}>
          {/* Left panel — Days + Driver */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
            <DriverCard driver={config.driver} day={currentDay} />
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, padding: '4px 0' }}>
              Daily Breakdown
            </div>
            {simulation.days?.map((day, i) => (
              <DaySummary key={i} day={day} isActive={i === activeDay} onClick={() => setActiveDay(i)} />
            ))}
          </div>

          {/* Right panel — Live event feed */}
          <div style={{
            display: 'flex', flexDirection: 'column', background: 'var(--surface)',
            border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden',
          }}>
            <div style={{
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              background: 'rgba(240,165,0,0.03)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Ic icon={Radio} size={14} color="var(--accent)" />
                <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 14, letterSpacing: 1.5, color: 'var(--accent)' }}>
                  DISPATCH LOG
                </span>
              </div>
              <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: 'monospace' }}>
                {eventIndex}/{totalEvents} events
              </span>
            </div>
            <div ref={feedRef} style={{ flex: 1, overflow: 'auto', maxHeight: 500 }}>
              {visibleEvents.length === 0 && (
                <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                  {running ? 'Starting simulation...' : 'Events will appear here during simulation'}
                </div>
              )}
              {visibleEvents.map((event, i) => (
                <EventRow key={i} event={event} isNew={event._isNew} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Weekly summary — show when simulation complete */}
      {simulation && !running && eventIndex >= totalEvents && (
        <WeeklySummary summary={simulation.summary} />
      )}

      {/* Empty state */}
      {!simulation && (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 20, padding: 40, minHeight: 400,
        }}>
          <div style={{
            width: 80, height: 80, borderRadius: 20, background: 'rgba(240,165,0,0.08)',
            border: '1px solid rgba(240,165,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Ic icon={Activity} size={36} color="var(--accent)" />
          </div>
          <div style={{ textAlign: 'center', maxWidth: 400 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 2, marginBottom: 8 }}>
              COMPANY SIMULATION
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
              Run a realistic 5-day trucking operation with 1 truck. Watch AI dispatch decisions,
              driver movements, check calls, broker negotiations, and invoice generation in real-time.
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 400 }}>
            {['Market Rate Engine', 'Broker Simulation', 'HOS Tracking', 'Check Calls', 'Load Lifecycle', 'AI Decisions'].map(f => (
              <span key={f} style={{
                fontSize: 10, padding: '4px 10px', borderRadius: 20, background: 'var(--surface)',
                border: '1px solid var(--border)', color: 'var(--muted)',
              }}>{f}</span>
            ))}
          </div>
          <button onClick={startSimulation} style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 10,
            background: 'var(--accent)', color: '#000', border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 14, fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 2,
            marginTop: 8,
          }}>
            <Ic icon={Play} size={16} color="#000" /> LAUNCH 5-DAY SIMULATION
          </button>
        </div>
      )}
    </div>
  )
}
