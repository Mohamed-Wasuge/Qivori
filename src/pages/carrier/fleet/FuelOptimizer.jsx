import { useState } from 'react'
import { Ic, S, StatCard } from '../shared'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import { Fuel, TrendingDown, BarChart2, Bot } from 'lucide-react'

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
                <div style={{ textAlign:'center', color:'var(--muted)', fontSize:13, padding:16 }}>No trucks added yet.</div>
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
