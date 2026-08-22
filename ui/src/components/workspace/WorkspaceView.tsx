import type { StateResponse } from '@/lib/api'

interface WorkspaceViewProps {
  state: StateResponse | null
  selectedLane: string | null
}

export function WorkspaceView({ state, selectedLane }: WorkspaceViewProps) {
  const laneNames = selectedLane
    ? [selectedLane]
    : state
      ? Object.keys(state.lanes).sort()
      : []

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {laneNames.map((lane) => {
          const counts = state?.lanes[lane] ?? {}
          return (
            <div key={lane} className="rounded-md border border-ink-2 bg-ink-1 p-3">
              <div className="truncate text-[12px] font-semibold text-bone">{lane}</div>
              <div className="mt-2 flex gap-3 text-[11px] text-sand">
                <span>open {counts.open ?? 0}</span>
                <span>claimed {counts.claimed ?? 0}</span>
                <span>blocked {counts.blocked ?? 0}</span>
                <span>done {counts.done ?? 0}</span>
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-ink-2 text-[12px] text-sand/60">
        ticket list (TanStack Table + Virtual) — T2
      </div>
    </div>
  )
}
