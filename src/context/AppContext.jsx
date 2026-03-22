import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'
import { trackSignup, trackLogin, trackSessionStart } from '../lib/analytics'
import { recordStep } from '../lib/conversion-funnel'
import {
  Home, ClipboardList, Truck, Factory, Bot, FileText, DollarSign,
  UserPlus, Settings, Package, Map, MapPin, Zap, TrendingUp, Route,
  Fuel, Building2, ClipboardCheck, Radio, BarChart2, Star, Search,
  CreditCard, Plus, Users, Shield, Activity, Monitor, Mail
} from 'lucide-react'

const AppContext = createContext(null)

// ── Company role constants ────────────────────────────────────
const COMPANY_ROLES = ['owner', 'admin', 'dispatcher', 'driver']

export const ROLES = {
  admin: {
    name: 'Admin', role: 'Platform Owner', initials: 'QV',
    badge: 'role-admin', badgeText: 'ADMIN',
    nav: [
      { id: 'dashboard', icon: Home, label: 'Overview' },
      { id: 'carriers', icon: Users, label: 'Users' },
      { id: 'brokers', icon: Building2, label: 'Brokers' },
      { id: 'loadboard', icon: ClipboardList, label: 'All Loads' },
      { id: 'payments', icon: DollarSign, label: 'Revenue' },
      { id: 'support', icon: FileText, label: 'Support' },
      { id: 'waitlist', icon: UserPlus, label: 'Waitlist' },
      { id: 'demo-requests', icon: Monitor, label: 'Demo Requests' },
      { id: 'admin-email', icon: Mail, label: 'Email' },
      { id: 'analytics', icon: BarChart2, label: 'Analytics' },
      { id: 'ai-agent', icon: Bot, label: 'AI Agent', badge: 'LIVE', badgeClass: 'green' },
      { id: 'activity', icon: Shield, label: 'Security' },
      { id: 'settings', icon: Settings, label: 'Settings' },
    ],
    primaryBtn: '+ Invite User', topTitle: 'PLATFORM ADMIN'
  },
  manager: {
    name: 'Manager', role: 'Team Manager', initials: 'MG',
    badge: 'role-admin', badgeText: 'MANAGER',
    nav: [
      { id: 'dashboard', icon: Home, label: 'Overview' },
      { id: 'carriers', icon: Users, label: 'Users' },
      { id: 'brokers', icon: Building2, label: 'Brokers' },
      { id: 'loadboard', icon: ClipboardList, label: 'All Loads' },
      { id: 'support', icon: FileText, label: 'Support' },
    ],
    primaryBtn: '+ Invite User', topTitle: 'TEAM MANAGER'
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
  const [demoMode, setDemoMode] = useState(false)
  const [companyRole, setCompanyRole] = useState(null) // 'owner' | 'admin' | 'dispatcher' | 'driver'
  const [companyId, setCompanyId] = useState(null)
  const [myDriverId, setMyDriverId] = useState(null)
  const toastTimer = useRef(null)

  // Computed role helpers
  const isDriver = companyRole === 'driver'
  const isAdmin = companyRole === 'owner' || companyRole === 'admin'
  const isDispatcher = companyRole === 'dispatcher'

  // Apply theme class
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'default') root.removeAttribute('data-theme')
    else root.setAttribute('data-theme', theme)
    localStorage.setItem('fm_theme', theme)
  }, [theme])

  // Fetch company membership — returns { role, company_id, driver_id } or null
  const fetchCompanyMembership = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('company_members')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle()
      if (data && !error) {
        setCompanyRole(data.role)
        setCompanyId(data.company_id)
        if (data.driver_id) setMyDriverId(data.driver_id)
        return data
      }
    } catch (e) {
      // Table may not exist yet — graceful fail
    }
    return null
  }, [])

  // Auto-create owner membership for existing users who don't have one
  const ensureOwnerMembership = useCallback(async (userId, prof) => {
    try {
      // Use the user's own ID as company_id for solo owner-operators
      const cid = prof?.company_id || userId
      const { data, error } = await supabase
        .from('company_members')
        .insert({
          company_id: cid,
          user_id: userId,
          role: 'owner',
          status: 'active',
        })
        .select()
        .single()
      if (data && !error) {
        setCompanyRole('owner')
        setCompanyId(cid)
        // Also set company_id on profile if not set
        if (!prof?.company_id) {
          await supabase.from('profiles').update({ company_id: cid }).eq('id', userId)
        }
        return data
      }
    } catch (e) {
      // Graceful fail — table may not exist
    }
    // Default to owner for existing users even if insert fails
    setCompanyRole('owner')
    return null
  }, [])

  // Fetch user profile from Supabase (graceful — returns null on error)
  const fetchProfile = useCallback(async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      if (data && !error) {
        setProfile(data)
        return data
      }
    } catch (e) {
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
        const role = resolveRole(prof, session.user.email)
        setCurrentRole(role)

        // Fetch company membership
        const membership = await fetchCompanyMembership(session.user.id)
        if (!membership && (role === 'carrier' || role === 'admin')) {
          // Existing user with no membership — auto-create as owner
          await ensureOwnerMembership(session.user.id, prof)
        }

        // Handle invite token in URL or stored from signup
        const urlParams = new URLSearchParams(window.location.search)
        let inviteToken = urlParams.get('invite')
        if (!inviteToken) {
          try { inviteToken = localStorage.getItem('qivori_pending_invite') } catch {}
        }
        if (inviteToken) {
          try {
            const res = await apiFetch('/api/accept-invite', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: inviteToken }),
            })
            const result = await res.json()
            if (result.success) {
              // Re-fetch membership after accepting
              await fetchCompanyMembership(session.user.id)
              showToast('', 'Team Joined!', `You've joined ${result.companyName || 'the team'} as a ${result.role || 'driver'}`)
            }
            // Clean URL and stored token
            window.history.replaceState({}, '', window.location.pathname)
            try { localStorage.removeItem('qivori_pending_invite') } catch {}
          } catch {}
        }

        const landingPage = (role === 'carrier') ? 'carrier-dashboard' : (role === 'broker') ? 'broker-dashboard' : 'dashboard'
        setCurrentPage(landingPage)
        setView('app')
        trackSessionStart(role)
      }
      setAuthLoading(false)
    }).catch(e => {
      setAuthLoading(false)
    })

    // Listen for auth changes (only handle sign-out here; sign-in handled by loginWithCredentials)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setUser(null)
        setProfile(null)
        setCompanyRole(null)
        setCompanyId(null)
        setMyDriverId(null)
        setView('landing')
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  const setTheme = useCallback((t) => setThemeState(t), [])

  const showToast = useCallback((icon, title, sub) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ show: true, icon, title, sub })
    toastTimer.current = setTimeout(() => setToast(t => ({ ...t, show: false })), 6000)
  }, [])

  // Determine role from profile or email fallback
  const resolveRole = (prof, email) => {
    if (prof?.role) return prof.role
    if (email.endsWith('@qivori.com')) return 'admin'
    return 'carrier'
  }

  // Sign in with Supabase
  const loginWithCredentials = useCallback(async (email, password) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) return { error: error.message }

      setUser(data.user)

      // Resolve role from email first (instant), then update with profile
      const quickRole = resolveRole(null, email)
      setCurrentRole(quickRole)
      const landingPage = quickRole === 'carrier' ? 'carrier-dashboard' : quickRole === 'broker' ? 'broker-dashboard' : 'dashboard'
      setCurrentPage(landingPage)
      setView('app')

      const displayName = email.split('@')[0]
      trackLogin('email')
      showToast('', 'Welcome, ' + displayName, 'Signing in...')

      // Fetch profile in background and update role if different
      fetchProfile(data.user.id).then(async (prof) => {
        if (prof?.role && prof.role !== quickRole) {
          setCurrentRole(prof.role)
          const correctPage = prof.role === 'carrier' ? 'carrier-dashboard' : prof.role === 'broker' ? 'broker-dashboard' : 'dashboard'
          setCurrentPage(correctPage)
        }

        // Fetch company membership
        const membership = await fetchCompanyMembership(data.user.id)
        if (!membership && (prof?.role === 'carrier' || prof?.role === 'admin' || quickRole === 'carrier')) {
          await ensureOwnerMembership(data.user.id, prof)
        }

        // Handle invite token in URL
        const urlParams = new URLSearchParams(window.location.search)
        const inviteToken = urlParams.get('invite')
        if (inviteToken) {
          try {
            const invRes = await apiFetch('/api/accept-invite', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: inviteToken }),
            })
            const result = await invRes.json()
            if (result.success) {
              await fetchCompanyMembership(data.user.id)
              showToast('', 'Team Joined!', `You've joined ${result.companyName || 'the team'} as a ${result.role || 'driver'}`)
            }
            window.history.replaceState({}, '', window.location.pathname)
          } catch {}
        }

        showToast('', 'Welcome, ' + displayName, 'Signed in as ' + ROLES[prof?.role || quickRole].badgeText)
      }).catch(e => {
        showToast('', 'Welcome, ' + displayName, 'Signed in')
      })

      return { ok: true }
    } catch (e) {
      return { error: e?.message || 'Login failed. Please try again.' }
    }
  }, [fetchProfile, showToast])

  // Sign up with Supabase
  const signUp = useCallback(async (email, password, role, fullName, companyName) => {
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) return { error: error.message }

    // Create profile row
    if (data.user) {
      const refCode = typeof localStorage !== 'undefined' ? localStorage.getItem('qivori_ref') : null
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        email,
        role,
        full_name: fullName,
        company_name: companyName,
        status: 'pending',
        referred_by: refCode || null,
      })
      if (profileError) {}

      trackSignup('email', role)
      recordStep(data.user.id, 'signup')

      // If there's an invite token, store it for after email confirmation
      const urlParams = new URLSearchParams(window.location.search)
      const inviteToken = urlParams.get('invite')
      if (inviteToken) {
        try { localStorage.setItem('qivori_pending_invite', inviteToken) } catch {}
      }

      // Send welcome email (fire and forget)
      fetch('/api/welcome-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName, role }),
      }).catch(() => {})

      // Track referral signup (fire and forget)
      if (refCode) {
        fetch('/api/referral', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'signup', referralCode: refCode, email }),
        }).catch(() => {})
        localStorage.removeItem('qivori_ref')
      }
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
    if (demoMode) {
      setDemoMode(false)
      setUser(null)
      setProfile(null)
      setView('landing')
      try { localStorage.removeItem('qivori_chat_history') } catch {}
      showToast('', 'Demo Ended', 'Sign up to get started!')
      return
    }
    await supabase.auth.signOut()
    // Clear chat history and session data
    try {
      localStorage.removeItem('qivori_chat_history')
      localStorage.removeItem('qivori_hos_start')
    } catch {}
    setUser(null)
    setProfile(null)
    setCompanyRole(null)
    setCompanyId(null)
    setMyDriverId(null)
    setView('landing')
    showToast('', 'Signed Out', 'See you next time!')
  }, [showToast, demoMode])

  const goToLogin = useCallback(() => setView('login'), [])

  // Demo mode — lets prospects explore the app without signing up
  const enterDemo = useCallback((role = 'carrier') => {
    setDemoMode(true)
    setUser({ id: 'demo-user', email: 'demo@qivori.com' })
    setProfile({ id: 'demo-user', email: 'demo@qivori.com', full_name: 'Demo User', role, subscription_status: 'trialing', subscription_plan: 'autopilot' })
    setCurrentRole(role)
    setCurrentPage(role === 'carrier' ? 'carrier-dashboard' : role === 'broker' ? 'broker-dashboard' : 'dashboard')
    setView('app')
    localStorage.setItem('qv_onboarded', 'true')
    showToast('', 'Demo Mode', 'Explore Qivori with sample data — no account needed')
  }, [showToast])

  const exitDemo = useCallback(() => {
    setDemoMode(false)
    setUser(null)
    setProfile(null)
    setView('landing')
    showToast('', 'Demo Ended', 'Sign up to get started!')
  }, [showToast])

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

  // Subscription helpers
  const subscription = {
    plan: profile?.subscription_plan || null,
    status: profile?.subscription_status || null,
    isActive: ['active', 'trialing'].includes(profile?.subscription_status),
    isTrial: profile?.subscription_status === 'trialing',
    trialEndsAt: profile?.trial_ends_at || null,
    customerId: profile?.stripe_customer_id || null,
  }

  // Open Stripe billing portal
  const openBillingPortal = async () => {
    if (!subscription.customerId) return
    try {
      const res = await apiFetch('/api/create-portal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerId: subscription.customerId }),
      })
      const data = await res.json()
      if (data.url) window.location.href = data.url
    } catch (e) {
      showToast('error', 'Error', 'Could not open billing portal')
    }
  }

  return (
    <AppContext.Provider value={{
      view, currentRole, currentPage,
      sidebarOpen, toast,
      user, profile, authLoading,
      demoMode, enterDemo, exitDemo,
      subscription, openBillingPortal,
      loginWithCredentials, signUp, resetPassword, logout, goToLogin, navigatePage,
      toggleSidebar, closeSidebar, showToast,
      theme, setTheme,
      roleConfig,
      // Multi-user roles
      companyRole, companyId, myDriverId,
      isDriver, isAdmin, isDispatcher,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => useContext(AppContext)
