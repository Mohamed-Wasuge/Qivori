import { useState } from 'react'
import { ArrowLeft, Shield, FileText } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

const TERMS_CONTENT = [
  {
    title: '1. Acceptance of Terms',
    text: `By accessing or using Qivori AI ("Service"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. We may update these terms at any time, and continued use constitutes acceptance of changes.`
  },
  {
    title: '2. Description of Service',
    text: `Qivori AI is a transportation management platform designed for owner-operators and small fleet carriers. The Service includes AI-powered dispatching, load management, invoicing, IFTA calculations, compliance tools, and related features. The Service is provided "as is" and may be modified at any time.`
  },
  {
    title: '3. Account Registration',
    text: `You must provide accurate, complete information when creating an account. You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account. You must be at least 18 years old to use the Service. Notify us immediately of any unauthorized use of your account.`
  },
  {
    title: '4. Subscription & Payments',
    text: `Paid plans are billed monthly via Stripe. All fees are non-refundable except as required by law. We offer a 14-day free trial for new accounts. You may cancel your subscription at any time through the billing portal. Cancellation takes effect at the end of the current billing period. We reserve the right to change pricing with 30 days notice.`
  },
  {
    title: '5. Acceptable Use',
    text: `You agree not to: (a) use the Service for any unlawful purpose; (b) attempt to gain unauthorized access to any part of the Service; (c) interfere with or disrupt the Service; (d) upload malicious code or content; (e) resell or redistribute the Service without written permission; (f) use the Service to transmit spam or unsolicited communications.`
  },
  {
    title: '6. Data & Privacy',
    text: `Your use of the Service is also governed by our Privacy Policy. You retain ownership of your data. We do not sell your personal information to third parties. You may export or delete your data at any time by contacting support.`
  },
  {
    title: '7. AI-Generated Content',
    text: `The Service uses artificial intelligence to provide recommendations, calculations, and automated actions. AI-generated content is provided for informational purposes and should not be relied upon as legal, financial, or regulatory advice. You are responsible for verifying the accuracy of AI outputs, including IFTA calculations, load matching scores, and compliance data.`
  },
  {
    title: '8. Limitation of Liability',
    text: `To the maximum extent permitted by law, Qivori AI and its affiliates shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities. Our total liability shall not exceed the amount you paid for the Service in the 12 months preceding the claim.`
  },
  {
    title: '9. Termination',
    text: `We may suspend or terminate your account if you violate these Terms or engage in fraudulent activity. Upon termination, your right to use the Service ceases immediately. We will retain your data for 30 days after termination, after which it may be permanently deleted.`
  },
  {
    title: '10. Governing Law',
    text: `These Terms shall be governed by and construed in accordance with the laws of the United States. Any disputes arising from these Terms shall be resolved through binding arbitration in accordance with applicable rules.`
  },
  {
    title: '11. Contact',
    text: `For questions about these Terms, contact us at hello@qivori.com.`
  },
]

