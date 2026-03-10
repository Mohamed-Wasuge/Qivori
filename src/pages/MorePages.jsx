import { useApp } from '../context/AppContext'
import { Factory, AlertTriangle, ClipboardList, Zap, DollarSign, Landmark, Phone, FileText, FolderOpen, CheckCircle, Eye, Check } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export function Shippers() {
  const { showToast } = useApp()
  const shippers = [
    { name: 'Acme Distribution Co.', sub: 'Atlanta, GA · General Freight', loads: 24, revenue: '$28,400', avg: '$3,180', ontime: '98%', otColor: 'var(--success)', pill: 'pill-green', status: 'Active', msg: ',Acme Distribution Co.,24 loads · $28,400 · 4.8 stars' },
    { name: 'FreshCo Foods Inc.', sub: 'Dallas, TX · Refrigerated', loads: 14, revenue: '$19,200', avg: '$4,720', ontime: '100%', otColor: 'var(--success)', pill: 'pill-green', status: 'Active', msg: ',FreshCo Foods Inc.,14 loads · $19,200 · Reefer specialist' },
    { name: 'SteelWorks Corp.', sub: 'Phoenix, AZ · Flatbed', loads: 8, revenue: '$12,800', avg: '$2,900', ontime: '87%', otColor: 'var(--warning)', pill: 'pill-red', status: 'Overdue', msg: ',SteelWorks Corp.,Invoice overdue $2,200 · 14 days' },
    { name: 'Rocky Mountain Farms', sub: 'Denver, CO · Reefer', loads: 6, revenue: '$8,900', avg: '$3,400', ontime: '100%', otColor: 'var(--success)', pill: 'pill-green', status: 'Active', msg: ',Rocky Mountain Farms,6 loads · $8,900 · Denver region' },
  ]
  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols3 fade-in">
        {[
          { label: 'Total Shippers', value: '38', change: '↑ 3 this month', type: 'up', color: 'var(--accent)' },
          { label: 'Active Loads Posted', value: '247', change: '↑ 18 today', type: 'up', color: 'var(--accent2)' },
          { label: 'Total Revenue', value: '$84K', change: '↑ 22% MTD', type: 'up', color: 'var(--accent3)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className={'stat-change ' + s.type}>{s.change}</div>
          </div>
        ))}
      </div>
      <div className="panel fade-in">
        <div className="panel-header">
          <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Factory} size={14} /> Shipper Accounts</div>
          <button className="btn btn-primary" onClick={() => showToast('', 'Add Shipper', 'Opening shipper registration...')}>+ Add Shipper</button>
        </div>
        <table>
          <thead><tr><th>Shipper</th><th>Loads MTD</th><th>Revenue</th><th>Avg Rate</th><th>On-Time</th><th>Status</th></tr></thead>
          <tbody>
            {shippers.map(s => (
              <tr key={s.name} onClick={() => { const [i,t,sub] = s.msg.split(','); showToast(i,t,sub) }}>
                <td><strong>{s.name}</strong><br /><span style={{ fontSize: 11, color: 'var(--muted)' }}>{s.sub}</span></td>
                <td style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, color: 'var(--accent)' }}>{s.loads}</td>
                <td className="mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>{s.revenue}</td>
                <td className="mono">{s.avg}</td>
                <td style={{ color: s.otColor, fontWeight: 700 }}>{s.ontime}</td>
                <td><span className={'pill ' + s.pill}><span className="pill-dot" />{s.status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export function Payments() {
  const { showToast } = useApp()
  const invoices = [
    { id: 'FM-4421', shipper: 'Acme Dist.', amount: '$3,200', due: 'Mar 31', pill: 'pill-yellow', status: 'Pending', btn: 'Factor', btnMsg: ',Factored!,$3,120 deposited in 24hrs (2.5% fee)' },
    { id: 'FM-4398', shipper: 'FreshCo Foods', amount: '$4,800', due: 'Mar 30', pill: 'pill-yellow', status: 'Pending', btn: 'Factor', btnMsg: ',Factored!,$4,680 deposited in 24hrs' },
    { id: 'FM-4388', shipper: 'Blue Ridge', amount: '$5,100', due: 'Mar 28', pill: 'pill-blue', status: 'Factored', btn: 'View', btnMsg: '' },
    { id: 'FM-4355', shipper: 'Midwest Goods', amount: '$1,650', due: 'Feb 27', pill: 'pill-green', status: 'Paid', btn: 'Receipt', btnMsg: '' },
    { id: 'FM-4301', shipper: 'SteelWorks', amount: '$2,200', due: 'Feb 15', pill: 'pill-red', status: 'Overdue', btn: 'Dispute', btnMsg: ',Dispute Opened,Collections process started for FM-4301', danger: true },
  ]
  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Available Balance', value: '$24.8K', change: 'Ready to pay out', type: 'neutral', color: 'var(--accent)' },
          { label: 'Pending Invoices', value: '$9.9K', change: '3 invoices', type: 'neutral', color: 'var(--warning)' },
          { label: 'Factored MTD', value: '$14.2K', change: '2.5% fee', type: 'neutral', color: 'var(--accent4)' },
          { label: 'Paid Out MTD', value: '$68K', change: '↑ 22%', type: 'up', color: 'var(--success)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className={'stat-change ' + s.type}>{s.change}</div>
          </div>
        ))}
      </div>
      <div className="grid2 fade-in">
        <div className="panel">
          <div className="panel-header">
            <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={ClipboardList} size={14} /> Invoice Ledger</div>
            <button className="btn btn-primary" onClick={() => showToast('', 'FastPay', 'Factoring all pending invoices at 2.5%')}>Factor All</button>
          </div>
          <table>
            <thead><tr><th>Load</th><th>Shipper</th><th>Amount</th><th>Due</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {invoices.map(inv => (
                <tr key={inv.id} onClick={() => showToast('', inv.id, inv.amount + ' · Due ' + inv.due)}>
                  <td className="mono" style={{ color: 'var(--accent3)', fontSize: 11 }}>{inv.id}</td>
                  <td style={{ fontSize: 12, color: inv.danger ? 'var(--danger)' : undefined }}>{inv.shipper}</td>
                  <td className="mono" style={{ fontWeight: 700, color: inv.danger ? 'var(--danger)' : undefined }}>{inv.amount}</td>
                  <td style={{ fontSize: 12, color: inv.danger ? 'var(--danger)' : 'var(--muted)' }}>{inv.due}</td>
                  <td><span className={'pill ' + inv.pill}><span className="pill-dot" />{inv.status}</span></td>
                  <td>
                    <button
                      className={'btn ' + (inv.danger ? 'btn-danger' : 'btn-ghost')}
                      style={{ padding: '4px 10px', fontSize: 11 }}
                      onClick={e => { e.stopPropagation(); if (inv.btnMsg) { const [i,t,s] = inv.btnMsg.split(','); showToast(i,t,s) } }}
                    >
                      {inv.btn}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="panel">
            <div className="panel-header">
              <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Zap} size={14} /> FastPay — Built-in Factoring</div>
              <span style={{ fontSize: 10, color: 'var(--success)', fontWeight: 700 }}>CONNECTED</span>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                {[['2.5%', 'Flat Fee', 'var(--success)'], ['24hr', 'Payment', 'var(--accent)'], ['100%', 'Advance', 'var(--accent2)'], ['$0', 'Setup', 'var(--accent3)']].map(([val, lbl, color]) => (
                  <div key={lbl} style={{ textAlign: 'center' }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700, color }}>{val}</div>
                    <div style={{ fontSize: 10, color: 'var(--muted)' }}>{lbl}</div>
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" style={{ width: '100%', padding: 12, justifyContent: 'center', display: 'flex', alignItems: 'center', gap: 8 }} onClick={() => showToast('', 'FastPay Request', 'All pending invoices being processed now · Funds in 24hrs')}>
                <Ic icon={Zap} size={14} /> Request Payout — $9,900
              </button>
            </div>
          </div>
          <div className="panel">
            <div className="panel-header"><div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={Landmark} size={14} /> Bank Account</div><button className="btn btn-ghost">+ Add</button></div>
            <div style={{ padding: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: 'var(--surface2)', borderRadius: 10, border: '1px solid rgba(240,165,0,0.2)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Ic icon={Landmark} size={24} /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>Chase Business Checking</div>
                  <div className="mono" style={{ fontSize: 11, color: 'var(--muted)' }}>•••• •••• 4821</div>
                </div>
                <div style={{ fontSize: 10, fontWeight: 700, background: 'rgba(240,165,0,0.1)', color: 'var(--accent)', padding: '3px 8px', borderRadius: 20 }}>PRIMARY</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export function Documents() {
  const { showToast } = useApp()
  const docs = [
    { name: 'BOL-2026-4421.pdf', type: 'Bill of Lading', load: 'FM-4421', when: 'Just now', conf: 68, confColor: 'var(--accent3)', pill: 'pill-blue', status: 'Processing', btn: 'View', btnMsg: '' },
    { name: 'POD-4398-signed.jpg', type: 'Proof of Delivery', load: 'FM-4398', when: '2hrs ago', conf: 97, confColor: 'var(--success)', pill: 'pill-green', status: 'Verified', btn: 'Approve', btnMsg: ',Approved,POD-4398 approved and attached to FM-4398' },
    { name: 'BOL-4355-unclear.pdf', type: 'Bill of Lading', load: 'FM-4355', when: 'Yesterday', conf: 71, confColor: 'var(--warning)', pill: 'pill-yellow', status: 'Review', btn: 'Review', btnPrimary: true, btnMsg: ',Review,Opening BOL-4355 for manual review...' },
    { name: 'MC-Auth-RJTransport.pdf', type: 'MC Authority', load: 'Carrier Doc', when: 'Mar 1', conf: 99, confColor: 'var(--success)', pill: 'pill-green', status: 'Verified', btn: 'View', btnMsg: '' },
  ]
  return (
    <div style={{ padding: 20, overflowY: 'auto', height: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="stats-grid cols4 fade-in">
        {[
          { label: 'Docs Processed', value: '142', change: 'Today: 8', type: 'up', color: 'var(--accent)' },
          { label: 'AI Accuracy', value: '98.2%', change: '↑ 0.3%', type: 'up', color: 'var(--success)' },
          { label: 'Avg Process Time', value: '8s', change: 'Per document', type: 'neutral', color: 'var(--accent2)' },
          { label: 'Needs Review', value: '3', change: 'Action needed', type: 'down', color: 'var(--warning)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="stat-label">{s.label}</div>
            <div className="stat-value" style={{ color: s.color }}>{s.value}</div>
            <div className={'stat-change ' + s.type}>{s.change}</div>
          </div>
        ))}
      </div>
      <div className="panel fade-in">
        <div className="panel-header">
          <div className="panel-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Ic icon={FileText} size={14} /> Document Queue</div>
          <button className="btn btn-primary" onClick={() => showToast('', 'Upload', 'Drag & drop or click to upload BOL, POD, Rate Con...')}>+ Upload Doc</button>
        </div>
        <table>
          <thead><tr><th>Document</th><th>Type</th><th>Load</th><th>Uploaded</th><th>AI Confidence</th><th>Status</th><th>Action</th></tr></thead>
          <tbody>
            {docs.map(d => (
              <tr key={d.name} onClick={() => showToast('', d.name, d.type + ' · ' + d.load)}>
                <td><strong>{d.name}</strong></td>
                <td style={{ fontSize: 12 }}>{d.type}</td>
                <td className="mono" style={{ color: 'var(--accent3)', fontSize: 11 }}>{d.load}</td>
                <td style={{ fontSize: 11, color: 'var(--muted)' }}>{d.when}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 60, height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                      <div style={{ width: d.conf + '%', height: '100%', background: d.confColor, borderRadius: 2 }} />
                    </div>
                    <span className="mono" style={{ fontSize: 11, color: d.confColor }}>{d.conf}%</span>
                  </div>
                </td>
                <td><span className={'pill ' + d.pill}><span className="pill-dot" />{d.status}</span></td>
                <td>
                  <button
                    className={'btn ' + (d.btnPrimary ? 'btn-primary' : 'btn-ghost')}
                    style={{ padding: '4px 10px', fontSize: 11 }}
                    onClick={e => { e.stopPropagation(); if (d.btnMsg) { const [i,t,s] = d.btnMsg.split(','); showToast(i,t,s) } }}
                  >
                    {d.btn}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
