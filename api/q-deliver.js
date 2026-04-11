import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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

  const { truckId, loadId, rate, bolImage } = req.body;
  if (!truckId || !rate) return res.status(400).json({ error: 'truckId and rate required' });

  // 1. Get truck record — table is 'vehicles' in this schema
  const { data: truck } = await supabase
    .from('vehicles')
    .select('assigned_driver_id')
    .eq('id', truckId)
    .single();

  // 2. Get owner-op stripe details via the truck's assigned driver id
  const { data: ownerProfile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, stripe_payment_method_id')
    .eq('id', truck?.assigned_driver_id || user.id)
    .single();

  // 3. Calculate 3% dispatch fee
  const dispatchFee = Math.round(rate * 0.03 * 100); // in cents
  const driverPayout = rate - (rate * 0.03);

  // 4. Charge owner-op via Stripe if payment method exists
  if (ownerProfile?.stripe_payment_method_id) {
    try {
      await stripe.paymentIntents.create({
        amount: dispatchFee,
        currency: 'usd',
        customer: ownerProfile.stripe_customer_id,
        payment_method: ownerProfile.stripe_payment_method_id,
        confirm: true,
        description: `Q dispatch fee — Load ${loadId || truckId}`,
      });
    } catch (stripeErr) {
      console.error('Stripe charge failed:', stripeErr.message);
    }
  }

  // 5. Update truck status back to available
  await supabase
    .from('vehicles')
    .update({ status: 'available', active_load_id: null })
    .eq('id', truckId);

  // 6. Insert delivery confirmation card
  await supabase.from('q_activity').insert({
    truck_id: truckId,
    driver_id: user.id,
    type: 'status_update',
    content: {
      message: `Delivered. BOL uploaded. Submitted to factoring.`,
      icon: '✅',
    },
    requires_action: false,
  });

  // 7. Insert payment card
  await supabase.from('q_activity').insert({
    truck_id: truckId,
    driver_id: user.id,
    type: 'payment_received',
    content: {
      message: `$${driverPayout.toLocaleString()} incoming after 3% dispatch fee. Payment in 24-48hrs.`,
      icon: '💰',
      grossRate: rate,
      dispatchFee: rate * 0.03,
      driverPayout,
    },
    requires_action: false,
  });

  // 8. Insert new load search card — Q starts looking again
  await supabase.from('q_activity').insert({
    truck_id: truckId,
    driver_id: user.id,
    type: 'status_update',
    content: {
      message: 'Truck available. Q is searching for your next load...',
      icon: '🔍',
    },
    requires_action: false,
  });

  return res.status(200).json({ ok: true, driverPayout, dispatchFee: rate * 0.03 });
}
