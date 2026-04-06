import React, { useState, useMemo } from 'react'
import { S } from '../shared'
import { useCarrier } from '../../../context/CarrierContext'
import { Check } from 'lucide-react'

export function DriverPayReport() {
  const { loads } = useCarrier()
  const [payRate, setPayRate] = useState(50)
  const [approved, setApproved] = useState({})

  const drivers = useMemo(() => {
    const map = {}
    loads.forEach(l => {
      if (!l.driver) return
      if (!map[l.driver]) map[l.driver] = { name:l.driver, loads:[], totalGross:0, totalMiles:0 }
      map[l.driver].loads.push(l)
      map[l.driver].totalGross += l.gross || 0
      map[l.driver].totalMiles += l.miles || 0
    })
    return Object.values(map).map(d => ({
      ...d,
      totalPay: d.totalGross * (payRate / 100),
      payPerMile: d.totalMiles > 0 ? (d.totalGross * (payRate/100) / d.totalMiles).toFixed(2) : '0.00',
    })).sort((a,b) => b.totalGross - a.totalGross)
  }, [loads, payRate])

  const totalPayroll = drivers.reduce((s,d) => s+d.totalPay, 0)

  return (
    <div style={{ ...S.page, paddingBottom:40 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
        <div>
          <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, letterSpacing:2 }}>DRIVER PAY REPORT</div>
          <div style={{ fontSize:12, color:'var(--muted)' }}>Per-driver settlement calculations — approve and export</div>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:12, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'10px 16px' }}>
          <span style={{ fontSize:12, color:'var(--muted)' }}>Pay Rate</span>
          <input type="range" min={20} max={60} value={payRate} onChange={e => setPayRate(Number(e.target.value))}
            style={{ width:100, accentColor:'var(--accent)' }} />
          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:22, color:'var(--accent)', minWidth:40 }}>{payRate}%</span>
        </div>
      </div>

      <div style={S.grid(3)}>
        {[
          { label:'TOTAL PAYROLL', val:`$${totalPayroll.toLocaleString(undefined,{maximumFractionDigits:0})}`, color:'var(--accent)' },
          { label:'DRIVERS', val:String(drivers.length), color:'var(--accent3)' },
          { label:'PAY RATE', val:`${payRate}% of gross`, color:'var(--success)' },
        ].map(k => (
          <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'16px 20px' }}>
            <div style={{ fontSize:11, color:'var(--muted)', textTransform:'uppercase', letterSpacing:0.5, marginBottom:6 }}>{k.label}</div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:30, color:k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {drivers.map(d => (
        <div key={d.name} style={S.panel}>
          <div style={S.panelHead}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <div style={{ width:40, height:40, borderRadius:'50%', background:'var(--surface3)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:700, fontSize:14 }}>
                {d.name.split(' ').map(n=>n[0]).join('')}
              </div>
              <div>
                <div style={{ fontWeight:700 }}>{d.name}</div>
                <div style={{ fontSize:11, color:'var(--muted)' }}>{d.loads.length} loads · {d.totalMiles.toLocaleString()} mi</div>
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:26, color:'var(--accent)' }}>${d.totalPay.toLocaleString(undefined,{maximumFractionDigits:0})}</div>
                <div style={{ fontSize:10, color:'var(--muted)' }}>settlement amount</div>
              </div>
              <button onClick={() => setApproved(prev => ({ ...prev, [d.name]: !prev[d.name] }))}
                style={{ padding:'8px 16px', fontSize:12, fontWeight:700, borderRadius:8, border:'none', cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
                  background: approved[d.name] ? 'rgba(34,197,94,0.15)' : 'var(--accent)',
                  color: approved[d.name] ? 'var(--success)' : '#000' }}>
                {approved[d.name] ? <><Check size={11} /> Approved</> : 'Approve Pay'}
              </button>
            </div>
          </div>
          <table>
            <thead><tr>{['Load ID','Route','Gross','Miles','RPM','Driver Pay'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>
              {d.loads.map(l => (
                <tr key={l.id}>
                  <td><span style={{ fontFamily:'monospace', fontSize:12 }}>{l.loadId}</span></td>
                  <td style={{ fontSize:12 }}>{(l.origin||'').split(',')[0]} → {(l.dest||'').split(',')[0]}</td>
                  <td><span style={{ color:'var(--accent)', fontWeight:700 }}>${(l.gross||0).toLocaleString()}</span></td>
                  <td style={{ fontSize:12 }}>{(l.miles||0).toLocaleString()}</td>
                  <td style={{ fontSize:12, color:'var(--accent3)' }}>${(l.rate||0).toFixed(2)}/mi</td>
                  <td><span style={{ color:'var(--success)', fontWeight:700 }}>${((l.gross||0)*payRate/100).toLocaleString(undefined,{maximumFractionDigits:0})}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
