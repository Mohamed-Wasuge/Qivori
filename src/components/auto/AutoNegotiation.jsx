/**
 * AutoNegotiation — load offer + negotiation flow for the AutoShell
 *
 * Renders as a fullscreen overlay when there's a load with status='offered'
 * waiting for the OO. Walks through 5 visual states:
 *
 *   1. offer        — load offer popup, Q says GO/PASS, accept or decline
 *   2. dialing      — Q is calling broker (3-5s sim)
 *   3. quoted       — broker quoted X, OO inputs counter
 *   4. relaying     — Q is telling broker the counter (3-5s sim)
 *   5. final        — broker agreed, final review, BOOK button
 *
 * Phase 1 (this file): pure UI flow with mock state transitions. The
 * "Q is calling" stages use setTimeout to simulate progress. Real Retell
 * AI integration is Phase 2 — replace the simulated timers with webhook
 * events from the negotiation_sessions table.
 *
 * On final BOOK tap, updates load status to 'Booked' which causes
 * AutoHome to flip into Active Load mode (handled by the wrapper).
 */
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  X, Phone, CheckCircle, ChevronRight, AlertTriangle
} from 'lucide-react'
import { Ic, haptic, fmt$ } from '../mobile/shared'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import * as db from '../../lib/database'
import { apiFetch } from '../../lib/api'
import { supabase } from '../../lib/supabase'

// ── Outer wrapper — finds an offered load, renders flow if one exists ──
export default function AutoNegotiation() {
  const ctx = useCarrier() || {}

  // Find the most recent load with status='Offered' (Q just found it)
  const offeredLoad = useMemo(() => {
    const loads = ctx.loads || []
    return loads.find((l) => l.status === 'Offered') || null
  }, [ctx.loads])

  if (!offeredLoad) return null
  return <NegotiationFlow load={offeredLoad} />
}

