import { cn } from '@/lib/utils'
import type { LaneCounts } from '@/lib/api'

const STATUS_DOT: Record<string, string> = {
  open: 'bg-status-open',
  claimed: 'bg-status-claimed',
  blocked: 'bg-status-blocked',
}

interface LaneListProps {
  lanes: Record<string, LaneCounts> | null
  selected: string | null
  onSelect: (lane: string | null) => void
}

export function LaneList({ lanes, selected, onSelect }: LaneListProps) {
  const names = lanes ? Object.keys(lanes).sort() : []

  return (
    <div className="flex flex-col gap-0.5">
      <button
        onClick={() => onSelect(null)}
        className={cn(
          'flex items-center justify-between rounded-sm px-2 py-1 text-left text-[13px] hover:bg-ink-2',
          selected === null && 'bg-ink-2 text-bone',
        )}
      >
        <span>all lanes</span>
      </button>
      {names.length === 0 && (
        <div className="px-2 py-1 text-[12px] text-sand/60">no lanes</div>
      )}
      {names.map((lane) => {
        const counts = lanes?.[lane] ?? {}
        const open = counts.open ?? 0
        const claimed = counts.claimed ?? 0
        const blocked = counts.blocked ?? 0
        return (
          <button
            key={lane}
            onClick={() => onSelect(lane)}
            className={cn(
              'flex items-center justify-between gap-2 rounded-sm px-2 py-1 text-left text-[13px] hover:bg-ink-2',
              selected === lane && 'bg-ink-2 text-bone',
            )}
          >
            <span className="truncate">{lane}</span>
            <span className="flex shrink-0 items-center gap-1.5 tabular-nums text-[11px] text-sand">
              {open > 0 && (
                <span className="flex items-center gap-0.5">
                  <span className={cn('size-1.5 rounded-full', STATUS_DOT.open)} />
                  {open}
                </span>
              )}
              {claimed > 0 && (
                <span className="flex items-center gap-0.5">
                  <span className={cn('size-1.5 rounded-full', STATUS_DOT.claimed)} />
                  {claimed}
                </span>
              )}
              {blocked > 0 && (
                <span className="flex items-center gap-0.5">
                  <span className={cn('size-1.5 rounded-full', STATUS_DOT.blocked)} />
                  {blocked}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}
