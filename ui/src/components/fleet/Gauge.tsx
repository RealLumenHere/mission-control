import type { CSSProperties } from 'react'
import { ProgressBar } from '@tremor/react'

// Fill color by utilization threshold, keyed to the brand status tokens (index.css)
// rather than Tremor's default blue scale — overridden per-instance via the
// --color-tremor-brand CSS var, which Tremor's ProgressBar reads for its fill.
function gaugeColor(pct: number): string {
  if (pct >= 90) return 'var(--color-status-blocked)'
  if (pct >= 75) return 'var(--color-status-claimed)'
  return 'var(--color-tremor-brand)'
}

interface GaugeProps {
  label: string
  pct: number
  detail?: string
}

export function Gauge({ label, pct, detail }: GaugeProps) {
  const clamped = Math.max(0, Math.min(100, pct))
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center justify-between text-[11px] text-sand">
        <span>{label}</span>
        <span className="tabular-nums">{detail ?? `${Math.round(clamped)}%`}</span>
      </div>
      <div style={{ '--color-tremor-brand': gaugeColor(clamped) } as CSSProperties}>
        <ProgressBar value={clamped} showAnimation={false} />
      </div>
    </div>
  )
}
