/**
 * AutoMockup — full visual walkthrough of the Autonomous Fleet (3%) app
 *
 * Vertical scrollable preview of every key screen in the AutoShell vision.
 * No backend, no real data — pure UI mockup. Used to lock in design before
 * committing to full implementation.
 *
 * Routed via URL hash #mockup at the top of App.jsx.
 *
 * Each "screen" is rendered inside a phone-frame card so you can see it
 * the way an OO would on their phone, all in one scroll.
 */
import { useState, useEffect } from 'react'
import {
  Power, Search, Brain, Phone, TrendingUp, MapPin, Zap, Activity,
  CheckCircle, X, Navigation, Home as HomeIcon, ChevronRight,
  Truck, Camera, Clock, DollarSign, Settings as SettingsIcon,
  AlertTriangle, ArrowRight, Calendar, User
} from 'lucide-react'
import { Ic, mobileAnimations } from '../mobile/shared'

export default function AutoMockup() {
  // Inject animations
  useEffect(() => {
    const id = 'auto-mockup-anims'
    if (document.getElementById(id)) return
    const style = document.createElement('style')
    style.id = id
    style.textContent = mobileAnimations + EXTRA_ANIMS
    document.head.appendChild(style)
  }, [])

  return (
    <div style={PAGE}>
      {/* Header banner */}
      <div style={HEADER}>
        <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 6 }}>
          Mockup Preview
        </div>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1, marginBottom: 8 }}>
          QIVORI · AUTONOMOUS
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', maxWidth: 420, lineHeight: 1.5 }}>
          Full visual walkthrough of every screen in the Autonomous Fleet (3%) app.
          Scroll to see the entire flow — from offline, to hunting, to negotiating, to delivered.
        </div>
      </div>

      {/* All screens in sequence */}
      <Section number="1" title="HOME · OFFLINE" desc="Cold start. Driver opens app, hasn't tapped go online yet.">
        <Screen1Offline />
      </Section>

      <Section number="2" title="WHERE TO NEXT?" desc="Driver tapped GO ONLINE — bottom sheet asks intent before Q starts hunting.">
        <Screen2WhereTo />
      </Section>

      <Section number="3" title="HOME · HUNTING" desc="Driver picked Anywhere. Q is now scanning load boards in parallel. Live activity updates every 2.5s.">
        <Screen3Hunting />
      </Section>

      <Section number="4" title="LOAD OFFER" desc="Q found a high-scoring load. Fullscreen takeover. Q says GO with confidence. Tap Negotiate to start the call.">
        <Screen4Offer />
      </Section>

      <Section number="5" title="PARALLEL DIAL — Q IS QUICK" desc="Driver tapped Negotiate. Q dials 3 brokers SIMULTANEOUSLY. First to answer wins. This is the moat.">
        <Screen5Negotiating />
      </Section>

      <Section number="6" title="BROKER QUOTED · COUNTER OFFER" desc="Werner picked up first. Q reports the rate. Driver types a counter offer. Q relays it on the call.">
        <Screen6Counter />
      </Section>

      <Section number="7" title="FINAL ACCEPT" desc="Broker agreed to $2,500. Driver reviews and locks in. Q sends paperwork. Booked.">
        <Screen7Final />
      </Section>

      <Section number="8" title="ACTIVE LOAD" desc="Load is booked, driver is rolling. One screen, one decision at a time. Status timeline shows progress.">
        <Screen8Active />
      </Section>

      <Section number="9" title="EARNINGS" desc="Delivered loads aggregate here. Net = gross minus 3% Q fee. Period tabs let driver see week/month/all-time.">
        <Screen9Earnings />
      </Section>

      <Section number="10" title="SETTINGS" desc="Five rows. Profile card shows AUTONOMOUS · 3% per load badge. Switch to TMS escape hatch.">
        <Screen10Settings />
      </Section>

      <div style={{ padding: '60px 24px', textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 700, letterSpacing: 1 }}>
        QIVORI · Q stands for Quick · Mockup v1
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// PHONE FRAME WRAPPER
// ═══════════════════════════════════════════════════════════════
function Section({ number, title, desc, children }) {
  return (
    <div style={SECTION}>
      <div style={SECTION_HEADER}>
        <div style={NUMBER_BADGE}>{number}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
            {title}
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, lineHeight: 1.5, maxWidth: 420 }}>
            {desc}
          </div>
        </div>
      </div>
      <div style={PHONE_FRAME}>
        {children}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 1 — HOME OFFLINE
