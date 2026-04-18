/**
 * planConfig.js — single source of truth for plan pricing and display info.
 *
 * Kept in lib/ (not hooks/) so it can be safely imported by both
 * AppContext.jsx and useSubscription.js without creating a circular dependency.
 *
 * NEVER hardcode these values in components — always import from here.
 */

export const PLAN_DISPLAY = {
  tms_pro:          { name: 'TMS Pro',           price: 79,  extraTruck: 39, color: '#4d8ef0' },
  ai_dispatch:      { name: 'Qivori AI Dispatch', price: 199, extraTruck: 99, color: '#f0a500' },
  autonomous_fleet: { name: 'Qivori AI Dispatch', price: 199, extraTruck: 99, color: '#f0a500' },
  autopilot_ai:     { name: 'Qivori AI Dispatch', price: 199, extraTruck: 99, color: '#f0a500' }, // legacy
  autopilot:        { name: 'Qivori AI Dispatch', price: 199, extraTruck: 99, color: '#f0a500' }, // legacy
}
