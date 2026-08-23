import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { AgentsResponse, Ticket } from '@/lib/api'
import { MetadataTab } from '@/components/xray/MetadataTab'
import { TerminalTab } from '@/components/xray/TerminalTab'
import { ReportsTab } from '@/components/xray/ReportsTab'
import { DecisionTab } from '@/components/xray/DecisionTab'

interface XRayDrawerProps {
  ticket: Ticket | null
  now: string | null
  agents: AgentsResponse | null
  onOpenChange: (open: boolean) => void
  onNavigate: (lane: string, id: number) => void
  onChanged: () => void
}

export function XRayDrawer({ ticket, now, agents, onOpenChange, onNavigate, onChanged }: XRayDrawerProps) {
  return (
    <Sheet open={ticket !== null} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        {ticket && (
          <>
            <SheetHeader>
              <SheetTitle>
                #{ticket.id} {ticket.title}
              </SheetTitle>
              <SheetDescription>{ticket.lane}</SheetDescription>
            </SheetHeader>

            <Tabs
              key={ticket.id}
              defaultValue={ticket.gate_type === 'frank_decision' ? 'decision' : 'metadata'}
              className="flex flex-1 flex-col overflow-hidden px-4 pb-4"
            >
              <TabsList>
                {ticket.gate_type === 'frank_decision' && <TabsTrigger value="decision">Decision</TabsTrigger>}
                <TabsTrigger value="metadata">Metadata</TabsTrigger>
                <TabsTrigger value="terminal">Terminal</TabsTrigger>
                <TabsTrigger value="reports">Reports</TabsTrigger>
              </TabsList>

              {ticket.gate_type === 'frank_decision' && (
                <TabsContent value="decision" className="overflow-auto">
                  <DecisionTab ticket={ticket} onChanged={onChanged} />
                </TabsContent>
              )}
              <TabsContent value="metadata" className="overflow-auto">
                <MetadataTab ticket={ticket} now={now} onNavigate={onNavigate} onChanged={onChanged} />
              </TabsContent>
              <TabsContent value="terminal" className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <TerminalTab ticket={ticket} agents={agents} />
              </TabsContent>
              <TabsContent value="reports" className="overflow-auto">
                <ReportsTab ticket={ticket} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}
