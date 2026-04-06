import {
  Truck, Clock, Wrench, User, FlaskConical, AlertTriangle, Shield,
} from 'lucide-react'

// 2026 IFTA fuel tax rates by state (cents per gallon → dollars)
export const ALL_IFTA_RATES = {
  Alabama:0.290, Alaska:0.089, Arizona:0.260, Arkansas:0.285, California:0.680,
  Colorado:0.220, Connecticut:0.250, Delaware:0.220, Florida:0.350, Georgia:0.330,
  Idaho:0.320, Illinois:0.392, Indiana:0.330, Iowa:0.305, Kansas:0.260,
  Kentucky:0.286, Louisiana:0.200, Maine:0.312, Maryland:0.361, Massachusetts:0.240,
  Michigan:0.302, Minnesota:0.285, Mississippi:0.180, Missouri:0.195, Montana:0.325,
  Nebraska:0.286, Nevada:0.230, 'New Hampshire':0.222, 'New Jersey':0.104, 'New Mexico':0.185,
  'New York':0.259, 'North Carolina':0.384, 'North Dakota':0.230, Ohio:0.385, Oklahoma:0.200,
  Oregon:0.380, Pennsylvania:0.576, 'Rhode Island':0.350, 'South Carolina':0.280, 'South Dakota':0.300,
  Tennessee:0.274, Texas:0.200, Utah:0.315, Vermont:0.312, Virginia:0.262,
  Washington:0.494, 'West Virginia':0.357, Wisconsin:0.329, Wyoming:0.240, 'District of Columbia':0.235
}

// Map two-letter state codes to full names
export const STATE_CODES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',
  DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',
  KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',
  MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',
  NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',
  OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',
  TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'
}

// Extract state from location string like "Atlanta, GA" or "Chicago, Illinois"
export function extractState(location) {
  if (!location) return null
  const parts = location.split(',').map(s => s.trim())
  const last = parts[parts.length - 1]
  // Check if it's a 2-letter code
  if (last.length === 2 && STATE_CODES[last.toUpperCase()]) return STATE_CODES[last.toUpperCase()]
  // Check if it's a full state name
  if (ALL_IFTA_RATES[last]) return last
  return null
}

// State adjacency map for continental US (used for IFTA transit state estimation)
export const STATE_NEIGHBORS = {
  Alabama: ['Mississippi','Tennessee','Georgia','Florida'],
  Arizona: ['California','Nevada','Utah','Colorado','New Mexico'],
  Arkansas: ['Missouri','Tennessee','Mississippi','Louisiana','Texas','Oklahoma'],
  California: ['Oregon','Nevada','Arizona'],
  Colorado: ['Wyoming','Nebraska','Kansas','Oklahoma','New Mexico','Utah'],
  Connecticut: ['New York','Massachusetts','Rhode Island'],
  Delaware: ['Maryland','Pennsylvania','New Jersey'],
  Florida: ['Alabama','Georgia'],
  Georgia: ['Florida','Alabama','Tennessee','North Carolina','South Carolina'],
  Idaho: ['Montana','Wyoming','Utah','Nevada','Oregon','Washington'],
  Illinois: ['Wisconsin','Iowa','Missouri','Kentucky','Indiana'],
  Indiana: ['Illinois','Michigan','Ohio','Kentucky'],
  Iowa: ['Minnesota','Wisconsin','Illinois','Missouri','Nebraska','South Dakota'],
  Kansas: ['Nebraska','Missouri','Oklahoma','Colorado'],
  Kentucky: ['Indiana','Ohio','West Virginia','Virginia','Tennessee','Missouri','Illinois'],
  Louisiana: ['Arkansas','Mississippi','Texas'],
  Maine: ['New Hampshire'],
  Maryland: ['Pennsylvania','Delaware','Virginia','West Virginia','District of Columbia'],
  Massachusetts: ['New Hampshire','Vermont','New York','Connecticut','Rhode Island'],
  Michigan: ['Indiana','Ohio','Wisconsin'],
  Minnesota: ['Wisconsin','Iowa','South Dakota','North Dakota'],
  Mississippi: ['Tennessee','Alabama','Louisiana','Arkansas'],
  Missouri: ['Iowa','Illinois','Kentucky','Tennessee','Arkansas','Oklahoma','Kansas','Nebraska'],
  Montana: ['North Dakota','South Dakota','Wyoming','Idaho'],
  Nebraska: ['South Dakota','Iowa','Missouri','Kansas','Colorado','Wyoming'],
  Nevada: ['Oregon','Idaho','Utah','Arizona','California'],
  'New Hampshire': ['Maine','Vermont','Massachusetts'],
  'New Jersey': ['New York','Delaware','Pennsylvania'],
  'New Mexico': ['Colorado','Oklahoma','Texas','Arizona','Utah'],
  'New York': ['Vermont','Massachusetts','Connecticut','New Jersey','Pennsylvania'],
  'North Carolina': ['Virginia','Tennessee','Georgia','South Carolina'],
  'North Dakota': ['Montana','South Dakota','Minnesota'],
  Ohio: ['Michigan','Indiana','Kentucky','West Virginia','Pennsylvania'],
  Oklahoma: ['Kansas','Missouri','Arkansas','Texas','New Mexico','Colorado'],
  Oregon: ['Washington','Idaho','Nevada','California'],
  Pennsylvania: ['New York','New Jersey','Delaware','Maryland','West Virginia','Ohio'],
  'Rhode Island': ['Connecticut','Massachusetts'],
  'South Carolina': ['North Carolina','Georgia'],
  'South Dakota': ['North Dakota','Minnesota','Iowa','Nebraska','Wyoming','Montana'],
  Tennessee: ['Kentucky','Virginia','North Carolina','Georgia','Alabama','Mississippi','Arkansas','Missouri'],
  Texas: ['New Mexico','Oklahoma','Arkansas','Louisiana'],
  Utah: ['Idaho','Wyoming','Colorado','New Mexico','Arizona','Nevada'],
  Vermont: ['New Hampshire','Massachusetts','New York'],
  Virginia: ['Maryland','West Virginia','Kentucky','Tennessee','North Carolina','District of Columbia'],
  Washington: ['Oregon','Idaho'],
  'West Virginia': ['Pennsylvania','Maryland','Virginia','Kentucky','Ohio'],
  Wisconsin: ['Michigan','Minnesota','Iowa','Illinois'],
  Wyoming: ['Montana','South Dakota','Nebraska','Colorado','Utah','Idaho'],
  'District of Columbia': ['Maryland','Virginia'],
}

