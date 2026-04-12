export const config = { runtime: 'edge' }

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const LEVEL_CODE_MAP = {
  1: 'Level I — Full',
  2: 'Level II — Walk-Around',
  3: 'Level III — Driver Only',
  4: 'Level IV — Special Study',
  5: 'Level V — Vehicle Only',
  6: 'Level VI — Enhanced NAS',
}

function formatInspectionDate(raw) {
  if (!raw) return null
  // FMCSA may return "YYYY-MM-DD" or "MM/DD/YYYY" or epoch ms
  if (typeof raw === 'number') {
    return new Date(raw).toISOString().split('T')[0]
  }
  if (typeof raw === 'string') {
    // Already ISO
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.split('T')[0]
    // MM/DD/YYYY
    const parts = raw.split('/')
    if (parts.length === 3) {
      return `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
    }
  }
  return raw
}

function parseLevelCode(code) {
  const n = parseInt(code, 10)
  return LEVEL_CODE_MAP[n] || `Level ${code}`
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
      { inspections: [], total: 0, error: 'FMCSA API key not configured' },
      { status: 200, headers: CORS_HEADERS }
    )
  }

  const url = new URL(req.url)
  const dot = url.searchParams.get('dot')
  if (!dot) {
    return Response.json(
      { inspections: [], total: 0, error: 'Missing required ?dot= parameter' },
      { status: 400, headers: CORS_HEADERS }
    )
  }

  const cleanDot = dot.replace(/[^0-9]/g, '')

  try {
    const fmcsaUrl = `https://mobile.fmcsa.dot.gov/qc/services/carriers/${cleanDot}/inspections?webKey=${webKey}`
    const res = await fetch(fmcsaUrl, {
      headers: { Accept: 'application/json' },
    })

    if (!res.ok) {
      return Response.json(
        { dot: cleanDot, inspections: [], total: 0, error: 'FMCSA unavailable' },
        { status: 200, headers: CORS_HEADERS }
      )
    }

    const data = await res.json()

    // content may be array of inspections or wrapped object
    let rawList = []
    const content = data?.content
    if (Array.isArray(content)) {
      rawList = content
    } else if (content?.inspections?.inspection) {
      rawList = Array.isArray(content.inspections.inspection)
        ? content.inspections.inspection
        : [content.inspections.inspection]
    } else if (content?.inspection) {
      rawList = Array.isArray(content.inspection)
        ? content.inspection
        : [content.inspection]
    }

    const inspections = rawList
      .filter(item => item)
      .map(item => {
        const insp = item.inspection || item

        const totalViol = parseInt(insp.totalViol ?? insp.totalViolations ?? 0, 10)
        const drvrOos = parseInt(
          insp.totalDrvrOosViol ?? insp.driverOosViol ?? insp.driverOos ?? 0,
          10
        )
        const vehOos = parseInt(
          insp.totalVehOosViol ?? insp.vehicleOosViol ?? insp.vehicleOos ?? 0,
          10
        )

        const levelCode =
          insp.levelCode ?? insp.inspectionLevelCode ?? insp.level ?? ''
        const result =
          totalViol === 0
            ? 'No Violations'
            : `${totalViol} Violation${totalViol === 1 ? '' : 's'}`

        return {
          date: formatInspectionDate(
            insp.inspectionDate ?? insp.date ?? insp.reportDate ?? null
          ),
          state:
            insp.reportState ?? insp.state ?? insp.inspectionState ?? '',
          level: parseLevelCode(levelCode),
          result,
          violations: totalViol,
          oos: drvrOos > 0 || vehOos > 0,
          oos_driver: drvrOos,
          oos_vehicle: vehOos,
        }
      })
      // Sort newest first
      .sort((a, b) => {
        if (!a.date && !b.date) return 0
        if (!a.date) return 1
        if (!b.date) return -1
        return b.date.localeCompare(a.date)
      })

    return Response.json(
      {
        dot: cleanDot,
        inspections,
        total: inspections.length,
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
    console.error('fmcsa-inspections error:', err)
    return Response.json(
      { dot: cleanDot, inspections: [], total: 0, error: 'FMCSA unavailable' },
      { status: 200, headers: CORS_HEADERS }
    )
  }
}
