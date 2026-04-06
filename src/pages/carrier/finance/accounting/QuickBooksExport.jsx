import React, { useState, useMemo, useEffect } from 'react'
import {
  FileText, TrendingDown, CheckCircle, Check,
  Download, Paperclip, Package, Layers, Eye
} from 'lucide-react'
import { Ic, S } from '../../shared'
import { useCarrier } from '../../../../context/CarrierContext'
import { acctParseDate } from '../helpers'

// ─── 5. QuickBooks Export ─────────────────────────────────────────────────────
export function QuickBooksExport() {
  const { loads, invoices, expenses, user } = useCarrier()
  const [connected, setConnected] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(false)
  const [exported, setExported] = useState({})

  // Check QB connection status on mount
  useEffect(() => {
    if (!user?.id) return
    fetch('/api/quickbooks-auth', {
      headers: { 'Authorization': `Bearer ${user.access_token || ''}` }
    }).then(r => r.json()).then(data => {
      if (data.connected) {
        setConnected(true)
        setCompanyName(data.company_name || '')
      }
    }).catch(() => {})
  }, [user?.id])

  const handleConnect = async () => {
    if (connected) {
      setLoading(true)
      try {
        await fetch('/api/quickbooks-auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.access_token || ''}` },
          body: JSON.stringify({ action: 'disconnect' })
        })
        setConnected(false)
        setCompanyName('')
      } catch {}
      setLoading(false)
    } else {
      setLoading(true)
      try {
        const res = await fetch(`/api/quickbooks-auth?action=authorize&user_id=${user.id}`)
        const data = await res.json()
        if (data.url) window.location.href = data.url
      } catch {}
      setLoading(false)
    }
  }

  const handleSync = async () => {
    setLoading(true)
    try {
      await fetch('/api/quickbooks-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.access_token || ''}` },
        body: JSON.stringify({ user_id: user.id })
      })
    } catch {}
    setLoading(false)
  }

  const QB_MAPPING = [
    { qivori:'Gross Revenue',  qb:'Income:Freight Revenue',           type:'Income'  },
    { qivori:'Fuel',           qb:'Expenses:Fuel & Mileage',          type:'Expense' },
    { qivori:'Maintenance',    qb:'Expenses:Repairs & Maintenance',   type:'Expense' },
    { qivori:'Tolls',          qb:'Expenses:Travel:Tolls',            type:'Expense' },
    { qivori:'Lumper',         qb:'Expenses:Lumper Fees',             type:'Expense' },
    { qivori:'Permits',        qb:'Expenses:Permits & Licenses',      type:'Expense' },
    { qivori:'Driver Pay',     qb:'Expenses:Contract Labor',          type:'Expense' },
    { qivori:'Factoring Fees', qb:'Expenses:Factoring Fees',          type:'Expense' },
  ]

  const csvRows = useMemo(() => {
    const rows = []
    invoices.forEach(inv => {
      rows.push({ date:inv.date, type:'Invoice', account:'Income:Freight Revenue',
        description:`${inv.id} - ${inv.broker} - ${inv.route}`, amount:inv.amount, cls:inv.driver||'', status:inv.status })
    })
    expenses.forEach(exp => {
      const acct = QB_MAPPING.find(m => exp.cat.includes(m.qivori))?.qb || 'Expenses:Miscellaneous'
      rows.push({ date:exp.date, type:'Expense', account:acct,
        description:`${exp.cat} - ${exp.merchant}`, amount:-exp.amount, cls:exp.driver||'', status:'Posted' })
    })
    return rows.sort((a,b) => (acctParseDate(b.date)||0) - (acctParseDate(a.date)||0))
  }, [invoices, expenses])

  const downloadCSV = (subset, name) => {
    const headers = ['Date','Type','Account','Description','Amount','Class/Driver','Status']
    const lines = [headers.join(','), ...subset.map(r =>
      [r.date, r.type, `"${r.account}"`, `"${r.description}"`, r.amount, `"${r.cls}"`, r.status].join(',')
    )]
    const blob = new Blob([lines.join('\n')], { type:'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href=url; a.download=`qivori-${name}.csv`; a.click()
    URL.revokeObjectURL(url)
    setExported(prev => ({ ...prev, [name]: true }))
  }

  const totalRevenue = invoices.reduce((s,i) => s+i.amount, 0)
  const totalExpAmt = expenses.reduce((s,e) => s+e.amount, 0)

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>QUICKBOOKS EXPORT</div>
        <div style={{ fontSize:12, color:'var(--muted)' }}>Export freight accounting data with proper QB account mapping</div>
      </div>

      {/* QB Connection Banner */}
      <div style={{ background: connected ? 'rgba(34,197,94,0.08)' : 'rgba(77,142,240,0.08)',
        border: `1px solid ${connected ? 'rgba(34,197,94,0.3)' : 'rgba(77,142,240,0.3)'}`, borderRadius:12, padding:'16px 20px',
        display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ fontSize:32 }}><CheckCircle size={32} /></div>
        <div style={{ flex:1 }}>
          <div style={{ fontWeight:700, marginBottom:4 }}>{connected ? `QuickBooks Online Connected${companyName ? ` — ${companyName}` : ''}` : 'QuickBooks Online Integration'}</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>
            {connected
              ? 'Auto-sync enabled — transactions push to QuickBooks automatically every night at 2 AM.'
              : 'Connect QuickBooks Online to sync invoices and expenses automatically, or use CSV export below.'}
          </div>
        </div>
        {connected && (
          <button onClick={handleSync} disabled={loading}
            style={{ padding:'10px 16px', fontSize:13, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
              background:'rgba(34,197,94,0.15)', color:'var(--success)', opacity: loading ? 0.5 : 1 }}>
            Sync Now
          </button>
        )}
        <button onClick={handleConnect} disabled={loading}
          style={{ padding:'10px 20px', fontSize:13, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
            background: connected ? 'rgba(239,68,68,0.15)' : 'var(--accent3)', color: connected ? 'var(--danger)' : '#fff', opacity: loading ? 0.5 : 1 }}>
          {loading ? '...' : connected ? 'Disconnect' : <><Paperclip size={13} /> Connect QuickBooks</>}
        </button>
      </div>

      {/* Export Cards */}
      <div style={S.grid(3)}>
        {[
          { name:'invoices', icon: FileText, title:'Invoices & Revenue', desc:`${invoices.length} transactions · $${totalRevenue.toLocaleString()} total`, rows:csvRows.filter(r=>r.type==='Invoice') },
          { name:'expenses', icon: TrendingDown, title:'Expenses & Costs',   desc:`${expenses.length} transactions · $${totalExpAmt.toLocaleString()} total`,  rows:csvRows.filter(r=>r.type==='Expense') },
          { name:'all',      icon: Package, title:'Full P&L Export',    desc:`${csvRows.length} total transactions`,                                        rows:csvRows },
        ].map(card => (
          <div key={card.name} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
            <div style={{ fontSize:28, marginBottom:10 }}>{typeof card.icon === "string" ? card.icon : <card.icon size={28} />}</div>
            <div style={{ fontWeight:700, marginBottom:4 }}>{card.title}</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>{card.desc}</div>
            <button onClick={() => downloadCSV(card.rows, card.name)}
              style={{ width:'100%', padding:'10px 0', fontSize:13, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                background: exported[card.name] ? 'rgba(34,197,94,0.15)' : 'var(--accent)',
                color: exported[card.name] ? 'var(--success)' : '#000' }}>
              {exported[card.name] ? <><Check size={11} /> Downloaded</> : <><Download size={13} /> Download CSV</>}
            </button>
          </div>
        ))}
      </div>

      {/* Account Mapping */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Layers} /> Account Mapping</div>
          <span style={{ fontSize:11, color:'var(--muted)' }}>Qivori category → QuickBooks account</span>
        </div>
        <table>
          <thead><tr>{['Qivori Category','QuickBooks Account','Type'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {QB_MAPPING.map(m => (
              <tr key={m.qivori}>
                <td style={{ fontWeight:600 }}>{m.qivori}</td>
                <td style={{ fontFamily:'monospace', fontSize:12, color:'var(--accent3)' }}>{m.qb}</td>
                <td>
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10,
                    background: m.type==='Income' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                    color: m.type==='Income' ? 'var(--success)' : 'var(--danger)' }}>{m.type}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Preview */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Eye} /> Export Preview</div>
          <span style={{ fontSize:11, color:'var(--muted)' }}>Last {Math.min(csvRows.length,8)} rows</span>
        </div>
        <table>
          <thead><tr>{['Date','Type','Account','Description','Amount','Status'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {csvRows.slice(0,8).map((r,i) => (
              <tr key={i}>
                <td style={{ fontSize:12 }}>{r.date}</td>
                <td><span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:10,
                  background: r.type==='Invoice'?'rgba(34,197,94,0.1)':'rgba(239,68,68,0.1)',
                  color: r.type==='Invoice'?'var(--success)':'var(--danger)' }}>{r.type}</span></td>
                <td style={{ fontSize:11, color:'var(--accent3)', fontFamily:'monospace' }}>{r.account}</td>
                <td style={{ fontSize:12 }}>{r.description}</td>
                <td style={{ fontWeight:700, color: r.amount>=0?'var(--success)':'var(--danger)' }}>
                  {r.amount>=0?'+':''}${Math.abs(r.amount).toLocaleString()}
                </td>
                <td><span style={{ fontSize:11, color: r.status==='Paid'?'var(--success)':r.status==='Unpaid'?'var(--warning)':'var(--muted)' }}>{r.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
