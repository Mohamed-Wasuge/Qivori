import { corsHeaders } from './_lib/auth.js' // eslint-disable-line no-unused-vars
import Anthropic from '@anthropic-ai/sdk';
import { createClient } from '@supabase/supabase-js';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { truckId, activityId, image } = req.body;
  if (!image || !truckId) return res.status(400).json({ error: 'image and truckId required' });

  try {
    // Claude Vision reads the BOL
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: 'image/jpeg', data: image },
            },
            {
              type: 'text',
              text: 'This is a Bill of Lading. Extract the following information and return as JSON only, no explanation: shipper_name, consignee_name, origin_city, destination_city, commodity, weight_lbs, pro_number, pickup_date. If a field is not found return null for that field.',
            },
          ],
        },
      ],
    });

    const raw = response.content[0].text;
    let bolData = {};
    try {
      bolData = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      bolData = { raw };
    }

    // Insert status update into q_activity
    await supabase.from('q_activity').insert({
      truck_id: truckId,
      driver_id: user.id,
      type: 'bol_uploaded',
      content: {
        message: `BOL uploaded. ${bolData.commodity || 'Freight'} — ${bolData.origin_city || ''} → ${bolData.destination_city || ''}`,
        icon: '📋',
        bolData,
      },
      requires_action: false,
    });

    // Fetch the active load for this truck so mobile can show settlement breakdown
    let activeLoad = null;
    try {
      const { data: loads } = await supabase
        .from('loads')
        .select('id, load_number, rate, gross_pay, origin, destination, broker, broker_email')
        .eq('truck_id', truckId)
        .in('status', ['in_transit', 'picked_up', 'assigned', 'en_route'])
        .order('created_at', { ascending: false })
        .limit(1);
      if (loads?.[0]) {
        activeLoad = {
          ...loads[0],
          rate: parseFloat(loads[0].rate || loads[0].gross_pay || 0),
        };
      }
    } catch { /* non-fatal */ }

    return res.status(200).json({ ok: true, bolData, load: activeLoad });
  } catch (err) {
    console.error('BOL upload error:', err);
    return res.status(500).json({ error: err.message });
  }
}
