import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  // Verify user
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Unauthorized' });

  const { activityId, action } = req.body;
  if (!activityId || !action) return res.status(400).json({ error: 'activityId and action required' });

  // Validate activityId is uuid
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(activityId)) return res.status(400).json({ error: 'Invalid activityId' });

  // Update the activity row with driver's decision
  const { error: updateError } = await supabase
    .from('q_activity')
    .update({
      action_taken: typeof action === 'string' ? action : JSON.stringify(action),
      action_taken_at: new Date().toISOString(),
      requires_action: false,
    })
    .eq('id', activityId)
    .eq('driver_id', user.id);

  if (updateError) return res.status(500).json({ error: updateError.message });

  // Insert a new activity card confirming the decision
  await supabase.from('q_activity').insert({
    truck_id: req.body.truckId,
    driver_id: user.id,
    type: 'status_update',
    content: {
      message: `You chose: ${typeof action === 'string' ? action : action.label}`,
      icon: '✅',
    },
    requires_action: false,
  });

  return res.status(200).json({ ok: true });
}
