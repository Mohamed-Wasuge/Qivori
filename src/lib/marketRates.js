// Market Rate Simulation Engine
// Realistic estimates based on 2024-2025 industry averages. Placeholder until DAT API integration.

const BASE_RATES = {
  'Dry Van': 2.35, 'Reefer': 2.75, 'Flatbed': 2.95,
  'Step Deck': 3.15, 'Power Only': 1.95, 'Tanker': 3.20,
};

// Monthly seasonal multipliers (index 0 = Jan)
const SEASONAL = [
  0.90, 0.91, 0.98, 1.02, 1.12, 1.14,
  1.03, 1.04, 1.12, 1.13, 1.08, 1.06,
];

const NORTHEAST = ['NY', 'NJ', 'PA', 'CT', 'MA', 'RI', 'NH', 'VT', 'ME'];
const WEST_COAST = ['CA', 'OR', 'WA'];
const SOUTHEAST = ['GA', 'AL', 'MS', 'SC', 'NC', 'TN'];
const MIDWEST = ['OH', 'IN', 'IL', 'MI', 'WI', 'MN', 'IA', 'MO', 'KS', 'NE', 'ND', 'SD'];

// Major corridor states for confidence scoring
const HIGH_TRAFFIC = ['TX', 'CA', 'IL', 'GA', 'PA', 'OH', 'FL', 'NJ', 'TN', 'IN', 'NC', 'MO'];

const BASE_DIESEL = 3.50; // $/gal baseline
const AVG_MPG = 6.5;

function getRegionFactor(state) {
  if (NORTHEAST.includes(state)) return 0.12;
  if (WEST_COAST.includes(state)) return 0.08;
  if (SOUTHEAST.includes(state)) return -0.05;
  if (MIDWEST.includes(state)) return -0.08;
  return 0;
}

function getDistanceAdj(miles) {
  if (miles < 250) return 0.25;
  if (miles < 500) return 0.10;
  if (miles > 1500) return 0.05; // cross-country premium offsets long haul discount
  if (miles > 800) return -0.15;
  return 0;
}

function getLanePremium(originState, destState) {
  let adj = 0;
  if (originState === 'TX') adj -= 0.05;
  if (destState === 'CA') adj += 0.10;
  if (originState === 'FL') adj -= 0.08;
  if (NORTHEAST.includes(originState) && NORTHEAST.includes(destState)) adj += 0.12;
  return adj;
}

function getDayOfWeekFactor(dayOfWeek) {
  // 0=Sun, 5=Fri, 6=Sat
  if (dayOfWeek === 5) return 1.06;
  if (dayOfWeek === 4) return 1.03;
  if (dayOfWeek === 0 || dayOfWeek === 6) return 0.96;
  return 1.0;
}

function getFuelSurcharge(fuelCostPerMile) {
  if (!fuelCostPerMile || fuelCostPerMile <= 0) return 0;
  const baseFuelPerMile = BASE_DIESEL / AVG_MPG; // ~$0.538/mi
  const diff = fuelCostPerMile - baseFuelPerMile;
  return diff > 0 ? diff : 0;
}

function getLaneConfidence(originState, destState, miles) {
  const originHigh = HIGH_TRAFFIC.includes(originState);
  const destHigh = HIGH_TRAFFIC.includes(destState);
  if (originHigh && destHigh) return 90 + Math.random() * 5;
  if (originHigh || destHigh) return 75 + Math.random() * 10;
  return 60 + Math.random() * 15;
}

/**
 * Get estimated market rate per mile for a lane.
 * @param {object} params
 * @param {string} params.originState - 2-letter state code
 * @param {string} params.destState - 2-letter state code
 * @param {string} params.equipment - Equipment type
 * @param {number} params.miles - Trip distance
 * @param {number} [params.month] - 1-12 (defaults to current month)
 * @param {number} [params.dayOfWeek] - 0-6, Sun-Sat (defaults to current day)
 * @param {number} [params.fuelCostPerMile] - Current fuel cost per mile
 * @returns {{ low: number, avg: number, high: number, confidence: number, factors: object }}
 */
export function getMarketRate({
  originState, destState, equipment = 'Dry Van',
  miles = 500, month, dayOfWeek, fuelCostPerMile,
}) {
  const now = new Date();
  const m = (month || (now.getMonth() + 1)) - 1; // 0-indexed
  const dow = dayOfWeek ?? now.getDay();

  const base = BASE_RATES[equipment] || BASE_RATES['Dry Van'];
  const seasonal = SEASONAL[m] || 1.0;
  const originRegion = getRegionFactor(originState);
  const destRegion = getRegionFactor(destState);
  const regionAvg = (originRegion + destRegion) / 2;
  const distAdj = getDistanceAdj(miles);
  const lanePrem = getLanePremium(originState, destState);
  const dowFactor = getDayOfWeekFactor(dow);
  const fuelSurcharge = getFuelSurcharge(fuelCostPerMile);

  const adjusted = (base + distAdj + fuelSurcharge) * (1 + regionAvg + lanePrem) * seasonal * dowFactor;
  const avg = Math.round(adjusted * 100) / 100;
  const spread = equipment === 'Dry Van' || equipment === 'Reefer' ? 0.18 : 0.22;
  const low = Math.round((avg * (1 - spread)) * 100) / 100;
  const high = Math.round((avg * (1 + spread)) * 100) / 100;
  const confidence = Math.round(getLaneConfidence(originState, destState, miles));

  return {
    low, avg, high, confidence,
    factors: {
      base, seasonal: Math.round(seasonal * 100) / 100,
      regionAdj: Math.round(regionAvg * 100) / 100,
      distanceAdj: distAdj,
      lanePremium: Math.round(lanePrem * 100) / 100,
      dayOfWeekFactor: dowFactor,
      fuelSurcharge: Math.round(fuelSurcharge * 100) / 100,
    },
  };
}

/**
 * Compare a load's offered rate against simulated market rate.
 * @param {object} params
 * @param {number} params.offeredRpm - Offered rate per mile
 * @param {string} params.originState
 * @param {string} params.destState
 * @param {string} [params.equipment]
 * @param {number} [params.miles]
 * @param {number} [params.month]
 * @param {number} [params.fuelCostPerMile]
 * @returns {{ vsMarket: string, pctDiff: number, marketAvg: number, marketLow: number, marketHigh: number, verdict: string }}
 */
export function compareToMarket({
  offeredRpm, originState, destState, equipment, miles, month, fuelCostPerMile,
}) {
  const market = getMarketRate({ originState, destState, equipment, miles, month, fuelCostPerMile });
  const pctDiff = Math.round(((offeredRpm - market.avg) / market.avg) * 100);

  let vsMarket, verdict;
  if (pctDiff >= 8) {
    vsMarket = 'above';
    verdict = 'Rate is above market average. Strong load.';
  } else if (pctDiff >= -5) {
    vsMarket = 'at';
    verdict = 'Rate is in line with market. Acceptable.';
  } else if (pctDiff >= -15) {
    vsMarket = 'below';
    verdict = 'Rate is below market. Consider negotiating.';
  } else {
    vsMarket = 'far_below';
    verdict = 'Rate is significantly below market. Not recommended.';
  }

  return {
    vsMarket, pctDiff, verdict,
    marketAvg: market.avg,
    marketLow: market.low,
    marketHigh: market.high,
    confidence: market.confidence,
    factors: market.factors,
  };
}
