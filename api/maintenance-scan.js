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

  const { image } = req.body;
  if (!image) return res.status(400).json({ error: 'image required' });

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 512,
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
              text: `This is a vehicle maintenance receipt or invoice. Extract the following and return as JSON only, no explanation or markdown:
{
  "type": one of: oil_change | tire_rotation | brake_inspection | dot_annual | pm_service | repair | other,
  "vendor": shop or dealer name (string or null),
  "cost": total dollar amount as a number (or null),
  "description": brief description of work done (string or null, max 120 chars),
  "mileage_at_service": odometer reading as integer (or null),
  "next_service_date": next recommended service date as YYYY-MM-DD (or null),
  "next_service_mileage": next recommended service mileage as integer (or null)
}

For "type", choose the best match:
- oil_change: oil change, lube, filter
- tire_rotation: tire rotation, balance, alignment
- brake_inspection: brakes, brake pads, rotors
- dot_annual: annual inspection, DOT inspection, safety inspection
- pm_service: preventive maintenance, PM service, full service
- repair: any specific repair work
- other: anything else`,
            },
          ],
        },
      ],
    });

    const raw = response.content[0].text;
    let scanData = {};
    try {
      scanData = JSON.parse(raw.replace(/```json|```/g, '').trim());
    } catch {
      scanData = { type: 'other', raw };
    }

    return res.status(200).json({ ok: true, ...scanData });
  } catch (err) {
    console.error('Maintenance scan error:', err);
    return res.status(500).json({ error: err.message });
  }
}
