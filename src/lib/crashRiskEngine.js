/**
 * AI Crash Risk Scoring Engine — Predictive Safety Analytics
 *
 * Calculates a crash risk score (0-100) per driver, per load, and fleet-wide
 * using driver behavior, compliance data, load characteristics, route factors,
 * and environmental conditions.
 *
 * Used by: Safety Intelligence Dashboard, dispatch engine, SBIR grant reporting
 *
 * Risk model based on FMCSA crash causation data:
 *   - Driver fatigue: 13% of CMV crashes (LTCCS study)
 *   - Speed: 23% of fatal truck crashes
 *   - Vehicle condition: 10% of crashes
 *   - Weather: 13% of all crashes (FHWA)
 *   - Experience: new drivers 3x higher crash rate
 */

// ─── Risk Factor Weights (sum = 1.0) ─────────────────────────────────────────
const WEIGHTS = {
  fatigue:      0.20,  // HOS utilization, time since rest
  compliance:   0.20,  // CDL, medical, drug tests, violations
  experience:   0.10,  // Tenure, loads completed, incident history
  vehicle:      0.15,  // Maintenance, inspections, age
  load:         0.10,  // Weight, hazmat, distance, tight schedule
  weather:      0.10,  // Current/forecast conditions on route
  behavior:     0.10,  // Past incidents, scorecard, CSA points
  time:         0.05,  // Time of day, day of week (night = higher risk)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function clamp(val, min = 0, max = 100) {
  return Math.max(min, Math.min(max, val))
}

function daysUntil(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d)) return null
  return Math.round((d - new Date()) / (1000 * 60 * 60 * 24))
}

function daysSince(dateStr) {
  if (!dateStr) return null
  const d = daysUntil(dateStr)
  return d !== null ? -d : null
}

// ─── Individual Risk Factors ──────────────────────────────────────────────────

/**
 * Fatigue risk — based on HOS utilization and rest patterns
 * Higher risk when: low hours remaining, long shift, no recent break
 */
export function fatigueFactor(driver, hosLogs) {
  let risk = 10 // baseline
  const details = []

  const drivingUsed = driver.driving_hours_used || 0
  const onDutyHours = driver.on_duty_hours || 0
  const hoursRemaining = Math.max(11 - drivingUsed, 0)

  // High HOS utilization = higher fatigue risk
  if (hoursRemaining <= 1) {
    risk += 40
    details.push('Nearly out of drive hours')
  } else if (hoursRemaining <= 3) {
    risk += 25
    details.push('Low drive hours remaining')
  } else if (hoursRemaining <= 5) {
    risk += 10
    details.push('Moderate hours used')
  }

  // Long continuous on-duty period
  if (onDutyHours >= 12) {
    risk += 20
    details.push('Extended on-duty period (12h+)')
  } else if (onDutyHours >= 10) {
    risk += 10
    details.push('Long on-duty period (10h+)')
  }

  // Break overdue
  const lastBreak = driver.last_break ? new Date(driver.last_break).getTime() : null
  if (lastBreak) {
    const hoursSinceBreak = (Date.now() - lastBreak) / 3600000
    if (hoursSinceBreak >= 8) {
      risk += 15
      details.push('Break overdue (8h+ since last)')
    }
  }

  // Weekly hours fatigue accumulation
  const weeklyHours = driver.weekly_hours || 0
  if (weeklyHours >= 55) {
    risk += 15
    details.push('High weekly hours')
  } else if (weeklyHours >= 45) {
    risk += 5
  }

  return { score: clamp(risk), details, factor: 'fatigue', label: 'Fatigue Risk' }
}

/**
 * Compliance risk — CDL, medical card, drug test, violations
 */
export function complianceFactor(driver, complianceChecks) {
  let risk = 5
  const details = []

  // CDL expiry
  const cdlDays = daysUntil(driver.cdl_expiry || driver.license_expiry)
  if (cdlDays !== null && cdlDays < 0) {
    risk += 50
    details.push('CDL expired')
  } else if (cdlDays !== null && cdlDays <= 30) {
    risk += 15
    details.push('CDL expiring soon')
  }

  // Medical card
  const medDays = daysUntil(driver.medical_card_expiry || driver.med_card_expiry)
  if (medDays !== null && medDays < 0) {
    risk += 40
    details.push('Medical card expired')
  } else if (medDays !== null && medDays <= 30) {
    risk += 10
    details.push('Medical card expiring')
  }

  // Count compliance failures from existing checks
  if (complianceChecks) {
    const fails = complianceChecks.filter(c => c.status === 'fail').length
    const warns = complianceChecks.filter(c => c.status === 'warn').length
    risk += fails * 15
    risk += warns * 5
    if (fails > 0) details.push(`${fails} compliance failure(s)`)
    if (warns > 0) details.push(`${warns} compliance warning(s)`)
  }

  return { score: clamp(risk), details, factor: 'compliance', label: 'Compliance Risk' }
}

/**
 * Experience risk — tenure, loads completed, incident count
 */
export function experienceFactor(driver, incidents) {
  let risk = 10
  const details = []

  // Hire date — newer drivers = higher risk
  const hireDate = driver.hire_date || driver.start_date
  const tenure = daysSince(hireDate)
  if (tenure !== null) {
    if (tenure < 90) {
      risk += 30
      details.push('New driver (<90 days)')
    } else if (tenure < 180) {
      risk += 15
      details.push('Recent hire (<6 months)')
    } else if (tenure < 365) {
      risk += 5
      details.push('Under 1 year experience')
    }
  }

  // Incident history
  const driverIncidents = (incidents || []).filter(i =>
    (i.driver_name === (driver.full_name || driver.name)) &&
    daysSince(i.incident_date) < 365
  )
  const criticals = driverIncidents.filter(i => i.severity === 'critical' || i.severity === 'major')
  if (criticals.length > 0) {
    risk += criticals.length * 20
    details.push(`${criticals.length} major incident(s) in past year`)
  }
  if (driverIncidents.length > 2) {
    risk += 10
    details.push(`${driverIncidents.length} total incidents in past year`)
  }

  return { score: clamp(risk), details, factor: 'experience', label: 'Experience Risk' }
}

/**
 * Vehicle condition risk — maintenance, inspections, age
 */
