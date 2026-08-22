import { useState } from 'react'

import type { Ticket } from '@/lib/api'
import { ticketBlock, ticketDone, ticketEdit, ticketRelease } from '@/lib/api'
import { runWrite } from '@/lib/toast'
import { parseDepIds, useDepInfo } from '@/hooks/useDepInfo'
import { StatusTag } from '@/components/workspace/StatusTag'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ReasonDialog } from '@/components/xray/ActionDialogs'
import { leaseCountdown } from '@/lib/format'
import { cn } from '@/lib/utils'

interface MetadataTabProps {
  ticket: Ticket
  now: string | null
  onNavigate: (lane: string, id: number) => void
  onChanged: () => void
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-sand uppercase tracking-wide">{label}</span>
      <div className="text-[13px] text-bone">{children}</div>
    </div>
  )
}

export function MetadataTab({ ticket, now, onNavigate, onChanged }: MetadataTabProps) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState(() => ({
    title: ticket.title,
    detail: ticket.detail ?? '',
    pri: ticket.pri,
    subsystems: ticket.subsystems ?? '',
    gate: ticket.gate ?? '',
    deps: ticket.deps ?? '',
  }))
  const [doneOpen, setDoneOpen] = useState(false)
  const [blockOpen, setBlockOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  const depIds = parseDepIds(ticket.deps)
  const depInfo = useDepInfo(depIds)
  const lease = leaseCountdown(ticket.lease_expires, now)
  const isOpen = ticket.status === 'open' || ticket.status === 'claimed'

  function startEdit() {
    setForm({
      title: ticket.title,
      detail: ticket.detail ?? '',
      pri: ticket.pri,
      subsystems: ticket.subsystems ?? '',
      gate: ticket.gate ?? '',
      deps: ticket.deps ?? '',
    })
    setEditing(true)
  }

  async function save() {
    setSaving(true)
    const ok = await runWrite(
      `edit #${ticket.id}`,
      ticketEdit(ticket.id, {
        title: form.title,
        detail: form.detail,
        pri: form.pri,
        subsystems: form.subsystems,
        gate: form.gate,
        deps: form.deps,
      }),
    )
    setSaving(false)
    if (ok) {
      setEditing(false)
      onChanged()
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <StatusTag ticket={ticket} />
        <span className="text-[11px] text-sand">pri {ticket.effective_pri}</span>
        {ticket.effective_pri !== ticket.pri && (
          <span className="text-[11px] text-sand/60">(base {ticket.pri})</span>
        )}
      </div>

      {editing ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="m-title">title</Label>
            <Input
              id="m-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="m-detail">detail</Label>
            <Textarea
              id="m-detail"
              className="min-h-24"
              value={form.detail}
              onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="m-pri">pri</Label>
              <Input
                id="m-pri"
                type="number"
                min={1}
                max={5}
                value={form.pri}
                onChange={(e) => setForm((f) => ({ ...f, pri: Number(e.target.value) }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="m-deps">deps (comma ids)</Label>
              <Input
                id="m-deps"
                value={form.deps}
                onChange={(e) => setForm((f) => ({ ...f, deps: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="m-subs">subsystems</Label>
              <Input
                id="m-subs"
                value={form.subsystems}
                onChange={(e) => setForm((f) => ({ ...f, subsystems: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="m-gate">gate</Label>
              <Input
                id="m-gate"
                value={form.gate}
                onChange={(e) => setForm((f) => ({ ...f, gate: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={saving} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      ) : (
        <>
          <Field label="detail">
            <p className="whitespace-pre-wrap text-bone/90">{ticket.detail || '—'}</p>
          </Field>

          <Field label="deps">
            {depIds.length === 0 ? (
              <span className="text-sand/60">none</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {depIds.map((id) => {
                  const ref = depInfo.get(id)
                  const met = ref && ref !== 'error' && ref.status === 'done'
                  return (
                    <button
                      key={id}
                      onClick={() => ref && ref !== 'error' && onNavigate(ref.lane, id)}
                      className={cn(
                        'rounded-sm border border-ink-2 px-1.5 py-0.5 text-[11px] hover:border-rust/60',
                        met ? 'text-status-open' : 'text-status-blocked',
                      )}
                    >
                      #{id} {ref && ref !== 'error' ? `${ref.title} (${ref.status})` : '…'}
                    </button>
                  )
                })}
              </div>
            )}
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="subsystems">
              {ticket.subsystems ? (
                <Badge variant="outline">{ticket.subsystems}</Badge>
              ) : (
                <span className="text-sand/60">—</span>
              )}
            </Field>
            <Field label="gate">
              {ticket.gate ? <Badge variant="outline">{ticket.gate}</Badge> : <span className="text-sand/60">—</span>}
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="claimed by">{ticket.claimed_by || '—'}</Field>
            <Field label="lease">{lease ?? '—'}</Field>
          </div>

          <Field label="notes">
            <p className="whitespace-pre-wrap text-bone/90">{ticket.notes || '—'}</p>
          </Field>

          <div className="flex flex-wrap gap-2 border-t border-ink-2 pt-3">
            <Button size="sm" variant="outline" onClick={startEdit}>
              Edit
            </Button>
            {isOpen && (
              <>
                <Button size="sm" onClick={() => setDoneOpen(true)}>
                  Done
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setBlockOpen(true)}>
                  Block
                </Button>
              </>
            )}
            {ticket.status === 'claimed' && (
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  if (await runWrite(`release #${ticket.id}`, ticketRelease(ticket.id))) onChanged()
                }}
              >
                Release
              </Button>
            )}
          </div>
        </>
      )}

      <ReasonDialog
        open={doneOpen}
        onOpenChange={setDoneOpen}
        title={`Close #${ticket.id}`}
        description="Notes should name a verifiable artifact (file path, PR/commit URL) — wq's evidence gate requires it."
        label="notes"
        placeholder="reports/foo.md — summary"
        confirmLabel="Mark done"
        onConfirm={(notes) => runWrite(`done #${ticket.id}`, ticketDone(ticket.id, notes)).then((ok) => {
          if (ok) onChanged()
          return ok
        })}
      />

      <ReasonDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        title={`Block #${ticket.id}`}
        description="Releases held subsystem locks."
        label="reason"
        required
        confirmLabel="Block"
        destructive
        onConfirm={(reason) => runWrite(`block #${ticket.id}`, ticketBlock(ticket.id, reason)).then((ok) => {
          if (ok) onChanged()
          return ok
        })}
      />
    </div>
  )
}
