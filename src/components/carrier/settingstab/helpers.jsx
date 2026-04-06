import React, { useState, useEffect, useRef, useCallback } from 'react'
import {
  Users, File, CreditCard, Truck, AlertTriangle, CheckCircle, ChevronLeft, Upload, Download, X, ArrowRight, Check, Info, Eye, Zap, Lock
} from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { supabase } from '../../../lib/supabase'
import { Ic } from '../shared'

// ── CSV Import Tool ───────��─────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  // Handle quoted fields
  const parseLine = (line) => {
    const fields = []
    let current = '', inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ''; continue }
      current += ch
    }
    fields.push(current.trim())
    return fields
  }
  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(l => {
    const vals = parseLine(l)
    const row = {}
    headers.forEach((h, i) => { row[h] = vals[i] || '' })
    return row
  }).filter(r => Object.values(r).some(v => v))
  return { headers, rows }
}

const IMPORT_TYPES = [
  { id: 'loads',    label: 'Loads',    icon: File,    desc: 'Load history — origin, destination, rate, broker, status',
    fields: [
      { key: 'origin',       label: 'Origin',       required: true },
      { key: 'destination',  label: 'Destination',  required: true },
      { key: 'gross_pay',    label: 'Gross Pay ($)', required: true, type: 'number' },
      { key: 'miles',        label: 'Miles',         type: 'number' },
      { key: 'broker',       label: 'Broker Name' },
      { key: 'driver_name',  label: 'Driver Name' },
      { key: 'equipment',    label: 'Equipment' },
      { key: 'pickup_date',  label: 'Pickup Date' },
      { key: 'delivery_date',label: 'Delivery Date' },
      { key: 'status',       label: 'Status' },
      { key: 'reference_number', label: 'Reference #' },
      { key: 'weight',       label: 'Weight' },
      { key: 'commodity',    label: 'Commodity' },
      { key: 'notes',        label: 'Notes' },
    ]
  },
  { id: 'drivers',  label: 'Drivers',  icon: Users,   desc: 'Driver roster — name, license, phone, medical card',
    fields: [
      { key: 'full_name',           label: 'Full Name',        required: true },
      { key: 'phone',               label: 'Phone' },
      { key: 'email',               label: 'Email' },
      { key: 'license_number',      label: 'License Number' },
      { key: 'license_state',       label: 'License State' },
      { key: 'license_expiry',      label: 'License Expiry' },
      { key: 'medical_card_expiry', label: 'Medical Card Expiry' },
      { key: 'status',              label: 'Status' },
      { key: 'hire_date',           label: 'Hire Date' },
      { key: 'notes',               label: 'Notes' },
    ]
  },
  { id: 'vehicles', label: 'Trucks',   icon: Truck,   desc: 'Fleet — unit number, VIN, year/make/model, plates',
    fields: [
      { key: 'unit_number',          label: 'Unit Number',      required: true },
      { key: 'type',                 label: 'Type (Truck/Trailer)' },
      { key: 'year',                 label: 'Year' },
      { key: 'make',                 label: 'Make' },
      { key: 'model',                label: 'Model' },
      { key: 'vin',                  label: 'VIN' },
      { key: 'license_plate',        label: 'License Plate' },
      { key: 'license_state',        label: 'License State' },
      { key: 'current_miles',        label: 'Current Miles', type: 'number' },
      { key: 'insurance_expiry',     label: 'Insurance Expiry' },
      { key: 'registration_expiry',  label: 'Registration Expiry' },
      { key: 'notes',                label: 'Notes' },
    ]
  },
  { id: 'expenses', label: 'Expenses', icon: CreditCard, desc: 'Expense history — fuel, tolls, repairs, maintenance',
    fields: [
      { key: 'date',         label: 'Date',     required: true },
      { key: 'category',     label: 'Category', required: true },
      { key: 'amount',       label: 'Amount ($)', required: true, type: 'number' },
      { key: 'merchant',     label: 'Merchant' },
      { key: 'driver_name',  label: 'Driver Name' },
      { key: 'load_number',  label: 'Load Number' },
      { key: 'notes',        label: 'Notes' },
    ]
  },
]

