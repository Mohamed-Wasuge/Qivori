// api/quickbooks-sync.js — QuickBooks Online Transaction Sync
// Syncs Qivori invoices, expenses, and payments TO QuickBooks
// Can be called manually or via Vercel Cron

export const config = { runtime: 'edge' }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
const QB_CLIENT_ID = process.env.QUICKBOOKS_CLIENT_ID
const QB_CLIENT_SECRET = process.env.QUICKBOOKS_CLIENT_SECRET

const QB_API_BASE = 'https://quickbooks.api.intuit.com/v3/company'
const QB_SANDBOX_BASE = 'https://sandbox-quickbooks.api.intuit.com/v3/company'
const QB_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer'

// Qivori category → QuickBooks account mapping (mirrors Finance.jsx QB_MAPPING)
const QB_MAPPING = [
  { qivori: 'Gross Revenue',  qb: 'Income:Freight Revenue',         type: 'Income'  },
  { qivori: 'Fuel',           qb: 'Expenses:Fuel & Mileage',        type: 'Expense' },
  { qivori: 'Maintenance',    qb: 'Expenses:Repairs & Maintenance', type: 'Expense' },
  { qivori: 'Tolls',          qb: 'Expenses:Travel:Tolls',          type: 'Expense' },
  { qivori: 'Lumper',         qb: 'Expenses:Lumper Fees',           type: 'Expense' },
  { qivori: 'Insurance',      qb: 'Expenses:Insurance',             type: 'Expense' },
  { qivori: 'Permits',        qb: 'Expenses:Licenses & Permits',   type: 'Expense' },
  { qivori: 'ELD/Tech',       qb: 'Expenses:Software & Tech',      type: 'Expense' },
]

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

async function supabaseRequest(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Supabase error: ${err}`)
  }
  return res.json()
}

async function authenticateUser(req) {
  const authHeader = req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const token = authHeader.split(' ')[1]
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok) return null
    return await res.json()
  } catch { return null }
}

// Refresh QB access token if expired (returns updated connection or throws)
async function refreshTokenIfNeeded(connection) {
  const expiresAt = new Date(connection.token_expires_at)
  // Refresh if token expires within 5 minutes
  if (expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return connection
  }

  const basicAuth = btoa(`${QB_CLIENT_ID}:${QB_CLIENT_SECRET}`)
  const tokenRes = await fetch(QB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token,
    }).toString(),
  })

  const tokens = await tokenRes.json()
  if (!tokenRes.ok || tokens.error) {
    throw new Error(`Token refresh failed: ${tokens.error || 'unknown error'}`)
  }

  const newExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

  // Update tokens in Supabase
  await supabaseRequest(
    `quickbooks_connections?id=eq.${connection.id}`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expires_at: newExpiresAt,
      }),
    }
  )

  return {
    ...connection,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    token_expires_at: newExpiresAt,
  }
}

// Get the QB API base URL (sandbox vs production)
function getQBBase(realmId) {
  // Use sandbox in non-production environments
  const isProduction = process.env.VERCEL_ENV === 'production'
  const base = isProduction ? QB_API_BASE : QB_SANDBOX_BASE
  return `${base}/${realmId}`
}

// Make a QuickBooks API request with error handling
async function qbFetch(connection, endpoint, options = {}) {
  const base = getQBBase(connection.realm_id)
  const url = `${base}/${endpoint}`

  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${connection.access_token}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  // Handle rate limiting (QB returns 429)
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '60', 10)
    throw new Error(`RATE_LIMITED:${retryAfter}`)
  }

  // Handle expired token (should not happen after refresh, but just in case)
  if (res.status === 401) {
    throw new Error('TOKEN_EXPIRED')
  }

  const data = await res.json()

  if (!res.ok) {
    const fault = data?.Fault?.Error?.[0]
    throw new Error(`QB API error: ${fault?.Message || res.statusText} (${fault?.code || res.status})`)
  }

  return data
}

// Map a Qivori expense category to a QB account name
function mapCategory(category) {
  const mapping = QB_MAPPING.find(m => category.includes(m.qivori))
  return mapping?.qb || 'Expenses:Miscellaneous'
}

// Find or create a QB customer by name (for invoices)
async function findOrCreateCustomer(connection, customerName) {
  // Query for existing customer
  const query = encodeURIComponent(`SELECT * FROM Customer WHERE DisplayName = '${customerName.replace(/'/g, "\\'")}'`)
  const result = await qbFetch(connection, `query?query=${query}`)

  if (result?.QueryResponse?.Customer?.length) {
    return result.QueryResponse.Customer[0]
  }

  // Create new customer
  const newCustomer = await qbFetch(connection, 'customer', {
    method: 'POST',
    body: JSON.stringify({
      DisplayName: customerName,
      CompanyName: customerName,
    }),
  })

  return newCustomer.Customer
}

