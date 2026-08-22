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
