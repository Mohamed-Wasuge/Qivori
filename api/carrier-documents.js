// api/carrier-documents.js — Carrier Document Management API
// Handles upload, list, delete of carrier documents (insurance, W9, operating authority)
// Part of Phase 2: Carrier Packet System

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

const DOCUMENT_TYPES = ['insurance_certificate', 'w9_form', 'operating_authority', 'medical_card'];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error: ${err}`);
  }
  return res.json();
}

async function supabaseStorage(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/${path}`, {
    ...options,
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      ...options.headers,
    },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Storage error: ${err}`);
  }
  return res.json();
}

// Authenticate user from JWT token
async function authenticateUser(req) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];

  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

// Check if carrier has valid (non-expired) insurance
async function checkInsuranceValid(userId) {
  const docs = await supabaseRequest(
    `carrier_documents?user_id=eq.${userId}&document_type=eq.insurance_certificate&order=uploaded_at.desc&limit=1`
  );
  if (!docs.length) return { valid: false, reason: 'No insurance certificate uploaded' };

  const doc = docs[0];
  if (doc.expiry_date) {
    const expiry = new Date(doc.expiry_date);
    if (expiry < new Date()) {
      return { valid: false, reason: 'Insurance certificate has expired. Please upload a current certificate.' };
    }
  }
  return { valid: true };
}

// GET: List documents for user
async function handleGet(req, url) {
  const user = await authenticateUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

  const docType = url.searchParams.get('type');
  let query = `carrier_documents?user_id=eq.${user.id}&order=uploaded_at.desc`;
  if (docType && DOCUMENT_TYPES.includes(docType)) {
    query += `&document_type=eq.${docType}`;
  }

  const docs = await supabaseRequest(query);

  // Also get carrier profile
  const profiles = await supabaseRequest(`carrier_profiles?user_id=eq.${user.id}&limit=1`);
  const profile = profiles[0] || null;

  // Check packet completeness
  const docTypes = docs.map(d => d.document_type);
  const hasInsurance = docTypes.includes('insurance_certificate');
  const hasW9 = docTypes.includes('w9_form');
  const hasAuthority = docTypes.includes('operating_authority');
  const hasMC = profile?.mc_number;
  const hasDOT = profile?.dot_number;

  const packetStatus = {
    insurance_certificate: hasInsurance ? 'uploaded' : 'missing',
    w9_form: hasW9 ? 'uploaded' : 'missing',
    operating_authority: hasAuthority ? 'uploaded' : 'missing',
    mc_number: hasMC ? 'provided' : 'missing',
    dot_number: hasDOT ? 'provided' : 'missing',
    packet_complete: hasInsurance && hasW9 && hasAuthority && hasMC && hasDOT,
  };

  // Check expiry dates
  const insuranceDoc = docs.find(d => d.document_type === 'insurance_certificate');
  const medicalDoc = docs.find(d => d.document_type === 'medical_card');

  if (insuranceDoc?.expiry_date) {
    const expiry = new Date(insuranceDoc.expiry_date);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    packetStatus.insurance_expiry = insuranceDoc.expiry_date;
    packetStatus.insurance_days_until_expiry = daysUntilExpiry;
    packetStatus.insurance_expired = daysUntilExpiry < 0;
    if (daysUntilExpiry < 0) packetStatus.insurance_certificate = 'expired';
  }

  if (medicalDoc?.expiry_date) {
    const expiry = new Date(medicalDoc.expiry_date);
    const now = new Date();
    const daysUntilExpiry = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
    packetStatus.medical_card_expiry = medicalDoc.expiry_date;
    packetStatus.medical_card_days_until_expiry = daysUntilExpiry;
    packetStatus.medical_card_expired = daysUntilExpiry < 0;
    if (daysUntilExpiry < 0) packetStatus.medical_card = 'expired';
  }

  return new Response(JSON.stringify({
    ok: true,
    documents: docs,
    profile,
    packetStatus,
  }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// POST: Upload document or update profile
async function handlePost(req) {
  const user = await authenticateUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

  const body = await req.json();
  const { action } = body;

  // Update carrier profile (MC/DOT numbers)
  if (action === 'update_profile') {
    const { mc_number, dot_number, company_name, phone, email, address, city, state, zip,
            insurance_provider, insurance_policy_number, insurance_expiry, medical_card_expiry } = body;

    // Upsert carrier profile
    const profileData = {
      user_id: user.id,
      ...(mc_number !== undefined && { mc_number }),
      ...(dot_number !== undefined && { dot_number }),
      ...(company_name !== undefined && { company_name }),
      ...(phone !== undefined && { phone }),
      ...(email !== undefined && { email }),
      ...(address !== undefined && { address }),
      ...(city !== undefined && { city }),
      ...(state !== undefined && { state }),
      ...(zip !== undefined && { zip }),
      ...(insurance_provider !== undefined && { insurance_provider }),
      ...(insurance_policy_number !== undefined && { insurance_policy_number }),
      ...(insurance_expiry !== undefined && { insurance_expiry }),
      ...(medical_card_expiry !== undefined && { medical_card_expiry }),
      updated_at: new Date().toISOString(),
    };

    const existing = await supabaseRequest(`carrier_profiles?user_id=eq.${user.id}&limit=1`);
    let profile;
    if (existing.length) {
      profile = await supabaseRequest(`carrier_profiles?user_id=eq.${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify(profileData),
      });
    } else {
      profile = await supabaseRequest('carrier_profiles', {
        method: 'POST',
        body: JSON.stringify(profileData),
      });
    }

    return new Response(JSON.stringify({ ok: true, profile: profile[0] }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Register uploaded document (after frontend uploads to Supabase storage)
  if (action === 'register_document') {
    const { document_type, file_name, file_path, file_size, mime_type, expiry_date } = body;

    if (!document_type || !DOCUMENT_TYPES.includes(document_type)) {
      return new Response(JSON.stringify({ error: 'Invalid document type' }), { status: 400, headers: corsHeaders });
    }
    if (!file_path) {
      return new Response(JSON.stringify({ error: 'file_path is required' }), { status: 400, headers: corsHeaders });
    }

    // Remove old document of same type if exists
    await supabaseRequest(`carrier_documents?user_id=eq.${user.id}&document_type=eq.${document_type}`, {
      method: 'DELETE',
    }).catch(() => {});

    const doc = await supabaseRequest('carrier_documents', {
      method: 'POST',
      body: JSON.stringify({
        user_id: user.id,
        document_type,
        file_name: file_name || 'document.pdf',
        file_path,
        file_size: file_size || 0,
        mime_type: mime_type || 'application/pdf',
        expiry_date: expiry_date || null,
        is_expired: expiry_date ? new Date(expiry_date) < new Date() : false,
      }),
    });

    // Update packet completeness
    const allDocs = await supabaseRequest(`carrier_documents?user_id=eq.${user.id}`);
    const docTypes = allDocs.map(d => d.document_type);
    const profiles = await supabaseRequest(`carrier_profiles?user_id=eq.${user.id}&limit=1`);
    const hasAll = docTypes.includes('insurance_certificate') && docTypes.includes('w9_form') &&
                   docTypes.includes('operating_authority') && profiles[0]?.mc_number && profiles[0]?.dot_number;

    if (profiles.length) {
      await supabaseRequest(`carrier_profiles?user_id=eq.${user.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ packet_complete: hasAll, updated_at: new Date().toISOString() }),
      });
    }

    return new Response(JSON.stringify({ ok: true, document: doc[0], packet_complete: hasAll }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Check insurance validity (called before booking)
  if (action === 'check_insurance') {
    const result = await checkInsuranceValid(user.id);
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
}

// DELETE: Remove a document
async function handleDelete(req, url) {
  const user = await authenticateUser(req);
  if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

  const docId = url.searchParams.get('id');
  if (!docId) return new Response(JSON.stringify({ error: 'Document ID required' }), { status: 400, headers: corsHeaders });

  // Verify ownership
  const docs = await supabaseRequest(`carrier_documents?id=eq.${docId}&user_id=eq.${user.id}&limit=1`);
  if (!docs.length) {
    return new Response(JSON.stringify({ error: 'Document not found' }), { status: 404, headers: corsHeaders });
  }

  // Delete from storage
  const doc = docs[0];
  try {
    await supabaseStorage(`object/carrier-documents/${doc.file_path}`, { method: 'DELETE' });
  } catch (e) {
    console.warn('Storage delete failed:', e.message);
  }

  // Delete from database
  await supabaseRequest(`carrier_documents?id=eq.${docId}`, { method: 'DELETE' });

  return new Response(JSON.stringify({ ok: true, deleted: docId }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    if (req.method === 'GET') return handleGet(req, url);
    if (req.method === 'POST') return handlePost(req);
    if (req.method === 'DELETE') return handleDelete(req, url);

    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  } catch (error) {
    console.error('Carrier documents error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
}
