/**
 * SambaSafety API Integration
 * Handles: Motor Vehicle Record (MVR) pulls
 * Docs: https://docs.sambasafety.com
 *
 * Required env: SAMBASAFETY_API_KEY, SAMBASAFETY_ACCOUNT_ID (server-side)
 */

import { supabase } from '../supabase'

// Order an MVR pull for a driver
export async function orderMVR(driver) {
  const { data, error } = await supabase.functions.invoke('onboarding', {
    body: {
      action: 'samba_mvr',
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

// Check MVR status
export async function getMVRStatus(orderId) {
  const { data, error } = await supabase.functions.invoke('onboarding', {
    body: { action: 'samba_status', orderId },
  })
  if (error) throw error
  return data
}
