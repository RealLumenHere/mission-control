// A collapsible, labeled review section. Generalized from UserLaneParked so the
// review page can show Gated / Blocked / Parked each in its own box below the
// always-open Decisions queue (Frank 2026-09-09: stop lumping everything together).
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

import type { ReviewItem } from '@/lib/api'
import { ReviewRow } from '@/components/review/ReviewRow'
import { cn } from '@/lib/utils'

interface ReviewSectionProps {
  title: string
  items: ReviewItem[]
  tone?: 'urgent' | 'warn' | 'muted'
  defaultOpen?: boolean
  onOpenTicket: (lane: string, id: number) => void
  onChanged: () => void
}

export function ReviewSection({ title, items, tone = 'muted', defaultOpen = false, onOpenTicket, onChanged }: ReviewSectionProps) {
  const [open, setOpen] = useState(defaultOpen)
  if (items.length === 0) return null

  const border = tone === 'warn' ? 'border-amber-500/40' : 'border-ink-2'
  const label = tone === 'warn' ? 'text-amber-300' : 'text-sand'
  const badge = tone === 'warn' ? 'bg-amber-500/20 text-amber-200' : 'bg-ink-2 text-sand'

  return (
    <div className={cn('flex flex-col gap-2 rounded-md border bg-ink-1 p-3', border)}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center justify-between gap-2 text-left">
        <h2 className={cn('text-[12px] font-semibold uppercase tracking-wide', label)}>{title}</h2>
        <span className="flex shrink-0 items-center gap-2">
          <span className={cn('rounded-sm px-1.5 py-0.5 text-[11px] font-semibold', badge)}>{items.length}</span>
          <ChevronDown className={cn('size-3.5 transition-transform', label, open && 'rotate-180')} />
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
