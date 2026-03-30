/**
 * HOS (Hours of Service) Simulation — FMCSA compliance calculations
 * Pure JS, no external dependencies. Used by dispatch to check driver availability.
 */

const MAX_DRIVING = 11      // hours
const MAX_ON_DUTY = 14      // hours
const BREAK_AFTER = 8       // hours of driving before 30-min break required
const BREAK_DURATION = 0.5  // 30 minutes
const WEEKLY_7DAY = 60      // hours
const WEEKLY_8DAY = 70      // hours
const RESTART_HOURS = 34    // 34-hour restart resets weekly
const OFF_DUTY_RESET = 10   // consecutive hours off duty resets daily limits

/**
 * Calculate HOS availability for a driver
 * @param {object} driver - { shift_start, driving_hours_used, on_duty_hours, last_break, weekly_hours, weekly_cycle }
 * @returns {object} { canDrive, hoursRemaining, mustBreak, breakIn, violations, status, onDutyRemaining }
 */
export function calculateHOS(driver) {
  const now = Date.now()
  const drivingUsed = driver.driving_hours_used || 0
  const onDutyHours = driver.on_duty_hours || 0
  const weeklyHours = driver.weekly_hours || 0
  const weeklyCycle = driver.weekly_cycle || 7 // 7-day or 8-day
  const weeklyMax = weeklyCycle === 8 ? WEEKLY_8DAY : WEEKLY_7DAY

  // Shift elapsed time
  const shiftStart = driver.shift_start ? new Date(driver.shift_start).getTime() : now
  const shiftElapsed = (now - shiftStart) / 3600000

  // Remaining hours
  const drivingRemaining = Math.max(MAX_DRIVING - drivingUsed, 0)
  const onDutyRemaining = Math.max(MAX_ON_DUTY - Math.max(onDutyHours, shiftElapsed), 0)
  const weeklyRemaining = Math.max(weeklyMax - weeklyHours, 0)

  // Effective driving hours left (minimum of all limits)
  const hoursRemaining = Math.min(drivingRemaining, onDutyRemaining, weeklyRemaining)

  // Break check
  const lastBreak = driver.last_break ? new Date(driver.last_break).getTime() : shiftStart
  const hoursSinceBreak = (now - lastBreak) / 3600000
  const drivingSinceBreak = Math.min(drivingUsed, hoursSinceBreak)
  const mustBreak = drivingSinceBreak >= BREAK_AFTER
  const breakIn = mustBreak ? 0 : Math.max(BREAK_AFTER - drivingSinceBreak, 0)

  // Violations
  const violations = []
  if (drivingUsed > MAX_DRIVING) violations.push(`Driving limit exceeded: ${drivingUsed.toFixed(1)}/${MAX_DRIVING}h`)
  if (shiftElapsed > MAX_ON_DUTY) violations.push(`On-duty limit exceeded: ${shiftElapsed.toFixed(1)}/${MAX_ON_DUTY}h`)
  if (weeklyHours > weeklyMax) violations.push(`Weekly limit exceeded: ${weeklyHours.toFixed(1)}/${weeklyMax}h`)
  if (mustBreak) violations.push(`30-min break required (${drivingSinceBreak.toFixed(1)}h driving since last break)`)

  // Current status inference
  let status = 'off_duty'
  if (driver.hos_status) {
    status = driver.hos_status
  } else if (drivingRemaining > 0 && onDutyRemaining > 0 && !mustBreak) {
    status = 'driving'
  } else if (onDutyRemaining > 0) {
    status = 'on_duty'
  }

  const canDrive = hoursRemaining > 0 && !mustBreak && violations.length === 0

  return {
    canDrive,
    hoursRemaining: round(hoursRemaining, 1),
    drivingRemaining: round(drivingRemaining, 1),
    onDutyRemaining: round(onDutyRemaining, 1),
    weeklyRemaining: round(weeklyRemaining, 1),
    mustBreak,
    breakIn: round(breakIn, 1),
    violations,
    status,
  }
}

/**
 * Check if driver can legally complete a load
 * @param {object} driver - driver record with HOS fields
 * @param {number} estimatedDriveHours - how long the load will take to drive
 * @returns {object} { legal, reason, hoursAvailable, hoursNeeded }
 */
export function canDriverTakeLoad(driver, estimatedDriveHours) {
  const hos = calculateHOS(driver)

  if (hos.violations.length > 0) {
    return {
      legal: false,
      reason: `HOS violation: ${hos.violations[0]}`,
      hoursAvailable: hos.hoursRemaining,
      hoursNeeded: estimatedDriveHours,
    }
  }

  if (hos.mustBreak) {
    // If break is needed, driver loses 30 min but can then continue
    const availableAfterBreak = Math.max(hos.hoursRemaining, 0)
    if (availableAfterBreak >= estimatedDriveHours) {
      return {
        legal: true,
        reason: `Legal after 30-min break. ${availableAfterBreak}h available.`,
        hoursAvailable: availableAfterBreak,
        hoursNeeded: estimatedDriveHours,
      }
    }
    return {
      legal: false,
      reason: `Need ${estimatedDriveHours}h but only ${availableAfterBreak}h available after required break`,
      hoursAvailable: availableAfterBreak,
      hoursNeeded: estimatedDriveHours,
    }
  }

  if (estimatedDriveHours > hos.hoursRemaining) {
    return {
      legal: false,
      reason: `Need ${estimatedDriveHours}h but only ${hos.hoursRemaining}h available`,
      hoursAvailable: hos.hoursRemaining,
      hoursNeeded: estimatedDriveHours,
    }
  }

  // Check if a break will be needed mid-trip
  const needsMidTripBreak = estimatedDriveHours > hos.breakIn && hos.breakIn > 0
  const note = needsMidTripBreak
    ? `30-min break needed after ${hos.breakIn}h of driving`
    : null

  return {
    legal: true,
    reason: note || `${hos.hoursRemaining}h available, ${estimatedDriveHours}h needed`,
    hoursAvailable: hos.hoursRemaining,
    hoursNeeded: estimatedDriveHours,
  }
}

/**
 * Estimate if a 34-hour restart has been completed
 * @param {string} lastShiftEnd - ISO timestamp of when driver went off duty
 * @returns {boolean}
 */
export function hasCompletedRestart(lastShiftEnd) {
  if (!lastShiftEnd) return false
  const offHours = (Date.now() - new Date(lastShiftEnd).getTime()) / 3600000
  return offHours >= RESTART_HOURS
}

/**
 * Check if driver has completed 10 consecutive hours off duty (daily reset)
 * @param {string} lastShiftEnd - ISO timestamp
 * @returns {boolean}
 */
export function hasDailyReset(lastShiftEnd) {
  if (!lastShiftEnd) return false
  const offHours = (Date.now() - new Date(lastShiftEnd).getTime()) / 3600000
  return offHours >= OFF_DUTY_RESET
}

function round(n, d) { const f = 10 ** d; return Math.round(n * f) / f }
