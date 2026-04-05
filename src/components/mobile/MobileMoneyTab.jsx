import { useState, useRef, useMemo } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import {
  FileText, Receipt, CheckCircle,
  Camera, Send, Zap, Plus, X
} from 'lucide-react'
import { Ic, haptic, fmt$ } from './shared'
import { apiFetch } from '../../lib/api'

// Calculate driver pay using actual pay_model + pay_rate from driver profile
function calcDriverPay(revenue, miles, driverName, drivers) {
  const driver = drivers.find(d => (d.full_name || d.name || d.driver_name) === driverName)
  if (driver?.pay_model && driver?.pay_rate) {
    const rate = Number(driver.pay_rate) || 0
    if (driver.pay_model === 'percent') return revenue * (rate / 100)
    if (driver.pay_model === 'permile') return (miles || 0) * rate
    if (driver.pay_model === 'flat') return rate
  }
  // No pay model set — return 0 (owner keeps all revenue until driver pay is configured)
  return 0
}

function isThisWeek(d) {
  if (!d) return false
  const now = new Date(), dd = new Date(d)
  const start = new Date(now); start.setDate(now.getDate() - now.getDay())
  start.setHours(0, 0, 0, 0)
  return dd >= start && dd <= now
}

export default function MobileMoneyTab({ initialSubTab }) {
  const ctx = useCarrier() || {}
  const { showToast } = useApp()
  const invoices = ctx.invoices || []
  const expenses = ctx.expenses || []
  const loads = ctx.loads || []
  const drivers = ctx.drivers || []
  const addExpense = ctx.addExpense || (() => {})
  const updateInvoiceStatus = ctx.updateInvoiceStatus || (() => {})
  const totalRevenue = ctx.totalRevenue || 0
  const totalExpenses = ctx.totalExpenses || 0
  const unpaidInvoices = ctx.unpaidInvoices || []
  const fuelCostPerMile = ctx.fuelCostPerMile || 0

  const [scanning, setScanning] = useState(false)
  const receiptRef = useRef(null)
  const [factorModal, setFactorModal] = useState(null)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [newExp, setNewExp] = useState({ amount: '', cat: 'Fuel', notes: '', date: new Date().toISOString().split('T')[0], gallons: '', pricePerGal: '', state: '' })

  // ── This week's earnings ──
  const weekStats = useMemo(() => {
    const weekLoads = loads.filter(l => isThisWeek(l.delivery_date) || isThisWeek(l.created_at))
    const weekRevenue = weekLoads.reduce((s, l) => s + (l.gross || l.rate || 0), 0)
    const weekExpenses = expenses.filter(e => isThisWeek(e.date)).reduce((s, e) => s + (e.amount || 0), 0)
    return { revenue: weekRevenue, expenses: weekExpenses, net: weekRevenue - weekExpenses }
  }, [loads, expenses])

  // ── Unpaid total ──
  const unpaidTotal = unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0)

  // ── Existing handlers ──
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
          ...e, amount: d.amount || '', date: d.date || e.date, cat: d.category || 'Fuel',
          notes: d.notes || d.merchant || '', gallons: d.gallons || '', pricePerGal: d.price_per_gallon || '', state: d.state || '',
        }))
        // Auto-save the scanned expense
        await saveExpenseData({
          category: d.category || 'Fuel',
          amount: parseFloat(d.amount) || 0,
          date: d.date || new Date().toISOString().split('T')[0],
          notes: d.notes || d.merchant || '',
          merchant: d.notes || d.merchant || '',
          gallons: d.gallons ? parseFloat(d.gallons) : null,
          price_per_gallon: d.price_per_gallon ? parseFloat(d.price_per_gallon) : null,
          state: d.state || null,
        })
        haptic('success')
        showToast?.('success', 'Receipt Scanned', `${d.category || 'Expense'} — ${fmt$(d.amount)}`)
      } else {
        showToast?.('error', 'Scan Failed', data.error || 'Could not read receipt — add manually')
        setShowExpenseForm(true)
      }
    } catch (err) {
      showToast?.('error', 'Scan Failed', 'Could not read receipt — add manually')
      setShowExpenseForm(true)
    } finally {
      setScanning(false)
    }
  }

  const saveExpenseData = async (expData) => {
    await addExpense(expData)
  }

  const saveExpense = async () => {
    if (!newExp.amount) { showToast?.('error', 'Error', 'Enter an amount'); return }
    await addExpense({
      category: newExp.cat, amount: parseFloat(newExp.amount) || 0, date: newExp.date,
      notes: newExp.notes, merchant: newExp.notes,
      gallons: newExp.gallons ? parseFloat(newExp.gallons) : null,
      price_per_gallon: newExp.pricePerGal ? parseFloat(newExp.pricePerGal) : null,
      state: newExp.state || null,
    })
    haptic('success')
    showToast?.('success', 'Expense Added', `${newExp.cat} — ${fmt$(newExp.amount)}`)
    setNewExp({ amount: '', cat: 'Fuel', notes: '', date: new Date().toISOString().split('T')[0], gallons: '', pricePerGal: '', state: '' })
  }

  const markPaid = (inv) => {
    haptic('success')
    updateInvoiceStatus(inv.id || inv.invoice_number || inv._dbId, 'Paid')
    showToast?.('success', 'Invoice Paid', inv.invoice_number || inv.id)
  }

  const factorInvoice = async (inv) => {
    const factoringRate = ctx.company?.factoring_rate || 2.5
    const fee = Math.round(inv.amount * factoringRate / 100)
    const net = inv.amount - fee
    const factoringCompany = ctx.company?.factoring_company || 'Factoring Company'
    const factoringEmail = ctx.company?.factoring_email || ''
    if (factoringEmail) {
      try {
        await apiFetch('/api/send-invoice', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: factoringEmail, invoiceNumber: `${inv.invoice_number || inv.id} — FACTORING`,
            loadNumber: inv.load_number || inv.loadId || '', route: inv.route || '',
            amount: inv.amount || 0, dueDate: 'Same-day / 24hr deposit',
            brokerName: inv.broker || '', carrierName: ctx.company?.company_name || 'Carrier',
          }),
        })
      } catch {}
    }
    updateInvoiceStatus(inv.id || inv.invoice_number || inv._dbId, 'Factored')
    haptic('success')
    showToast?.('success', 'Invoice Factored', `$${net.toLocaleString()} net · ${factoringCompany} · 24hr deposit`)
    setFactorModal(null)
  }

  const sendInvoice = async (inv) => {
    const email = inv.broker_email || inv.email
    if (!email) { showToast?.('error', 'No Email', 'No broker email on file'); return }
    haptic()
    try {
      const res = await apiFetch('/api/send-invoice', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email, invoiceNumber: inv.invoice_number || inv.id,
          loadNumber: inv.load_number || inv.loadId || '', route: inv.route || '',
          amount: inv.amount || 0, dueDate: inv.due_date || 'Net 30', brokerName: inv.broker || '',
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
      <div className="hide-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', WebkitOverflowScrolling: 'touch' }}>

        {/* ── 1. HERO: "You're owed $X,XXX" ── */}
        <div style={{
          textAlign: 'center', padding: '28px 20px 24px',
          background: 'linear-gradient(145deg, var(--surface), rgba(240,165,0,0.03))',
          border: '1px solid rgba(255,255,255,0.06)',
          boxShadow: '0 2px 20px rgba(0,0,0,0.08), 0 0 1px rgba(255,255,255,0.06)',
          borderRadius: 20, marginBottom: 20, animation: 'fadeInUp 0.4s ease',
          position: 'relative', overflow: 'hidden',
        }}>
          {/* Subtle background glow */}
          <div style={{
            position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
            width: 200, height: 200, borderRadius: '50%',
            background: unpaidTotal > 0 ? 'radial-gradient(circle, rgba(240,165,0,0.08) 0%, transparent 70%)' : 'radial-gradient(circle, rgba(0,212,170,0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }} />
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: 2, marginBottom: 10, position: 'relative' }}>
            YOU'RE OWED
          </div>
          <div style={{
            fontFamily: "'Bebas Neue',sans-serif", fontSize: 56, fontWeight: 800,
            color: unpaidTotal > 0 ? 'var(--accent)' : 'var(--success)',
            letterSpacing: 2, lineHeight: 1, animation: 'qNumberPop 0.5s ease',
            position: 'relative',
            textShadow: unpaidTotal > 0 ? '0 2px 20px rgba(240,165,0,0.2)' : '0 2px 20px rgba(0,212,170,0.15)',
          }}>
            {fmt$(unpaidTotal)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10, fontWeight: 500, position: 'relative' }}>
            {unpaidInvoices.length === 0 ? 'All caught up' : `${unpaidInvoices.length} unpaid invoice${unpaidInvoices.length !== 1 ? 's' : ''}`}
          </div>
        </div>

        {/* ── 2. UNPAID INVOICES LIST ── */}
        {unpaidInvoices.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--muted)', marginBottom: 10 }}>UNPAID INVOICES</div>
            {unpaidInvoices.map((inv, index) => {
              const isSent = (inv.status || '').toLowerCase() === 'sent'
              return (
                <div key={inv.id || inv.invoice_number || inv._dbId} className="premium-card" style={{
                  padding: '14px 16px', marginBottom: 10, animation: `fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) ${index * 0.05}s both`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.3 }}>
                        {inv.route || `${inv.load_number || inv.loadId || '—'}`}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                        {inv.broker || '—'} · {inv.invoice_number || inv.id}
                        {isSent && <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: 9, background: 'rgba(240,165,0,0.1)', padding: '1px 6px', borderRadius: 4 }}>SENT</span>}
                      </div>
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif", flexShrink: 0, letterSpacing: 1 }}>
                      {fmt$(inv.amount)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => sendInvoice(inv)} className="premium-btn"
                      style={{ flex: 1, padding: '10px', background: 'var(--accent)', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <Ic icon={Send} size={13} color="#000" /> Send
                    </button>
                    <button onClick={() => markPaid(inv)} className="premium-btn"
                      style={{ flex: 1, padding: '10px', background: 'var(--success)', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                      <Ic icon={CheckCircle} size={13} color="#000" /> Paid
                    </button>
                    <button onClick={() => { haptic(); setFactorModal(inv) }} className="premium-btn"
                      style={{ flex: 1, padding: '10px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', borderRadius: 10, fontSize: 12, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, boxShadow: '0 2px 8px rgba(139,92,246,0.3)' }}>
                      <Ic icon={Zap} size={13} color="#fff" /> Factor
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── 3. THIS WEEK'S EARNINGS ── */}
        <div className="premium-card" style={{
          padding: '18px 20px', marginBottom: 20, animation: 'fadeInUp 0.4s ease 0.1s both',
        }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--muted)', marginBottom: 14 }}>THIS WEEK</div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>Revenue</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--accent)', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{fmt$(weekStats.revenue)}</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '0 4px' }} />
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>Expenses</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--danger)', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{fmt$(weekStats.expenses)}</div>
            </div>
            <div style={{ width: 1, background: 'rgba(255,255,255,0.06)', margin: '0 4px' }} />
            <div style={{ textAlign: 'center', flex: 1 }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 6 }}>Net</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: weekStats.net >= 0 ? 'var(--success)' : 'var(--danger)', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 1 }}>{fmt$(weekStats.net)}</div>
            </div>
          </div>
        </div>

        {/* ── 4. SNAP RECEIPT BUTTON ── */}
        <button onClick={() => receiptRef.current?.click()} disabled={scanning} className="premium-btn"
          style={{
            width: '100%', padding: '18px', background: scanning ? 'var(--surface2)' : 'rgba(240,165,0,0.06)',
            border: '2px dashed rgba(240,165,0,0.35)',
            borderRadius: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontFamily: "'DM Sans',sans-serif", marginBottom: 16,
          }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Ic icon={Camera} size={18} color="var(--accent)" />
          </div>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)' }}>
              {scanning ? 'Scanning Receipt...' : 'Snap Receipt'}
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 500 }}>Auto-categorize with AI</div>
          </div>
        </button>
        <input ref={receiptRef} type="file" accept="image/*,.pdf" capture="environment" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleReceiptScan(f); e.target.value = '' }} />

        {/* Manual add expense link */}
        {!showExpenseForm && (
          <button onClick={() => { haptic(); setShowExpenseForm(true) }}
            style={{ width: '100%', padding: '8px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--muted)', fontFamily: "'DM Sans',sans-serif", display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, marginBottom: 16 }}>
            <Ic icon={Plus} size={12} color="var(--muted)" /> Add expense manually
          </button>
        )}

        {/* ── EXPENSE FORM (fallback for scan failures + manual entry) ── */}
        {showExpenseForm && (
          <div className="premium-card" style={{ borderColor: 'rgba(240,165,0,0.2)', padding: '16px', marginBottom: 20, animation: 'fadeInUp 0.25s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>New Expense</span>
              <button onClick={() => setShowExpenseForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                <Ic icon={X} size={16} color="var(--muted)" />
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input type="number" placeholder="Amount" value={newExp.amount}
                onChange={e => setNewExp(x => ({ ...x, amount: e.target.value }))}
                style={{ gridColumn: '1/3', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 16, fontWeight: 700, fontFamily: "'DM Sans',sans-serif" }} />
              <select value={newExp.cat} onChange={e => setNewExp(x => ({ ...x, cat: e.target.value }))}
                style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                {['Fuel', 'Tolls', 'Repairs', 'Insurance', 'Meals', 'Parking', 'Permits', 'Tires', 'DEF', 'Lumper', 'Scale', 'Other'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <input type="date" value={newExp.date}
                onChange={e => setNewExp(x => ({ ...x, date: e.target.value }))}
                style={{ padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
              <input placeholder="Notes / Merchant" value={newExp.notes}
                onChange={e => setNewExp(x => ({ ...x, notes: e.target.value }))}
                style={{ gridColumn: '1/3', padding: '10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }} />
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
            <button onClick={async () => { await saveExpense(); setShowExpenseForm(false) }} className="premium-btn"
              style={{ width: '100%', marginTop: 12, padding: '12px', background: 'var(--accent)', borderRadius: 12, fontSize: 14, fontWeight: 700, color: '#000', boxShadow: '0 2px 10px rgba(240,165,0,0.25)' }}>
              Save Expense
            </button>
          </div>
        )}

        {/* ── 5. PAID INVOICES (collapsed summary) ── */}
        {invoices.filter(i => (i.status || '').toLowerCase() === 'paid' || (i.status || '').toLowerCase() === 'factored').length > 0 && (
          <div className="premium-card" style={{
            padding: '16px', animation: 'fadeInUp 0.4s ease 0.15s both',
          }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 2, color: 'var(--success)', marginBottom: 10 }}>COLLECTED</div>
            {invoices.filter(i => {
              const s = (i.status || '').toLowerCase()
              return s === 'paid' || s === 'factored'
            }).slice(0, 5).map((inv) => (
              <div key={inv.id || inv.invoice_number || inv._dbId} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
              }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>
                  {inv.route || inv.load_number || inv.invoice_number || '—'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--success)', fontFamily: "'Bebas Neue',sans-serif", letterSpacing: 0.5 }}>{fmt$(inv.amount)}</span>
                  <Ic icon={CheckCircle} size={12} color="var(--success)" />
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ height: 80 }} />
      </div>

      {/* Factor confirmation modal */}
      {factorModal && (() => {
        const factoringRate = ctx.company?.factoring_rate || 2.5
        const fee = Math.round(factorModal.amount * factoringRate / 100)
        const net = factorModal.amount - fee
        const company = ctx.company?.factoring_company || 'Your Factoring Company'
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
            onClick={() => setFactorModal(null)}>
            <div onClick={e => e.stopPropagation()} style={{
              width: '100%', maxWidth: 480, background: 'var(--surface)',
              borderRadius: '24px 24px 0 0',
              padding: '20px 24px calc(24px + env(safe-area-inset-bottom, 0px))',
              animation: 'fadeInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
              boxShadow: '0 -8px 40px rgba(0,0,0,0.3)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderBottom: 'none',
            }}>
              <div style={{ width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', margin: '0 auto 20px' }} />
              <div style={{ textAlign: 'center', marginBottom: 16 }}>
                <Ic icon={Zap} size={24} color="#8b5cf6" />
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 8 }}>Factor Invoice</div>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{factorModal.invoice_number || factorModal.id} · {factorModal.broker || '—'}</div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Invoice Amount</span>
                <span style={{ fontSize: 15, fontWeight: 800, fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(factorModal.amount)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Fee ({factoringRate}%)</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--danger)' }}>-{fmt$(fee)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>You Receive</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--success)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(net)}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'center', padding: '10px 0' }}>
                {company} · 24-hour deposit
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                <button onClick={() => setFactorModal(null)} className="premium-btn"
                  style={{ flex: 1, padding: '14px', background: 'var(--surface2)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  Cancel
                </button>
                <button onClick={() => factorInvoice(factorModal)} className="premium-btn"
                  style={{ flex: 1, padding: '14px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', borderRadius: 12, fontSize: 14, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, boxShadow: '0 4px 16px rgba(139,92,246,0.35)' }}>
                  <Ic icon={Zap} size={15} color="#fff" /> Factor Now
                </button>
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
