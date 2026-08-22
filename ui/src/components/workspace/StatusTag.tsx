import type { Ticket } from '@/lib/api'
import { parseDepIds, useDepInfo } from '@/hooks/useDepInfo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type DisplayStatus = Ticket['status'] | 'open-dependent'

export function displayStatus(t: Pick<Ticket, 'status' | 'deps_met'>): DisplayStatus {
  return t.status === 'open' && t.deps_met === false ? 'open-dependent' : t.status
}

const DOT: Record<string, string> = {
  open: 'bg-status-open',
  claimed: 'bg-status-claimed',
  blocked: 'bg-status-blocked',
  'open-dependent': 'bg-status-open-dependent',
  done: 'bg-status-done',
  rejected: 'bg-status-blocked',
}

const TEXT: Record<string, string> = {
  open: 'text-status-open',
  claimed: 'text-status-claimed',
  blocked: 'text-status-blocked',
  'open-dependent': 'text-status-open-dependent',
  done: 'text-status-done',
  rejected: 'text-status-blocked',
}

interface StatusTagProps {
  ticket: Pick<Ticket, 'status' | 'deps_met' | 'deps' | 'notes'>
}

export function StatusTag({ ticket }: StatusTagProps) {
  const status = displayStatus(ticket)
  const needsTooltip = status === 'blocked' || status === 'open-dependent'
  const depIds = needsTooltip ? parseDepIds(ticket.deps) : []
  const depInfo = useDepInfo(depIds)

  const badge = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border border-ink-2 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        TEXT[status],
      )}
    >
      <span className={cn('size-1.5 rounded-full', DOT[status])} />
      {status}
    </span>
  )

  if (!needsTooltip) return badge

  const unmet = depIds
    .map((id) => ({ id, ref: depInfo.get(id) }))
    .filter((d) => !d.ref || d.ref === 'error' || d.ref.status !== 'done')

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>
        <div className="flex flex-col gap-1">
          {status === 'blocked' && ticket.notes && (
            <div className="text-bone">
              <span className="text-sand">reason: </span>
              {ticket.notes}
            </div>
          )}
          {unmet.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              <span className="text-sand">unmet deps:</span>
              {unmet.map(({ id, ref }) => (
                <span key={id}>
                  #{id} {ref && ref !== 'error' ? `${ref.title} (${ref.status})` : '(loading…)'}
                </span>
              ))}
            </div>
          ) : (
            status === 'open-dependent' && <span className="text-sand">resolving deps…</span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
