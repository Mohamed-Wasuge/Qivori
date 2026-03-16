import React from 'react'
import { X, Zap, Lock, ArrowRight } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { apiFetch } from '../lib/api'

const PLAN_DETAILS = {
  autopilot: { name: 'Autopilot', price: '$99/mo', features: ['AI Load Board', 'Invoicing & IFTA', 'Fleet Map', 'P&L Dashboard'] },
  autopilot_ai: { name: 'Autopilot AI', price: '$799/mo', features: ['Everything in Autopilot', 'AI Auto-Dispatch', 'Proactive Load Finding', 'Voice AI & Auto-Booking'] },
  fleet: { name: 'Fleet', price: '$799/mo', features: ['Everything in Autopilot AI', 'API Access', 'Priority Support', 'Custom Integrations'] },
}

export default function UpgradePrompt({ feature, requiredPlan, onClose }) {
  const { user, profile, showToast } = useApp()
  const plan = PLAN_DETAILS[requiredPlan] || PLAN_DETAILS.autopilot

  const FEATURE_LABELS = {
    ai_dispatch: 'AI Auto-Dispatch',
    load_board: 'Load Board',
    proactive_loads: 'Proactive Load Finding',
    voice_ai: 'Voice AI',
    auto_booking: 'Auto-Booking',
    api_access: 'API Access',
    custom_integrations: 'Custom Integrations',
    invoicing: 'Invoicing',
    ifta: 'IFTA Filing',
  }

  const featureLabel = FEATURE_LABELS[feature] || feature

  const handleUpgrade = async () => {
    try {
      const res = await apiFetch('/api/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: requiredPlan,
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
    }
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)',
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16,
        width: '100%', maxWidth: 420, padding: 0, overflow: 'hidden',
        boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{
          padding: '24px 24px 20px', textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(240,165,0,0.08), rgba(240,165,0,0.02))',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 16, margin: '0 auto 16px',
            background: 'rgba(240,165,0,0.12)', border: '1px solid rgba(240,165,0,0.2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Lock size={24} color="var(--accent)" />
          </div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, letterSpacing: 1, marginBottom: 6 }}>
            UPGRADE TO UNLOCK
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--accent)' }}>{featureLabel}</strong> requires the <strong>{plan.name}</strong> plan
          </div>
        </div>

        {/* Features */}
        <div style={{ padding: '20px 24px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1, marginBottom: 12 }}>
            {plan.name.toUpperCase()} INCLUDES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {plan.features.map(f => (
              <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <Zap size={14} color="var(--accent)" />
                <span>{f}</span>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <div style={{ padding: '0 24px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button onClick={handleUpgrade} style={{
            width: '100%', padding: '14px 20px', border: 'none', borderRadius: 10, cursor: 'pointer',
            background: 'var(--accent)', color: '#000', fontSize: 14, fontWeight: 700,
            fontFamily: "'DM Sans',sans-serif",
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            transition: 'opacity 0.15s',
          }}
            onMouseOver={e => e.currentTarget.style.opacity = '0.9'}
            onMouseOut={e => e.currentTarget.style.opacity = '1'}>
            Upgrade to {plan.name} — {plan.price}
            <ArrowRight size={16} />
          </button>
          <button onClick={onClose} style={{
            width: '100%', padding: '12px 20px', border: '1px solid var(--border)', borderRadius: 10,
            cursor: 'pointer', background: 'transparent', color: 'var(--muted)', fontSize: 13,
            fontFamily: "'DM Sans',sans-serif",
          }}>
            Maybe Later
          </button>
          <div style={{ textAlign: 'center', fontSize: 11, color: 'var(--muted)' }}>
            14-day free trial included. Cancel anytime.
          </div>
        </div>

        {/* Close */}
        <button onClick={onClose} style={{
          position: 'absolute', top: 12, right: 12, background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--muted)', padding: 4,
        }}>
          <X size={18} />
        </button>
      </div>
    </div>
  )
}
