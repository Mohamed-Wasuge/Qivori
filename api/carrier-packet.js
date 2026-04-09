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

async function sendEmail(to, subject, html, attachments = [], from, replyTo) {
  if (!RESEND_API_KEY) throw new Error('No Resend API key configured');
  if (!from) throw new Error('Sender identity is required — must come from carrier company, never Qivori');
  const payload = {
    from,
    to,
    subject,
    html,
  };
  if (replyTo) payload.reply_to = replyTo;
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

// Bucket name reconciled 2026-04-09: frontend uploads to 'documents' bucket
// (src/lib/storage.js BUCKET constant). The 'carrier-documents' bucket exists
// but is unused dead scaffolding from an earlier prototype.
const STORAGE_BUCKET = 'documents';

// Get download URL for a storage file
async function getDocumentUrl(filePath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/${STORAGE_BUCKET}/${filePath}`, {
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
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${STORAGE_BUCKET}/${filePath}`, {
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

// Generates the carrier packet HTML email body. Branding is intentionally
// the carrier's company name only — no Qivori references anywhere. Brokers
// must perceive this email as coming from the carrier directly.
function generatePacketEmailHTML(data) {
  const { carrierName, mcNumber, dotNumber, carrierEmail, carrierPhone, origin, destination, rate, brokerName, confirmationNumber, documents } = data;

  const docRows = documents.map(doc => {
    const docNames = {
      insurance_certificate: 'Insurance Certificate',
      w9_form: 'W9 Form',
      operating_authority: 'Operating Authority',
      medical_card: 'Medical Card',
      boc3_form: 'BOC-3 Process Agent',
      drug_alcohol_policy: 'Drug & Alcohol Policy',
    };
    return `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;">${docNames[doc.document_type] || doc.document_type}</td><td style="padding: 8px; border-bottom: 1px solid #eee; color: #22c55e;">Attached</td></tr>`;
  }).join('');

  const safeName = carrierName || 'Our Carrier';
  const greeting = brokerName ? `Hi ${brokerName},` : 'Hello,';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto;">
      <div style="background: #1f2937; padding: 24px 20px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px; letter-spacing: 1px;">${safeName.toUpperCase()}</h1>
        <p style="color: #9ca3af; margin: 6px 0 0; font-size: 13px;">Carrier Packet</p>
      </div>
      <div style="padding: 30px; background: #ffffff;">
        <p style="font-size: 14px; color: #1f2937;">${greeting}</p>
        <p style="font-size: 14px; color: #1f2937;">Please find our carrier packet attached. All required documents are included as PDFs. Reply to this email if you need anything additional.</p>

        <h2 style="color: #1f2937; border-bottom: 2px solid #1f2937; padding-bottom: 10px; margin-top: 28px; font-size: 16px;">Carrier Information</h2>
        <table style="width: 100%; margin-bottom: 20px; font-size: 14px;">
          <tr><td style="padding: 5px 0; color: #6b7280;">Carrier Name:</td><td style="font-weight: bold; color: #1f2937;">${safeName}</td></tr>
          <tr><td style="padding: 5px 0; color: #6b7280;">MC Number:</td><td style="font-weight: bold; color: #1f2937;">${mcNumber || 'N/A'}</td></tr>
          <tr><td style="padding: 5px 0; color: #6b7280;">DOT Number:</td><td style="font-weight: bold; color: #1f2937;">${dotNumber || 'N/A'}</td></tr>
          ${carrierEmail ? `<tr><td style="padding: 5px 0; color: #6b7280;">Dispatch Email:</td><td style="font-weight: bold; color: #1f2937;">${carrierEmail}</td></tr>` : ''}
          ${carrierPhone ? `<tr><td style="padding: 5px 0; color: #6b7280;">Dispatch Phone:</td><td style="font-weight: bold; color: #1f2937;">${carrierPhone}</td></tr>` : ''}
        </table>

        ${confirmationNumber ? `<h2 style="color: #1f2937; border-bottom: 2px solid #1f2937; padding-bottom: 10px; font-size: 16px;">Load Details</h2>
        <table style="width: 100%; margin-bottom: 20px; font-size: 14px;">
          <tr><td style="padding: 5px 0; color: #6b7280;">Confirmation #:</td><td style="font-weight: bold; color: #1f2937;">${confirmationNumber}</td></tr>
          <tr><td style="padding: 5px 0; color: #6b7280;">Route:</td><td style="font-weight: bold; color: #1f2937;">${origin} → ${destination}</td></tr>
          <tr><td style="padding: 5px 0; color: #6b7280;">Agreed Rate:</td><td style="font-weight: bold; color: #16a34a;">$${Number(rate).toLocaleString()}</td></tr>
        </table>` : ''}

        <h2 style="color: #1f2937; border-bottom: 2px solid #1f2937; padding-bottom: 10px; font-size: 16px;">Documents Attached</h2>
        <table style="width: 100%; margin-bottom: 20px; font-size: 14px;">
          <tr style="background: #f3f4f6;"><th style="padding: 8px; text-align: left;">Document</th><th style="padding: 8px; text-align: left;">Status</th></tr>
          ${docRows}
        </table>

        <p style="color: #1f2937; font-size: 14px; margin-top: 24px;">Thanks,<br/><strong>${safeName}</strong></p>
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

      // ── Resolve carrier identity ──
      // Read both possible profile sources. `companies` is populated at signup
      // (canonical), `carrier_profiles` is the legacy AI-caller schema. Prefer
      // `companies` for name/MC/DOT/email/phone since it's the table users
      // actually edit in Settings → Company. Fall back to carrier_profiles if
      // a field is missing. Email is critical — without it we cannot construct
      // a sender identity, and refusing to send is safer than leaking Qivori.
      const [companies, profiles] = await Promise.all([
        supabaseRequest(`companies?owner_id=eq.${userId}&limit=1`).catch(() => []),
        supabaseRequest(`carrier_profiles?user_id=eq.${userId}&limit=1`).catch(() => []),
      ]);
      const company = companies[0] || {};
      const profile = profiles[0] || {};

      const carrierName = company.name || profile.company_name || null;
      const carrierEmail = company.email || null;
      const carrierMc = company.mc_number || profile.mc_number || null;
      const carrierDot = company.dot_number || profile.dot_number || null;
      const carrierPhone = company.phone || null;

      if (!carrierName) {
        return new Response(JSON.stringify({ error: 'Carrier company name not found. Complete Settings → Company first.' }), { status: 400, headers: corsHeaders });
      }
      if (!carrierEmail) {
        return new Response(JSON.stringify({ error: 'Carrier dispatch email not found. Add it under Settings → Company before sending packets.' }), { status: 400, headers: corsHeaders });
      }

      // Get carrier documents
      const docs = await supabaseRequest(`carrier_documents?user_id=eq.${userId}&order=document_type.asc`);
      if (!docs.length) {
        return new Response(JSON.stringify({ error: 'No carrier documents uploaded. Upload your W9, insurance, and operating authority in Settings → Carrier Package.' }), { status: 400, headers: corsHeaders });
      }

      // Download documents as attachments
      const safeFilenameBase = carrierName.replace(/\s+/g, '_');
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
              boc3_form: 'BOC3_Form',
              drug_alcohol_policy: 'Drug_Alcohol_Policy',
            };
            attachments.push({
              filename: `${docNames[doc.document_type] || doc.document_type}_${safeFilenameBase}.pdf`,
              content: base64Content,
            });
          }
        } catch (e) {
          console.warn(`Failed to attach ${doc.document_type}:`, e.message);
        }
      }

      // Generate and send email — From / Reply-To are the carrier identity.
      // No Qivori references anywhere in the headers or body.
      const emailHTML = generatePacketEmailHTML({
        carrierName,
        mcNumber: carrierMc,
        dotNumber: carrierDot,
        carrierEmail,
        carrierPhone,
        origin,
        destination,
        rate,
        brokerName: broker_name,
        confirmationNumber: confirmation_number,
        documents: docs,
      });

      const fromHeader = `${carrierName} <${carrierEmail}>`;
      const emailResult = await sendEmail(
        broker_email,
        `Carrier Packet — ${carrierName} | MC# ${carrierMc || 'N/A'}${confirmation_number ? ` | Conf# ${confirmation_number}` : ''}`,
        emailHTML,
        attachments,
        fromHeader,
        carrierEmail
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
