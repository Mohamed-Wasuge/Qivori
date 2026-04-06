// Shared accounting helpers for Finance components
export const ACCT_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function acctParseDate(str) {
  if (!str) return null
  const parts = str.split(' ')
  const mon = ACCT_MONTHS.indexOf(parts[0])
  const day = parseInt(parts[1])
  if (mon < 0 || isNaN(day)) return null
  return new Date(2026, mon, day)
}

export function acctDaysAgo(str) {
  const d = acctParseDate(str)
  if (!d) return 0
  return Math.floor((Date.now() - d.getTime()) / 86400000)
}

export function acctDaysUntil(str) {
  const d = acctParseDate(str)
  if (!d) return 0
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}
