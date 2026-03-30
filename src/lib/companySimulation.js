/**
 * Company Simulation — 5-day trucking company simulation
 * Powers the simulation view with realistic dispatch operations, driver movement,
 * check calls, HOS compliance, broker negotiations, and financial tracking.
 */

import {
  simulateDay,
  simulateWeek,
  generateLoadOffer,
  simulateBroker,
  simulateDriverMovement,
  generateCheckCall,
  simulateLoadLifecycle,
  CITY_COORDS,
  LANE_DATABASE,
} from './simulationEngine.js';

import { getMarketRate, compareToMarket } from './marketRates.js';

// ── Constants ──────────────────────────────────────────────────────────────────

const AVG_SPEED_MPH = 55;
const FUEL_STOP_INTERVAL = 400; // miles between fuel stops
const MAX_DRIVING_HOURS = 11;
const BREAK_AFTER_HOURS = 8;
const BREAK_DURATION_MIN = 30;
const CHECK_CALL_INTERVAL_HOURS = 2.5; // every 2-4 hours, avg 2.5

const BROKER_NAMES = [
  'TQL', 'CH Robinson', 'Echo Global', 'Coyote Logistics',
  'XPO Logistics', 'Landstar', 'JB Hunt 360', 'Schneider FreightPower',
  'GlobalTranz', 'Arrive Logistics', 'BNSF Logistics', 'Uber Freight',
];

const CITIES = [
  { city: 'Dallas', state: 'TX' },
  { city: 'Atlanta', state: 'GA' },
  { city: 'Chicago', state: 'IL' },
  { city: 'Memphis', state: 'TN' },
  { city: 'Denver', state: 'CO' },
  { city: 'Charlotte', state: 'NC' },
  { city: 'Nashville', state: 'TN' },
  { city: 'Houston', state: 'TX' },
  { city: 'Phoenix', state: 'AZ' },
  { city: 'Indianapolis', state: 'IN' },
  { city: 'Jacksonville', state: 'FL' },
  { city: 'Columbus', state: 'OH' },
  { city: 'Kansas City', state: 'MO' },
  { city: 'Louisville', state: 'KY' },
  { city: 'Laredo', state: 'TX' },
  { city: 'El Paso', state: 'TX' },
  { city: 'Savannah', state: 'GA' },
  { city: 'Birmingham', state: 'AL' },
  { city: 'St. Louis', state: 'MO' },
  { city: 'Oklahoma City', state: 'OK' },
  { city: 'Little Rock', state: 'AR' },
  { city: 'Shreveport', state: 'LA' },
  { city: 'San Antonio', state: 'TX' },
  { city: 'Fort Worth', state: 'TX' },
  { city: 'Tulsa', state: 'OK' },
  { city: 'Albuquerque', state: 'NM' },
];

// Approximate driving distances between major cities (miles)
const DISTANCE_TABLE = {
  'Dallas, TX': { 'Atlanta, GA': 780, 'Chicago, IL': 920, 'Memphis, TN': 450, 'Denver, CO': 780, 'Charlotte, NC': 940, 'Nashville, TN': 660, 'Houston, TX': 240, 'Phoenix, AZ': 1060, 'Indianapolis, IN': 870, 'Jacksonville, FL': 1050, 'Columbus, OH': 1020, 'Kansas City, MO': 510, 'Louisville, KY': 820, 'Laredo, TX': 440, 'El Paso, TX': 570, 'Savannah, GA': 920, 'Birmingham, AL': 630, 'St. Louis, MO': 640, 'Oklahoma City, OK': 200, 'Little Rock, AR': 320, 'Shreveport, LA': 190, 'San Antonio, TX': 270, 'Fort Worth, TX': 30, 'Tulsa, OK': 260, 'Albuquerque, NM': 640 },
  'Atlanta, GA': { 'Dallas, TX': 780, 'Chicago, IL': 720, 'Memphis, TN': 390, 'Charlotte, NC': 240, 'Nashville, TN': 250, 'Houston, TX': 790, 'Jacksonville, FL': 350, 'Columbus, OH': 570, 'Birmingham, AL': 150, 'Savannah, GA': 250, 'Indianapolis, IN': 530, 'Louisville, KY': 420, 'St. Louis, MO': 550, 'Kansas City, MO': 810, 'Little Rock, AR': 550 },
  'Chicago, IL': { 'Dallas, TX': 920, 'Atlanta, GA': 720, 'Memphis, TN': 530, 'Denver, CO': 1000, 'Indianapolis, IN': 180, 'Columbus, OH': 350, 'Kansas City, MO': 510, 'Louisville, KY': 300, 'St. Louis, MO': 300, 'Nashville, TN': 470, 'Milwaukee, WI': 90, 'Minneapolis, MN': 410 },
  'Memphis, TN': { 'Dallas, TX': 450, 'Atlanta, GA': 390, 'Chicago, IL': 530, 'Nashville, TN': 210, 'Birmingham, AL': 240, 'Little Rock, AR': 130, 'St. Louis, MO': 280, 'Kansas City, MO': 450, 'Houston, TX': 560, 'Louisville, KY': 380, 'Indianapolis, IN': 470, 'Jackson, MS': 210, 'Shreveport, LA': 280 },
  'Houston, TX': { 'Dallas, TX': 240, 'San Antonio, TX': 200, 'Laredo, TX': 310, 'Shreveport, LA': 340, 'Memphis, TN': 560, 'Atlanta, GA': 790, 'New Orleans, LA': 350, 'Oklahoma City, OK': 440, 'El Paso, TX': 740, 'Austin, TX': 165 },
  'Nashville, TN': { 'Atlanta, GA': 250, 'Memphis, TN': 210, 'Louisville, KY': 175, 'Birmingham, AL': 190, 'Indianapolis, IN': 290, 'Charlotte, NC': 410, 'Dallas, TX': 660, 'Chicago, IL': 470, 'St. Louis, MO': 310 },
  'Denver, CO': { 'Dallas, TX': 780, 'Chicago, IL': 1000, 'Kansas City, MO': 600, 'Albuquerque, NM': 450, 'Oklahoma City, OK': 680, 'Phoenix, AZ': 600, 'El Paso, TX': 570 },
};

