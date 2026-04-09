import React, { useState, useEffect, useMemo, useRef } from 'react'
import { Ic } from './shared'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { Truck, User, MapPin, Package, Radio, MessageCircle, Scale, Navigation, Bell, Smartphone, RefreshCw } from 'lucide-react'
import { APIProvider, Map, AdvancedMarker, Pin, useMap } from '@vis.gl/react-google-maps'
import { supabase } from '../../lib/supabase'
import * as db from '../../lib/database'
import { apiFetch } from '../../lib/api'
import QActivityFeed from '../../components/QActivityFeed'
import QLiveNegotiation from '../../components/QLiveNegotiation'

const STATUS_PROGRESS = { 'Rate Con Received':0.05, 'Assigned to Driver':0.10, 'En Route to Pickup':0.20, 'Loaded':0.45, 'In Transit':0.65, 'Delivered':1, 'Invoiced':1 }
const STATUS_LABEL = { 'Rate Con Received':'Ready', 'Assigned to Driver':'Assigned', 'En Route to Pickup':'En Route', 'Loaded':'Loaded', 'In Transit':'En Route', 'Delivered':'Delivered', 'Invoiced':'Delivered' }
const UNIT_COLORS = ['#f0a500','#00d4aa','#6b7280','#e74c3c','#3498db','#9b59b6','#1abc9c','#e67e22']

// Major US weigh stations with coordinates
const WEIGH_STATIONS = [
  { name:'Mendota, IL', highway:'I-39', lat:41.547, lng:-89.117 },
  { name:'Gary, IN (Borman)', highway:'I-80/94', lat:41.573, lng:-87.336 },
  { name:'Joplin, MO', highway:'I-44', lat:37.084, lng:-94.513 },
  { name:'West Memphis, AR', highway:'I-40', lat:35.146, lng:-90.184 },
  { name:'Banning, CA', highway:'I-10', lat:33.925, lng:-116.876 },
  { name:'Wheeler Ridge, CA', highway:'I-5', lat:34.943, lng:-118.954 },
  { name:'Troutdale, OR', highway:'I-84', lat:45.550, lng:-122.387 },
  { name:'Lakewood, NJ', highway:'I-195', lat:40.096, lng:-74.217 },
  { name:'Newburgh, NY', highway:'I-84', lat:41.503, lng:-74.010 },
  { name:'Waterloo, NY', highway:'I-90', lat:42.900, lng:-76.886 },
  { name:'Fultonham, OH', highway:'I-70', lat:39.860, lng:-81.901 },
  { name:'Lodi, OH', highway:'I-71', lat:41.033, lng:-82.013 },
  { name:'Greenville, SC', highway:'I-85', lat:34.852, lng:-82.394 },
  { name:'Nashville, TN', highway:'I-40', lat:36.162, lng:-86.781 },
  { name:'Hillsboro, TX', highway:'I-35', lat:32.009, lng:-97.130 },
  { name:'Laredo, TX', highway:'I-35', lat:27.500, lng:-99.507 },
  { name:'Tremonton, UT', highway:'I-15/84', lat:41.711, lng:-112.165 },
  { name:'Bow, WA', highway:'I-5', lat:48.560, lng:-122.416 },
  { name:'Mossy Head, FL', highway:'I-10', lat:30.641, lng:-86.327 },
  { name:'Wildwood, FL', highway:'I-75', lat:28.865, lng:-82.045 },
  { name:'Forest Park, GA', highway:'I-75', lat:33.621, lng:-84.369 },
  { name:'Ringgold, GA', highway:'I-75', lat:34.915, lng:-85.109 },
  { name:'Ehrenberg, AZ', highway:'I-10', lat:33.604, lng:-114.524 },
  { name:'Sayre, PA', highway:'I-17', lat:41.979, lng:-76.515 },
]

