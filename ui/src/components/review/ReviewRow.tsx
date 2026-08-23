import { useState } from 'react'

import type { ReviewItem, ReviewKind } from '@/lib/api'
import { ticketBlock, ticketEdit, ticketRelease } from '@/lib/api'
import { runWrite } from '@/lib/toast'
import { formatAge } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ReasonDialog } from '@/components/xray/ActionDialogs'
import { cn } from '@/lib/utils'

const KIND_LABEL: Record<ReviewKind, string> = {
  blocked_human: 'blocked · human',
  user_lane: 'user lane',
  gated: 'gate unmet',
  frank_decision: 'decision',
}

const KIND_CLASS: Record<ReviewKind, string> = {
  blocked_human: 'text-status-blocked',
  gated: 'text-status-claimed',
  user_lane: 'text-rust',
  frank_decision: 'text-rust',
}

interface ReviewRowProps {
  item: ReviewItem
  onOpen: (lane: string, id: number) => void
  onChanged: () => void
}

export function ReviewRow({ item, onOpen, onChanged }: ReviewRowProps) {
  const [rejectOpen, setRejectOpen] = useState(false)
  const [deferOpen, setDeferOpen] = useState(false)
  const [approving, setApproving] = useState(false)
  const isDecision = item.kinds.includes('frank_decision')

  async function approve() {
    setApproving(true)
    const label = `approve #${item.id}`
    let ok: boolean
    if (item.status === 'blocked') {
      ok = await runWrite(label, ticketRelease(item.id))
    } else if (item.gate) {
      ok = await runWrite(label, ticketEdit(item.id, { gate: '' }))
    } else if (item.kinds.includes('user_lane')) {
      ok = await runWrite(label, ticketEdit(item.id, { lane: 'build' }))
    } else {
      ok = await runWrite(label, ticketEdit(item.id, { gate: '' }))
    }
    setApproving(false)
    if (ok) onChanged()
  }

  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-ink-2 bg-ink-1 p-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.kinds.map((k) => (
            <span
              key={k}
              className={cn('text-[11px] font-semibold uppercase tracking-wide', KIND_CLASS[k])}
            >
              {KIND_LABEL[k]}
            </span>
          ))}
          <span className="text-[11px] text-sand/60">{item.lane}</span>
        </div>

        <button
          onClick={() => onOpen(item.lane, item.id)}
          className="truncate text-left text-[13px] font-semibold text-bone hover:text-rust"
        >
          #{item.id} {item.title}
        </button>

        <p className="truncate text-[12px] text-sand" title={item.reason}>
          {item.reason}
        </p>

        <div className="flex items-center gap-3 text-[11px] text-sand/70">
          <span>waiting {formatAge(item.age_days)}</span>
          {item.downstream_count > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="cursor-default underline decoration-dotted">
                  blocks {item.downstream_count} downstream
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <div className="flex flex-col gap-0.5">
                  {item.downstream.map((d) => (
                    <span key={d.id}>
                      #{d.id} {d.title} ({d.lane})
                    </span>
                  ))}
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {isDecision ? (
        // wq#663: the real action here is answering the decision prompt, which
        // needs its own text box (X-Ray Decision tab) — not a generic block/gate op.
        <div className="flex shrink-0">
          <Button size="sm" onClick={() => onOpen(item.lane, item.id)}>
            Answer
          </Button>
        </div>
      ) : (
        <>
          <div className="flex shrink-0 gap-1.5">
            <Button size="sm" disabled={approving} onClick={approve}>
              Approve
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDeferOpen(true)}>
              Defer
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setRejectOpen(true)}>
              Reject
            </Button>
          </div>

          <ReasonDialog
            open={rejectOpen}
            onOpenChange={setRejectOpen}
            title={`Reject #${item.id}`}
            description="Blocks the ticket with this reason via wq block — releases held subsystem locks."
            label="reason"
            placeholder="why this is a no"
            required
            confirmLabel="Reject"
            destructive
            onConfirm={(reason) =>
              runWrite(`reject #${item.id}`, ticketBlock(item.id, `REJECTED: ${reason}`)).then((ok) => {
                if (ok) onChanged()
                return ok
              })
            }
          />

          <ReasonDialog
            open={deferOpen}
            onOpenChange={setDeferOpen}
            title={`Defer #${item.id}`}
            description="Blocks the ticket with this reason via wq block — revisit later, releases held subsystem locks."
            label="reason"
            placeholder="not now — revisit when…"
            required
            confirmLabel="Defer"
            onConfirm={(reason) =>
              runWrite(`defer #${item.id}`, ticketBlock(item.id, `DEFERRED: ${reason}`)).then((ok) => {
                if (ok) onChanged()
                return ok
              })
            }
          />
        </>
      )}
    </div>
  )
}