// Interstate routes between cities for check-call flavor
const ROUTE_INTERSTATES = {
  'Dallas, TX→Atlanta, GA': ['I-20 E', 'I-20 E through Shreveport, LA', 'I-20 E near Jackson, MS', 'I-20 E through Birmingham, AL'],
  'Atlanta, GA→Dallas, TX': ['I-20 W', 'I-20 W through Birmingham, AL', 'I-20 W near Jackson, MS', 'I-20 W through Shreveport, LA'],
  'Dallas, TX→Chicago, IL': ['I-35 N', 'I-35 N through Oklahoma City, OK', 'I-44 E through Tulsa, OK', 'I-44 E near Springfield, MO', 'I-55 N through St. Louis, MO'],
  'Dallas, TX→Memphis, TN': ['I-30 E', 'I-30 E through Texarkana, TX', 'I-30 E near Little Rock, AR', 'I-40 E toward Memphis'],
  'Dallas, TX→Denver, CO': ['I-35 N', 'US-287 N through Amarillo, TX', 'I-25 N through Trinidad, CO', 'I-25 N near Pueblo, CO'],
  'Memphis, TN→Atlanta, GA': ['I-22 E', 'I-22 E through Birmingham, AL', 'I-20 E toward Atlanta'],
  'Memphis, TN→Dallas, TX': ['I-40 W', 'I-40 W near Little Rock, AR', 'I-30 W through Texarkana, TX'],
  'Atlanta, GA→Charlotte, NC': ['I-85 N', 'I-85 N near Greenville, SC'],
  'Nashville, TN→Atlanta, GA': ['I-24 E', 'I-75 S through Chattanooga, TN'],
  'Chicago, IL→Dallas, TX': ['I-55 S', 'I-44 W through St. Louis, MO', 'I-44 W through Tulsa, OK', 'I-35 S through Oklahoma City, OK'],
  'Charlotte, NC→Dallas, TX': ['I-85 S', 'I-20 W through Atlanta, GA', 'I-20 W through Birmingham, AL', 'I-20 W through Jackson, MS'],
};

// Day-specific load offer counts
const DAILY_LOAD_COUNTS = {
  1: [4, 6],   // Monday: fresh start
  2: [3, 5],   // Tuesday: backhaul opportunities
  3: [3, 4],   // Wednesday: mid-week slowdown
  4: [5, 7],   // Thursday: pre-Friday rush
  5: [3, 5],   // Friday: get home loads
};

// Issues that can happen during delivery
const DELIVERY_ISSUES = [
  { type: 'wrong_dock', detail: 'Receiver directed to wrong dock. Had to relocate to dock {dock}. 25min delay.' },
  { type: 'short_count', detail: 'Receiver claims short count: {count} pallets vs {expected} on BOL. Driver confirmed {expected} loaded. Shipper notified.' },
  { type: 'lumper_fee', detail: 'Lumper fee required at delivery: ${fee}. Broker notified for reimbursement.' },
  { type: 'late_gate', detail: 'Receiver gate closed at arrival. Guard directed to staging lot. 40min wait for gate to reopen.' },
  { type: 'seal_mismatch', detail: 'Seal number mismatch at delivery. Original seal #{seal1} vs BOL #{seal2}. Inspection cleared — no tamper.' },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

function generateLoadId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return `QB-${id}`;
}

function generateInvoiceId(date) {
  const d = date.replace(/-/g, '');
  const num = rand(1000, 9999);
  return `QIV-${d}-${num}`;
}

function formatTime(hours, minutes) {
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function addMinutes(timeStr, mins) {
  const [h, m] = timeStr.split(':').map(Number);
  let totalMin = h * 60 + m + mins;
  if (totalMin >= 1440) totalMin = 1439; // cap at 23:59
  const newH = Math.floor(totalMin / 60);
  const newM = totalMin % 60;
  return formatTime(newH, newM);
}

function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins) {
  if (mins >= 1440) mins = 1439;
  return formatTime(Math.floor(mins / 60), mins % 60);
}

function getDistance(origin, dest) {
  // Try direct lookup
  if (DISTANCE_TABLE[origin] && DISTANCE_TABLE[origin][dest]) {
    return DISTANCE_TABLE[origin][dest];
  }
  if (DISTANCE_TABLE[dest] && DISTANCE_TABLE[dest][origin]) {
    return DISTANCE_TABLE[dest][origin];
  }
  // Fallback: random realistic distance
  return rand(280, 950);
}

function getRouteWaypoint(origin, dest, progress) {
  const key = `${origin}\u2192${dest}`;
  const waypoints = ROUTE_INTERSTATES[key];
  if (waypoints && waypoints.length > 0) {
    const idx = Math.min(Math.floor(progress * waypoints.length), waypoints.length - 1);
    return waypoints[idx];
  }
  // Generic waypoint
  const interstates = ['I-20', 'I-30', 'I-35', 'I-40', 'I-44', 'I-55', 'I-65', 'I-75', 'I-85', 'I-10'];
  return `${pick(interstates)} ${pick(['E', 'W', 'N', 'S'])}`;
}

function getMidpointCity(origin, dest, progress) {
  // Return a plausible midpoint city based on lane
  const key = `${origin}\u2192${dest}`;
  const waypoints = ROUTE_INTERSTATES[key];
  if (waypoints) {
    const idx = Math.min(Math.floor(progress * waypoints.length), waypoints.length - 1);
    const wp = waypoints[idx];
    // Extract city from waypoint description
    const match = wp.match(/through\s+(.+?)$|near\s+(.+?)$/);
    if (match) return match[1] || match[2];
  }
  // fallback — pick a city between origin/dest states
  return pick(CITIES.filter(c => `${c.city}, ${c.state}` !== origin && `${c.city}, ${c.state}` !== dest)).city + ', ' + pick(CITIES).state;
}