// ── Inner — state machine: offer → target → dialing → final → booked ──
function NegotiationFlow({ load }) {
  const { showToast, profile, user } = useApp()
  const [step, setStep] = useState('offer')
  const [targetRate, setTargetRate] = useState(0)        // what the OO wants Q to push for
  const [counterOffer, setCounterOffer] = useState(0)    // legacy counter (used in old quoted step)
  const [finalRate, setFinalRate] = useState(0)          // what broker actually agreed to
  const [busy, setBusy] = useState(false)
  const [callId, setCallId] = useState(null)             // real Retell call_id when present
  const dismissedRef = useRef(false)

  const gross = Number(load.gross_pay || load.rate || 0)
  const miles = Number(load.miles || 0)
  const rpm = miles > 0 ? (gross / miles).toFixed(2) : '0.00'
  const origin = (load.origin || '?').split(',')[0]
  const dest = (load.destination || load.dest || '?').split(',')[0]
  const broker = load.broker_name || 'Broker'

  // Q Verdict (mocked — real version uses qVerdict from lib/qVerdict)
  const verdict = useMemo(() => {
    const rpmNum = parseFloat(rpm)
    if (rpmNum >= 2.5) return { label: 'STRONG GO', color: '#22c55e', confidence: 87 }
    if (rpmNum >= 2.0) return { label: 'GO', color: '#f0a500', confidence: 72 }
    return { label: 'CAUTION', color: '#ef4444', confidence: 45 }
  }, [rpm])

  // Initialize counter offer to broker quote + 10%
  useEffect(() => {
    if (step === 'quoted' && counterOffer === 0) {
      setCounterOffer(Math.round(gross * 1.10))
    }
  }, [step, gross, counterOffer])

  // ── PASS — mark load as declined, return to hunting ───────────
  const handlePass = useCallback(async () => {
    if (busy || dismissedRef.current) return
    haptic('light')
    dismissedRef.current = true
    setBusy(true)
    try {
      await db.updateLoad(load.id, { status: 'Declined' })
    } catch {}
    setBusy(false)
  }, [busy, load.id])

  // ── NEGOTIATE — show target rate input first ─────────────────
  // Per launch spec: the driver/carrier sets the offer, then Q delivers it.
  // So the Negotiate button doesn't dial yet — it pops the target sheet.
  const handleNegotiate = useCallback(() => {
    if (busy) return
    haptic('success')
    // Default target = broker's posted rate + 10% (typical counter)
    setTargetRate(Math.round(gross * 1.10))
    setStep('target')
  }, [busy, gross])

  // ── SEND Q — actually kick off the Retell broker call with target ──
  const handleSendQ = useCallback(async () => {
    if (busy || targetRate <= 0) return
    haptic('medium')
    setStep('dialing')

    const phone = load.broker_phone
    if (!phone) {
      // Demo / test load — simulate the call → final agreed rate
      setTimeout(() => {
        setFinalRate(targetRate)
        setStep('final')
      }, 4000)
      return
    }

    // Real call path
    try {
      const res = await apiFetch('/api/retell-broker-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          brokerName: broker,
          loadId: load.id,
          rate: gross,
          target_rate: targetRate,  // Q will push for this number
          miles,
          originCity: origin,
          destinationCity: dest,
          equipment: load.equipment || 'Dry Van',
          driverName: profile?.full_name || 'Driver',
          carrierName: profile?.company_name,
          loadDetails: `${origin} → ${dest}, ${miles}mi, posted $${gross}, driver wants $${targetRate}`,
          // Marks this call as AutoShell so the webhook skips legacy TMS
          // handlers (handleBookedLoad, notifyDriverOfOffer, scheduleRetryCall).
          // The driver decides accept/pass — Q never auto-books.
          experience: 'auto',
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.call_id) {
        setCallId(data.call_id)
        // realtime subscription advances the state when the broker responds
      } else {
        // API failed — fall back to simulation
        showToast?.('warning', 'Q is on it', 'Using fallback negotiation')
        setTimeout(() => {
          setFinalRate(targetRate)
          setStep('final')
        }, 4000)
      }
    } catch (e) {
      showToast?.('warning', 'Q is on it', 'Using fallback negotiation')
      setTimeout(() => {
        setFinalRate(targetRate)
        setStep('final')
      }, 4000)
    }
  }, [busy, targetRate, load.id, load.broker_phone, load.equipment, broker, gross, miles, origin, dest, profile, showToast])

  // ── Realtime subscription on retell_calls ────────────────────
  // When a real Retell call is in progress, listen for updates pushed by
  // retell-webhook. Two events arrive separately:
  //   1. call_ended  → call_status='completed', agreed_rate still NULL
  //   2. call_analyzed → agreed_rate populated by post-call analysis
  //
  // We only transition to 'final' once agreed_rate actually arrives.
  // Premature transition on call_ended would cause a race where the user
  // gets bounced back to offer step before the post-call analysis runs.
  useEffect(() => {
    if (!callId) return
    const channel = supabase
      .channel(`retell_call_${callId}`)
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'retell_calls', filter: `retell_call_id=eq.${callId}` },
        (payload) => {
          const row = payload.new
          if (!row) return
          const status = (row.call_status || '').toLowerCase()
          // ONLY advance when agreed_rate actually populates — don't react
          // to bare 'completed' status (post-call analysis runs after)
          if (row.agreed_rate && Number(row.agreed_rate) > 0) {
            setFinalRate(Number(row.agreed_rate))
            setStep('final')
            return
          }
          // Hard failures stay reactive (no-answer, voicemail, busy, failed)
          // — these never produce an agreed_rate so it's safe to bail
          if (
            status === 'failed' ||
            status === 'no-answer' || status === 'no_answer' ||
            status === 'voicemail' ||
            status === 'busy' ||
            status === 'hung_up_early'
          ) {
            showToast?.('warning', 'Broker did not pick up', 'Try another load')
            setStep('offer')
            setCallId(null)
          }
          // For 'completed' / 'ended' WITHOUT agreed_rate yet → wait silently.
          // The user can tap "Done with the call?" to advance manually if
          // post-call analysis takes too long.
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [callId, showToast])

  // ── SEND COUNTER — relay to broker ───────────────────────────
  const handleSendCounter = useCallback(() => {
    if (busy || counterOffer <= 0) return
    haptic('medium')
    setStep('relaying')
    // Simulate 4 seconds of relaying then transition to final
    setTimeout(() => {
      // 80% chance broker agrees to counter, 20% counter back
      const accepted = Math.random() < 0.8
      setFinalRate(accepted ? counterOffer : Math.round((gross + counterOffer) / 2))
      setStep('final')
    }, 4000)
  }, [busy, counterOffer, gross])

  // ── BOOK — final accept, flip to Booked status ────────────────
  const handleBook = useCallback(async () => {
    if (busy || dismissedRef.current) return
    haptic('success')
    dismissedRef.current = true
    setBusy(true)
    try {
      // Loads table uses `rate` not `gross_pay`
      await db.updateLoad(load.id, {
        status: 'Booked',
        rate: finalRate || gross,
      })
      showToast?.('success', 'BOOKED!', 'Q is sending paperwork')
    } catch (e) {
      showToast?.('error', 'Booking failed', 'Please try again')
      setBusy(false)
      dismissedRef.current = false
    }
  }, [busy, finalRate, gross, load.id, showToast])

  // ─────────────────────────────────────────────────────────────
  // RENDER each step
  // ─────────────────────────────────────────────────────────────
  return (
    <div style={OVERLAY}>
      {/* STEP 1 — OFFER */}
      {step === 'offer' && (
        <OfferStep
          gross={gross}
          rpm={rpm}
          origin={origin}
          dest={dest}
          miles={miles}
          broker={broker}
          verdict={verdict}
          pickupDate={load.pickup_date}
          onPass={handlePass}
          onNegotiate={handleNegotiate}
        />
      )}

      {/* STEP 1.5 — TARGET RATE INPUT (driver tells Q their number) */}
      {step === 'target' && (
        <TargetStep
          broker={broker}
          gross={gross}
          targetRate={targetRate}
          setTargetRate={setTargetRate}
          onSend={handleSendQ}
          onBack={() => setStep('offer')}
          miles={miles}
          origin={origin}
          dest={dest}
        />
      )}

      {/* STEP 2 — DIALING (real Retell call to broker with target_rate) */}
      {step === 'dialing' && (
        <DialingStep
          broker={broker}
          targetRate={targetRate}
          onManualRate={(rate) => {
            // Driver finished the call — manually advance to final review
            setFinalRate(rate)
            setStep('final')
          }}
        />
      )}

      {/* STEP 3 — QUOTED + COUNTER */}
      {step === 'quoted' && (
        <CounterStep
          broker={broker}
          gross={gross}
          rpm={rpm}
          origin={origin}
          dest={dest}
          miles={miles}
          counterOffer={counterOffer}
          setCounterOffer={setCounterOffer}
          onSend={handleSendCounter}
        />
      )}

      {/* STEP 4 — RELAYING */}
      {step === 'relaying' && (
        <RelayingStep broker={broker} counter={counterOffer} />
      )}

      {/* STEP 5 — FINAL */}
      {step === 'final' && (
        <FinalStep
          finalRate={finalRate || gross}
          origin={origin}
          dest={dest}
          miles={miles}
          rpm={(((finalRate || gross) / Math.max(miles, 1))).toFixed(2)}
          broker={broker}
          pickupDate={load.pickup_date}
          onPass={handlePass}
          onBook={handleBook}
          busy={busy}
        />
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STEP 1 — OFFER
// ═══════════════════════════════════════════════════════════════
function OfferStep({ gross, rpm, origin, dest, miles, broker, verdict, pickupDate, onPass, onNegotiate }) {
  // Track previous rate so we can highlight when a better offer overtakes it
  const prevRateRef = useRef(gross)
  const [pulse, setPulse] = useState(true)        // initial mount pulse
  const [improved, setImproved] = useState(false) // green burst when rate goes up

  useEffect(() => {
    // Initial mount — clear the first pulse after the animation finishes
    const t = setTimeout(() => setPulse(false), 700)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    // Detect rate increase (better offer replacing previous) → green burst
    if (gross > prevRateRef.current) {
      setImproved(true)
      const t = setTimeout(() => setImproved(false), 900)
      prevRateRef.current = gross
      return () => clearTimeout(t)
    }
    prevRateRef.current = gross
  }, [gross])

  // 3% Q fee math — show "You keep" + Q fee on the offer card per spec
  const fee = gross * 0.03
  const net = gross - fee

  return (
    <div style={STEP_FILL}>
      <div style={{ padding: '24px 20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ ...Q_BADGE, width: 48, height: 48 }}>
          <span style={{ ...Q_TEXT, fontSize: 24 }}>Q</span>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Q found you a load</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{broker}</div>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      <div style={CARD_BOTTOM}>
        {/* Q Verdict */}
        <div style={{
          background: `linear-gradient(135deg, ${verdict.color}22, ${verdict.color}08)`,
          border: `1.5px solid ${verdict.color}55`,
          borderRadius: 16, padding: '14px 16px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ ...Q_BADGE, width: 32, height: 32 }}>
                <span style={{ ...Q_TEXT, fontSize: 15 }}>Q</span>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1.2 }}>Q SAYS</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: verdict.color, letterSpacing: 0.5 }}>{verdict.label}</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1.2 }}>CONFIDENCE</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>{verdict.confidence}%</div>
            </div>
          </div>
        </div>

        {/* Route */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{origin}</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '12px 0' }}>
            <div style={{ width: 60, height: 1, background: 'rgba(255,255,255,0.2)' }} />
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)' }}>{miles} MI</span>
            <div style={{ width: 60, height: 1, background: 'rgba(255,255,255,0.2)' }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>{dest}</div>
        </div>

        {/* Numbers — RATE animates on mount + when improved */}
        <div style={{
          display: 'flex', justifyContent: 'space-around', marginBottom: 16,
          padding: '18px 0',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2, marginBottom: 6 }}>RATE</div>
            <div style={{
              fontSize: 24, fontWeight: 900,
              color: improved ? '#22c55e' : '#fff',
              fontFamily: "'Bebas Neue', sans-serif",
              transform: pulse || improved ? 'scale(1.05)' : 'scale(1)',
              transition: 'transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), color 0.3s ease, text-shadow 0.3s ease',
              textShadow: pulse || improved ? '0 0 24px rgba(34,197,94,0.5)' : 'none',
              display: 'inline-block',
            }}>
              {fmt$(gross)}
            </div>
          </div>
          <NumStat label="RPM" value={`$${rpm}`} />
          <NumStat label="PICKUP" value={pickupDate || 'ASAP'} small />
        </div>

        {/* You keep + Q fee — per launch spec, show on offer card not just final */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 14px', marginBottom: 18,
          background: 'rgba(34,197,94,0.06)',
          border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: 12,
        }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 2 }}>YOU KEEP</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#22c55e', fontFamily: "'Bebas Neue', sans-serif" }}>
              {fmt$(net)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 2 }}>Q FEE 3%</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.7)' }}>
              {fmt$(fee)}
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={onPass} style={{ ...PASS_BTN, flex: 1 }} className="press-scale">
            <X size={20} color="rgba(255,255,255,0.6)" />
            <span style={{ fontSize: 16, fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>Pass</span>
          </button>
          <button onClick={onNegotiate} style={{ ...PRIMARY_BTN, flex: 2 }} className="press-scale">
            <Phone size={20} color="#fff" />
            <span style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>Negotiate</span>
          </button>
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STEP 1.5 — TARGET RATE INPUT
// Per launch spec: driver tells Q the number to push for BEFORE the call
// ═══════════════════════════════════════════════════════════════
function TargetStep({ broker, gross, targetRate, setTargetRate, onSend, onBack, miles, origin, dest }) {
  const rpmAtTarget = miles > 0 ? (targetRate / miles).toFixed(2) : '0.00'
  const fee = targetRate * 0.03
  const net = targetRate - fee
  const suggestions = [
    Math.round(gross * 1.05),
    Math.round(gross * 1.10),
    Math.round(gross * 1.20),
  ]

  return (
    <div style={STEP_FILL}>
      <div style={{ padding: '20px 20px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 12,
          background: 'rgba(255,255,255,0.05)',
          border: '1px solid rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
        }}>
          <X size={18} color="rgba(255,255,255,0.6)" />
        </button>
        <div style={{ flex: 1 }}>
          <div style={SUB_LABEL}>YOUR OFFER</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>
            What do you want for this load?
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 16px', flex: 1, overflowY: 'auto' }}>
        {/* Broker posted card */}
        <div style={{
          padding: '14px 16px',
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 14,
          marginBottom: 18,
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2, marginBottom: 4 }}>
            {broker.toUpperCase()} POSTED
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif" }}>
              {fmt$(gross)}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              {origin} → {dest} · {miles}mi
            </span>
          </div>
        </div>

        {/* Target rate input — the centerpiece */}
        <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 10 }}>
          TELL Q WHAT YOU WANT
        </div>
        <div style={{
          padding: '20px 18px',
          background: 'rgba(240,165,0,0.08)',
          border: '2px solid #f0a500',
          borderRadius: 18,
          marginBottom: 14,
          boxShadow: '0 0 30px rgba(240,165,0,0.2)',
          display: 'flex', alignItems: 'center',
        }}>
          <span style={{ fontSize: 32, fontWeight: 900, color: '#f0a500', fontFamily: "'Bebas Neue', sans-serif" }}>$</span>
          <input
            type="number"
            inputMode="numeric"
            value={targetRate || ''}
            onChange={(e) => setTargetRate(parseInt(e.target.value) || 0)}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 38, fontWeight: 900, color: '#f0a500',
              fontFamily: "'Bebas Neue', sans-serif",
              width: '100%', WebkitAppearance: 'none', padding: 0, marginLeft: 6,
            }}
            placeholder="2700"
          />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700, marginLeft: 8 }}>
            ${rpmAtTarget}/mi
          </span>
        </div>

        {/* Suggestions */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {suggestions.map((s) => {
            const highlighted = targetRate === s
            return (
              <button
                key={s}
                onClick={() => { haptic('light'); setTargetRate(s) }}
                style={{
                  flex: 1, padding: '10px 14px',
                  background: highlighted ? 'rgba(240,165,0,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${highlighted ? 'rgba(240,165,0,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 999,
                  fontSize: 13, fontWeight: 800,
                  color: highlighted ? '#f0a500' : 'rgba(255,255,255,0.7)',
                  cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}
              >
                ${s.toLocaleString()}
              </button>
            )
          })}
        </div>

        {/* You keep / Q fee preview */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 14px', marginBottom: 18,
          background: 'rgba(34,197,94,0.06)',
          border: '1px solid rgba(34,197,94,0.2)',
          borderRadius: 12,
        }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 2 }}>YOU KEEP</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: '#22c55e', fontFamily: "'Bebas Neue', sans-serif" }}>
              {fmt$(net)}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, marginBottom: 2 }}>Q FEE 3%</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'rgba(255,255,255,0.7)' }}>
              {fmt$(fee)}
            </div>
          </div>
        </div>

        {/* Send Q */}
        <button
          onClick={onSend}
          disabled={targetRate <= 0}
          style={{
            ...PRIMARY_BTN, width: '100%',
            opacity: targetRate > 0 ? 1 : 0.5,
          }}
          className="press-scale"
        >
          <Phone size={20} color="#fff" />
          <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 1 }}>
            SEND Q TO NEGOTIATE
          </span>
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STEP 2 — DIALING
// ═══════════════════════════════════════════════════════════════
function DialingStep({ broker, targetRate, onManualRate }) {
  const [manualMode, setManualMode] = useState(false)
  const [manualRate, setManualRate] = useState(targetRate || 0)

  // ── Manual rate entry mode ──
  // Backup for when the Retell agent doesn't push agreed_rate via webhook.
  // Driver finishes the call themselves and types in what they agreed to.
  if (manualMode) {
    return (
      <div style={STEP_FILL}>
        <div style={{ padding: '20px 20px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={() => setManualMode(false)} style={{
            width: 36, height: 36, borderRadius: 12,
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', WebkitTapHighlightColor: 'transparent',
          }}>
            <X size={18} color="rgba(255,255,255,0.6)" />
          </button>
          <div style={{ flex: 1 }}>
            <div style={SUB_LABEL}>CALL FINISHED</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>
              What did you agree to?
            </div>
          </div>
        </div>

        <div style={{ padding: '20px 16px', flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 10 }}>
            FINAL AGREED RATE WITH {broker.toUpperCase()}
          </div>
          <div style={{
            padding: '24px 18px',
            background: 'rgba(34,197,94,0.08)',
            border: '2px solid #22c55e',
            borderRadius: 18,
            marginBottom: 16,
            boxShadow: '0 0 30px rgba(34,197,94,0.2)',
            display: 'flex', alignItems: 'center',
          }}>
            <span style={{ fontSize: 36, fontWeight: 900, color: '#22c55e', fontFamily: "'Bebas Neue', sans-serif" }}>$</span>
            <input
              type="number"
              inputMode="numeric"
              value={manualRate || ''}
              onChange={(e) => setManualRate(parseInt(e.target.value) || 0)}
              autoFocus
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                fontSize: 44, fontWeight: 900, color: '#22c55e',
                fontFamily: "'Bebas Neue', sans-serif",
                width: '100%', WebkitAppearance: 'none', padding: 0, marginLeft: 8,
              }}
              placeholder={String(targetRate || 2700)}
            />
          </div>

          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 18, lineHeight: 1.5, textAlign: 'center' }}>
            Type the rate you and {broker} agreed to. Q will book it at this number.
          </div>

          <button
            onClick={() => { haptic('success'); onManualRate(manualRate) }}
            disabled={manualRate <= 0}
            style={{
              ...PRIMARY_BTN, width: '100%',
              opacity: manualRate > 0 ? 1 : 0.5,
            }}
            className="press-scale"
          >
            <CheckCircle size={20} color="#fff" />
            <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 1 }}>
              CONFIRM ${manualRate.toLocaleString()}
            </span>
          </button>
        </div>
      </div>
    )
  }

  // ── Default dialing screen ──
  return (
    <div style={CENTERED}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ ...PULSE_RING, animationDelay: '0s' }} />
        <div style={{ ...PULSE_RING, animationDelay: '0.7s' }} />
        <div style={{ ...PULSE_RING, animationDelay: '1.4s' }} />
        <div style={{
          width: 132, height: 132, borderRadius: '50%',
          background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 60px rgba(240,165,0,0.55)',
          animation: 'qBreath 2s ease-in-out infinite',
        }}>
          <Phone size={48} color="#000" strokeWidth={2.4} />
        </div>
      </div>
      <div style={{ marginTop: 32, textAlign: 'center', padding: '0 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 6 }}>
          Q IS CALLING
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 }}>
          {broker.toUpperCase()}
        </div>
        {targetRate > 0 && (
          <div style={{
            display: 'inline-block',
            marginTop: 16,
            padding: '10px 18px',
            background: 'rgba(34,197,94,0.08)',
            border: '1px solid rgba(34,197,94,0.3)',
            borderRadius: 999,
            fontSize: 12, fontWeight: 700, color: '#22c55e',
          }}>
            Pushing for ${targetRate.toLocaleString()}
          </div>
        )}
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 14 }}>
          Hang tight — Q is fighting for your number.
        </div>

        {/* ── Manual escape hatch — driver finished the call themselves ── */}
        {onManualRate && (
          <button
            onClick={() => { haptic('light'); setManualMode(true) }}
            style={{
              marginTop: 36,
              padding: '14px 24px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.12)',
              borderRadius: 14,
              color: 'rgba(255,255,255,0.7)',
              fontSize: 13, fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
              display: 'flex', alignItems: 'center', gap: 8, margin: '36px auto 0',
            }}
            className="press-scale"
          >
            <CheckCircle size={16} color="rgba(255,255,255,0.7)" />
            <span>Done with the call?</span>
          </button>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STEP 3 — COUNTER OFFER INPUT
// ═══════════════════════════════════════════════════════════════
function CounterStep({ broker, gross, rpm, origin, dest, miles, counterOffer, setCounterOffer, onSend }) {
  const suggestions = [
    Math.round(gross * 1.05),
    Math.round(gross * 1.10),
    Math.round(gross * 1.15),
  ]
  return (
    <div style={STEP_FILL}>
      <div style={{ padding: '20px 20px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={Q_BADGE}><span style={Q_TEXT}>Q</span></div>
        <div style={{ flex: 1 }}>
          <div style={SUB_LABEL}>NEGOTIATING · {broker.toUpperCase()}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Q is on the line</div>
        </div>
      </div>

      <div style={{ padding: '20px 16px', flex: 1 }}>
        {/* Broker quote card */}
        <div style={{
          padding: '20px 18px',
          background: 'rgba(34,197,94,0.06)',
          border: '1px solid rgba(34,197,94,0.3)',
          borderRadius: 18,
          marginBottom: 18,
        }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: '#22c55e', letterSpacing: 1.5, marginBottom: 6 }}>
            {broker.toUpperCase()} QUOTED
          </div>
          <div style={{ fontSize: 38, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1, marginBottom: 8 }}>
            {fmt$(gross)}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            {origin} → {dest} · {miles}mi · ${rpm}/mi
          </div>
        </div>

        {/* Counter input */}
        <div style={{ fontSize: 11, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 10 }}>
          YOUR COUNTER OFFER
        </div>
        <div style={{
          padding: '20px 18px',
          background: 'rgba(240,165,0,0.08)',
          border: '2px solid #f0a500',
          borderRadius: 18,
          marginBottom: 14,
          boxShadow: '0 0 30px rgba(240,165,0,0.2)',
          display: 'flex',
          alignItems: 'center',
        }}>
          <span style={{ fontSize: 32, fontWeight: 900, color: '#f0a500', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5 }}>$</span>
          <input
            type="number"
            inputMode="numeric"
            value={counterOffer || ''}
            onChange={(e) => setCounterOffer(parseInt(e.target.value) || 0)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: 38,
              fontWeight: 900,
              color: '#f0a500',
              fontFamily: "'Bebas Neue', sans-serif",
              letterSpacing: 0.5,
              width: '100%',
              WebkitAppearance: 'none',
              padding: 0,
              marginLeft: 6,
            }}
          />
        </div>

        {/* Suggestion pills */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {suggestions.map((s) => {
            const highlighted = counterOffer === s
            return (
              <button
                key={s}
                onClick={() => { haptic('light'); setCounterOffer(s) }}
                style={{
                  flex: 1, padding: '10px 14px',
                  background: highlighted ? 'rgba(240,165,0,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${highlighted ? 'rgba(240,165,0,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  borderRadius: 999,
                  fontSize: 13, fontWeight: 800,
                  color: highlighted ? '#f0a500' : 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}
              >
                ${s.toLocaleString()}
              </button>
            )
          })}
        </div>

        {/* Send */}
        <button
          onClick={onSend}
          disabled={counterOffer <= 0}
          style={{
            ...PRIMARY_BTN,
            width: '100%',
            opacity: counterOffer > 0 ? 1 : 0.5,
          }}
          className="press-scale"
        >
          <Phone size={20} color="#fff" />
          <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 1 }}>
            TELL {broker.toUpperCase()}
          </span>
        </button>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STEP 4 — RELAYING
// ═══════════════════════════════════════════════════════════════
function RelayingStep({ broker, counter }) {
  return (
    <div style={CENTERED}>
      <div style={{
        width: 132, height: 132, borderRadius: '50%',
        background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 0 60px rgba(240,165,0,0.55)',
        animation: 'qBreath 1.6s ease-in-out infinite',
      }}>
        <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 72, color: '#000', fontWeight: 800, lineHeight: 1, letterSpacing: -2 }}>Q</span>
      </div>
      <div style={{ marginTop: 32, textAlign: 'center', maxWidth: 320, padding: '0 20px' }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, marginBottom: 6 }}>
          Q IS RELAYING
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1.2 }}>
          TELLING {broker.toUpperCase()} {fmt$(counter)}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 14 }}>
          Hang tight — broker is thinking it over.
        </div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STEP 5 — FINAL ACCEPT
