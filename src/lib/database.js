import { supabase } from './supabase'
import { validateFinancialCalc, validateStatusTransition, guardedUpdate } from './runtimeGuards'

// ─── Helpers ─────────────────────────────────────────────────
async function getUserId() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

// Safe query — returns empty array/null instead of throwing if table doesn't exist
async function safeSelect(table, query) {
  const { data, error } = await query
  if (error) {
    console.warn(`[DB] safeSelect(${table}) failed:`, error.message, error.code)
    return null
  }
  return data
}

// Safe mutate — returns { data, error } consistently, never throws
async function safeMutate(label, query) {
  const { data, error } = await query
  if (error) {
    console.error(`[DB] safeMutate(${label}) failed:`, error.message, error.code)
    return { data: null, error }
  }
  return { data, error: null }
}

// ─── Runtime validation wrapper ─────────────────────────────
function validateBeforeWrite(table, data, label) {
  try {
    guardedUpdate(table, data, label)
  } catch (err) {
    console.error(`[DB GUARD] ${label} blocked:`, err.message)
    throw err
  }
}

// ─── Paginated fetch (scales to 100+ trucks) ────────────────
// Supabase returns max 1000 rows per request. This fetches all pages.
async function fetchAllPages(table, query, pageSize = 1000) {
  let all = []
  let from = 0
  while (true) {
    const { data, error } = await query.range(from, from + pageSize - 1)
    if (error) {
      console.warn(`[DB] fetchAllPages(${table}) page ${from} failed:`, error.message)
      break
    }
    if (!data || data.length === 0) break
    all = all.concat(data)
    if (data.length < pageSize) break // last page
    from += pageSize
  }
  return all
}

// ─── LOADS (canonical schema-backed fields only) ──────────────────────────
const LOAD_STATUS_MAP = {
  open: 'Rate Con Received',
  available: 'Rate Con Received',
  posted: 'Rate Con Received',
  booked: 'Rate Con Received',
  assigned: 'Assigned to Driver',
  dispatched: 'Dispatched',
  at_pickup: 'At Pickup',
  in_transit: 'In Transit',
  en_route: 'In Transit',
  at_delivery: 'At Delivery',
  delivered: 'Delivered',
  invoiced: 'Invoiced',
  cancelled: 'Cancelled',
}

function normalizeLoadStatus(status) {
  if (!status) return 'Rate Con Received'
  const raw = String(status).trim()
  if (!raw) return 'Rate Con Received'
  if (LOAD_STATUS_MAP[raw.toLowerCase()]) return LOAD_STATUS_MAP[raw.toLowerCase()]
  return raw
}

function buildLoadNumber(load) {
  return load.load_number || load.load_id || load.loadId || `QV-${Date.now().toString().slice(-6)}`
}

function buildLoadPayload(load, userId) {
  const grossPay = Number.parseFloat(load.gross_pay ?? load.rate ?? load.gross ?? 0) || 0
  const miles = Number.parseInt(load.miles, 10) || 0
  const explicitRpm = Number.parseFloat(load.rate_per_mile)
  const inferredRpm = explicitRpm || (grossPay > 0 && miles > 0 ? grossPay / miles : 0)
  const payload = {
    owner_id: userId,
    load_number: buildLoadNumber(load),
    broker: load.broker || load.broker_name || null,
    broker_phone: load.broker_phone || null,
    broker_email: load.broker_email || null,
    origin: load.origin || null,
    origin_address: load.origin_address || null,
    origin_zip: load.origin_zip || null,
    destination: load.destination || load.dest || null,
    destination_address: load.destination_address || null,
    destination_zip: load.destination_zip || null,
    shipper_name: load.shipper_name || null,
    consignee_name: load.consignee_name || null,
    miles: miles || 0,
    rate_per_mile: inferredRpm || 0,
    gross_pay: grossPay || 0,
    weight: load.weight || null,
    commodity: load.commodity || null,
    equipment: load.equipment || load.equipment_type || 'Dry Van',
    load_type: load.load_type || load.loadType || 'FTL',
    pickup_date: load.pickup_date || load.pickupDate || null,
    pickup_time: load.pickup_time || null,
    delivery_date: load.delivery_date || load.deliveryDate || null,
    delivery_time: load.delivery_time || null,
    driver_id: load.driver_id || null,
    driver_name: load.driver_name || load.driver || null,
    vehicle_id: load.vehicle_id || null,
    status: normalizeLoadStatus(load.status),
    reference_number: load.reference_number || load.refNum || null,
    po_number: load.po_number || null,
    special_instructions: load.special_instructions || null,
    notes: load.notes || null,
  }
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

export async function fetchLoads() {
  const data = await fetchAllPages('loads',
    supabase.from('loads').select('*, load_stops(*)').order('created_at', { ascending: false })
  )
  if (data) {
    data.forEach(load => {
      if (load.load_stops) {
        load.load_stops.sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
      }
    })
  }
  return data || []
}

export async function createLoad(load) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated — cannot create load')
  const payload = buildLoadPayload(load, userId)
  validateBeforeWrite('loads', payload, 'createLoad')
  if (payload.gross_pay > 0) validateFinancialCalc(payload.gross_pay, 'createLoad gross_pay')

  const { data, error } = await safeMutate('createLoad',
    supabase.from('loads').insert(payload).select().single()
  )
  if (error) throw error
  return data
}

