import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { GovernorState } from '@/lib/api'

const BARS: Array<{ key: 'session' | 'weekly_all' | 'fable_weekly_scoped'; label: string }> = [
  { key: 'session', label: 'session' },
  { key: 'weekly_all', label: 'weekly' },
  { key: 'fable_weekly_scoped', label: 'fable' },
]

export function GovernorBars({ governor }: { governor: GovernorState | null }) {
  if (!governor) {
    return <div className="text-[12px] text-sand/60">governor state unavailable</div>
  }

  const limits = governor.limits ?? {}

  return (
    <div className="flex flex-col gap-2">
      {BARS.map(({ key, label }) => {
        const limit = limits[key]
        const pct = limit?.percent ?? 0
        const crit = pct >= 90
        const warn = pct >= 75
        return (
          <div key={key} className="flex flex-col gap-1">
            <div className="flex items-center justify-between text-[11px] text-sand">
              <span>{label}</span>
              <span>{limit ? `${pct}% used` : 'n/a'}</span>
            </div>
            <Progress
              value={limit ? Math.min(pct, 100) : 0}
              indicatorClassName={cn(
                crit ? 'bg-status-blocked' : warn ? 'bg-status-claimed' : 'bg-rust',
              )}
            />
          </div>
        )
      })}
      <div className="mt-1 flex gap-1.5">
        <span
          className={cn(
            'rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
            governor.stop_active
              ? 'bg-status-blocked/20 text-status-blocked'
              : 'bg-ink-2 text-sand',
          )}
        >
          {governor.stop_active ? 'stop active' : 'stop clear'}
        </span>
        <span
          className={cn(
            'rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-wide',
            governor.stale ? 'bg-status-blocked/20 text-status-blocked' : 'bg-ink-2 text-sand',
          )}
        >
          {governor.stale ? 'stale' : 'fresh'}
        </span>
      </div>
    </div>
  )
}
