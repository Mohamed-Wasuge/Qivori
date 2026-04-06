import React, { useState } from 'react'
import {
  Clock, Zap, AlertTriangle, Check, DollarSign, Bot, Calendar,
  Settings, Download
} from 'lucide-react'
import { Ic, S, StatCard, AiBanner } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { generateInvoicePDF } from '../../../utils/generatePDF'
import { apiFetch } from '../../../lib/api'

// ─── FACTORING & CASHFLOW ──────────────────────────────────────────────────────
const INVOICES = []

const HISTORY = []

const CASHFLOW_WEEKS = []

const PRIORITY_COLORS = { HIGH:'var(--success)', MEDIUM:'var(--accent)', URGENT:'var(--danger)' }

export function FactoringCashflow() {
  const { showToast } = useApp()
  const { invoices: ctxInvoices, updateInvoiceStatus, company: carrierCompany, updateCompany } = useCarrier()
  const [selected, setSelected] = useState(new Set())
  const [tab, setTab] = useState('invoices')
  const [factoringRate, setFactoringRate] = useState(carrierCompany?.factoring_rate || 2.5)
  const [company, setCompany] = useState(carrierCompany?.factoring_company || '')
  const [factorEmail, setFactorEmail] = useState(carrierCompany?.factoring_email || '')
  const [history, setHistory] = useState(HISTORY)

  // Persist factoring settings to Supabase
  const saveFactoringSettings = (newCompany, newRate, newEmail) => {
    updateCompany({ factoring_company: newCompany, factoring_rate: newRate, factoring_email: newEmail })
    showToast('', 'Settings Saved', `${newCompany} @ ${newRate}% · ${newEmail || 'no email set'}`)
  }

  // Use real invoices from context — Unpaid = factorable, Factored/Paid = history
  const readyInvoices = ctxInvoices.filter(i => i.status === 'Unpaid').map(i => ({
    ...i, id: i.id, loadId: i.loadId, broker: i.broker, route: i.route,
    amount: i.amount, brokerScore: 90, paySpeed:'< 3 days', priority:'HIGH',
  }))
  const pendingInvoices = ctxInvoices.filter(i => i.status === 'Factored')

  const toggleSelect = (id) => setSelected(s => {
    const n = new Set(s)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })
  const toggleAll = () => setSelected(s => s.size === readyInvoices.length ? new Set() : new Set(readyInvoices.map(i => i.id)))

  const selectedInvoices = readyInvoices.filter(i => selected.has(i.id))
  const selectedTotal = selectedInvoices.reduce((s, i) => s + i.amount, 0)
  const selectedFee   = Math.round(selectedTotal * (factoringRate / 100) * 100) / 100
  const selectedNet   = selectedTotal - selectedFee

  const [factoring, setFactoring] = useState(false)
  const factorNow = async () => {
    if (selected.size === 0) return
    setFactoring(true)
    const today = new Date().toLocaleDateString('en-US', { month:'short', day:'numeric' })
    const tmrw  = new Date(Date.now() + 86400000).toLocaleDateString('en-US', { month:'short', day:'numeric' })
    let successCount = 0
    for (const inv of selectedInvoices) {
      try {
        const res = await apiFetch('/api/factor-invoice', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ invoiceId: inv._dbId || inv.id, factoringCompany: company || carrierCompany?.factoring_company || '', factoringRate })
        })
        const data = await res.json()
        if (data.success) successCount++
      } catch {}
      // Also update local status
      updateInvoiceStatus(inv.id, 'Factored')
    }
    const newHist = selectedInvoices.map(inv => ({
      id: inv.id, broker: inv.broker, amount: inv.amount,
      fee: Math.round(inv.amount * factoringRate / 100 * 100) / 100,
      net: Math.round(inv.amount * (1 - factoringRate / 100) * 100) / 100,
      factoredOn: today, received: tmrw, status: 'Pending',
    }))
    setHistory(h => [...newHist, ...h])
    setSelected(new Set())
    setFactoring(false)
    showToast('', 'Invoices Submitted', `${selected.size} invoice${selected.size > 1 ? 's' : ''} · $${selectedNet.toLocaleString()} net${successCount > 0 ? ` · ${successCount} emailed to factoring` : ''} · 24hr deposit`)
  }

  const totalAvailable = readyInvoices.reduce((s, i) => s + i.amount, 0)
  const totalPending   = pendingInvoices.reduce((s, i) => s + i.amount, 0)
  const feesThisMonth  = HISTORY.reduce((s, h) => s + h.fee, 0)
  const receivedMTD    = HISTORY.reduce((s, h) => s + h.net, 0)

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      {pendingInvoices.length > 0 && (() => {
        const oldest = pendingInvoices.reduce((a, b) => new Date(a.created_at || a.date) < new Date(b.created_at || b.date) ? a : b)
        const daysOld = Math.floor((Date.now() - new Date(oldest.created_at || oldest.date)) / 86400000)
        return daysOld > 7 ? <AiBanner
          title={`AI Cashflow Alert: ${oldest.invoice_number || oldest.id} is ${daysOld} days old — factor now to avoid cash gap`}
          sub={`Factoring today gets you ~$${Math.round(oldest.amount * 0.97).toLocaleString()} by tomorrow vs waiting for broker payment`}
          action="Factor It Now"
          onAction={() => { setSelected(new Set([oldest.id])); setTab('invoices') }}
        /> : null
      })()}

      {/* KPIs */}
      <div style={S.grid(4)}>
        <StatCard label="Available to Factor" value={'$' + totalAvailable.toLocaleString()} change={readyInvoices.length + ' invoices ready'} color="var(--accent)" changeType="neutral" />
        <StatCard label="Pending Deposit"     value={'$' + totalPending.toLocaleString()}   change="Submitted, awaiting deposit"             color="var(--warning)" changeType="neutral" />
        <StatCard label="Received MTD"        value={'$' + receivedMTD.toLocaleString()}     change="After factoring fees"                    color="var(--success)" changeType="neutral" />
        <StatCard label="Fees Paid MTD"       value={'$' + feesThisMonth.toFixed(0)}         change={'@ ' + factoringRate + '% flat rate'}    color="var(--danger)"  changeType="neutral" />
      </div>

      {/* Sub-nav */}
      <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--border)' }}>
        {[
          { id: 'invoices',  label: 'Factor Invoices' },
          { id: 'cashflow',  label: 'Cashflow Forecast' },
          { id: 'history',   label: 'History' },
          { id: 'settings',  label: 'Settings' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding: '9px 18px', border: 'none', borderBottom: tab === t.id ? '2px solid var(--accent)' : '2px solid transparent', background: 'transparent', color: tab === t.id ? 'var(--accent)' : 'var(--muted)', fontSize: 13, fontWeight: tab === t.id ? 700 : 500, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", marginBottom: -1 }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Factor Invoices tab ── */}
      {tab === 'invoices' && (
        <>
          {/* Selection summary */}
          {selected.size > 0 && (
            <div style={{ background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.25)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 20 }}>
              <div style={{ flex: 1, display: 'flex', gap: 24 }}>
                <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>SELECTED</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--accent)' }}>{selected.size} invoice{selected.size > 1 ? 's' : ''}</div></div>
                <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>GROSS</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--text)' }}>${selectedTotal.toLocaleString()}</div></div>
                <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>FEE ({factoringRate}%)</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--danger)' }}>−${selectedFee.toLocaleString()}</div></div>
                <div><div style={{ fontSize: 10, color: 'var(--muted)' }}>YOU RECEIVE</div><div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: 'var(--success)' }}>${selectedNet.toLocaleString()}</div></div>
              </div>
              <button className="btn btn-primary" style={{ padding: '12px 24px', fontSize: 14 }} onClick={factorNow}>
                <Zap size={13} /> Factor Now — 24hr Deposit
              </button>
            </div>
          )}

          {/* Invoice list */}
          <div style={S.panel}>
            <div style={S.panelHead}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="checkbox" checked={selected.size === readyInvoices.length} onChange={toggleAll}
                  style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer' }} />
                <div style={S.panelTitle}>Open Invoices — Ready to Factor</div>
              </div>
              <span style={S.badge('var(--accent)')}>{readyInvoices.length} available</span>
            </div>

            {readyInvoices.map(inv => {
              const isSel = selected.has(inv.id)
              const fee = Math.round(inv.amount * factoringRate / 100)
              const net = inv.amount - fee
              const priorityColor = PRIORITY_COLORS[inv.priority]
              const ageColor = inv.days > 7 ? 'var(--danger)' : inv.days > 3 ? 'var(--warning)' : 'var(--muted)'

              return (
                <div key={inv.id} onClick={() => toggleSelect(inv.id)}
                  style={{ padding: '16px 18px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: isSel ? 'rgba(240,165,0,0.04)' : 'transparent', borderLeft: `3px solid ${isSel ? 'var(--accent)' : 'transparent'}`, transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <input type="checkbox" checked={isSel} onChange={() => toggleSelect(inv.id)} onClick={e => e.stopPropagation()}
                    style={{ width: 16, height: 16, accentColor: 'var(--accent)', cursor: 'pointer', flexShrink: 0 }} />

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{inv.id}</span>
                      <span style={{ fontSize: 11, color: 'var(--muted)' }}>{inv.broker}</span>
                      <span style={{ ...S.tag(priorityColor), fontSize: 9 }}>{inv.priority} PRIORITY</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {inv.loadId} · {inv.route} · Broker score: <b style={{ color: inv.brokerScore >= 90 ? 'var(--success)' : inv.brokerScore >= 75 ? 'var(--warning)' : 'var(--danger)' }}>{inv.brokerScore}</b> · Pays {inv.paySpeed}
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap: 16, textAlign: 'right' }}>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>AGE</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: ageColor }}>{inv.days}d</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>FEE</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--danger)' }}>−${fee}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>YOU GET</div>
                      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--success)' }}>${net.toLocaleString()}</div>
                    </div>
                  </div>
                  <button onClick={e => { e.stopPropagation(); generateInvoicePDF({ id: inv.id, loadId: inv.loadId, broker: inv.broker, route: inv.route, amount: inv.amount, date: inv.date, dueDate: inv.dueDate, driver: inv.driver, status: inv.status }) }}
                    style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', fontSize: 10, color: 'var(--muted)', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: "'DM Sans',sans-serif" }}
                    title="Download Invoice PDF"><Ic icon={Download} /> PDF</button>
                </div>
              )
            })}

            {pendingInvoices.length > 0 && (
              <>
                <div style={{ padding: '10px 18px', background: 'var(--surface2)', borderTop: '1px solid var(--border)', fontSize: 10, fontWeight: 800, color: 'var(--muted)', letterSpacing: 2 }}>PENDING DEPOSIT</div>
                {pendingInvoices.map(inv => (
                  <div key={inv.id} style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 14, opacity: 0.6 }}>
                    <div style={{ width: 16, height: 16 }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{inv.id} <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 400 }}>— {inv.broker}</span></div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{inv.loadId} · {inv.route} · Submitted — awaiting deposit</div>
                    </div>
                    <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, color: 'var(--warning)' }}>${inv.amount.toLocaleString()}</div>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'rgba(245,158,11,0.1)', color: 'var(--warning)' }}>Pending</span>
                  </div>
                ))}
              </>
            )}
          </div>
        </>
      )}

      {/* ── Cashflow Forecast tab ── */}
      {tab === 'cashflow' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            {CASHFLOW_WEEKS.map((w, i) => (
              <div key={w.week} style={{ background: 'var(--surface)', border: `1px solid ${i === 0 ? 'rgba(240,165,0,0.3)' : 'var(--border)'}`, borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: i === 0 ? 'var(--accent)' : 'var(--muted)', marginBottom: 12 }}>{w.week}</div>
                {[
                  { label: 'Incoming', value: '$' + w.incoming.toLocaleString(), color: 'var(--success)' },
                  { label: 'Outgoing', value: '−$' + w.outgoing.toLocaleString(), color: 'var(--danger)' },
                  { label: 'Net',      value: '$' + w.net.toLocaleString(),       color: w.net > 500 ? 'var(--success)' : 'var(--warning)', bold: true },
                ].map(item => (
                  <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{item.label}</span>
                    <span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: item.bold ? 20 : 16, color: item.color }}>{item.value}</span>
                  </div>
                ))}
                {w.factored > 0 && (
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}><Ic icon={Zap} /> ${w.factored.toLocaleString()} factored</div>
                )}
                {w.net < 500 && (
                  <div style={{ marginTop: 8, fontSize: 10, color: 'var(--warning)', fontWeight: 700 }}><Ic icon={AlertTriangle} /> Tight week — consider factoring</div>
                )}
              </div>
            ))}
          </div>

          <div style={S.panel}>
            <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Bot} /> AI Cashflow Recommendations</div></div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(() => {
                const recs = []
                const topUnpaid = readyInvoices.sort((a,b) => b.amount - a.amount)[0]
                if (topUnpaid) {
                  const net = Math.round(topUnpaid.amount * (1 - factoringRate / 100))
                  recs.push({ icon: Zap, title: `Factor ${topUnpaid.id || topUnpaid.invoice_number} immediately`, desc: `${topUnpaid.broker || 'Broker'} owes $${topUnpaid.amount.toLocaleString()}. Factoring today gives you $${net.toLocaleString()} by tomorrow instead of waiting.`, action: 'Factor Now', color: 'var(--danger)' })
                }
                if (readyInvoices.length > 1) {
                  const second = readyInvoices.sort((a,b) => b.amount - a.amount)[1]
                  recs.push({ icon: Calendar, title: `Consider factoring ${second.id || second.invoice_number}`, desc: `$${second.amount.toLocaleString()} outstanding from ${second.broker || 'broker'}. Factor to smooth cashflow — you'd clear $${Math.round(second.amount * (1 - factoringRate / 100)).toLocaleString()}.`, action: 'View Invoice', color: 'var(--warning)' })
                }
                const smallInvoices = readyInvoices.filter(i => i.amount < 1000)
                if (smallInvoices.length > 0) {
                  const fee = Math.round(smallInvoices.reduce((s,i) => s + i.amount, 0) * factoringRate / 100)
                  recs.push({ icon: Check, title: `Skip factoring small invoices`, desc: `${smallInvoices.length} invoices under $1K — factoring fee would be $${fee}. Let brokers pay direct and save the fee.`, action: 'Got it', color: 'var(--success)' })
                }
                if (recs.length === 0) recs.push({ icon: Check, title: 'No unpaid invoices to factor', desc: 'All invoices are either paid or factored. Great cash position!', action: 'Got it', color: 'var(--success)' })
                return recs
              })().map(r => (
                <div key={r.title} style={{ display: 'flex', gap: 14, padding: '12px 14px', background: 'var(--surface2)', borderRadius: 10, borderLeft: `3px solid ${r.color}` }}>
                  <span style={{ fontSize: 20, flexShrink: 0 }}>{typeof r.icon === "string" ? r.icon : <r.icon size={20} />}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3 }}>{r.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.desc}</div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize: 11, alignSelf: 'center', flexShrink: 0 }}>{r.action}</button>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── History tab ── */}
      {tab === 'history' && (
        <div style={S.panel}>
          <div style={S.panelHead}>
            <div style={S.panelTitle}><Ic icon={Clock} /> Factoring History</div>
            <span style={S.badge('var(--success)')}>${receivedMTD.toLocaleString()} received MTD</span>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
              {['Invoice','Broker','Gross','Fee','Net Received','Factored On','Deposit','Status'].map(h => (
                <th key={h} style={{ padding: '10px 14px', fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'left', textTransform: 'uppercase', letterSpacing: 1 }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {history.map((h, i) => (
                <tr key={h.id + i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                  <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: 'var(--muted)' }}>{h.id}</td>
                  <td style={{ padding: '11px 14px', fontSize: 13, fontWeight: 600 }}>{h.broker}</td>
                  <td style={{ padding: '11px 14px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: 'var(--accent)' }}>${h.amount.toLocaleString()}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--danger)' }}>−${h.fee}</td>
                  <td style={{ padding: '11px 14px', fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: 'var(--success)' }}>${h.net.toLocaleString()}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)' }}>{h.factoredOn}</td>
                  <td style={{ padding: '11px 14px', fontSize: 12, color: 'var(--muted)' }}>{h.received}</td>
                  <td style={{ padding: '11px 14px' }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 8, background: h.status === 'Received' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)', color: h.status === 'Received' ? 'var(--success)' : 'var(--warning)' }}>{h.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Settings tab ── */}
      {tab === 'settings' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div style={S.panel}>
            <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Settings} /> Factoring Setup</div></div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Factoring Company</label>
                <select value={company} onChange={e => setCompany(e.target.value)}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif" }}>
                  <option value="">Select your factoring company...</option>
                  {['OTR Solutions', 'RTS Financial', 'Triumph Business Capital', 'Apex Capital', 'TAFS', 'TBS Factoring', 'Thunder Funding', 'WEX Capital', 'Riviera Finance', 'Fleet One Factoring', 'Instapay (Relay)', 'Express Freight Finance', 'Cass Commercial Bank', 'Interstate Capital', 'Compass Funding', 'Porter Freight Funding', 'FactorCloud', 'Bobtail', 'Denim', 'I don\'t use factoring', 'Other'].map(c => <option key={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Factoring Rate (%)</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="number" min={1} max={10} step={0.1} value={factoringRate}
                    onChange={e => setFactoringRate(parseFloat(e.target.value) || 2.5)}
                    style={{ width: 90, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--accent)', fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", textAlign: 'center' }} />
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>% flat fee per invoice</span>
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>Submission Email</label>
                <input type="email" value={factorEmail} placeholder="invoices@yourfactor.com"
                  onChange={e => setFactorEmail(e.target.value)}
                  style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, fontFamily: "'DM Sans',sans-serif", boxSizing:'border-box' }} />
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>The email your factoring company uses to receive invoice submissions</div>
              </div>
              <button className="btn btn-primary" style={{ padding: '10px 20px', fontSize: 13, marginTop: 4 }}
                onClick={() => saveFactoringSettings(company, factoringRate, factorEmail)}>
                <Ic icon={Check} size={13} /> Save Factoring Settings
              </button>
              {[
                { label: 'Advance Rate',      value: '97.5%', note: 'Percentage of invoice advanced upfront' },
                { label: 'Deposit Speed',     value: '24hr',  note: 'Business days after submission' },
                { label: 'Contract Type',     value: 'Non-recourse', note: 'We absorb the credit risk' },
                { label: 'Minimum Volume',    value: 'None',  note: 'No monthly minimums required' },
              ].map(item => (
                <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{item.label}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{item.note}</div>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent2)', alignSelf: 'center' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}
