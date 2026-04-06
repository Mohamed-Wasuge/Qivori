import { useState, useEffect, useRef } from 'react'

// ─── Shared Styles ───────────────────────────────────────────────
export const colors = {
  bg: '#0c0f15',
  surface: '#131720',
  surface2: '#1a1f2e',
  border: '#1e2330',
  text: '#c8d0dc',
  textMuted: '#6b7590',
  accent: '#f0a500',
  accent2: '#00d4ff',
  white: '#ffffff',
}

export const fonts = {
  heading: "'Bebas Neue', sans-serif",
  body: "'DM Sans', sans-serif",
}

// ─── SEO Meta Helper ─────────────────────────────────────────────
export function useMeta(title, description) {
  useEffect(() => {
    const prev = document.title
    document.title = title + ' | Qivori AI'
    let meta = document.querySelector('meta[name="description"]')
    const prevDesc = meta?.getAttribute('content')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'description'
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', description)

    // OG tags
    const setOg = (prop, val) => {
      let el = document.querySelector(`meta[property="${prop}"]`)
      if (!el) { el = document.createElement('meta'); el.setAttribute('property', prop); document.head.appendChild(el) }
      el.setAttribute('content', val)
    }
    setOg('og:title', title)
    setOg('og:description', description)
    setOg('og:type', 'article')
    setOg('og:site_name', 'Qivori AI')

    return () => {
      document.title = prev
      if (prevDesc) meta.setAttribute('content', prevDesc)
    }
  }, [title, description])
}

// ─── Table of Contents ───────────────────────────────────────────
function TableOfContents({ items }) {
  const [active, setActive] = useState('')

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id)
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 }
    )
    items.forEach(({ id }) => {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [items])

  return (
    <nav style={{
      position: 'sticky', top: 100, alignSelf: 'start',
      background: colors.surface, border: `1px solid ${colors.border}`,
      borderRadius: 12, padding: '20px 24px', minWidth: 220, maxWidth: 260,
    }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: colors.accent, marginBottom: 14, fontFamily: fonts.body }}>
        Contents
      </div>
      {items.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          onClick={(e) => { e.preventDefault(); document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }}
          style={{
            display: 'block', fontSize: 13, color: active === id ? colors.accent : colors.textMuted,
            textDecoration: 'none', padding: '5px 0', fontFamily: fonts.body, fontWeight: active === id ? 600 : 400,
            borderLeft: `2px solid ${active === id ? colors.accent : 'transparent'}`,
            paddingLeft: 12, marginLeft: -12, transition: 'all 0.2s',
          }}
        >
          {label}
        </a>
      ))}
    </nav>
  )
}

