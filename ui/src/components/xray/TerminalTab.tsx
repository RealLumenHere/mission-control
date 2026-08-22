import type { Ticket } from '@/lib/api'

export function TerminalTab({ ticket }: { ticket: Ticket }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ink-2 p-6 text-center text-[12px] text-sand/60">
      <span>live agent transcript (xterm.js, SSE tail) lands in T3</span>
      {ticket.claimed_by && <span className="text-sand/40">worker: {ticket.claimed_by}</span>}
    </div>
  )
}
