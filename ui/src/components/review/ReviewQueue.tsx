import type { ReviewResponse } from '@/lib/api'
import { ReviewRow } from '@/components/review/ReviewRow'

interface ReviewQueueProps {
  review: ReviewResponse | null
  onOpenTicket: (lane: string, id: number) => void
  onChanged: () => void
}

export function ReviewQueue({ review, onOpenTicket, onChanged }: ReviewQueueProps) {
  const items = review?.items ?? []

  return (
    <div className="flex flex-col gap-2 rounded-md border border-rust/40 bg-ink-1 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-bone">
          Review queue — awaiting your decision
        </h2>
        <span className="rounded-sm bg-rust px-1.5 py-0.5 text-[11px] font-semibold text-bone">
          {items.length}
        </span>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink-2 px-3 py-4 text-center text-[12px] text-sand/60">
          nothing parked on a decision — queue is unstarved
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