export async function updateLoad(id, updates) {
  // Runtime guard: validate status transitions
  if (updates.status) {
    try {
      // Fetch current status to validate transition
      const current = await safeSelect('loads', supabase.from('loads').select('status').eq('id', id).single())
      if (current?.status) validateStatusTransition(current.status, normalizeLoadStatus(updates.status))
    } catch (err) {
      if (err.message?.includes('PERMANENCE GUARD')) throw err
      // If fetch fails, allow the update (don't block on read errors)
    }
  }
  if (updates.gross_pay !== undefined && updates.gross_pay > 0) validateFinancialCalc(updates.gross_pay, 'updateLoad gross_pay')
  const { data, error } = await safeMutate('updateLoad',
    supabase.from('loads').update({ ...updates, status: updates.status ? normalizeLoadStatus(updates.status) : updates.status }).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

export async function updateLoadByLoadId(loadId, updates) {
  if (updates.status) {
    try {
      const current = await safeSelect('loads', supabase.from('loads').select('status').eq('load_number', loadId).single())
      if (current?.status) validateStatusTransition(current.status, normalizeLoadStatus(updates.status))
    } catch (err) {
      if (err.message?.includes('PERMANENCE GUARD')) throw err
    }
  }
  if (updates.gross_pay !== undefined && updates.gross_pay > 0) validateFinancialCalc(updates.gross_pay, 'updateLoadByLoadId gross_pay')
  const nextUpdates = { ...updates, status: updates.status ? normalizeLoadStatus(updates.status) : updates.status }
  const { data, error } = await safeMutate('updateLoadByLoadId',
    supabase.from('loads').update(nextUpdates).eq('load_number', loadId).select().single()
  )
  if (error) throw error
  return data
}

export async function deleteLoad(id) {
  // Delete child records first (foreign key constraints)
  await safeMutate('deleteLoadStops', supabase.from('load_stops').delete().eq('load_id', id))
  await safeMutate('deleteLoadEdiTxns', supabase.from('edi_transactions').delete().eq('load_id', id))
  await safeMutate('deleteLoadEdiExc', supabase.from('edi_exceptions').delete().eq('load_id', id))
  // Now delete the load
  const { error } = await safeMutate('deleteLoad',
    supabase.from('loads').delete().eq('id', id)
  )
  if (error) throw error
}

// ─── INVOICES ────────────────────────────────────────────────
export async function fetchInvoices() {
  const data = await fetchAllPages('invoices',
    supabase.from('invoices').select('*').order('created_at', { ascending: false })
  )
  return data || []
}

export async function createInvoice(invoice) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated — cannot create invoice')
  // Runtime guard: validate invoice amount
  if (invoice.amount !== undefined) validateFinancialCalc(Number(invoice.amount), 'createInvoice amount')
  const { data, error } = await safeMutate('createInvoice',
    supabase.from('invoices').insert({ ...invoice, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function updateInvoice(id, updates) {
  const { data, error } = await safeMutate('updateInvoice',
    supabase.from('invoices').update(updates).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

export async function deleteInvoice(id) {
  const { error } = await safeMutate('deleteInvoice',
    supabase.from('invoices').delete().eq('id', id)
  )
  if (error) throw error
}

// ─── EXPENSES ────────────────────────────────────────────────
export async function fetchExpenses() {
  const data = await fetchAllPages('expenses',
    supabase.from('expenses').select('*').order('date', { ascending: false })
  )
  return data || []
}

export async function createExpense(expense) {
  const userId = await getUserId()
  // Runtime guard: validate expense amount
  if (expense.amount !== undefined) validateFinancialCalc(Number(expense.amount), 'createExpense amount')
  const { data } = await safeMutate('createExpense',
    supabase.from('expenses').insert({ ...expense, owner_id: userId }).select().single()
  )
  return data
}

export async function updateExpense(id, updates) {
  const { data, error } = await safeMutate('updateExpense',
    supabase.from('expenses').update(updates).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

export async function deleteExpense(id) {
  const { error } = await safeMutate('deleteExpense',
    supabase.from('expenses').delete().eq('id', id)
  )
  if (error) throw error
}

// ─── COMPANY ─────────────────────────────────────────────────
export async function fetchCompany() {
  const userId = await getUserId()
  if (!userId) return null
  const { data } = await supabase.from('companies').select('*').eq('owner_id', userId).limit(1).maybeSingle()
  return data || null
}

export async function upsertCompany(company) {
  const userId = await getUserId()
  if (!userId) return null

  const existing = await fetchCompany()
  if (existing) {
    const { data } = await safeMutate('upsertCompany',
      supabase.from('companies').update(company).eq('id', existing.id).select().single()
    )
    return data
  } else {
    const { data } = await safeMutate('upsertCompany',
      supabase.from('companies').insert({ ...company, owner_id: userId }).select().single()
    )
    return data
  }
}

// ─── CHECK CALLS ─────────────────────────────────────────────
export async function fetchCheckCalls(loadId) {
  const data = await safeSelect('check_calls',
    supabase.from('check_calls').select('*').eq('load_id', loadId).order('called_at', { ascending: false })
  )
  return data || []
}

export async function createCheckCall(loadId, call) {
  const userId = await getUserId()
  const { data } = await safeMutate('createCheckCall',
    supabase.from('check_calls').insert({ ...call, load_id: loadId, owner_id: userId }).select().single()
  )
  return data
}

// ─── VEHICLES ────────────────────────────────────────────────
export async function fetchVehicles() {
  const data = await fetchAllPages('vehicles',
    supabase.from('vehicles').select('*').order('created_at', { ascending: false })
  )
  return data || []
}

export async function createVehicle(vehicle) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createVehicle',
    supabase.from('vehicles').insert({ ...vehicle, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function updateVehicle(id, updates) {
  const { data, error } = await safeMutate('updateVehicle',
    supabase.from('vehicles').update(updates).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

export async function deleteVehicle(id) {
  const { error } = await safeMutate('deleteVehicle',
    supabase.from('vehicles').delete().eq('id', id)
  )
  if (error) throw error
}

// ─── DRIVERS ─────────────────────────────────────────────────
export async function fetchDrivers() {
  const data = await fetchAllPages('drivers',
    supabase.from('drivers').select('*').order('created_at', { ascending: false })
  )
  return data || []
}

export async function createDriver(driver) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createDriver',
    supabase.from('drivers').insert({ ...driver, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function updateDriver(id, updates) {
  const { data, error } = await safeMutate('updateDriver',
    supabase.from('drivers').update(updates).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

export async function deleteDriver(id) {
  const { error } = await safeMutate('deleteDriver',
    supabase.from('drivers').delete().eq('id', id)
  )
  if (error) throw error
}

// ─── DOCUMENTS ───────────────────────────────────────────────
export async function fetchDocuments(loadId) {
  let query = supabase.from('documents').select('*').order('uploaded_at', { ascending: false }).limit(500)
  if (loadId) query = query.eq('load_id', loadId)
  const data = await safeSelect('documents', query)
  return data || []
}

export async function createDocument(doc) {
  const userId = await getUserId()
  const { data } = await safeMutate('createDocument',
    supabase.from('documents').insert({ ...doc, owner_id: userId }).select().single()
  )
  return data
}

export async function deleteDocument(id) {
  const { error } = await safeMutate('deleteDocument',
    supabase.from('documents').delete().eq('id', id)
  )
  if (error) throw error
}

// ─── DRIVER DQ FILES ────────────────────────────────────────
export async function fetchDQFiles(driverId) {
  let query = supabase.from('driver_dq_files').select('*').order('created_at', { ascending: false }).limit(200)
  if (driverId) query = query.eq('driver_id', driverId)
  const data = await safeSelect('driver_dq_files', query)
  return data || []
}

export async function createDQFile(doc) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createDQFile',
    supabase.from('driver_dq_files').insert({ ...doc, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function updateDQFile(id, updates) {
  const { data, error } = await safeMutate('updateDQFile',
    supabase.from('driver_dq_files').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

export async function deleteDQFile(id) {
  const { error } = await safeMutate('deleteDQFile',
    supabase.from('driver_dq_files').delete().eq('id', id)
  )
  if (error) throw error
}

// ─── DRIVER PAY CONFIG ──────────────────────────────────────
export async function fetchDriverPayMap(ownerUserId) {
  const { data } = await safeSelect('driver_pay_config',
    supabase.from('driver_pay_config').select('driver_id, pay_model, pay_rate')
  )
  const map = {}
  ;(data || []).forEach(r => { map[r.driver_id] = { pay_model: r.pay_model, pay_rate: r.pay_rate } })
  return map
}

export async function upsertDriverPay(driverId, { pay_model, pay_rate }) {
  const userId = await getUserId()
  const { error } = await safeMutate('upsertDriverPay',
    supabase.from('driver_pay_config').upsert({
      driver_id: driverId,
      owner_id: userId,
      pay_model: pay_model || 'percent',
      pay_rate: parseFloat(pay_rate) || 28,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'driver_id' })
  )
  if (error) throw error
}

// ─── VEHICLE DOCUMENTS ─────────────────────────────────────
export async function fetchVehicleDocuments(vehicleId) {
  let query = supabase.from('vehicle_documents').select('*').order('created_at', { ascending: false }).limit(200)
  if (vehicleId) query = query.eq('vehicle_id', vehicleId)
  const data = await safeSelect('vehicle_documents', query)
  return data || []
}

export async function createVehicleDocument(doc) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createVehicleDocument',
    supabase.from('vehicle_documents').insert({ ...doc, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function updateVehicleDocument(id, updates) {
  const { data, error } = await safeMutate('updateVehicleDocument',
    supabase.from('vehicle_documents').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

export async function deleteVehicleDocument(id) {
  const { error } = await safeMutate('deleteVehicleDocument',
    supabase.from('vehicle_documents').delete().eq('id', id)
  )
  if (error) throw error
}

// ─── DRUG & ALCOHOL TESTS ───────────────────────────────────
export async function fetchDrugTests(driverId) {
  let query = supabase.from('driver_drug_tests').select('*').order('test_date', { ascending: false })
  if (driverId) query = query.eq('driver_id', driverId)
  const data = await safeSelect('driver_drug_tests', query)
  return data || []
}

export async function createDrugTest(test) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createDrugTest',
    supabase.from('driver_drug_tests').insert({ ...test, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function updateDrugTest(id, updates) {
  const { data, error } = await safeMutate('updateDrugTest',
    supabase.from('driver_drug_tests').update(updates).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

// ─── DRIVER INCIDENTS ───────────────────────────────────────
export async function fetchIncidents(driverId) {
  let query = supabase.from('driver_incidents').select('*').order('incident_date', { ascending: false })
  if (driverId) query = query.eq('driver_id', driverId)
  const data = await safeSelect('driver_incidents', query)
  return data || []
}

export async function createIncident(incident) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createIncident',
    supabase.from('driver_incidents').insert({ ...incident, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function updateIncident(id, updates) {
  const { data, error } = await safeMutate('updateIncident',
    supabase.from('driver_incidents').update(updates).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

// ─── CLEARINGHOUSE QUERIES ───────────────────────────────────
export async function fetchClearinghouseQueries() {
  const data = await safeSelect('clearinghouse_queries',
    supabase.from('clearinghouse_queries').select('*').order('created_at', { ascending: false }).limit(200)
  )
  return data || []
}

export async function createClearinghouseQuery(query) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createClearinghouseQuery',
    supabase.from('clearinghouse_queries').insert({ ...query, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function updateClearinghouseQuery(id, updates) {
  const { data, error } = await safeMutate('updateClearinghouseQuery',
    supabase.from('clearinghouse_queries').update(updates).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

// ─── DRIVER CONTRACTS ────────────────────────────────────────
export async function fetchDriverContracts() {
  const data = await safeSelect('driver_contracts',
    supabase.from('driver_contracts').select('*').order('created_at', { ascending: false })
  )
  return data || []
}

export async function createDriverContract(contract) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createDriverContract',
    supabase.from('driver_contracts').insert({ ...contract, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function updateDriverContract(id, updates) {
  const { data, error } = await safeMutate('updateDriverContract',
    supabase.from('driver_contracts').update(updates).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

// ─── DRIVER PAYROLL ─────────────────────────────────────────
export async function fetchPayroll(driverId) {
  let query = supabase.from('driver_payroll').select('*').order('period_start', { ascending: false })
  if (driverId) query = query.eq('driver_id', driverId)
  const data = await safeSelect('driver_payroll', query)
  return data || []
}

export async function createPayroll(record) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createPayroll',
    supabase.from('driver_payroll').insert({ ...record, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function updatePayroll(id, updates) {
  const { data, error } = await safeMutate('updatePayroll',
    supabase.from('driver_payroll').update(updates).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

// ─── STRIPE CONNECT ─────────────────────────────────────────
export async function fetchStripeConnectAccount() {
  const data = await safeSelect('stripe_connect_accounts',
    supabase.from('stripe_connect_accounts').select('*').limit(1).maybeSingle()
  )
  return data
}

// ─── PAYMENTS (for QB sync) ─────────────────────────────────
export async function createPayment(record) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createPayment',
    supabase.from('payments').insert({ ...record, user_id: userId, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

// ─── DRIVER BANK INFO ───────────────────────────────────────
export async function fetchBankInfo() {
  const data = await safeSelect('driver_bank_info', supabase.from('driver_bank_info').select('*'))
  return data || []
}

export async function upsertBankInfo(driverId, info) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('upsertBankInfo',
    supabase.from('driver_bank_info').upsert({
      driver_id: driverId, owner_id: userId,
      method: info.method || 'direct', bank_name: info.bankName || null,
      account_type: info.accountType || 'checking', routing_number: info.routing || null,
      account_last4: info.last4 || null, other_details: info.otherDetails || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'driver_id,owner_id' }).select().single()
  )
  if (error) throw error
  return data
}

// ─── RECURRING DEDUCTIONS ───────────────────────────────────
export async function fetchRecurringDeductions(driverId) {
  let query = supabase.from('driver_recurring_deductions').select('*').eq('active', true)
  if (driverId) query = query.eq('driver_id', driverId)
  const data = await safeSelect('driver_recurring_deductions', query)
  return data || []
}

export async function setRecurringDeductions(driverId, deductions) {
  const userId = await getUserId()
  // Delete old, insert new
  await safeMutate('deleteRecurringDeductions',
    supabase.from('driver_recurring_deductions').delete().eq('driver_id', driverId).eq('owner_id', userId)
  )
  if (deductions.length === 0) return []
  const rows = deductions.map(d => ({
    driver_id: driverId, owner_id: userId,
    label: d.label, amount: Number(d.amount) || 0, deduction_type: d.type || 'flat', active: true,
  }))
  const { data, error } = await safeMutate('insertRecurringDeductions',
    supabase.from('driver_recurring_deductions').insert(rows).select()
  )
  if (error) throw error
  return data || []
}

// ─── ESCROW / RESERVE FUND ────────────────────────────────────
export async function fetchEscrowTransactions(driverId) {
  let query = supabase.from('driver_escrow').select('*').order('created_at', { ascending: false })
  if (driverId) query = query.eq('driver_id', driverId)
  const data = await safeSelect('driver_escrow', query)
  return data || []
}

export async function createEscrowTransaction(record) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createEscrowTransaction',
    supabase.from('driver_escrow').insert({ ...record, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

// ─── FUEL CARD TRANSACTIONS ──────────────────────────────────
export async function fetchFuelCardTransactions(driverId) {
  let query = supabase.from('driver_fuel_cards').select('*').order('transaction_date', { ascending: false })
  if (driverId) query = query.eq('driver_id', driverId)
  const data = await safeSelect('driver_fuel_cards', query)
  return data || []
}

export async function createFuelCardTransaction(record) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createFuelCardTransaction',
    supabase.from('driver_fuel_cards').insert({ ...record, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function markFuelCardDeducted(ids, payrollId) {
  if (!ids.length) return
  const { error } = await safeMutate('markFuelCardDeducted',
    supabase.from('driver_fuel_cards').update({ deducted_in_payroll_id: payrollId }).in('id', ids)
  )
  if (error) throw error
}

// ─── DRIVER ADVANCES / DRAWS ─────────────────────────────────
export async function fetchAdvances(driverId) {
  let query = supabase.from('driver_advances').select('*').order('advance_date', { ascending: false })
  if (driverId) query = query.eq('driver_id', driverId)
  const data = await safeSelect('driver_advances', query)
  return data || []
}

export async function createAdvance(record) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createAdvance',
    supabase.from('driver_advances').insert({ ...record, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function markAdvancesDeducted(ids, payrollId) {
  if (!ids.length) return
  const { error } = await safeMutate('markAdvancesDeducted',
    supabase.from('driver_advances').update({ deducted_in_payroll_id: payrollId }).in('id', ids)
  )
  if (error) throw error
}

// ─── HIRING CANDIDATES ─────────────────────────────────────
export async function fetchHiringCandidates() {
  const data = await safeSelect('hiring_candidates',
    supabase.from('hiring_candidates').select('*').order('created_at', { ascending: false })
  )
  return data || []
}

export async function createHiringCandidate(candidate) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createHiringCandidate',
    supabase.from('hiring_candidates').insert({ ...candidate, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function updateHiringCandidate(id, updates) {
  const { data, error } = await safeMutate('updateHiringCandidate',
    supabase.from('hiring_candidates').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

export async function deleteHiringCandidate(id) {
  const { error } = await safeMutate('deleteHiringCandidate',
    supabase.from('hiring_candidates').delete().eq('id', id)
  )
  if (error) throw error
}

// ─── MESSAGES ───────────────────────────────────────────────
export async function fetchMessages(loadId) {
  const { data } = await supabase.from('messages').select('*').eq('load_id', loadId).order('created_at', { ascending: true })
  return data || []
}

export async function sendMessage(loadId, content, senderName, senderRole) {
  const userId = await getUserId()
  const { data, error } = await supabase.from('messages').insert({
    load_id: loadId, sender_id: userId, sender_name: senderName, sender_role: senderRole, content,
  }).select().single()
  if (error) throw error
  return data
}

// ─── LOAD STOPS ─────────────────────────────────────────────
export async function createLoadWithStops(load, stops) {
  const userId = await getUserId()
  const loadPayload = buildLoadPayload(load, userId)
  validateBeforeWrite('loads', loadPayload, 'createLoadWithStops')
  const { data: newLoad, error: loadErr } = await safeMutate('createLoadWithStops',
    supabase.from('loads').insert(loadPayload).select().single()
  )
  if (loadErr) throw loadErr
  if (stops && stops.length > 0) {
    const stopsToInsert = stops.map((s, i) => ({
      load_id: newLoad.id,
      sequence: s.sequence ?? i + 1,
      type: s.type === 'dropoff' ? 'dropoff' : 'pickup',
      city: s.city || '',
      address: s.address || null,
      scheduled_time: s.scheduled_time || s.scheduled_date || null,
      status: s.status || (i === 0 ? 'current' : 'pending'),
    }))
    const { data: newStops, error: stopsErr } = await safeMutate('createLoadStops',
      supabase.from('load_stops').insert(stopsToInsert).select()
    )
    if (stopsErr) console.error('Failed to insert stops:', stopsErr)
    newLoad.load_stops = (newStops || []).sort((a, b) => (a.sequence || 0) - (b.sequence || 0))
  }
  return newLoad
}

export async function fetchLoadStops(loadId) {
  const data = await safeSelect('load_stops',
    supabase.from('load_stops').select('*').eq('load_id', loadId).order('sequence', { ascending: true })
  )
  return data || []
}

export async function updateLoadStop(id, updates) {
  const { data } = await safeMutate('updateLoadStop',
    supabase.from('load_stops').update(updates).eq('id', id).select().single()
  )
  return data
}

// ─── Q MEMORIES (cross-session AI intelligence) ─────────────
export async function fetchMemories() {
  const data = await safeSelect('q_memories',
    supabase.from('q_memories').select('*').order('importance', { ascending: false }).order('updated_at', { ascending: false }).limit(50)
  )
  return data || []
}

export async function createMemory(memory) {
  const userId = await getUserId()
  if (!userId) return null
  const { data } = await safeMutate('createMemory',
    supabase.from('q_memories').insert({ ...memory, owner_id: userId }).select().single()
  )
  return data
}

export async function updateMemory(id, updates) {
  const { data } = await safeMutate('updateMemory',
    supabase.from('q_memories').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single()
  )
  return data
}

export async function deleteMemory(id) {
  await safeMutate('deleteMemory',
    supabase.from('q_memories').delete().eq('id', id)
  )
}

// ─── CONSOLIDATIONS (LTL/Partial load grouping) ─────────────────
export async function fetchConsolidations() {
  const data = await safeSelect('consolidations',
    supabase.from('consolidations').select('*').order('created_at', { ascending: false }).limit(200)
  )
  return data || []
}

export async function createConsolidation(consolidation) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createConsolidation',
    supabase.from('consolidations').insert({ ...consolidation, owner_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function updateConsolidation(id, updates) {
  const { data, error } = await safeMutate('updateConsolidation',
    supabase.from('consolidations').update(updates).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

// ─── ELD / DVIR ─────────────────────────────────────────────
export async function fetchDVIRs() {
  const data = await safeSelect('eld_dvirs',
    supabase.from('eld_dvirs').select('*').order('submitted_at', { ascending: false }).limit(500)
  )
  return data || []
}

export async function createDVIR(dvir) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated')
  const { data, error } = await safeMutate('createDVIR',
    supabase.from('eld_dvirs').insert({ ...dvir, user_id: userId }).select().single()
  )
  if (error) throw error
  return data
}

export async function fetchELDConnections() {
  const data = await safeSelect('eld_connections',
    supabase.from('eld_connections').select('*')
  )
  return data || []
}

export async function fetchHOSLogs() {
  const data = await safeSelect('eld_hos_logs',
    supabase.from('eld_hos_logs').select('*').order('start_time', { ascending: false }).limit(1000)
  )
  return data || []
}

export async function fetchELDVehicles() {
  const data = await safeSelect('eld_vehicles',
    supabase.from('eld_vehicles').select('*').order('synced_at', { ascending: false })
  )
  return data || []
}

// ─── Q AI FEES ────────────────────────────────────────────────
export async function fetchAIFees() {
  const data = await safeSelect('q_ai_fees',
    supabase.from('q_ai_fees').select('*').order('created_at', { ascending: false }).limit(1000)
  )
  return data || []
}

export async function createAIFee(fee) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated — cannot create AI fee')
  const { data, error } = await safeMutate('createAIFee',
    supabase.from('q_ai_fees').insert({
      owner_id: userId,
      load_id: fee.load_id || null,
      load_number: fee.load_number || null,
      load_rate: parseFloat(fee.load_rate) || 0,
      fee_percent: fee.fee_percent || 0.03,
      fee_amount: parseFloat(fee.fee_amount) || 0,
      stripe_charge_id: fee.stripe_charge_id || null,
      stripe_status: fee.stripe_status || 'pending',
      feature_used: fee.feature_used || 'dispatch',
      origin: fee.origin || null,
      destination: fee.destination || null,
      broker: fee.broker || null,
    }).select().single()
  )
  if (error) throw error
  return data
}

// ─── AUDIT LOGS ─────────────────────────────────────────────
export async function createAuditLog({ action, entity_type, entity_id, old_value, new_value, reason, metadata }) {
  const userId = await getUserId()
  if (!userId) return null
  const { data } = await safeMutate('createAuditLog',
    supabase.from('audit_logs').insert({
      owner_id: userId,
      actor_id: userId,
      action,
      entity_type,
      entity_id: String(entity_id || ''),
      old_value: old_value || null,
      new_value: new_value || null,
      reason: reason || null,
      metadata: metadata || {},
    })
  )
  return data
}

export async function fetchAuditLogs(filters = {}) {
  let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(filters.limit || 200)
  if (filters.entity_type) query = query.eq('entity_type', filters.entity_type)
  if (filters.entity_id) query = query.eq('entity_id', filters.entity_id)
  if (filters.action) query = query.eq('action', filters.action)
  if (filters.since) query = query.gte('created_at', filters.since)
  return await safeSelect('audit_logs', query) || []
}

// ─── CARRIER SETTINGS ───────────────────────────────────────
export async function fetchCarrierSettings() {
  const userId = await getUserId()
  if (!userId) return null
  const data = await safeSelect('carrier_settings',
    supabase.from('carrier_settings').select('*').eq('owner_id', userId).single()
  )
  return data
}

export async function upsertCarrierSettings(settings) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated')
  const { data, error } = await safeMutate('upsertCarrierSettings',
    supabase.from('carrier_settings').upsert({
      ...settings,
      owner_id: userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'owner_id' }).select().single()
  )
  if (error) throw error
  return data
}

// ─── COMPLIANCE CHECKS ──────────────────────────────────────
export async function createComplianceCheck(check) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated')
  const { data, error } = await safeMutate('createComplianceCheck',
    supabase.from('compliance_checks').insert({
      owner_id: userId,
      driver_id: check.driver_id || null,
      vehicle_id: check.vehicle_id || null,
      load_id: check.load_id || null,
      dispatch_decision_id: check.dispatch_decision_id || null,
      check_type: check.check_type || 'pre_dispatch',
      overall_status: check.overall_status,
      checks: check.checks,
      failing_checks: check.failing_checks || [],
      override_by: check.override_by || null,
      override_reason: check.override_reason || null,
    }).select().single()
  )
  if (error) throw error
  return data
}

export async function fetchComplianceChecks(filters = {}) {
  let query = supabase.from('compliance_checks').select('*').order('created_at', { ascending: false }).limit(100)
  if (filters.driver_id) query = query.eq('driver_id', filters.driver_id)
  if (filters.load_id) query = query.eq('load_id', filters.load_id)
  if (filters.overall_status) query = query.eq('overall_status', filters.overall_status)
  return await safeSelect('compliance_checks', query) || []
}

// ─── VEHICLE MAINTENANCE ────────────────────────────────────
export async function fetchVehicleMaintenance(vehicleId) {
  let query = supabase.from('vehicle_maintenance').select('*').order('service_date', { ascending: false })
  if (vehicleId) query = query.eq('vehicle_id', vehicleId)
  return await safeSelect('vehicle_maintenance', query) || []
}

export async function createMaintenanceRecord(record) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated')
  const { data, error } = await safeMutate('createMaintenance',
    supabase.from('vehicle_maintenance').insert({
      owner_id: userId,
      vehicle_id: record.vehicle_id,
      maintenance_type: record.maintenance_type,
      description: record.description || '',
      vendor: record.vendor || '',
      cost: parseFloat(record.cost) || 0,
      odometer_at_service: parseInt(record.odometer_at_service) || null,
      next_due_miles: parseInt(record.next_due_miles) || null,
      next_due_date: record.next_due_date || null,
      status: record.status || 'completed',
      documents: record.documents || [],
      performed_by: record.performed_by || '',
      notes: record.notes || '',
      service_date: record.service_date || new Date().toISOString().split('T')[0],
    }).select().single()
  )
  if (error) throw error
  return data
}

export async function updateMaintenanceRecord(id, updates) {
  const { data, error } = await safeMutate('updateMaintenance',
    supabase.from('vehicle_maintenance').update(updates).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

// ─── DRIVER AVAILABILITY ────────────────────────────────────
export async function updateDriverAvailability(driverId, { is_available, availability_status, last_location, last_location_lat, last_location_lng }) {
  const { data, error } = await safeMutate('updateDriverAvailability',
    supabase.from('drivers').update({
      is_available: is_available ?? true,
      availability_status: availability_status || 'ready',
      last_location: last_location || null,
      last_location_lat: last_location_lat || null,
      last_location_lng: last_location_lng || null,
      last_location_updated: new Date().toISOString(),
    }).eq('id', driverId).select().single()
  )
  if (error) throw error
  return data
}

// ─── COMPANY MEMBERS & INVITATIONS ──────────────────────────
export async function fetchCompanyMembers() {
  const data = await safeSelect('company_members',
    supabase.from('company_members').select('*, profiles:user_id(full_name, email, avatar_url)').order('created_at', { ascending: false })
  )
  return data || []
}

export async function fetchPendingInvitations() {
  const data = await safeSelect('invitations',
    supabase.from('invitations').select('*').is('accepted_at', null).order('created_at', { ascending: false })
  )
  return data || []
}

export async function removeCompanyMember(memberId) {
  const { data, error } = await safeMutate('removeCompanyMember',
    supabase.from('company_members').update({ status: 'deactivated' }).eq('id', memberId).select().single()
  )
  if (error) throw error
  return data
}

export async function updateMemberRole(memberId, role) {
  const { data, error } = await safeMutate('updateMemberRole',
    supabase.from('company_members').update({ role }).eq('id', memberId).select().single()
  )
  if (error) throw error
  return data
}

export async function cancelInvitation(invitationId) {
  const { error } = await safeMutate('cancelInvitation',
    supabase.from('invitations').delete().eq('id', invitationId)
  )
  if (error) throw error
}

// ─── GPS Pipeline ──────────────────────────────────────────
// driver_positions, q_alerts, q_decisions
// All gated by owner_id RLS — see supabase-gps-pipeline.sql

export async function writeDriverPosition({ driver_id, load_id, lat, lng, speed, heading, accuracy, battery }) {
  const owner_id = await getUserId()
  if (!owner_id || lat == null || lng == null) return null
  const { data } = await safeMutate('writeDriverPosition',
    supabase.from('driver_positions').insert({
      owner_id, driver_id, load_id,
      lat, lng,
      speed: speed ?? null,
      heading: heading ?? null,
      accuracy: accuracy ?? null,
      battery: battery ?? null,
    }).select().single()
  )
  return data
}

export async function fetchLatestDriverPositions() {
  const owner_id = await getUserId()
  if (!owner_id) return []
  // Pull last 24h, then dedupe to latest per driver client-side
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const data = await safeSelect('driver_positions',
    supabase.from('driver_positions')
      .select('*')
      .eq('owner_id', owner_id)
      .gte('ts', since)
      .order('ts', { ascending: false })
      .limit(2000)
  )
  if (!data) return []
  const latest = new Map()
  for (const p of data) {
    if (!latest.has(p.driver_id)) latest.set(p.driver_id, p)
  }
  return [...latest.values()]
}

export async function fetchDriverBreadcrumb(driver_id, limit = 50) {
  const owner_id = await getUserId()
  if (!owner_id || !driver_id) return []
  const data = await safeSelect('driver_positions',
    supabase.from('driver_positions')
      .select('lat,lng,speed,heading,ts')
      .eq('owner_id', owner_id)
      .eq('driver_id', driver_id)
      .order('ts', { ascending: false })
      .limit(limit)
  )
  return (data || []).reverse() // chronological for polyline
}

export async function createAlert({ type, title, message, severity = 'info', driver_id = null, load_id = null, payload = {} }) {
  const owner_id = await getUserId()
  if (!owner_id || !type || !title) return null
  const { data } = await safeMutate('createAlert',
    supabase.from('q_alerts').insert({
      owner_id, driver_id, load_id, type, title, message, severity, payload,
    }).select().single()
  )
  return data
}

export async function fetchAlerts({ limit = 50, includeDismissed = false } = {}) {
  const owner_id = await getUserId()
  if (!owner_id) return []
  let q = supabase.from('q_alerts')
    .select('*')
    .eq('owner_id', owner_id)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (!includeDismissed) q = q.is('dismissed_at', null)
  return (await safeSelect('q_alerts', q)) || []
}

export async function dismissAlert(id) {
  const { error } = await safeMutate('dismissAlert',
    supabase.from('q_alerts').update({ dismissed_at: new Date().toISOString() }).eq('id', id)
  )
  return !error
}

export async function createDecision({ type, decision = null, confidence = null, summary, reasoning = [], payload = {}, driver_id = null, load_id = null }) {
  const owner_id = await getUserId()
  if (!owner_id || !type || !summary) return null
  const { data } = await safeMutate('createDecision',
    supabase.from('q_decisions').insert({
      owner_id, driver_id, load_id, type, decision, confidence, summary, reasoning, payload,
    }).select().single()
  )
  return data
}

export async function fetchDecisions({ limit = 100 } = {}) {
  const owner_id = await getUserId()
  if (!owner_id) return []
  return (await safeSelect('q_decisions',
    supabase.from('q_decisions')
      .select('*')
      .eq('owner_id', owner_id)
      .order('created_at', { ascending: false })
      .limit(limit)
  )) || []
}

// ─── Profile Updates ───────────────────────────────────────────
// Wraps the common pattern used by Auto components to update
// the authenticated user's own profile row (id = auth.uid()).
export async function updateProfile(updates) {
  const owner_id = await getUserId()
  if (!owner_id) return { data: null, error: { message: 'Not authenticated' } }
  return safeMutate('updateProfile',
    supabase.from('profiles').update(updates).eq('id', owner_id)
  )
}

// ─── Retell Calls ──────────────────────────────────────────────
export async function fetchRetellCalls({ limit = 50, status } = {}) {
  const owner_id = await getUserId()
  if (!owner_id) return []
  let q = supabase.from('retell_calls').select('*').eq('user_id', owner_id).order('created_at', { ascending: false }).limit(limit)
  if (status) q = q.eq('call_status', status)
  return (await safeSelect('retell_calls', q)) || []
}

export async function updateRetellCall(id, updates) {
  const owner_id = await getUserId()
  if (!owner_id) return { data: null, error: { message: 'Not authenticated' } }
  return safeMutate('updateRetellCall',
    supabase.from('retell_calls').update(updates).eq('id', id).eq('user_id', owner_id)
  )
}

// ─── Negotiation Settings ──────────────────────────────────────
export async function fetchNegotiationSettings() {
  const owner_id = await getUserId()
  if (!owner_id) return null
  return (await safeSelect('negotiation_settings',
    supabase.from('negotiation_settings').select('*').eq('owner_id', owner_id).maybeSingle()
  ))
}

export async function upsertNegotiationSettings(settings) {
  const owner_id = await getUserId()
  if (!owner_id) return { data: null, error: { message: 'Not authenticated' } }
  return safeMutate('upsertNegotiationSettings',
    supabase.from('negotiation_settings').upsert({ ...settings, owner_id }, { onConflict: 'owner_id' }).select().single()
  )
}

// ─── Negotiation Messages ──────────────────────────────────────
export async function fetchNegotiationMessages(callId, { limit = 100 } = {}) {
  const owner_id = await getUserId()
  if (!owner_id) return []
  return (await safeSelect('negotiation_messages',
    supabase.from('negotiation_messages').select('*').eq('call_id', callId).eq('user_id', owner_id).order('created_at', { ascending: true }).limit(limit)
  )) || []
}

// ─── Rate Intelligence ─────────────────────────────────────────
export async function fetchRateIntelligence({ origin, dest, limit = 20 } = {}) {
  const owner_id = await getUserId()
  if (!owner_id) return []
  let q = supabase.from('rate_intelligence').select('*').eq('owner_id', owner_id).order('created_at', { ascending: false }).limit(limit)
  if (origin) q = q.ilike('origin', `%${origin}%`)
  if (dest) q = q.ilike('destination', `%${dest}%`)
  return (await safeSelect('rate_intelligence', q)) || []
}

// ─── Insurance Records ─────────────────────────────────────────
export async function fetchInsuranceRecords() {
  const owner_id = await getUserId()
  if (!owner_id) return []
  return (await safeSelect('insurance_records',
    supabase.from('insurance_records').select('*').eq('owner_id', owner_id).order('expiry_date', { ascending: true })
  )) || []
}

export async function upsertInsuranceRecord(record) {
  const owner_id = await getUserId()
  if (!owner_id) return { data: null, error: { message: 'Not authenticated' } }
  return safeMutate('upsertInsurance',
    supabase.from('insurance_records').upsert({ ...record, owner_id }).select().single()
  )
}

// ─── Load Board Credentials ────────────────────────────────────
export async function fetchLoadBoardCredentials() {
  const owner_id = await getUserId()
  if (!owner_id) return []
  return (await safeSelect('load_board_credentials',
    supabase.from('load_board_credentials').select('provider, status, connected_at, last_tested').eq('user_id', owner_id)
  )) || []
}

// ─── Diesel Prices ─────────────────────────────────────────────
export async function fetchDieselPrice(region = 'US AVG') {
  return (await safeSelect('diesel_prices',
    supabase.from('diesel_prices').select('price_per_gallon, updated_at').eq('region', region).maybeSingle()
  ))
}

// ─── Notifications Log ─────────────────────────────────────────
export async function fetchNotifications({ limit = 50, unreadOnly = false } = {}) {
  const owner_id = await getUserId()
  if (!owner_id) return []
  let q = supabase.from('notifications_log').select('*').eq('user_id', owner_id).order('created_at', { ascending: false }).limit(limit)
  if (unreadOnly) q = q.eq('read', false)
  return (await safeSelect('notifications_log', q)) || []
}

export async function markNotificationRead(id) {
  const owner_id = await getUserId()
  if (!owner_id) return { data: null, error: { message: 'Not authenticated' } }
  return safeMutate('markNotifRead',
    supabase.from('notifications_log').update({ read: true }).eq('id', id).eq('user_id', owner_id)
  )
}

// ─── Settlements ───────────────────────────────────────────────
export async function fetchSettlements({ limit = 50 } = {}) {
  const owner_id = await getUserId()
  if (!owner_id) return []
  return (await safeSelect('settlements',
    supabase.from('settlements').select('*').eq('owner_id', owner_id).order('created_at', { ascending: false }).limit(limit)
  )) || []
}

// ─── Broker Urgency Scores ─────────────────────────────────────
export async function fetchBrokerUrgency(brokerName) {
  const owner_id = await getUserId()
  if (!owner_id) return null
  return (await safeSelect('broker_urgency_scores',
    supabase.from('broker_urgency_scores').select('*').eq('owner_id', owner_id).eq('broker_name', brokerName).maybeSingle()
  ))
}
