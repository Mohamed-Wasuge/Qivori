import { useState, useRef, useEffect } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  DollarSign, FileText, Receipt, Plus, CheckCircle, Clock,
  Camera, X, ChevronDown, ArrowUpRight, Send
} from 'lucide-react'
import { Ic, haptic, fmt$ } from './shared'
import { apiFetch } from '../../lib/api'

const EXPENSE_CATEGORIES = ['Fuel', 'Tolls', 'Repairs', 'Insurance', 'Meals', 'Parking', 'Permits', 'Tires', 'DEF', 'Lumper', 'Scale', 'Other']

export default function MobileMoneyTab({ initialSubTab }) {
  const ctx = useCarrier() || {}
  const { showToast } = useApp()
  const invoices = ctx.invoices || []
  const expenses = ctx.expenses || []
  const addExpense = ctx.addExpense || (() => {})
  const updateInvoiceStatus = ctx.updateInvoiceStatus || (() => {})
  const totalRevenue = ctx.totalRevenue || 0
  const totalExpenses = ctx.totalExpenses || 0
  const unpaidInvoices = ctx.unpaidInvoices || []

  const [subTab, setSubTab] = useState(initialSubTab || 'invoices')
  useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab)
  }, [initialSubTab])
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [newExp, setNewExp] = useState({ amount: '', cat: 'Fuel', notes: '', date: new Date().toISOString().split('T')[0], gallons: '', pricePerGal: '', state: '' })
  const [scanning, setScanning] = useState(false)
  const receiptRef = useRef(null)

  const netProfit = totalRevenue - totalExpenses

  // Handle receipt scan
  const handleReceiptScan = async (file) => {
    if (!file) return
    setScanning(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiFetch('/api/parse-receipt', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success && data.data) {
        const d = data.data
        setNewExp(e => ({
          ...e,
          amount: d.amount || '',
          date: d.date || e.date,
          cat: d.category || 'Fuel',
          notes: d.notes || d.merchant || '',
          gallons: d.gallons || '',
          pricePerGal: d.price_per_gallon || '',
          state: d.state || '',
        }))
        setShowAddExpense(true)
        haptic('success')
        showToast?.('success', 'Receipt Scanned', `${d.category || 'Expense'} — ${fmt$(d.amount)}`)
      } else {
        showToast?.('error', 'Scan Failed', data.error || 'Could not read receipt')
      }
    } catch (err) {
      showToast?.('error', 'Error', err.message)
    } finally {
      setScanning(false)
    }
  }

  // Save expense
  const saveExpense = async () => {
    if (!newExp.amount) { showToast?.('error', 'Error', 'Enter an amount'); return }
    const exp = {
      category: newExp.cat,
      amount: parseFloat(newExp.amount) || 0,
      date: newExp.date,
      notes: newExp.notes,
      merchant: newExp.notes,
      gallons: newExp.gallons ? parseFloat(newExp.gallons) : null,
      price_per_gallon: newExp.pricePerGal ? parseFloat(newExp.pricePerGal) : null,
      state: newExp.state || null,
    }
    await addExpense(exp)
    haptic('success')
    showToast?.('success', 'Expense Added', `${newExp.cat} — ${fmt$(newExp.amount)}`)
    setNewExp({ amount: '', cat: 'Fuel', notes: '', date: new Date().toISOString().split('T')[0], gallons: '', pricePerGal: '', state: '' })
    setShowAddExpense(false)
  }

  // Mark invoice paid
  const markPaid = (inv) => {
    haptic('success')
    updateInvoiceStatus(inv.id || inv.invoice_number || inv._dbId, 'Paid')
    showToast?.('success', 'Invoice Paid', inv.invoice_number || inv.id)
  }

  const sendInvoice = async (inv) => {
    const email = inv.broker_email || inv.email
    if (!email) {
      showToast?.('error', 'No Email', 'No broker email on file for this invoice')
      return
    }
    haptic()
    try {
      const res = await apiFetch('/api/send-invoice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          invoiceNumber: inv.invoice_number || inv.id,
          loadNumber: inv.load_number || inv.loadId || '',
          route: inv.route || '',
          amount: inv.amount || 0,
          dueDate: inv.due_date || 'Net 30',
          brokerName: inv.broker || '',
        }),
      })
      if (res.ok) {
        haptic('success')
        showToast?.('success', 'Invoice Sent', `Sent to ${email}`)
        updateInvoiceStatus(inv.id || inv.invoice_number || inv._dbId, 'Sent')
      } else {
        showToast?.('error', 'Send Failed', 'Could not send invoice')
      }
    } catch (err) {
      showToast?.('error', 'Error', err.message)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Summary bar */}
      <div style={{ flexShrink: 0, padding: '12px 16px', display: 'flex', gap: 10 }}>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>Revenue</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(totalRevenue)}</div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>Expenses</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--danger)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(totalExpenses)}</div>
        </div>
        <div style={{ flex: 1, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>Net Profit</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(netProfit)}</div>
        </div>
      </div>

      {/* Sub-tab switcher */}
      <div style={{ flexShrink: 0, padding: '0 16px 8px', display: 'flex', gap: 8 }}>
        {['invoices', 'expenses'].map(t => (
          <button key={t} onClick={() => { haptic(); setSubTab(t) }}
            style={{ flex: 1, padding: '8px', borderRadius: 10, background: subTab === t ? 'var(--accent)' : 'var(--surface)', border: `1px solid ${subTab === t ? 'var(--accent)' : 'var(--border)'}`, color: subTab === t ? '#000' : 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", textTransform: 'capitalize' }}>
            {t === 'invoices' ? `Invoices (${invoices.length})` : `Expenses (${expenses.length})`}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px' }}>

        {/* ── INVOICES ── */}
        {subTab === 'invoices' && (
          <>
            {invoices.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                <Ic icon={FileText} size={40} color="var(--border)" />
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>No invoices yet</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Invoices are auto-generated when loads are delivered</div>
              </div>
            )}
            {invoices.map(inv => {
              const isPaid = (inv.status || '').toLowerCase() === 'paid'
              const isSent = (inv.status || '').toLowerCase() === 'sent'
              return (
                <div key={inv.id || inv.invoice_number || inv._dbId} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: isPaid ? 'rgba(0,212,170,0.08)' : 'rgba(239,68,68,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Ic icon={isPaid ? CheckCircle : FileText} size={16} color={isPaid ? 'var(--success)' : 'var(--danger)'} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700 }}>{inv.invoice_number || inv.id}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: isPaid ? 'rgba(0,212,170,0.12)' : isSent ? 'rgba(240,165,0,0.12)' : 'rgba(239,68,68,0.12)', color: isPaid ? 'var(--success)' : isSent ? 'var(--accent)' : 'var(--danger)' }}>{inv.status || 'Unpaid'}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                        {inv.load_number || inv.loadId || '—'} · {inv.broker || inv.driver_name || '—'} · {inv.date || inv.invoice_date || '—'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(inv.amount)}</div>
                      {inv.due_date && <div style={{ fontSize: 9, color: 'var(--muted)' }}>Due {inv.dueDate || inv.due_date}</div>}
                    </div>
                  </div>
                  {!isPaid && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button onClick={() => sendInvoice(inv)}
                        style={{ flex: 1, padding: '8px', background: 'var(--accent)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <Ic icon={Send} size={12} color="#000" /> Send Invoice
                      </button>
                      <button onClick={() => markPaid(inv)}
                        style={{ flex: 1, padding: '8px', background: 'var(--success)', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                        <Ic icon={CheckCircle} size={12} color="#000" /> Mark Paid
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </>
        )}

        {/* ── EXPENSES ── */}
        {subTab === 'expenses' && (
          <>
            {/* Action bar */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button onClick={() => { haptic(); setShowAddExpense(true) }}
                style={{ flex: 1, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: "'DM Sans',sans-serif" }}>
                <Ic icon={Plus} size={14} color="#000" />
                <span style={{ fontSize: 12, fontWeight: 700, color: '#000' }}>Add Expense</span>
              </button>
              <button onClick={() => receiptRef.current?.click()} disabled={scanning}
                style={{ flex: 1, padding: '10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: "'DM Sans',sans-serif" }}>
                <Ic icon={Camera} size={14} color="var(--accent)" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>{scanning ? 'Scanning...' : 'Scan Receipt'}</span>
              </button>
              <input ref={receiptRef} type="file" accept="image/*,.pdf" capture="environment" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleReceiptScan(f); e.target.value = '' }} />
            </div>

            {/* Add expense form */}
            {showAddExpense && (
              <div style={{ background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 12, padding: '14px', marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>New Expense</span>
                  <button onClick={() => setShowAddExpense(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                    <Ic icon={X} size={16} color="var(--muted)" />
                  </button>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <input type="number" placeholder="Amount" value={newExp.amount}
                    onChange={e => setNewExp(x => ({ ...x, amount: e.target.value }))}
                    style={{ gridColumn: '1/3', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 16, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }} />
                  <select value={newExp.cat} onChange={e => setNewExp(x => ({ ...x, cat: e.target.value }))}
                    style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                    {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input type="date" value={newExp.date}
                    onChange={e => setNewExp(x => ({ ...x, date: e.target.value }))}
                    style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
                  <input placeholder="Notes / Merchant" value={newExp.notes}
                    onChange={e => setNewExp(x => ({ ...x, notes: e.target.value }))}
                    style={{ gridColumn: '1/3', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
                  {/* IFTA fields — shown for Fuel category */}
                  {newExp.cat === 'Fuel' && (
                    <>
                      <input type="number" placeholder="Gallons" value={newExp.gallons}
                        onChange={e => setNewExp(x => ({ ...x, gallons: e.target.value }))}
                        style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
                      <input type="number" placeholder="$/gallon" value={newExp.pricePerGal}
                        onChange={e => setNewExp(x => ({ ...x, pricePerGal: e.target.value }))}
                        style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
                      <input placeholder="State (e.g. TX)" value={newExp.state} maxLength={2}
                        onChange={e => setNewExp(x => ({ ...x, state: e.target.value.toUpperCase() }))}
                        style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", textTransform: 'uppercase' }} />
                      <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center' }}>IFTA fields</div>
                    </>
                  )}
                </div>
                <button onClick={saveExpense}
                  style={{ width: '100%', marginTop: 10, padding: '10px', background: 'var(--accent)', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#000', fontFamily: "'DM Sans',sans-serif" }}>
                  Save Expense
                </button>
              </div>
            )}

            {/* Expense list */}
            {expenses.length === 0 && !showAddExpense && (
              <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--muted)' }}>
                <Ic icon={Receipt} size={40} color="var(--border)" />
                <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>No expenses yet</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Add expenses manually or scan a receipt</div>
              </div>
            )}
            {expenses.map((exp, i) => (
              <div key={exp.id || i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(240,165,0,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <Ic icon={Receipt} size={14} color="var(--accent)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700 }}>{exp.category || exp.cat || 'Other'}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {exp.notes || exp.merchant || '—'} · {exp.date || '—'}
                    {exp.state && ` · ${exp.state}`}
                    {exp.gallons && ` · ${exp.gallons} gal`}
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--danger)', fontFamily: "'Bebas Neue',sans-serif" }}>-{fmt$(exp.amount)}</div>
              </div>
            ))}
          </>
        )}

        <div style={{ height: 20 }} />
      </div>
    </div>
  )
}