// Common trucking corridors with known transit states
export const COMMON_CORRIDORS = {
  'Texas|California': ['New Mexico','Arizona'],
  'Texas|Arizona': ['New Mexico'],
  'Texas|Nevada': ['New Mexico','Arizona'],
  'Texas|Oregon': ['New Mexico','Arizona','California'],
  'Texas|Washington': ['New Mexico','Arizona','California','Oregon'],
  'Texas|Illinois': ['Oklahoma','Missouri'],
  'Texas|Ohio': ['Oklahoma','Missouri','Indiana'],
  'Texas|Georgia': ['Louisiana','Mississippi','Alabama'],
  'Texas|Florida': ['Louisiana','Mississippi','Alabama'],
  'Texas|New York': ['Oklahoma','Missouri','Illinois','Indiana','Ohio','Pennsylvania'],
  'Texas|Pennsylvania': ['Oklahoma','Missouri','Illinois','Indiana','Ohio'],
  'California|Oregon': [],
  'California|Washington': ['Oregon'],
  'California|Illinois': ['Nevada','Utah','Wyoming','Nebraska','Iowa'],
  'California|New York': ['Nevada','Utah','Wyoming','Nebraska','Iowa','Illinois','Indiana','Ohio','Pennsylvania'],
  'California|Georgia': ['Arizona','New Mexico','Texas','Louisiana','Mississippi','Alabama'],
  'California|Florida': ['Arizona','New Mexico','Texas','Louisiana','Mississippi','Alabama'],
  'California|Ohio': ['Nevada','Utah','Wyoming','Nebraska','Iowa','Illinois','Indiana'],
  'California|Pennsylvania': ['Nevada','Utah','Wyoming','Nebraska','Iowa','Illinois','Indiana','Ohio'],
  'Florida|New York': ['Georgia','South Carolina','North Carolina','Virginia','Maryland','New Jersey'],
  'Florida|Illinois': ['Georgia','Tennessee','Kentucky'],
  'Florida|Texas': ['Alabama','Mississippi','Louisiana'],
  'Florida|Ohio': ['Georgia','Tennessee','Kentucky'],
  'Florida|Pennsylvania': ['Georgia','South Carolina','North Carolina','Virginia','Maryland'],
  'Georgia|New York': ['South Carolina','North Carolina','Virginia','Maryland','New Jersey'],
  'Georgia|Illinois': ['Tennessee','Kentucky'],
  'Georgia|Ohio': ['Tennessee','Kentucky'],
  'Illinois|New York': ['Indiana','Ohio','Pennsylvania'],
  'Illinois|Pennsylvania': ['Indiana','Ohio'],
  'Ohio|New York': ['Pennsylvania'],
  'Washington|New York': ['Idaho','Montana','North Dakota','Minnesota','Wisconsin','Michigan','Ohio','Pennsylvania'],
}

