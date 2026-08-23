import { useEffect, useState } from 'react'
import { ChevronRightIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { EXTERNAL_LINKS } from '@/lib/api'

interface ExternalLinksProps {
  proposalsPending: number | null
}

interface Link {
  label: string
  href: string
}

/**
 * Sidebar links come from /api/external-links, which derives them from the live
 * service inventory (wq#770) — the same source the home dashboard is generated
 * from. EXTERNAL_LINKS stays as the fallback so the sidebar still renders if the
 * inventory is missing or the endpoint is down.
 */
export function ExternalLinks({ proposalsPending }: ExternalLinksProps) {
  const [open, setOpen] = useState(false)
  const [links, setLinks] = useState<readonly Link[]>(EXTERNAL_LINKS)

  useEffect(() => {
    let alive = true
    fetch('/api/external-links')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (alive && Array.isArray(d?.links) && d.links.length) setLinks(d.links)
      })
      .catch(() => {
        /* keep the static fallback */
      })
    return () => {
      alive = false
    }
  }, [])

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
          {links.map((link) => (
            <a
              key={link.href}
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
