import { useApp } from '../../context/AppContext'

export function AIEngine() {
  const { navigatePage } = useApp()
  return (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: 'var(--muted)' }}>AI engine settings have moved to platform Settings.</div>
      <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigatePage('settings')}>Go to Settings →</button>
    </div>
  )
}