// Find or create a QB account by name
async function findOrCreateAccount(connection, accountName, accountType = 'Expense') {
  const name = accountName.split(':').pop() // Use leaf name for query
  const query = encodeURIComponent(`SELECT * FROM Account WHERE Name = '${name.replace(/'/g, "\\'")}'`)
  const result = await qbFetch(connection, `query?query=${query}`)

  if (result?.QueryResponse?.Account?.length) {
    return result.QueryResponse.Account[0]
  }

  // Create new account
  const qbAccountType = accountType === 'Income' ? 'Income' : 'Expense'
  const newAccount = await qbFetch(connection, 'account', {
    method: 'POST',
    body: JSON.stringify({
      Name: name,
      AccountType: qbAccountType,
    }),
  })

  return newAccount.Account
}

// Sync a single invoice to QuickBooks
async function syncInvoice(connection, invoice) {
  const customer = await findOrCreateCustomer(connection, invoice.broker || invoice.customer || 'Unknown Customer')

  const qbInvoice = {
    CustomerRef: { value: customer.Id },
    TxnDate: invoice.date || new Date().toISOString().split('T')[0],
    DueDate: invoice.due_date || null,
    PrivateNote: `Qivori Invoice ${invoice.id} — ${invoice.route || ''}`,
    Line: [
      {
        Amount: invoice.amount || invoice.gross || 0,
        DetailType: 'SalesItemLineDetail',
        SalesItemLineDetail: {
          Qty: 1,
          UnitPrice: invoice.amount || invoice.gross || 0,
        },
        Description: `Freight: ${invoice.route || invoice.origin + ' → ' + invoice.dest || 'Load'}`,
      },
    ],
  }

  const result = await qbFetch(connection, 'invoice', {
    method: 'POST',
    body: JSON.stringify(qbInvoice),
  })

  return result.Invoice
}

// Sync a single expense to QuickBooks as a Purchase
async function syncExpense(connection, expense) {
  const accountName = mapCategory(expense.cat || expense.category || '')
  const accountType = QB_MAPPING.find(m => (expense.cat || '').includes(m.qivori))?.type || 'Expense'
  const account = await findOrCreateAccount(connection, accountName, accountType)

  const qbPurchase = {
    PaymentType: 'Cash',
    TxnDate: expense.date || new Date().toISOString().split('T')[0],
    PrivateNote: `Qivori Expense — ${expense.cat || expense.category || ''} — ${expense.merchant || ''}`,
    AccountRef: { value: account.Id },
    Line: [
      {
        Amount: expense.amount || 0,
        DetailType: 'AccountBasedExpenseLineDetail',
        AccountBasedExpenseLineDetail: {
          AccountRef: { value: account.Id },
        },
        Description: `${expense.cat || expense.category || ''} — ${expense.merchant || expense.description || ''}`,
      },
    ],
  }

  const result = await qbFetch(connection, 'purchase', {
    method: 'POST',
    body: JSON.stringify(qbPurchase),
  })

  return result.Purchase
}

// Sync a payment to QuickBooks
async function syncPayment(connection, payment) {
  const customer = await findOrCreateCustomer(connection, payment.broker || payment.customer || 'Unknown Customer')

  const qbPayment = {
    CustomerRef: { value: customer.Id },
    TotalAmt: payment.amount || 0,
    TxnDate: payment.date || new Date().toISOString().split('T')[0],
    PrivateNote: `Qivori Payment — ${payment.reference || payment.id || ''}`,
  }

  const result = await qbFetch(connection, 'payment', {
    method: 'POST',
    body: JSON.stringify(qbPayment),
  })

  return result.Payment
}

// Create a sync log entry
async function createSyncLog(userId, connectionId, syncType, status, details = {}) {
  const log = await supabaseRequest('quickbooks_sync_log', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      connection_id: connectionId,
      sync_type: syncType,
      direction: 'push',
      status,
      records_synced: details.synced || 0,
      records_failed: details.failed || 0,
      error_message: details.error || null,
      details: details.details || {},
      started_at: details.started_at || new Date().toISOString(),
      completed_at: status !== 'pending' ? new Date().toISOString() : null,
    }),
  })
  return log[0]
}