function extractState(cityState) {
  const parts = cityState.split(', ');
  return parts.length > 1 ? parts[parts.length - 1] : 'TX';
}

function parseCityState(loc) {
  return loc; // already in "City, ST" format
}

function getDayOfWeekName(dateStr) {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return days[new Date(dateStr).getDay()];
}

function formatDateStr(baseDate, dayOffset) {
  const d = new Date(baseDate);
  d.setDate(d.getDate() + dayOffset);
  return d.toISOString().split('T')[0];
}

// ── Load Generation ────────────────────────────────────────────────────────────

function generateLoads(originCity, equipment, count, date, fuelCostPerMile, dayOfWeek) {
  const loads = [];
  const usedDests = new Set();

  for (let i = 0; i < count; i++) {
    const destOptions = CITIES.filter(c => {
      const full = `${c.city}, ${c.state}`;
      return full !== originCity && !usedDests.has(full);
    });
    if (destOptions.length === 0) break;

    const dest = pick(destOptions);
    const destFull = `${dest.city}, ${dest.state}`;
    usedDests.add(destFull);

    const miles = getDistance(originCity, destFull);
    const broker = pick(BROKER_NAMES);
    const originState = extractState(originCity);
    const destState = dest.state;

    // Get market rate for this lane
    const market = getMarketRate({
      originState,
      destState,
      equipment,
      miles,
      month: parseInt(date.split('-')[1]),
      dayOfWeek,
      fuelCostPerMile,
    });

    // Some loads at market, some above, some below
    let rpm;
    const roll = Math.random();
    if (roll < 0.25) {
      // Below market (bad load)
      rpm = market.avg * randFloat(0.65, 0.85);
    } else if (roll < 0.55) {
      // At market
      rpm = market.avg * randFloat(0.93, 1.07);
    } else if (roll < 0.85) {
      // Above market
      rpm = market.avg * randFloat(1.08, 1.25);
    } else {
      // Well above market (great load)
      rpm = market.avg * randFloat(1.25, 1.40);
    }
    rpm = Math.round(rpm * 100) / 100;

    const totalRate = Math.round(rpm * miles);
    const loadId = generateLoadId();
    const driveHours = Math.round((miles / AVG_SPEED_MPH) * 10) / 10;

    loads.push({
      id: loadId,
      origin: originCity,
      destination: destFull,
      originState,
      destState,
      miles,
      rpm,
      totalRate,
      equipment,
      broker,
      market,
      driveHours,
      date,
    });
  }

  return loads;
}

// ── AI Decision Engine ─────────────────────────────────────────────────────────

function evaluateLoad(load, config, driverState, isLastDay) {
  const { fuelCostPerMile } = config;
  const { payModel, payRate } = config.driver;

  const fuelCost = load.miles * fuelCostPerMile;
  let driverPay;
  if (payModel === 'percent') {
    driverPay = load.totalRate * (payRate / 100);
  } else if (payModel === 'permile') {
    driverPay = load.miles * payRate;
  } else {
    driverPay = payRate;
  }

  const profit = load.totalRate - fuelCost - driverPay;
  const profitPerMile = profit / load.miles;
  const comparison = compareToMarket({
    offeredRpm: load.rpm,
    originState: load.originState,
    destState: load.destState,
    equipment: load.equipment,
    miles: load.miles,
    fuelCostPerMile,
  });

  // Can driver complete within HOS?
  const hoursNeeded = load.driveHours;
  const hoursAvailable = driverState.hoursLeft;
  const canComplete = hoursAvailable >= hoursNeeded;
  const canStartAndOvernight = hoursAvailable > 2; // can at least make progress

  // On Friday, prefer loads heading toward home base
  let homeBonus = 0;
  if (isLastDay) {
    const homeBase = config.driver.homeBase;
    if (load.destination === homeBase) homeBonus = 0.3;
    else if (extractState(load.destination) === extractState(homeBase)) homeBonus = 0.15;
  }

  // Scoring
  let score = 0;
  if (comparison.vsMarket === 'above') score += 3;
  else if (comparison.vsMarket === 'at') score += 1.5;
  else if (comparison.vsMarket === 'below') score -= 1;
  else score -= 3;

  if (profitPerMile > 1.0) score += 2;
  else if (profitPerMile > 0.5) score += 1;
  else if (profitPerMile < 0) score -= 3;

  if (canComplete) score += 1;
  else if (canStartAndOvernight) score += 0.3;
  else score -= 1;

  score += homeBonus;

  // Decision
  let decision;
  let negotiateTarget = null;
  if (score >= 3.5) {
    decision = 'accept';
  } else if (score >= 1.5 && comparison.vsMarket !== 'far_below') {
    decision = 'negotiate';
    // Target 10-15% above current
    negotiateTarget = Math.round(load.totalRate * randFloat(1.08, 1.15));
  } else {
    decision = 'reject';
  }

  const confidence = Math.min(Math.round(50 + score * 10 + Math.random() * 10), 99);

  return {
    decision,
    score,
    confidence,
    profit: Math.round(profit),
    profitPerMile: Math.round(profitPerMile * 100) / 100,
    fuelCost: Math.round(fuelCost),
    driverPay: Math.round(driverPay),
    comparison,
    canComplete,
    negotiateTarget,
    homeBonus: homeBonus > 0,
  };
}

// ── Event Builders ─────────────────────────────────────────────────────────────

function evt(time, type, detail, data = {}) {
  return { time, type, detail, data };
}

// ── Day Simulation ─────────────────────────────────────────────────────────────

