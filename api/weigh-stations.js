import { handleCors, corsHeaders, requireAuth } from './_lib/auth.js'

export const config = { runtime: 'edge' }

// Major US weigh stations with hours and bypass info
// Source: compiled from state DOT data — covers top trucking corridors
const WEIGH_STATIONS = [
  // Illinois
  { name: 'I-80 Weigh Station (Minooka)', state: 'IL', lat: 41.4542, lng: -88.2654, highway: 'I-80', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '815-467-2281' },
  { name: 'I-55 Weigh Station (Dwight)', state: 'IL', lat: 41.1044, lng: -88.4254, highway: 'I-55', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '815-584-3530' },
  { name: 'I-57 Weigh Station (Pesotum)', state: 'IL', lat: 39.9142, lng: -88.2741, highway: 'I-57', direction: 'NB/SB', hours: 'Mon-Fri 7AM-7PM', bypass: 'PrePass', phone: '' },
  { name: 'I-94 Weigh Station (Antioch)', state: 'IL', lat: 42.4761, lng: -88.0861, highway: 'I-94', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '' },
  { name: 'I-74 Weigh Station (Danville)', state: 'IL', lat: 40.1246, lng: -87.6301, highway: 'I-74', direction: 'EB/WB', hours: 'Mon-Sat 6AM-10PM', bypass: 'PrePass', phone: '' },
  // Georgia
  { name: 'I-75 Weigh Station (Ringgold)', state: 'GA', lat: 34.9162, lng: -85.1091, highway: 'I-75', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '706-935-2128' },
  { name: 'I-75 Weigh Station (Tifton)', state: 'GA', lat: 31.4505, lng: -83.5085, highway: 'I-75', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '229-386-3604' },
  { name: 'I-95 Weigh Station (Savannah)', state: 'GA', lat: 32.0835, lng: -81.0998, highway: 'I-95', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '' },
  { name: 'I-20 Weigh Station (Augusta)', state: 'GA', lat: 33.4735, lng: -82.0105, highway: 'I-20', direction: 'EB/WB', hours: 'Mon-Fri 6AM-10PM', bypass: 'PrePass', phone: '' },
  { name: 'I-85 Weigh Station (Commerce)', state: 'GA', lat: 34.2034, lng: -83.4574, highway: 'I-85', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '' },
  // Texas
  { name: 'I-35 Weigh Station (Hillsboro)', state: 'TX', lat: 32.0104, lng: -97.1297, highway: 'I-35', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '254-582-3411' },
  { name: 'I-10 Weigh Station (Sierra Blanca)', state: 'TX', lat: 31.1743, lng: -105.3571, highway: 'I-10', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '915-369-2811' },
  { name: 'I-20 Weigh Station (Midland)', state: 'TX', lat: 31.9973, lng: -102.0779, highway: 'I-20', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  { name: 'I-45 Weigh Station (Madisonville)', state: 'TX', lat: 30.9468, lng: -95.9113, highway: 'I-45', direction: 'NB/SB', hours: 'Mon-Sat 7AM-11PM', bypass: 'PrePass, Drivewyze', phone: '' },
  { name: 'I-30 Weigh Station (Sulphur Springs)', state: 'TX', lat: 33.1385, lng: -95.6010, highway: 'I-30', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Florida
  { name: 'I-75 Weigh Station (Wildwood)', state: 'FL', lat: 28.7655, lng: -82.0340, highway: 'I-75', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '352-748-2830' },
  { name: 'I-95 Weigh Station (Yulee)', state: 'FL', lat: 30.6319, lng: -81.5768, highway: 'I-95', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '904-225-5211' },
  { name: 'I-10 Weigh Station (Live Oak)', state: 'FL', lat: 30.2949, lng: -82.9840, highway: 'I-10', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '' },
  { name: 'I-4 Weigh Station (Polk City)', state: 'FL', lat: 28.1825, lng: -81.8234, highway: 'I-4', direction: 'EB/WB', hours: 'Mon-Fri 7AM-7PM', bypass: 'PrePass', phone: '' },
  // Tennessee
  { name: 'I-40 Weigh Station (Knoxville)', state: 'TN', lat: 35.9606, lng: -83.9207, highway: 'I-40', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '865-594-5800' },
  { name: 'I-24 Weigh Station (Monteagle)', state: 'TN', lat: 35.2376, lng: -85.8391, highway: 'I-24', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  { name: 'I-65 Weigh Station (Spring Hill)', state: 'TN', lat: 35.7512, lng: -86.9302, highway: 'I-65', direction: 'NB/SB', hours: 'Mon-Sat 6AM-10PM', bypass: 'PrePass, Drivewyze', phone: '' },
  { name: 'I-81 Weigh Station (Greene County)', state: 'TN', lat: 36.1745, lng: -82.8312, highway: 'I-81', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Ohio
  { name: 'I-71 Weigh Station (Medina)', state: 'OH', lat: 41.1384, lng: -81.8637, highway: 'I-71', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '330-725-4211' },
  { name: 'I-70 Weigh Station (Huber Heights)', state: 'OH', lat: 39.8443, lng: -84.1246, highway: 'I-70', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  { name: 'I-75 Weigh Station (Findlay)', state: 'OH', lat: 41.0442, lng: -83.6499, highway: 'I-75', direction: 'NB/SB', hours: 'Mon-Sat 6AM-12AM', bypass: 'PrePass, Drivewyze', phone: '' },
  { name: 'I-80 Weigh Station (North Jackson)', state: 'OH', lat: 41.1052, lng: -80.8581, highway: 'I-80/I-76', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Indiana
  { name: 'I-65 Weigh Station (Lowell)', state: 'IN', lat: 41.2914, lng: -87.4209, highway: 'I-65', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '219-696-6242' },
  { name: 'I-70 Weigh Station (Greenfield)', state: 'IN', lat: 39.7851, lng: -85.7694, highway: 'I-70', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  { name: 'I-69 Weigh Station (Fort Wayne)', state: 'IN', lat: 41.0793, lng: -85.1394, highway: 'I-69', direction: 'NB/SB', hours: 'Mon-Fri 7AM-7PM', bypass: 'PrePass', phone: '' },
  // California
  { name: 'I-5 Weigh Station (Grapevine)', state: 'CA', lat: 34.9362, lng: -118.7762, highway: 'I-5', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '661-248-6750' },
  { name: 'I-15 Weigh Station (Yermo)', state: 'CA', lat: 34.9042, lng: -116.8235, highway: 'I-15', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '' },
  { name: 'I-5 Weigh Station (Corning)', state: 'CA', lat: 39.9277, lng: -122.1791, highway: 'I-5', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '' },
  { name: 'I-10 Weigh Station (Banning)', state: 'CA', lat: 33.9253, lng: -116.8762, highway: 'I-10', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  { name: 'I-80 Weigh Station (Donner Pass)', state: 'CA', lat: 39.3139, lng: -120.3496, highway: 'I-80', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // North Carolina
  { name: 'I-85 Weigh Station (Hillsborough)', state: 'NC', lat: 36.0726, lng: -79.0992, highway: 'I-85', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '919-732-3362' },
  { name: 'I-40 Weigh Station (Old Fort)', state: 'NC', lat: 35.6276, lng: -82.1748, highway: 'I-40', direction: 'EB/WB', hours: 'Mon-Sat 6AM-10PM', bypass: 'PrePass', phone: '' },
  { name: 'I-95 Weigh Station (Lumberton)', state: 'NC', lat: 34.6182, lng: -79.0053, highway: 'I-95', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Pennsylvania
  { name: 'I-81 Weigh Station (Harrisburg)', state: 'PA', lat: 40.2732, lng: -76.8867, highway: 'I-81', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '717-566-6017' },
  { name: 'I-80 Weigh Station (Loganton)', state: 'PA', lat: 41.0352, lng: -77.3045, highway: 'I-80', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  { name: 'I-78 Weigh Station (Bethel)', state: 'PA', lat: 40.4782, lng: -76.3011, highway: 'I-78', direction: 'EB/WB', hours: 'Mon-Fri 6AM-10PM', bypass: 'PrePass', phone: '' },
  // Alabama
  { name: 'I-65 Weigh Station (Dodge City)', state: 'AL', lat: 31.0835, lng: -86.6611, highway: 'I-65', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '' },
  { name: 'I-20 Weigh Station (Heflin)', state: 'AL', lat: 33.6490, lng: -85.5885, highway: 'I-20', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Mississippi
  { name: 'I-55 Weigh Station (Grenada)', state: 'MS', lat: 33.7690, lng: -89.8087, highway: 'I-55', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '' },
  { name: 'I-20 Weigh Station (Newton)', state: 'MS', lat: 32.3210, lng: -89.1634, highway: 'I-20', direction: 'EB/WB', hours: 'Mon-Sat 6AM-10PM', bypass: 'PrePass', phone: '' },
  // Louisiana
  { name: 'I-10 Weigh Station (Vinton)', state: 'LA', lat: 30.1915, lng: -93.5815, highway: 'I-10', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '337-589-7458' },
  { name: 'I-20 Weigh Station (Tallulah)', state: 'LA', lat: 32.4085, lng: -91.1868, highway: 'I-20', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Arkansas
  { name: 'I-40 Weigh Station (West Memphis)', state: 'AR', lat: 35.1465, lng: -90.1848, highway: 'I-40', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '870-735-0780' },
  { name: 'I-30 Weigh Station (Arkadelphia)', state: 'AR', lat: 34.1209, lng: -93.0538, highway: 'I-30', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Missouri
  { name: 'I-44 Weigh Station (Joplin)', state: 'MO', lat: 37.0842, lng: -94.5133, highway: 'I-44', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '' },
  { name: 'I-70 Weigh Station (Bates City)', state: 'MO', lat: 39.0042, lng: -94.0651, highway: 'I-70', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Virginia
  { name: 'I-81 Weigh Station (Stephens City)', state: 'VA', lat: 39.0835, lng: -78.2218, highway: 'I-81', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '540-869-0738' },
  { name: 'I-95 Weigh Station (Carson)', state: 'VA', lat: 37.0935, lng: -77.3998, highway: 'I-95', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // New York
  { name: 'I-87 Weigh Station (New Baltimore)', state: 'NY', lat: 42.4352, lng: -73.7845, highway: 'I-87', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '518-756-2610' },
  { name: 'I-90 Weigh Station (Guilderland)', state: 'NY', lat: 42.6826, lng: -73.9049, highway: 'I-90', direction: 'EB/WB', hours: 'Mon-Fri 6AM-10PM', bypass: 'PrePass', phone: '' },
  // New Jersey
  { name: 'NJ Turnpike Weigh Station (Cranbury)', state: 'NJ', lat: 40.3157, lng: -74.5168, highway: 'NJ Turnpike', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Kentucky
  { name: 'I-75 Weigh Station (Williamsburg)', state: 'KY', lat: 36.7435, lng: -84.1597, highway: 'I-75', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '' },
  { name: 'I-65 Weigh Station (Shepherdsville)', state: 'KY', lat: 37.9885, lng: -85.7135, highway: 'I-65', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Arizona
  { name: 'I-10 Weigh Station (Ehrenberg)', state: 'AZ', lat: 33.6042, lng: -114.5251, highway: 'I-10', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  { name: 'I-40 Weigh Station (Sanders)', state: 'AZ', lat: 35.2235, lng: -109.3344, highway: 'I-40', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // New Mexico
  { name: 'I-10 Weigh Station (Las Cruces)', state: 'NM', lat: 32.3199, lng: -106.7637, highway: 'I-10', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  { name: 'I-40 Weigh Station (Gallup)', state: 'NM', lat: 35.5281, lng: -108.7426, highway: 'I-40', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Oklahoma
  { name: 'I-35 Weigh Station (Goldsby)', state: 'OK', lat: 35.1385, lng: -97.4753, highway: 'I-35', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '' },
  { name: 'I-40 Weigh Station (Roland)', state: 'OK', lat: 35.4192, lng: -94.5168, highway: 'I-40', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Kansas
  { name: 'I-70 Weigh Station (Bonner Springs)', state: 'KS', lat: 39.0626, lng: -94.8838, highway: 'I-70', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  { name: 'I-35 Weigh Station (Williamsburg)', state: 'KS', lat: 38.4823, lng: -95.4660, highway: 'I-35', direction: 'NB/SB', hours: 'Mon-Sat 7AM-11PM', bypass: 'PrePass', phone: '' },
  // Colorado
  { name: 'I-70 Weigh Station (Dumont)', state: 'CO', lat: 39.7435, lng: -105.6097, highway: 'I-70', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  { name: 'I-25 Weigh Station (Monument)', state: 'CO', lat: 39.0918, lng: -104.8727, highway: 'I-25', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '' },
  // Nebraska
  { name: 'I-80 Weigh Station (North Platte)', state: 'NE', lat: 41.1240, lng: -100.7654, highway: 'I-80', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Iowa
  { name: 'I-80 Weigh Station (Grinnell)', state: 'IA', lat: 41.7430, lng: -92.7224, highway: 'I-80', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '' },
  // South Carolina
  { name: 'I-95 Weigh Station (Hardeeville)', state: 'SC', lat: 32.2813, lng: -81.0817, highway: 'I-95', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '' },
  { name: 'I-85 Weigh Station (Blacksburg)', state: 'SC', lat: 35.1259, lng: -81.5266, highway: 'I-85', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Michigan
  { name: 'I-94 Weigh Station (New Buffalo)', state: 'MI', lat: 41.7932, lng: -86.7485, highway: 'I-94', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass, Drivewyze', phone: '' },
  { name: 'I-75 Weigh Station (Birch Run)', state: 'MI', lat: 43.2494, lng: -83.7940, highway: 'I-75', direction: 'NB/SB', hours: 'Mon-Sat 6AM-12AM', bypass: 'PrePass', phone: '' },
  // Wisconsin
  { name: 'I-90 Weigh Station (Beloit)', state: 'WI', lat: 42.5083, lng: -89.0318, highway: 'I-90', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Minnesota
  { name: 'I-35 Weigh Station (Forest Lake)', state: 'MN', lat: 45.2788, lng: -93.0163, highway: 'I-35', direction: 'NB/SB', hours: 'Mon-Fri 7AM-7PM', bypass: 'PrePass', phone: '' },
  // Oregon
  { name: 'I-5 Weigh Station (Ashland)', state: 'OR', lat: 42.1946, lng: -122.7095, highway: 'I-5', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass, Drivewyze (Green Light)', phone: '' },
  // Washington
  { name: 'I-5 Weigh Station (Ridgefield)', state: 'WA', lat: 45.8145, lng: -122.7428, highway: 'I-5', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Nevada
  { name: 'I-80 Weigh Station (Verdi)', state: 'NV', lat: 39.5185, lng: -119.9886, highway: 'I-80', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Utah
  { name: 'I-15 Weigh Station (Perry)', state: 'UT', lat: 41.4655, lng: -112.0355, highway: 'I-15', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Idaho
  { name: 'I-84 Weigh Station (Cotterell)', state: 'ID', lat: 42.3624, lng: -113.5649, highway: 'I-84', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Wyoming
  { name: 'I-80 Weigh Station (Evanston)', state: 'WY', lat: 41.2613, lng: -110.9632, highway: 'I-80', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Montana
  { name: 'I-90 Weigh Station (Huntley)', state: 'MT', lat: 45.9035, lng: -108.2735, highway: 'I-90', direction: 'EB/WB', hours: 'Mon-Fri 7AM-5PM', bypass: 'PrePass', phone: '' },
  // West Virginia
  { name: 'I-77 Weigh Station (Princeton)', state: 'WV', lat: 37.3666, lng: -81.1023, highway: 'I-77', direction: 'NB/SB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Maryland
  { name: 'I-70 Weigh Station (Hancock)', state: 'MD', lat: 39.6987, lng: -78.1797, highway: 'I-70', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
  // Connecticut
  { name: 'I-84 Weigh Station (Southington)', state: 'CT', lat: 41.5965, lng: -72.8781, highway: 'I-84', direction: 'EB/WB', hours: 'Mon-Fri 6AM-6PM', bypass: 'PrePass', phone: '' },
  // Massachusetts
  { name: 'I-90 Weigh Station (Charlton)', state: 'MA', lat: 42.1371, lng: -72.0661, highway: 'I-90', direction: 'EB/WB', hours: '24/7', bypass: 'PrePass', phone: '' },
]

// Haversine distance in miles
function haversine(lat1, lon1, lat2, lon2) {
  const R = 3959
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// Parse hours string and determine if currently open
function isStationOpen(hoursStr, now) {
  if (!hoursStr) return { open: null, status: 'Unknown' }
  if (hoursStr === '24/7') return { open: true, status: 'Open 24/7' }

  const day = now.getDay() // 0=Sun, 1=Mon...6=Sat
  const hour = now.getHours()
  const minute = now.getMinutes()
  const currentMinutes = hour * 60 + minute

  // Parse patterns like "Mon-Fri 7AM-7PM", "Mon-Sat 6AM-10PM"
  const match = hoursStr.match(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)-(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\d{1,2})(AM|PM)-(\d{1,2})(AM|PM)/)
  if (!match) return { open: null, status: hoursStr }

  const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const startDay = dayMap[match[1]]
  const endDay = dayMap[match[2]]

  let openHour = parseInt(match[3])
  if (match[4] === 'PM' && openHour !== 12) openHour += 12
  if (match[4] === 'AM' && openHour === 12) openHour = 0

  let closeHour = parseInt(match[5])
  if (match[6] === 'PM' && closeHour !== 12) closeHour += 12
  if (match[6] === 'AM' && closeHour === 12) closeHour = 0

  const openMinutes = openHour * 60
  const closeMinutes = closeHour * 60

  // Check if current day is in range
  let dayInRange = false
  if (startDay <= endDay) {
    dayInRange = day >= startDay && day <= endDay
  } else {
    dayInRange = day >= startDay || day <= endDay
  }

  if (!dayInRange) return { open: false, status: `Closed — hours: ${hoursStr}` }

  const timeInRange = currentMinutes >= openMinutes && currentMinutes < closeMinutes
  if (timeInRange) {
    const minsLeft = closeMinutes - currentMinutes
    const hoursLeft = Math.floor(minsLeft / 60)
    const minsRemaining = minsLeft % 60
    return {
      open: true,
      status: `Open now — closes in ${hoursLeft}h ${minsRemaining}m`,
    }
  } else {
    if (currentMinutes < openMinutes) {
      const minsUntil = openMinutes - currentMinutes
      const hoursUntil = Math.floor(minsUntil / 60)
      const minsRemaining = minsUntil % 60
      return { open: false, status: `Closed — opens in ${hoursUntil}h ${minsRemaining}m` }
    }
    return { open: false, status: `Closed — hours: ${hoursStr}` }
  }
}

// Generate a stable key for matching reports to stations
function stationKey(s) {
  return `${s.state}-${s.highway.replace(/\s+/g, '')}-${s.name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 20)}`
}

// Fetch recent crowdsourced reports from Supabase (last 2 hours)
async function fetchRecentReports(stationKeys) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey || stationKeys.length === 0) return {}

  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
    // Get most recent report per station
    const res = await fetch(
      `${supabaseUrl}/rest/v1/weigh_station_reports?reported_at=gte.${twoHoursAgo}&station_key=in.(${stationKeys.map(k => `"${k}"`).join(',')})&order=reported_at.desc&limit=50`,
      { headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` } }
    )
    if (!res.ok) return {}
    const rows = await res.json()
    // Keep only the most recent report per station
    const byStation = {}
    for (const r of rows) {
      if (!byStation[r.station_key]) byStation[r.station_key] = r
    }
    return byStation
  } catch {
    return {}
  }
}

// Submit a crowdsourced report
async function submitReport(body) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    return Response.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { station_key, station_name, state, highway, lat, lng, status, reporter_id } = body
  if (!station_key || !status) {
    return Response.json({ error: 'station_key and status required' }, { status: 400 })
  }

  const res = await fetch(`${supabaseUrl}/rest/v1/weigh_station_reports`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      station_key,
      station_name: station_name || '',
      state: state || '',
      highway: highway || '',
      lat: lat || null,
      lng: lng || null,
      status,
      reporter_id: reporter_id || null,
      reported_at: new Date().toISOString(),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    return Response.json({ error: 'Report failed: ' + err }, { status: 500 })
  }
  return Response.json({ success: true, message: 'Thanks! Your report helps other drivers.' })
}

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  const authErr = await requireAuth(req)
  if (authErr) return authErr

  try {
    const body = await req.json()

    // If this is a report submission
    if (body.action === 'report') {
      return submitReport(body)
    }

    // Otherwise it's a status query
    const { lat, lng, state, highway, radius = 50 } = body
    const now = new Date()
    let results = WEIGH_STATIONS

    // Filter by state if provided
    if (state) {
      const stateUpper = state.toUpperCase().trim()
      results = results.filter(s => s.state === stateUpper)
    }

    // Filter by highway if provided
    if (highway) {
      const hw = highway.toUpperCase().replace(/\s+/g, '')
      results = results.filter(s => s.highway.toUpperCase().replace(/\s+/g, '').includes(hw))
    }

    // If GPS provided, sort by distance and filter by radius
    if (lat && lng) {
      results = results
        .map(s => ({ ...s, distance: Math.round(haversine(lat, lng, s.lat, s.lng)) }))
        .filter(s => s.distance <= radius)
        .sort((a, b) => a.distance - b.distance)
    }

    // Slice to top 10 before fetching reports
    results = results.slice(0, 10)

    // Generate station keys and fetch crowdsourced reports
    const keys = results.map(s => stationKey(s))
    const reports = await fetchRecentReports(keys)

    // Merge schedule-based status with crowdsourced reports
    const finalResults = results.map((s, i) => {
      const key = keys[i]
      const { open: scheduleOpen, status: scheduleStatus } = isStationOpen(s.hours, now)
      const report = reports[key]

      let open = scheduleOpen
      let status = scheduleStatus
      let reportedBy = null
      let reportedAgo = null

      // Fresh crowdsourced report overrides schedule
      if (report) {
        const ageMs = Date.now() - new Date(report.reported_at).getTime()
        const ageMins = Math.round(ageMs / 60000)
        reportedAgo = ageMins < 60 ? `${ageMins}m ago` : `${Math.round(ageMins / 60)}h ago`
        open = report.status === 'open'
        status = open
          ? `Open — reported ${reportedAgo} by driver`
          : `Closed — reported ${reportedAgo} by driver`
        reportedBy = 'driver'
      }

      return {
        name: s.name,
        key,
        state: s.state,
        highway: s.highway,
        direction: s.direction,
        hours: s.hours,
        bypass: s.bypass,
        phone: s.phone || null,
        open,
        status,
        scheduleStatus,
        reportedBy,
        reportedAgo,
        distance: s.distance || null,
        lat: s.lat,
        lng: s.lng,
      }
    })

    return Response.json({ stations: finalResults, count: finalResults.length, timestamp: now.toISOString() })
  } catch (err) {
    return Response.json({ error: 'Server error' }, { status: 500 })
  }
}
