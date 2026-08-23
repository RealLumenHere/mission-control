// Read-only client for the existing FastAPI backend (app.py). v2 is a static SPA
// served by that backend — see docs/REDESIGN_V2.md. No write endpoints here: writes
// stay wq-CLI-subprocess only.

export type TaskStatus = 'open' | 'claimed' | 'blocked' | 'done'

export type LaneCounts = Partial<Record<TaskStatus, number>>

export interface Claim {
  id: number
  lane: string
  pri: number
  title: string
  claimed_by: string | null
  claimed_at: string | null
  lease_expires: string | null
  subsystems: string | null
}

export interface Slock {
  scope: string
  holder: string
  acquired_at: string
  expires_at: string
  note: string | null
}

export interface StateResponse {
  now: string
  lanes: Record<string, LaneCounts>
  claims: Claim[]
  slocks: Slock[]
  projects: Record<string, unknown>
  dispatch_lanes: string[]
  recent_reports: string[]
  proposals_pending: number | null
}

export interface GovernorLimit {
  percent: number
  [key: string]: unknown
}

export interface GovernorState {
  limits?: {
    session?: GovernorLimit
    weekly_all?: GovernorLimit
    fable_weekly_scoped?: GovernorLimit
    [key: string]: GovernorLimit | undefined
  }
  stop_active?: boolean
  stale?: boolean
}

export interface WorkerStats {
  turns: number
  tools: number
  cost: number | null
  sentinel: string | null
  finished: boolean
  mtime: string
  kb: number
  file: string
}

export interface AgentClaim extends Claim {
  worker: WorkerStats | null
}