// BFS pathfinding between two states using the adjacency map
export function findStatePath(fromState, toState) {
  if (fromState === toState) return [fromState]
  const visited = new Set([fromState])
  const queue = [[fromState]]
  while (queue.length > 0) {
    const path = queue.shift()
    const current = path[path.length - 1]
    const neighbors = STATE_NEIGHBORS[current] || []
    for (const neighbor of neighbors) {
      if (neighbor === toState) return [...path, neighbor]
      if (!visited.has(neighbor)) {
        visited.add(neighbor)
        queue.push([...path, neighbor])
      }
    }
  }
  // Fallback: no path found (should not happen for continental US)
  return [fromState, toState]
}

// Estimate mileage distribution across states for a route.
// Uses common corridors for well-known routes, BFS pathfinding for others,
// and distributes 100% of miles proportionally across all states in the path.
export function estimateStateMiles(origin, destination, totalMiles) {
  const originState = extractState(origin)
  const destState = extractState(destination)
  if (!originState && !destState) return {}
  if (originState === destState) return { [originState]: totalMiles }
  if (!originState) return { [destState]: totalMiles }
  if (!destState) return { [originState]: totalMiles }

  // Check common corridors first (both directions)
  const key1 = `${originState}|${destState}`
  const key2 = `${destState}|${originState}`
  let transitStates = COMMON_CORRIDORS[key1] || COMMON_CORRIDORS[key2] || null

  let routeStates
  if (transitStates !== null) {
    // Known corridor: origin + transit + destination
    routeStates = [originState, ...transitStates, destState]
  } else {
    // Use BFS to find a path through state neighbors
    routeStates = findStatePath(originState, destState)
  }

  // Distribute miles: origin and destination get a larger share (they include
  // city driving, pickup/delivery), transit states split the middle portion.
  const count = routeStates.length
  if (count === 2) {
    // Direct neighbors: 50/50 split
    const half = Math.round(totalMiles / 2)
    return { [routeStates[0]]: half, [routeStates[1]]: totalMiles - half }
  }

  // For multi-state routes: endpoints get 1.5 shares, transit states get 1 share
  const transitCount = count - 2
  const totalShares = 3 + transitCount  // 1.5 + 1.5 + transitCount * 1
  const result = {}
  let distributed = 0

  for (let i = 0; i < count; i++) {
    const state = routeStates[i]
    const isEndpoint = (i === 0 || i === count - 1)
    const share = isEndpoint ? 1.5 : 1
    const miles = Math.round(totalMiles * share / totalShares)
    result[state] = (result[state] || 0) + miles
    distributed += miles
  }

  // Assign any rounding remainder to the origin state so 100% is accounted for
  const remainder = totalMiles - distributed
  if (remainder !== 0) {
    result[routeStates[0]] = (result[routeStates[0]] || 0) + remainder
  }

  return result
}

export const DVIR_ITEMS_DEFAULT = [
  {item:'Brakes',        status:'Pass'}, {item:'Tires',          status:'Pass'},
  {item:'Lights',        status:'Pass'}, {item:'Steering',       status:'Pass'},
  {item:'Horn',          status:'Pass'}, {item:'Wipers',         status:'Pass'},
  {item:'Mirrors',       status:'Pass'}, {item:'Fuel System',    status:'Pass'},
  {item:'Coupling Dev',  status:'Pass'}, {item:'Emergency Equip',status:'Pass'},
  {item:'Fire Ext.',     status:'Pass'}, {item:'Seat Belts',     status:'Pass'},
]

export const COMPLIANCE_DRIVERS = []

export function getBasicScores() {
  return [
    { basic:'Unsafe Driving',       score:0, threshold:65, icon: Truck,         tip:'No violations recorded yet' },
    { basic:'HOS Compliance',       score:0, threshold:65, icon: Clock,         tip:'No violations recorded yet' },
    { basic:'Vehicle Maintenance',  score:0, threshold:80, icon: Wrench,        tip:'No violations recorded yet' },
    { basic:'Driver Fitness',       score:0, threshold:80, icon: User,          tip:'No violations recorded yet' },
    { basic:'Controlled Substances',score:0, threshold:50, icon: FlaskConical,  tip:'No violations recorded yet' },
    { basic:'Crash Indicator',      score:0, threshold:65, icon: AlertTriangle, tip:'No violations recorded yet' },
    { basic:'Hazmat Compliance',    score:0, threshold:50, icon: Shield,        tip:'No violations recorded yet' },
  ]
}