// ═══════════════════════════════════════════════════════════════
function Screen1Offline() {
  return (
    <div style={PHONE_BG}>
      <div style={TOP_BAR}>
        <div style={Q_BADGE_DIM}>
          <span style={Q_TEXT_DIM}>Q</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={SUB_LABEL}>QIVORI · AUTONOMOUS</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.45)' }}>You are offline</div>
        </div>
        <Pill text="OFF" color="rgba(255,255,255,0.4)" />
      </div>
      <div style={CENTER}>
        <div style={Q_LARGE_DIM}>
          <span style={Q_LARGE_TEXT_DIM}>Q</span>
        </div>
        <div style={{ marginTop: 32, textAlign: 'center' }}>
          <div style={HEADLINE}>Q IS YOUR DISPATCHER</div>
          <div style={SUBTEXT}>Tap below to go online and let Q find, negotiate, and book your next load.</div>
        </div>
      </div>
      <div style={{ padding: '8px 24px 16px' }}>
        <button style={GO_BTN_GOLD}>
          <Power size={20} color="#fff" strokeWidth={2.6} />
          <span>GO ONLINE</span>
        </button>
      </div>
      <EarningsStrip net="$0" loads="0" />
      <BottomNav active="home" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 2 — WHERE TO BOTTOM SHEET
// ═══════════════════════════════════════════════════════════════
function Screen2WhereTo() {
  return (
    <div style={{ ...PHONE_BG, position: 'relative' }}>
      {/* Background — dimmed home */}
      <div style={{ ...TOP_BAR, opacity: 0.3 }}>
        <div style={Q_BADGE_DIM}><span style={Q_TEXT_DIM}>Q</span></div>
      </div>
      <div style={{ ...CENTER, opacity: 0.3 }}>
        <div style={Q_LARGE_DIM}><span style={Q_LARGE_TEXT_DIM}>Q</span></div>
      </div>
      {/* Sheet */}
      <div style={SHEET_OVERLAY}>
        <div style={SHEET}>
          <div style={SHEET_HANDLE} />
          <div style={{ padding: '8px 24px 16px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--accent)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 4 }}>
              GOING ONLINE
            </div>
            <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1.1 }}>
              WHERE TO NEXT?
            </div>
          </div>
          <div style={{ padding: '0 16px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <SheetOption icon={Navigation} title="Anywhere" sub="Maximum load options · Q hunts in every direction" color="#f0a500" highlighted />
            <SheetOption icon={HomeIcon} title="Toward home — Dallas, TX" sub="Q filters loads heading toward your home base" color="#22c55e" />
            <SheetOption icon={MapPin} title="Specific destination" sub="Tell Q exactly where you want to head" color="#3b82f6" />
          </div>
        </div>
      </div>
    </div>
  )
}

function SheetOption({ icon: Icon, title, sub, color, highlighted }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 16px',
      background: highlighted ? `${color}15` : 'rgba(255,255,255,0.03)',
      border: `1px solid ${highlighted ? color + '55' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 16,
    }}>
      <div style={{
        width: 48, height: 48, borderRadius: 14,
        background: `${color}1a`,
        border: `1px solid ${color}33`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon size={22} color={color} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#fff', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.4 }}>{sub}</div>
      </div>
      <ChevronRight size={18} color="rgba(255,255,255,0.3)" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 3 — HOME ONLINE / HUNTING
// ═══════════════════════════════════════════════════════════════
function Screen3Hunting() {
  return (
    <div style={PHONE_BG}>
      <div style={TOP_BAR}>
        <div style={Q_BADGE_GOLD}>
          <span style={Q_TEXT_GOLD}>Q</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={SUB_LABEL}>QIVORI · AUTONOMOUS</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>Q is hunting</div>
        </div>
        <Pill text="LIVE" color="#22c55e" pulse />
      </div>
      <div style={CENTER}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...PULSE_RING, animationDelay: '0s' }} />
          <div style={{ ...PULSE_RING, animationDelay: '0.7s' }} />
          <div style={Q_LARGE_GOLD}>
            <span style={Q_LARGE_TEXT_GOLD}>Q</span>
          </div>
        </div>
        <div style={{ marginTop: 28, textAlign: 'center' }}>
          <div style={ACTIVITY_PILL}>
            <Search size={14} color="#22c55e" />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#22c55e' }}>Scanning DAT load board</span>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: 0.3, marginTop: 10 }}>
            Q will alert you the moment a load is worth taking.
          </div>
        </div>
      </div>
      <div style={{ padding: '8px 24px 16px' }}>
        <button style={GO_BTN_RED}>
          <Power size={20} color="#fff" strokeWidth={2.6} />
          <span>GO OFFLINE</span>
        </button>
      </div>
      <EarningsStrip net="$0" loads="0" />
      <BottomNav active="home" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 4 — LOAD OFFER POPUP
// ═══════════════════════════════════════════════════════════════
function Screen4Offer() {
  return (
    <div style={{ ...PHONE_BG, background: 'rgba(0,0,0,0.92)' }}>
      <div style={{ padding: '24px 20px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ ...Q_BADGE_GOLD, width: 48, height: 48 }}>
          <span style={{ ...Q_TEXT_GOLD, fontSize: 24 }}>Q</span>
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Q found you a load</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Werner Enterprises · Dry Van</div>
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{
        background: 'var(--bg)', borderRadius: '28px 28px 0 0',
        padding: '32px 24px 24px',
      }}>
        {/* Q Verdict strip */}
        <div style={{
          background: 'linear-gradient(135deg, #22c55e22, #22c55e08)',
          border: '1.5px solid #22c55e55',
          borderRadius: 16, padding: '14px 16px', marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ ...Q_BADGE_GOLD, width: 32, height: 32 }}>
                <span style={{ ...Q_TEXT_GOLD, fontSize: 15 }}>Q</span>
              </div>
              <div>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1.2 }}>Q SAYS</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: '#22c55e', letterSpacing: 0.5 }}>STRONG GO</div>
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 700, letterSpacing: 1.2 }}>CONFIDENCE</div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>87%</div>
            </div>
          </div>
          <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', marginBottom: 6 }}>
            $0.30 above market RPM · low deadhead
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.5 }}>
            · Werner is a 92-rated broker · 12% premium vs lane average
          </div>
        </div>
        {/* Route */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>Atlanta</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, margin: '12px 0' }}>
            <div style={{ width: 60, height: 1, background: 'rgba(255,255,255,0.2)' }} />
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1.5, color: 'rgba(255,255,255,0.5)' }}>925 MI</span>
            <div style={{ width: 60, height: 1, background: 'rgba(255,255,255,0.2)' }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1.1 }}>Dallas</div>
        </div>
        {/* Numbers row */}
        <div style={{
          display: 'flex', justifyContent: 'space-around', marginBottom: 24,
          padding: '18px 0', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}>
          <NumStat label="RATE" value="$2,500" />
          <NumStat label="RPM" value="$2.70" />
          <NumStat label="PICKUP" value="Tomorrow" small />
        </div>
        {/* Buttons */}
        <div style={{ display: 'flex', gap: 12 }}>
          <button style={{ ...PASS_BTN, flex: 1 }}>
            <X size={20} color="rgba(255,255,255,0.6)" />
            <span style={{ fontSize: 16, fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>Pass</span>
          </button>
          <button style={{ ...NEGOTIATE_BTN, flex: 2 }}>
            <Phone size={20} color="#fff" />
            <span style={{ fontSize: 16, fontWeight: 900, color: '#fff' }}>Negotiate</span>
          </button>
        </div>
      </div>
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
// SCREEN 5 — PARALLEL DIAL (Q IS QUICK)
// ═══════════════════════════════════════════════════════════════
function Screen5Negotiating() {
  return (
    <div style={PHONE_BG}>
      <div style={TOP_BAR}>
        <div style={Q_BADGE_GOLD}><span style={Q_TEXT_GOLD}>Q</span></div>
        <div style={{ flex: 1 }}>
          <div style={SUB_LABEL}>NEGOTIATING</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>Q is on 3 calls</div>
        </div>
        <Pill text="LIVE" color="#f0a500" pulse />
      </div>
      <div style={{ padding: '20px 16px', flex: 1, overflow: 'auto' }}>
        <div style={{ fontSize: 22, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, marginBottom: 6 }}>
          Q IS DIALING IN PARALLEL
        </div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 20 }}>
          First broker to answer wins. Q stops the others automatically.
        </div>

        <CallCard
          status="connected"
          broker="Werner Enterprises"
          route="ATL → DFW · 925mi"
          rate="$2,400"
          time="picked up at 4s"
          isLeader
        />
        <CallCard
          status="connected"
          broker="CH Robinson"
          route="ATL → DFW · 925mi"
          rate="$2,200"
          time="picked up at 7s"
        />
        <CallCard
          status="ringing"
          broker="Schneider"
          route="ATL → DFW · 925mi"
          rate="—"
          time="ringing... 12s"
        />
        <CallCard
          status="dropped"
          broker="TQL"
          route="ATL → ORL · 540mi"
          rate="—"
          time="no answer · dropped"
        />
      </div>
      <BottomNav active="home" />
    </div>
  )
}

function CallCard({ status, broker, route, rate, time, isLeader }) {
  const statusColors = {
    connected: '#22c55e',
    ringing: '#f0a500',
    dropped: 'rgba(255,255,255,0.3)',
  }
  const c = statusColors[status]
  return (
    <div style={{
      padding: '14px 16px',
      background: isLeader ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.03)',
      border: `1px solid ${isLeader ? 'rgba(34,197,94,0.35)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 14,
      marginBottom: 8,
      opacity: status === 'dropped' ? 0.4 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 8, height: 8, borderRadius: '50%',
            background: c,
            boxShadow: status !== 'dropped' ? `0 0 8px ${c}` : 'none',
            animation: status === 'ringing' ? 'qStatusPulse 1s ease-in-out infinite' : 'none',
          }} />
          <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{broker}</span>
          {isLeader && (
            <span style={{ fontSize: 8, fontWeight: 800, color: '#22c55e', background: 'rgba(34,197,94,0.15)', padding: '2px 6px', borderRadius: 4, letterSpacing: 0.5 }}>
              LEADER
            </span>
          )}
        </div>
        <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif" }}>{rate}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>
        <span>{route}</span>
        <span>{time}</span>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 6 — COUNTER OFFER
// ═══════════════════════════════════════════════════════════════
function Screen6Counter() {
  return (
    <div style={PHONE_BG}>
      <div style={TOP_BAR}>
        <div style={Q_BADGE_GOLD}><span style={Q_TEXT_GOLD}>Q</span></div>
        <div style={{ flex: 1 }}>
          <div style={SUB_LABEL}>NEGOTIATING · WERNER</div>
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
          <div style={{ fontSize: 9, fontWeight: 800, color: '#22c55e', letterSpacing: 1.5, marginBottom: 6 }}>WERNER QUOTED</div>
          <div style={{ fontSize: 38, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1, marginBottom: 8 }}>
            $2,400
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
            ATL → DFW · 925mi · $2.59/mi
          </div>
        </div>

        {/* Counter offer input */}
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
        }}>
          <div style={{ fontSize: 38, fontWeight: 900, color: '#f0a500', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1 }}>
            $2,500
          </div>
        </div>

        {/* Quick suggestions */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <SuggestPill text="$2,300" />
          <SuggestPill text="$2,500" highlighted />
          <SuggestPill text="$2,700" />
        </div>

        {/* Send button */}
        <button style={{
          width: '100%', padding: '18px',
          background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
          border: 'none', borderRadius: 16,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          boxShadow: '0 8px 32px rgba(240,165,0,0.4)',
        }}>
          <Phone size={20} color="#fff" />
          <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 1 }}>
            TELL WERNER
          </span>
        </button>
      </div>
    </div>
  )
}

