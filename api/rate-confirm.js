/**
 * Rate Confirmation — Auto-generate and email rate con + carrier packet to broker
 * Triggered after AI caller successfully books a load
 * Sends professional HTML email with load details, carrier info, and rate agreement
 * Updates load status to 'booked', notifies driver via SMS/email
 * Runtime: Vercel Edge
 */

export const config = { runtime: 'edge' };

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

function isAuthorized(req) {
  const auth = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!auth) return false;
  return (process.env.CRON_SECRET && auth === process.env.CRON_SECRET) || (supabaseKey && auth === supabaseKey);
}

// — Supabase helpers —
async function supabaseQuery(table, query = '') {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` }
  });
  return res.json();
}

async function supabaseInsert(table, data) {
  const res = await fetch(`${supabaseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json', 'Prefer': 'return=representation'
    },
    body: JSON.stringify(data)
  });
  return res.json();
}

async function supabaseUpdate(table, query, data) {
  await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: {
      'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
}

// — Send email via Resend —
// `from` is REQUIRED — no default. We refuse to send anonymous mail to
// brokers, since "from Qivori Dispatch" leaks the platform identity.
// Internal sends (to admin) can pass the Qivori address explicitly.
async function sendEmail(to, subject, html, from, replyTo) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { ok: false, error: 'RESEND_API_KEY not configured' };
  if (!from) return { ok: false, error: 'sender identity required — never default to Qivori for outbound' };
  const payload = { from, to: [to], subject, html };
  if (replyTo) payload.reply_to = replyTo;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  return { ok: res.ok };
}

// — Send SMS via Twilio —
async function sendSMS(to, message) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return;

  let phone = to.replace(/[^\d+]/g, '');
  if (/^\d{10}$/.test(phone)) phone = '+1' + phone;

  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${sid}:${token}`),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ To: phone, From: from, Body: message }).toString()
  });
}

// — Generate rate confirmation HTML email —
// Branding is the carrier's company name only — no Qivori references anywhere.
// Brokers must perceive this email as coming from the carrier directly.
function generateRateConEmail(data) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const confirmNumber = `RC-${Date.now().toString(36).toUpperCase()}`;
  const safeName = data.carrierName || 'Our Carrier';

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: #1f2937; color: #ffffff; padding: 24px 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 22px; letter-spacing: 1px;">${safeName.toUpperCase()}</h1>
    <p style="margin: 6px 0 0; font-size: 13px; color: #9ca3af;">Rate Confirmation</p>
  </div>

  <div style="border: 1px solid #ddd; padding: 25px; border-radius: 0 0 8px 8px;">
    <table style="width: 100%; margin-bottom: 20px;">
      <tr>
        <td><strong>Confirmation #:</strong> ${confirmNumber}</td>
        <td style="text-align: right;"><strong>Date:</strong> ${today}</td>
      </tr>
    </table>

    <h2 style="color: #1f2937; border-bottom: 2px solid #1f2937; padding-bottom: 8px;">Load Details</h2>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Load #:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.loadId || 'N/A'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Origin:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.origin}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Destination:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.destination}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Equipment:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.equipment || 'Dry Van'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Pickup Date:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.pickupDate || 'TBD'}</td></tr>
      <tr style="background: #f8f9fa;"><td style="padding: 12px; font-size: 18px;"><strong>Agreed Rate:</strong></td><td style="padding: 12px; font-size: 18px; color: #16a34a;"><strong>$${Number(data.agreedRate).toLocaleString()}</strong></td></tr>
    </table>

    <h2 style="color: #1f2937; border-bottom: 2px solid #1f2937; padding-bottom: 8px;">Carrier Information</h2>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Carrier:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safeName}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>MC Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.carrierMC || 'On file'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>DOT Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.carrierDOT || 'On file'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Insurance:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">On file — current and active</td></tr>
      ${data.carrierEmail ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Dispatch Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.carrierEmail}</td></tr>` : ''}
      ${data.carrierPhone ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Dispatch Phone:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.carrierPhone}</td></tr>` : ''}
    </table>

    <div style="background: #f0f7f0; border: 1px solid #16a34a; border-radius: 6px; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #16a34a;"><strong>This rate confirmation is binding upon acceptance.</strong> Carrier packet with insurance, W9, and operating authority is attached or will be sent separately.</p>
    </div>

    <p style="color: #1f2937; font-size: 14px; margin-top: 24px;">Thanks,<br/><strong>${safeName}</strong></p>
  </div>
</body>
</html>`;
}

