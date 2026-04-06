import React, { useState, useRef } from 'react'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import {
  BarChart2, Wrench, FileText, Receipt, Zap, Check,
  Shield, Fuel, Route, Paperclip, Dumbbell, Download
} from 'lucide-react'
import { Ic } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'

// ─── EXPENSE TRACKER ───────────────────────────────────────────────────────────
const EXPENSE_CATS = ['Fuel', 'Maintenance', 'Tolls', 'Lumper', 'Insurance', 'Permits', 'Other']
const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY',
]
const CAT_COLORS = { Fuel:'var(--warning)', Maintenance:'var(--danger)', Tolls:'var(--accent2)', Lumper:'var(--accent3)', Insurance:'var(--accent)', Permits:'var(--success)', Other:'var(--muted)' }
const CAT_ICONS  = { Fuel: Fuel, Maintenance: Wrench, Tolls: Route, Lumper: Dumbbell, Insurance: Shield, Permits: FileText, Other: Paperclip }

export function ExpenseTracker() {
  const { showToast } = useApp()
  const { expenses, addExpense: ctxAddExpense } = useCarrier()
  const [showForm, setShowForm] = useState(false)
  const [filterCat, setFilterCat] = useState('All')
  const [newExp, setNewExp] = useState({ date:'', cat:'Fuel', amount:'', load:'', notes:'', driver:'', state:'', gallons:'', pricePerGal:'' })
  const [scanning, setScanning] = useState(false)
  const [scanDrag, setScanDrag] = useState(false)
  const [csvPreview, setCsvPreview] = useState(null)
  const csvFileRef = useRef(null)

  // ─── CSV Import ───
  const parseCsvLine = (line) => {
    const fields = []
    let cur = '', inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQuotes = !inQuotes; continue }
      if (ch === ',' && !inQuotes) { fields.push(cur.trim()); cur = ''; continue }
      cur += ch
    }
    fields.push(cur.trim())
    return fields
  }

  const mapCsvHeader = (h) => {
    const low = (h || '').trim().toLowerCase()
    if (['date'].includes(low)) return 'date'
    if (['amount','total'].includes(low)) return 'amount'
    if (['category','type','cat'].includes(low)) return 'cat'
    if (['description','notes','memo','note'].includes(low)) return 'notes'
    if (['driver'].includes(low)) return 'driver'
    if (['state'].includes(low)) return 'state'
    if (['gallons'].includes(low)) return 'gallons'
    return null
  }

  const matchCategory = (raw) => {
    if (!raw) return 'Other'
    const low = raw.toLowerCase()
    const match = EXPENSE_CATS.find(c => c.toLowerCase() === low)
    if (match) return match
    // partial match
    const partial = EXPENSE_CATS.find(c => low.includes(c.toLowerCase()) || c.toLowerCase().includes(low))
    return partial || 'Other'
  }

  const handleCsvFile = (file) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (lines.length < 2) { showToast('', 'CSV Error', 'File must have a header row and at least one data row'); return }
      const headers = parseCsvLine(lines[0])
      const mapping = headers.map(mapCsvHeader)
      if (!mapping.some(m => m === 'amount')) { showToast('', 'CSV Error', 'No "Amount" or "Total" column found in header'); return }
      const parsed = []
      for (let i = 1; i < lines.length; i++) {
        const vals = parseCsvLine(lines[i])
        if (vals.length === 0 || vals.every(v => !v)) continue
        const row = { date: '', cat: 'Other', amount: '', notes: '', driver: '', state: '', gallons: '' }
        mapping.forEach((field, idx) => {
          if (field && vals[idx]) row[field] = vals[idx]
        })
        if (row.cat) row.cat = matchCategory(row.cat)
        const amt = parseFloat(row.amount)
        if (isNaN(amt) || amt <= 0) continue
        row.amount = amt
        parsed.push(row)
      }
      if (parsed.length === 0) { showToast('', 'CSV Error', 'No valid expense rows found'); return }
      setCsvPreview(parsed)
    }
    reader.readAsText(file)
    if (csvFileRef.current) csvFileRef.current.value = ''
  }

  const importCsvExpenses = () => {
    if (!csvPreview || csvPreview.length === 0) return
    csvPreview.forEach(row => {
      const expData = { date: row.date, cat: row.cat, amount: row.amount, notes: row.notes || '' }
      if (row.driver) expData.driver = row.driver
      if (row.state) expData.state = row.state.toUpperCase().trim()
      if (row.gallons) expData.gallons = parseFloat(row.gallons)
      ctxAddExpense(expData)
    })
    const count = csvPreview.length
    setCsvPreview(null)
    showToast('', 'CSV Imported', `${count} expense${count !== 1 ? 's' : ''} added successfully`)
  }

  const filtered = filterCat === 'All' ? expenses : expenses.filter(e => e.cat === filterCat)
  const totalBycat = EXPENSE_CATS.map(c => ({ cat: c, total: expenses.filter(e => e.cat === c).reduce((s,e) => s+e.amount, 0) })).filter(x => x.total > 0)
  const grandTotal = expenses.reduce((s,e) => s+e.amount, 0)

  const addExpense = () => {
    if (!newExp.amount || !newExp.cat) return
    const expData = { ...newExp, amount: parseFloat(newExp.amount) }
    if (newExp.gallons) expData.gallons = parseFloat(newExp.gallons)
    if (newExp.pricePerGal) expData.price_per_gal = parseFloat(newExp.pricePerGal)
    if (newExp.state) expData.state = newExp.state.toUpperCase().trim()
    // Auto-link: if fuel expense has load, find matching truck/driver
    if (newExp.cat === 'Fuel' && newExp.load) {
      const matchedLoad = (ctx?.loads || []).find(l => (l.loadId || l.load_number || '') === newExp.load)
      if (matchedLoad && !newExp.driver) expData.driver = matchedLoad.driver || matchedLoad.driver_name || ''
      if (matchedLoad && !newExp.state) {
        // Auto-detect state from load origin/destination
        const loc = matchedLoad.origin || matchedLoad.destination || ''
        const stMatch = loc.match(/,\s*([A-Z]{2})$/i)
        if (stMatch) expData.state = stMatch[1].toUpperCase()
      }
    }
    ctxAddExpense(expData)
    setNewExp({ date:'', cat:'Fuel', amount:'', load:'', notes:'', driver:'', state:'', gallons:'', pricePerGal:'' })
    setShowForm(false)
    showToast('', 'Expense Added', `${newExp.cat} · $${newExp.amount}${expData.state ? ' · ' + expData.state : ''}${expData.gallons ? ' · ' + expData.gallons + ' gal' : ''}`)
  }

  const scanReceipt = async (file) => {
    if (!file) return
    setScanning(true)
    setShowForm(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await apiFetch('/api/parse-receipt', { method: 'POST', body: fd })
      const json = await res.json()
      if (!json.success) throw new Error(json.error)
      const d = json.data
      setNewExp(e => ({
        ...e,
        amount: d.amount || '',
        date: d.date || '',
        cat: d.category || 'Fuel',
        notes: d.notes || d.merchant || '',
        gallons: d.gallons || '',
        pricePerGal: d.price_per_gallon || '',
        state: d.state || '',
      }))
      const iftaInfo = d.gallons ? ` · ${d.gallons} gal` : ''
      const stateInfo = d.state ? ` · ${d.state}` : ''
      showToast('', 'Receipt Scanned', `${d.category || 'Expense'} · $${d.amount}${iftaInfo}${stateInfo} — review and confirm`)
    } catch (err) {
      showToast('', 'Scan Failed', err.message || 'Check server connection')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16, paddingBottom: 40 }}>
      {/* Header stats */}
      <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center', gridColumn: 'span 1' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>TOTAL MTD</div>
          <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--danger)' }}>${grandTotal.toLocaleString()}</div>
        </div>
        {totalBycat.slice(0,3).map(c => (
          <div key={c.cat} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{React.createElement(CAT_ICONS[c.cat] || Paperclip, {size:10})} {c.cat.toUpperCase()}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: CAT_COLORS[c.cat] }}>${c.total.toLocaleString()}</div>
          </div>
        ))}
      </div>

      {/* Category breakdown bar */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}><Ic icon={BarChart2} /> Expense Breakdown</div>
        <div style={{ display: 'flex', height: 10, borderRadius: 5, overflow: 'hidden', gap: 1, marginBottom: 12 }}>
          {totalBycat.map(c => (
            <div key={c.cat} style={{ flex: c.total, background: CAT_COLORS[c.cat], transition: 'flex 0.4s' }} title={c.cat + ': $' + c.total} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          {totalBycat.map(c => (
            <div key={c.cat} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: CAT_COLORS[c.cat] }} />
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>{c.cat} <b style={{ color: 'var(--text)' }}>${c.total.toLocaleString()}</b></span>
            </div>
          ))}
        </div>
      </div>

      {/* Expense Donut Chart */}
      {totalBycat.length > 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Expense Distribution</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={totalBycat.map(c => ({ name: c.cat, value: c.total }))} dataKey="value" cx="50%" cy="50%"
                  innerRadius={55} outerRadius={85} paddingAngle={2} strokeWidth={0} animationDuration={800}>
                  {totalBycat.map((c, i) => {
                    const PIE_COLORS = ['#f59e0b','#ef4444','#3b82f6','#8b5cf6','#22c55e','#06b6d4','#ec4899','#f97316','#6366f1','#14b8a6','#a855f7','#6b7280']
                    return <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  })}
                </Pie>
                <Tooltip contentStyle={{ background:'#1a1a2e', border:'1px solid rgba(240,165,0,0.3)', borderRadius:10, fontSize:12, fontFamily:"'DM Sans',sans-serif" }}
                  formatter={(v, name) => [`$${v.toLocaleString()}`, name]} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 12 }}>Top Categories</div>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={totalBycat.slice(0, 8).map(c => ({ name: c.cat, amount: c.total }))} layout="vertical"
                margin={{ top: 0, right: 10, bottom: 0, left: 60 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false}
                  tick={{ fontSize: 11, fill: '#ccc', fontFamily: "'DM Sans',sans-serif" }} width={60} />
                <Tooltip contentStyle={{ background:'#1a1a2e', border:'1px solid rgba(240,165,0,0.3)', borderRadius:10, fontSize:12, fontFamily:"'DM Sans',sans-serif" }}
                  formatter={(v) => [`$${v.toLocaleString()}`, 'Amount']} cursor={{ fill: 'rgba(240,165,0,0.05)' }} />
                <Bar dataKey="amount" fill="#f0a500" radius={[0, 4, 4, 0]} animationDuration={800} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Receipt Drop Zone */}
      {!showForm && (
        <div
          onDragOver={e => { e.preventDefault(); setScanDrag(true) }}
          onDragLeave={() => setScanDrag(false)}
          onDrop={e => { e.preventDefault(); setScanDrag(false); scanReceipt(e.dataTransfer.files[0]) }}
          onClick={() => document.getElementById('receipt-input').click()}
          style={{ border: `2px dashed ${scanDrag ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 12, padding: '20px', textAlign: 'center', cursor: 'pointer', background: scanDrag ? 'rgba(240,165,0,0.04)' : 'transparent', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'center' }}>
          <input id="receipt-input" type="file" accept="image/*,.pdf" style={{ display: 'none' }} onChange={e => scanReceipt(e.target.files[0])} />
          <span style={{ fontSize: 28 }}><Receipt size={28} /></span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>Drop a receipt to scan it</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>Photo, screenshot, or PDF · AI fills in amount, date & category</div>
          </div>
        </div>
      )}

      {scanning && (
        <div style={{ background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 12, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700 }}><Ic icon={Zap} /> Scanning receipt...</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>AI is reading the amount, merchant, and date</div>
        </div>
      )}

      {/* Filter + Add */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: 6, flex: 1, flexWrap: 'wrap' }}>
          {['All', ...EXPENSE_CATS].map(c => (
            <button key={c} onClick={() => setFilterCat(c)}
              style={{ padding: '5px 12px', borderRadius: 20, border: '1px solid', borderColor: filterCat===c ? 'var(--accent)' : 'var(--border)', background: filterCat===c ? 'var(--accent)' : 'transparent', color: filterCat===c ? '#000' : 'var(--muted)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
              {c === 'All' ? c : <>{React.createElement(CAT_ICONS[c] || Paperclip, {size:11})} {c}</>}
            </button>
          ))}
        </div>
        <input ref={csvFileRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleCsvFile(e.target.files[0])} />
        <button className="btn" style={{ fontSize: 12, background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontWeight: 700, padding: '6px 14px', borderRadius: 8 }} onClick={() => csvFileRef.current?.click()}><Ic icon={Download} /> Import CSV</button>
        <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={() => setShowForm(s => !s)}>{showForm ? '✕ Cancel' : '+ Add Expense'}</button>
      </div>

      {/* CSV Preview */}
      {csvPreview && (
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}><Ic icon={FileText} /> CSV Preview</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{csvPreview.length} expense{csvPreview.length !== 1 ? 's' : ''} found</div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn" style={{ fontSize: 11, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", fontWeight: 700, padding: '5px 12px', borderRadius: 8 }} onClick={() => setCsvPreview(null)}>Cancel</button>
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={importCsvExpenses}><Ic icon={Check} /> Import All ({csvPreview.length})</button>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 500 }}>
              <thead>
                <tr>
                  {['#','Date','Category','Amount','Notes','Driver','State'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: 'var(--muted)', fontWeight: 700, borderBottom: '1px solid var(--border)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {csvPreview.slice(0, 3).map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--muted)' }}>{i + 1}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{row.date || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: CAT_COLORS[row.cat] || 'var(--muted)' }}>{React.createElement(CAT_ICONS[row.cat] || Paperclip, {size:11})} {row.cat}</span></td>
                    <td style={{ padding: '8px 10px', fontSize: 12, fontWeight: 700 }}>${row.amount.toLocaleString()}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12, color: 'var(--muted)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.notes || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{row.driver || '—'}</td>
                    <td style={{ padding: '8px 10px', fontSize: 12 }}>{row.state || '—'}</td>
                  </tr>
                ))}
                {csvPreview.length > 3 && (
                  <tr><td colSpan={7} style={{ padding: '8px 10px', fontSize: 11, color: 'var(--muted)', textAlign: 'center', fontStyle: 'italic' }}>...and {csvPreview.length - 3} more expense{csvPreview.length - 3 !== 1 ? 's' : ''}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add form */}
      {showForm && (
        <div style={{ background: 'var(--surface)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 12, padding: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 10, marginBottom: 10 }}>
            {[
              { key:'date',   label:'Date',      type:'text', ph:'Mar 12' },
              { key:'amount', label:'Amount ($)', type:'number', ph:'250' },
              { key:'load',   label:'Load ID',   type:'text', ph:'FM-4421 (optional)' },
              { key:'driver', label:'Driver',    type:'text', ph:'Driver name (optional)' },
              { key:'notes',  label:'Notes',     type:'text', ph:'Description' },
            ].map(f => (
              <div key={f.key}>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>{f.label}</label>
                <input type={f.type} placeholder={f.ph} value={newExp[f.key]} onChange={e => setNewExp(x => ({ ...x, [f.key]: e.target.value }))}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 4 }}>Category</label>
              <select value={newExp.cat} onChange={e => setNewExp(x => ({ ...x, cat: e.target.value }))}
                style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
                {EXPENSE_CATS.map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            {newExp.cat === 'Fuel' && <>
              <div>
                <label style={{ fontSize: 11, color: 'var(--accent)', display: 'block', marginBottom: 4 }}>Gallons <span style={{ color:'var(--muted)' }}>(for IFTA)</span></label>
                <input type="number" placeholder="85.2" value={newExp.gallons} onChange={e => setNewExp(x => ({ ...x, gallons: e.target.value }))}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--accent)', display: 'block', marginBottom: 4 }}>$/Gallon <span style={{ color:'var(--muted)' }}>(you paid)</span></label>
                <input type="number" step="0.01" placeholder="3.45" value={newExp.pricePerGal} onChange={e => setNewExp(x => ({ ...x, pricePerGal: e.target.value }))}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }} />
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--accent)', display: 'block', marginBottom: 4 }}>State <span style={{ color:'var(--muted)' }}>(for IFTA)</span></label>
                <select value={newExp.state} onChange={e => setNewExp(x => ({ ...x, state: e.target.value }))}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid rgba(240,165,0,0.3)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", boxSizing: 'border-box' }}>
                  <option value="">Select state</option>
                  {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </>}
          </div>
          <button className="btn btn-primary" style={{ width: '100%', padding: '11px 0' }} onClick={addExpense}><Ic icon={Check} /> Add Expense</button>
        </div>
      )}

      {/* Table */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ overflowX:'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', minWidth:600 }}>
          <thead><tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
            {['Date','Category','Amount','Gal','State','Load','Driver','Notes'].map(h => (
              <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {filtered.map((e, i) => (
              <tr key={e.id} style={{ borderBottom: '1px solid var(--border)', background: i%2===0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)' }}>{e.date}</td>
                <td style={{ padding: '11px 14px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: (CAT_COLORS[e.cat]||'var(--muted)') + '15', color: CAT_COLORS[e.cat]||'var(--muted)' }}>{React.createElement(CAT_ICONS[e.cat] || Paperclip, {size:11})} {e.cat}</span>
                </td>
                <td style={{ padding: '11px 14px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--danger)' }}>−${e.amount.toLocaleString()}</td>
                <td style={{ padding: '11px 14px', fontSize: 12, color: e.gallons ? 'var(--accent)' : 'var(--muted)' }}>{e.gallons ? e.gallons + 'g' : '—'}</td>
                <td style={{ padding: '11px 14px', fontSize: 12, fontWeight: e.state ? 700 : 400, color: e.state ? 'var(--accent)' : 'var(--muted)' }}>{e.state || '—'}</td>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)', fontFamily: 'monospace' }}>{e.load || '—'}</td>
                <td style={{ padding: '11px 14px', fontSize: 12 }}>{e.driver || '—'}</td>
                <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)' }}>{e.notes}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
    </div>
  )
}
