/**
 * FinancialsContext — invoices, expenses, and financial operations
 *
 * Owns:
 *   invoices            — normalized invoice records
 *   expenses            — normalized expense records
 *   unpaidInvoices      — memoized filter
 *   totalExpenses       — memoized sum
 *   updateInvoiceStatus — marks invoice paid/sent/etc + syncs linked load via callback
 *   addExpense / editExpense / removeExpense / removeInvoice
 *
 * Cross-context dep: updateInvoiceStatus needs to mark the linked load as 'Invoiced'.
 * CarrierInner registers a callback via registerLoadsUpdater() after mount.
 *
 * Consumed via useFinancials() or indirectly via useCarrier()
 * (CarrierContext re-exports all values for backward compatibility).
 */

import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import * as db from '../lib/database'
import { supabase } from '../lib/supabase'
import { useApp } from './AppContext'
import { normalizeInvoice, normalizeExpense } from '../lib/normalizers'
import { DEMO_INVOICES, DEMO_EXPENSES } from '../data/demoData'

const FinancialsContext = createContext(null)

// Debounce helper — batches rapid realtime updates into single state changes
function createDebouncedHandler(setter, normalize, idField = 'id') {
  let pending = { inserts: [], updates: [], deletes: [] }
  let timer = null
  return (payload) => {
    if (payload.eventType === 'INSERT') pending.inserts.push(normalize(payload.new))
    else if (payload.eventType === 'UPDATE') pending.updates.push(normalize(payload.new))
    else if (payload.eventType === 'DELETE') pending.deletes.push(payload.old[idField])
    clearTimeout(timer)
    timer = setTimeout(() => {
      const batch = { ...pending }
      pending = { inserts: [], updates: [], deletes: [] }
      setter(prev => {
        let next = prev
        if (batch.deletes.length) next = next.filter(item => !batch.deletes.includes(item[idField]))
        if (batch.updates.length) {
          const updateMap = new Map(batch.updates.map(u => [u[idField], u]))
          next = next.map(item => updateMap.get(item[idField]) || item)
        }
        if (batch.inserts.length) {
          const existingIds = new Set(next.map(item => item[idField]))
          const newItems = batch.inserts.filter(item => !existingIds.has(item[idField]))
          next = [...newItems, ...next]
        }
        return next
      })
    }, 300)
  }
}

