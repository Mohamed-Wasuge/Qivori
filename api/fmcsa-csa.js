import { corsHeaders } from './_lib/auth.js' // eslint-disable-line no-unused-vars

export const config = { runtime: 'edge' }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const LEVEL_MAP = {
  'Unsafe Driving': 'Unsafe Driving',
  'Hours-Of-Service Compliance': 'Hours-Of-Service Compliance',
  'Driver Fitness': 'Driver Fitness',
  'Controlled Substances/Alcohol': 'Controlled Substances/Alcohol',
  'Vehicle Maintenance': 'Vehicle Maintenance',
  'Hazardous Materials Compliance': 'Hazardous Materials Compliance',
  'Crash Indicator': 'Crash Indicator',
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: CORS_HEADERS })
  }

  if (req.method !== 'GET') {
    return Response.json(
      { error: 'GET only' },
      { status: 405, headers: CORS_HEADERS }
    )
  }

  const webKey = process.env.FMCSA_WEBKEY
  if (!webKey) {
    return Response.json(
      { scores: [], error: 'FMCSA API key not configured' },
      { status: 200, headers: CORS_HEADERS }
    )
  }

  const url = new URL(req.url)
  const dot = url.searchParams.get('dot')
  if (!dot) {
    return Response.json(
      { scores: [], error: 'Missing required ?dot= parameter' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const cleanDot = dot.replace(/[^0-9]/g, '')

  try {
    const fmcsaUrl = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${cleanDot}/basics?webKey=${webKey}`
    const res = await fetch(fmcsaUrl, {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      return Response.json(
        { dot: cleanDot, scores: [], error: 'FMCSA unavailable' },
        { status: 200, headers: CORS_HEADERS }
      )
    }

    const data = await res.json()

    // FMCSA returns basics under content array or nested object — handle both shapes
    let rawList = []
    const content = data?.content
    if (Array.isArray(content)) {
      rawList = content
    } else if (content?.basics?.basic) {
      rawList = Array.isArray(content.basics.basic)
        ? content.basics.basic
        : [content.basics.basic]
    } else if (content?.basic) {
      rawList = Array.isArray(content.basic) ? content.basic : [content.basic]
    }

    const scores = rawList
      .filter(item => item && (item.basic || item.basicName || item.basicsType))
      .map(item => {
        // Content items may wrap the BASIC under an item.basic sub-key
        const b = item.basic || item

        const name =
          b.basicName ||
          b.basicsType ||
          b.basicType ||
          LEVEL_MAP[b.basicName] ||
          'Unknown'

        const score = parseFloat(
          b.measureValue ?? b.basicsValue ?? b.percentile ?? 0
        )
        const percentile = parseFloat(b.percentile ?? 0)
        const alertDisplay =
          b.alertIndicatorDisplay || b.alertIndicator || 'Insufficient Data'
        const alert =
          alertDisplay.toLowerCase().includes('alert') &&
          !alertDisplay.toLowerCase().includes('no alert')
        const insufficient =
          alertDisplay.toLowerCase().includes('insufficient') ||
          alertDisplay.toLowerCase() === 'unknown'

        return {
          name,
          score: isNaN(score) ? 0 : Math.round(score * 10) / 10,
          percentile: isNaN(percentile) ? 0 : Math.round(percentile * 10) / 10,
          alert,
          insufficient,
          threshold: parseFloat(
            b.onRoadPerformanceMeasure ?? b.basicsThreshold ?? b.threshold ?? 0
          ),
        }
      })

    return Response.json(
      {
        dot: cleanDot,
        scores,
        fetched_at: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          'Cache-Control': 'public, max-age=3600',
        },
      }
    )
  } catch (err) {
    console.error('fmcsa-csa error:', err)
    return Response.json(
      { dot: cleanDot, scores: [], error: 'FMCSA unavailable' },
      { status: 200, headers: CORS_HEADERS }
    )
  }
}
