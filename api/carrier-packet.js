// api/carrier-packet.js — Carrier Packet Compiler & Sender
// Compiles carrier documents into a packet email and sends to broker
// Called after load is booked via AI caller or manual booking

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

async function sendEmail(to, subject, html, attachments = []) {
  if (!RESEND_API_KEY) throw new Error('No Resend API key configured');
  const payload = {
    from: 'Qivori Dispatch <dispatch@qivori.com>',
    to,
    subject,
    html,
  };
  if (attachments.length > 0) {
    payload.attachments = attachments;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// Get download URL for a storage file
async function getDocumentUrl(filePath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/carrier-documents/${filePath}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn: 86400 }), // 24 hour signed URL
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data.signedURL ? `${SUPABASE_URL}/storage/v1${data.signedURL}` : null;
}

// Download file content as base64 for email attachment
async function getDocumentBase64(filePath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/carrier-documents/${filePath}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
    },
  });
  if (!res.ok) return null;
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function generatePacketEmailHTML(data) {
  const { carrierName, mcNumber, dotNumber, origin, destination, rate, brokerName, confirmationNumber, documents } = data;

  const docRows = documents.map(doc => {
    const docNames = {
      insurance_certificate: 'Insurance Certificate',
      w9_form: 'W9 Form',
      operating_authority: 'Operating Authority',
      medical_card: 'Medical Card',
    };
    return `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">${docNames[doc.document_type] || doc.document_type}</td><td style="padding: 8px; border-bottom: 1px solid #eee; color: #22c55e;">Attached</td></tr>`;
  }).join('');

  return `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
      <div style="background: #1a1a2e; padding: 20px; text-align: center;">
        <h1 style="color: #00d4ff; margin: 0;">QIVORI</h1>
        <p style="color: #ccc; margin: 5px 0 0;">Carrier Packet</p>
      </div>
      <div style="padding: 30px; background: #ffffff;">
        <h2 style="color: #1a1a2e; border-bottom: 2px solid #00d4ff; padding-bottom: 10px;">Carrier Information</h2>
        <table style="width: 100%; margin-bottom: 20px;">
          <tr><td style="padding: 5px 0; color: #666;">Carrier Name:</td><td style="font-weight: bold;">${carrierName || 'N/A'}</td></tr>
          <tr><td style="padding: 5px 0; color: #666;">MC Number:</td><td style="font-weight: bold;">${mcNumber || 'N/A'}</td></tr>
          <tr><td style="padding: 5px 0; color: #666;">DOT Number:</td><td style="font-weight: bold;">${dotNumber || 'N/A'}</td></tr>
        </table>

        ${confirmationNumber ? `<h2 style="color: #1a1a2e; border-bottom: 2px solid #00d4ff; padding-bottom: 10px;">Load Details</h2>
        <table style="width: 100%; margin-bottom: 20px;">
          <tr><td style="padding: 5px 0; color: #666;">Confirmation #:</td><td style="font-weight: bold;">${confirmationNumber}</td></tr>
          <tr><td style="padding: 5px 0; color: #666;">Route:</td><td style="font-weight: bold;">${origin} → ${destination}</td></tr>
          <tr><td style="padding: 5px 0; color: #666;">Agreed Rate:</td><td style="font-weight: bold; color: #22c55e;">$${Number(rate).toLocaleString()}</td></tr>
        </table>` : ''}

        <h2 style="color: #1a1a2e; border-bottom: 2px solid #00d4ff; padding-bottom: 10px;">Documents Included</h2>
        <table style="width: 100%; margin-bottom: 20px;">
          <tr style="background: #f3f4f6;"><th style="padding: 8px; text-align: left;">Document</th><th style="padding: 8px; text-align: left;">Status</th></tr>
          ${docRows}
        </table>

        <p style="color: #666; font-size: 13px;">All documents are attached to this email as PDF files. Please review and confirm receipt.</p>
        <p style="color: #666; font-size: 13px;">This carrier packet was sent automatically by Qivori Dispatch on behalf of ${carrierName || 'the carrier'}.</p>
      </div>
      <div style="background: #f3f4f6; padding: 15px; text-align: center; color: #999; font-size: 12px;">
        Powered by Qivori — AI-Powered Freight Intelligence
      </div>
    </div>
  `;
}

