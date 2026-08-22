import { cn } from '@/lib/utils'
import type { TaskStatus } from '@/lib/api'

const CARDS: { status: TaskStatus; label: string; dot: string }[] = [
  { status: 'open', label: 'open', dot: 'bg-status-open' },
  { status: 'claimed', label: 'claimed', dot: 'bg-status-claimed' },
  { status: 'blocked', label: 'blocked', dot: 'bg-status-blocked' },
  { status: 'done', label: 'done', dot: 'bg-status-done' },
]

interface LaneStatusCardsProps {
  counts: Partial<Record<TaskStatus, number>>
  active: TaskStatus | null
  onToggle: (status: TaskStatus) => void
}

export function LaneStatusCards({ counts, active, onToggle }: LaneStatusCardsProps) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {CARDS.map(({ status, label, dot }) => (
        <button
          key={status}
          onClick={() => onToggle(status)}
          className={cn(
            'flex flex-col items-start gap-1.5 rounded-md border border-ink-2 bg-ink-1 px-3 py-2.5 text-left transition-colors hover:border-rust/60',
            active === status && 'border-rust bg-ink-2',
          )}
        >
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-sand uppercase tracking-wide">
            <span className={cn('size-1.5 rounded-full', dot)} />
            {label}
          </span>
          <span className="text-[20px] font-semibold tabular-nums text-bone">
            {counts[status] ?? 0}
          </span>
        </button>
      ))}
    </div>
  )
}