export function vehicleFactor(vehicle) {
  let risk = 5
  const details = []

  if (!vehicle) return { score: 15, details: ['No vehicle assigned'], factor: 'vehicle', label: 'Vehicle Risk' }

  // Annual inspection
  const inspDays = daysUntil(vehicle.annual_inspection_due)
  if (inspDays !== null && inspDays < 0) {
    risk += 40
    details.push('Annual inspection overdue')
  } else if (inspDays !== null && inspDays <= 30) {
    risk += 10
    details.push('Annual inspection due soon')
  }

  // Insurance
  const insDays = daysUntil(vehicle.insurance_expiry)
  if (insDays !== null && insDays < 0) {
    risk += 30
    details.push('Insurance expired')
  }

  // Out of service
  if (vehicle.out_of_service) {
    risk += 50
    details.push('Vehicle out of service')
  }

  // Vehicle age (year)
  if (vehicle.year) {
    const age = new Date().getFullYear() - vehicle.year
    if (age > 15) {
      risk += 15
      details.push(`Vehicle ${age} years old`)
    } else if (age > 10) {
      risk += 8
      details.push(`Vehicle ${age} years old`)
    }
  }

  // Odometer — high mileage
  if (vehicle.odometer && vehicle.odometer > 500000) {
    risk += 10
    details.push('High mileage (500K+)')
  }

  return { score: clamp(risk), details, factor: 'vehicle', label: 'Vehicle Risk' }
}

/**
 * Load-specific risk — weight, distance, hazmat, tight deadlines
 */
export function loadFactor(load) {
  let risk = 5
  const details = []

  if (!load) return { score: 5, details: [], factor: 'load', label: 'Load Risk' }

  // Distance
  const miles = load.miles || load.distance || 0
  if (miles > 1000) {
    risk += 15
    details.push('Long haul (1000+ miles)')
  } else if (miles > 500) {
    risk += 8
    details.push('Medium haul (500+ miles)')
  }

  // Weight
  const weight = load.weight || 0
  if (weight > 44000) {
    risk += 15
    details.push('Heavy load (44K+ lbs)')
  } else if (weight > 40000) {
    risk += 8
    details.push('Near max weight')
  }

  // Hazmat
  if (load.hazmat || load.is_hazmat || load.equipment_type === 'hazmat') {
    risk += 25
    details.push('Hazmat load')
  }

  // Tight delivery window
  if (load.pickup_date && load.delivery_date) {
    const pickupTime = new Date(load.pickup_date).getTime()
    const deliveryTime = new Date(load.delivery_date).getTime()
    const windowHours = (deliveryTime - pickupTime) / 3600000
    const driveHours = miles / 50 // ~50mph avg
    if (driveHours > 0 && windowHours > 0 && driveHours / windowHours > 0.8) {
      risk += 15
      details.push('Tight delivery schedule')
    }
  }

  return { score: clamp(risk), details, factor: 'load', label: 'Load Risk' }
}

/**
 * Weather risk — based on weather conditions at origin/destination
 * Accepts weather data from NWS API or manual input
 */
export function weatherFactor(weather) {
  let risk = 0
  const details = []

  if (!weather) return { score: 0, details: ['No weather data'], factor: 'weather', label: 'Weather Risk' }

  const condition = (weather.condition || weather.shortForecast || '').toLowerCase()

  // Severe conditions
  if (/tornado|hurricane|blizzard|ice storm|severe thunder/i.test(condition)) {
    risk += 80
    details.push(`Severe: ${weather.condition || weather.shortForecast}`)
  }
  // Winter conditions
  else if (/snow|freezing|ice|sleet|winter/i.test(condition)) {
    risk += 40
    details.push(`Winter weather: ${weather.condition || weather.shortForecast}`)
  }
  // Rain/storms
  else if (/thunderstorm|heavy rain|storm/i.test(condition)) {
    risk += 30
    details.push(`Storms: ${weather.condition || weather.shortForecast}`)
  }
  // Light rain/fog
  else if (/rain|drizzle|fog|mist|haze/i.test(condition)) {
    risk += 15
    details.push(`Reduced visibility: ${weather.condition || weather.shortForecast}`)
  }
  // Wind
  if (weather.windSpeed) {
    const wind = parseInt(weather.windSpeed) || 0
    if (wind >= 40) {
      risk += 25
      details.push(`High winds: ${weather.windSpeed}`)
    } else if (wind >= 25) {
      risk += 10
      details.push(`Moderate winds: ${weather.windSpeed}`)
    }
  }

  // Temperature extremes
  if (weather.temperature !== undefined) {
    const temp = weather.temperature
    if (temp <= 20) {
      risk += 15
      details.push(`Extreme cold: ${temp}°F`)
    } else if (temp >= 105) {
      risk += 10
      details.push(`Extreme heat: ${temp}°F — tire/engine risk`)
    }
  }

  return { score: clamp(risk), details, factor: 'weather', label: 'Weather Risk' }
}

/**
 * Behavior risk — past driving behavior, scorecard, CSA points
 */
export function behaviorFactor(driver, incidents, csaPoints) {
  let risk = 5
  const details = []

  // CSA points
  const points = csaPoints || driver.csa_points || 0
  if (points >= 10) {
    risk += 35
    details.push(`High CSA points: ${points}`)
  } else if (points >= 5) {
    risk += 20
    details.push(`Moderate CSA points: ${points}`)
  } else if (points > 0) {
    risk += 5
    details.push(`CSA points: ${points}`)
  }

  // Recent accidents specifically
  const accidents = (incidents || []).filter(i =>
    (i.driver_name === (driver.full_name || driver.name)) &&
    i.incident_type === 'accident' &&
    daysSince(i.incident_date) < 365
  )
  if (accidents.length > 0) {
    risk += accidents.length * 25
    details.push(`${accidents.length} accident(s) in past year`)
  }

  // Safety violations
  const safetyViolations = (incidents || []).filter(i =>
    (i.driver_name === (driver.full_name || driver.name)) &&
    (i.incident_type === 'safety_violation' || i.incident_type === 'traffic_violation') &&
    daysSince(i.incident_date) < 365
  )
  if (safetyViolations.length > 0) {
    risk += safetyViolations.length * 10
    details.push(`${safetyViolations.length} violation(s) in past year`)
  }

  return { score: clamp(risk), details, factor: 'behavior', label: 'Behavior Risk' }
}

/**
 * Time-of-day risk — crashes are higher at night and early morning
 * FMCSA data: peak crash times 6-8 AM and 3-6 PM
 */
