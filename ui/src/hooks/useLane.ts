import { useCallback } from 'react'

import { fetchLane, type LaneResponse } from '@/lib/api'
import { usePoll } from '@/hooks/usePoll'

export function useLane(lane: string | null, intervalMs: number) {
  const fetcher = useCallback(() => {
    if (!lane) return Promise.resolve(null as unknown as LaneResponse)
    return fetchLane(lane)
  }, [lane])

  return usePoll(fetcher, intervalMs)
}