const PRIVACY_CONTENT = [
  {
    title: '1. Information We Collect',
    text: `We collect information you provide directly: name, email, company name, phone number, and payment information. We also collect usage data automatically: IP address, device type, browser, pages visited, and feature usage. For carriers using GPS features, we collect location data only when you explicitly grant permission.`
  },
  {
    title: '2. How We Use Your Information',
    text: `We use your information to: (a) provide and maintain the Service; (b) process payments and subscriptions; (c) send transactional emails (invoices, welcome emails, password resets); (d) improve our AI models and features; (e) provide customer support; (f) comply with legal obligations. We do not use your data for advertising.`
  },
  {
    title: '3. Data Sharing',
    text: `We do not sell your personal information. We share data only with: (a) Stripe for payment processing; (b) Resend for transactional email delivery; (c) Anthropic (Claude AI) for AI features — only the minimum data necessary for each request; (d) law enforcement when required by law. All third-party providers are bound by data processing agreements.`
  },
  {
    title: '4. Data Storage & Security',
    text: `Your data is stored securely on Supabase (PostgreSQL) with encryption at rest and in transit. We use HTTPS for all connections. Passwords are hashed using bcrypt. We implement role-based access controls and audit logging. We conduct regular security reviews of our infrastructure.`
  },
  {
    title: '5. Cookies & Tracking',
    text: `We use essential cookies for authentication and session management. We do not use third-party tracking cookies or advertising pixels. You can disable cookies in your browser settings, but this may affect Service functionality.`
  },
  {
    title: '6. Your Rights',
    text: `You have the right to: (a) access your personal data; (b) correct inaccurate data; (c) delete your account and data; (d) export your data in a portable format; (e) opt out of non-essential communications. To exercise these rights, contact us at hello@qivori.com. We will respond within 30 days.`
  },
  {
    title: '7. Location Data',
    text: `Location data is collected only when you use GPS-dependent features (check calls, nearby search, navigation). Location data is not continuously tracked. You can revoke location permission at any time through your device settings. Location data is not shared with third parties except as necessary to provide the requested feature.`
  },
  {
    title: '8. Data Retention',
    text: `We retain your data for as long as your account is active. After account deletion, we retain data for 30 days for recovery purposes, then permanently delete it. Financial records may be retained longer as required by law. Anonymized, aggregated data may be retained indefinitely for analytics.`
  },
  {
    title: '9. Children\'s Privacy',
    text: `The Service is not intended for users under 18 years of age. We do not knowingly collect personal information from children. If we learn that we have collected data from a child under 18, we will delete it promptly.`
  },
  {
    title: '10. Changes to This Policy',
    text: `We may update this Privacy Policy from time to time. We will notify you of material changes via email or in-app notification. Continued use of the Service after changes constitutes acceptance of the updated policy.`
  },
  {
    title: '11. Contact',
    text: `For privacy-related inquiries, contact us at hello@qivori.com.`
  },
]

export function TermsPage({ onBack }) {
  return (
    <LegalLayout title="Terms of Service" icon={FileText} sections={TERMS_CONTENT} onBack={onBack} lastUpdated="March 1, 2026" />
  )
}

export function PrivacyPage({ onBack }) {
  return (
    <LegalLayout title="Privacy Policy" icon={Shield} sections={PRIVACY_CONTENT} onBack={onBack} lastUpdated="March 1, 2026" />
  )
}

function LegalLayout({ title, icon, sections, onBack, lastUpdated }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'var(--bg)',
      overflow: 'auto',
    }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'rgba(10,10,14,0.85)', backdropFilter: 'blur(20px)',
        borderBottom: '1px solid var(--border)',
        padding: '14px 20px',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div onClick={onBack} style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'var(--surface)', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', transition: 'background 0.15s',
        }}>
          <Ic icon={ArrowLeft} size={16} color="var(--text)" />
        </div>
        <div>
          <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 20, letterSpacing: 2 }}>
            QI<span style={{ color: 'var(--accent)' }}>VORI</span>
            <span style={{ fontSize: 10, color: 'var(--accent2)', letterSpacing: 1, fontFamily: "'DM Sans', sans-serif", fontWeight: 700, marginLeft: 6 }}>AI</span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '40px 20px 80px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(240,165,0,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Ic icon={icon} size={22} color="var(--accent)" />
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, margin: 0, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>{title}</h1>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>Last updated: {lastUpdated}</div>
          </div>
        </div>

        <div style={{ width: 60, height: 3, background: 'var(--accent)', borderRadius: 2, margin: '20px 0 32px' }} />

        {sections.map((s, i) => (
          <div key={i} style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, color: 'var(--text)' }}>{s.title}</h2>
            <p style={{ fontSize: 14, color: 'var(--muted)', lineHeight: 1.7, margin: 0 }}>{s.text}</p>
          </div>
        ))}

        <div style={{
          marginTop: 40, padding: 20,
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12,
          textAlign: 'center',
        }}>
          <div style={{ fontSize: 13, color: 'var(--muted)' }}>
            Questions? Contact us at <a href="mailto:hello@qivori.com" style={{ color: 'var(--accent)', textDecoration: 'none', fontWeight: 600 }}>hello@qivori.com</a>
          </div>
        </div>
      </div>
    </div>
  )
}
