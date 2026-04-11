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

  const { truckId, loadId, brokerPhone, brokerName, driverLocation, eta } = req.body;
  if (!truckId) return res.status(400).json({ error: 'truckId required' });

  // Insert check call status card into feed
  await supabase.from('q_activity').insert({
    truck_id: truckId,
    driver_id: user.id,
    type: 'status_update',
    content: {
      message: `Check call sent to ${brokerName || 'broker'}. Driver en route${eta ? `, ETA ${eta}` : ''}.`,
      icon: '📞',
    },
    requires_action: false,
  });

  return res.status(200).json({ ok: true });
}
