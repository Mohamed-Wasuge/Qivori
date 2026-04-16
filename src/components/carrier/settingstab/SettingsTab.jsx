import React, { useState, useEffect, lazy, Suspense } from 'react'
import {
  Building2, Star, CreditCard, Plug, Users, Bell, Smartphone, FileText, Palette, Shield, Globe, Sun, Moon, Eye, Zap,
  Truck, BarChart2, Fuel, Route, Upload, Activity, Lock, Briefcase
} from 'lucide-react'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { apiFetch } from '../../../lib/api'
import { Ic } from '../shared'
import { ActivityLog } from '../ActivityLog'
import { SubscriptionSettings } from './SubscriptionSettings'
import { LoadBoardSettings } from './LoadBoardSettings'
import { DispatchSettings, CSVImportTool, ChangePassword } from './helpers'

// Lazy-load Settings domain components
const lazyN = (fn, name) => lazy(() => fn().then(m => ({ default: m[name] })))
const SMSSettings = lazyN(() => import('../../../pages/carrier/Settings'), 'SMSSettings')
const InvoicingSettings = lazyN(() => import('../../../pages/carrier/Settings'), 'InvoicingSettings')
const TeamManagement = lazyN(() => import('../../../pages/carrier/Settings'), 'TeamManagement')
const InsuranceHub = lazyN(() => import('../Hubs'), 'InsuranceHub')
const CarrierPackage = lazyN(() => import('../../../pages/carrier/Settings'), 'CarrierPackage')

