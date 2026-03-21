import React from 'react'

export const Ic = ({ icon: Icon, size = 16, color, style, ...props }) => <Icon size={size} color={color} style={style} {...props} />

export function HubTabBar({ tabs, active, onChange }) {
  return (
    <div style={{ flexShrink:0, display:'flex', gap:2, padding:'0 20px', background:'var(--surface)', borderBottom:'1px solid var(--border)', overflowX:'auto' }}>
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          style={{ padding:'10px 16px', border:'none', borderBottom: active===t.id ? '2px solid var(--accent)' : '2px solid transparent',
            background:'transparent', color: active===t.id ? 'var(--accent)' : 'var(--muted)',
            fontSize:12, fontWeight: active===t.id ? 700 : 500, cursor:'pointer', fontFamily:"'DM Sans',sans-serif",
            marginBottom:-1, whiteSpace:'nowrap' }}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
