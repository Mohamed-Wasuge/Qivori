import { React, useState, useRef, Ic, S, StatCard, useApp, useCarrier } from './shared'
import { Truck, User, MapPin, Package, Radio, MessageCircle, AlertTriangle, Fuel, BarChart2, Bot, Check, PencilIcon, Wrench, Trash2, Siren, FileText, Paperclip, DollarSign, TrendingUp, TrendingDown, Zap, Save, Route, Shield } from 'lucide-react'
import { uploadFile } from '../../lib/storage'
import { createDocument } from '../../lib/database'

// ─── FLEET MAP CONSTANTS ──────────────────────────────────────────────────────
const CITIES = {
  'Atlanta, GA':   { x: 62, y: 66 }, 'Chicago, IL':   { x: 57, y: 42 },
  'Dallas, TX':    { x: 46, y: 72 }, 'Miami, FL':     { x: 68, y: 82 },
  'Denver, CO':    { x: 32, y: 50 }, 'Houston, TX':   { x: 47, y: 78 },
  'Memphis, TN':   { x: 57, y: 64 }, 'New York, NY':  { x: 77, y: 38 },
  'Phoenix, AZ':   { x: 20, y: 66 }, 'Los Angeles, CA':{ x: 10, y: 62 },
  'Omaha, NE':     { x: 46, y: 46 }, 'Minneapolis, MN':{ x: 50, y: 32 },
}
const STATUS_PROGRESS = { 'Rate Con Received':0.05, 'Assigned to Driver':0.10, 'En Route to Pickup':0.20, 'Loaded':0.45, 'In Transit':0.65, 'Delivered':1, 'Invoiced':1 }
const STATUS_LABEL = { 'Rate Con Received':'Ready', 'Assigned to Driver':'Assigned', 'En Route to Pickup':'En Route', 'Loaded':'Loaded', 'In Transit':'En Route', 'Delivered':'Delivered', 'Invoiced':'Delivered' }

// ─── FLEET MANAGER CONSTANTS ──────────────────────────────────────────────────
const FLEET_TRUCKS = []

const MAINT_LOGS = {}

const SERVICE_TYPES = ['Oil Change','Tire Rotation','Tire Replacement','Brake Service','DOT Inspection','Coolant Flush','DPF Cleaning','Transmission Service','AC Service','Other']
const WEEKS = ['W1','W2','W3','W4','W5','W6']

function expiryColor(dateStr) {
  const months = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24 * 30)
  return months < 2 ? 'var(--danger)' : months < 5 ? 'var(--warning)' : 'var(--success)'
}
function expiryLabel(dateStr) {
  const months = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24 * 30)
  if (months < 0)  return 'EXPIRED'
  if (months < 2)  return '< 2 months'
  if (months < 5)  return '< 5 months'
  return 'OK'
}

const BLANK_TRUCK = { vin:'', year:'', make:'', model:'', color:'', plate:'', gvw:'', fuel:'Diesel', odometer:'', driver:'', regExpiry:'', insExpiry:'', dotInspection:'', unit_cost:'' }

// ─── EQUIPMENT MANAGER CONSTANTS ──────────────────────────────────────────────
const EQ_FIELDS_TRUCK = [
  { key:'unit_number',         label:'Unit #',         ph:'Unit 04',           span:1 },
  { key:'year',                label:'Year',           ph:'2023',              span:1 },
  { key:'make',                label:'Make',           ph:'Kenworth',          span:1 },
  { key:'model',               label:'Model',          ph:'T680',              span:1 },
  { key:'vin',                 label:'VIN',            ph:'1XKYD49X5MJ000000', span:2 },
  { key:'license_plate',       label:'License Plate',  ph:'IL-TRK-5500',       span:1 },
  { key:'license_state',       label:'Plate State',    ph:'IL',                span:1 },
  { key:'current_miles',       label:'Odometer',       ph:'0',                 span:1 },
  { key:'next_service_miles',  label:'Next Service',   ph:'50000',             span:1 },
  { key:'registration_expiry', label:'Reg. Expiry',    ph:'Dec 31, 2026',      span:1 },
  { key:'insurance_expiry',    label:'Ins. Expiry',    ph:'Nov 15, 2026',      span:1 },
  { key:'notes',               label:'Notes',          ph:'Any notes...',      span:2 },
]
const EQ_FIELDS_TRAILER = [
  { key:'unit_number',         label:'Unit #',         ph:'Trailer 03',        span:1 },
  { key:'year',                label:'Year',           ph:'2022',              span:1 },
  { key:'make',                label:'Make',           ph:'Wabash',            span:1 },
  { key:'model',               label:'Model / Length', ph:'DuraPlate 53ft',    span:1 },
  { key:'vin',                 label:'VIN',            ph:'1JJV532W5LF000000', span:2 },
  { key:'license_plate',       label:'License Plate',  ph:'IL-TRL-0056',       span:1 },
  { key:'license_state',       label:'Plate State',    ph:'IL',                span:1 },
  { key:'next_service_miles',  label:'Next Service Mi',ph:'50000',             span:1 },
  { key:'registration_expiry', label:'Reg. Expiry',    ph:'Dec 31, 2026',      span:1 },
  { key:'insurance_expiry',    label:'Ins. Expiry',    ph:'Nov 15, 2026',      span:1 },
  { key:'notes',               label:'Notes',          ph:'53ft dry van...',   span:2 },
]

