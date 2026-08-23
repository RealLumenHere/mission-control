import { useState } from 'react'

import type { ReviewResponse } from '@/lib/api'
import { ReviewRow } from '@/components/review/ReviewRow'
import { cn } from '@/lib/utils'

interface ReviewQueueProps {
  review: ReviewResponse | null
  onOpenTicket: (lane: string, id: number) => void
  onChanged: () => void
}

export function ReviewQueue({ review, onOpenTicket, onChanged }: ReviewQueueProps) {
  const [decisionsOnly, setDecisionsOnly] = useState(false)
  const all = review?.items ?? []
  const decisionCount = all.filter((i) => i.kinds.includes('frank_decision')).length
  const items = decisionsOnly ? all.filter((i) => i.kinds.includes('frank_decision')) : all

  return (
    <div className="flex flex-col gap-2 rounded-md border border-rust/40 bg-ink-1 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-bone">
          Review queue — awaiting your decision
        </h2>
        <div className="flex items-center gap-1.5">
          {/* wq#663: one click to just the gate_type=frank_decision tickets. */}
          <button
            onClick={() => setDecisionsOnly((v) => !v)}
            aria-pressed={decisionsOnly}
            className={cn(
              'rounded-sm border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide transition-colors',
              decisionsOnly ? 'border-rust bg-rust text-bone' : 'border-ink-2 text-sand hover:border-rust/60',
            )}
          >
            Decisions {decisionCount}
          </button>
          <span className="rounded-sm bg-rust px-1.5 py-0.5 text-[11px] font-semibold text-bone">
            {items.length}
          </span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink-2 px-3 py-4 text-center text-[12px] text-sand/60">
          {decisionsOnly ? 'no decisions parked on Frank right now' : 'nothing parked on a decision — queue is unstarved'}
        </div>
      ) : (
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <ReviewRow key={item.id} item={item} onOpen={onOpenTicket} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  )
}
