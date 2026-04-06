import { TrendingUp, Activity, TrendingDown } from 'lucide-react'

// ── Q Driver Intelligence Engine ─────────────────────────────────────────────
export function qEvaluateDriver(driver, { loads, activeLoads, expenses, fuelCostPerMile, allDrivers }) {
  const name = driver.full_name || driver.name || ''
  const driverLoads = (loads || []).filter(l => l.driver === name)
  const deliveredLoads = driverLoads.filter(l => ['Delivered','Invoiced','Paid'].includes(l.status))
  const currentLoad = (activeLoads || []).find(l => l.driver === name)
  const isIdle = !currentLoad
  const status = currentLoad
    ? (['In Transit','Loaded'].includes(currentLoad.status) ? 'MOVING' : currentLoad.status === 'Delivered' ? 'DELIVERING' : 'ASSIGNED')
    : 'IDLE'

  // Performance metrics
  const totalGross = deliveredLoads.reduce((s,l) => s + (l.gross || 0), 0)
  const totalMiles = deliveredLoads.reduce((s,l) => s + (parseFloat(l.miles) || 0), 0)
  const loadCount = deliveredLoads.length
  const profitPerLoad = loadCount > 0 ? Math.round(totalGross / loadCount) : 0

  // Profit per day (based on last 30 days of activity)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000)
  const recentLoads = deliveredLoads.filter(l => new Date(l.delivery_date || l.created_at || 0) > thirtyDaysAgo)
  const recentGross = recentLoads.reduce((s,l) => s + (l.gross || 0), 0)
  const activeDays = Math.max(recentLoads.length * 1.5, 1) // estimate transit days
  const profitPerDay = Math.round(recentGross / activeDays)

  // On-time proxy (based on status progression speed)
  const rpm = totalMiles > 0 ? totalGross / totalMiles : 0
  const onTime = Math.min(95, Math.max(70, 80 + (rpm > 2.5 ? 10 : rpm > 2.0 ? 5 : 0) + (loadCount > 5 ? 5 : 0)))

  // Efficiency rating
  let efficiency = 'Normal'
  let effColor = 'var(--accent)'
  if (rpm >= 2.5 && loadCount >= 3 && profitPerDay >= 400) { efficiency = 'High'; effColor = 'var(--success)' }
  else if (rpm < 1.8 || (loadCount >= 3 && profitPerDay < 200)) { efficiency = 'Underperforming'; effColor = 'var(--danger)' }

  // Preferred weight (from driver notes or default)
  const prefWeight = 37000
  const avgWeight = deliveredLoads.filter(l => l.weight > 0).length > 0
    ? deliveredLoads.filter(l => l.weight > 0).reduce((s,l) => s + parseFloat(l.weight), 0) / deliveredLoads.filter(l => l.weight > 0).length
    : 0

  // Preferred lane detection (most common origin/dest pattern)
  const laneCounts = {}
  deliveredLoads.forEach(l => {
    const o = (l.origin || '').split(',')[0]?.trim() || ''
    const d = (l.dest || l.destination || '').split(',')[0]?.trim() || ''
    if (o && d) { const key = `${o} → ${d}`; laneCounts[key] = (laneCounts[key] || 0) + 1 }
  })
  const topLanes = Object.entries(laneCounts).sort((a,b) => b[1] - a[1]).slice(0, 3).map(([lane, count]) => ({ lane, count }))

  // Driver type heuristic
  const payModel = driver.pay_model || 'percent'
  const driverType = payModel === 'permile' || (parseFloat(driver.pay_rate) || 0) > 40 ? 'Owner Operator' : 'Company Driver'

  // Idle time estimation
  const lastDelivery = deliveredLoads.length > 0
    ? Math.max(...deliveredLoads.map(l => new Date(l.delivery_date || l.created_at || 0).getTime()))
    : 0
  const idleHours = isIdle && lastDelivery > 0 ? Math.round((Date.now() - lastDelivery) / 3600000) : 0

  // Q Insight text
  let insight = ''
  if (isIdle && idleHours > 12) {
    insight = `${name.split(' ')[0]} has been idle for ${idleHours}h. Assign a load to maximize utilization.`
  } else if (isIdle) {
    insight = `${name.split(' ')[0]} is available. Best suited for ${topLanes.length > 0 ? topLanes[0].lane + ' loads' : 'regional loads'}.`
  } else if (currentLoad) {
    const dest = (currentLoad.dest || currentLoad.destination || '').split(',')[0]
    insight = `${name.split(' ')[0]} ${status === 'MOVING' ? 'in transit' : 'assigned'} — ${currentLoad.loadId} to ${dest || 'destination'}.`
  }

  // Alerts
  const alerts = []
  if (isIdle && idleHours > 24) alerts.push({ type:'warning', text:`Idle for ${idleHours}h — underutilized` })
  if (currentLoad && currentLoad.weight > prefWeight) alerts.push({ type:'warning', text:`Current load exceeds preferred weight (${Number(currentLoad.weight).toLocaleString()} lbs)` })
  if (efficiency === 'Underperforming') alerts.push({ type:'alert', text:`Underperforming — ${loadCount < 3 ? 'low load count' : 'low profit per mile'}` })
  const medExpiry = driver.medical_card_expiry ? new Date(driver.medical_card_expiry) : null
  if (medExpiry && medExpiry < new Date(Date.now() + 30 * 86400000)) alerts.push({ type:'alert', text:'Medical card expiring within 30 days' })
  const licExpiry = driver.license_expiry ? new Date(driver.license_expiry) : null
  if (licExpiry && licExpiry < new Date(Date.now() + 60 * 86400000)) alerts.push({ type:'alert', text:'CDL expiring within 60 days' })

  return {
    status, isIdle, currentLoad,
    totalGross, totalMiles, loadCount, profitPerLoad, profitPerDay, onTime, rpm: rpm.toFixed(2),
    efficiency, effColor, driverType, prefWeight, avgWeight: Math.round(avgWeight),
    topLanes, idleHours, insight, alerts,
    recentLoads: recentLoads.length,
  }
}

