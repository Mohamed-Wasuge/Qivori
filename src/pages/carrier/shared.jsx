import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { BarChart2, Flame, Target, DollarSign, AlertTriangle, CheckCircle, Clock, MapPin, Wrench, FileText, Phone, Package, Truck, Users, CreditCard, Receipt, Zap, Bot, Star, Activity, Search, Shield, Bell, Wallet, Map, Droplets, FileCheck, ShieldCheck, AlertCircle, User, UserPlus, Briefcase, Settings, Layers, Eye, Download, Upload, Send, Check, ChevronRight, Plus, Filter, Calendar, Hash, Gauge, Radio, TrendingUp, TrendingDown, MessageCircle, Flag, Square, Edit3 as PencilIcon, Moon, Lightbulb, Cpu, Fuel, Route, Navigation, CircleDot, Bookmark, MailOpen, Inbox, Building2, FlaskConical, Sparkles, Trophy, ArrowRight, RefreshCw, Brain, Construction, Snowflake, TrafficCone, BellOff, Banknote, Archive, Paperclip, HardDrive, Siren, Dumbbell, GraduationCap, Dice5, Plug, Heart, Pill, Beer, Bomb, Save, Trash2 } from 'lucide-react'
import { useApp } from '../../context/AppContext'
import { useCarrier } from '../../context/CarrierContext'
import { generateInvoicePDF, generateSettlementPDF, generateIFTAPDF } from '../../utils/generatePDF'
import { apiFetch } from '../../lib/api'
import { useTranslation } from '../../lib/i18n'

const Ic = ({ icon: Icon, size = 14, ...p }) => <Icon size={size} {...p} />

const S = {
  page: { padding: 20, paddingBottom: 60, overflowY: 'auto', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 16 },
  panel: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 },
  panelHead: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' },
  panelTitle: { fontSize: 13, fontWeight: 700 },
  panelBody: { padding: 16 },
  grid: (n) => ({ display: 'grid', gridTemplateColumns: `repeat(${n},1fr)`, gap: 12 }),
  stat: (color = 'var(--accent)') => ({
    background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '14px 16px', textAlign: 'center',
  }),
  badge: (color) => ({
    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
    background: color + '15', color, border: '1px solid ' + color + '30',
    display: 'inline-block'
  }),
  row: { display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' },
  tag: (color) => ({ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: color + '15', color }),
}

function StatCard({ label, value, change, color = 'var(--accent)', changeType = 'up' }) {
  return (
    <div style={S.stat()}>
      <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6, fontWeight: 600 }}>{label}</div>
      <div style={{ fontFamily: "'Bebas Neue',sans-serif", fontSize: 30, color, letterSpacing: 1 }}>{value}</div>
      {change && <div style={{ fontSize: 11, color: changeType === 'up' ? 'var(--success)' : changeType === 'down' ? 'var(--danger)' : 'var(--muted)', marginTop: 4 }}>{change}</div>}
    </div>
  )
}

function AiBanner({ title, sub, action, onAction }) {
  return (
    <div style={{ background: 'linear-gradient(135deg,rgba(240,165,0,0.08),rgba(0,212,170,0.06))', border: '1px solid rgba(240,165,0,0.2)', borderRadius: 12, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 14 }}>
      <div style={{ fontSize: 22, animation: 'pulse 2s infinite' }}><Bot size={22} /></div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)' }}>{sub}</div>
      </div>
      {action && <button className="btn btn-primary" onClick={onAction}>{action}</button>}
    </div>
  )
}

export { React, useState, useMemo, useEffect, useRef, useCallback }
export { Ic, S, StatCard, AiBanner }
export { useApp, useCarrier, generateInvoicePDF, generateSettlementPDF, generateIFTAPDF, apiFetch, useTranslation }
export { BarChart2, Flame, Target, DollarSign, AlertTriangle, CheckCircle, Clock, MapPin, Wrench, FileText, Phone, Package, Truck, Users, CreditCard, Receipt, Zap, Bot, Star, Activity, Search, Shield, Bell, Wallet, Map, Droplets, FileCheck, ShieldCheck, AlertCircle, User, UserPlus, Briefcase, Settings, Layers, Eye, Download, Upload, Send, Check, ChevronRight, Plus, Filter, Calendar, Hash, Gauge, Radio, TrendingUp, TrendingDown, MessageCircle, Flag, Square, PencilIcon, Moon, Lightbulb, Cpu, Fuel, Route, Navigation, CircleDot, Bookmark, MailOpen, Inbox, Building2, FlaskConical, Sparkles, Trophy, ArrowRight, RefreshCw, Brain, Construction, Snowflake, TrafficCone, BellOff, Banknote, Archive, Paperclip, HardDrive, Siren, Dumbbell, GraduationCap, Dice5, Plug, Heart, Pill, Beer, Bomb, Save, Trash2 } from 'lucide-react'
