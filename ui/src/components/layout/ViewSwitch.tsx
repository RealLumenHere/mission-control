import { cn } from '@/lib/utils'

export type ArenaView = 'workspace' | 'fleet'

interface ViewSwitchProps {
  view: ArenaView
  onChange: (view: ArenaView) => void
}

const VIEWS: Array<{ id: ArenaView; label: string }> = [
  { id: 'workspace', label: 'Workspace' },
  { id: 'fleet', label: 'Fleet' },
]

export function ViewSwitch({ view, onChange }: ViewSwitchProps) {
  return (
    <div className="flex gap-0.5 rounded-md bg-ink-2 p-0.5">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          onClick={() => onChange(v.id)}
          className={cn(
            'rounded-sm px-3 py-1 text-[12px] font-medium transition-colors',
            view === v.id ? 'bg-rust text-bone' : 'text-sand hover:text-bone',
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}
