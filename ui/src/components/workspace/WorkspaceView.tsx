import { useEffect, useMemo, useRef, useState } from 'react'

import type { ReviewResponse, StateResponse, TaskStatus } from '@/lib/api'
import { useLane } from '@/hooks/useLane'
import { LaneStatusCards } from '@/components/workspace/LaneStatusCards'
import { TicketTable } from '@/components/workspace/TicketTable'
import { AddTicketDialog } from '@/components/workspace/AddTicketDialog'
import { XRayDrawer } from '@/components/xray/XRayDrawer'
import { ReviewQueue } from '@/components/review/ReviewQueue'
import { displayStatus } from '@/components/workspace/StatusTag'

const LANE_POLL_MS = 5000

interface WorkspaceViewProps {
  state: StateResponse | null
  review: ReviewResponse | null
  onReviewChanged: () => void
  selectedLane: string | null
  onSelectLane: (lane: string | null) => void
}

export function WorkspaceView({
  state,
  review,
  onReviewChanged,
  selectedLane,
  onSelectLane,
}: WorkspaceViewProps) {
  const [statusFilter, setStatusFilter] = useState<TaskStatus | null>(null)
  const [selectedTicketId, setSelectedTicketId] = useState<number | null>(null)

  const { data: lane, refetch: refetchLane } = useLane(selectedLane, LANE_POLL_MS)

  // A cross-lane dep-link click (navigate()) changes lane + ticket together —
  // this flag tells the lane-change effect below not to clobber that ticket
  // selection the way a plain sidebar/lane-card click should.
  const navigatingRef = useRef(false)

  useEffect(() => {
    setStatusFilter(null)
    if (navigatingRef.current) {
      navigatingRef.current = false
    } else {
      setSelectedTicketId(null)
    }
  }, [selectedLane])

  const filtered = useMemo(() => {
    if (!lane) return []
    if (!statusFilter) return lane.tickets
    return lane.tickets.filter((t) => displayStatus(t) === statusFilter || t.status === statusFilter)
  }, [lane, statusFilter])

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
    setSelectedTicketId(id)
  }

  if (!selectedLane) {
    const laneNames = state ? Object.keys(state.lanes).sort() : []
    return (
      <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
        <ReviewQueue review={review} onOpenTicket={navigate} onChanged={onReviewChanged} />

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
        <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-ink-2 text-[12px] text-sand/60">
          select a lane to view its ticket workspace
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden p-4">
      <div className="flex items-center justify-between">
        <LaneStatusCards
          counts={counts}
          active={statusFilter}
          onToggle={(s) => setStatusFilter((cur) => (cur === s ? null : s))}
        />
        <AddTicketDialog lane={selectedLane} onAdded={refetchLane} />
      </div>

      <TicketTable
        tickets={filtered}
        now={lane?.now ?? null}
        selectedId={selectedTicketId}
        onSelect={setSelectedTicketId}
      />

      <XRayDrawer
        ticket={selectedTicket}
        now={lane?.now ?? null}
        onOpenChange={(open) => !open && setSelectedTicketId(null)}
        onNavigate={navigate}
        onChanged={refetchLane}
      />
    </div>
  )
}