// Update a sync log entry
async function updateSyncLog(logId, updates) {
  await supabaseRequest(`quickbooks_sync_log?id=eq.${logId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      ...updates,
      completed_at: new Date().toISOString(),
    }),
  })
}

// Run full sync for a single connection
async function syncConnection(connection) {
  const startedAt = new Date().toISOString()
  let synced = 0
  let failed = 0
  const errors = []

  // Refresh token if needed
  let conn
  try {
    conn = await refreshTokenIfNeeded(connection)
  } catch (err) {
    await createSyncLog(connection.user_id, connection.id, 'full', 'error', {
      error: `Token refresh failed: ${err.message}`,
      started_at: startedAt,
    })
    return { synced: 0, failed: 0, error: err.message }
  }

  // Create pending sync log
  const log = await createSyncLog(conn.user_id, conn.id, 'full', 'pending', { started_at: startedAt })

  // Build date filter — sync records since last_sync or last 30 days
  const sinceDate = conn.last_sync
    ? new Date(conn.last_sync).toISOString()
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  // Fetch invoices to sync
  try {
    const invoices = await supabaseRequest(
      `invoices?user_id=eq.${conn.user_id}&created_at=gte.${sinceDate}&qb_synced=is.null&limit=50`
    ).catch(() => [])

    for (const invoice of invoices) {
      try {
        await syncInvoice(conn, invoice)
        // Mark as synced in Qivori
        await supabaseRequest(`invoices?id=eq.${invoice.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ qb_synced: new Date().toISOString() }),
        }).catch(() => {})
        synced++
      } catch (err) {
        failed++
        errors.push({ type: 'invoice', id: invoice.id, error: err.message })
        // If rate limited, stop processing
        if (err.message.startsWith('RATE_LIMITED')) break
      }
    }
  } catch (err) {
    errors.push({ type: 'invoices_query', error: err.message })
  }

  // Fetch expenses to sync
  try {
    const expenses = await supabaseRequest(
      `expenses?user_id=eq.${conn.user_id}&created_at=gte.${sinceDate}&qb_synced=is.null&limit=100`
    ).catch(() => [])

    for (const expense of expenses) {
      try {
        await syncExpense(conn, expense)
        await supabaseRequest(`expenses?id=eq.${expense.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ qb_synced: new Date().toISOString() }),
        }).catch(() => {})
        synced++
      } catch (err) {
        failed++
        errors.push({ type: 'expense', id: expense.id, error: err.message })
        if (err.message.startsWith('RATE_LIMITED')) break
      }
    }
  } catch (err) {
    errors.push({ type: 'expenses_query', error: err.message })
  }

  // Fetch driver payroll to sync as Contract Labor expenses
  try {
    const payrolls = await supabaseRequest(
      `driver_payroll?owner_id=eq.${conn.user_id}&status=in.(approved,paid)&qb_synced=is.null&limit=50`
    ).catch(() => [])

    for (const pr of payrolls) {
      try {
        // Look up driver name
        let driverName = 'Driver'
        try {
          const drivers = await supabaseRequest(`drivers?id=eq.${pr.driver_id}&select=name,full_name&limit=1`)
          if (drivers[0]) driverName = drivers[0].name || drivers[0].full_name || 'Driver'
        } catch {}

        await syncExpense(conn, {
          cat: 'Driver Pay',
          category: 'Driver Pay',
          amount: pr.net_pay || 0,
          date: pr.period_end || new Date().toISOString().split('T')[0],
          merchant: driverName,
          description: `Settlement ${pr.period_start} to ${pr.period_end} — ${driverName} (${pr.loads_completed || 0} loads, ${pr.miles_driven || 0} mi)`,
        })
        await supabaseRequest(`driver_payroll?id=eq.${pr.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ qb_synced: new Date().toISOString() }),
        }).catch(() => {})
        synced++
      } catch (err) {
        failed++
        errors.push({ type: 'payroll', id: pr.id, error: err.message })
        if (err.message.startsWith('RATE_LIMITED')) break
      }
    }
  } catch (err) {
    errors.push({ type: 'payroll_query', error: err.message })
  }

  // Fetch payments to sync
  try {
    const payments = await supabaseRequest(
      `payments?user_id=eq.${conn.user_id}&created_at=gte.${sinceDate}&qb_synced=is.null&limit=50`
    ).catch(() => [])

    for (const payment of payments) {
      try {
        await syncPayment(conn, payment)
        await supabaseRequest(`payments?id=eq.${payment.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ qb_synced: new Date().toISOString() }),
        }).catch(() => {})
        synced++
      } catch (err) {
        failed++
        errors.push({ type: 'payment', id: payment.id, error: err.message })
        if (err.message.startsWith('RATE_LIMITED')) break
      }
    }
  } catch (err) {
    errors.push({ type: 'payments_query', error: err.message })
  }

  // Update sync log
  const finalStatus = failed === 0 ? 'success' : synced > 0 ? 'partial' : 'error'
  await updateSyncLog(log.id, {
    status: finalStatus,
    records_synced: synced,
    records_failed: failed,
    error_message: errors.length ? errors.map(e => `${e.type}:${e.error}`).join('; ').substring(0, 1000) : null,
    details: { errors },
  })

  // Update last_sync on the connection
  await supabaseRequest(`quickbooks_connections?id=eq.${conn.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ last_sync: new Date().toISOString() }),
  })

  return { synced, failed, errors }
}

