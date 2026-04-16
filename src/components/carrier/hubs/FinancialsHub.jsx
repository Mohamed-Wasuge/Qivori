import React, { useState, useMemo, Suspense } from 'react'
import {
  DollarSign, AlertTriangle, AlertCircle, Activity,
  CheckCircle, Clock, Zap, ArrowUpRight, ArrowDownRight,
} from 'lucide-react'
import { useCarrier } from '../../../context/CarrierContext'
import { Ic, HubTabBar } from '../shared'
import { ProfitIQTab } from '../ProfitIQTab'
import { QInsightsFeed } from './QInsightsFeed'
import {
  BrokerRiskIntel, ExpenseTracker, FactoringCashflow,
  CashFlowForecaster, PLDashboard, ReceivablesAging,
  AccountsPayable, QuickBooksExport, InvoicesHub,
} from './helpers'

// ── Financials Hub ──
export function FinancialsHub() {
  const [tab, setTab] = useState('overview')
  const [reportsTab, setReportsTab] = useState('pl')
  const { loads, invoices, expenses, totalRevenue, totalExpenses, drivers: ctxDrivers, fuelCostPerMile, deliveredLoads, activeLoads } = useCarrier()
  const TABS = [
    { id:'overview', label:'Overview' },
    { id:'invoices', label:'Invoices' },
    { id:'expenses', label:'Expenses' },
    { id:'reports', label:'Reports' },
    { id:'factoring', label:'Factoring' },
  ]

  const netProfit = totalRevenue - totalExpenses
  const margin = totalRevenue > 0 ? ((netProfit / totalRevenue) * 100) : 0
  const unpaidInvoices = invoices.filter(i => i.status === 'Unpaid')
  const unpaidTotal = unpaidInvoices.reduce((s, i) => s + (i.amount || 0), 0)
  const factoredInvoices = invoices.filter(i => i.status === 'Factored')
  const factoredTotal = factoredInvoices.reduce((s, i) => s + (i.amount || 0), 0)
  const paidInvoices = invoices.filter(i => i.status === 'Paid')
  const collectedTotal = paidInvoices.reduce((s, i) => s + (i.amount || 0), 0)
  const overdueInvoices = unpaidInvoices.filter(i => i.dueDate && new Date(i.dueDate) < new Date())
  const overdueTotal = overdueInvoices.reduce((s, i) => s + (i.amount || 0), 0)
  const truckCount = Math.max((ctxDrivers || []).length, 1)
  const avgPayPct = (() => {
    const pctDrivers = (ctxDrivers || []).filter(d => d.pay_model === 'percent' && d.pay_rate)
    if (pctDrivers.length > 0) return pctDrivers.reduce((s, d) => s + Number(d.pay_rate), 0) / pctDrivers.length / 100
    return 0 // no pay model configured — set driver.pay_model + pay_rate in settings
  })()
  const profitPerTruck = Math.round(netProfit / truckCount)
  const marginColor = margin >= 30 ? 'var(--success)' : margin >= 20 ? 'var(--warning,#f59e0b)' : 'var(--danger)'

  const financialsSummary = useMemo(() => {
    const avgDaysToCollect = paidInvoices.length > 0 ? Math.round(paidInvoices.reduce((s, i) => {
      const inv = new Date(i.date || i.created_at); const paid = new Date(i.paid_at || i.updated_at || Date.now())
      return s + (paid - inv) / 86400000
    }, 0) / paidInvoices.length) : 0
    return `HUB: Financials\nRevenue: $${totalRevenue.toLocaleString()}\nExpenses: $${totalExpenses.toLocaleString()}\nNet profit: $${netProfit.toLocaleString()}\nMargin: ${margin.toFixed(1)}%\nProfit per truck: $${profitPerTruck.toLocaleString()}\nUnpaid invoices: ${unpaidInvoices.length} ($${unpaidTotal.toLocaleString()})\nOverdue invoices: ${overdueInvoices.length} ($${overdueTotal.toLocaleString()})\nFactored: ${factoredInvoices.length} ($${factoredTotal.toLocaleString()})\nCollected: ${paidInvoices.length} ($${collectedTotal.toLocaleString()})\nAvg days to collect: ${avgDaysToCollect}\nTrucks: ${truckCount}\nDelivered loads: ${(deliveredLoads||[]).length}\nTop brokers unpaid: ${unpaidInvoices.slice(0,5).map(i => `${i.broker||'Unknown'} $${(i.amount||0).toLocaleString()}`).join(', ') || 'None'}`
  }, [totalRevenue, totalExpenses, netProfit, margin, profitPerTruck, unpaidInvoices, unpaidTotal, overdueInvoices, overdueTotal, factoredInvoices, factoredTotal, paidInvoices, collectedTotal, truckCount, deliveredLoads])

  // Revenue by month (last 6 months)
  const monthlyData = useMemo(() => {
    const months = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const label = d.toLocaleDateString('en-US', { month:'short' })
      const mLoads = (deliveredLoads || []).filter(l => {
        const ld = l.delivery_date || l.updated_at || l.created_at
        return ld && ld.startsWith(key)
      })
      const rev = mLoads.reduce((s, l) => s + (Number(l.rate || l.gross) || 0), 0)
      const mExp = (expenses || []).filter(e => e.date && e.date.startsWith(key))
      const exp = mExp.reduce((s, e) => s + (Number(e.amount) || 0), 0)
      months.push({ key, label, revenue: rev, expenses: exp, profit: rev - exp })
    }
    return months
  }, [deliveredLoads, expenses])
  const maxChart = Math.max(...monthlyData.map(m => Math.max(m.revenue, m.expenses)), 1)

  // Recent transactions (invoices + expenses merged, sorted by date)
  const recentTransactions = useMemo(() => {
    const items = []
    invoices.slice(0, 10).forEach(i => items.push({ type:'invoice', id: i.id, desc: `Invoice ${i.id?.slice(-4) || ''}`, broker: i.broker, amount: i.amount || 0, date: i.date || i.created_at, status: i.status }))
    expenses.slice(0, 10).forEach(e => items.push({ type:'expense', id: e.id, desc: e.description || e.category || 'Expense', amount: -(Number(e.amount) || 0), date: e.date || e.created_at, status: 'Expense' }))
    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
    return items.slice(0, 12)
  }, [invoices, expenses])

  // Alerts
  const alerts = useMemo(() => {
    const a = []
    if (overdueInvoices.length > 0) a.push({ type:'danger', msg:`${overdueInvoices.length} overdue invoice${overdueInvoices.length>1?'s':''} — $${overdueTotal.toLocaleString()} past due` })
    if (margin < 20 && totalRevenue > 0) a.push({ type:'warning', msg:`Profit margin at ${margin.toFixed(1)}% — below 20% target` })
    if (unpaidTotal > totalRevenue * 0.5 && unpaidTotal > 0) a.push({ type:'warning', msg:`$${unpaidTotal.toLocaleString()} outstanding — more than 50% of revenue uncollected` })
    const avgDays = paidInvoices.length > 0 ? Math.round(paidInvoices.reduce((s, i) => {
      const inv = new Date(i.date || i.created_at); const paid = new Date(i.paid_at || i.updated_at || Date.now())
      return s + (paid - inv) / 86400000
    }, 0) / paidInvoices.length) : 0
    if (avgDays > 30) a.push({ type:'info', msg:`Average days to collect: ${avgDays}d — consider factoring for faster cash flow` })
    return a
  }, [overdueInvoices, margin, totalRevenue, unpaidTotal, paidInvoices, overdueTotal])

  const REPORTS_TABS = [
    { id:'pl', label:'P&L' },{ id:'profit-iq', label:'Profit IQ' },{ id:'receivables', label:'Receivables (AR)' },{ id:'payables', label:'Payables (AP)' },{ id:'cash-flow', label:'Cash Flow' },{ id:'quickbooks', label:'QuickBooks' },
  ]

  const fmtM = (n) => {
    const abs = Math.abs(n)
    if (abs >= 1000000) return `$${(n/1000000).toFixed(1)}M`
    if (abs >= 1000) return `$${(n/1000).toFixed(1)}K`
    return `$${n.toLocaleString()}`
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
      {/* Corporate financial header */}
      <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Ic icon={DollarSign} size={18} color="var(--success)" />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, letterSpacing:0.3 }}>Financials</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Revenue, expenses, invoicing & cash flow</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:24 }}>
            {[
              { label:'Revenue', val: fmtM(totalRevenue), color:'var(--accent)' },
              { label:'Expenses', val: fmtM(totalExpenses), color:'var(--danger)' },
              { label:'Profit', val: fmtM(netProfit), color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)' },
              { label:'Margin', val: `${margin.toFixed(1)}%`, color: marginColor },
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center', minWidth:60 }}>
                <div style={{ fontSize:18, fontWeight:800, color:s.color, fontFamily:"'DM Sans',sans-serif" }}>{s.val}</div>
                <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0 }}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>

          {tab === 'overview' && (
            <div style={{ padding:20, display:'flex', flexDirection:'column', gap:16 }}>
              {/* Q Intelligence */}
              <QInsightsFeed hub="financials" summary={financialsSummary} onNavigate={(target) => { if (target) setTab(target) }} />
              {/* Empty state for new carriers */}
              {totalRevenue === 0 && invoices.length === 0 && expenses.length === 0 && (
                <div style={{ padding:'30px 20px', textAlign:'center', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={DollarSign} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>NO FINANCIAL DATA YET</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:340, margin:'0 auto', lineHeight:1.6 }}>Book your first load and deliver it to see revenue, invoices, and profitability here. Q will track every dollar automatically.</div>
                </div>
              )}
              {/* Alerts */}
              {alerts.length > 0 && (
                <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                  {alerts.map((a, i) => (
                    <div key={i} style={{
                      padding:'10px 16px', borderRadius:10, fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:10,
                      background: a.type === 'danger' ? 'rgba(239,68,68,0.08)' : a.type === 'warning' ? 'rgba(245,158,11,0.08)' : 'rgba(59,130,246,0.08)',
                      border: `1px solid ${a.type === 'danger' ? 'rgba(239,68,68,0.2)' : a.type === 'warning' ? 'rgba(245,158,11,0.2)' : 'rgba(59,130,246,0.2)'}`,
                      color: a.type === 'danger' ? 'var(--danger)' : a.type === 'warning' ? 'var(--warning,#f59e0b)' : 'var(--accent3,#3b82f6)',
                    }}>
                      <Ic icon={a.type === 'danger' ? AlertTriangle : a.type === 'warning' ? AlertCircle : Activity} size={15} />
                      {a.msg}
                    </div>
                  ))}
                </div>
              )}

              {/* Cash position cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                {[
                  { label:'Outstanding', val: `$${unpaidTotal.toLocaleString()}`, sub:`${unpaidInvoices.length} unpaid`, color:'var(--accent)', icon: Clock },
                  { label:'Overdue', val: `$${overdueTotal.toLocaleString()}`, sub:`${overdueInvoices.length} past due`, color: overdueTotal > 0 ? 'var(--danger)' : 'var(--muted)', icon: AlertTriangle },
                  { label:'Factored', val: `$${factoredTotal.toLocaleString()}`, sub:`${factoredInvoices.length} invoices`, color:'var(--accent3,#8b5cf6)', icon: Zap },
                  { label:'Collected', val: `$${collectedTotal.toLocaleString()}`, sub:`${paidInvoices.length} paid`, color:'var(--success)', icon: CheckCircle },
                ].map(c => (
                  <div key={c.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                      <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>{c.label}</div>
                      <Ic icon={c.icon} size={14} color={c.color} />
                    </div>
                    <div style={{ fontSize:24, fontWeight:800, color:c.color, fontFamily:"'DM Sans',sans-serif" }}>{c.val}</div>
                    <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{c.sub}</div>
                  </div>
                ))}
              </div>

              {/* Two-column: Revenue chart + P&L summary */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {/* Revenue vs Expenses chart */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'20px 24px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:16 }}>Revenue vs Expenses (6 Mo)</div>
                  <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:140 }}>
                    {monthlyData.map(m => (
                      <div key={m.key} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                        <div style={{ width:'100%', display:'flex', gap:2, alignItems:'flex-end', justifyContent:'center', height:120 }}>
                          <div style={{ width:'40%', background:'var(--accent)', borderRadius:'4px 4px 0 0', height: Math.max((m.revenue / maxChart) * 120, 2), transition:'height 0.3s' }} title={`Rev: $${m.revenue.toLocaleString()}`} />
                          <div style={{ width:'40%', background:'var(--danger)', borderRadius:'4px 4px 0 0', opacity:0.7, height: Math.max((m.expenses / maxChart) * 120, 2), transition:'height 0.3s' }} title={`Exp: $${m.expenses.toLocaleString()}`} />
                        </div>
                        <div style={{ fontSize:9, color:'var(--muted)', fontWeight:600 }}>{m.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display:'flex', gap:16, marginTop:12, justifyContent:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, color:'var(--muted)' }}>
                      <div style={{ width:10, height:10, borderRadius:2, background:'var(--accent)' }} /> Revenue
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:10, color:'var(--muted)' }}>
                      <div style={{ width:10, height:10, borderRadius:2, background:'var(--danger)', opacity:0.7 }} /> Expenses
                    </div>
                  </div>
                </div>

                {/* P&L Summary */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'20px 24px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:16 }}>Profit & Loss Summary</div>
                  {[
                    { label:'Gross Revenue', val:`$${totalRevenue.toLocaleString()}`, color:'var(--accent)' },
                    { label:'Total Expenses', val:`-$${totalExpenses.toLocaleString()}`, color:'var(--danger)' },
                    { label:'Fuel (est.)', val:`-$${Math.round((deliveredLoads||[]).reduce((s,l)=>s+(Number(l.miles)||0),0) * fuelCostPerMile).toLocaleString()}`, color:'var(--danger)' },
                    { label:'Driver Pay (est.)', val:`-$${Math.round(totalRevenue * avgPayPct).toLocaleString()}`, color:'var(--danger)' },
                  ].map((r, i, arr) => (
                    <div key={r.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                      <span style={{ fontSize:13, color:'var(--text-secondary,#94a3b8)' }}>{r.label}</span>
                      <span style={{ fontSize:13, fontWeight:600, color:r.color }}>{r.val}</span>
                    </div>
                  ))}
                  <div style={{ borderTop:'2px solid var(--border)', marginTop:8, paddingTop:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <span style={{ fontSize:14, fontWeight:700 }}>Net Profit</span>
                    <span style={{ fontSize:22, fontWeight:800, color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{netProfit >= 0 ? '' : '-'}${Math.abs(netProfit).toLocaleString()}</span>
                  </div>
                  <div style={{ display:'flex', justifyContent:'space-between', marginTop:8 }}>
                    <span style={{ fontSize:11, color:'var(--muted)' }}>Margin: <span style={{ color: marginColor, fontWeight:700 }}>{margin.toFixed(1)}%</span></span>
                    <span style={{ fontSize:11, color:'var(--muted)' }}>Per truck: <span style={{ fontWeight:700 }}>${profitPerTruck.toLocaleString()}</span></span>
                  </div>
                </div>
              </div>

              {/* Recent transactions */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>Recent Activity</div>
                  <button onClick={() => setTab('invoices')} style={{ fontSize:11, color:'var(--accent)', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>View All Invoices →</button>
                </div>
                {recentTransactions.length === 0 ? (
                  <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No transactions yet</div>
                ) : (
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <tbody>
                      {recentTransactions.map((t, i) => (
                        <tr key={t.id || i} style={{ borderBottom: i < recentTransactions.length - 1 ? '1px solid var(--border)' : 'none' }}>
                          <td style={{ padding:'10px 20px', width:32 }}>
                            <div style={{ width:28, height:28, borderRadius:8, background: t.type === 'invoice' ? 'rgba(240,165,0,0.08)' : 'rgba(239,68,68,0.08)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                              <Ic icon={t.type === 'invoice' ? ArrowUpRight : ArrowDownRight} size={13} color={t.type === 'invoice' ? 'var(--accent)' : 'var(--danger)'} />
                            </div>
                          </td>
                          <td style={{ padding:'10px 8px' }}>
                            <div style={{ fontSize:12, fontWeight:600 }}>{t.desc}</div>
                            <div style={{ fontSize:10, color:'var(--muted)' }}>{t.broker || ''}</div>
                          </td>
                          <td style={{ padding:'10px 8px', fontSize:11, color:'var(--muted)' }}>{t.date ? new Date(t.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'}</td>
                          <td style={{ padding:'10px 8px', textAlign:'right' }}>
                            <span style={{ fontSize:13, fontWeight:700, color: t.amount >= 0 ? 'var(--accent)' : 'var(--danger)' }}>
                              {t.amount >= 0 ? '+' : ''}{t.amount < 0 ? '-' : ''}${Math.abs(t.amount).toLocaleString()}
                            </span>
                          </td>
                          <td style={{ padding:'10px 20px', textAlign:'right' }}>
                            <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:12, textTransform:'capitalize',
                              background: t.status === 'Paid' ? 'rgba(34,197,94,0.1)' : t.status === 'Factored' ? 'rgba(139,92,246,0.1)' : t.status === 'Unpaid' ? 'rgba(240,165,0,0.1)' : t.status === 'Expense' ? 'rgba(239,68,68,0.1)' : 'rgba(74,85,112,0.1)',
                              color: t.status === 'Paid' ? 'var(--success)' : t.status === 'Factored' ? 'var(--accent3,#8b5cf6)' : t.status === 'Unpaid' ? 'var(--accent)' : t.status === 'Expense' ? 'var(--danger)' : 'var(--muted)',
                            }}>{t.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          )}

          {tab === 'invoices' && <InvoicesHub />}
          {tab === 'expenses' && <ExpenseTracker />}
          {tab === 'factoring' && <FactoringCashflow />}

          {tab === 'reports' && (
            <div style={{ display:'flex', flexDirection:'column' }}>
              <div style={{ flexShrink:0, display:'flex', gap:0, padding:'0 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
                {REPORTS_TABS.map(rt => (
                  <button key={rt.id} onClick={() => setReportsTab(rt.id)} style={{
                    padding:'10px 18px', fontSize:12, fontWeight: reportsTab === rt.id ? 700 : 500, cursor:'pointer', border:'none', background:'none',
                    color: reportsTab === rt.id ? 'var(--accent)' : 'var(--muted)',
                    borderBottom: reportsTab === rt.id ? '2px solid var(--accent)' : '2px solid transparent',
                    transition:'all 0.15s',
                  }}>{rt.label}</button>
                ))}
              </div>
              <div style={{ flex:1, minHeight:0 }}>
                {reportsTab === 'pl' && <PLDashboard />}
                {reportsTab === 'profit-iq' && <ProfitIQTab />}
                {reportsTab === 'receivables' && <ReceivablesAging />}
                {reportsTab === 'payables' && <AccountsPayable />}
                {reportsTab === 'cash-flow' && <CashFlowForecaster />}
                {reportsTab === 'quickbooks' && <QuickBooksExport />}
              </div>
            </div>
          )}
        </Suspense>
      </div>
    </div>
  )
}
