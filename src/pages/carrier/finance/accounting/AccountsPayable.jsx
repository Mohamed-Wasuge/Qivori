import React, { useState, useMemo, useEffect } from 'react'
import {
  Truck, Receipt, Check, Bot
} from 'lucide-react'
import { Ic, S } from '../../shared'
import { useApp } from '../../../../context/AppContext'
import { useCarrier } from '../../../../context/CarrierContext'

// ─── ACCOUNTS PAYABLE ────────────────────────────────────────────────────────
export function AccountsPayable() {
  const { loads, expenses, drivers: ctxDrivers, fuelCostPerMile } = useCarrier()
  const { showToast } = useApp()
  const [payroll, setPayroll] = useState([])
  const [markingPaid, setMarkingPaid] = useState({})

  useEffect(() => {
    import('../../../../lib/database').then(db => {
      db.fetchPayroll().then(d => setPayroll(d || [])).catch(() => {})
    })
  }, [])

  // Driver payables — approved payroll not yet marked paid
  const driverPayables = useMemo(() => {
    const driverMap = {}
    ;(ctxDrivers || []).forEach(d => { driverMap[d.id] = d.name || d.full_name || 'Unknown Driver' })
    return payroll
      .filter(p => p.status === 'approved' || p.status === 'pending')
      .map(p => ({
        ...p,
        driverName: driverMap[p.driver_id] || 'Unknown Driver',
        category: 'Driver Pay',
        dueLabel: p.period_end ? new Date(p.period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
        amount: Number(p.net_pay || 0),
      }))
  }, [payroll, ctxDrivers])

  // Expense payables — recurring/unpaid expenses
  const expensePayables = useMemo(() => {
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000)
    return (expenses || [])
      .filter(e => {
        const d = new Date(e.date || e.created_at)
        return d >= thirtyDaysAgo && (e.status === 'pending' || e.status === 'unpaid' || !e.status)
      })
      .map(e => ({
        id: e.id,
        category: e.category || 'Operating Expense',
        vendor: e.vendor || e.description || 'Unknown',
        amount: Number(e.amount || 0),
        date: e.date || e.created_at,
        dueLabel: e.date ? new Date(e.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—',
        status: e.status || 'pending',
      }))
  }, [expenses])

  // Summary numbers
  const totalDriverOwed = driverPayables.reduce((s, p) => s + p.amount, 0)
  const totalExpenseOwed = expensePayables.reduce((s, e) => s + e.amount, 0)
  const totalPayable = totalDriverOwed + totalExpenseOwed

  // Estimated fuel liability from active loads
  const fuelLiability = useMemo(() => {
    const active = (loads || []).filter(l => l.status === 'In Transit' || l.status === 'Dispatched')
    const totalMiles = active.reduce((s, l) => s + (Number(l.miles) || 0), 0)
    const fCost = fuelCostPerMile || 0.65
    return Math.round(totalMiles * fCost)
  }, [loads, fuelCostPerMile])

  const markPayrollPaid = async (id) => {
    setMarkingPaid(prev => ({ ...prev, [id]: true }))
    try {
      const db = await import('../../../../lib/database')
      await db.updatePayroll(id, { status: 'paid' })
      setPayroll(prev => prev.map(p => p.id === id ? { ...p, status: 'paid' } : p))
      showToast('', 'Marked Paid', 'Payroll record updated')
    } catch {
      showToast('', 'Error', 'Failed to update payroll status')
    }
    setMarkingPaid(prev => ({ ...prev, [id]: false }))
  }

  const riskColor = (amount) => amount > 5000 ? 'var(--danger)' : amount > 2000 ? 'var(--warning,#f59e0b)' : 'var(--success)'

  return (
    <div style={{ ...S.page, paddingBottom: 40 }}>
      <div>
        <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 26, letterSpacing: 2 }}>ACCOUNTS PAYABLE</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>Track what you owe — driver pay, expenses & obligations</div>
      </div>

      <div style={S.grid(4)}>
        {[
          { label: 'TOTAL PAYABLE', val: `$${totalPayable.toLocaleString()}`, color: 'var(--danger)', sub: 'All outstanding obligations' },
          { label: 'DRIVER PAY OWED', val: `$${totalDriverOwed.toLocaleString()}`, color: 'var(--accent)', sub: `${driverPayables.length} settlement${driverPayables.length !== 1 ? 's' : ''} pending` },
          { label: 'EXPENSE OBLIGATIONS', val: `$${totalExpenseOwed.toLocaleString()}`, color: 'var(--warning,#f59e0b)', sub: `${expensePayables.length} item${expensePayables.length !== 1 ? 's' : ''}` },
          { label: 'FUEL LIABILITY', val: `$${fuelLiability.toLocaleString()}`, color: 'var(--accent3)', sub: 'Active loads est. fuel cost' },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 28, color: k.color, lineHeight: 1 }}>{k.val}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Driver Payables */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Truck} /> Driver Settlements Owed</div>
        </div>
        {driverPayables.length === 0
          ? <div style={{ padding: '20px 18px', color: 'var(--muted)', fontSize: 12 }}>No outstanding driver settlements. Run payroll in the Drivers hub to generate settlements.</div>
          : (
            <table>
              <thead><tr>{['Driver', 'Period', 'Loads', 'Miles', 'Gross', 'Deductions', 'Net Owed', 'Status', 'Action'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {driverPayables.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{p.driverName}</td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{p.period_start?.slice(5)} → {p.period_end?.slice(5)}</td>
                    <td style={{ fontSize: 12 }}>{p.loads_completed || 0}</td>
                    <td style={{ fontSize: 12 }}>{(p.miles_driven || 0).toLocaleString()}</td>
                    <td style={{ fontSize: 12, color: 'var(--accent)' }}>${Number(p.gross_pay || 0).toLocaleString()}</td>
                    <td style={{ fontSize: 12, color: 'var(--danger)' }}>-${Number(p.deductions || 0).toLocaleString()}</td>
                    <td><span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, color: riskColor(p.amount) }}>${p.amount.toLocaleString()}</span></td>
                    <td><span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, background: p.status === 'approved' ? 'rgba(240,165,0,0.1)' : 'rgba(245,158,11,0.1)', color: p.status === 'approved' ? 'var(--accent)' : 'var(--warning)' }}>{p.status}</span></td>
                    <td>
                      <button onClick={() => markPayrollPaid(p.id)} disabled={markingPaid[p.id]}
                        style={{ padding: '4px 10px', fontSize: 11, fontWeight: 700, borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", background: 'rgba(34,197,94,0.15)', color: 'var(--success)' }}>
                        {markingPaid[p.id] ? 'Saving...' : <><Check size={11} /> Mark Paid</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      {/* Expense Payables */}
      <div style={S.panel}>
        <div style={S.panelHead}>
          <div style={S.panelTitle}><Ic icon={Receipt} /> Expense Obligations</div>
        </div>
        {expensePayables.length === 0
          ? <div style={{ padding: '20px 18px', color: 'var(--muted)', fontSize: 12 }}>No pending expense obligations in the last 30 days.</div>
          : (
            <table>
              <thead><tr>{['Category', 'Vendor / Description', 'Amount', 'Date', 'Status'].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {expensePayables.map(e => (
                  <tr key={e.id}>
                    <td><span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 6, background: 'var(--surface2)' }}>{e.category}</span></td>
                    <td style={{ fontSize: 12 }}>{e.vendor}</td>
                    <td><span style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: 'var(--warning,#f59e0b)' }}>${e.amount.toLocaleString()}</span></td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{e.dueLabel}</td>
                    <td><span style={{ fontSize: 11, fontWeight: 600, color: 'var(--warning)' }}>{e.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>

      <div style={{ background: 'linear-gradient(135deg,rgba(240,165,0,0.06),rgba(77,142,240,0.04))', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 12, padding: '14px 18px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 22 }}><Bot size={20} /></div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>Payables Intelligence</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
            {totalPayable > 0
              ? `You owe $${totalPayable.toLocaleString()} total — $${totalDriverOwed.toLocaleString()} to drivers and $${totalExpenseOwed.toLocaleString()} in expenses. ${fuelLiability > 0 ? `Active loads have ~$${fuelLiability.toLocaleString()} in estimated fuel costs.` : ''} Pay driver settlements promptly to maintain retention.`
              : 'All obligations are current — no outstanding payables. Great cash management.'}
          </div>
        </div>
      </div>
    </div>
  )
}