// Authenticate user from JWT token
async function authenticateUser(req) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.split(' ')[1];
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch { return null; }
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // Send carrier packet to broker
    if (action === 'send_packet') {
      // Can be called from frontend (with auth) or from rate-confirm (with service key)
      const authHeader = req.headers.get('Authorization');
      let userId = body.user_id;

      if (!userId) {
        const user = await authenticateUser(req);
        if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });
        userId = user.id;
      } else if (authHeader !== `Bearer ${SUPABASE_KEY}`) {
        return new Response(JSON.stringify({ error: 'Unauthorized for service calls' }), { status: 401, headers: corsHeaders });
      }

      const { broker_email, broker_name, load_id, rate_confirmation_id, origin, destination, rate, confirmation_number } = body;

      if (!broker_email) {
        return new Response(JSON.stringify({ error: 'broker_email is required' }), { status: 400, headers: corsHeaders });
      }

      // Get carrier profile
      const profiles = await supabaseRequest(`carrier_profiles?user_id=eq.${userId}&limit=1`);
      const profile = profiles[0];
      if (!profile) {
        return new Response(JSON.stringify({ error: 'Carrier profile not found. Please complete your company profile first.' }), { status: 400, headers: corsHeaders });
      }

      // Get carrier documents
      const docs = await supabaseRequest(`carrier_documents?user_id=eq.${userId}&order=document_type.asc`);
      if (!docs.length) {
        return new Response(JSON.stringify({ error: 'No carrier documents uploaded. Please upload your insurance, W9, and operating authority.' }), { status: 400, headers: corsHeaders });
      }

      // Download documents as attachments
      const attachments = [];
      for (const doc of docs) {
        try {
          const base64Content = await getDocumentBase64(doc.file_path);
          if (base64Content) {
            const docNames = {
              insurance_certificate: 'Insurance_Certificate',
              w9_form: 'W9_Form',
              operating_authority: 'Operating_Authority',
              medical_card: 'Medical_Card',
            };
            attachments.push({
              filename: `${docNames[doc.document_type] || doc.document_type}_${profile.company_name?.replace(/\s/g, '_') || 'carrier'}.pdf`,
              content: base64Content,
            });
          }
        } catch (e) {
          console.warn(`Failed to attach ${doc.document_type}:`, e.message);
        }
      }

      // Generate and send email
      const emailHTML = generatePacketEmailHTML({
        carrierName: profile.company_name,
        mcNumber: profile.mc_number,
        dotNumber: profile.dot_number,
        origin,
        destination,
        rate,
        brokerName: broker_name,
        confirmationNumber: confirmation_number,
        documents: docs,
      });

      const emailResult = await sendEmail(
        broker_email,
        `Carrier Packet — ${profile.company_name || 'Carrier'} | MC# ${profile.mc_number || 'N/A'}${confirmation_number ? ` | Conf# ${confirmation_number}` : ''}`,
        emailHTML,
        attachments
      );

      // Log the submission
      await supabaseRequest('carrier_packet_submissions', {
        method: 'POST',
        body: JSON.stringify({
          user_id: userId,
          broker_name: broker_name || null,
          broker_email,
          load_id: load_id || null,
          rate_confirmation_id: rate_confirmation_id || null,
          documents_included: docs.map(d => ({ type: d.document_type, name: d.file_name })),
          submitted_via: 'email',
          status: emailResult.id ? 'sent' : 'failed',
        }),
      });

      // Update carrier profile last compiled timestamp
      await supabaseRequest(`carrier_profiles?user_id=eq.${userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ packet_last_compiled_at: new Date().toISOString() }),
      }).catch(() => {});

      return new Response(JSON.stringify({
        ok: true,
        message: 'Carrier packet sent to broker',
        emailSent: !!emailResult.id,
        attachmentCount: attachments.length,
        documentsIncluded: docs.map(d => d.document_type),
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get packet status / preview
    if (action === 'get_status') {
      const user = await authenticateUser(req);
      if (!user) return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders });

      const profiles = await supabaseRequest(`carrier_profiles?user_id=eq.${user.id}&limit=1`);
      const docs = await supabaseRequest(`carrier_documents?user_id=eq.${user.id}`);
      const submissions = await supabaseRequest(`carrier_packet_submissions?user_id=eq.${user.id}&order=submitted_at.desc&limit=10`);

      const profile = profiles[0] || {};
      const docTypes = docs.map(d => d.document_type);

      return new Response(JSON.stringify({
        ok: true,
        profile,
        documents: docs,
        submissions,
        status: {
          insurance_certificate: docTypes.includes('insurance_certificate') ? 'uploaded' : 'missing',
          w9_form: docTypes.includes('w9_form') ? 'uploaded' : 'missing',
          operating_authority: docTypes.includes('operating_authority') ? 'uploaded' : 'missing',
          mc_number: profile.mc_number ? 'provided' : 'missing',
          dot_number: profile.dot_number ? 'provided' : 'missing',
          packet_complete: profile.packet_complete || false,
          last_sent: submissions[0]?.submitted_at || null,
        },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error('Carrier packet error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500, headers: corsHeaders });
  }
}
