import React, { useState, useMemo, useRef } from 'react'
import { Ic, S } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import { uploadFile } from '../../../lib/storage'
import {
  Users, Phone, Send, UserPlus, Activity, Zap, Target, AlertTriangle, Siren,
  Check, FileCheck, FileText, Edit3 as PencilIcon, Trash2, Upload, X
} from 'lucide-react'
import { qEvaluateDriver, qMatchScore, Q_STATUS_COLORS, getQEffIcons } from './helpers'

export function DriverProfiles() {
  const { showToast, isAdmin: isCompanyAdmin, companyRole } = useApp()
  const { drivers: dbDrivers, addDriver, editDriver, removeDriver, loads, activeLoads, expenses, fuelCostPerMile, updateLoadStatus, assignLoadToDriver } = useCarrier()
  const [showInviteUser, setShowInviteUser] = useState(false)
  const [invEmail, setInvEmail] = useState('')
  const [invSending, setInvSending] = useState(false)

  const handleInviteAsUser = async (driverId, driverName) => {
    if (!invEmail) { showToast('error', 'Error', 'Email is required'); return }
    setInvSending(true)
    try {
      const res = await apiFetch('/api/invite-driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: invEmail, role: 'driver', driver_id: driverId }),
      })
      const data = await res.json()
      if (data.success) {
        showToast('', 'Invite Sent', `${driverName} will receive a login invite at ${invEmail}`)
        setInvEmail('')
        setShowInviteUser(false)
      } else {
        showToast('error', 'Error', data.error || 'Failed to send invite')
      }
    } catch { showToast('error', 'Error', 'Failed to send invite') }
    setInvSending(false)
  }
  // Q evaluation for all drivers
  const qDriverResults = useMemo(() => {
    const map = {}
    dbDrivers.forEach(d => {
      map[d.id] = qEvaluateDriver(d, { loads, activeLoads, expenses, fuelCostPerMile, allDrivers: dbDrivers })
    })
    return map
  }, [dbDrivers, loads, activeLoads, expenses, fuelCostPerMile])

  // Available loads for Q matching
  const unassignedLoads = useMemo(() => loads.filter(l => !l.driver && ['Rate Con Received','Booked'].includes(l.status)), [loads])

  // Build load matches per driver
  const qLoadMatches = useMemo(() => {
    const map = {}
    dbDrivers.forEach(d => {
      const qd = qDriverResults[d.id]
      if (!qd || !qd.isIdle) { map[d.id] = []; return }
      const matches = unassignedLoads.map(l => ({
        load: l,
        ...qMatchScore(l, d, qd)
      })).sort((a,b) => b.score - a.score).slice(0, 3)
      map[d.id] = matches
    })
    return map
  }, [dbDrivers, qDriverResults, unassignedLoads])

  const driverList = dbDrivers.length ? dbDrivers.map(d => {
    const qr = qDriverResults[d.id]
    // Compute MTD stats from real loads
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const driverName = d.full_name || d.name || ''
    const mtdLoads = (loads || []).filter(l => l.driver === driverName && ['Delivered','Invoiced','Paid'].includes(l.status) && new Date(l.delivery_date || l.created_at || 0) >= startOfMonth)
    const mtdGross = mtdLoads.reduce((s,l) => s + (l.gross || 0), 0)
    const mtdMiles = mtdLoads.reduce((s,l) => s + (parseFloat(l.miles) || 0), 0)
    const payModel = d.pay_model || 'percent'
    const payRate = parseFloat(d.pay_rate) || 28
    const mtdPay = payModel === 'permile' ? Math.round(mtdMiles * payRate) : payModel === 'flat' ? Math.round(payRate * mtdLoads.length) : Math.round(mtdGross * (payRate / 100))

    return {
      id: d.id, name: d.full_name || '', photo_url: d.photo_url || null,
      avatar: (d.full_name || '').split(' ').map(w => w[0]).join('').slice(0,2),
      phone: d.phone || '', email: d.email || '',
      hired: d.hire_date ? new Date(d.hire_date).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }) : '',
      cdl: d.license_number || '', cdlClass: 'Class A', cdlExpiry: d.license_expiry ? new Date(d.license_expiry).toLocaleDateString('en-US', { month:'short', year:'numeric' }) : '',
      medCard: d.medical_card_expiry ? new Date(d.medical_card_expiry).toLocaleDateString('en-US', { month:'short', year:'numeric' }) : '',
      status: d.status || 'Active', hos: '—', unit: '',
      stats: { loadsMTD: mtdLoads.length, milesMTD: mtdMiles, grossMTD: mtdGross, payMTD: mtdPay, rating: qr ? parseFloat(qr.rpm) : 0 },
      endorsements: (d.notes || '').split(',').map(s => s.trim()).filter(Boolean),
      violations: [], payModel: payModel === 'permile' ? `$${payRate}/mi` : payModel === 'flat' ? `$${payRate}/load` : `${payRate}%`,
      qResult: qr,
    }
  }) : []
  const [selected, setSelected] = useState(driverList[0]?.id || 'james')
  const [showAdd, setShowAdd] = useState(false)
  const [showEdit, setShowEdit] = useState(false)
  const [editD, setEditD] = useState({ name:'', phone:'', email:'', license_number:'', license_state:'', license_expiry:'', medical_card_expiry:'', pay_model:'percent', pay_rate:'' })
  const [newD, setNewD] = useState({ name:'', phone:'', email:'', license_number:'', license_state:'', license_expiry:'', medical_card_expiry:'' })
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [photoFile, setPhotoFile] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [idDocFile, setIdDocFile] = useState(null)
  const [idDocPreview, setIdDocPreview] = useState(null)
  const [photoDragging, setPhotoDragging] = useState(false)
  const [idDragging, setIdDragging] = useState(false)
  const photoInputRef = useRef(null)
  const idInputRef = useRef(null)
  const d = driverList.find(x => x.id === selected) || driverList[0]

  const handlePhotoFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setPhotoFile(file)
    setPhotoPreview(URL.createObjectURL(file))
  }
  const handleIdDocFile = (file) => {
    if (!file || !file.type.startsWith('image/')) return
    setIdDocFile(file)
    setIdDocPreview(URL.createObjectURL(file))
  }
  const resetUploads = () => { setPhotoFile(null); setPhotoPreview(null); setIdDocFile(null); setIdDocPreview(null) }

  const handleEditDriver = async () => {
    if (!editD.name) { showToast('error', 'Error', 'Name is required'); return }
    setSaving(true)
    try {
      let photoUrl = null
      if (photoFile) {
        try { const r = await uploadFile(photoFile, 'driver-photos'); photoUrl = r.url } catch {}
      }
      if (idDocFile) {
        try { await uploadFile(idDocFile, 'driver-ids') } catch {}
      }
      await editDriver(selected, {
        full_name: editD.name, phone: editD.phone, email: editD.email,
        license_number: editD.license_number, license_state: editD.license_state,
        license_expiry: editD.license_expiry || null, medical_card_expiry: editD.medical_card_expiry || null,
        pay_model: editD.pay_model || 'percent',
        pay_rate: editD.pay_rate ? parseFloat(editD.pay_rate) : null,
        ...(photoUrl && { photo_url: photoUrl }),
      })
      showToast('success', 'Driver Updated', editD.name + ' updated successfully')
      resetUploads()
      setShowEdit(false)
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to update driver')
    }
    setSaving(false)
  }

  const handleDeleteDriver = async (id, name) => {
    try {
      await removeDriver(id)
      showToast('success', 'Driver Removed', name + ' has been removed')
      setConfirmDelete(null)
      if (selected === id) setSelected(driverList.find(x => x.id !== id)?.id || null)
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to remove driver')
    }
  }

  const openEditDriver = () => {
    if (!d) return
    const raw = dbDrivers.find(x => x.id === d.id)
    setEditD({
      name: raw?.full_name || d.name || '', phone: raw?.phone || d.phone || '',
      email: raw?.email || d.email || '', license_number: raw?.license_number || d.cdl || '',
      license_state: raw?.license_state || '', license_expiry: raw?.license_expiry || '',
      medical_card_expiry: raw?.medical_card_expiry || '',
      pay_model: raw?.pay_model || 'percent',
      pay_rate: raw?.pay_rate != null ? String(raw.pay_rate) : '',
    })
    setShowEdit(true)
  }

  const handleAddDriver = async () => {
    if (!newD.name) { showToast('error', 'Error', 'Name is required'); return }
    setSaving(true)
    try {
      await addDriver({
        full_name: newD.name,
        phone: newD.phone,
        email: newD.email,
        license_number: newD.license_number,
        license_state: newD.license_state,
        license_expiry: newD.license_expiry || null,
        medical_card_expiry: newD.medical_card_expiry || null,
        status: 'Active',
        hire_date: new Date().toISOString().split('T')[0],
      })
      showToast('success', 'Driver Added', newD.name + ' added successfully')
      setNewD({ name:'', phone:'', email:'', license_number:'', license_state:'', license_expiry:'', medical_card_expiry:'' })
      setShowAdd(false)
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to add driver')
    }
    setSaving(false)
  }

  const expiryColor = (expiry) => {
    if (!expiry) return 'var(--muted)'
    const months = (new Date(expiry) - new Date()) / (1000 * 60 * 60 * 24 * 30)
    if (isNaN(months)) return 'var(--muted)'
    return months < 3 ? 'var(--danger)' : months < 6 ? 'var(--warning)' : 'var(--success)'
  }
  const statusColor = { Active: 'var(--success)', Available: 'var(--accent2)', 'Off Duty': 'var(--muted)' }

  const addInp = { width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, boxSizing:'border-box', outline:'none' }

  return (
    <>
      {/* Add Driver Modal — rendered outside the overflow:hidden container */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setShowAdd(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:440, padding:24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Add New Driver</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>Enter driver details below</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { key:'name', label:'Full Name *', ph:'John Smith', span:true },
                { key:'phone', label:'Phone', ph:'(612) 555-0198' },
                { key:'email', label:'Email', ph:'driver@email.com' },
                { key:'license_number', label:'CDL Number', ph:'MN-12345678' },
                { key:'license_state', label:'License State', ph:'MN' },
                { key:'license_expiry', label:'CDL Expiry', ph:'', type:'date' },
                { key:'medical_card_expiry', label:'Medical Card Expiry', ph:'', type:'date' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                  <input type={f.type||'text'} value={newD[f.key]} onChange={e => setNewD(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={addInp} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:18 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }} onClick={handleAddDriver} disabled={saving || !newD.name}>
                {saving ? 'Saving...' : 'Add Driver'}
              </button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Driver Modal */}
      {showEdit && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setShowEdit(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:440, padding:24 }}
            onClick={e => e.stopPropagation()}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Edit Driver</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>Update driver details</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {[
                { key:'name', label:'Full Name *', ph:'John Smith' },
                { key:'phone', label:'Phone', ph:'(612) 555-0198' },
                { key:'email', label:'Email', ph:'driver@email.com' },
                { key:'license_number', label:'CDL Number', ph:'MN-12345678' },
                { key:'license_state', label:'License State', ph:'MN' },
                { key:'license_expiry', label:'CDL Expiry', ph:'', type:'date' },
                { key:'medical_card_expiry', label:'Medical Card Expiry', ph:'', type:'date' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                  <input type={f.type||'text'} value={editD[f.key]} onChange={e => setEditD(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.ph} style={addInp} />
                </div>
              ))}
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Pay Type</label>
                <select value={editD.pay_model} onChange={e => setEditD(p => ({ ...p, pay_model: e.target.value }))} style={addInp}>
                  <option value="percent">% of Load</option>
                  <option value="permile">Per Mile</option>
                  <option value="flat">Flat per Load</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>
                  {editD.pay_model === 'permile' ? 'Rate ($/mi)' : editD.pay_model === 'flat' ? 'Rate ($/load)' : 'Rate (%)'}
                </label>
                <input type="number" value={editD.pay_rate} onChange={e => setEditD(p => ({ ...p, pay_rate: e.target.value }))}
                  placeholder={editD.pay_model === 'percent' ? '28' : editD.pay_model === 'permile' ? '0.55' : '500'} style={addInp} />
              </div>
            </div>
            {/* Profile Photo — becomes avatar */}
            <div style={{ marginTop:4 }}>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:6 }}>Profile Photo <span style={{ color:'var(--accent3)' }}>(face photo — shown as avatar)</span></label>
              <input ref={photoInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => handlePhotoFile(e.target.files[0])} />
              {photoPreview ? (
                <div style={{ position:'relative', display:'inline-block' }}>
                  <img src={photoPreview} alt="Profile" style={{ width:72, height:72, borderRadius:'50%', objectFit:'cover', border:'2px solid var(--accent)' }} />
                  <button onClick={() => { setPhotoFile(null); setPhotoPreview(null) }}
                    style={{ position:'absolute', top:0, right:0, background:'rgba(0,0,0,0.6)', border:'none', borderRadius:'50%', width:20, height:20, cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <div onDragOver={e => { e.preventDefault(); setPhotoDragging(true) }} onDragLeave={() => setPhotoDragging(false)}
                  onDrop={e => { e.preventDefault(); setPhotoDragging(false); handlePhotoFile(e.dataTransfer.files[0]) }}
                  onClick={() => photoInputRef.current?.click()}
                  style={{ border:`2px dashed ${photoDragging ? 'var(--accent)' : 'var(--border)'}`, borderRadius:8, padding:'12px', textAlign:'center', cursor:'pointer', background: photoDragging ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.15s' }}>
                  <Upload size={16} style={{ color:'var(--muted)', marginBottom:4 }} />
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Drop face photo or <span style={{ color:'var(--accent)' }}>click to upload</span></div>
                </div>
              )}
            </div>
            {/* Government ID — compliance storage only */}
            <div style={{ marginTop:4 }}>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:6 }}>Government ID <span style={{ color:'var(--accent3)' }}>(stored for compliance — not shown as avatar)</span></label>
              <input ref={idInputRef} type="file" accept="image/*" style={{ display:'none' }} onChange={e => handleIdDocFile(e.target.files[0])} />
              {idDocPreview ? (
                <div style={{ position:'relative' }}>
                  <img src={idDocPreview} alt="ID" style={{ width:'100%', maxHeight:100, objectFit:'cover', borderRadius:8, border:'1px solid var(--border)' }} />
                  <button onClick={() => { setIdDocFile(null); setIdDocPreview(null) }}
                    style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,0.6)', border:'none', borderRadius:'50%', width:22, height:22, cursor:'pointer', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <X size={10} />
                  </button>
                </div>
              ) : (
                <div onDragOver={e => { e.preventDefault(); setIdDragging(true) }} onDragLeave={() => setIdDragging(false)}
                  onDrop={e => { e.preventDefault(); setIdDragging(false); handleIdDocFile(e.dataTransfer.files[0]) }}
                  onClick={() => idInputRef.current?.click()}
                  style={{ border:`2px dashed ${idDragging ? 'var(--accent)' : 'var(--border)'}`, borderRadius:8, padding:'12px', textAlign:'center', cursor:'pointer', background: idDragging ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.15s' }}>
                  <Upload size={16} style={{ color:'var(--muted)', marginBottom:4 }} />
                  <div style={{ fontSize:11, color:'var(--muted)' }}>Drop ID or <span style={{ color:'var(--accent)' }}>click to upload</span></div>
                </div>
              )}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:14 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }} onClick={handleEditDriver} disabled={saving || !editD.name}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => { setShowEdit(false); resetUploads() }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setConfirmDelete(null) }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:360, padding:24, textAlign:'center' }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:8, color:'var(--danger)' }}>Remove Driver?</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>This will permanently remove <b>{confirmDelete.name}</b>. This cannot be undone.</div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-danger" style={{ flex:1, padding:'11px 0' }} onClick={() => handleDeleteDriver(confirmDelete.id, confirmDelete.name)}>Remove</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setConfirmDelete(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

    <div style={{ display: 'flex', height: '100%', overflow: 'auto' }}>
      {/* Driver list — Q enhanced */}
      <div style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflowY: 'auto' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accent)', letterSpacing: 2 }}>DRIVERS ({driverList.length})</div>
          <button className="btn btn-primary" style={{ fontSize: 10, padding: '4px 10px' }} onClick={() => setShowAdd(true)}>+ Add</button>
        </div>

        {/* Q Status summary */}
        {driverList.length > 0 && (() => {
          const idle = driverList.filter(dr => dr.qResult?.isIdle).length
          const moving = driverList.filter(dr => dr.qResult?.status === 'MOVING').length
          const assigned = driverList.filter(dr => dr.qResult?.status === 'ASSIGNED').length
          return (
            <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:6, flexWrap:'wrap' }}>
              {[
                { label:'Idle', count:idle, color:'var(--muted)' },
                { label:'Moving', count:moving, color:'var(--success)' },
                { label:'Assigned', count:assigned, color:'var(--accent)' },
              ].filter(s => s.count > 0).map(s => (
                <span key={s.label} style={{ fontSize:8, fontWeight:700, padding:'2px 6px', borderRadius:4, background:s.color+'12', color:s.color, border:`1px solid ${s.color}25` }}>
                  {s.count} {s.label}
                </span>
              ))}
            </div>
          )
        })()}

        {driverList.map(dr => {
          const isSel = selected === dr.id
          const qr = dr.qResult
          const qStatus = qr ? Q_STATUS_COLORS[qr.status] || Q_STATUS_COLORS.IDLE : null
          const effIcon = qr ? getQEffIcons()[qr.efficiency] || Activity : Activity
          return (
            <div key={dr.id} onClick={() => setSelected(dr.id)}
              style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', borderLeft: `3px solid ${isSel ? 'var(--accent)' : 'transparent'}`, background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition: 'all 0.15s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ position:'relative', flexShrink:0 }}>
                  {dr.photo_url
                    ? <img src={dr.photo_url} alt={dr.name} style={{ width:34, height:34, borderRadius:'50%', objectFit:'cover', border:`2px solid ${isSel ? 'var(--accent)' : 'var(--border)'}` }} />
                    : <div style={{ width: 34, height: 34, borderRadius: '50%', background: isSel ? 'var(--accent)' : 'var(--surface2)', color: isSel ? '#000' : 'var(--muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800 }}>{dr?.avatar || '?'}</div>
                  }
                  {/* Live status dot */}
                  {qStatus && <div style={{ position:'absolute', bottom:-1, right:-1, width:9, height:9, borderRadius:'50%', background:qStatus.color, border:'2px solid var(--surface)', boxShadow: qr?.status==='MOVING' ? `0 0 6px ${qStatus.color}` : 'none' }} />}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: isSel ? 'var(--accent)' : 'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{dr.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, flexWrap:'wrap' }}>
                    {qStatus && (
                      <span style={{ fontSize:7, fontWeight:800, padding:'1px 5px', borderRadius:3, background:qStatus.bg, color:qStatus.color, letterSpacing:0.5 }}>{qStatus.label}</span>
                    )}
                    {qr && (
                      <span style={{ fontSize:7, fontWeight:700, padding:'1px 5px', borderRadius:3, background:qr.effColor+'12', color:qr.effColor }}>
                        {qr.efficiency}
                      </span>
                    )}
                    {qr?.isIdle && qr.idleHours > 12 && (
                      <span style={{ fontSize:7, fontWeight:700, color:'var(--warning)' }}>{qr.idleHours}h idle</span>
                    )}
                  </div>
                  {/* Mini stats */}
                  {qr && (
                    <div style={{ display:'flex', gap:6, marginTop:3, fontSize:8, color:'var(--muted)', fontFamily:"'JetBrains Mono',monospace" }}>
                      <span>{qr.loadCount}L</span>
                      <span>${qr.rpm}/mi</span>
                      {qr.profitPerDay > 0 && <span>${qr.profitPerDay}/d</span>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Profile detail */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!d ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:12, color:'var(--muted)' }}>
            <Users size={32} />
            <div style={{ fontSize:14, fontWeight:600 }}>No drivers yet</div>
            <div style={{ fontSize:12 }}>Add your first driver to get started</div>
            <button className="btn btn-primary" style={{ fontSize:12, marginTop:8 }} onClick={() => setShowAdd(true)}>+ Add Driver</button>
          </div>
        ) : <>
        {/* Header — Q enhanced */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ position:'relative' }}>
            {d.photo_url
              ? <img src={d.photo_url} alt={d.name} style={{ width:64, height:64, borderRadius:'50%', objectFit:'cover', border:'2px solid var(--accent)' }} />
              : <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--accent)', color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800 }}>{d?.avatar || '?'}</div>
            }
            {d.qResult && (() => {
              const qs = Q_STATUS_COLORS[d.qResult.status]
              return qs ? <div style={{ position:'absolute', bottom:0, right:0, width:14, height:14, borderRadius:'50%', background:qs.color, border:'3px solid var(--bg)', boxShadow: d.qResult.status==='MOVING' ? `0 0 8px ${qs.color}` : 'none' }} /> : null
            })()}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap:'wrap' }}>
              <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 1 }}>{d.name}</span>
              {d.qResult && (() => {
                const qs = Q_STATUS_COLORS[d.qResult.status]
                return qs ? <span style={{ fontSize:9, fontWeight:800, padding:'2px 8px', borderRadius:6, background:qs.bg, color:qs.color, letterSpacing:0.5 }}>{qs.label}</span> : null
              })()}
              {d.qResult && (
                <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:6, background:d.qResult.effColor+'12', color:d.qResult.effColor, display:'flex', alignItems:'center', gap:3 }}>
                  <Ic icon={getQEffIcons()[d.qResult.efficiency] || Activity} size={9} color={d.qResult.effColor} /> {d.qResult.efficiency}
                </span>
              )}
              {d.qResult && <span style={{ fontSize:9, fontWeight:600, color:'var(--muted)', padding:'2px 8px', borderRadius:6, background:'var(--surface2)' }}>{d.qResult.driverType}</span>}
            </div>
            <div style={{ fontSize: 12, color: 'var(--muted)' }}>{d.unit ? d.unit + ' · ' : ''}CDL {d.cdlClass} · Hired {d.hired}</div>
            <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
              <span style={{ fontSize: 12 }}><Ic icon={Phone} /> {d.phone}</span>
              <span style={{ fontSize: 12 }}><Ic icon={Send} /> {d.email}</span>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexShrink:0 }}>
            {(isCompanyAdmin || companyRole === 'owner') && (
              <button className="btn btn-ghost" style={{ fontSize: 12, color:'var(--accent)' }}
                onClick={() => { setInvEmail(d.email || ''); setShowInviteUser(d.id) }}>
                <Ic icon={UserPlus} /> Invite as User
              </button>
            )}
            <button className="btn btn-ghost" style={{ fontSize: 12 }} onClick={openEditDriver}><Ic icon={PencilIcon} /> Edit</button>
            <button className="btn btn-danger" style={{ fontSize: 12 }} onClick={() => setConfirmDelete({ id: d.id, name: d.name })}><Ic icon={Trash2} /> Remove</button>
          </div>
        </div>

        {/* ═══ Q DRIVER INSIGHT ═══════════════════════════════════════ */}
        {d.qResult && (
          <div style={{
            background:'linear-gradient(135deg, rgba(240,165,0,0.04), rgba(52,176,104,0.03))',
            border:'1px solid rgba(240,165,0,0.15)', borderRadius:10, padding:'12px 16px',
            position:'relative', overflow:'hidden'
          }}>
            <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg, transparent, var(--accent), var(--success), transparent)', opacity:0.3 }} />
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--accent)', animation:'q-driver-pulse 2s ease-in-out infinite' }} />
                <span style={{ fontSize:9, fontWeight:800, color:'var(--accent)', letterSpacing:1.5 }}>Q INSIGHT</span>
              </div>
              {d.qResult.isIdle && unassignedLoads.length > 0 && (
                <button className="btn btn-primary" style={{ fontSize:10, padding:'4px 12px' }}
                  onClick={() => {
                    const bestMatch = (qLoadMatches[d.id] || [])[0]
                    if (bestMatch) {
                      assignLoadToDriver(bestMatch.load.loadId || bestMatch.load.id, d.name)
                      showToast('', 'Q Auto-Assigned', `${bestMatch.load.loadId} → ${d.name} (score: ${bestMatch.score})`)
                    } else {
                      showToast('', 'No Match', 'No suitable loads available for this driver')
                    }
                  }}>
                  <Ic icon={Zap} size={10} /> Auto Assign Best Load
                </button>
              )}
            </div>
            <div style={{ fontSize:11, color:'var(--text)', lineHeight:1.5, marginBottom:8, fontWeight:600 }}>
              {d.qResult.insight}
            </div>

            {/* Q Alerts for this driver */}
            {d.qResult.alerts.length > 0 && (
              <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:8 }}>
                {d.qResult.alerts.map((a, i) => (
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 10px', borderRadius:6,
                    background: a.type === 'alert' ? 'rgba(239,68,68,0.06)' : 'rgba(240,165,0,0.06)',
                    border: `1px solid ${a.type === 'alert' ? 'rgba(239,68,68,0.15)' : 'rgba(240,165,0,0.15)'}` }}>
                    <Ic icon={a.type === 'alert' ? AlertTriangle : Siren} size={10} color={a.type === 'alert' ? 'var(--danger)' : 'var(--warning)'} />
                    <span style={{ fontSize:9, fontWeight:600, color: a.type === 'alert' ? 'var(--danger)' : 'var(--warning)' }}>{a.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Quick metrics */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:6 }}>
              {[
                { label:'PROFIT/LOAD', value:`$${d.qResult.profitPerLoad.toLocaleString()}`, color: d.qResult.profitPerLoad > 0 ? 'var(--success)' : 'var(--muted)' },
                { label:'PROFIT/DAY', value:`$${d.qResult.profitPerDay.toLocaleString()}`, color: d.qResult.profitPerDay >= 400 ? 'var(--success)' : 'var(--accent)' },
                { label:'ON-TIME', value:`${d.qResult.onTime}%`, color: d.qResult.onTime >= 90 ? 'var(--success)' : 'var(--accent)' },
                { label:'RPM', value:`$${d.qResult.rpm}`, color: parseFloat(d.qResult.rpm) >= 2.5 ? 'var(--success)' : 'var(--accent)' },
                { label:'IDLE TIME', value: d.qResult.isIdle ? `${d.qResult.idleHours}h` : 'On load', color: d.qResult.isIdle && d.qResult.idleHours > 12 ? 'var(--warning)' : 'var(--success)' },
              ].map(m => (
                <div key={m.label} style={{ background:'rgba(0,0,0,0.1)', borderRadius:6, padding:'5px 6px', textAlign:'center' }}>
                  <div style={{ fontSize:7, fontWeight:800, color:'var(--muted)', letterSpacing:0.8, marginBottom:2 }}>{m.label}</div>
                  <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:12, fontWeight:700, color:m.color }}>{m.value}</div>
                </div>
              ))}
            </div>

            {/* Preferred lanes */}
            {d.qResult.topLanes.length > 0 && (
              <div style={{ marginTop:8, display:'flex', gap:4, alignItems:'center', flexWrap:'wrap' }}>
                <span style={{ fontSize:8, fontWeight:700, color:'var(--muted)', letterSpacing:1 }}>TOP LANES:</span>
                {d.qResult.topLanes.map((tl, i) => (
                  <span key={i} style={{ fontSize:8, fontWeight:600, padding:'2px 6px', borderRadius:4, background:'rgba(77,142,240,0.08)', color:'var(--accent3)', border:'1px solid rgba(77,142,240,0.15)' }}>
                    {tl.lane} ({tl.count}x)
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═══ Q LOAD MATCH RECOMMENDATIONS ═══════════════════════════ */}
        {d.qResult?.isIdle && (qLoadMatches[d.id] || []).length > 0 && (
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, overflow:'hidden' }}>
            <div style={{ padding:'8px 14px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <Ic icon={Target} size={11} color="var(--accent)" />
                <span style={{ fontSize:10, fontWeight:800, letterSpacing:1.2 }}>Q LOAD MATCHES</span>
                <span style={{ fontSize:9, color:'var(--muted)' }}>{(qLoadMatches[d.id] || []).length} found</span>
              </div>
            </div>
            {(qLoadMatches[d.id] || []).map((match, i) => {
              const l = match.load
              const origin = (l.origin || '').split(',')[0] || '—'
              const dest = (l.dest || l.destination || '').split(',')[0] || '—'
              const gross = l.gross || l.gross_pay || 0
              return (
                <div key={l.loadId || l.id} style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10, cursor:'pointer', transition:'background 0.12s' }}
                  onMouseOver={e => e.currentTarget.style.background='var(--surface2)'}
                  onMouseOut={e => e.currentTarget.style.background='transparent'}>
                  <div style={{ width:28, height:28, borderRadius:7, background: i===0 ? 'rgba(52,176,104,0.1)' : 'var(--surface2)', border:`1px solid ${i===0 ? 'rgba(52,176,104,0.2)' : 'var(--border)'}`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ fontSize:10, fontWeight:800, color: i===0 ? 'var(--success)' : 'var(--muted)' }}>#{i+1}</span>
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:2 }}>
                      <span style={{ fontSize:11, fontWeight:700 }}>{origin} → {dest}</span>
                      <span style={{ fontSize:10, fontWeight:700, color:'var(--accent)', fontFamily:"'JetBrains Mono',monospace" }}>${gross.toLocaleString()}</span>
                    </div>
                    <div style={{ fontSize:9, color:'var(--muted)' }}>{match.reasons.slice(0,2).join(' · ')}</div>
                  </div>
                  <div style={{ textAlign:'right', flexShrink:0 }}>
                    <div style={{ fontFamily:"'JetBrains Mono',monospace", fontSize:13, fontWeight:700, color: match.score >= 70 ? 'var(--success)' : match.score >= 50 ? 'var(--accent)' : 'var(--muted)' }}>{match.score}</div>
                    <div style={{ fontSize:7, fontWeight:700, color:'var(--muted)', letterSpacing:0.5 }}>SCORE</div>
                  </div>
                  <button className="btn btn-primary" style={{ fontSize:9, padding:'4px 10px', flexShrink:0 }}
                    onClick={(e) => {
                      e.stopPropagation()
                      assignLoadToDriver(l.loadId || l.id, d.name)
                      showToast('', 'Load Assigned', `${l.loadId} → ${d.name}`)
                    }}>
                    Assign
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Stats — Q enhanced with real data */}
        <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap: 10 }}>
          {[
            { label: 'Loads MTD',  value: d.stats.loadsMTD,                    color: 'var(--accent)' },
            { label: 'Miles MTD',  value: d.stats.milesMTD.toLocaleString(),   color: 'var(--accent2)' },
            { label: 'Gross MTD',  value: '$' + d.stats.grossMTD.toLocaleString(), color: 'var(--accent)' },
            { label: 'Pay MTD',    value: '$' + d.stats.payMTD.toLocaleString(),   color: 'var(--success)' },
            { label: 'RPM',        value: d.qResult ? '$' + d.qResult.rpm : '$' + d.stats.rating, color: 'var(--warning)' },
            { label: 'Total Loads', value: d.qResult?.loadCount || 0,           color: 'var(--accent3)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 4, fontWeight:600, letterSpacing:0.5 }}>{s.label}</div>
              <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {/* License & Compliance */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}><Ic icon={FileCheck} /> License & Compliance</div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'CDL Number',     value: d.cdl || '—', color: d.cdl ? 'var(--text)' : 'var(--muted)' },
                { label: 'CDL Class',      value: d.cdlClass, color: 'var(--text)' },
                { label: 'CDL Expiry',     value: d.cdlExpiry || '—', color: expiryColor(d.cdlExpiry) },
                { label: 'Medical Card',   value: d.medCard || '—', color: expiryColor(d.medCard) },
                { label: 'HOS Remaining',  value: 'Via ELD sync', color: 'var(--muted)' },
                { label: 'Pay Model',      value: d.payModel, color: 'var(--accent2)' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{item.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: item.color }}>{item.value}</span>
                </div>
              ))}
              <div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>Endorsements</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {d.endorsements.map(e => <span key={e} style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: 'rgba(0,212,170,0.1)', color: 'var(--accent2)', border: '1px solid rgba(0,212,170,0.2)' }}>{e}</span>)}
                </div>
              </div>
            </div>
          </div>

          {/* Violations & Notes */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}><Ic icon={AlertTriangle} /> Violations & Safety</div>
            <div style={{ padding: 16 }}>
              {d.violations.length === 0
                ? <div style={{ textAlign: 'center', padding: '20px 0', color: 'var(--success)', fontSize: 13 }}><Ic icon={Check} /> Clean record — no violations</div>
                : d.violations.map((v, i) => (
                  <div key={i} style={{ padding: '10px 12px', background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>{v.type}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{v.date} · {v.points} CSA point{v.points !== 1 ? 's' : ''}</div>
                  </div>
                ))
              }
              <div style={{ marginTop: 16 }}>
                <button className="btn btn-ghost" style={{ width: '100%', fontSize: 12 }} onClick={() => {
                  const report = `Motor Vehicle Report Request\n${'='.repeat(40)}\nDriver: ${d.name}\nCDL #: ${d.cdl || '—'}\nState: ${d.state || '—'}\nDate Requested: ${new Date().toLocaleDateString()}\n\nPlease process this MVR request for the above driver.`
                  navigator.clipboard?.writeText(report)
                  showToast('', 'MVR Request Copied', `${d.name} — paste into your MVR provider portal`)
                }}><Ic icon={FileText} /> Request MVR Report</button>
              </div>
            </div>
          </div>
        </div>
      </>}
      </div>
    </div>

    {/* Invite as User Modal */}
    {showInviteUser && (
      <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
        onClick={e => { if (e.target===e.currentTarget) setShowInviteUser(false) }}>
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:420, padding:24 }}
          onClick={e => e.stopPropagation()}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
            <UserPlus size={18} color="var(--accent)" />
            <span style={{ fontSize:16, fontWeight:700 }}>Invite {d?.name || 'Driver'} as User</span>
          </div>
          <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>
            They'll get a login and see their assigned loads, expenses, and AI chat.
          </div>
          <div>
            <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Email Address *</label>
            <input type="email" value={invEmail} onChange={e => setInvEmail(e.target.value)}
              placeholder="driver@email.com"
              style={addInp} />
          </div>
          <div style={{ display:'flex', gap:10, marginTop:18 }}>
            <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }}
              onClick={() => handleInviteAsUser(showInviteUser, d?.name || 'Driver')}
              disabled={invSending || !invEmail}>
              {invSending ? 'Sending...' : 'Send Login Invite'}
            </button>
            <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }}
              onClick={() => setShowInviteUser(false)}>Cancel</button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
