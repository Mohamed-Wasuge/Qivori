import { useState, useEffect, useCallback } from 'react'
import { Ic, S } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import { FileText, Plus, Search, Calendar, Clock, Check, CheckCircle, XCircle, Eye, Trash2, User, Send, Download, Printer, Edit3 as PencilIcon, Save } from 'lucide-react'
import * as db from '../../../lib/database'
import { inp } from './helpers'
import { CONTRACT_TYPES, LEASE_SECTIONS, IC_SECTIONS, LEASE_LEGAL_TEXT, IC_LEGAL_TEXT } from '../../../lib/contractLegalText'

function printContract(contract, company) {
  const isLease = contract.contract_type === 'lease'
  const sections = isLease ? LEASE_SECTIONS : IC_SECTIONS
  const legalText = isLease ? LEASE_LEGAL_TEXT : IC_LEGAL_TEXT
  const typeLabel = CONTRACT_TYPES.find(t => t.id === contract.contract_type)?.label || contract.contract_type
  const payDesc = contract.pay_structure === 'percent' ? `${contract.pay_rate}% of gross revenue` : contract.pay_structure === 'permile' ? `$${contract.pay_rate} per mile` : `$${contract.pay_rate} per load`

  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><title>${typeLabel} — ${contract.driver_name}</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: 'Times New Roman', Georgia, serif; color:#1a1a1a; padding:60px 72px; line-height:1.6; max-width:900px; margin:0 auto; }
  h1 { font-size:22px; text-align:center; text-transform:uppercase; letter-spacing:2px; margin-bottom:4px; }
  .subtitle { text-align:center; font-size:13px; color:#666; margin-bottom:32px; }
  .parties { margin-bottom:28px; font-size:14px; }
  .parties strong { font-weight:700; }
  .summary-table { width:100%; border-collapse:collapse; margin-bottom:28px; }
  .summary-table td { padding:8px 12px; border:1px solid #ddd; font-size:13px; }
  .summary-table td:first-child { font-weight:700; background:#f8f8f8; width:200px; }
  .section { margin-bottom:24px; page-break-inside:avoid; }
  .section-num { font-size:14px; font-weight:700; margin-bottom:6px; text-transform:uppercase; color:#333; }
  .section-body { font-size:13px; text-align:justify; }
  .terms-box { background:#f9f9f4; border:1px solid #e0dcc8; padding:16px; border-radius:4px; margin-bottom:28px; }
  .terms-box h3 { font-size:13px; font-weight:700; margin-bottom:6px; }
  .terms-box p { font-size:12px; white-space:pre-wrap; }
  .sig-block { margin-top:48px; display:flex; justify-content:space-between; gap:48px; }
  .sig-col { flex:1; }
  .sig-line { border-bottom:1px solid #333; height:50px; margin-bottom:6px; position:relative; }
  .sig-line img { position:absolute; bottom:4px; left:0; height:44px; }
  .sig-label { font-size:11px; color:#666; }
  .sig-date { font-size:12px; margin-top:4px; }
  .footer { margin-top:48px; text-align:center; font-size:10px; color:#999; border-top:1px solid #ddd; padding-top:16px; }
  .fmcsa-note { background:#fffbe6; border:1px solid #f0d060; padding:12px 16px; border-radius:4px; margin-bottom:28px; font-size:11px; }
  @media print {
    body { padding:40px 48px; }
    .no-print { display:none; }
  }
</style></head><body>
<div class="no-print" style="text-align:center;margin-bottom:24px">
  <button onclick="window.print()" style="padding:10px 32px;font-size:14px;background:#f0a500;color:#000;border:none;border-radius:6px;cursor:pointer;font-weight:700">Print Contract</button>
  <button onclick="window.close()" style="padding:10px 24px;font-size:14px;background:#eee;color:#333;border:none;border-radius:6px;cursor:pointer;margin-left:8px">Close</button>
</div>

<h1>${typeLabel}</h1>
<div class="subtitle">${isLease ? '49 CFR §376.12 Compliant' : 'Independent Contractor Relationship'}</div>

<div class="parties">
  <p>This agreement ("Agreement") is entered into as of <strong>${contract.start_date || '___________'}</strong> by and between:</p>
  <p style="margin:12px 0"><strong>CARRIER:</strong> ${contract.company_name || company || '___________'} ("Carrier")</p>
  <p><strong>OWNER-OPERATOR / CONTRACTOR:</strong> ${contract.driver_name || '___________'} ("Owner-Operator")</p>
</div>

${isLease ? '<div class="fmcsa-note"><strong>FMCSA Compliance Notice:</strong> This lease agreement is prepared in accordance with the requirements of 49 CFR §376.12 (Lease and Interchange of Vehicles). All required provisions are included herein. Both parties should review all sections carefully before signing.</div>' : ''}

<table class="summary-table">
  <tr><td>Agreement Type</td><td>${typeLabel}</td></tr>
  <tr><td>Compensation</td><td>${payDesc}</td></tr>
  <tr><td>Start Date</td><td>${contract.start_date || 'Upon execution'}</td></tr>
  <tr><td>End Date</td><td>${contract.end_date || 'Open-ended (terminable with 30-day notice)'}</td></tr>
  <tr><td>Vehicle</td><td>${contract.vehicle_info || 'See Exhibit A'} ${contract.vehicle_vin ? '— VIN: ' + contract.vehicle_vin : ''}</td></tr>
  <tr><td>Status</td><td>${(contract.status || 'active').toUpperCase()}</td></tr>
</table>

${sections.map((s, i) => `
<div class="section">
  <div class="section-num">Section ${i + 1}: ${s}</div>
  <div class="section-body">${legalText[s] || ''}</div>
</div>`).join('')}

${contract.custom_terms ? `
<div class="terms-box">
  <h3>Additional Terms & Conditions</h3>
  <p>${contract.custom_terms}</p>
</div>` : ''}

<div class="section">
  <div class="section-num">Entire Agreement</div>
  <div class="section-body">This Agreement constitutes the entire understanding between the parties and supersedes all prior agreements, negotiations, and discussions. This Agreement may not be amended except by a written instrument signed by both parties. If any provision is held to be unenforceable, the remaining provisions shall continue in full force and effect.</div>
</div>

<div class="sig-block">
  <div class="sig-col">
    <div class="sig-line">${contract.carrier_signature ? `<img src="${contract.carrier_signature}" alt="Carrier Signature"/>` : ''}</div>
    <div class="sig-label"><strong>Carrier Authorized Signature</strong></div>
    <div class="sig-date">${contract.company_name || company || '___________'}</div>
    <div class="sig-date">Date: ${contract.signed_date ? new Date(contract.signed_date).toLocaleDateString() : '___________'}</div>
  </div>
  <div class="sig-col">
    <div class="sig-line">${contract.driver_signature ? `<img src="${contract.driver_signature}" alt="Driver Signature"/>` : ''}</div>
    <div class="sig-label"><strong>Owner-Operator / Contractor Signature</strong></div>
    <div class="sig-date">${contract.driver_name || '___________'}</div>
    <div class="sig-date">Date: ${contract.driver_signed_date ? new Date(contract.driver_signed_date).toLocaleDateString() : '___________'}</div>
  </div>
</div>
${contract.fully_executed ? `<div style="margin-top:24px;padding:12px 16px;background:#f0fdf4;border:1px solid #86efac;border-radius:4px;text-align:center;font-size:12px;color:#166534"><strong>FULLY EXECUTED</strong> — Both parties have signed this agreement electronically.${contract.driver_signed_ip ? ' Driver IP: ' + contract.driver_signed_ip : ''}${contract.driver_signed_date ? ' | Signed: ' + new Date(contract.driver_signed_date).toLocaleString() : ''}</div>` : ''}

<div class="footer">
  <p>Generated by Qivori AI — Transportation Management System</p>
  <p>This document is legally binding when signed by both parties. Retain copies for your records.</p>
  ${isLease ? '<p>Prepared in compliance with 49 CFR §376.12 — FMCSA Lease & Interchange of Vehicles</p>' : ''}
</div>
</body></html>`)
  win.document.close()
}

export function DriverContracts() {
  const { showToast, user } = useApp()
  const { drivers, vehicles, company } = useCarrier()
  const [contracts, setContracts] = useState([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)
  const [selDriver, setSelDriver] = useState('')
  const [selType, setSelType] = useState('lease')
  const [customTerms, setCustomTerms] = useState('')
  const [payStructure, setPayStructure] = useState('percent')
  const [payRate, setPayRate] = useState('')
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0])
  const [endDate, setEndDate] = useState('')
  const [signing, setSigning] = useState(false)
  const [sigCanvas, setSigCanvas] = useState(null)
  const [sigDrawing, setSigDrawing] = useState(false)
  const [hasSig, setHasSig] = useState(false)
  const [viewContract, setViewContract] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [sendingContract, setSendingContract] = useState(null)
  const [sendMethod, setSendMethod] = useState('both')
  const [amendingContract, setAmendingContract] = useState(null)
  const [amendReason, setAmendReason] = useState('')

  // Load contracts
  useEffect(() => {
    db.fetchDriverContracts().then(d => setContracts(d || [])).catch(() => {}).finally(() => setLoading(false))
  }, [])

  const saveContract = async (sigDataUrl) => {
    const driver = drivers.find(d => d.full_name === selDriver || d.id === selDriver)
    if (!driver) { showToast('','Error','Select a driver'); return }
    const vehicle = vehicles?.find(v => v.driver_id === driver.id || v.assigned_driver === driver.full_name)

    const contractData = {
      driver_id: driver.id,
      driver_name: driver.full_name,
      contract_type: selType,
      pay_structure: payStructure,
      pay_rate: parseFloat(payRate) || 0,
      start_date: startDate,
      end_date: endDate || null,
      vehicle_vin: vehicle?.vin || null,
      vehicle_info: vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : null,
      company_name: company?.company_name || company?.name || 'Carrier',
      custom_terms: customTerms || null,
      carrier_signature: sigDataUrl || null,
      carrier_signed_user_agent: navigator.userAgent,
      status: 'active',
      signed_date: new Date().toISOString(),
      ...(amendingContract ? {
        parent_contract_id: amendingContract.id,
        amendment_number: (amendingContract.amendment_number || 0) + 1,
        amendment_reason: amendReason || null,
      } : {}),
    }

    try {
      const saved = await db.createDriverContract(contractData)
      setContracts(prev => [saved, ...prev])
      showToast('','Contract Created',`${CONTRACT_TYPES.find(t=>t.id===selType)?.label} for ${driver.full_name}`)
      setShowNew(false)
      setSelDriver(''); setCustomTerms(''); setPayRate(''); setEndDate(''); setAmendingContract(null); setAmendReason('')
    } catch {
      showToast('','Error','Failed to save contract')
    }
  }

  const uploadCustomContract = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { uploadFile } = await import('../../../lib/storage')
      const result = await uploadFile(file, `contracts/${selDriver || 'general'}`)
      setCustomTerms(result.url || result.path)
      showToast('','Uploaded', file.name)
    } catch { showToast('','Error','Upload failed') }
    setUploading(false)
  }

  const terminateContract = async (id) => {
    try {
      await db.updateDriverContract(id, { status: 'terminated', end_date: new Date().toISOString().split('T')[0] })
      setContracts(prev => prev.map(c => c.id === id ? { ...c, status: 'terminated', end_date: new Date().toISOString().split('T')[0] } : c))
      showToast('','Contract Terminated','Contract has been ended')
    } catch { showToast('','Error','Failed to terminate') }
  }

  const sendToDriver = async (contractId) => {
    setSendingContract(contractId)
    try {
      const res = await apiFetch('/api/send-contract', {
        method: 'POST',
        body: JSON.stringify({ contractId, sendMethod }),
      })
      if (res.ok) {
        setContracts(prev => prev.map(c => c.id === contractId ? { ...c, sent_at: new Date().toISOString(), sent_via: sendMethod } : c))
        showToast('', 'Contract Sent', `Sent to ${res.driverName} via ${sendMethod}`)
      } else {
        showToast('', 'Error', res.error || 'Failed to send')
      }
    } catch { showToast('', 'Error', 'Failed to send contract') }
    setSendingContract(null)
  }

  const createAmendment = (parentContract) => {
    setAmendingContract(parentContract)
    setSelDriver(parentContract.driver_name)
    setSelType(parentContract.contract_type)
    setPayStructure(parentContract.pay_structure)
    setPayRate(String(parentContract.pay_rate))
    setStartDate(new Date().toISOString().split('T')[0])
    setEndDate(parentContract.end_date || '')
    setCustomTerms('')
    setAmendReason('')
    setShowNew(true)
  }

  // Signature pad helpers
  const initSigCanvas = useCallback(node => {
    if (!node) return
    setSigCanvas(node)
    const ctx = node.getContext('2d')
    ctx.strokeStyle = '#f0a500'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
  }, [])

  const sigStart = (e) => {
    if (!sigCanvas) return
    const ctx = sigCanvas.getContext('2d')
    const rect = sigCanvas.getBoundingClientRect()
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
    ctx.beginPath(); ctx.moveTo(x, y)
    setSigDrawing(true)
  }
  const sigMove = (e) => {
    if (!sigDrawing || !sigCanvas) return
    e.preventDefault()
    const ctx = sigCanvas.getContext('2d')
    const rect = sigCanvas.getBoundingClientRect()
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top
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

  const handleSign = () => {
    if (!hasSig || !sigCanvas) { showToast('','Sign Required','Please draw your signature'); return }
    const dataUrl = sigCanvas.toDataURL('image/png')
    saveContract(dataUrl)
  }

  const activeContracts = contracts.filter(c => c.status === 'active')
  const expiredContracts = contracts.filter(c => c.status !== 'active')

  const sections = selType === 'lease' ? LEASE_SECTIONS : selType === 'ic' ? IC_SECTIONS : []

  return (
    <div style={{ padding:20, maxWidth:1200, margin:'0 auto' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:16, fontWeight:700 }}>Driver Contracts</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>Lease agreements, IC agreements & compliance documents</div>
        </div>
        <button className="btn btn-primary" style={{ fontSize:12 }} onClick={() => setShowNew(true)}>
          <Ic icon={Plus} /> New Contract
        </button>
      </div>

      {/* Summary cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
        {[
          { label:'Active Contracts', val: activeContracts.length, color:'var(--success)' },
          { label:'Lease Agreements', val: contracts.filter(c=>c.contract_type==='lease' && c.status==='active').length, color:'var(--accent)' },
          { label:'IC Agreements', val: contracts.filter(c=>c.contract_type==='ic' && c.status==='active').length, color:'var(--accent3)' },
          { label:'Drivers Without Contract', val: Math.max(0, drivers.length - new Set(activeContracts.map(c=>c.driver_id)).size), color: drivers.length - new Set(activeContracts.map(c=>c.driver_id)).size > 0 ? 'var(--danger)' : 'var(--muted)' },
        ].map(s => (
          <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'14px 16px', textAlign:'center' }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color:s.color }}>{s.val}</div>
            <div style={{ fontSize:10, color:'var(--muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* New Contract Form */}
      {showNew && (
        <div style={{ background:'var(--surface)', border:'1px solid var(--accent)', borderRadius:12, padding:24, marginBottom:20 }}>
          <div style={{ fontSize:14, fontWeight:700, color:'var(--accent)', marginBottom:16 }}>Create New Contract</div>

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Driver</label>
              <select className="form-input" value={selDriver} onChange={e => setSelDriver(e.target.value)} style={{ width:'100%' }}>
                <option value="">Select driver...</option>
                {drivers.map(d => <option key={d.id} value={d.full_name}>{d.full_name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Contract Type</label>
              <select className="form-input" value={selType} onChange={e => setSelType(e.target.value)} style={{ width:'100%' }}>
                {CONTRACT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Pay Structure</label>
              <select className="form-input" value={payStructure} onChange={e => setPayStructure(e.target.value)} style={{ width:'100%' }}>
                <option value="percent">Percentage of Gross (%)</option>
                <option value="permile">Per Mile ($)</option>
                <option value="flat">Flat Rate per Load ($)</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Pay Rate</label>
              <input className="form-input" type="number" placeholder={payStructure === 'percent' ? 'e.g. 88' : payStructure === 'permile' ? 'e.g. 0.65' : 'e.g. 500'} value={payRate} onChange={e => setPayRate(e.target.value)} style={{ width:'100%' }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Start Date</label>
              <input className="form-input" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{ width:'100%' }} />
            </div>
            <div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>End Date (optional)</label>
              <input className="form-input" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{ width:'100%' }} />
            </div>
          </div>

          {/* Contract sections preview */}
          {sections.length > 0 && (
            <div style={{ background:'var(--surface2)', borderRadius:8, padding:16, marginBottom:16 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', marginBottom:8 }}>
                {selType === 'lease' ? 'FMCSA §376.12 REQUIRED SECTIONS' : 'IC AGREEMENT SECTIONS'}
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                {sections.map((s, i) => (
                  <div key={i} style={{ fontSize:11, color:'var(--text)', display:'flex', alignItems:'center', gap:6 }}>
                    <Check size={12} color="var(--success)" /> {s}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Custom upload for custom type */}
          {selType === 'custom' && (
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Upload Contract Document</label>
              <input type="file" accept=".pdf,.doc,.docx" onChange={uploadCustomContract} style={{ fontSize:12 }} />
              {uploading && <span style={{ fontSize:11, color:'var(--accent)' }}> Uploading...</span>}
              {customTerms && <div style={{ fontSize:11, color:'var(--success)', marginTop:4 }}>Document uploaded</div>}
            </div>
          )}

          {/* Amendment reason */}
          {amendingContract && (
            <div style={{ marginBottom:16, background:'rgba(240,165,0,0.06)', border:'1px solid var(--accent)', borderRadius:8, padding:14 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', marginBottom:6 }}>AMENDMENT TO CONTRACT #{amendingContract.id?.slice(0,8)}</div>
              <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Reason for Amendment</label>
              <input className="form-input" placeholder="e.g. Pay rate adjustment, new vehicle assigned..." value={amendReason} onChange={e => setAmendReason(e.target.value)} style={{ width:'100%' }} />
            </div>
          )}

          {/* Additional terms */}
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, fontWeight:600, color:'var(--muted)', display:'block', marginBottom:4 }}>Additional Terms / Notes</label>
            <textarea className="form-input" rows={3} placeholder="Any additional terms, special conditions, or notes..." value={selType === 'custom' ? '' : customTerms} onChange={e => setCustomTerms(e.target.value)} style={{ width:'100%', resize:'vertical' }} />
          </div>

          {/* Signature */}
          {!signing ? (
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" style={{ fontSize:12 }} onClick={() => setSigning(true)} disabled={!selDriver}>
                <Ic icon={PencilIcon} /> Sign & Create
              </button>
              <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => setShowNew(false)}>Cancel</button>
            </div>
          ) : (
            <div>
              <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', marginBottom:6 }}>Carrier Signature</div>
              <div style={{ position:'relative', marginBottom:8 }}>
                <canvas ref={initSigCanvas} width={500} height={100}
                  style={{ width:'100%', height:100, background:'var(--bg)', border:`2px solid ${hasSig ? 'var(--accent)' : 'var(--border)'}`, borderRadius:8, cursor:'crosshair', touchAction:'none' }}
                  onMouseDown={sigStart} onMouseMove={sigMove} onMouseUp={sigEnd} onMouseLeave={sigEnd}
                  onTouchStart={sigStart} onTouchMove={sigMove} onTouchEnd={sigEnd} />
                {!hasSig && <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', fontSize:12, color:'var(--muted)', pointerEvents:'none' }}>Draw your signature here</div>}
              </div>
              <div style={{ display:'flex', gap:8 }}>
                <button className="btn btn-primary" style={{ fontSize:12 }} onClick={handleSign} disabled={!hasSig}>
                  <Ic icon={Check} /> Create Contract
                </button>
                <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={sigClear}>Clear</button>
                <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => { setSigning(false); sigClear() }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Active Contracts */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'var(--muted)' }}>Loading contracts...</div>
      ) : contracts.length === 0 && !showNew ? (
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'40px 20px', textAlign:'center' }}>
          <FileText size={32} color="var(--muted)" style={{ marginBottom:12 }} />
          <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>No Contracts Yet</div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>Create lease agreements and IC contracts for your drivers</div>
          <button className="btn btn-primary" style={{ fontSize:12 }} onClick={() => setShowNew(true)}>
            <Ic icon={Plus} /> Create First Contract
          </button>
        </div>
      ) : (
        <>
          {activeContracts.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--accent)', marginBottom:8, letterSpacing:1 }}>ACTIVE CONTRACTS</div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {activeContracts.map(c => {
                  const typeLabel = CONTRACT_TYPES.find(t => t.id === c.contract_type)?.label || c.contract_type
                  const daysActive = Math.round((new Date() - new Date(c.start_date || c.created_at)) / 86400000)
                  const isExpiringSoon = c.end_date && ((new Date(c.end_date) - new Date()) / 86400000) < 30
                  return (
                    <div key={c.id} style={{ background:'var(--surface)', border:`1px solid ${isExpiringSoon ? 'var(--warning)' : 'var(--border)'}`, borderRadius:10, padding:'14px 18px', display:'flex', alignItems:'center', gap:16 }}>
                      <div style={{ width:40, height:40, borderRadius:10, background:'rgba(240,165,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <FileText size={18} color="var(--accent)" />
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:2 }}>
                          <span style={{ fontSize:13, fontWeight:700 }}>{c.driver_name}</span>
                          <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(34,197,94,0.12)', color:'var(--success)' }}>ACTIVE</span>
                          {isExpiringSoon && <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(245,158,11,0.12)', color:'var(--warning)' }}>EXPIRING SOON</span>}
                          {c.fully_executed && <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(34,197,94,0.12)', color:'var(--success)' }}>FULLY EXECUTED</span>}
                          {!c.fully_executed && c.sent_at && !c.driver_signature && <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(240,165,0,0.12)', color:'var(--accent)' }}>AWAITING DRIVER SIGNATURE</span>}
                          {!c.fully_executed && !c.sent_at && <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(128,128,128,0.12)', color:'var(--muted)' }}>NOT SENT</span>}
                          {c.amendment_number > 0 && <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(77,142,240,0.12)', color:'var(--accent3)' }}>AMENDMENT #{c.amendment_number}</span>}
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)' }}>
                          {typeLabel} · {c.pay_structure === 'percent' ? `${c.pay_rate}% of gross` : c.pay_structure === 'permile' ? `$${c.pay_rate}/mi` : `$${c.pay_rate}/load`} · {daysActive} days active
                        </div>
                        {c.vehicle_info && <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Vehicle: {c.vehicle_info} {c.vehicle_vin ? `· VIN: ${c.vehicle_vin}` : ''}</div>}
                      </div>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => setViewContract(viewContract === c.id ? null : c.id)}>
                          <Ic icon={Eye} /> View
                        </button>
                        <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => printContract(c, company?.company_name || company?.name)}>
                          <Ic icon={Printer} /> Print
                        </button>
                        {!c.fully_executed && (
                          <button className="btn btn-ghost" style={{ fontSize:10, color:'var(--accent)' }} onClick={() => sendToDriver(c.id)} disabled={sendingContract === c.id}>
                            <Ic icon={Send} /> {sendingContract === c.id ? 'Sending...' : c.sent_at ? 'Resend' : 'Send to Driver'}
                          </button>
                        )}
                        {c.fully_executed && (
                          <button className="btn btn-ghost" style={{ fontSize:10 }} onClick={() => printContract(c, company?.company_name || company?.name)}>
                            <Ic icon={Download} /> PDF
                          </button>
                        )}
                        <button className="btn btn-ghost" style={{ fontSize:10, color:'var(--accent3)' }} onClick={() => createAmendment(c)}>
                          <Ic icon={PencilIcon} /> Amend
                        </button>
                        <button className="btn btn-ghost" style={{ fontSize:10, color:'var(--danger)' }} onClick={() => { if (confirm('Terminate this contract?')) terminateContract(c.id) }}>
                          <Ic icon={XCircle} /> Terminate
                        </button>
                      </div>
                      {/* Expandable contract detail */}
                      {viewContract === c.id && (
                        <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:10, padding:18, marginTop:12, width:'100%' }}>
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
                            {[
                              { l:'Contract Type', v: typeLabel },
                              { l:'Driver', v: c.driver_name },
                              { l:'Pay Structure', v: c.pay_structure === 'percent' ? `${c.pay_rate}% of gross revenue` : c.pay_structure === 'permile' ? `$${c.pay_rate} per mile` : `$${c.pay_rate} per load` },
                              { l:'Company', v: c.company_name || '—' },
                              { l:'Start Date', v: c.start_date || '—' },
                              { l:'End Date', v: c.end_date || 'Open-ended' },
                              { l:'Vehicle', v: c.vehicle_info || '—' },
                              { l:'VIN', v: c.vehicle_vin || '—' },
                              { l:'Signed', v: c.signed_date ? new Date(c.signed_date).toLocaleDateString() : '—' },
                              { l:'Status', v: c.status?.toUpperCase() || 'ACTIVE' },
                            ].map(item => (
                              <div key={item.l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                                <span style={{ fontSize:11, color:'var(--muted)' }}>{item.l}</span>
                                <span style={{ fontSize:11, fontWeight:600 }}>{item.v}</span>
                              </div>
                            ))}
                          </div>
                          {/* Required sections */}
                          {(c.contract_type === 'lease' || c.contract_type === 'ic') && (
                            <div style={{ marginBottom:14 }}>
                              <div style={{ fontSize:10, fontWeight:700, color:'var(--accent)', marginBottom:6 }}>
                                {c.contract_type === 'lease' ? 'FMCSA §376.12 SECTIONS' : 'IC AGREEMENT SECTIONS'}
                              </div>
                              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:4 }}>
                                {(c.contract_type === 'lease' ? LEASE_SECTIONS : IC_SECTIONS).map((s, i) => (
                                  <div key={i} style={{ fontSize:10, color:'var(--text)', display:'flex', alignItems:'center', gap:4 }}>
                                    <Check size={10} color="var(--success)" /> {s}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {c.custom_terms && (
                            <div style={{ marginBottom:14 }}>
                              <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4 }}>ADDITIONAL TERMS</div>
                              <div style={{ fontSize:11, color:'var(--text)', background:'var(--bg)', padding:10, borderRadius:6, whiteSpace:'pre-wrap' }}>{c.custom_terms}</div>
                            </div>
                          )}
                          {/* Amendment info */}
                          {c.amendment_number > 0 && (
                            <div style={{ marginBottom:14, background:'rgba(77,142,240,0.06)', border:'1px solid var(--accent3)', borderRadius:8, padding:12 }}>
                              <div style={{ fontSize:10, fontWeight:700, color:'var(--accent3)', marginBottom:4 }}>AMENDMENT #{c.amendment_number}</div>
                              {c.amendment_reason && <div style={{ fontSize:11, color:'var(--text)' }}>Reason: {c.amendment_reason}</div>}
                              {c.parent_contract_id && <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>Original contract: {c.parent_contract_id.slice(0,8)}...</div>}
                            </div>
                          )}
                          {/* Signatures */}
                          <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
                            {c.carrier_signature && (
                              <div>
                                <div style={{ fontSize:10, fontWeight:700, color:'var(--muted)', marginBottom:4 }}>CARRIER SIGNATURE</div>
                                <img src={c.carrier_signature} alt="Carrier Signature" style={{ height:60, background:'var(--bg)', borderRadius:6, padding:4, border:'1px solid var(--border)' }} />
                                <div style={{ fontSize:9, color:'var(--muted)', marginTop:4 }}>Signed {c.signed_date ? new Date(c.signed_date).toLocaleString() : ''}</div>
                              </div>
                            )}
                            {c.driver_signature ? (
                              <div>
                                <div style={{ fontSize:10, fontWeight:700, color:'var(--success)', marginBottom:4 }}>DRIVER SIGNATURE</div>
                                <img src={c.driver_signature} alt="Driver Signature" style={{ height:60, background:'var(--bg)', borderRadius:6, padding:4, border:'1px solid var(--border)' }} />
                                <div style={{ fontSize:9, color:'var(--muted)', marginTop:4 }}>
                                  Signed {c.driver_signed_date ? new Date(c.driver_signed_date).toLocaleString() : ''}{c.driver_signed_ip ? ` · IP: ${c.driver_signed_ip}` : ''}
                                </div>
                              </div>
                            ) : (
                              <div>
                                <div style={{ fontSize:10, fontWeight:700, color:'var(--warning)', marginBottom:4 }}>DRIVER SIGNATURE</div>
                                <div style={{ fontSize:11, color:'var(--muted)', fontStyle:'italic' }}>
                                  {c.sent_at ? `Sent via ${c.sent_via || 'email'} on ${new Date(c.sent_at).toLocaleDateString()} — awaiting signature` : 'Not yet sent to driver'}
                                </div>
                              </div>
                            )}
                          </div>
                          {/* Send to driver inline controls */}
                          {!c.fully_executed && (
                            <div style={{ marginTop:14, display:'flex', alignItems:'center', gap:8, padding:12, background:'var(--bg)', borderRadius:8 }}>
                              <select className="form-input" style={{ width:120, fontSize:11 }} value={sendMethod} onChange={e => setSendMethod(e.target.value)}>
                                <option value="both">Email + SMS</option>
                                <option value="email">Email Only</option>
                                <option value="sms">SMS Only</option>
                              </select>
                              <button className="btn btn-primary" style={{ fontSize:11 }} onClick={() => sendToDriver(c.id)} disabled={sendingContract === c.id}>
                                <Ic icon={Send} /> {sendingContract === c.id ? 'Sending...' : 'Send Contract to Driver for Signing'}
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Expired / Terminated */}
          {expiredContracts.length > 0 && (
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'var(--muted)', marginBottom:8, letterSpacing:1 }}>TERMINATED / EXPIRED</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {expiredContracts.map(c => {
                  const typeLabel = CONTRACT_TYPES.find(t => t.id === c.contract_type)?.label || c.contract_type
                  return (
                    <div key={c.id} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'12px 18px', display:'flex', alignItems:'center', gap:16, opacity:0.6 }}>
                      <FileText size={16} color="var(--muted)" />
                      <div style={{ flex:1 }}>
                        <span style={{ fontSize:12, fontWeight:600 }}>{c.driver_name}</span>
                        <span style={{ fontSize:11, color:'var(--muted)', marginLeft:8 }}>{typeLabel} · Ended {c.end_date || '—'}</span>
                      </div>
                      <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:'rgba(217,85,85,0.12)', color:'var(--danger)' }}>TERMINATED</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
