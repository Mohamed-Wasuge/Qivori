/**
 * Load Finder Agent — Autonomous load search + scoring engine
 * Searches internal Supabase loads + external APIs (DAT, Truckstop)
 * Filters with custom rules, scores matches, queues top loads for AI calling
 * Runtime: Vercel Edge | Schedule: Daily at 8 AM UTC
 */

export const config = { runtime: 'edge' };

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;

// — Custom rules engine (configurable per carrier) —
const DEFAULT_RULES = {
  minRatePerMile: 2.50,
  maxDeadheadMiles: 150,
  preferredLanes: [],          // e.g. [{ origin: 'TX', destination: 'CA' }]
  equipmentTypes: ['dry_van', 'reefer', 'flatbed'],
  maxWeight: 45000,
  minWeight: 5000,
  avoidStates: [],
  minBrokerRating: 3.0,
  preferredBrokers: [],
  blacklistedBrokers: [],
  maxAge: 24,                  // hours since posted
};

function isAuthorized(req) {
  const auth = req.headers.get('authorization')?.replace('Bearer ', '');
  return auth === process.env.CRON_SECRET || auth === supabaseKey;
}

// — Supabase helpers —
async function supabaseQuery(table, query = '') {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    }
  });
  return res.json();
}

async function supabaseInsert(table, data) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  return res.json();
}

// — Fetch internal loads from Supabase —
async function getInternalLoads() {
  try {
    const cutoff = new Date(Date.now() - DEFAULT_RULES.maxAge * 3600000).toISOString();
    const loads = await supabaseQuery('loads',
      `status=eq.available&created_at=gte.${cutoff}&order=created_at.desc&limit=100`
    );
    return Array.isArray(loads) ? loads.map(l => ({ ...l, source: 'internal' })) : [];
  } catch (e) {
    console.error('Internal load fetch error:', e);
    return [];
  }
}

// — Fetch external loads (DAT / Truckstop / 123Loadboard) —
async function getExternalLoads() {
  const loads = [];

  // DAT API (if configured)
  if (process.env.DAT_API_KEY) {
    try {
      const res = await fetch('https://freight.api.dat.com/posting/v2/loads/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.DAT_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          criteria: {
            equipmentTypes: DEFAULT_RULES.equipmentTypes,
            lane: DEFAULT_RULES.preferredLanes.length > 0 ? {
              origin: { state: DEFAULT_RULES.preferredLanes[0].origin },
              destination: { state: DEFAULT_RULES.preferredLanes[0].destination }
            } : undefined
          },
          limit: 50
        })
      });
      if (res.ok) {
        const data = await res.json();
        const datLoads = (data.loads || data.results || []).map(l => ({
          id: l.matchId || l.id,
          origin_city: l.origin?.city,
          origin_state: l.origin?.state,
          destination_city: l.destination?.city,
          destination_state: l.destination?.state,
          rate: l.rateInfo?.rate || l.rate,
          miles: l.tripLength || l.miles,
          weight: l.weight,
          equipment_type: l.equipmentType,
          broker_name: l.posterInfo?.companyName || l.broker_name,
          broker_phone: l.posterInfo?.phone || l.broker_phone,
          broker_mc: l.posterInfo?.mcNumber || l.broker_mc,
          posted_at: l.postedDate || l.created_at,
          source: 'dat',
          raw: l
        }));
        loads.push(...datLoads);
      }
    } catch (e) {
      console.error('DAT API error:', e);
    }
  }

  // Truckstop API (if configured)
  if (process.env.TRUCKSTOP_API_KEY) {
    try {
      const res = await fetch('https://api.truckstop.com/loads/v1/search', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.TRUCKSTOP_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          equipmentTypes: DEFAULT_RULES.equipmentTypes,
          pageSize: 50
        })
      });
      if (res.ok) {
        const data = await res.json();
        const tsLoads = (data.loads || data.items || []).map(l => ({
          id: l.loadId || l.id,
          origin_city: l.origin?.city,
          origin_state: l.origin?.stateProvince,
          destination_city: l.destination?.city,
          destination_state: l.destination?.stateProvince,
          rate: l.rate?.amount || l.rate,
          miles: l.mileage || l.miles,
          weight: l.weight,
          equipment_type: l.equipmentType,
          broker_name: l.company?.name || l.broker_name,
          broker_phone: l.company?.phone || l.broker_phone,
          broker_mc: l.company?.mcNumber,
          posted_at: l.postedDate,
          source: 'truckstop',
          raw: l
        }));
        loads.push(...tsLoads);
      }
    } catch (e) {
      console.error('Truckstop API error:', e);
    }
  }

  return loads;
}