// ── Settings tab ───────────────────────────────────────────────────────────────
export function SettingsTab() {
  const { showToast, theme, setTheme, companyRole, isAdmin } = useApp()
  const { company: ctxCompany, updateCompany } = useCarrier()
  const [company, setCompany] = useState(ctxCompany || { name:'', mc:'', dot:'', address:'', phone:'', email:'', ein:'' })
  const [billing, setBilling] = useState({
    factoringRate: ctxCompany?.factoring_rate || '2.5',
    payDefault: ctxCompany?.default_pay_rate || '28%',
    fastpayEnabled: ctxCompany?.fastpay_enabled !== false,
    autoInvoice: ctxCompany?.auto_invoice !== false,
    autoFactor: ctxCompany?.auto_factor_on_delivery || false,
  })
  const [fuelCard, setFuelCard] = useState(ctxCompany?.fuel_card_provider || '')
  const [tollTransponder, setTollTransponder] = useState(ctxCompany?.toll_transponder || '')
  const [providerKeys, setProviderKeys] = useState({
    resend_api_key:'', checkr_api_key:'', sambasafety_api_key:'', sambasafety_account_id:'',
    fmcsa_api_key:'', fmcsa_webkey:'', fadv_client_id:'', fadv_client_secret:'',
  })
  const integrations = [
    { name:'Samsara ELD',      keyField:'samsara_api_key', icon: Smartphone, desc:'Connect your Samsara ELD to sync device data', section:'providers' },
    { name:'Motive ELD',       keyField:'motive_api_key',  icon: Smartphone, desc:'Connect your Motive (KeepTruckin) ELD', section:'providers' },
    { name:'QuickBooks Online', keyField:'quickbooks_key',  icon: BarChart2, desc:'Connect to auto-sync expenses & invoices', section:'providers' },
    { name:'DAT Load Board',    keyField:'dat_api_key',     icon: Truck, desc:'Connect to pull spot rates on your lanes', section:'loadboards' },
    { name:'Uber Freight',      keyField:'uber_freight_key', icon: Truck, desc:'Access Uber Freight loads, quotes, and tracking', section:'loadboards' },
    { name:'123Loadboard',      keyField:'lb123_api_key',   icon: Truck, desc:'Connect to search and book loads', section:'loadboards' },
  ].map(int => ({
    ...int,
    status: providerKeys[int.keyField] ? 'Connected' : 'Not connected',
    statusC: providerKeys[int.keyField] ? 'var(--success)' : 'var(--muted)',
  }))
  const [team] = useState([
    { name:'You (Owner)',     email: company.email || '', role:'Admin',    roleC:'var(--accent)' },
  ])
  const [notifPrefs, setNotifPrefs] = useState({
    newMatch: ctxCompany?.notif_new_match !== false,
    loadStatus: ctxCompany?.notif_load_status !== false,
    driverAlert: ctxCompany?.notif_driver_alert !== false,
    payReady: ctxCompany?.notif_pay_ready !== false,
    compliance: ctxCompany?.notif_compliance !== false,
    marketRates: ctxCompany?.notif_market_rates === true,
  })
  const [settingsSec, setSettingsSec] = useState('company')
  const [keysLoaded, setKeysLoaded] = useState(false)
  const [fmcsaLoading, setFmcsaLoading] = useState(false)
  const [fmcsaResult, setFmcsaResult] = useState(null)

  const doFMCSALookup = async () => {
    const val = (company._lookupVal || '').trim().replace(/[^0-9]/g, '')
    if (!val) { showToast('error', 'Enter a Number', 'Type your MC# or DOT# to lookup'); return }
    setFmcsaLoading(true)
    setFmcsaResult(null)
    try {
      // Try DOT first (6-7 digits usually), then MC
      const param = val.length >= 7 ? `dot=${val}` : `mc=${val}`
      const res = await apiFetch(`/api/fmcsa-lookup?${param}`)
      const data = await res.json()
      if (!res.ok || !data.carrier) {
        // Try the other param
        const alt = val.length >= 7 ? `mc=${val}` : `dot=${val}`
        const res2 = await apiFetch(`/api/fmcsa-lookup?${alt}`)
        const data2 = await res2.json()
        if (!res2.ok || !data2.carrier) { showToast('error', 'Not Found', 'No carrier found with that number'); setFmcsaLoading(false); return }
        data.carrier = data2.carrier
      }
      const c = data.carrier
      setFmcsaResult(c)
      const addr = [c.phyStreet, c.phyCity, c.phyState, c.phyZip].filter(Boolean).join(', ')
      setCompany(prev => ({
        ...prev,
        name: c.legalName || c.dbaName || prev.name,
        mc: c.mcNumber || prev.mc,
        dot: c.dotNumber || prev.dot,
        phone: c.phone || prev.phone,
        address: addr || prev.address,
      }))
      showToast('success', 'Company Found', `${c.legalName} — info auto-filled`)
    } catch (err) {
      showToast('error', 'Lookup Failed', err.message || 'Could not reach FMCSA')
    }
    setFmcsaLoading(false)
  }

  // Load provider keys from company record
  useEffect(() => {
    if (ctxCompany?.provider_keys) {
      setProviderKeys(prev => ({ ...prev, ...ctxCompany.provider_keys }))
      setKeysLoaded(true)
    }
  }, [ctxCompany])

  const saveProviderKeys = async () => {
    try {
      await updateCompany({ provider_keys: providerKeys })
      showToast('success', 'Keys Saved', 'Provider API keys updated securely')
    } catch (err) {
      showToast('error', 'Error', err.message || 'Failed to save keys')
    }
  }

  const [pageEnabled, setPageEnabled] = useState(ctxCompany?.public_page_enabled || false)
  const [pageSlug, setPageSlug] = useState(ctxCompany?.slug || '')
  const [pageTagline, setPageTagline] = useState(ctxCompany?.tagline || '')
  const [pageServiceAreas, setPageServiceAreas] = useState(ctxCompany?.service_areas || '')
  const [pageEquipment, setPageEquipment] = useState(ctxCompany?.equipment_types || '')

  // Owner-only settings sections — hidden from dispatchers, accountants, drivers
  const OWNER_ONLY_SECTIONS = new Set(['team', 'subscription', 'providers', 'integrations'])

  const ALL_SECTIONS = [
    { id:'company',        icon: Building2, label:'Company Profile' },
    { id:'website',        icon: Globe, label:'My Website' },
    { id:'dispatch',       icon: Zap, label:'Dispatch Rules' },
    { id:'loadboards',     icon: Globe, label:'Load Boards' },
    { id:'subscription',   icon: Star, label:'Subscription' },
    { id:'billing',        icon: CreditCard, label:'Billing & Pay' },
    { id:'insurance',      icon: Shield, label:'Insurance' },
    { id:'providers',      icon: Shield, label:'Provider Keys' },
    { id:'integrations',   icon: Plug, label:'Integrations' },
    { id:'team',           icon: Users, label:'Team & Access' },
    { id:'notifications',  icon: Bell, label:'Notifications' },
    { id:'sms',            icon: Smartphone, label:'SMS Alerts' },
    { id:'invoicing',      icon: FileText, label:'Invoicing' },
    { id:'import-data',    icon: Upload, label:'Import Data' },
    { id:'appearance',     icon: Palette, label:'Appearance' },
    { id:'security',       icon: Shield, label:'Security' },
    { id:'activity-data',  icon: Activity, label:'Activity & Data' },
  ]

  const SECTIONS = isAdmin ? ALL_SECTIONS : ALL_SECTIONS.filter(s => !OWNER_ONLY_SECTIONS.has(s.id))

  const FieldRow = ({ label, value, onChange, type='text' }) => (
    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
      <label style={{ fontSize:11, color:'var(--muted)' }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
    </div>
  )

  return (
    <div style={{ display:'flex', height:'100%', minHeight:0, overflow:'hidden' }}>

      {/* Sidebar */}
      <div style={{ width:200, flexShrink:0, background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'14px 16px 8px', borderBottom:'1px solid var(--border)' }}>
          <div style={{ fontSize:10, fontWeight:800, color:'var(--accent)', letterSpacing:2 }}>SETTINGS</div>
        </div>
        {SECTIONS.map(s => {
          const isActive = settingsSec === s.id
          return (
            <button key={s.id} onClick={() => setSettingsSec(s.id)}
              style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'11px 16px', border:'none', cursor:'pointer', textAlign:'left',
                background: isActive ? 'rgba(240,165,0,0.08)' : 'transparent', borderLeft:`3px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                transition:'all 0.15s', fontFamily:"'DM Sans',sans-serif",
                color: isActive ? 'var(--accent)' : 'var(--text)', fontSize:12, fontWeight: isActive ? 700 : 500 }}
              onMouseOver={e => { if(!isActive) e.currentTarget.style.background='rgba(255,255,255,0.03)' }}
              onMouseOut={e => { if(!isActive) e.currentTarget.style.background='transparent' }}>
              <span><Ic icon={s.icon} size={14} /></span>{s.label}
            </button>
          )
        })}
      </div>

      {/* Content */}
      <div className="settings-scroll" style={{ flex:1, minHeight:0, overflowY:'auto', padding:24, paddingBottom:120 }}>

        {/* Company Profile */}
        {settingsSec === 'company' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>COMPANY PROFILE</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Your carrier identity — used on rate cons, invoices, and FMCSA filings</div>
            </div>

            {/* Logo Upload */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:14 }}>Company Logo</div>
              <div style={{ display:'flex', alignItems:'center', gap:20 }}>
                {/* Preview */}
                <div style={{ width:100, height:100, borderRadius:12, border:'2px dashed var(--border)', background:'var(--surface2)',
                  display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, overflow:'hidden', position:'relative' }}>
                  {company.logo
                    ? <img src={company.logo} alt="Company logo" style={{ width:'100%', height:'100%', objectFit:'contain' }} />
                    : (
                      <div style={{ textAlign:'center' }}>
                        <Ic icon={Truck} size={28} color="var(--muted)" />
                        <div style={{ fontSize:9, color:'var(--muted)', marginTop:4 }}>No logo</div>
                      </div>
                    )
                  }
                </div>
                <div>
                  <div style={{ fontSize:13, fontWeight:600, marginBottom:4 }}>
                    {company.logo ? 'Logo uploaded \u2713' : 'Upload your company logo'}
                  </div>
                  <div style={{ fontSize:11, color:'var(--muted)', marginBottom:12, lineHeight:1.6 }}>
                    PNG, JPG, or SVG — max 2 MB<br/>
                    Shown on invoices, rate cons, and sidebar
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    <label style={{ padding:'8px 16px', fontSize:12, fontWeight:700, borderRadius:8, background:'var(--accent)', color:'#000',
                      cursor:'pointer', fontFamily:"'DM Sans',sans-serif", display:'inline-flex', alignItems:'center', gap:6 }}>
                      {company.logo ? 'Replace Logo' : 'Upload Logo'}
                      <input type="file" accept="image/*" style={{ display:'none' }}
                        onChange={e => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          if (file.size > 2 * 1024 * 1024) { showToast('','File too large','Max 2 MB — try a smaller image'); return }
                          const reader = new FileReader()
                          reader.onload = ev => {
                            setCompany(c => ({ ...c, logo: ev.target.result }))
                            showToast('','Logo Uploaded', file.name + ' — save to apply')
                          }
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                    {company.logo && (
                      <button className="btn btn-ghost" style={{ fontSize:12 }}
                        onClick={() => { setCompany(c => ({ ...c, logo: '' })); showToast('','Logo Removed','Reverted to initials') }}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* FMCSA Auto-Lookup */}
            <div style={{ background:'linear-gradient(135deg, rgba(240,165,0,0.06), rgba(240,165,0,0.02))', border:'1px solid rgba(240,165,0,0.2)', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:4 }}>Auto-Fill from FMCSA</div>
              <div style={{ fontSize:11, color:'var(--muted)', marginBottom:14 }}>Enter your MC# or DOT# and we'll pull your company info automatically</div>
              <div style={{ display:'flex', gap:10, alignItems:'flex-end' }}>
                <div style={{ flex:1, display:'flex', flexDirection:'column', gap:4 }}>
                  <label style={{ fontSize:11, color:'var(--muted)' }}>MC or DOT Number</label>
                  <input type="text" placeholder="e.g. 892451 or 3847291" value={company._lookupVal || ''} onChange={e => setCompany(c => ({ ...c, _lookupVal: e.target.value }))}
                    onKeyDown={e => { if (e.key === 'Enter') doFMCSALookup() }}
                    style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
                </div>
                <button onClick={doFMCSALookup} disabled={fmcsaLoading}
                  style={{ padding:'9px 20px', fontSize:12, fontWeight:700, background:'var(--accent)', color:'#000', border:'none', borderRadius:8, cursor:'pointer', whiteSpace:'nowrap', opacity: fmcsaLoading ? 0.6 : 1 }}>
                  {fmcsaLoading ? 'Looking up...' : 'Lookup'}
                </button>
              </div>
              {fmcsaResult && (
                <div style={{ marginTop:12, padding:'10px 14px', background:'rgba(34,197,94,0.08)', border:'1px solid rgba(34,197,94,0.2)', borderRadius:8, fontSize:12, color:'var(--success)' }}>
                  Found: <strong>{fmcsaResult.legalName}</strong> — DOT# {fmcsaResult.dotNumber} {fmcsaResult.mcNumber && `| MC# ${fmcsaResult.mcNumber}`}
                </div>
              )}
            </div>

            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <FieldRow label="Company Name"   value={company.name}    onChange={v => setCompany(c=>({...c,name:v}))} />
              <FieldRow label="MC Number"      value={company.mc}      onChange={v => setCompany(c=>({...c,mc:v}))} />
              <FieldRow label="DOT Number"     value={company.dot}     onChange={v => setCompany(c=>({...c,dot:v}))} />
              <FieldRow label="EIN"            value={company.ein}     onChange={v => setCompany(c=>({...c,ein:v}))} />
              <FieldRow label="Phone"          value={company.phone}   onChange={v => setCompany(c=>({...c,phone:v}))} />
              <FieldRow label="Email"          value={company.email}   onChange={v => setCompany(c=>({...c,email:v}))} type="email" />
              <div style={{ gridColumn:'1/-1' }}>
                <FieldRow label="Business Address" value={company.address} onChange={v => setCompany(c=>({...c,address:v}))} />
              </div>
            </div>
            <div>
              <button className="btn btn-primary" style={{ padding:'11px 28px' }} onClick={() => { updateCompany(company); showToast('','Saved','Company profile updated') }}>Save Changes</button>
            </div>

            {/* Carrier Package — broker contracting docs (W9, COI, authority, etc).
                Folded into the Company Profile page so carriers manage their identity
                and broker packet in one place. */}
            <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--border)' }}>
              <Suspense fallback={<div style={{ padding: 20, color: 'var(--muted)', fontSize: 13 }}>Loading carrier package…</div>}>
                <CarrierPackage />
              </Suspense>
            </div>
          </>
        )}

        {/* My Website — carrier public landing page */}
        {settingsSec === 'website' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>MY WEBSITE</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>A professional landing page auto-generated from your company profile — share with brokers and shippers</div>
            </div>

            {/* Enable Toggle */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize:14, fontWeight:700 }}>Publish My Website</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>Make your carrier page visible to brokers and the public</div>
                </div>
                <div onClick={() => setPageEnabled(!pageEnabled)}
                  style={{ width:44, height:24, borderRadius:12, background: pageEnabled ? 'var(--accent)' : 'var(--border)', cursor:'pointer', position:'relative', transition:'all 0.2s', flexShrink:0 }}>
                  <div style={{ position:'absolute', top:3, left: pageEnabled ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'all 0.2s' }}/>
                </div>
              </div>
            </div>

            {/* URL Slug */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20 }}>
              <div style={{ fontSize:12, fontWeight:700, marginBottom:10 }}>Your Page URL</div>
              <div style={{ display:'flex', alignItems:'center', gap:0, background:'var(--surface2)', borderRadius:8, border:'1px solid var(--border)', overflow:'hidden' }}>
                <span style={{ padding:'9px 12px', fontSize:13, color:'var(--muted)', whiteSpace:'nowrap', borderRight:'1px solid var(--border)', background:'rgba(255,255,255,0.02)' }}>qivori.com/#/c/</span>
                <input type="text" value={pageSlug} onChange={e => setPageSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="your-company-name" style={{ flex:1, padding:'9px 12px', border:'none', background:'transparent', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
              </div>
              <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>Only lowercase letters, numbers, and hyphens. This is your unique URL.</div>
              {!pageSlug && company.name && (
                <button style={{ marginTop:8, padding:'6px 14px', fontSize:11, fontWeight:700, background:'rgba(240,165,0,0.1)', color:'var(--accent)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:6, cursor:'pointer' }}
                  onClick={() => setPageSlug(company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''))}>
                  Auto-generate from company name
                </button>
              )}
            </div>

            {/* Tagline */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:10 }}>
              <div style={{ fontSize:12, fontWeight:700 }}>Page Details</div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:11, color:'var(--muted)' }}>Tagline</label>
                <input type="text" value={pageTagline} onChange={e => setPageTagline(e.target.value)} placeholder="e.g. Reliable freight hauling across the Midwest"
                  style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:11, color:'var(--muted)' }}>Equipment Types (comma-separated)</label>
                <input type="text" value={pageEquipment} onChange={e => setPageEquipment(e.target.value)} placeholder="e.g. Dry Van, Reefer, Flatbed"
                  style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                <label style={{ fontSize:11, color:'var(--muted)' }}>Service Areas (comma-separated)</label>
                <input type="text" value={pageServiceAreas} onChange={e => setPageServiceAreas(e.target.value)} placeholder="e.g. Midwest, Southeast, Nationwide"
                  style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", outline:'none' }} />
              </div>
            </div>

            {/* Save + Preview */}
            <div style={{ display:'flex', gap:12, alignItems:'center' }}>
              <button className="btn btn-primary" style={{ padding:'11px 28px' }} onClick={() => {
                if (!pageSlug) { showToast('error','Missing Slug','Enter a URL slug for your page'); return }
                updateCompany({ public_page_enabled: pageEnabled, slug: pageSlug, tagline: pageTagline, service_areas: pageServiceAreas, equipment_types: pageEquipment })
                showToast('','Saved', pageEnabled ? 'Your carrier page is now live!' : 'Website settings saved')
              }}>Save Website Settings</button>
              {pageSlug && (
                <button className="btn btn-ghost" style={{ fontSize:12 }} onClick={() => window.open(`${window.location.origin}/#/c/${pageSlug}`, '_blank')}>
                  Preview Page {'\u2197'}
                </button>
              )}
            </div>

            {/* Live Preview Card */}
            {pageSlug && pageEnabled && (
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, marginTop:8 }}>
                <div style={{ fontSize:11, fontWeight:700, color:'var(--accent)', letterSpacing:1, marginBottom:8 }}>LIVE URL</div>
                <div style={{ fontSize:14, fontWeight:600, wordBreak:'break-all' }}>
                  <a href={`${window.location.origin}/#/c/${pageSlug}`} target="_blank" rel="noopener noreferrer" style={{ color:'var(--accent)', textDecoration:'none' }}>
                    {window.location.origin}/#/c/{pageSlug}
                  </a>
                </div>
                <div style={{ fontSize:11, color:'var(--muted)', marginTop:6 }}>Share this link with brokers, shippers, or add it to your email signature</div>
              </div>
            )}
          </>
        )}

        {/* Dispatch Rules — AI thresholds + compliance enforcement */}
        {settingsSec === 'dispatch' && <DispatchSettings />}

        {/* Load Boards */}
        {settingsSec === 'loadboards' && <LoadBoardSettings />}

        {/* Subscription Management */}
        {settingsSec === 'subscription' && <SubscriptionSettings />}

        {/* Billing & Pay */}
        {settingsSec === 'billing' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>BILLING & PAY SETTINGS</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Factoring rate, default driver pay model, and invoice automation</div>
            </div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:20, display:'flex', flexDirection:'column', gap:14 }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Factoring Rate (%)</label>
                  <input type="number" value={billing.factoringRate} onChange={e => setBilling(b=>({...b,factoringRate:e.target.value}))} min="0" max="10" step="0.1"
                    style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", width:'100%', boxSizing:'border-box' }} />
                </div>
                <div>
                  <label style={{ fontSize:11, color:'var(--muted)', display:'block', marginBottom:4 }}>Default Driver Pay %</label>
                  <input type="text" value={billing.payDefault} onChange={e => setBilling(b=>({...b,payDefault:e.target.value}))}
                    style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif", width:'100%', boxSizing:'border-box' }} />
                </div>
              </div>
              {[
                { key:'fastpayEnabled', label:'FastPay Enabled', sub:'Allow drivers to request same-day pay advances' },
                { key:'autoInvoice',    label:'Auto-Generate Invoices', sub:'Automatically create invoice when load is delivered' },
                { key:'autoFactor',     label:'Auto-Factor on Delivery', sub:'Automatically submit invoice to factoring company when load is delivered — same day pay' },
              ].map(opt => (
                <div key={opt.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'12px 16px', background:'var(--surface2)', borderRadius:10 }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600 }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{opt.sub}</div>
                  </div>
                  <div onClick={() => setBilling(b=>({...b,[opt.key]:!b[opt.key]}))}
                    style={{ width:44, height:24, borderRadius:12, background: billing[opt.key] ? 'var(--accent)' : 'var(--border)', cursor:'pointer', position:'relative', transition:'all 0.2s' }}>
                    <div style={{ position:'absolute', top:3, left: billing[opt.key] ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'all 0.2s' }}/>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ padding:'11px 28px', width:'fit-content' }} onClick={() => {
              updateCompany({
                factoring_rate: parseFloat(billing.factoringRate) || 2.5,
                default_pay_rate: billing.payDefault,
                fastpay_enabled: billing.fastpayEnabled,
                auto_invoice: billing.autoInvoice,
                auto_factor_on_delivery: billing.autoFactor,
              })
              showToast('','Saved','Billing settings updated')
            }}>Save Changes</button>
          </>
        )}

        {/* Insurance — renders InsuranceHub from CarrierLayout */}
        {settingsSec === 'insurance' && (
          <Suspense fallback={<div style={{ padding:40, textAlign:'center', color:'var(--muted)' }}>Loading...</div>}>
            <InsuranceHub />
          </Suspense>
        )}

        {/* Provider Keys */}
        {settingsSec === 'providers' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>PROVIDER API KEYS</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Connect your screening providers to automate driver onboarding checks</div>
            </div>

            <div style={{ background:'rgba(77,142,240,0.06)', border:'1px solid rgba(77,142,240,0.15)', borderRadius:10, padding:'14px 18px', fontSize:12, color:'var(--accent3)', lineHeight:1.6 }}>
              <strong>How it works:</strong> Your API keys are stored securely in your company record (encrypted, RLS-protected). When you add a new driver, Qivori automatically orders checks through your provider accounts. <strong>You only pay the providers directly — Qivori charges nothing extra.</strong>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:14, width:'100%' }}>
              {[
                { section: 'Email (Consent Forms)', keys: [
                  { key:'resend_api_key', label:'Resend API Key', ph:'re_xxxxxxxx', link:'https://resend.com', note:'Free: 100 emails/day — sends consent forms to new drivers' },
                ]},
                { section: 'Background & Employment', keys: [
                  { key:'checkr_api_key', label:'Checkr API Key', ph:'xxxxxxxxxxxxxxxx', link:'https://checkr.com', note:'Background checks + 3-year employment verification' },
                ]},
                { section: 'Motor Vehicle Record (MVR)', keys: [
                  { key:'sambasafety_api_key', label:'SambaSafety API Key', ph:'xxxxxxxxxxxxxxxx', link:'https://sambasafety.com', note:'Instant MVR pulls from all 50 states' },
                  { key:'sambasafety_account_id', label:'SambaSafety Account ID', ph:'ACC-xxxxx' },
                ]},
                { section: 'FMCSA (Clearinghouse + PSP + CDL)', keys: [
                  { key:'fmcsa_api_key', label:'FMCSA Clearinghouse API Key', ph:'xxxxxxxxxxxxxxxx', link:'https://clearinghouse.fmcsa.dot.gov', note:'Drug & alcohol violation queries ($1.25/query)' },
                  { key:'fmcsa_webkey', label:'FMCSA WebKey (PSP)', ph:'xxxxxxxxxxxxxxxx', link:'https://www.psp.fmcsa.dot.gov', note:'Safety reports + CDL verification ($10/report)' },
                ]},
                { section: 'Drug & Alcohol Testing', keys: [
                  { key:'fadv_client_id', label:'First Advantage Client ID', ph:'xxxxxxxxxxxxxxxx', link:'https://fadv.com', note:'DOT 5-panel drug & alcohol screening' },
                  { key:'fadv_client_secret', label:'First Advantage Client Secret', ph:'xxxxxxxxxxxxxxxx' },
                ]},
              ].map(group => (
                <div key={group.section} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', width:'100%' }}>
                  <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{group.section}</div>
                    {group.keys.every(k => providerKeys[k.key]) && (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(34,197,94,0.1)', color:'var(--success)' }}>Connected</span>
                    )}
                    {group.keys.every(k => !providerKeys[k.key]) && (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:'rgba(74,85,112,0.15)', color:'var(--muted)' }}>Not set</span>
                    )}
                  </div>
                  <div style={{ padding:16, display:'flex', flexDirection:'column', gap:12 }}>
                    {group.keys.map(k => (
                      <div key={k.key}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                          <label style={{ fontSize:11, color:'var(--muted)' }}>{k.label}</label>
                          {k.link && <a href={k.link} target="_blank" rel="noopener noreferrer" style={{ fontSize:10, color:'var(--accent3)', textDecoration:'none' }}>Sign up {'\u2192'}</a>}
                        </div>
                        <input
                          type="password"
                          value={providerKeys[k.key]}
                          onChange={e => setProviderKeys(p => ({ ...p, [k.key]: e.target.value }))}
                          placeholder={k.ph}
                          style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'9px 12px', color:'var(--text)', fontSize:13, fontFamily:'monospace', outline:'none', boxSizing:'border-box' }}
                        />
                        {k.note && <div style={{ fontSize:10, color:'var(--muted)', marginTop:3 }}>{k.note}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <button className="btn btn-primary" style={{ alignSelf:'flex-start', padding:'12px 32px', fontSize:13, fontWeight:700 }} onClick={saveProviderKeys}>
                Save Provider Keys
              </button>
            </div>
          </>
        )}

        {/* Integrations */}
        {settingsSec === 'integrations' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>INTEGRATIONS</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Connect your ELD, fuel card, accounting, and load board</div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {/* Fuel Card Provider */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:44, height:44, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ic icon={Fuel} size={22} /></div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Fuel Card</div>
                  <select value={fuelCard} onChange={e => { setFuelCard(e.target.value); updateCompany({ fuel_card_provider: e.target.value }); showToast('', 'Saved', e.target.value || 'Fuel card cleared') }}
                    style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif" }}>
                    <option value="">Select your fuel card...</option>
                    {['EFS (WEX/Fleet One)', 'Comdata', 'TCS Fuel Card', 'Pilot RoadRunner', 'Loves Fleet Card', 'RTS Fuel Card', 'Mudflap', 'AtoB', 'Coast', 'Fuelman', 'Voyager', 'Pacific Pride', 'CFN', 'T-Chek', 'MultiService', 'I don\'t use a fuel card', 'Other'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {/* Toll Transponder */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                <div style={{ width:44, height:44, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ic icon={Route} size={22} /></div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:700, marginBottom:6 }}>Toll Transponder</div>
                  <select value={tollTransponder} onChange={e => { setTollTransponder(e.target.value); updateCompany({ toll_transponder: e.target.value }); showToast('', 'Saved', e.target.value || 'Toll transponder cleared') }}
                    style={{ width:'100%', background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', color:'var(--text)', fontSize:13, fontFamily:"'DM Sans',sans-serif" }}>
                    <option value="">Select your toll transponder...</option>
                    {['Bestpass', 'PrePass', 'E-ZPass', 'SunPass (FL)', 'TxTag (TX)', 'I-PASS (IL)', 'Peach Pass (GA)', 'PikePass (OK)', 'Good To Go (WA)', 'FasTrak (CA)', 'I don\'t use a transponder', 'Other'].map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {integrations.map(int => (
                <div key={int.name} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px', display:'flex', alignItems:'center', gap:14 }}>
                  <div style={{ width:44, height:44, borderRadius:10, background:'var(--surface2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}><Ic icon={int.icon} size={22} /></div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:3 }}>
                      <span style={{ fontSize:14, fontWeight:700 }}>{int.name}</span>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:8, background:int.statusC+'15', color:int.statusC }}>{int.status}</span>
                    </div>
                    <div style={{ fontSize:12, color:'var(--muted)' }}>{int.desc}</div>
                  </div>
                  <button className={int.status === 'Connected' ? 'btn btn-ghost' : 'btn btn-primary'} style={{ fontSize:11 }}
                    onClick={() => {
                      if (int.status === 'Connected') {
                        setProviderKeys(p => ({ ...p, [int.keyField]: '' }))
                        updateCompany({ provider_keys: { ...providerKeys, [int.keyField]: '' } })
                        showToast('', 'Disconnected', int.name)
                      } else {
                        setSettingsSec(int.section)
                        showToast('', 'Connect', `Enter your ${int.name} API key in the ${int.section === 'providers' ? 'Provider Keys' : 'Load Boards'} section`)
                      }
                    }}>
                    {int.status === 'Connected' ? 'Disconnect' : '+ Connect'}
                  </button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Team */}
        {settingsSec === 'team' && (
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
            <TeamManagement />
          </Suspense>
        )}

        {/* Notifications */}
        {settingsSec === 'notifications' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>NOTIFICATION PREFERENCES</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Choose what alerts appear in your notification bell and email</div>
            </div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              {[
                { key:'newMatch',    label:'AI Load Matches',      sub:'When AI finds a high-score load on your lanes' },
                { key:'loadStatus',  label:'Load Status Changes',  sub:'Pickup confirmed, delivered, exceptions' },
                { key:'driverAlert', label:'Driver Alerts',        sub:'HOS violations, CDL expiry, inspection due' },
                { key:'payReady',    label:'Payment Ready',        sub:'FastPay available, invoice paid, factoring funded' },
                { key:'compliance',  label:'Compliance Warnings',  sub:'Registration, insurance, DOT inspection due' },
                { key:'marketRates', label:'Market Rate Alerts',   sub:'When rates spike 10%+ on your active lanes' },
              ].map((opt, i, arr) => (
                <div key={opt.key} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 20px', borderBottom: i < arr.length-1 ? '1px solid var(--border)' : 'none' }}>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, marginBottom:2 }}>{opt.label}</div>
                    <div style={{ fontSize:11, color:'var(--muted)' }}>{opt.sub}</div>
                  </div>
                  <div onClick={() => setNotifPrefs(p=>({...p,[opt.key]:!p[opt.key]}))}
                    style={{ width:44, height:24, borderRadius:12, background: notifPrefs[opt.key] ? 'var(--accent)' : 'var(--border)', cursor:'pointer', position:'relative', transition:'all 0.2s', flexShrink:0 }}>
                    <div style={{ position:'absolute', top:3, left: notifPrefs[opt.key] ? 22 : 3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'all 0.2s' }}/>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" style={{ padding:'11px 28px', width:'fit-content' }} onClick={() => {
              updateCompany({
                notif_new_match: notifPrefs.newMatch,
                notif_load_status: notifPrefs.loadStatus,
                notif_driver_alert: notifPrefs.driverAlert,
                notif_pay_ready: notifPrefs.payReady,
                notif_compliance: notifPrefs.compliance,
                notif_market_rates: notifPrefs.marketRates,
              })
              showToast('','Saved','Notification preferences saved')
            }}>Save Preferences</button>
          </>
        )}

        {/* SMS Alerts */}
        {settingsSec === 'sms' && (
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
            <SMSSettings />
          </Suspense>
        )}

        {/* Invoicing Settings */}
        {settingsSec === 'invoicing' && (
          <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: 'var(--muted)' }}>Loading...</div>}>
            <InvoicingSettings />
          </Suspense>
        )}

        {/* Import Data */}
        {settingsSec === 'import-data' && (
          <CSVImportTool />
        )}

        {/* Appearance */}
        {settingsSec === 'appearance' && (
          <>
            <div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:20, letterSpacing:1, marginBottom:4 }}>APPEARANCE & ACCESSIBILITY</div>
              <div style={{ fontSize:12, color:'var(--muted)' }}>Customize how Qivori looks — including colorblind-safe modes</div>
            </div>

            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid var(--border)', fontWeight:700, fontSize:13, display:'flex', alignItems:'center', gap:6 }}><Ic icon={Palette} size={14} /> Color Theme</div>
              <div style={{ padding:20, display:'flex', flexDirection:'column', gap:12 }}>
                {[
                  {
                    id: 'default',
                    label: 'Default Dark',
                    sub: 'The classic Qivori dark theme — gold accents, deep navy background',
                    icon: Moon,
                    preview: ['#07090e','#f0a500','#22c55e','#ef4444'],
                  },
                  {
                    id: 'light',
                    label: 'Light Mode',
                    sub: 'Clean white background with dark text — great for daytime use or bright environments',
                    icon: Sun,
                    preview: ['#f5f7fa','#c78c00','#16853e','#c93b3b'],
                  },
                  {
                    id: 'colorblind',
                    label: 'Colorblind Mode',
                    sub: 'Okabe-Ito palette — designed for deuteranopia & protanopia. Replaces red/green with orange/blue.',
                    icon: Eye,
                    badge: 'RECOMMENDED',
                    preview: ['#07090e','#f0a500','#0072b2','#d55e00'],
                  },
                  {
                    id: 'high-contrast',
                    label: 'High Contrast',
                    sub: 'Pure black background, bold borders, brighter text — ideal for bright sunlight in cab or low-vision users',
                    icon: Zap,
                    preview: ['#000000','#ffc200','#00e676','#ff5252'],
                  },
                ].map(t => {
                  const isActive = theme === t.id
                  return (
                    <div key={t.id} onClick={() => { setTheme(t.id); showToast('', t.label + ' activated', t.sub.split(' \u2014 ')[0]) }}
                      style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 16px', borderRadius:10, cursor:'pointer',
                        background: isActive ? 'rgba(240,165,0,0.07)' : 'var(--surface2)',
                        border: `2px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`,
                        transition:'all 0.15s' }}>
                      <span style={{ flexShrink:0 }}><Ic icon={t.icon} size={22} /></span>
                      <div style={{ flex:1 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                          <span style={{ fontSize:13, fontWeight:700, color: isActive ? 'var(--accent)' : 'var(--text)' }}>{t.label}</span>
                          {t.badge && <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:'rgba(240,165,0,0.15)', color:'var(--accent)', letterSpacing:1 }}>{t.badge}</span>}
                          {isActive && <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:'rgba(34,197,94,0.15)', color:'var(--success)', letterSpacing:1 }}>ACTIVE</span>}
                        </div>
                        <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.5 }}>{t.sub}</div>
                      </div>
                      {/* Color swatches */}
                      <div style={{ display:'flex', gap:4, flexShrink:0 }}>
                        {t.preview.map((c, i) => (
                          <div key={i} style={{ width:16, height:16, borderRadius:'50%', background:c, border:'1px solid rgba(255,255,255,0.1)' }}/>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ background:'var(--surface)', border:'1px solid rgba(240,165,0,0.2)', borderRadius:12, padding:'14px 18px' }}>
              <div style={{ fontSize:11, color:'var(--muted)', lineHeight:1.7 }}>
                <strong style={{ color:'var(--text)' }}>Why this matters:</strong> ~8% of men have red-green colorblindness — in a male-dominated industry like trucking, that's roughly 1 in 12 dispatchers or drivers. Colorblind mode ensures critical alerts (overdue, high-score loads, danger zones) are always distinguishable regardless of color vision.
              </div>
            </div>
          </>
        )}

        {settingsSec === 'security' && <ChangePassword />}

        {settingsSec === 'activity-data' && (
          <div style={{ margin: '-20px', height: 'calc(100% + 40px)' }}>
            <ActivityLog />
          </div>
        )}

      </div>
    </div>
  )
}