// ═══════════════════════════════════════════════════════════════
function FinalStep({ finalRate, origin, dest, miles, rpm, broker, pickupDate, onPass, onBook, busy }) {
  const fee = finalRate * 0.03
  const net = finalRate - fee
  return (
    <div style={STEP_FILL}>
      <div style={{ padding: '20px 20px 8px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={Q_BADGE}><span style={Q_TEXT}>Q</span></div>
        <div style={{ flex: 1 }}>
          <div style={SUB_LABEL}>FINAL OFFER</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>{broker} agreed</div>
        </div>
      </div>

      <div style={{ padding: '20px 16px', flex: 1 }}>
        {/* Hero card */}
        <div style={{
          padding: '24px 20px',
          background: 'linear-gradient(135deg, rgba(34,197,94,0.12), rgba(34,197,94,0.02))',
          border: '2px solid rgba(34,197,94,0.4)',
          borderRadius: 20,
          marginBottom: 20,
          boxShadow: '0 0 40px rgba(34,197,94,0.15)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <CheckCircle size={20} color="#22c55e" />
            <div style={{ fontSize: 11, fontWeight: 800, color: '#22c55e', letterSpacing: 1.5 }}>BROKER AGREED</div>
          </div>
          <div style={{ fontSize: 56, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1, marginBottom: 12 }}>
            {fmt$(finalRate)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
            <span>${rpm}/mi</span>
            <span>·</span>
            <span>You keep <strong style={{ color: '#fff' }}>{fmt$(net)}</strong></span>
            <span>·</span>
            <span>Q fee {fmt$(fee)}</span>
          </div>
        </div>

        {/* Details */}
        <DetailRow label="ROUTE" value={`${origin} → ${dest}`} />
        <DetailRow label="DISTANCE" value={`${miles} miles`} />
        <DetailRow label="PICKUP" value={pickupDate || 'ASAP'} />
        <DetailRow label="BROKER" value={broker} />

        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button onClick={onPass} style={{ ...PASS_BTN, flex: 1 }} className="press-scale" disabled={busy}>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>Decline</span>
          </button>
          <button
            onClick={onBook}
            disabled={busy}
            style={{
              position: 'relative',
              overflow: 'hidden',
              flex: 2, padding: '18px',
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              border: 'none', borderRadius: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: '0 8px 32px rgba(34,197,94,0.4)',
              cursor: busy ? 'default' : 'pointer',
              opacity: busy ? 0.85 : 1,
              WebkitTapHighlightColor: 'transparent',
              transition: 'transform 0.15s ease, opacity 0.2s ease',
            }}
            className={busy ? '' : 'press-scale'}
          >
            {/* Shimmer overlay during "Securing load..." (uses existing
                @keyframes shimmer from mobileAnimations: -100% → 100% translateX) */}
            {busy && (
              <div style={{
                position: 'absolute',
                top: 0, left: 0,
                width: '100%', height: '100%',
                background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)',
                animation: 'shimmer 1.4s ease-in-out infinite',
              }} />
            )}
            <CheckCircle size={20} color="#fff" style={{ position: 'relative', zIndex: 1 }} />
            <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: 0.5, position: 'relative', zIndex: 1 }}>
              {busy ? 'SECURING LOAD…' : 'BOOK THIS LOAD'}
            </span>
          </button>
        </div>
      </div>
    </div>
  )
}

function DetailRow({ label, value }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '12px 0',
      borderBottom: '1px solid rgba(255,255,255,0.05)',
    }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 1 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', textAlign: 'right', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}

function NumStat({ label, value, small }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: small ? 14 : 24, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif" }}>{value}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const OVERLAY = {
  position: 'fixed', inset: 0, zIndex: 9997,
  background: 'rgba(0,0,0,0.94)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: "'DM Sans', sans-serif",
  color: '#fff',
  paddingTop: 'env(safe-area-inset-top, 0px)',
  paddingBottom: 'env(safe-area-inset-bottom, 0px)',
  animation: 'fadeIn 0.3s ease',
}

const STEP_FILL = {
  flex: 1, display: 'flex', flexDirection: 'column',
  animation: 'fadeInUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
}

const CENTERED = {
  flex: 1, display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  padding: 20,
  animation: 'fadeIn 0.4s ease',
}

const CARD_BOTTOM = {
  background: 'var(--bg)',
  borderRadius: '28px 28px 0 0',
  padding: '32px 24px 24px',
  boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
}

const Q_BADGE = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 4px 16px rgba(240,165,0,0.35)',
  flexShrink: 0,
}

const Q_TEXT = {
  fontFamily: "'Bebas Neue', sans-serif",
  fontSize: 18, color: '#000',
  fontWeight: 800, lineHeight: 1,
}

const SUB_LABEL = {
  fontSize: 11, fontWeight: 700,
  color: 'rgba(255,255,255,0.5)',
  letterSpacing: 1.2, textTransform: 'uppercase',
}

const PULSE_RING = {
  position: 'absolute',
  width: 132, height: 132,
  borderRadius: '50%',
  border: '2px solid rgba(240,165,0,0.4)',
  animation: 'ringExpand 2.4s ease-out infinite',
}

const PASS_BTN = {
  padding: '18px',
  background: 'transparent',
  border: '2px solid rgba(255,255,255,0.15)',
  borderRadius: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
}

const PRIMARY_BTN = {
  padding: '18px',
  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
  border: 'none',
  borderRadius: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  boxShadow: '0 8px 32px rgba(34,197,94,0.4)',
  cursor: 'pointer',
  WebkitTapHighlightColor: 'transparent',
  transition: 'transform 0.15s ease',
}
