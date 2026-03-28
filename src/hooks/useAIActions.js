import { useCallback } from 'react'
import { useApp } from '../context/AppContext'
import { useCarrier } from '../context/CarrierContext'
import { apiFetch } from '../lib/api'

// Parse ```action {...}``` blocks from AI response text
export function parseActions(text) {
  const actionRegex = /```action\s*\n?([\s\S]*?)```/g
  const actions = []
  let match
  while ((match = actionRegex.exec(text)) !== null) {
    try { actions.push(JSON.parse(match[1].trim())) } catch {}
  }
  const displayText = text.replace(/```action\s*\n?[\s\S]*?```/g, '').trim()
  return { actions, displayText }
}

// Helper: get coordinates from active load or action params
function getCoords(action, activeLoads) {
  if (action?.lat && action?.lng) return { lat: action.lat, lng: action.lng }
  const load = activeLoads?.[0]
  if (load?.origin_lat && load?.origin_lng) return { lat: load.origin_lat, lng: load.origin_lng }
  if (load?.dest_lat && load?.dest_lng) return { lat: load.dest_lat, lng: load.dest_lng }
  return null
}

// Hook: execute AI actions using CarrierContext
export function useAIActions(onNavigate) {
  const { showToast } = useApp() || {}
  const {
    loads, invoices, company, activeLoads, expenses,
    addLoad, addExpense, updateLoadStatus, updateInvoiceStatus, logCheckCall,
  } = useCarrier() || {}

  const executeAction = useCallback(async (action) => {
    if (!action?.type) return null

    try {
      switch (action.type) {
        case 'add_expense': {
          if (!addExpense) return null
          await addExpense({
            category: action.category || 'Other',
            amount: parseFloat(action.amount) || 0,
            merchant: action.merchant || '',
            notes: action.notes || '',
            date: new Date().toISOString().split('T')[0],
            gallons: action.gallons ? parseFloat(action.gallons) : null,
            price_per_gallon: action.price_per_gallon ? parseFloat(action.price_per_gallon) : null,
            state: action.state || null,
          })
          const iftaNote = action.gallons && action.state ? ` (${action.gallons} gal, ${action.state} — IFTA logged)` : ''
          showToast?.('', 'Expense Added', `$${action.amount} — ${action.category}${iftaNote}`)
          return `Logged $${action.amount} ${action.category} expense.${iftaNote}`
        }

        case 'mark_invoice_paid': {
          const inv = invoices?.find(i =>
            i.id === action.invoice_id || i.invoice_number === action.invoice_id || i._dbId === action.invoice_id
          ) || invoices?.find(i => i.status === 'Unpaid')
          if (!inv) return 'No unpaid invoice found.'
          if (updateInvoiceStatus) {
            await updateInvoiceStatus(inv.id || inv.invoice_number || inv._dbId, 'Paid')
            showToast?.('', 'Invoice Paid', `${inv.invoice_number || inv.id} — $${Number(inv.amount || 0).toLocaleString()}`)
            return `Marked ${inv.invoice_number || inv.id} as paid.`
          }
          return null
        }

        case 'check_call': {
          const load = loads?.find(l => l.id === action.load_id || l.load_id === action.load_id) || activeLoads?.[0]
          if (!load) return 'No active load found.'
          const loadNumber = load.loadId || load.load_id || load.load_number || load.id
          if (logCheckCall) {
            await logCheckCall(loadNumber, {
              location: action.location || 'Unknown',
              status: action.status || 'On Time',
              notes: action.notes || '',
              called_at: new Date().toISOString(),
            })
            showToast?.('', 'Check Call Logged', action.location || loadNumber)
            return `Check call logged: ${action.status || 'On Time'} at ${action.location || 'current location'}`
          }
          return null
        }

        case 'update_load_status': {
          const load = loads?.find(l => l.id === action.load_id || l.load_id === action.load_id) || activeLoads?.[0]
          if (load && updateLoadStatus) {
            await updateLoadStatus(load.id, action.status)
            showToast?.('', 'Load Updated', `${load.loadId || load.load_id || load.id} → ${action.status}`)
            return `Updated load to ${action.status}.`
          }
          return 'No matching load found.'
        }

        case 'book_load': {
          if (!addLoad) return null
          try {
            await addLoad({
              origin: action.origin,
              destination: action.destination || action.dest,
              miles: action.miles,
              rate: action.gross || action.rate,
              rate_per_mile: action.rate,
              equipment: action.equipment || 'Dry Van',
              broker_name: action.broker,
              weight: action.weight,
              commodity: action.commodity,
              pickup_date: action.pickup,
              delivery_date: action.delivery,
              reference_number: action.refNum,
              status: 'Booked',
              load_type: 'FTL',
            })
            showToast?.('', 'Load Booked', `${action.origin} → ${action.destination || action.dest} — $${Number(action.gross || 0).toLocaleString()}`)
            return `Booked: ${action.origin} → ${action.destination || action.dest}`
          } catch (err) {
            showToast?.('', 'Booking Failed', err.message)
            return 'Failed to book load: ' + err.message
          }
        }

        case 'send_invoice': {
          try {
            const res = await apiFetch('/api/send-invoice', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                to: action.to,
                carrierName: company?.name || 'Carrier',
                invoiceNumber: action.invoiceNumber || `INV-${Math.floor(1000 + Math.random() * 9000)}`,
                loadNumber: action.loadNumber || '',
                route: action.route || '',
                amount: action.amount || 0,
                dueDate: action.dueDate || 'Net 30',
                brokerName: action.brokerName || '',
              }),
            })
            const data = await res.json()
            if (data.success) {
              showToast?.('', 'Invoice Sent', `Emailed to ${action.to}`)
              return `Invoice sent to ${action.to}`
            }
            return 'Failed to send invoice: ' + (data.error || 'unknown error')
          } catch (err) {
            return 'Invoice error: ' + err.message
          }
        }

        case 'rate_check':
        case 'rate_analysis': {
          // Rate analysis is informational — the AI already gave the analysis in its text response
          return null
        }

        case 'navigate': {
          if (onNavigate) {
            const tabMap = { loads: 'loads', invoices: 'financials', money: 'financials', expenses: 'financials', home: 'dashboard', drivers: 'drivers', fleet: 'fleet', compliance: 'compliance', settings: 'settings' }
            const tab = tabMap[action.to] || action.to
            onNavigate(tab)
          }
          return null
        }

        case 'search_nearby':
        case 'open_maps': {
          const q = encodeURIComponent(action.query || 'truck stop')
          window.open(`https://www.google.com/maps/search/${q}/`, '_blank')
          showToast?.('', 'Maps Opened', `Searching: ${action.query || 'truck stop'}`)
          return null
        }

        case 'start_detention': {
          const freeTime = action.free_time_hours || 2
          localStorage.setItem('qivori_detention_start', String(Date.now()))
          localStorage.setItem('qivori_detention_location', action.location_type || 'shipper')
          localStorage.setItem('qivori_detention_free_time', String(freeTime))
          showToast?.('', 'Detention Started', `${freeTime}h free time at ${action.location_type || 'shipper'}`)
          return `Detention timer started. ${freeTime}h free time, then $75/hr.`
        }

        case 'check_detention': {
          const detStart = localStorage.getItem('qivori_detention_start')
          if (!detStart) return 'No detention timer running.'
          const elapsedMs = Date.now() - Number(detStart)
          const elapsedMin = Math.round(elapsedMs / 60000)
          const freeHours = Number(localStorage.getItem('qivori_detention_free_time') || '2')
          const overtimeHours = Math.max(0, (elapsedMs / (1000 * 60 * 60)) - freeHours)
          const amount = Math.round(overtimeHours * 75 * 100) / 100
          const elapsed = elapsedMin >= 60 ? `${Math.floor(elapsedMin / 60)}h ${elapsedMin % 60}m` : `${elapsedMin}m`
          return overtimeHours > 0
            ? `Waiting ${elapsed}. Overtime: ${overtimeHours.toFixed(1)}h. Owed: $${amount.toFixed(2)}`
            : `Waiting ${elapsed}. ${Math.max(0, freeHours * 60 - elapsedMin)}m of free time left.`
        }

        case 'stop_detention': {
          const detStart = localStorage.getItem('qivori_detention_start')
          if (!detStart) return 'No detention timer running.'
          const elapsedMs = Date.now() - Number(detStart)
          const freeHours = Number(localStorage.getItem('qivori_detention_free_time') || '2')
          const overtimeHours = Math.max(0, (elapsedMs / (1000 * 60 * 60)) - freeHours)
          const amount = Math.round(overtimeHours * 75 * 100) / 100
          localStorage.removeItem('qivori_detention_start')
          localStorage.removeItem('qivori_detention_location')
          localStorage.removeItem('qivori_detention_free_time')
          if (overtimeHours > 0 && addExpense) {
            await addExpense({ category: 'Detention', amount, merchant: localStorage.getItem('qivori_detention_location') || 'shipper', notes: `${overtimeHours.toFixed(1)}h overtime`, date: new Date().toISOString().split('T')[0] })
            showToast?.('', 'Detention Logged', `$${amount.toFixed(2)} — ${overtimeHours.toFixed(1)}h overtime`)
          }
          return amount > 0 ? `Detention stopped. $${amount.toFixed(2)} logged as expense.` : 'Detention stopped. No overtime accrued.'
        }

        case 'load_stops': {
          const targetLoad = action.load_id
            ? loads?.find(l => l.id === action.load_id || l.load_id === action.load_id)
            : activeLoads?.[0]
          if (!targetLoad) return 'No load found.'
          if (targetLoad.stops?.length > 0) {
            return targetLoad.stops.map((s, i) => {
              const type = s.type === 'pickup' ? 'PICKUP' : 'DELIVERY'
              const status = s.status === 'complete' ? ' ✓' : s.status === 'current' ? ' ●' : ''
              return `${i + 1}. ${type}${status} — ${s.city}${s.scheduled_date ? ' · ' + s.scheduled_date : ''}`
            }).join('\n')
          }
          return `1. PICKUP — ${targetLoad.origin}\n2. DELIVERY — ${targetLoad.destination || targetLoad.dest}`
        }

        case 'weather_check': {
          try {
            const coords = getCoords(action, activeLoads)
            const lat = coords?.lat || 39.8283
            const lng = coords?.lng || -98.5795
            const locationLabel = action.location || (coords ? 'your location' : 'central US')
            const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&timezone=America/Chicago&forecast_days=3`)
            const data = await res.json()
            const w = data.current_weather
            if (w) {
              const tempF = Math.round(w.temperature * 9/5 + 32)
              const windMph = Math.round(w.windspeed * 0.621)
              const codes = { 0: 'Clear', 1: 'Mostly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Icy fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Heavy drizzle', 61: 'Light rain', 63: 'Rain', 65: 'Heavy rain', 66: 'Freezing rain', 67: 'Heavy freezing rain', 71: 'Light snow', 73: 'Snow', 75: 'Heavy snow', 77: 'Ice pellets', 80: 'Light showers', 81: 'Showers', 82: 'Heavy showers', 85: 'Snow showers', 86: 'Heavy snow showers', 95: 'Thunderstorm', 96: 'Thunderstorm + hail', 99: 'Severe thunderstorm' }
              const condition = codes[w.weathercode] || 'Unknown'
              const warnings = []
              if (w.windspeed > 40) warnings.push('HIGH WIND WARNING — check bridge advisories')
              if ([66, 67, 71, 73, 75, 77, 85, 86].includes(w.weathercode)) warnings.push('WINTER WEATHER — watch for ice on bridges')
              if ([95, 96, 99].includes(w.weathercode)) warnings.push('SEVERE WEATHER — consider pulling over')
              if ([65, 82].includes(w.weathercode)) warnings.push('HEAVY RAIN — reduce speed, increase following distance')
              showToast?.('', 'Weather', `${tempF}°F ${condition} near ${locationLabel}`)
              let result = `Weather near ${locationLabel}: ${tempF}°F, ${condition}, wind ${windMph}mph.`
              if (warnings.length) result += '\n⚠ ' + warnings.join('\n⚠ ')
              if (data.daily) {
                const d = data.daily
                result += '\nNext 3 days:'
                for (let i = 0; i < Math.min(3, d.time?.length || 0); i++) {
                  const hiF = Math.round(d.temperature_2m_max[i] * 9/5 + 32)
                  const loF = Math.round(d.temperature_2m_min[i] * 9/5 + 32)
                  const precip = d.precipitation_sum[i]
                  const wind = Math.round(d.windspeed_10m_max[i] * 0.621)
                  result += `\n${d.time[i]}: ${hiF}°/${loF}°F, wind ${wind}mph${precip > 0 ? `, ${precip}mm precip` : ''}`
                }
              }
              return result
            }
          } catch {}
          return 'Weather data unavailable right now.'
        }

        case 'pre_trip': {
          // Navigate to compliance DVIR tab for pre-trip inspection
          if (onTabChange) onTabChange('compliance')
          return 'Pre-trip inspection opened. Complete your FMCSA DVIR before dispatch — all 32 items. No shortcuts.'
        }

        case 'pickup_countdown': {
          // Calculate time until next pickup
          const activeLoad = loads?.find(l => ['Dispatched', 'Assigned to Driver'].includes(l.status))
          if (!activeLoad) return 'No dispatched loads. Book a load first.'
          const pickupDate = activeLoad.pickup_date
          if (!pickupDate) return `Load ${activeLoad.loadId || activeLoad.load_number}: no pickup time set. Contact broker.`
          const pickupTime = new Date(pickupDate + (activeLoad.pickup_time ? 'T' + activeLoad.pickup_time : 'T08:00:00'))
          const now = new Date()
          const diff = pickupTime - now
          if (diff <= 0) return `Pickup time passed for ${activeLoad.loadId}. You should be at ${activeLoad.origin} already. Check in.`
          const hours = Math.floor(diff / 3600000)
          const mins = Math.floor((diff % 3600000) / 60000)
          return `${hours}h ${mins}m until pickup at ${activeLoad.origin}. Load ${activeLoad.loadId || activeLoad.load_number}.${hours <= 2 ? ' Start pre-trip now.' : ''}`
        }

        case 'hos_check': {
          const hosStart = localStorage.getItem('qivori_hos_drive_start')
          const hosDriven = parseFloat(localStorage.getItem('qivori_hos_driven') || '0')
          const hosOnDuty = parseFloat(localStorage.getItem('qivori_hos_on_duty') || '0')
          const hosCycleUsed = parseFloat(localStorage.getItem('qivori_hos_cycle') || '0')
          let currentDriving = hosDriven
          if (hosStart) {
            const elapsed = (Date.now() - Number(hosStart)) / (1000 * 60 * 60)
            currentDriving = hosDriven + elapsed
          }
          const driveLeft = Math.max(0, 11 - currentDriving)
          const dutyLeft = Math.max(0, 14 - (hosOnDuty + currentDriving))
          const cycleLeft = Math.max(0, 70 - (hosCycleUsed + currentDriving))
          const fmtH = (h) => h >= 1 ? `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m` : `${Math.round(h * 60)}m`
          let result = `Drive time left: ${fmtH(driveLeft)} of 11h`
          result += `\nDuty window left: ${fmtH(dutyLeft)} of 14h`
          result += `\n70-hour cycle left: ${fmtH(cycleLeft)}`
          if (hosStart) result += '\nClock is RUNNING.'
          else result += '\nClock is stopped.'
          if (driveLeft <= 2 && driveLeft > 0) result += '\nHeads up — under 2 hours left. Start looking for parking.'
          if (driveLeft <= 0) result += '\nYou are OUT OF HOURS. Must take 10-hour break.'
          showToast?.('', 'HOS', `${fmtH(driveLeft)} drive time left`)
          return result
        }

        case 'start_hos': {
          const existing = localStorage.getItem('qivori_hos_drive_start')
          if (existing) return 'Drive clock already running.'
          localStorage.setItem('qivori_hos_drive_start', String(Date.now()))
          if (!localStorage.getItem('qivori_hos_duty_start')) {
            localStorage.setItem('qivori_hos_duty_start', String(Date.now()))
          }
          showToast?.('', 'HOS', 'Drive clock started')
          return 'Drive clock started. 11 hours on the clock. Drive safe.'
        }

        case 'reset_hos': {
          const hosStart = localStorage.getItem('qivori_hos_drive_start')
          let driven = parseFloat(localStorage.getItem('qivori_hos_driven') || '0')
          if (hosStart) {
            driven += (Date.now() - Number(hosStart)) / (1000 * 60 * 60)
          }
          const cycleUsed = parseFloat(localStorage.getItem('qivori_hos_cycle') || '0')
          if (action.full_reset || action.type === 'reset_hos' && action.cycle) {
            localStorage.removeItem('qivori_hos_drive_start')
            localStorage.removeItem('qivori_hos_duty_start')
            localStorage.setItem('qivori_hos_driven', '0')
            localStorage.setItem('qivori_hos_on_duty', '0')
            localStorage.setItem('qivori_hos_cycle', '0')
            showToast?.('', 'HOS Reset', '34-hour restart — full cycle reset')
            return '34-hour restart complete. 70-hour cycle and daily clock both reset. Fresh start.'
          }
          localStorage.removeItem('qivori_hos_drive_start')
          localStorage.removeItem('qivori_hos_duty_start')
          const newCycle = cycleUsed + driven
          localStorage.setItem('qivori_hos_driven', '0')
          localStorage.setItem('qivori_hos_on_duty', '0')
          localStorage.setItem('qivori_hos_cycle', String(newCycle))
          showToast?.('', 'HOS Reset', '10-hour break — daily clock reset')
          return `10-hour break logged. Daily drive/duty clock reset. 70-hour cycle used: ${newCycle.toFixed(1)}h of 70h.`
        }

        case 'stop_driving': {
          const hosStart = localStorage.getItem('qivori_hos_drive_start')
          if (!hosStart) return 'Drive clock is not running.'
          const elapsed = (Date.now() - Number(hosStart)) / (1000 * 60 * 60)
          const prev = parseFloat(localStorage.getItem('qivori_hos_driven') || '0')
          localStorage.setItem('qivori_hos_driven', String(prev + elapsed))
          localStorage.removeItem('qivori_hos_drive_start')
          const fmtH = (h) => h >= 1 ? `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m` : `${Math.round(h * 60)}m`
          const totalDriven = prev + elapsed
          const remaining = Math.max(0, 11 - totalDriven)
          showToast?.('', 'HOS', `Drove ${fmtH(elapsed)}, ${fmtH(remaining)} left`)
          return `Clock stopped. Drove ${fmtH(elapsed)} this session. Total today: ${fmtH(totalDriven)}. Drive time remaining: ${fmtH(remaining)}.`
        }

        case 'find_parking': {
          try {
            const coords = getCoords(action, activeLoads)
            if (!coords) {
              window.open('https://www.google.com/maps/search/truck+parking+near+me/', '_blank')
              showToast?.('', 'Parking', 'Opened Google Maps — searching nearby truck parking')
              return 'Opened Google Maps to search truck parking near you.'
            }
            const radius = action.radius || 25
            const radiusM = radius * 1609
            const query = `[out:json][timeout:10];(node["amenity"="parking"]["parking"="truck"](around:${radiusM},${coords.lat},${coords.lng});node["amenity"="fuel"]["hgv"="yes"](around:${radiusM},${coords.lat},${coords.lng});node["highway"="rest_area"](around:${radiusM},${coords.lat},${coords.lng});node["amenity"="parking"]["hgv"="yes"](around:${radiusM},${coords.lat},${coords.lng}););out body 15;`
            const res = await fetch('https://overpass-api.de/api/interpreter', {
              method: 'POST',
              body: `data=${encodeURIComponent(query)}`,
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            })
            const data = await res.json()
            const spots = (data.elements || []).map(el => ({
              name: el.tags?.name || el.tags?.brand || el.tags?.operator || 'Truck Parking',
              type: el.tags?.amenity === 'fuel' ? 'Truck Stop' : el.tags?.highway === 'rest_area' ? 'Rest Area' : 'Truck Parking',
              lat: el.lat,
              lng: el.lon,
              capacity: el.tags?.capacity || 'Unknown',
            }))
            if (spots.length === 0) {
              window.open(`https://www.google.com/maps/search/truck+parking/@${coords.lat},${coords.lng},10z`, '_blank')
              showToast?.('', 'Parking', 'No results from Overpass — opened Google Maps')
              return `No truck parking found within ${radius} miles. Opened Google Maps to search wider.`
            }
            const unique = spots.filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i).slice(0, 10)
            let result = `Found ${unique.length} truck parking spots within ${radius}mi:\n`
            unique.forEach((s, i) => {
              result += `${i + 1}. ${s.name} (${s.type})${s.capacity !== 'Unknown' ? ` — ${s.capacity} spaces` : ''}\n`
            })
            window.open(`https://www.google.com/maps/search/truck+parking/@${coords.lat},${coords.lng},11z`, '_blank')
            showToast?.('', 'Truck Parking', `${unique.length} spots found nearby`)
            return result
          } catch {
            window.open('https://www.google.com/maps/search/truck+parking+near+me/', '_blank')
            return 'Opened Google Maps for truck parking search.'
          }
        }

        case 'trip_pnl': {
          const targetLoad = action.load_id
            ? loads?.find(l => l.id === action.load_id || l.load_id === action.load_id || l.loadId === action.load_id)
            : loads?.filter(l => l.status === 'Delivered' || l.status === 'Invoiced' || l.status === 'Paid').sort((a, b) => new Date(b.delivery_date || b.created_at || 0) - new Date(a.delivery_date || a.created_at || 0))[0]
          if (!targetLoad) return 'No delivered load found for P&L.'
          const gross = parseFloat(targetLoad.rate || targetLoad.gross || 0)
          const miles = parseFloat(targetLoad.miles || 0)
          const fuelEst = parseFloat(targetLoad.fuel_estimate || 0)
          const tollEst = parseFloat(targetLoad.toll_estimate || 0)
          const loadExpenses = expenses?.filter(e => e.load_id === targetLoad.id || e.load_id === targetLoad.load_id) || []
          const totalExpenses = loadExpenses.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0)
          const estFuel = fuelEst || (miles * 0.65)
          const estTolls = tollEst
          const totalCost = totalExpenses > 0 ? totalExpenses : (estFuel + estTolls + (miles * 0.15))
          const net = gross - totalCost
          const margin = gross > 0 ? ((net / gross) * 100).toFixed(1) : '0'
          const rpm = miles > 0 ? (gross / miles).toFixed(2) : '0'
          const netRpm = miles > 0 ? (net / miles).toFixed(2) : '0'
          const loadId = targetLoad.loadId || targetLoad.load_id || targetLoad.id
          let result = `Trip P&L — ${loadId}\n`
          result += `${targetLoad.origin} → ${targetLoad.destination || targetLoad.dest}\n`
          result += `Gross: $${gross.toLocaleString()} | ${miles} mi | $${rpm}/mi\n`
          result += `Fuel: $${estFuel.toFixed(0)} | Tolls: $${estTolls.toFixed(0)}`
          if (totalExpenses > 0) result += ` | Other: $${(totalExpenses - estFuel - estTolls).toFixed(0)}`
          result += `\nTotal cost: $${totalCost.toFixed(0)}\n`
          result += `Net profit: $${net.toFixed(0)} ($${netRpm}/mi) | Margin: ${margin}%`
          if (parseFloat(margin) < 15) result += '\nThat margin is thin. Watch your costs on lanes like this.'
          if (parseFloat(margin) > 40) result += '\nSolid margin. That lane is paying well.'
          showToast?.('', 'Trip P&L', `$${net.toFixed(0)} net on ${loadId}`)
          return result
        }

        case 'broker_risk': {
          const brokerName = (action.broker || '').toLowerCase()
          if (!brokerName) return 'Need a broker name to check.'
          const brokerInvoices = invoices?.filter(i => (i.broker_name || i.broker || '').toLowerCase().includes(brokerName)) || []
          if (brokerInvoices.length === 0) return `No invoice history with "${action.broker}". Can't assess risk without data — proceed with caution and verify their MC authority on FMCSA.`
          const paid = brokerInvoices.filter(i => i.status === 'Paid')
          const unpaid = brokerInvoices.filter(i => i.status === 'Unpaid' || i.status === 'Overdue')
          const totalRevenue = brokerInvoices.reduce((s, i) => s + parseFloat(i.amount || 0), 0)
          const avgDays = paid.length > 0 ? paid.reduce((s, i) => {
            const created = new Date(i.created_at || i.date)
            const paidAt = new Date(i.paid_at || i.updated_at || Date.now())
            return s + (paidAt - created) / (1000 * 60 * 60 * 24)
          }, 0) / paid.length : null
          let risk = 'LOW'
          if (unpaid.length > 2 || (avgDays && avgDays > 45)) risk = 'HIGH'
          else if (unpaid.length > 0 || (avgDays && avgDays > 30)) risk = 'MEDIUM'
          let result = `Broker: ${action.broker}\n`
          result += `Risk: ${risk}\n`
          result += `Loads: ${brokerInvoices.length} | Total: $${totalRevenue.toLocaleString()}\n`
          result += `Paid: ${paid.length} | Unpaid: ${unpaid.length}\n`
          if (avgDays) result += `Avg days to pay: ${Math.round(avgDays)}\n`
          if (risk === 'HIGH') result += 'This broker is slow or has outstanding balances. Get rate con signed and consider factoring.'
          if (risk === 'LOW') result += 'Good payment history. Solid broker to work with.'
          showToast?.('', 'Broker Risk', `${action.broker}: ${risk} risk`)
          return result
        }

        case 'weekly_target': {
          const target = action.target || parseFloat(localStorage.getItem('qivori_weekly_target') || '5000')
          if (action.target) localStorage.setItem('qivori_weekly_target', String(action.target))
          const now = new Date()
          const dayOfWeek = now.getDay()
          const monday = new Date(now)
          monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7))
          monday.setHours(0, 0, 0, 0)
          const weekLoads = loads?.filter(l => {
            const d = new Date(l.pickup_date || l.created_at)
            return d >= monday && (l.status !== 'Cancelled')
          }) || []
          const weekRevenue = weekLoads.reduce((s, l) => s + parseFloat(l.rate || l.gross || 0), 0)
          const pct = target > 0 ? ((weekRevenue / target) * 100).toFixed(0) : '0'
          const remaining = Math.max(0, target - weekRevenue)
          const daysLeft = Math.max(1, 7 - dayOfWeek)
          const dailyPace = remaining > 0 ? (remaining / daysLeft).toFixed(0) : '0'
          let result = `Weekly Target: $${target.toLocaleString()}\n`
          result += `Revenue this week: $${weekRevenue.toLocaleString()} (${pct}%)\n`
          result += `Loads: ${weekLoads.length}\n`
          if (remaining > 0) {
            result += `Need: $${remaining.toLocaleString()} more | ${daysLeft} days left | $${dailyPace}/day pace`
            if (parseFloat(pct) < 50 && dayOfWeek >= 3) result += '\nBehind pace — might need to hustle or pick up a quick load.'
          } else {
            result += 'Target HIT. Nice work this week.'
          }
          showToast?.('', 'Weekly Target', `${pct}% — $${weekRevenue.toLocaleString()} of $${target.toLocaleString()}`)
          return result
        }

        case 'reload_chain': {
          const dest = action.destination || activeLoads?.[0]?.destination || activeLoads?.[0]?.dest
          if (!dest) return 'Need a destination city to find reloads.'
          const destLower = dest.toLowerCase()
          const available = loads?.filter(l => {
            const origin = (l.origin || '').toLowerCase()
            return (l.status === 'Available' || l.status === 'Posted') && origin.includes(destLower.split(',')[0].trim())
          }) || []
          if (available.length === 0) {
            return `No loads found originating from ${dest} on your board. Check DAT or Truckstop for reloads, or ask me to find backhaul options.`
          }
          const sorted = available.sort((a, b) => {
            const rpmA = parseFloat(a.rate || 0) / Math.max(parseFloat(a.miles || 1), 1)
            const rpmB = parseFloat(b.rate || 0) / Math.max(parseFloat(b.miles || 1), 1)
            return rpmB - rpmA
          }).slice(0, 3)
          let result = `Top reloads from ${dest}:\n`
          sorted.forEach((l, i) => {
            const rpm = (parseFloat(l.rate || 0) / Math.max(parseFloat(l.miles || 1), 1)).toFixed(2)
            result += `${i + 1}. ${l.origin} → ${l.destination || l.dest} | $${Number(l.rate || 0).toLocaleString()} | ${l.miles}mi | $${rpm}/mi | ${l.broker_name || 'Unknown broker'}\n`
          })
          return result
        }

        case 'rate_trend': {
          const origin = (action.origin || '').toLowerCase()
          const dest = (action.destination || '').toLowerCase()
          if (!origin || !dest) return 'Need both origin and destination to check rate trends.'
          const laneLoads = loads?.filter(l => {
            const lo = (l.origin || '').toLowerCase()
            const ld = (l.destination || l.dest || '').toLowerCase()
            return lo.includes(origin.split(',')[0].trim()) && ld.includes(dest.split(',')[0].trim())
          }) || []
          if (laneLoads.length === 0) return `No history on ${action.origin} → ${action.destination}. Run a few loads on this lane to build trend data.`
          const rates = laneLoads.map(l => ({
            rpm: parseFloat(l.rate || 0) / Math.max(parseFloat(l.miles || 1), 1),
            gross: parseFloat(l.rate || 0),
            date: l.pickup_date || l.created_at,
          })).sort((a, b) => new Date(a.date) - new Date(b.date))
          const avgRpm = rates.reduce((s, r) => s + r.rpm, 0) / rates.length
          const avgGross = rates.reduce((s, r) => s + r.gross, 0) / rates.length
          const recent = rates.slice(-3)
          const recentAvg = recent.reduce((s, r) => s + r.rpm, 0) / recent.length
          const trend = recentAvg > avgRpm * 1.05 ? 'RISING' : recentAvg < avgRpm * 0.95 ? 'FALLING' : 'STABLE'
          let result = `Rate Trend: ${action.origin} → ${action.destination}\n`
          result += `Loads on lane: ${laneLoads.length}\n`
          result += `Avg rate: $${avgGross.toFixed(0)} ($${avgRpm.toFixed(2)}/mi)\n`
          result += `Recent avg: $${recentAvg.toFixed(2)}/mi\n`
          result += `Trend: ${trend}\n`
          if (trend === 'RISING') result += 'Rates are climbing. Good time to push for premium.'
          if (trend === 'FALLING') result += 'Rates softening. Lock in loads now or consider other lanes.'
          if (trend === 'STABLE') result += 'Lane is steady. You know what to expect.'
          return result
        }

        case 'find_backhaul': {
          const dest = action.destination || activeLoads?.[0]?.destination || activeLoads?.[0]?.dest
          if (!dest) return 'Need a city to find backhaul from.'
          const destCity = dest.toLowerCase().split(',')[0].trim()
          const available = loads?.filter(l => {
            const origin = (l.origin || '').toLowerCase()
            return (l.status === 'Available' || l.status === 'Posted') && origin.includes(destCity)
          }) || []
          if (available.length === 0) {
            return `No backhaul loads from ${dest} on your board right now. Check DAT/Truckstop or reposition to a stronger market.`
          }
          const sorted = available.sort((a, b) => parseFloat(b.rate || 0) - parseFloat(a.rate || 0)).slice(0, 5)
          let result = `Backhaul options from ${dest}:\n`
          sorted.forEach((l, i) => {
            const rpm = (parseFloat(l.rate || 0) / Math.max(parseFloat(l.miles || 1), 1)).toFixed(2)
            result += `${i + 1}. → ${l.destination || l.dest} | $${Number(l.rate || 0).toLocaleString()} | ${l.miles}mi | $${rpm}/mi\n`
          })
          result += 'Say "book it" + the number to lock one in.'
          return result
        }

        case 'smart_reposition': {
          const currentDest = activeLoads?.[0]?.destination || activeLoads?.[0]?.dest
          if (!currentDest) return 'No active delivery destination to compare markets from.'
          const driverAvg = loads?.length > 0
            ? loads.reduce((s, l) => s + (parseFloat(l.rate || 0) / Math.max(parseFloat(l.miles || 1), 1)), 0) / loads.length
            : 0
          // Use AI to analyze reposition markets based on carrier's real data
          const recentLanes = loads?.slice(0, 20).map(l => `${l.origin||l.orig}→${l.destination||l.dest} $${l.rate||0} ${l.miles||0}mi`).join('; ') || 'No history'
          try {
            const aiRes = await apiFetch('/api/ai-chat', {
              method: 'POST',
              body: JSON.stringify({
                messages: [{ role: 'user', content: `I'm delivering to ${currentDest}. My avg RPM is $${driverAvg.toFixed(2)}/mi. Recent lanes: ${recentLanes}. What are the best nearby freight markets to reposition to? Consider distance, typical outbound rates, and freight volume. Give me top 5 markets with estimated RPM ranges. Be concise, use numbered list format.` }],
                system: 'You are a freight market analyst. Give specific, actionable repositioning advice for truckers. Use your knowledge of freight lanes, seasonal patterns, and regional markets. Format as numbered list with city, estimated RPM range, and one-line reasoning. No disclaimers.'
              })
            })
            const aiText = aiRes?.reply || aiRes?.content || ''
            if (aiText) return `Delivering to ${currentDest} | Your avg: $${driverAvg.toFixed(2)}/mi\n\n${aiText}\n\nReposition if the market premium beats your deadhead cost.`
          } catch {}
          // Fallback if AI unavailable
          return `You're delivering to ${currentDest}. Your avg RPM: $${driverAvg > 0 ? driverAvg.toFixed(2) : '—'}/mi.\n\nCheck DAT or Truckstop.com for live outbound rates from ${currentDest}. Look for markets within 150mi with rates above your average. Reposition if the market premium beats your deadhead cost (~$1.50-2.00/mi empty).`
        }

        case 'check_weigh_station': {
          const state = action.state || ''
          const highway = action.highway || ''
          // Static data until DriveWyze/PrePass API is live
          let result = `Weigh station info for ${state ? state + ' ' : ''}${highway || 'your route'}:\n`
          result += 'Real-time open/closed status coming soon (DriveWyze + PrePass integration pending).\n'
          result += 'Tips: PrePass app shows live status. Watch for "OPEN" signs. Most stations run random selection — keep your paperwork ready.'
          if (state) {
            const q = encodeURIComponent(`weigh station ${state} ${highway}`.trim())
            window.open(`https://www.google.com/maps/search/${q}/`, '_blank')
            result += `\nOpened Google Maps showing weigh stations in ${state}.`
          }
          showToast?.('', 'Weigh Stations', state ? `Showing ${state} stations` : 'Check PrePass app for live status')
          return result
        }

        case 'get_gps':
        case 'snap_ratecon':
        case 'upload_doc':
        case 'call_broker':
          // These are mobile-specific or require hardware — handled gracefully
          return null

        default:
          return null
      }
    } catch (err) {
      console.error('[AIAction]', action.type, err)
      return null
    }
  }, [loads, invoices, expenses, activeLoads, company, addLoad, addExpense, updateLoadStatus, updateInvoiceStatus, logCheckCall, showToast, onNavigate])

  // Process a full AI reply: parse actions, execute them, return clean text + results
  const processReply = useCallback(async (rawReply) => {
    const { actions, displayText } = parseActions(rawReply)
    const results = []
    for (const action of actions) {
      const result = await executeAction(action)
      if (result) results.push(result)
    }
    return { displayText, actions, results }
  }, [executeAction])

  return { executeAction, processReply, parseActions: parseActions }
}
