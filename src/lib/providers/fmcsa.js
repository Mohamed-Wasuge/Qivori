/**
 * FMCSA API Integration
 * Handles: Clearinghouse Full Query, PSP Safety Report, CDL Verification
 * Docs: https://clearinghouse.fmcsa.dot.gov/api
 *       https://ai.fmcsa.dot.gov/PSP/
 *
 * Required env: FMCSA_API_KEY, FMCSA_WEBKEY (server-side)
 */

import { supabase } from '../supabase'

// Order Clearinghouse Full Query
export async function orderClearinghouseQuery(driver) {
  const { data, error } = await supabase.functions.invoke('onboarding', {
    body: {
      action: 'fmcsa_clearinghouse',
      driver: {
        full_name: driver.name || driver.full_name,
        license_number: driver.cdlNum || driver.license_number,
        license_state: driver.state || driver.license_state,
        dob: driver.dob,
      },
    },
  })
  if (error) throw error
  return data
}

// Order PSP Safety Report
export async function orderPSPReport(driver) {
  const { data, error } = await supabase.functions.invoke('onboarding', {
    body: {
      action: 'fmcsa_psp',
      driver: {
        full_name: driver.name || driver.full_name,
        license_number: driver.cdlNum || driver.license_number,
        license_state: driver.state || driver.license_state,
      },
    },
  })
  if (error) throw error
  return data
}

// Verify CDL via FMCSA CDLIS
export async function verifyCDL(driver) {
  const { data, error } = await supabase.functions.invoke('onboarding', {
    body: {
      action: 'fmcsa_cdl_verify',
      driver: {
        license_number: driver.cdlNum || driver.license_number,
        license_state: driver.state || driver.license_state,
      },
    },
  })
  if (error) throw error
  return data
}
