import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Ticket } from '@/lib/api'
import { MetadataTab } from '@/components/xray/MetadataTab'
import { TerminalTab } from '@/components/xray/TerminalTab'
import { ReportsTab } from '@/components/xray/ReportsTab'

interface XRayDrawerProps {
  ticket: Ticket | null
  now: string | null
  onOpenChange: (open: boolean) => void
  onNavigate: (lane: string, id: number) => void
  onChanged: () => void
}

export function XRayDrawer({ ticket, now, onOpenChange, onNavigate, onChanged }: XRayDrawerProps) {
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

            <Tabs defaultValue="metadata" className="flex flex-1 flex-col overflow-hidden px-4 pb-4">
              <TabsList>
                <TabsTrigger value="metadata">Metadata</TabsTrigger>
                <TabsTrigger value="terminal">Terminal</TabsTrigger>
                <TabsTrigger value="reports">Reports</TabsTrigger>
              </TabsList>

              <TabsContent value="metadata" className="overflow-auto">
                <MetadataTab ticket={ticket} now={now} onNavigate={onNavigate} onChanged={onChanged} />
              </TabsContent>
              <TabsContent value="terminal" className="flex overflow-auto">
                <TerminalTab ticket={ticket} />
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