export function timeFactor(departureTime) {
  let risk = 5
  const details = []

  const hour = departureTime ? new Date(departureTime).getHours() : new Date().getHours()

  if (hour >= 0 && hour < 5) {
    risk += 30
    details.push('Late night departure (12-5 AM)')
  } else if (hour >= 5 && hour < 7) {
    risk += 15
    details.push('Early morning departure')
  } else if (hour >= 15 && hour < 18) {
    risk += 10
    details.push('Rush hour departure (3-6 PM)')
  }

  // Weekend (Sat/Sun)
  const day = departureTime ? new Date(departureTime).getDay() : new Date().getDay()
  if (day === 0 || day === 6) {
    risk += 5
    details.push('Weekend trip')
  }

  return { score: clamp(risk), details, factor: 'time', label: 'Time Risk' }
}

// ─── Composite Risk Score ─────────────────────────────────────────────────────

/**
 * Calculate overall crash risk score for a driver + optional load
 *
 * @param {object} driver - driver record
 * @param {object} options - { vehicle, load, hosLogs, incidents, complianceChecks, weather, csaPoints, departureTime }
 * @returns {object} - { score, level, color, factors[], recommendations[], summary }
 */
export function calculateCrashRisk(driver, options = {}) {
  const { vehicle, load, hosLogs, incidents, complianceChecks, weather, csaPoints, departureTime } = options

  const factors = [
    fatigueFactor(driver, hosLogs),
    complianceFactor(driver, complianceChecks),
    experienceFactor(driver, incidents),
    vehicleFactor(vehicle),
    loadFactor(load),
    weatherFactor(weather),
    behaviorFactor(driver, incidents, csaPoints),
    timeFactor(departureTime),
  ]

  // Weighted composite score
  const weightKeys = Object.keys(WEIGHTS)
  let totalScore = 0
  for (const factor of factors) {
    const w = WEIGHTS[factor.factor] || 0
    totalScore += factor.score * w
  }

  const score = Math.round(clamp(totalScore))

  // Risk level
  let level, color
  if (score >= 75) {
    level = 'CRITICAL'
    color = '#ef4444'
  } else if (score >= 50) {
    level = 'HIGH'
    color = '#f97316'
  } else if (score >= 30) {
    level = 'MODERATE'
    color = '#f59e0b'
  } else if (score >= 15) {
    level = 'LOW'
    color = '#22c55e'
  } else {
    level = 'MINIMAL'
    color = '#10b981'
  }

  // Generate recommendations based on top risk factors
  const recommendations = []
  const sorted = [...factors].sort((a, b) => b.score - a.score)

  for (const f of sorted) {
    if (f.score >= 30 && f.factor === 'fatigue') {
      recommendations.push({ priority: 'high', action: 'Driver should take a rest break before departure', factor: 'fatigue' })
    }
    if (f.score >= 30 && f.factor === 'weather') {
      recommendations.push({ priority: 'high', action: 'Delay departure or use alternate route — adverse weather', factor: 'weather' })
    }
    if (f.score >= 30 && f.factor === 'vehicle') {
      recommendations.push({ priority: 'high', action: 'Vehicle inspection required before dispatch', factor: 'vehicle' })
    }
    if (f.score >= 30 && f.factor === 'compliance') {
      recommendations.push({ priority: 'critical', action: 'Resolve compliance violations before dispatch', factor: 'compliance' })
    }
    if (f.score >= 30 && f.factor === 'behavior') {
      recommendations.push({ priority: 'high', action: 'Consider assigning to a lower-risk driver', factor: 'behavior' })
    }
    if (f.score >= 20 && f.factor === 'load') {
      recommendations.push({ priority: 'medium', action: 'Extra caution — heavy/long haul or hazmat', factor: 'load' })
    }
    if (f.score >= 20 && f.factor === 'time') {
      recommendations.push({ priority: 'medium', action: 'Consider rescheduling to daylight hours', factor: 'time' })
    }
    if (f.score >= 20 && f.factor === 'experience') {
      recommendations.push({ priority: 'medium', action: 'Pair with experienced driver or assign shorter route', factor: 'experience' })
    }
  }

  const summary = score >= 75
    ? 'CRITICAL risk — do not dispatch without mitigation'
    : score >= 50
    ? 'HIGH risk — review all factors before dispatching'
    : score >= 30
    ? 'MODERATE risk — proceed with caution'
    : 'LOW risk — clear to dispatch'

  return {
    score,
    level,
    color,
    factors,
    recommendations,
    summary,
    driverName: driver.full_name || driver.name || 'Unknown',
    timestamp: new Date().toISOString(),
  }
}

/**
 * Calculate fleet-wide risk summary
 * @param {array} drivers
 * @param {object} options - { vehicles, loads, hosLogs, incidents, complianceChecks, weather }
 * @returns {object} - { averageScore, highRiskDrivers[], riskDistribution, recommendations[] }
 */
export function calculateFleetRisk(drivers, options = {}) {
  const { vehicles = [], loads = [], hosLogs, incidents, complianceChecks, weather } = options

  const results = (drivers || []).map(driver => {
    // Match vehicle to driver
    const vehicle = vehicles.find(v =>
      v.assigned_driver === driver.id ||
      v.driver_name === (driver.full_name || driver.name)
    )

    // Find active load for this driver
    const activeLoad = loads.find(l =>
      l.driver === (driver.full_name || driver.name) ||
      l.assigned_driver === driver.id
    )

    // Get driver-specific compliance checks
    const driverCompliance = (complianceChecks || []).filter(c =>
      c.entityId === driver.id || c.entity === (driver.full_name || driver.name)
    )

    return calculateCrashRisk(driver, {
      vehicle,
      load: activeLoad,
      hosLogs,
      incidents,
      complianceChecks: driverCompliance,
      weather,
    })
  })

  const scores = results.map(r => r.score)
  const avg = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0

  return {
    averageScore: avg,
    driverRisks: results,
    highRiskDrivers: results.filter(r => r.score >= 50),
    moderateRiskDrivers: results.filter(r => r.score >= 30 && r.score < 50),
    lowRiskDrivers: results.filter(r => r.score < 30),
    riskDistribution: {
      critical: results.filter(r => r.level === 'CRITICAL').length,
      high: results.filter(r => r.level === 'HIGH').length,
      moderate: results.filter(r => r.level === 'MODERATE').length,
      low: results.filter(r => r.level === 'LOW').length,
      minimal: results.filter(r => r.level === 'MINIMAL').length,
    },
    timestamp: new Date().toISOString(),
  }
}

