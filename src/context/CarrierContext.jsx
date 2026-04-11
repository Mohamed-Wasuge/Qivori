/**
 * CarrierContext — backward-compatible coordinator
 *
 * This file is now a thin shell. All domain logic lives in:
 *   MemoryContext     — qMemories, aiFees, fuelCostPerMile, carrierMpg
 *   FinancialsContext — invoices, expenses, financial operations
 *   FleetContext      — drivers, vehicles, company, fleet operations
 *   LoadsContext      — loads, checkCalls, consolidations, load operations
 *
 * CarrierProvider nests all four providers and CarrierInner assembles
 * their values into a single CarrierContext.Provider so every existing
 * useCarrier() consumer continues to work without any changes.
 */

import { createContext, useContext, useCallback } from 'react'
import { useApp } from './AppContext'
import { MemoryProvider, useMemory } from './MemoryContext'
import { FinancialsProvider, useFinancials } from './FinancialsContext'
import { FleetProvider, useFleet } from './FleetContext'
import { LoadsProvider, useLoads } from './LoadsContext'

const CarrierContext = createContext(null)

// ─── Provider shell ──────────────────────────────────────────────────────────
export function CarrierProvider({ children }) {
  return (
    <MemoryProvider>
      <FinancialsProvider>
        <FleetProvider>
          <LoadsProvider>
            <CarrierInner>{children}</CarrierInner>
          </LoadsProvider>
        </FleetProvider>
      </FinancialsProvider>
    </MemoryProvider>
  )
}

// ─── Coordinator ─────────────────────────────────────────────────────────────
// Pulls every value from the domain contexts and re-exports them through a
// single CarrierContext.Provider so useCarrier() consumers need zero changes.
function CarrierInner({ children }) {
  const { demoMode } = useApp() || {}

  const {
    qMemories, aiFees, fuelCostPerMile, carrierMpg,
    addQMemory, removeQMemory,
  } = useMemory() || {}

  const {
    invoices, expenses, allInvoices, allExpenses,
    unpaidInvoices, totalExpenses,
    updateInvoiceStatus, addExpense, editExpense, removeExpense, removeInvoice,
  } = useFinancials() || {}

  const {
    drivers, vehicles, company, driverMap,
    addDriver, editDriver, removeDriver,
    addVehicle, editVehicle, removeVehicle,
    updateCompany, resetFleet,
  } = useFleet() || {}

  const {
    loads, allLoads,
    checkCalls, consolidations,
    deliveredLoads, activeLoads, totalRevenue, brokerStats,
    dataReady, useDb,
    addLoad, addLoadWithStops, removeLoad,
    updateLoadStatus, assignLoadToDriver, advanceStop,
    logCheckCall, addConsolidation, editConsolidation,
    resetLoads,
  } = useLoads() || {}

  // resetData coordinates both contexts that hold state to clear
  const resetData = useCallback(() => {
    resetLoads?.()
    resetFleet?.()
  }, [resetLoads, resetFleet])

  return (
    <CarrierContext.Provider value={{
      // ── Loads ──
      loads, allLoads,
      checkCalls, consolidations,
      deliveredLoads, activeLoads,
      totalRevenue, brokerStats,
      dataReady, useDb,
      addLoad, addLoadWithStops, removeLoad,
      updateLoadStatus, assignLoadToDriver, advanceStop,
      logCheckCall, addConsolidation, editConsolidation,
      // ── Financials ──
      invoices, expenses, allInvoices, allExpenses,
      unpaidInvoices, totalExpenses,
      updateInvoiceStatus, addExpense, editExpense, removeExpense, removeInvoice,
      // ── Fleet ──
      drivers, vehicles, company, driverMap,
      addDriver, editDriver, removeDriver,
      addVehicle, editVehicle, removeVehicle,
      updateCompany,
      // ── Memory ──
      qMemories, aiFees, fuelCostPerMile, carrierMpg,
      addQMemory, removeQMemory,
      // ── Shared ──
      resetData, demoMode,
    }}>
      {children}
    </CarrierContext.Provider>
  )
}

export const useCarrier = () => useContext(CarrierContext)
