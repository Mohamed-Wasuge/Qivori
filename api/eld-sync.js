// api/eld-sync.js — ELD Data Sync Engine
// Pulls HOS logs, vehicle data, and DVIRs from connected ELD providers
// Can be triggered by cron or manually via authenticated request
// Runtime: Vercel Edge

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// --- Supabase helpers ---

async function supabaseQuery(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error: ${err}`);
  }
  return res.json();
}

async function supabaseUpsert(table, data, onConflict = 'id') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation,resolution=merge-duplicates',
    },
    body: JSON.stringify(Array.isArray(data) ? data : [data]),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase upsert error (${table}): ${err}`);
  }
  return res.json();
}

function isAuthorized(req) {
  const auth = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!auth) return false;
  return (process.env.CRON_SECRET && auth === process.env.CRON_SECRET) || (SUPABASE_KEY && auth === SUPABASE_KEY);
}

async function authenticateUser(req) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];

  // Allow cron/service key auth
  if (token === process.env.CRON_SECRET || token === SUPABASE_KEY) {
    return { id: '__cron__', role: 'service' };
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

// --- Rate limiter (simple in-memory, per-provider) ---
const rateLimitState = {};
function checkRateLimit(provider, maxPerMinute = 30) {
  const now = Date.now();
  const key = provider;
  if (!rateLimitState[key]) rateLimitState[key] = [];
  // Remove entries older than 60s
  rateLimitState[key] = rateLimitState[key].filter(t => now - t < 60000);
  if (rateLimitState[key].length >= maxPerMinute) {
    return false; // rate limited
  }
  rateLimitState[key].push(now);
  return true;
}

// --- Samsara API client ---

async function samsaraFetch(apiKey, endpoint, params = {}) {
  if (!checkRateLimit('samsara', 30)) {
    console.warn('Samsara rate limit reached, skipping request');
    return null;
  }

  const url = new URL(`https://api.samsara.com/v1${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });

  if (res.status === 429) {
    console.warn('Samsara API rate limited (429)');
    return null;
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Samsara API error (${endpoint}): ${res.status} - ${errText}`);
    return null;
  }

  return res.json();
}

async function syncSamsaraHOS(userId, apiKey) {
  const logs = [];
  let hasMore = true;
  let startCursor = undefined;
  let page = 0;
  const maxPages = 5;

  while (hasMore && page < maxPages) {
    const params = { limit: 100 };
    if (startCursor) params.startingAfter = startCursor;

    const data = await samsaraFetch(apiKey, '/fleet/hos_logs', params);
    if (!data) break;

    const entries = data.hosLogs || data.data || [];
    for (const log of entries) {
      logs.push({
        user_id: userId,
        driver_name: log.driverName || log.driver?.name || 'Unknown',
        driver_id: String(log.driverId || log.driver?.id || ''),
        status: mapHOSStatus(log.hosStatusType || log.status),
        start_time: log.logStartMs ? new Date(log.logStartMs).toISOString() : log.startTime,
        end_time: log.logEndMs ? new Date(log.logEndMs).toISOString() : log.endTime,
        duration_hours: log.logStartMs && log.logEndMs
          ? +((log.logEndMs - log.logStartMs) / 3600000).toFixed(2)
          : log.durationHours || 0,
        vehicle_id: String(log.vehicleId || log.vehicle?.id || ''),
        location: log.location || log.codriverName || '',
        violations: log.violations || null,
        source_provider: 'samsara',
        synced_at: new Date().toISOString(),
      });
    }

    // Handle pagination
    if (data.pagination?.endCursor) {
      startCursor = data.pagination.endCursor;
      hasMore = data.pagination.hasNextPage;
    } else {
      hasMore = false;
    }
    page++;
  }

  return logs;
}

async function syncSamsaraVehicles(userId, apiKey) {
  const data = await samsaraFetch(apiKey, '/fleet/vehicles', { limit: 100 });
  if (!data) return [];

  const vehicles = data.vehicles || data.data || [];
  return vehicles.map(v => ({
    user_id: userId,
    vehicle_name: v.name || '',
    vehicle_id: String(v.id || ''),
    vin: v.vin || '',
    make: v.make || '',
    model: v.model || '',
    year: v.year || null,
    current_lat: v.gps?.latitude || v.latitude || null,
    current_lng: v.gps?.longitude || v.longitude || null,
    current_speed: v.gps?.speedMilesPerHour || v.speed || null,
    odometer: v.odometerMeters ? +(v.odometerMeters * 0.000621371).toFixed(1) : v.odometer || null,
    fuel_pct: v.fuelPercent?.value || v.fuelPercent || null,
    engine_hours: v.engineHours?.value || v.engineHours || null,
    source_provider: 'samsara',
    synced_at: new Date().toISOString(),
  }));
}

