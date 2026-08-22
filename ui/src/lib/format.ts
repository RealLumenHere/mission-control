const _FMT_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

function parseUtc(s: string | null | undefined): number | null {
  if (!s) return null
  const m = _FMT_RE.exec(s)
  if (!m) return null
  const [, y, mo, d, h, mi, se] = m
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +se)
}

/** `lease_expires` vs the server's `now` (both "YYYY-MM-DD HH:MM:SS" UTC, wq's
 * own format) -> "12m left" / "3m over" / null when either is missing. */
export function leaseCountdown(leaseExpires: string | null, now: string | null): string | null {
  const exp = parseUtc(leaseExpires)
  const cur = parseUtc(now)
  if (exp === null || cur === null) return null
  const deltaMin = Math.round((exp - cur) / 60000)
  if (deltaMin >= 0) return `${deltaMin}m left`
  return `${-deltaMin}m over`
}
