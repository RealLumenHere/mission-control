import { useEffect, useMemo, useRef, useState } from 'react'
import { X } from 'lucide-react'

import type { AgentsResponse, FleetResponse, QueueResponse, ReviewResponse, StateResponse, TaskStatus } from '@/lib/api'
import { useLane } from '@/hooks/useLane'
import { LaneStatusCards } from '@/components/workspace/LaneStatusCards'
import { TicketTable } from '@/components/workspace/TicketTable'
import { AddTicketDialog } from '@/components/workspace/AddTicketDialog'
import { XRayDrawer } from '@/components/xray/XRayDrawer'
import { ReviewQueue } from '@/components/review/ReviewQueue'
import { UpNextQueue } from '@/components/workspace/UpNextQueue'
import { displayStatus } from '@/components/workspace/StatusTag'

const LANE_POLL_MS = 5000

interface WorkspaceViewProps {
  state: StateResponse | null
  review: ReviewResponse | null
  queue: QueueResponse | null
  agents: AgentsResponse | null
  onReviewChanged: () => void
  selectedLane: string | null
  onSelectLane: (lane: string | null) => void
  fleet: FleetResponse | null
  hostFilter: string | null
  onClearHost: () => void
  onTicketFocus: (id: number | null) => void
}

function HostFilterChip({ host, onClear }: { host: string; onClear: () => void }) {
  return (
    <button
      onClick={onClear}
      className="flex items-center gap-1.5 rounded-sm border border-rust/60 bg-ink-2 px-2 py-1 text-[11px] text-bone"
    >
      <span className="text-sand">host</span>
      {host}
      <X className="size-3 text-sand" />
    </button>
  )
}

export function WorkspaceView({
  state,
  review,
  queue,
  agents,
  onReviewChanged,
  selectedLane,
  onSelectLane,
  fleet,
  hostFilter,
  onClearHost,
  onTicketFocus,
}: WorkspaceViewProps) {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | null>(null)
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)

  const { data: lane, refetch: refetchLane } = useLane(selectedLane, LANE_POLL_MS)
  const hostAgents = useMemo(
    () => (hostFilter ? (fleet?.nodes[hostFilter]?.agents ?? []) : null),
    [hostFilter, fleet],
  )

  // A cross-lane dep-link click (navigate()) changes lane + ticket together —
  // this flag tells the lane-change effect below not to clobber that ticket
  // selection the way a plain sidebar/lane-card click should.
  const navigatingRef = useRef(false)

  // Cross-filter (T5): the Fleet pane highlights whichever host is running the
  // selected ticket's agent — reported up so it can survive a Fleet<->Workspace
  // view switch (this component unmounts on switch, AppShell state doesn't).
  function selectTicket(id: number | null) {
    setSelectedTicketId(id)
    onTicketFocus(id)
  }

  useEffect(() => {
    setStatusFilter(null)
    if (navigatingRef.current) {
      navigatingRef.current = false
    } else {
      selectTicket(null)
    }
    // selectTicket is a plain function recreated each render (not a stable
    // dependency) — this effect only cares about `selectedLane` changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLane])

  const filtered = useMemo(() => {
    if (!lane) return []
    let out = lane.tickets
    if (statusFilter) out = out.filter((t) => displayStatus(t) === statusFilter || t.status === statusFilter)
    if (hostAgents) {
      const ids = new Set(hostAgents.map((a) => a.id))
      out = out.filter((t) => ids.has(t.id))
    }
    return out
  }, [lane, statusFilter, hostAgents])

  const counts = useMemo(() => {
    const c: Partial<Record<TaskStatus, number>> = {}
    for (const t of lane?.tickets ?? []) c[t.status as TaskStatus] = (c[t.status as TaskStatus] ?? 0) + 1
    if (lane) c.done = lane.done_total
    return c
  }, [lane])

  const selectedTicket = lane?.tickets.find((t) => t.id === selectedTicketId) ?? null

  function navigate(targetLane: string, id: number) {
    if (targetLane !== selectedLane) {
      navigatingRef.current = true
      onSelectLane(targetLane)
    }
    selectTicket(id)
  }

  if (!selectedLane) {
    const laneNames = state ? Object.keys(state.lanes).sort() : []

    if (hostFilter) {
      return (
        <div className="flex flex-1 flex-col gap-3 overflow-auto p-4">
          <HostFilterChip host={hostFilter} onClear={onClearHost} />
          {hostAgents && hostAgents.length > 0 ? (
            <div className="flex flex-col overflow-hidden rounded-md border border-ink-2">
              {hostAgents.map((a) => (
                <button
                  key={a.id}
                  onClick={() => navigate(a.lane, a.id)}
                  className="flex items-center gap-3 border-b border-ink-2/60 px-2 py-1.5 text-left text-[12px] last:border-b-0 hover:bg-ink-1"
                >
                  <span className="tabular-nums text-sand">#{a.id}</span>
                  <span className="w-32 shrink-0 truncate text-sand">{a.lane}</span>
                  <span className="flex-1 truncate text-bone">{a.title}</span>
                  <span className="shrink-0 truncate text-sand/70">{a.claimed_by}</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-ink-2 text-[12px] text-sand/60">
              no tasks executing on {hostFilter}
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
        <ReviewQueue review={review} onOpenTicket={navigate} onChanged={onReviewChanged} />

        {/* wq#1365: the queue itself, not just per-lane counts — this is the
            "what's actually in line to get done" view Frank has to click into
            every lane to reconstruct otherwise. */}
        <UpNextQueue queue={queue} onOpenTicket={navigate} />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {laneNames.map((l) => {
            const c = state?.lanes[l] ?? {}
            return (
              <button
                key={l}
                onClick={() => onSelectLane(l)}
                className="flex flex-col items-start gap-2 rounded-md border border-ink-2 bg-ink-1 p-3 text-left transition-colors hover:border-rust/60"
              >
                <div className="truncate text-[12px] font-semibold text-bone">{l}</div>
                <div className="flex gap-3 text-[11px] text-sand">
                  <span>open {c.open ?? 0}</span>
                  <span>claimed {c.claimed ?? 0}</span>
                  <span>blocked {c.blocked ?? 0}</span>
                  <span>done {c.done ?? 0}</span>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
      <div className="flex items-center justify-between gap-3">
        <LaneStatusCards
          counts={counts}
          active={statusFilter}
          onToggle={(s) => setStatusFilter((cur) => (cur === s ? null : s))}
        />
        <div className="flex shrink-0 items-center gap-2">
          {hostFilter && <HostFilterChip host={hostFilter} onClear={onClearHost} />}
          <AddTicketDialog lane={selectedLane} onAdded={refetchLane} />
        </div>
      </div>

      <TicketTable
        tickets={filtered}
        now={lane?.now ?? null}
        selectedId={selectedTicketId}
        onSelect={selectTicket}
      />

      <XRayDrawer
        ticket={selectedTicket}
        now={lane?.now ?? null}
        agents={agents}
        onOpenChange={(open) => !open && selectTicket(null)}
        onNavigate={navigate}
        onChanged={refetchLane}
      />
    </div>
  )
}
