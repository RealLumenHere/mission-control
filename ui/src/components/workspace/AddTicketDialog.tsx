import { useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ticketAdd } from '@/lib/api'
import { runWrite } from '@/lib/toast'

interface AddTicketDialogProps {
  lane: string
  onAdded: () => void
}

const EMPTY = { lane: '', title: '', detail: '', pri: 2, deps: '', subsystems: '', gate: '' }

export function AddTicketDialog({ lane, onAdded }: AddTicketDialogProps) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)

  function openWith() {
    setForm({ ...EMPTY, lane })
    setOpen(true)
  }

  async function submit() {
    if (!form.lane.trim() || !form.title.trim()) return
    setBusy(true)
    const ok = await runWrite(
      `add ticket to ${form.lane}`,
      ticketAdd({ ...form, pri: Number(form.pri) }),
    )
    setBusy(false)
    if (ok) {
      setOpen(false)
      onAdded()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" onClick={openWith}>
          + Ticket
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="n-lane">lane</Label>
              <Input
                id="n-lane"
                value={form.lane}
                onChange={(e) => setForm((f) => ({ ...f, lane: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="n-pri">pri</Label>
              <Input
                id="n-pri"
                type="number"
                min={1}
                max={5}
                value={form.pri}
                onChange={(e) => setForm((f) => ({ ...f, pri: Number(e.target.value) }))}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="n-title">title</Label>
            <Input
              id="n-title"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="n-detail">detail</Label>
            <Textarea
              id="n-detail"
              value={form.detail}
              onChange={(e) => setForm((f) => ({ ...f, detail: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1">
              <Label htmlFor="n-deps">deps</Label>
              <Input
                id="n-deps"
                placeholder="ids, comma"
                value={form.deps}
                onChange={(e) => setForm((f) => ({ ...f, deps: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="n-subs">subsystems</Label>
              <Input
                id="n-subs"
                value={form.subsystems}
                onChange={(e) => setForm((f) => ({ ...f, subsystems: e.target.value }))}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor="n-gate">gate</Label>
              <Input
                id="n-gate"
                value={form.gate}
                onChange={(e) => setForm((f) => ({ ...f, gate: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" disabled={busy || !form.lane.trim() || !form.title.trim()} onClick={submit}>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