// ─── Share Buttons ───────────────────────────────────────────────
export function ShareButtons({ title }) {
  const url = window.location.href
  const encoded = encodeURIComponent(url)
  const encodedTitle = encodeURIComponent(title)

  const btnStyle = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px',
    borderRadius: 8, border: `1px solid ${colors.border}`, background: colors.surface2,
    color: colors.text, fontSize: 13, fontFamily: fonts.body, fontWeight: 600,
    cursor: 'pointer', textDecoration: 'none', transition: 'all 0.2s',
  }

  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 24 }}>
      <a href={`https://twitter.com/intent/tweet?text=${encodedTitle}&url=${encoded}`} target="_blank" rel="noopener noreferrer" style={btnStyle}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        Share on X
      </a>
      <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encoded}`} target="_blank" rel="noopener noreferrer" style={btnStyle}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>
        Share on LinkedIn
      </a>
    </div>
  )
}

// ─── CTA Banner ──────────────────────────────────────────────────
function CTABanner() {
  return (
    <div style={{
      background: `linear-gradient(135deg, ${colors.surface2}, ${colors.surface})`,
      border: `1px solid ${colors.accent}33`, borderRadius: 16, padding: '40px 32px',
      textAlign: 'center', marginTop: 48,
    }}>
      <div style={{ fontFamily: fonts.heading, fontSize: 28, letterSpacing: 3, color: colors.white, marginBottom: 8 }}>
        QI<span style={{ color: colors.accent }}>VORI</span>
        <span style={{ fontSize: 14, color: colors.accent2, letterSpacing: 1, fontFamily: fonts.body, fontWeight: 700, marginLeft: 6 }}>AI</span>
      </div>
      <p style={{ fontSize: 16, color: colors.text, marginBottom: 20, fontFamily: fonts.body, maxWidth: 500, margin: '0 auto 20px' }}>
        Manage all of this — IFTA, dispatch, expenses, rates — with one AI-powered platform built for owner-operators.
      </p>
      <a
        href="#/"
        onClick={() => { window.location.hash = '' }}
        style={{
          display: 'inline-block', padding: '14px 36px', background: colors.accent,
          color: '#000', fontWeight: 700, fontSize: 15, borderRadius: 10,
          textDecoration: 'none', fontFamily: fonts.body, letterSpacing: 0.5,
          transition: 'transform 0.2s',
        }}
      >
        Start Free Trial
      </a>
      <p style={{ fontSize: 12, color: colors.textMuted, marginTop: 10, fontFamily: fonts.body }}>
        No credit card required. Set up in 5 minutes.
      </p>
    </div>
  )
}

// ─── Header ──────────────────────────────────────────────────────
function GuideHeader() {
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: `${colors.bg}ee`, backdropFilter: 'blur(12px)',
      borderBottom: `1px solid ${colors.border}`, padding: '0 24px',
    }}>
      <div style={{
        maxWidth: 1100, margin: '0 auto', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between', height: 56,
      }}>
        <a href="#/" onClick={() => { window.location.hash = '' }} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontFamily: fonts.heading, fontSize: 22, letterSpacing: 3, color: colors.white }}>
            QI<span style={{ color: colors.accent }}>VORI</span>
          </span>
          <span style={{ fontSize: 10, color: colors.accent2, fontFamily: fonts.body, fontWeight: 700, letterSpacing: 1 }}>AI</span>
        </a>
        <nav style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
          <a href="#/guides/ifta" style={navLink}>IFTA Guide</a>
          <a href="#/guides/start-trucking" style={navLink}>Start Trucking</a>
          <a href="#/guides/rate-negotiation" style={navLink}>Rates</a>
          <a href="#/guides/trucking-expenses" style={navLink}>Expenses</a>
          <a
            href="#/"
            onClick={() => { window.location.hash = '' }}
            style={{
              padding: '7px 18px', background: colors.accent, color: '#000',
              borderRadius: 8, fontWeight: 700, fontSize: 12, textDecoration: 'none',
              fontFamily: fonts.body,
            }}
          >
            Try Qivori
          </a>
        </nav>
      </div>
    </header>
  )
}

const navLink = {
  color: colors.textMuted, fontSize: 12, fontWeight: 600, textDecoration: 'none',
  fontFamily: fonts.body, letterSpacing: 0.3, transition: 'color 0.2s',
}

// ─── Article Layout ──────────────────────────────────────────────
export function ArticleLayout({ title, subtitle, readTime, tocItems, children }) {
  return (
    <div style={{ minHeight: '100vh', background: colors.bg, color: colors.text, fontFamily: fonts.body }}>
      <GuideHeader />

      {/* Hero */}
      <div style={{
        background: `linear-gradient(180deg, ${colors.surface} 0%, ${colors.bg} 100%)`,
        padding: '60px 24px 40px', textAlign: 'center',
        borderBottom: `1px solid ${colors.border}`,
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, color: colors.accent, marginBottom: 12 }}>
            Qivori Guide
          </div>
          <h1 style={{
            fontFamily: fonts.heading, fontSize: 'clamp(28px, 5vw, 44px)', letterSpacing: 2,
            color: colors.white, margin: '0 0 12px', lineHeight: 1.15,
          }}>
            {title}
          </h1>
          {subtitle && (
            <p style={{ fontSize: 16, color: colors.textMuted, maxWidth: 560, margin: '0 auto 16px', lineHeight: 1.6 }}>
              {subtitle}
            </p>
          )}
          <div style={{ fontSize: 12, color: colors.textMuted }}>
            {readTime} min read &middot; Updated March 2026
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '40px 24px 80px',
        display: 'flex', gap: 40, alignItems: 'flex-start',
      }}>
        {/* Sidebar TOC — hidden on mobile */}
        <div className="guide-toc" style={{ flex: '0 0 auto' }}>
          <TableOfContents items={tocItems} />
        </div>

        {/* Article Content */}
        <article style={{ flex: 1, minWidth: 0 }}>
          {children}
          <CTABanner />
        </article>
      </div>

      {/* Responsive styles */}
      <style>{`
        .guide-toc { display: block; }
        @media (max-width: 860px) {
          .guide-toc { display: none !important; }
        }
        h2[id] { scroll-margin-top: 80px; }
        h3[id] { scroll-margin-top: 80px; }
      `}</style>
    </div>
  )
}

// ─── Content Style Helpers ───────────────────────────────────────
export const h2Style = {
  fontFamily: fonts.heading, fontSize: 26, letterSpacing: 2, color: colors.white,
  marginTop: 48, marginBottom: 16, paddingBottom: 8,
  borderBottom: `1px solid ${colors.border}`,
}

export const h3Style = {
  fontFamily: fonts.body, fontSize: 17, fontWeight: 700, color: colors.white,
  marginTop: 28, marginBottom: 10,
}

export const pStyle = {
  fontSize: 15, lineHeight: 1.75, color: colors.text, marginBottom: 16,
}

export const ulStyle = {
  paddingLeft: 20, marginBottom: 16,
}

export const liStyle = {
  fontSize: 14, lineHeight: 1.75, color: colors.text, marginBottom: 6,
}

export const tipBox = {
  background: `${colors.accent}11`, border: `1px solid ${colors.accent}33`,
  borderRadius: 10, padding: '16px 20px', marginBottom: 20, marginTop: 16,
}

export const tipLabel = {
  fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.5,
  color: colors.accent, marginBottom: 6,
}
