// wq#1365 — landing-page cross-lane queue: Frank had to click into every lane
// to see what's actually up next; this answers that in one glance from /api/queue
// (open+claimed tickets, every lane, same effective_pri/deps_met sort as a lane view).
import type { QueueResponse } from '@/lib/api'
import { StatusTag } from '@/components/workspace/StatusTag'

interface UpNextQueueProps {
  queue: QueueResponse | null
  onOpenTicket: (lane: string, id: number) => void
}

export function UpNextQueue({ queue, onOpenTicket }: UpNextQueueProps) {
  const tickets = queue?.tickets ?? []

  return (
    <div className="flex flex-col gap-2 rounded-md border border-ink-2 bg-ink-1 p-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-bone">
          Up next — across all lanes
        </h2>
        <span className="rounded-sm bg-ink-2 px-1.5 py-0.5 text-[11px] font-semibold text-sand">
          {tickets.length}
        </span>
      </div>

      {tickets.length === 0 ? (
        <div className="rounded-md border border-dashed border-ink-2 px-3 py-4 text-center text-[12px] text-sand/60">
          queue is empty — nothing open or claimed right now
        </div>
      ) : (
        <div className="flex max-h-96 flex-col overflow-y-auto rounded-md border border-ink-2">
          {tickets.map((t) => (
            <button
              key={t.id}
              onClick={() => onOpenTicket(t.lane, t.id)}
              className="flex items-center gap-3 border-b border-ink-2/60 px-2 py-1.5 text-left text-[12px] last:border-b-0 hover:bg-ink-2"
            >
              <span className="w-10 shrink-0 tabular-nums text-sand">#{t.id}</span>
              <span className="w-8 shrink-0 tabular-nums text-sand" title="effective priority">
                {t.effective_pri}
              </span>
              <span className="w-24 shrink-0 truncate text-sand">{t.lane}</span>
              <StatusTag ticket={t} />
              <span className="flex-1 truncate text-bone">{t.title}</span>
              {t.claimed_by && (
                <span className="shrink-0 truncate text-sand/60">{t.claimed_by}</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
