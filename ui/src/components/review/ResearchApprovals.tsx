// wq#3771: research proposals the bridge parked on Frank (foreman
// research/MC_APPROVAL_PANEL_CONTRACT.md). Approve = wq answer + wq review accept;
// Reject = wq answer + bridge.py reject --class, which writes the rejection ledger
// the next research brief reads. Both run server-side in /api/research/{id}/*.
import { useState } from 'react'

import type { ResearchItem, ResearchResponse, WriteResult } from '@/lib/api'
import { researchApprove, researchReject } from '@/lib/api'
import { runWrite } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'

// Mirrors foreman research/ledger.py CLASS_RE; the suggestions are the contract's examples.
const CLASS_RE = /^[a-z0-9][a-z0-9_-]{0,31}$/
const CLASS_SUGGESTIONS = ['duplicate', 'out-of-scope', 'already-solved', 'wrong-arch']

function ResearchCard({ item, onChanged }: { item: ResearchItem; onChanged: () => void }) {
  const [text, setText] = useState('')
  const [rejectClass, setRejectClass] = useState('')
  const [showDetail, setShowDetail] = useState(false)
  const [busy, setBusy] = useState(false)

  const hasText = !!text.trim()
  const classOk = CLASS_RE.test(rejectClass)

  async function act(label: string, call: Promise<WriteResult>) {
    setBusy(true)
    const ok = await runWrite(label, call)
    setBusy(false)
    if (ok) {
      setText('')
      onChanged()
    }
  }

  const approve = () => act(`approve #${item.id}`, researchApprove(item.id, text))
  const reject = () => act(`reject #${item.id} (${rejectClass})`, researchReject(item.id, text, rejectClass))

  return (
    <div className="flex flex-col gap-2 rounded-md border border-ink-2 bg-ink-1 p-3">
      <div className="text-[13px] font-semibold text-bone">
        #{item.id} {item.proposal}
      </div>

      {item.decision_prompt && (
        <p className="whitespace-pre-wrap text-[13px] font-medium text-bone/90">{item.decision_prompt}</p>
      )}

      {item.detail && (
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setShowDetail((s) => !s)}
            aria-expanded={showDetail}
            className="w-fit text-[11px] font-semibold uppercase tracking-wide text-sand hover:text-rust"
          >
            {showDetail ? 'hide proposal' : 'show proposal'}
          </button>
          {showDetail && (
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-[12px] text-sand">{item.detail}</p>
          )}
        </div>
      )}

      <Textarea
        className="min-h-16"
        placeholder="your answer (recorded with wq answer; also the rejection reason)"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <Input
          className="h-8 w-40 text-[12px]"
          list={`reject-classes-${item.id}`}
          placeholder="reject class"
          value={rejectClass}
          onChange={(e) => setRejectClass(e.target.value.trim())}
          aria-invalid={!!rejectClass && !classOk}
        />
        <datalist id={`reject-classes-${item.id}`}>
          {CLASS_SUGGESTIONS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Button size="sm" variant="destructive" disabled={busy || !hasText || !classOk} onClick={reject}>
          Reject
        </Button>
        <Button size="sm" disabled={busy || !hasText} onClick={approve}>
          Approve
        </Button>
      </div>
    </div>
  )
}

interface ResearchApprovalsProps {
  research: ResearchResponse | null
  onChanged: () => void
}

export function ResearchApprovals({ research, onChanged }: ResearchApprovalsProps) {
  const items = research?.items ?? []
  const retry = research?.retry ?? []
  if (items.length === 0 && retry.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-md border border-rust/40 bg-ink-1 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[12px] font-semibold uppercase tracking-wide text-bone">Research proposals</h2>
        <span className="rounded-sm bg-rust px-1.5 py-0.5 text-[11px] font-semibold text-bone">{items.length}</span>
      </div>
      <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto pr-1">
        {items.map((item) => (
          <ResearchCard key={item.id} item={item} onChanged={onChanged} />
        ))}
      </div>
      {retry.length > 0 && (
        <div className="flex flex-col gap-0.5 text-[12px] text-sand/70">
          {retry.map((r) => (
            <span key={r.id}>
              #{r.id} {r.proposal} — awaiting retry (wq decide failed, nothing to answer yet)
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
