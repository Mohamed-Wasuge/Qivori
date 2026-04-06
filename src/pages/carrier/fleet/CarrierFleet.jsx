import { useState } from 'react'
import { Ic, S, StatCard } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { Truck, AlertTriangle, Package } from 'lucide-react'

// ─── FLEET & GPS ───────────────────────────────────────────────────────────────
export function CarrierFleet() {
  const { showToast } = useApp()
  const ctx = useCarrier() || {}
  const vehicles = ctx.vehicles || []
  const drivers = ctx.drivers || []
  const loads = ctx.activeLoads || (ctx.loads || []).filter(l => !['Delivered','Invoiced'].includes(l.status))

  const trucks = vehicles.map((v, i) => {
    const driver = drivers[i]
    const driverName = driver ? (driver.name || driver.full_name || `Driver ${i+1}`) : 'Unassigned'
    const unitLabel = `${v.year || ''} ${v.make || ''} ${v.model || ''}`.trim() || `Unit ${String(i+1).padStart(2,'0')}`
    const load = loads.find(l => (l.driver_name || l.driver) === driverName)
    const status = load ? 'En Route' : driver ? 'Available' : 'Unassigned'
    const loc = driver?.city || driver?.home_city || v.location || 'Unknown'
    return {
      unit: unitLabel, driver: driverName, status, loc,
      dest: load?.dest || '—', load: load?.loadId || '—', eta: load?.delivery?.split(' · ')[0] || '—',
      hos: driver?.hos_remaining || '—', mpg: v.mpg || '—',
      nextService: v.next_service || '—', eld: v.eld_provider || 'N/A',
      hosColor: 'var(--success)',
    }
  })

  const enRouteCount = trucks.filter(t => t.status === 'En Route').length
  const availableCount = trucks.filter(t => t.status === 'Available').length

  if (!vehicles.length) {
    return (
      <div style={{ ...S.page, paddingBottom:40 }}>
        <div style={{ textAlign:'center', padding:'60px 32px' }}>
          <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
            <Truck size={26} color="var(--accent)" />
          </div>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:8 }}>No trucks added yet</div>
          <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, maxWidth:300, margin:'0 auto' }}>
            Add your first truck to see your fleet overview here.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div style={S.grid(4)}>
        <StatCard label="Fleet Online" value={`${trucks.length}/${trucks.length}`} change="Vehicles tracked" color="var(--success)" changeType="neutral" />
        <StatCard label="En Route"    value={String(enRouteCount)}    change={enRouteCount ? 'Active loads' : 'None'}  color="var(--accent)"  changeType="neutral" />
        <StatCard label="Available"   value={String(availableCount)}    change={availableCount ? 'Ready to dispatch' : 'None'}   color="var(--accent2)" changeType="neutral" />
        <StatCard label="Total Vehicles" value={String(trucks.length)}  change={`${drivers.length} drivers assigned`} color="var(--muted)" changeType="neutral" />
      </div>
      {trucks.map(t => {
        const sp = t.status==='En Route' ? 'var(--success)' : t.status==='Available' ? 'var(--accent3)' : 'var(--muted)'
        return (
          <div key={t.unit} style={S.panel}>
            <div style={{ ...S.panelHead, borderColor: t.nextService==='800 mi' ? 'rgba(245,158,11,0.3)' : 'var(--border)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div><Truck size={20} /></div>
                <div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontWeight: 800, fontSize: 14 }}>{t.unit}</span>
                    <span style={{ ...S.tag(sp), fontSize: 10 }}>{t.status}</span>
                    {t.nextService==='800 mi' && <span style={{ ...S.tag('var(--warning)'), fontSize: 10 }}><Ic icon={AlertTriangle} /> SERVICE SOON</span>}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{t.driver} · ELD: {t.eld}</div>
                </div>
              </div>
              <button className="btn btn-ghost" style={{ fontSize: 11 }} onClick={() => { const v = vehicles[trucks.indexOf(t)]; const lat = v?.lat || v?.latitude; const lng = v?.lng || v?.longitude; if (lat && lng) { window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank') } else { showToast('', 'No GPS Data', 'Connect ELD to enable live tracking for ' + t.unit) } }}>Track Live</button>
            </div>
            <div style={{ padding: 16, display: 'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
              {[
                { label:'Location', value: t.loc },
                { label:'HOS Remaining', value: t.hos, color: t.hosColor },
                { label:'MPG', value: t.mpg, color: t.mpg < 6.6 ? 'var(--warning)' : 'var(--success)' },
                { label:'Next Service', value: t.nextService, color: t.nextService==='800 mi' ? 'var(--warning)' : 'var(--muted)' },
              ].map(item => (
                <div key={item.label} style={{ textAlign: 'center', background: 'var(--surface2)', borderRadius: 8, padding: '10px 6px' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: item.color || 'var(--text)' }}>{item.value}</div>
                </div>
              ))}
            </div>
            {t.status === 'En Route' && (
              <div style={{ margin: '0 16px 16px', background: 'var(--surface2)', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 8 }}>
                  <span><Ic icon={Package} /> {t.load}</span><span style={{ color: 'var(--accent2)' }}>ETA {t.eta}</span>
                </div>
                <div style={{ height: 6, background: 'var(--border)', borderRadius: 3 }}>
                  <div style={{ height:'100%', width:'62%', background:'var(--accent)', borderRadius: 3 }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>62% complete · {t.loc} → {t.dest}</div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
