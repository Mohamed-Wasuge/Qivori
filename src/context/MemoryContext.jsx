/**
 * MemoryContext — Q AI memories, AI fees, fuel cost, carrier MPG
 *
 * Owns:
 *   qMemories       — cross-session Q AI intelligence records
 *   aiFees          — AI service fee transactions
 *   fuelCostPerMile — live $/mile from EIA diesel price API
 *   carrierMpg      — carrier's truck MPG setting (null = use 7.0 default)
 *
 * Consumed directly via useMemory() or indirectly via useCarrier()
 * (CarrierContext re-exports all values for backward compatibility).
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import * as db from '../lib/database'
import { supabase } from '../lib/supabase'
import { apiFetch } from '../lib/api'
import { useApp } from './AppContext'

const MemoryContext = createContext(null)

export function MemoryProvider({ children }) {
  const { demoMode, user, authLoading } = useApp() || {}

  const [qMemories, setQMemories]         = useState([])
  const [aiFees, setAiFees]               = useState([])
  const [fuelCostPerMile, setFuelCostPerMile] = useState(0.55) // default ~$3.85/gal ÷ 7 MPG
  const [carrierMpg, setCarrierMpg]       = useState(null)     // null = use 7.0 default
  const initRef = useRef(false)

  // ─── Reset on user change (logout → login) ───────────────────
  useEffect(() => {
    if (!user) {
      initRef.current = false
      setQMemories([])
      setAiFees([])
      setCarrierMpg(null)
    }
  }, [user])

  // ─── Initial data fetch ───────────────────────────────────────
  useEffect(() => {
    if (demoMode || authLoading || !user) return
    if (initRef.current) return
    initRef.current = true

    async function init() {
      try {
        const [dbMemories, dbAiFees] = await Promise.all([
          db.fetchMemories(),
          db.fetchAIFees(),
        ])
        setQMemories(dbMemories || [])
        setAiFees(dbAiFees || [])

        // Carrier MPG from settings table
        try {
          const { data: settings } = await supabase
            .from('carrier_settings')
            .select('truck_mpg')
            .limit(1)
            .single()
          if (settings?.truck_mpg) setCarrierMpg(parseFloat(settings.truck_mpg))
        } catch {} // no settings row yet — use default
      } catch (e) {
        console.error('[MemoryContext] Init failed:', e.message || e)
      }
    }
    init()
  }, [demoMode, authLoading, user])

  // ─── Live diesel price from EIA ──────────────────────────────
  // Runs once on mount. fuelCostPerMile recalculates when carrierMpg loads.
  const [_dieselPrice, setDieselPrice] = useState(null)

  useEffect(() => {
    if (demoMode) return
    apiFetch('/api/diesel-prices')
      .then(r => r.json())
      .then(data => {
        const prices = data?.prices
        if (!prices?.length) return
        const usAvg = prices.find(p => p.region === 'US AVG')
        const price = usAvg ? usAvg.price : prices[0].price
        if (price > 0) setDieselPrice(price)
      })
      .catch(() => {}) // keep default $0.55/mi on failure
  }, [demoMode])

  useEffect(() => {
    if (!_dieselPrice) return
    const mpg = carrierMpg || 7.0
    setFuelCostPerMile(+(_dieselPrice / mpg).toFixed(3))
  }, [_dieselPrice, carrierMpg])

  // ─── Q Memory operations ──────────────────────────────────────
  const addQMemory = useCallback(async (memory) => {
    if (demoMode) return null
    const saved = await db.createMemory(memory)
    if (saved) setQMemories(prev => [saved, ...prev])
    return saved
  }, [demoMode])

  const removeQMemory = useCallback(async (id) => {
    if (demoMode) return
    await db.deleteMemory(id)
    setQMemories(prev => prev.filter(m => m.id !== id))
  }, [demoMode])

  return (
    <MemoryContext.Provider value={{
      qMemories,
      aiFees,
      fuelCostPerMile,
      carrierMpg,
      addQMemory,
      removeQMemory,
    }}>
      {children}
    </MemoryContext.Provider>
  )
}

export const useMemory = () => useContext(MemoryContext)
