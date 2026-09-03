// wq#1412 — split the review queue's items by whether they're purely parked
// in the user lane (no other reason a decision is needed) vs. genuinely
// awaiting a decision. Shared so the sidebar badge and the on-page queue
// agree on the same count.
import type { ReviewItem, ReviewResponse } from './api'

export function isParkedUserLane(item: ReviewItem): boolean {
  return item.kinds.length === 1 && item.kinds[0] === 'user_lane'
}

export interface SplitReview {
  decisions: ReviewItem[]
  parked: ReviewItem[]
}

export function splitReview(review: ReviewResponse | null): SplitReview {
  const items = review?.items ?? []
  return {
    decisions: items.filter((i) => !isParkedUserLane(i)),
    parked: items.filter(isParkedUserLane),
  }
}
