// api/carrier-expiry-alerts.js — Carrier Document Expiry Alert System
// Cron job: runs weekly (Monday 8am) to check for expiring documents
// Sends email alerts at 30 days and email+SMS at 7 days before expiry
// Locks booking if insurance is expired

export const config = { runtime: 'edge' };

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH = process.env.TWILIO_AUTH_TOKEN;
const TWILIO_PHONE = process.env.TWILIO_PHONE_NUMBER;
const CRON_SECRET = process.env.CRON_SECRET;

function isAuthorized(req) {
  const auth = req.headers.get('authorization');
  return auth === `Bearer ${CRON_SECRET}` || auth === `Bearer ${SUPABASE_KEY}`;
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
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase error: ${err}`);
  }
  return res.json();
}

async function sendEmail(to, subject, html) {
  if (!RESEND_API_KEY) return { ok: false, error: 'No Resend API key' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Qivori Alerts <alerts@qivori.com>',
      to,
      subject,
      html,
    }),
  });
  return res.json();
}

async function sendSMS(to, body) {
  if (!TWILIO_SID || !TWILIO_AUTH) return { ok: false, error: 'No Twilio credentials' };
  const params = new URLSearchParams({ To: to, From: TWILIO_PHONE, Body: body });
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${TWILIO_SID}:${TWILIO_AUTH}`),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  return res.json();
}