// — Score a load against rules (0-100) —
function scoreLoad(load, rules) {
  let score = 50; // base score
  const reasons = [];

  // Rate per mile scoring
  const rpm = load.rate && load.miles ? load.rate / load.miles : 0;
  if (rpm >= rules.minRatePerMile * 1.5) {
    score += 25;
    reasons.push(`Excellent rate: $${rpm.toFixed(2)}/mi`);
  } else if (rpm >= rules.minRatePerMile) {
    score += 15;
    reasons.push(`Good rate: $${rpm.toFixed(2)}/mi`);
  } else if (rpm > 0) {
    score -= 20;
    reasons.push(`Below min rate: $${rpm.toFixed(2)}/mi`);
  }

  // Lane preference
  if (rules.preferredLanes.length > 0) {
    const laneMatch = rules.preferredLanes.some(lane =>
      (load.origin_state === lane.origin || !lane.origin) &&
      (load.destination_state === lane.destination || !lane.destination)
    );
    if (laneMatch) {
      score += 20;
      reasons.push('Preferred lane match');
    }
  }

  // Equipment type match
  if (load.equipment_type && rules.equipmentTypes.includes(load.equipment_type.toLowerCase())) {
    score += 5;
  }

  // Weight check
  if (load.weight) {
    if (load.weight > rules.maxWeight) {
      score -= 30;
      reasons.push('Over max weight');
    } else if (load.weight < rules.minWeight) {
      score -= 10;
      reasons.push('Under min weight');
    }
  }

  // Avoid states
  if (rules.avoidStates.length > 0) {
    if (rules.avoidStates.includes(load.origin_state) || rules.avoidStates.includes(load.destination_state)) {
      score -= 25;
      reasons.push('Goes through avoided state');
    }
  }

  // Preferred / blacklisted brokers
  if (rules.blacklistedBrokers.includes(load.broker_mc)) {
    score = 0;
    reasons.push('Blacklisted broker');
  }
  if (rules.preferredBrokers.includes(load.broker_mc)) {
    score += 15;
    reasons.push('Preferred broker');
  }

  // Must have broker phone to call
  if (!load.broker_phone) {
    score -= 40;
    reasons.push('No broker phone number');
  }

  return { score: Math.max(0, Math.min(100, score)), reasons };
}

// — Main handler —
export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  if (!isAuthorized(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // 1. Fetch loads from all sources
    const [internalLoads, externalLoads] = await Promise.all([
      getInternalLoads(),
      getExternalLoads()
    ]);

    const allLoads = [...internalLoads, ...externalLoads];

    if (allLoads.length === 0) {
      return Response.json({ ok: true, message: 'No loads found', matches: 0 });
    }

    // 2. Load custom rules (from Supabase settings or use defaults)
    let rules = { ...DEFAULT_RULES };
    try {
      const settings = await supabaseQuery('settings', 'key=eq.load_finder_rules&limit=1');
      if (settings?.[0]?.value) {
        rules = { ...DEFAULT_RULES, ...JSON.parse(settings[0].value) };
      }
    } catch (e) { /* use defaults */ }

    // 3. Score all loads
    const scoredLoads = allLoads.map(load => {
      const { score, reasons } = scoreLoad(load, rules);
      return { ...load, match_score: score, match_reasons: reasons };
    });

    // 4. Filter: score >= 50 and has broker phone
    const qualifiedLoads = scoredLoads
      .filter(l => l.match_score >= 50 && l.broker_phone)
      .sort((a, b) => b.match_score - a.match_score)
      .slice(0, 20); // top 20

    if (qualifiedLoads.length === 0) {
      return Response.json({ ok: true, message: 'No qualified loads', total: allLoads.length, matches: 0 });
    }

    // 5. Store matches in Supabase
    const matches = qualifiedLoads.map(load => ({
      load_id: String(load.id),
      source: load.source,
      origin: `${load.origin_city || ''}, ${load.origin_state || ''}`.trim(),
      destination: `${load.destination_city || ''}, ${load.destination_state || ''}`.trim(),
      rate: load.rate || 0,
      distance_miles: load.miles || 0,
      rate_per_mile: load.rate && load.miles ? +(load.rate / load.miles).toFixed(2) : 0,
      weight: load.weight || 0,
      equipment_type: load.equipment_type || 'unknown',
      broker_name: load.broker_name || 'Unknown',
      broker_phone: load.broker_phone,
      score: load.match_score,
      score_reasons: load.match_reasons,
      status: load.match_score >= 70 && load.broker_phone ? 'pending_call' : 'new',
    }));

    const inserted = await supabaseInsert('load_matches', matches);

    // 6. Trigger AI caller for top matches (score >= 70 with broker phone)
    const callableLoads = qualifiedLoads
      .filter(l => l.match_score >= 70 && l.broker_phone)
      .slice(0, 5);

    if (callableLoads.length > 0) {
      const callerUrl = `${new URL(req.url).origin}/api/ai-caller`;
      const batchLoads = callableLoads.map(l => ({
        load_id: String(l.id),
        origin: `${l.origin_city || ''}, ${l.origin_state || ''}`.trim(),
        destination: `${l.destination_city || ''}, ${l.destination_state || ''}`.trim(),
        rate: l.rate || 0,
        equipment_type: l.equipment_type || 'dry van',
        broker_name: l.broker_name || 'Unknown',
        broker_phone: l.broker_phone,
        broker_mc: l.broker_mc || '',
        match_score: l.match_score,
        source: l.source,
      }));

      // Fire-and-forget batch call to ai-caller
      fetch(callerUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.CRON_SECRET}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ batchLoads })
      }).catch(() => {});
    }

    return Response.json({
      ok: true,
      total_found: allLoads.length,
      internal: internalLoads.length,
      external: externalLoads.length,
      qualified: qualifiedLoads.length,
      calls_triggered: callableLoads.length,
      top_matches: qualifiedLoads.slice(0, 10).map(m => ({
        origin: `${m.origin_city}, ${m.origin_state}`,
        destination: `${m.destination_city}, ${m.destination_state}`,
        rate: m.rate,
        score: m.match_score,
        broker: m.broker_name,
        will_call: m.match_score >= 70 && !!m.broker_phone,
      }))
    });

  } catch (error) {
    console.error('Load finder error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
