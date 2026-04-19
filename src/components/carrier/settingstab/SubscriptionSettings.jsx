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

  const handleSelectPlan = (planId) => {
    const currentPlan = subData?.plan || profile?.subscription_plan
    if (currentPlan === planId) { showToast('info', 'Already on this plan', ''); return }
    if (planId === 'pay_as_you_go') {
      goToCheckout('pay_as_you_go', 1)
    } else {
      setTruckPicker({ planId, trucks: Math.max(subData?.truckCount || 1, 1) })
    }
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

      {/* Plan Selection */}
      {(() => {
        const currentPlan = subData?.plan || profile?.subscription_plan || 'pay_as_you_go'
        const PLANS = [
          {
            id: 'pay_as_you_go',
            name: 'Pay As You Go',
            color: '#22c55e',
            sub: '$0/mo · 3% only when Q books a load',
            desc: 'Q finds loads and calls brokers. Pay nothing until Q delivers.',
            features: ['Load tracking (up to 10/mo)', 'Basic invoicing & factoring', 'Fleet & DVIR', 'HOS & fuel prices', 'Q AI dispatch & voice calls', 'Auto booking & negotiation'],
          },
          {
            id: 'tms_pro',
            name: 'TMS Pro',
            color: '#4d8ef0',
            sub: `$${PLAN_DISPLAY.tms_pro.price}/mo · $${PLAN_DISPLAY.tms_pro.extraTruck} each additional truck`,
            desc: 'Full TMS — manage loads, invoices, IFTA, compliance yourself.',
            features: ['Unlimited loads', 'Invoicing & factoring', 'IFTA & compliance suite', 'Driver portal & payroll', 'Document vault', 'Fuel optimizer'],
          },
          {
            id: 'ai_dispatch',
            name: 'AI Dispatch',
            color: '#f0a500',
            sub: `$${PLAN_DISPLAY.ai_dispatch.price}/mo + 3% per Q-booked load`,
            desc: 'Full TMS + Q dispatch. Best value at 6+ loads/month.',
            features: ['Everything in TMS Pro', 'AI load board & scoring', 'Rate & lane analysis', 'Broker risk intel', 'Voice AI & auto booking', 'Proactive load finding'],
          },
        ]
        return (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Change Plan</div>
            <div style={{ padding: 20, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {PLANS.map(p => {
                const isCurrent = currentPlan === p.id || (p.id === 'ai_dispatch' && (currentPlan === 'autonomous_fleet' || currentPlan === 'autopilot_ai' || currentPlan === 'autopilot'))
                return (
                  <div key={p.id} style={{ flex: '1 1 180px', padding: 18, borderRadius: 12,
                    border: `2px solid ${isCurrent ? p.color : p.color + '44'}`,
                    background: isCurrent ? p.color + '10' : p.color + '06',
                    display: 'flex', flexDirection: 'column', gap: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: p.color }}>{p.name}</div>
                      {isCurrent && <span style={{ fontSize: 8, fontWeight: 800, padding: '2px 7px', borderRadius: 6, background: p.color + '22', color: p.color, letterSpacing: 0.5 }}>CURRENT</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 10 }}>{p.desc}</div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>{p.sub}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, flex: 1 }}>
                      {p.features.map((f, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10, color: 'var(--text)' }}>
                          <span style={{ color: p.color, fontSize: 11, flexShrink: 0 }}>{i === 0 && p.id !== 'pay_as_you_go' ? '\u2b06' : '\u2713'}</span>
                          <span style={i === 0 && p.id !== 'pay_as_you_go' ? { fontWeight: 700, color: p.color } : undefined}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <button onClick={() => handleSelectPlan(p.id)} disabled={upgradeLoading || isCurrent}
                      style={{ marginTop: 16, width: '100%', padding: '9px', fontSize: 11, fontWeight: 700, borderRadius: 8, cursor: isCurrent ? 'default' : 'pointer',
                        border: `1px solid ${isCurrent ? 'transparent' : p.color}`,
                        background: isCurrent ? p.color + '22' : p.color,
                        color: isCurrent ? p.color : p.id === 'pay_as_you_go' || p.id === 'ai_dispatch' ? '#000' : '#fff',
                        fontFamily: "'DM Sans',sans-serif" }}>
                      {upgradeLoading ? 'Loading...' : isCurrent ? 'Current Plan' : 'Select Plan'}
                    </button>
                  </div>
                )
              })}
            </div>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', fontSize: 11, color: 'var(--muted)', textAlign: 'center' }}>
              14-day free trial · No credit card required · Downgrade or cancel anytime
            </div>
          </div>
        )
      })()}

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

      {/* Truck Picker Modal — dynamic per plan */}
      {truckPicker && (() => {
        const pd = PLAN_DISPLAY[truckPicker.planId] || PLAN_DISPLAY.ai_dispatch
        const total = pd.price + Math.max(0, truckPicker.trucks - 1) * pd.extraTruck
        const planName = truckPicker.planId === 'tms_pro' ? 'TMS PRO' : 'AI DISPATCH'
        return (
          <>
            <div onClick={() => setTruckPicker(null)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:9000 }} />
            <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:420, maxWidth:'90vw',
              background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:28, zIndex:9001,
              boxShadow:'0 24px 80px rgba(0,0,0,0.6)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
                <div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>QIVORI {planName}</div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>How many trucks do you operate?</div>
                </div>
                <button onClick={() => setTruckPicker(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:20 }}>{'\u2715'}</button>
              </div>

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

              <div style={{ background:'var(--surface2)', borderRadius:12, padding:16, marginBottom:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:13 }}>
                  <span style={{ color:'var(--muted)' }}>First truck</span>
                  <span style={{ fontWeight:700 }}>${pd.price}/mo</span>
                </div>
                {truckPicker.trucks > 1 && (
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:13 }}>
                    <span style={{ color:'var(--muted)' }}>{truckPicker.trucks - 1} additional truck{truckPicker.trucks > 2 ? 's' : ''} {'\u00D7'} ${pd.extraTruck}</span>
                    <span style={{ fontWeight:700 }}>${((truckPicker.trucks - 1) * pd.extraTruck).toLocaleString()}/mo</span>
                  </div>
                )}
                {pd.aiFee && (
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:11, color:'var(--muted)' }}>
                    <span>+ 3% per load when Q books</span>
                  </div>
                )}
                <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0 4px', fontSize:15, borderTop:'1px solid var(--border)', marginTop:6 }}>
                  <span style={{ fontWeight:800 }}>Total</span>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:'var(--accent)', lineHeight:1 }}>
                    ${total.toLocaleString()}<span style={{ fontSize:13, color:'var(--muted)' }}>/mo</span>
                  </span>
                </div>
              </div>

              <button onClick={() => goToCheckout(truckPicker.planId, truckPicker.trucks)} disabled={upgradeLoading}
                style={{ width:'100%', padding:'14px', fontSize:14, fontWeight:700, border:'none', borderRadius:10,
                  background:'var(--accent)', color:'#000', cursor: upgradeLoading ? 'wait' : 'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                {upgradeLoading ? 'Redirecting to Stripe...' : `Select ${planName} \u2014 ${truckPicker.trucks} Truck${truckPicker.trucks !== 1 ? 's' : ''}`}
              </button>
              <div style={{ textAlign:'center', fontSize:11, color:'var(--muted)', marginTop:10 }}>
                14-day free trial {'\u00B7'} No charge until trial ends
              </div>
            </div>
          </>
        )
      })()}
    </div>
  )
}
