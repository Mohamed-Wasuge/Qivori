import { useState, useRef, useMemo } from 'react'
import { useCarrier } from '../../context/CarrierContext'
import { useApp } from '../../context/AppContext'
import { FileText, Camera, ChevronDown, Fuel, MapPin, DollarSign, TrendingDown } from 'lucide-react'
import { Ic, haptic, fmt$ } from './shared'
import { apiFetch } from '../../lib/api'

// US state tax rates (cents per gallon) — simplified; real rates vary by year
const STATE_TAX_RATES = {
  AL: 0.29, AK: 0.0895, AZ: 0.26, AR: 0.285, CA: 0.539, CO: 0.22, CT: 0.25, DE: 0.23,
  FL: 0.35, GA: 0.312, HI: 0.16, ID: 0.32, IL: 0.467, IN: 0.48, IA: 0.30, KS: 0.26,
  KY: 0.246, LA: 0.20, ME: 0.312, MD: 0.361, MA: 0.24, MI: 0.307, MN: 0.285, MS: 0.18,
  MO: 0.195, MT: 0.2975, NE: 0.264, NV: 0.23, NH: 0.222, NJ: 0.414, NM: 0.185, NY: 0.305,
  NC: 0.382, ND: 0.23, OH: 0.385, OK: 0.19, OR: 0.38, PA: 0.576, RI: 0.34, SC: 0.26,
  SD: 0.28, TN: 0.27, TX: 0.20, UT: 0.315, VT: 0.314, VA: 0.262, WA: 0.494, WV: 0.357,
  WI: 0.309, WY: 0.24, DC: 0.235
}

function getQuarter(d) {
  const m = d.getMonth()
  return m < 3 ? 'Q1' : m < 6 ? 'Q2' : m < 9 ? 'Q3' : 'Q4'
}

