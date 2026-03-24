import React, { useState } from 'react'
import { Check, Zap, Bot, Crown, ArrowRight } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { apiFetch } from '../lib/api'

const PRICING_PLANS = [
  {
    id: 'autonomous_fleet',
    name: 'Qivori AI Dispatch',
    sub: '$199 first truck · $75 each additional · + 3% AI fee per load',
    price: '$199',
    period: '/mo',
    extraTruck: '$75',
    color: '#f0a500',
    icon: Crown,
    popular: true,
    features: [
      'AI Load Board & Scoring',
      'AI-Powered Dispatch',
      'Rate Con OCR Auto-Fill',
      'Voice AI Assistant',
      'Fleet Map & GPS Tracking',
      'P&L Dashboard & Analytics',
      'IFTA Auto-Filing',
      'Invoicing & Auto-Factoring',
      'Fuel Optimizer',
      'Full Compliance Suite',
      'Driver Onboarding & Scorecards',
      'QuickBooks Sync',
      'Smart Document Handling',
      'Dedicated Support',
    ],
    limits: [],
    cta: 'Start Free Trial',
    stripeId: 'autonomous_fleet',
    founder: true,
    fullPrice: '$299',
  },
]

export default function PricingSection({ embedded = false, onPlanSelect }) {
  const { user, profile, showToast } = useApp()
  const [loading, setLoading] = useState(null)

  const handleSelect = async (plan) => {
    if (onPlanSelect) {
      onPlanSelect(plan.id)
      return
    }

    if (!plan.stripeId) return

    setLoading(plan.id)
    try {
      const res = await apiFetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.stripeId,
          email: user?.email || profile?.email,
          userId: user?.id,
          truckCount: 1,
        }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        showToast('error', 'Error', data.error || 'Could not start checkout')
      }
    } catch (e) {
      showToast('error', 'Error', 'Could not start checkout')
    } finally {
      setLoading(null)
    }
  }

  const containerStyle = embedded ? {
    padding: 0,
  } : {
    padding: '60px 24px',
    background: 'var(--bg)',
  }

  return (
    <div style={containerStyle}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        {!embedded && (
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, letterSpacing: 2, marginBottom: 8 }}>
              SIMPLE, TRANSPARENT PRICING
            </div>
            <div style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 500, margin: '0 auto' }}>
              One plan. Everything included. No upsells, no hidden fees.
            </div>
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: 16,
        }}>
          {PRICING_PLANS.map(plan => {
            const Icon = plan.icon
            const isLoading = loading === plan.id
            return (
              <div key={plan.id} style={{
                background: 'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(240,165,0,0.02))',
                border: `2px solid rgba(240,165,0,0.5)`,
                borderRadius: 14,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
                boxShadow: `0 0 24px ${plan.color}15`,
              }}>
                {/* Founder badge */}
                {plan.founder && (
                  <div style={{
                    position: 'absolute', top: 12, right: 12,
                    fontSize: 9, fontWeight: 800, padding: '3px 10px', borderRadius: 10,
                    background: 'linear-gradient(135deg, #f0a500, #e09000)', color: '#000',
                    letterSpacing: 1,
                  }}>
                    FOUNDER PRICING
                  </div>
                )}

                {/* Header */}
                <div style={{ padding: '24px 20px 16px' }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 10,
                    background: `${plan.color}12`, border: `1px solid ${plan.color}25`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    marginBottom: 14,
                  }}>
                    <Icon size={20} color={plan.color} />
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>{plan.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>{plan.sub}</div>
                </div>

                {/* Price */}
                <div style={{ padding: '0 20px 16px' }}>
                  <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 38, color: plan.color }}>
                    {plan.price}
                  </span>
                  <span style={{ fontSize: 13, color: 'var(--muted)', marginLeft: 2 }}>
                    {plan.period}
                  </span>
                  {plan.extraTruck && (
                    <div style={{ fontSize: 13, color: 'var(--text)', marginTop: 6 }}>
                      + <span style={{ color: plan.color, fontWeight: 700 }}>{plan.extraTruck}</span>/mo each additional truck
                    </div>
                  )}
                  {plan.founder && (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                      <span style={{ textDecoration: 'line-through', marginRight: 6 }}>{plan.fullPrice}/mo after founders</span>
                      <span style={{ fontSize: 10, background: 'rgba(239,68,68,0.1)', color: '#ef4444', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>FOUNDER RATE — LOCKED FOR LIFE</span>
                    </div>
                  )}
                </div>

                {/* Features */}
                <div style={{ padding: '0 20px', flex: 1 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {plan.features.map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12 }}>
                        <Check size={14} color={plan.color} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span style={{ color: 'var(--text)' }}>{f}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA */}
                <div style={{ padding: '20px' }}>
                  <button
                    onClick={() => handleSelect(plan)}
                    disabled={isLoading}
                    style={{
                      width: '100%', padding: '12px 16px', border: 'none', borderRadius: 10,
                      cursor: isLoading ? 'wait' : 'pointer',
                      background: 'linear-gradient(135deg, #f0a500, #e09000)',
                      color: '#000',
                      fontSize: 13, fontWeight: 700,
                      fontFamily: "'DM Sans',sans-serif",
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      opacity: isLoading ? 0.7 : 1,
                      boxShadow: '0 4px 16px rgba(240,165,0,0.25)',
                      transition: 'opacity 0.15s',
                    }}
                    onMouseOver={e => { if (!isLoading) e.currentTarget.style.opacity = '0.85' }}
                    onMouseOut={e => { if (!isLoading) e.currentTarget.style.opacity = '1' }}
                  >
                    {isLoading ? 'Loading...' : plan.cta}
                    {!isLoading && <ArrowRight size={14} />}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {/* Trial note */}
        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 12, color: 'var(--muted)' }}>
          14-day free trial. No credit card required. Cancel anytime.
        </div>
      </div>
    </div>
  )
}

export { PRICING_PLANS }
