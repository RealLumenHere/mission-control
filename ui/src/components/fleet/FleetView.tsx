import type { FleetResponse } from '@/lib/api'
import { NodeCard } from '@/components/fleet/NodeCard'
import { cn } from '@/lib/utils'

interface FleetViewProps {
  fleet: FleetResponse | null
  hostFilter: string | null
  highlightHosts: string[]
  onSelectHost: (host: string) => void
}

export function FleetView({ fleet, hostFilter, highlightHosts, onSelectHost }: FleetViewProps) {
  if (!fleet || fleet.groups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-4 text-[12px] text-sand/60">
        no fleet telemetry snapshot yet — waiting on the collector
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-auto p-4">
      <div className="flex items-center justify-between text-[11px] text-sand">
        <span>{Object.keys(fleet.nodes).length} nodes</span>
        <span className={cn(fleet.stale && 'text-status-blocked')}>
          {fleet.generated_at
            ? `snapshot ${fleet.stale ? 'STALE' : 'live'} — ${Math.round(fleet.staleness_s ?? 0)}s old`
            : 'no snapshot data'}
        </span>
      </div>

      {fleet.groups.map((group) => (
        <div key={group.class} className="flex flex-col gap-2">
          <div className="text-[11px] font-semibold text-sand uppercase tracking-wide">{group.label}</div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {group.hosts.map((host) => (
              <NodeCard
                key={host}
                host={host}
                node={fleet.nodes[host]}
                active={hostFilter === host}
                highlighted={highlightHosts.includes(host)}
                onClick={() => onSelectHost(host)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
