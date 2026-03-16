import React, { useState } from 'react'
import { Check, Zap, Bot, Crown, Building2, ArrowRight } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { apiFetch } from '../lib/api'

const PRICING_PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    sub: 'Get started for free',
    price: '$0',
    period: '14-day trial',
    color: '#8a8a9a',
    icon: Zap,
    features: [
      '1 truck',
      'Basic dispatch board',
      'Fleet tracking',
      'Compliance dashboard',
      'Community support',
    ],
    limits: ['No invoicing', 'No IFTA', 'No AI features'],
    cta: 'Start Free',
    stripeId: null, // no checkout needed
  },
  {
    id: 'autopilot',
    name: 'Pro',
    sub: 'For growing carriers',
    price: '$49',
    period: '/mo',
    color: '#4d8ef0',
    icon: Bot,
    popular: true,
    features: [
      'Up to 5 trucks',
      'AI Load Board & Scoring',
      'Invoicing & Factoring',
      'IFTA Auto-Filing',
      'P&L Dashboard',
      'Fuel Optimizer',
      'Carrier Package',
      'Email support',
    ],
    limits: [],
    cta: 'Start Free Trial',
    stripeId: 'autopilot',
  },
  {
    id: 'autopilot_ai',
    name: 'Autopilot',
    sub: 'AI runs your dispatch',
    price: '$99',
    period: '/mo',
    color: '#f0a500',
    icon: Crown,
    features: [
      'Unlimited trucks',
      'Everything in Pro',
      'AI Auto-Dispatch',
      'Proactive Load Finding',
      'Voice AI Chatbot',
      'Auto-booking & broker calls',
      'HOS & Weather on Route',
      'Priority support',
    ],
    limits: [],
    cta: 'Start Free Trial',
    stripeId: 'autopilot_ai',
  },
  {
    id: 'fleet',
    name: 'Fleet',
    sub: 'Enterprise-grade TMS',
    price: '$799',
    period: '/mo',
    color: '#a78bfa',
    icon: Building2,
    features: [
      'Everything in Autopilot',
      'API access',
      'Custom integrations',
      'Dedicated account manager',
      'Priority phone support',
      'SLA guarantees',
      'Custom reporting',
      'Multi-terminal support',
    ],
    limits: [],
    cta: 'Contact Sales',
    stripeId: 'autopilot_ai', // uses autopilot_ai pricing as base
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

    if (plan.id === 'starter') {
      showToast('', 'Starter Plan', 'Sign up to get started with the free trial')
      return
    }

    if (plan.id === 'fleet') {
      window.open('mailto:support@qivori.com?subject=Fleet Plan Inquiry', '_blank')
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
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        {!embedded && (
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 36, letterSpacing: 2, marginBottom: 8 }}>
              SIMPLE, TRANSPARENT PRICING
            </div>
            <div style={{ fontSize: 14, color: 'var(--muted)', maxWidth: 500, margin: '0 auto' }}>
              Start free. Upgrade when you're ready. No hidden fees, no contracts.
            </div>
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
          gap: 16,
        }}>
          {PRICING_PLANS.map(plan => {
            const Icon = plan.icon
            const isLoading = loading === plan.id
            return (
              <div key={plan.id} style={{
                background: 'var(--surface)',
                border: `1px solid ${plan.popular ? plan.color : 'var(--border)'}`,
                borderRadius: 14,
                padding: 0,
                display: 'flex',
                flexDirection: 'column',
                position: 'relative',
                overflow: 'hidden',
                transition: 'border-color 0.2s, box-shadow 0.2s',
                boxShadow: plan.popular ? `0 0 24px ${plan.color}15` : 'none',
              }}>
                {/* Popular badge */}
                {plan.popular && (
                  <div style={{
                    position: 'absolute', top: 12, right: 12,
                    fontSize: 9, fontWeight: 800, padding: '3px 10px', borderRadius: 10,
                    background: `${plan.color}18`, color: plan.color,
                    border: `1px solid ${plan.color}30`, letterSpacing: 1,
                  }}>
                    MOST POPULAR
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
                    {plan.limits.map(f => (
                      <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12 }}>
                        <span style={{ color: 'var(--muted)', fontSize: 14, lineHeight: '14px', flexShrink: 0 }}>-</span>
                        <span style={{ color: 'var(--muted)' }}>{f}</span>
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
                      background: plan.popular ? plan.color : 'var(--surface2)',
                      color: plan.popular ? '#000' : 'var(--text)',
                      fontSize: 13, fontWeight: 700,
                      fontFamily: "'DM Sans',sans-serif",
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      opacity: isLoading ? 0.7 : 1,
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
          All paid plans include a 14-day free trial. No credit card required to start. Cancel anytime.
        </div>
      </div>
    </div>
  )
}

export { PRICING_PLANS }