// ─── Geofence Safety Zones ────────────────────────────────────────────────────

const HIGH_RISK_ZONES = [
  { name: 'Donner Pass, CA', lat: 39.3177, lng: -120.3291, radius: 20, risk: 'winter', detail: 'Steep grades + severe winter weather' },
  { name: 'Grapevine, CA (I-5)', lat: 34.9361, lng: -118.8642, radius: 15, risk: 'grade', detail: '6% grade, frequent truck restrictions' },
  { name: 'Eisenhower Tunnel, CO', lat: 39.6803, lng: -105.9139, radius: 10, risk: 'altitude', detail: '11,158ft elevation, hazmat restricted' },
  { name: 'Cabbage Patch, MT (I-90)', lat: 46.3669, lng: -112.5339, radius: 10, risk: 'grade', detail: 'Steep descent, frequent rollovers' },
  { name: 'Monteagle, TN (I-24)', lat: 35.2384, lng: -85.8394, radius: 10, risk: 'grade', detail: 'Steep grade, mandatory truck speed' },
  { name: 'Snoqualmie Pass, WA', lat: 47.4254, lng: -121.4159, radius: 15, risk: 'winter', detail: 'Chain requirements in winter' },
  { name: 'Tehachapi Pass, CA', lat: 35.1331, lng: -118.5869, radius: 15, risk: 'wind', detail: 'Extreme crosswinds' },
  { name: 'Vail Pass, CO (I-70)', lat: 39.5316, lng: -106.2129, radius: 10, risk: 'grade', detail: '7% grade, mandatory chain law' },
  { name: 'Wolf Creek Pass, CO', lat: 37.4827, lng: -106.8017, radius: 10, risk: 'grade', detail: '10,857ft, steep switchbacks' },
  { name: 'Wheeler Ridge, CA', lat: 34.9478, lng: -118.9506, radius: 10, risk: 'wind', detail: 'Wind speed alerts common' },
]

/**
 * Check if a route passes through high-risk zones
 * @param {object} origin - { lat, lng }
 * @param {object} destination - { lat, lng }
 * @returns {array} - matching risk zones
 */
export function checkRouteRiskZones(origin, destination) {
  if (!origin || !destination) return []

  // Simple bounding box check — if a zone falls between origin and dest (with buffer)
  const minLat = Math.min(origin.lat, destination.lat) - 1
  const maxLat = Math.max(origin.lat, destination.lat) + 1
  const minLng = Math.min(origin.lng, destination.lng) - 1
  const maxLng = Math.max(origin.lng, destination.lng) + 1

  return HIGH_RISK_ZONES.filter(zone =>
    zone.lat >= minLat && zone.lat <= maxLat &&
    zone.lng >= minLng && zone.lng <= maxLng
  )
}

/**
 * Get all known high-risk zones (for map display)
 */
export function getHighRiskZones() {
  return HIGH_RISK_ZONES
}

// ─── ADVANCED SAFETY FEATURES ────────────────────────────────────────────────
// These go beyond what any TMS currently offers — designed for FMCSA/SBIR level

/**
 * Advanced Fatigue Detection — catches danger EVEN when driver is HOS-legal
 *
 * FMCSA data: 13% of CMV crashes are fatigue-related. Many happen when drivers
 * are technically within HOS limits but have cumulative fatigue patterns.
 *
 * This analyzes: consecutive work days, short rest patterns, time-of-day exposure,
 * load history patterns, and circadian rhythm disruption.
 *
 * @param {object} driver - driver record
 * @param {array} recentLoads - last 14 days of loads for this driver
 * @param {array} hosLogs - HOS entries for pattern analysis
 * @returns {object} - { fatigueScore, riskLevel, patterns[], recommendations[], legal, dangerous }
 */