function SuggestPill({ text, highlighted }) {
  return (
    <div style={{
      flex: 1, padding: '10px 14px',
      background: highlighted ? 'rgba(240,165,0,0.15)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${highlighted ? 'rgba(240,165,0,0.4)' : 'rgba(255,255,255,0.08)'}`,
      borderRadius: 999,
      textAlign: 'center',
      fontSize: 13, fontWeight: 800,
      color: highlighted ? '#f0a500' : 'rgba(255,255,255,0.7)',
    }}>
      {text}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 7 — FINAL ACCEPT
// ═══════════════════════════════════════════════════════════════
function Screen7Final() {
  return (
    <div style={PHONE_BG}>
      <div style={TOP_BAR}>
        <div style={Q_BADGE_GOLD}><span style={Q_TEXT_GOLD}>Q</span></div>
        <div style={{ flex: 1 }}>
          <div style={SUB_LABEL}>FINAL OFFER</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>Werner agreed</div>
        </div>
      </div>
      <div style={{ padding: '20px 16px', flex: 1 }}>
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
            $2,500
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
            <span>$2.70/mi</span>
            <span>·</span>
            <span>You keep $2,425</span>
            <span>·</span>
            <span>Q fee $75</span>
          </div>
        </div>

        <DetailRow label="ROUTE" value="Atlanta, GA → Dallas, TX" />
        <DetailRow label="DISTANCE" value="925 miles" />
        <DetailRow label="EQUIPMENT" value="Dry Van" />
        <DetailRow label="PICKUP" value="Tomorrow · 8:00 AM" />
        <DetailRow label="BROKER" value="Werner Enterprises · MC# 12345" />

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button style={{ ...PASS_BTN, flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.6)' }}>Decline</span>
          </button>
          <button style={{
            flex: 2, padding: '18px',
            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
            border: 'none', borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            boxShadow: '0 8px 32px rgba(34,197,94,0.4)',
          }}>
            <CheckCircle size={20} color="#fff" />
            <span style={{ fontSize: 14, fontWeight: 900, color: '#fff', letterSpacing: 0.5 }}>BOOK THIS LOAD</span>
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
      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{value}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 8 — ACTIVE LOAD CARD (Option A)
// ═══════════════════════════════════════════════════════════════
function Screen8Active() {
  return (
    <div style={PHONE_BG}>
      <div style={TOP_BAR}>
        <div style={Q_BADGE_GOLD}><span style={Q_TEXT_GOLD}>Q</span></div>
        <div style={{ flex: 1 }}>
          <div style={SUB_LABEL}>ACTIVE LOAD</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#22c55e' }}>En route to pickup</div>
        </div>
        <Pill text="LIVE" color="#22c55e" pulse />
      </div>

      <div style={{ padding: '8px 16px 16px', flex: 1 }}>
        {/* Route */}
        <div style={{ textAlign: 'center', padding: '20px 0' }}>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1 }}>
            ATLANTA, GA
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 1.5, margin: '14px 0' }}>
            ↓ 925 MI ↓
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1 }}>
            DALLAS, TX
          </div>
        </div>

        {/* Numbers strip */}
        <div style={{
          display: 'flex', justifyContent: 'space-around',
          padding: '16px 0', margin: '4px 0 20px',
          borderTop: '1px solid rgba(255,255,255,0.08)',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
        }}>
          <NumStat label="RATE" value="$2,500" />
          <NumStat label="RPM" value="$2.70" />
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2, marginBottom: 6 }}>BROKER</div>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Werner</div>
          </div>
        </div>

        {/* Status timeline */}
        <div style={{ marginBottom: 24 }}>
          <Timeline />
        </div>

        {/* Big action button */}
        <button style={{
          width: '100%', padding: '20px',
          background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
          border: 'none', borderRadius: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          boxShadow: '0 12px 40px rgba(240,165,0,0.4)',
          marginBottom: 12,
        }}>
          <Truck size={22} color="#fff" />
          <span style={{ fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 1 }}>
            ARRIVED AT PICKUP
          </span>
        </button>

        {/* Secondary actions */}
        <div style={{ display: 'flex', gap: 10 }}>
          <SecondaryBtn icon={Phone} label="Call broker" />
          <SecondaryBtn icon={Camera} label="Upload BOL" />
        </div>
      </div>
      <BottomNav active="home" />
    </div>
  )
}

