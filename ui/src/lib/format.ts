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

/** Server-computed `age_days` (float, days since created_at) -> compact label. */
export function formatAge(ageDays: number): string {
  if (ageDays >= 1) return `${Math.floor(ageDays)}d`
  const hours = Math.round(ageDays * 24)
  return hours < 1 ? '<1h' : `${hours}h`
}

/** Bytes -> compact "12.3G" / "512M" label (binary units, no decimals under 10). */
export function formatBytes(bytes: number): string {
  const units: [number, string][] = [[1024 ** 4, 'T'], [1024 ** 3, 'G'], [1024 ** 2, 'M'], [1024, 'K']]
  for (const [divisor, suffix] of units) {
    if (bytes >= divisor) {
      const v = bytes / divisor
      return `${v >= 10 ? Math.round(v) : v.toFixed(1)}${suffix}`
    }
  }
  return `${bytes}B`
}

/** Seconds -> compact "3d 4h" / "12h" / "5m" uptime label. */
export function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}
