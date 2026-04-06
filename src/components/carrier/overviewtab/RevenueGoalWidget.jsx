import React from 'react'
import { TrendingUp, CheckCircle, Target } from 'lucide-react'
import { Ic } from '../shared'

export function RevenueGoalWidget({ company, deliveredLoads, invoices, totalRevenue, editingGoal, setEditingGoal, goalInput, setGoalInput, updateCompany, showToast, pan }) {
  const weeklyGoal = company?.revenue_goal_weekly || 0
  const monthlyGoal = company?.revenue_goal_monthly || 0
  const goalType = company?.revenue_goal_type || 'weekly'
  const activeGoal = goalType === 'weekly' ? weeklyGoal : monthlyGoal

  const now = new Date()
  const startOfWeek = new Date(now); startOfWeek.setDate(now.getDate() - now.getDay()); startOfWeek.setHours(0,0,0,0)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const periodStart = goalType === 'weekly' ? startOfWeek : startOfMonth

  const periodRevenue = (deliveredLoads || [])
    .filter(l => { const d = new Date(l.delivery_date || l.created_at || 0); return d >= periodStart })
    .reduce((s, l) => s + (l.gross || l.rate_total || 0), 0)
    + (invoices || [])
    .filter(i => i.status === 'Paid' && new Date(i.paid_date || i.created_at || 0) >= periodStart)
    .reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)

  const currentRev = periodRevenue || totalRevenue || 0
  const pct = activeGoal > 0 ? Math.min(Math.round((currentRev / activeGoal) * 100), 100) : 0
  const remaining = Math.max(activeGoal - currentRev, 0)

  const avgGross = (deliveredLoads || []).length > 0 ? (deliveredLoads || []).reduce((s, l) => s + (l.gross || 0), 0) / deliveredLoads.length : 2500
  const loadsNeeded = remaining > 0 ? Math.ceil(remaining / avgGross) : 0

  const endOfWeek = new Date(startOfWeek); endOfWeek.setDate(startOfWeek.getDate() + 7)
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const periodEnd = goalType === 'weekly' ? endOfWeek : endOfMonth
  const daysLeft = Math.max(Math.ceil((periodEnd - now) / 86400000), 0)

  const getMessage = () => {
    if (activeGoal === 0) return 'Set a revenue target to track your progress'
    if (pct >= 100) return 'Goal crushed! You hit your target'
    if (pct >= 75) return `Almost there! $${remaining.toLocaleString()} to go`
    if (pct >= 50) return `On track — ${loadsNeeded} more load${loadsNeeded !== 1 ? 's' : ''} to hit your target`
    if (pct >= 25) return `Keep pushing — ${daysLeft} day${daysLeft !== 1 ? 's' : ''} left this ${goalType === 'weekly' ? 'week' : 'month'}`
    return `${daysLeft} day${daysLeft !== 1 ? 's' : ''} left — let's find ${loadsNeeded} load${loadsNeeded !== 1 ? 's' : ''}`
  }

  const barColor = pct >= 100 ? 'var(--success)' : pct >= 50 ? 'var(--accent)' : 'var(--warning)'

  const saveGoal = () => {
    const val = parseFloat(goalInput)
    if (!val || val <= 0) return
    const updates = goalType === 'weekly'
      ? { revenue_goal_weekly: val, revenue_goal_type: goalType }
      : { revenue_goal_monthly: val, revenue_goal_type: goalType }
    updateCompany(updates)
    setEditingGoal(false)
    if (showToast) showToast(`${goalType === 'weekly' ? 'Weekly' : 'Monthly'} goal set to $${val.toLocaleString()}`)
  }

  return (
    <div style={{ ...pan, overflow: 'hidden', position: 'relative' }}>
      {pct >= 100 && <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at center, rgba(52,176,104,0.06) 0%, transparent 70%)', pointerEvents: 'none' }} />}

      <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, letterSpacing: 0.5 }}>
          <Ic icon={Target} size={13} color={pct >= 100 ? 'var(--success)' : 'var(--accent)'} />
          REVENUE GOAL
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {activeGoal > 0 && !editingGoal && (
            <select value={goalType} onChange={e => updateCompany({ revenue_goal_type: e.target.value })}
              style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text)', fontSize: 9, padding: '2px 4px', cursor: 'pointer' }}>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => { setEditingGoal(!editingGoal); setGoalInput(String(activeGoal || '')) }}>
            {activeGoal > 0 ? 'Edit' : 'Set Goal'}
          </button>
        </div>
      </div>

      {editingGoal ? (
        <div style={{ padding: '14px 16px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={goalType} onChange={e => updateCompany({ revenue_goal_type: e.target.value })}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, padding: '6px 8px' }}>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
          <div style={{ position: 'relative', flex: 1, minWidth: 120 }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)', fontSize: 14, fontWeight: 700 }}>$</span>
            <input type="number" value={goalInput} onChange={e => setGoalInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveGoal()}
              placeholder={goalType === 'weekly' ? '5000' : '20000'}
              style={{ width: '100%', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 14, padding: '6px 8px 6px 22px', fontFamily: "'JetBrains Mono',monospace" }} />
          </div>
          <button className="btn btn-primary" style={{ fontSize: 11, padding: '6px 14px' }} onClick={saveGoal}>Save</button>
          <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => setEditingGoal(false)}>Cancel</button>
        </div>
      ) : activeGoal > 0 ? (
        <div style={{ padding: '14px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div>
              <span style={{ fontFamily: "'JetBrains Mono','Bebas Neue',monospace", fontSize: 28, color: pct >= 100 ? 'var(--success)' : 'var(--accent)', fontWeight: 700, lineHeight: 1 }}>
                ${currentRev.toLocaleString()}
              </span>
              <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 6 }}>
                / ${activeGoal.toLocaleString()}
              </span>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: barColor, lineHeight: 1 }}>{pct}%</div>
              <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 2 }}>{goalType === 'weekly' ? 'this week' : 'this month'}</div>
            </div>
          </div>
          <div style={{ height: 8, background: 'var(--surface2)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 }}>
            <div style={{
              height: '100%', width: `${pct}%`, borderRadius: 4,
              background: pct >= 100 ? 'linear-gradient(90deg, var(--success), #4ade80)' : `linear-gradient(90deg, ${barColor}, ${barColor}cc)`,
              transition: 'width 0.8s ease',
              boxShadow: `0 0 12px ${barColor}40`
            }} />
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 80, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color: remaining === 0 ? 'var(--success)' : 'var(--text)', lineHeight: 1 }}>
                {remaining === 0 ? '\u2713' : `$${remaining.toLocaleString()}`}
              </div>
              <div style={{ fontSize: 8, color: 'var(--muted)', marginTop: 3, fontWeight: 700, letterSpacing: 0.5 }}>REMAINING</div>
            </div>
            <div style={{ flex: 1, minWidth: 80, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color: loadsNeeded === 0 ? 'var(--success)' : 'var(--accent2)', lineHeight: 1 }}>
                {loadsNeeded === 0 ? '\u2713' : loadsNeeded}
              </div>
              <div style={{ fontSize: 8, color: 'var(--muted)', marginTop: 3, fontWeight: 700, letterSpacing: 0.5 }}>LOADS NEEDED</div>
            </div>
            <div style={{ flex: 1, minWidth: 80, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 700, color: daysLeft <= 2 ? 'var(--danger)' : 'var(--text)', lineHeight: 1 }}>
                {daysLeft}
              </div>
              <div style={{ fontSize: 8, color: 'var(--muted)', marginTop: 3, fontWeight: 700, letterSpacing: 0.5 }}>DAYS LEFT</div>
            </div>
            <div style={{ flex: 2, minWidth: 140, background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ic icon={pct >= 100 ? CheckCircle : pct >= 50 ? TrendingUp : Target} size={14} color={pct >= 100 ? 'var(--success)' : 'var(--accent)'} />
              <div style={{ fontSize: 11, color: pct >= 100 ? 'var(--success)' : 'var(--text)', fontWeight: 600, lineHeight: 1.3 }}>
                {getMessage()}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div style={{ padding: '20px 16px', textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(240,165,0,0.08)', border: '1px solid rgba(240,165,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
            <Ic icon={Target} size={18} color="var(--accent)" />
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Set a revenue goal</div>
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, maxWidth: 320, margin: '0 auto 12px' }}>
            Track your weekly or monthly income target. Qivori shows how many loads you need and keeps you motivated.
          </div>
          <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => { setEditingGoal(true); setGoalInput('') }}>Set My Goal</button>
        </div>
      )}
    </div>
  )
}
