import type { ReviewItem } from '@/lib/api'
import { ReviewRow } from '@/components/review/ReviewRow'

interface ReviewQueueProps {
  items: ReviewItem[]
  onOpenTicket: (lane: string, id: number) => void
  onChanged: () => void
}

export function ReviewQueue({ items, onOpenTicket, onChanged }: ReviewQueueProps) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-rust/40 bg-ink-1 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-bone">
          Decisions - awaiting your answer
        </h2>
        <span className="rounded-sm bg-rust px-1.5 py-0.5 text-[11px] font-semibold text-bone">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink-2 px-3 py-4 text-center text-[12px] text-sand/60">
          no decisions parked on you right now
        </div>
      ) : (
        <div className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
          {items.map((item) => (
            <ReviewRow key={item.id} item={item} onOpen={onOpenTicket} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  )
}