export function CSVImportTool() {
  const { showToast } = useApp()
  const { addLoad, addDriver, addVehicle, addExpense } = useCarrier()
  const fileRef = useRef(null)

  const [step, setStep] = useState('select') // select | upload | map | preview | importing | done
  const [importType, setImportType] = useState(null)
  const [csvData, setCsvData] = useState({ headers: [], rows: [] })
  const [mapping, setMapping] = useState({})   // qivoriField → csvHeader
  const [fileName, setFileName] = useState('')
  const [progress, setProgress] = useState({ done: 0, total: 0, errors: [] })

  const typeDef = IMPORT_TYPES.find(t => t.id === importType)

  const reset = () => {
    setStep('select')
    setImportType(null)
    setCsvData({ headers: [], rows: [] })
    setMapping({})
    setFileName('')
    setProgress({ done: 0, total: 0, errors: [] })
  }

  // Auto-map CSV headers to Qivori fields by fuzzy match
  const autoMap = useCallback((headers, fields) => {
    const m = {}
    const normalize = s => s.toLowerCase().replace(/[^a-z0-9]/g, '')
    const aliases = {
      origin: ['origin','pickup','from','pickupcity','origincity','shipper'],
      destination: ['destination','delivery','to','deliverycity','destinationcity','consignee','dropoff'],
      gross_pay: ['grosspay','gross','rate','totalrate','linehaulrate','linehaul','amount','pay','revenue'],
      miles: ['miles','distance','totalmiles','loadedmiles'],
      broker: ['broker','brokername','brokercompany','customer','shipper'],
      driver_name: ['driver','drivername','driverfullname','assigneddriver'],
      equipment: ['equipment','equipmenttype','trailertype','mode'],
      pickup_date: ['pickupdate','pickup','pickupdatetime','shipdate'],
      delivery_date: ['deliverydate','delivery','deliverydatetime','delvdate'],
      status: ['status','loadstatus'],
      reference_number: ['reference','ref','referencenumber','refnumber','refno','ponumber','po'],
      weight: ['weight','totalweight','lbs','pounds'],
      commodity: ['commodity','product','description','freight'],
      notes: ['notes','comments','instructions','specialinstructions'],
      full_name: ['fullname','name','drivername','driver','firstname','first'],
      phone: ['phone','phonenumber','mobile','cell','telephone'],
      email: ['email','emailaddress','driveremail'],
      license_number: ['licensenumber','license','cdlnumber','cdl','dlnumber'],
      license_state: ['licensestate','cdlstate','dlstate','state'],
      license_expiry: ['licenseexpiry','licenseexp','cdlexpiry','cdlexp'],
      medical_card_expiry: ['medicalcardexpiry','medicalcard','medexp','medicalexpiry','dotmedical'],
      hire_date: ['hiredate','datehired','startdate'],
      unit_number: ['unitnumber','unit','trucknumber','truckno','vehicleid','assetid'],
      type: ['type','vehicletype','assettype'],
      year: ['year','modelyear'],
      make: ['make','manufacturer'],
      model: ['model'],
      vin: ['vin','vehicleid','serialnumber'],
      license_plate: ['licenseplate','plate','platenumber','tag'],
      current_miles: ['currentmiles','odometer','mileage'],
      insurance_expiry: ['insuranceexpiry','insuranceexp'],
      registration_expiry: ['registrationexpiry','regexpiry','registrationexp'],
      date: ['date','expensedate','transactiondate'],
      category: ['category','type','expensetype','expensecategory'],
      amount: ['amount','total','cost','price'],
      merchant: ['merchant','vendor','store','location','payee'],
      load_number: ['loadnumber','load','loadid','loadref'],
    }
    fields.forEach(f => {
      const fAliases = aliases[f.key] || [normalize(f.key)]
      for (const h of headers) {
        const nh = normalize(h)
        if (fAliases.includes(nh) || nh === normalize(f.key) || nh === normalize(f.label)) {
          m[f.key] = h
          return
        }
      }
    })
    return m
  }, [])

  const handleFile = (file) => {
    if (!file) return
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target.result
      const parsed = parseCSV(text)
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        showToast('', 'Import Error', 'CSV file is empty or has no data rows')
        return
      }
      setCsvData(parsed)
      const autoMapped = autoMap(parsed.headers, typeDef.fields)
      setMapping(autoMapped)
      setStep('map')
    }
    reader.readAsText(file)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    const file = e.dataTransfer?.files?.[0]
    if (file && file.name.endsWith('.csv')) handleFile(file)
    else showToast('', 'Invalid File', 'Please drop a .csv file')
  }

  const requiredMapped = () => {
    if (!typeDef) return false
    return typeDef.fields.filter(f => f.required).every(f => mapping[f.key])
  }

  const doImport = async () => {
    setStep('importing')
    const rows = csvData.rows
    const total = rows.length
    setProgress({ done: 0, total, errors: [] })
    const errors = []
    let done = 0

    const addFn = { loads: addLoad, drivers: addDriver, vehicles: addVehicle, expenses: addExpense }[importType]

    for (let i = 0; i < rows.length; i++) {
      try {
        const row = rows[i]
        const mapped = {}
        typeDef.fields.forEach(f => {
          if (mapping[f.key]) {
            let val = row[mapping[f.key]]
            if (f.type === 'number' && val) val = parseFloat(val.replace(/[^0-9.\-]/g, '')) || 0
            mapped[f.key] = val
          }
        })
        // Set defaults
        if (importType === 'loads') {
          if (!mapped.status) mapped.status = 'Delivered'
          if (!mapped.equipment) mapped.equipment = 'Dry Van'
          if (mapped.gross_pay && mapped.miles && mapped.miles > 0) {
            mapped.rate_per_mile = (mapped.gross_pay / mapped.miles).toFixed(2)
          }
        }
        if (importType === 'drivers' && !mapped.status) mapped.status = 'Active'
        if (importType === 'vehicles') {
          if (!mapped.type) mapped.type = 'Truck'
          if (!mapped.status) mapped.status = 'Active'
        }
        await addFn(mapped)
        done++
      } catch (e) {
        errors.push({ row: i + 2, error: e?.message || 'Unknown error' })
        done++
      }
      if (i % 5 === 0 || i === rows.length - 1) {
        setProgress({ done, total, errors: [...errors] })
      }
    }
    setProgress({ done, total, errors })
    setStep('done')
    showToast('', 'Import Complete', `${done - errors.length} ${typeDef.label.toLowerCase()} imported successfully`)
  }

  const cardStyle = { background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }
  const headerStyle = { padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:8 }

  return (
    <>
      {/* Title */}
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4, display:'flex', alignItems:'center', gap:10 }}>
          {step !== 'select' && (
            <button onClick={reset} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:0 }}>
              <Ic icon={ChevronLeft} size={18} />
            </button>
          )}
          IMPORT DATA
        </div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>
          Migrate from another TMS — import loads, drivers, trucks, and expenses from a CSV file
        </div>
      </div>

      {/* Step 1: Select data type */}
      {step === 'select' && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {IMPORT_TYPES.map(t => (
            <div key={t.id} onClick={() => { setImportType(t.id); setStep('upload') }}
              style={{ ...cardStyle, cursor:'pointer', padding:'16px 20px', display:'flex', alignItems:'center', gap:16,
                transition:'all 0.15s', border:'1px solid var(--border)' }}
              onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
              onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}>
              <div style={{ width:40, height:40, borderRadius:10, background:'rgba(240,165,0,0.08)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <Ic icon={t.icon} size={18} color="var(--accent)" />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:700 }}>{t.label}</div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{t.desc}</div>
              </div>
              <Ic icon={ArrowRight} size={16} color="var(--muted)" />
            </div>
          ))}

          {/* Help box */}
          <div style={{ background:'rgba(240,165,0,0.04)', border:'1px solid rgba(240,165,0,0.15)', borderRadius:12, padding:'14px 18px', marginTop:8 }}>
            <div style={{ fontSize:12, fontWeight:700, marginBottom:6, display:'flex', alignItems:'center', gap:6 }}>
              <Ic icon={Info} size={14} color="var(--accent)" /> How to export from your current TMS
            </div>
            <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.7 }}>
              Most dispatch software (KeepTruckin, Truckstop, DAT, TruckingOffice, Axon) lets you export data as CSV.
              Look for "Export", "Reports", or "Download" in your current system. Save as .csv format and upload here.
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Upload CSV */}
      {step === 'upload' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={cardStyle}>
            <div style={headerStyle}>
              <Ic icon={typeDef?.icon || File} size={14} /> Import {typeDef?.label}
            </div>
            <div style={{ padding:20 }}>
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                style={{ border:'2px dashed var(--border)', borderRadius:12, padding:'40px 20px', textAlign:'center', cursor:'pointer',
                  transition:'all 0.15s', background:'var(--surface2)' }}
                onMouseOver={e => e.currentTarget.style.borderColor='var(--accent)'}
                onMouseOut={e => e.currentTarget.style.borderColor='var(--border)'}>
                <Ic icon={Upload} size={32} color="var(--accent)" />
                <div style={{ fontSize:14, fontWeight:700, marginTop:12 }}>Drop your CSV file here</div>
                <div style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>or click to browse</div>
                <input ref={fileRef} type="file" accept=".csv" style={{ display:'none' }}
                  onChange={e => handleFile(e.target.files?.[0])} />
              </div>

              {/* Expected fields */}
              <div style={{ marginTop:16 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', marginBottom:8 }}>EXPECTED COLUMNS</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:6 }}>
                  {typeDef?.fields.map(f => (
                    <span key={f.key} style={{ fontSize:10, padding:'3px 8px', borderRadius:6,
                      background: f.required ? 'rgba(240,165,0,0.1)' : 'var(--surface2)',
                      color: f.required ? 'var(--accent)' : 'var(--muted)',
                      border:`1px solid ${f.required ? 'rgba(240,165,0,0.2)' : 'var(--border)'}` }}>
                      {f.label}{f.required ? ' *' : ''}
                    </span>
                  ))}
                </div>
              </div>

              {/* Download template */}
              <button onClick={() => {
                const headers = typeDef.fields.map(f => f.label).join(',')
                const blob = new Blob([headers + '\n'], { type: 'text/csv' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url; a.download = `qivori-${importType}-template.csv`; a.click()
                URL.revokeObjectURL(url)
              }} style={{ marginTop:14, display:'flex', alignItems:'center', gap:6, background:'none', border:'1px solid var(--border)',
                borderRadius:8, padding:'8px 14px', color:'var(--accent)', fontSize:12, fontWeight:600, cursor:'pointer',
                fontFamily:"'DM Sans',sans-serif" }}>
                <Ic icon={Download} size={14} /> Download CSV Template
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Column Mapping */}
      {step === 'map' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={cardStyle}>
            <div style={headerStyle}>
              <Ic icon={File} size={14} /> {fileName}
              <span style={{ fontSize:11, color:'var(--muted)', fontWeight:500, marginLeft:'auto' }}>
                {csvData.rows.length} rows found
              </span>
            </div>
            <div style={{ padding:20 }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:4 }}>Map your columns to Qivori fields</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:16 }}>We auto-detected what we could. Adjust any that are wrong.</div>

              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {typeDef?.fields.map(f => (
                  <div key={f.key} style={{ display:'flex', alignItems:'center', gap:12 }}>
                    <div style={{ width:140, fontSize:12, fontWeight:600, flexShrink:0 }}>
                      {f.label}{f.required ? <span style={{ color:'var(--accent)' }}> *</span> : ''}
                    </div>
                    <Ic icon={ArrowRight} size={12} color="var(--muted)" />
                    <select value={mapping[f.key] || ''} onChange={e => setMapping(m => ({ ...m, [f.key]: e.target.value || undefined }))}
                      style={{ flex:1, background:'var(--surface2)', border:`1px solid ${mapping[f.key] ? 'var(--success)' : f.required && !mapping[f.key] ? 'var(--danger)' : 'var(--border)'}`,
                        borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:12, fontFamily:"'DM Sans',sans-serif",
                        outline:'none', appearance:'auto' }}>
                      <option value="">— skip —</option>
                      {csvData.headers.map(h => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                    {mapping[f.key] && <Ic icon={Check} size={14} color="var(--success)" />}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Preview */}
          <div style={cardStyle}>
            <div style={headerStyle}><Ic icon={Eye} size={14} /> Preview (first 3 rows)</div>
            <div style={{ overflowX:'auto', padding:0 }}>
              <table style={{ width:'100%', fontSize:11, borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'var(--surface2)' }}>
                    <th style={{ padding:'8px 12px', textAlign:'left', color:'var(--muted)', fontWeight:700, borderBottom:'1px solid var(--border)' }}>#</th>
                    {typeDef?.fields.filter(f => mapping[f.key]).map(f => (
                      <th key={f.key} style={{ padding:'8px 12px', textAlign:'left', color:'var(--accent)', fontWeight:700, borderBottom:'1px solid var(--border)', whiteSpace:'nowrap' }}>{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {csvData.rows.slice(0, 3).map((row, i) => (
                    <tr key={i}>
                      <td style={{ padding:'8px 12px', borderBottom:'1px solid var(--border)', color:'var(--muted)' }}>{i + 1}</td>
                      {typeDef?.fields.filter(f => mapping[f.key]).map(f => (
                        <td key={f.key} style={{ padding:'8px 12px', borderBottom:'1px solid var(--border)', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {row[mapping[f.key]] || '\u2014'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={reset}
              style={{ padding:'10px 20px', borderRadius:8, border:'1px solid var(--border)', background:'transparent',
                color:'var(--text)', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              Cancel
            </button>
            <button onClick={doImport} disabled={!requiredMapped()}
              style={{ padding:'10px 24px', borderRadius:8, border:'none',
                background: requiredMapped() ? 'var(--accent)' : 'var(--surface2)',
                color: requiredMapped() ? '#000' : 'var(--muted)',
                fontSize:13, fontWeight:700, cursor: requiredMapped() ? 'pointer' : 'not-allowed',
                fontFamily:"'DM Sans',sans-serif", display:'flex', alignItems:'center', gap:6 }}>
              <Ic icon={Upload} size={14} /> Import {csvData.rows.length} {typeDef?.label}
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Importing progress */}
      {step === 'importing' && (
        <div style={cardStyle}>
          <div style={{ padding:40, textAlign:'center' }}>
            <div style={{ width:48, height:48, border:'3px solid var(--accent)', borderTopColor:'transparent', borderRadius:'50%',
              margin:'0 auto 16px', animation:'spin 0.8s linear infinite' }} />
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Importing {typeDef?.label}...</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:16 }}>
              {progress.done} of {progress.total} processed
            </div>
            <div style={{ background:'var(--surface2)', borderRadius:8, height:8, overflow:'hidden', maxWidth:300, margin:'0 auto' }}>
              <div style={{ height:'100%', background:'var(--accent)', borderRadius:8, width:`${progress.total ? (progress.done / progress.total * 100) : 0}%`, transition:'width 0.3s' }} />
            </div>
          </div>
        </div>
      )}

      {/* Step 5: Done */}
      {step === 'done' && (
        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          <div style={cardStyle}>
            <div style={{ padding:40, textAlign:'center' }}>
              <div style={{ width:56, height:56, borderRadius:'50%', background:'rgba(34,197,94,0.1)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                <Ic icon={CheckCircle} size={28} color="var(--success)" />
              </div>
              <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Import Complete</div>
              <div style={{ fontSize:13, color:'var(--muted)' }}>
                <strong style={{ color:'var(--success)' }}>{progress.done - progress.errors.length}</strong> {typeDef?.label.toLowerCase()} imported successfully
                {progress.errors.length > 0 && (
                  <span> — <strong style={{ color:'var(--danger)' }}>{progress.errors.length}</strong> failed</span>
                )}
              </div>
            </div>
          </div>

          {/* Errors */}
          {progress.errors.length > 0 && (
            <div style={{ ...cardStyle, border:'1px solid var(--danger)' }}>
              <div style={{ ...headerStyle, color:'var(--danger)' }}>
                <Ic icon={AlertTriangle} size={14} /> {progress.errors.length} Rows Failed
              </div>
              <div style={{ padding:16, maxHeight:200, overflowY:'auto' }}>
                {progress.errors.slice(0, 20).map((e, i) => (
                  <div key={i} style={{ fontSize:11, color:'var(--muted)', padding:'4px 0', borderBottom:'1px solid var(--border)' }}>
                    <strong>Row {e.row}:</strong> {e.error}
                  </div>
                ))}
                {progress.errors.length > 20 && (
                  <div style={{ fontSize:11, color:'var(--muted)', padding:'8px 0' }}>
                    ...and {progress.errors.length - 20} more
                  </div>
                )}
              </div>
            </div>
          )}

          <div style={{ display:'flex', gap:10 }}>
            <button onClick={reset}
              style={{ padding:'10px 20px', borderRadius:8, border:'none', background:'var(--accent)', color:'#000',
                fontSize:13, fontWeight:700, cursor:'pointer', fontFamily:"'DM Sans',sans-serif" }}>
              Import More Data
            </button>
          </div>
        </div>
      )}
    </>
  )
}

// ── Dispatch Rules (AI thresholds + compliance enforcement) ────────────────────
export function DispatchSettings() {
  const { showToast } = useApp()
  const [s, setS] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const db = import('../../../lib/database')

  useEffect(() => {
    db.then(m => m.fetchCarrierSettings()).then(data => {
      setS(data || {
        min_profit: 800, min_rpm: 1.00, min_profit_per_day: 400, max_deadhead_miles: 150,
        max_deadhead_pct: 15, preferred_max_weight: 37000, auto_book_confidence: 75,
        auto_book_enabled: true, fuel_cost_per_mile: 0.55, enforce_compliance: true,
        hos_min_hours: 6, block_expired_cdl: true, block_expired_medical: true,
        block_active_defects: true, block_failed_drug_test: true, block_expired_insurance: true,
        default_payment_terms: 'NET 30', auto_invoice_on_delivery: true, home_time_days: 14,
      })
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [])

  const save = async () => {
    setSaving(true)
    try {
      const m = await db
      await m.upsertCarrierSettings(s)
      showToast('success', 'Saved', 'Dispatch rules updated — AI will use these thresholds')
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to save')
    }
    setSaving(false)
  }

  if (loading || !s) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>Loading dispatch settings...</div>

  const Field = ({ label, sub, value, onChange, type = 'number', suffix, min, max, step }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input type={type} value={value ?? ''} onChange={e => onChange(type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value)}
          min={min} max={max} step={step || 1}
          style={{ width: 90, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", textAlign: 'right' }} />
        {suffix && <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 30 }}>{suffix}</span>}
      </div>
    </div>
  )

  const Toggle = ({ label, sub, value, onChange }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div onClick={() => onChange(!value)}
        style={{ width: 44, height: 24, borderRadius: 12, background: value ? 'var(--accent)' : 'var(--border)', cursor: 'pointer', position: 'relative', transition: 'all 0.2s', flexShrink: 0 }}>
        <div style={{ position: 'absolute', top: 3, left: value ? 22 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'all 0.2s' }} />
      </div>
    </div>
  )

  return (
    <>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>AI Dispatch Rules</div>
      <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 20 }}>
        These thresholds control how Q evaluates loads. Every AI decision uses your rules.
      </div>

      {/* Profit thresholds */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1, marginBottom: 10, marginTop: 4 }}>PROFIT THRESHOLDS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <Field label="Minimum Profit" sub="Reject loads below this estimated profit" value={s.min_profit} onChange={v => setS(p => ({ ...p, min_profit: v }))} suffix="$" min={0} max={5000} />
        <Field label="Minimum RPM" sub="Revenue per mile floor" value={s.min_rpm} onChange={v => setS(p => ({ ...p, min_rpm: v }))} suffix="$/mi" min={0} max={10} step={0.05} />
        <Field label="Min Profit/Day" sub="Daily profit floor for multi-day loads" value={s.min_profit_per_day} onChange={v => setS(p => ({ ...p, min_profit_per_day: v }))} suffix="$/day" min={0} max={2000} />
        <Field label="Max Deadhead" sub="Maximum empty miles to pickup" value={s.max_deadhead_miles} onChange={v => setS(p => ({ ...p, max_deadhead_miles: v }))} suffix="mi" min={0} max={500} />
        <Field label="Preferred Max Weight" sub="Flag loads heavier than this" value={s.preferred_max_weight} onChange={v => setS(p => ({ ...p, preferred_max_weight: v }))} suffix="lbs" min={10000} max={80000} step={1000} />
        <Field label="Fuel Cost/Mile" sub="Used in profit calculation" value={s.fuel_cost_per_mile} onChange={v => setS(p => ({ ...p, fuel_cost_per_mile: v }))} suffix="$/mi" min={0} max={2} step={0.01} />
      </div>

      {/* Auto-book */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1, marginBottom: 10 }}>AUTO-BOOK</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <Toggle label="Auto-Book Enabled" sub="Let Q automatically book instant-book loads that pass all checks" value={s.auto_book_enabled} onChange={v => setS(p => ({ ...p, auto_book_enabled: v }))} />
        <Field label="Min Confidence" sub="Only auto-book when AI confidence exceeds this %" value={s.auto_book_confidence} onChange={v => setS(p => ({ ...p, auto_book_confidence: v }))} suffix="%" min={50} max={100} />
      </div>

      {/* Compliance enforcement */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger, #ef4444)', letterSpacing: 1, marginBottom: 10 }}>COMPLIANCE ENFORCEMENT</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
        <Toggle label="Enforce Compliance" sub="Block dispatch if driver/vehicle fails compliance checks" value={s.enforce_compliance} onChange={v => setS(p => ({ ...p, enforce_compliance: v }))} />
        <Toggle label="Block Expired CDL" sub="Prevent dispatching drivers with expired CDL" value={s.block_expired_cdl} onChange={v => setS(p => ({ ...p, block_expired_cdl: v }))} />
        <Toggle label="Block Expired Medical" sub="Prevent dispatching with expired medical card" value={s.block_expired_medical} onChange={v => setS(p => ({ ...p, block_expired_medical: v }))} />
        <Toggle label="Block Active DVIR Defects" sub="Prevent dispatching vehicles with unresolved defects" value={s.block_active_defects} onChange={v => setS(p => ({ ...p, block_active_defects: v }))} />
        <Toggle label="Block Failed Drug Test" sub="Prevent dispatching drivers with positive/refused results" value={s.block_failed_drug_test} onChange={v => setS(p => ({ ...p, block_failed_drug_test: v }))} />
        <Toggle label="Block Expired Insurance" sub="Prevent dispatching vehicles with expired insurance" value={s.block_expired_insurance} onChange={v => setS(p => ({ ...p, block_expired_insurance: v }))} />
        <Field label="Min HOS Hours" sub="Minimum drive hours required to dispatch" value={s.hos_min_hours} onChange={v => setS(p => ({ ...p, hos_min_hours: v }))} suffix="hrs" min={1} max={11} step={0.5} />
      </div>

      {/* Operations */}
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 1, marginBottom: 10 }}>OPERATIONS</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        <Toggle label="Auto-Invoice on Delivery" sub="Generate invoice automatically when load status changes to Delivered" value={s.auto_invoice_on_delivery} onChange={v => setS(p => ({ ...p, auto_invoice_on_delivery: v }))} />
        <Field label="Home Time Interval" sub="Days out before scheduling home time" value={s.home_time_days} onChange={v => setS(p => ({ ...p, home_time_days: v }))} suffix="days" min={7} max={30} />
      </div>

      <button className="btn btn-primary" disabled={saving} onClick={save}
        style={{ padding: '12px 32px', fontSize: 13, fontWeight: 700, opacity: saving ? 0.6 : 1 }}>
        {saving ? 'Saving...' : 'Save Dispatch Rules'}
      </button>
    </>
  )
}

// ── Change Password ───────────────────────────────────────────────────────────
export function ChangePassword() {
  const { showToast, user, demoMode } = useApp()
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [saving, setSaving] = useState(false)

  const inputStyle = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', width:'100%' }

  const handleSubmit = async () => {
    if (demoMode) { showToast('', 'Demo Mode', 'Password changes are disabled in demo mode'); return }
    if (!currentPw || !newPw || !confirmPw) { showToast('', 'Missing fields', 'Please fill in all password fields'); return }
    if (newPw.length < 8) { showToast('', 'Too short', 'New password must be at least 8 characters'); return }
    if (newPw !== confirmPw) { showToast('', 'Mismatch', 'New passwords do not match'); return }

    setSaving(true)
    try {
      // Re-authenticate with current password
      const { error: authError } = await supabase.auth.signInWithPassword({ email: user?.email, password: currentPw })
      if (authError) { showToast('', 'Incorrect password', 'Your current password is wrong'); setSaving(false); return }

      // Update password
      const { error: updateError } = await supabase.auth.updateUser({ password: newPw })
      if (updateError) { showToast('', 'Update failed', updateError.message); setSaving(false); return }

      showToast('', 'Password updated', 'Your password has been changed successfully')
      setCurrentPw(''); setNewPw(''); setConfirmPw('')
    } catch (err) {
      showToast('', 'Error', err.message || 'Something went wrong')
    } finally { setSaving(false) }
  }

  return (
    <>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>SECURITY</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Change your account password</div>
      </div>

      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Lock} size={14} /> Change Password</div>
        <div style={{ padding:20, display:'flex', flexDirection:'column', gap:14, maxWidth:420 }}>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <label style={{ fontSize:11, color:'var(--muted)' }}>Current Password</label>
            <input type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} placeholder="Enter current password" style={inputStyle} />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <label style={{ fontSize:11, color:'var(--muted)' }}>New Password</label>
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Min 8 characters" style={inputStyle} />
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <label style={{ fontSize:11, color:'var(--muted)' }}>Confirm New Password</label>
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Re-enter new password" style={inputStyle} />
          </div>
          <button onClick={handleSubmit} disabled={saving}
            style={{ alignSelf:'flex-start', marginTop:4, padding:'10px 28px', background:'var(--accent)', color:'#000', border:'none', borderRadius:8, fontWeight:700, fontSize:13, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1, fontFamily:"'DM Sans',sans-serif" }}>
            {saving ? 'Updating\u2026' : 'Update Password'}
          </button>
        </div>
      </div>
    </>
  )
}