// Q Load-Driver matching: score how well a load matches a driver
export function qMatchScore(load, driver, qDriver) {
  let score = 50
  const reasons = []

  // Weight preference
  const weight = parseFloat(load.weight) || 0
  if (weight > 0 && weight <= (qDriver.prefWeight || 37000)) { score += 15; reasons.push('Weight within preferred range') }
  else if (weight > 40000) { score -= 10; reasons.push('Heavy load — exceeds preference') }

  // Lane match
  const loadOrigin = (load.origin || '').split(',')[0]?.trim() || ''
  const loadDest = (load.dest || load.destination || '').split(',')[0]?.trim() || ''
  const laneKey = `${loadOrigin} → ${loadDest}`
  if ((qDriver.topLanes || []).some(tl => tl.lane === laneKey)) { score += 20; reasons.push('Strong lane history') }

  // Driver efficiency
  if (qDriver.efficiency === 'High') { score += 10; reasons.push('High efficiency driver') }
  else if (qDriver.efficiency === 'Underperforming') { score -= 5 }

  // Idle bonus (idle drivers should get loads first)
  if (qDriver.isIdle) { score += 15; reasons.push('Currently idle — available immediately') }
  if (qDriver.idleHours > 12) { score += 5; reasons.push('Extended idle time') }

  // Profit match
  const gross = load.gross || load.gross_pay || 0
  const miles = parseFloat(load.miles) || 0
  const loadRPM = miles > 0 ? gross / miles : 0
  if (loadRPM >= 2.5) { score += 10; reasons.push('High-profit load') }

  return { score: Math.min(Math.max(score, 0), 100), reasons }
}

export const Q_STATUS_COLORS = {
  IDLE: { bg:'rgba(74,85,112,0.12)', color:'var(--muted)', label:'IDLE' },
  ASSIGNED: { bg:'rgba(240,165,0,0.12)', color:'var(--accent)', label:'ASSIGNED' },
  MOVING: { bg:'rgba(52,176,104,0.12)', color:'var(--success)', label:'MOVING' },
  DELIVERING: { bg:'rgba(0,212,170,0.12)', color:'var(--accent2)', label:'DELIVERING' },
}

export function getQEffIcons() { return { 'High': TrendingUp, 'Normal': Activity, 'Underperforming': TrendingDown } }

export const PAY_MODELS = [
  { id: 'percent', label: '% of Gross', desc: 'e.g. 28%' },
  { id: 'permile', label: 'Per Mile',   desc: 'e.g. $0.52/mi' },
  { id: 'flat',    label: 'Flat / Load', desc: 'e.g. $900/load' },
]

export const DEDUCT_PRESETS = ['Fuel Advance', 'Lumper Reimbursement', 'Escrow Hold', 'Toll Reimbursement', 'Violation / Fine', 'Other']

export function calcPay(load, model, val) {
  if (model === 'percent') return Math.round(load.gross * (val / 100))
  if (model === 'permile')  return Math.round(load.miles * val)
  return val // flat
}

// ─── DAT ALERT BOT ────────────────────────────────────────────────────────────
export const DAT_API = import.meta.env.VITE_DAT_API_URL || ''

export const DAT_EQUIP_OPTS = ['All', 'Dry Van', 'Reefer', 'Flatbed']

export function scoreColor(s) {
  return s >= 80 ? 'var(--success)' : s >= 65 ? 'var(--accent)' : 'var(--danger)'
}

export function ageLabel(postedAgo) {
  if (postedAgo < 1)  return 'Just posted'
  if (postedAgo < 60) return `${postedAgo}m ago`
  return `${Math.round(postedAgo/60)}h ago`
}

export function urgencyStyle(score, postedAgo) {
  if (score >= 88 && postedAgo < 10) return { label:'BOOK NOW', bg:'rgba(239,68,68,0.12)', border:'rgba(239,68,68,0.35)', text:'var(--danger)' }
  if (score >= 78)                   return { label:'ACT FAST', bg:'rgba(240,165,0,0.10)', border:'rgba(240,165,0,0.30)', text:'var(--accent)' }
  return                                    { label:'GOOD LOAD', bg:'rgba(34,197,94,0.08)', border:'rgba(34,197,94,0.25)', text:'var(--success)' }
}
