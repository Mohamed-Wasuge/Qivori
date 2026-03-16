import { supabase } from './supabase'

// ─── Helpers ─────────────────────────────────────────────────
async function getUserId() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

// Safe query — returns empty array/null instead of throwing if table doesn't exist
async function safeSelect(table, query) {
  const { data, error } = await query
  if (error) {
    console.warn(`[DB] ${table} query failed:`, error.message)
    return null
  }
  return data
}

// Safe mutate — returns { data, error } consistently, never throws
async function safeMutate(label, query) {
  const { data, error } = await query
  if (error) {
    console.warn(`[DB] ${label} failed:`, error.message)
    return { data: null, error }
  }
  return { data, error: null }
}

// ─── LOADS (uses actual schema: load_id, rate, broker_id, etc.) ──
export async function fetchLoads() {
  const data = await safeSelect('loads',
    supabase.from('loads').select('*').order('created_at', { ascending: false })
  )
  return data || []
}

export async function createLoad(load) {
  const userId = await getUserId()
  const { data, error } = await safeMutate('createLoad',
    supabase.from('loads')
      .insert({
        load_id: load.load_id || load.loadId || null,
        origin: load.origin,
        destination: load.destination || load.dest,
        rate: parseFloat(load.rate) || parseFloat(load.gross_pay) || parseFloat(load.gross) || 0,
        load_type: load.load_type || load.loadType || 'FTL',
        equipment: load.equipment || 'Dry Van',
        weight: load.weight || null,
        status: load.status || 'Rate Con Received',
        pickup_date: load.pickup_date || load.pickupDate || null,
        delivery_date: load.delivery_date || load.deliveryDate || null,
        broker_id: load.broker_id || userId,
        broker_name: load.broker_name || load.broker || null,
        carrier_id: load.carrier_id || null,
        carrier_name: load.carrier_name || load.driver || load.driver_name || null,
        notes: load.notes || load.commodity || null,
        rate_con_url: load.rate_con_url || null,
      })
      .select()
      .single()
  )
  if (error) throw error
  return data
}

export async function updateLoad(id, updates) {
  const { data, error } = await safeMutate('updateLoad',
    supabase.from('loads').update(updates).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

export async function updateLoadByLoadId(loadId, updates) {
  const { data, error } = await safeMutate('updateLoadByLoadId',
    supabase.from('loads').update(updates).eq('load_id', loadId).select().single()
  )
  if (error) throw error
  return data
}

export async function deleteLoad(id) {
  const { error } = await safeMutate('deleteLoad',
    supabase.from('loads').delete().eq('id', id)
  )
  if (error) throw error
}

// ─── INVOICES ────────────────────────────────────────────────
export async function fetchInvoices() {
  const data = await safeSelect('invoices',
    supabase.from('invoices').select('*').order('created_at', { ascending: false })
  )
  return data || []
}

export async function createInvoice(invoice) {
  const userId = await getUserId()
  const { data } = await safeMutate('createInvoice',
    supabase.from('invoices').insert({ ...invoice, owner_id: userId }).select().single()
  )
  return data
}

export async function updateInvoice(id, updates) {
  const { data, error } = await safeMutate('updateInvoice',
    supabase.from('invoices').update(updates).eq('id', id).select().single()
  )
  if (error) throw error
  return data
}

// ─── EXPENSES ────────────────────────────────────────────────
export async function fetchExpenses() {
  const data = await safeSelect('expenses',
    supabase.from('expenses').select('*').order('date', { ascending: false })
  )
  return data || []
}

export async function createExpense(expense) {
  const userId = await getUserId()
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
  const data = await safeSelect('companies',
    supabase.from('companies').select('*').limit(1).single()
  )
  return data
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
  const data = await safeSelect('vehicles',
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
  const data = await safeSelect('drivers',
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
  let query = supabase.from('documents').select('*').order('uploaded_at', { ascending: false })
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
export async function updateLoadStop(id, updates) {
  const { data } = await safeMutate('updateLoadStop',
    supabase.from('load_stops').update(updates).eq('id', id).select().single()
  )
  return data
}
