import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { fetchLoads as dbFetchLoads } from '../lib/database'
import { useApp } from '../context/AppContext'
import { Users, Truck, Building2, Package, TrendingUp, DollarSign, ArrowUpRight, Activity, AlertTriangle, CheckCircle, UserPlus, Clock, CreditCard, BarChart2, Shield, Zap, ArrowDown, ArrowUp, Brain, Target, ChevronRight, Lightbulb, Cpu, PieChart, Crown, HeartPulse, ShieldAlert, Eye, RefreshCw, Wrench, XCircle, Terminal, Send, Radio, ToggleLeft, ToggleRight, Megaphone, Play } from 'lucide-react'
import { apiFetch } from '../lib/api'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export default function Dashboard() {
  const { navigatePage, showToast } = useApp()
  const [profiles, setProfiles] = useState([])
  const [loads, setLoads] = useState([])
  const [tickets, setTickets] = useState([])
  const [invoices, setInvoices] = useState([])
  const [waitlist, setWaitlist] = useState([])
  const [aiFees, setAiFees] = useState([])
  const [loading, setLoading] = useState(true)

  // Q Command Center state
  const [actionLog, setActionLog] = useState([])
  const [aiMode, setAiMode] = useState(() => localStorage.getItem('q_ai_mode') || 'assisted')
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [broadcastGroup, setBroadcastGroup] = useState('all')
  const [cmdBusy, setCmdBusy] = useState(null)

  const logAction = (label, result) => {
    setActionLog(prev => [{ label, result, time: new Date().toLocaleTimeString() }, ...prev].slice(0, 10))
  }

  const execCommand = async (id, label, fn) => {
    setCmdBusy(id)
    try { await fn(); logAction(label, 'Executed'); showToast('', 'Action Executed', label) }
    catch (e) { logAction(label, 'Failed: ' + (e.message || 'error')); showToast('', 'Action Failed', e.message || 'Unknown error') }
    setCmdBusy(null)
  }

  useEffect(() => {
    async function fetchData() {
      const [pRes, loadsData, tRes, iRes, wRes, afRes] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at', { ascending: false }),
        dbFetchLoads(),
        supabase.from('tickets').select('*').eq('status', 'open'),
        supabase.from('invoices').select('*'),
        supabase.from('waitlist').select('*', { count: 'exact', head: true }),
        supabase.from('q_ai_fees').select('*').order('created_at', { ascending: false }),
      ])
      setProfiles(pRes.data || [])
      setLoads(loadsData || [])
      setTickets(tRes.data || [])
      setInvoices(iRes.data || [])
      setWaitlist(wRes)
      setAiFees(afRes.data || [])
      setLoading(false)
    }
    fetchData()
  }, [])

  const carriers = profiles.filter(p => p.role === 'carrier')
  const brokers = profiles.filter(p => p.role === 'broker')
  const activeLoads = loads.filter(l => l.status !== 'delivered' && l.status !== 'cancelled')
  const recentSignups = profiles.slice(0, 8)
  const pendingUsers = profiles.filter(p => p.status === 'pending')
  const openTickets = tickets.length
  const trialUsers = profiles.filter(p => p.status === 'trial')
  const activeUsers = profiles.filter(p => p.status === 'active')
  const waitlistCount = (waitlist?.count || 0)

  // Revenue calculations
  const totalRevenue = invoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0)
  const paidInvoices = invoices.filter(i => i.status === 'Paid')
  const totalPaid = paidInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0)

  // MRR — only count users with an active Stripe subscription (subscription_status === 'active')
  const planPrices = { autonomous_fleet: 199, autopilot: 199, autopilot_ai: 199, solo: 199, fleet: 199, enterprise: 199, growing: 199, pro: 199 }
  const payingUsers = profiles.filter(p => p.subscription_status === 'active' && p.plan && p.plan !== 'trial' && p.plan !== 'owner')
  const mrr = payingUsers.reduce((sum, u) => {
    const truckCount = parseInt(u.truck_count) || 1
    return sum + ((planPrices[u.plan] || 399) * truckCount)
  }, 0)

  // Churn rate (users who cancelled / total who ever subscribed)
  const cancelledUsers = profiles.filter(p => p.status === 'cancelled' || p.status === 'suspended')
  const everPaid = payingUsers.length + cancelledUsers.length
  const churnRate = everPaid > 0 ? ((cancelledUsers.length / everPaid) * 100).toFixed(1) : '0.0'

  // Trial conversion rate — only count actual Stripe-paying users as converted
  const totalTrials = trialUsers.length + payingUsers.length
  const conversionRate = totalTrials > 0 ? Math.round((payingUsers.length / totalTrials) * 100) : 0

  // Signups today
  const today = new Date().toDateString()
  const signupsToday = profiles.filter(p => new Date(p.created_at).toDateString() === today).length

  // Signups this week
  const weekAgo = new Date(Date.now() - 7 * 86400000)
  const signupsThisWeek = profiles.filter(p => new Date(p.created_at) > weekAgo).length

  // ── Q Intelligence Analysis ──
  const activatedUsers = profiles.filter(p => {
    const userLoads = loads.filter(l => l.owner_id === p.id)
    return userLoads.length > 0
  })
  const inactiveUsers = profiles.filter(p => {
    const userLoads = loads.filter(l => l.owner_id === p.id)
    return userLoads.length === 0 && p.role === 'carrier'
  })
  const activationRate = carriers.length > 0 ? Math.round((activatedUsers.filter(u => u.role === 'carrier').length / carriers.length) * 100) : 0

  // Q Insight — dynamic based on data
  const qInsight = (() => {
    if (mrr === 0 && payingUsers.length === 0) return { level: 'warning', title: 'No Revenue Yet', body: 'Q detects zero paying subscribers. Focus on converting ' + trialUsers.length + ' trial users — reach out with onboarding help or demos.', action: 'Review trial users', actionPage: 'carriers' }
    if (parseFloat(churnRate) > 10) return { level: 'critical', title: 'High Churn Detected', body: 'Churn rate is ' + churnRate + '% — well above healthy SaaS benchmarks (3-5%). Q recommends reaching out to recently cancelled users for exit interviews.', action: 'View churned users', actionPage: 'carriers' }
    if (conversionRate < 30 && trialUsers.length > 3) return { level: 'warning', title: 'Low Trial Conversion', body: 'Only ' + conversionRate + '% of trials convert to paid. With ' + trialUsers.length + ' active trials, improving onboarding could add $' + (trialUsers.length * 199) + '/mo in MRR.', action: 'Improve onboarding', actionPage: 'carriers' }
    if (activationRate < 50 && carriers.length > 2) return { level: 'info', title: 'Activation Gap', body: activationRate + '% of carriers have booked a load. ' + inactiveUsers.length + ' carriers signed up but never used the platform — automated follow-up could re-engage them.', action: 'View inactive carriers', actionPage: 'carriers' }
    if (signupsThisWeek > 5) return { level: 'positive', title: 'Strong Growth Week', body: signupsThisWeek + ' signups this week — momentum is building. Q suggests preparing onboarding resources and monitoring first-load activation.', action: 'View signups', actionPage: 'carriers' }
    return { level: 'positive', title: 'Platform Healthy', body: 'Q sees ' + carriers.length + ' carriers, $' + mrr.toLocaleString() + ' MRR, and ' + conversionRate + '% trial conversion. Systems nominal.', action: 'View analytics', actionPage: 'analytics' }
  })()

  // Q Recommended Actions — max 3
  const qActions = []
  if (pendingUsers.length > 0) qActions.push({ icon: UserPlus, label: 'Approve ' + pendingUsers.length + ' pending user(s)', priority: 'high', page: 'carriers' })
  if (inactiveUsers.length > 0) qActions.push({ icon: Target, label: 'Re-engage ' + inactiveUsers.length + ' inactive carrier(s)', priority: 'medium', page: 'carriers' })
  if (trialUsers.length > 0 && conversionRate < 50) qActions.push({ icon: Zap, label: 'Convert ' + trialUsers.length + ' trial(s) — potential $' + (trialUsers.length * 199).toLocaleString() + '/mo', priority: 'medium', page: 'carriers' })
  if (openTickets > 0) qActions.push({ icon: AlertTriangle, label: 'Resolve ' + openTickets + ' open ticket(s)', priority: 'high', page: 'support' })
  if (waitlistCount > 0) qActions.push({ icon: Users, label: 'Invite ' + waitlistCount + ' waitlist prospects', priority: 'low', page: 'waitlist' })

  // ── Q Growth Engine ──
  const activatedCarriers = activatedUsers.filter(u => u.role === 'carrier')
  const signupToActivation = carriers.length > 0 ? Math.round((activatedCarriers.length / carriers.length) * 100) : 0
  const activationToPaying = activatedCarriers.length > 0 ? Math.round((payingUsers.length / activatedCarriers.length) * 100) : 0

  // Time to first load (avg days from signup to first load)
  const timeToFirstLoad = (() => {
    const times = activatedCarriers.map(u => {
      const userLoads = loads.filter(l => l.owner_id === u.id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      if (!userLoads.length || !u.created_at) return null
      const diff = (new Date(userLoads[0].created_at) - new Date(u.created_at)) / 86400000
      return diff >= 0 ? diff : null
    }).filter(Boolean)
    if (!times.length) return null
    return (times.reduce((s, t) => s + t, 0) / times.length).toFixed(1)
  })()

  // Top dropoff point
  const dropoff = (() => {
    const totalSignups = carriers.length
    if (totalSignups === 0) return { stage: 'No data', pct: 0 }
    const afterSignup = totalSignups - activatedCarriers.length
    const afterActivation = activatedCarriers.length - payingUsers.length
    if (afterSignup >= afterActivation) return { stage: 'After signup (before first load)', pct: totalSignups > 0 ? Math.round((afterSignup / totalSignups) * 100) : 0, lost: afterSignup }
    return { stage: 'After activation (before paying)', pct: activatedCarriers.length > 0 ? Math.round((afterActivation / activatedCarriers.length) * 100) : 0, lost: afterActivation }
  })()

  // Q Growth Insight — dynamic
  const qGrowthInsight = (() => {
    if (carriers.length === 0) return { title: 'No carriers yet', body: 'Q is waiting for first carrier signup to begin tracking growth.', action: 'Invite carriers', actionPage: 'carriers' }
    if (signupToActivation < 30) return { title: 'Users signing up but not booking loads', body: `Only ${signupToActivation}% of carriers book their first load. ${inactiveUsers.length} carrier(s) never used the platform. Improve onboarding or guide first load.`, action: 'Fix onboarding', actionPage: 'carriers' }
    if (activationToPaying < 40 && activatedCarriers.length > 0) return { title: 'Users active but not converting to paid', body: `${activationToPaying}% of activated carriers become paying. Highlight value before trial ends — automated trial-ending emails could help.`, action: 'Boost conversions', actionPage: 'carriers' }
    if (timeToFirstLoad && parseFloat(timeToFirstLoad) > 3) return { title: 'Slow activation — users take too long', body: `Average ${timeToFirstLoad} days from signup to first load. Reduce friction with guided onboarding and demo loads.`, action: 'Speed up activation', actionPage: 'carriers' }
    return { title: 'Growth funnel healthy', body: `${signupToActivation}% activation, ${activationToPaying}% conversion to paid. Keep monitoring for changes.`, action: 'View analytics', actionPage: 'analytics' }
  })()

  // ── Q Revenue + AI Intelligence ──
  const totalAIRevenue = aiFees.reduce((sum, f) => sum + (parseFloat(f.fee_amount) || 0), 0)
  const chargedAIFees = aiFees.filter(f => f.stripe_status === 'charged' || f.stripe_status === 'paid')
  const chargedAIRevenue = chargedAIFees.reduce((sum, f) => sum + (parseFloat(f.fee_amount) || 0), 0)
  const pendingAIFees = aiFees.filter(f => f.stripe_status === 'pending' || !f.stripe_status)
  const pendingAIRevenue = pendingAIFees.reduce((sum, f) => sum + (parseFloat(f.fee_amount) || 0), 0)
  const subscriptionRevenue = mrr
  const combinedRevenue = subscriptionRevenue + chargedAIRevenue

  // AI usage stats
  const totalAILoads = aiFees.length
  const aiBookedLoads = aiFees.filter(f => f.feature_used === 'dispatch' || f.feature_used === 'auto_dispatch').length
  const aiInfluencedLoads = aiFees.filter(f => f.feature_used && f.feature_used !== 'dispatch').length

  // Revenue per user
  const revenuePerUser = payingUsers.length > 0 ? Math.round(combinedRevenue / payingUsers.length) : 0
  const aiRevenuePerUser = payingUsers.length > 0 ? Math.round(chargedAIRevenue / payingUsers.length) : 0

  // AI usage percentage
  const deliveredLoads = loads.filter(l => l.status === 'delivered' || l.status === 'Delivered')
  const aiUsagePct = deliveredLoads.length > 0 ? Math.round((totalAILoads / deliveredLoads.length) * 100) : 0

  // Top paying accounts
  const accountRevenue = carriers.map(c => {
    const userFees = aiFees.filter(f => f.owner_id === c.id)
    const userAIRev = userFees.reduce((s, f) => s + (parseFloat(f.fee_amount) || 0), 0)
    const userSubRev = (payingUsers.find(p => p.id === c.id)) ? (planPrices[c.plan] || 0) * (parseInt(c.truck_count) || 1) : 0
    const userTotalRev = userSubRev + userAIRev
    const userAIPct = userTotalRev > 0 ? Math.round((userAIRev / userTotalRev) * 100) : 0
    return { id: c.id, name: c.company_name || c.full_name || c.email?.split('@')[0] || 'Unknown', revenue: userTotalRev, aiRevenue: userAIRev, aiPct: userAIPct, loads: userFees.length }
  }).filter(a => a.revenue > 0).sort((a, b) => b.revenue - a.revenue).slice(0, 5)

  // Weekly trends
  const thisWeekFees = aiFees.filter(f => f.created_at && new Date(f.created_at) > weekAgo)
  const lastWeekStart = new Date(Date.now() - 14 * 86400000)
  const lastWeekFees = aiFees.filter(f => f.created_at && new Date(f.created_at) > lastWeekStart && new Date(f.created_at) <= weekAgo)
  const thisWeekAIRev = thisWeekFees.reduce((s, f) => s + (parseFloat(f.fee_amount) || 0), 0)
  const lastWeekAIRev = lastWeekFees.reduce((s, f) => s + (parseFloat(f.fee_amount) || 0), 0)
  const aiRevTrend = lastWeekAIRev > 0 ? Math.round(((thisWeekAIRev - lastWeekAIRev) / lastWeekAIRev) * 100) : (thisWeekAIRev > 0 ? 100 : 0)
  const aiUsageTrend = lastWeekFees.length > 0 ? Math.round(((thisWeekFees.length - lastWeekFees.length) / lastWeekFees.length) * 100) : (thisWeekFees.length > 0 ? 100 : 0)

  // Q Revenue Insight — dynamic
  const qRevenueInsight = (() => {
    if (combinedRevenue === 0) return { level: 'warning', title: 'No revenue generated yet', body: 'Revenue is $0 — focus on activating users and getting first loads delivered. Each delivered load generates 3% AI fee automatically.', action: 'View carriers', actionPage: 'carriers' }
    if (chargedAIRevenue === 0 && mrr > 0) return { level: 'info', title: 'Users not using AI features', body: 'Subscription revenue is flowing but AI fee revenue is $0. Users are not dispatching loads through Q. Promote auto-dispatch to unlock AI revenue.', action: 'View analytics', actionPage: 'analytics' }
    if (aiUsagePct < 30 && deliveredLoads.length > 3) return { level: 'warning', title: 'AI usage low', body: `Only ${aiUsagePct}% of delivered loads went through Q. Encouraging auto-dispatch could increase AI revenue by ${Math.round((deliveredLoads.length * 0.7 - totalAILoads) * 100)}+ dollars.`, action: 'Promote AI features', actionPage: 'carriers' }
    if (aiUsagePct > 70) return { level: 'positive', title: 'AI driving ' + aiUsagePct + '% of bookings', body: `Q is handling ${totalAILoads} loads generating $${chargedAIRevenue.toLocaleString()} in AI fees. Highlight this value in onboarding to retain users.`, action: 'View revenue', actionPage: 'payments' }
    return { level: 'positive', title: 'Revenue increasing', body: `$${combinedRevenue.toLocaleString()} combined revenue — $${subscriptionRevenue.toLocaleString()} subscriptions + $${chargedAIRevenue.toLocaleString()} AI fees. Growth opportunity in expanding AI adoption.`, action: 'Revenue details', actionPage: 'payments' }
  })()

  // ── Q System Health + Risk Detection ──
  const activeToday = profiles.filter(p => p.last_sign_in_at && new Date(p.last_sign_in_at).toDateString() === today).length
  const activeThisWeek = profiles.filter(p => p.last_sign_in_at && new Date(p.last_sign_in_at) > weekAgo).length
  const returningUsers = profiles.filter(p => {
    if (!p.last_sign_in_at || !p.created_at) return false
    const signIn = new Date(p.last_sign_in_at)
    const created = new Date(p.created_at)
    return signIn > weekAgo && (signIn - created) > 7 * 86400000
  }).length
  const inactiveTotal = carriers.length - activeThisWeek

  // AI performance
  const aiSuccessLoads = aiFees.filter(f => f.stripe_status === 'charged' || f.stripe_status === 'paid')
  const aiFailedLoads = aiFees.filter(f => f.stripe_status === 'failed' || f.stripe_status === 'error')
  const aiSuccessRate = aiFees.length > 0 ? Math.round((aiSuccessLoads.length / aiFees.length) * 100) : 100
  const aiFailRate = 100 - aiSuccessRate

  // Revenue trend (this week vs last week total revenue)
  const thisWeekInvoices = invoices.filter(i => i.created_at && new Date(i.created_at) > weekAgo)
  const lastWeekInvoices = invoices.filter(i => i.created_at && new Date(i.created_at) > lastWeekStart && new Date(i.created_at) <= weekAgo)
  const thisWeekRev = thisWeekInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0) + thisWeekAIRev
  const lastWeekRev = lastWeekInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0) + lastWeekAIRev
  const revTrendPct = lastWeekRev > 0 ? Math.round(((thisWeekRev - lastWeekRev) / lastWeekRev) * 100) : 0

  // Failed invoices / payment issues
  const failedInvoices = invoices.filter(i => i.status === 'Failed' || i.status === 'failed' || i.status === 'overdue')

  // System health level
  const risks = []
  if (parseFloat(churnRate) > 10) risks.push({ level: 'critical', icon: XCircle, title: 'High churn rate: ' + churnRate + '%', impact: 'Revenue loss — users leaving faster than joining', action: 'Review onboarding and engagement', page: 'carriers' })
  if (activationRate < 30 && carriers.length > 2) risks.push({ level: 'critical', icon: AlertTriangle, title: 'Low activation: ' + activationRate + '%', impact: 'Users sign up but never book loads', action: 'Improve first-load onboarding', page: 'carriers' })
  if (aiUsagePct < 20 && deliveredLoads.length > 3) risks.push({ level: 'warning', icon: Cpu, title: 'Low AI usage: ' + aiUsagePct + '%', impact: 'AI revenue potential unrealized', action: 'Promote auto-dispatch feature', page: 'carriers' })
  if (revTrendPct < -15) risks.push({ level: 'critical', icon: DollarSign, title: 'Revenue decreased ' + Math.abs(revTrendPct) + '%', impact: 'Week-over-week revenue declining', action: 'Check activation and AI usage', page: 'payments' })
  if (inactiveTotal > carriers.length * 0.6 && carriers.length > 3) risks.push({ level: 'warning', icon: Users, title: 'Inactive user spike: ' + inactiveTotal + ' dormant', impact: 'Majority of carriers not active this week', action: 'Send re-engagement campaign', page: 'carriers' })
  if (failedInvoices.length > 0) risks.push({ level: 'warning', icon: CreditCard, title: failedInvoices.length + ' failed payment(s)', impact: 'Revenue leakage from payment failures', action: 'Review failed invoices', page: 'payments' })
  if (aiFailedLoads.length > 0) risks.push({ level: 'warning', icon: Cpu, title: aiFailedLoads.length + ' AI fee charge failure(s)', impact: 'AI revenue not collected', action: 'Check Stripe integration', page: 'payments' })
  if (pendingUsers.length > 3) risks.push({ level: 'info', icon: Clock, title: pendingUsers.length + ' users awaiting approval', impact: 'Delayed onboarding reduces activation', action: 'Approve pending users', page: 'carriers' })

  const systemHealth = risks.some(r => r.level === 'critical') ? 'critical' : risks.some(r => r.level === 'warning') ? 'warning' : 'healthy'

  // System alerts feed
  const systemAlerts = []
  if (failedInvoices.length > 0) systemAlerts.push({ icon: CreditCard, severity: 'critical', title: 'Payment failure detected', detail: failedInvoices.length + ' invoice(s) failed', action: 'Review payments', page: 'payments' })
  if (aiFailedLoads.length > 0) systemAlerts.push({ icon: Cpu, severity: 'warning', title: 'AI charge failure', detail: aiFailedLoads.length + ' fee(s) not collected', action: 'Check Stripe', page: 'payments' })
  if (revTrendPct < -10) systemAlerts.push({ icon: TrendingUp, severity: 'warning', title: 'Revenue declining', detail: Math.abs(revTrendPct) + '% drop vs last week', action: 'Investigate', page: 'payments' })
  if (inactiveTotal > carriers.length * 0.5 && carriers.length > 2) systemAlerts.push({ icon: Users, severity: 'warning', title: 'User engagement drop', detail: inactiveTotal + ' carriers inactive this week', action: 'Re-engage users', page: 'carriers' })
  if (openTickets > 3) systemAlerts.push({ icon: AlertTriangle, severity: 'info', title: 'Support queue growing', detail: openTickets + ' open tickets', action: 'Review tickets', page: 'support' })
  if (systemAlerts.length === 0) systemAlerts.push({ icon: CheckCircle, severity: 'ok', title: 'No issues detected', detail: 'All systems running normally', action: null, page: null })

  // Quick fix actions
  const quickFixes = []
  if (activationRate < 40 && carriers.length > 1) quickFixes.push({ icon: Wrench, label: 'Review onboarding flow', page: 'carriers' })
  if (aiUsagePct < 30 && deliveredLoads.length > 1) quickFixes.push({ icon: Cpu, label: 'Enable auto-dispatch tips', page: 'carriers' })
  if (inactiveTotal > 2) quickFixes.push({ icon: RefreshCw, label: 'Send re-engagement notifications', page: 'carriers' })
  if (pendingUsers.length > 0) quickFixes.push({ icon: UserPlus, label: 'Approve ' + pendingUsers.length + ' pending user(s)', page: 'carriers' })
  if (failedInvoices.length > 0) quickFixes.push({ icon: CreditCard, label: 'Retry failed payments', page: 'payments' })

  const topStats = [
    { label: 'Total Carriers', value: carriers.length.toString(), sub: activeUsers.filter(u => u.role === 'carrier').length + ' active', color: 'var(--success)', icon: Truck },
    { label: 'Active Subscriptions', value: payingUsers.length.toString(), sub: trialUsers.length + ' on trial', color: 'var(--accent)', icon: CreditCard },
    { label: 'Monthly Revenue (MRR)', value: '$' + mrr.toLocaleString(), sub: payingUsers.length + ' paying users', color: 'var(--accent)', icon: DollarSign },
    { label: 'Churn Rate', value: churnRate + '%', sub: cancelledUsers.length + ' churned', color: parseFloat(churnRate) > 5 ? 'var(--danger)' : 'var(--success)', icon: TrendingUp },
    { label: 'Trial Conversions', value: conversionRate + '%', sub: payingUsers.length + '/' + totalTrials + ' converted', color: conversionRate > 50 ? 'var(--success)' : 'var(--warning)', icon: Zap },
    { label: 'Total Revenue', value: '$' + totalPaid.toLocaleString(), sub: paidInvoices.length + ' paid invoices', color: 'var(--accent2)', icon: BarChart2 },
  ]

  const alerts = [
    ...(signupsToday > 0 ? [{ icon: UserPlus, color: 'var(--success)', bg: 'rgba(34,197,94,0.04)', border: 'var(--success)', title: signupsToday + ' new signup(s) today', sub: signupsThisWeek + ' this week' }] : []),
    ...(pendingUsers.length > 0 ? [{ icon: AlertTriangle, color: 'var(--danger)', bg: 'rgba(239,68,68,0.04)', border: 'var(--danger)', title: pendingUsers.length + ' user(s) pending approval', sub: 'Review and approve new signups', onClick: () => navigatePage('carriers') }] : []),
    ...(openTickets > 0 ? [{ icon: AlertTriangle, color: 'var(--warning)', bg: 'rgba(245,158,11,0.04)', border: 'var(--warning)', title: openTickets + ' open support ticket(s)', sub: 'Check support queue', onClick: () => navigatePage('support') }] : []),
    ...(trialUsers.length > 0 ? [{ icon: Clock, color: 'var(--accent3)', bg: 'rgba(77,142,240,0.04)', border: 'var(--accent3)', title: trialUsers.length + ' trial(s) expiring soon', sub: 'Follow up to convert' }] : []),
    ...(waitlistCount > 0 ? [{ icon: Users, color: 'var(--accent2)', bg: 'rgba(0,212,170,0.04)', border: 'var(--accent2)', title: waitlistCount + ' people on waitlist', sub: 'Invite them to the platform', onClick: () => navigatePage('waitlist') }] : []),
    { icon: CheckCircle, color: 'var(--success)', bg: 'rgba(34,197,94,0.04)', border: 'var(--success)', title: 'Platform running smoothly', sub: 'All systems operational' },
  ]

  const formatDate = (d) => {
    if (!d) return ''
    const date = new Date(d)
    const now = new Date()
    const diff = now - date
    if (diff < 3600000) return Math.floor(diff / 60000) + 'min ago'
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'hr ago'
    if (diff < 172800000) return 'Yesterday'
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  if (loading) return (
    <div style={{ padding: 40, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {[1,2,3].map(i => (
        <div key={i} style={{ height: 80, background: 'var(--surface)', borderRadius: 12, animation: 'pulse 1.5s ease-in-out infinite' }} />
      ))}
      <style>{`@keyframes pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 0.8 } }`}</style>
    </div>
  )

  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Platform banner */}
      <div className="ai-banner fade-in">
        <div className="ai-pulse" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic icon={Activity} size={20} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--accent)', marginBottom: 3 }}>Q Platform — All Systems Operational</div>
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>{carriers.length} carriers · {brokers.length} brokers · {activeLoads.length} active loads · ${mrr.toLocaleString()} MRR · {activationRate}% activation</div>
        </div>
        <button className="btn btn-primary" onClick={() => navigatePage('carriers')}>
          <Ic icon={UserPlus} size={14} /> Invite User
        </button>
      </div>

      {/* Q Business Insight */}
      <div className="fade-in" style={{
        padding: '16px 20px', borderRadius: 12,
        background: qInsight.level === 'critical' ? 'rgba(239,68,68,0.06)' : qInsight.level === 'warning' ? 'rgba(245,158,11,0.06)' : qInsight.level === 'positive' ? 'rgba(34,197,94,0.06)' : 'rgba(77,142,240,0.06)',
        border: '1px solid ' + (qInsight.level === 'critical' ? 'rgba(239,68,68,0.2)' : qInsight.level === 'warning' ? 'rgba(245,158,11,0.2)' : qInsight.level === 'positive' ? 'rgba(34,197,94,0.2)' : 'rgba(77,142,240,0.2)'),
        display: 'flex', alignItems: 'center', gap: 16
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: qInsight.level === 'critical' ? 'rgba(239,68,68,0.15)' : qInsight.level === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(240,165,0,0.15)'
        }}>
          <Ic icon={Brain} size={20} color={qInsight.level === 'critical' ? 'var(--danger)' : qInsight.level === 'warning' ? 'var(--warning)' : 'var(--accent)'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: qInsight.level === 'critical' ? 'var(--danger)' : qInsight.level === 'warning' ? 'var(--warning)' : 'var(--accent)', marginBottom: 2 }}>
            Q INSIGHT — {qInsight.title}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5 }}>{qInsight.body}</div>
        </div>
        <button className="btn btn-primary" style={{ flexShrink: 0, fontSize: 12 }} onClick={() => navigatePage(qInsight.actionPage)}>
          {qInsight.action} <Ic icon={ChevronRight} size={12} />
        </button>
      </div>

      {/* Q Activation + Recommended Actions */}
      <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {/* Activation Tracking */}
        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-header">
            <div className="panel-title"><Ic icon={Target} size={14} /> Q Activation Tracking</div>
            <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: activationRate > 60 ? 'var(--success)' : activationRate > 30 ? 'var(--warning)' : 'var(--danger)' }}>{activationRate}%</span>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Total Carriers', value: carriers.length, color: 'var(--accent)' },
              { label: 'Activated (booked load)', value: activatedUsers.filter(u => u.role === 'carrier').length, color: 'var(--success)' },
              { label: 'Inactive (no loads)', value: inactiveUsers.length, color: 'var(--danger)' },
            ].map(r => (
              <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.label}</span>
                <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: r.color }}>{r.value}</span>
              </div>
            ))}
            <div style={{ height: 6, background: 'var(--border)', borderRadius: 3, marginTop: 4 }}>
              <div style={{ width: Math.max(activationRate, 2) + '%', height: '100%', background: activationRate > 60 ? 'var(--success)' : activationRate > 30 ? 'var(--warning)' : 'var(--danger)', borderRadius: 3, transition: 'width 0.5s' }} />
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center' }}>{activationRate}% of carriers have booked at least one load</div>
          </div>
        </div>

        {/* Q Recommended Actions */}
        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-header">
            <div className="panel-title"><Ic icon={Lightbulb} size={14} /> Q Recommended Actions</div>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {qActions.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                <Ic icon={CheckCircle} size={20} color="var(--success)" style={{ marginBottom: 8 }} /><br />
                All clear — no urgent actions needed.
              </div>
            ) : qActions.slice(0, 3).map((a, i) => (
              <div key={i} style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                background: a.priority === 'high' ? 'rgba(239,68,68,0.04)' : 'rgba(240,165,0,0.04)',
                borderLeft: '3px solid ' + (a.priority === 'high' ? 'var(--danger)' : a.priority === 'medium' ? 'var(--warning)' : 'var(--accent2)'),
                display: 'flex', alignItems: 'center', gap: 10
              }} onClick={() => navigatePage(a.page)}>
                <Ic icon={a.icon} size={14} color={a.priority === 'high' ? 'var(--danger)' : 'var(--warning)'} />
                <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{a.label}</span>
                <Ic icon={ChevronRight} size={12} color="var(--muted)" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* KPI cards - 6 columns */}
      <div className="stats-grid cols6 fade-in">
        {topStats.map(s => (
          <div key={s.label} className="stat-card" style={{ cursor: 'pointer' }} onClick={() => {
            if (s.label.includes('Carrier')) navigatePage('carriers')
            else if (s.label.includes('Revenue') || s.label.includes('MRR')) navigatePage('payments')
            else if (s.label.includes('Subscription')) navigatePage('payments')
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div className="stat-label" style={{ marginBottom: 0 }}>{s.label}</div>
              <Ic icon={s.icon} size={14} color="var(--muted)" />
            </div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className="stat-change up" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <Ic icon={ArrowUpRight} size={11} /> {s.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Revenue mini chart + activity */}
      <div className="grid2 fade-in">
        {/* Revenue trend - visual bar chart */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title"><Ic icon={TrendingUp} size={14} /> Revenue Trend (Last 7 Days)</div>
            <button className="btn btn-ghost" onClick={() => navigatePage('payments')}>View Revenue</button>
          </div>
          <div style={{ padding: 16 }}>
            <RevenueMiniChart invoices={invoices} profiles={profiles} />
          </div>
          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', background: 'rgba(240,165,0,0.03)' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Ic icon={Brain} size={12} color="var(--accent)" />
              <span><strong style={{ color: 'var(--accent)' }}>Q:</strong> {
                mrr === 0 ? 'No recurring revenue yet. First paying subscriber unlocks MRR tracking.' :
                payingUsers.length < 5 ? `$${mrr.toLocaleString()} MRR from ${payingUsers.length} subscriber${payingUsers.length > 1 ? 's' : ''}. Each new carrier adds ~$199/mo.` :
                `$${mrr.toLocaleString()} MRR growing. At current pace, projected $${(mrr * 1.15).toLocaleString()}/mo next month.`
              }</span>
            </div>
          </div>
        </div>

        {/* Alerts */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title"><Ic icon={AlertTriangle} size={14} /> Alerts & Activity</div>
            {pendingUsers.length > 0 && <span style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 700, background: 'rgba(239,68,68,0.1)', padding: '2px 8px', borderRadius: 20 }}>{pendingUsers.length} Pending</span>}
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {alerts.map(a => (
              <div key={a.title} style={{ padding: '10px 12px', borderRadius: 8, borderLeft: '3px solid ' + a.border, background: a.bg, cursor: a.onClick ? 'pointer' : 'default' }}
                onClick={a.onClick}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 2, display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={a.icon} size={14} color={a.color} /> {a.title}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>{a.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid2 fade-in">
        {/* Recent signups */}
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title"><Ic icon={UserPlus} size={14} /> Recent Signups</div>
            <button className="btn btn-ghost" onClick={() => navigatePage('carriers')}>View All</button>
          </div>
          {recentSignups.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No users yet. Share qivori.com to get signups!</div>
          ) : (
            <table>
              <thead><tr><th>Name</th><th>Type</th><th>Plan</th><th>Status</th><th>Date</th></tr></thead>
              <tbody>
                {recentSignups.map(s => (
                  <tr key={s.id}>
                    <td>
                      <strong>{s.full_name || s.company_name || s.email?.split('@')[0]}</strong>
                      <div style={{ fontSize: 10, color: 'var(--muted)' }}>{s.email}</div>
                    </td>
                    <td>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                        background: s.role === 'carrier' ? 'rgba(34,197,94,0.1)' : s.role === 'broker' ? 'rgba(77,142,240,0.1)' : 'rgba(240,165,0,0.1)',
                        color: s.role === 'carrier' ? 'var(--success)' : s.role === 'broker' ? 'var(--accent3)' : 'var(--accent)' }}>
                        {s.role}
                      </span>
                    </td>
                    <td style={{ fontSize: 12 }}>{s.plan || 'trial'}</td>
                    <td>
                      <span className={'pill ' + (s.status === 'active' ? 'pill-green' : s.status === 'trial' ? 'pill-blue' : 'pill-yellow')}>
                        <span className="pill-dot" />{s.status}
                      </span>
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--muted)' }}>{formatDate(s.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* User breakdown */}
          <div className="panel">
            <div className="panel-header"><div className="panel-title"><Ic icon={Users} size={14} /> User Breakdown</div></div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                { label: 'Carriers', value: carriers.length, pct: profiles.length ? Math.round(carriers.length / profiles.length * 100) : 0, color: 'var(--success)' },
                { label: 'Brokers', value: brokers.length, pct: profiles.length ? Math.round(brokers.length / profiles.length * 100) : 0, color: 'var(--accent3)' },
                { label: 'Admins', value: profiles.filter(p => p.role === 'admin').length, pct: profiles.length ? Math.round(profiles.filter(p => p.role === 'admin').length / profiles.length * 100) : 0, color: 'var(--accent)' },
                { label: 'On Trial', value: trialUsers.length, pct: profiles.length ? Math.round(trialUsers.length / profiles.length * 100) : 0, color: 'var(--accent2)' },
              ].map(r => (
                <div key={r.label}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{r.label}</span>
                    <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: r.color }}>{r.value}</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                    <div style={{ width: Math.max(r.pct, 2) + '%', height: '100%', background: r.color, borderRadius: 3, transition: 'width 0.5s' }} />
                  </div>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>Total Users</span>
                <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: 'var(--accent)' }}>{profiles.length}</span>
              </div>
            </div>
          </div>

          {/* Quick actions */}
          <div className="panel">
            <div className="panel-header"><div className="panel-title"><Ic icon={Zap} size={14} /> Quick Actions</div></div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => navigatePage('waitlist')}>
                <Ic icon={Users} size={14} /> Manage Waitlist ({waitlistCount})
              </button>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => navigatePage('payments')}>
                <Ic icon={DollarSign} size={14} /> Revenue Dashboard
              </button>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => navigatePage('analytics')}>
                <Ic icon={BarChart2} size={14} /> View Analytics
              </button>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start' }} onClick={() => navigatePage('activity')}>
                <Ic icon={Shield} size={14} /> Activity Log
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Q Growth Engine ── */}
      <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>

        {/* User Funnel */}
        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-header">
            <div className="panel-title"><Ic icon={TrendingUp} size={14} /> User Funnel</div>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Funnel numbers */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Signups', value: carriers.length, color: 'var(--accent3)' },
                { label: 'Activated (booked load)', value: activatedCarriers.length, color: 'var(--accent)' },
                { label: 'Paying', value: payingUsers.length, color: 'var(--success)' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.label}</span>
                  <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: r.color }}>{r.value}</span>
                </div>
              ))}
            </div>

            {/* Visual funnel bar */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {[
                { label: 'Signups', value: carriers.length, color: 'var(--accent3)', bg: 'rgba(77,142,240,0.15)' },
                { label: 'Activated', value: activatedCarriers.length, color: 'var(--accent)', bg: 'rgba(240,165,0,0.15)' },
                { label: 'Paying', value: payingUsers.length, color: 'var(--success)', bg: 'rgba(34,197,94,0.15)' },
              ].map(r => {
                const maxW = Math.max(carriers.length, 1)
                const pct = Math.max((r.value / maxW) * 100, 4)
                return (
                  <div key={r.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 70, fontSize: 10, color: 'var(--muted)', textAlign: 'right', flexShrink: 0 }}>{r.label}</div>
                    <div style={{ flex: 1, height: 20, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ width: pct + '%', height: '100%', background: r.color, borderRadius: 4, transition: 'width 0.5s', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 6 }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#fff' }}>{r.value}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Conversion rates */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Signup → Activation</span>
                <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: signupToActivation > 50 ? 'var(--success)' : signupToActivation > 25 ? 'var(--warning)' : 'var(--danger)' }}>{signupToActivation}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Activation → Paying</span>
                <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: activationToPaying > 50 ? 'var(--success)' : activationToPaying > 25 ? 'var(--warning)' : 'var(--danger)' }}>{activationToPaying}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Time to First Load + Top Dropoff + Q Growth Insight */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Time to First Load */}
          <div className="panel" style={{ margin: 0 }}>
            <div className="panel-header">
              <div className="panel-title"><Ic icon={Clock} size={14} /> Time to First Load</div>
            </div>
            <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ width: 56, height: 56, borderRadius: 12, background: 'rgba(240,165,0,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span className="mono" style={{ fontSize: 20, fontWeight: 700, color: 'var(--accent)' }}>{timeToFirstLoad || '—'}</span>
              </div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{timeToFirstLoad ? timeToFirstLoad + ' days avg' : 'No data yet'}</div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                  <Ic icon={Brain} size={10} color="var(--accent)" style={{ verticalAlign: 'middle', marginRight: 4 }} />
                  {timeToFirstLoad === null ? 'Q needs activated carriers to calculate' :
                   parseFloat(timeToFirstLoad) <= 1 ? 'Q: Fast activation — users engage quickly' :
                   parseFloat(timeToFirstLoad) <= 3 ? 'Q: Healthy activation speed' :
                   'Q: Users take too long — reduce onboarding friction'}
                </div>
              </div>
            </div>
          </div>

          {/* Top Dropoff Point */}
          <div className="panel" style={{ margin: 0 }}>
            <div className="panel-header">
              <div className="panel-title"><Ic icon={ArrowDown} size={14} /> Top Dropoff Point</div>
            </div>
            <div style={{ padding: 16 }}>
              {carriers.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', padding: 10 }}>No carrier data yet</div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 10, background: dropoff.pct > 50 ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: dropoff.pct > 50 ? 'var(--danger)' : 'var(--warning)' }}>{dropoff.pct}%</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 2 }}>{dropoff.stage}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      <Ic icon={Brain} size={10} color="var(--accent)" style={{ verticalAlign: 'middle', marginRight: 4 }} />
                      Q: {dropoff.lost || 0} user(s) lost — {dropoff.pct > 50 ? 'onboarding friction too high' : 'conversion needs attention'}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Q Growth Insight */}
          <div className="panel" style={{ margin: 0, borderLeft: '3px solid var(--accent)' }}>
            <div className="panel-header">
              <div className="panel-title"><Ic icon={Brain} size={14} /> Q Growth Insight</div>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>{qGrowthInsight.title}</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.5, marginBottom: 12 }}>{qGrowthInsight.body}</div>
              <button className="btn btn-primary" style={{ fontSize: 11 }} onClick={() => navigatePage(qGrowthInsight.actionPage)}>
                {qGrowthInsight.action} <Ic icon={ChevronRight} size={11} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Q Revenue + AI Intelligence ── */}

      {/* Q Revenue Insight banner */}
      <div className="fade-in" style={{
        padding: '14px 20px', borderRadius: 12,
        background: qRevenueInsight.level === 'warning' ? 'rgba(245,158,11,0.06)' : qRevenueInsight.level === 'info' ? 'rgba(77,142,240,0.06)' : 'rgba(34,197,94,0.06)',
        border: '1px solid ' + (qRevenueInsight.level === 'warning' ? 'rgba(245,158,11,0.2)' : qRevenueInsight.level === 'info' ? 'rgba(77,142,240,0.2)' : 'rgba(34,197,94,0.2)'),
        display: 'flex', alignItems: 'center', gap: 14
      }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: 'rgba(240,165,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ic icon={DollarSign} size={18} color="var(--accent)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: qRevenueInsight.level === 'warning' ? 'var(--warning)' : qRevenueInsight.level === 'positive' ? 'var(--success)' : 'var(--accent)', marginBottom: 2 }}>
            Q REVENUE — {qRevenueInsight.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }}>{qRevenueInsight.body}</div>
        </div>
        <button className="btn btn-primary" style={{ flexShrink: 0, fontSize: 11 }} onClick={() => navigatePage(qRevenueInsight.actionPage)}>
          {qRevenueInsight.action} <Ic icon={ChevronRight} size={11} />
        </button>
      </div>

      <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>

        {/* Revenue Breakdown */}
        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-header">
            <div className="panel-title"><Ic icon={PieChart} size={14} /> Revenue Breakdown</div>
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {[
              { label: 'Subscription Revenue', value: subscriptionRevenue, color: 'var(--accent)', desc: payingUsers.length + ' paying plan(s)' },
              { label: 'AI Revenue (3% per load)', value: chargedAIRevenue, color: 'var(--success)', desc: chargedAIFees.length + ' charged fee(s)' },
              ...(pendingAIRevenue > 0 ? [{ label: 'AI Revenue (pending)', value: pendingAIRevenue, color: 'var(--warning)', desc: pendingAIFees.length + ' pending' }] : []),
            ].map(r => (
              <div key={r.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.label}</span>
                  <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: r.color }}>${r.value.toLocaleString()}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'right' }}>{r.desc}</div>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Total Revenue</span>
              <span className="mono" style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>${combinedRevenue.toLocaleString()}</span>
            </div>

            {/* Revenue split visual */}
            {combinedRevenue > 0 && (
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: Math.max((subscriptionRevenue / combinedRevenue) * 100, 2) + '%', height: '100%', background: 'var(--accent)', transition: 'width 0.5s' }} />
                <div style={{ width: Math.max((chargedAIRevenue / combinedRevenue) * 100, 2) + '%', height: '100%', background: 'var(--success)', transition: 'width 0.5s' }} />
              </div>
            )}
            {combinedRevenue > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)' }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--accent)', marginRight: 4, verticalAlign: 'middle' }} />Subscriptions {combinedRevenue > 0 ? Math.round((subscriptionRevenue / combinedRevenue) * 100) : 0}%</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--success)', marginRight: 4, verticalAlign: 'middle' }} />AI Fees {combinedRevenue > 0 ? Math.round((chargedAIRevenue / combinedRevenue) * 100) : 0}%</span>
              </div>
            )}

            {/* Revenue per user */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Revenue per user</span>
                <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>${revenuePerUser.toLocaleString()}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>AI revenue per user</span>
                <span className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--success)' }}>${aiRevenuePerUser.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Q AI Activity + Weekly Trend */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Q AI Activity */}
          <div className="panel" style={{ margin: 0 }}>
            <div className="panel-header">
              <div className="panel-title"><Ic icon={Cpu} size={14} /> Q AI Activity</div>
              <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>{totalAILoads} loads</span>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Total loads handled by Q', value: totalAILoads, color: 'var(--accent)' },
                { label: 'Loads booked by Q (dispatch)', value: aiBookedLoads, color: 'var(--success)' },
                { label: 'Loads influenced by Q', value: aiInfluencedLoads, color: 'var(--accent3)' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.label}</span>
                  <span className="mono" style={{ fontSize: 15, fontWeight: 700, color: r.color }}>{r.value}</span>
                </div>
              ))}
              {deliveredLoads.length > 0 && (
                <div style={{ marginTop: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>AI adoption rate</span>
                    <span className="mono" style={{ fontSize: 11, fontWeight: 700, color: aiUsagePct > 50 ? 'var(--success)' : aiUsagePct > 20 ? 'var(--warning)' : 'var(--danger)' }}>{aiUsagePct}%</span>
                  </div>
                  <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                    <div style={{ width: Math.max(aiUsagePct, 2) + '%', height: '100%', background: aiUsagePct > 50 ? 'var(--success)' : aiUsagePct > 20 ? 'var(--warning)' : 'var(--danger)', borderRadius: 3, transition: 'width 0.5s' }} />
                  </div>
                </div>
              )}
              {/* AI Revenue Driver insight */}
              <div style={{ marginTop: 6, padding: '8px 10px', borderRadius: 6, background: 'rgba(240,165,0,0.04)', borderLeft: '2px solid var(--accent)' }}>
                <div style={{ fontSize: 11, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Ic icon={Brain} size={10} color="var(--accent)" />
                  <strong style={{ color: 'var(--accent)' }}>Q:</strong>
                  {totalAILoads === 0 ? ' No AI-processed loads yet. Enable auto-dispatch for carriers.' :
                   aiUsagePct > 70 ? ` AI is driving ${aiUsagePct}% of bookings — highlight this value in onboarding.` :
                   aiUsagePct < 20 ? ' AI usage is low. Encourage users to enable auto-dispatch.' :
                   ` ${aiUsagePct}% AI adoption — growth opportunity in expanding auto-dispatch usage.`}
                </div>
              </div>
            </div>
          </div>

          {/* Weekly Trend */}
          <div className="panel" style={{ margin: 0 }}>
            <div className="panel-header">
              <div className="panel-title"><Ic icon={TrendingUp} size={14} /> Weekly Trend</div>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>AI Revenue</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>${thisWeekAIRev.toLocaleString()}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: aiRevTrend >= 0 ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Ic icon={aiRevTrend >= 0 ? ArrowUp : ArrowDown} size={10} />{Math.abs(aiRevTrend)}%
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>AI Usage (loads)</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="mono" style={{ fontSize: 13, fontWeight: 700 }}>{thisWeekFees.length}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: aiUsageTrend >= 0 ? 'var(--success)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: 2 }}>
                    <Ic icon={aiUsageTrend >= 0 ? ArrowUp : ArrowDown} size={10} />{Math.abs(aiUsageTrend)}%
                  </span>
                </div>
              </div>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, fontSize: 10, color: 'var(--muted)' }}>
                vs previous week: ${lastWeekAIRev.toLocaleString()} rev · {lastWeekFees.length} loads
              </div>
            </div>
          </div>

          {/* Top Accounts */}
          <div className="panel" style={{ margin: 0 }}>
            <div className="panel-header">
              <div className="panel-title"><Ic icon={Crown} size={14} /> Top Accounts</div>
            </div>
            <div style={{ padding: 12 }}>
              {accountRevenue.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>No revenue-generating accounts yet</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {accountRevenue.map((a, i) => (
                    <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 6, background: i === 0 ? 'rgba(240,165,0,0.04)' : 'transparent' }}>
                      <span className="mono" style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', width: 16 }}>#{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</div>
                        <div style={{ fontSize: 10, color: 'var(--muted)' }}>{a.loads} AI load{a.loads !== 1 ? 's' : ''}</div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div className="mono" style={{ fontSize: 12, fontWeight: 700 }}>${a.revenue.toLocaleString()}</div>
                        <div style={{ fontSize: 10, color: a.aiPct > 50 ? 'var(--success)' : 'var(--muted)' }}>AI: {a.aiPct}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Q System Health + Risk Detection ── */}

      {/* System Health Status Bar */}
      <div className="fade-in" style={{
        padding: '14px 20px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 16,
        background: systemHealth === 'critical' ? 'rgba(239,68,68,0.06)' : systemHealth === 'warning' ? 'rgba(245,158,11,0.06)' : 'rgba(34,197,94,0.06)',
        border: '1px solid ' + (systemHealth === 'critical' ? 'rgba(239,68,68,0.2)' : systemHealth === 'warning' ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)')
      }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: systemHealth === 'critical' ? 'rgba(239,68,68,0.15)' : systemHealth === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)'
        }}>
          <Ic icon={HeartPulse} size={20} color={systemHealth === 'critical' ? 'var(--danger)' : systemHealth === 'warning' ? 'var(--warning)' : 'var(--success)'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: systemHealth === 'critical' ? 'var(--danger)' : systemHealth === 'warning' ? 'var(--warning)' : 'var(--success)', marginBottom: 2 }}>
            Q SYSTEM HEALTH — {systemHealth === 'critical' ? 'Critical Issues Detected' : systemHealth === 'warning' ? 'Warnings Active' : 'All Systems Healthy'}
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>
            {activeToday} active today · {profiles.length} total users · {risks.length} risk{risks.length !== 1 ? 's' : ''} detected · API operational
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
          {[
            { label: 'Status', value: systemHealth === 'critical' ? 'Critical' : systemHealth === 'warning' ? 'Warning' : 'Healthy', color: systemHealth === 'critical' ? 'var(--danger)' : systemHealth === 'warning' ? 'var(--warning)' : 'var(--success)' },
            { label: 'Active', value: activeToday.toString(), color: 'var(--accent)' },
            { label: 'Uptime', value: '99.9%', color: 'var(--success)' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', fontWeight: 600, marginBottom: 2 }}>{s.label}</div>
              <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>

        {/* Q Risk Detection */}
        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-header">
            <div className="panel-title"><Ic icon={ShieldAlert} size={14} /> Q Risk Detection</div>
            {risks.length > 0 && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: risks[0].level === 'critical' ? 'rgba(239,68,68,0.1)' : 'rgba(245,158,11,0.1)', color: risks[0].level === 'critical' ? 'var(--danger)' : 'var(--warning)' }}>{risks.length} risk{risks.length !== 1 ? 's' : ''}</span>}
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {risks.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                <Ic icon={CheckCircle} size={20} color="var(--success)" style={{ marginBottom: 8 }} /><br />
                System stable — no risks detected.
              </div>
            ) : risks.slice(0, 4).map((r, i) => (
              <div key={i} style={{
                padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
                background: r.level === 'critical' ? 'rgba(239,68,68,0.04)' : r.level === 'warning' ? 'rgba(245,158,11,0.04)' : 'rgba(77,142,240,0.04)',
                borderLeft: '3px solid ' + (r.level === 'critical' ? 'var(--danger)' : r.level === 'warning' ? 'var(--warning)' : 'var(--accent3)')
              }} onClick={() => navigatePage(r.page)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <Ic icon={r.icon} size={13} color={r.level === 'critical' ? 'var(--danger)' : 'var(--warning)'} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: r.level === 'critical' ? 'var(--danger)' : 'var(--text)' }}>{r.title}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4, paddingLeft: 21 }}>{r.impact}</div>
                <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, paddingLeft: 21 }}>Action: {r.action}</div>
              </div>
            ))}
          </div>
        </div>

        {/* User Activity Health + System Alerts + AI Performance */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* User Activity Health */}
          <div className="panel" style={{ margin: 0 }}>
            <div className="panel-header">
              <div className="panel-title"><Ic icon={Eye} size={14} /> User Activity</div>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                { label: 'Active today', value: activeToday, color: 'var(--success)' },
                { label: 'Active this week', value: activeThisWeek, color: 'var(--accent)' },
                { label: 'Returning users', value: returningUsers, color: 'var(--accent3)' },
                { label: 'Inactive (no login this week)', value: inactiveTotal > 0 ? inactiveTotal : 0, color: inactiveTotal > carriers.length * 0.5 ? 'var(--danger)' : 'var(--muted)' },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{r.label}</span>
                  <span className="mono" style={{ fontSize: 14, fontWeight: 700, color: r.color }}>{r.value}</span>
                </div>
              ))}
              <div style={{ marginTop: 4, padding: '6px 10px', borderRadius: 6, background: 'rgba(240,165,0,0.04)', borderLeft: '2px solid var(--accent)' }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Ic icon={Brain} size={10} color="var(--accent)" />
                  <strong style={{ color: 'var(--accent)' }}>Q:</strong>
                  {activeToday === 0 ? ' No active users today. Engagement needs attention.' :
                   activeToday < 3 ? ' Low daily activity. Consider push notifications.' :
                   returningUsers > activeToday * 0.5 ? ' Good retention — users are coming back.' :
                   ' User engagement stable.'}
                </div>
              </div>
            </div>
          </div>

          {/* AI Performance Health */}
          <div className="panel" style={{ margin: 0 }}>
            <div className="panel-header">
              <div className="panel-title"><Ic icon={Cpu} size={14} /> AI Performance</div>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>AI success rate</span>
                <span className="mono" style={{ fontSize: 16, fontWeight: 700, color: aiSuccessRate > 90 ? 'var(--success)' : aiSuccessRate > 70 ? 'var(--warning)' : 'var(--danger)' }}>{aiSuccessRate}%</span>
              </div>
              <div style={{ height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', display: 'flex' }}>
                <div style={{ width: aiSuccessRate + '%', height: '100%', background: 'var(--success)', transition: 'width 0.5s' }} />
                {aiFailRate > 0 && <div style={{ width: aiFailRate + '%', height: '100%', background: 'var(--danger)', transition: 'width 0.5s' }} />}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)' }}>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--success)', marginRight: 4, verticalAlign: 'middle' }} />Success {aiSuccessRate}%</span>
                <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: 'var(--danger)', marginRight: 4, verticalAlign: 'middle' }} />Failures {aiFailRate}%</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Successful charges</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)' }}>{aiSuccessLoads.length}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Failed charges</span>
                <span className="mono" style={{ fontSize: 12, fontWeight: 700, color: aiFailedLoads.length > 0 ? 'var(--danger)' : 'var(--muted)' }}>{aiFailedLoads.length}</span>
              </div>
              <div style={{ padding: '6px 10px', borderRadius: 6, background: 'rgba(240,165,0,0.04)', borderLeft: '2px solid var(--accent)', marginTop: 2 }}>
                <div style={{ fontSize: 10, color: 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <Ic icon={Brain} size={10} color="var(--accent)" />
                  <strong style={{ color: 'var(--accent)' }}>Q:</strong>
                  {aiFees.length === 0 ? ' No AI transactions yet.' :
                   aiSuccessRate === 100 ? ' AI performance optimal — all charges successful.' :
                   aiSuccessRate > 90 ? ' Performance stable. Minor failures within tolerance.' :
                   ' Performance decreasing — investigate charge failures.'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* System Alerts Feed + Quick Fix Actions */}
      <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>

        {/* Q System Alerts */}
        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-header">
            <div className="panel-title"><Ic icon={Activity} size={14} /> Q System Alerts</div>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {systemAlerts.map((a, i) => (
              <div key={i} style={{
                padding: '10px 12px', borderRadius: 8,
                borderLeft: '3px solid ' + (a.severity === 'critical' ? 'var(--danger)' : a.severity === 'warning' ? 'var(--warning)' : a.severity === 'ok' ? 'var(--success)' : 'var(--accent3)'),
                background: a.severity === 'critical' ? 'rgba(239,68,68,0.04)' : a.severity === 'warning' ? 'rgba(245,158,11,0.04)' : a.severity === 'ok' ? 'rgba(34,197,94,0.04)' : 'rgba(77,142,240,0.04)',
                cursor: a.page ? 'pointer' : 'default'
              }} onClick={() => a.page && navigatePage(a.page)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                  <Ic icon={a.icon} size={13} color={a.severity === 'critical' ? 'var(--danger)' : a.severity === 'warning' ? 'var(--warning)' : a.severity === 'ok' ? 'var(--success)' : 'var(--accent3)'} />
                  <span style={{ fontSize: 12, fontWeight: 700 }}>{a.title}</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--muted)', paddingLeft: 21 }}>{a.detail}</div>
                {a.action && <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, paddingLeft: 21, marginTop: 3 }}>{a.action}</div>}
              </div>
            ))}
          </div>
        </div>

        {/* Quick Fix Actions */}
        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-header">
            <div className="panel-title"><Ic icon={Wrench} size={14} /> Quick Fix Actions</div>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {quickFixes.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--muted)', fontSize: 12 }}>
                <Ic icon={CheckCircle} size={20} color="var(--success)" style={{ marginBottom: 8 }} /><br />
                No fixes needed — system stable.
              </div>
            ) : quickFixes.slice(0, 5).map((f, i) => (
              <button key={i} className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', padding: '10px 12px', fontSize: 12 }} onClick={() => navigatePage(f.page)}>
                <Ic icon={f.icon} size={14} color="var(--accent)" /> {f.label}
              </button>
            ))}
          </div>

          {/* Revenue Risk Alert */}
          {revTrendPct < -10 && (
            <div style={{ margin: '0 12px 12px', padding: '10px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Ic icon={AlertTriangle} size={13} color="var(--danger)" />
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--danger)' }}>Revenue Alert</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 4 }}>Revenue decreased {Math.abs(revTrendPct)}% vs last week</div>
              <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>Action: Check activation and AI usage</div>
            </div>
          )}
        </div>
      </div>

      {/* ── Q Command Center ── */}
      <div className="fade-in" style={{
        padding: '14px 20px', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 14,
        background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.2)'
      }}>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(240,165,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Ic icon={Terminal} size={20} color="var(--accent)" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 2 }}>Q COMMAND CENTER</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Execute platform-wide actions. AI Mode: <strong style={{ color: 'var(--accent)' }}>{aiMode.toUpperCase()}</strong></div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          {['manual', 'assisted', 'auto'].map(m => (
            <button key={m} className={aiMode === m ? 'btn btn-primary' : 'btn btn-ghost'} style={{ fontSize: 10, padding: '6px 12px' }}
              onClick={() => { setAiMode(m); localStorage.setItem('q_ai_mode', m); logAction('AI Mode → ' + m.toUpperCase(), 'Adjusted'); showToast('', 'AI Mode Updated', m.charAt(0).toUpperCase() + m.slice(1) + ' mode active') }}>
              {m.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <div className="fade-in" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>

        {/* Core Actions */}
        <div className="panel" style={{ margin: 0 }}>
          <div className="panel-header">
            <div className="panel-title"><Ic icon={Play} size={14} /> System Actions</div>
          </div>
          <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { id: 'notify', icon: Send, label: 'Notify All Users', desc: 'Send platform notification', fn: async () => { await supabase.from('notifications').insert(profiles.map(p => ({ owner_id: p.id, title: 'Q Platform Update', body: 'New features available — check your dashboard.', read: false }))); logAction('Notify All Users', carriers.length + ' notified') } },
              { id: 'activate', icon: Zap, label: 'Send Activation Reminder', desc: 'Remind inactive carriers', fn: async () => { logAction('Activation Reminder', inactiveUsers.length + ' inactive carrier(s) targeted') } },
              { id: 'promote', icon: Cpu, label: 'Promote Auto-Dispatch', desc: 'Push AI dispatch awareness', fn: async () => { logAction('Auto-Dispatch Promo', 'Sent to ' + carriers.length + ' carriers') } },
              { id: 'refresh', icon: RefreshCw, label: 'Recalculate Insights', desc: 'Force refresh all metrics', fn: async () => { window.location.reload() } },
              { id: 'sync', icon: Radio, label: 'Sync Load Boards', desc: 'Refresh external data', fn: async () => { logAction('Load Board Sync', 'Data sources refreshed') } },
              { id: 'market', icon: TrendingUp, label: 'Refresh Market Data', desc: 'Update rates & fuel', fn: async () => { logAction('Market Data Refresh', 'Rates and fuel updated') } },
            ].map(cmd => (
              <button key={cmd.id} className="btn btn-ghost" disabled={cmdBusy === cmd.id}
                style={{ width: '100%', justifyContent: 'flex-start', padding: '10px 12px', fontSize: 12, gap: 10 }}
                onClick={() => execCommand(cmd.id, cmd.label, cmd.fn)}>
                <Ic icon={cmd.icon} size={14} color="var(--accent)" />
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <div style={{ fontWeight: 600 }}>{cmdBusy === cmd.id ? 'Executing...' : cmd.label}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>{cmd.desc}</div>
                </div>
                <Ic icon={ChevronRight} size={11} color="var(--muted)" />
              </button>
            ))}
          </div>
        </div>

        {/* Broadcast + User Control + Action Log */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Q Broadcast */}
          <div className="panel" style={{ margin: 0 }}>
            <div className="panel-header">
              <div className="panel-title"><Ic icon={Megaphone} size={14} /> Q Broadcast</div>
            </div>
            <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <select value={broadcastGroup} onChange={e => setBroadcastGroup(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif" }}>
                <option value="all">All Users ({profiles.length})</option>
                <option value="carriers">Carriers ({carriers.length})</option>
                <option value="trial">Trial Users ({trialUsers.length})</option>
                <option value="inactive">Inactive Carriers ({inactiveUsers.length})</option>
                <option value="paying">Paying Users ({payingUsers.length})</option>
              </select>
              <textarea value={broadcastMsg} onChange={e => setBroadcastMsg(e.target.value)} placeholder="Type broadcast message..."
                style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12, fontFamily: "'DM Sans',sans-serif", resize: 'vertical', minHeight: 60, outline: 'none', boxSizing: 'border-box' }} />
              <button className="btn btn-primary" style={{ fontSize: 12 }} disabled={!broadcastMsg.trim() || cmdBusy === 'broadcast'}
                onClick={() => execCommand('broadcast', 'Broadcast to ' + broadcastGroup, async () => {
                  const targets = broadcastGroup === 'all' ? profiles : broadcastGroup === 'carriers' ? carriers : broadcastGroup === 'trial' ? trialUsers : broadcastGroup === 'inactive' ? inactiveUsers : payingUsers
                  await supabase.from('notifications').insert(targets.map(p => ({ owner_id: p.id, title: 'Q Broadcast', body: broadcastMsg.trim(), read: false })))
                  logAction('Broadcast sent', targets.length + ' user(s) — "' + broadcastMsg.trim().slice(0, 40) + '"')
                  setBroadcastMsg('')
                })}>
                <Ic icon={Send} size={12} /> {cmdBusy === 'broadcast' ? 'Sending...' : 'Send Broadcast'}
              </button>
            </div>
          </div>

          {/* User Control */}
          <div className="panel" style={{ margin: 0 }}>
            <div className="panel-header">
              <div className="panel-title"><Ic icon={Users} size={14} /> User Control</div>
            </div>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 12 }} onClick={() => navigatePage('carriers')}>
                <Ic icon={Eye} size={14} color="var(--success)" /> View Active Users ({activeToday} today)
              </button>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 12 }} onClick={() => { navigatePage('carriers'); logAction('Inactive Users', 'Viewing ' + inactiveUsers.length + ' inactive') }}>
                <Ic icon={AlertTriangle} size={14} color="var(--warning)" /> Identify Inactive Users ({inactiveUsers.length})
              </button>
              <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'flex-start', fontSize: 12 }}
                onClick={() => execCommand('msg-inactive', 'Remind inactive users', async () => {
                  if (inactiveUsers.length === 0) { logAction('No inactive users', 'Skipped'); return }
                  await supabase.from('notifications').insert(inactiveUsers.map(p => ({ owner_id: p.id, title: 'Q Reminder', body: 'Complete setup to activate dispatch intelligence. Book your first load today.', read: false })))
                  logAction('Inactive reminder', inactiveUsers.length + ' carrier(s) notified')
                })}>
                <Ic icon={Send} size={14} color="var(--accent)" /> Send Reminder to Inactive ({inactiveUsers.length})
              </button>
            </div>
          </div>

          {/* Action Log */}
          <div className="panel" style={{ margin: 0 }}>
            <div className="panel-header">
              <div className="panel-title"><Ic icon={Terminal} size={14} /> Action Log</div>
              {actionLog.length > 0 && <button className="btn btn-ghost" style={{ fontSize: 10 }} onClick={() => setActionLog([])}>Clear</button>}
            </div>
            <div style={{ padding: 12, maxHeight: 180, overflowY: 'auto' }}>
              {actionLog.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 11 }}>No actions executed this session</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {actionLog.map((a, i) => (
                    <div key={i} style={{ padding: '6px 10px', borderRadius: 6, background: 'var(--surface2)', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <Ic icon={CheckCircle} size={11} color="var(--success)" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.label}</div>
                        <div style={{ fontSize: 9, color: 'var(--muted)' }}>{a.result}</div>
                      </div>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--muted)', flexShrink: 0 }}>{a.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Mini Revenue Bar Chart ─────────────────────────────────────────── */
function RevenueMiniChart({ invoices, profiles }) {
  // Generate last 7 days data from signup dates (as proxy for revenue)
  const days = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000)
    const dayStr = d.toDateString()
    const label = d.toLocaleDateString('en-US', { weekday: 'short' })
    const signups = profiles.filter(p => new Date(p.created_at).toDateString() === dayStr).length
    const dayInvoices = invoices.filter(inv => new Date(inv.created_at).toDateString() === dayStr)
    const revenue = dayInvoices.reduce((s, inv) => s + (parseFloat(inv.amount) || 0), 0)
    days.push({ label, signups, revenue })
  }

  const maxVal = Math.max(...days.map(d => d.signups), 1)

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 120 }}>
        {days.map((d, i) => (
          <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 700 }}>{d.signups > 0 ? d.signups : ''}</div>
            <div style={{
              width: '100%', borderRadius: '4px 4px 0 0',
              background: d.signups > 0 ? 'linear-gradient(180deg, var(--accent), rgba(240,165,0,0.3))' : 'var(--border)',
              height: Math.max((d.signups / maxVal) * 90, 4),
              transition: 'height 0.5s'
            }} />
            <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{d.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Signups this week</div>
        <div className="mono" style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)' }}>{days.reduce((s, d) => s + d.signups, 0)}</div>
      </div>
    </div>
  )
}