export function detectAdvancedFatigue(driver, recentLoads = [], hosLogs = []) {
  let score = 0
  const patterns = []
  const recommendations = []

  // ── Pattern 1: Consecutive work days without full reset ──
  // 34-hour restart resets weekly clock, but working 6+ days straight is dangerous
  const workDays = new Set()
  for (const load of recentLoads) {
    const pickup = load.pickup_date || load.pickup
    const delivery = load.delivery_date || load.delivery
    if (pickup) {
      const d = new Date(pickup)
      if (!isNaN(d)) workDays.add(d.toISOString().slice(0, 10))
    }
    if (delivery) {
      const d = new Date(delivery)
      if (!isNaN(d)) workDays.add(d.toISOString().slice(0, 10))
    }
  }

  // Count consecutive recent work days
  let consecutiveDays = 0
  const today = new Date()
  for (let i = 0; i < 14; i++) {
    const checkDate = new Date(today)
    checkDate.setDate(checkDate.getDate() - i)
    const dateStr = checkDate.toISOString().slice(0, 10)
    if (workDays.has(dateStr)) {
      consecutiveDays++
    } else {
      break
    }
  }

  if (consecutiveDays >= 7) {
    score += 35
    patterns.push({ type: 'consecutive_days', value: consecutiveDays, severity: 'critical', description: `${consecutiveDays} consecutive work days — fatigue accumulates even with daily rest` })
    recommendations.push({ priority: 'critical', action: `Driver has worked ${consecutiveDays} straight days. Schedule 34-hour restart immediately.` })
  } else if (consecutiveDays >= 5) {
    score += 20
    patterns.push({ type: 'consecutive_days', value: consecutiveDays, severity: 'high', description: `${consecutiveDays} consecutive work days` })
    recommendations.push({ priority: 'high', action: `Consider giving driver a rest day — ${consecutiveDays} consecutive days on duty.` })
  } else if (consecutiveDays >= 4) {
    score += 10
    patterns.push({ type: 'consecutive_days', value: consecutiveDays, severity: 'moderate', description: `${consecutiveDays} consecutive work days` })
  }

  // ── Pattern 2: Short rest periods (legal 10hr off-duty, but < 12hr is still fatiguing) ──
  const shortRestCount = (hosLogs || []).filter(log => {
    if (log.status !== 'off_duty' && log.status !== 'sleeper') return false
    const hours = log.duration_hours || 0
    return hours >= 10 && hours < 12 // Legal but short
  }).length

  if (shortRestCount >= 3) {
    score += 20
    patterns.push({ type: 'short_rest', value: shortRestCount, severity: 'high', description: `${shortRestCount} minimum-rest periods in recent history (10-12hr off-duty)` })
    recommendations.push({ priority: 'high', action: 'Driver is consistently taking minimum rest. Encourage longer off-duty periods.' })
  } else if (shortRestCount >= 2) {
    score += 10
    patterns.push({ type: 'short_rest', value: shortRestCount, severity: 'moderate', description: `${shortRestCount} short rest periods recently` })
  }

  // ── Pattern 3: Night driving exposure ──
  // Circadian low: 2am-6am = highest crash risk period (FMCSA LTCCS)
  const nightLoads = recentLoads.filter(load => {
    const pickup = load.pickup_date || load.pickup
    if (!pickup) return false
    const hour = new Date(pickup).getHours()
    return hour >= 22 || hour <= 6
  }).length

  if (nightLoads >= 3) {
    score += 20
    patterns.push({ type: 'night_driving', value: nightLoads, severity: 'high', description: `${nightLoads} night dispatches (10PM-6AM) in recent period` })
    recommendations.push({ priority: 'high', action: 'Reduce night driving assignments — circadian disruption increases crash risk 3x.' })
  } else if (nightLoads >= 1) {
    score += 8
    patterns.push({ type: 'night_driving', value: nightLoads, severity: 'moderate', description: `${nightLoads} night dispatch(es)` })
  }

  // ── Pattern 4: Back-to-back long hauls ──
  const longHauls = recentLoads.filter(l => (parseFloat(l.miles) || 0) > 400)
  const recentLongHauls = longHauls.slice(0, 5) // last 5 loads

  if (recentLongHauls.length >= 3) {
    score += 15
    patterns.push({ type: 'back_to_back_long', value: recentLongHauls.length, severity: 'high', description: `${recentLongHauls.length} long hauls (400+ mi) back-to-back` })
    recommendations.push({ priority: 'medium', action: 'Mix in shorter runs to reduce cumulative fatigue.' })
  }

  // ── Pattern 5: Weekly hours trend (approaching limits) ──
  const weeklyHours = driver.weekly_hours || 0
  const dailyAvg = consecutiveDays > 0 ? weeklyHours / Math.min(consecutiveDays, 7) : 0

  if (dailyAvg >= 10) {
    score += 15
    patterns.push({ type: 'high_daily_average', value: Math.round(dailyAvg * 10) / 10, severity: 'high', description: `Averaging ${dailyAvg.toFixed(1)} hours/day — fatigue risk compounds` })
  }

  const fatigueScore = clamp(score)
  const legal = (driver.driving_hours_used || 0) <= 11 && weeklyHours <= 60
  const dangerous = fatigueScore >= 40

  return {
    fatigueScore,
    riskLevel: fatigueScore >= 60 ? 'CRITICAL' : fatigueScore >= 40 ? 'HIGH' : fatigueScore >= 20 ? 'MODERATE' : 'LOW',
    patterns,
    recommendations,
    legal,
    dangerous,
    summary: legal && dangerous
      ? `DANGER: Driver is HOS-legal but shows fatigue patterns (score: ${fatigueScore}). AI recommends rest.`
      : legal && !dangerous
      ? `Driver is HOS-legal and fatigue indicators are normal.`
      : `Driver has HOS issues that must be resolved.`,
    consecutiveWorkDays: consecutiveDays,
    weeklyHours,
  }
}

/**
 * CSA Score Predictor — forecasts CSA score 6 months forward
 *
 * Uses current incidents, violations, and inspection data to project
 * where the carrier's CSA score is heading. Helps carriers fix issues
 * BEFORE they trigger an FMCSA intervention.
 *
 * FMCSA BASIC categories: Unsafe Driving, HOS, Driver Fitness,
 * Drugs/Alcohol, Vehicle Maintenance, Hazmat, Crash Indicator
 *
 * @param {array} incidents - driver_incidents records
 * @param {array} drivers - all driver records
 * @param {array} vehicles - all vehicle records
 * @returns {object} - { currentScore, projectedScore, trend, basicScores, alerts[], recommendations[] }
 */
