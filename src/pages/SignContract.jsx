import React, { useState, useEffect, useCallback, useRef } from 'react'
import { CONTRACT_TYPES, getSectionsForType, getLegalTextForType, payDescription } from '../lib/contractLegalText'

export default function SignContract({ token }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [contract, setContract] = useState(null)
  const [agreed, setAgreed] = useState(false)
  const [sigCanvas, setSigCanvas] = useState(null)
  const [sigDrawing, setSigDrawing] = useState(false)
  const [hasSig, setHasSig] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [alreadySigned, setAlreadySigned] = useState(false)
  const containerRef = useRef(null)

  useEffect(() => {
    if (!token) { setError('No signing token provided'); setLoading(false); return }
    fetch(`/api/sign-contract?token=${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then(data => {
        if (data.ok) setContract(data.contract)
        else if (data.alreadySigned) setAlreadySigned(true)
        else setError(data.error || 'Failed to load contract')
      })
      .catch(() => setError('Network error — please try again'))
      .finally(() => setLoading(false))
  }, [token])

  const initSigCanvas = useCallback(node => {
    if (!node) return
    setSigCanvas(node)
    const ctx = node.getContext('2d')
    ctx.strokeStyle = '#f0a500'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
  }, [])

  const getPos = (e, rect) => {
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const clientY = e.touches ? e.touches[0].clientY : e.clientY
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  const sigStart = (e) => {
    if (!sigCanvas) return
    const ctx = sigCanvas.getContext('2d')
    const { x, y } = getPos(e, sigCanvas.getBoundingClientRect())
    ctx.beginPath(); ctx.moveTo(x, y)
    setSigDrawing(true)
  }
  const sigMove = (e) => {
    if (!sigDrawing || !sigCanvas) return
    e.preventDefault()
    const ctx = sigCanvas.getContext('2d')
    const { x, y } = getPos(e, sigCanvas.getBoundingClientRect())
    ctx.lineTo(x, y); ctx.stroke()
    setHasSig(true)
  }
  const sigEnd = () => setSigDrawing(false)
  const sigClear = () => {
    if (!sigCanvas) return
    const ctx = sigCanvas.getContext('2d')
    ctx.clearRect(0, 0, sigCanvas.width, sigCanvas.height)
    setHasSig(false)
  }

  const handleSubmit = async () => {
    if (!hasSig || !sigCanvas || !agreed) return
    setSubmitting(true)
    try {
      const signature = sigCanvas.toDataURL('image/png')
      const res = await fetch('/api/sign-contract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, signature, signerName: contract.driver_name }),
      })
      const data = await res.json()
      if (data.ok) setSuccess(true)
      else setError(data.error || 'Failed to sign')
    } catch {
      setError('Network error — please try again')
    }
    setSubmitting(false)
  }

  const sections = contract ? getSectionsForType(contract.contract_type) : []
  const legalText = contract ? getLegalTextForType(contract.contract_type) : {}
  const typeLabel = contract ? (CONTRACT_TYPES.find(t => t.id === contract.contract_type)?.label || contract.contract_type) : ''
  const payDesc = contract ? payDescription(contract.pay_structure, contract.pay_rate) : ''
  const isLease = contract?.contract_type === 'lease'

  // Styles
  const page = { minHeight:'100vh', background:'#f5f7fa', fontFamily:"'Segoe UI',Arial,sans-serif" }
  const header = { background:'linear-gradient(135deg,#0a0a0e 0%,#1a1a2e 100%)', padding:'24px 0', textAlign:'center' }
  const content = { maxWidth:800, margin:'0 auto', padding:'0 20px 60px' }
  const card = { background:'#fff', borderRadius:12, boxShadow:'0 2px 12px rgba(0,0,0,0.08)', padding:32, marginBottom:24 }
  const sectionTitle = { fontSize:14, fontWeight:700, color:'#1a1a2e', marginBottom:6, textTransform:'uppercase' }
  const sectionBody = { fontSize:13, color:'#444', lineHeight:1.7, textAlign:'justify' }
  const label = { fontSize:12, color:'#888', marginBottom:2 }
  const val = { fontSize:14, fontWeight:600, color:'#1a1a2e', marginBottom:12 }

  if (loading) return (
    <div style={{ ...page, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ textAlign:'center' }}>
        <div style={{ width:40, height:40, border:'3px solid #e5e7eb', borderTopColor:'#f0a500', borderRadius:'50%', animation:'spin 1s linear infinite', margin:'0 auto 16px' }} />
        <div style={{ color:'#666', fontSize:14 }}>Loading contract...</div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    </div>
  )

  if (alreadySigned) return (
    <div style={{ ...page, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ ...card, maxWidth:500, textAlign:'center' }}>
        <div style={{ width:60, height:60, borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
        <h2 style={{ fontSize:20, color:'#1a1a2e', marginBottom:8 }}>Already Signed</h2>
        <p style={{ color:'#666', fontSize:14 }}>This contract has already been signed. No further action is needed.</p>
      </div>
    </div>
  )

  if (error) return (
    <div style={{ ...page, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ ...card, maxWidth:500, textAlign:'center' }}>
        <div style={{ width:60, height:60, borderRadius:'50%', background:'#fef2f2', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
        </div>
        <h2 style={{ fontSize:20, color:'#1a1a2e', marginBottom:8 }}>Unable to Load Contract</h2>
        <p style={{ color:'#666', fontSize:14 }}>{error}</p>
      </div>
    </div>
  )

  if (success) return (
    <div style={{ ...page, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ ...card, maxWidth:500, textAlign:'center' }}>
        <div style={{ width:60, height:60, borderRadius:'50%', background:'#dcfce7', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
        <h2 style={{ fontSize:20, color:'#16a34a', marginBottom:8 }}>Contract Signed Successfully</h2>
        <p style={{ color:'#666', fontSize:14, marginBottom:16 }}>
          Your signature has been recorded. A copy of the fully executed contract has been saved.
          You may close this page.
        </p>
        <div style={{ fontSize:12, color:'#999' }}>Signed on {new Date().toLocaleString()}</div>
      </div>
    </div>
  )

  return (
    <div style={page} ref={containerRef}>
      {/* Header */}
      <div style={header}>
        <div style={{ fontSize:28, fontWeight:800, color:'#f0a500', letterSpacing:3 }}>QIVORI</div>
        <div style={{ fontSize:11, color:'#888', marginTop:2 }}>AI-Powered Fleet Management</div>
      </div>

      <div style={content}>
        {/* Title */}
        <div style={{ textAlign:'center', padding:'28px 0 20px' }}>
          <h1 style={{ fontSize:22, fontWeight:700, color:'#1a1a2e', marginBottom:4 }}>{typeLabel}</h1>
          <div style={{ fontSize:13, color:'#666' }}>
            {isLease ? '49 CFR §376.12 Compliant' : 'Independent Contractor Relationship'}
          </div>
          {contract.amendment_number > 0 && (
            <div style={{ display:'inline-block', background:'#fef3cd', color:'#856404', padding:'4px 12px', borderRadius:6, fontSize:12, fontWeight:600, marginTop:8 }}>
              Amendment #{contract.amendment_number} {contract.amendment_reason ? `— ${contract.amendment_reason}` : ''}
            </div>
          )}
        </div>

        {/* Parties */}
        <div style={card}>
          <div style={{ fontSize:14, color:'#444', lineHeight:1.8 }}>
            <p>This agreement is entered into as of <strong>{contract.start_date || '___'}</strong> by and between:</p>
            <p style={{ margin:'12px 0' }}><strong>CARRIER:</strong> {contract.company_name || '___'}</p>
            <p><strong>OWNER-OPERATOR / CONTRACTOR:</strong> {contract.driver_name || '___'}</p>
          </div>
        </div>

        {/* Summary */}
        <div style={card}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div><div style={label}>Agreement Type</div><div style={val}>{typeLabel}</div></div>
            <div><div style={label}>Compensation</div><div style={val}>{payDesc}</div></div>
            <div><div style={label}>Start Date</div><div style={val}>{contract.start_date || 'Upon execution'}</div></div>
            <div><div style={label}>End Date</div><div style={val}>{contract.end_date || 'Open-ended'}</div></div>
            {contract.vehicle_info && <div><div style={label}>Vehicle</div><div style={val}>{contract.vehicle_info}</div></div>}
            {contract.vehicle_vin && <div><div style={label}>VIN</div><div style={val}>{contract.vehicle_vin}</div></div>}
          </div>
        </div>

        {/* FMCSA Notice */}
        {isLease && (
          <div style={{ background:'#fffbeb', border:'1px solid #fbbf24', borderRadius:12, padding:16, marginBottom:24 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#92400e', marginBottom:4 }}>FMCSA Compliance Notice</div>
            <div style={{ fontSize:12, color:'#78350f' }}>
              This lease agreement is prepared in accordance with 49 CFR §376.12. All required provisions are included. Review all sections carefully before signing.
            </div>
          </div>
        )}

        {/* Legal Sections */}
        {sections.map((s, i) => (
          <div key={i} style={card}>
            <div style={sectionTitle}>Section {i + 1}: {s}</div>
            <div style={sectionBody}>{legalText[s] || ''}</div>
          </div>
        ))}

        {/* Custom Terms */}
        {contract.custom_terms && (
          <div style={card}>
            <div style={sectionTitle}>Additional Terms & Conditions</div>
            <div style={{ ...sectionBody, whiteSpace:'pre-wrap' }}>{contract.custom_terms}</div>
          </div>
        )}

        {/* Entire Agreement */}
        <div style={card}>
          <div style={sectionTitle}>Entire Agreement</div>
          <div style={sectionBody}>
            This Agreement constitutes the entire understanding between the parties and supersedes all prior agreements, negotiations, and discussions.
            This Agreement may not be amended except by a written instrument signed by both parties.
            If any provision is held to be unenforceable, the remaining provisions shall continue in full force and effect.
          </div>
        </div>

        {/* Carrier Signature */}
        <div style={card}>
          <div style={sectionTitle}>Carrier Signature</div>
          {contract.carrier_signature ? (
            <div>
              <img src={contract.carrier_signature} alt="Carrier Signature" style={{ height:60, border:'1px solid #e5e7eb', borderRadius:6, padding:4, background:'#fafafa' }} />
              <div style={{ fontSize:12, color:'#666', marginTop:6 }}>
                {contract.company_name} — Signed {contract.signed_date ? new Date(contract.signed_date).toLocaleDateString() : ''}
              </div>
            </div>
          ) : (
            <div style={{ fontSize:13, color:'#888' }}>Carrier signature on file</div>
          )}
        </div>

        {/* Driver Signature Section */}
        <div style={{ ...card, border:'2px solid #f0a500' }}>
          <div style={{ ...sectionTitle, color:'#f0a500', fontSize:16, marginBottom:16 }}>Your Signature</div>

          {/* Agreement checkbox */}
          <label style={{ display:'flex', alignItems:'flex-start', gap:10, marginBottom:20, cursor:'pointer' }}>
            <input type="checkbox" checked={agreed} onChange={e => setAgreed(e.target.checked)}
              style={{ width:20, height:20, marginTop:2, accentColor:'#f0a500', cursor:'pointer' }} />
            <span style={{ fontSize:13, color:'#444', lineHeight:1.6 }}>
              I, <strong>{contract.driver_name}</strong>, have read and agree to all terms and conditions outlined in this {typeLabel}.
              I understand that this electronic signature is legally binding.
            </span>
          </label>

          {/* Signature pad */}
          <div style={{ position:'relative', marginBottom:12 }}>
            <canvas ref={initSigCanvas} width={600} height={120}
              style={{ width:'100%', height:120, background:'#fafafa', border:`2px solid ${hasSig ? '#f0a500' : '#e5e7eb'}`, borderRadius:8, cursor:'crosshair', touchAction:'none' }}
              onMouseDown={sigStart} onMouseMove={sigMove} onMouseUp={sigEnd} onMouseLeave={sigEnd}
              onTouchStart={sigStart} onTouchMove={sigMove} onTouchEnd={sigEnd} />
            {!hasSig && (
              <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', fontSize:14, color:'#bbb', pointerEvents:'none' }}>
                Draw your signature here
              </div>
            )}
          </div>

          <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
            <button onClick={handleSubmit} disabled={!hasSig || !agreed || submitting}
              style={{ padding:'12px 32px', background: (hasSig && agreed && !submitting) ? 'linear-gradient(135deg,#c78c00,#f0a500)' : '#e5e7eb', color: (hasSig && agreed) ? '#0a0a0e' : '#999', border:'none', borderRadius:8, fontSize:15, fontWeight:700, cursor: (hasSig && agreed && !submitting) ? 'pointer' : 'not-allowed', letterSpacing:0.5 }}>
              {submitting ? 'Signing...' : 'Sign Contract'}
            </button>
            <button onClick={sigClear}
              style={{ padding:'12px 20px', background:'#f3f4f6', color:'#666', border:'none', borderRadius:8, fontSize:13, cursor:'pointer' }}>
              Clear Signature
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ textAlign:'center', padding:'24px 0', color:'#999', fontSize:11 }}>
          <p>Powered by Qivori AI — Transportation Management System</p>
          <p>This document is legally binding when signed by both parties.</p>
        </div>
      </div>
    </div>
  )
}