export function FleetMapGoogle() {
  const { showToast } = useApp()
  const ctx = useCarrier() || {}
  const drivers = ctx.drivers || []
  const vehicles = ctx.vehicles || []
  const loads = ctx.activeLoads || (ctx.loads || []).filter(l => !['Delivered','Invoiced'].includes(l.status))

  const [selectedTruck, setSelectedTruck] = useState(null)
  const [showWeighStations, setShowWeighStations] = useState(true)
  const [livePositions, setLivePositions] = useState({}) // { driverId: {lat,lng,speed,heading,ts} }
  const [breadcrumbs, setBreadcrumbs] = useState([])     // [{lat,lng}] for selected truck
  const [alerts, setAlerts] = useState([])
  // ── ELD connection awareness ──
  // Fleet Map's `liveTrucks` come from `driver_positions` (mobile app GPS).
  // Motive/Samsara sync writes to `eld_vehicles` instead, so even with ELD
  // connected the map can be empty unless drivers run the mobile app. Track
  // ELD state so the empty state can tell the user what's actually going on.
  const [eldProviders, setEldProviders] = useState([])  // [{provider, status, last_sync}]
  const [eldVehicleCount, setEldVehicleCount] = useState(0)
  const [eldSyncing, setEldSyncing] = useState(false)
  const mapsKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'qivori_fleet_map'

  // ── Initial load: latest positions + alerts ──
  useEffect(() => {
    let mounted = true
    db.fetchLatestDriverPositions().then(rows => {
      if (!mounted) return
      const map = {}
      for (const r of rows) map[r.driver_id] = r
      setLivePositions(map)
    })
    db.fetchAlerts({ limit: 30 }).then(rows => { if (mounted) setAlerts(rows) })
    return () => { mounted = false }
  }, [])

  // ── Realtime: subscribe to driver_positions inserts ──
  useEffect(() => {
    const channel = supabase
      .channel('driver_positions_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'driver_positions' }, (payload) => {
        const p = payload.new
        if (!p?.driver_id) return
        setLivePositions(prev => ({ ...prev, [p.driver_id]: p }))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Realtime: subscribe to q_alerts inserts ──
  useEffect(() => {
    const channel = supabase
      .channel('q_alerts_live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'q_alerts' }, (payload) => {
        setAlerts(prev => [payload.new, ...prev].slice(0, 50))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── ELD provider awareness ──
  // Fetch which ELD providers (Motive/Samsara) the carrier has connected,
  // and how many vehicles are sitting in eld_vehicles. Used by the empty
  // state to tell the user "Motive is connected, 12 vehicles synced — install
  // the mobile app to see live positions" instead of just showing an empty map.
  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || !mounted) return
        const { data: conns } = await supabase
          .from('eld_connections')
          .select('provider, status, last_sync')
          .eq('user_id', user.id)
          .eq('status', 'connected')
        if (mounted && conns) setEldProviders(conns)
        const { count } = await supabase
          .from('eld_vehicles')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
        if (mounted && typeof count === 'number') setEldVehicleCount(count)
      } catch {}
    })()
    return () => { mounted = false }
  }, [])

  // Trigger an ELD sync from the empty state's "Sync now" button
  const handleEldSyncNow = async () => {
    if (eldSyncing) return
    setEldSyncing(true)
    try {
      const res = await apiFetch('/api/eld-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        showToast('success', 'ELD Synced', `${data.totals?.vehicles || 0} vehicles · ${data.totals?.hos_logs || 0} HOS logs`)
        // Refresh the vehicle count
        try {
          const { data: { user } } = await supabase.auth.getUser()
          if (user) {
            const { count } = await supabase
              .from('eld_vehicles')
              .select('id', { count: 'exact', head: true })
              .eq('user_id', user.id)
            if (typeof count === 'number') setEldVehicleCount(count)
          }
        } catch {}
      } else {
        showToast('error', 'Sync Failed', data.error || 'Could not sync ELD data')
      }
    } catch (e) {
      showToast('error', 'Sync Failed', e.message || 'Network error')
    } finally {
      setEldSyncing(false)
    }
  }

  // Build truck data from context — extended with driverId + live GPS
  const trucksData = useMemo(() => drivers.map((d, i) => {
    const driverName = d.name || d.full_name || `Driver ${i+1}`
    const vehicle = vehicles[i]
    const unit = vehicle ? (`${vehicle.year || ''} ${vehicle.make || ''} ${vehicle.model || ''}`.trim() || `Unit ${String(i+1).padStart(2,'0')}`) : `Unit ${String(i+1).padStart(2,'0')}`
    const color = UNIT_COLORS[i % UNIT_COLORS.length]
    const load = loads.find(l => (l.driver_name || l.driver) === driverName)
    const homecity = d.city || d.home_city || 'Unknown'
    const liveGps = livePositions[d.id] || null
    const base = {
      driverId: d.id, unit, driver: driverName, color,
      liveLat: liveGps ? Number(liveGps.lat) : null,
      liveLng: liveGps ? Number(liveGps.lng) : null,
      liveSpeed: liveGps?.speed ?? null,
      liveHeading: liveGps?.heading ?? null,
      liveTs: liveGps?.ts || null,
    }
    if (load) {
      const from = load.origin || homecity
      const to = load.dest || load.destination || homecity
      return {
        ...base, from, to,
        progress: STATUS_PROGRESS[load.status] || 0.5,
        status: STATUS_LABEL[load.status] || load.status,
        load: load.load_id || load.loadId || load.id,
        eta: load.delivery_date?.split('T')[0] || load.delivery?.split(' · ')[0] || 'TBD',
        fuelEstimate: load.fuel_estimate, tollEstimate: load.toll_estimate,
      }
    }
    return { ...base, from: homecity, to: homecity, progress: 1, status: 'Available', load: '—', eta: 'Ready' }
  }), [drivers, vehicles, loads, livePositions])

  // ── Load breadcrumb when truck selected ──
  useEffect(() => {
    const truck = trucksData.find(t => t.unit === selectedTruck)
    if (!truck?.driverId) { setBreadcrumbs([]); return }
    db.fetchDriverBreadcrumb(truck.driverId, 50).then(rows => {
      setBreadcrumbs(rows.map(r => ({ lat: Number(r.lat), lng: Number(r.lng) })))
    })
  }, [selectedTruck, trucksData])

  const liveTrucks = trucksData.filter(t => t.liveLat != null && t.liveLng != null)

  useEffect(() => {
    if (!selectedTruck && trucksData.length) setSelectedTruck(trucksData[0].unit)
  }, [trucksData])

  // Map center: selected truck's live position, else first live truck, else US center
  const mapCenter = useMemo(() => {
    const sel = trucksData.find(t => t.unit === selectedTruck)
    if (sel?.liveLat != null) return { lat: sel.liveLat, lng: sel.liveLng }
    if (liveTrucks[0]) return { lat: liveTrucks[0].liveLat, lng: liveTrucks[0].liveLng }
    return { lat: 39.8283, lng: -98.5795 }
  }, [selectedTruck, trucksData, liveTrucks])
  const mapZoom = (selectedTruck && trucksData.find(t => t.unit === selectedTruck)?.liveLat != null) ? 8 : (liveTrucks.length ? 5 : 4)

  if (!drivers.length) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%', background:'#0a0e1a' }}>
        <div style={{ textAlign:'center', padding:'40px 32px' }}>
          <div style={{ width:56, height:56, borderRadius:14, background:'rgba(240,165,0,0.1)', border:'1px solid rgba(240,165,0,0.25)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 20px' }}>
            <Truck size={26} color="var(--accent)" />
          </div>
          <div style={{ fontSize:15, fontWeight:700, color:'#fff', marginBottom:8 }}>No drivers added yet</div>
          <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)', lineHeight:1.6, maxWidth:280 }}>Add your first driver to see fleet map.</div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden' }}>
      {/* Map area */}
      <div style={{ flex:1, position:'relative', background:'#0a0e1a', overflow:'hidden' }}>

        {/* Empty-state overlay — drivers exist but no live GPS positions yet.
            Tells the user the truth about why the map is empty AND gives them
            an action (sync ELD or install mobile app) instead of a void. */}
        {liveTrucks.length === 0 && (
          <div style={{
            position:'absolute', top:20, left:'50%', transform:'translateX(-50%)',
            zIndex:10, maxWidth:480, width:'calc(100% - 40px)',
            background:'rgba(10,14,26,0.95)', backdropFilter:'blur(8px)',
            border:'1px solid rgba(240,165,0,0.3)', borderRadius:14,
            padding:'18px 22px', boxShadow:'0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
              <div style={{ width:40, height:40, borderRadius:10, background:'rgba(240,165,0,0.12)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Truck size={20} color="var(--accent)" />
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>No live trucks on the map yet</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)' }}>{drivers.length} driver{drivers.length !== 1 ? 's' : ''} registered · 0 reporting GPS</div>
              </div>
            </div>

            {eldProviders.length > 0 ? (
              <>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', lineHeight:1.55, marginBottom:12 }}>
                  <strong style={{ color:'#22c55e' }}>{eldProviders[0].provider === 'motive' ? 'Motive' : eldProviders[0].provider} connected</strong> · {eldVehicleCount} vehicle{eldVehicleCount !== 1 ? 's' : ''} synced. Live GPS pins on this map currently come from the Qivori mobile app on each driver's phone. ELD vehicle telemetry import is rolling out soon.
                </div>
                <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                  <button
                    onClick={handleEldSyncNow}
                    disabled={eldSyncing}
                    style={{
                      padding:'9px 16px', fontSize:12, fontWeight:700,
                      background: eldSyncing ? 'rgba(240,165,0,0.4)' : 'var(--accent)',
                      color:'#000', border:'none', borderRadius:8,
                      cursor: eldSyncing ? 'wait' : 'pointer',
                      display:'flex', alignItems:'center', gap:6,
                      fontFamily:"'DM Sans',sans-serif",
                    }}
                  >
                    <RefreshCw size={13} style={{ animation: eldSyncing ? 'spin 1s linear infinite' : 'none' }} />
                    {eldSyncing ? 'Syncing…' : 'Sync ELD now'}
                  </button>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', display:'flex', alignItems:'center', gap:4 }}>
                    <Smartphone size={11} /> or have drivers install Qivori mobile
                  </div>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.75)', lineHeight:1.55, marginBottom:12 }}>
                  Live tracking activates when your drivers either (1) install the Qivori mobile app and grant location access, or (2) you connect an ELD provider in Settings → Integrations.
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:6, fontSize:11, color:'rgba(255,255,255,0.5)' }}>
                  <Smartphone size={12} /> Qivori mobile app · or Motive / Samsara
                </div>
              </>
            )}
          </div>
        )}

        {mapsKey ? (
          <APIProvider apiKey={mapsKey}>
            <Map
              mapId={mapId}
              defaultCenter={mapCenter}
              defaultZoom={mapZoom}
              center={mapCenter}
              zoom={mapZoom}
              gestureHandling="greedy"
              disableDefaultUI={false}
              style={{ width: '100%', height: '100%' }}
              colorScheme="DARK"
            >
              {/* Live truck pins */}
              {liveTrucks.map(t => (
                <AdvancedMarker
                  key={t.driverId}
                  position={{ lat: t.liveLat, lng: t.liveLng }}
                  onClick={() => setSelectedTruck(t.unit)}
                  title={`${t.driver} — ${t.status}`}
                >
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%',
                    background: t.color,
                    border: selectedTruck === t.unit ? '3px solid #fff' : '2px solid rgba(0,0,0,0.5)',
                    boxShadow: `0 0 0 4px ${t.color}33, 0 4px 12px rgba(0,0,0,0.5)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transform: t.liveHeading != null ? `rotate(${t.liveHeading}deg)` : 'none',
                    transition: 'all 0.3s ease',
                  }}>
                    <Truck size={18} color="#fff" />
                  </div>
                </AdvancedMarker>
              ))}

              {/* Weigh station pins */}
              {showWeighStations && WEIGH_STATIONS.map((ws, i) => (
                <AdvancedMarker key={`ws-${i}`} position={{ lat: ws.lat, lng: ws.lng }} title={`${ws.name} (${ws.highway})`}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 4,
                    background: 'rgba(240,165,0,0.95)',
                    border: '1px solid #000',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 900, color: '#000',
                  }}>W</div>
                </AdvancedMarker>
              ))}

              {/* Breadcrumb polyline for selected truck */}
              {selectedTruck && breadcrumbs.length > 1 && (
                <BreadcrumbLine path={breadcrumbs} color={trucksData.find(t => t.unit === selectedTruck)?.color || '#f0a500'} />
              )}
            </Map>
          </APIProvider>
        ) : (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100%' }}>
            <div style={{ textAlign:'center', color:'rgba(255,255,255,0.5)', fontSize:13 }}>
              Google Maps API key not configured.<br/>Add VITE_GOOGLE_MAPS_API_KEY to Vercel.
            </div>
          </div>
        )}

        {/* Top controls */}
        <div style={{ position:'absolute', top:12, left:12, display:'flex', gap:8, zIndex:10 }}>
          <div style={{ background:'rgba(0,0,0,0.75)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'6px 12px', backdropFilter:'blur(8px)' }}>
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.6)', fontFamily:'DM Sans,sans-serif', letterSpacing:2 }}>
              ● LIVE FLEET — {liveTrucks.length} streaming · {trucksData.filter(t=>t.load!=='—').length} on load
            </span>
          </div>
          <button onClick={() => setShowWeighStations(s => !s)}
            style={{ background: showWeighStations ? 'rgba(240,165,0,0.2)' : 'rgba(0,0,0,0.75)', border: showWeighStations ? '1px solid rgba(240,165,0,0.4)' : '1px solid rgba(255,255,255,0.1)', borderRadius:8, padding:'6px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:6, backdropFilter:'blur(8px)' }}>
            <Scale size={12} color={showWeighStations ? '#f0a500' : 'rgba(255,255,255,0.5)'} />
            <span style={{ fontSize:10, color: showWeighStations ? '#f0a500' : 'rgba(255,255,255,0.5)', fontWeight:700, fontFamily:'DM Sans,sans-serif' }}>
              {showWeighStations ? 'Hide' : 'Show'} Weigh Stations
            </span>
          </button>
        </div>

        {/* Weigh Station panel */}
        {showWeighStations && (
          <div style={{ position:'absolute', bottom:12, left:12, maxHeight:'45%', overflowY:'auto', background:'rgba(0,0,0,0.85)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:'10px 0', width:260, backdropFilter:'blur(8px)', zIndex:10 }}>
            <div style={{ padding:'0 12px 8px', borderBottom:'1px solid rgba(255,255,255,0.08)', marginBottom:4 }}>
              <span style={{ fontSize:10, fontWeight:800, color:'#f0a500', letterSpacing:1.5 }}>WEIGH STATIONS ({WEIGH_STATIONS.length})</span>
            </div>
            {WEIGH_STATIONS.map((ws, i) => (
              <div key={i} style={{ padding:'4px 12px', display:'flex', justifyContent:'space-between', alignItems:'center', borderBottom: i < WEIGH_STATIONS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none' }}>
                <div>
                  <div style={{ fontSize:11, color:'#fff', fontWeight:600 }}>{ws.name}</div>
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.4)' }}>{ws.highway}</div>
                </div>
                <span style={{ fontSize:9, fontWeight:700, padding:'2px 6px', borderRadius:4, background:'rgba(0,212,170,0.15)', color:'#00d4aa' }}>OPEN</span>
              </div>
            ))}
          </div>
        )}

        {/* Truck legend (bottom right) */}
        <div style={{ position:'absolute', bottom:12, right:12, display:'flex', flexDirection:'column', gap:4, zIndex:10 }}>
          {trucksData.map(t => (
            <div key={t.unit} onClick={() => setSelectedTruck(t.unit)}
              style={{ display:'flex', alignItems:'center', gap:6, background: selectedTruck===t.unit ? 'rgba(240,165,0,0.15)' : 'rgba(0,0,0,0.75)', border:`1px solid ${selectedTruck===t.unit ? t.color : 'rgba(255,255,255,0.1)'}`, borderRadius:8, padding:'5px 10px', cursor:'pointer', backdropFilter:'blur(8px)' }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:t.color }} />
              <span style={{ fontSize:10, color:'#fff', fontFamily:'DM Sans,sans-serif', fontWeight: selectedTruck===t.unit ? 700 : 400 }}>{t.driver.split(' ')[0]}</span>
              <span style={{ fontSize:9, color: t.load !== '—' ? '#00d4aa' : 'rgba(255,255,255,0.3)' }}>{t.load !== '—' ? '● On Load' : '○ Available'}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Side panel */}
      <div style={{ width:280, flexShrink:0, background:'var(--surface)', borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:11, fontWeight:800, color:'var(--accent)', letterSpacing:2, marginBottom:2 }}>FLEET STATUS</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:10 }}>
            {[
              { v: String(trucksData.filter(t=>t.status==='En Route'||t.status==='Loaded'||t.status==='Assigned').length), l:'On Load', c:'var(--success)' },
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
                    <div style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}><Ic icon={Package} /> {t.load} · ETA {t.eta}</div>
                    {(t.fuelEstimate || t.tollEstimate) && (
                      <div style={{ fontSize:10, color:'var(--muted)', marginBottom:4, display:'flex', gap:10 }}>
                        {t.fuelEstimate > 0 && <span>⛽ ${Number(t.fuelEstimate).toLocaleString()}</span>}
                        {t.tollEstimate > 0 && <span>🛣️ ~${Number(t.tollEstimate).toLocaleString()}</span>}
                      </div>
                    )}
                    <div style={{ height:4, background:'var(--border)', borderRadius:2 }}>
                      <div style={{ height:'100%', width:`${t.progress*100}%`, background:t.color, borderRadius:2 }} />
                    </div>
                    <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{Math.round(t.progress*100)}% complete</div>
                  </>
                )}
                {isSel && (
                  <div style={{ display:'flex', gap:6, marginTop:10 }}>
                    <button className="btn btn-ghost" style={{ fontSize:10, flex:1 }} onClick={async e => { e.stopPropagation(); showToast('', t.unit, 'Pinging ELD for location update...'); try { const res = await fetch('/api/eld-sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vehicle: t.unit }) }); if (res.ok) showToast('success', 'ELD Synced', t.unit + ' location updated'); else showToast('error', 'ELD Sync Failed', 'Could not reach ELD') } catch { showToast('error', 'ELD Sync Failed', 'Network error') } }}><Ic icon={Radio} /> Ping</button>
                    <button className="btn btn-ghost" style={{ fontSize:10, flex:1 }} onClick={async e => { e.stopPropagation(); const driverObj = drivers.find(d => (d.name || d.full_name) === t.driver); const phone = driverObj?.phone || driverObj?.phone_number; if (!phone) { showToast('', 'No Phone', 'No phone number on file for ' + t.driver); return } const msg = prompt(`Message to ${t.driver}:`, `Hey ${t.driver?.split(' ')[0]}, checking in — what's your status?`); if (!msg) return; try { const res = await fetch('/api/send-sms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: phone, message: msg }) }); const data = await res.json(); if (data.success) showToast('success', 'SMS Sent', `Message sent to ${t.driver}`); else showToast('error', 'SMS Failed', data.error || 'Could not send') } catch { showToast('error', 'SMS Failed', 'Network error') } }}><Ic icon={MessageCircle} /> Message</button>
                  </div>
                )}
              </div>
            </div>
          )
        })}

        {/* Q ALERTS — live feed */}
        <div style={{ padding:'14px 16px', borderTop:'1px solid var(--border)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
            <Bell size={12} color="var(--accent)" />
            <span style={{ fontSize:11, fontWeight:800, color:'var(--accent)', letterSpacing:2 }}>Q ALERTS</span>
            {alerts.length > 0 && <span style={{ fontSize:9, fontWeight:700, color:'var(--muted)' }}>· {alerts.length}</span>}
          </div>
          {alerts.length === 0 ? (
            <div style={{ fontSize:11, color:'var(--muted)', padding:'8px 0' }}>No alerts yet — Q will notify you when trucks arrive, depart, or hit detention.</div>
          ) : (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {alerts.slice(0, 8).map(a => {
                const sevColor = a.severity === 'success' ? 'var(--success)' : a.severity === 'warning' ? '#f59e0b' : a.severity === 'error' ? '#ef4444' : 'var(--accent)'
                return (
                  <div key={a.id} style={{ background:'var(--surface2)', borderRadius:8, padding:'8px 10px', borderLeft:`3px solid ${sevColor}` }}>
                    <div style={{ fontSize:11, fontWeight:700, color:'var(--text)' }}>{a.title}</div>
                    {a.message && <div style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{a.message}</div>}
                    <div style={{ fontSize:9, color:'var(--muted)', marginTop:3 }}>{new Date(a.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Q Live Negotiation — broker call cockpit */}
        <div style={{ padding:'14px 16px', borderTop:'1px solid var(--border)' }}>
          <QLiveNegotiation variant="panel" />
        </div>

        {/* Q Activity Feed — every decision Q makes */}
        <div style={{ padding:'14px 16px', borderTop:'1px solid var(--border)' }}>
          <QActivityFeed variant="panel" limit={20} />
        </div>
      </div>
    </div>
  )
}

// ── Polyline helper for breadcrumb trail ──
function BreadcrumbLine({ path, color = '#f0a500' }) {
  const map = useMap()
  const polylineRef = useRef(null)

  useEffect(() => {
    if (!map || !path?.length) return
    if (polylineRef.current) polylineRef.current.setMap(null)
    polylineRef.current = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: color,
      strokeOpacity: 0.85,
      strokeWeight: 4,
      icons: [{
        icon: { path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW, scale: 3 },
        offset: '100%',
      }],
    })
    polylineRef.current.setMap(map)
    return () => { polylineRef.current?.setMap(null) }
  }, [map, path, color])

  return null
}
