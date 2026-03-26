import { useState, useEffect } from 'react'

const REGION_LABELS = {
  northeast: 'Northeast', southeast: 'Southeast', midwest: 'Midwest',
  southwest: 'Southwest', west: 'West Coast', northwest: 'Pacific NW',
  south: 'South', central: 'Central', national: 'Nationwide',
}

export default function CarrierPublicPage({ slug }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [formSent, setFormSent] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })

  useEffect(() => {
    if (!slug) { setError('No carrier specified'); setLoading(false); return }
    fetch(`/api/carrier-page?slug=${encodeURIComponent(slug)}`)
      .then(r => r.ok ? r.json() : r.json().then(e => Promise.reject(e.error || 'Not found')))
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(typeof e === 'string' ? e : 'Carrier not found'); setLoading(false) })
  }, [slug])

  const handleSubmit = (e) => {
    e.preventDefault()
    // mailto fallback — sends to carrier email
    if (data?.company?.email) {
      const subject = encodeURIComponent(`Quote Request from ${form.name}`)
      const body = encodeURIComponent(`Name: ${form.name}\nEmail: ${form.email}\nPhone: ${form.phone}\n\n${form.message}`)
      window.open(`mailto:${data.company.email}?subject=${subject}&body=${body}`, '_blank')
    }
    setFormSent(true)
  }

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 40, height: 3, background: '#e5e7eb', borderRadius: 2, margin: '0 auto', overflow: 'hidden' }}>
          <div style={{ width: '50%', height: '100%', background: '#f0a500', borderRadius: 2, animation: 'lbar 1s ease-in-out infinite alternate' }} />
        </div>
        <style>{`@keyframes lbar { from { transform: translateX(-100%); } to { transform: translateX(100%); } }`}</style>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ minHeight: '100vh', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🚛</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#111', marginBottom: 8 }}>Carrier Not Found</div>
        <div style={{ fontSize: 14, color: '#6b7280', marginBottom: 24 }}>This carrier page doesn't exist or hasn't been published yet.</div>
        <button onClick={() => { window.location.hash = '' }} style={{ padding: '10px 24px', fontSize: 13, fontWeight: 700, background: '#f0a500', color: '#000', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          Back to Home
        </button>
      </div>
    </div>
  )

  const c = data.company
  const equipment = c.equipment_types
    ? c.equipment_types.split(',').map(s => s.trim()).filter(Boolean)
    : (data.preferredEquipment || [])
  const regions = c.service_areas
    ? c.service_areas.split(',').map(s => s.trim()).filter(Boolean)
    : (data.preferredRegions || []).map(r => REGION_LABELS[r] || r)

  return (
    <div style={{ minHeight: '100vh', background: '#fff', fontFamily: "'DM Sans', system-ui, sans-serif", color: '#111' }}>

      {/* Hero */}
      <header style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', color: '#fff', padding: '60px 24px 48px', textAlign: 'center' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          {c.logo ? (
            <img src={c.logo} alt={c.name} style={{ width: 80, height: 80, objectFit: 'contain', borderRadius: 16, background: '#fff', padding: 8, marginBottom: 20 }} />
          ) : (
            <div style={{ width: 80, height: 80, borderRadius: 16, background: 'rgba(240,165,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 32, fontWeight: 800, color: '#f0a500' }}>
              {(c.name || 'C')[0]}
            </div>
          )}
          <h1 style={{ fontSize: 32, fontWeight: 800, margin: '0 0 8px', letterSpacing: -0.5 }}>{c.name}</h1>
          {c.tagline && <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.7)', margin: '0 0 16px' }}>{c.tagline}</p>}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, flexWrap: 'wrap', fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            {c.mc_number && <span>MC# {c.mc_number.replace(/^MC-?/i, '')}</span>}
            {c.dot_number && <span>DOT# {c.dot_number}</span>}
          </div>
        </div>
      </header>

      {/* Info Cards */}
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20, marginBottom: 40 }}>

          {/* Contact */}
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#f0a500', letterSpacing: 1.5, marginBottom: 14 }}>CONTACT</div>
            {c.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>📞</span>
                <a href={`tel:${c.phone}`} style={{ color: '#111', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>{c.phone}</a>
              </div>
            )}
            {c.email && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 16 }}>✉️</span>
                <a href={`mailto:${c.email}`} style={{ color: '#111', textDecoration: 'none', fontSize: 14, fontWeight: 600 }}>{c.email}</a>
              </div>
            )}
            {c.address && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 16 }}>📍</span>
                <span style={{ fontSize: 14, color: '#374151' }}>{c.address}</span>
              </div>
            )}
          </div>

          {/* Equipment */}
          {equipment.length > 0 && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#f0a500', letterSpacing: 1.5, marginBottom: 14 }}>EQUIPMENT</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {equipment.map(eq => (
                  <span key={eq} style={{ padding: '6px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, fontSize: 13, fontWeight: 600, color: '#374151' }}>
                    {eq}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Service Areas */}
          {regions.length > 0 && (
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#f0a500', letterSpacing: 1.5, marginBottom: 14 }}>SERVICE AREAS</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {regions.map(r => (
                  <span key={r} style={{ padding: '6px 14px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, fontSize: 13, fontWeight: 600, color: '#374151' }}>
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Quote Request Form */}
        <div style={{ maxWidth: 500, margin: '0 auto' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: 32 }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Request a Quote</div>
              <div style={{ fontSize: 13, color: '#6b7280' }}>Get in touch for freight hauling services</div>
            </div>

            {formSent ? (
              <div style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                <div style={{ fontSize: 16, fontWeight: 700 }}>Message Sent</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>We'll get back to you shortly.</div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <input type="text" placeholder="Your Name" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <input type="email" placeholder="Email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                    style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                  <input type="tel" placeholder="Phone" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit', outline: 'none' }} />
                </div>
                <textarea placeholder="Tell us about your freight needs..." rows={4} value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                  style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, fontFamily: 'inherit', outline: 'none', resize: 'vertical' }} />
                <button type="submit"
                  style={{ padding: '14px 24px', background: '#f0a500', color: '#000', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 800, cursor: 'pointer', letterSpacing: 0.5 }}>
                  Send Request
                </button>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid #e5e7eb', padding: '24px', textAlign: 'center', marginTop: 40 }}>
        <div style={{ fontSize: 12, color: '#9ca3af' }}>
          Powered by <a href="https://qivori.com" target="_blank" rel="noopener noreferrer"
            style={{ color: '#f0a500', fontWeight: 700, textDecoration: 'none' }}>Qivori</a> — AI-Powered Trucking
        </div>
      </footer>
    </div>
  )
}