function Timeline() {
  const stops = [
    { label: 'Booked', done: true },
    { label: 'Pickup', done: false, current: true },
    { label: 'Loaded', done: false },
    { label: 'Delivered', done: false },
  ]
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
      {/* Connecting line */}
      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, height: 2, background: 'rgba(255,255,255,0.1)', zIndex: 0 }} />
      <div style={{ position: 'absolute', top: 12, left: 12, width: '20%', height: 2, background: '#22c55e', zIndex: 1 }} />
      {stops.map((s, i) => (
        <div key={i} style={{ position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: s.done ? '#22c55e' : s.current ? '#f0a500' : 'rgba(255,255,255,0.1)',
            border: s.current ? '2px solid #f0a500' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: s.current ? '0 0 16px rgba(240,165,0,0.6)' : 'none',
          }}>
            {s.done && <CheckCircle size={14} color="#fff" />}
          </div>
          <div style={{ fontSize: 10, fontWeight: 700, color: s.current ? '#f0a500' : 'rgba(255,255,255,0.5)' }}>
            {s.label}
          </div>
        </div>
      ))}
    </div>
  )
}

function SecondaryBtn({ icon: Icon, label }) {
  return (
    <div style={{
      flex: 1, padding: '14px',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 14,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    }}>
      <Icon size={16} color="rgba(255,255,255,0.7)" />
      <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{label}</span>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 9 — EARNINGS
// ═══════════════════════════════════════════════════════════════
function Screen9Earnings() {
  return (
    <div style={PHONE_BG}>
      <div style={{ padding: '20px 20px 12px' }}>
        <div style={SUB_LABEL}>EARNINGS</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1 }}>
          WHAT YOU KEPT
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, padding: '0 20px 16px' }}>
        <PeriodPill text="This Week" active />
        <PeriodPill text="This Month" />
        <PeriodPill text="All Time" />
      </div>
      <div style={{
        margin: '0 16px 16px',
        padding: '24px 24px 22px',
        background: 'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(245,158,11,0.02))',
        border: '1px solid rgba(240,165,0,0.2)',
        borderRadius: 20,
      }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.5, marginBottom: 8 }}>
          NET TO YOU
        </div>
        <div style={{ fontSize: 56, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1, marginBottom: 12 }}>
          $7,275
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600 }}>
          <span>Gross <span style={{ color: '#fff' }}>$7,500</span></span>
          <span>·</span>
          <span>Q fee <span style={{ color: '#fff' }}>$225</span></span>
        </div>
      </div>
      <div style={{ padding: '8px 24px 12px', fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2 }}>
        3 DELIVERED LOADS
      </div>
      <div style={{ padding: '0 16px', flex: 1 }}>
        <LoadRow origin="Atlanta" dest="Dallas" net="$2,425" date="Apr 7" broker="Werner" />
        <LoadRow origin="Dallas" dest="Phoenix" net="$2,910" date="Apr 5" broker="CH Robinson" />
        <LoadRow origin="Phoenix" dest="Atlanta" net="$1,940" date="Apr 3" broker="Schneider" />
      </div>
      <BottomNav active="earnings" />
    </div>
  )
}

