import { useState } from 'react'

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { projectNew } from '@/lib/api'
import { runWrite } from '@/lib/toast'

const EMPTY = { lane: '', project_dir: '', description: '', service_lock: '' }

export function NewProjectDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!form.lane.trim() || !form.project_dir.trim() || !form.description.trim()) return
    setBusy(true)
    const ok = await runWrite(`new project ${form.lane}`, projectNew(form))
    setBusy(false)
    if (ok) {
      setForm(EMPTY)
      setOpen(false)
      onAdded()
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="w-full justify-start text-sand"
          onClick={() => setForm(EMPTY)}
        >
          + New project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New project lane</DialogTitle>
          <DialogDescription>Runs wq-lane-init to register a new dispatch lane.</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="p-lane">lane (a-z0-9-)</Label>
            <Input id="p-lane" value={form.lane} onChange={(e) => setForm((f) => ({ ...f, lane: e.target.value }))} autoFocus />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="p-dir">project dir (absolute)</Label>
            <Input
              id="p-dir"
              value={form.project_dir}
              onChange={(e) => setForm((f) => ({ ...f, project_dir: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="p-desc">description</Label>
            <Input
              id="p-desc"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="p-lock">service lock (optional)</Label>
            <Input
              id="p-lock"
              value={form.service_lock}
              onChange={(e) => setForm((f) => ({ ...f, service_lock: e.target.value }))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={busy || !form.lane.trim() || !form.project_dir.trim() || !form.description.trim()}
            onClick={submit}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
