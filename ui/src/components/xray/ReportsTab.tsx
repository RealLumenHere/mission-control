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

export function ReportsTab({ ticket }: { ticket: Ticket }) {
  const linked = useMemo(() => reportRefs(ticket), [ticket])
  const [browsing, setBrowsing] = useState(linked.length === 0)
  const [allReports, setAllReports] = useState<ReportMeta[] | null>(null)
  const [active, setActive] = useState<string | null>(linked[0] ?? null)

  useEffect(() => {
    if (!browsing || allReports) return
    fetchReports()
      .then((r) => setAllReports(r.reports))
      .catch(() => setAllReports([]))
  }, [browsing, allReports])

  const names = browsing ? (allReports ?? []).map((r) => r.name) : linked

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex flex-wrap gap-1.5">
          {names.length === 0 && (
            <span className="text-[12px] text-sand/60">
              {browsing ? 'no reports found' : 'no reports/*.md|.diff refs in this ticket'}
            </span>
          )}
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
        {linked.length > 0 && (
          <button
            onClick={() => setBrowsing((b) => !b)}
            className="shrink-0 text-[11px] text-rust hover:underline"
          >
            {browsing ? 'linked reports' : 'browse all reports'}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {active ? <ReportBody name={active} /> : (
          <div className="text-[12px] text-sand/60">select a report above</div>
        )}
      </div>
    </div>
  )
}