function LoadRow({ origin, dest, net, date, broker }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '14px 16px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.05)',
      borderRadius: 14,
      marginBottom: 8,
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{origin} → {dest}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{date} · {broker}</div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif" }}>{net}</div>
    </div>
  )
}

function PeriodPill({ text, active }) {
  return (
    <div style={{
      padding: '8px 14px',
      borderRadius: 999,
      background: active ? 'rgba(240,165,0,0.12)' : 'transparent',
      border: `1px solid ${active ? 'rgba(240,165,0,0.35)' : 'rgba(255,255,255,0.08)'}`,
      fontSize: 11, fontWeight: 700,
      color: active ? '#f0a500' : 'rgba(255,255,255,0.5)',
    }}>
      {text}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SCREEN 10 — SETTINGS
// ═══════════════════════════════════════════════════════════════
function Screen10Settings() {
  return (
    <div style={PHONE_BG}>
      <div style={{ padding: '20px 20px 12px' }}>
        <div style={SUB_LABEL}>SETTINGS</div>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 0.5, lineHeight: 1 }}>
          YOUR ACCOUNT
        </div>
      </div>
      <div style={{
        margin: '0 16px 20px',
        padding: '18px',
        background: 'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(245,158,11,0.02))',
        border: '1px solid rgba(240,165,0,0.2)',
        borderRadius: 18,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 16px rgba(240,165,0,0.4)',
        }}>
          <span style={{ fontSize: 20, fontWeight: 900, color: '#000', fontFamily: "'Bebas Neue', sans-serif" }}>QT</span>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>Quick Test Driver</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#22c55e' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', letterSpacing: 0.5 }}>
              AUTONOMOUS · 3% per load
            </span>
          </div>
        </div>
      </div>
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <SettingsRow icon={User} label="Account" sub="qtest@gmail.com" />
        <SettingsRow icon={Truck} label="Equipment & Lanes" sub="Set what Q hunts for" />
        <SettingsRow icon={HomeIcon} label="Home Base" sub="Dallas, TX" />
        <SettingsRow icon={DollarSign} label="Bank · Payouts" sub="Connected · Chase ••2847" />
        <SettingsRow icon={SettingsIcon} label="Notifications" sub="Push + SMS" />
      </div>
      <BottomNav active="settings" />
    </div>
  )
}

