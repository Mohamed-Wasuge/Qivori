import { supabase } from './supabase'

// ─── Helpers ─────────────────────────────────────────────────
function getUser() {
  const { data } = supabase.auth.getSession()
  return data?.session?.user ?? null
}

async function getUserId() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user?.id ?? null
}

// ─── LOADS ───────────────────────────────────────────────────
export async function fetchLoads() {
  const { data, error } = await supabase
    .from('loads')
    .select('*, load_stops(*)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createLoad(load) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('loads')
    .insert({ ...load, owner_id: userId })
    .select('*, load_stops(*)')
    .single()
  if (error) throw error
  return data
}

export async function updateLoad(id, updates) {
  const { data, error } = await supabase
    .from('loads')
    .update(updates)
    .eq('id', id)
    .select('*, load_stops(*)')
    .single()
  if (error) throw error
  return data
}

export async function deleteLoad(id) {
  const { error } = await supabase.from('loads').delete().eq('id', id)
  if (error) throw error
}

// ─── LOAD STOPS ──────────────────────────────────────────────
export async function createLoadStops(loadId, stops) {
  if (!stops?.length) return []
  const rows = stops.map((s, i) => ({
    load_id: loadId,
    sequence: s.sequence ?? i + 1,
    type: s.type,
    city: s.city,
    address: s.address,
    scheduled_time: s.scheduled_time || s.time,
    status: s.status || 'pending',
  }))
  const { data, error } = await supabase.from('load_stops').insert(rows).select()
  if (error) throw error
  return data
}

export async function updateLoadStop(id, updates) {
  const { error } = await supabase.from('load_stops').update(updates).eq('id', id)
  if (error) throw error
}

// ─── CHECK CALLS ─────────────────────────────────────────────
export async function fetchCheckCalls(loadId) {
  const { data, error } = await supabase
    .from('check_calls')
    .select('*')
    .eq('load_id', loadId)
    .order('called_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createCheckCall(loadId, call) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('check_calls')
    .insert({ ...call, load_id: loadId, owner_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── INVOICES ────────────────────────────────────────────────
export async function fetchInvoices() {
  const { data, error } = await supabase
    .from('invoices')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createInvoice(invoice) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('invoices')
    .insert({ ...invoice, owner_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateInvoice(id, updates) {
  const { data, error } = await supabase
    .from('invoices')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

// ─── EXPENSES ────────────────────────────────────────────────
export async function fetchExpenses() {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('date', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createExpense(expense) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('expenses')
    .insert({ ...expense, owner_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateExpense(id, updates) {
  const { data, error } = await supabase
    .from('expenses')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteExpense(id) {
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) throw error
}

// ─── COMPANY ─────────────────────────────────────────────────
export async function fetchCompany() {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .limit(1)
    .single()
  if (error && error.code !== 'PGRST116') throw error // PGRST116 = no rows
  return data
}

export async function upsertCompany(company) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated')

  // Check if company exists
  const existing = await fetchCompany()
  if (existing) {
    const { data, error } = await supabase
      .from('companies')
      .update(company)
      .eq('id', existing.id)
      .select()
      .single()
    if (error) throw error
    return data
  } else {
    const { data, error } = await supabase
      .from('companies')
      .insert({ ...company, owner_id: userId })
      .select()
      .single()
    if (error) throw error
    return data
  }
}

// ─── VEHICLES ────────────────────────────────────────────────
export async function fetchVehicles() {
  const { data, error } = await supabase
    .from('vehicles')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createVehicle(vehicle) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('vehicles')
    .insert({ ...vehicle, owner_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateVehicle(id, updates) {
  const { data, error } = await supabase
    .from('vehicles')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteVehicle(id) {
  const { error } = await supabase.from('vehicles').delete().eq('id', id)
  if (error) throw error
}

// ─── DRIVERS ─────────────────────────────────────────────────
export async function fetchDrivers() {
  const { data, error } = await supabase
    .from('drivers')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function createDriver(driver) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('drivers')
    .insert({ ...driver, owner_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateDriver(id, updates) {
  const { data, error } = await supabase
    .from('drivers')
    .update(updates)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteDriver(id) {
  const { error } = await supabase.from('drivers').delete().eq('id', id)
  if (error) throw error
}

// ─── DOCUMENTS ───────────────────────────────────────────────
export async function fetchDocuments(loadId) {
  let query = supabase.from('documents').select('*').order('uploaded_at', { ascending: false })
  if (loadId) query = query.eq('load_id', loadId)
  const { data, error } = await query
  if (error) throw error
  return data || []
}

export async function createDocument(doc) {
  const userId = await getUserId()
  if (!userId) throw new Error('Not authenticated')
  const { data, error } = await supabase
    .from('documents')
    .insert({ ...doc, owner_id: userId })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteDocument(id) {
  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) throw error
}
