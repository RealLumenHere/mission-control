import { Lock } from 'lucide-react'

import type { FleetNode } from '@/lib/api'
import { cn } from '@/lib/utils'
import { formatBytes, formatUptime } from '@/lib/format'
import { Gauge } from '@/components/fleet/Gauge'

const STATUS_DOT: Record<string, string> = {
  ok: 'bg-status-open',
  unreachable: 'bg-status-blocked',
  parked: 'bg-status-done',
}

interface NodeCardProps {
  host: string
  node: FleetNode
  active: boolean
  highlighted: boolean
  onClick: () => void
}

export function NodeCard({ host, node, active, highlighted, onClick }: NodeCardProps) {
  const memPct = node.mem_total_bytes ? (100 * (node.mem_used_bytes ?? 0)) / node.mem_total_bytes : null
  const vramPct = node.vram_total_bytes ? (100 * (node.vram_used_bytes ?? 0)) / node.vram_total_bytes : null

  return (
    <button
      onClick={onClick}
      className={cn(
        'flex flex-col gap-2 rounded-md border border-ink-2 bg-ink-1 p-3 text-left transition-colors hover:border-rust/60',
        active && 'border-rust bg-ink-2',
        highlighted && !active && 'border-sea-lt',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[12px] font-semibold text-bone">{host}</span>
        <span className={cn('size-1.5 shrink-0 rounded-full', STATUS_DOT[node.status] ?? 'bg-status-done')} />
      </div>

      {node.status === 'ok' && (
        <div className="flex flex-col gap-1.5">
          {typeof node.cpu_pct === 'number' && <Gauge label="cpu" pct={node.cpu_pct} />}
          {memPct !== null && (
            <Gauge
              label="ram"
              pct={memPct}
              detail={`${formatBytes(node.mem_used_bytes ?? 0)}/${formatBytes(node.mem_total_bytes ?? 0)}`}
            />
          )}
          {vramPct !== null && (
            <Gauge
              label="vram"
              pct={vramPct}
              detail={`${formatBytes(node.vram_used_bytes ?? 0)}/${formatBytes(node.vram_total_bytes ?? 0)}`}
            />
          )}
          <div className="flex justify-between text-[10px] text-sand/60">
            {node.loadavg && <span>load {node.loadavg.map((n) => n.toFixed(2)).join(' ')}</span>}
            {typeof node.uptime_s === 'number' && <span>up {formatUptime(node.uptime_s)}</span>}
          </div>
        </div>
      )}

      {node.status === 'unreachable' && (
        <div className="text-[11px] text-status-blocked/80">
          unreachable{node.error ? ` — ${node.error}` : ''}
        </div>
      )}

      {node.status === 'parked' && <div className="text-[11px] text-sand/60">not yet booted</div>}

      {(node.agents.length > 0 || node.slocks.length > 0) && (
        <div className="flex flex-wrap gap-1 border-t border-ink-2 pt-1.5">
          {node.agents.map((a) => (
            <span
              key={`a${a.id}`}
              title={a.title}
              className="truncate rounded-sm border border-ink-2 bg-ink-2 px-1.5 py-0.5 text-[10px] text-status-claimed"
            >
              #{a.id} {a.lane}
            </span>
          ))}
          {node.slocks.map((s) => (
            <span
              key={`s${s.scope}`}
              title={s.note ?? undefined}
              className="inline-flex items-center gap-1 truncate rounded-sm border border-ink-2 bg-ink-2 px-1.5 py-0.5 text-[10px] text-sand"
            >
              <Lock className="size-2.5" />
              {s.scope}
            </span>
          ))}
        </div>
      )}
    </button>
  )
}