function SettingsRow({ icon: Icon, label, sub }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '14px 16px',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 14,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 10,
        background: 'rgba(255,255,255,0.05)',
        border: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} color="rgba(255,255,255,0.7)" />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{label}</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{sub}</div>
      </div>
      <ChevronRight size={16} color="rgba(255,255,255,0.25)" />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SHARED PIECES
// ═══════════════════════════════════════════════════════════════
function Pill({ text, color, pulse }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '6px 12px',
      borderRadius: 999,
      background: `${color}1f`,
      border: `1px solid ${color}55`,
    }}>
      <div style={{
        width: 6, height: 6, borderRadius: '50%',
        background: color,
        boxShadow: pulse ? `0 0 8px ${color}` : 'none',
        animation: pulse ? 'qStatusPulse 1.6s ease-in-out infinite' : 'none',
      }} />
      <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color }}>{text}</span>
    </div>
  )
}

function EarningsStrip({ net, loads }) {
  return (
    <div style={{
      margin: '0 16px 16px',
      display: 'flex', alignItems: 'center',
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 16,
      padding: '14px 18px',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2 }}>THIS WEEK</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
          <span style={{ fontSize: 24, fontWeight: 900, color: '#fff', fontFamily: "'Bebas Neue', sans-serif" }}>{net}</span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>net · {loads} loads</span>
        </div>
      </div>
    </div>
  )
}

