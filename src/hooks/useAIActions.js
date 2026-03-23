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

// Hook: execute AI actions using CarrierContext
export function useAIActions(onNavigate) {
  const { showToast } = useApp() || {}
  const {
    loads, invoices, company, activeLoads,
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
            const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=33.749&longitude=-84.388&current_weather=true')
            const data = await res.json()
            const w = data.current_weather
            if (w) {
              showToast?.('', 'Weather', `${Math.round(w.temperature * 9/5 + 32)}°F, wind ${Math.round(w.windspeed * 0.621)}mph`)
            }
          } catch {}
          return null
        }

        case 'hos_check':
        case 'start_hos':
        case 'reset_hos':
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
  }, [loads, invoices, activeLoads, company, addLoad, addExpense, updateLoadStatus, updateInvoiceStatus, logCheckCall, showToast, onNavigate])

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
