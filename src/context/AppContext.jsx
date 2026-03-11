import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  Home, ClipboardList, Truck, Factory, Bot, FileText, DollarSign,
  UserPlus, Settings, Package, Map, MapPin, Zap, TrendingUp, Route,
  Fuel, Building2, ClipboardCheck, Radio, BarChart2, Star, Search,
  CreditCard, Plus
} from 'lucide-react'

const AppContext = createContext(null)

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
    name: 'Broker', role: 'Broker', initials: 'BR',
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
    name: 'Carrier', role: 'Owner-Operator', initials: 'CR',
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
  const [toast, setToast] = useState({ show: false, icon: '', title: '', sub: '' })
  const [theme, setThemeState] = useState(() => localStorage.getItem('fm_theme') || 'default')
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const toastTimer = useRef(null)

  // Apply theme class
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'default') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    localStorage.setItem('fm_theme', theme)
  }, [theme])

  // Fetch user profile from Supabase
  const fetchProfile = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) {
      setProfile(data)
      return data
    }
    return null
  }, [])

  // Listen for auth state changes
  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        const prof = await fetchProfile(session.user.id)
        if (prof) {
          const role = prof.role || 'carrier'
          setCurrentRole(role)
          const landingPage = role === 'carrier' ? 'carrier-dashboard' : role === 'broker' ? 'broker-dashboard' : 'dashboard'
          setCurrentPage(landingPage)
          setView('app')
        }
      }
      setAuthLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        const prof = await fetchProfile(session.user.id)
        if (prof) {
          const role = prof.role || 'carrier'
          setCurrentRole(role)
          const landingPage = role === 'carrier' ? 'carrier-dashboard' : role === 'broker' ? 'broker-dashboard' : 'dashboard'
          setCurrentPage(landingPage)
          setView('app')
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        setView('landing')
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  const setTheme = useCallback((t) => setThemeState(t), [])

  const showToast = useCallback((icon, title, sub) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ show: true, icon, title, sub })
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 3000)
  }, [])

  // Sign in with Supabase
  const loginWithCredentials = useCallback(async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: error.message }

    const prof = await fetchProfile(data.user.id)
    if (!prof) return { error: 'Account found but no profile. Contact support.' }

    const role = prof.role || 'carrier'
    setCurrentRole(role)
    const landingPage = role === 'carrier' ? 'carrier-dashboard' : role === 'broker' ? 'broker-dashboard' : 'dashboard'
    setCurrentPage(landingPage)
    setView('app')
    setUser(data.user)

    // Build display name from profile
    const displayName = prof.full_name || prof.company_name || email.split('@')[0]
    const roleConfig = ROLES[role]
    showToast('', 'Welcome, ' + displayName, 'Signed in as ' + roleConfig.badgeText)
    return { ok: true }
  }, [fetchProfile, showToast])

  // Sign up with Supabase
  const signUp = useCallback(async (email, password, role, fullName, companyName) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { error: error.message }

    // Create profile row
    if (data.user) {
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        role,
        full_name: fullName,
        company_name: companyName,
        status: 'pending',
      })
      if (profileError) console.error('Profile creation error:', profileError)
    }

    return { ok: true, needsConfirmation: !data.session }
  }, [])

  // Password reset
  const resetPassword = useCallback(async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + '/?reset=true',
    })
    if (error) return { error: error.message }
    return { ok: true }
  }, [])

  // Logout with Supabase
  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setView('landing')
    showToast('', 'Signed Out', 'See you next time!')
  }, [showToast])

  const goToLogin = useCallback(() => setView('login'), [])

  const navigatePage = useCallback((pageId) => {
    setCurrentPage(pageId)
    setSidebarOpen(false)
  }, [])

  const toggleSidebar = useCallback(() => setSidebarOpen(o => !o), [])
  const closeSidebar = useCallback(() => setSidebarOpen(false), [])

  // Build dynamic roleConfig with profile data
  const roleConfig = { ...ROLES[currentRole] }
  if (profile) {
    if (profile.full_name) {
      const parts = profile.full_name.split(' ')
      roleConfig.name = profile.full_name
      roleConfig.initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2)
    }
    if (profile.company_name) {
      roleConfig.role = currentRole === 'admin' ? 'Platform Owner'
        : currentRole === 'broker' ? `Broker · ${profile.company_name}`
        : `Owner-Op · ${profile.company_name}`
    }
  }

  return (
    <AppContext.Provider value={{
      view, currentRole, currentPage,
      sidebarOpen, toast,
      user, profile, authLoading,
      loginWithCredentials, signUp, resetPassword, logout, goToLogin, navigatePage,
      toggleSidebar, closeSidebar, showToast,
      theme, setTheme,
      roleConfig
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
