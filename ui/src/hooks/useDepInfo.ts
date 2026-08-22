import { useEffect, useState } from 'react'

import { fetchTicketRef, type TicketRef } from '@/lib/api'

// Module-scope cache shared across every StatusTag instance — a dep ticket's
// title/status rarely changes while it's someone else's open blocker, and
// this avoids re-fetching the same id from every row that references it.
const cache = new Map<number, TicketRef | 'error'>()
const inflight = new Map<number, Promise<void>>()

function load(id: number): Promise<void> {
  if (cache.has(id) || inflight.has(id)) return inflight.get(id) ?? Promise.resolve()
  const p = fetchTicketRef(id)
    .then((ref) => {
      cache.set(id, ref)
    })
    .catch(() => {
      cache.set(id, 'error')
    })
    .finally(() => {
      inflight.delete(id)
    })
  inflight.set(id, p)
  return p
}

export function useDepInfo(ids: number[]): Map<number, TicketRef | 'error'> {
  const [, tick] = useState(0)
  const key = ids.join(',')

  useEffect(() => {
    let cancelled = false
    Promise.all(ids.map(load)).then(() => {
      if (!cancelled) tick((n) => n + 1)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return cache
}

export function parseDepIds(deps: string | null | undefined): number[] {
  if (!deps) return []
  return deps
    .split(',')
    .map((s) => Number.parseInt(s.trim(), 10))
    .filter((n) => Number.isFinite(n))
}
