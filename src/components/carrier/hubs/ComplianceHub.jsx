import React, { useState, useEffect, useMemo, Suspense } from 'react'
import {
  Shield, AlertTriangle, AlertCircle, CheckCircle,
  Activity, FileText, Truck, FlaskConical,
} from 'lucide-react'
import { useCarrier } from '../../../context/CarrierContext'
import * as db from '../../../lib/database'
import { Ic, HubTabBar } from '../shared'
import { QInsightsFeed } from './QInsightsFeed'
import { SafetyIntelligenceDashboard } from './SafetyIntelligenceDashboard'
import {
  CarrierIFTA, CarrierDVIR, CarrierClearinghouse, AuditToday,
  BrokerRiskIntel,
} from './helpers'

// ── Compliance Hub ──
export function ComplianceHub() {
  const [tab, setTab] = useState('overview')
  const { drivers, vehicles } = useCarrier()
  const [compData, setCompData] = useState({ dvirs:[], chOrders:[], hosLogs:[], drugTests:[], incidents:[], dqFiles:[], settings:null, validateFleet:null, loaded:false })

  useEffect(() => {
    Promise.all([
      db.fetchDVIRs().catch(() => []),
      db.fetchClearinghouseQueries().catch(() => []),
      db.fetchHOSLogs().catch(() => []),
      db.fetchDrugTests().catch(() => []),
      db.fetchIncidents().catch(() => []),
      db.fetchDQFiles().catch(() => []),
      db.fetchCarrierSettings().catch(() => null),
      import('../../../lib/compliance').then(m => m.validateFleet),
    ]).then(([dvirs, ch, hos, drugs, incidents, dqFiles, s, vf]) => {
      setCompData({ dvirs:dvirs||[], chOrders:ch||[], hosLogs:hos||[], drugTests:drugs||[], incidents:incidents||[], dqFiles:dqFiles||[], settings:s, validateFleet:vf, loaded:true })
    })
  }, [])

  const { failures, warnings, passing, stats } = useMemo(() => {
    if (!compData.validateFleet) return { failures:[], warnings:[], passing:[], stats:{ critCount:0, warnCount:0, total:0, driverFails:0, vehicleFails:0, driverCount:0, vehicleCount:0 } }
    return compData.validateFleet(drivers || [], vehicles || [], {
      clearinghouseOrders: compData.chOrders, hosLogs: compData.hosLogs, dvirHistory: compData.dvirs, settings: compData.settings,
    })
  }, [drivers, vehicles, compData])

  // Derived metrics
  const expiringDocs = useMemo(() => {
    const now = new Date()
    const in30 = new Date(now.getTime() + 30 * 86400000)
    return (compData.dqFiles || []).filter(d => d.expiry_date && new Date(d.expiry_date) <= in30 && new Date(d.expiry_date) >= now)
  }, [compData.dqFiles])

  const expiredDocs = useMemo(() => {
    const now = new Date()
    return (compData.dqFiles || []).filter(d => d.expiry_date && new Date(d.expiry_date) < now)
  }, [compData.dqFiles])

  const openIncidents = (compData.incidents || []).filter(i => i.status === 'open' || i.status === 'investigating')
  const pendingDrugTests = (compData.drugTests || []).filter(t => t.result === 'pending')
  const dvirDefects = (compData.dvirs || []).filter(d => d.defects_found && d.status !== 'resolved')
  const passCount = (passing || []).length
  const totalChecks = passCount + stats.critCount + stats.warnCount
  const complianceScore = totalChecks > 0 ? Math.round((passCount / totalChecks) * 100) : 100

  const complianceSummary = useMemo(() => {
    if (!compData.loaded) return ''
    return `HUB: Compliance\nDrivers: ${(drivers||[]).length}\nVehicles: ${(vehicles||[]).length}\nCompliance score: ${complianceScore}%\nCritical failures: ${stats.critCount}\nWarnings: ${stats.warnCount}\nPassing checks: ${passCount} of ${totalChecks}\nExpired docs: ${expiredDocs.length}\nExpiring within 30 days: ${expiringDocs.length}\nOpen incidents: ${openIncidents.length}\nDVIR defects unresolved: ${dvirDefects.length}\nPending drug tests: ${pendingDrugTests.length}\nFailure details: ${(failures||[]).slice(0,10).map(f => `${f.entity}: ${f.label}`).join(', ') || 'None'}\nWarning details: ${(warnings||[]).slice(0,10).map(w => `${w.entity}: ${w.label}`).join(', ') || 'None'}`
  }, [compData.loaded, drivers, vehicles, complianceScore, stats, passCount, totalChecks, expiredDocs, expiringDocs, openIncidents, dvirDefects, pendingDrugTests, failures, warnings])

  const headerColor = stats.critCount > 0 ? 'var(--danger)' : stats.warnCount > 0 ? 'var(--warning,#f59e0b)' : 'var(--success)'
  const headerIcon = stats.critCount > 0 ? 'rgba(239,68,68,0.08)' : stats.warnCount > 0 ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)'
  const headerBorder = stats.critCount > 0 ? 'rgba(239,68,68,0.15)' : stats.warnCount > 0 ? 'rgba(245,158,11,0.15)' : 'rgba(34,197,94,0.15)'
  const statusLabel = stats.critCount > 0 ? 'At Risk' : stats.warnCount > 0 ? 'Review' : 'Clear'

  const TABS = [{ id:'overview', label:'Overview' },{ id:'safety-intel', label:'Safety Intelligence' },{ id:'audit', label:'Audit Today' },{ id:'center', label:'DVIR / ELD' },{ id:'ifta', label:'IFTA' },{ id:'broker-risk', label:'Broker Risk' },{ id:'clearinghouse', label:'Drug & Alcohol' }]

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
      {/* Corporate compliance header */}
      <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:headerIcon, border:`1px solid ${headerBorder}`, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Ic icon={Shield} size={18} color={headerColor} />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, letterSpacing:0.3 }}>Safety & Compliance</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>FMCSA, IFTA, ELD, DVIR & DOT readiness</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:20 }}>
            {[
              { label:'Score', val: compData.loaded ? `${complianceScore}%` : '—', color: complianceScore >= 90 ? 'var(--success)' : complianceScore >= 70 ? 'var(--warning,#f59e0b)' : 'var(--danger)' },
              { label:'Failures', val: compData.loaded ? String(stats.critCount) : '—', color: stats.critCount > 0 ? 'var(--danger)' : 'var(--success)' },
              { label:'Warnings', val: compData.loaded ? String(stats.warnCount) : '—', color: stats.warnCount > 0 ? 'var(--warning,#f59e0b)' : 'var(--muted)' },
              { label:'Status', val: compData.loaded ? statusLabel : '—', color: headerColor },
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center', minWidth:50 }}>
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
              {compData.loaded && <QInsightsFeed hub="compliance" summary={complianceSummary} onNavigate={(target) => { if (target) setTab(target) }} />}
              {/* Empty state */}
              {drivers.length === 0 && (vehicles || []).length === 0 && (
                <div style={{ padding:'30px 20px', textAlign:'center', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12 }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={Shield} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>COMPLIANCE STARTS HERE</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:340, margin:'0 auto', lineHeight:1.6 }}>Add drivers and vehicles to activate DOT compliance monitoring, DVIR tracking, clearinghouse checks, and expiry alerts.</div>
                </div>
              )}
              {/* Alerts */}
              {compData.loaded && (() => {
                const alerts = []
                if (stats.critCount > 0) alerts.push({ type:'danger', msg:`${stats.critCount} critical compliance failure${stats.critCount !== 1 ? 's' : ''} — not DOT audit ready` })
                if (expiredDocs.length > 0) alerts.push({ type:'danger', msg:`${expiredDocs.length} expired document${expiredDocs.length !== 1 ? 's' : ''} need immediate renewal` })
                if (expiringDocs.length > 0) alerts.push({ type:'warning', msg:`${expiringDocs.length} document${expiringDocs.length !== 1 ? 's' : ''} expiring within 30 days` })
                if (openIncidents.length > 0) alerts.push({ type:'warning', msg:`${openIncidents.length} open incident${openIncidents.length !== 1 ? 's' : ''} under investigation` })
                if (pendingDrugTests.length > 0) alerts.push({ type:'info', msg:`${pendingDrugTests.length} drug test result${pendingDrugTests.length !== 1 ? 's' : ''} pending` })
                if (dvirDefects.length > 0) alerts.push({ type:'warning', msg:`${dvirDefects.length} unresolved DVIR defect${dvirDefects.length !== 1 ? 's' : ''} on vehicles` })
                if (alerts.length === 0) alerts.push({ type:'success', msg:'All compliance checks passing — you are DOT audit ready' })
                return (
                  <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                    {alerts.map((a, i) => (
                      <div key={i} style={{
                        padding:'10px 16px', borderRadius:10, fontSize:12, fontWeight:600, display:'flex', alignItems:'center', gap:10,
                        background: a.type === 'danger' ? 'rgba(239,68,68,0.08)' : a.type === 'warning' ? 'rgba(245,158,11,0.08)' : a.type === 'success' ? 'rgba(34,197,94,0.08)' : 'rgba(59,130,246,0.08)',
                        border: `1px solid ${a.type === 'danger' ? 'rgba(239,68,68,0.2)' : a.type === 'warning' ? 'rgba(245,158,11,0.2)' : a.type === 'success' ? 'rgba(34,197,94,0.2)' : 'rgba(59,130,246,0.2)'}`,
                        color: a.type === 'danger' ? '#fca5a5' : a.type === 'warning' ? '#fcd34d' : a.type === 'success' ? '#86efac' : '#93c5fd',
                      }}>
                        <Ic icon={a.type === 'danger' ? AlertTriangle : a.type === 'warning' ? AlertCircle : a.type === 'success' ? CheckCircle : Activity} size={15} />
                        {a.msg}
                      </div>
                    ))}
                  </div>
                )
              })()}

              {/* Compliance Score + Status Cards */}
              <div style={{ display:'grid', gridTemplateColumns:'200px 1fr', gap:16 }}>
                {/* Score Ring */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'24px 20px', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                  <div style={{ position:'relative', width:120, height:120 }}>
                    <svg width="120" height="120" viewBox="0 0 120 120">
                      <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" strokeWidth="8" />
                      <circle cx="60" cy="60" r="52" fill="none"
                        stroke={complianceScore >= 90 ? '#22c55e' : complianceScore >= 70 ? '#f59e0b' : '#ef4444'}
                        strokeWidth="8" strokeLinecap="round"
                        strokeDasharray={`${(complianceScore / 100) * 327} 327`}
                        transform="rotate(-90 60 60)"
                        style={{ transition:'stroke-dasharray 0.6s ease' }} />
                    </svg>
                    <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
                      <div style={{ fontSize:28, fontWeight:800, color:'var(--text)', fontFamily:"'DM Sans',sans-serif" }}>{complianceScore}</div>
                      <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>Score</div>
                    </div>
                  </div>
                  <div style={{ marginTop:12, fontSize:11, fontWeight:700, color: complianceScore >= 90 ? 'var(--success)' : complianceScore >= 70 ? 'var(--warning,#f59e0b)' : 'var(--danger)', textTransform:'uppercase', letterSpacing:1 }}>
                    {complianceScore >= 90 ? 'Excellent' : complianceScore >= 70 ? 'Needs Attention' : 'At Risk'}
                  </div>
                  <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>{passCount} of {totalChecks} checks passing</div>
                </div>

                {/* Status Cards Grid */}
                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                  {[
                    { label:'Critical Failures', val: stats.critCount, sub: stats.critCount === 0 ? 'All clear' : `${stats.driverFails} driver, ${stats.vehicleFails} vehicle`, color: stats.critCount > 0 ? 'var(--danger)' : 'var(--success)', icon: AlertTriangle },
                    { label:'Warnings', val: stats.warnCount, sub: stats.warnCount === 0 ? 'None' : 'Items need review', color: stats.warnCount > 0 ? 'var(--warning,#f59e0b)' : 'var(--muted)', icon: AlertCircle },
                    { label:'Expiring Docs', val: expiringDocs.length + expiredDocs.length, sub: expiredDocs.length > 0 ? `${expiredDocs.length} expired` : expiringDocs.length > 0 ? 'Within 30 days' : 'All current', color: expiredDocs.length > 0 ? 'var(--danger)' : expiringDocs.length > 0 ? 'var(--warning,#f59e0b)' : 'var(--success)', icon: FileText },
                    { label:'Open Incidents', val: openIncidents.length, sub: openIncidents.length === 0 ? 'No open cases' : 'Under investigation', color: openIncidents.length > 0 ? 'var(--warning,#f59e0b)' : 'var(--muted)', icon: Activity },
                    { label:'DVIR Defects', val: dvirDefects.length, sub: dvirDefects.length === 0 ? 'Fleet clear' : 'Unresolved', color: dvirDefects.length > 0 ? 'var(--danger)' : 'var(--success)', icon: Truck },
                    { label:'Drug Tests', val: pendingDrugTests.length, sub: pendingDrugTests.length === 0 ? 'All complete' : 'Results pending', color: pendingDrugTests.length > 0 ? 'var(--accent3,#3b82f6)' : 'var(--muted)', icon: FlaskConical },
                  ].map(c => (
                    <div key={c.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 18px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                        <div style={{ fontSize:10, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>{c.label}</div>
                        <Ic icon={c.icon} size={14} color={c.color} />
                      </div>
                      <div style={{ fontSize:24, fontWeight:800, color:c.color, fontFamily:"'DM Sans',sans-serif" }}>{c.val}</div>
                      <div style={{ fontSize:11, color:'var(--muted)', marginTop:2 }}>{c.sub}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Two-column: Driver Compliance + Fleet Compliance */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {/* Driver Compliance Breakdown */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'20px 24px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:16 }}>Driver Compliance</div>
                  {(drivers || []).length === 0 ? (
                    <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No drivers added yet</div>
                  ) : (drivers || []).slice(0, 8).map(d => {
                    const name = d.full_name || d.name || 'Unknown'
                    const driverFailures = (failures || []).filter(f => f.entityId === d.id)
                    const driverWarnings = (warnings || []).filter(w => w.entityId === d.id)
                    const driverStatus = driverFailures.length > 0 ? 'fail' : driverWarnings.length > 0 ? 'warn' : 'pass'
                    return (
                      <div key={d.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background: driverStatus === 'fail' ? '#ef4444' : driverStatus === 'warn' ? '#f59e0b' : '#22c55e' }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{name}</div>
                        </div>
                        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
                          {driverFailures.length > 0 && (
                            <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(239,68,68,0.1)', color:'#fca5a5' }}>{driverFailures.length} fail</span>
                          )}
                          {driverWarnings.length > 0 && (
                            <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(245,158,11,0.1)', color:'#fcd34d' }}>{driverWarnings.length} warn</span>
                          )}
                          {driverStatus === 'pass' && (
                            <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(34,197,94,0.1)', color:'#86efac' }}>Clear</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  {(drivers || []).length > 8 && (
                    <div style={{ padding:'8px 0', fontSize:11, color:'var(--accent)', cursor:'pointer', fontWeight:600 }} onClick={() => setTab('audit')}>View all {drivers.length} drivers →</div>
                  )}
                </div>

                {/* Upcoming Expirations */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'20px 24px' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1, marginBottom:16 }}>Upcoming Expirations</div>
                  {(() => {
                    const now = new Date()
                    const in90 = new Date(now.getTime() + 90 * 86400000)
                    const upcoming = [
                      ...(drivers || []).filter(d => d.cdl_expiry || d.license_expiry).map(d => {
                        const exp = d.cdl_expiry || d.license_expiry
                        return { name: d.full_name || d.name, type:'CDL', date:exp, days: Math.round((new Date(exp) - now) / 86400000) }
                      }),
                      ...(drivers || []).filter(d => d.medical_card_expiry || d.med_card_expiry).map(d => {
                        const exp = d.medical_card_expiry || d.med_card_expiry
                        return { name: d.full_name || d.name, type:'Medical Card', date:exp, days: Math.round((new Date(exp) - now) / 86400000) }
                      }),
                      ...(compData.dqFiles || []).filter(d => d.expiry_date).map(d => {
                        const driver = (drivers || []).find(dr => dr.id === d.driver_id)
                        return { name: driver?.full_name || driver?.name || 'Unknown', type: (d.doc_type || '').replace(/_/g,' '), date: d.expiry_date, days: Math.round((new Date(d.expiry_date) - now) / 86400000) }
                      }),
                    ].filter(e => e.days <= 90).sort((a, b) => a.days - b.days)

                    if (upcoming.length === 0) return (
                      <div style={{ padding:20, textAlign:'center', color:'var(--muted)', fontSize:12 }}>
                        <Ic icon={CheckCircle} size={20} color="var(--success)" style={{ marginBottom:8 }} />
                        <div>No expirations in the next 90 days</div>
                      </div>
                    )

                    return upcoming.slice(0, 8).map((e, i) => (
                      <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background: e.days < 0 ? '#ef4444' : e.days <= 14 ? '#f59e0b' : e.days <= 30 ? '#fcd34d' : '#3b82f6' }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{e.name}</div>
                          <div style={{ fontSize:10, color:'var(--muted)' }}>{e.type}</div>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <div style={{ fontSize:12, fontWeight:700, color: e.days < 0 ? '#ef4444' : e.days <= 14 ? '#f59e0b' : 'var(--text)' }}>
                            {e.days < 0 ? `${Math.abs(e.days)}d overdue` : e.days === 0 ? 'Today' : `${e.days}d left`}
                          </div>
                          <div style={{ fontSize:9, color:'var(--muted)' }}>{e.date}</div>
                        </div>
                      </div>
                    ))
                  })()}
                </div>
              </div>

              {/* Recent Compliance Activity */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'var(--muted)', textTransform:'uppercase', letterSpacing:1 }}>Recent Compliance Activity</div>
                  <button onClick={() => setTab('audit')} style={{ fontSize:11, color:'var(--accent)', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Run Full Audit →</button>
                </div>
                {(() => {
                  const activities = [
                    ...(compData.drugTests || []).slice(0, 5).map(t => {
                      const driver = (drivers || []).find(d => d.id === t.driver_id)
                      return { icon: FlaskConical, label: `Drug Test — ${(t.test_type || '').replace(/_/g,' ')}`, entity: driver?.full_name || driver?.name || 'Unknown', date: t.test_date, status: t.result || 'pending', statusColor: t.result === 'negative' ? 'var(--success)' : t.result === 'positive' ? 'var(--danger)' : 'var(--accent3,#3b82f6)' }
                    }),
                    ...(compData.incidents || []).slice(0, 5).map(inc => {
                      const driver = (drivers || []).find(d => d.id === inc.driver_id)
                      return { icon: AlertTriangle, label: `Incident — ${(inc.incident_type || '').replace(/_/g,' ')}`, entity: driver?.full_name || driver?.name || 'Unknown', date: inc.incident_date, status: inc.status, statusColor: inc.status === 'resolved' || inc.status === 'closed' ? 'var(--success)' : 'var(--warning,#f59e0b)' }
                    }),
                    ...(compData.dvirs || []).slice(0, 5).map(d => ({
                      icon: Truck, label: `DVIR — ${d.vehicle_id || 'Vehicle'}`, entity: d.driver_name || 'Unknown', date: d.submitted_at || d.created_at, status: d.defects_found ? 'Defects' : 'Clear', statusColor: d.defects_found ? 'var(--warning,#f59e0b)' : 'var(--success)',
                    })),
                  ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)).slice(0, 10)

                  if (activities.length === 0) return (
                    <div style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:12 }}>No compliance activity recorded yet</div>
                  )

                  return (
                    <table style={{ width:'100%', borderCollapse:'collapse' }}>
                      <tbody>
                        {activities.map((a, i) => (
                          <tr key={i} style={{ borderBottom: i < activities.length - 1 ? '1px solid var(--border)' : 'none' }}>
                            <td style={{ padding:'10px 20px', width:32 }}>
                              <div style={{ width:28, height:28, borderRadius:8, background:'rgba(240,165,0,0.06)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <Ic icon={a.icon} size={13} color="var(--muted)" />
                              </div>
                            </td>
                            <td style={{ padding:'10px 8px' }}>
                              <div style={{ fontSize:12, fontWeight:600 }}>{a.label}</div>
                              <div style={{ fontSize:10, color:'var(--muted)' }}>{a.entity}</div>
                            </td>
                            <td style={{ padding:'10px 8px', fontSize:11, color:'var(--muted)' }}>{a.date ? new Date(a.date).toLocaleDateString('en-US',{month:'short',day:'numeric'}) : '—'}</td>
                            <td style={{ padding:'10px 20px', textAlign:'right' }}>
                              <span style={{ fontSize:9, fontWeight:700, padding:'2px 8px', borderRadius:12, textTransform:'capitalize', background: `${a.statusColor}15`, color: a.statusColor }}>{a.status}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                })()}
              </div>
            </div>
          )}

          {tab === 'safety-intel' && <SafetyIntelligenceDashboard drivers={drivers} vehicles={vehicles} compData={compData} />}
          {tab === 'audit' && <AuditToday />}
          {tab === 'center' && <CarrierDVIR />}
          {tab === 'ifta' && <CarrierIFTA />}
          {tab === 'broker-risk' && <BrokerRiskIntel />}
          {tab === 'clearinghouse' && <CarrierClearinghouse />}
        </Suspense>
      </div>
    </div>
  )
}