function BottomNav({ active }) {
  const tabs = [
    { id: 'home', label: 'Home', icon: HomeIcon },
    { id: 'earnings', label: 'Earnings', icon: DollarSign },
    { id: 'settings', label: 'Settings', icon: SettingsIcon },
  ]
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
      height: 64, padding: '0 8px',
      background: 'rgba(7,9,14,0.72)',
      backdropFilter: 'blur(24px) saturate(180%)',
      borderTop: '0.5px solid rgba(255,255,255,0.08)',
    }}>
      {tabs.map((t) => {
        const isActive = active === t.id
        return (
          <div key={t.id} style={{
            position: 'relative',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            color: isActive ? '#f0a500' : 'rgba(255,255,255,0.45)',
          }}>
            {isActive && (
              <div style={{
                position: 'absolute', top: 4,
                width: 28, height: 3, borderRadius: 2,
                background: 'linear-gradient(90deg, #f0a500, #f59e0b)',
                boxShadow: '0 0 12px rgba(240,165,0,0.6)',
              }} />
            )}
            <t.icon size={22} strokeWidth={isActive ? 2.4 : 2} />
            <span style={{ fontSize: 10, fontWeight: isActive ? 800 : 600, marginTop: 4, letterSpacing: 0.4 }}>{t.label}</span>
          </div>
        )
      })}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════════════════════════
const PAGE = {
  minHeight: '100vh',
  background: 'radial-gradient(ellipse at top, #0c0f17 0%, #07090e 60%)',
  color: '#fff',
  fontFamily: "'DM Sans', sans-serif",
  paddingBottom: 60,
}

const HEADER = {
  padding: '40px 24px 24px',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
  marginBottom: 24,
}

const SECTION = {
  padding: '32px 16px 0',
  maxWidth: 480,
  margin: '0 auto',
}

const SECTION_HEADER = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 14,
  marginBottom: 18,
}

const NUMBER_BADGE = {
  width: 32, height: 32, borderRadius: '50%',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  fontSize: 14, fontWeight: 900, color: '#000',
  fontFamily: "'Bebas Neue', sans-serif",
  flexShrink: 0,
  boxShadow: '0 4px 16px rgba(240,165,0,0.35)',
}

const PHONE_FRAME = {
  width: '100%',
  maxWidth: 380,
  height: 760,
  margin: '0 auto',
  borderRadius: 36,
  border: '8px solid #0a0a0a',
  boxShadow: '0 30px 80px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.05)',
  overflow: 'hidden',
  position: 'relative',
}

const PHONE_BG = {
  width: '100%', height: '100%',
  background: 'radial-gradient(ellipse at top, #0c0f17 0%, #07090e 60%)',
  display: 'flex', flexDirection: 'column',
  position: 'relative',
}

const TOP_BAR = {
  display: 'flex', alignItems: 'center', gap: 12,
  padding: '20px 20px 8px',
}

const Q_BADGE_GOLD = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 4px 16px rgba(240,165,0,0.35)',
  flexShrink: 0,
}

const Q_BADGE_DIM = {
  width: 36, height: 36, borderRadius: '50%',
  background: 'linear-gradient(135deg, rgba(240,165,0,0.3), rgba(245,158,11,0.2))',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid rgba(255,255,255,0.06)',
  flexShrink: 0,
}