// ─── FLEET MAP ────────────────────────────────────────────────────────────────
export function FleetMap() {
  const { showToast } = useApp()
  const ctx = useCarrier() || {}
  const drivers = ctx.drivers || []
  const vehicles = ctx.vehicles || []
  const loads = ctx.activeLoads || (ctx.loads || []).filter(l => !['Delivered','Invoiced'].includes(l.status))

  const UNIT_COLORS = ['#f0a500','#00d4aa','#6b7280','#e74c3c','#3498db','#9b59b6','#1abc9c','#e67e22']

  // Build real truck data from context
  const trucksData = drivers.map((d, i) => {
    const driverName = d.name || d.full_name || `Driver ${i+1}`
    const vehicle = vehicles[i]
    const unit = vehicle ? `${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() : `Unit ${String(i+1).padStart(2,'0')}`
    const color = UNIT_COLORS[i % UNIT_COLORS.length]
    const load = loads.find(l => (l.driver_name || l.driver) === driverName)
    const homecity = d.city || d.home_city || 'Unknown'
    if (load) {
      const from = load.origin || homecity
      const to   = load.dest   || homecity
      return { unit, driver: driverName, from, to, progress: STATUS_PROGRESS[load.status] || 0.5, status: STATUS_LABEL[load.status] || load.status, color, load: load.loadId, eta: load.delivery?.split(' · ')[0] || 'TBD' }
    }
    return { unit, driver: driverName, from: homecity, to: homecity, progress: 1, status: 'Available', color, load: '—', eta: 'Ready' }
  })

  const [selectedTruck, setSelectedTruck] = useState(trucksData[0]?.unit || 'Unit 01')

  const truckPos = (t) => {
    const from = CITIES[t.from] || { x:50, y:50 }
    const to   = CITIES[t.to]   || { x:50, y:50 }
    return { x: from.x + (to.x - from.x) * t.progress, y: from.y + (to.y - from.y) * t.progress }
  }

  if (!drivers.length) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', background:'#0a0e1a' }}>
        <div style={{ textAlign:'center', padding:'40px 32px' }}>
          <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
            <Truck size={26} color="var(--accent)" />
          </div>
          <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginBottom:8 }}>No drivers added yet</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)', lineHeight:1.6, maxWidth:280 }}>
            Add your first driver to see fleet map.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'auto' }}>
      {/* Map area */}
      <div style={{ flex:1, position:'relative', background:'#0a0e1a', overflow:'hidden' }}>
        {/* Grid lines */}
        <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', opacity:0.06 }}>
          {[10,20,30,40,50,60,70,80,90].map(x => <line key={x} x1={`${x}%`} y1="0" x2={`${x}%`} y2="100%" stroke="#6b7280" strokeWidth="1"/>)}
          {[10,20,30,40,50,60,70,80,90].map(y => <line key={y} x1="0" y1={`${y}%`} x2="100%" y2={`${y}%`} stroke="#6b7280" strokeWidth="1"/>)}
        </svg>
        {/* US outline suggestion */}
        <div style={{ position:'absolute', left:'8%', top:'28%', right:'5%', bottom:'12%', border:'1px solid rgba(255,255,255,0.04)', borderRadius:'4% 8% 6% 12%' }} />

        <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%' }}>
          {/* Route lines */}
          {trucksData.filter(t => t.from !== t.to).map(t => {
            const from = CITIES[t.from], to = CITIES[t.to]
            if (!from || !to) return null
            return (
              <g key={t.unit}>
                <line x1={`${from.x}%`} y1={`${from.y}%`} x2={`${to.x}%`} y2={`${to.y}%`}
                  stroke={t.color} strokeWidth="1.5" strokeDasharray="6,4" opacity="0.3" />
                <line x1={`${from.x}%`} y1={`${from.y}%`}
                  x2={`${from.x + (to.x-from.x)*t.progress}%`} y2={`${from.y + (to.y-from.y)*t.progress}%`}
                  stroke={t.color} strokeWidth="2" opacity="0.8" />
              </g>
            )
          })}
          {/* City dots */}
          {Object.entries(CITIES).map(([name, pos]) => (
            <g key={name}>
              <circle cx={`${pos.x}%`} cy={`${pos.y}%`} r="4" fill="rgba(255,255,255,0.07)" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
              <text x={`${pos.x}%`} y={`${pos.y - 1.5}%`} textAnchor="middle" fill="rgba(255,255,255,0.3)" fontSize="9" fontFamily="DM Sans,sans-serif">{name.split(',')[0]}</text>
            </g>
          ))}
          {/* Truck icons */}
          {trucksData.map(t => {
            const pos = truckPos(t)
            const isSel = selectedTruck === t.unit
            return (
              <g key={t.unit} style={{ cursor:'pointer' }} onClick={() => setSelectedTruck(t.unit)}>
                <circle cx={`${pos.x}%`} cy={`${pos.y}%`} r={isSel ? 14 : 10} fill={t.color} opacity={isSel ? 1 : 0.7} />
                {isSel && <circle cx={`${pos.x}%`} cy={`${pos.y}%`} r="18" fill="none" stroke={t.color} strokeWidth="1.5" opacity="0.4"/>}
                <text x={`${pos.x}%`} y={`${pos.y}%`} textAnchor="middle" dominantBaseline="middle" fill="#000" fontSize="9" fontWeight="800" fontFamily="DM Sans,sans-serif"><Truck size={20} /></text>
              </g>
            )
          })}
        </svg>

        {/* Legend */}
        <div style={{ position:'absolute', bottom:16, left:16, display:'flex', gap:12 }}>
          {trucksData.map(t => (
            <div key={t.unit} onClick={() => setSelectedTruck(t.unit)}
              style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(0,0,0,0.6)', border:`1px solid ${selectedTruck===t.unit ? t.color : 'rgba(255,255,255,0.1)'}`, borderRadius:8, padding:'6px 10px', cursor:'pointer' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:t.color }} />
              <span style={{ fontSize:11, color:'#fff', fontFamily:'DM Sans,sans-serif' }}>{t.unit}</span>
            </div>
          ))}
        </div>

        {/* Top label */}
        <div style={{ position:'absolute', top:16, left:16, background:'rgba(0,0,0,0.5)', border:'1px solid rgba(255,255,255,0.08)', borderRadius:8, padding:'6px 12px' }}>
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)', fontFamily:'DM Sans,sans-serif', letterSpacing:2 }}>● LIVE FLEET — {trucksData.filter(t=>t.load!=='—').length} on load</span>
        </div>

        {/* Empty state overlay when no trucks on load */}
        {trucksData.filter(t=>t.load!=='—').length === 0 && (
          <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', zIndex:5, pointerEvents:'none' }}>
            <div style={{ textAlign:'center', background:'rgba(0,0,0,0.6)', borderRadius:16, padding:'32px 40px', border:'1px solid rgba(255,255,255,0.08)', backdropFilter:'blur(8px)' }}>
              <div style={{ width:48, height:48, borderRadius:12, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 16px' }}>
                <Truck size={22} color="var(--accent)" />
              </div>
              <div style={{ fontSize:14, fontWeight:700, color:'#fff', marginBottom:6 }}>All trucks available</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)', lineHeight:1.5, maxWidth:240 }}>
                No active loads dispatched. Book a load from the AI Load Board to see trucks on the map.
              </div>
              <div style={{ display:'flex', gap:8, marginTop:16, justifyContent:'center' }}>
                {trucksData.map(t => (
                  <div key={t.unit} style={{ display:'flex', alignItems:'center', gap:4, padding:'4px 8px', background:'rgba(255,255,255,0.05)', borderRadius:6 }}>
                    <div style={{ width:6, height:6, borderRadius:'50%', background:t.color }}/>
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.5)' }}>{t.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Side panel */}
      <div style={{ width:280, flexShrink:0, background:'var(--surface)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:11, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:2 }}>FLEET STATUS</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:8, marginTop:10 }}>
            {[
              { v: String(trucksData.filter(t=>t.status==='En Route'||t.status==='Loaded'||t.status==='Assigned').length), l:'On Load',   c:'var(--success)' },
              { v: String(trucksData.filter(t=>t.status==='Available').length), l:'Available', c:'var(--accent2)' },
              { v: String(trucksData.length), l:'Total', c:'var(--muted)' },
            ].map(s => (
              <div key={s.l} style={{ textAlign:'center', background:'var(--surface2)', borderRadius:8, padding:'8px 4px' }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:s.c }}>{s.v}</div>
                <div style={{ fontSize:9, color:'var(--muted)' }}>{s.l}</div>
              </div>
            ))}
          </div>
        </div>

        {trucksData.map(t => {
          const isSel = selectedTruck === t.unit
          const statusColor = ['En Route','Loaded','Assigned'].includes(t.status) ? 'var(--success)' : t.status==='Available' ? 'var(--accent2)' : 'var(--muted)'
          return (
            <div key={t.unit} onClick={() => setSelectedTruck(t.unit)}
              style={{ borderBottom:'1px solid var(--border)', cursor:'pointer', borderLeft:`3px solid ${isSel ? t.color : 'transparent'}`, background: isSel ? 'rgba(240,165,0,0.04)' : 'transparent', transition:'all 0.15s' }}>
              <div style={{ padding:'12px 14px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:'50%', background:t.color }} />
                    <span style={{ fontSize:13, fontWeight:700 }}>{t.unit}</span>
                  </div>
                  <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:8, background:statusColor+'15', color:statusColor }}>{t.status}</span>
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}><Ic icon={User} /> {t.driver}</div>
                {t.from !== t.to && <div style={{ fontSize:11, marginBottom:4 }}><Ic icon={MapPin} /> {t.from.split(',')[0]} <span style={{ color:'var(--accent)' }}>→</span> {t.to.split(',')[0]}</div>}
                {t.from === t.to && <div style={{ fontSize:11, marginBottom:4 }}><Ic icon={MapPin} /> {t.from.split(',')[0]}</div>}
                {t.load !== '—' && (
                  <>
                    <div style={{ fontSize:11, color:'var(--muted)', marginBottom:6 }}><Ic icon={Package} /> {t.load} · ETA {t.eta}</div>
                    <div style={{ height:4, background:'var(--border)', borderRadius:2 }}>
                      <div style={{ height:'100%', width:`${t.progress*100}%`, background:t.color, borderRadius:2 }} />
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{Math.round(t.progress*100)}% complete</div>
                  </>
                )}
                {isSel && (
                  <div style={{ display:'flex', gap:6, marginTop:10 }}>
                    <button className="btn btn-ghost" style={{ fontSize:10, flex:1 }} onClick={async e => { e.stopPropagation(); showToast('', t.unit, 'Pinging ELD for location update...'); try { const res = await fetch('/api/eld-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vehicle: t.unit }) }); if (res.ok) { showToast('success', 'ELD Synced', t.unit + ' location updated') } else { showToast('error', 'ELD Sync Failed', 'Could not reach ELD — check connection') } } catch { showToast('error', 'ELD Sync Failed', 'Network error — try again') } }}><Ic icon={Radio} /> Ping</button>
                    <button className="btn btn-ghost" style={{ fontSize:10, flex:1 }} onClick={e => { e.stopPropagation(); const driverObj = drivers.find(d => (d.name || d.full_name) === t.driver); const phone = driverObj?.phone || driverObj?.phone_number; if (phone) { window.open('sms:' + phone, '_self') } else { showToast('', 'No Phone', 'No phone number on file for ' + t.driver) } }}><Ic icon={MessageCircle} /> Message</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

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
          <div style={{ fontSize:15, fontWeight:700, marginBottom:8 }}>No vehicles added yet</div>
          <div style={{ fontSize:13, color:'var(--muted)', lineHeight:1.6, maxWidth:300, margin:'0 auto' }}>
            Add your first vehicle to see your fleet overview here.
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



// ─── FUEL OPTIMIZER ───────────────────────────────────────────────────────────
// Average retail diesel by region (DOE EIA weekly avg — updated periodically)
const AVG_DIESEL_RETAIL = {
  US: 3.82, AL:3.65, AK:4.25, AZ:3.95, AR:3.55, CA:4.85, CO:3.72, CT:4.10, DE:3.78, FL:3.70, GA:3.58,
  HI:5.10, ID:3.80, IL:3.90, IN:3.75, IA:3.60, KS:3.55, KY:3.62, LA:3.50, ME:4.05, MD:3.82,
  MA:4.08, MI:3.78, MN:3.72, MS:3.52, MO:3.50, MT:3.75, NE:3.58, NV:4.15, NH:3.95, NJ:3.85,
  NM:3.70, NY:4.15, NC:3.62, ND:3.68, OH:3.72, OK:3.48, OR:4.20, PA:4.05, RI:4.02, SC:3.55,
  SD:3.62, TN:3.58, TX:3.45, UT:3.78, VT:4.00, VA:3.68, WA:4.30, WV:3.75, WI:3.70, WY:3.72,
}

export function FuelOptimizer() {
  const { showToast } = useApp()
  const ctx = useCarrier() || {}
  const expenses = ctx.expenses || []
  const loads = ctx.loads || []
  const vehicles = ctx.vehicles || []

  const fuelExpenses = expenses.filter(e => (e.cat || e.category || '').toLowerCase() === 'fuel')
  const fuelSpend = fuelExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
  const totalMiles = loads.reduce((s, l) => s + (parseFloat(l.miles) || 0), 0)
  const costPerMile = totalMiles > 0 ? (fuelSpend / totalMiles).toFixed(2) : '--'
  const vehicleMpgs = vehicles.map(v => parseFloat(v.mpg)).filter(n => !isNaN(n) && n > 0)
  const avgMpg = vehicleMpgs.length > 0 ? (vehicleMpgs.reduce((s, m) => s + m, 0) / vehicleMpgs.length).toFixed(1) : '--'
  const hasData = fuelSpend > 0 || totalMiles > 0

  // Fuel discount savings calculation
  const totalGallons = fuelExpenses.reduce((s, e) => s + (Number(e.gallons) || 0), 0)
  const fillsWithPrice = fuelExpenses.filter(e => e.price_per_gal && e.gallons)
  const totalSavings = fillsWithPrice.reduce((s, e) => {
    const retail = AVG_DIESEL_RETAIL[e.state] || AVG_DIESEL_RETAIL.US
    const discount = retail - Number(e.price_per_gal)
    return s + (discount > 0 ? discount * Number(e.gallons) : 0)
  }, 0)
  const avgDiscount = fillsWithPrice.length > 0
    ? fillsWithPrice.reduce((s, e) => {
        const retail = AVG_DIESEL_RETAIL[e.state] || AVG_DIESEL_RETAIL.US
        return s + (retail - Number(e.price_per_gal))
      }, 0) / fillsWithPrice.length
    : 0
  const projectedAnnualSavings = totalSavings > 0 && fillsWithPrice.length > 0
    ? Math.round(totalSavings / fillsWithPrice.length * 52)
    : 0

  if (!hasData) {
    return (
      <div style={{ ...S.page, paddingBottom:40 }}>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flex:1, gap:12, color:'var(--muted)' }}>
          <Fuel size={40} />
          <div style={{ fontSize:15, fontWeight:700 }}>No fuel data yet</div>
          <div style={{ fontSize:13 }}>Add fuel expenses with gallons and $/gal to track savings.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      {/* Savings Banner */}
      {totalSavings > 0 && (
        <div style={{ background:'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))', border:'1px solid rgba(34,197,94,0.25)', borderRadius:14, padding:'18px 22px', display:'flex', alignItems:'center', gap:20, marginBottom:4 }}>
          <div style={{ width:52, height:52, borderRadius:12, background:'rgba(34,197,94,0.15)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <TrendingDown size={26} style={{ color:'var(--success)' }} />
          </div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, color:'var(--success)', fontWeight:700, letterSpacing:1, marginBottom:4 }}>FUEL DISCOUNT SAVINGS</div>
            <div style={{ display:'flex', gap:24, flexWrap:'wrap' }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:'var(--success)' }}>${Math.round(totalSavings).toLocaleString()}</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>saved so far</div>
              </div>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:'var(--accent)' }}>${avgDiscount.toFixed(2)}</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>avg discount/gal</div>
              </div>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:'var(--text)' }}>${projectedAnnualSavings.toLocaleString()}</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>projected/year</div>
              </div>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:32, color:'var(--text)' }}>{fillsWithPrice.length}</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>tracked fills</div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div style={S.grid(4)}>
        <StatCard label="Fuel Spend" value={`$${fuelSpend.toLocaleString()}`} change={`${fuelExpenses.length} fill${fuelExpenses.length !== 1 ? 's' : ''} · ${Math.round(totalGallons).toLocaleString()} gal`} color="var(--warning)"/>
        <StatCard label="Cost/Mile" value={costPerMile === '--' ? '--' : `$${costPerMile}`} change={totalMiles > 0 ? `${totalMiles.toLocaleString()} total miles` : 'No miles data'} color="var(--muted)" changeType="neutral"/>
        <StatCard label="Fleet Avg MPG" value={avgMpg} change={vehicleMpgs.length > 0 ? `${vehicleMpgs.length} vehicle${vehicleMpgs.length !== 1 ? 's' : ''}` : 'No vehicle MPG data'} color="var(--accent)" changeType="neutral"/>
        <StatCard label="Discount Savings" value={totalSavings > 0 ? `$${Math.round(totalSavings).toLocaleString()}` : '--'} change={avgDiscount > 0 ? `$${avgDiscount.toFixed(2)}/gal avg discount` : 'Add $/gal to track'} color="var(--success)" changeType={totalSavings > 0 ? 'positive' : 'neutral'}/>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
        <div style={S.panel}>
          <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Fuel} /> Fuel Fills</div></div>
          <div>
            {fuelExpenses.slice(0, 12).map((e, i) => {
              const ppg = Number(e.price_per_gal) || 0
              const gal = Number(e.gallons) || 0
              const retail = AVG_DIESEL_RETAIL[e.state] || AVG_DIESEL_RETAIL.US
              const discount = ppg > 0 ? retail - ppg : 0
              const fillSaved = discount > 0 && gal > 0 ? discount * gal : 0
              return (
                <div key={i} style={S.row}>
                  <div><Fuel size={18} /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{e.notes || e.description || 'Fuel'}{e.state ? ` · ${e.state}` : ''}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {e.date || '--'}{gal > 0 ? ` · ${gal}gal` : ''}{ppg > 0 ? ` · $${ppg.toFixed(2)}/gal` : ''}{e.load ? ` · ${e.load}` : ''}{e.driver ? ` · ${e.driver}` : ''}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: 22, color: 'var(--warning)' }}>${(Number(e.amount) || 0).toLocaleString()}</div>
                    {fillSaved > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700 }}>Saved ${fillSaved.toFixed(0)} (−${discount.toFixed(2)}/gal)</div>
                    )}
                    {ppg > 0 && discount <= 0 && (
                      <div style={{ fontSize: 10, color: 'var(--danger)', fontWeight: 700 }}>Over retail by ${Math.abs(discount).toFixed(2)}/gal</div>
                    )}
                  </div>
                </div>
              )
            })}
            {fuelExpenses.length === 0 && (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>No fuel expenses recorded yet.</div>
            )}
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          <div style={S.panel}>
            <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={BarChart2} /> Fleet Efficiency</div></div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {vehicles.length > 0 ? vehicles.map((v, i) => {
                const mpg = parseFloat(v.mpg) || 0
                const status = mpg >= 6.5 ? 'Good' : mpg > 0 ? 'Low MPG' : 'No Data'
                const color = mpg >= 6.5 ? 'var(--success)' : mpg > 0 ? 'var(--warning)' : 'var(--muted)'
                return (
                  <div key={v.id || i} style={{ background:'var(--surface2)', borderRadius:8, padding:12 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                      <div style={{ fontSize:12, fontWeight:700 }}>{v.name || v.unit || `Vehicle ${i + 1}`}{v.driver ? ` · ${v.driver}` : ''}</div>
                      <span style={S.tag(color)}>{status}</span>
                    </div>
                    {mpg > 0 && (
                      <>
                        <div style={{ height:6, background:'var(--border)', borderRadius:3 }}>
                          <div style={{ height:'100%', width:`${Math.min((mpg/10)*100, 100)}%`, background:color, borderRadius:3 }} />
                        </div>
                        <div style={{ fontSize:11, color, marginTop:4 }}>{mpg} MPG</div>
                      </>
                    )}
                  </div>
                )
              }) : (
                <div style={{ textAlign:'center', color:'var(--muted)', fontSize:13, padding:16 }}>No vehicles added yet.</div>
              )}
            </div>
          </div>
          <div style={S.panel}>
            <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Bot} /> AI Fuel Tips</div></div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {totalMiles > 0 && fuelSpend > 0 && (
                <div style={{ padding:12, background:'rgba(240,165,0,0.06)', borderRadius:8, border:'1px solid rgba(240,165,0,0.2)', fontSize:12 }}>
                  <b>Cost/Mile:</b> Your fleet averages <b style={{color:'var(--accent)'}}>${costPerMile}/mi</b> in fuel. Industry avg is $0.55-$0.65/mi.
                  {parseFloat(costPerMile) > 0.65 && <span style={{color:'var(--danger)'}}> Your fuel cost is above average — look for discount programs.</span>}
                  {parseFloat(costPerMile) <= 0.55 && <span style={{color:'var(--success)'}}> Great job — you're below industry average.</span>}
                </div>
              )}
              {fillsWithPrice.length === 0 && fuelExpenses.length > 0 && (
                <div style={{ padding:12, background:'rgba(59,130,246,0.06)', borderRadius:8, border:'1px solid rgba(59,130,246,0.2)', fontSize:12, color:'var(--accent2)' }}>
                  <b>Tip:</b> Add <b>$/gallon</b> and <b>gallons</b> when logging fuel to track your fuel card discounts vs retail price.
                </div>
              )}
              {avgDiscount > 0.15 && (
                <div style={{ padding:12, background:'rgba(34,197,94,0.06)', borderRadius:8, border:'1px solid rgba(34,197,94,0.2)', fontSize:12, color:'var(--success)' }}>
                  <b>Nice!</b> You're averaging <b>${avgDiscount.toFixed(2)}/gal</b> below retail. That's <b>${projectedAnnualSavings.toLocaleString()}/year</b> in projected savings.
                </div>
              )}
              {avgDiscount > 0 && avgDiscount <= 0.15 && (
                <div style={{ padding:12, background:'rgba(245,158,11,0.06)', borderRadius:8, border:'1px solid rgba(245,158,11,0.2)', fontSize:12, color:'var(--warning)' }}>
                  <b>Room to improve:</b> Your avg discount is only <b>${avgDiscount.toFixed(2)}/gal</b>. Fuel cards like Mudflap or AtoB can get you $0.25-$0.50/gal off at select stops.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── FLEET MANAGER ────────────────────────────────────────────────────────────
export function FleetManager() {
  const { showToast } = useApp()
  const { vehicles: dbVehicles, addVehicle, editVehicle, removeVehicle } = useCarrier()
  const initialTrucks = dbVehicles.length ? dbVehicles.map((v, i) => ({
    id: v.id, unit: v.unit_number || `Unit ${String(i+1).padStart(2,'0')}`,
    status: v.status === 'Active' ? 'Available' : v.status || 'Available',
    statusColor: v.status === 'Active' ? 'var(--accent2)' : 'var(--muted)',
    year: v.year || '', make: v.make || '', model: v.model || '',
    vin: v.vin || '', plate: v.license_plate || '', color: '',
    gvw: '80,000 lbs', fuel: 'Diesel',
    regExpiry: v.registration_expiry || '', insExpiry: v.insurance_expiry || '',
    dotInspection: '', odometer: v.current_miles || 0,
    driver: '', unit_cost: 0,
    mpg:[7.0,7.0,7.0,7.0,7.0,7.0], miles:[0,0,0,0,0,0],
    revenue:[0,0,0,0,0,0], opCost:[0,0,0,0,0,0],
  })) : FLEET_TRUCKS
  const [trucks, setTrucks] = useState(initialTrucks)
  const [selectedTruck, setSelectedTruck] = useState(initialTrucks[0]?.id || 'unit01')
  const [subTab, setSubTab] = useState('profile')
  const [logs, setLogs] = useState(MAINT_LOGS)
  const [showAddService, setShowAddService] = useState(false)
  const [newService, setNewService] = useState({ date:'', mileage:'', type:'Oil Change', cost:'', shop:'', notes:'', nextDue:'' })

  // Add Truck modal
  const [showAddTruck, setShowAddTruck] = useState(false)
  const [newTruck, setNewTruck] = useState(BLANK_TRUCK)
  const [vinLoading, setVinLoading] = useState(false)
  const [vinResult, setVinResult] = useState(null)
  // Edit Truck modal
  const [showEditTruck, setShowEditTruck] = useState(false)
  const [editTruckData, setEditTruckData] = useState(BLANK_TRUCK)
  // Delete confirmation
  const [confirmDeleteTruck, setConfirmDeleteTruck] = useState(null)

  const openEditTruck = () => {
    if (!truck) return
    setEditTruckData({ vin: truck.vin || '', year: truck.year || '', make: truck.make || '', model: truck.model || '', color: truck.color || '', plate: truck.plate || '', gvw: truck.gvw || '', fuel: truck.fuel || 'Diesel', odometer: String(truck.odometer || ''), driver: truck.driver || '', regExpiry: truck.regExpiry || '', insExpiry: truck.insExpiry || '', dotInspection: truck.dotInspection || '', unit_cost: String(truck.unit_cost || '') })
    setShowEditTruck(true)
  }

  const saveEditTruck = async () => {
    try {
      await editVehicle(selectedTruck, {
        vin: editTruckData.vin, year: parseInt(editTruckData.year) || null,
        make: editTruckData.make, model: editTruckData.model,
        license_plate: editTruckData.plate, current_miles: parseInt(editTruckData.odometer) || 0,
        insurance_expiry: editTruckData.insExpiry || null, registration_expiry: editTruckData.regExpiry || null,
      })
      setTrucks(t => t.map(tr => tr.id === selectedTruck ? { ...tr, ...editTruckData, odometer: parseInt(editTruckData.odometer) || 0 } : tr))
      showToast('success', 'Truck Updated', `${editTruckData.year} ${editTruckData.make} ${editTruckData.model} updated`)
      setShowEditTruck(false)
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to update truck')
    }
  }

  const handleDeleteTruck = async (id) => {
    try {
      await removeVehicle(id)
      setTrucks(t => t.filter(tr => tr.id !== id))
      setConfirmDeleteTruck(null)
      if (selectedTruck === id) setSelectedTruck(trucks.find(t => t.id !== id)?.id || null)
      showToast('success', 'Truck Removed', 'Vehicle has been removed')
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to remove truck')
    }
  }

  const decodeVIN = async (vin) => {
    if (vin.length !== 17) return
    setVinLoading(true)
    setVinResult(null)
    try {
      const res = await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`)
      const json = await res.json()
      const get = (var_) => json.Results?.find(r => r.Variable === var_)?.Value || ''
      const year  = get('Model Year')
      const make  = get('Make')
      const model = get('Model')
      const gvw   = get('Gross Vehicle Weight Rating From')
      const fuel  = get('Fuel Type - Primary') || 'Diesel'
      const body  = get('Body Class')
      if (!year || year === 'Not Applicable') {
        setVinResult({ error: 'VIN not found — check the number and try again' })
      } else {
        const decoded = { year, make, model, gvw: gvw || '80,000 lbs', fuel: fuel.includes('Diesel') ? 'Diesel' : fuel, body }
        setVinResult(decoded)
        setNewTruck(t => ({ ...t, year, make, model, gvw: decoded.gvw, fuel: decoded.fuel }))
        showToast('', 'VIN Decoded', `${year} ${make} ${model}`)
      }
    } catch {
      setVinResult({ error: 'Could not reach VIN database — check your connection' })
    } finally {
      setVinLoading(false)
    }
  }

  const saveTruck = async () => {
    if (!newTruck.vin || !newTruck.make) return
    const unitNum = 'Unit ' + String(trucks.length + 1).padStart(2, '0')
    const dbPayload = {
      unit_number: unitNum, vin: newTruck.vin, year: parseInt(newTruck.year) || null,
      make: newTruck.make, model: newTruck.model, license_plate: newTruck.plate,
      license_state: '', status: 'Active', current_miles: parseInt(newTruck.odometer) || 0,
      insurance_expiry: newTruck.insExpiry || null, registration_expiry: newTruck.regExpiry || null,
      notes: `${newTruck.color || ''}, ${newTruck.gvw || ''}, ${newTruck.fuel || 'Diesel'}`.trim(),
    }
    const saved = await addVehicle(dbPayload)
    const id = saved?.id || ('local-veh-' + Date.now())
    setTrucks(t => [...t, {
      ...newTruck, id, unit: unitNum, status: 'Available', statusColor: 'var(--accent2)',
      odometer: parseInt(newTruck.odometer) || 0,
      unit_cost: parseFloat(newTruck.unit_cost) || 0,
      mpg:[7.0,7.0,7.0,7.0,7.0,7.0],
      miles:[0,0,0,0,0,0], revenue:[0,0,0,0,0,0], opCost:[0,0,0,0,0,0],
    }])
    setSelectedTruck(id)
    setShowAddTruck(false)
    setNewTruck(BLANK_TRUCK)
    setVinResult(null)
    showToast('', 'Truck Added', `${newTruck.year} ${newTruck.make} ${newTruck.model} — ${unitNum}`)
  }

  const truck = trucks.find(t => t.id === selectedTruck)
  const truckLogs = logs[selectedTruck] || []
  const totalMaintCost = truckLogs.reduce((s, l) => s + l.cost, 0)
  const avgMpg = truck ? (truck.mpg.reduce((s,v) => s+v, 0) / truck.mpg.length).toFixed(1) : '0.0'
  const totalMiles = truck ? truck.miles.reduce((s,v) => s+v, 0) : 0
  const totalRev = truck ? truck.revenue.reduce((s,v) => s+v, 0) : 0
  const totalCost = truck ? truck.opCost.reduce((s,v) => s+v, 0) : 0
  const netProfit = totalRev - totalCost
  const maxRev = truck ? Math.max(...truck.revenue) : 0

  const addService = () => {
    if (!newService.date || !newService.type) return
    const entry = { ...newService, id: Date.now(), cost: parseFloat(newService.cost) || 0, mileage: parseInt(newService.mileage) || truck.odometer }
    setLogs(l => ({ ...l, [selectedTruck]: [entry, ...(l[selectedTruck] || [])] }))
    setNewService({ date:'', mileage:'', type:'Oil Change', cost:'', shop:'', notes:'', nextDue:'' })
    setShowAddService(false)
    showToast('', 'Service Logged', `${entry.type} · Unit ${truck.unit} · $${entry.cost}`)
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'auto' }}>

      {/* ── Add Truck Modal ── */}
      {showAddTruck && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddTruck(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:16, width:'100%', maxWidth:580, maxHeight:'90vh', overflowY:'auto', padding:28 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
              <div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1 }}>ADD NEW TRUCK</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>Enter the VIN to auto-fill truck details</div>
              </div>
              <button onClick={() => { setShowAddTruck(false); setVinResult(null); setNewTruck(BLANK_TRUCK) }} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', fontSize:20 }}>✕</button>
            </div>

            {/* VIN input with decode */}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:6 }}>VIN Number <span style={{ color:'var(--accent)' }}>— 17 characters, auto-decodes</span></label>
              <div style={{ display:'flex', gap:8 }}>
                <input
                  value={newTruck.vin}
                  onChange={e => {
                    const v = e.target.value.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '').slice(0, 17)
                    setNewTruck(t => ({ ...t, vin: v }))
                    setVinResult(null)
                    if (v.length === 17) decodeVIN(v)
                  }}
                  placeholder="1FUJGLDR5MLKJ2841"
                  maxLength={17}
                  style={{ flex:1, background:'var(--surface2)', border:`2px solid ${newTruck.vin.length === 17 ? (vinResult?.error ? 'var(--danger)' : 'var(--success)') : 'var(--border)'}`, borderRadius:8, padding:'10px 14px', color:'var(--text)', fontSize:15, fontFamily:'monospace', letterSpacing:2, outline:'none' }}
                />
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', width:44, fontSize:20 }}>
                  {vinLoading ? '...' : newTruck.vin.length === 17 && !vinResult?.error ? <Check size={14} /> : ''}
                </div>
              </div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>{newTruck.vin.length}/17 characters</div>
            </div>

            {/* VIN result banner */}
            {vinResult && !vinResult.error && (
              <div style={{ padding:'12px 14px', background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:10, marginBottom:16, display:'flex', gap:12, alignItems:'center' }}>
                <span style={{ fontSize:22 }}><Truck size={20} /></span>
                <div>
                  <div style={{ fontSize:14, fontWeight:800, color:'var(--success)' }}>{vinResult.year} {vinResult.make} {vinResult.model}</div>
                  <div style={{ fontSize:11, color:'var(--muted)' }}>VIN decoded · {vinResult.body} · {vinResult.fuel} · Fields auto-filled below</div>
                </div>
              </div>
            )}
            {vinResult?.error && (
              <div style={{ padding:'10px 14px', background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.2)', borderRadius:10, marginBottom:16, fontSize:12, color:'var(--danger)' }}>
                <AlertTriangle size={13} /> {vinResult.error}
              </div>
            )}

            {/* Form fields */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
              {[
                { key:'year',         label:'Year',              ph:'2021',         note: vinResult && !vinResult.error ? 'from VIN' : '' },
                { key:'make',         label:'Make',              ph:'Freightliner', note: vinResult && !vinResult.error ? 'from VIN' : '' },
                { key:'model',        label:'Model',             ph:'Cascadia',     note: vinResult && !vinResult.error ? 'from VIN' : '' },
                { key:'color',        label:'Color',             ph:'White' },
                { key:'plate',        label:'License Plate',     ph:'MN-94821' },
                { key:'gvw',          label:'GVW',               ph:'80,000 lbs',   note: vinResult && !vinResult.error ? 'from VIN' : '' },
                { key:'odometer',     label:'Current Odometer',  ph:'125000' },
                { key:'driver',       label:'Assigned Driver',   ph:'Driver name' },
                { key:'regExpiry',    label:'Registration Expiry',ph:'Dec 2026' },
                { key:'insExpiry',    label:'Insurance Expiry',   ph:'Jun 2026' },
                { key:'dotInspection',label:'DOT Inspection',     ph:'Dec 2025' },
                { key:'unit_cost',    label:'Purchase Cost ($)',  ph:'128000' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:11, color: f.note ? 'var(--success)' : 'var(--muted)', display:'block', marginBottom:4 }}>{f.label} {f.note && <span style={{ fontSize:10 }}>{f.note}</span>}</label>
                  <input value={newTruck[f.key]} onChange={e => setNewTruck(t => ({ ...t, [f.key]: e.target.value }))}
                    placeholder={f.ph}
                    style={{ width:'100%', background: f.note ? 'rgba(34,197,94,0.05)' : 'var(--surface2)', border:`1px solid ${f.note ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`, borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }} />
                </div>
              ))}
            </div>

            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'12px 0', fontSize:14 }} onClick={saveTruck}
                disabled={!newTruck.vin || !newTruck.make}>
                <Truck size={13} /> Add Truck to Fleet
              </button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'12px 0' }} onClick={() => { setShowAddTruck(false); setVinResult(null); setNewTruck(BLANK_TRUCK) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Truck Modal ── */}
      {showEditTruck && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={e => { if (e.target===e.currentTarget) setShowEditTruck(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:440, padding:24 }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Edit Truck</div>
            <div style={{ fontSize:12, color:'var(--muted)', marginBottom:18 }}>Update vehicle details</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { key:'make', label:'Make', ph:'Freightliner' },
                { key:'model', label:'Model', ph:'Cascadia' },
                { key:'year', label:'Year', ph:'2023' },
                { key:'plate', label:'License Plate', ph:'ABC-1234' },
                { key:'odometer', label:'Odometer', ph:'120000' },
                { key:'regExpiry', label:'Registration Expiry', ph:'', type:'date' },
                { key:'insExpiry', label:'Insurance Expiry', ph:'', type:'date' },
              ].map(f => (
                <div key={f.key}>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                  <input type={f.type||'text'} value={editTruckData[f.key]} onChange={e => setEditTruckData(t => ({ ...t, [f.key]: e.target.value }))} placeholder={f.ph}
                    style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10, marginTop:18 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }} onClick={saveEditTruck}>Save Changes</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setShowEditTruck(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Truck Confirmation ── */}
      {confirmDeleteTruck && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:9999, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target===e.currentTarget) setConfirmDeleteTruck(null) }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, width:360, padding:24, textAlign:'center' }}>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:8, color:'var(--danger)' }}>Remove Vehicle?</div>
            <div style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>This will permanently remove <b>{confirmDeleteTruck.unit}</b>. This cannot be undone.</div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-danger" style={{ flex:1, padding:'11px 0' }} onClick={() => handleDeleteTruck(confirmDeleteTruck.id)}>Remove</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setConfirmDeleteTruck(null)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Truck sidebar ── */}
      <div style={{ width:200, flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'14px 16px 8px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2 }}>FLEET ({trucks.length})</div>
        </div>
        {trucks.map(t => {
          const isSel = selectedTruck === t.id
          const hasAlert = t.regExpiry && expiryColor(t.regExpiry) !== 'var(--success)' || t.insExpiry && expiryColor(t.insExpiry) !== 'var(--success)'
          return (
            <div key={t.id} onClick={() => setSelectedTruck(t.id)}
              style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer', borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`, background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.15s' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                <div style={{ fontSize:13, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)' }}><Ic icon={Truck} /> {t.unit}</div>
                {hasAlert && <span style={{ fontSize:11 }}><AlertTriangle size={18} /></span>}
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{t.year} {t.make}</div>
              <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:7, height:7, borderRadius:'50%', background:t.statusColor }} />
                <span style={{ fontSize:10, color:t.statusColor, fontWeight:700 }}>{t.status}</span>
              </div>
              <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{t.odometer.toLocaleString()} mi</div>
            </div>
          )
        })}
        <div style={{ padding:12, marginTop:'auto', borderTop:'1px solid var(--border)' }}>
          <button className="btn btn-primary" style={{ width:'100%', fontSize:11 }} onClick={() => setShowAddTruck(true)}>+ Add Truck</button>
        </div>
      </div>

      {/* ── Right panel ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflowY:'auto' }}>

        {!truck ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', fontSize:14 }}>No trucks added yet. Click "+ Add Truck" to get started.</div>
        ) : (<>
        {/* Truck header */}
        <div style={{ flexShrink:0, padding:'14px 20px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ width:44, height:44, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22 }}><Truck size={20} /></div>
          <div style={{ flex:1 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:2 }}>
              <span style={{ fontSize:16, fontWeight:800 }}>{truck.unit} — {truck.year} {truck.make} {truck.model}</span>
              <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:truck.statusColor+'15', color:truck.statusColor }}>{truck.status}</span>
            </div>
            <div style={{ fontSize:12, color:'var(--muted)' }}>
              {truck.plate} · VIN {truck.vin.slice(-6)} · {truck.driver} · {truck.odometer.toLocaleString()} mi
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={openEditTruck}><Ic icon={PencilIcon} /> Edit</button>
            <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { setSubTab('maintenance'); setShowAddService(true) }}><Ic icon={Wrench} /> Log Service</button>
            <button className="btn btn-danger" style={{ fontSize:11 }} onClick={() => setConfirmDeleteTruck(truck)}><Ic icon={Trash2} /> Remove</button>
          </div>
        </div>

        {/* Sub-nav */}
        <div style={{ flexShrink:0, display:'flex', gap:2, padding:'0 20px', background:'var(--surface)', borderBottom:'1px solid var(--border)' }}>
          {[
            { id:'profile',     label:'Profile' },
            { id:'maintenance', label:'Maintenance' },
            { id:'analytics',   label:'Analytics' },
          ].map(t => (
            <button key={t.id} onClick={() => setSubTab(t.id)}
              style={{ padding:'10px 16px', border:'none', borderBottom: subTab===t.id ? '2px solid var(--accent)' : '2px solid transparent', background:'transparent', color: subTab===t.id ? 'var(--accent)' : 'var(--muted)', fontSize:12, fontWeight: subTab===t.id ? 700 : 500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif", marginBottom:-1 }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, minHeight:0, overflowY:'auto', padding:20, display:'flex', flexDirection:'column', gap:16 }}>

          {/* ── PROFILE TAB ── */}
          {subTab === 'profile' && (
            <>
              {/* Expiry alerts */}
              {[
                { label:'Registration', expiry: truck.regExpiry },
                { label:'Insurance',    expiry: truck.insExpiry },
                { label:'DOT Inspection', expiry: truck.dotInspection },
              ].filter(item => expiryColor(item.expiry) !== 'var(--success)').map(item => (
                <div key={item.label} style={{ padding:'12px 16px', background: expiryColor(item.expiry)==='var(--danger)' ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)', border:`1px solid ${expiryColor(item.expiry)}30`, borderRadius:10, display:'flex', alignItems:'center', gap:12 }}>
                  <span style={{ fontSize:18 }}>{expiryColor(item.expiry)==='var(--danger)' ? <Siren size={18} /> : <AlertTriangle size={18} />}</span>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:700, color: expiryColor(item.expiry) }}>{item.label} {expiryColor(item.expiry)==='var(--danger)' ? 'EXPIRED' : 'expiring soon'} — {item.expiry}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>Update before dispatching this truck</div>
                  </div>
                  <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { if (item.label === 'Registration') { window.open('https://www.fmcsa.dot.gov/registration', '_blank') } else if (item.label === 'Insurance') { showToast('', 'Insurance Renewal', 'Contact your insurance agent to renew. Policy expires ' + item.expiry) } else if (item.label === 'DOT Inspection') { window.open('https://ai.fmcsa.dot.gov/RegistrationUpdate/UI/', '_blank') } else { window.open('https://www.fmcsa.dot.gov/', '_blank') } }}>Renew Now</button>
                </div>
              ))}

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {/* Truck details */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={Truck} /> Unit Details</div>
                  <div style={{ padding:16, display:'flex', flexDirection:'column', gap:0 }}>
                    {[
                      { label:'Year / Make / Model', value:`${truck.year} ${truck.make} ${truck.model}` },
                      { label:'VIN',                 value: truck.vin, mono: true },
                      { label:'License Plate',       value: truck.plate },
                      { label:'Color',               value: truck.color },
                      { label:'GVW Rating',          value: truck.gvw },
                      { label:'Fuel Type',           value: truck.fuel },
                      { label:'Odometer',            value: truck.odometer.toLocaleString() + ' mi' },
                      { label:'Assigned Driver',     value: truck.driver, color:'var(--accent2)' },
                      { label:'Purchase Cost',       value: '$' + truck.unit_cost.toLocaleString(), color:'var(--accent)' },
                    ].map(item => (
                      <div key={item.label} style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderBottom:'1px solid var(--border)' }}>
                        <span style={{ fontSize:12, color:'var(--muted)' }}>{item.label}</span>
                        <span style={{ fontSize:12, fontWeight:700, color: item.color || 'var(--text)', fontFamily: item.mono ? 'monospace' : 'inherit' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Compliance & documents */}
                <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
                  <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                    <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={FileText} /> Compliance Dates</div>
                    <div style={{ padding:16, display:'flex', flexDirection:'column', gap:0 }}>
                      {[
                        { label:'Registration Expiry', value: truck.regExpiry,       expiry: truck.regExpiry },
                        { label:'Insurance Expiry',    value: truck.insExpiry,       expiry: truck.insExpiry },
                        { label:'DOT Inspection',      value: truck.dotInspection,   expiry: truck.dotInspection },
                      ].map(item => (
                        <div key={item.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                          <span style={{ fontSize:12, color:'var(--muted)' }}>{item.label}</span>
                          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                            <span style={{ fontSize:12, fontWeight:700 }}>{item.value}</span>
                            <span style={{ fontSize:10, color: expiryColor(item.expiry) }}>{expiryLabel(item.expiry)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                    <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ fontWeight:700, fontSize:13 }}><Ic icon={Paperclip} /> Documents</div>
                      <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx'; input.onchange = async (e) => { const file = e.target.files?.[0]; if (!file) return; try { showToast('', 'Uploading', file.name + '...'); const result = await uploadFile(file, 'vehicles/' + (truck.id || 'unknown')); await createDocument({ name: file.name, file_url: result.url, file_path: result.path, doc_type: 'vehicle', vehicle_id: truck.id || null }); showToast('success', 'Uploaded', file.name + ' attached successfully') } catch (err) { showToast('error', 'Upload Failed', err.message || 'Could not upload file') } }; input.click() }}>+ Upload</button>
                    </div>
                    <div style={{ padding:12, display:'flex', flexDirection:'column', gap:8 }}>
                      {[
                        { name:'Registration Card.pdf',    type:'Registration', date:'Dec 2024' },
                        { name:'Insurance Certificate.pdf',type:'Insurance',    date:'Jan 2025' },
                        { name:'Last Inspection.pdf',      type:'DOT Inspection',date:'Dec 2024' },
                      ].map(doc => (
                        <div key={doc.name} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'var(--surface2)', borderRadius:8 }}>
                          <span style={{ fontSize:16 }}><FileText size={16} /></span>
                          <div style={{ flex:1, minWidth:0 }}>
                            <div style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.name}</div>
                            <div style={{ fontSize:10, color:'var(--muted)' }}>{doc.type} · {doc.date}</div>
                          </div>
                          <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { if (doc.url || doc.file_url) { window.open(doc.url || doc.file_url, '_blank') } else { showToast('', 'No File', doc.name + ' has no file attached — upload one first') } }}>View</button>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ── MAINTENANCE TAB ── */}
          {subTab === 'maintenance' && (
            <>
              {/* Stats */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
                {[
                  { label:'Services Logged',  value: truckLogs.length,                         color:'var(--accent)' },
                  { label:'Total Maint Cost', value:'$' + totalMaintCost.toLocaleString(),      color:'var(--danger)' },
                  { label:'Last Service',     value: truckLogs[0]?.date || '—',                color:'var(--accent2)' },
                  { label:'Next Due',         value: truckLogs[0]?.nextDue || '—',             color: truckLogs[0]?.nextDue?.includes('warning') ? 'var(--warning)' : 'var(--success)' },
                ].map(s => (
                  <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'13px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Add service form */}
              {showAddService && (
                <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:12, padding:18 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--accent)', marginBottom:14 }}><Ic icon={Wrench} /> Log New Service — {truck.unit}</div>
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:10, marginBottom:12 }}>
                    {[
                      { key:'date',    label:'Date',         type:'text',   ph:'Mar 8' },
                      { key:'mileage', label:'Mileage',      type:'number', ph: truck.odometer.toString() },
                      { key:'cost',    label:'Cost ($)',      type:'number', ph:'250' },
                      { key:'shop',    label:'Shop / Location', type:'text', ph:'Speedco Chicago' },
                      { key:'nextDue', label:'Next Due',     type:'text',   ph:'295,000 mi or Jun 2025' },
                      { key:'notes',   label:'Notes',        type:'text',   ph:'What was done...' },
                    ].map(f => (
                      <div key={f.key}>
                        <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                        <input type={f.type} placeholder={f.ph} value={newService[f.key]}
                          onChange={e => setNewService(s => ({ ...s, [f.key]: e.target.value }))}
                          style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", boxSizing:'border-box' }} />
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Service Type</label>
                      <select value={newService.type} onChange={e => setNewService(s => ({ ...s, type:e.target.value }))}
                        style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif" }}>
                        {SERVICE_TYPES.map(t => <option key={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:10 }}>
                    <button className="btn btn-primary" style={{ flex:1, padding:'11px 0' }} onClick={addService}><Ic icon={Check} /> Log Service</button>
                    <button className="btn btn-ghost" style={{ flex:1, padding:'11px 0' }} onClick={() => setShowAddService(false)}>Cancel</button>
                  </div>
                </div>
              )}

              {/* Service history */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:8 }}>
                  <div style={{ fontWeight:700, fontSize:13 }}><Ic icon={Wrench} /> Service History — {truck.unit}</div>
                  <button className="btn btn-primary" style={{ fontSize:11 }} onClick={() => setShowAddService(s => !s)}>{showAddService ? '✕ Cancel' : '+ Log Service'}</button>
                </div>
                <div style={{ overflowX:'auto' }}><table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
                  <thead><tr style={{ background:'var(--surface2)', borderBottom:'1px solid var(--border)' }}>
                    {['Date','Mileage','Service Type','Cost','Shop','Next Due','Notes'].map(h => (
                      <th key={h} style={{ padding:'9px 14px', fontSize:10, fontWeight:700, color:'var(--muted)', textAlign:'left', textTransform:'uppercase', letterSpacing:1 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {truckLogs.map((log, i) => (
                      <tr key={log.id} style={{ borderBottom:'1px solid var(--border)', background: i%2===0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>
                        <td style={{ padding:'11px 14px', fontSize:12, color:'var(--muted)' }}>{log.date}</td>
                        <td style={{ padding:'11px 14px', fontSize:12, fontFamily:'monospace' }}>{log.mileage.toLocaleString()}</td>
                        <td style={{ padding:'11px 14px', fontSize:13, fontWeight:600 }}>{log.type}</td>
                        <td style={{ padding:'11px 14px', fontFamily:"'Bebas Neue',sans-serif", fontSize:18, color:'var(--danger)' }}>${log.cost.toLocaleString()}</td>
                        <td style={{ padding:'11px 14px', fontSize:12, color:'var(--muted)' }}>{log.shop}</td>
                        <td style={{ padding:'11px 14px', fontSize:11, color: log.nextDue?.includes('warning') ? 'var(--warning)' : 'var(--accent2)', fontWeight:600 }}>{log.nextDue}</td>
                        <td style={{ padding:'11px 14px', fontSize:11, color:'var(--muted)', maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{log.notes}</td>
                      </tr>
                    ))}
                    {truckLogs.length === 0 && (
                      <tr><td colSpan={7} style={{ padding:32, textAlign:'center', color:'var(--muted)', fontSize:13 }}>No service records yet — log the first service above</td></tr>
                    )}
                  </tbody>
                </table></div>
              </div>
            </>
          )}

          {/* ── ANALYTICS TAB ── */}
          {subTab === 'analytics' && (
            <>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
                {[
                  { label:'6-Week Revenue',  value:'$' + totalRev.toLocaleString(),    color:'var(--accent)' },
                  { label:'Operating Cost',  value:'$' + totalCost.toLocaleString(),   color:'var(--danger)' },
                  { label:'Net Profit',      value:'$' + netProfit.toLocaleString(),   color:'var(--success)', large:true },
                  { label:'Avg MPG',         value: avgMpg,                            color: parseFloat(avgMpg) < 6.8 ? 'var(--warning)' : 'var(--success)' },
                ].map(s => (
                  <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'13px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4 }}>{s.label}</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: s.large ? 28 : 22, color:s.color }}>{s.value}</div>
                  </div>
                ))}
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
                {/* Revenue vs Cost chart */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between' }}>
                    <div style={{ fontWeight:700, fontSize:13 }}><Ic icon={DollarSign} /> Revenue vs Cost — {truck.unit}</div>
                    <div style={{ display:'flex', gap:10 }}>
                      {[{c:'var(--accent)',label:'Revenue'},{c:'var(--danger)',label:'Cost'},{c:'var(--success)',label:'Net'}].map(x=>(
                        <div key={x.label} style={{ display:'flex', alignItems:'center', gap:5, fontSize:10, color:'var(--muted)' }}>
                          <div style={{ width:7,height:7,borderRadius:2,background:x.c }}/>
                          {x.label}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div style={{ padding:16 }}>
                    <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:130 }}>
                      {WEEKS.map((w,i) => {
                        const net = truck.revenue[i] - truck.opCost[i]
                        return (
                          <div key={w} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                            <div style={{ width:'100%', display:'flex', gap:2, alignItems:'flex-end', height:110, justifyContent:'center' }}>
                              <div style={{ width:'30%', height:`${(truck.revenue[i]/maxRev)*108}px`, background:'var(--accent)', borderRadius:'3px 3px 0 0', opacity:0.8 }}/>
                              <div style={{ width:'30%', height:`${(truck.opCost[i]/maxRev)*108}px`, background:'var(--danger)', borderRadius:'3px 3px 0 0', opacity:0.8 }}/>
                              <div style={{ width:'30%', height:`${(net/maxRev)*108}px`, background:'var(--success)', borderRadius:'3px 3px 0 0' }}/>
                            </div>
                            <div style={{ fontSize:10, color:'var(--muted)' }}>{w}</div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>

                {/* MPG trend */}
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13 }}><Ic icon={Fuel} /> MPG Trend — {truck.unit}</div>
                  <div style={{ padding:16 }}>
                    <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:130 }}>
                      {truck.mpg.map((v,i) => {
                        const pct = ((v - 5.5) / 3) * 100
                        const color = v < 6.5 ? 'var(--warning)' : v < 7.0 ? 'var(--accent2)' : 'var(--success)'
                        return (
                          <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
                            <div style={{ fontSize:10, fontWeight:700, color }}>{v}</div>
                            <div style={{ width:'60%', height:`${pct}px`, background:color, borderRadius:'3px 3px 0 0', maxHeight:90 }}/>
                            <div style={{ fontSize:10, color:'var(--muted)' }}>{WEEKS[i]}</div>
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ marginTop:10, padding:'8px 12px', background:'var(--surface2)', borderRadius:8, fontSize:12, color:'var(--muted)' }}>
                      {parseFloat(avgMpg) < 6.8
                        ? `Avg ${avgMpg} MPG is below fleet target (6.8). Check tire pressure and consider DPF cleaning.`
                        : `Avg ${avgMpg} MPG — performing at or above fleet target.`}
                    </div>
                  </div>
                </div>
              </div>

              {/* Miles per week */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ fontWeight:700, fontSize:13 }}><Ic icon={MapPin} /> Miles per Week — {truck.unit}</div>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, color:'var(--accent2)' }}>{totalMiles.toLocaleString()} total</span>
                </div>
                <div style={{ padding:'16px 20px', display:'flex', alignItems:'flex-end', gap:8, height:90 }}>
                  {truck.miles.map((m,i) => (
                    <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                      <div style={{ fontSize:10, color:'var(--accent2)', fontWeight:700 }}>{m.toLocaleString()}</div>
                      <div style={{ width:'70%', height:`${(m / Math.max(...truck.miles)) * 55}px`, background:'var(--accent2)', borderRadius:'3px 3px 0 0', opacity:0.7 }}/>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>{WEEKS[i]}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Utilization breakdown */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12 }}>
                {[
                  { label:'Revenue per Mile', value:'$' + (totalRev / totalMiles).toFixed(2) + '/mi', icon: DollarSign, color:'var(--accent)', note:'6-week avg across all loads' },
                  { label:'Cost per Mile',    value:'$' + (totalCost / totalMiles).toFixed(2) + '/mi', icon: DollarSign, color:'var(--danger)', note:'Fuel + maintenance + insurance' },
                  { label:'Net per Mile',     value:'$' + ((totalRev - totalCost) / totalMiles).toFixed(2) + '/mi', icon: TrendingUp, color:'var(--success)', note:'What this truck actually earns' },
                ].map(s => (
                  <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'16px 18px', display:'flex', gap:12, alignItems:'center' }}>
                    <span style={{ fontSize:24 }}>{typeof s.icon === "string" ? s.icon : <s.icon size={24} />}</span>
                    <div>
                      <div style={{ fontSize:10, color:'var(--muted)', marginBottom:2 }}>{s.label}</div>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:24, color:s.color }}>{s.value}</div>
                      <div style={{ fontSize:10, color:'var(--muted)' }}>{s.note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </>)}
      </div>
    </div>
  )
}

// ─── EQUIPMENT MANAGER ────────────────────────────────────────────────────────
export function EquipmentManager() {
  const { showToast } = useApp()
  const { vehicles, addVehicle, editVehicle, removeVehicle } = useCarrier()

  // Map Supabase vehicles to equipment display format
  const equipment = (vehicles || []).map(v => ({
    ...v,
    type: (v.type || 'Truck').toLowerCase(),
    unit: v.unit_number || '',
    plate: v.license_plate || '',
    state: v.license_state || '',
    odometer: v.current_miles || '',
    nextService: v.next_service_miles || '',
    regExpiry: v.registration_expiry || '',
    insExpiry: v.insurance_expiry || '',
    color: (v.type || 'Truck').toLowerCase() === 'truck' ? '#f0a500' : 'var(--muted)',
  }))

  const [selected, setSelected] = useState(null)
  const [tab, setTab] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [addType, setAddType] = useState('truck')
  const [form, setForm] = useState({})
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({})

  const filtered = tab === 'all' ? equipment : equipment.filter(e => e.type === tab)
  const sel = equipment.find(e => e.id === selected) || filtered[0]

  const statusColor = s => s === 'Active' ? 'var(--success)' : s === 'Shop' ? 'var(--warning)' : 'var(--muted)'

  const addEquipment = async () => {
    if (!form.unit_number) return
    try {
      await addVehicle({
        unit_number: form.unit_number,
        type: addType === 'truck' ? 'Truck' : 'Trailer',
        year: form.year ? parseInt(form.year) : null,
        make: form.make || null,
        model: form.model || null,
        vin: form.vin || null,
        license_plate: form.license_plate || null,
        license_state: form.license_state || null,
        current_miles: form.current_miles ? parseInt(form.current_miles) : null,
        next_service_miles: form.next_service_miles ? parseInt(form.next_service_miles) : null,
        registration_expiry: form.registration_expiry || null,
        insurance_expiry: form.insurance_expiry || null,
        notes: form.notes || null,
        status: 'Active',
      })
      setShowAdd(false)
      setForm({})
      showToast('', addType === 'truck' ? 'Truck Added' : 'Trailer Added', form.unit_number)
    } catch (err) {
      showToast('', 'Error', err.message || 'Failed to add equipment')
    }
  }

  const saveEdit = async () => {
    if (!sel) return
    try {
      await editVehicle(sel.id, {
        unit_number: editForm.unit_number,
        year: editForm.year ? parseInt(editForm.year) : null,
        make: editForm.make || null,
        model: editForm.model || null,
        vin: editForm.vin || null,
        license_plate: editForm.license_plate || null,
        license_state: editForm.license_state || null,
        current_miles: editForm.current_miles ? parseInt(editForm.current_miles) : null,
        next_service_miles: editForm.next_service_miles ? parseInt(editForm.next_service_miles) : null,
        registration_expiry: editForm.registration_expiry || null,
        insurance_expiry: editForm.insurance_expiry || null,
        notes: editForm.notes || null,
        status: editForm.status || 'Active',
      })
      setEditing(false)
      showToast('', 'Saved', editForm.unit_number || sel.unit)
    } catch (err) {
      showToast('', 'Error', err.message || 'Failed to save')
    }
  }

  const handleDelete = async (id) => {
    const eq = equipment.find(e => e.id === id)
    if (!eq) return
    if (!window.confirm(`Delete ${eq.unit || 'this equipment'}? This cannot be undone.`)) return
    try {
      await removeVehicle(id)
      if (selected === id) setSelected(null)
      showToast('', 'Deleted', eq.unit || 'Equipment removed')
    } catch (err) {
      showToast('', 'Error', err.message || 'Failed to delete')
    }
  }

  const inp = { background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none', width:'100%', boxSizing:'border-box' }

  const fields = addType === 'truck' ? EQ_FIELDS_TRUCK : EQ_FIELDS_TRAILER

  const isExpiringSoon = (dateStr) => {
    if (!dateStr) return false
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
    const parts = dateStr.replace(',','').split(' ')
    const mon = months.indexOf(parts[0])
    const day = parseInt(parts[1])
    const year = parseInt(parts[2])
    if (mon < 0 || isNaN(day)) return false
    const d = new Date(year || 2026, mon, day)
    const diff = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    return diff < 45
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'auto' }}>

      {/* Add Modal */}
      {showAdd && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false) }}>
          <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.3)', borderRadius:16, width:500, maxHeight:'90vh', overflowY:'auto', padding:28 }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, letterSpacing:1, marginBottom:2 }}>ADD EQUIPMENT</div>
            <div style={{ display:'flex', gap:8, marginBottom:20 }}>
              {['truck','trailer'].map(t => (
                <button key={t} onClick={() => { setAddType(t); setForm({}) }}
                  style={{ flex:1, padding:'8px 0', fontSize:12, fontWeight:700, borderRadius:8, border:'1px solid var(--border)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                    background: addType === t ? 'var(--accent)' : 'var(--surface2)', color: addType === t ? '#000' : 'var(--text)' }}>
                  {t === 'truck' ? <><Truck size={13} /> Truck</> : <><Truck size={13} /> Trailer</>}
                </button>
              ))}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:20 }}>
              {fields.map(f => (
                <div key={f.key} style={{ gridColumn: f.span === 2 ? 'span 2' : undefined }}>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>{f.label}</label>
                  <input value={form[f.key] || ''} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.ph} style={inp} />
                </div>
              ))}
            </div>
            <div style={{ display:'flex', gap:10 }}>
              <button className="btn btn-primary" style={{ flex:1, padding:'12px 0' }} onClick={addEquipment} disabled={!form.unit_number}>+ Add {addType === 'truck' ? 'Truck' : 'Trailer'}</button>
              <button className="btn btn-ghost" style={{ flex:1, padding:'12px 0' }} onClick={() => setShowAdd(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* LEFT SIDEBAR */}
      <div style={{ width:240, flexShrink:0, borderRight:'1px solid var(--border)', background:'var(--surface)', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'14px 16px 10px', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:8 }}>EQUIPMENT</div>
          <div style={{ display:'flex', gap:6 }}>
            {[['all','All'], ['truck','Trucks'], ['trailer','Trailers']].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)}
                style={{ flex:1, padding:'5px 0', fontSize:11, fontWeight:700, borderRadius:6, border:'1px solid var(--border)', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                  background: tab === id ? 'var(--accent)' : 'var(--surface2)', color: tab === id ? '#000' : 'var(--muted)' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>
          {filtered.map(eq => {
            const isSel = sel?.id === eq.id
            const expiring = isExpiringSoon(eq.regExpiry) || isExpiringSoon(eq.insExpiry)
            return (
              <div key={eq.id} onClick={() => { setSelected(eq.id); setEditing(false) }}
                style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                  borderLeft:`3px solid ${isSel ? 'var(--accent)' : 'transparent'}`,
                  background: isSel ? 'rgba(240,165,0,0.05)' : 'transparent', transition:'all 0.15s' }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:`${eq.color}18`, border:`1px solid ${eq.color}40`,
                    display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>
                    {eq.type === 'truck' ? <Truck size={16} /> : <Truck size={16} />}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:700, color: isSel ? 'var(--accent)' : 'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{eq.unit}</div>
                    <div style={{ fontSize:10, color:'var(--muted)' }}>{eq.year} {eq.make} {eq.model}</div>
                  </div>
                  {expiring && <span style={{ fontSize:16 }} title="Expiring soon"><AlertTriangle size={18} /></span>}
                </div>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:5, background:`${statusColor(eq.status)}18`, color:statusColor(eq.status) }}>{eq.status}</span>
                  {eq.driver && <span style={{ fontSize:10, color:'var(--muted)' }}><Ic icon={User} /> {eq.driver.split(' ')[0]}</span>}
                  <span style={{ fontSize:10, color:'var(--muted)', fontFamily:'monospace' }}>{eq.plate}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ padding:12, borderTop:'1px solid var(--border)', flexShrink:0, display:'flex', gap:8 }}>
          <button className="btn btn-primary" style={{ flex:1, fontSize:11 }} onClick={() => { setShowAdd(true); setAddType('truck') }}>+ Truck</button>
          <button className="btn btn-ghost" style={{ flex:1, fontSize:11 }} onClick={() => { setShowAdd(true); setAddType('trailer') }}>+ Trailer</button>
        </div>
      </div>

      {/* RIGHT DETAIL */}
      {sel && (
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflowY:'auto' }}>

          {/* Header */}
          <div style={{ flexShrink:0, padding:'14px 24px', background:'var(--surface)', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:16 }}>
            <div style={{ width:48, height:48, borderRadius:12, background:`${sel.color}18`, border:`2px solid ${sel.color}40`,
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
              {sel.type === 'truck' ? <Truck size={14} /> : <Truck size={14} />}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4, flexWrap:'wrap' }}>
                <span style={{ fontSize:16, fontWeight:800 }}>{sel.unit}</span>
                <span style={{ fontSize:10, fontWeight:800, padding:'3px 10px', borderRadius:8, background:`${statusColor(sel.status)}15`, color:statusColor(sel.status) }}>{sel.status}</span>
                {sel.driver && <span style={{ fontSize:12, color:'var(--muted)' }}><Ic icon={User} /> {sel.driver}</span>}
              </div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>{sel.year} {sel.make} {sel.model} · {sel.plate} · VIN: <span style={{ fontFamily:'monospace', fontSize:11 }}>{sel.vin}</span></div>
            </div>
            <div style={{ display:'flex', gap:8, flexShrink:0 }}>
              {editing
                ? <>
                    <button className="btn btn-primary" style={{ fontSize:11 }} onClick={saveEdit}><Ic icon={Save} /> Save</button>
                    <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => setEditing(false)}>Cancel</button>
                  </>
                : <>
                    <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { setEditing(true); setEditForm({ unit_number: sel.unit_number || sel.unit || '', year: sel.year || '', make: sel.make || '', model: sel.model || '', vin: sel.vin || '', license_plate: sel.license_plate || sel.plate || '', license_state: sel.license_state || sel.state || '', current_miles: sel.current_miles || sel.odometer || '', next_service_miles: sel.next_service_miles || sel.nextService || '', registration_expiry: sel.registration_expiry || sel.regExpiry || '', insurance_expiry: sel.insurance_expiry || sel.insExpiry || '', notes: sel.notes || '', status: sel.status || 'Active' }) }}><Ic icon={PencilIcon} /> Edit</button>
                    <button className="btn btn-ghost" style={{ fontSize:11, color:'var(--error, #ef4444)' }} onClick={() => handleDelete(sel.id)}><Ic icon={Trash2} /> Delete</button>
                    <button className="btn btn-ghost" style={{ fontSize:11 }} onClick={() => { const fields = sel.type === 'truck' ? EQ_FIELDS_TRUCK : EQ_FIELDS_TRAILER; const header = fields.map(f => f.label).join(','); const row = fields.map(f => '"' + String(sel[f.key] || '').replace(/"/g, '""') + '"').join(','); const csv = header + '\n' + row + '\n\nStatus,' + (sel.status || '') + '\nExported,' + new Date().toLocaleDateString(); const blob = new Blob([csv], { type: 'text/csv' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = (sel.unit || sel.unit_number || 'equipment') + '_report.csv'; a.click(); URL.revokeObjectURL(url); showToast('success', 'Report Downloaded', (sel.unit || sel.unit_number) + ' report saved') }}><Ic icon={FileText} /> Report</button>
                  </>
              }
            </div>
          </div>

          <div style={{ flex:1, overflowY:'auto', minHeight:0, padding:24, display:'flex', flexDirection:'column', gap:16 }}>

            {/* Alerts */}
            {(isExpiringSoon(sel.regExpiry) || isExpiringSoon(sel.insExpiry) || sel.notes?.toLowerCase().includes('overdue') || sel.notes?.toLowerCase().includes('shop')) && (
              <div style={{ background:'rgba(245,158,11,0.08)', border:'1px solid rgba(245,158,11,0.25)', borderRadius:12, padding:'12px 16px', display:'flex', gap:12, alignItems:'flex-start' }}>
                <span style={{ fontSize:18 }}><AlertTriangle size={18} /></span>
                <div>
                  <div style={{ fontSize:13, fontWeight:700, color:'var(--warning)', marginBottom:4 }}>Attention Required</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
                    {isExpiringSoon(sel.regExpiry) && <div style={{ fontSize:12, color:'var(--muted)' }}>Registration expires {sel.regExpiry} — renew soon</div>}
                    {isExpiringSoon(sel.insExpiry) && <div style={{ fontSize:12, color:'var(--muted)' }}>Insurance expires {sel.insExpiry} — contact agent</div>}
                    {sel.notes && <div style={{ fontSize:12, color:'var(--muted)' }}>{sel.notes}</div>}
                  </div>
                </div>
              </div>
            )}

            {/* Key stats */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12 }}>
              {[
                { label:'Odometer',     value: sel.odometer || '—',    icon: Route },
                { label:'Next Service', value: sel.nextService || '—', icon: Wrench, warn: isExpiringSoon(sel.nextService) },
                { label:'Reg. Expiry',  value: sel.regExpiry || '—',   icon: FileText, warn: isExpiringSoon(sel.regExpiry) },
                { label:'Ins. Expiry',  value: sel.insExpiry || '—',   icon: Shield, warn: isExpiringSoon(sel.insExpiry) },
              ].map(s => (
                <div key={s.label} style={{ background:'var(--surface)', border:`1px solid ${s.warn ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`, borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{typeof s.icon === "string" ? s.icon : <s.icon size={11} />} {s.label}</div>
                  <div style={{ fontSize:14, fontWeight:700, color: s.warn ? 'var(--warning)' : 'var(--text)' }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Details grid */}
            <div style={S.panel}>
              <div style={S.panelHead}>
                <div style={S.panelTitle}>{sel.type === 'truck' ? <Truck size={14} /> : <Truck size={14} />} {editing ? 'Edit' : ''} Equipment Details</div>
              </div>
              <div style={{ padding:'16px 18px', display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {(sel.type === 'truck' ? EQ_FIELDS_TRUCK : EQ_FIELDS_TRAILER).map(f => (
                  <div key={f.key} style={{ gridColumn: f.span === 2 ? 'span 2' : undefined }}>
                    <div style={{ fontSize:10, color:'var(--muted)', fontWeight:700, textTransform:'uppercase', letterSpacing:0.5, marginBottom:5 }}>{f.label}</div>
                    {editing
                      ? <input value={editForm[f.key] || ''} onChange={e => setEditForm(prev => ({ ...prev, [f.key]: e.target.value }))} placeholder={f.ph}
                          style={{ ...inp, background:'var(--surface2)', padding:'7px 10px', fontSize:12 }} />
                      : <div style={{ fontSize:13, fontWeight:600, color: sel[f.key] ? 'var(--text)' : 'var(--muted)', fontFamily: f.key === 'vin' ? 'monospace' : undefined }}>
                          {sel[f.key] || '—'}
                        </div>
                    }
                  </div>
                ))}
              </div>
            </div>

            {/* Status update */}
            {!editing && (
              <div style={S.panel}>
                <div style={S.panelHead}><div style={S.panelTitle}><Ic icon={Zap} /> Quick Actions</div></div>
                <div style={{ padding:'14px 18px', display:'flex', gap:10, flexWrap:'wrap' }}>
                  {['Active','Shop','Inactive'].map(s => (
                    <button key={s} onClick={async () => { try { await editVehicle(sel.id, { status: s }); showToast('','Status Updated', (sel.unit || sel.unit_number) + ' → ' + s) } catch(err) { showToast('','Error', err.message || 'Failed to update status') } }}
                      style={{ padding:'8px 18px', fontSize:12, fontWeight:700, borderRadius:8, border:`1px solid ${statusColor(s)}40`, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                        background: sel.status === s ? `${statusColor(s)}18` : 'var(--surface2)', color: sel.status === s ? statusColor(s) : 'var(--muted)' }}>
                      {s === 'Active' ? <Check size={13} /> : s === 'Shop' ? <Wrench size={13} /> : '⏸'} {s}
                    </button>
                  ))}
                  <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={async () => { const nextWeek = new Date(); nextWeek.setDate(nextWeek.getDate() + 7); const dateStr = nextWeek.toISOString().split('T')[0]; try { await editVehicle(sel.id, { notes: (sel.notes ? sel.notes + ' | ' : '') + 'Service scheduled ' + dateStr }); showToast('success', 'Service Scheduled', (sel.unit || sel.unit_number) + ' — service scheduled for ' + dateStr) } catch (err) { showToast('error', 'Error', err.message || 'Failed to schedule service') } }}><Ic icon={Wrench} /> Schedule Service</button>
                  <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => { const input = document.createElement('input'); input.type = 'file'; input.accept = '.pdf,.jpg,.jpeg,.png,.doc,.docx'; input.onchange = async (e) => { const file = e.target.files?.[0]; if (!file) return; try { showToast('', 'Uploading', file.name + '...'); const result = await uploadFile(file, 'vehicles/' + (sel.id || 'unknown')); await createDocument({ name: file.name, file_url: result.url, file_path: result.path, doc_type: 'vehicle', vehicle_id: sel.id || null }); showToast('success', 'Document Uploaded', file.name + ' added to ' + (sel.unit || sel.unit_number)) } catch (err) { showToast('error', 'Upload Failed', err.message || 'Could not upload file') } }; input.click() }}><Ic icon={FileText} /> Documents</button>
                  <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => { const lat = sel.lat || sel.latitude; const lng = sel.lng || sel.longitude; if (lat && lng) { window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank') } else { showToast('', 'No GPS Data', 'Connect ELD to enable live tracking for ' + (sel.unit || sel.unit_number)) } }}><Ic icon={MapPin} /> GPS Location</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
