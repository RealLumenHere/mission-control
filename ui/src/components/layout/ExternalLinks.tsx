import { useState } from 'react'
import { ChevronRightIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { EXTERNAL_LINKS } from '@/lib/api'

interface ExternalLinksProps {
  proposalsPending: number | null
}

export function ExternalLinks({ proposalsPending }: ExternalLinksProps) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-2 py-1 text-[11px] uppercase tracking-wide text-sand hover:text-bone"
      >
        <ChevronRightIcon className={cn('size-3 transition-transform', open && 'rotate-90')} />
        links
      </button>
      {open && (
        <div className="flex flex-col gap-0.5 pl-2">
          {EXTERNAL_LINKS.map((link) => (
            <a
              key={link.label}
              href={link.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between rounded-sm px-2 py-1 text-[12px] text-sand hover:bg-ink-2 hover:text-bone"
            >
              <span>{link.label} ↗</span>
              {link.label === 'Proposals' && proposalsPending !== null && (
                <span className="rounded-sm bg-ink-2 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-sand">
                  {proposalsPending}
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