export interface AgentsResponse {
  now: string
  groups: Record<string, AgentClaim[]>
  governor: GovernorState | null
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(path, { headers: { Accept: 'application/json' } })
  if (!res.ok) {
    throw new Error(`${path} -> HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export function fetchState(): Promise<StateResponse> {
  return getJSON<StateResponse>('/api/state')
}

export function fetchAgents(): Promise<AgentsResponse> {
  return getJSON<AgentsResponse>('/api/agents')
}

export const EXTERNAL_LINKS = [
  { label: 'Scribe', href: 'https://scribe.lumennode.uk' },
  { label: 'Proposals', href: 'https://propose.lumennode.uk' },
  { label: 'Bench', href: 'https://bench.lumennode.uk' },
  { label: 'Chat', href: 'https://chat.lumennode.uk' },
] as const

// ---- tickets (T2) ----

export type TicketStatus = TaskStatus | 'rejected' | 'frank_gated' | 'pending_review'

export interface Ticket {
  id: number
  lane: string
  pri: number
  title: string
  detail: string | null
  deps: string | null
  status: TicketStatus
  claimed_by: string | null
  claimed_at: string | null
  done_at: string | null
  notes: string | null
  created_at: string | null
  lease_expires: string | null
  subsystems: string | null
  gate: string | null
  lease_ttl: number | null
  model: string | null
  effort: string | null
  archetype: string | null
  gate_type: string | null
  decision_prompt: string | null
  orch_recommendation: string | null
  frank_response: string | null
  response_ts: string | null
  review_verdict: string | null
  review_reason: string | null
  deps_met: boolean
  effective_pri: number
}

export interface LaneResponse {
  now: string
  lane: string
  tickets: Ticket[]
  done_total: number
  dispatch: { text: string; mtime: string; path: string } | null
  board: { text: string; mtime: string; path: string } | null
  project: unknown
}

export interface TicketRef {
  id: number
  lane: string
  title: string
  status: TicketStatus
}

export interface ReportMeta {
  name: string
  kb: number
  mtime: string
}

export interface ReportsResponse {
  reports: ReportMeta[]
}

export interface ReportText {
  text: string
  mtime: string
  path: string
}

export interface WriteResult {
  ok: boolean
  code: number
  stdout: string
  stderr: string
}

// ---- review queue (T7) ----

export type ReviewKind = 'blocked_human' | 'user_lane' | 'gated' | 'frank_decision'

export interface ReviewDownstream {
  id: number
  lane: string
  title: string
}

export interface ReviewItem {
  id: number
  lane: string
  title: string
  pri: number
  status: TicketStatus
  kinds: ReviewKind[]
  reason: string
  notes: string | null
  gate: string | null
  created_at: string | null
  age_days: number
  downstream: ReviewDownstream[]
  downstream_count: number
  cost_of_delay: number
}

export interface ReviewResponse {
  now: string
  items: ReviewItem[]
  count: number
}

export function fetchReview(): Promise<ReviewResponse> {
  return getJSON<ReviewResponse>('/api/review')
}

export function fetchLane(lane: string, includeDone = false): Promise<LaneResponse> {
  return getJSON<LaneResponse>(`/api/lane/${encodeURIComponent(lane)}?include_done=${includeDone ? 1 : 0}`)
}

export function fetchTicketRef(id: number): Promise<TicketRef> {
  return getJSON<TicketRef>(`/api/ticket/${id}`)
}

export function fetchReports(): Promise<ReportsResponse> {
  return getJSON<ReportsResponse>('/api/reports')
}

// ---- fleet (T5) ----

export type FleetNodeStatus = 'ok' | 'unreachable' | 'parked'

export interface FleetAgentRef {
  id: number
  lane: string
  title: string
  claimed_by: string | null
}

export interface FleetSlockRef {
  scope: string
  holder: string
  note: string | null
}

export interface FleetNode {
  status: FleetNodeStatus
  class: string
  cpu_pct?: number
  mem_used_bytes?: number
  mem_total_bytes?: number
  vram_used_bytes?: number
  vram_total_bytes?: number
  loadavg?: [number, number, number]
  uptime_s?: number
  error?: string
  agents: FleetAgentRef[]
  slocks: FleetSlockRef[]
}

export interface FleetGroup {
  class: string
  label: string
  hosts: string[]
}

export interface FleetResponse {
  generated_at: string | null
  staleness_s: number | null
  stale: boolean
  nodes: Record<string, FleetNode>
  groups: FleetGroup[]
}

export function fetchFleet(): Promise<FleetResponse> {
  return getJSON<FleetResponse>('/api/fleet')
}

export function fetchReport(name: string): Promise<ReportText> {
  return getJSON<ReportText>(`/api/report/${encodeURIComponent(name)}`)
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  const data = (await res.json()) as T
  if (!res.ok) {
    throw new Error((data as { stderr?: string })?.stderr || `${path} -> HTTP ${res.status}`)
  }
  return data
}

export interface TicketNewInput {
  lane: string
  title: string
  detail?: string
  pri?: number
  deps?: string
  subsystems?: string
  gate?: string
  force?: boolean
}

export interface TicketEditInput {
  title?: string
  detail?: string
  pri?: number
  lane?: string
  status?: string
  subsystems?: string
  gate?: string
  deps?: string
}

export interface ProjectNewInput {
  lane: string
  project_dir: string
  description: string
  service_lock?: string
}

export function ticketAdd(t: TicketNewInput): Promise<WriteResult> {
  return postJSON<WriteResult>('/api/ticket', t)
}

export function ticketEdit(id: number, t: TicketEditInput): Promise<WriteResult> {
  return postJSON<WriteResult>(`/api/ticket/${id}/edit`, t)
}

export function ticketDone(id: number, notes = ''): Promise<WriteResult> {
  return postJSON<WriteResult>(`/api/ticket/${id}/done`, { notes })
}

export function ticketBlock(id: number, reason: string): Promise<WriteResult> {
  return postJSON<WriteResult>(`/api/ticket/${id}/block`, { reason })
}

export function ticketRelease(id: number): Promise<WriteResult> {
  return postJSON<WriteResult>(`/api/ticket/${id}/release`, {})
}

export function ticketAnswer(id: number, text: string): Promise<WriteResult> {
  return postJSON<WriteResult>(`/api/ticket/${id}/answer`, { text })
}

export function projectNew(p: ProjectNewInput): Promise<WriteResult> {
  return postJSON<WriteResult>('/api/project', p)
}