// GET: Sync status / history
async function handleGet(req) {
  const user = await authenticateUser(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  const url = new URL(req.url)
  const action = url.searchParams.get('action')

  // Get sync history
  if (action === 'history') {
    const logs = await supabaseRequest(
      `quickbooks_sync_log?user_id=eq.${user.id}&order=created_at.desc&limit=20&select=id,sync_type,direction,status,records_synced,records_failed,error_message,started_at,completed_at`
    )
    return new Response(JSON.stringify({ ok: true, logs }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Get current sync status
  const connections = await supabaseRequest(
    `quickbooks_connections?user_id=eq.${user.id}&limit=1&select=id,last_sync,company_name`
  )
  const conn = connections[0]

  if (!conn) {
    return new Response(JSON.stringify({ ok: true, connected: false }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  // Get last sync log
  const lastLog = await supabaseRequest(
    `quickbooks_sync_log?connection_id=eq.${conn.id}&order=created_at.desc&limit=1`
  )

  return new Response(JSON.stringify({
    ok: true,
    connected: true,
    company_name: conn.company_name,
    last_sync: conn.last_sync,
    last_log: lastLog[0] || null,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

// POST: Trigger sync
async function handlePost(req) {
  const url = new URL(req.url)

  // ── Cron mode: sync all connections (called by Vercel Cron) ──
  const cronSecret = url.searchParams.get('cron_secret')
  if (cronSecret) {
    const expectedSecret = process.env.CRON_SECRET
    if (!expectedSecret || cronSecret !== expectedSecret) {
      return new Response(JSON.stringify({ error: 'Invalid cron secret' }), { status: 401, headers: corsHeaders })
    }

    if (!QB_CLIENT_ID || !QB_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: 'QuickBooks credentials not configured' }), { status: 500, headers: corsHeaders })
    }

    // Get all active connections
    const connections = await supabaseRequest('quickbooks_connections?select=*')
    const results = []

    for (const conn of connections) {
      try {
        const result = await syncConnection(conn)
        results.push({ user_id: conn.user_id, realm_id: conn.realm_id, ...result })
      } catch (err) {
        results.push({ user_id: conn.user_id, realm_id: conn.realm_id, error: err.message })
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      synced_connections: results.length,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // ── User-triggered sync ──
  const user = await authenticateUser(req)
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
  }

  if (!QB_CLIENT_ID || !QB_CLIENT_SECRET) {
    return new Response(JSON.stringify({ error: 'QuickBooks credentials not configured' }), { status: 500, headers: corsHeaders })
  }

  const connections = await supabaseRequest(
    `quickbooks_connections?user_id=eq.${user.id}&limit=1`
  )
  const conn = connections[0]

  if (!conn) {
    return new Response(JSON.stringify({ error: 'No QuickBooks connection found. Please connect first.' }), {
      status: 404, headers: corsHeaders,
    })
  }

  try {
    const result = await syncConnection(conn)
    return new Response(JSON.stringify({
      ok: true,
      message: `Sync complete: ${result.synced} synced, ${result.failed} failed`,
      ...result,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (err) {
    console.error('QB sync error:', err)
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500, headers: corsHeaders,
    })
  }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  try {
    if (req.method === 'GET') return handleGet(req)
    if (req.method === 'POST') return handlePost(req)

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders })
  } catch (error) {
    console.error('QuickBooks sync error:', error)
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: corsHeaders })
  }
}