export function predictCSAScore(incidents = [], drivers = [], vehicles = []) {
  const now = new Date()
  const sixMonthsAgo = new Date(now)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const twelveMonthsAgo = new Date(now)
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  // Categorize incidents into FMCSA BASIC categories
  const basics = {
    unsafe_driving: { points: 0, count: 0, threshold: 65, label: 'Unsafe Driving' },
    hos: { points: 0, count: 0, threshold: 65, label: 'Hours of Service' },
    driver_fitness: { points: 0, count: 0, threshold: 80, label: 'Driver Fitness' },
    drugs_alcohol: { points: 0, count: 0, threshold: 80, label: 'Controlled Substances' },
    vehicle_maintenance: { points: 0, count: 0, threshold: 80, label: 'Vehicle Maintenance' },
    hazmat: { points: 0, count: 0, threshold: 80, label: 'Hazmat Compliance' },
    crash_indicator: { points: 0, count: 0, threshold: 65, label: 'Crash Indicator' },
  }

  const recentIncidents = incidents.filter(i => {
    const d = new Date(i.incident_date || i.created_at)
    return !isNaN(d) && d >= twelveMonthsAgo
  })
  const last6Incidents = incidents.filter(i => {
    const d = new Date(i.incident_date || i.created_at)
    return !isNaN(d) && d >= sixMonthsAgo
  })

  // Map incidents to BASIC categories
  for (const inc of recentIncidents) {
    const type = (inc.incident_type || inc.type || '').toLowerCase()
    const points = inc.csa_points || 0
    const severity = inc.severity || 'minor'
    const timeWeight = new Date(inc.incident_date || inc.created_at) >= sixMonthsAgo ? 3 : 1 // recent = 3x weight per FMCSA

    if (type.includes('speed') || type.includes('traffic') || type.includes('reckless')) {
      basics.unsafe_driving.points += points * timeWeight
      basics.unsafe_driving.count++
    } else if (type.includes('hos') || type.includes('hours') || type.includes('logbook')) {
      basics.hos.points += points * timeWeight
      basics.hos.count++
    } else if (type.includes('cdl') || type.includes('medical') || type.includes('fitness') || type.includes('qualification')) {
      basics.driver_fitness.points += points * timeWeight
      basics.driver_fitness.count++
    } else if (type.includes('drug') || type.includes('alcohol') || type.includes('dui')) {
      basics.drugs_alcohol.points += points * timeWeight
      basics.drugs_alcohol.count++
    } else if (type.includes('vehicle') || type.includes('maintenance') || type.includes('equipment') || type.includes('brake') || type.includes('tire')) {
      basics.vehicle_maintenance.points += points * timeWeight
      basics.vehicle_maintenance.count++
    } else if (type.includes('hazmat') || type.includes('dangerous')) {
      basics.hazmat.points += points * timeWeight
      basics.hazmat.count++
    } else if (type.includes('accident') || type.includes('crash') || type.includes('collision')) {
      basics.crash_indicator.points += points * timeWeight
      basics.crash_indicator.count++
    } else {
      // General safety violation — split across most likely categories
      basics.unsafe_driving.points += (points * timeWeight) * 0.5
      basics.unsafe_driving.count++
    }
  }

  // Calculate current composite score (0-100, lower is better)
  const activeBasics = Object.entries(basics).filter(([, v]) => v.count > 0)
  const totalPoints = Object.values(basics).reduce((sum, b) => sum + b.points, 0)
  const driverCount = Math.max(drivers.length, 1)
  const currentScore = clamp(Math.round(totalPoints / driverCount), 0, 100)

  // Project forward: if recent 6 months have MORE incidents than prior 6 months, trend is worsening
  const prior6Count = recentIncidents.length - last6Incidents.length
  const recent6Count = last6Incidents.length
  const monthlyRate = recent6Count / 6
  const projectedNew = Math.round(monthlyRate * 6) // next 6 months at current rate
  const projectedScore = clamp(Math.round(currentScore + (recent6Count > prior6Count ? projectedNew * 2 : -5)), 0, 100)

  const trend = projectedScore > currentScore + 5 ? 'WORSENING'
    : projectedScore < currentScore - 5 ? 'IMPROVING'
    : 'STABLE'

  // Generate alerts for categories approaching FMCSA intervention thresholds
  const alerts = []
  const recommendations = []

  for (const [key, basic] of Object.entries(basics)) {
    const percentile = clamp(Math.round((basic.points / Math.max(driverCount, 1)) * 10), 0, 100)
    basic.percentile = percentile

    if (percentile >= basic.threshold) {
      alerts.push({
        category: basic.label,
        severity: 'critical',
        message: `${basic.label} score (${percentile}%) exceeds FMCSA intervention threshold (${basic.threshold}%)`,
        action: 'Immediate corrective action required to avoid DOT audit',
      })
    } else if (percentile >= basic.threshold - 15) {
      alerts.push({
        category: basic.label,
        severity: 'warning',
        message: `${basic.label} score (${percentile}%) approaching intervention threshold (${basic.threshold}%)`,
        action: 'Take preventive action now',
      })
    }
  }

  // Driver fitness check — expired CDLs/medical cards affect score
  const expiredCDL = drivers.filter(d => {
    const days = daysUntil(d.cdl_expiry || d.license_expiry)
    return days !== null && days < 0
  })
  const expiredMedical = drivers.filter(d => {
    const days = daysUntil(d.medical_card_expiry || d.med_card_expiry)
    return days !== null && days < 0
  })

  if (expiredCDL.length > 0) {
    recommendations.push({ priority: 'critical', action: `${expiredCDL.length} driver(s) with expired CDL — renew immediately to avoid Driver Fitness violations` })
  }
  if (expiredMedical.length > 0) {
    recommendations.push({ priority: 'critical', action: `${expiredMedical.length} driver(s) with expired medical card — schedule DOT physicals` })
  }

  // Vehicle maintenance — check for overdue inspections
  const overdueInspections = vehicles.filter(v => {
    const days = daysUntil(v.annual_inspection_due || v.inspection_date)
    return days !== null && days < 0
  })
  if (overdueInspections.length > 0) {
    recommendations.push({ priority: 'critical', action: `${overdueInspections.length} vehicle(s) with overdue annual inspection — schedule immediately` })
  }

  if (trend === 'WORSENING') {
    recommendations.push({ priority: 'high', action: 'Incident rate is increasing. Implement targeted safety training and increase pre-trip inspections.' })
  }

  if (recommendations.length === 0) {
    recommendations.push({ priority: 'info', action: 'CSA indicators are healthy. Continue current safety practices.' })
  }

  return {
    currentScore,
    projectedScore,
    trend,
    trendEmoji: trend === 'WORSENING' ? '↑' : trend === 'IMPROVING' ? '↓' : '→',
    basics: Object.fromEntries(Object.entries(basics).map(([k, v]) => [k, { ...v }])),
    alerts,
    recommendations,
    incidentCount: { total: recentIncidents.length, last6Months: recent6Count, prior6Months: prior6Count },
    monthlyIncidentRate: Math.round(monthlyRate * 10) / 10,
    driverCount,
    summary: `CSA Score: ${currentScore} → projected ${projectedScore} (${trend}). ${alerts.length} alert(s), ${recentIncidents.length} incident(s) in 12 months.`,
  }
}

/**
 * Safety ROI Calculator — shows $ saved from crash prevention
 *
 * Uses FMCSA crash cost data:
 * - Average truck crash: $148,279 (FMCSA)
 * - Fatal crash: $7.2M+ (comprehensive cost per NHTSA)
 * - Injury crash: $354,000
 * - Property-damage-only: $30,000
 * - Average insurance claim: $91,000
 * - DOT audit cost (time + fines): $15,000-$50,000
 *
 * @param {object} fleetRisk - from calculateFleetRisk()
 * @param {number} driverCount - number of drivers
 * @param {number} monthsUsing - months on platform
 * @returns {object} - { estimatedSavings, crashesPrevented, insuranceImpact, auditReadiness, breakdown }
 */
