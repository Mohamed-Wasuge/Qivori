import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import {
  Home, ClipboardList, Truck, Factory, Bot, FileText, DollarSign,
  UserPlus, Settings, Package, Map, MapPin, Zap, TrendingUp, Route,
  Fuel, Building2, ClipboardCheck, Radio, BarChart2, Star, Search,
  CreditCard, Plus
} from 'lucide-react'

const AppContext = createContext(null)

// ── Demo accounts (email → password + role) ───────────────────────────────
const ACCOUNTS = {
  'admin@qivori.com':  { password: 'admin123',    role: 'admin' },
  'sarah@elitelogistics.com':  { password: 'broker2024',  role: 'broker' },
  'james@rjtransport.com':    { password: 'freight2024', role: 'carrier' },
  'marcus@rjtransport.com':   { password: 'freight2024', role: 'carrier' },
}

export const ROLES = {
  admin: {
    name: 'M. Wasuge', role: 'Platform Owner', initials: 'MW',
    badge: 'role-admin', badgeText: 'ADMIN',
    nav: [
      { id: 'dashboard', icon: Home, label: 'Overview' },
      { id: 'carriers', icon: Truck, label: 'Carriers', badge: '52', badgeClass: 'green' },
      { id: 'brokers', icon: Building2, label: 'Brokers', badge: '14', badgeClass: 'blue' },
      { id: 'loadboard', icon: ClipboardList, label: 'All Loads', badge: '247', badgeClass: 'yellow' },
      { id: 'payments', icon: DollarSign, label: 'Revenue' },
      { id: 'support', icon: FileText, label: 'Support', badge: '5', badgeClass: 'yellow' },
      { id: 'settings', icon: Settings, label: 'Settings' },
    ],
    primaryBtn: '+ Invite User', topTitle: 'PLATFORM ADMIN'
  },
  broker: {
    name: 'Sarah Chen', role: 'Broker · Elite Logistics', initials: 'SC',
    badge: 'role-broker', badgeText: 'BROKER',
    nav: [
      { id: 'broker-dashboard', icon: BarChart2, label: 'Dashboard' },
      { id: 'broker-post', icon: Plus, label: 'Post a Load' },
      { id: 'broker-loads', icon: ClipboardList, label: 'My Loads', badge: '8', badgeClass: 'blue' },
      { id: 'broker-carriers', icon: Truck, label: 'Find Carriers' },
      { id: 'broker-payments', icon: DollarSign, label: 'Payments' },
      { id: 'settings', icon: Settings, label: 'Settings' },
    ],
    primaryBtn: '+ Post Load', topTitle: 'BROKER PORTAL'
  },
  carrier: {
    name: 'James Tucker', role: 'Owner-Op · MC-338821', initials: 'JT',
    badge: 'role-carrier', badgeText: 'CARRIER',
    nav: [
      { section: 'COMMAND CENTER' },
      { id: 'carrier-dashboard', icon: Zap, label: 'AI Dashboard', badge: '3', badgeClass: 'yellow' },
      { id: 'carrier-dispatch', icon: Map, label: 'Smart Dispatch', badge: '12', badgeClass: 'green' },
      { id: 'carrier-revenue', icon: TrendingUp, label: 'Revenue Intel' },
      { section: 'TMS PRO' },
      { id: 'carrier-fleet', icon: Truck, label: 'Fleet & GPS', badge: '3', badgeClass: 'green' },
      { id: 'carrier-lanes', icon: Route, label: 'Lane Intelligence' },
      { id: 'carrier-fuel', icon: Fuel, label: 'Fuel Optimizer' },
      { id: 'carrier-broker', icon: Building2, label: 'Broker Risk Intel' },
      { section: 'COMPLIANCE' },
      { id: 'carrier-dvir', icon: ClipboardCheck, label: 'DVIR' },
      { id: 'carrier-eld', icon: Radio, label: 'ELD / HOS' },
      { id: 'carrier-ifta', icon: BarChart2, label: 'IFTA' },
      { id: 'carrier-csa', icon: Star, label: 'CSA Score' },
      { id: 'carrier-clearinghouse', icon: Search, label: 'Clearinghouse' },
      { section: 'ACCOUNT' },
      { id: 'payments', icon: CreditCard, label: 'Payments & FastPay' },
      { id: 'documents', icon: FileText, label: 'Documents' },
      { id: 'settings', icon: Settings, label: 'Settings' },
    ],
    primaryBtn: 'Smart Dispatch', topTitle: 'CARRIER AI PLATFORM'
  }
}

export function AppProvider({ children }) {
  const [view, setView] = useState('landing') // 'landing' | 'login' | 'app'
  const [currentRole, setCurrentRole] = useState('admin')
  const [currentPage, setCurrentPage] = useState('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [toast, setToast]   = useState({ show: false, icon: '', title: '', sub: '' })
  const [theme, setThemeState] = useState(() => localStorage.getItem('fm_theme') || 'default')
  const toastTimer = useRef(null)

  // Apply theme class to <html> element whenever theme changes
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'default') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    localStorage.setItem('fm_theme', theme)
  }, [theme])

  const setTheme = useCallback((t) => setThemeState(t), [])

  const showToast = useCallback((icon, title, sub) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ show: true, icon, title, sub })
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3000)
  }, [])

  const login = useCallback((role) => {
    setCurrentRole(role)
    const landingPage = role === 'carrier' ? 'carrier-dashboard' : role === 'broker' ? 'broker-dashboard' : 'dashboard'
    setCurrentPage(landingPage)
    setView('app')
    const r = ROLES[role]
    showToast('', 'Welcome, ' + r.name, 'Signed in as ' + r.badgeText)
  }, [showToast])

  const loginWithCredentials = useCallback((email, password) => {
    const account = ACCOUNTS[email.toLowerCase().trim()]
    if (!account) return { error: 'No account found for that email.' }
    if (account.password !== password) return { error: 'Incorrect password.' }
    login(account.role)
    return { ok: true }
  }, [login])

  const goToLogin = useCallback(() => setView('login'), [])

  const logout = useCallback(() => {
    setView('landing')
    showToast('', 'Signed Out', 'See you next time!')
  }, [showToast])

  const navigatePage = useCallback((pageId) => {
    setCurrentPage(pageId)
    setSidebarOpen(false)
  }, [])

  const toggleSidebar = useCallback(() => setSidebarOpen(o => !o), [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  return (
    <AppContext.Provider value={{
      view, currentRole, currentPage,
      sidebarOpen, toast,
      login, loginWithCredentials, logout, goToLogin, navigatePage,
      toggleSidebar, closeSidebar, showToast,
      theme, setTheme,
      roleConfig: ROLES[currentRole]
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
