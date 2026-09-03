import { useEffect, useState } from 'react'
import { Toaster } from 'sonner'

import { Sidebar } from '@/components/layout/Sidebar'
import { ViewSwitch, type ArenaView } from '@/components/layout/ViewSwitch'
import { WorkspaceView } from '@/components/workspace/WorkspaceView'
import { FleetView } from '@/components/fleet/FleetView'
import { TooltipProvider } from '@/components/ui/tooltip'
import { usePoll } from '@/hooks/usePoll'
import { fetchAgents, fetchFleet, fetchQueue, fetchReview, fetchState } from '@/lib/api'
import { splitReview } from '@/lib/review'

const STATE_POLL_MS = 5000
const AGENTS_POLL_MS = 5000
const REVIEW_POLL_MS = 5000
const FLEET_POLL_MS = 10000
const QUEUE_POLL_MS = 5000

export function AppShell() {
  const [view, setView] = useState<ArenaView>('workspace')
  const [selectedLane, setSelectedLane] = useState<string | null>(null)
  const [hostFilter, setHostFilter] = useState<string | null>(null)
  const [focusedTicketId, setFocusedTicketId] = useState<number | null>(null)

  // GET /lane/{lane} (server deeplink, e.g. from wq or an external link) redirects
  // here as /#/lane/{lane} — pick that lane up once on load, then drop the hash so
  // it doesn't fight with in-app navigation.
  useEffect(() => {
    const m = /^#\/lane\/(.+)$/.exec(window.location.hash)
    if (m) {
      setSelectedLane(decodeURIComponent(m[1]))
      history.replaceState(null, '', window.location.pathname + window.location.search)
    }
  }, [])

  const { data: state, refetch: refetchState } = usePoll(fetchState, STATE_POLL_MS)
  const { data: agents } = usePoll(fetchAgents, AGENTS_POLL_MS)
  const { data: review, refetch: refetchReview } = usePoll(fetchReview, REVIEW_POLL_MS)
  const { data: fleet } = usePoll(fetchFleet, FLEET_POLL_MS)
  const { data: queue } = usePoll(fetchQueue, QUEUE_POLL_MS)

  function selectHost(host: string) {
    setHostFilter((cur) => {
      const next = cur === host ? null : host
      if (next) setView('workspace')
      return next
    })
  }

  const highlightHosts = fleet
    ? Object.entries(fleet.nodes)
        .filter(([, node]) => node.agents.some((a) => a.id === focusedTicketId))
        .map(([host]) => host)
    : []

  function goToReview() {
    setView('workspace')
    setSelectedLane(null)
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen w-screen overflow-hidden bg-ink-0 text-bone">
        <Toaster theme="dark" position="bottom-right" />
        <Sidebar
          state={state}
          agents={agents}
          reviewCount={review ? splitReview(review).decisions.length : null}
          selectedLane={selectedLane}
          onSelectLane={setSelectedLane}
          onProjectAdded={refetchState}
          onReviewClick={goToReview}
        />

        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex items-center justify-between border-b border-ink-2 px-4 py-2.5">
            <span className="text-[12px] text-sand">
              {selectedLane ?? 'all lanes'}
            </span>
            <ViewSwitch view={view} onChange={setView} />
          </header>

          {view === 'workspace' ? (
            <WorkspaceView
              state={state}
              review={review}
              queue={queue}
              agents={agents}
              onReviewChanged={refetchReview}
              selectedLane={selectedLane}
              onSelectLane={setSelectedLane}
              fleet={fleet}
              hostFilter={hostFilter}
              onClearHost={() => setHostFilter(null)}
              onTicketFocus={setFocusedTicketId}
            />
          ) : (
            <FleetView
              fleet={fleet}
              hostFilter={hostFilter}
              highlightHosts={highlightHosts}
              onSelectHost={selectHost}
            />
          )}
        </div>
      </div>
    </TooltipProvider>
  )
}
