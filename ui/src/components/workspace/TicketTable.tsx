import { useMemo, useRef, useState } from 'react'
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowDown, ArrowUp } from 'lucide-react'

import type { Ticket } from '@/lib/api'
import { cn } from '@/lib/utils'
import { leaseCountdown } from '@/lib/format'
import { StatusTag, displayStatus } from '@/components/workspace/StatusTag'
import { useMediaQuery } from '@/hooks/useMediaQuery'

// Narrow-viewport polish (wq#748): the agent/lease column is the least
// essential at a glance (full detail lives in the X-Ray drawer) — drop it
// first so id/pri/status/title stay legible without horizontal scroll.
const NARROW_TABLE = '(max-width: 640px)'

interface TicketTableProps {
  tickets: Ticket[]
  now: string | null
  selectedId: number | null
  onSelect: (id: number) => void
}

const ROW_HEIGHT = 32

export function TicketTable({ tickets, now, selectedId, onSelect }: TicketTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  const columns = useMemo<ColumnDef<Ticket>[]>(
    () => [
      {
        id: 'id',
        header: '#',
        accessorKey: 'id',
        size: 56,
        cell: (ctx) => <span className="tabular-nums text-sand">{ctx.getValue<number>()}</span>,
      },
      {
        id: 'effective_pri',
        header: 'pri',
        accessorKey: 'effective_pri',
        size: 44,
        cell: (ctx) => <span className="tabular-nums">{ctx.getValue<number>()}</span>,
      },
      {
        id: 'status',
        header: 'status',
        accessorFn: (t) => displayStatus(t),
        size: 152,
        cell: (ctx) => <StatusTag ticket={ctx.row.original} />,
      },
      {
        id: 'title',
        header: 'title',
        accessorKey: 'title',
        cell: (ctx) => <span className="truncate text-bone">{ctx.getValue<string>()}</span>,
      },
      {
        id: 'agent',
        header: 'agent / lease',
        accessorFn: (t) => t.claimed_by ?? '',
        size: 200,
        cell: (ctx) => {
          const t = ctx.row.original
          if (!t.claimed_by) return <span className="text-sand/50">—</span>
          const lease = leaseCountdown(t.lease_expires, now)
          return (
            <span className="truncate text-sand">
              {t.claimed_by}
              {lease && <span className="ml-1.5 text-sand/60">({lease})</span>}
            </span>
          )
        },
      },
    ],
    [now],
  )

  const narrow = useMediaQuery(NARROW_TABLE)

  const table = useReactTable({
    data: tickets,
    columns,
    state: { sorting, columnVisibility: { agent: !narrow } },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    // sorting: [] keeps the server-supplied row order (status-group ->
    // effective_pri -> age); a column click layers a client-side sort on top.
    enableSortingRemoval: true,
  })

  const rows = table.getRowModel().rows

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  })
  const virtualRows = virtualizer.getVirtualItems()
  const totalHeight = virtualizer.getTotalSize()
  const padTop = virtualRows.length > 0 ? virtualRows[0].start : 0
  const padBottom = virtualRows.length > 0 ? totalHeight - virtualRows[virtualRows.length - 1].end : 0

  if (tickets.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-ink-2 text-[12px] text-sand/60">
        no tickets match
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-md border border-ink-2">
      <div className="flex border-b border-ink-2 bg-ink-1">
        {table.getHeaderGroups().map((hg) =>
          hg.headers.map((header) => (
            <button
              key={header.id}
              onClick={header.column.getToggleSortingHandler()}
              className={cn(
                'flex shrink-0 items-center gap-1 px-2 py-1.5 text-left text-[11px] font-semibold text-sand uppercase tracking-wide hover:text-bone',
                header.column.id === 'title' && 'flex-1',
              )}
              style={{ width: header.column.id === 'title' ? undefined : header.getSize() }}
            >
              {flexRender(header.column.columnDef.header, header.getContext())}
              {header.column.getIsSorted() === 'asc' && <ArrowUp className="size-3" />}
              {header.column.getIsSorted() === 'desc' && <ArrowDown className="size-3" />}
            </button>
          )),
        )}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto">
        <div style={{ height: padTop }} />
        {virtualRows.map((vrow) => {
          const row = rows[vrow.index]
          const t = row.original
          return (
            <div
              key={row.id}
              role="button"
              tabIndex={0}
              aria-pressed={selectedId === t.id}
              onClick={() => onSelect(t.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect(t.id)
                }
              }}
              className={cn(
                'flex cursor-pointer items-center border-b border-ink-2/60 px-0 outline-none hover:bg-ink-1 focus-visible:bg-ink-2 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring',
                selectedId === t.id && 'bg-ink-2',
              )}
              style={{ height: ROW_HEIGHT }}
            >
              {row.getVisibleCells().map((cell) => (
                <div
                  key={cell.id}
                  className={cn('shrink-0 truncate px-2', cell.column.id === 'title' && 'flex-1')}
                  style={{ width: cell.column.id === 'title' ? undefined : cell.column.getSize() }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </div>
              ))}
            </div>
          )
        })}
        <div style={{ height: padBottom }} />
      </div>
    </div>
  )
}
