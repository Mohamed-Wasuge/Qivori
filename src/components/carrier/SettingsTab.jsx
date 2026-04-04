import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import {
  Building2, Star, CreditCard, Plug, Users, Bell, Smartphone, FileText, Palette, Shield, Globe, Sun, Moon, Eye, Zap,
  Truck, BarChart2, Fuel, Route, AlertTriangle, CheckCircle, ChevronLeft, Plus, Upload, Download, X, ArrowRight, File, Check, Info, FileCheck, Activity, Lock
} from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { apiFetch } from '../../lib/api'
import { supabase } from '../../lib/supabase'
import { Ic } from './shared'
import { ActivityLog } from './ActivityLog'
import { PLAN_DISPLAY } from '../../hooks/useSubscription'

// Lazy-load Settings domain components
const lazyN = (fn, name) => lazy(() => fn().then(m => ({ default: m[name] })))
const SMSSettings = lazyN(() => import('../../pages/carrier/Settings'), 'SMSSettings')
const InvoicingSettings = lazyN(() => import('../../pages/carrier/Settings'), 'InvoicingSettings')
const TeamManagement = lazyN(() => import('../../pages/carrier/Settings'), 'TeamManagement')
const InsuranceHub = lazyN(() => import('../CarrierLayout'), 'InsuranceHub')

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

  const PLAN_INFO = {
    tms_pro:          { name: 'TMS Pro',          price: '$99/mo + $49/additional truck', color: '#4d8ef0', tier: 0 },
    ai_dispatch:      { name: 'AI Dispatch',      price: '$199/mo + $99/additional truck', color: '#f0a500', tier: 1 },
    autonomous_fleet: { name: 'Autonomous Fleet',  price: '$199/mo + $99/additional truck', color: '#f0a500', tier: 2 },
    autopilot_ai:     { name: 'Autonomous Fleet',  price: '$199/mo + $99/additional truck', color: '#f0a500', tier: 2 },
    autopilot:        { name: 'AI Dispatch',      price: '$199/mo + $99/additional truck', color: '#f0a500', tier: 1 },
  }

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
          {/* TMS Pro — $99/mo */}
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

          {/* AI Dispatch — $199/mo */}
          <div style={{ flex: '1 1 180px', position: 'relative', padding: 18, borderRadius: 12, border: '2px solid rgba(240,165,0,0.4)', background: 'rgba(240,165,0,0.04)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#f0a500', marginBottom: 2 }}>AI Dispatch</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 12 }}>Q assists, you approve</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 12 }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, color: 'var(--text)' }}>${PLAN_DISPLAY.ai_dispatch.price}</span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>/mo first truck · ${PLAN_DISPLAY.ai_dispatch.extraTruck} each additional</span>
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
              <button onClick={() => setTruckPicker(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>

            {/* Truck counter */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:20, marginBottom:24 }}>
              <button onClick={() => setTruckPicker(p => ({ ...p, trucks: Math.max(1, p.trucks - 1) }))}
                style={{ width:44, height:44, borderRadius:10, border:'1px solid var(--border)', background:'var(--surface2)',
                  color:'var(--text)', fontSize:22, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>−</button>
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
                <span style={{ fontWeight:700 }}>$199/mo</span>
              </div>
              {truckPicker.trucks > 1 && (
                <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:13 }}>
                  <span style={{ color:'var(--muted)' }}>{truckPicker.trucks - 1} additional truck{truckPicker.trucks > 2 ? 's' : ''} × $99</span>
                  <span style={{ fontWeight:700 }}>${((truckPicker.trucks - 1) * 99).toLocaleString()}/mo</span>
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', fontSize:11, color:'var(--muted)' }}>
                <span>AI Dispatch (subscription) · Autonomous Fleet adds 3% per load</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', padding:'10px 0 4px', fontSize:15, borderTop:'1px solid var(--border)', marginTop:6 }}>
                <span style={{ fontWeight:800 }}>Platform Total</span>
                <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:'var(--accent)', lineHeight:1 }}>
                  ${(199 + Math.max(0, truckPicker.trucks - 1) * 79).toLocaleString()}<span style={{ fontSize:13, color:'var(--muted)' }}>/mo</span>
                </span>
              </div>
            </div>

            <button onClick={() => goToCheckout('autonomous_fleet', truckPicker.trucks)} disabled={upgradeLoading}
              style={{ width:'100%', padding:'14px', fontSize:14, fontWeight:700, border:'none', borderRadius:10,
                background:'var(--accent)', color:'#000', cursor: upgradeLoading ? 'wait' : 'pointer',
                fontFamily:"'DM Sans',sans-serif" }}>
              {upgradeLoading ? 'Redirecting to Stripe...' : `Start Free Trial — ${truckPicker.trucks} Truck${truckPicker.trucks !== 1 ? 's' : ''}`}
            </button>
            <div style={{ textAlign:'center', fontSize:11, color:'var(--muted)', marginTop:10 }}>
              14-day free trial · No charge until trial ends
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── CSV Import Tool ─────────────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  // Handle quoted fields
  const parseLine = (line) => {
    const fields = []
    let current = '', inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue }
      current += ch
    }
    fields.push(current.trim())
    return fields
  }
  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(l => {
    const vals = parseLine(l)
    const row = {}
    headers.forEach((h, i) => { row[h] = vals[i] || '' })
    return row
  }).filter(r => Object.values(r).some(v => v))
  return { headers, rows }
}

const IMPORT_TYPES = [
  { id: 'loads',    label: 'Loads',    icon: File,    desc: 'Load history — origin, destination, rate, broker, status',
    fields: [
      { key: 'origin',       label: 'Origin',       required: true },
      { key: 'destination',  label: 'Destination',  required: true },
      { key: 'gross_pay',    label: 'Gross Pay ($)', required: true, type: 'number' },
      { key: 'miles',        label: 'Miles',         type: 'number' },
      { key: 'broker',       label: 'Broker Name' },
      { key: 'driver_name',  label: 'Driver Name' },
      { key: 'equipment',    label: 'Equipment' },
      { key: 'pickup_date',  label: 'Pickup Date' },
      { key: 'delivery_date',label: 'Delivery Date' },
      { key: 'status',       label: 'Status' },
      { key: 'reference_number', label: 'Reference #' },
      { key: 'weight',       label: 'Weight' },
      { key: 'commodity',    label: 'Commodity' },
      { key: 'notes',        label: 'Notes' },
    ]
  },
  { id: 'drivers',  label: 'Drivers',  icon: Users,   desc: 'Driver roster — name, license, phone, medical card',
    fields: [
      { key: 'full_name',           label: 'Full Name',        required: true },
      { key: 'phone',               label: 'Phone' },
      { key: 'email',               label: 'Email' },
      { key: 'license_number',      label: 'License Number' },
      { key: 'license_state',       label: 'License State' },
      { key: 'license_expiry',      label: 'License Expiry' },
      { key: 'medical_card_expiry', label: 'Medical Card Expiry' },
      { key: 'status',              label: 'Status' },
      { key: 'hire_date',           label: 'Hire Date' },
      { key: 'notes',               label: 'Notes' },
    ]
  },
  { id: 'vehicles', label: 'Trucks',   icon: Truck,   desc: 'Fleet — unit number, VIN, year/make/model, plates',
    fields: [
      { key: 'unit_number',          label: 'Unit Number',      required: true },
      { key: 'type',                 label: 'Type (Truck/Trailer)' },
      { key: 'year',                 label: 'Year' },
      { key: 'make',                 label: 'Make' },
      { key: 'model',                label: 'Model' },
      { key: 'vin',                  label: 'VIN' },
      { key: 'license_plate',        label: 'License Plate' },
      { key: 'license_state',        label: 'License State' },
      { key: 'current_miles',        label: 'Current Miles', type: 'number' },
      { key: 'insurance_expiry',     label: 'Insurance Expiry' },
      { key: 'registration_expiry',  label: 'Registration Expiry' },
      { key: 'notes',                label: 'Notes' },
    ]
  },
  { id: 'expenses', label: 'Expenses', icon: CreditCard, desc: 'Expense history — fuel, tolls, repairs, maintenance',
    fields: [
      { key: 'date',         label: 'Date',     required: true },
      { key: 'category',     label: 'Category', required: true },
      { key: 'amount',       label: 'Amount ($)', required: true, type: 'number' },
      { key: 'merchant',     label: 'Merchant' },
      { key: 'driver_name',  label: 'Driver Name' },
      { key: 'load_number',  label: 'Load Number' },
      { key: 'notes',        label: 'Notes' },
    ]
  },
]