async function syncSamsaraDVIRs(userId, apiKey) {
  const data = await samsaraFetch(apiKey, '/fleet/dvirs', { limit: 100 });
  if (!data) return [];

  const dvirs = data.dvirs || data.data || [];
  return dvirs.map(d => ({
    user_id: userId,
    driver_name: d.authorSignature?.name || d.driverName || 'Unknown',
    vehicle_name: d.vehicle?.name || d.vehicleName || '',
    inspection_type: (d.inspectionType || 'pre_trip').toLowerCase().includes('pre') ? 'pre_trip' : 'post_trip',
    status: (d.defects && d.defects.length > 0) ? 'defects_found' : 'safe',
    defects: d.defects || [],
    submitted_at: d.inspectionTimestamp
      ? new Date(d.inspectionTimestamp).toISOString()
      : d.timeMs ? new Date(d.timeMs).toISOString() : new Date().toISOString(),
    source_provider: 'samsara',
    synced_at: new Date().toISOString(),
  }));
}

// --- Motive (KeepTruckin) API client ---

async function motiveFetch(apiKey, endpoint, params = {}) {
  if (!checkRateLimit('motive', 20)) {
    console.warn('Motive rate limit reached, skipping request');
    return null;
  }

  const url = new URL(`https://api.gomotive.com/v1${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, v);
  }

  // Support both OAuth Bearer tokens and legacy X-Api-Key
  // OAuth tokens are typically longer (100+ chars) and start with 'C' or contain mixed case
  const isOAuthToken = apiKey.length > 60
  const headers = isOAuthToken
    ? { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    : { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' }

  const res = await fetch(url.toString(), { headers });

  if (res.status === 429) {
    console.warn('Motive API rate limited (429)');
    return null;
  }

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Motive API error (${endpoint}): ${res.status} - ${errText}`);
    // If Bearer failed, retry with X-Api-Key as fallback
    if (isOAuthToken) {
      const res2 = await fetch(url.toString(), {
        headers: { 'X-Api-Key': apiKey, 'Content-Type': 'application/json' },
      });
      if (res2.ok) return res2.json();
    }
    return null;
  }

  return res.json();
}

async function syncMotiveHOS(userId, apiKey) {
  const logs = [];
  let pageNo = 1;
  let hasMore = true;
  const maxPages = 5;

  while (hasMore && pageNo <= maxPages) {
    const data = await motiveFetch(apiKey, '/hours_of_service/daily_logs', {
      page_no: pageNo,
      per_page: 100,
    });
    if (!data) break;

    const entries = data.daily_logs || data.data || [];
    for (const log of entries) {
      const logEntries = log.log_entries || [log];
      for (const entry of logEntries) {
        logs.push({
          user_id: userId,
          driver_name: log.driver?.first_name
            ? `${log.driver.first_name} ${log.driver.last_name || ''}`.trim()
            : log.driver_name || 'Unknown',
          driver_id: String(log.driver?.id || log.driver_id || ''),
          status: mapHOSStatus(entry.status || entry.event_type),
          start_time: entry.start_time || log.date,
          end_time: entry.end_time || null,
          duration_hours: entry.duration
            ? +(entry.duration / 3600).toFixed(2)
            : entry.total_hours || 0,
          vehicle_id: String(log.vehicle?.id || log.vehicle_id || ''),
          location: entry.location?.description || entry.location || '',
          violations: log.violations || null,
          source_provider: 'motive',
          synced_at: new Date().toISOString(),
        });
      }
    }

    // Motive pagination
    if (data.pagination?.next_page || (entries.length >= 100 && pageNo < maxPages)) {
      pageNo++;
    } else {
      hasMore = false;
    }
  }

  return logs;
}

