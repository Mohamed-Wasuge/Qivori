import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { truckId, loadId, activityId, rate, brokerName, originCity, destinationCity, pickupTime, pickupAddress, contactName, contactPhone } = req.body;

  if (!truckId || !rate) return res.status(400).json({ error: 'truckId and rate required' });

  // 1. Update truck status to covered
  await supabase
    .from('vehicles')
    .update({ status: 'covered', active_load_id: loadId || null })
    .eq('id', truckId);

  // 2. Mark activity as actioned
  if (activityId) {
    await supabase
      .from('q_activity')
      .update({ action_taken: 'accepted', action_taken_at: new Date().toISOString(), requires_action: false })
      .eq('id', activityId);
  }

  // 3. Insert booking confirmation card
  await supabase.from('q_activity').insert({
    truck_id: truckId,
    driver_id: user.id,
    type: 'booked',
    content: {
      message: `Booked. $${rate.toLocaleString()} with ${brokerName || 'broker'}.`,
      icon: '✅',
      rate,
      brokerName,
      originCity,
      destinationCity,
      pickupTime,
      pickupAddress,
      contactName,
      contactPhone,
    },
    requires_action: false,
  });

  // 4. Insert pickup instructions card
  await supabase.from('q_activity').insert({
    truck_id: truckId,
    driver_id: user.id,
    type: 'status_update',
    content: {
      message: `Head to ${pickupAddress || originCity}. Pickup at ${pickupTime || 'scheduled time'}. Contact: ${contactName || 'shipper'} ${contactPhone || ''}`.trim(),
      icon: '🚛',
    },
    requires_action: false,
  });

  return res.status(200).json({ ok: true });
}
