import React, { useState, useMemo, Suspense } from 'react'
import { Truck } from 'lucide-react'
import { useCarrier } from '../../../context/CarrierContext'
import { Ic, HubTabBar } from '../shared'
import { QInsightsFeed } from './QInsightsFeed'
import { FleetMap, FleetManager, FuelOptimizer, EquipmentManager } from './helpers'

// ── Fleet Hub ──
export function FleetHub() {
  const [tab, setTab] = useState('fleet')
  const { loads, activeLoads, drivers, vehicles, expenses, fuelCostPerMile, deliveredLoads } = useCarrier()
  const TABS = [{ id:'fleet', label:'Vehicles' },{ id:'map', label:'Live Map' },{ id:'fuel', label:'Fuel' },{ id:'manager', label:'Maintenance' }]

  const totalMiles = (deliveredLoads || []).reduce((s, l) => s + (Number(l.miles) || 0), 0)
  const onRoad = (activeLoads || []).filter(l => ['In Transit','Loaded','En Route to Pickup'].includes(l.status)).length
  const fuelExpenses = (expenses || []).filter(e => (e.category || '').toLowerCase().includes('fuel'))
  const totalFuel = fuelExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const truckCount = (vehicles || []).length

  const fleetSummary = useMemo(() => {
    return `HUB: Fleet\nTrucks: ${truckCount}\nOn road: ${onRoad}\nTotal miles driven: ${totalMiles.toLocaleString()}\nFuel spend: $${totalFuel.toLocaleString()}\nFuel cost/mile: $${fuelCostPerMile?.toFixed(2) || 'N/A'}\nActive loads: ${(activeLoads||[]).length}\nActive load routes: ${(activeLoads||[]).slice(0,10).map(l => `${l.origin}→${l.destination} (${l.driver||'unassigned'})`).join(', ') || 'None'}`
  }, [truckCount, onRoad, totalMiles, totalFuel, fuelCostPerMile, activeLoads])

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:0 }}>
      {/* Fleet header */}
      <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:36, height:36, borderRadius:10, background:'rgba(59,130,246,0.08)', border:'1px solid rgba(59,130,246,0.15)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Ic icon={Truck} size={18} color="var(--accent3,#3b82f6)" />
            </div>
            <div>
              <div style={{ fontSize:16, fontWeight:700, letterSpacing:0.3 }}>Fleet Management</div>
              <div style={{ fontSize:11, color:'var(--muted)' }}>Vehicles, tracking, fuel & maintenance</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:24 }}>
            {[
              { label:'Trucks', val: String(truckCount), color:'var(--accent3,#3b82f6)' },
              { label:'On Road', val: String(onRoad), color:'var(--success)' },
              { label:'Total Miles', val: totalMiles > 1000 ? `${(totalMiles/1000).toFixed(1)}K` : String(totalMiles), color:'var(--accent)' },
              { label:'Fuel Cost', val: `$${totalFuel.toLocaleString()}`, color:'var(--danger)' },
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
          {tab === 'fleet' && (
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              <div style={{ padding:'16px 20px 0' }}>
                <QInsightsFeed hub="fleet" summary={fleetSummary} onNavigate={(target) => { if (target) setTab(target) }} />
              </div>
              <EquipmentManager />
            </div>
          )}
          {tab === 'map' && <FleetMap />}
          {tab === 'fuel' && <FuelOptimizer />}
          {tab === 'manager' && <FleetManager />}
        </Suspense>
      </div>
    </div>
  )
}
