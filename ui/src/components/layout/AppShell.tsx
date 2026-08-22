import { useState } from 'react'
import { Toaster } from 'sonner'

import { Sidebar } from '@/components/layout/Sidebar'
import { ViewSwitch, type ArenaView } from '@/components/layout/ViewSwitch'
import { WorkspaceView } from '@/components/workspace/WorkspaceView'
import { FleetView } from '@/components/fleet/FleetView'
import { TooltipProvider } from '@/components/ui/tooltip'
import { usePoll } from '@/hooks/usePoll'
import { fetchAgents, fetchState } from '@/lib/api'

const STATE_POLL_MS = 5000
const AGENTS_POLL_MS = 5000

export function AppShell() {
  const [view, setView] = useState<ArenaView>('workspace')
  const [selectedLane, setSelectedLane] = useState<string | null>(null)

  const { data: state, refetch: refetchState } = usePoll(fetchState, STATE_POLL_MS)
  const { data: agents } = usePoll(fetchAgents, AGENTS_POLL_MS)

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-ink-0 text-bone">
        <Toaster theme="dark" position="bottom-right" />
        <Sidebar
          state={state}
          agents={agents}
          selectedLane={selectedLane}
          onSelectLane={setSelectedLane}
          onProjectAdded={refetchState}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-ink-2 px-4 py-2.5">
            <span className="text-[12px] text-sand">
              {selectedLane ?? 'all lanes'}
            </span>
            <ViewSwitch view={view} onChange={setView} />
          </header>

          {view === 'workspace' ? (
            <WorkspaceView state={state} selectedLane={selectedLane} onSelectLane={setSelectedLane} />
          ) : (
            <FleetView />
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
