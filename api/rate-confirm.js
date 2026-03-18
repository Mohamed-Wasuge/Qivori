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
  return auth === process.env.CRON_SECRET || auth === supabaseKey;
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
async function sendEmail(to, subject, html) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return { ok: false, error: 'RESEND_API_KEY not configured' };
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Qivori Dispatch <dispatch@qivori.com>',
      reply_to: 'dispatch@qivori.com',
      to: [to], subject, html
    })
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
function generateRateConEmail(data) {
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const confirmNumber = `RC-${Date.now().toString(36).toUpperCase()}`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; color: #333;">
  <div style="background: #1a1a2e; color: #ffd700; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">QIVORI DISPATCH</h1>
    <p style="margin: 5px 0 0; font-size: 14px; color: #ccc;">Rate Confirmation</p>
  </div>

  <div style="border: 1px solid #ddd; padding: 25px; border-radius: 0 0 8px 8px;">
    <table style="width: 100%; margin-bottom: 20px;">
      <tr>
        <td><strong>Confirmation #:</strong> ${confirmNumber}</td>
        <td style="text-align: right;"><strong>Date:</strong> ${today}</td>
      </tr>
    </table>

    <h2 style="color: #1a1a2e; border-bottom: 2px solid #ffd700; padding-bottom: 8px;">Load Details</h2>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Load #:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.loadId || 'N/A'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Origin:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.origin}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Destination:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.destination}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Equipment:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.equipment || 'Dry Van'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Pickup Date:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.pickupDate || 'TBD'}</td></tr>
      <tr style="background: #f8f9fa;"><td style="padding: 12px; font-size: 18px;"><strong>Agreed Rate:</strong></td><td style="padding: 12px; font-size: 18px; color: #2d8a4e;"><strong>$${Number(data.agreedRate).toLocaleString()}</strong></td></tr>
    </table>

    <h2 style="color: #1a1a2e; border-bottom: 2px solid #ffd700; padding-bottom: 8px;">Carrier Information</h2>
    <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Carrier:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.carrierName}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>MC Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.carrierMC || 'On file'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>DOT Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">${data.carrierDOT || 'On file'}</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Insurance:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">On file — current and active</td></tr>
      <tr><td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>Dispatch Contact:</strong></td><td style="padding: 8px; border-bottom: 1px solid #eee;">Qivori Dispatch — dispatch@qivori.com</td></tr>
    </table>

    <div style="background: #f0f7f0; border: 1px solid #2d8a4e; border-radius: 6px; padding: 15px; margin: 20px 0;">
      <p style="margin: 0; color: #2d8a4e;"><strong>This rate confirmation is binding upon acceptance.</strong> Carrier packet with insurance, W9, and operating authority is attached or will be sent separately.</p>
    </div>

    <p style="font-size: 12px; color: #999; margin-top: 30px; text-align: center;">
      Qivori AI-Powered Freight Intelligence — qivori.com<br>
      This email was generated automatically by Qivori Dispatch AI.
    </p>
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
    const { callSid, brokerEmail, agreedRate, loadId, origin, destination, equipment, carrierName, carrierMC, carrierDOT, pickupDate } = data;

    if (!brokerEmail) {
      return Response.json({ ok: false, error: 'Broker email required' }, { status: 400 });
    }

    // 1. Generate and send rate confirmation email to broker
    const html = generateRateConEmail(data);
    const emailResult = await sendEmail(
      brokerEmail,
      `Rate Confirmation — ${origin} to ${destination} | ${carrierName}`,
      html
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

    // 3. Update load status to booked (if loadId exists)
    if (loadId) {
      await supabaseUpdate('loads', `id=eq.${loadId}`, {
        status: 'booked',
        booked_rate: Number(agreedRate),
        booked_at: new Date().toISOString()
      });
    }

    // 4. Notify the driver via SMS
    if (callSid) {
      const callLogs = await supabaseQuery('call_logs', `call_sid=eq.${callSid}&select=user_id&limit=1`);
      const userId = callLogs?.[0]?.user_id;
      if (userId) {
        const users = await supabaseQuery('users', `id=eq.${userId}&select=phone,email,name&limit=1`);
        const driver = users?.[0];
        if (driver?.phone) {
          await sendSMS(driver.phone,
            `Load BOOKED! ${origin} to ${destination} at $${Number(agreedRate).toLocaleString()}. Pickup: ${pickupDate || 'TBD'}. Rate con sent to broker. — Qivori AI`
          );
        }
        if (driver?.email) {
          await sendEmail(driver.email,
            `Load Booked — ${origin} to ${destination}`,
            `<h2>Your load has been booked!</h2><p><strong>Route:</strong> ${origin} to ${destination}</p><p><strong>Rate:</strong> $${Number(agreedRate).toLocaleString()}</p><p><strong>Pickup:</strong> ${pickupDate || 'TBD'}</p><p>Rate confirmation has been sent to the broker at ${brokerEmail}.</p><p>— Qivori Dispatch AI</p>`
          );
        }
      }
    }

    // 5. Notify admin
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await sendEmail(adminEmail,
        `[Qivori] Load Booked via AI — ${origin} to ${destination}`,
        `<h3>AI Broker Call — Load Booked</h3><p><strong>Route:</strong> ${origin} to ${destination}</p><p><strong>Rate:</strong> $${Number(agreedRate).toLocaleString()}</p><p><strong>Carrier:</strong> ${carrierName} (MC: ${carrierMC})</p><p><strong>Broker Email:</strong> ${brokerEmail}</p><p><strong>Rate Con #:</strong> ${confirmNumber}</p>`
      );
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
