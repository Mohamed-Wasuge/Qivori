/**
 * Expo Push Notification helper.
 * Uses the Expo Push API (no SDK required — plain fetch).
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

/**
 * Send a push notification to one Expo push token.
 * @param {string} token  - expo push token from profiles.expo_push_token
 * @param {string} title  - notification title
 * @param {string} body   - notification body text
 * @param {object} data   - optional data payload (deep link info, etc.)
 * @returns {{ ok: boolean, error: string|null }}
 */
export async function sendPush(token, title, body, data = {}) {
  if (!token || !token.startsWith('ExponentPushToken[')) {
    return { ok: false, error: 'Invalid or missing Expo push token' }
  }

  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title,
        body,
        data,
        sound: 'default',
        priority: 'high',
        channelId: 'q-alerts',  // Android notification channel
      }),
    })

    const result = await res.json()
    const status = result?.data?.status

    if (!res.ok || status === 'error') {
      const msg = result?.data?.message || result?.errors?.[0]?.message || 'Push send failed'
      return { ok: false, error: msg }
    }

    return { ok: true, error: null }
  } catch (err) {
    return { ok: false, error: `Network error: ${err.message}` }
  }
}

/**
 * Fetch the expo_push_token for a user from Supabase.
 * Pass in the service key headers so this can be called from any edge fn.
 */
export async function getPushToken(userId, sbUrl, sbKey) {
  try {
    const res = await fetch(
      `${sbUrl}/rest/v1/profiles?id=eq.${userId}&select=expo_push_token&limit=1`,
      {
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`,
          'Accept': 'application/json',
        },
      }
    )
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0]?.expo_push_token || null
  } catch {
    return null
  }
}

/**
 * Fetch push token by truck_id — finds the driver assigned to that truck.
 * Returns the driver's expo_push_token.
 */
export async function getPushTokenByTruck(truckId, sbUrl, sbKey) {
  if (!truckId) return null
  try {
    const res = await fetch(
      `${sbUrl}/rest/v1/profiles?assigned_truck_id=eq.${truckId}&select=expo_push_token&limit=1`,
      {
        headers: {
          'apikey': sbKey,
          'Authorization': `Bearer ${sbKey}`,
          'Accept': 'application/json',
        },
      }
    )
    if (!res.ok) return null
    const rows = await res.json()
    return rows?.[0]?.expo_push_token || null
  } catch {
    return null
  }
}

/**
 * Build the push payload for a q_activity event type.
 * Returns { title, body, data } or null if the type doesn't warrant a push.
 */
export function buildQActivityPush(type, content = {}) {
  switch (type) {
    case 'load_found':
      return {
        title: 'Q found a load',
        body: content.origin && content.destination
          ? `$${Number(content.rate || 0).toLocaleString()} · ${content.origin} → ${content.destination}. Tap to review.`
          : 'Q found a load worth looking at. Tap to review.',
        data: { screen: 'home', type },
      }

    case 'decision_needed':
      return {
        title: 'Q needs your call',
        body: content.brokerName
          ? `Broker ${content.brokerName} is waiting. Tap to accept, counter, or decline.`
          : 'A broker is waiting for your decision. Tap to decide.',
        data: { screen: 'home', type },
      }

    case 'booked':
      return {
        title: 'Load booked',
        body: content.origin && content.destination
          ? `Q booked ${content.origin} → ${content.destination} at $${Number(content.rate || content.gross_pay || 0).toLocaleString()}.`
          : 'Q booked a load. Tap to see details.',
        data: { screen: 'home', type },
      }

    case 'out_of_service': {
      const truckLabel = content.truck_unit || content.truck_name || 'your truck'
      return {
        title: 'Truck needs attention',
        body: `Pre-trip failed on ${truckLabel}. Tap to view.`,
        data: { screen: 'fleet', type },
      }
    }

    case 'settlement': {
      const amount = content.amount || content.rate || content.gross_pay
      const loadId = content.load_id || content.load_number || ''
      return {
        title: 'Payment received',
        body: amount
          ? `You just got paid $${Number(amount).toLocaleString()}${loadId ? ` for ${loadId}` : ''}.`
          : 'A payment has been processed. Tap to view.',
        data: { screen: 'pay', type },
      }
    }

    case 'call_started':
      return {
        title: 'Q is on the phone',
        body: content.brokerName
          ? `Q is negotiating with ${content.brokerName} right now.`
          : 'Q is negotiating with a broker.',
        data: { screen: 'home', type },
      }

    default:
      return null
  }
}