const Q_TEXT_GOLD = { fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: '#000', fontWeight: 800, lineHeight: 1 }
const Q_TEXT_DIM = { fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: 'rgba(255,255,255,0.5)', fontWeight: 800, lineHeight: 1 }

const SUB_LABEL = { fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1.2, textTransform: 'uppercase' }

const CENTER = {
  flex: 1,
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center',
  padding: 20,
}

const Q_LARGE_GOLD = {
  width: 132, height: 132, borderRadius: '50%',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  boxShadow: '0 0 60px rgba(240,165,0,0.55), 0 12px 40px rgba(0,0,0,0.5)',
  animation: 'qBreath 2.8s ease-in-out infinite',
}

const Q_LARGE_DIM = {
  width: 132, height: 132, borderRadius: '50%',
  background: 'linear-gradient(135deg, rgba(240,165,0,0.3), rgba(245,158,11,0.2))',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  border: '1px solid rgba(255,255,255,0.06)',
  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
}

const Q_LARGE_TEXT_GOLD = { fontFamily: "'Bebas Neue', sans-serif", fontSize: 72, color: '#000', fontWeight: 800, lineHeight: 1, letterSpacing: -2 }
const Q_LARGE_TEXT_DIM = { fontFamily: "'Bebas Neue', sans-serif", fontSize: 72, color: 'rgba(255,255,255,0.5)', fontWeight: 800, lineHeight: 1, letterSpacing: -2 }

const HEADLINE = {
  fontSize: 22, fontWeight: 900, color: '#fff',
  fontFamily: "'Bebas Neue', sans-serif",
  letterSpacing: 1, marginBottom: 8,
}

const SUBTEXT = {
  fontSize: 13, color: 'rgba(255,255,255,0.5)',
  lineHeight: 1.5, padding: '0 32px',
}

const PULSE_RING = {
  position: 'absolute',
  width: 132, height: 132,
  borderRadius: '50%',
  border: '2px solid rgba(240,165,0,0.4)',
  animation: 'ringExpand 2.4s ease-out infinite',
}

const ACTIVITY_PILL = {
  display: 'inline-flex', alignItems: 'center', gap: 10,
  padding: '10px 16px',
  background: 'rgba(34,197,94,0.08)',
  border: '1px solid rgba(34,197,94,0.2)',
  borderRadius: 999,
}

const GO_BTN_GOLD = {
  width: '100%', maxWidth: 340,
  padding: '20px 32px',
  background: 'linear-gradient(135deg, #f0a500, #f59e0b)',
  border: 'none', borderRadius: 20,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
  fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 1.5,
  boxShadow: '0 12px 40px rgba(240,165,0,0.45)',
  margin: '0 auto',
}

const GO_BTN_RED = {
  width: '100%', maxWidth: 340,
  padding: '20px 32px',
  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
  border: 'none', borderRadius: 20,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
  fontSize: 16, fontWeight: 900, color: '#fff', letterSpacing: 1.5,
  boxShadow: '0 12px 40px rgba(239,68,68,0.4)',
  margin: '0 auto',
}

const SHEET_OVERLAY = {
  position: 'absolute', inset: 0,
  background: 'rgba(0,0,0,0.7)',
  backdropFilter: 'blur(8px)',
  display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
}

const SHEET = {
  background: 'linear-gradient(180deg, #0c0f17 0%, #07090e 100%)',
  borderRadius: '28px 28px 0 0',
  paddingTop: 12, paddingBottom: 16,
  borderTop: '1px solid rgba(255,255,255,0.08)',
}

const SHEET_HANDLE = {
  width: 40, height: 4,
  background: 'rgba(255,255,255,0.2)',
  borderRadius: 2,
  margin: '0 auto 8px',
}

const PASS_BTN = {
  padding: '18px',
  background: 'transparent',
  border: '2px solid rgba(255,255,255,0.15)',
  borderRadius: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
}

const NEGOTIATE_BTN = {
  padding: '18px',
  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
  border: 'none', borderRadius: 16,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  boxShadow: '0 8px 32px rgba(34,197,94,0.4)',
}

const EXTRA_ANIMS = `
  @keyframes ringExpand {
    0% { transform: scale(1); opacity: 0.5; }
    100% { transform: scale(1.6); opacity: 0; }
  }
`
