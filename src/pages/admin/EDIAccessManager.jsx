import { useState, useEffect } from 'react'
import { useApp } from '../../context/AppContext'
import { apiFetch } from '../../lib/api'
import { RefreshCw } from 'lucide-react'

const Ic = ({ icon: Icon, size = 16, ...p }) => <Icon size={size} {...p} />

export function EDIAccessManager() {
  const { showToast } = useApp()
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchRequests = async () => {
    setLoading(true)
    try {
      const res = await (await apiFetch('/api/edi/request-access')).json()
      setRequests(res.requests || [])
    } catch { setRequests([]) }
    setLoading(false)
  }

  useEffect(() => { fetchRequests() }, [])

  const handleAction = async (carrierId, action, reason) => {
    try {
      const res = await (await apiFetch('/api/edi/request-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, carrier_id: carrierId, reason }),
      })).json()
      if (res.success) {
        showToast('', action === 'approve' ? 'EDI Approved' : 'EDI Denied', `Carrier ${action}d — ${action === 'approve' ? 'credentials generated and emailed' : 'notification sent'}`)
        fetchRequests()
      }
    } catch {
      showToast('', 'Error', 'Action failed')
    }
  }

  const statusColors = { pending: '#f0a500', approved: '#22c55e', denied: '#ef4444' }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 24, letterSpacing: 2, margin: 0 }}>EDI ACCESS REQUESTS</h1>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Approve carriers for EDI integration ($1,500 setup fee)</div>
        </div>
        <button onClick={fetchRequests} style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
          <Ic icon={RefreshCw} size={12} /> Refresh
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>Loading...</div>
        ) : requests.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280', fontSize: 12 }}>No EDI access requests yet</div>
        ) : requests.map(r => (
          <div key={r.id} style={{ padding: '14px 18px', borderBottom: '1px solid #f3f4f6', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColors[r.status] || '#6b7280', flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{r.carrier_name || r.carrier_email}</div>
              <div style={{ fontSize: 11, color: '#6b7280' }}>
                {r.mc_number || '—'} · {r.carrier_email} · {r.carrier_phone || '—'} · ${r.setup_fee} fee
              </div>
              <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>
                Requested: {new Date(r.created_at).toLocaleDateString()}
                {r.approved_at && ` · Approved: ${new Date(r.approved_at).toLocaleDateString()}`}
              </div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: (statusColors[r.status] || '#6b7280') + '15', color: statusColors[r.status] || '#6b7280', textTransform: 'uppercase' }}>{r.status}</span>
            {r.status === 'pending' && (
              <div style={{ display: 'flex', gap: 6 }}>
                <button onClick={() => handleAction(r.carrier_id, 'approve')}
                  style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#22c55e', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  Approve
                </button>
                <button onClick={() => handleAction(r.carrier_id, 'deny', 'Payment not confirmed')}
                  style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#ef4444', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                  Deny
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
