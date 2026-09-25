// wq#1412 + 2026-09-09 (Frank, 4th ask): the review queue was one flat list mixing
// decisions-you-must-make with work-that's-stalled. Split into ordered, labeled
// buckets by KIND so the top of the page is ONLY what needs a decision, and stalled
// / blocked / parked items live in their own collapsible sections below.
// Priority of assignment (an item can carry several kinds; it lands in the first that matches):
//   frank_decision -> the decision queue (top, always open)
//   gated          -> waiting on a gate
//   blocked_human  -> blocked, needs a human unblock (not necessarily a decision)
//   user_lane      -> parked user-lane project, stalled, not urgent
import type { ReviewItem, ReviewResponse } from './api'

export type ReviewBucketKey = 'decisions' | 'gated' | 'blocked' | 'parked'

export interface ReviewBucket {
  key: ReviewBucketKey
  title: string
  items: ReviewItem[]
  tone: 'urgent' | 'warn' | 'muted'
  defaultOpen: boolean
}

function assign(item: ReviewItem): ReviewBucketKey {
  const k = item.kinds ?? []
  if (k.includes('frank_decision')) return 'decisions'
  if (k.includes('gated')) return 'gated'
  if (k.includes('blocked_human')) return 'blocked'
  return 'parked' // user_lane or anything else falls here
}

export interface SplitReview {
  decisions: ReviewItem[]
  buckets: ReviewBucket[] // the non-decision sections, in display order
  decisionCount: number
}

export function splitReview(review: ReviewResponse | null): SplitReview {
  const items = review?.items ?? []
  const by: Record<ReviewBucketKey, ReviewItem[]> = { decisions: [], gated: [], blocked: [], parked: [] }
  for (const i of items) by[assign(i)].push(i)
  const buckets: ReviewBucket[] = [
    { key: 'gated' as ReviewBucketKey, title: 'Gated — waiting on a gate', items: by.gated, tone: 'warn' as const, defaultOpen: false },
    { key: 'blocked' as ReviewBucketKey, title: 'Blocked — needs a human unblock', items: by.blocked, tone: 'warn' as const, defaultOpen: false },
    { key: 'parked' as ReviewBucketKey, title: 'Parked in user lane — stalled, not urgent', items: by.parked, tone: 'muted' as const, defaultOpen: false },
  ].filter((b) => b.items.length > 0)
  return { decisions: by.decisions, buckets, decisionCount: by.decisions.length }
}

// Back-compat: some callers still import isParkedUserLane.
export function isParkedUserLane(item: ReviewItem): boolean {
  return assign(item) === 'parked'
}
