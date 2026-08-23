import { useState } from 'react'

import type { Ticket } from '@/lib/api'
import { ticketAnswer } from '@/lib/api'
import { runWrite } from '@/lib/toast'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'

interface DecisionTabProps {
  ticket: Ticket
  onChanged: () => void
}

/** wq#663: the decision protocol (wq#662) rendered for Frank — findings, the
 * question, the orchestrator's recommendation, and a one-box answer path.
 * State reads straight off the ticket row, mirroring wq's own state machine
 * (bin/wq cmd_decide/cmd_answer/cmd_review) rather than tracking it locally:
 *   frank_gated,  no decision_prompt  -> orchestrator hasn't asked yet
 *   frank_gated,     decision_prompt  -> rejected; reopened for a fresh answer
 *   pending_review, no frank_response -> awaiting Frank's answer
 *   pending_review,    frank_response -> answered; awaiting orchestrator review
 */
export function DecisionTab({ ticket, onChanged }: DecisionTabProps) {
  const [text, setText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const rejected = ticket.status === 'frank_gated' && !!ticket.decision_prompt
  const awaitingPrompt = ticket.status === 'frank_gated' && !ticket.decision_prompt
  const awaitingAnswer = ticket.status === 'pending_review' && !ticket.frank_response
  const awaitingOrchReview = ticket.status === 'pending_review' && !!ticket.frank_response
  const canAnswer = rejected || awaitingAnswer

  async function submit() {
    if (!text.trim()) return
    setSubmitting(true)
    const ok = await runWrite(`answer #${ticket.id}`, ticketAnswer(ticket.id, text))
    setSubmitting(false)
    if (ok) {
      setText('')
      onChanged()
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-[11px] font-semibold text-sand uppercase tracking-wide">findings</span>
        <p className="whitespace-pre-wrap text-[13px] text-bone/90">{ticket.detail || '—'}</p>
      </div>

      {awaitingPrompt && (
        <div className="rounded-md border border-dashed border-ink-2 px-3 py-4 text-center text-[12px] text-sand/60">
          awaiting the orchestrator's decision prompt — nothing to answer yet
        </div>
      )}

      {rejected && (
        <div className="rounded-md border border-status-blocked/60 bg-status-blocked/10 px-3 py-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-status-blocked">
            rejected
          </span>
          <p className="mt-1 whitespace-pre-wrap text-[13px] text-bone/90">
            {ticket.review_reason || 'no reason given'}
          </p>
        </div>
      )}

      {ticket.decision_prompt && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-sand uppercase tracking-wide">decision</span>
          <p className="whitespace-pre-wrap text-[13px] font-medium text-bone">{ticket.decision_prompt}</p>
        </div>
      )}

      {ticket.orch_recommendation && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-sand uppercase tracking-wide">
            orchestrator recommends
          </span>
          <blockquote className="border-l-2 border-rust/60 pl-3 text-[13px] text-sand italic">
            {ticket.orch_recommendation}
          </blockquote>
        </div>
      )}

      {awaitingOrchReview && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-semibold text-sand uppercase tracking-wide">your answer</span>
          <p className="whitespace-pre-wrap text-[13px] text-bone/90">{ticket.frank_response}</p>
          <span className="mt-1 inline-flex w-fit items-center gap-1.5 rounded-sm border border-ink-2 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-status-claimed">
            pending orchestrator review
          </span>
        </div>
      )}

      {canAnswer && (
        <div className="flex flex-col gap-1.5 border-t border-ink-2 pt-3">
          <Label htmlFor="frank-answer">{rejected ? 're-answer' : 'your answer'}</Label>
          <Textarea
            id="frank-answer"
            className="min-h-24"
            placeholder="type your response…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <Button size="sm" disabled={submitting || !text.trim()} onClick={submit} className="self-end">
            Submit
          </Button>
        </div>
      )}
    </div>
  )
}