function simulateSingleDay(dayNum, date, config, driverState, activeLoad, runningStats) {
  const events = [];
  const dayOfWeek = new Date(date).getDay();
  const dayName = getDayOfWeekName(date);
  const driverName = config.driver.name;
  const firstName = driverName.split(' ')[0];
  const equipment = config.driver.equipment;
  const isLastDay = dayNum === 5;

  let currentTime = '06:00';
  let location = driverState.location;
  let hoursLeft = MAX_DRIVING_HOURS; // fresh day after 10hr reset
  let hoursDriven = 0;
  let hoursSinceBreak = 0;
  let dayMiles = 0;
  let dayRevenue = 0;
  let dayFuelCost = 0;
  let dayDriverPay = 0;
  let currentLoad = activeLoad;
  let status = 'available';

  const dayLoads = { offered: 0, accepted: 0, rejected: 0, negotiated: 0 };
  const deliveries = [];
  const invoicesGenerated = [];

  // ── Day Start ──
  events.push(evt(currentTime, 'day_start', `Driver clocks in at ${location}`));

  // ── Continue in-transit load from previous day ──
  if (currentLoad && currentLoad.status === 'in_transit') {
    currentTime = addMinutes(currentTime, 15);
    status = 'driving';

    const remainingMiles = currentLoad.remainingMiles || 0;
    const remainingHours = remainingMiles / AVG_SPEED_MPH;

    events.push(evt(currentTime, 'status_change', `${currentLoad.id}: Resuming transit — ${remainingMiles}mi remaining to ${currentLoad.destination}`));

    // Drive toward destination with check calls, fuel stops, breaks
    const driveResult = simulateDriving(
      currentTime, firstName, currentLoad, remainingMiles, location,
      hoursLeft, hoursDriven, hoursSinceBreak, dayMiles, config
    );

    events.push(...driveResult.events);
    currentTime = driveResult.currentTime;
    hoursLeft = driveResult.hoursLeft;
    hoursDriven = driveResult.hoursDriven;
    hoursSinceBreak = driveResult.hoursSinceBreak;
    dayMiles += driveResult.milesDriven;
    dayFuelCost += driveResult.fuelCost;
    location = driveResult.location;

    if (driveResult.arrived) {
      // Delivery
      currentTime = addMinutes(currentTime, rand(15, 30));

      // Possible issue on day 3
      if (dayNum === 3 && !runningStats.issueOccurred) {
        const issue = pick(DELIVERY_ISSUES);
        let issueDetail = issue.detail
          .replace('{dock}', rand(1, 24))
          .replace('{count}', rand(18, 22))
          .replace('{expected}', 24)
          .replace('{fee}', rand(150, 350))
          .replace('{seal1}', `QS${rand(10000, 99999)}`)
          .replace('{seal2}', `QS${rand(10000, 99999)}`);
        events.push(evt(currentTime, 'issue_reported', `\u26A0\uFE0F ${currentLoad.id}: ${issueDetail}`, { loadId: currentLoad.id, issueType: issue.type }));
        currentTime = addMinutes(currentTime, rand(20, 45));
        runningStats.issueOccurred = true;
      }

      events.push(evt(currentTime, 'delivery_complete', `${currentLoad.id}: Delivered at ${currentLoad.destination}. POD signed. ${currentLoad.miles}mi total.`, { loadId: currentLoad.id, destination: currentLoad.destination }));
      dayRevenue += currentLoad.totalRate;

      // Calculate pay
      const payModel = config.driver.payModel;
      const payRate = config.driver.payRate;
      let loadDriverPay;
      if (payModel === 'percent') {
        loadDriverPay = Math.round(currentLoad.totalRate * (payRate / 100));
      } else if (payModel === 'permile') {
        loadDriverPay = Math.round(currentLoad.miles * payRate);
      } else {
        loadDriverPay = payRate;
      }
      dayDriverPay += loadDriverPay;

      // Invoice
      currentTime = addMinutes(currentTime, 10);
      const invoiceId = generateInvoiceId(date);
      events.push(evt(currentTime, 'invoice_generated', `Invoice ${invoiceId} generated: $${currentLoad.totalRate.toLocaleString()} \u2014 Net 30 \u2014 ${currentLoad.broker}`, { invoiceId, amount: currentLoad.totalRate, broker: currentLoad.broker, loadId: currentLoad.id }));
      invoicesGenerated.push({ id: invoiceId, amount: currentLoad.totalRate, broker: currentLoad.broker });

      deliveries.push(currentLoad);
      location = currentLoad.destination;
      currentLoad = null;
      status = 'available';
    } else {
      // Still in transit — HOS limit reached
      currentLoad.remainingMiles = remainingMiles - driveResult.milesDriven;
      currentLoad.status = 'in_transit';
      status = 'off_duty';
    }
  }

  // ── Offer new loads (if driver is available or will be soon) ──
  if (status === 'available' || (status === 'driving' && hoursLeft <= 1)) {
    const [minLoads, maxLoads] = DAILY_LOAD_COUNTS[dayNum] || [3, 5];
    const loadCount = rand(minLoads, maxLoads);
    const loads = generateLoads(location, equipment, loadCount, date, config.fuelCostPerMile, dayOfWeek);

    dayLoads.offered = loads.length;
    let bestAccepted = null;
    let bestScore = -Infinity;
    const missedThisDay = [];

    currentTime = addMinutes(currentTime, 15);

    for (const load of loads) {
      const evaluation = evaluateLoad(load, config, { hoursLeft, location }, isLastDay);

      events.push(evt(currentTime, 'load_offered', `Load ${load.id} offered: ${load.origin} \u2192 ${load.destination}, ${load.miles}mi, $${load.totalRate.toLocaleString()} (${equipment})`, { loadId: load.id, ...load }));

      if (evaluation.decision === 'accept') {
        events.push(evt(currentTime, 'ai_decision', `Q AI: ACCEPT \u2014 $${load.totalRate.toLocaleString()} gross, $${evaluation.profitPerMile.toFixed(2)} profit/mi, ${evaluation.confidence}% confidence`, { loadId: load.id, decision: 'accept', ...evaluation }));

        if (evaluation.score > bestScore && !bestAccepted) {
          bestAccepted = { load, evaluation };
          bestScore = evaluation.score;
        }
        dayLoads.accepted++;
      } else if (evaluation.decision === 'negotiate') {
        const target = evaluation.negotiateTarget;
        events.push(evt(currentTime, 'ai_decision', `Q AI: NEGOTIATE \u2014 Counter at $${target.toLocaleString()}`, { loadId: load.id, decision: 'negotiate', target }));

        // Simulate negotiation
        currentTime = addMinutes(currentTime, rand(5, 15));
        events.push(evt(currentTime, 'broker_negotiation', `Q AI evaluated load ${load.id}: NEGOTIATE at $${target.toLocaleString()}`, { loadId: load.id, target }));

        // 55% success rate
        if (Math.random() < 0.55) {
          const settled = Math.round(load.totalRate + (target - load.totalRate) * randFloat(0.5, 0.85));
          currentTime = addMinutes(currentTime, rand(3, 10));
          events.push(evt(currentTime, 'broker_response', `${load.broker} countered $${settled.toLocaleString()} \u2192 ACCEPTED`, { loadId: load.id, originalRate: load.totalRate, negotiatedRate: settled, broker: load.broker }));

          load.totalRate = settled;
          load.rpm = Math.round((settled / load.miles) * 100) / 100;

          const newEval = evaluateLoad(load, config, { hoursLeft, location }, isLastDay);
          if (newEval.score > bestScore && !bestAccepted) {
            bestAccepted = { load, evaluation: newEval };
            bestScore = newEval.score;
          }
          dayLoads.negotiated++;
          dayLoads.accepted++;
        } else {
          currentTime = addMinutes(currentTime, rand(3, 8));
          events.push(evt(currentTime, 'broker_response', `${load.broker} held firm at $${load.totalRate.toLocaleString()} \u2192 REJECTED`, { loadId: load.id, broker: load.broker }));

          // Check if this was actually a good load (missed opportunity)
          if (evaluation.profitPerMile > 0.4) {
            missedThisDay.push({
              loadId: load.id,
              lane: `${load.origin} \u2192 ${load.destination}`,
              rate: load.totalRate,
              rpm: load.rpm,
              profitPerMile: evaluation.profitPerMile,
              reason: 'Negotiation failed but load was above breakeven',
            });
          }
          dayLoads.rejected++;
        }
      } else {
        // Reject
        const reason = evaluation.comparison.vsMarket === 'far_below'
          ? `$${load.rpm.toFixed(2)}/mi below market avg $${evaluation.comparison.marketAvg.toFixed(2)}/mi`
          : `$${evaluation.profitPerMile.toFixed(2)}/mi profit, ${evaluation.confidence}% confidence \u2014 below threshold`;
        events.push(evt(currentTime, 'ai_decision', `Q AI: REJECT \u2014 ${reason}`, { loadId: load.id, decision: 'reject', ...evaluation }));

        // Check if we missed a good one (for "missed opportunity" tracking)
        if (evaluation.profitPerMile > 0.6 && evaluation.comparison.vsMarket !== 'far_below') {
          missedThisDay.push({
            loadId: load.id,
            lane: `${load.origin} \u2192 ${load.destination}`,
            rate: load.totalRate,
            rpm: load.rpm,
            profitPerMile: evaluation.profitPerMile,
            reason: 'Rejected but was above market — scoring was conservative',
          });
        }
        dayLoads.rejected++;
      }

      currentTime = addMinutes(currentTime, rand(2, 5));
    }

    // Store missed opportunities
    if (missedThisDay.length > 0) {
      // Report at most 1 missed opportunity per day
      const missed = missedThisDay[0];
      events.push(evt(currentTime, 'missed_opportunity', `Missed: ${missed.lane} at $${missed.rate.toLocaleString()} ($${missed.profitPerMile.toFixed(2)}/mi profit). ${missed.reason}`, { ...missed }));
      runningStats.missedOpportunities.push(missed);
    }

    // ── Assign best load ──
    if (bestAccepted && !currentLoad) {
      const { load, evaluation } = bestAccepted;
      currentTime = addMinutes(currentTime, 10);
      events.push(evt(currentTime, 'driver_assigned', `${driverName} assigned to ${load.id}`, { loadId: load.id, driver: driverName }));

      currentTime = addMinutes(currentTime, 15);
      events.push(evt(currentTime, 'status_change', `${load.id}: En Route to Pickup`, { loadId: load.id, status: 'en_route_pickup' }));

      // Pickup with possible detention
      const pickupDrive = rand(10, 35); // minutes to shipper
      currentTime = addMinutes(currentTime, pickupDrive);
      events.push(evt(currentTime, 'status_change', `${load.id}: ${firstName} arrived at shipper`, { loadId: load.id, status: 'at_shipper' }));

      // Detention check (day 3 or 4 more likely)
      const hasDetention = (dayNum === 3 || dayNum === 4) && Math.random() < 0.4;
      if (hasDetention) {
        const detentionMin = rand(30, 120);
        events.push(evt(currentTime, 'detention', `\u26A0\uFE0F Detention alert: ${firstName} waiting ${detentionMin}min at ${load.origin.split(',')[0]} Distribution Center. Detention clock started.`, { loadId: load.id, minutes: detentionMin, location: load.origin }));
        currentTime = addMinutes(currentTime, detentionMin);
      }

      // Loading
      const loadingTime = rand(20, 60);
      currentTime = addMinutes(currentTime, loadingTime);
      const dock = rand(1, 30);
      events.push(evt(currentTime, 'status_change', `${load.id}: ${firstName} arrived at shipper \u2014 loading dock ${dock}, warehouse ${pick(['A', 'B', 'C', 'D'])}`, { loadId: load.id, status: 'loading', dock }));

      currentTime = addMinutes(currentTime, rand(15, 30));
      events.push(evt(currentTime, 'status_change', `${load.id}: Loaded. Sealed. En Route to Delivery at ${load.destination}`, { loadId: load.id, status: 'in_transit' }));

      // ── Drive ──
      const driveResult = simulateDriving(
        currentTime, firstName, load, load.miles, load.origin,
        hoursLeft, hoursDriven, hoursSinceBreak, dayMiles, config
      );

      events.push(...driveResult.events);
      currentTime = driveResult.currentTime;
      hoursLeft = driveResult.hoursLeft;
      hoursDriven = driveResult.hoursDriven;
      hoursSinceBreak = driveResult.hoursSinceBreak;
      dayMiles += driveResult.milesDriven;
      dayFuelCost += driveResult.fuelCost;
      location = driveResult.location;

      if (driveResult.arrived) {
        // Delivery same day
        currentTime = addMinutes(currentTime, rand(15, 30));

        // Possible issue
        if (dayNum === 3 && !runningStats.issueOccurred) {
          const issue = pick(DELIVERY_ISSUES);
          let issueDetail = issue.detail
            .replace('{dock}', rand(1, 24))
            .replace('{count}', rand(18, 22))
            .replace('{expected}', 24)
            .replace('{fee}', rand(150, 350))
            .replace('{seal1}', `QS${rand(10000, 99999)}`)
            .replace('{seal2}', `QS${rand(10000, 99999)}`);
          events.push(evt(currentTime, 'issue_reported', `\u26A0\uFE0F ${load.id}: ${issueDetail}`, { loadId: load.id, issueType: issue.type }));
          currentTime = addMinutes(currentTime, rand(20, 45));
          runningStats.issueOccurred = true;
        }

        events.push(evt(currentTime, 'delivery_complete', `${load.id}: Delivered at ${load.destination}. POD signed. ${load.miles}mi total.`, { loadId: load.id, destination: load.destination }));
        dayRevenue += load.totalRate;

        const payModel = config.driver.payModel;
        const payRate = config.driver.payRate;
        let loadDriverPay;
        if (payModel === 'percent') {
          loadDriverPay = Math.round(load.totalRate * (payRate / 100));
        } else if (payModel === 'permile') {
          loadDriverPay = Math.round(load.miles * payRate);
        } else {
          loadDriverPay = payRate;
        }
        dayDriverPay += loadDriverPay;

        // Invoice
        currentTime = addMinutes(currentTime, 10);
        const invoiceId = generateInvoiceId(date);
        events.push(evt(currentTime, 'invoice_generated', `Invoice ${invoiceId} generated: $${load.totalRate.toLocaleString()} \u2014 Net 30 \u2014 ${load.broker}`, { invoiceId, amount: load.totalRate, broker: load.broker, loadId: load.id }));
        invoicesGenerated.push({ id: invoiceId, amount: load.totalRate, broker: load.broker });

        deliveries.push(load);
        location = load.destination;
        currentLoad = null;
        status = 'available';
      } else {
        // HOS limit — driver sleeps on road
        load.remainingMiles = load.miles - driveResult.milesDriven;
        load.status = 'in_transit';
        currentLoad = load;
        status = 'off_duty';
      }
    }
  }

  // ── Day End ──
  if (status === 'off_duty' || hoursLeft <= 0) {
    events.push(evt(currentTime, 'hos_break', `${firstName}: ${MAX_DRIVING_HOURS}-hour driving limit reached. Off duty at ${location}.`, { location, hoursLeft: 0 }));
  }

  // Ensure currentTime is past 6pm for end of day
  const endTimeMin = Math.max(timeToMinutes(currentTime) + 15, 17 * 60 + rand(0, 120));
  const endTime = minutesToTime(endTimeMin);

  events.push(evt(endTime, 'day_end', `Day ${dayNum} complete. ${firstName} off duty at ${location}. ${dayMiles}mi driven today.`, { location, milesDriven: dayMiles }));

  const dayProfit = dayRevenue - dayFuelCost - dayDriverPay;

  return {
    day: dayNum,
    date,
    dayOfWeek: dayName,
    events,
    loads: dayLoads,
    financials: {
      revenue: dayRevenue,
      fuelCost: Math.round(dayFuelCost),
      driverPay: dayDriverPay,
      profit: Math.round(dayProfit),
    },
    driverStatus: {
      location,
      hoursLeft: Math.max(hoursLeft, 0),
      status: currentLoad ? 'off_duty' : status,
      currentLoad: currentLoad ? currentLoad.id : null,
    },
    _internal: {
      currentLoad,
      deliveries,
      invoices: invoicesGenerated,
      milesDriven: dayMiles,
    },
  };
}