async function syncMotiveVehicles(userId, apiKey) {
  const data = await motiveFetch(apiKey, '/vehicles', { per_page: 100 });
  if (!data) return [];

  const vehicles = data.vehicles || data.data || [];
  return vehicles.map(v => {
    const vehicle = v.vehicle || v;
    return {
      user_id: userId,
      vehicle_name: vehicle.number || vehicle.name || '',
      vehicle_id: String(vehicle.id || ''),
      vin: vehicle.vin || '',
      make: vehicle.make || '',
      model: vehicle.model || '',
      year: vehicle.year || null,
      current_lat: vehicle.current_location?.lat || vehicle.latitude || null,
      current_lng: vehicle.current_location?.lon || vehicle.longitude || null,
      current_speed: vehicle.current_location?.speed || vehicle.speed || null,
      odometer: vehicle.odometer || null,
      fuel_pct: vehicle.fuel_level || null,
      engine_hours: vehicle.engine_hours || null,
      source_provider: 'motive',
      synced_at: new Date().toISOString(),
    };
  });
}

async function syncMotiveDVIRs(userId, apiKey) {
  const data = await motiveFetch(apiKey, '/vehicle_inspections', { per_page: 100 });
  if (!data) return [];

  const inspections = data.vehicle_inspections || data.data || [];
  return inspections.map(i => {
    const insp = i.vehicle_inspection || i;
    const defectsList = insp.defects || insp.mechanic_defects || [];
    return {
      user_id: userId,
      driver_name: insp.driver?.first_name
        ? `${insp.driver.first_name} ${insp.driver.last_name || ''}`.trim()
        : insp.driver_name || 'Unknown',
      vehicle_name: insp.vehicle?.number || insp.vehicle_name || '',
      inspection_type: (insp.type || insp.inspection_type || 'pre_trip').toLowerCase().includes('pre') ? 'pre_trip' : 'post_trip',
      status: defectsList.length > 0 ? 'defects_found' : 'safe',
      defects: defectsList,
      submitted_at: insp.date || insp.created_at || new Date().toISOString(),
      source_provider: 'motive',
      synced_at: new Date().toISOString(),
    };
  });
}

// --- Helpers ---

function mapHOSStatus(raw) {
  if (!raw) return 'off_duty';
  const s = String(raw).toLowerCase();
  if (s.includes('driv')) return 'driving';
  if (s.includes('on_duty') || s.includes('on duty') || s === 'on') return 'on_duty';
  if (s.includes('sleeper') || s.includes('sb')) return 'sleeper';
  if (s.includes('off_duty') || s.includes('off duty') || s === 'off') return 'off_duty';
  if (s.includes('yard') || s.includes('ym')) return 'on_duty'; // yard move -> on duty
  if (s.includes('personal') || s.includes('pc')) return 'off_duty'; // personal conveyance -> off duty
  return 'off_duty';
}

// --- Motive Token Refresh ---

async function refreshMotiveToken(userId, conn) {
  // Get refresh token from metadata
  let metadata = {}
  try { metadata = typeof conn.metadata === 'string' ? JSON.parse(conn.metadata) : (conn.metadata || {}) } catch { metadata = {} }

  const refreshToken = metadata.refresh_token
  if (!refreshToken) return null

  const CLIENT_ID = process.env.MOTIVE_CLIENT_ID
  const CLIENT_SECRET = process.env.MOTIVE_CLIENT_SECRET
  if (!CLIENT_ID || !CLIENT_SECRET) return null

  try {
    const res = await fetch('https://api.gomotive.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
      }),
    })

    if (!res.ok) {
      console.error(`Motive token refresh failed for user ${userId}: ${res.status}`)
      return null
    }

    const tokenData = await res.json()
    const newAccessToken = tokenData.access_token
    const newRefreshToken = tokenData.refresh_token || refreshToken

    if (!newAccessToken) return null

    // Update the connection in Supabase with new tokens
    const newMetadata = JSON.stringify({
      ...metadata,
      refresh_token: newRefreshToken,
      token_type: tokenData.token_type,
      expires_in: tokenData.expires_in,
      last_refreshed: new Date().toISOString(),
    })

    await supabaseQuery(`eld_connections?user_id=eq.${userId}&provider=eq.motive`, {
      method: 'PATCH',
      body: JSON.stringify({ api_key: newAccessToken, metadata: newMetadata }),
    })

    console.log(`Motive token refreshed for user ${userId}`)
    return newAccessToken
  } catch (e) {
    console.error(`Motive token refresh error for user ${userId}:`, e.message)
    return null
  }
}

// --- Sync orchestrator ---