export function FinancialsProvider({ children }) {
  const { demoMode, showToast, isDriver, myDriverId, profile, user, authLoading } = useApp() || {}

  const demoGuard = useCallback((label) => {
    if (demoMode) {
      showToast?.('', 'Demo Mode', 'Sign up to ' + (label || 'save changes'))
      return true
    }
    return false
  }, [demoMode, showToast])

  const [invoices, setInvoices] = useState([])
  const [expenses, setExpenses] = useState([])
  const [useDb, setUseDb]       = useState(true)
  const initRef = useRef(false)

  // CarrierInner registers its setLoads here so updateInvoiceStatus can sync the linked load
  const loadsUpdaterRef = useRef(null)
  const registerLoadsUpdater = useCallback((fn) => {
    loadsUpdaterRef.current = fn
  }, [])

  // ─── Reset on logout ─────────────────────────────────────────
  useEffect(() => {
    if (!user) {
      initRef.current = false
      setInvoices([])
      setExpenses([])
    }
  }, [user])

  // ─── Initial data fetch ───────────────────────────────────────
  useEffect(() => {
    if (demoMode) {
      if (initRef.current) return
      initRef.current = true
      setInvoices(DEMO_INVOICES.map(normalizeInvoice))
      setExpenses(DEMO_EXPENSES.map(normalizeExpense))
      setUseDb(false)
      return
    }
    if (authLoading || !user) return
    if (initRef.current) return
    initRef.current = true

    async function init() {
      try {
        const [dbInvoices, dbExpenses] = await Promise.all([
          db.fetchInvoices(),
          db.fetchExpenses(),
        ])
        setInvoices(dbInvoices.map(normalizeInvoice))
        setExpenses(dbExpenses.map(normalizeExpense))
        setUseDb(true)
      } catch (e) {
        console.error('[FinancialsContext] Init failed:', e.message || e)
        setInvoices([])
        setExpenses([])
        setUseDb(false)
      }
    }
    init()
  }, [demoMode, authLoading, user])

  // ─── Real-time subscriptions ──────────────────────────────────
  useEffect(() => {
    if (demoMode || !useDb) return
    const invoicesHandler = createDebouncedHandler(setInvoices, normalizeInvoice)
    const expensesHandler = createDebouncedHandler(setExpenses, normalizeExpense)
    const invoicesChannel = supabase.channel('realtime-invoices')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'invoices' }, invoicesHandler)
      .subscribe()
    const expensesChannel = supabase.channel('realtime-expenses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, expensesHandler)
      .subscribe()
    return () => {
      supabase.removeChannel(invoicesChannel)
      supabase.removeChannel(expensesChannel)
    }
  }, [demoMode, useDb])

  // ─── Driver role filtering ────────────────────────────────────
  const driverName = isDriver ? (profile?.full_name || '') : ''

  const isMyInvoice = useCallback((inv) => {
    if (!isDriver) return true
    if (driverName && (inv.driver_name || inv.driver || '').toLowerCase() === driverName.toLowerCase()) return true
    return false
  }, [isDriver, driverName])

  const isMyExpense = useCallback((exp) => {
    if (!isDriver) return true
    if (myDriverId && exp.driver_id === myDriverId) return true
    if (driverName && (exp.driver_name || exp.driver || '').toLowerCase() === driverName.toLowerCase()) return true
    return false
  }, [isDriver, myDriverId, driverName])

  const visibleInvoices = useMemo(
    () => isDriver ? invoices.filter(isMyInvoice) : invoices,
    [invoices, isDriver, isMyInvoice]
  )
  const visibleExpenses = useMemo(
    () => isDriver ? expenses.filter(isMyExpense) : expenses,
    [expenses, isDriver, isMyExpense]
  )

  // ─── Computed ─────────────────────────────────────────────────
  const unpaidInvoices = useMemo(
    () => visibleInvoices.filter(i => i.status === 'Unpaid'),
    [visibleInvoices]
  )
  const totalExpenses = useMemo(
    () => visibleExpenses.reduce((s, e) => s + (e.amount || 0), 0),
    [visibleExpenses]
  )

  // ─── Invoice operations ───────────────────────────────────────
  const updateInvoiceStatus = useCallback(async (invoiceId, status) => {
    if (demoGuard('update invoices')) return
    const inv = invoices.find(i => i.id === invoiceId || i.invoice_number === invoiceId || i._dbId === invoiceId)

    if (useDb && inv && inv._dbId && !String(inv._dbId).startsWith('mock') && !String(inv._dbId).startsWith('local')) {
      try {
        await db.updateInvoice(inv._dbId, { status, ...(status === 'Paid' ? { paid_at: new Date().toISOString() } : {}) })
        if (status === 'Paid') {
          db.createPayment({
            invoice_id:        inv._dbId,
            amount:            inv.factoring_net || inv.amount || 0,
            broker:            inv.broker || inv.customer || null,
            customer:          inv.broker || inv.customer || null,
            reference:         inv.invoice_number || inv.id,
            date:              new Date().toISOString().split('T')[0],
            source:            inv.factoring_company ? 'factoring' : 'broker',
            factoring_company: inv.factoring_company || null,
          }).catch(() => {})
        }
        db.createAuditLog({
          action:      'invoice_status_change',
          entity_type: 'invoice',
          entity_id:   inv._dbId,
          old_value:   { status: inv.status },
          new_value:   { status },
          metadata:    { invoice_number: inv.invoice_number, amount: inv.amount, load_number: inv.load_number || inv.loadId },
        }).catch(() => {})
      } catch (e) {
        console.error('DB operation failed:', e)
      }
    }

    setInvoices(invs => invs.map(i => {
      const match = i.id === invoiceId || i.invoice_number === invoiceId || i._dbId === invoiceId
      return match ? normalizeInvoice({ ...i, status }) : i
    }))

    // Sync linked load to 'Invoiced' via CarrierInner callback
    if (inv && status !== 'Unpaid' && loadsUpdaterRef.current) {
      loadsUpdaterRef.current(inv)
    }
  }, [invoices, useDb, demoGuard])

  // ─── Cross-context bridge helpers ────────────────────────────
  // Called by CarrierInner for load operations that touch invoice state.
  // Not part of the public consumer API — internal coordination only.
  const appendInvoice = useCallback((normalizedInv) => {
    setInvoices(invs => [normalizedInv, ...invs])
  }, [])

  const pruneInvoicesByLoadId = useCallback((loadId) => {
    setInvoices(invs => invs.filter(i => i.loadId !== loadId && i.load_number !== loadId))
  }, [])

  const removeInvoice = useCallback(async (id) => {
    if (demoGuard('remove invoices')) return
    const existing = invoices.find(i => i.id === id || i._dbId === id)
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.deleteInvoice(id) } catch (e) { console.error('DB operation failed:', e) }
      db.createAuditLog({ action: 'invoice.deleted', entity_type: 'invoice', entity_id: id, old_value: existing ? { invoice_number: existing.invoice_number, amount: existing.amount, status: existing.status } : null }).catch(() => {})
    }
    setInvoices(is => is.filter(i => i.id !== id && i._dbId !== id))
  }, [useDb, demoGuard, invoices])

  // ─── Expense operations ───────────────────────────────────────
  const addExpense = useCallback(async (exp) => {
    if (demoGuard('add expenses')) return null
    if (useDb) {
      try {
        const newExp = await db.createExpense(exp)
        setExpenses(es => [normalizeExpense(newExp), ...es])
        db.createAuditLog({ action: 'expense.created', entity_type: 'expense', entity_id: newExp.id, new_value: { category: exp.category, amount: exp.amount, vendor: exp.vendor || exp.description }, metadata: { driver: exp.driver_name, date: exp.expense_date || exp.date } }).catch(() => {})
        return normalizeExpense(newExp)
      } catch (e) {
        console.error('DB operation failed:', e)
      }
    }
    const fakeExp = normalizeExpense({ ...exp, id: 'local-exp-' + Date.now() })
    setExpenses(es => [fakeExp, ...es])
    return fakeExp
  }, [useDb, demoGuard])

  const editExpense = useCallback(async (id, updates) => {
    if (demoGuard('edit expenses')) return
    const existing = expenses.find(e => e.id === id)
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.updateExpense(id, updates) } catch (e) { console.error('DB operation failed:', e) }
      db.createAuditLog({ action: 'expense.updated', entity_type: 'expense', entity_id: id, old_value: existing ? { amount: existing.amount, category: existing.category } : null, new_value: updates }).catch(() => {})
    }
    setExpenses(es => es.map(e => e.id === id ? normalizeExpense({ ...e, ...updates }) : e))
  }, [useDb, demoGuard, expenses])

  const removeExpense = useCallback(async (id) => {
    if (demoGuard('remove expenses')) return
    const existing = expenses.find(e => e.id === id)
    if (useDb && !String(id).startsWith('mock') && !String(id).startsWith('local')) {
      try { await db.deleteExpense(id) } catch (e) { console.error('DB operation failed:', e) }
      db.createAuditLog({ action: 'expense.deleted', entity_type: 'expense', entity_id: id, old_value: existing ? { amount: existing.amount, category: existing.category, vendor: existing.vendor || existing.description } : null }).catch(() => {})
    }
    setExpenses(es => es.filter(e => e.id !== id))
  }, [useDb, demoGuard, expenses])

  return (
    <FinancialsContext.Provider value={{
      invoices:         visibleInvoices,
      expenses:         visibleExpenses,
      allInvoices:      invoices,
      allExpenses:      expenses,
      unpaidInvoices,
      totalExpenses,
      updateInvoiceStatus,
      addExpense,
      editExpense,
      removeExpense,
      removeInvoice,
      appendInvoice,
      pruneInvoicesByLoadId,
      registerLoadsUpdater,
    }}>
      {children}
    </FinancialsContext.Provider>
  )
}

export const useFinancials = () => useContext(FinancialsContext)