// ── Driving Simulation (sub-routine) ───────────────────────────────────────────

function simulateDriving(startTime, driverFirstName, load, totalMiles, startLocation, hoursLeft, hoursDriven, hoursSinceBreak, existingDayMiles, config) {
  const events = [];
  let currentTime = startTime;
  let milesDriven = 0;
  let fuelCost = 0;
  let arrived = false;
  let milesSinceLastFuel = existingDayMiles % FUEL_STOP_INTERVAL;
  let milesSinceLastCheck = 0;
  let currentHoursLeft = hoursLeft;
  let currentHoursDriven = hoursDriven;
  let currentHoursSinceBreak = hoursSinceBreak;
  let location = startLocation;

  // Drive in segments
  while (milesDriven < totalMiles && currentHoursLeft > 0) {
    // How far can we drive before next event?
    const milesToDest = totalMiles - milesDriven;
    const milesToFuel = FUEL_STOP_INTERVAL - milesSinceLastFuel;
    const milesToCheck = (CHECK_CALL_INTERVAL_HOURS * AVG_SPEED_MPH) - milesSinceLastCheck;
    const milesToBreak = currentHoursSinceBreak >= BREAK_AFTER_HOURS ? 0 : (BREAK_AFTER_HOURS - currentHoursSinceBreak) * AVG_SPEED_MPH;
    const milesToHOS = currentHoursLeft * AVG_SPEED_MPH;

    // Find the next event
    const segments = [
      { type: 'destination', miles: milesToDest },
      { type: 'fuel', miles: milesToFuel },
      { type: 'check_call', miles: milesToCheck },
      { type: 'hos_limit', miles: milesToHOS },
    ];
    if (milesToBreak > 0) {
      segments.push({ type: 'break', miles: milesToBreak });
    } else if (currentHoursSinceBreak >= BREAK_AFTER_HOURS) {
      // Need break NOW
      events.push(evt(currentTime, 'hos_break', `${driverFirstName}: 30-min break required (${BREAK_AFTER_HOURS}h continuous driving). Stopping at ${location}.`, { breakDuration: BREAK_DURATION_MIN }));
      currentTime = addMinutes(currentTime, BREAK_DURATION_MIN);
      currentHoursSinceBreak = 0;
      continue;
    }

    // Sort by distance and pick the closest event
    segments.sort((a, b) => a.miles - b.miles);
    const next = segments.find(s => s.miles > 0) || segments[0];

    if (next.miles <= 0 && next.type === 'hos_limit') {
      // Out of hours
      break;
    }

    const driveSegmentMiles = Math.max(Math.min(next.miles, milesToDest, milesToHOS), 1);
    const driveSegmentHours = driveSegmentMiles / AVG_SPEED_MPH;
    const driveSegmentMin = Math.round(driveSegmentHours * 60);

    milesDriven += driveSegmentMiles;
    milesSinceLastFuel += driveSegmentMiles;
    milesSinceLastCheck += driveSegmentMiles;
    currentHoursLeft -= driveSegmentHours;
    currentHoursDriven += driveSegmentHours;
    currentHoursSinceBreak += driveSegmentHours;
    fuelCost += driveSegmentMiles * config.fuelCostPerMile;
    currentTime = addMinutes(currentTime, driveSegmentMin);

    const progress = milesDriven / totalMiles;

    if (next.type === 'destination' && milesDriven >= totalMiles) {
      arrived = true;
      location = load.destination;
      break;
    }

    // Update location estimate
    location = getMidpointCity(load.origin || startLocation, load.destination, progress);

    if (next.type === 'check_call') {
      const routeWP = getRouteWaypoint(load.origin || startLocation, load.destination, progress);
      const speed = rand(55, 68);
      const mileMarker = rand(100, 500);
      const etaHours = (totalMiles - milesDriven) / AVG_SPEED_MPH;
      const etaMins = Math.round(etaHours * 60);
      const etaTime = addMinutes(currentTime, etaMins);
      const onSchedule = Math.random() < 0.85 ? 'On schedule' : `${rand(10, 30)}min behind`;
      events.push(evt(currentTime, 'check_call', `Check call: ${driverFirstName} at mile marker ${mileMarker}, ${routeWP}. Speed ${speed}mph. ETA ${etaTime}. ${onSchedule}.`, { loadId: load.id, location: routeWP, speed, eta: etaTime, milesDriven: Math.round(milesDriven) }));
      milesSinceLastCheck = 0;
    }

    if (next.type === 'fuel') {
      const gallons = randFloat(80, 140).toFixed(1);
      const fuelCity = location;
      events.push(evt(currentTime, 'fuel_stop', `Fuel stop: ${driverFirstName} at ${fuelCity}. ${gallons} gal. ${Math.round(milesDriven)}mi driven.`, { loadId: load.id, location: fuelCity, gallons: parseFloat(gallons), milesDriven: Math.round(milesDriven) }));
      currentTime = addMinutes(currentTime, rand(15, 25)); // fueling time
      milesSinceLastFuel = 0;
    }

    if (next.type === 'break') {
      events.push(evt(currentTime, 'hos_break', `${driverFirstName}: 30-min break at ${location}. ${currentHoursDriven.toFixed(1)}h driven.`, { breakDuration: BREAK_DURATION_MIN, hoursDriven: Math.round(currentHoursDriven * 10) / 10 }));
      currentTime = addMinutes(currentTime, BREAK_DURATION_MIN);
      currentHoursSinceBreak = 0;
    }

    if (next.type === 'hos_limit') {
      // HOS limit reached
      break;
    }
  }

  return {
    events,
    currentTime,
    hoursLeft: Math.max(Math.round(currentHoursLeft * 10) / 10, 0),
    hoursDriven: Math.round(currentHoursDriven * 10) / 10,
    hoursSinceBreak: Math.round(currentHoursSinceBreak * 10) / 10,
    milesDriven: Math.round(milesDriven),
    fuelCost: Math.round(fuelCost),
    location,
    arrived,
  };
}

