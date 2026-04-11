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

  const { activityId, action, truckId } = req.body;
  if (!activityId || !action) return res.status(400).json({ error: 'activityId and action required' });

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(activityId)) return res.status(400).json({ error: 'Invalid activityId' });

  // Determine decision value and rate
  const actionValue = typeof action === 'string' ? action : (action.value || action.label || '')
  const decisionLower = actionValue.toLowerCase()
  const isAccept = decisionLower.includes('accept') || decisionLower === 'yes'
  const isDecline = decisionLower.includes('decline') || decisionLower.includes('pass') || decisionLower === 'no'
  const isCounter = decisionLower.includes('counter')
  const agreedRate = action.rate ? parseFloat(action.rate) : null

  // 1. Mark the activity card resolved
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

  // 2. Write decision to retell_calls so check_driver_decision can read it
  // Find the most recent active call for this driver/truck
  const retellOutcome = isAccept ? 'accepted' : isDecline ? 'declined' : isCounter ? 'counter_offer' : 'waiting'
  const { data: activeCalls } = await supabase
    .from('retell_calls')
    .select('id, retell_call_id')
    .eq('user_id', user.id)
    .in('call_status', ['initiating', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(1)

  if (activeCalls?.length > 0) {
    await supabase
      .from('retell_calls')
      .update({
        outcome: retellOutcome,
        agreed_rate: (isAccept || isCounter) ? agreedRate : null,
      })
      .eq('id', activeCalls[0].id)
  }

  // 3. Confirm card in feed
  const confirmMsg = isAccept ? `Accepted${agreedRate ? ` at $${agreedRate.toLocaleString()}` : ''}. Q is confirming with broker.`
    : isDecline ? 'Passed. Q will walk away from this load.'
    : isCounter ? `Counter sent: $${agreedRate?.toLocaleString() || '?'}. Q is negotiating.`
    : `Decision recorded.`

  await supabase.from('q_activity').insert({
    truck_id: truckId || null,
    driver_id: user.id,
    type: 'status_update',
    content: { message: confirmMsg, icon: isAccept ? '✅' : isDecline ? '❌' : '🔄' },
    requires_action: false,
  });

  return res.status(200).json({ ok: true, outcome: retellOutcome });
}
