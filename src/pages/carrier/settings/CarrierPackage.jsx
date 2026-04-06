import React, { useState } from 'react'
import { Ic, S } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import { Briefcase, Shield, FileText, Check, Send, Camera, Upload } from 'lucide-react'
import { uploadFile } from '../../../lib/storage'

// ─── CARRIER PACKAGE ──────────────────────────────────────────────────────────
export function CarrierPackage() {
  const { showToast } = useApp()
  const { company, updateCompany } = useCarrier()
  const [tab, setTab] = useState('overview')
  const [logoUploading, setLogoUploading] = useState(false)

  const handleLogoUpload = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/png,image/jpeg,image/svg+xml,image/webp'
    input.onchange = async (e) => {
      const file = e.target.files?.[0]
      if (!file) return
      if (file.size > 2 * 1024 * 1024) { showToast('error', 'Too Large', 'Logo must be under 2MB'); return }
      setLogoUploading(true)
      try {
        const result = await uploadFile(file, 'logos')
        await updateCompany({ logo: result.url })
        showToast('success', 'Logo Updated', 'Your company logo has been saved')
      } catch (err) {
        showToast('error', 'Upload Failed', err.message || 'Could not upload logo')
      }
      setLogoUploading(false)
    }
    input.click()
  }

  const [insurance, setInsurance] = useState({
    auto:    { company:'\u2014', policy:'\u2014', amount:'\u2014', expiry:'\u2014' },
    cargo:   { company:'\u2014', policy:'\u2014', amount:'\u2014', expiry:'\u2014' },
    general: { company:'\u2014', policy:'\u2014', amount:'\u2014', expiry:'\u2014' },
  })
  const [docs, setDocs] = useState({
    w9:        { uploaded:!!company?.w9_doc_url,        filename:company?.w9_doc_name || '' },
    authority: { uploaded:!!company?.authority_doc_url, filename:company?.authority_doc_name || '' },
    boc3:      { uploaded:!!company?.boc3_doc_url,     filename:company?.boc3_doc_name || '' },
    drug:      { uploaded:!!company?.drug_doc_url,     filename:company?.drug_doc_name || '' },
  })
  const [brokerEmail, setBrokerEmail] = useState('')
  const [pkgSent, setPkgSent] = useState({})
  const [linkCopied, setLinkCopied] = useState(false)

  const INS = [
    { key:'auto',    label:'Auto Liability',    required:true  },
    { key:'cargo',   label:'Cargo Insurance',   required:true  },
    { key:'general', label:'General Liability', required:false },
  ]
  const DOCS = [
    { key:'w9',        label:'W-9 Tax Form',          required:true  },
    { key:'authority', label:'Operating Authority',   required:true  },
    { key:'boc3',      label:'BOC-3 Process Agent',   required:true  },
    { key:'drug',      label:'Drug & Alcohol Policy', required:false },
  ]

  const linkUrl = 'https://pkg.qivori.com/c/' + (company?.mc||'').replace('MC-','')
  const doneCount = INS.filter(f=>f.required&&insurance[f.key]?.policy).length + DOCS.filter(f=>f.required&&docs[f.key]?.uploaded).length
  const totalReq  = INS.filter(f=>f.required).length + DOCS.filter(f=>f.required).length
  const pct = Math.round((doneCount/totalReq)*100)
  const inp = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', width:'100%', boxSizing:'border-box' }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>CARRIER PACKAGE</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Your broker contracting packet — {pct}% complete</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:120, height:6, borderRadius:3, background:'var(--surface3)' }}>
            <div style={{ height:6, borderRadius:3, width:pct+'%', background:pct===100?'var(--success)':'var(--accent)', transition:'width 0.4s' }} />
          </div>
          <span style={{ fontSize:12, fontWeight:700, color:pct===100?'var(--success)':'var(--accent)' }}>{pct}%</span>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:6 }}>
        {[
          { id:'overview', label:'Overview' },
          { id:'insurance', label:'Insurance' },
          { id:'documents', label:'Documents' },
          { id:'send', label:'Send to Broker' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} className="btn" style={{
            background: tab===t.id ? 'rgba(240,165,0,0.12)' : 'var(--surface2)',
            color: tab===t.id ? 'var(--accent)' : 'var(--muted)',
            border: `1px solid ${tab===t.id ? 'rgba(240,165,0,0.35)' : 'var(--border)'}`,
          }}>{t.label}</button>
        ))}
      </div>

      {/* OVERVIEW TAB */}
      {tab === 'overview' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Company Card */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Briefcase} /> Company Profile</div>
              <span style={S.badge(pct===100?'var(--success)':'var(--accent)')}>{pct===100?'Ready to Send':'In Progress'}</span>
            </div>
            <div style={{ padding:20, display:'flex', alignItems:'center', gap:20 }}>
              <div style={{ position:'relative', width:56, height:56, flexShrink:0 }}>
                <div style={{ width:56, height:56, borderRadius:12, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden' }}>
                  {company?.logo
                    ? <img src={company.logo} alt="logo" style={{ width:'100%', height:'100%', objectFit:'contain', borderRadius:12 }} />
                    : <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:'var(--accent)' }}>
                        {(company?.name || 'SC').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase()}
                      </span>
                  }
                </div>
                <button onClick={handleLogoUpload} disabled={logoUploading}
                  style={{ position:'absolute', bottom:-4, right:-4, width:22, height:22, borderRadius:'50%', background:'var(--accent)', border:'2px solid var(--bg)', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', padding:0 }}
                  title="Upload company logo">
                  <Camera size={10} color="#000" />
                </button>
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:16, marginBottom:4 }}>{company?.name || 'Your Company'}</div>
                <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--muted)' }}>
                  <span>{company?.mc||''}</span>
                  <span>{company?.dot||''}</span>
                  <span>{company?.phone || '(612) 555-0182'}</span>
                </div>
              </div>
              <span style={{ fontSize:12, fontWeight:700, color:'var(--success)' }}><Check size={12} /> Authority Active</span>
            </div>
          </div>

          {/* Status Summary */}
          <div style={S.grid(2)}>
            {/* Insurance Status */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={Shield} /> Insurance</div>
                <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setTab('insurance')}>Edit →</button>
              </div>
              <div style={{ padding:14, display:'flex', flexDirection:'column', gap:8 }}>
                {INS.map(f => (
                  <div key={f.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:'var(--surface2)', borderRadius:8 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{f.label}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{insurance[f.key]?.company || 'Not set'}</div>
                    </div>
                    <span style={S.tag(insurance[f.key]?.policy ? 'var(--success)' : 'var(--danger)')}>
                      {insurance[f.key]?.policy ? 'On File' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Documents Status */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}><Ic icon={FileText} /> Documents</div>
                <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setTab('documents')}>Edit →</button>
              </div>
              <div style={{ padding:14, display:'flex', flexDirection:'column', gap:8 }}>
                {DOCS.map(f => (
                  <div key={f.key} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 12px', background:'var(--surface2)', borderRadius:8 }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:600 }}>{f.label}</div>
                      <div style={{ fontSize:11, color:'var(--muted)' }}>{docs[f.key]?.uploaded ? docs[f.key].filename : 'Not uploaded'}</div>
                    </div>
                    <span style={S.tag(docs[f.key]?.uploaded ? 'var(--success)' : 'var(--danger)')}>
                      {docs[f.key]?.uploaded ? 'Uploaded' : 'Missing'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* INSURANCE TAB */}
      {tab === 'insurance' && (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {INS.map(f => {
            const ins = insurance[f.key]
            return (
              <div key={f.key} style={S.panel}>
                <div style={S.panelHead}>
                  <div style={S.panelTitle}>
                    {f.label}
                    {f.required && <span style={{ fontSize:10, color:'var(--danger)', marginLeft:6 }}>Required</span>}
                  </div>
                  <span style={S.tag(ins?.policy ? 'var(--success)' : 'var(--danger)')}>
                    {ins?.policy ? 'On File' : 'Missing'}
                  </span>
                </div>
                <div style={{ padding:16, display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  {[
                    { key:'company', label:'Insurance Company', ph:'Progressive Commercial' },
                    { key:'policy',  label:'Policy Number',     ph:'PCT-8821047' },
                    { key:'amount',  label:'Coverage Amount',   ph:'$1,000,000' },
                    { key:'expiry',  label:'Expiry Date',       ph:'Nov 15, 2026' },
                  ].map(field => (
                    <div key={field.key}>
                      <label style={{ fontSize:10, color:'var(--muted)', display:'block', marginBottom:4 }}>{field.label}</label>
                      <input value={(ins && ins[field.key]) || ''} placeholder={field.ph}
                        onChange={e => setInsurance(prev => ({ ...prev, [f.key]: { ...prev[f.key], [field.key]: e.target.value } }))}
                        style={inp} />
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* DOCUMENTS TAB */}
      {tab === 'documents' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {DOCS.map(f => (
            <div key={f.key} style={{ ...S.panel, padding:'14px 18px', display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>
                  {f.label}
                  {f.required && <span style={{ fontSize:10, color:'var(--danger)', marginLeft:8 }}>Required</span>}
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:3 }}>
                  {docs[f.key]?.uploaded ? docs[f.key].filename : 'No file uploaded — PDF, DOC accepted'}
                </div>
              </div>
              {docs[f.key]?.uploaded ? (
                <div style={{ display:'flex', gap:8 }}>
                  <span style={S.tag('var(--success)')}><Check size={11} /> On File</span>
                  <label style={{ padding:'5px 12px', fontSize:11, fontWeight:700, borderRadius:6, border:'1px solid var(--border)', background:'var(--surface2)', color:'var(--muted)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                    Replace
                    <input type="file" accept=".pdf,.doc,.docx" style={{ display:'none' }}
                      onChange={async e => {
                        const file = e.target.files?.[0]; if (!file) return
                        try {
                          const result = await uploadFile(file, 'carrier-docs/' + f.key)
                          setDocs(d => ({ ...d, [f.key]: { uploaded:true, filename:file.name, url:result.url } }))
                          updateCompany({ [`${f.key}_doc_url`]: result.url, [`${f.key}_doc_name`]: file.name })
                          showToast('', f.label+' Updated', file.name)
                        } catch (err) { showToast('error', 'Upload Failed', err.message || 'Could not upload') }
                      }} />
                  </label>
                </div>
              ) : (
                <label style={{ padding:'8px 18px', fontSize:12, fontWeight:700, borderRadius:8, background:'var(--accent)', color:'#000', cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
                  Upload
                  <input type="file" accept=".pdf,.doc,.docx" style={{ display:'none' }}
                    onChange={async e => {
                      const file = e.target.files?.[0]; if (!file) return
                      try {
                        const result = await uploadFile(file, 'carrier-docs/' + f.key)
                        setDocs(d => ({ ...d, [f.key]: { uploaded:true, filename:file.name, url:result.url } }))
                        updateCompany({ [`${f.key}_doc_url`]: result.url, [`${f.key}_doc_name`]: file.name })
                        showToast('', f.label+' Uploaded', file.name)
                      } catch (err) { showToast('error', 'Upload Failed', err.message || 'Could not upload') }
                    }} />
                </label>
              )}
            </div>
          ))}
        </div>
      )}

      {/* SEND TAB */}
      {tab === 'send' && (
        <div style={{ maxWidth:500 }}>
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={S.panelTitle}><Ic icon={Send} /> Send to Broker</div>
            </div>
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Broker Email</label>
                <input value={brokerEmail} onChange={e => setBrokerEmail(e.target.value)} placeholder="dispatch@broker.com" style={inp} />
              </div>
              <button onClick={async () => { if(!brokerEmail||pkgSent[brokerEmail]) return; try { await apiFetch('/api/carrier-packet', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ brokerEmail }) }); setPkgSent(p => ({...p, [brokerEmail]:true})); showToast('success','Package Sent!','Carrier packet emailed to '+brokerEmail) } catch(e) { showToast('error','Send Failed', e.message||'Could not send packet — check your documents are uploaded') } }}
                style={{ padding:'12px 0', fontSize:13, fontWeight:700, borderRadius:8, border:'none', fontFamily:"'DM Sans',sans-serif", cursor:'pointer',
                  background:pkgSent[brokerEmail]?'rgba(34,197,94,0.15)':!brokerEmail?'var(--surface3)':'var(--accent3)',
                  color:pkgSent[brokerEmail]?'var(--success)':!brokerEmail?'var(--muted)':'#fff' }}>
                {pkgSent[brokerEmail] ? 'Package Sent ✓' : 'Send Carrier Package'}
              </button>

              <div style={{ borderTop:'1px solid var(--border)', paddingTop:14 }}>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:8 }}>Or share your package link</div>
                <div style={{ display:'flex', gap:8 }}>
                  <input readOnly value={linkUrl} style={{ ...inp, flex:1, fontSize:11, fontFamily:'monospace' }} />
                  <button onClick={() => { try{navigator.clipboard.writeText(linkUrl)}catch{}; setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2500); showToast('','Link Copied','Share with any broker') }}
                    style={{ fontSize:11, fontWeight:700, padding:'8px 14px', borderRadius:6, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif", flexShrink:0,
                      background:linkCopied?'rgba(34,197,94,0.15)':'var(--accent)', color:linkCopied?'var(--success)':'#000' }}>
                    {linkCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {Object.keys(pkgSent).length > 0 && (
                <div style={{ background:'rgba(34,197,94,0.05)', border:'1px solid rgba(34,197,94,0.15)', borderRadius:8, padding:'10px 14px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--success)', marginBottom:5 }}>Sent History</div>
                  {Object.keys(pkgSent).map(email => (
                    <div key={email} style={{ fontSize:12, color:'var(--muted)' }}><Check size={11} /> {email}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