// ── Main Export ─────────────────────────────────────────────────────────────────

/**
 * Run a complete 5-day trucking company simulation.
 *
 * @param {object} config
 * @param {string} config.companyName
 * @param {string} config.dot
 * @param {string} config.mc
 * @param {number} config.truckCount
 * @param {object} config.driver
 * @param {string} config.driver.name
 * @param {number} config.driver.experience
 * @param {string} config.driver.license
 * @param {string} config.driver.equipment
 * @param {string} config.driver.payModel - "percent" | "permile" | "flat"
 * @param {number} config.driver.payRate
 * @param {string} config.driver.homeBase - "City, ST"
 * @param {number} config.weeklyTarget - weekly revenue target
 * @param {number} config.fuelCostPerMile
 * @returns {object} Full simulation report
 */
export function runCompanySimulation(config) {
  const {
    companyName = 'Wasuge Trucking LLC',
    dot = '4012938',
    mc = '1289445',
    truckCount = 1,
    driver: driverConfig = {},
    weeklyTarget = 5000,
    fuelCostPerMile = 0.58,
  } = config || {};

  const driver = {
    name: driverConfig.name || 'Marcus Johnson',
    experience: driverConfig.experience || 8,
    license: driverConfig.license || 'CDL-A',
    equipment: driverConfig.equipment || 'Dry Van',
    payModel: driverConfig.payModel || 'percent',
    payRate: driverConfig.payRate || 30,
    homeBase: driverConfig.homeBase || 'Dallas, TX',
  };

  // Determine simulation dates (next Monday-Friday)
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysUntilMonday = dayOfWeek === 0 ? 1 : dayOfWeek === 1 ? 0 : 8 - dayOfWeek;
  const monday = new Date(now);
  monday.setDate(monday.getDate() + daysUntilMonday);
  const startDate = monday.toISOString().split('T')[0];

  const fullConfig = { ...config, driver, fuelCostPerMile };

  // Running state
  let driverState = {
    location: driver.homeBase,
    hoursLeft: MAX_DRIVING_HOURS,
    status: 'available',
    currentLoad: null,
  };

  const runningStats = {
    missedOpportunities: [],
    issueOccurred: false,
  };

  const days = [];
  const allEvents = [];
  let activeLoad = null;

  // Broker tracking
  const brokerBreakdown = {};
  let totalRevenue = 0;
  let totalFuelCost = 0;
  let totalDriverPay = 0;
  let totalMilesDriven = 0;
  let totalCheckCalls = 0;
  let totalLoadsOffered = 0;
  let totalAccepted = 0;
  let totalRejected = 0;
  let totalNegotiated = 0;
  let totalDelivered = 0;
  let bestLoad = null;
  let worstDecision = null;

  for (let dayNum = 1; dayNum <= 5; dayNum++) {
    const date = formatDateStr(startDate, dayNum - 1);

    const dayResult = simulateSingleDay(
      dayNum, date, fullConfig, driverState, activeLoad, runningStats
    );

    days.push({
      day: dayResult.day,
      date: dayResult.date,
      dayOfWeek: dayResult.dayOfWeek,
      events: dayResult.events,
      loads: dayResult.loads,
      financials: dayResult.financials,
      driverStatus: dayResult.driverStatus,
    });

    // Tag events with day/date for the full event log
    for (const event of dayResult.events) {
      allEvents.push({ ...event, day: dayNum, date });

      // Track check calls
      if (event.type === 'check_call') totalCheckCalls++;

      // Track broker stats from load_offered events
      if (event.type === 'load_offered' && event.data && event.data.broker) {
        const b = event.data.broker;
        if (!brokerBreakdown[b]) brokerBreakdown[b] = { offered: 0, accepted: 0 };
        brokerBreakdown[b].offered++;
      }
      if (event.type === 'driver_assigned' && event.data && event.data.loadId) {
        // Find the broker for this load from prior events
        const loadEvt = allEvents.find(e => e.type === 'load_offered' && e.data && e.data.loadId === event.data.loadId);
        if (loadEvt && loadEvt.data.broker) {
          const b = loadEvt.data.broker;
          if (!brokerBreakdown[b]) brokerBreakdown[b] = { offered: 0, accepted: 0 };
          brokerBreakdown[b].accepted++;
        }
      }
    }

    // Update running totals
    totalRevenue += dayResult.financials.revenue;
    totalFuelCost += dayResult.financials.fuelCost;
    totalDriverPay += dayResult.financials.driverPay;
    totalMilesDriven += dayResult._internal.milesDriven;
    totalLoadsOffered += dayResult.loads.offered;
    totalAccepted += dayResult.loads.accepted;
    totalRejected += dayResult.loads.rejected;
    totalNegotiated += dayResult.loads.negotiated;
    totalDelivered += dayResult._internal.deliveries.length;

    // Track best load
    for (const del of dayResult._internal.deliveries) {
      const profit = del.totalRate - (del.miles * fuelCostPerMile) - (driver.payModel === 'percent' ? del.totalRate * (driver.payRate / 100) : driver.payModel === 'permile' ? del.miles * driver.payRate : driver.payRate);
      if (!bestLoad || profit > bestLoad.profit) {
        bestLoad = {
          loadId: del.id,
          lane: `${del.origin} \u2192 ${del.destination}`,
          rate: del.totalRate,
          miles: del.miles,
          rpm: del.rpm,
          profit: Math.round(profit),
          broker: del.broker,
        };
      }
    }

    // Update driver state for next day
    activeLoad = dayResult._internal.currentLoad;
    driverState = {
      location: dayResult.driverStatus.location,
      hoursLeft: MAX_DRIVING_HOURS, // resets after 10hr off-duty
      status: 'available',
      currentLoad: activeLoad ? activeLoad.id : null,
    };
  }

  const totalProfit = totalRevenue - totalFuelCost - totalDriverPay;
  const avgProfitPerLoad = totalDelivered > 0 ? Math.round(totalProfit / totalDelivered) : 0;
  const avgRPM = totalMilesDriven > 0 ? Math.round((totalRevenue / totalMilesDriven) * 100) / 100 : 0;

  // Determine worst decision
  if (runningStats.missedOpportunities.length > 0) {
    const sorted = [...runningStats.missedOpportunities].sort((a, b) => b.profitPerMile - a.profitPerMile);
    worstDecision = {
      loadId: sorted[0].loadId,
      lane: sorted[0].lane,
      rate: sorted[0].rate,
      missedProfit: Math.round(sorted[0].profitPerMile * (sorted[0].rate / sorted[0].rpm)),
      reason: sorted[0].reason,
    };
  }

  const endDate = formatDateStr(startDate, 4);

  return {
    company: { name: companyName, dot, mc },
    period: { start: startDate, end: endDate, days: 5 },
    driver: { name: driver.name, homeBase: driver.homeBase, equipment: driver.equipment },

    days,

    summary: {
      totalLoadsOffered,
      totalAccepted,
      totalRejected,
      totalNegotiated,
      totalDelivered,
      totalRevenue,
      totalFuelCost: Math.round(totalFuelCost),
      totalDriverPay,
      totalProfit: Math.round(totalProfit),
      avgProfitPerLoad,
      avgRPM,
      totalMilesDriven,
      totalCheckCalls,
      missedOpportunities: runningStats.missedOpportunities,
      worstDecision,
      bestLoad,
      targetMet: totalProfit >= weeklyTarget,
      targetDiff: Math.round(totalProfit - weeklyTarget),
      brokerBreakdown,
    },

    eventLog: allEvents,
  };
}
