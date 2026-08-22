import type { ReactNode } from 'react'
import { InboxIcon } from 'lucide-react'

import { LaneList } from '@/components/layout/LaneList'
import { GovernorBars } from '@/components/layout/GovernorBars'
import { HeldSlocks } from '@/components/layout/HeldSlocks'
import { ExternalLinks } from '@/components/layout/ExternalLinks'
import { NewProjectDialog } from '@/components/layout/NewProjectDialog'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useMediaQuery } from '@/hooks/useMediaQuery'
import { cn } from '@/lib/utils'
import type { AgentsResponse, StateResponse } from '@/lib/api'

// Below this the full 256px sidebar leaves no usable room for the main arena
// (wq#748: 380px-width usability) — collapse to a 48px icon rail instead.
const RAIL_BREAKPOINT = '(max-width: 640px)'

interface SidebarProps {
  state: StateResponse | null
  agents: AgentsResponse | null
  reviewCount: number | null
  selectedLane: string | null
  onSelectLane: (lane: string | null) => void
  onProjectAdded: () => void
  onReviewClick: () => void
}

function SidebarSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 px-3 py-3">
      <h2 className="px-2 text-[11px] font-semibold tracking-wide text-sand uppercase">
        {title}
      </h2>
      {children}
    </div>
  )
}

export function Sidebar({
  state,
  agents,
  reviewCount,
  selectedLane,
  onSelectLane,
  onProjectAdded,
  onReviewClick,
}: SidebarProps) {
  const rail = useMediaQuery(RAIL_BREAKPOINT)

  if (rail) {
    const laneNames = state ? Object.keys(state.lanes).sort() : []
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center border-r border-ink-2 bg-ink-1 py-2">
        <span
          className="mb-2 flex size-8 items-center justify-center rounded-sm bg-ink-2 text-[13px] font-semibold text-bone"
          title="Mission Control"
        >
          M
        </span>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={onReviewClick}
              aria-label={`Review queue, ${reviewCount ?? 0} pending`}
              className="relative mb-2 flex size-8 items-center justify-center rounded-sm hover:bg-ink-2"
            >
              <InboxIcon className="size-4 text-bone" />
              {reviewCount !== null && reviewCount > 0 && (
                <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-rust" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Review ({reviewCount ?? '—'})</TooltipContent>
        </Tooltip>

        <Separator className="mb-2 w-8" />

        <ScrollArea className="flex-1 w-full">
          <div className="flex flex-col items-center gap-1 px-1">
            {laneNames.map((lane) => (
              <Tooltip key={lane}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onSelectLane(selectedLane === lane ? null : lane)}
                    aria-label={`Lane ${lane}`}
                    aria-pressed={selectedLane === lane}
                    className={cn(
                      'flex size-8 shrink-0 items-center justify-center rounded-sm text-[12px] font-semibold uppercase text-sand hover:bg-ink-2',
                      selectedLane === lane && 'bg-ink-2 text-bone',
                    )}
                  >
                    {lane.slice(0, 2)}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">{lane}</TooltipContent>
              </Tooltip>
            ))}
          </div>
        </ScrollArea>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-ink-2 bg-ink-1">
      <div className="flex items-center gap-2 border-b border-ink-2 px-3 py-3">
        <span className="text-[13px] font-semibold tracking-wide text-bone">
          MISSION CONTROL
        </span>
      </div>

      <button
        onClick={onReviewClick}
        className="flex items-center justify-between border-b border-ink-2 px-3 py-2.5 text-left hover:bg-ink-2"
      >
        <span className="text-[12px] font-semibold uppercase tracking-wide text-bone">Review</span>
        <span className="rounded-sm bg-rust px-1.5 py-0.5 text-[11px] font-semibold text-bone tabular-nums">
          {reviewCount ?? '—'}
        </span>
      </button>

      <ScrollArea className="flex-1">
        <SidebarSection title="Lanes">
          <LaneList lanes={state?.lanes ?? null} selected={selectedLane} onSelect={onSelectLane} />
          <NewProjectDialog onAdded={onProjectAdded} />
        </SidebarSection>

        <Separator />

        <SidebarSection title="Governor">
          <GovernorBars governor={agents?.governor ?? null} />
        </SidebarSection>

        <Separator />

        <SidebarSection title="Held slocks">
          <HeldSlocks slocks={state?.slocks ?? null} />
        </SidebarSection>
      </ScrollArea>

      <div className="border-t border-ink-2 px-1 py-2">
        <ExternalLinks proposalsPending={state?.proposals_pending ?? null} />
      </div>
    </aside>
  )
}
