import React, { useState, useEffect } from 'react'
import {
  CreditCard, Zap, AlertTriangle
} from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import { Ic } from '../shared'
import { PLAN_DISPLAY } from '../../../hooks/useSubscription'

// ── Subscription Settings (inside Settings tab) ────────────────────────────────
export function SubscriptionSettings() {
  const { showToast, user, profile, subscription, openBillingPortal, demoMode } = useApp()
  const { loads, deliveredLoads, invoices, aiFees } = useCarrier()
  const [subData, setSubData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [upgradeLoading, setUpgradeLoading] = useState(false)
  const [truckPicker, setTruckPicker] = useState(null) // null = hidden, or { planId, trucks: 1 }


  useEffect(() => {
    if (demoMode) {
      setSubData({
        plan: 'autonomous_fleet', status: 'trialing', trialDaysLeft: 11,
        trialEndsAt: new Date(Date.now() + 11 * 86400000).toISOString(),
        currentPeriodEnd: new Date(Date.now() + 11 * 86400000).toISOString(),
        amount: 39900, truckCount: 1,
      })
      setLoading(false)
      return
    }
    apiFetch('/api/get-subscription', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      .then(r => r.json())
      .then(data => { setSubData(data); setLoading(false) })
      .catch(() => {
        setSubData({
          plan: profile?.subscription_plan || null,
          status: profile?.subscription_status || 'inactive',
          trialEndsAt: profile?.trial_ends_at,
          currentPeriodEnd: profile?.current_period_end,
          customerId: profile?.stripe_customer_id,
          truckCount: profile?.truck_count || 1,
        })
        setLoading(false)
      })
  }, [demoMode, profile])

  const PLAN_INFO = Object.fromEntries(
    Object.entries(PLAN_DISPLAY).map(([id, p]) => [id, {
      name: p.name,
      price: `$${p.price}/mo + $${p.extraTruck}/additional truck`,
      color: p.color,
      tier: id === 'tms_pro' ? 0 : (id === 'ai_dispatch' || id === 'autopilot') ? 1 : 2,
    }])
  )

  // Q Intelligence — AI usage metrics from real q_ai_fees table
  const now = new Date()
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay())
  weekStart.setHours(0, 0, 0, 0)
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const feesThisWeek = (aiFees || []).filter(f => f.created_at && new Date(f.created_at) >= weekStart)
  const feesThisMonth = (aiFees || []).filter(f => f.created_at && new Date(f.created_at) >= monthStart)

  const qLoadsThisWeek = feesThisWeek
  const qLoadsThisMonth = feesThisMonth
  const weeklyAIFees = feesThisWeek.reduce((sum, f) => sum + Number(f.fee_amount || 0), 0)
  const monthlyAIFees = feesThisMonth.reduce((sum, f) => sum + Number(f.fee_amount || 0), 0)
  const monthlyGross = feesThisMonth.reduce((sum, f) => sum + Number(f.load_rate || 0), 0)

  const STATUS_BADGES = {
    active:   { label: 'ACTIVE',    bg: 'rgba(34,197,94,0.1)',  color: 'var(--success)', border: 'rgba(34,197,94,0.2)' },
    trialing: { label: 'TRIAL',     bg: 'rgba(240,165,0,0.1)',  color: 'var(--accent)',  border: 'rgba(240,165,0,0.2)' },
    past_due: { label: 'PAST DUE',  bg: 'rgba(239,68,68,0.1)',  color: 'var(--danger)',  border: 'rgba(239,68,68,0.2)' },
    canceled: { label: 'CANCELLED', bg: 'rgba(74,85,112,0.1)',  color: 'var(--muted)',   border: 'rgba(74,85,112,0.2)' },
    inactive: { label: 'FREE TIER',  bg: 'rgba(44,184,150,0.1)',  color: 'var(--accent2)',   border: 'rgba(44,184,150,0.2)' },
  }

  const handleUpgrade = () => {
    setTruckPicker({ planId: 'autonomous_fleet', trucks: Math.max(subData?.truckCount || 1, 1) })
  }

  const goToCheckout = async (planId, trucks) => {
    setUpgradeLoading(true)
    try {
      const res = await apiFetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId,
          email: user?.email || profile?.email,
          userId: user?.id,
          truckCount: trucks,
        }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
      else showToast('error', 'Error', data.error || 'Could not start checkout')
    } catch (e) {
      showToast('error', 'Error', 'Could not start checkout')
    } finally {
      setUpgradeLoading(false)
      setTruckPicker(null)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        Loading subscription details...
      </div>
    )
  }

  const plan = PLAN_INFO[subData?.plan] || { name: 'No Plan', price: '$0', color: '#8a8a9a', tier: 0 }
  const badge = STATUS_BADGES[subData?.status] || STATUS_BADGES.inactive
  const trialDays = subData?.trialDaysLeft ?? (subData?.status === 'trialing' && subData?.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(subData.trialEndsAt).getTime() - Date.now()) / 86400000))
    : null)
  const nextBilling = subData?.currentPeriodEnd
    ? new Date(subData.currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>SUBSCRIPTION</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Manage your Qivori AI plan, billing, and payment details</div>
      </div>

      {/* Current Plan Card */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Current Plan</div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
            {'\u25CF'} {badge.label}
          </span>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Plan</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: plan.color }}>{plan.name}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{plan.price}</div>
            </div>

            {trialDays !== null && subData?.status === 'trialing' ? (
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Trial Remaining</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: trialDays <= 3 ? 'var(--danger)' : 'var(--accent)' }}>
                  {trialDays} DAY{trialDays !== 1 ? 'S' : ''}
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                  Ends {subData.trialEndsAt ? new Date(subData.trialEndsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '\u2014'}
                </div>
              </div>
            ) : (
              <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Next Billing</div>
                <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--text)' }}>
                  {nextBilling || '\u2014'}
                </div>
                {subData?.cancelAtPeriodEnd && (
                  <div style={{ fontSize: 10, color: 'var(--danger)', marginTop: 4, fontWeight: 700 }}>Cancels at period end</div>
                )}
              </div>
            )}

            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Trucks</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, color: 'var(--accent2)' }}>
                {subData?.truckCount || 1}
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>Active vehicles</div>
            </div>
          </div>

          {subData?.status === 'trialing' && trialDays !== null && trialDays <= 3 && (
            <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Ic icon={AlertTriangle} size={16} color="var(--danger)" />
              <div style={{ fontSize: 12, color: 'var(--danger)' }}>
                Your trial ends in <strong>{trialDays} day{trialDays !== 1 ? 's' : ''}</strong>. Add a payment method to continue using Qivori without interruption.
              </div>
            </div>
          )}

          {subData?.status === 'past_due' && (
            <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 10, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <Ic icon={AlertTriangle} size={16} color="var(--danger)" />
              <div style={{ fontSize: 12, color: 'var(--danger)' }}>
                Your payment failed. Please update your payment method to avoid service interruption.
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            {(subData?.customerId || subscription?.customerId) && (
              <button onClick={openBillingPortal} className="btn btn-ghost" style={{ padding: '10px 20px', fontSize: 12, fontWeight: 700, border: '1px solid var(--border)', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", background: 'transparent', color: 'var(--text)' }}>
                <Ic icon={CreditCard} size={14} />Manage Subscription
              </button>
            )}
            {!subData?.isActive && !subscription?.isActive && (
              <button onClick={handleUpgrade} disabled={upgradeLoading}
                style={{ padding: '10px 20px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 10, background: 'var(--accent)', color: '#000', cursor: upgradeLoading ? 'wait' : 'pointer', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', gap: 6 }}>
                <Ic icon={Zap} size={14} />
                {upgradeLoading ? 'Loading...' : 'Start Free Trial'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Plan Details — Two Components */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Your Plan</div>
        <div style={{ padding: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {/* TMS Pro — ${PLAN_DISPLAY.tms_pro.price}/mo */}
          <div style={{ flex: '1 1 180px', padding: 18, borderRadius: 12, border: '2px solid rgba(77,142,240,0.3)', background: 'rgba(77,142,240,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#4d8ef0', marginBottom: 2 }}>TMS Pro</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>Core trucking management</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, color: 'var(--text)' }}>${PLAN_DISPLAY.tms_pro.price}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>/mo per truck · ${PLAN_DISPLAY.tms_pro.extraTruck} each additional</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {['Fleet & dispatch management', 'Invoicing & factoring', 'IFTA & compliance suite', 'Driver portal & scorecards',
                'Document management', 'Fuel optimizer'].map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, color: 'var(--text)' }}>
                  <span style={{ color: '#4d8ef0', fontSize: 11, flexShrink: 0 }}>{'\u2713'}</span>
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Dispatch — ${PLAN_DISPLAY.ai_dispatch.price}/mo */}
          <div style={{ flex: '1 1 180px', position: 'relative', padding: 18, borderRadius: 12, border: '2px solid rgba(240,165,0,0.4)', background: 'rgba(240,165,0,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#f0a500', marginBottom: 2 }}>AI Dispatch</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>Q assists, you approve</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, color: 'var(--text)' }}>${PLAN_DISPLAY.autonomous_fleet.price}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>/mo first truck · ${PLAN_DISPLAY.autonomous_fleet.extraTruck} each additional</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {['Everything in TMS Pro', 'AI load board & scoring', 'Rate analysis & lane intel', 'Broker risk intelligence',
                'Market & lane analysis', 'AI dispatch suggestions'].map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, color: 'var(--text)' }}>
                  <span style={{ color: '#f0a500', fontSize: 11, flexShrink: 0 }}>{i === 0 ? '\u2b06' : '\u2713'}</span>
                  <span style={i === 0 ? { fontWeight: 700, color: '#f0a500' } : undefined}>{f}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Autonomous Fleet — 3% per load */}
          <div style={{ flex: '1 1 180px', padding: 18, borderRadius: 12, border: '2px solid rgba(0,212,170,0.3)', background: 'rgba(0,212,170,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#00d4aa', marginBottom: 2 }}>Autonomous Fleet</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>Fully hands-free AI dispatch</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, color: 'var(--text)' }}>3%</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>per load · only when Q books</span>
            </div>
            <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 12, fontStyle: 'italic' }}>
              $2,000 load = $60 AI fee · You keep $1,940
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {['Everything in AI Dispatch', 'Voice AI assistant', 'Autonomous broker calling', 'Auto rate negotiation',
                'Proactive load finding', 'Auto booking & dispatch', 'Zero manual work required'].map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, color: 'var(--text)' }}>
                  <span style={{ color: '#00d4aa', fontSize: 11, flexShrink: 0 }}>{i === 0 ? '\u2b06' : '\u2713'}</span>
                  <span style={i === 0 ? { fontWeight: 700, color: '#00d4aa' } : undefined}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {!subData?.isActive && !subscription?.isActive && (
          <div style={{ padding: '0 20px 20px' }}>
            <button onClick={handleUpgrade} disabled={upgradeLoading}
              style={{ width: '100%', padding: '12px', fontSize: 13, fontWeight: 700, borderRadius: 10, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif",
                border: 'none', background: '#f0a500', color: '#000' }}>
              {upgradeLoading ? 'Loading...' : 'Start Free Trial'}
            </button>
          </div>
        )}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
          14-day free trial · No credit card required · You only pay more when Q makes you more
        </div>
      </div>

      {/* Q Intelligence — AI Usage Tracking (3% per load) */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>Q Intelligence Usage</div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 10, background: 'rgba(0,212,170,0.1)', color: 'var(--success)', border: '1px solid rgba(0,212,170,0.2)' }}>
            3% PER LOAD
          </span>
        </div>
        <div style={{ padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Loads This Week</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--accent)' }}>{qLoadsThisWeek.length}</div>
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>AI Fees This Week</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--success)' }}>${weeklyAIFees.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Loads This Month</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--accent)' }}>{qLoadsThisMonth.length}</div>
            </div>
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, fontWeight: 600 }}>Est. Monthly AI Fee</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--success)' }}>${monthlyAIFees.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</div>
            </div>
          </div>

          {/* Monthly breakdown */}
          {qLoadsThisMonth.length > 0 && (
            <div style={{ background: 'var(--surface2)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 10, color: 'var(--text)' }}>This Month's Breakdown</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted)' }}>Gross revenue (Q-handled loads)</span>
                <span style={{ fontWeight: 700 }}>${monthlyGross.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: 12, borderBottom: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--muted)' }}>AI fee (3%)</span>
                <span style={{ fontWeight: 700, color: 'var(--success)' }}>${monthlyAIFees.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0 2px', fontSize: 12 }}>
                <span style={{ fontWeight: 700 }}>You keep</span>
                <span style={{ fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18 }}>
                  ${(monthlyGross - monthlyAIFees).toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {qLoadsThisMonth.length === 0 && (
            <div style={{ textAlign: 'center', padding: '16px 0', fontSize: 12, color: 'var(--muted)' }}>
              No Q-handled loads yet this month. When Q dispatches loads, usage appears here.
            </div>
          )}

          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 8, background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.12)', fontSize: 11, color: 'var(--muted)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--accent)' }}>How it works:</strong> Q Intelligence charges 3% only on loads where Q's AI was used (dispatch, negotiation, scoring). No AI usage = no fee. You only pay more when Q makes you more.
          </div>
        </div>
      </div>

      {/* Truck Picker Modal for Autopilot AI */}
      {truckPicker && (
        <>
          <div onClick={() => setTruckPicker(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9000 }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:420, maxWidth:'90vw',
            background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:28, zIndex:9001,
            boxShadow:'0 24px 80px rgba(0,0,0,0.6)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>QIVORI AI DISPATCH</div>
                <div style={{ fontSize:12, color:'var(--muted)' }}>How many trucks do you operate?</div>
              </div>
              <button onClick={() => setTruckPicker(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:20 }}>{'\u2715'}</button>
            </div>

            {/* Truck counter */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:20, marginBottom:24 }}>
              <button onClick={() => setTruckPicker(p => ({ ...p, trucks: Math.max(1, p.trucks - 1) }))}
                style={{ width:44, height:44, borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)',
                  color:'var(--text)', fontSize:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>{'\u2212'}</button>
              <div style={{ textAlign:'center', minWidth:80 }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:48, color:'var(--accent)', lineHeight:1 }}>{truckPicker.trucks}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>truck{truckPicker.trucks !== 1 ? 's' : ''}</div>
              </div>
              <button onClick={() => setTruckPicker(p => ({ ...p, trucks: p.trucks + 1 }))}
                style={{ width:44, height:44, borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)',
                  color:'var(--text)', fontSize:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>+</button>
            </div>

            {/* Price breakdown */}
            <div style={{ background:'var(--surface2)', borderRadius:12, padding:16, marginBottom:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:13 }}>
                <span style={{ color:'var(--muted)' }}>First truck</span>
                <span style={{ fontWeight:700 }}>${PLAN_DISPLAY.autonomous_fleet.price}/mo</span>
              </div>
              {truckPicker.trucks > 1 && (
                <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:13 }}>
                  <span style={{ color:'var(--muted)' }}>{truckPicker.trucks - 1} additional truck{truckPicker.trucks > 2 ? 's' : ''} {'\u00D7'} ${PLAN_DISPLAY.autonomous_fleet.extraTruck}</span>
                  <span style={{ fontWeight:700 }}>${((truckPicker.trucks - 1) * PLAN_DISPLAY.autonomous_fleet.extraTruck).toLocaleString()}/mo</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:11, color:'var(--muted)' }}>
                <span>AI Dispatch (subscription) {'\u00B7'} Autonomous Fleet adds 3% per load</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0 4px', fontSize:15, borderTop:'1px solid var(--border)', marginTop:6 }}>
                <span style={{ fontWeight:800 }}>Platform Total</span>
                <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:'var(--accent)', lineHeight:1 }}>
                  ${(PLAN_DISPLAY.autonomous_fleet.price + Math.max(0, truckPicker.trucks - 1) * PLAN_DISPLAY.autonomous_fleet.extraTruck).toLocaleString()}<span style={{ fontSize:13, color:'var(--muted)' }}>/mo</span>
                </span>
              </div>
            </div>

            <button onClick={() => goToCheckout('autonomous_fleet', truckPicker.trucks)} disabled={upgradeLoading}
              style={{ width:'100%', padding:'14px', fontSize:14, fontWeight:700, border:'none', borderRadius:10,
                background:'var(--accent)', color:'#000', cursor: upgradeLoading ? 'wait' : 'pointer',
                fontFamily:"'DM Sans',sans-serif" }}>
              {upgradeLoading ? 'Redirecting to Stripe...' : `Start Free Trial \u2014 ${truckPicker.trucks} Truck${truckPicker.trucks !== 1 ? 's' : ''}`}
            </button>
            <div style={{ textAlign:'center', fontSize:11, color:'var(--muted)', marginTop:10 }}>
              14-day free trial {'\u00B7'} No charge until trial ends
            </div>
          </div>
        </>
      )}
    </div>
  )
}
