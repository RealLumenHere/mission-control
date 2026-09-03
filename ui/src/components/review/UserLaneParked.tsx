// wq#1412 — items parked purely because they live in the user lane (no other
// reason a decision is needed) get their own collapsed-by-default section
// instead of drowning the real "needs your decision" queue. Click to open.
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import type { ReviewItem } from '@/lib/api'
import { ReviewRow } from '@/components/review/ReviewRow'
import { cn } from '@/lib/utils'

interface UserLaneParkedProps {
  items: ReviewItem[]
  onOpenTicket: (lane: string, id: number) => void
  onChanged: () => void
}

export function UserLaneParked({ items, onOpenTicket, onChanged }: UserLaneParkedProps) {
  const [open, setOpen] = useState(false)

  if (items.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-md border border-ink-2 bg-ink-1 p-3">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between gap-2 text-left"
      >
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-sand">
          Parked in user lane — stalled, not urgent
        </h2>
        <span className="flex shrink-0 items-center gap-2">
          <span className="rounded-sm bg-ink-2 px-1.5 py-0.5 text-[11px] font-semibold text-sand">
            {items.length}
          </span>
          <ChevronDown className={cn('size-3.5 text-sand transition-transform', open && 'rotate-180')} />
        </span>
      </button>

      {open && (
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1 pt-1">
          {items.map((item) => (
            <ReviewRow key={item.id} item={item} onOpen={onOpenTicket} onChanged={onChanged} />
          ))}
        </div>
      )}
    </div>
  )
}
