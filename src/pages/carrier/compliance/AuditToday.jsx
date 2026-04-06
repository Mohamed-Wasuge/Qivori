import React, { useState, useMemo, useEffect } from 'react'
import { useApp } from '../../../context/AppContext'
import { useCarrier } from '../../../context/CarrierContext'
import {
  User, FlaskConical, AlertTriangle, Shield,
  Activity, FileCheck, Clock, CheckCircle,
  RefreshCw, Siren, AlertCircle, Wrench, Truck,
} from 'lucide-react'
import * as db from '../../../lib/database'
import DOTAuditExport from './DOTAuditExport'

// ─── AUDIT TODAY ─────────────────────────────────────────────────────────────
// "What fails audit today?" — real-time compliance failure scanner
// Uses shared compliance validation service (src/lib/compliance.js)
export function AuditToday() {
  const { drivers: ctxDrivers, vehicles: ctxVehicles } = useCarrier()
  const { showToast } = useApp()
  const [loading, setLoading] = useState(true)
  const [dvirHistory, setDvirHistory] = useState([])
  const [chOrders, setChOrders] = useState([])
  const [hosLogs, setHosLogs] = useState([])
  const [settings, setSettings] = useState(null)
  const [filter, setFilter] = useState('all') // all | critical | warning | driver | vehicle
  const [validateFleet, setValidateFleet] = useState(null)

  useEffect(() => {
    Promise.all([
      db.fetchDVIRs().catch(() => []),
      db.fetchClearinghouseQueries().catch(() => []),
      db.fetchHOSLogs().catch(() => []),
      db.fetchCarrierSettings().catch(() => null),
      import('../../../lib/compliance').then(m => m.validateFleet),
    ]).then(([dvirs, ch, hos, s, vf]) => {
      setDvirHistory(dvirs || [])
      setChOrders(ch || [])
      setHosLogs(hos || [])
      setSettings(s)
      setValidateFleet(() => vf)
      setLoading(false)
    })
  }, [])

  // Build comprehensive failure list using shared compliance service
  const { failures, warnings, stats } = useMemo(() => {
    if (!validateFleet) return { failures: [], warnings: [], stats: { critCount: 0, warnCount: 0, total: 0, driverFails: 0, vehicleFails: 0, driverCount: 0, vehicleCount: 0 } }

    const result = validateFleet(ctxDrivers || [], ctxVehicles || [], {
      clearinghouseOrders: chOrders,
      hosLogs,
      dvirHistory,
      settings,
    })

    // Map service output to UI format (fail→critical, warn/info→warning for display)
    const uiFailures = result.failures.map(c => ({ ...c, type: 'critical' }))
    const uiWarnings = result.warnings.map(c => ({ ...c, type: c.status === 'info' ? 'info' : 'warning' }))

    return { failures: uiFailures, warnings: uiWarnings, stats: result.stats }
  }, [ctxDrivers, ctxVehicles, dvirHistory, chOrders, hosLogs, validateFleet, settings])

  const allItems = [...failures, ...warnings]
  const filtered = filter === 'all' ? allItems
    : filter === 'critical' ? failures
    : filter === 'warning' ? warnings
    : filter === 'driver' ? allItems.filter(i => i.category === 'driver')
    : filter === 'vehicle' ? allItems.filter(i => i.category === 'vehicle')
    : allItems

  const iconMap = {
    'id-card': User, medical: Activity, substance: FlaskConical, hos: Clock,
    dvir: FileCheck, status: AlertTriangle, inspection: Wrench, registration: Truck,
    insurance: Shield, oos: Siren,
  }

  const typeColors = {
    critical: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', dot: '#ef4444', text: '#fca5a5' },
    warning: { bg: 'rgba(245,158,11,0.08)', border: 'rgba(245,158,11,0.25)', dot: '#f59e0b', text: '#fcd34d' },
    info: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.25)', dot: '#3b82f6', text: '#93c5fd' },
  }

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center', color: 'var(--muted)' }}>
        <RefreshCw size={24} style={{ animation: 'spin 1s linear infinite' }} />
        <div style={{ marginTop: 12, fontSize: 13 }}>Scanning compliance across all drivers and vehicles...</div>
        <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  return (
    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, fontFamily: "'DM Sans',sans-serif", color: 'var(--text)' }}>
            What Fails Audit Today?
          </h2>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
            Real-time DOT/FMCSA compliance scan — {stats.driverCount} driver{stats.driverCount !== 1 ? 's' : ''}, {stats.vehicleCount} vehicle{stats.vehicleCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, fontSize: 12 }}>
          <div style={{ background: stats.critCount > 0 ? 'rgba(239,68,68,0.12)' : stats.warnCount > 0 ? 'rgba(245,158,11,0.12)' : 'rgba(34,197,94,0.12)', border: `1px solid ${stats.critCount > 0 ? 'rgba(239,68,68,0.3)' : stats.warnCount > 0 ? 'rgba(245,158,11,0.3)' : 'rgba(34,197,94,0.3)'}`, borderRadius: 10, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: stats.critCount > 0 ? '#ef4444' : stats.warnCount > 0 ? '#f59e0b' : '#22c55e' }} />
            <span style={{ color: stats.critCount > 0 ? '#fca5a5' : stats.warnCount > 0 ? '#fcd34d' : '#86efac' }}>{stats.critCount > 0 ? `${stats.critCount} Critical` : stats.warnCount > 0 ? 'No Failures' : 'All Clear'}</span>
          </div>
          {stats.warnCount > 0 && (
            <div style={{ background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 10, padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} />
              <span style={{ color: '#fcd34d' }}>{stats.warnCount} Warning{stats.warnCount !== 1 ? 's' : ''}</span>
            </div>
          )}
        </div>
      </div>

      {/* Readiness Banner */}
      <div style={{
        background: stats.critCount > 0
          ? 'linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(239,68,68,0.02) 100%)'
          : stats.warnCount > 0
          ? 'linear-gradient(135deg, rgba(245,158,11,0.08) 0%, rgba(245,158,11,0.02) 100%)'
          : 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.02) 100%)',
        border: `1px solid ${stats.critCount > 0 ? 'rgba(239,68,68,0.2)' : stats.warnCount > 0 ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)'}`,
        borderRadius: 14, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14,
      }}>
        {stats.critCount > 0 ? (
          <AlertTriangle size={28} color="#ef4444" />
        ) : stats.warnCount > 0 ? (
          <AlertTriangle size={28} color="#f59e0b" />
        ) : (
          <CheckCircle size={28} color="#22c55e" />
        )}
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', fontFamily: "'DM Sans',sans-serif" }}>
            {stats.critCount > 0
              ? `${stats.critCount} Compliance Failure${stats.critCount !== 1 ? 's' : ''} — Not Audit Ready`
              : stats.warnCount > 0
              ? `Audit Ready — ${stats.warnCount} Warning${stats.warnCount !== 1 ? 's' : ''} to Review`
              : 'Audit Ready — All Clear'}
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
            {stats.critCount > 0
              ? `${stats.driverFails} driver issue${stats.driverFails !== 1 ? 's' : ''}, ${stats.vehicleFails} vehicle issue${stats.vehicleFails !== 1 ? 's' : ''} must be resolved before operating. These will flag in a DOT audit or roadside inspection.`
              : stats.warnCount > 0
              ? `No critical failures — you would pass a DOT audit. However, ${stats.warnCount} item${stats.warnCount !== 1 ? 's' : ''} need${stats.warnCount === 1 ? 's' : ''} attention to stay fully compliant.`
              : 'All drivers and vehicles pass DOT/FMCSA compliance checks. You are clear for any roadside inspection or audit.'}
          </div>
        </div>
      </div>

      {/* DOT Audit Package Export */}
      <DOTAuditExport />

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {[
          { id: 'all', label: `All (${allItems.length})` },
          { id: 'critical', label: `Critical (${stats.critCount})` },
          { id: 'warning', label: `Warnings (${stats.warnCount})` },
          { id: 'driver', label: `Drivers (${allItems.filter(i => i.category === 'driver').length})` },
          { id: 'vehicle', label: `Vehicles (${allItems.filter(i => i.category === 'vehicle').length})` },
        ].map(f => (
          <button key={f.id} onClick={() => setFilter(f.id)}
            style={{
              padding: '6px 14px', borderRadius: 8, fontSize: 11, fontWeight: filter === f.id ? 700 : 500,
              border: `1px solid ${filter === f.id ? 'var(--accent)' : 'var(--border)'}`,
              background: filter === f.id ? 'rgba(240,165,0,0.1)' : 'transparent',
              color: filter === f.id ? 'var(--accent)' : 'var(--muted)',
              cursor: 'pointer', fontFamily: "'DM Sans',sans-serif", transition: 'all 0.15s',
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--muted)' }}>
          <CheckCircle size={36} color="var(--success)" style={{ marginBottom: 12 }} />
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>No Issues Found</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {filter === 'all' ? 'All drivers and vehicles are compliant.' : `No ${filter} issues found.`}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((item, i) => {
            const colors = typeColors[item.type] || typeColors.info
            const Ico = iconMap[item.icon] || AlertCircle
            return (
              <div key={i} style={{
                background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 12,
                padding: '14px 16px', display: 'flex', gap: 14, alignItems: 'flex-start',
                transition: 'transform 0.1s', cursor: 'default',
              }}>
                {/* Severity dot + icon */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, paddingTop: 2 }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: `${colors.dot}15`, border: `1px solid ${colors.dot}30`,
                  }}>
                    <Ico size={15} color={colors.dot} />
                  </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', fontFamily: "'DM Sans',sans-serif" }}>
                      {item.label}
                    </span>
                    <span style={{
                      fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 8px', borderRadius: 6,
                      background: `${colors.dot}20`, color: colors.text, letterSpacing: '0.05em',
                    }}>
                      {item.type}
                    </span>
                    {item.dotRef && (
                      <span style={{ fontSize: 10, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                        {item.dotRef}
                      </span>
                    )}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{item.entity}</span> — {item.detail}
                  </div>

                  <div style={{
                    fontSize: 11, color: colors.text, marginTop: 6, padding: '6px 10px',
                    background: `${colors.dot}08`, borderRadius: 8, borderLeft: `3px solid ${colors.dot}`,
                    fontStyle: 'italic',
                  }}>
                    {item.action}
                  </div>
                </div>

                {/* Category badge */}
                <div style={{
                  fontSize: 10, fontWeight: 600, textTransform: 'uppercase', padding: '4px 10px',
                  borderRadius: 6, background: 'var(--surface)', border: '1px solid var(--border)',
                  color: 'var(--muted)', whiteSpace: 'nowrap', flexShrink: 0,
                }}>
                  {item.category === 'driver' ? '👤 Driver' : '🚛 Vehicle'}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Enforcement settings note */}
      {settings && settings.enforce_compliance && (
        <div style={{
          background: 'rgba(168,85,247,0.06)', border: '1px solid rgba(168,85,247,0.15)',
          borderRadius: 12, padding: '12px 16px', fontSize: 11, color: 'var(--muted)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <Shield size={14} color="#a855f7" />
          <span>
            <strong style={{ color: '#c084fc' }}>Dispatch Enforcement Active</strong> — Critical failures automatically block driver assignment in the AI dispatch engine.
            {settings.block_expired_cdl && ' Expired CDL blocked.'}
            {settings.block_expired_medical && ' Expired medical blocked.'}
            {settings.block_failed_drug_test && ' Failed drug tests blocked.'}
            {settings.block_active_defects && ' Active defects blocked.'}
            {settings.block_expired_insurance && ' Expired insurance blocked.'}
          </span>
        </div>
      )}

      {/* Summary footer */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 4,
      }}>
        {[
          { label: 'CDL Status', value: failures.some(f => f.icon === 'id-card') ? 'FAIL' : 'PASS', fail: failures.some(f => f.icon === 'id-card') },
          { label: 'Medical Cards', value: failures.some(f => f.icon === 'medical') ? 'FAIL' : 'PASS', fail: failures.some(f => f.icon === 'medical') },
          { label: 'Drug & Alcohol', value: failures.some(f => f.icon === 'substance') ? 'FAIL' : 'PASS', fail: failures.some(f => f.icon === 'substance') },
          { label: 'HOS / ELD', value: failures.some(f => f.icon === 'hos') ? 'FAIL' : 'PASS', fail: failures.some(f => f.icon === 'hos') },
          { label: 'DVIR', value: failures.some(f => f.icon === 'dvir') ? 'FAIL' : 'PASS', fail: failures.some(f => f.icon === 'dvir') },
          { label: 'Insurance', value: failures.some(f => f.icon === 'insurance') ? 'FAIL' : 'PASS', fail: failures.some(f => f.icon === 'insurance') },
          { label: 'Annual Inspection', value: failures.some(f => f.icon === 'inspection') ? 'FAIL' : 'PASS', fail: failures.some(f => f.icon === 'inspection') },
          { label: 'Vehicle Status', value: failures.some(f => f.category === 'vehicle') ? 'FAIL' : 'PASS', fail: failures.some(f => f.category === 'vehicle') },
        ].map(s => (
          <div key={s.label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
            padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 500 }}>{s.label}</span>
            <span style={{
              fontSize: 11, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace",
              color: s.fail ? '#ef4444' : '#22c55e',
            }}>
              {s.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