async function syncProvider(userId, provider, apiKey, conn) {
  const results = { hos: 0, vehicles: 0, dvirs: 0, errors: [] };

  try {
    let hosLogs, vehicles, dvirs;

    if (provider === 'samsara') {
      [hosLogs, vehicles, dvirs] = await Promise.all([
        syncSamsaraHOS(userId, apiKey),
        syncSamsaraVehicles(userId, apiKey),
        syncSamsaraDVIRs(userId, apiKey),
      ]);
    } else if (provider === 'motive') {
      // Try sync — if 401, refresh token and retry once
      let currentKey = apiKey
      const testRes = await motiveFetch(currentKey, '/companies', { per_page: 1 })
      if (!testRes && conn) {
        // Token likely expired — try refresh
        const newKey = await refreshMotiveToken(userId, conn)
        if (newKey) {
          currentKey = newKey
        }
      }
      [hosLogs, vehicles, dvirs] = await Promise.all([
        syncMotiveHOS(userId, currentKey),
        syncMotiveVehicles(userId, currentKey),
        syncMotiveDVIRs(userId, currentKey),
      ]);
    } else {
      results.errors.push(`Unknown provider: ${provider}`);
      return results;
    }

    // Upsert HOS logs
    if (hosLogs && hosLogs.length > 0) {
      await supabaseUpsert('eld_hos_logs', hosLogs);
      results.hos = hosLogs.length;
    }

    // Upsert vehicles
    if (vehicles && vehicles.length > 0) {
      await supabaseUpsert('eld_vehicles', vehicles);
      results.vehicles = vehicles.length;
    }

    // Upsert DVIRs
    if (dvirs && dvirs.length > 0) {
      await supabaseUpsert('eld_dvirs', dvirs);
      results.dvirs = dvirs.length;
    }

    // Update last_sync on the connection record
    await supabaseQuery(`eld_connections?user_id=eq.${userId}&provider=eq.${provider}`, {
      method: 'PATCH',
      body: JSON.stringify({ last_sync: new Date().toISOString() }),
    });

  } catch (e) {
    console.error(`Sync error for ${provider}:`, e);
    results.errors.push(e.message);

    // Update connection status with error
    await supabaseQuery(`eld_connections?user_id=eq.${userId}&provider=eq.${provider}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'error' }),
    }).catch(() => {});
  }

  return results;
}

// --- Main handler ---

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  const user = await authenticateUser(req);
  if (!user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const requestedProvider = url.searchParams.get('provider');
    const requestedUserId = url.searchParams.get('user_id');

    // For cron jobs, sync all connected users; for user requests, sync just their connections
    let connections;
    if (user.role === 'service') {
      // Cron/service call: sync all active connections (or filtered by user_id/provider)
      let query = 'eld_connections?status=eq.connected';
      if (requestedUserId) query += `&user_id=eq.${requestedUserId}`;
      if (requestedProvider) query += `&provider=eq.${requestedProvider}`;
      query += '&limit=100';
      connections = await supabaseQuery(query);
    } else {
      // User-initiated sync
      let query = `eld_connections?user_id=eq.${user.id}&status=eq.connected`;
      if (requestedProvider) query += `&provider=eq.${requestedProvider}`;
      connections = await supabaseQuery(query);
    }

    if (!connections || connections.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        message: 'No connected ELD providers to sync',
        synced: 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Sync each connection
    const syncResults = [];
    for (const conn of connections) {
      if (!conn.api_key) {
        syncResults.push({
          provider: conn.provider,
          user_id: conn.user_id,
          error: 'No API key stored',
        });
        continue;
      }

      const result = await syncProvider(conn.user_id, conn.provider, conn.api_key, conn);
      syncResults.push({
        provider: conn.provider,
        user_id: conn.user_id,
        hos_synced: result.hos,
        vehicles_synced: result.vehicles,
        dvirs_synced: result.dvirs,
        errors: result.errors,
      });
    }

    const totalHOS = syncResults.reduce((sum, r) => sum + (r.hos_synced || 0), 0);
    const totalVehicles = syncResults.reduce((sum, r) => sum + (r.vehicles_synced || 0), 0);
    const totalDVIRs = syncResults.reduce((sum, r) => sum + (r.dvirs_synced || 0), 0);
    const totalErrors = syncResults.reduce((sum, r) => sum + (r.errors?.length || 0), 0);

    return new Response(JSON.stringify({
      ok: true,
      connections_synced: connections.length,
      totals: {
        hos_logs: totalHOS,
        vehicles: totalVehicles,
        dvirs: totalDVIRs,
        errors: totalErrors,
      },
      details: syncResults,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('ELD sync error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: corsHeaders,
    });
  }
}
