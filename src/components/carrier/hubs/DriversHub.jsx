import React, { useState, useMemo, Suspense } from 'react'
import { Users, Plus } from 'lucide-react'
import { useCarrier } from '../../../context/CarrierContext'
import { Ic, HubTabBar } from '../shared'
import { QInsightsFeed } from './QInsightsFeed'
import {
  DriverProfiles, DriverOnboarding, DriverScorecard,
  DQFileManager, ExpiryAlerts, DrugAlcoholCompliance, IncidentTracker,
  PayrollTracker, HiringPipeline, DriverContracts,
} from './helpers'

// ── Drivers Hub ──
export function DriversHub() {
  const [tab, setTab] = useState('team')
  const [complianceTab, setComplianceTab] = useState('dq-files')
  const { drivers, loads, activeLoads } = useCarrier()
  const TABS = [
    { id:'team', label:'Team' },
    { id:'payroll', label:'Payroll' },
    { id:'compliance', label:'Compliance' },
    { id:'performance', label:'Performance' },
    { id:'contracts', label:'Contracts' },
    { id:'onboarding', label:'Onboarding' },
    { id:'hiring', label:'Hiring' },
  ]

  // Q Intelligence summary for drivers hub
  const driversSummary = useMemo(() => {
    const active = drivers.filter(d => d.status === 'Active' || !d.status)
    const names = drivers.map(d => d.full_name || d.name).join(', ')
    const expiring = drivers.filter(d => {
      const exp = d.cdl_expiry || d.license_expiry || d.medical_card_expiry
      if (!exp) return false
      const days = Math.round((new Date(exp) - new Date()) / 86400000)
      return days >= 0 && days <= 60
    })
    const loadsThisWeek = (loads || []).filter(l => {
      const d = l.created_at || l.pickup_date
      if (!d) return false
      const diff = (new Date() - new Date(d)) / 86400000
      return diff <= 7
    })
    return `HUB: Drivers/HR\nDrivers (${drivers.length}): ${names}\nActive: ${active.length}\nLoads this week: ${loadsThisWeek.length}\nDrivers with expiring docs (60 days): ${expiring.map(d => `${d.full_name||d.name} (${d.cdl_expiry||d.medical_card_expiry})`).join(', ') || 'None'}\nPay models: ${drivers.map(d => `${d.full_name||d.name}: ${d.pay_model||'percent'} @ ${d.pay_rate||'28'}${d.pay_model==='permile'?'/mi':'%'}`).join(', ')}`
  }, [drivers, loads])

  const activeCount = drivers.filter(d => d.status === 'Active' || !d.status).length
  const onRoadCount = drivers.filter(d => {
    const name = d.full_name || d.name
    return activeLoads.some(l => l.driver === name && ['In Transit','Loaded','En Route to Pickup'].includes(l.status))
  }).length
  const idleCount = drivers.filter(d => {
    const name = d.full_name || d.name
    return !activeLoads.some(l => l.driver === name)
  }).length

  const COMPLIANCE_TABS = [
    { id:'dq-files', label:'DQ Files' },
    { id:'expiry-alerts', label:'Expiry Alerts' },
    { id:'drug-alcohol', label:'Drug & Alcohol' },
    { id:'incidents', label:'Incidents' },
  ]

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
      {/* Corporate HR header */}
      <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'rgba(240,165,0,0.08)', border:'1px solid rgba(240,165,0,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Ic icon={Users} size={18} color="var(--accent)" />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, letterSpacing:0.3 }}>Human Resources</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Team management, payroll & compliance</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:20 }}>
            {[
              { label:'Active', val: activeCount, color:'var(--success)' },
              { label:'On Road', val: onRoadCount, color:'var(--accent)' },
              { label:'Idle', val: idleCount, color: idleCount > 0 ? 'var(--warning,#f59e0b)' : 'var(--muted)' },
            ].map(s => (
              <div key={s.label} style={{ textAlign:'center', minWidth:50 }}>
                <div style={{ fontSize:18, fontWeight:800, color: s.color, fontFamily:"'DM Sans',sans-serif" }}>{s.val}</div>
                <div style={{ fontSize:9, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.8 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <HubTabBar tabs={TABS} active={tab} onChange={setTab} />
      <div style={{ flex:1, minHeight:0 }}>
        <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
          {tab === 'team' && (
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              <div style={{ padding:'16px 20px 0' }}>
                <QInsightsFeed hub="drivers" summary={driversSummary} onNavigate={(target) => { if (target) setTab(target === 'audit' ? 'compliance' : target) }} />
              </div>
              {drivers.length === 0 ? (
                <div style={{ padding:'40px 20px', textAlign:'center' }}>
                  <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.2)', display:'inline-flex', alignItems:'center', justifyContent:'center', marginBottom:16 }}><Ic icon={Users} size={24} color="var(--accent)" /></div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:2, color:'var(--accent)', marginBottom:8 }}>ADD YOUR FIRST DRIVER</div>
                  <div style={{ fontSize:12, color:'var(--muted)', maxWidth:320, margin:'0 auto', lineHeight:1.6 }}>Q needs drivers to automate dispatch, compliance checks, and payroll. Add a driver to get started.</div>
                  <button className="btn btn-primary" style={{ marginTop:16, fontSize:12, padding:'10px 24px' }} onClick={() => setTab('onboarding')}>
                    <Ic icon={Plus} size={14} /> Add Driver
                  </button>
                </div>
              ) : <DriverProfiles />}
            </div>
          )}
          {tab === 'payroll' && <PayrollTracker />}
          {tab === 'compliance' && (
            <div style={{ display:'flex', flexDirection:'column' }}>
              <div style={{ flexShrink:0, display:'flex', gap:0, padding:'0 20px', borderBottom:'1px solid var(--border)', background:'var(--surface)' }}>
                {COMPLIANCE_TABS.map(ct => (
                  <button key={ct.id} onClick={() => setComplianceTab(ct.id)} style={{
                    padding:'10px 18px', fontSize:12, fontWeight: complianceTab === ct.id ? 700 : 500, cursor:'pointer', border:'none', background:'none',
                    color: complianceTab === ct.id ? 'var(--accent)' : 'var(--muted)',
                    borderBottom: complianceTab === ct.id ? '2px solid var(--accent)' : '2px solid transparent',
                    transition:'all 0.15s',
                  }}>{ct.label}</button>
                ))}
              </div>
              <div style={{ flex:1, minHeight:0 }}>
                {complianceTab === 'dq-files' && <DQFileManager />}
                {complianceTab === 'expiry-alerts' && <ExpiryAlerts />}
                {complianceTab === 'drug-alcohol' && <DrugAlcoholCompliance />}
                {complianceTab === 'incidents' && <IncidentTracker />}
              </div>
            </div>
          )}
          {tab === 'contracts' && <DriverContracts />}
          {tab === 'performance' && <DriverScorecard />}
          {tab === 'onboarding' && <DriverOnboarding />}
          {tab === 'hiring' && <HiringPipeline />}
        </Suspense>
      </div>
    </div>
  )
}
