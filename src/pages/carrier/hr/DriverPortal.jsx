import { useState, useEffect } from 'react'
import { Ic, S, StatCard } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { User, Users, Award, Star, TrendingUp, DollarSign, Clock, Calendar, Activity, CheckCircle, Search, Send, Phone, Truck, Eye, FileText, Package, CreditCard, Shield, XCircle, Upload } from 'lucide-react'
import * as db from '../../../lib/database'
import { DQ_DOC_TYPES, DOC_STATUS_COLORS, getExpiryStatus } from './helpers'
import { CONTRACT_TYPES, LEASE_SECTIONS, IC_SECTIONS, LEASE_LEGAL_TEXT, IC_LEGAL_TEXT, payDescription as payDesc } from '../../../lib/contractLegalText'

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

export function DriverPortal() {
  const { showToast } = useApp()
  const { drivers, loads } = useCarrier()
  const [selectedDriver, setSelectedDriver] = useState(null)
  const [dqFiles, setDqFiles] = useState([])
  const [payroll, setPayroll] = useState([])

  useEffect(() => {
    if (!selectedDriver && drivers.length > 0) setSelectedDriver(drivers[0].id)
  }, [drivers, selectedDriver])

  useEffect(() => {
    if (!selectedDriver) return
    Promise.all([
      db.fetchDQFiles(selectedDriver),
      db.fetchPayroll(selectedDriver),
    ]).then(([files, pay]) => {
      setDqFiles(files)
      setPayroll(pay)
    })
  }, [selectedDriver])

  const driver = drivers.find(d => d.id === selectedDriver)
  if (!driver) return <div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>No drivers</div>

  const name = driver.full_name || driver.name || 'Unknown'
  const avatar = name.split(' ').map(w => w[0]).join('').slice(0,2)
  const driverLoads = loads.filter(l => l.driver === name || l.driver_name === name)
  const delivered = driverLoads.filter(l => l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid')
  const totalGross = delivered.reduce((s, l) => s + (l.gross || 0), 0)
  const totalMiles = delivered.reduce((s, l) => s + (l.miles || 0), 0)
  const ytdPay = payroll.reduce((s, p) => s + (Number(p.net_pay) || 0), 0)

  const requiredTypes = DQ_DOC_TYPES.filter(t => t.required)
  const uploadedTypes = new Set(dqFiles.map(f => f.doc_type))
  const completedRequired = requiredTypes.filter(t => uploadedTypes.has(t.id)).length
  const compliancePct = requiredTypes.length > 0 ? Math.round((completedRequired / requiredTypes.length) * 100) : 0

  // Pay model info
  const payModel = driver.pay_model || 'percent'
  const payRate = Number(driver.pay_rate) || 28
  const payModelText = payModel === 'percent' ? `${payRate}% of gross`
    : payModel === 'permile' ? `$${payRate.toFixed(2)}/mile`
    : payModel === 'flat' ? `$${payRate} flat/load` : `${payRate}%`

  // Avg per load
  const avgPerLoad = delivered.length > 0 ? Math.round(totalGross / delivered.length) : 0

  // Status color
  const statusColor = (driver.status || 'Active') === 'Active' ? 'var(--success)' : '#f59e0b'

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      {/* ── Driver Selector Panel ── */}
      <div style={{ width:220, flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--bg)', overflowY:'auto', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'16px 18px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:9, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:4 }}>DRIVER PORTAL</div>
          <div style={{ fontSize:11, color:'var(--muted)' }}>{drivers.length} driver{drivers.length !== 1 ? 's' : ''}</div>
        </div>
        {drivers.map(d => {
          const isSel = selectedDriver === d.id
          const n = d.full_name || d.name || '?'
          const initials = n.split(' ').map(w => w[0]).join('').slice(0,2)
          const dLoads = loads.filter(l => l.driver === n || l.driver_name === n)
          const dStatus = d.status || 'Active'
          return (
            <div key={d.id} onClick={() => setSelectedDriver(d.id)}
              style={{
                padding:'12px 14px', cursor:'pointer', display:'flex', alignItems:'center', gap:10,
                borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                background: isSel ? 'rgba(240,165,0,0.06)' : 'transparent',
                borderBottom:'1px solid var(--border)',
                transition:'all 0.15s ease',
              }}>
              <div style={{
                width:36, height:36, borderRadius:'50%', flexShrink:0,
                background: isSel ? 'var(--accent)' : 'var(--surface)',
                border: isSel ? 'none' : '1px solid var(--border)',
                color: isSel ? '#000' : 'var(--muted)',
                display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:12, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif",
              }}>{initials}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight: isSel ? 700 : 500, color: isSel ? 'var(--text)' : 'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{n}</div>
                <div style={{ display:'flex', alignItems:'center', gap:4, marginTop:2 }}>
                  <div style={{ width:5, height:5, borderRadius:'50%', background: dStatus === 'Active' ? 'var(--success)' : '#f59e0b' }} />
                  <span style={{ fontSize:9, color:'var(--muted)' }}>{dLoads.length} load{dLoads.length !== 1 ? 's' : ''}</span>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* ── Portal Content ── */}
      <div style={{ flex:1, overflowY:'auto', padding:'24px 28px', display:'flex', flexDirection:'column', gap:20 }}>

        {/* ── HEADER — Driver Profile Card ── */}
        <div style={{
          background:'linear-gradient(135deg, var(--surface) 0%, rgba(240,165,0,0.04) 100%)',
          border:'1px solid var(--border)', borderRadius:16, padding:'24px 28px',
          display:'flex', alignItems:'center', gap:20,
        }}>
          <div style={{
            width:72, height:72, borderRadius:'50%',
            background:'linear-gradient(135deg, var(--accent), #d4940a)',
            color:'#000', display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:26, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif",
            boxShadow:'0 4px 20px rgba(240,165,0,0.2)',
          }}>{avatar}</div>
          <div style={{ flex:1 }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, letterSpacing:1.5 }}>{name}</div>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:4 }}>
              <span style={{ fontSize:12, color:'var(--muted)' }}>CDL: <span style={{ color:'var(--text)', fontWeight:600 }}>{driver.license_number || driver.cdl_number || '—'}</span></span>
              <span style={{ width:1, height:12, background:'var(--border)' }} />
              <span style={{ fontSize:12, color:'var(--muted)' }}>Class: <span style={{ color:'var(--text)', fontWeight:600 }}>{driver.license_class || 'A'}</span></span>
              <span style={{ width:1, height:12, background:'var(--border)' }} />
              <span style={{ fontSize:12, color:'var(--muted)' }}>Pay: <span style={{ color:'var(--accent)', fontWeight:700 }}>{payModelText}</span></span>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:8 }}>
              <span style={{
                display:'inline-flex', alignItems:'center', gap:4, fontSize:10, fontWeight:700,
                padding:'3px 10px', borderRadius:20,
                background: statusColor === 'var(--success)' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                color: statusColor,
              }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:statusColor }} />
                {driver.status || 'Active'}
              </span>
              {driver.endorsements && (
                <span style={{ fontSize:10, color:'var(--muted)', padding:'3px 10px', background:'var(--surface2)', borderRadius:20 }}>
                  {driver.endorsements}
                </span>
              )}
              {driver.equipment_experience && (
                <span style={{ fontSize:10, color:'var(--muted)', padding:'3px 10px', background:'var(--surface2)', borderRadius:20 }}>
                  {driver.equipment_experience}
                </span>
              )}
            </div>
          </div>
          {/* Right side — quick contact */}
          <div style={{ display:'flex', flexDirection:'column', gap:6, alignItems:'flex-end' }}>
            {driver.phone && (
              <a href={`tel:${driver.phone}`} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--accent)', textDecoration:'none', fontWeight:600 }}>
                <Phone size={12} /> {driver.phone}
              </a>
            )}
            {driver.email && (
              <a href={`mailto:${driver.email}`} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'var(--muted)', textDecoration:'none' }}>
                <Send size={12} /> {driver.email}
              </a>
            )}
          </div>
        </div>

        {/* ── STATS ROW ── */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
          {[
            { label:'Loads Completed', value:String(delivered.length), icon:Package, color:'var(--accent)' },
            { label:'Total Miles', value:totalMiles.toLocaleString(), icon:Truck, color:'var(--text)' },
            { label:'Gross Earnings', value:`$${totalGross.toLocaleString()}`, icon:DollarSign, color:'var(--accent)' },
            { label:'Avg / Load', value:`$${avgPerLoad.toLocaleString()}`, icon:TrendingUp, color:'#8b5cf6' },
            { label:'YTD Net Pay', value:`$${ytdPay.toLocaleString(undefined,{maximumFractionDigits:0})}`, icon:CreditCard, color:'var(--success)' },
          ].map(k => (
            <div key={k.label} style={{
              background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14,
              padding:'16px 18px', position:'relative', overflow:'hidden',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                <div style={{ width:28, height:28, borderRadius:8, background:`${k.color}12`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Ic icon={k.icon} size={14} color={k.color} />
                </div>
                <span style={{ fontSize:9, fontWeight:700, color:'var(--muted)', letterSpacing:0.8, textTransform:'uppercase' }}>{k.label}</span>
              </div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:28, color:k.color, letterSpacing:0.5 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* ── TWO-COLUMN LAYOUT ── */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

          {/* Compliance status */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'20px', display:'flex', flexDirection:'column' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <div style={{ width:32, height:32, borderRadius:8, background: compliancePct === 100 ? 'rgba(34,197,94,0.1)' : 'rgba(240,165,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <Shield size={16} style={{ color: compliancePct === 100 ? 'var(--success)' : 'var(--accent)' }} />
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:700 }}>Compliance Status</div>
                  <div style={{ fontSize:10, color:'var(--muted)' }}>DQ file requirements</div>
                </div>
              </div>
              <div style={{
                fontSize:18, fontWeight:800, fontFamily:"'Bebas Neue',sans-serif",
                color: compliancePct === 100 ? 'var(--success)' : compliancePct >= 50 ? 'var(--accent)' : 'var(--danger)',
              }}>{compliancePct}%</div>
            </div>
            {/* Progress bar */}
            <div style={{ height:6, background:'var(--bg)', borderRadius:3, overflow:'hidden', marginBottom:14 }}>
              <div style={{
                height:'100%', borderRadius:3, transition:'width 0.5s ease',
                width:`${compliancePct}%`,
                background: compliancePct === 100 ? 'var(--success)' : compliancePct >= 50 ? 'var(--accent)' : 'var(--danger)',
              }} />
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, flex:1 }}>
              {[
                { label:'CDL License', ok: uploadedTypes.has('cdl') },
                { label:'Medical Card', ok: uploadedTypes.has('medical_card') },
                { label:'MVR Record', ok: uploadedTypes.has('mvr') },
                { label:'Drug Test', ok: uploadedTypes.has('drug_pre_employment') },
                { label:'Background', ok: uploadedTypes.has('background_check') },
                { label:'Road Test', ok: uploadedTypes.has('road_test') },
              ].map(c => (
                <div key={c.label} style={{
                  display:'flex', alignItems:'center', gap:8, padding:'8px 12px',
                  background: c.ok ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)',
                  border:`1px solid ${c.ok ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)'}`,
                  borderRadius:10,
                }}>
                  {c.ok ? <CheckCircle size={14} style={{ color:'var(--success)', flexShrink:0 }} /> : <XCircle size={14} style={{ color:'var(--danger)', flexShrink:0 }} />}
                  <span style={{ fontSize:11, fontWeight:600, color: c.ok ? 'var(--success)' : 'var(--danger)' }}>{c.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Documents on file */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden', display:'flex', flexDirection:'column' }}>
            <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:'rgba(139,92,246,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <FileText size={16} style={{ color:'#8b5cf6' }} />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:13, fontWeight:700 }}>Documents on File</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>{dqFiles.length} document{dqFiles.length !== 1 ? 's' : ''} uploaded</div>
              </div>
            </div>
            {dqFiles.length === 0 ? (
              <div style={{ padding:32, textAlign:'center', color:'var(--muted)', flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(240,165,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', marginBottom:12 }}>
                  <Upload size={20} style={{ color:'var(--accent)' }} />
                </div>
                <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:4 }}>No documents yet</div>
                <div style={{ fontSize:11 }}>Upload DQ files from the DQ Files tab</div>
              </div>
            ) : (
              <div style={{ flex:1, overflowY:'auto', maxHeight:280 }}>
                {dqFiles.map((f, i) => {
                  const type = DQ_DOC_TYPES.find(t => t.id === f.doc_type)
                  const status = DOC_STATUS_COLORS[getExpiryStatus(f.expiry_date)] || DOC_STATUS_COLORS.valid
                  return (
                    <div key={f.id} style={{
                      display:'flex', alignItems:'center', gap:12, padding:'10px 20px',
                      borderBottom: i < dqFiles.length - 1 ? '1px solid var(--border)' : 'none',
                    }}>
                      <div style={{ width:8, height:8, borderRadius:'50%', background:status.color, flexShrink:0 }} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{type?.label || f.doc_type}</div>
                        <div style={{ fontSize:10, color:'var(--muted)' }}>{f.file_name}</div>
                      </div>
                      <span style={{ fontSize:9, fontWeight:700, padding:'3px 10px', borderRadius:20, background:status.bg, color:status.color }}>{status.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── RECENT LOADS ── */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(240,165,0,0.1)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Package size={16} style={{ color:'var(--accent)' }} />
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, fontWeight:700 }}>Recent Loads</div>
              <div style={{ fontSize:10, color:'var(--muted)' }}>{driverLoads.length} total · {delivered.length} delivered</div>
            </div>
          </div>
          {driverLoads.length === 0 ? (
            <div style={{ padding:32, textAlign:'center', color:'var(--muted)' }}>
              <div style={{ width:48, height:48, borderRadius:'50%', background:'rgba(240,165,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
                <Package size={20} style={{ color:'var(--accent)' }} />
              </div>
              <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:4 }}>No loads assigned</div>
              <div style={{ fontSize:11 }}>Assign loads from the Dispatch tab</div>
            </div>
          ) : (
            <div style={{ maxHeight:300, overflowY:'auto' }}>
              {/* Table header */}
              <div style={{ display:'grid', gridTemplateColumns:'40px 1fr 1fr 100px 80px 100px', gap:8, padding:'8px 20px', borderBottom:'1px solid var(--border)', background:'var(--bg)' }}>
                {['', 'Load ID', 'Route', 'Status', 'Miles', 'Gross'].map(h => (
                  <span key={h} style={{ fontSize:9, fontWeight:700, color:'var(--muted)', letterSpacing:0.8, textTransform:'uppercase' }}>{h}</span>
                ))}
              </div>
              {driverLoads.slice(0,12).map((l, i) => {
                const st = l.status || ''
                const stColor = st === 'Delivered' || st === 'Paid' ? 'var(--success)' : st === 'In Transit' ? 'var(--accent)' : st === 'Invoiced' ? '#8b5cf6' : 'var(--muted)'
                return (
                  <div key={l.id || i} style={{
                    display:'grid', gridTemplateColumns:'40px 1fr 1fr 100px 80px 100px', gap:8,
                    padding:'10px 20px', alignItems:'center',
                    borderBottom: i < Math.min(driverLoads.length, 12) - 1 ? '1px solid var(--border)' : 'none',
                  }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:stColor }} />
                    <div style={{ fontSize:12, fontWeight:600, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{l.loadId || l.load_id || '—'}</div>
                    <div style={{ fontSize:12, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{(l.origin||'').split(',')[0]} → {(l.dest||l.destination||'').split(',')[0]}</div>
                    <span style={{ fontSize:10, fontWeight:700, color:stColor, padding:'2px 8px', background:`${stColor}12`, borderRadius:20, textAlign:'center', whiteSpace:'nowrap' }}>{st}</span>
                    <span style={{ fontSize:12, color:'var(--muted)' }}>{(l.miles || 0).toLocaleString()}</span>
                    <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:16, color:'var(--accent)' }}>${(l.gross || l.rate || 0).toLocaleString()}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