export function calculateSafetyROI(fleetRisk, driverCount = 1, monthsUsing = 1) {
  const FMCSA_COSTS = {
    averageCrash: 148279,
    fatalCrash: 7200000,
    injuryCrash: 354000,
    propertyOnly: 30000,
    averageClaim: 91000,
    dotAuditCost: 25000,
    insurancePremiumPerTruck: 12000, // annual average
  }

  // Industry baseline crash rate: 0.78 crashes per million miles (FMCSA)
  // With safety monitoring: estimated 40-60% reduction
  const baselineCrashRate = 0.78 // per million miles
  const estimatedMilesPerDriver = 10000 * monthsUsing // ~10k mi/month per driver
  const totalFleetMiles = estimatedMilesPerDriver * driverCount

  const avgRiskScore = fleetRisk?.averageScore || 30
  // Risk reduction factor: lower score = more crashes prevented
  // Score of 0 = 60% reduction, score of 50 = 30% reduction, score of 100 = 0% reduction
  const riskReduction = Math.max(0, 0.60 - (avgRiskScore / 100) * 0.60)

  const baselineCrashes = (totalFleetMiles / 1000000) * baselineCrashRate
  const predictedCrashes = baselineCrashes * (1 - riskReduction)
  const crashesPrevented = Math.max(0, baselineCrashes - predictedCrashes)

  const dollarsSaved = Math.round(crashesPrevented * FMCSA_COSTS.averageCrash)
  const insuranceSavings = Math.round(driverCount * FMCSA_COSTS.insurancePremiumPerTruck * riskReduction * 0.15) // 15% of premium * reduction
  const auditSavings = avgRiskScore < 40 ? FMCSA_COSTS.dotAuditCost : 0 // audit-ready saves ~$25K

  // Blocked dispatches value
  const criticalDrivers = fleetRisk?.riskDistribution?.critical || 0
  const highRiskDrivers = fleetRisk?.riskDistribution?.high || 0
  const blockedDispatchValue = (criticalDrivers * FMCSA_COSTS.averageCrash * 0.3) + (highRiskDrivers * FMCSA_COSTS.averageCrash * 0.1)

  const totalSavings = dollarsSaved + insuranceSavings + auditSavings + Math.round(blockedDispatchValue)

  return {
    totalSavings,
    crashesPrevented: Math.round(crashesPrevented * 100) / 100,
    dollarsSavedFromCrashes: dollarsSaved,
    insuranceSavings,
    auditReadinessSavings: auditSavings,
    blockedDispatchValue: Math.round(blockedDispatchValue),
    riskReduction: Math.round(riskReduction * 100),
    fleetMiles: totalFleetMiles,
    breakdown: [
      { label: 'Crash Prevention', value: dollarsSaved, detail: `${(Math.round(crashesPrevented * 100) / 100)} estimated crashes prevented` },
      { label: 'Insurance Premium Reduction', value: insuranceSavings, detail: `${Math.round(riskReduction * 15)}% estimated premium reduction` },
      { label: 'DOT Audit Readiness', value: auditSavings, detail: avgRiskScore < 40 ? 'Audit-ready — no surprise costs' : 'Risk score too high for audit savings' },
      { label: 'High-Risk Dispatch Blocks', value: Math.round(blockedDispatchValue), detail: `${criticalDrivers + highRiskDrivers} high/critical risk drivers monitored` },
    ],
    costPerCrash: FMCSA_COSTS,
    summary: `Estimated $${totalSavings.toLocaleString()} saved over ${monthsUsing} month(s) with ${driverCount} driver(s). ${Math.round(crashesPrevented * 100) / 100} crashes prevented.`,
  }
}

/**
 * Near-Miss Pattern Detection — finds systemic risks before they become crashes
 *
 * Analyzes incident data to find recurring patterns:
 * - Same driver, multiple incidents
 * - Same route/location, multiple incidents
 * - Same time of day pattern
 * - Same incident type repeating
 * - Escalating severity trend
 *
 * @param {array} incidents - all driver_incidents
 * @param {array} loads - load history
 * @param {array} drivers - driver records
 * @returns {object} - { patterns[], riskScore, systemicIssues[], recommendations[] }
 */
export function detectNearMissPatterns(incidents = [], loads = [], drivers = []) {
  const patterns = []
  const systemicIssues = []
  const recommendations = []
  let riskScore = 0

  if (incidents.length === 0) {
    return {
      patterns: [],
      riskScore: 0,
      systemicIssues: [],
      recommendations: [{ priority: 'info', action: 'No incidents recorded. Continue monitoring.' }],
      summary: 'No incident patterns detected. Clean record.',
    }
  }

  // ── Pattern 1: Repeat offender drivers ──
  const driverIncidents = {}
  for (const inc of incidents) {
    const name = inc.driver_name || inc.driver_id || 'Unknown'
    if (!driverIncidents[name]) driverIncidents[name] = []
    driverIncidents[name].push(inc)
  }

  for (const [name, incs] of Object.entries(driverIncidents)) {
    if (incs.length >= 3) {
      riskScore += 25
      patterns.push({
        type: 'repeat_driver',
        driver: name,
        count: incs.length,
        severity: 'critical',
        description: `${name} has ${incs.length} incidents — systemic safety issue`,
      })
      systemicIssues.push(`Driver ${name}: ${incs.length} incidents. Types: ${[...new Set(incs.map(i => i.incident_type || i.type))].join(', ')}`)
      recommendations.push({ priority: 'critical', action: `${name}: ${incs.length} incidents. Require safety retraining or reassign to supervised routes.` })
    } else if (incs.length >= 2) {
      riskScore += 10
      patterns.push({
        type: 'repeat_driver',
        driver: name,
        count: incs.length,
        severity: 'warning',
        description: `${name} has ${incs.length} incidents — monitor closely`,
      })
    }
  }

  // ── Pattern 2: Location clusters ──
  const locationIncidents = {}
  for (const inc of incidents) {
    const loc = (inc.location || '').toLowerCase().trim()
    if (!loc) continue
    // Normalize location (city/state)
    const normalized = loc.split(',').slice(0, 2).join(',').trim()
    if (!locationIncidents[normalized]) locationIncidents[normalized] = []
    locationIncidents[normalized].push(inc)
  }

  for (const [loc, incs] of Object.entries(locationIncidents)) {
    if (incs.length >= 2) {
      riskScore += 15
      patterns.push({
        type: 'location_cluster',
        location: loc,
        count: incs.length,
        severity: 'high',
        description: `${incs.length} incidents near ${loc} — potential hazardous area`,
      })
      recommendations.push({ priority: 'high', action: `Multiple incidents near ${loc}. Add to route risk zones and alert drivers on this corridor.` })
    }
  }

  // ── Pattern 3: Time-of-day clustering ──
  const hourBuckets = { night: 0, earlyMorning: 0, morning: 0, afternoon: 0, evening: 0 }
  for (const inc of incidents) {
    const d = new Date(inc.incident_date || inc.created_at)
    if (isNaN(d)) continue
    const hour = d.getHours()
    if (hour >= 0 && hour < 5) hourBuckets.night++
    else if (hour >= 5 && hour < 8) hourBuckets.earlyMorning++
    else if (hour >= 8 && hour < 12) hourBuckets.morning++
    else if (hour >= 12 && hour < 17) hourBuckets.afternoon++
    else hourBuckets.evening++
  }

  const maxBucket = Object.entries(hourBuckets).sort((a, b) => b[1] - a[1])[0]
  if (maxBucket && maxBucket[1] >= 3) {
    riskScore += 10
    patterns.push({
      type: 'time_cluster',
      timeOfDay: maxBucket[0],
      count: maxBucket[1],
      severity: 'moderate',
      description: `${maxBucket[1]} incidents during ${maxBucket[0]} hours — schedule awareness needed`,
    })
  }

  // ── Pattern 4: Incident type concentration ──
  const typeCounts = {}
  for (const inc of incidents) {
    const type = inc.incident_type || inc.type || 'unknown'
    typeCounts[type] = (typeCounts[type] || 0) + 1
  }

  for (const [type, count] of Object.entries(typeCounts)) {
    if (count >= 3) {
      riskScore += 15
      patterns.push({
        type: 'type_concentration',
        incidentType: type,
        count,
        severity: 'high',
        description: `${count} "${type}" incidents — targeted intervention needed`,
      })
      recommendations.push({ priority: 'high', action: `Recurring "${type}" incidents (${count}x). Implement specific training or policy changes.` })
    }
  }

  // ── Pattern 5: Severity escalation ──
  const sorted = [...incidents].sort((a, b) =>
    new Date(a.incident_date || a.created_at) - new Date(b.incident_date || b.created_at)
  )
  const severityMap = { info: 1, minor: 2, major: 3, critical: 4 }
  let escalating = false
  if (sorted.length >= 3) {
    const recentSeverities = sorted.slice(-3).map(i => severityMap[i.severity || 'minor'] || 2)
    if (recentSeverities[2] > recentSeverities[1] && recentSeverities[1] > recentSeverities[0]) {
      escalating = true
      riskScore += 20
      patterns.push({
        type: 'severity_escalation',
        severity: 'critical',
        description: 'Incident severity is ESCALATING — last 3 incidents each worse than prior',
      })
      recommendations.push({ priority: 'critical', action: 'Severity escalation detected. Immediate safety intervention required before a major crash occurs.' })
    }
  }

  return {
    patterns,
    riskScore: clamp(riskScore),
    systemicIssues,
    recommendations: recommendations.length > 0 ? recommendations : [{ priority: 'info', action: 'No systemic patterns detected. Continue monitoring.' }],
    escalating,
    incidentCount: incidents.length,
    summary: `${patterns.length} pattern(s) detected across ${incidents.length} incidents. Risk: ${clamp(riskScore)}/100.${escalating ? ' WARNING: Severity escalation detected.' : ''}`,
  }
}

