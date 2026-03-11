/**
 * Checkr API Integration
 * Handles: Background checks, Employment verification, MVR (optional)
 * Docs: https://docs.checkr.com
 *
 * Required env: CHECKR_API_KEY (server-side only via Edge Function)
 */

import { supabase } from '../supabase'

// Order a background check + employment verification
export async function orderBackgroundCheck(driver) {
  const { data, error } = await supabase.functions.invoke('onboarding', {
    body: {
      action: 'checkr_background',
      driver: {
        full_name: driver.name || driver.full_name,
        email: driver.email,
        phone: driver.phone,
        dob: driver.dob,
        state: driver.state || driver.license_state,
        cdl_number: driver.cdlNum || driver.license_number,
      },
    },
  })
  if (error) throw error
  return data
}

// Order employment verification (3-year history)
export async function orderEmploymentVerification(driver) {
  const { data, error } = await supabase.functions.invoke('onboarding', {
    body: {
      action: 'checkr_employment',
      driver: {
        full_name: driver.name || driver.full_name,
        email: driver.email,
      },
    },
  })
  if (error) throw error
  return data
}

// Check status of a Checkr report
export async function getCheckrStatus(reportId) {
  const { data, error } = await supabase.functions.invoke('onboarding', {
    body: { action: 'checkr_status', reportId },
  })
  if (error) throw error
  return data
}
