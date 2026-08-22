import { toast } from 'sonner'

import type { WriteResult } from '@/lib/api'

/** Runs a wq write-API call, toasts the outcome, and reports success so
 * callers can close a form / trigger a refetch only when the CLI actually
 * accepted the change (write endpoints return 200 with ok:false on refusal,
 * e.g. wq's evidence gate — HTTP status alone isn't enough here). */
export async function runWrite(label: string, call: Promise<WriteResult>): Promise<boolean> {
  try {
    const res = await call
    if (res.ok) {
      toast.success(label, { description: res.stdout || undefined })
      return true
    }
    toast.error(`${label} failed`, { description: res.stderr || res.stdout || undefined })
    return false
  } catch (err) {
    toast.error(`${label} failed`, { description: err instanceof Error ? err.message : String(err) })
    return false
  }
}

export { toast }
