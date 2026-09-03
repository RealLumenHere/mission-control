import { useEffect, useMemo, useState } from 'react'

import type { Ticket } from '@/lib/api'
import { fetchReport, fetchReports, type ReportMeta } from '@/lib/api'
import { MarkdownView } from '@/components/xray/MarkdownView'
import { DiffView } from '@/components/xray/DiffView'
import { cn } from '@/lib/utils'

const REPORT_REF_RE = /reports\/([A-Za-z0-9][A-Za-z0-9._-]*\.(?:md|diff|txt))/g

function reportRefs(ticket: Ticket): string[] {
  const text = `${ticket.notes ?? ''}\n${ticket.detail ?? ''}`
  const names = new Set<string>()
  for (const m of text.matchAll(REPORT_REF_RE)) names.add(m[1])
  return [...names]
}

// wq#1413: reports are conventionally named "{ticket_id}_description.md" (the
// ticket the report was filed FOR), occasionally with a second ticket referenced
// inline as "wq{id}" (e.g. "1237_judgment_wq1173_..." — filed for #1237, ABOUT
// #1173). Neither of those is "every report that exists", which is what the old
// fallback showed for any ticket with no literal reports/*.md text ref — the
// common case, since that ref is rare (verified: 0 of 573 reports matched #485).
function reportsForTicket(id: number, all: ReportMeta[]): ReportMeta[] {
  const prefix = `${id}_`
  const wqToken = new RegExp(`(^|[_-])wq?${id}([_.-]|$)`)
  const prefixed = all.filter((r) => r.name.startsWith(prefix))
  const referenced = all.filter((r) => !r.name.startsWith(prefix) && wqToken.test(r.name))
  return [...prefixed, ...referenced]
}

function ReportBody({ name }: { name: string }) {
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText(null)
    setError(null)
    fetchReport(name)
      .then((r) => setText(r.text))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
  }, [name])

  if (error) return <div className="text-[12px] text-status-blocked">{error}</div>
  if (text === null) return <div className="text-[12px] text-sand/60">loading…</div>
  return name.endsWith('.diff') ? <DiffView text={text} /> : <MarkdownView text={text} />
}

type Mode = 'linked' | 'ticket' | 'all'

export function ReportsTab({ ticket }: { ticket: Ticket }) {
  const linked = useMemo(() => reportRefs(ticket), [ticket])
  const [mode, setMode] = useState<Mode>(linked.length > 0 ? 'linked' : 'ticket')
  const [allReports, setAllReports] = useState<ReportMeta[] | null>(null)
  const [active, setActive] = useState<string | null>(linked[0] ?? null)

  useEffect(() => {
    if (mode === 'linked' || allReports) return
    fetchReports()
      .then((r) => setAllReports(r.reports))
      .catch(() => setAllReports([]))
  }, [mode, allReports])

  const ticketMatches = useMemo(
    () => (allReports ? reportsForTicket(ticket.id, allReports) : []),
    [allReports, ticket.id],
  )

  const names =
    mode === 'linked'
      ? linked
      : mode === 'ticket'
        ? ticketMatches.map((r) => r.name)
        : (allReports ?? []).map((r) => r.name)

  const loadingAll = mode !== 'linked' && allReports === null
  const emptyLabel =
    mode === 'linked'
      ? 'no reports/*.md|.diff refs in this ticket'
      : mode === 'ticket'
        ? loadingAll
          ? 'loading…'
          : `no reports found for #${ticket.id} — try browsing all reports`
        : 'no reports found'

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {names.length === 0 && <span className="text-[12px] text-sand/60">{emptyLabel}</span>}
          {names.map((name) => (
            <button
              key={name}
              onClick={() => setActive(name)}
              className={cn(
                'rounded-sm border border-ink-2 px-2 py-0.5 text-[11px] text-sand hover:border-rust/60',
                active === name && 'border-rust bg-ink-2 text-bone',
              )}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {linked.length > 0 && mode !== 'linked' && (
            <button onClick={() => setMode('linked')} className="text-[11px] text-rust hover:underline">
              linked reports
            </button>
          )}
          {mode !== 'ticket' && (
            <button onClick={() => setMode('ticket')} className="text-[11px] text-rust hover:underline">
              this ticket's reports
            </button>
          )}
          {mode !== 'all' && (
            <button onClick={() => setMode('all')} className="text-[11px] text-rust hover:underline">
              browse all reports{allReports ? ` (${allReports.length})` : ''}
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {active ? <ReportBody name={active} /> : (
          <div className="text-[12px] text-sand/60">select a report above</div>
        )}
      </div>
    </div>
  )
}
