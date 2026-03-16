import { handleCors, corsHeaders, requireAuth, verifyAuth } from './_lib/auth.js'
import { rateLimit, getClientIP, rateLimitResponse } from './_lib/rate-limit.js'

export const config = { runtime: 'edge' }

export default async function handler(req) {
  const corsResponse = handleCors(req)
  if (corsResponse) return corsResponse
  if (req.method !== 'POST') {
    return Response.json({ error: 'POST only' }, { status: 405, headers: corsHeaders(req) })
  }

  // Require authenticated user
  const authErr = await requireAuth(req)
  if (authErr) return authErr

  // Rate limit: 20 analyses per hour per user
  const ip = getClientIP(req)
  const { limited, resetMs } = rateLimit(`rate-analysis:${ip}`, 20, 3600000)
  if (limited) return rateLimitResponse(req, corsHeaders, resetMs)

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500, headers: corsHeaders(req) })
  }

  try {
    let body
    try { body = await req.json() } catch {
      return Response.json({ error: 'Request body must be valid JSON' }, { status: 400, headers: corsHeaders(req) })
    }

    const { origin, destination, miles, rate, equipment_type, weight } = body
    if (!origin || !destination || !miles || !rate) {
      return Response.json({ error: 'Missing required fields: origin, destination, miles, rate' }, { status: 400, headers: corsHeaders(req) })
    }

    const milesNum = Number(miles) || 0
    const rateNum = Number(rate) || 0
    if (milesNum <= 0 || rateNum <= 0) {
      return Response.json({ error: 'Miles and rate must be positive numbers' }, { status: 400, headers: corsHeaders(req) })
    }

    const offeredRpm = +(rateNum / milesNum).toFixed(2)
    const equip = (equipment_type || 'Dry Van').trim()

    // Market rate ranges by equipment type
    const marketRates = {
      'Dry Van':    { low: 2.20, avg: 2.50, high: 2.85 },
      'Reefer':     { low: 2.60, avg: 2.90, high: 3.20 },
      'Flatbed':    { low: 2.80, avg: 3.10, high: 3.40 },
      'Step Deck':  { low: 3.00, avg: 3.30, high: 3.60 },
      'Stepdeck':   { low: 3.00, avg: 3.30, high: 3.60 },
      'Power Only': { low: 1.80, avg: 2.10, high: 2.40 },
      'Tanker':     { low: 3.00, avg: 3.30, high: 3.60 },
    }
    const mktRange = marketRates[equip] || marketRates['Dry Van']

    // Operating cost breakdown
    const fuelCostPerMi = 0.65
    const insuranceCostPerMi = 0.12
    const maintenanceCostPerMi = 0.15
    const tireCostPerMi = 0.04
    const truckPaymentPerMi = 0.20
    const driverPayPct = 0.27 // 27% of gross average
    const deadheadPct = 0.15 // 15% deadhead on average

    const totalMilesWithDeadhead = Math.round(milesNum * (1 + deadheadPct))
    const fuelCost = Math.round(totalMilesWithDeadhead * fuelCostPerMi)
    const insuranceCost = Math.round(milesNum * insuranceCostPerMi)
    const maintenanceCost = Math.round(milesNum * maintenanceCostPerMi)
    const tireCost = Math.round(milesNum * tireCostPerMi)
    const truckPayment = Math.round(milesNum * truckPaymentPerMi)
    const driverPay = Math.round(rateNum * driverPayPct)
    const totalExpenses = fuelCost + insuranceCost + maintenanceCost + tireCost + truckPayment + driverPay
    const netProfit = rateNum - totalExpenses

    // Score calculation (0-100)
    const rpmDiffPct = ((offeredRpm - mktRange.avg) / mktRange.avg) * 100
    let score = 50
    score += Math.min(30, Math.max(-30, rpmDiffPct * 1.5))
    if (netProfit > 0) score += Math.min(10, (netProfit / rateNum) * 40)
    else score -= 10
    if (milesNum > 500) score += 2 // longer hauls slightly favored
    if (equip === 'Reefer' || equip === 'Flatbed') score += 2 // specialty premium
    score = Math.min(100, Math.max(0, Math.round(score)))

    // Verdict
    let verdict
    if (offeredRpm >= mktRange.high) verdict = 'excellent'
    else if (offeredRpm >= mktRange.avg) verdict = 'good'
    else if (offeredRpm >= mktRange.low) verdict = 'fair'
    else verdict = 'below_market'

    // Suggested counter-offer
    const suggestedCounter = +(Math.max(offeredRpm, mktRange.avg) + 0.15).toFixed(2)
    const suggestedGross = Math.round(suggestedCounter * milesNum)

    const analysisPrompt = `You are a trucking rate analysis AI. Analyze this load offer and provide a JSON response.

LOAD DETAILS:
- Origin: ${origin}
- Destination: ${destination}
- Miles: ${milesNum}
- Offered Rate: $${rateNum.toLocaleString()} ($${offeredRpm}/mi)
- Equipment: ${equip}
- Weight: ${weight || 'Not specified'}

MARKET DATA:
- Market rate range for ${equip}: $${mktRange.low}-$${mktRange.high}/mi (avg $${mktRange.avg}/mi)
- Offered RPM vs market avg: ${rpmDiffPct > 0 ? '+' : ''}${rpmDiffPct.toFixed(1)}%
- Current diesel avg: ~$3.80/gal

OPERATING COSTS (for this load):
- Fuel (incl 15% deadhead): $${fuelCost}
- Insurance: $${insuranceCost}
- Maintenance: $${maintenanceCost}
- Tires: $${tireCost}
- Truck payment: $${truckPayment}
- Driver pay (27%): $${driverPay}
- Total expenses: $${totalExpenses}
- Net profit: $${netProfit}

CALCULATED:
- Score: ${score}/100
- Verdict: ${verdict}
- Suggested counter: $${suggestedCounter}/mi ($${suggestedGross} gross)

Respond with ONLY valid JSON (no markdown, no backticks):
{
  "reasoning": "2-3 sentences explaining why this rate is ${verdict}. Reference specific numbers — RPM, market comparison, profit margin. Be concise and actionable.",
  "negotiation_script": "A natural script the carrier can use to call the broker. Start with greeting, reference market data, propose counter of $${suggestedCounter}/mi ($${suggestedGross}), and close with pickup readiness. Keep under 60 words.",
  "factors": [
    {"name": "factor name", "impact": "positive|negative|neutral", "detail": "brief explanation"},
    {"name": "factor name", "impact": "positive|negative|neutral", "detail": "brief explanation"},
    {"name": "factor name", "impact": "positive|negative|neutral", "detail": "brief explanation"}
  ]
}`

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 800,
        messages: [{ role: 'user', content: analysisPrompt }],
      }),
    })

    let aiData = {}
    if (res.ok) {
      const data = await res.json()
      const text = data.content?.[0]?.text || ''
      try {
        aiData = JSON.parse(text)
      } catch {
        // Try to extract JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          try { aiData = JSON.parse(jsonMatch[0]) } catch {}
        }
      }
    }

    // Fallback reasoning if AI failed
    if (!aiData.reasoning) {
      const pctStr = rpmDiffPct > 0 ? `${rpmDiffPct.toFixed(0)}% above` : `${Math.abs(rpmDiffPct).toFixed(0)}% below`
      aiData.reasoning = `This rate of $${offeredRpm}/mi is ${pctStr} the market average of $${mktRange.avg}/mi for ${equip} loads. Your estimated net profit is $${netProfit.toLocaleString()} after all operating costs.`
    }
    if (!aiData.negotiation_script) {
      aiData.negotiation_script = `Hi, I appreciate the load offer from ${origin} to ${destination}. Based on current market conditions for ${equip} loads on this lane, rates are averaging $${mktRange.avg}/mi. I can take this load at $${suggestedCounter}/mi ($${suggestedGross} gross) which accounts for current diesel prices. When would you need it picked up?`
    }
    if (!aiData.factors || !Array.isArray(aiData.factors)) {
      aiData.factors = [
        { name: 'Rate vs Market', impact: offeredRpm >= mktRange.avg ? 'positive' : 'negative', detail: `$${offeredRpm}/mi vs $${mktRange.avg}/mi market avg` },
        { name: 'Diesel Prices', impact: 'negative', detail: 'Above $3.80/gal increases fuel costs' },
        { name: 'Profit Margin', impact: netProfit > 200 ? 'positive' : netProfit > 0 ? 'neutral' : 'negative', detail: `Net profit $${netProfit.toLocaleString()} (${((netProfit / rateNum) * 100).toFixed(0)}% margin)` },
      ]
    }

    const result = {
      verdict,
      score,
      offered_rpm: offeredRpm,
      market_rpm: { low: mktRange.low, avg: mktRange.avg, high: mktRange.high },
      suggested_counter: suggestedCounter,
      suggested_gross: suggestedGross,
      profit_estimate: {
        gross: rateNum,
        fuel: fuelCost,
        insurance: insuranceCost,
        maintenance: maintenanceCost,
        tires: tireCost,
        truck_payment: truckPayment,
        driver_pay: driverPay,
        total_expenses: totalExpenses,
        net: netProfit,
      },
      reasoning: aiData.reasoning,
      negotiation_script: aiData.negotiation_script,
      factors: aiData.factors,
    }

    return Response.json(result, { headers: corsHeaders(req) })
  } catch (err) {
    return Response.json({ error: 'Rate analysis failed' }, { status: 500, headers: corsHeaders(req) })
  }
}