/**
 * Pre-Dispatch Safety Gate — comprehensive safety check that combines ALL safety systems
 *
 * This is the master function that dispatch calls. It runs:
 * 1. Crash risk scoring (8-factor model)
 * 2. Advanced fatigue detection (beyond HOS)
 * 3. Route risk zones (geofence)
 * 4. Weather risk (if coordinates available)
 *
 * Returns a GO / CAUTION / NO-GO decision with full reasoning.
 *
 * @param {object} params - { driver, vehicle, load, recentLoads, hosLogs, incidents, weather }
 * @returns {object} - { decision, score, reasons[], factors, fatigueAnalysis, routeRisks, recommendations[] }
 */
export function preDispatchSafetyGate({ driver, vehicle, load, recentLoads, hosLogs, incidents, weather }) {
  // Run all safety systems
  const crashRisk = calculateCrashRisk(driver, {
    vehicle,
    load,
    hosLogs,
    incidents,
    weather,
    departureTime: load?.pickup_date || load?.pickup || new Date().toISOString(),
  })

  const fatigueAnalysis = detectAdvancedFatigue(driver, recentLoads || [], hosLogs || [])

  // Check route risk zones
  let routeRisks = []
  if (load?.origin_coords && load?.dest_coords) {
    routeRisks = checkRouteRiskZones(load.origin_coords, load.dest_coords)
  }

  // Combine scores
  const combinedScore = Math.round(
    crashRisk.score * 0.6 +
    fatigueAnalysis.fatigueScore * 0.3 +
    (routeRisks.length > 0 ? 20 : 0) * 0.1
  )

  // Decision
  let decision, decisionColor
  if (combinedScore >= 70 || crashRisk.level === 'CRITICAL') {
    decision = 'NO-GO'
    decisionColor = '#ef4444'
  } else if (combinedScore >= 45 || crashRisk.level === 'HIGH' || fatigueAnalysis.dangerous) {
    decision = 'CAUTION'
    decisionColor = '#f59e0b'
  } else {
    decision = 'GO'
    decisionColor = '#22c55e'
  }

  const reasons = []
  if (crashRisk.score >= 75) reasons.push(`Crash risk CRITICAL (${crashRisk.score}/100)`)
  if (crashRisk.score >= 50) reasons.push(`Crash risk HIGH (${crashRisk.score}/100)`)
  if (fatigueAnalysis.dangerous && fatigueAnalysis.legal) reasons.push(`Driver is HOS-legal but AI detects fatigue patterns (${fatigueAnalysis.fatigueScore}/100)`)
  if (fatigueAnalysis.consecutiveWorkDays >= 6) reasons.push(`${fatigueAnalysis.consecutiveWorkDays} consecutive work days`)
  if (routeRisks.length > 0) reasons.push(`Route passes through ${routeRisks.length} high-risk zone(s): ${routeRisks.map(z => z.name).join(', ')}`)

  // Merge all recommendations
  const allRecs = [
    ...crashRisk.recommendations,
    ...fatigueAnalysis.recommendations,
    ...(routeRisks.length > 0 ? [{ priority: 'high', action: `Route includes hazardous zones: ${routeRisks.map(z => `${z.name} (${z.detail})`).join('; ')}` }] : []),
  ]

  return {
    decision,
    decisionColor,
    combinedScore,
    crashRisk,
    fatigueAnalysis,
    routeRisks,
    reasons,
    recommendations: allRecs,
    timestamp: new Date().toISOString(),
    driverName: driver.full_name || driver.name,
    summary: `${decision}: ${driver.full_name || driver.name} — combined safety score ${combinedScore}/100. ${reasons.join('. ') || 'All clear.'}`,
  }
}