function generateExpiryEmailHTML(carrierName, docType, daysLeft, expiryDate) {
  const docNames = {
    insurance_certificate: 'Insurance Certificate',
    medical_card: 'Medical Card',
    operating_authority: 'Operating Authority',
    w9_form: 'W9 Form',
  };
  const docName = docNames[docType] || docType;
  const urgency = daysLeft <= 7 ? 'URGENT' : 'REMINDER';
  const color = daysLeft <= 7 ? '#dc2626' : '#f59e0b';

  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1a1a2e; padding: 20px; text-align: center;">
        <h1 style="color: #00d4ff; margin: 0;">QIVORI</h1>
      </div>
      <div style="padding: 30px; background: #f8f9fa;">
        <div style="background: ${color}; color: white; padding: 10px 20px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
          <strong>${urgency}: Document Expiring ${daysLeft <= 0 ? 'EXPIRED' : 'in ' + daysLeft + ' days'}</strong>
        </div>
        <p>Hi ${carrierName || 'Carrier'},</p>
        <p>Your <strong>${docName}</strong> ${daysLeft <= 0 ? 'has expired' : 'will expire on <strong>' + new Date(expiryDate).toLocaleDateString() + '</strong>'}.</p>
        ${daysLeft <= 0 ? '<p style="color: #dc2626; font-weight: bold;">Your account has been restricted from booking loads until this document is updated.</p>' : ''}
        ${daysLeft <= 7 && daysLeft > 0 ? '<p style="color: #dc2626;">If not updated within ' + daysLeft + ' days, your booking ability will be suspended.</p>' : ''}
        <p>Please log in to your Qivori account and upload an updated document:</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="https://qivori.com/settings/company" style="background: #00d4ff; color: #1a1a2e; padding: 12px 30px; text-decoration: none; border-radius: 8px; font-weight: bold;">Update Documents</a>
        </div>
        <p style="color: #666; font-size: 12px;">Need help? Contact support@qivori.com</p>
      </div>
    </div>
  `;
}

export default async function handler(req) {
  if (!isAuthorized(req)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Get all documents with expiry dates
    const docs = await supabaseRequest(
      `carrier_documents?expiry_date=not.is.null&select=*,carrier_profiles!inner(user_id,company_name)&order=expiry_date.asc`
    ).catch(() => []);

    // Fallback: get docs without join if the above fails
    let documents = docs;
    if (!Array.isArray(docs) || docs.length === 0) {
      documents = await supabaseRequest(
        `carrier_documents?expiry_date=not.is.null&order=expiry_date.asc`
      ).catch(() => []);
    }

    let alertsSent = { email_30d: 0, email_7d: 0, sms_7d: 0, expired_locked: 0 };

    for (const doc of documents) {
      const expiryDate = new Date(doc.expiry_date);
      const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

      // Get user profile for name and contact info
      let profile = doc.carrier_profiles;
      if (!profile) {
        const profiles = await supabaseRequest(`carrier_profiles?user_id=eq.${doc.user_id}&limit=1`).catch(() => []);
        profile = profiles[0] || {};
      }

      // Get user's email and phone from auth
      let userEmail, userPhone;
      try {
        const userRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${doc.user_id}`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
        });
        if (userRes.ok) {
          const userData = await userRes.json();
          userEmail = userData.email;
          userPhone = userData.phone || profile?.phone;
        }
      } catch (e) {
        console.warn('Could not fetch user:', e.message);
        userEmail = profile?.email;
        userPhone = profile?.phone;
      }

      if (!userEmail) continue;

      const carrierName = profile?.company_name || 'Carrier';

      // 30-day alert (email only)
      if (daysUntilExpiry <= 30 && daysUntilExpiry > 7 && !doc.expiry_alert_30d_sent) {
        const html = generateExpiryEmailHTML(carrierName, doc.document_type, daysUntilExpiry, doc.expiry_date);
        await sendEmail(userEmail, `[Qivori] Your ${doc.document_type === 'insurance_certificate' ? 'Insurance' : 'Document'} expires in ${daysUntilExpiry} days`, html);

        await supabaseRequest(`carrier_documents?id=eq.${doc.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ expiry_alert_30d_sent: true }),
        });
        alertsSent.email_30d++;
      }

      // 7-day alert (email + SMS)
      if (daysUntilExpiry <= 7 && daysUntilExpiry > 0 && !doc.expiry_alert_7d_sent) {
        const html = generateExpiryEmailHTML(carrierName, doc.document_type, daysUntilExpiry, doc.expiry_date);
        await sendEmail(userEmail, `URGENT: Your ${doc.document_type === 'insurance_certificate' ? 'Insurance' : 'Document'} expires in ${daysUntilExpiry} days!`, html);

        if (userPhone) {
          await sendSMS(userPhone, `[Qivori URGENT] Your ${doc.document_type === 'insurance_certificate' ? 'insurance certificate' : 'carrier document'} expires in ${daysUntilExpiry} days. Update now at qivori.com/settings/company to avoid booking restrictions.`);
          alertsSent.sms_7d++;
        }

        await supabaseRequest(`carrier_documents?id=eq.${doc.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ expiry_alert_7d_sent: true }),
        });
        alertsSent.email_7d++;
      }

      // Expired — mark as expired and lock booking
      if (daysUntilExpiry <= 0 && !doc.is_expired) {
        await supabaseRequest(`carrier_documents?id=eq.${doc.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ is_expired: true }),
        });

        // Send expired notification
        const html = generateExpiryEmailHTML(carrierName, doc.document_type, daysUntilExpiry, doc.expiry_date);
        await sendEmail(userEmail, `[Qivori] EXPIRED: Your ${doc.document_type === 'insurance_certificate' ? 'Insurance' : 'Document'} has expired — Booking Locked`, html);

        if (userPhone) {
          await sendSMS(userPhone, `[Qivori] Your ${doc.document_type === 'insurance_certificate' ? 'insurance' : 'carrier document'} has EXPIRED. Load booking is locked until updated. Go to qivori.com/settings/company`);
        }

        // Update carrier profile packet status
        if (doc.document_type === 'insurance_certificate') {
          await supabaseRequest(`carrier_profiles?user_id=eq.${doc.user_id}`, {
            method: 'PATCH',
            body: JSON.stringify({ packet_complete: false, updated_at: new Date().toISOString() }),
          }).catch(() => {});
        }

        alertsSent.expired_locked++;
      }
    }

    // Reset alert flags for documents that have been renewed (new expiry date in future)
    const renewedDocs = await supabaseRequest(
      `carrier_documents?is_expired=eq.true&expiry_date=gt.${now.toISOString()}`
    ).catch(() => []);

    for (const doc of renewedDocs) {
      await supabaseRequest(`carrier_documents?id=eq.${doc.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          is_expired: false,
          expiry_alert_30d_sent: false,
          expiry_alert_7d_sent: false,
        }),
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      message: 'Expiry alerts processed',
      stats: alertsSent,
      documentsChecked: documents.length,
      renewedDocs: renewedDocs.length,
      timestamp: now.toISOString(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Carrier expiry alerts error:', error);
    return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  }
}