// — Main handler —
export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' }
    });
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  if (!isAuthorized(req)) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const data = await req.json();
    const { callSid, brokerEmail, agreedRate, loadId, origin, destination, equipment, pickupDate } = data;
    let { carrierName, carrierMC, carrierDOT } = data;
    let carrierEmail = data.carrierEmail || null;
    let carrierPhone = data.carrierPhone || null;

    if (!brokerEmail) {
      return Response.json({ ok: false, error: 'Broker email required' }, { status: 400 });
    }

    // ── Resolve carrier identity from companies table ──
    // Priority: explicit body fields → call_logs → companies table.
    // We MUST have carrierName + carrierEmail before sending any broker
    // email. Refuse to send if missing — fail-closed protects identity.
    let resolvedUserId = data.user_id || null;
    if (!resolvedUserId && callSid) {
      const callLogs = await supabaseQuery('call_logs', `call_sid=eq.${callSid}&select=user_id&limit=1`);
      resolvedUserId = callLogs?.[0]?.user_id || null;
    }
    if (resolvedUserId) {
      const companies = await supabaseQuery('companies', `owner_id=eq.${resolvedUserId}&select=name,email,phone,mc_number,dot_number&limit=1`);
      const company = Array.isArray(companies) ? companies[0] : null;
      if (company) {
        carrierName = carrierName || company.name || null;
        carrierEmail = carrierEmail || company.email || null;
        carrierPhone = carrierPhone || company.phone || null;
        carrierMC = carrierMC || company.mc_number || null;
        carrierDOT = carrierDOT || company.dot_number || null;
      }
    }

    if (!carrierName || !carrierEmail) {
      return Response.json({
        ok: false,
        error: 'Carrier identity not found. Need carrierName + carrierEmail in body, or a callSid that links to a user with a populated companies row.'
      }, { status: 400 });
    }

    // 1. Generate and send rate confirmation email to broker
    // From + Reply-To use the carrier identity — never Qivori.
    const html = generateRateConEmail({ ...data, carrierName, carrierMC, carrierDOT, carrierEmail, carrierPhone });
    const fromHeader = `${carrierName} <${carrierEmail}>`;
    const emailResult = await sendEmail(
      brokerEmail,
      `Rate Confirmation — ${origin} to ${destination} | ${carrierName}`,
      html,
      fromHeader,
      carrierEmail
    );

    // 2. Store rate confirmation record
    const confirmNumber = `RC-${Date.now().toString(36).toUpperCase()}`;
    await supabaseInsert('rate_confirmations', {
      confirmation_number: confirmNumber,
      call_sid: callSid || null,
      load_id: loadId || null,
      broker_email: brokerEmail,
      carrier_name: carrierName,
      carrier_mc: carrierMC,
      carrier_dot: carrierDOT,
      origin, destination, equipment,
      agreed_rate: Number(agreedRate),
      pickup_date: pickupDate,
      email_sent: emailResult.ok,
      created_at: new Date().toISOString()
    });

    // 3. Update load status to Rate Con Received (if loadId exists)
    // 'Rate Con Received' is the correct schema enum value — 'booked' is not valid.
    if (loadId) {
      await supabaseUpdate('loads', `id=eq.${loadId}`, {
        status: 'Rate Con Received',
        gross_pay: Number(agreedRate),
        updated_at: new Date().toISOString()
      });
    }

    // 3b. Store rate con HTML to Supabase Storage + insert user_documents row
    // so the driver can find it in the mobile app under Documents → Rate Confirmations.
    if (resolvedUserId) {
      try {
        const storagePath = `rate-cons/${resolvedUserId}/${confirmNumber}.html`;
        const htmlBytes = new TextEncoder().encode(html);
        const storageRes = await fetch(`${supabaseUrl}/storage/v1/object/documents/${storagePath}`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'text/html',
            'x-upsert': 'true',
          },
          body: html,
        });
        if (storageRes.ok || storageRes.status === 200) {
          // Resolve load_number for the row (fetch from loads table if we have loadId)
          let loadNumber = null;
          if (loadId) {
            const loadRows = await supabaseQuery('loads', `id=eq.${loadId}&select=load_number&limit=1`);
            loadNumber = loadRows?.[0]?.load_number || null;
          }
          await supabaseInsert('user_documents', {
            owner_id: resolvedUserId,
            name: `Rate Con ${confirmNumber} — ${origin} to ${destination}`,
            category: 'rate_con',
            mime_type: 'text/html',
            storage_path: storagePath,
            size_bytes: htmlBytes.length,
            load_number: loadNumber,
            created_at: new Date().toISOString(),
          });
        }
      } catch (e) {
        // Non-fatal — rate con was already emailed, storage is best-effort
        console.warn('[rate-confirm] user_documents insert failed:', e.message);
      }
    }

    // 4. Notify the driver via SMS / email
    // Driver-facing notifications use the carrier identity (driver expects
    // mail from their own carrier, not from Qivori). The SMS body is also
    // signed with the carrier name instead of "— Qivori AI".
    if (resolvedUserId) {
      const users = await supabaseQuery('users', `id=eq.${resolvedUserId}&select=phone,email,name&limit=1`);
      const driver = users?.[0];
      if (driver?.phone) {
        await sendSMS(driver.phone,
          `Load BOOKED! ${origin} to ${destination} at $${Number(agreedRate).toLocaleString()}. Pickup: ${pickupDate || 'TBD'}. Rate con sent to broker. — ${carrierName}`
        );
      }
      if (driver?.email) {
        await sendEmail(driver.email,
          `Load Booked — ${origin} to ${destination}`,
          `<h2>Your load has been booked!</h2><p><strong>Route:</strong> ${origin} to ${destination}</p><p><strong>Rate:</strong> $${Number(agreedRate).toLocaleString()}</p><p><strong>Pickup:</strong> ${pickupDate || 'TBD'}</p><p>Rate confirmation has been sent to the broker at ${brokerEmail}.</p><p>— ${carrierName}</p>`,
          `${carrierName} <${carrierEmail}>`,
          carrierEmail
        );
      }
    }

    // 5. Notify admin (Qivori internal — keep Qivori From for ops visibility)
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await sendEmail(adminEmail,
        `[Qivori] Load Booked via AI — ${origin} to ${destination}`,
        `<h3>AI Broker Call — Load Booked</h3><p><strong>Route:</strong> ${origin} to ${destination}</p><p><strong>Rate:</strong> $${Number(agreedRate).toLocaleString()}</p><p><strong>Carrier:</strong> ${carrierName} (MC: ${carrierMC})</p><p><strong>Broker Email:</strong> ${brokerEmail}</p><p><strong>Rate Con #:</strong> ${confirmNumber}</p>`,
        'Qivori Internal <ops@qivori.com>',
        'ops@qivori.com'
      );
    }

    // 6. Auto-send carrier packet to broker (fulfills the "carrier packet
    //    will be sent separately" promise in the rate confirmation email).
    //    Server-to-server call to /api/carrier-packet with service-key auth
    //    and the resolved user_id. Non-fatal — if the packet send fails the
    //    rate confirmation already shipped, log a warning and move on.
    //    VERCEL_URL is auto-injected by Vercel into all serverless functions
    //    (deployment URL, no protocol). Falls back to qivori.com for local.
    if (resolvedUserId) {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : (process.env.PUBLIC_URL || 'https://qivori.com');
      try {
        const packetRes = await fetch(`${baseUrl}/api/carrier-packet`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseKey}`,
          },
          body: JSON.stringify({
            action: 'send_packet',
            user_id: resolvedUserId,
            broker_email: brokerEmail,
            broker_name: data.brokerName || null,
            load_id: loadId || null,
            rate_confirmation_id: confirmNumber,
            origin,
            destination,
            rate: Number(agreedRate),
            confirmation_number: confirmNumber,
          }),
        });
        if (!packetRes.ok) {
          const errText = await packetRes.text().catch(() => '');
          console.warn(`[rate-confirm] Auto carrier-packet send failed: ${packetRes.status} ${errText}`);
        }
      } catch (e) {
        console.warn('[rate-confirm] Auto carrier-packet send error:', e.message);
      }
    }

    return Response.json({
      ok: true,
      confirmationNumber: confirmNumber,
      emailSent: emailResult.ok,
      message: 'Rate confirmation sent to broker'
    });

  } catch (error) {
    console.error('Rate confirm error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
}
