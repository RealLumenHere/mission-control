import type { ReactNode } from 'react'

import { LaneList } from '@/components/layout/LaneList'
import { GovernorBars } from '@/components/layout/GovernorBars'
import { HeldSlocks } from '@/components/layout/HeldSlocks'
import { ExternalLinks } from '@/components/layout/ExternalLinks'
import { NewProjectDialog } from '@/components/layout/NewProjectDialog'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { AgentsResponse, StateResponse } from '@/lib/api'

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