function CSVImportTool() {
  const { showToast } = useApp()
  const { addLoad, addDriver, addVehicle, addExpense } = useCarrier()
  const fileRef = useRef(null)

  const [step, setStep] = useState('select') // select | upload | map | preview | importing | done
  const [importType, setImportType] = useState(null)
  const [csvData, setCsvData] = useState({ headers: [], rows: [] })
  const [mapping, setMapping] = useState({})   // qivoriField → csvHeader
  const [fileName, setFileName] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] })

  const typeDef = IMPORT_TYPES.find(t => t.id === importType)

  const reset = () => {
    setStep('select')
    setImportType(null)
    setCsvData({ headers: [], rows: [] })
    setMapping({})
    setFileName('')
    setProgress({ done: 0, total: 0, errors: [] })
  }

  // Auto-map CSV headers to Qivori fields by fuzzy match
  const autoMap = useCallback((headers, fields) => {
    const m = {}
    const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const aliases = {
      origin: ['origin','pickup','from','pickupcity','origincity','shipper'],
      destination: ['destination','delivery','to','deliverycity','destinationcity','consignee','dropoff'],
      gross_pay: ['grosspay','gross','rate','totalrate','linehaulrate','linehaul','amount','pay','revenue'],
      miles: ['miles','distance','totalmiles','loadedmiles'],
      broker: ['broker','brokername','brokercompany','customer','shipper'],
      driver_name: ['driver','drivername','driverfullname','assigneddriver'],
      equipment: ['equipment','equipmenttype','trailertype','mode'],
      pickup_date: ['pickupdate','pickup','pickupdatetime','shipdate'],
      delivery_date: ['deliverydate','delivery','deliverydatetime','delvdate'],
      status: ['status','loadstatus'],
      reference_number: ['reference','ref','referencenumber','refnumber','refno','ponumber','po'],
      weight: ['weight','totalweight','lbs','pounds'],
      commodity: ['commodity','product','description','freight'],
      notes: ['notes','comments','instructions','specialinstructions'],
      full_name: ['fullname','name','drivername','driver','firstname','first'],
      phone: ['phone','phonenumber','mobile','cell','telephone'],
      email: ['email','emailaddress','driveremail'],
      license_number: ['licensenumber','license','cdlnumber','cdl','dlnumber'],
      license_state: ['licensestate','cdlstate','dlstate','state'],
      license_expiry: ['licenseexpiry','licenseexp','cdlexpiry','cdlexp'],
      medical_card_expiry: ['medicalcardexpiry','medicalcard','medexp','medicalexpiry','dotmedical'],
      hire_date: ['hiredate','datehired','startdate'],
      unit_number: ['unitnumber','unit','trucknumber','truckno','vehicleid','assetid'],
      type: ['type','vehicletype','assettype'],
      year: ['year','modelyear'],
      make: ['make','manufacturer'],
      model: ['model'],
      vin: ['vin','vehicleid','serialnumber'],
      license_plate: ['licenseplate','plate','platenumber','tag'],
      current_miles: ['currentmiles','odometer','mileage'],
      insurance_expiry: ['insuranceexpiry','insuranceexp'],
      registration_expiry: ['registrationexpiry','regexpiry','registrationexp'],
      date: ['date','expensedate','transactiondate'],
      category: ['category','type','expensetype','expensecategory'],
      amount: ['amount','total','cost','price'],
      merchant: ['merchant','vendor','store','location','payee'],
      load_number: ['loadnumber','load','loadid','loadref'],
    }
    fields.forEach(f => {
      const fAliases = aliases[f.key] || [normalize(f.key)]
      for (const h of headers) {
        const nh = normalize(h)
        if (fAliases.includes(nh) || nh === normalize(f.key) || nh === normalize(f.label)) {
          m[f.key] = h
          return
        }
      }
    })
    return m
  }, [])

  const handleFile = (file) => {
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const parsed = parseCSV(text)
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        showToast('', 'Import Error', 'CSV file is empty or has no data rows')
        return
      }
      setCsvData(parsed)
      const autoMapped = autoMap(parsed.headers, typeDef.fields)
      setMapping(autoMapped)
      setStep('map')
    }
    reader.readAsText(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (file && file.name.endsWith('.csv')) handleFile(file)
    else showToast('', 'Invalid File', 'Please drop a .csv file')
  }

  const requiredMapped = () => {
    if (!typeDef) return false
    return typeDef.fields.filter(f => f.required).every(f => mapping[f.key])
  }

  const doImport = async () => {
    setStep('importing')
    const rows = csvData.rows
    const total = rows.length
    setProgress({ done: 0, total, errors: [] })
    const errors = []
    let done = 0

    const addFn = { loads: addLoad, drivers: addDriver, vehicles: addVehicle, expenses: addExpense }[importType]

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i]
        const mapped = {}
        typeDef.fields.forEach(f => {
          if (mapping[f.key]) {
            let val = row[mapping[f.key]]
            if (f.type === 'number' && val) val = parseFloat(val.replace(/[^0-9.\-]/g, '')) || 0
            mapped[f.key] = val
          }
        })
        // Set defaults
        if (importType === 'loads') {
          if (!mapped.status) mapped.status = 'Delivered'
          if (!mapped.equipment) mapped.equipment = 'Dry Van'
          if (mapped.gross_pay && mapped.miles && mapped.miles > 0) {
            mapped.rate_per_mile = (mapped.gross_pay / mapped.miles).toFixed(2)
          }
        }
        if (importType === 'drivers' && !mapped.status) mapped.status = 'Active'
        if (importType === 'vehicles') {
          if (!mapped.type) mapped.type = 'Truck'
          if (!mapped.status) mapped.status = 'Active'
        }
        await addFn(mapped)
        done++
      } catch (e) {
        errors.push({ row: i + 2, error: e?.message || 'Unknown error' })
        done++
      }
      if (i % 5 === 0 || i === rows.length - 1) {
        setProgress({ done, total, errors: [...errors] })
      }
    }
    setProgress({ done, total, errors })
    setStep('done')
    showToast('', 'Import Complete', `${done - errors.length} ${typeDef.label.toLowerCase()} imported successfully`)
  }

  const cardStyle = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }
  const headerStyle = { padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:8 }

  return (
    <>
      {/* Title */}
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4, display:'flex', alignItems:'center', gap:10 }}>
          {step !== 'select' && (
            <button onClick={reset} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:0 }}>
              <Ic icon={ChevronLeft} size={18} />
            </button>
          )}
          IMPORT DATA
        </div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>
          Migrate from another TMS — import loads, drivers, trucks, and expenses from a CSV file
        </div>
      </div>

      {/* Step 1: Select data type */}
      {step === 'select' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {IMPORT_TYPES.map(t => (
            <div key={t.id} onClick={() => { setImportType(t.id); setStep('upload') }}
              style={{ ...cardStyle, cursor:'pointer', padding:'16px 20px', display:'flex', alignItems:'center', gap:16,
                transition:'all 0.15s', border:'1px solid var(--border)' }}
              onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
              onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}>
              <div style={{ width:40, height:40, borderRadius:10, background:'rgba(240,165,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Ic icon={t.icon} size={18} color="var(--accent)" />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700 }}>{t.label}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{t.desc}</div>
              </div>
              <Ic icon={ArrowRight} size={16} color="var(--muted)" />
            </div>
          ))}

          {/* Help box */}
          <div style={{ background:'rgba(240,165,0,0.04)', border:'1px solid rgba(240,165,0,0.15)', borderRadius:12, padding:'14px 18px', marginTop:8 }}>
            <div style={{ fontSize:12, fontWeight:700, marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
              <Ic icon={Info} size={14} color="var(--accent)" /> How to export from your current TMS
            </div>
            <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.7 }}>
              Most dispatch software (KeepTruckin, Truckstop, DAT, TruckingOffice, Axon) lets you export data as CSV.
              Look for "Export", "Reports", or "Download" in your current system. Save as .csv format and upload here.
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Upload CSV */}
      {step === 'upload' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={cardStyle}>
            <div style={headerStyle}>
              <Ic icon={typeDef?.icon || File} size={14} /> Import {typeDef?.label}
            </div>
            <div style={{ padding:20 }}>
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                style={{ border:'2px dashed var(--border)', borderRadius:12, padding:'40px 20px', textAlign:'center', cursor:'pointer',
                  transition:'all 0.15s', background:'var(--surface2)' }}
                onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
                onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}>
                <Ic icon={Upload} size={32} color="var(--accent)" />
                <div style={{ fontSize:14, fontWeight:700, marginTop:12 }}>Drop your CSV file here</div>
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>or click to browse</div>
                <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }}
                  onChange={e => handleFile(e.target.files?.[0])} />
              </div>

              {/* Expected fields */}
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:8 }}>EXPECTED COLUMNS</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {typeDef?.fields.map(f => (
                    <span key={f.key} style={{ fontSize:10, padding:'3px 8px', borderRadius:6,
                      background: f.required ? 'rgba(240,165,0,0.1)' : 'var(--surface2)',
                      color: f.required ? 'var(--accent)' : 'var(--muted)',
                      border:`1px solid ${f.required ? 'rgba(240,165,0,0.2)' : 'var(--border)'}` }}>
                      {f.label}{f.required ? ' *' : ''}
                    </span>
                  ))}
                </div>
              </div>

              {/* Download template */}
              <button onClick={() => {
                const headers = typeDef.fields.map(f => f.label).join(',')
                const blob = new Blob([headers + '\n'], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `qivori-${importType}-template.csv`; a.click()
                URL.revokeObjectURL(url)
              }} style={{ marginTop:14, display:'flex', alignItems:'center', gap:6, background:'none', border:'1px solid var(--border)',
                borderRadius:8, padding:'8px 14px', color:'var(--accent)', fontSize:12, fontWeight:600, cursor:'pointer',
                fontFamily:"'DM Sans',sans-serif" }}>
                <Ic icon={Download} size={14} /> Download CSV Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Column Mapping */}
      {step === 'map' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={cardStyle}>
            <div style={headerStyle}>
              <Ic icon={File} size={14} /> {fileName}
              <span style={{ fontSize:11, color:'var(--muted)', fontWeight:500, marginLeft:'auto' }}>
                {csvData.rows.length} rows found
              </span>
            </div>
            <div style={{ padding:20 }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:4 }}>Map your columns to Qivori fields</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16 }}>We auto-detected what we could. Adjust any that are wrong.</div>

              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {typeDef?.fields.map(f => (
                  <div key={f.key} style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:140, fontSize:12, fontWeight:600, flexShrink:0 }}>
                      {f.label}{f.required ? <span style={{ color:'var(--accent)' }}> *</span> : ''}
                    </div>
                    <Ic icon={ArrowRight} size={12} color="var(--muted)" />
                    <select value={mapping[f.key] || ''} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value || undefined }))}
                      style={{ flex:1, background:'var(--surface2)', border:`1px solid ${mapping[f.key] ? 'var(--success)' : f.required && !mapping[f.key] ? 'var(--danger)' : 'var(--border)'}`,
                        borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif",
                        outline:'none', appearance:'auto' }}>
                      <option value="">— skip —</option>
                      {csvData.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    {mapping[f.key] && <Ic icon={Check} size={14} color="var(--success)" />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div style={cardStyle}>
            <div style={headerStyle}><Ic icon={Eye} size={14} /> Preview (first 3 rows)</div>
            <div style={{ overflowX:'auto', padding:0 }}>
              <table style={{ width:'100%', fontSize:11, borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'var(--surface2)' }}>
                    <th style={{ padding:'8px 12px', textAlign:'left', color:'var(--muted)', fontWeight:700, borderBottom:'1px solid var(--border)' }}>#</th>
                    {typeDef?.fields.filter(f => mapping[f.key]).map(f => (
                      <th key={f.key} style={{ padding:'8px 12px', textAlign:'left', color:'var(--accent)', fontWeight:700, borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvData.rows.slice(0, 3).map((row, i) => (
                    <tr key={i}>
                      <td style={{ padding:'8px 12px', borderBottom:'1px solid var(--border)', color:'var(--muted)' }}>{i + 1}</td>
                      {typeDef?.fields.filter(f => mapping[f.key]).map(f => (
                        <td key={f.key} style={{ padding:'8px 12px', borderBottom:'1px solid var(--border)', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {row[mapping[f.key]] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={reset}
              style={{ padding:'10px 20px', borderRadius:8, border:'1px solid var(--border)', background:'transparent',
                color:'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              Cancel
            </button>
            <button onClick={doImport} disabled={!requiredMapped()}
              style={{ padding:'10px 24px', borderRadius:8, border:'none',
                background: requiredMapped() ? 'var(--accent)' : 'var(--surface2)',
                color: requiredMapped() ? '#000' : 'var(--muted)',
                fontSize:13, fontWeight:700, cursor: requiredMapped() ? 'pointer' : 'not-allowed',
                fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:6 }}>
              <Ic icon={Upload} size={14} /> Import {csvData.rows.length} {typeDef?.label}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Importing progress */}
      {step === 'importing' && (
        <div style={cardStyle}>
          <div style={{ padding:40, textAlign:'center' }}>
            <div style={{ width:48, height:48, border:'3px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%',
              margin:'0 auto 16px', animation:'spin 0.8s linear infinite' }} />
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Importing {typeDef?.label}...</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:16 }}>
              {progress.done} of {progress.total} processed
            </div>
            <div style={{ background:'var(--surface2)', borderRadius:8, height:8, overflow:'hidden', maxWidth:300, margin:'0 auto' }}>
              <div style={{ height:'100%', background:'var(--accent)', borderRadius:8, width:`${progress.total ? (progress.done / progress.total * 100) : 0}%`, transition:'width 0.3s' }} />
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Done */}
      {step === 'done' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={cardStyle}>
            <div style={{ padding:40, textAlign:'center' }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(34,197,94,0.1)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                <Ic icon={CheckCircle} size={28} color="var(--success)" />
              </div>
              <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Import Complete</div>
              <div style={{ fontSize:13, color:'var(--muted)' }}>
                <strong style={{ color:'var(--success)' }}>{progress.done - progress.errors.length}</strong> {typeDef?.label.toLowerCase()} imported successfully
                {progress.errors.length > 0 && (
                  <span> — <strong style={{ color:'var(--danger)' }}>{progress.errors.length}</strong> failed</span>
                )}
              </div>
            </div>
          </div>

          {/* Errors */}
          {progress.errors.length > 0 && (
            <div style={{ ...cardStyle, border:'1px solid var(--danger)' }}>
              <div style={{ ...headerStyle, color:'var(--danger)' }}>
                <Ic icon={AlertTriangle} size={14} /> {progress.errors.length} Rows Failed
              </div>
              <div style={{ padding:16, maxHeight:200, overflowY:'auto' }}>
                {progress.errors.slice(0, 20).map((e, i) => (
                  <div key={i} style={{ fontSize:11, color:'var(--muted)', padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                    <strong>Row {e.row}:</strong> {e.error}
                  </div>
                ))}
                {progress.errors.length > 20 && (
                  <div style={{ fontSize:11, color:'var(--muted)', padding:'8px 0' }}>
                    ...and {progress.errors.length - 20} more
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={reset}
              style={{ padding:'10px 20px', borderRadius:8, border:'none', background:'var(--accent)', color:'#000',
                fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              Import More Data
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ── Dispatch Rules (AI thresholds + compliance enforcement) ────────────────────
function DispatchSettings() {
  const { showToast } = useApp()
  const [s, setS] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const db = import('../../lib/database')

  useEffect(() => {
    db.then(m => m.fetchCarrierSettings()).then(data => {
      setS(data || {
        min_profit: 800, min_rpm: 1.00, min_profit_per_day: 400, max_deadhead_miles: 150,
        max_deadhead_pct: 15, preferred_max_weight: 37000, auto_book_confidence: 75,
        auto_book_enabled: true, fuel_cost_per_mile: 0.55, enforce_compliance: true,
        hos_min_hours: 6, block_expired_cdl: true, block_expired_medical: true,
        block_active_defects: true, block_failed_drug_test: true, block_expired_insurance: true,
        default_payment_terms: 'NET 30', auto_invoice_on_delivery: true, home_time_days: 14,
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const m = await db
      await m.upsertCarrierSettings(s)
      showToast('success', 'Saved', 'Dispatch rules updated — AI will use these thresholds')
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to save')
    }
    setSaving(false)
  }

  if (loading || !s) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading dispatch settings...</div>

  const Field = ({ label, sub, value, onChange, type = 'number', suffix, min, max, step }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type={type} value={value ?? ''} onChange={e => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
          min={min} max={max} step={step || 1}
          style={{ width: 90, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", textAlign: 'right' }} />
        {suffix && <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 30 }}>{suffix}</span>}
      </div>
    </div>
  )

  const Toggle = ({ label, sub, value, onChange }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div onClick={() => onChange(!value)}
        style={{ width: 44, height: 24, borderRadius: 12, background: value ? 'var(--accent)' : 'var(--border)', cursor: 'pointer', position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 3, left: value ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'all 0.2s' }} />
      </div>
    </div>
  )

  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>AI Dispatch Rules</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
        These thresholds control how Q evaluates loads. Every AI decision uses your rules.
      </div>

      {/* Profit thresholds */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1, marginBottom: 10, marginTop: 4 }}>PROFIT THRESHOLDS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <Field label="Minimum Profit" sub="Reject loads below this estimated profit" value={s.min_profit} onChange={v => setS(p => ({ ...p, min_profit: v }))} suffix="$" min={0} max={5000} />
        <Field label="Minimum RPM" sub="Revenue per mile floor" value={s.min_rpm} onChange={v => setS(p => ({ ...p, min_rpm: v }))} suffix="$/mi" min={0} max={10} step={0.05} />
        <Field label="Min Profit/Day" sub="Daily profit floor for multi-day loads" value={s.min_profit_per_day} onChange={v => setS(p => ({ ...p, min_profit_per_day: v }))} suffix="$/day" min={0} max={2000} />
        <Field label="Max Deadhead" sub="Maximum empty miles to pickup" value={s.max_deadhead_miles} onChange={v => setS(p => ({ ...p, max_deadhead_miles: v }))} suffix="mi" min={0} max={500} />
        <Field label="Preferred Max Weight" sub="Flag loads heavier than this" value={s.preferred_max_weight} onChange={v => setS(p => ({ ...p, preferred_max_weight: v }))} suffix="lbs" min={10000} max={80000} step={1000} />
        <Field label="Fuel Cost/Mile" sub="Used in profit calculation" value={s.fuel_cost_per_mile} onChange={v => setS(p => ({ ...p, fuel_cost_per_mile: v }))} suffix="$/mi" min={0} max={2} step={0.01} />
      </div>

      {/* Auto-book */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1, marginBottom: 10 }}>AUTO-BOOK</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <Toggle label="Auto-Book Enabled" sub="Let Q automatically book instant-book loads that pass all checks" value={s.auto_book_enabled} onChange={v => setS(p => ({ ...p, auto_book_enabled: v }))} />
        <Field label="Min Confidence" sub="Only auto-book when AI confidence exceeds this %" value={s.auto_book_confidence} onChange={v => setS(p => ({ ...p, auto_book_confidence: v }))} suffix="%" min={50} max={100} />
      </div>

      {/* Compliance enforcement */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger, #ef4444)', letterSpacing: 1, marginBottom: 10 }}>COMPLIANCE ENFORCEMENT</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <Toggle label="Enforce Compliance" sub="Block dispatch if driver/vehicle fails compliance checks" value={s.enforce_compliance} onChange={v => setS(p => ({ ...p, enforce_compliance: v }))} />
        <Toggle label="Block Expired CDL" sub="Prevent dispatching drivers with expired CDL" value={s.block_expired_cdl} onChange={v => setS(p => ({ ...p, block_expired_cdl: v }))} />
        <Toggle label="Block Expired Medical" sub="Prevent dispatching with expired medical card" value={s.block_expired_medical} onChange={v => setS(p => ({ ...p, block_expired_medical: v }))} />
        <Toggle label="Block Active DVIR Defects" sub="Prevent dispatching vehicles with unresolved defects" value={s.block_active_defects} onChange={v => setS(p => ({ ...p, block_active_defects: v }))} />
        <Toggle label="Block Failed Drug Test" sub="Prevent dispatching drivers with positive/refused results" value={s.block_failed_drug_test} onChange={v => setS(p => ({ ...p, block_failed_drug_test: v }))} />
        <Toggle label="Block Expired Insurance" sub="Prevent dispatching vehicles with expired insurance" value={s.block_expired_insurance} onChange={v => setS(p => ({ ...p, block_expired_insurance: v }))} />
        <Field label="Min HOS Hours" sub="Minimum drive hours required to dispatch" value={s.hos_min_hours} onChange={v => setS(p => ({ ...p, hos_min_hours: v }))} suffix="hrs" min={1} max={11} step={0.5} />
      </div>

      {/* Operations */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1, marginBottom: 10 }}>OPERATIONS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        <Toggle label="Auto-Invoice on Delivery" sub="Generate invoice automatically when load status changes to Delivered" value={s.auto_invoice_on_delivery} onChange={v => setS(p => ({ ...p, auto_invoice_on_delivery: v }))} />
        <Field label="Home Time Interval" sub="Days out before scheduling home time" value={s.home_time_days} onChange={v => setS(p => ({ ...p, home_time_days: v }))} suffix="days" min={7} max={30} />
      </div>

      <button className="btn btn-primary" disabled={saving} onClick={save}
        style={{ padding: '12px 32px', fontSize: 13, fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving...' : 'Save Dispatch Rules'}
      </button>
    </>
  )
}

// ── Settings tab ───────────────────────────────────────────────────────────────
export function SettingsTab() {
  const { showToast, theme, setTheme, companyRole, isAdmin } = useApp()
  const { company: ctxCompany, updateCompany } = useCarrier()
  const [company, setCompany] = useState(ctxCompany || { name:'', mc:'', dot:'', address:'', phone:'', email:'', ein:'' })
  const [billing, setBilling] = useState({
    factoringRate: ctxCompany?.factoring_rate || '2.5',
    payDefault: ctxCompany?.default_pay_rate || '28%',
    fastpayEnabled: ctxCompany?.fastpay_enabled !== false,
    autoInvoice: ctxCompany?.auto_invoice !== false,
    autoFactor: ctxCompany?.auto_factor_on_delivery || false,
  })
  const [fuelCard, setFuelCard] = useState(ctxCompany?.fuel_card_provider || '')
  const [tollTransponder, setTollTransponder] = useState(ctxCompany?.toll_transponder || '')
  const [providerKeys, setProviderKeys] = useState({
    resend_api_key:'', checkr_api_key:'', sambasafety_api_key:'', sambasafety_account_id:'',
    fmcsa_api_key:'', fmcsa_webkey:'', fadv_client_id:'', fadv_client_secret:'',
  })
  const integrations = [
    { name:'Samsara ELD',      keyField:'samsara_api_key', icon: Smartphone, desc:'Connect your Samsara ELD to sync device data', section:'providers' },
    { name:'Motive ELD',       keyField:'motive_api_key',  icon: Smartphone, desc:'Connect your Motive (KeepTruckin) ELD', section:'providers' },
    { name:'QuickBooks Online', keyField:'quickbooks_key',  icon: BarChart2, desc:'Connect to auto-sync expenses & invoices', section:'providers' },
    { name:'DAT Load Board',    keyField:'dat_api_key',     icon: Truck, desc:'Connect to pull spot rates on your lanes', section:'loadboards' },
    { name:'Uber Freight',      keyField:'uber_freight_key', icon: Truck, desc:'Access Uber Freight loads, quotes, and tracking', section:'loadboards' },
    { name:'123Loadboard',      keyField:'lb123_api_key',   icon: Truck, desc:'Connect to search and book loads', section:'loadboards' },
  ].map(int => ({
    ...int,
    status: providerKeys[int.keyField] ? 'Connected' : 'Not connected',
    statusC: providerKeys[int.keyField] ? 'var(--success)' : 'var(--muted)',
  }))
  const [team] = useState([
    { name:'You (Owner)',     email: company.email || '', role:'Admin',    roleC:'var(--accent)' },
  ])
  const [notifPrefs, setNotifPrefs] = useState({
    newMatch: ctxCompany?.notif_new_match !== false,
    loadStatus: ctxCompany?.notif_load_status !== false,
    driverAlert: ctxCompany?.notif_driver_alert !== false,
    payReady: ctxCompany?.notif_pay_ready !== false,
    compliance: ctxCompany?.notif_compliance !== false,
    marketRates: ctxCompany?.notif_market_rates === true,
  })
  const [settingsSec, setSettingsSec] = useState('company')
  const [keysLoaded, setKeysLoaded] = useState(false)
  const [fmcsaLoading, setFmcsaLoading] = useState(false)
  const [fmcsaResult, setFmcsaResult] = useState(null)

  const doFMCSALookup = async () => {
    const val = (company._lookupVal || '').trim().replace(/[^0-9]/g, '')
    if (!val) { showToast('error', 'Enter a Number', 'Type your MC# or DOT# to lookup'); return }
    setFmcsaLoading(true)
    setFmcsaResult(null)
    try {
      // Try DOT first (6-7 digits usually), then MC
      const param = val.length >= 7 ? `dot=${val}` : `mc=${val}`
      const res = await apiFetch(`/api/fmcsa-lookup?${param}`)
      const data = await res.json()
      if (!res.ok || !data.carrier) {
        // Try the other param
        const alt = val.length >= 7 ? `mc=${val}` : `dot=${val}`
        const res2 = await apiFetch(`/api/fmcsa-lookup?${alt}`)
        const data2 = await res2.json()
        if (!res2.ok || !data2.carrier) { showToast('error', 'Not Found', 'No carrier found with that number'); setFmcsaLoading(false); return }
        data.carrier = data2.carrier
      }
      const c = data.carrier
      setFmcsaResult(c)
      const addr = [c.phyStreet, c.phyCity, c.phyState, c.phyZip].filter(Boolean).join(', ')
      setCompany(prev => ({
        ...prev,
        name: c.legalName || c.dbaName || prev.name,
        mc: c.mcNumber || prev.mc,
        dot: c.dotNumber || prev.dot,
        phone: c.phone || prev.phone,
        address: addr || prev.address,
      }))
      showToast('success', 'Company Found', `${c.legalName} — info auto-filled`)
    } catch (err) {
      showToast('error', 'Lookup Failed', err.message || 'Could not reach FMCSA')
    }
    setFmcsaLoading(false)
  }

  // Load provider keys from company record
  useEffect(() => {
    if (ctxCompany?.provider_keys) {
      setProviderKeys(prev => ({ ...prev, ...ctxCompany.provider_keys }))
      setKeysLoaded(true)
    }
  }, [ctxCompany])

  const saveProviderKeys = async () => {
    try {
      await updateCompany({ provider_keys: providerKeys })
      showToast('success', 'Keys Saved', 'Provider API keys updated securely')
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to save keys')
    }
  }

  const [pageEnabled, setPageEnabled] = useState(ctxCompany?.public_page_enabled || false)
  const [pageSlug, setPageSlug] = useState(ctxCompany?.slug || '')
  const [pageTagline, setPageTagline] = useState(ctxCompany?.tagline || '')
  const [pageServiceAreas, setPageServiceAreas] = useState(ctxCompany?.service_areas || '')
  const [pageEquipment, setPageEquipment] = useState(ctxCompany?.equipment_types || '')

  // Owner-only settings sections — hidden from dispatchers, accountants, drivers
  const OWNER_ONLY_SECTIONS = new Set(['team', 'subscription', 'providers', 'integrations'])

  const ALL_SECTIONS = [
    { id:'company',        icon: Building2, label:'Company Profile' },
    { id:'website',        icon: Globe, label:'My Website' },
    { id:'dispatch',       icon: Zap, label:'Dispatch Rules' },
    { id:'loadboards',     icon: Globe, label:'Load Boards' },
    { id:'subscription',   icon: Star, label:'Subscription' },
    { id:'billing',        icon: CreditCard, label:'Billing & Pay' },
    { id:'insurance',      icon: FileCheck, label:'Insurance' },
    { id:'providers',      icon: Shield, label:'Provider Keys' },
    { id:'integrations',   icon: Plug, label:'Integrations' },
    { id:'team',           icon: Users, label:'Team & Access' },
    { id:'notifications',  icon: Bell, label:'Notifications' },
    { id:'sms',            icon: Smartphone, label:'SMS Alerts' },
    { id:'invoicing',      icon: FileText, label:'Invoicing' },
    { id:'import-data',    icon: Upload, label:'Import Data' },
    { id:'appearance',     icon: Palette, label:'Appearance' },
    { id:'security',       icon: Shield, label:'Security' },
    { id:'activity-data',  icon: Activity, label:'Activity & Data' },
  ]

  const SECTIONS = isAdmin ? ALL_SECTIONS : ALL_SECTIONS.filter(s => !OWNER_ONLY_SECTIONS.has(s.id))

  const FieldRow = ({ label, value, onChange, type='text' }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <label style={{ fontSize:11, color:'var(--muted)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
    </div>
  )

  return (
    <div style={{ display:'flex', height:'100%', minHeight:0, overflow:'hidden' }}>

      {/* Sidebar */}
      <div style={{ width:200, flexShrink:0, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'14px 16px 8px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2 }}>SETTINGS</div>
        </div>
        {SECTIONS.map(s => {
          const isActive = settingsSec === s.id
          return (
            <button key={s.id} onClick={() => setSettingsSec(s.id)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'11px 16px', border:'none', cursor:'pointer', textAlign:'left',
                background: isActive ? 'rgba(240,165,0,0.08)' : 'transparent', borderLeft:`3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                transition:'all 0.15s', fontFamily:"'DM Sans',sans-serif",
                color: isActive ? 'var(--accent)' : 'var(--text)', fontSize:12, fontWeight: isActive ? 700 : 500 }}
              onMouseOver={e => { if(!isActive) e.currentTarget.style.background='rgba(255,255,255,0.03)' }}
              onMouseOut={e => { if(!isActive) e.currentTarget.style.background='transparent' }}>
              <span><Ic icon={s.icon} size={14} /></span>{s.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="settings-scroll" style={{ flex:1, minHeight:0, overflowY:'auto', padding:24, paddingBottom:120 }}>

        {/* Company Profile */}
        {settingsSec === 'company' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>COMPANY PROFILE</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Your carrier identity — used on rate cons, invoices, and FMCSA filings</div>
            </div>

            {/* Logo Upload */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:14 }}>Company Logo</div>
              <div style={{ display:'flex', alignItems:'center', gap:20 }}>
                {/* Preview */}
                <div style={{ width:100, height:100, borderRadius:12, border:'2px dashed var(--border)', background:'var(--surface2)',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, overflow:'hidden', position:'relative' }}>
                  {company.logo
                    ? <img src={company.logo} alt="Company logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                    : (
                      <div style={{ textAlign:'center' }}>
                        <Ic icon={Truck} size={28} color="var(--muted)" />
                        <div style={{ fontSize:9, color:'var(--muted)', marginTop:4 }}>No logo</div>
                      </div>
                    )
                  }
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>
                    {company.logo ? 'Logo uploaded ✓' : 'Upload your company logo'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12, lineHeight:1.6 }}>
                    PNG, JPG, or SVG — max 2 MB<br/>
                    Shown on invoices, rate cons, and sidebar
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <label style={{ padding:'8px 16px', fontSize:12, fontWeight:700, borderRadius:8, background:'var(--accent)', color:'#000',
                      cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'inline-flex', alignItems:'center', gap:6 }}>
                      {company.logo ? 'Replace Logo' : 'Upload Logo'}
                      <input type="file" accept="image/*" style={{ display:'none' }}
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          if (file.size > 2 * 1024 * 1024) { showToast('','File too large','Max 2 MB — try a smaller image'); return }
                          const reader = new FileReader()
                          reader.onload = ev => {
                            setCompany(c => ({ ...c, logo: ev.target.result }))
                            showToast('','Logo Uploaded', file.name + ' — save to apply')
                          }
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                    {company.logo && (
                      <button className="btn btn-ghost" style={{ fontSize:12 }}
                        onClick={() => { setCompany(c => ({ ...c, logo: '' })); showToast('','Logo Removed','Reverted to initials') }}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* FMCSA Auto-Lookup */}
            <div style={{ background:'linear-gradient(135deg, rgba(240,165,0,0.06), rgba(240,165,0,0.02))', border:'1px solid rgba(240,165,0,0.2)', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:4 }}>Auto-Fill from FMCSA</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:14 }}>Enter your MC# or DOT# and we'll pull your company info automatically</div>
              <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4 }}>
                  <label style={{ fontSize:11, color:'var(--muted)' }}>MC or DOT Number</label>
                  <input type="text" placeholder="e.g. 892451 or 3847291" value={company._lookupVal || ''} onChange={e => setCompany(c => ({ ...c, _lookupVal: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') doFMCSALookup() }}
                    style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
                </div>
                <button onClick={doFMCSALookup} disabled={fmcsaLoading}
                  style={{ padding:'9px 20px', fontSize:12, fontWeight:700, background:'var(--accent)', color:'#000', border:'none', borderRadius:8, cursor:'pointer', whiteSpace:'nowrap', opacity: fmcsaLoading ? 0.6 : 1 }}>
                  {fmcsaLoading ? 'Looking up...' : 'Lookup'}
                </button>
              </div>
              {fmcsaResult && (
                <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:8, fontSize:12, color:'var(--success)' }}>
                  Found: <strong>{fmcsaResult.legalName}</strong> — DOT# {fmcsaResult.dotNumber} {fmcsaResult.mcNumber && `| MC# ${fmcsaResult.mcNumber}`}
                </div>
              )}
            </div>

            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <FieldRow label="Company Name"   value={company.name}    onChange={v => setCompany(c=>({...c,name:v}))} />
              <FieldRow label="MC Number"      value={company.mc}      onChange={v => setCompany(c=>({...c,mc:v}))} />
              <FieldRow label="DOT Number"     value={company.dot}     onChange={v => setCompany(c=>({...c,dot:v}))} />
              <FieldRow label="EIN"            value={company.ein}     onChange={v => setCompany(c=>({...c,ein:v}))} />
              <FieldRow label="Phone"          value={company.phone}   onChange={v => setCompany(c=>({...c,phone:v}))} />
              <FieldRow label="Email"          value={company.email}   onChange={v => setCompany(c=>({...c,email:v}))} type="email" />
              <div style={{ gridColumn:'1/-1' }}>
                <FieldRow label="Business Address" value={company.address} onChange={v => setCompany(c=>({...c,address:v}))} />
              </div>
            </div>
            <div>
              <button className="btn btn-primary" style={{ padding:'11px 28px' }} onClick={() => { updateCompany(company); showToast('','Saved','Company profile updated') }}>Save Changes</button>
            </div>
          </>
        )}

        {/* My Website — carrier public landing page */}
        {settingsSec === 'website' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>MY WEBSITE</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>A professional landing page auto-generated from your company profile — share with brokers and shippers</div>
            </div>

            {/* Enable Toggle */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700 }}>Publish My Website</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>Make your carrier page visible to brokers and the public</div>
                </div>
                <div onClick={() => setPageEnabled(!pageEnabled)}
                  style={{ width:44, height:24, borderRadius:12, background: pageEnabled ? 'var(--accent)' : 'var(--border)', cursor:'pointer', position:'relative', transition:'all 0.2s', flexShrink:0 }}>
                  <div style={{ position:'absolute', top:3, left: pageEnabled ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'all 0.2s' }}/>
                </div>
              </div>
            </div>

            {/* URL Slug */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:10 }}>Your Page URL</div>
              <div style={{ display:'flex', alignItems:'center', gap:0, background:'var(--surface2)', borderRadius:8, border:'1px solid var(--border)', overflow:'hidden' }}>
                <span style={{ padding:'9px 12px', fontSize:13, color:'var(--muted)', whiteSpace:'nowrap', borderRight:'1px solid var(--border)', background:'rgba(255,255,255,0.02)' }}>qivori.com/#/c/</span>
                <input type="text" value={pageSlug} onChange={e => setPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="your-company-name" style={{ flex:1, padding:'9px 12px', border:'none', background:'transparent', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>Only lowercase letters, numbers, and hyphens. This is your unique URL.</div>
              {!pageSlug && company.name && (
                <button style={{ marginTop:8, padding:'6px 14px', fontSize:11, fontWeight:700, background:'rgba(240,165,0,0.1)', color:'var(--accent)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:6, cursor:'pointer' }}
                  onClick={() => setPageSlug(company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))}>
                  Auto-generate from company name
                </button>
              )}
            </div>

            {/* Tagline */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ fontSize:12, fontWeight:700 }}>Page Details</div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:11, color:'var(--muted)' }}>Tagline</label>
                <input type="text" value={pageTagline} onChange={e => setPageTagline(e.target.value)} placeholder="e.g. Reliable freight hauling across the Midwest"
                  style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:11, color:'var(--muted)' }}>Equipment Types (comma-separated)</label>
                <input type="text" value={pageEquipment} onChange={e => setPageEquipment(e.target.value)} placeholder="e.g. Dry Van, Reefer, Flatbed"
                  style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:11, color:'var(--muted)' }}>Service Areas (comma-separated)</label>
                <input type="text" value={pageServiceAreas} onChange={e => setPageServiceAreas(e.target.value)} placeholder="e.g. Midwest, Southeast, Nationwide"
                  style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
              </div>
            </div>

            {/* Save + Preview */}
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <button className="btn btn-primary" style={{ padding:'11px 28px' }} onClick={() => {
                if (!pageSlug) { showToast('error','Missing Slug','Enter a URL slug for your page'); return }
                updateCompany({ public_page_enabled: pageEnabled, slug: pageSlug, tagline: pageTagline, service_areas: pageServiceAreas, equipment_types: pageEquipment })
                showToast('','Saved', pageEnabled ? 'Your carrier page is now live!' : 'Website settings saved')
              }}>Save Website Settings</button>
              {pageSlug && (
                <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => window.open(`${window.location.origin}/#/c/${pageSlug}`, '_blank')}>
                  Preview Page ↗
                </button>
              )}
            </div>

            {/* Live Preview Card */}
            {pageSlug && pageEnabled && (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, marginTop:8 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', letterSpacing:1, marginBottom:8 }}>LIVE URL</div>
                <div style={{ fontSize:14, fontWeight:600, wordBreak:'break-all' }}>
                  <a href={`${window.location.origin}/#/c/${pageSlug}`} target="_blank" rel="noopener noreferrer" style={{ color:'var(--accent)', textDecoration:'none' }}>
                    {window.location.origin}/#/c/{pageSlug}
                  </a>
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>Share this link with brokers, shippers, or add it to your email signature</div>
              </div>
            )}
          </>
        )}

        {/* Dispatch Rules — AI thresholds + compliance enforcement */}
        {settingsSec === 'dispatch' && <DispatchSettings />}

        {/* Load Boards */}
        {settingsSec === 'loadboards' && <LoadBoardSettings />}

        {/* Subscription Management */}
        {settingsSec === 'subscription' && <SubscriptionSettings />}

        {/* Billing & Pay */}
        {settingsSec === 'billing' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>BILLING & PAY SETTINGS</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Factoring rate, default driver pay model, and invoice automation</div>
            </div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Factoring Rate (%)</label>
                  <input type="number" value={billing.factoringRate} onChange={e => setBilling(b=>({...b,factoringRate:e.target.value}))} min="0" max="10" step="0.1"
                    style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", width:'100%', boxSizing:'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Default Driver Pay %</label>
                  <input type="text" value={billing.payDefault} onChange={e => setBilling(b=>({...b,payDefault:e.target.value}))}
                    style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", width:'100%', boxSizing:'border-box' }} />
                </div>
              </div>
              {[
                { key:'fastpayEnabled', label:'FastPay Enabled', sub:'Allow drivers to request same-day pay advances' },
                { key:'autoInvoice',    label:'Auto-Generate Invoices', sub:'Automatically create invoice when load is delivered' },
                { key:'autoFactor',     label:'Auto-Factor on Delivery', sub:'Automatically submit invoice to factoring company when load is delivered — same day pay' },
              ].map(opt => (
                <div key={opt.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'var(--surface2)', borderRadius:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{opt.sub}</div>
                  </div>
                  <div onClick={() => setBilling(b=>({...b,[opt.key]:!b[opt.key]}))}
                    style={{ width:44, height:24, borderRadius:12, background: billing[opt.key] ? 'var(--accent)' : 'var(--border)', cursor:'pointer', position:'relative', transition:'all 0.2s' }}>
                    <div style={{ position:'absolute', top:3, left: billing[opt.key] ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'all 0.2s' }}/>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ padding:'11px 28px', width:'fit-content' }} onClick={() => {
              updateCompany({
                factoring_rate: parseFloat(billing.factoringRate) || 2.5,
                default_pay_rate: billing.payDefault,
                fastpay_enabled: billing.fastpayEnabled,
                auto_invoice: billing.autoInvoice,
                auto_factor_on_delivery: billing.autoFactor,
              })
              showToast('','Saved','Billing settings updated')
            }}>Save Changes</button>
          </>
        )}

        {/* Insurance — renders InsuranceHub from CarrierLayout */}
        {settingsSec === 'insurance' && (
          <Suspense fallback={<div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Loading...</div>}>
            <InsuranceHub />
          </Suspense>
        )}

        {/* Provider Keys */}
        {settingsSec === 'providers' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>PROVIDER API KEYS</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Connect your screening providers to automate driver onboarding checks</div>
            </div>

            <div style={{ background:'rgba(77,142,240,0.06)', border:'1px solid rgba(77,142,240,0.15)', borderRadius:10, padding:'14px 18px', fontSize:12, color:'var(--accent3)', lineHeight:1.6 }}>
              <strong>How it works:</strong> Your API keys are stored securely in your company record (encrypted, RLS-protected). When you add a new driver, Qivori automatically orders checks through your provider accounts. <strong>You only pay the providers directly — Qivori charges nothing extra.</strong>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14, width:'100%' }}>
              {[
                { section: 'Email (Consent Forms)', keys: [
                  { key:'resend_api_key', label:'Resend API Key', ph:'re_xxxxxxxx', link:'https://resend.com', note:'Free: 100 emails/day — sends consent forms to new drivers' },
                ]},
                { section: 'Background & Employment', keys: [
                  { key:'checkr_api_key', label:'Checkr API Key', ph:'xxxxxxxxxxxxxxxx', link:'https://checkr.com', note:'Background checks + 3-year employment verification' },
                ]},
                { section: 'Motor Vehicle Record (MVR)', keys: [
                  { key:'sambasafety_api_key', label:'SambaSafety API Key', ph:'xxxxxxxxxxxxxxxx', link:'https://sambasafety.com', note:'Instant MVR pulls from all 50 states' },
                  { key:'sambasafety_account_id', label:'SambaSafety Account ID', ph:'ACC-xxxxx' },
                ]},
                { section: 'FMCSA (Clearinghouse + PSP + CDL)', keys: [
                  { key:'fmcsa_api_key', label:'FMCSA Clearinghouse API Key', ph:'xxxxxxxxxxxxxxxx', link:'https://clearinghouse.fmcsa.dot.gov', note:'Drug & alcohol violation queries ($1.25/query)' },
                  { key:'fmcsa_webkey', label:'FMCSA WebKey (PSP)', ph:'xxxxxxxxxxxxxxxx', link:'https://www.psp.fmcsa.dot.gov', note:'Safety reports + CDL verification ($10/report)' },
                ]},
                { section: 'Drug & Alcohol Testing', keys: [
                  { key:'fadv_client_id', label:'First Advantage Client ID', ph:'xxxxxxxxxxxxxxxx', link:'https://fadv.com', note:'DOT 5-panel drug & alcohol screening' },
                  { key:'fadv_client_secret', label:'First Advantage Client Secret', ph:'xxxxxxxxxxxxxxxx' },
                ]},
              ].map(group => (
                <div key={group.section} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', width:'100%' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{group.section}</div>
                    {group.keys.every(k => providerKeys[k.key]) && (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(34,197,94,0.1)', color:'var(--success)' }}>Connected</span>
                    )}
                    {group.keys.every(k => !providerKeys[k.key]) && (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(74,85,112,0.15)', color:'var(--muted)' }}>Not set</span>
                    )}
                  </div>
                  <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
                    {group.keys.map(k => (
                      <div key={k.key}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                          <label style={{ fontSize:11, color:'var(--muted)' }}>{k.label}</label>
                          {k.link && <a href={k.link} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, color:'var(--accent3)', textDecoration:'none' }}>Sign up →</a>}
                        </div>
                        <input
                          type="password"
                          value={providerKeys[k.key]}
                          onChange={e => setProviderKeys(p => ({ ...p, [k.key]: e.target.value }))}
                          placeholder={k.ph}
                          style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }}
                        />
                        {k.note && <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{k.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <button className="btn btn-primary" style={{ alignSelf:'flex-start', padding:'12px 32px', fontSize:13, fontWeight:700 }} onClick={saveProviderKeys}>
                Save Provider Keys
              </button>
            </div>
          </>
        )}

        {/* Integrations */}
        {settingsSec === 'integrations' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>INTEGRATIONS</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Connect your ELD, fuel card, accounting, and load board</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {/* Fuel Card Provider */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:44, height:44, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ic icon={Fuel} size={22} /></div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Fuel Card</div>
                  <select value={fuelCard} onChange={e => { setFuelCard(e.target.value); updateCompany({ fuel_card_provider: e.target.value }); showToast('', 'Saved', e.target.value || 'Fuel card cleared') }}
                    style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif" }}>
                    <option value="">Select your fuel card...</option>
                    {['EFS (WEX/Fleet One)', 'Comdata', 'TCS Fuel Card', 'Pilot RoadRunner', 'Loves Fleet Card', 'RTS Fuel Card', 'Mudflap', 'AtoB', 'Coast', 'Fuelman', 'Voyager', 'Pacific Pride', 'CFN', 'T-Chek', 'MultiService', 'I don\'t use a fuel card', 'Other'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Toll Transponder */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:44, height:44, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ic icon={Route} size={22} /></div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Toll Transponder</div>
                  <select value={tollTransponder} onChange={e => { setTollTransponder(e.target.value); updateCompany({ toll_transponder: e.target.value }); showToast('', 'Saved', e.target.value || 'Toll transponder cleared') }}
                    style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif" }}>
                    <option value="">Select your toll transponder...</option>
                    {['Bestpass', 'PrePass', 'E-ZPass', 'SunPass (FL)', 'TxTag (TX)', 'I-PASS (IL)', 'Peach Pass (GA)', 'PikePass (OK)', 'Good To Go (WA)', 'FasTrak (CA)', 'I don\'t use a transponder', 'Other'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {integrations.map(int => (
                <div key={int.name} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:44, height:44, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ic icon={int.icon} size={22} /></div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:3 }}>
                      <span style={{ fontSize:14, fontWeight:700 }}>{int.name}</span>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:int.statusC+'15', color:int.statusC }}>{int.status}</span>
                    </div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>{int.desc}</div>
                  </div>
                  <button className={int.status === 'Connected' ? 'btn btn-ghost' : 'btn btn-primary'} style={{ fontSize:11 }}
                    onClick={() => {
                      if (int.status === 'Connected') {
                        setProviderKeys(p => ({ ...p, [int.keyField]: '' }))
                        updateCompany({ provider_keys: { ...providerKeys, [int.keyField]: '' } })
                        showToast('', 'Disconnected', int.name)
                      } else {
                        setSettingsSec(int.section)
                        showToast('', 'Connect', `Enter your ${int.name} API key in the ${int.section === 'providers' ? 'Provider Keys' : 'Load Boards'} section`)
                      }
                    }}>
                    {int.status === 'Connected' ? 'Disconnect' : '+ Connect'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Team */}
        {settingsSec === 'team' && (
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
            <TeamManagement />
          </Suspense>
        )}

        {/* Notifications */}
        {settingsSec === 'notifications' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>NOTIFICATION PREFERENCES</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Choose what alerts appear in your notification bell and email</div>
            </div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              {[
                { key:'newMatch',    label:'AI Load Matches',      sub:'When AI finds a high-score load on your lanes' },
                { key:'loadStatus',  label:'Load Status Changes',  sub:'Pickup confirmed, delivered, exceptions' },
                { key:'driverAlert', label:'Driver Alerts',        sub:'HOS violations, CDL expiry, inspection due' },
                { key:'payReady',    label:'Payment Ready',        sub:'FastPay available, invoice paid, factoring funded' },
                { key:'compliance',  label:'Compliance Warnings',  sub:'Registration, insurance, DOT inspection due' },
                { key:'marketRates', label:'Market Rate Alerts',   sub:'When rates spike 10%+ on your active lanes' },
              ].map((opt, i, arr) => (
                <div key={opt.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 20px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{opt.sub}</div>
                  </div>
                  <div onClick={() => setNotifPrefs(p=>({...p,[opt.key]:!p[opt.key]}))}
                    style={{ width:44, height:24, borderRadius:12, background: notifPrefs[opt.key] ? 'var(--accent)' : 'var(--border)', cursor:'pointer', position:'relative', transition:'all 0.2s', flexShrink:0 }}>
                    <div style={{ position:'absolute', top:3, left: notifPrefs[opt.key] ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'all 0.2s' }}/>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ padding:'11px 28px', width:'fit-content' }} onClick={() => {
              updateCompany({
                notif_new_match: notifPrefs.newMatch,
                notif_load_status: notifPrefs.loadStatus,
                notif_driver_alert: notifPrefs.driverAlert,
                notif_pay_ready: notifPrefs.payReady,
                notif_compliance: notifPrefs.compliance,
                notif_market_rates: notifPrefs.marketRates,
              })
              showToast('','Saved','Notification preferences saved')
            }}>Save Preferences</button>
          </>
        )}

        {/* SMS Alerts */}
        {settingsSec === 'sms' && (
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
            <SMSSettings />
          </Suspense>
        )}

        {/* Invoicing Settings */}
        {settingsSec === 'invoicing' && (
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
            <InvoicingSettings />
          </Suspense>
        )}

        {/* Import Data */}
        {settingsSec === 'import-data' && (
          <CSVImportTool />
        )}

        {/* Appearance */}
        {settingsSec === 'appearance' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>APPEARANCE & ACCESSIBILITY</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Customize how Qivori looks — including colorblind-safe modes</div>
            </div>

            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Palette} size={14} /> Color Theme</div>
              <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  {
                    id: 'default',
                    label: 'Default Dark',
                    sub: 'The classic Qivori dark theme — gold accents, deep navy background',
                    icon: Moon,
                    preview: ['#07090e','#f0a500','#22c55e','#ef4444'],
                  },
                  {
                    id: 'light',
                    label: 'Light Mode',
                    sub: 'Clean white background with dark text — great for daytime use or bright environments',
                    icon: Sun,
                    preview: ['#f5f7fa','#c78c00','#16853e','#c93b3b'],
                  },
                  {
                    id: 'colorblind',
                    label: 'Colorblind Mode',
                    sub: 'Okabe-Ito palette — designed for deuteranopia & protanopia. Replaces red/green with orange/blue.',
                    icon: Eye,
                    badge: 'RECOMMENDED',
                    preview: ['#07090e','#f0a500','#0072b2','#d55e00'],
                  },
                  {
                    id: 'high-contrast',
                    label: 'High Contrast',
                    sub: 'Pure black background, bold borders, brighter text — ideal for bright sunlight in cab or low-vision users',
                    icon: Zap,
                    preview: ['#000000','#ffc200','#00e676','#ff5252'],
                  },
                ].map(t => {
                  const isActive = theme === t.id
                  return (
                    <div key={t.id} onClick={() => { setTheme(t.id); showToast('', t.label + ' activated', t.sub.split(' — ')[0]) }}
                      style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 16px', borderRadius:10, cursor:'pointer',
                        background: isActive ? 'rgba(240,165,0,0.07)' : 'var(--surface2)',
                        border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                        transition:'all 0.15s' }}>
                      <span style={{ flexShrink:0 }}><Ic icon={t.icon} size={22} /></span>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:13, fontWeight:700, color: isActive ? 'var(--accent)' : 'var(--text)' }}>{t.label}</span>
                          {t.badge && <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:'rgba(240,165,0,0.15)', color:'var(--accent)', letterSpacing:1 }}>{t.badge}</span>}
                          {isActive && <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:'rgba(34,197,94,0.15)', color:'var(--success)', letterSpacing:1 }}>ACTIVE</span>}
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.5 }}>{t.sub}</div>
                      </div>
                      {/* Color swatches */}
                      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                        {t.preview.map((c, i) => (
                          <div key={i} style={{ width:16, height:16, borderRadius:'50%', background:c, border:'1px solid rgba(255,255,255,0.1)' }}/>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:12, padding:'14px 18px' }}>
              <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.7 }}>
                <strong style={{ color:'var(--text)' }}>Why this matters:</strong> ~8% of men have red-green colorblindness — in a male-dominated industry like trucking, that's roughly 1 in 12 dispatchers or drivers. Colorblind mode ensures critical alerts (overdue, high-score loads, danger zones) are always distinguishable regardless of color vision.
              </div>
            </div>
          </>
        )}

        {settingsSec === 'security' && <ChangePassword />}

        {settingsSec === 'activity-data' && (
          <div style={{ margin: '-20px', height: 'calc(100% + 40px)' }}>
            <ActivityLog />
          </div>
        )}

      </div>
    </div>
  )
}

// ── Change Password ───────────────────────────────────────────────────────────
function ChangePassword() {
  const { showToast, user, demoMode } = useApp()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)

  const inputStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', width:'100%' }

  const handleSubmit = async () => {
    if (demoMode) { showToast('', 'Demo Mode', 'Password changes are disabled in demo mode'); return }
    if (!currentPw || !newPw || !confirmPw) { showToast('', 'Missing fields', 'Please fill in all password fields'); return }
    if (newPw.length < 8) { showToast('', 'Too short', 'New password must be at least 8 characters'); return }
    if (newPw !== confirmPw) { showToast('', 'Mismatch', 'New passwords do not match'); return }

    setSaving(true)
    try {
      // Re-authenticate with current password
      const { error: authError } = await supabase.auth.signInWithPassword({ email: user?.email, password: currentPw })
      if (authError) { showToast('', 'Incorrect password', 'Your current password is wrong'); setSaving(false); return }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({ password: newPw })
      if (updateError) { showToast('', 'Update failed', updateError.message); setSaving(false); return }

      showToast('', 'Password updated', 'Your password has been changed successfully')
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (err) {
      showToast('', 'Error', err.message || 'Something went wrong')
    } finally { setSaving(false) }
  }

  return (
    <>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>SECURITY</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Change your account password</div>
      </div>

      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Lock} size={14} /> Change Password</div>
        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14, maxWidth:420 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <label style={{ fontSize:11, color:'var(--muted)' }}>Current Password</label>
            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Enter current password" style={inputStyle} />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <label style={{ fontSize:11, color:'var(--muted)' }}>New Password</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters" style={inputStyle} />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <label style={{ fontSize:11, color:'var(--muted)' }}>Confirm New Password</label>
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Re-enter new password" style={inputStyle} />
          </div>
          <button onClick={handleSubmit} disabled={saving}
            style={{ alignSelf:'flex-start', marginTop:4, padding:'10px 28px', background:'var(--accent)', color:'#000', border:'none', borderRadius:8, fontWeight:700, fontSize:13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily:"'DM Sans',sans-serif" }}>
            {saving ? 'Updating…' : 'Update Password'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Load Board Connection Settings ────────────────────────────────────────────
export const LB_PROVIDERS = [
  {
    id: 'dat',
    name: 'DAT Load Board',
    desc: 'Premium freight marketplace — 500M+ loads/year. Requires DAT API partnership.',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Your DAT API Client ID' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your DAT API Client Secret' },
    ],
    color: '#22c55e',
    signupUrl: 'https://developer.dat.com',
  },
  {
    id: '123loadboard',
    name: '123Loadboard',
    desc: 'Affordable load board with API access — great for small fleets. $200-500/mo.',
    fields: [
      { key: 'apiKey', label: 'API Key', placeholder: 'Your 123Loadboard API Key' },
    ],
    color: '#3b82f6',
    signupUrl: 'https://www.123loadboard.com',
  },
  {
    id: 'truckstop',
    name: 'Truckstop.com',
    desc: 'Full-service load board with rate intelligence and carrier tools.',
    fields: [
      { key: 'clientId', label: 'Client ID', placeholder: 'Your Truckstop Client ID' },
      { key: 'clientSecret', label: 'Client Secret', placeholder: 'Your Truckstop Client Secret' },
    ],
    color: '#f0a500',
    signupUrl: 'https://truckstop.com',
  },
]

export function LoadBoardSettings() {
  const { showToast } = useApp()
  const [connections, setConnections] = useState({}) // { dat: { status, connected_at }, ... }
  const [credentials, setCredentials] = useState({}) // { dat: { clientId:'', clientSecret:'' }, ... }
  const [testing, setTesting] = useState(null) // provider being tested
  const [saving, setSaving] = useState(null) // provider being saved
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null) // which provider form is expanded

  // Fetch existing connections on mount
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/load-board-credentials')
        if (res.ok) {
          const { credentials: creds } = await res.json()
          const connMap = {}
          for (const c of (creds || [])) {
            connMap[c.provider] = { status: c.status, connected_at: c.connected_at, last_tested: c.last_tested }
          }
          setConnections(connMap)
        }
      } catch { /* non-critical: load board credentials fetch failed */ }
      setLoading(false)
    })()
  }, [])

  const saveCredentials = async (provider) => {
    const creds = credentials[provider]
    if (!creds) return
    setSaving(provider)
    try {
      const res = await apiFetch('/api/load-board-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, credentials: creds }),
      })
      const data = await res.json()
      if (data.success) {
        setConnections(prev => ({ ...prev, [provider]: { status: data.status, connected_at: new Date().toISOString(), last_tested: new Date().toISOString() } }))
        showToast('success', data.status === 'connected' ? 'Connected!' : 'Saved', data.testResult?.message || `${provider} credentials saved`)
        if (data.status === 'connected') setExpanded(null)
      } else {
        showToast('error', 'Error', data.error || 'Failed to save')
      }
    } catch (err) {
      showToast('error', 'Error', err.message || 'Network error')
    }
    setSaving(null)
  }

  const testConnection = async (provider) => {
    const creds = credentials[provider]
    if (!creds) return
    setTesting(provider)
    try {
      const res = await apiFetch('/api/load-board-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, credentials: creds, action: 'test' }),
      })
      const data = await res.json()
      if (data.success) {
        setConnections(prev => ({ ...prev, [provider]: { ...prev[provider], status: 'connected', last_tested: new Date().toISOString() } }))
        showToast('success', 'Test Passed', data.message)
      } else {
        showToast('error', 'Test Failed', data.message)
      }
    } catch { /* non-critical error */
      showToast('error', 'Test Failed', 'Could not reach server')
    }
    setTesting(null)
  }

  const disconnect = async (provider) => {
    try {
      await apiFetch('/api/load-board-credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, action: 'disconnect' }),
      })
      setConnections(prev => { const n = { ...prev }; delete n[provider]; return n })
      setCredentials(prev => { const n = { ...prev }; delete n[provider]; return n })
      showToast('success', 'Disconnected', `${provider} removed`)
    } catch { /* non-critical: disconnect request failed */ }
  }

  const connectedCount = Object.values(connections).filter(c => c.status === 'connected').length

  return (
    <>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>LOAD BOARD CONNECTIONS</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Connect your own load board accounts so Qivori AI can find loads for you automatically</div>
      </div>

      {/* Info banner */}
      <div style={{ background:'rgba(59,130,246,0.06)', border:'1px solid rgba(59,130,246,0.15)', borderRadius:10, padding:'14px 18px', fontSize:12, color:'var(--accent3)', lineHeight:1.6 }}>
        <strong>How it works:</strong> Enter your load board API credentials below. They're encrypted with AES-256 and stored securely — only used to search loads on your behalf. <strong>Your credentials are never shared with other users or exposed in the app.</strong>
      </div>

      {/* Connection status summary */}
      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
        <div style={{ width:10, height:10, borderRadius:'50%', background: connectedCount > 0 ? '#22c55e' : '#6b7590' }} />
        <span style={{ fontSize:12, fontWeight:700 }}>
          {connectedCount > 0 ? `${connectedCount} load board${connectedCount > 1 ? 's' : ''} connected` : 'No load boards connected'}
        </span>
      </div>

      {/* Provider cards */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {LB_PROVIDERS.map(prov => {
          const conn = connections[prov.id]
          const isConnected = conn?.status === 'connected'
          const isExpanded = expanded === prov.id
          const creds = credentials[prov.id] || {}
          const isSaving = saving === prov.id
          const isTesting = testing === prov.id

          return (
            <div key={prov.id} style={{ background:'var(--surface)', border:`1px solid ${isConnected ? prov.color + '40' : 'var(--border)'}`, borderRadius:12, overflow:'hidden' }}>
              {/* Header row */}
              <div style={{ display:'flex', alignItems:'center', gap:14, padding:'16px 20px', cursor:'pointer' }}
                onClick={() => setExpanded(isExpanded ? null : prov.id)}>
                <div style={{ width:44, height:44, borderRadius:10, background: isConnected ? prov.color + '15' : 'var(--surface2)', border:`1px solid ${isConnected ? prov.color + '30' : 'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <Ic icon={Globe} size={22} color={isConnected ? prov.color : 'var(--muted)'} />
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:3 }}>
                    <span style={{ fontSize:14, fontWeight:700 }}>{prov.name}</span>
                    {isConnected ? (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background: prov.color + '15', color: prov.color, display:'flex', alignItems:'center', gap:3 }}>
                        <Ic icon={CheckCircle} size={10} /> Connected
                      </span>
                    ) : conn?.status === 'error' ? (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(239,68,68,0.1)', color:'#ef4444' }}>
                        Connection Error
                      </span>
                    ) : (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(107,117,144,0.1)', color:'var(--muted)' }}>
                        Not Connected
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:12, color:'var(--muted)' }}>{prov.desc}</div>
                </div>
                <Ic icon={isExpanded ? ChevronLeft : Plus} size={16} color="var(--muted)" style={{ transform: isExpanded ? 'rotate(-90deg)' : 'none', transition:'transform 0.2s' }} />
              </div>

              {/* Expanded credential form */}
              {isExpanded && (
                <div style={{ padding:'0 20px 20px', borderTop:'1px solid var(--border)' }}>
                  <div style={{ paddingTop:16, display:'flex', flexDirection:'column', gap:12 }}>
                    {prov.fields.map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                        <input
                          type="password"
                          value={creds[f.key] || ''}
                          onChange={e => setCredentials(prev => ({ ...prev, [prov.id]: { ...prev[prov.id], [f.key]: e.target.value } }))}
                          placeholder={f.placeholder}
                          style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px', color:'var(--text)', fontSize:13, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }}
                        />
                      </div>
                    ))}
                    <div style={{ fontSize:10, color:'var(--muted)' }}>
                      Don't have an account? <a href={prov.signupUrl} target="_blank" rel="noopener noreferrer" style={{ color:'var(--accent3)', textDecoration:'none' }}>Sign up at {prov.signupUrl} →</a>
                    </div>
                    <div style={{ display:'flex', gap:8, marginTop:4 }}>
                      <button className="btn btn-primary" style={{ fontSize:12, padding:'9px 20px' }}
                        disabled={isSaving || !prov.fields.every(f => creds[f.key])}
                        onClick={() => saveCredentials(prov.id)}>
                        {isSaving ? 'Saving...' : isConnected ? 'Update & Test' : 'Connect & Test'}
                      </button>
                      {isConnected && (
                        <>
                          <button className="btn btn-ghost" style={{ fontSize:12 }}
                            disabled={isTesting}
                            onClick={() => testConnection(prov.id)}>
                            {isTesting ? 'Testing...' : 'Test Connection'}
                          </button>
                          <button className="btn btn-ghost" style={{ fontSize:12, color:'#ef4444' }}
                            onClick={() => disconnect(prov.id)}>
                            Disconnect
                          </button>
                        </>
                      )}
                    </div>
                    {conn?.last_tested && (
                      <div style={{ fontSize:10, color:'var(--muted)' }}>
                        Last tested: {new Date(conn.last_tested).toLocaleString()}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
