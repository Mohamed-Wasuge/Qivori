/**
 * Trucking Company Simulation Engine
 * Powers realistic fake company experience with market rates, broker behavior,
 * driver tracking, check calls, load lifecycles, and day/week simulations.
 */

import { getMarketRate } from './marketRates.js';

// ---------------------------------------------------------------------------
// Seeded PRNG (Mulberry32) — reproducible but varied results
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let _rng = mulberry32(Date.now());

/** Reset the PRNG with a specific seed for reproducibility. */
export function setSeed(seed) {
  _rng = mulberry32(seed);
}

function rand() {
  return _rng();
}

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return min + rand() * (max - min);
}

function pick(arr) {
  return arr[Math.floor(rand() * arr.length)];
}

function pickWeighted(items, weights) {
  const total = weights.reduce((s, w) => s + w, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function generateId(prefix, len = 5) {
  const chars = '0123456789';
  let id = '';
  for (let i = 0; i < len; i++) id += chars[Math.floor(rand() * chars.length)];
  return `${prefix}${id}`;
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function isoString(d) {
  return d.toISOString();
}

function addMinutes(d, min) {
  return new Date(d.getTime() + min * 60000);
}

function addHours(d, hrs) {
  return addMinutes(d, hrs * 60);
}

// ---------------------------------------------------------------------------
// City & Lane Database
// ---------------------------------------------------------------------------

export const CITY_COORDS = {
  'Dallas, TX':        { lat: 32.7767, lng: -96.7970, state: 'TX' },
  'Atlanta, GA':       { lat: 33.7490, lng: -84.3880, state: 'GA' },
  'Chicago, IL':       { lat: 41.8781, lng: -87.6298, state: 'IL' },
  'Memphis, TN':       { lat: 35.1495, lng: -90.0490, state: 'TN' },
  'Los Angeles, CA':   { lat: 34.0522, lng: -118.2437, state: 'CA' },
  'Phoenix, AZ':       { lat: 33.4484, lng: -112.0740, state: 'AZ' },
  'Houston, TX':       { lat: 29.7604, lng: -95.3698, state: 'TX' },
  'Jacksonville, FL':  { lat: 30.3322, lng: -81.6557, state: 'FL' },
  'Charlotte, NC':     { lat: 35.2271, lng: -80.8431, state: 'NC' },
  'Miami, FL':         { lat: 25.7617, lng: -80.1918, state: 'FL' },
  'Denver, CO':        { lat: 39.7392, lng: -104.9903, state: 'CO' },
  'Kansas City, MO':   { lat: 39.0997, lng: -94.5786, state: 'MO' },
  'Nashville, TN':     { lat: 36.1627, lng: -86.7816, state: 'TN' },
  'Louisville, KY':    { lat: 38.2527, lng: -85.7585, state: 'KY' },
  'Indianapolis, IN':  { lat: 39.7684, lng: -86.1581, state: 'IN' },
  'Detroit, MI':       { lat: 42.3314, lng: -83.0458, state: 'MI' },
  'Columbus, OH':      { lat: 39.9612, lng: -82.9988, state: 'OH' },
  'Pittsburgh, PA':    { lat: 40.4406, lng: -79.9959, state: 'PA' },
  'Las Vegas, NV':     { lat: 36.1699, lng: -115.1398, state: 'NV' },
  'Sacramento, CA':    { lat: 38.5816, lng: -121.4944, state: 'CA' },
  'Orlando, FL':       { lat: 28.5383, lng: -81.3792, state: 'FL' },
  'San Antonio, TX':   { lat: 29.4241, lng: -98.4936, state: 'TX' },
  'Little Rock, AR':   { lat: 34.7465, lng: -92.2896, state: 'AR' },
};

export const LANE_DATABASE = [
  { origin: 'Dallas, TX',        dest: 'Atlanta, GA',       miles: 780 },
  { origin: 'Chicago, IL',       dest: 'Memphis, TN',       miles: 530 },
  { origin: 'Los Angeles, CA',   dest: 'Phoenix, AZ',       miles: 370 },
  { origin: 'Houston, TX',       dest: 'Jacksonville, FL',  miles: 985 },
  { origin: 'Atlanta, GA',       dest: 'Charlotte, NC',     miles: 245 },
  { origin: 'Memphis, TN',       dest: 'Indianapolis, IN',  miles: 465 },
  { origin: 'Dallas, TX',        dest: 'Denver, CO',        miles: 780 },
  { origin: 'Chicago, IL',       dest: 'Columbus, OH',      miles: 350 },
  { origin: 'Houston, TX',       dest: 'Dallas, TX',        miles: 240 },
  { origin: 'Jacksonville, FL',  dest: 'Nashville, TN',     miles: 635 },
  { origin: 'Phoenix, AZ',       dest: 'Las Vegas, NV',     miles: 300 },
  { origin: 'Charlotte, NC',     dest: 'Miami, FL',         miles: 650 },
  { origin: 'Denver, CO',        dest: 'Kansas City, MO',   miles: 600 },
  { origin: 'Nashville, TN',     dest: 'Louisville, KY',    miles: 175 },
  { origin: 'Indianapolis, IN',  dest: 'Detroit, MI',       miles: 290 },
  { origin: 'Los Angeles, CA',   dest: 'Sacramento, CA',    miles: 385 },
  { origin: 'Atlanta, GA',       dest: 'Orlando, FL',       miles: 440 },
  { origin: 'Dallas, TX',        dest: 'San Antonio, TX',   miles: 275 },
  { origin: 'Memphis, TN',       dest: 'Little Rock, AR',   miles: 135 },
  { origin: 'Columbus, OH',      dest: 'Pittsburgh, PA',    miles: 185 },
];

// ---------------------------------------------------------------------------
// Broker Database
// ---------------------------------------------------------------------------

const BROKER_NAMES_LARGE = [
  'TQL', 'CH Robinson', 'Echo Global Logistics', 'Coyote Logistics',
  'XPO Logistics', 'Landstar', 'JB Hunt Brokerage', 'Schneider Brokerage',
  'Werner Logistics', 'RXO', 'GlobalTranz', 'BNSF Logistics',
];

const BROKER_NAMES_MID = [
  'Midwest Freight Solutions', 'Pacific Coast Logistics', 'Southeast Transport Group',
  'Great Plains Freight', 'Heartland Logistics', 'Sunbelt Transport Services',
  'Cardinal Freight Management', 'Blue Ridge Logistics', 'Prairie Dispatch Co',
  'Gulf Coast Freight Partners', 'Mountain West Logistics', 'Tri-State Carriers Group',
];

const BROKER_NAMES_SMALL = [
  'Quick Haul Freight', 'Metro Dispatch LLC', 'Allied Route Logistics',
  'Iron Horse Brokerage', 'First Mile Transport', 'Rapid Lane Freight',
  'Apex Load Brokers', 'CrossCountry Dispatch', 'Summit Freight Co',
  'Heritage Transport Solutions', 'Liberty Load Partners', 'Vanguard Freight Services',
];

const ALL_BROKER_NAMES = [...BROKER_NAMES_LARGE, ...BROKER_NAMES_MID, ...BROKER_NAMES_SMALL];

const BROKER_TYPES = ['aggressive', 'fair', 'premium', 'slow'];
const BROKER_TYPE_WEIGHTS = [30, 40, 15, 15];

const PAYMENT_TERMS = ['Net 30', 'Net 15', 'Quick Pay', 'Same Day'];
const PAYMENT_TERM_WEIGHTS_BY_TYPE = {
  aggressive: [50, 30, 15, 5],
  fair:       [40, 30, 20, 10],
  premium:    [20, 20, 35, 25],
  slow:       [60, 25, 10, 5],
};

const COMMODITIES = [
  'General Freight', 'Consumer Electronics', 'Auto Parts', 'Building Materials',
  'Packaged Food', 'Beverages', 'Paper Products', 'Household Goods',
  'Machinery Parts', 'Retail Goods', 'Textiles', 'Plastic Products',
  'Metal Fabrications', 'Agricultural Products', 'Chemical Products (non-haz)',
  'Furniture', 'Sporting Goods', 'Pharmaceutical Supplies',
];

const EQUIPMENT_TYPES = ['Dry Van', 'Reefer', 'Flatbed', 'Step Deck', 'Power Only'];
const EQUIPMENT_WEIGHTS = [45, 20, 15, 10, 10];

// ---------------------------------------------------------------------------
// Broker Simulation
// ---------------------------------------------------------------------------

/**
 * Generate a simulated broker with personality traits.
 * @returns {object} Broker profile
 */
export function simulateBroker() {
  const type = pickWeighted(BROKER_TYPES, BROKER_TYPE_WEIGHTS);
  const name = pick(ALL_BROKER_NAMES);
  const paymentWeights = PAYMENT_TERM_WEIGHTS_BY_TYPE[type];

  const brokerConfig = {
    aggressive: {
      responseTime: randInt(2, 15),
      negotiationWillingness: randInt(20, 50),
      rateMultiplier: randFloat(0.82, 0.92),
      counterIncrease: randFloat(0.05, 0.10),
      pressureTactics: true,
    },
    fair: {
      responseTime: randInt(5, 30),
      negotiationWillingness: randInt(50, 80),
      rateMultiplier: randFloat(0.95, 1.05),
      counterIncrease: randFloat(0.02, 0.06),
      pressureTactics: false,
    },
    premium: {
      responseTime: randInt(1, 10),
      negotiationWillingness: randInt(10, 35),
      rateMultiplier: randFloat(1.08, 1.22),
      counterIncrease: randFloat(0.01, 0.03),
      pressureTactics: true,
    },
    slow: {
      responseTime: randInt(60, 240),
      negotiationWillingness: randInt(15, 60),
      rateMultiplier: randFloat(0.88, 1.08),
      counterIncrease: randFloat(0.03, 0.08),
      pressureTactics: false,
    },
  };

  const cfg = brokerConfig[type];
  const contactFirst = pick(['Mike', 'Sarah', 'Jason', 'Lisa', 'Kevin', 'Amanda', 'Derek', 'Rachel', 'Tom', 'Jennifer']);
  const contactLast = pick(['Williams', 'Johnson', 'Smith', 'Brown', 'Davis', 'Garcia', 'Martinez', 'Anderson', 'Taylor', 'Thomas']);

  return {
    name,
    type,
    contactName: `${contactFirst} ${contactLast}`,
    contactEmail: `${contactFirst.toLowerCase()}.${contactLast.toLowerCase()}@${name.toLowerCase().replace(/[^a-z]/g, '')}.com`,
    responseTime: cfg.responseTime,
    negotiationWillingness: cfg.negotiationWillingness,
    rateMultiplier: Math.round(cfg.rateMultiplier * 1000) / 1000,
    counterIncrease: Math.round(cfg.counterIncrease * 1000) / 1000,
    pressureTactics: cfg.pressureTactics,
    paymentTerms: pickWeighted(PAYMENT_TERMS, paymentWeights),
    ghostProbability: type === 'slow' ? randFloat(0.15, 0.35) : 0,
  };
}

// ---------------------------------------------------------------------------
// Load Offer Generation
// ---------------------------------------------------------------------------

/**
 * Generate a single realistic load offer.
 * @param {object} [opts]
 * @param {Date}   [opts.date]       - Date for the load
 * @param {string} [opts.equipment]  - Force equipment type
 * @param {string} [opts.homeBase]   - Preferred origin city
 * @returns {object} Load offer
 */
export function generateLoadOffer(opts = {}) {
  const date = opts.date || new Date();
  const equipment = opts.equipment || pickWeighted(EQUIPMENT_TYPES, EQUIPMENT_WEIGHTS);

  // Pick a lane — prefer lanes originating from homeBase if provided
  let lane;
  if (opts.homeBase) {
    const homeLanes = LANE_DATABASE.filter(l => l.origin === opts.homeBase);
    if (homeLanes.length > 0 && rand() < 0.6) {
      lane = pick(homeLanes);
    } else {
      lane = pick(LANE_DATABASE);
    }
  } else {
    lane = pick(LANE_DATABASE);
  }

  const originCity = lane.origin;
  const destCity = lane.dest;
  const originCoord = CITY_COORDS[originCity];
  const destCoord = CITY_COORDS[destCity];
  const miles = lane.miles;

  // Market rate with volatility
  const market = getMarketRate({
    originState: originCoord.state,
    destState: destCoord.state,
    equipment,
    miles,
    month: date.getMonth() + 1,
    dayOfWeek: date.getDay(),
  });

  const broker = simulateBroker();

  // Apply broker rate multiplier + ±10-20% market volatility
  const volatility = randFloat(-0.20, 0.20);
  const brokerRpm = market.avg * broker.rateMultiplier * (1 + volatility * 0.5);
  const roundedRpm = Math.round(brokerRpm * 100) / 100;
  const gross = Math.round(roundedRpm * miles);

  // Pickup is today or tomorrow
  const pickupOffset = rand() < 0.6 ? 0 : 1;
  const pickupDate = new Date(date);
  pickupDate.setDate(pickupDate.getDate() + pickupOffset);
  pickupDate.setHours(randInt(5, 14), randInt(0, 59), 0, 0);

  // Delivery based on transit time
  const transitHours = (miles / 55) + 2; // average speed + buffer
  const transitDays = Math.ceil(transitHours / 11); // 11hr driving day
  const deliveryDate = new Date(pickupDate);
  deliveryDate.setDate(deliveryDate.getDate() + transitDays);
  deliveryDate.setHours(randInt(6, 18), randInt(0, 59), 0, 0);

  const weight = randInt(18000, 44000);
  const commodity = pick(COMMODITIES);

  return {
    id: generateId('QB-'),
    origin: originCity,
    destination: destCity,
    originState: originCoord.state,
    destState: destCoord.state,
    originCoords: { lat: originCoord.lat, lng: originCoord.lng },
    destCoords: { lat: destCoord.lat, lng: destCoord.lng },
    miles,
    ratePerMile: roundedRpm,
    gross,
    equipment,
    broker,
    pickup_date: isoString(pickupDate),
    delivery_date: isoString(deliveryDate),
    weight,
    commodity,
    marketRate: market,
    postedAt: isoString(date),
    expiresMinutes: broker.type === 'premium' ? randInt(15, 45) : randInt(60, 240),
  };
}

// ---------------------------------------------------------------------------
// Driver Movement Simulation
// ---------------------------------------------------------------------------

const AVG_SPEED_MPH = 55;
const FUEL_STOP_INTERVAL_MI = 400;
const REST_INTERVAL_HRS = 4.5;
const MAX_DRIVING_HRS = 11;
const FUEL_STOP_DURATION_MIN = 25;
const REST_STOP_DURATION_MIN = 30;
const OVERNIGHT_DURATION_HRS = 10;

/**
 * Interpolate driver position between origin and destination.
 * @param {object} params
 * @param {{ lat: number, lng: number }} params.origin
 * @param {{ lat: number, lng: number }} params.destination
 * @param {number} params.totalMiles
 * @param {number} params.elapsedMinutes - Minutes since departure
 * @param {Date}   params.departureTime
 * @returns {object} Driver tracking state
 */
export function simulateDriverMovement({
  origin, destination, totalMiles, elapsedMinutes, departureTime,
}) {
  const speedVariance = randFloat(-5, 5);
  const effectiveSpeed = AVG_SPEED_MPH + speedVariance;

  // Calculate actual driving time accounting for stops
  let drivingMinutes = 0;
  let totalStopMinutes = 0;
  let fuelStops = 0;
  let restStops = 0;
  let overnights = 0;
  let currentDrivingStreak = 0; // hours
  let totalDrivingToday = 0; // hours
  let milesDriven = 0;
  let remaining = elapsedMinutes;

  while (remaining > 0 && milesDriven < totalMiles) {
    // Check if overnight rest needed
    if (totalDrivingToday >= MAX_DRIVING_HRS) {
      const overnightMin = OVERNIGHT_DURATION_HRS * 60;
      if (remaining >= overnightMin) {
        remaining -= overnightMin;
        totalStopMinutes += overnightMin;
        overnights++;
        totalDrivingToday = 0;
        currentDrivingStreak = 0;
        continue;
      } else {
        break; // still resting
      }
    }

    // Check if rest break needed
    if (currentDrivingStreak >= REST_INTERVAL_HRS) {
      if (remaining >= REST_STOP_DURATION_MIN) {
        remaining -= REST_STOP_DURATION_MIN;
        totalStopMinutes += REST_STOP_DURATION_MIN;
        restStops++;
        currentDrivingStreak = 0;
        continue;
      } else {
        break;
      }
    }

    // Check if fuel stop needed
    const nextFuelAt = (fuelStops + 1) * FUEL_STOP_INTERVAL_MI;
    const milesUntilFuel = nextFuelAt - milesDriven;
    const minutesUntilFuel = (milesUntilFuel / effectiveSpeed) * 60;

    if (milesDriven > 0 && milesUntilFuel <= 0) {
      if (remaining >= FUEL_STOP_DURATION_MIN) {
        remaining -= FUEL_STOP_DURATION_MIN;
        totalStopMinutes += FUEL_STOP_DURATION_MIN;
        fuelStops++;
        continue;
      } else {
        break;
      }
    }

    // Drive for a chunk (15 min increments)
    const driveChunk = Math.min(remaining, 15, minutesUntilFuel > 0 ? minutesUntilFuel : 15);
    const chunkMiles = (driveChunk / 60) * effectiveSpeed;
    milesDriven += chunkMiles;
    drivingMinutes += driveChunk;
    currentDrivingStreak += driveChunk / 60;
    totalDrivingToday += driveChunk / 60;
    remaining -= driveChunk;
  }

  milesDriven = Math.min(milesDriven, totalMiles);
  const milesRemaining = Math.max(0, totalMiles - milesDriven);
  const progress = totalMiles > 0 ? milesDriven / totalMiles : 1;

  // Interpolate position
  const lat = origin.lat + (destination.lat - origin.lat) * progress;
  const lng = origin.lng + (destination.lng - origin.lng) * progress;

  // Determine current status
  let status = 'driving';
  if (milesDriven >= totalMiles) {
    status = 'arrived';
  } else if (totalDrivingToday >= MAX_DRIVING_HRS) {
    status = 'sleeping';
  } else if (currentDrivingStreak >= REST_INTERVAL_HRS) {
    status = 'resting';
  } else if (remaining <= 0 && totalStopMinutes > 0) {
    // Check last stop type
    const lastStopWasFuel = fuelStops > 0 && milesDriven % FUEL_STOP_INTERVAL_MI < 20;
    status = lastStopWasFuel ? 'fueling' : 'resting';
  }

  // ETA calculation
  const etaMinutes = milesRemaining > 0
    ? (milesRemaining / effectiveSpeed) * 60 +
      Math.floor(milesRemaining / FUEL_STOP_INTERVAL_MI) * FUEL_STOP_DURATION_MIN +
      Math.floor((milesRemaining / effectiveSpeed) / REST_INTERVAL_HRS) * REST_STOP_DURATION_MIN +
      Math.floor((milesRemaining / effectiveSpeed) / MAX_DRIVING_HRS) * OVERNIGHT_DURATION_HRS * 60
    : 0;

  const currentTime = addMinutes(departureTime, elapsedMinutes);
  const eta = addMinutes(currentTime, etaMinutes);

  return {
    lat: Math.round(lat * 10000) / 10000,
    lng: Math.round(lng * 10000) / 10000,
    speed: status === 'driving' ? Math.round(effectiveSpeed) : 0,
    status,
    eta: isoString(eta),
    milesDriven: Math.round(milesDriven),
    milesRemaining: Math.round(milesRemaining),
    progress: Math.round(progress * 100),
    fuelStops,
    restStops,
    overnights,
    drivingMinutes: Math.round(drivingMinutes),
    stopMinutes: Math.round(totalStopMinutes),
    currentTime: isoString(currentTime),
  };
}

// ---------------------------------------------------------------------------
// Check Call Generation
// ---------------------------------------------------------------------------

const DELAY_REASONS = [
  'Traffic on I-40', 'Traffic on I-35', 'Traffic on I-10', 'Traffic on I-95',
  'Traffic on I-75', 'Traffic on I-20', 'Traffic on I-65', 'Traffic on I-80',
  'Waiting at shipper', 'Waiting at receiver', 'Slow dock operations',
  'Fuel stop', 'Scale backup', 'Weather delay', 'Tire issue - resolved',
  'Road construction delay', 'Accident ahead - rerouting', 'Weigh station queue',
  'Brake check stop', 'DOT inspection',
];

const ON_TIME_NOTES = [
  'Running on schedule', 'All clear, making good time', 'No issues to report',
  'Smooth sailing', 'On track for on-time delivery', 'Just passed state line, all good',
  'Highway is clear, maintaining speed', 'Loaded and rolling, no delays',
];

/**
 * Generate a single check call.
 * @param {object} params
 * @param {object} params.driverState - Current driver movement state
 * @param {string} params.origin - Origin city name
 * @param {string} params.destination - Destination city name
 * @param {Date}   params.time - Time of check call
 * @returns {object} Check call record
 */
export function generateCheckCall({ driverState, origin, destination, time }) {
  // 70% on time, 20% minor delay, 10% significant delay
  const delayRoll = rand();
  let delayMinutes = 0;
  let delayReason = null;

  if (delayRoll > 0.90) {
    // Significant delay: 1-3 hours
    delayMinutes = randInt(60, 180);
    delayReason = pick(DELAY_REASONS);
  } else if (delayRoll > 0.70) {
    // Minor delay: 15-45 min
    delayMinutes = randInt(15, 45);
    delayReason = pick(DELAY_REASONS);
  }

  const notes = delayMinutes > 0
    ? `${delayReason}. Estimated ${delayMinutes} min delay.`
    : pick(ON_TIME_NOTES);

  // Approximate location description
  const progress = driverState.progress || 0;
  let locationDesc;
  if (progress < 15) {
    locationDesc = `Near ${origin}`;
  } else if (progress > 85) {
    locationDesc = `Approaching ${destination}`;
  } else {
    locationDesc = `${progress}% en route, ${driverState.milesRemaining} mi remaining`;
  }

  return {
    time: isoString(time),
    location: {
      lat: driverState.lat,
      lng: driverState.lng,
      description: locationDesc,
    },
    status: driverState.status,
    eta: driverState.eta,
    notes,
    delayMinutes,
    delayReason,
    milesDriven: driverState.milesDriven,
    milesRemaining: driverState.milesRemaining,
  };
}

// ---------------------------------------------------------------------------
// Load Lifecycle Simulation
// ---------------------------------------------------------------------------

/**
 * Simulate a load through its full lifecycle with timestamps.
 * @param {object} load - A load offer (from generateLoadOffer)
 * @param {object} [opts]
 * @param {Date}   [opts.acceptedAt] - When the load was accepted
 * @param {string} [opts.driverName] - Driver assigned
 * @returns {object} Full lifecycle with events and timestamps
 */
export function simulateLoadLifecycle(load, opts = {}) {
  const acceptedAt = opts.acceptedAt || new Date(load.postedAt);
  const driverName = opts.driverName || 'Driver';

  const events = [];
  let cursor = new Date(acceptedAt);

  // 1. Rate Con Received
  events.push({
    step: 'rate_con_received',
    label: 'Rate Con Received',
    timestamp: isoString(cursor),
    duration: null,
  });

  // 2. Assigned to Driver (5-30 min)
  const assignDelay = randInt(5, 30);
  cursor = addMinutes(cursor, assignDelay);
  events.push({
    step: 'assigned',
    label: `Assigned to ${driverName}`,
    timestamp: isoString(cursor),
    duration: `${assignDelay} min`,
  });

  // 3. En Route to Pickup
  const pickupTime = new Date(load.pickup_date);
  // If pickup is in the future, driver departs to arrive on time
  // Otherwise simulate immediate departure
  const enRouteStart = cursor > pickupTime ? cursor : new Date(Math.max(cursor.getTime(), pickupTime.getTime() - 4 * 3600000));
  cursor = enRouteStart;
  events.push({
    step: 'en_route_pickup',
    label: 'En Route to Pickup',
    timestamp: isoString(cursor),
    duration: null,
  });

  // 4. At Pickup (arrive at pickup time or after transit to pickup)
  cursor = new Date(Math.max(cursor.getTime(), pickupTime.getTime()));
  events.push({
    step: 'at_pickup',
    label: 'Arrived at Pickup',
    timestamp: isoString(cursor),
    duration: null,
    location: load.origin,
  });

  // 5. Loaded (30 min - 2 hrs at shipper)
  const loadingTime = randInt(30, 120);
  const detention = loadingTime > 90;
  cursor = addMinutes(cursor, loadingTime);
  events.push({
    step: 'loaded',
    label: 'Loaded',
    timestamp: isoString(cursor),
    duration: `${loadingTime} min at shipper`,
    detention: detention ? { minutes: loadingTime - 60, note: 'Detention time exceeds 1 hour' } : null,
  });

  // 6. In Transit — generate check calls along the way
  const departureTime = new Date(cursor);
  events.push({
    step: 'in_transit',
    label: 'In Transit',
    timestamp: isoString(cursor),
    duration: null,
  });

  // Estimate total transit time
  const totalTransitMinutes = (load.miles / AVG_SPEED_MPH) * 60;
  const stopsOverhead = Math.floor(load.miles / FUEL_STOP_INTERVAL_MI) * FUEL_STOP_DURATION_MIN +
    Math.floor(totalTransitMinutes / 60 / REST_INTERVAL_HRS) * REST_STOP_DURATION_MIN +
    Math.floor(totalTransitMinutes / 60 / MAX_DRIVING_HRS) * OVERNIGHT_DURATION_HRS * 60;
  const totalTripMinutes = totalTransitMinutes + stopsOverhead;

  // Generate check calls every 2-4 hours
  const checkCalls = [];
  let checkCallTime = addHours(cursor, randFloat(2, 4));
  while (checkCallTime.getTime() < cursor.getTime() + totalTripMinutes * 60000) {
    const elapsed = (checkCallTime.getTime() - departureTime.getTime()) / 60000;
    const driverState = simulateDriverMovement({
      origin: load.originCoords,
      destination: load.destCoords,
      totalMiles: load.miles,
      elapsedMinutes: elapsed,
      departureTime,
    });

    if (driverState.status === 'arrived') break;

    const cc = generateCheckCall({
      driverState,
      origin: load.origin,
      destination: load.destination,
      time: checkCallTime,
    });
    checkCalls.push(cc);

    checkCallTime = addHours(checkCallTime, randFloat(2, 4));
  }

  // 7. At Delivery
  cursor = addMinutes(cursor, totalTripMinutes);
  events.push({
    step: 'at_delivery',
    label: 'Arrived at Delivery',
    timestamp: isoString(cursor),
    duration: `${Math.round(totalTripMinutes / 60)} hrs transit`,
    location: load.destination,
  });

  // 8. Delivered (30 min - 2 hrs at receiver)
  const unloadingTime = randInt(30, 120);
  const deliveryDetention = unloadingTime > 90;
  cursor = addMinutes(cursor, unloadingTime);
  events.push({
    step: 'delivered',
    label: 'Delivered',
    timestamp: isoString(cursor),
    duration: `${unloadingTime} min at receiver`,
    detention: deliveryDetention ? { minutes: unloadingTime - 60, note: 'Delivery detention exceeded 1 hour' } : null,
  });

  // 9. Invoiced (1-4 hours after delivery)
  const invoiceDelay = randInt(60, 240);
  cursor = addMinutes(cursor, invoiceDelay);
  const invoiceNumber = `QIV-${formatDate(cursor).replace(/-/g, '')}-${generateId('', 4)}`;
  events.push({
    step: 'invoiced',
    label: 'Invoice Generated',
    timestamp: isoString(cursor),
    duration: `${invoiceDelay} min after delivery`,
    invoiceNumber,
  });

  return {
    loadId: load.id,
    origin: load.origin,
    destination: load.destination,
    miles: load.miles,
    gross: load.gross,
    ratePerMile: load.ratePerMile,
    broker: load.broker.name,
    equipment: load.equipment,
    driver: driverName,
    events,
    checkCalls,
    invoiceNumber,
    lifecycle: {
      accepted: events[0].timestamp,
      assigned: events[1].timestamp,
      loaded: events[4].timestamp,
      delivered: events[7].timestamp,
      invoiced: events[8].timestamp,
    },
    totalDuration: {
      minutes: Math.round((cursor.getTime() - acceptedAt.getTime()) / 60000),
      formatted: formatDuration(Math.round((cursor.getTime() - acceptedAt.getTime()) / 60000)),
    },
  };
}

function formatDuration(minutes) {
  const days = Math.floor(minutes / 1440);
  const hrs = Math.floor((minutes % 1440) / 60);
  const min = minutes % 60;
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hrs > 0) parts.push(`${hrs}h`);
  if (min > 0) parts.push(`${min}m`);
  return parts.join(' ') || '0m';
}

// ---------------------------------------------------------------------------
// Decision Engine — should the AI accept/reject/negotiate?
// ---------------------------------------------------------------------------

function makeLoadDecision(load, companyState) {
  const rpm = load.ratePerMile;
  const marketAvg = load.marketRate.avg;
  const pctVsMarket = ((rpm - marketAvg) / marketAvg) * 100;
  const brokerType = load.broker.type;
  const miles = load.miles;
  const gross = load.gross;

  // Revenue need factor — more aggressive when behind target
  const weeklyRevenue = companyState.weeklyRevenue || 0;
  const weeklyTarget = companyState.weeklyTarget || 5000;
  const revenueNeed = Math.max(0, (weeklyTarget - weeklyRevenue) / weeklyTarget);

  // ── Smart Dispatcher: Transit days & profit per day ──
  const transitDays = Math.max(miles / 500, 0.5) + 0.5;
  const fuelCost = miles * (companyState.fuelCostPerMile || 0.58);
  const driverPayRate = companyState.driverPayRate || 0.30;
  const driverPay = (companyState.driverPayModel === 'permile') ? miles * driverPayRate : gross * driverPayRate;
  const estProfit = gross - driverPay - fuelCost;
  const profitPerDay = estProfit / transitDays;
  const profitPerMile = miles > 0 ? estProfit / miles : 0;

  // ── Smart Dispatcher: Trap Load Detection ──
  let isTrapLoad = false;
  if (gross >= 2000 && transitDays >= 2.5 && profitPerDay < 350) {
    isTrapLoad = true;
  }
  if (gross >= 1500 && miles > 800 && rpm < 1.80 && profitPerMile < 0.80) {
    isTrapLoad = true;
  }

  // ── Smart Dispatcher: Reload Probability ──
  const RELOAD_HUBS = { 'dallas': 95, 'houston': 93, 'atlanta': 92, 'chicago': 94, 'los angeles': 90, 'memphis': 88, 'indianapolis': 85, 'columbus': 84, 'nashville': 87, 'charlotte': 83, 'jacksonville': 80, 'kansas city': 82 };
  const destCityKey = (load.destination || '').split(',')[0].toLowerCase().trim();
  const reloadProb = Object.entries(RELOAD_HUBS).find(([c]) => destCityKey.includes(c))?.[1] || 50;
  const isStranding = reloadProb < 55;

  // ── Smart Dispatcher: Driver Burnout ──
  const recentLongHauls = (companyState.recentLoadMiles || []).filter(m => m > 600).length;
  const burnoutRisk = recentLongHauls >= 3 && miles > 600;

  let decision = 'reject';
  let reason = '';
  let counterOffer = null;
  const clarityNotes = [];

  // Trap load override — reject or negotiate regardless of rate
  if (isTrapLoad) {
    decision = 'negotiate';
    const targetRpm = Math.round((marketAvg * 1.15) * 100) / 100;
    counterOffer = Math.round(targetRpm * miles);
    reason = `Trap load detected: $${gross.toLocaleString()} over ${transitDays.toFixed(1)} days = $${Math.round(profitPerDay)}/day. Need $${targetRpm}/mi.`;
    clarityNotes.push('High gross masks poor daily return — blocks truck');
  } else if (pctVsMarket >= 10) {
    decision = 'accept';
    reason = `Rate is ${Math.round(pctVsMarket)}% above market — excellent load. $${Math.round(profitPerDay)}/day.`;
    clarityNotes.push(`Why not reject: ${Math.round(pctVsMarket)}% above market, $${Math.round(estProfit)} profit`);
  } else if (pctVsMarket >= 0) {
    if (revenueNeed > 0.5 || brokerType === 'premium') {
      decision = 'accept';
      reason = `At market rate. ${revenueNeed > 0.5 ? 'Need revenue to hit weekly target.' : 'Premium broker, quick payment.'}`;
      clarityNotes.push(`Why not negotiate: ${revenueNeed > 0.5 ? `${Math.round(revenueNeed*100)}% behind target` : 'premium broker pays fast'}`);
    } else {
      decision = 'negotiate';
      const targetRpm = Math.round((marketAvg * 1.08) * 100) / 100;
      counterOffer = Math.round(targetRpm * miles);
      reason = `At market but we can push for $${targetRpm}/mi.`;
      clarityNotes.push(`Why not accept: room to push 8% higher`);
    }
  } else if (pctVsMarket >= -10) {
    if (revenueNeed > 0.7) {
      decision = 'accept';
      reason = `Below market but ${Math.round(revenueNeed * 100)}% behind weekly target.`;
      clarityNotes.push(`Why not reject: need revenue to stay on track`);
    } else {
      decision = 'negotiate';
      const targetRpm = Math.round((marketAvg * 1.02) * 100) / 100;
      counterOffer = Math.round(targetRpm * miles);
      reason = `${Math.round(Math.abs(pctVsMarket))}% below market. Countering at $${targetRpm}/mi.`;
      clarityNotes.push(`Why not accept: ${Math.round(Math.abs(pctVsMarket))}% below market leaves money on table`);
    }
  } else {
    if (revenueNeed > 0.9 && miles < 300) {
      decision = 'negotiate';
      counterOffer = Math.round(marketAvg * 0.95 * miles);
      reason = 'Significantly below market but short haul — worth a counter.';
    } else {
      decision = 'reject';
      reason = `${Math.round(Math.abs(pctVsMarket))}% below market. Not worth the miles.`;
      clarityNotes.push(`Why not negotiate: gap too large (${Math.round(Math.abs(pctVsMarket))}%) to bridge`);
    }
  }

  // ── Strategic positioning override ──
  if (decision === 'accept' && isStranding && profitPerMile < 1.50) {
    decision = 'negotiate';
    const targetRpm = Math.round((rpm * 1.15) * 100) / 100;
    counterOffer = Math.round(targetRpm * miles);
    reason += ` Weak reload market (${reloadProb}%) at destination — need premium.`;
    clarityNotes.push(`Truck stranding risk: ${reloadProb}% reload probability`);
  }

  // ── Burnout override ──
  if (decision === 'accept' && burnoutRisk) {
    if (miles > 800) {
      decision = 'negotiate';
      reason += ` Driver fatigue risk after ${recentLongHauls} consecutive long hauls.`;
      clarityNotes.push('Consecutive long hauls — driver needs shorter run or premium');
    }
  }

  // ── Broker psychology ──
  if (decision === 'negotiate' && brokerType === 'aggressive' && pctVsMarket < -5) {
    reason += ' Low-baller broker — push hard or walk.';
  }
  if (decision === 'negotiate' && brokerType === 'premium') {
    // Premium brokers respond well to quick counters
    reason += ' Premium broker — likely to meet counter quickly.';
  }

  // Broker ghost chance for slow brokers
  const ghosted = brokerType === 'slow' && rand() < load.broker.ghostProbability;

  // Negotiation outcome
  let negotiationResult = null;
  if (decision === 'negotiate' && !ghosted) {
    const willingness = load.broker.negotiationWillingness / 100;
    if (rand() < willingness) {
      const increase = load.broker.counterIncrease;
      const newRpm = Math.round((rpm * (1 + increase)) * 100) / 100;
      negotiationResult = {
        success: true,
        newRpm,
        newGross: Math.round(newRpm * load.miles),
        responseMinutes: load.broker.responseTime,
      };
      decision = 'accept'; // Accept the negotiated rate
    } else {
      negotiationResult = {
        success: false,
        responseMinutes: load.broker.responseTime,
        brokerResponse: pick([
          'That\'s the best we can do.', 'Rate is firm.', 'Take it or leave it.',
          'We have other carriers interested.', 'This rate is already competitive.',
        ]),
      };
      // Still reject if negotiation fails and rate is too low
      if (pctVsMarket < -5) {
        decision = 'reject';
        reason += ' Negotiation failed, rate too low.';
      } else {
        decision = 'accept';
        reason += ' Negotiation failed but rate is acceptable.';
      }
    }
  }

  if (ghosted) {
    decision = 'ghosted';
    reason = `Broker ${load.broker.name} never responded. Waited ${load.broker.responseTime} minutes.`;
  }

  return {
    loadId: load.id,
    decision,
    reason,
    counterOffer,
    negotiationResult,
    ghosted,
    pctVsMarket: Math.round(pctVsMarket),
    revenueNeed: Math.round(revenueNeed * 100),
    // Smart Dispatcher intelligence
    isTrapLoad,
    reloadProb,
    isStranding,
    burnoutRisk,
    profitPerDay: Math.round(profitPerDay),
    profitPerMile: Math.round(profitPerMile * 100) / 100,
    estProfit: Math.round(estProfit),
    clarityNotes,
  };
}

// ---------------------------------------------------------------------------
// Expense Calculation
// ---------------------------------------------------------------------------

function calculateLoadExpenses(load, driverPayModel, driverPayRate) {
  const miles = load.miles;
  const gross = load.negotiatedGross || load.gross;
  const payModel = driverPayModel || 'percent';
  const payRate = driverPayRate || 0.28;

  // Fuel: ~6.5 mpg, ~$3.80/gal average
  const fuelCostPerGallon = randFloat(3.50, 4.10);
  const gallons = miles / 6.5;
  const fuelCost = Math.round(gallons * fuelCostPerGallon * 100) / 100;

  // Driver pay
  let driverPay;
  if (payModel === 'percent') {
    driverPay = Math.round(gross * payRate * 100) / 100;
  } else if (payModel === 'permile') {
    driverPay = Math.round(miles * payRate * 100) / 100;
  } else {
    driverPay = payRate; // flat rate per load
  }

  // Insurance per mile (~$0.08/mi)
  const insurance = Math.round(miles * 0.08 * 100) / 100;

  // Maintenance reserve (~$0.05/mi)
  const maintenance = Math.round(miles * 0.05 * 100) / 100;

  // Dispatch fee (if using dispatch service): 5-8%
  const dispatchFee = Math.round(gross * randFloat(0.05, 0.08) * 100) / 100;

  // Tolls (random, varies by route)
  const tolls = randInt(0, 45);

  // Lumper fees (occasional)
  const lumper = rand() < 0.15 ? randInt(50, 200) : 0;

  const totalExpenses = fuelCost + driverPay + insurance + maintenance + dispatchFee + tolls + lumper;

  return {
    fuel: fuelCost,
    driverPay,
    insurance,
    maintenance,
    dispatchFee,
    tolls,
    lumper,
    total: Math.round(totalExpenses * 100) / 100,
    breakdown: {
      fuelCostPerGallon,
      gallons: Math.round(gallons * 10) / 10,
      driverPayModel: payModel,
      driverPayRate: payRate,
    },
  };
}

// ---------------------------------------------------------------------------
// Day Simulation
// ---------------------------------------------------------------------------

/**
 * Simulate a full day of trucking operations.
 * @param {number} dayNumber - Day index (1-based)
 * @param {object} companyState - Running company state
 * @param {number}  companyState.truckCount
 * @param {string}  companyState.driverName
 * @param {number}  companyState.driverExperience
 * @param {string}  companyState.homeBase
 * @param {string}  companyState.equipment
 * @param {number}  companyState.weeklyTarget
 * @param {number}  companyState.weeklyRevenue - Revenue so far this week
 * @param {number}  companyState.weeklyExpenses - Expenses so far this week
 * @param {Array}   companyState.activeLoads - Currently in-transit loads
 * @param {string}  companyState.currentLocation - Where the driver currently is
 * @param {Date}    companyState.startDate - Week start date
 * @returns {object} Day simulation results
 */
export function simulateDay(dayNumber, companyState) {
  const startDate = companyState.startDate || new Date();
  const dayDate = new Date(startDate);
  dayDate.setDate(dayDate.getDate() + dayNumber - 1);

  const dayOfWeek = dayDate.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = formatDate(dayDate);

  // Skip weekends for load offers (but in-transit loads continue)
  const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;

  // Generate load offers (3-7 on weekdays, 1-3 on weekends)
  const offerCount = isWeekend ? randInt(1, 3) : randInt(3, 7);
  const loadOffers = [];
  for (let i = 0; i < offerCount; i++) {
    loadOffers.push(generateLoadOffer({
      date: dayDate,
      equipment: companyState.equipment,
      homeBase: companyState.currentLocation || companyState.homeBase,
    }));
  }

  // Make decisions on each load
  const decisions = loadOffers.map(load => ({
    load,
    ...makeLoadDecision(load, companyState),
  }));

  // Accepted loads
  const acceptedLoads = decisions
    .filter(d => d.decision === 'accept')
    .map(d => {
      const load = { ...d.load };
      if (d.negotiationResult && d.negotiationResult.success) {
        load.negotiatedRpm = d.negotiationResult.newRpm;
        load.negotiatedGross = d.negotiationResult.newGross;
      }
      return load;
    });

  // Limit to truck count (can only run one load per truck at a time)
  const availableTrucks = Math.max(0, (companyState.truckCount || 1) - (companyState.activeLoads || []).length);
  const assignedLoads = acceptedLoads.slice(0, availableTrucks);

  // Run lifecycle for assigned loads
  const lifecycles = assignedLoads.map(load => {
    const acceptedAt = new Date(dayDate);
    acceptedAt.setHours(randInt(6, 10), randInt(0, 59), 0, 0);
    return simulateLoadLifecycle(load, {
      acceptedAt,
      driverName: companyState.driverName || 'Driver',
    });
  });

  // Check for completed deliveries (from active loads or today's short hauls)
  const completedDeliveries = [];
  const activeLoads = companyState.activeLoads || [];
  for (const active of activeLoads) {
    const deliveryDate = new Date(active.delivery_date || active.lifecycle?.delivered);
    if (deliveryDate <= dayDate) {
      completedDeliveries.push(active);
    }
  }

  // Short-haul loads that complete same day
  for (const lc of lifecycles) {
    const deliveredTime = new Date(lc.lifecycle.delivered);
    if (formatDate(deliveredTime) === dateStr) {
      completedDeliveries.push(lc);
    }
  }

  // Generate invoices for completed deliveries
  const invoicesGenerated = completedDeliveries.map(d => ({
    invoiceNumber: d.invoiceNumber || `QIV-${dateStr.replace(/-/g, '')}-${generateId('', 4)}`,
    loadId: d.loadId || d.id,
    amount: d.negotiatedGross || d.gross,
    broker: d.broker,
    paymentTerms: typeof d.broker === 'object' ? d.broker.paymentTerms : 'Net 30',
    generatedAt: isoString(dayDate),
  }));

  // Aggregate check calls from all lifecycles
  const allCheckCalls = lifecycles.flatMap(lc => lc.checkCalls);

  // Driver events
  const driverEvents = [];
  for (const lc of lifecycles) {
    for (const event of lc.events) {
      driverEvents.push({
        ...event,
        loadId: lc.loadId,
        driver: lc.driver,
      });
    }
  }

  // Calculate revenue and expenses
  let dayRevenue = 0;
  let dayExpenses = 0;
  const expenseDetails = [];

  for (const delivery of completedDeliveries) {
    const gross = delivery.negotiatedGross || delivery.gross;
    dayRevenue += gross;

    const expenses = calculateLoadExpenses(
      delivery,
      companyState.driverPayModel,
      companyState.driverPayRate,
    );
    dayExpenses += expenses.total;
    expenseDetails.push({
      loadId: delivery.loadId || delivery.id,
      gross,
      expenses,
      profit: Math.round((gross - expenses.total) * 100) / 100,
    });
  }

  // Missed opportunities — good loads that were rejected
  const missedOpportunities = decisions
    .filter(d => d.decision === 'reject' && d.pctVsMarket >= 5)
    .map(d => ({
      loadId: d.loadId,
      origin: d.load.origin,
      destination: d.load.destination,
      gross: d.load.gross,
      ratePerMile: d.load.ratePerMile,
      pctAboveMarket: d.pctVsMarket,
      reason: 'Rejected a load that was above market rate.',
    }));

  // Failed decisions — accepted loads that lost money
  const failedDecisions = expenseDetails
    .filter(e => e.profit < 0)
    .map(e => ({
      loadId: e.loadId,
      gross: e.gross,
      expenses: e.expenses.total,
      loss: Math.abs(e.profit),
      reason: 'Accepted load resulted in a net loss after expenses.',
    }));

  // Update current location to last delivery destination
  let newLocation = companyState.currentLocation || companyState.homeBase;
  if (assignedLoads.length > 0) {
    newLocation = assignedLoads[assignedLoads.length - 1].destination;
  }

  return {
    dayNumber,
    date: dateStr,
    dayOfWeek,
    isWeekend,
    loadOffers,
    decisions,
    assignedLoads,
    lifecycles,
    completedDeliveries,
    invoicesGenerated,
    checkCalls: allCheckCalls,
    driverEvents,
    expenseDetails,
    revenue: Math.round(dayRevenue),
    expenses: Math.round(dayExpenses * 100) / 100,
    profit: Math.round((dayRevenue - dayExpenses) * 100) / 100,
    missedOpportunities,
    failedDecisions,
    currentLocation: newLocation,
    summary: {
      offersReceived: loadOffers.length,
      accepted: assignedLoads.length,
      rejected: decisions.filter(d => d.decision === 'reject').length,
      negotiated: decisions.filter(d => d.negotiationResult).length,
      ghosted: decisions.filter(d => d.ghosted).length,
      delivered: completedDeliveries.length,
      invoiced: invoicesGenerated.length,
    },
  };
}

// ---------------------------------------------------------------------------
// Week Simulation
// ---------------------------------------------------------------------------

/**
 * Simulate a full work week (5 days) of trucking operations.
 * @param {object} config
 * @param {number}  [config.truckCount=1]
 * @param {string}  [config.driverName='Marcus Johnson']
 * @param {number}  [config.driverExperience=8]
 * @param {string}  [config.homeBase='Dallas, TX']
 * @param {string}  [config.equipment='Dry Van']
 * @param {number}  [config.weeklyTarget=5000]
 * @param {string}  [config.driverPayModel='percent']
 * @param {number}  [config.driverPayRate=0.28]
 * @param {number}  [config.seed] - Optional seed for reproducibility
 * @param {Date}    [config.startDate] - Week start date (defaults to next Monday)
 * @returns {object} Week simulation with daily results and running totals
 */
export function simulateWeek(config = {}) {
  const {
    truckCount = 1,
    driverName = 'Marcus Johnson',
    driverExperience = 8,
    homeBase = 'Dallas, TX',
    equipment = 'Dry Van',
    weeklyTarget = 5000,
    driverPayModel = 'percent',
    driverPayRate = 0.28,
    seed,
    startDate,
  } = config;

  // Set seed if provided for reproducibility
  if (seed !== undefined) {
    setSeed(seed);
  }

  // Calculate start date (next Monday if not provided)
  let weekStart;
  if (startDate) {
    weekStart = new Date(startDate);
  } else {
    weekStart = new Date();
    const dayOfWeek = weekStart.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
    weekStart.setDate(weekStart.getDate() + daysUntilMonday);
  }
  weekStart.setHours(0, 0, 0, 0);

  const companyState = {
    truckCount,
    driverName,
    driverExperience,
    homeBase,
    equipment,
    weeklyTarget,
    driverPayModel,
    driverPayRate,
    weeklyRevenue: 0,
    weeklyExpenses: 0,
    activeLoads: [],
    currentLocation: homeBase,
    startDate: weekStart,
  };

  const days = [];
  const runningTotals = [];

  for (let d = 1; d <= 5; d++) {
    const dayResult = simulateDay(d, companyState);
    days.push(dayResult);

    // Update running state
    companyState.weeklyRevenue += dayResult.revenue;
    companyState.weeklyExpenses += dayResult.expenses;
    companyState.currentLocation = dayResult.currentLocation;

    // Track active loads (remove completed, add new)
    companyState.activeLoads = companyState.activeLoads.filter(
      l => !dayResult.completedDeliveries.some(c => (c.loadId || c.id) === (l.loadId || l.id))
    );
    for (const lc of dayResult.lifecycles) {
      const deliveredDate = new Date(lc.lifecycle.delivered);
      const dayDate = new Date(dayResult.date);
      dayDate.setDate(dayDate.getDate() + 1);
      if (deliveredDate > dayDate) {
        companyState.activeLoads.push(lc);
      }
    }

    runningTotals.push({
      day: d,
      date: dayResult.date,
      dayRevenue: dayResult.revenue,
      dayExpenses: dayResult.expenses,
      dayProfit: dayResult.profit,
      totalRevenue: companyState.weeklyRevenue,
      totalExpenses: Math.round(companyState.weeklyExpenses * 100) / 100,
      totalProfit: Math.round((companyState.weeklyRevenue - companyState.weeklyExpenses) * 100) / 100,
      pctOfTarget: Math.round((companyState.weeklyRevenue / weeklyTarget) * 100),
      currentLocation: dayResult.currentLocation,
    });
  }

  // Aggregate stats
  const totalLoadsOffered = days.reduce((s, d) => s + d.loadOffers.length, 0);
  const totalAccepted = days.reduce((s, d) => s + d.assignedLoads.length, 0);
  const totalDelivered = days.reduce((s, d) => s + d.completedDeliveries.length, 0);
  const totalCheckCalls = days.reduce((s, d) => s + d.checkCalls.length, 0);
  const totalMiles = days.reduce((s, d) =>
    s + d.assignedLoads.reduce((m, l) => m + l.miles, 0), 0);
  const totalMissed = days.reduce((s, d) => s + d.missedOpportunities.length, 0);

  const weeklyRevenue = companyState.weeklyRevenue;
  const weeklyExpenses = Math.round(companyState.weeklyExpenses * 100) / 100;
  const weeklyProfit = Math.round((weeklyRevenue - weeklyExpenses) * 100) / 100;
  const avgRpm = totalMiles > 0 ? Math.round((weeklyRevenue / totalMiles) * 100) / 100 : 0;
  const hitTarget = weeklyRevenue >= weeklyTarget;

  return {
    config: { truckCount, driverName, driverExperience, homeBase, equipment, weeklyTarget },
    weekStart: formatDate(weekStart),
    weekEnd: formatDate(new Date(weekStart.getTime() + 4 * 86400000)),
    days,
    runningTotals,
    summary: {
      totalLoadsOffered,
      totalAccepted,
      totalDelivered,
      totalCheckCalls,
      totalMiles,
      totalMissed,
      weeklyRevenue,
      weeklyExpenses,
      weeklyProfit,
      profitMargin: weeklyRevenue > 0 ? Math.round((weeklyProfit / weeklyRevenue) * 100) : 0,
      avgRevenuePerMile: avgRpm,
      avgRevenuePerDay: Math.round(weeklyRevenue / 5),
      hitTarget,
      pctOfTarget: Math.round((weeklyRevenue / weeklyTarget) * 100),
      endLocation: companyState.currentLocation,
    },
    performance: {
      acceptanceRate: totalLoadsOffered > 0 ? Math.round((totalAccepted / totalLoadsOffered) * 100) : 0,
      deliveryRate: totalAccepted > 0 ? Math.round((totalDelivered / totalAccepted) * 100) : 0,
      missedOpportunities: totalMissed,
      driverUtilization: Math.round((totalMiles / (5 * 550)) * 100), // vs ~550mi/day max
    },
  };
}