export default function MobileIFTATab() {
  const ctx = useCarrier() || {}
  const { showToast } = useApp()
  const loads = ctx.loads || []
  const expenses = ctx.expenses || []
  const addExpense = ctx.addExpense || (() => {})
  const [scanning, setScanning] = useState(false)
  const receiptRef = useRef(null)
  const now = new Date()
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())
  const [selectedQuarter, setSelectedQuarter] = useState(getQuarter(now))

  // Calculate state mileage from loads (delivered loads with origin/dest state info)
  const { stateMiles, fuelCredits, summary } = useMemo(() => {
    const qStart = { Q1: 0, Q2: 3, Q3: 6, Q4: 9 }[selectedQuarter]
    const qEnd = qStart + 3
    const startDate = new Date(selectedYear, qStart, 1)
    const endDate = new Date(selectedYear, qEnd, 0, 23, 59, 59)

    // State mileage from loads — estimate pass-through states
    const sm = {}
    loads.forEach(l => {
      const loadDate = new Date(l.delivery_date || l.created_at || 0)
      if (loadDate < startDate || loadDate > endDate) return
      if (!l.miles || l.miles <= 0) return
      const originState = extractState(l.origin || '')
      const destState = extractState(l.destination || l.dest || '')
      if (!originState && !destState) return

      // If same state, all miles in that state
      if (originState === destState) {
        sm[originState] = (sm[originState] || 0) + l.miles
        return
      }

      // Estimate pass-through states using adjacency heuristic
      const passThrough = estimatePassThrough(originState, destState, l.miles)
      passThrough.forEach(({ state, miles: mi }) => {
        sm[state] = (sm[state] || 0) + mi
      })
    })

    // Fuel credits from expenses with state + gallons
    const fc = {}
    expenses.forEach(e => {
      const cat = (e.category || e.cat || '').toLowerCase()
      if (cat !== 'fuel') return
      const expDate = new Date(e.date || e.created_at || 0)
      if (expDate < startDate || expDate > endDate) return
      const state = (e.state || '').toUpperCase()
      const gallons = Number(e.gallons) || 0
      if (!state || !gallons) return
      if (!fc[state]) fc[state] = { gallons: 0, amount: 0 }
      fc[state].gallons += gallons
      fc[state].amount += Number(e.amount) || 0
    })

    // Calculate tax summary
    const totalMiles = Object.values(sm).reduce((s, m) => s + m, 0)
    const totalGallons = Object.values(fc).reduce((s, f) => s + f.gallons, 0)
    const mpg = totalGallons > 0 ? (totalMiles / totalGallons).toFixed(2) : 0

    // Net tax per state
    const allStates = new Set([...Object.keys(sm), ...Object.keys(fc)])
    let totalTaxOwed = 0
    let totalCredits = 0
    const stateDetails = []
    allStates.forEach(state => {
      const miles = sm[state] || 0
      const gallonsUsed = mpg > 0 ? miles / mpg : 0
      const gallonsPurchased = fc[state]?.gallons || 0
      const taxRate = STATE_TAX_RATES[state] || 0.25
      const taxOwed = gallonsUsed * taxRate
      const credit = gallonsPurchased * taxRate
      const net = taxOwed - credit
      totalTaxOwed += taxOwed
      totalCredits += credit
      stateDetails.push({ state, miles, gallonsUsed: +gallonsUsed.toFixed(1), gallonsPurchased, taxRate, taxOwed: +taxOwed.toFixed(2), credit: +credit.toFixed(2), net: +net.toFixed(2) })
    })
    stateDetails.sort((a, b) => b.miles - a.miles)

    return {
      stateMiles: sm,
      fuelCredits: fc,
      summary: { totalMiles, totalGallons, mpg, totalTaxOwed: +totalTaxOwed.toFixed(2), totalCredits: +totalCredits.toFixed(2), netTax: +(totalTaxOwed - totalCredits).toFixed(2), stateDetails }
    }
  }, [loads, expenses, selectedYear, selectedQuarter])

  // Handle fuel receipt scan
  const handleFuelScan = async (file) => {
    if (!file) return
    setScanning(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await apiFetch('/api/parse-receipt', { method: 'POST', body: formData })
      const data = await res.json()
      if (data.success && data.data) {
        const d = data.data
        // Auto-save as fuel expense with IFTA fields
        await addExpense({
          category: 'Fuel',
          amount: d.amount || 0,
          date: d.date || new Date().toISOString().split('T')[0],
          notes: d.notes || d.merchant || 'Fuel',
          merchant: d.merchant || '',
          gallons: d.gallons || null,
          price_per_gallon: d.price_per_gallon || null,
          state: d.state || null,
        })
        haptic('success')
        showToast?.('success', 'Fuel Receipt Added', `${d.gallons || '?'} gal in ${d.state || '??'} — ${fmt$(d.amount)}`)
      } else {
        showToast?.('error', 'Scan Failed', data.error || 'Could not read receipt')
      }
    } catch (err) {
      showToast?.('error', 'Error', err.message)
    } finally {
      setScanning(false)
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ flexShrink: 0, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700 }}>IFTA Report</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>Fuel tax calculation</div>
        </div>
        <button onClick={() => receiptRef.current?.click()} disabled={scanning}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: scanning ? 'var(--surface2)' : 'var(--success)', border: 'none', borderRadius: 10, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif" }}>
          <Ic icon={Camera} size={14} color="#000" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#000' }}>{scanning ? 'Scanning...' : 'Scan Fuel Receipt'}</span>
        </button>
        <input ref={receiptRef} type="file" accept="image/*,.pdf" capture="environment" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFuelScan(f); e.target.value = '' }} />
      </div>

      {/* Quarter selector */}
      <div style={{ flexShrink: 0, padding: '0 16px 8px', display: 'flex', gap: 6 }}>
        {['Q1', 'Q2', 'Q3', 'Q4'].map(q => (
          <button key={q} onClick={() => { haptic(); setSelectedQuarter(q) }}
            style={{ flex: 1, padding: '8px', borderRadius: 8, background: selectedQuarter === q ? 'var(--accent)' : 'var(--surface)', border: `1px solid ${selectedQuarter === q ? 'var(--accent)' : 'var(--border)'}`, color: selectedQuarter === q ? '#000' : 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s ease' }}>
            {q}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px 16px', WebkitOverflowScrolling: 'touch' }}>

        {/* Summary cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, animation: 'fadeInUp 0.3s ease' }}>
          <SummaryCard label="Total Miles" value={summary.totalMiles.toLocaleString()} color="var(--accent)" />
          <SummaryCard label="Total Gallons" value={summary.totalGallons.toFixed(0)} color="var(--accent2)" />
          <SummaryCard label="Avg MPG" value={summary.mpg} color="var(--success)" />
          <SummaryCard label="Net Tax" value={fmt$(summary.netTax)} color={summary.netTax >= 0 ? 'var(--danger)' : 'var(--success)'} />
        </div>

        {/* Tax owed vs credits */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
          <div style={{ flex: 1, padding: '10px', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>Tax Owed</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--danger)', fontFamily: "'Bebas Neue',sans-serif" }}>{fmt$(summary.totalTaxOwed)}</div>
          </div>
          <div style={{ flex: 1, padding: '10px', background: 'rgba(0,212,170,0.06)', border: '1px solid rgba(0,212,170,0.15)', borderRadius: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>Fuel Credits</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--success)', fontFamily: "'Bebas Neue',sans-serif" }}>-{fmt$(summary.totalCredits)}</div>
          </div>
        </div>

        {/* State breakdown */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', letterSpacing: 2, marginBottom: 8 }}>STATE BREAKDOWN</div>

        {summary.stateDetails.length === 0 && (
          <div style={{ textAlign: 'center', padding: '30px 20px', color: 'var(--muted)' }}>
            <Ic icon={MapPin} size={40} color="var(--border)" />
            <div style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>No IFTA data for {selectedQuarter} {selectedYear}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Complete loads and scan fuel receipts to auto-calculate</div>
          </div>
        )}

        {summary.stateDetails.map((s, index) => (
          <div key={s.state} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px', marginBottom: 6, animation: `fadeInUp 0.25s ease ${index * 0.05}s both` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--text)', fontFamily: "'Bebas Neue',sans-serif", width: 28 }}>{s.state}</span>
              <div style={{ flex: 1, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: 'var(--accent)', borderRadius: 2, width: `${Math.min(100, (s.miles / Math.max(1, summary.totalMiles)) * 100)}%`, transition: 'width 0.5s ease' }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: s.net >= 0 ? 'var(--danger)' : 'var(--success)', minWidth: 50, textAlign: 'right' }}>
                {s.net >= 0 ? '' : '-'}{fmt$(Math.abs(s.net))}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 12, fontSize: 10, color: 'var(--muted)' }}>
              <span>{s.miles.toLocaleString()} mi</span>
              <span>{s.gallonsUsed} gal used</span>
              <span>{s.gallonsPurchased} gal bought</span>
              <span>${s.taxRate}/gal tax</span>
            </div>
          </div>
        ))}

        {/* How it works */}
        <div style={{ marginTop: 16, padding: '12px 14px', background: 'rgba(240,165,0,0.06)', border: '1px solid rgba(240,165,0,0.15)', borderRadius: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', marginBottom: 6 }}>How IFTA Auto-Calculation Works</div>
          <div style={{ fontSize: 10, color: 'var(--muted)', lineHeight: 1.6 }}>
            1. Miles per state are calculated from your delivered loads{'\n'}
            2. Fuel purchased per state comes from scanned receipts{'\n'}
            3. Tax owed = (miles / avg MPG) x state tax rate{'\n'}
            4. Credits = gallons purchased x state tax rate{'\n'}
            5. Net = Tax Owed - Credits{'\n\n'}
            Scan every fuel receipt to maximize your credits!
          </div>
        </div>

        <div style={{ height: 20 }} />
      </div>
    </div>
  )
}

function SummaryCard({ label, value, color }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px', textAlign: 'center' }}>
      <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, fontFamily: "'Bebas Neue',sans-serif" }}>{value}</div>
    </div>
  )
}

// Estimate mileage through states between origin and destination
// Uses simplified state adjacency + common corridor model
function estimatePassThrough(origin, dest, totalMiles) {
  if (!origin || !dest) {
    // Only one state known — assign all miles there
    return [{ state: origin || dest, miles: totalMiles }]
  }

  // Common interstate corridors (state sequences)
  const CORRIDORS = {
    'TX-GA': ['TX', 'LA', 'MS', 'AL', 'GA'],
    'TX-FL': ['TX', 'LA', 'MS', 'AL', 'FL'],
    'TX-NC': ['TX', 'LA', 'MS', 'AL', 'GA', 'SC', 'NC'],
    'TX-TN': ['TX', 'AR', 'TN'],
    'TX-IL': ['TX', 'OK', 'MO', 'IL'],
    'TX-OH': ['TX', 'OK', 'MO', 'IL', 'IN', 'OH'],
    'TX-PA': ['TX', 'OK', 'MO', 'IL', 'IN', 'OH', 'PA'],
    'TX-NJ': ['TX', 'OK', 'MO', 'IL', 'IN', 'OH', 'PA', 'NJ'],
    'TX-NY': ['TX', 'OK', 'MO', 'IL', 'IN', 'OH', 'PA', 'NY'],
    'CA-TX': ['CA', 'AZ', 'NM', 'TX'],
    'CA-IL': ['CA', 'AZ', 'NM', 'TX', 'OK', 'MO', 'IL'],
    'CA-OH': ['CA', 'AZ', 'NM', 'TX', 'OK', 'MO', 'IL', 'IN', 'OH'],
    'CA-PA': ['CA', 'NV', 'UT', 'CO', 'KS', 'MO', 'IL', 'IN', 'OH', 'PA'],
    'CA-NY': ['CA', 'NV', 'UT', 'CO', 'KS', 'MO', 'IL', 'IN', 'OH', 'PA', 'NJ', 'NY'],
    'CA-WA': ['CA', 'OR', 'WA'],
    'CA-FL': ['CA', 'AZ', 'NM', 'TX', 'LA', 'MS', 'AL', 'FL'],
    'FL-NY': ['FL', 'GA', 'SC', 'NC', 'VA', 'MD', 'DE', 'NJ', 'NY'],
    'FL-PA': ['FL', 'GA', 'SC', 'NC', 'VA', 'MD', 'PA'],
    'FL-OH': ['FL', 'GA', 'TN', 'KY', 'OH'],
    'FL-IL': ['FL', 'GA', 'TN', 'KY', 'IN', 'IL'],
    'GA-NJ': ['GA', 'SC', 'NC', 'VA', 'MD', 'DE', 'NJ'],
    'GA-NY': ['GA', 'SC', 'NC', 'VA', 'MD', 'DE', 'NJ', 'NY'],
    'GA-OH': ['GA', 'TN', 'KY', 'OH'],
    'GA-IL': ['GA', 'TN', 'KY', 'IN', 'IL'],
    'IL-NJ': ['IL', 'IN', 'OH', 'PA', 'NJ'],
    'IL-NY': ['IL', 'IN', 'OH', 'PA', 'NY'],
    'IL-PA': ['IL', 'IN', 'OH', 'PA'],
    'OH-NJ': ['OH', 'PA', 'NJ'],
    'OH-NY': ['OH', 'PA', 'NY'],
    'PA-NJ': ['PA', 'NJ'],
    'NC-NY': ['NC', 'VA', 'MD', 'DE', 'NJ', 'NY'],
    'TN-PA': ['TN', 'VA', 'WV', 'MD', 'PA'],
  }

  // Try both directions
  const key1 = `${origin}-${dest}`
  const key2 = `${dest}-${origin}`
  let route = CORRIDORS[key1] || (CORRIDORS[key2] ? [...CORRIDORS[key2]].reverse() : null)

  if (!route) {
    // Fallback: split evenly between origin and dest (same as before but with adjacency check)
    if (totalMiles > 500 && origin !== dest) {
      // Long haul — assume at least 1 pass-through state, split 40/20/40
      return [
        { state: origin, miles: Math.round(totalMiles * 0.4) },
        { state: dest, miles: Math.round(totalMiles * 0.4) },
        // Remaining 20% unattributed — split to origin (conservative)
        { state: origin, miles: Math.round(totalMiles * 0.2) },
      ]
    }
    // Short haul — split 50/50
    return [
      { state: origin, miles: Math.round(totalMiles / 2) },
      { state: dest, miles: Math.round(totalMiles / 2) },
    ]
  }

  // Distribute miles evenly across route states
  const milesPerState = Math.round(totalMiles / route.length)
  let remaining = totalMiles
  return route.map((state, i) => {
    const mi = i === route.length - 1 ? remaining : milesPerState
    remaining -= milesPerState
    return { state, miles: mi }
  })
}

// Extract 2-letter state code from a location string like "Dallas, TX" or "Chicago, IL 60601"
function extractState(loc) {
  if (!loc) return null
  const match = loc.match(/\b([A-Z]{2})\b/)
  if (match && STATE_TAX_RATES[match[1]]) return match[1]
  // Try after comma
  const parts = loc.split(',')
  if (parts.length >= 2) {
    const stateStr = parts[parts.length - 1].trim().substring(0, 2).toUpperCase()
    if (STATE_TAX_RATES[stateStr]) return stateStr
  }
  return null
}
