import { useEffect, useState } from 'react'

interface PollState<T> {
  data: T | null
  error: Error | null
  loading: boolean
  refetch: () => void
}

/** Polls `fetcher` every `intervalMs`, keeping the last-good `data` on error.
 * `fetcher` must be a stable reference (e.g. a module-level function). */
export function usePoll<T>(fetcher: () => Promise<T>, intervalMs: number): PollState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function tick() {
      try {
        const next = await fetcher()
        if (!cancelled) {
          setData(next)
          setError(null)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error(String(err)))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    tick()
    const id = window.setInterval(tick, intervalMs)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [fetcher, intervalMs, nonce])

  const refetch = () => setNonce((n) => n + 1)

  return { data, error, loading, refetch }
}
