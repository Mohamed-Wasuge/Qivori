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
