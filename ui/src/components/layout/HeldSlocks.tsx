import type { Slock } from '@/lib/api'

export function HeldSlocks({ slocks }: { slocks: Slock[] | null }) {
  if (!slocks || slocks.length === 0) {
    return <div className="text-[12px] text-sand/60">none held</div>
  }

  return (
    <div className="flex flex-col gap-1">
      {slocks.map((s) => (
        <div key={s.scope} className="flex flex-col rounded-sm bg-ink-2 px-2 py-1">
          <div className="flex items-center justify-between text-[12px]">
            <span className="truncate text-bone">{s.scope}</span>
            <span className="shrink-0 text-[11px] text-sand">{s.holder}</span>
          </div>
          {s.note && <span className="truncate text-[11px] text-sand/70">{s.note}</span>}
        </div>
      ))}
    </div>
  )
}
