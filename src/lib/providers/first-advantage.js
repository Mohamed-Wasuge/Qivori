/**
 * First Advantage API Integration
 * Handles: DOT Drug & Alcohol Testing
 * Docs: https://developer.fadv.com
 *
 * Required env: FADV_CLIENT_ID, FADV_CLIENT_SECRET (server-side)
 */

import { supabase } from '../supabase'

// Order DOT drug & alcohol test
export async function orderDrugTest(driver) {
  const { data, error } = await supabase.functions.invoke('onboarding', {
    body: {
      action: 'fadv_drug_test',
      driver: {
        full_name: driver.name || driver.full_name,
        email: driver.email,
        phone: driver.phone,
        dob: driver.dob,
      },
    },
  })
  if (error) throw error
  return data
}

// Check drug test status
export async function getDrugTestStatus(orderId) {
  const { data, error } = await supabase.functions.invoke('onboarding', {
    body: { action: 'fadv_status', orderId },
  })
  if (error) throw error
  return data
}
