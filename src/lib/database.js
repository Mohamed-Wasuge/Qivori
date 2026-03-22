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
    return null
  }
  return data
}

// Safe mutate — returns { data, error } consistently, never throws
async function safeMutate(label, query) {
  const { data, error } = await query
  if (error) {
    return { data: null, error }
  }
  return { data, error: null }
}

// ─── LOADS (uses actual schema: load_id, rate, broker_id, etc.) ──
export async function fetchLoads() {
  const data = await safeSelect('loads',
    supabase.from('loads').select('*, load_stops(*)').order('created_at', { ascending: false }).limit(500)
  )
  // Sort stops by sequence within each load
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
  const { data, error } = await safeMutate('createLoad',
    supabase.from('loads')
      .insert({
        owner_id: userId,
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
        // LTL / Partial fields
        freight_class: load.freight_class || null,
        pallet_count: load.pallet_count ? parseInt(load.pallet_count) : null,
        stackable: load.stackable || false,
        length_inches: load.length_inches ? parseFloat(load.length_inches) : null,
        width_inches: load.width_inches ? parseFloat(load.width_inches) : null,
        height_inches: load.height_inches ? parseFloat(load.height_inches) : null,
        handling_unit: load.handling_unit || null,
        consolidation_id: load.consolidation_id || null,
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
    supabase.from('invoices').select('*').order('created_at', { ascending: false }).limit(500)
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
    supabase.from('expenses').select('*').order('date', { ascending: false }).limit(500)
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
  const { data } = await supabase.from('companies').select('*').limit(1).maybeSingle()
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
  const data = await safeSelect('vehicles',
    supabase.from('vehicles').select('*').order('created_at', { ascending: false }).limit(100)
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
    supabase.from('drivers').select('*').order('created_at', { ascending: false }).limit(100)
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
  // 1. Insert the load
  const { data: newLoad, error: loadErr } = await safeMutate('createLoadWithStops',
    supabase.from('loads')
      .insert({
        owner_id: userId,
        load_id: load.load_id || null,
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
  if (loadErr) throw loadErr
  // 2. Batch-insert stops with the returned load ID
  if (stops && stops.length > 0) {
    const stopsToInsert = stops.map((s, i) => ({
      load_id: newLoad.id,
      sequence: s.sequence ?? i + 1,
      type: s.type || 'pickup',
      city: s.city || '',
      address: s.address || null,
      state: s.state || null,
      zip_code: s.zip_code || null,
      scheduled_time: s.scheduled_time || null,
      scheduled_date: s.scheduled_date || null,
      status: s.status || (i === 0 ? 'current' : 'pending'),
      contact_name: s.contact_name || null,
      contact_phone: s.contact_phone || null,
      reference_number: s.reference_number || null,
      notes: s.notes || null,
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
