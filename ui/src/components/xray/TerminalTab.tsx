import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

import type { AgentsResponse, Ticket, WorkerStats } from '@/lib/api'
import { cn } from '@/lib/utils'

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const DIM = '\x1b[2m'
const ITALIC = '\x1b[3m'

function fg(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  return `\x1b[38;2;${(n >> 16) & 255};${(n >> 8) & 255};${n & 255}m`
}

// kind -> ANSI style, mirrors the legacy .l-* log palette (app.py render_event)
// mapped onto Tiny Whale brand tokens (REDESIGN_V2.md): tool=sea, result=dim
// sand, done=sea-lt bold ("ok" color — legacy used plain green), denied=red.
const KIND_STYLE: Record<string, string> = {
  text: fg('#E0D5C8'),
  tool: fg('#2D5F5E'),
  result: DIM + fg('#D4B896'),
  done: BOLD + fg('#4A7C6E'),
  denied: fg('#D05555'),
  sys: DIM + ITALIC + fg('#D4B896'),
}

function writeEvent(term: Terminal, kind: string, text: string) {
  const style = KIND_STYLE[kind] ?? KIND_STYLE.text
  // strip ESC so a transcript line can't smuggle arbitrary terminal control sequences
  const safe = text.replace(new RegExp(String.fromCharCode(27), 'g'), '').replace(/\n/g, '\r\n')
  term.write(style + safe + RESET + '\r\n')
}

const TERMINAL_THEME = {
  background: '#1a1714',
  foreground: '#e0d5c8',
  cursor: '#b5683c',
  cursorAccent: '#1a1714',
  selectionBackground: '#221f1b',
  black: '#13110f',
  red: '#d05555',
  green: '#4a7c6e',
  yellow: '#d4b896',
  blue: '#2d5f5e',
  magenta: '#b5683c',
  cyan: '#2d5f5e',
  white: '#e0d5c8',
  brightBlack: '#3a352e',
  brightRed: '#e88787',
  brightGreen: '#6fa696',
  brightYellow: '#e6d3b3',
  brightBlue: '#4a7c6e',
  brightMagenta: '#c98058',
  brightCyan: '#4a7c6e',
  brightWhite: '#ffffff',
}

type ConnState = 'connecting' | 'open' | 'reconnecting'

function statsChips(stats: WorkerStats): string {
  const cost = stats.cost != null ? `$${stats.cost.toFixed(3)}` : 'cost n/a'
  return `${stats.turns}t · ${stats.tools}x · ${cost} · ${stats.mtime}`
}

function AgentTerminal({ worker, stats }: { worker: string; stats: WorkerStats | null }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const followRef = useRef(true)
  const [follow, setFollow] = useState(true)
  const [collapsed, setCollapsed] = useState(false)
  const [conn, setConn] = useState<ConnState>('connecting')

  useEffect(() => {
    followRef.current = follow
  }, [follow])

  // Runs once per mount. The parent keys this component on `worker`, so a
  // ticket/drawer switch remounts it fresh instead of needing in-place reset
  // logic here — teardown (close SSE, dispose terminal) always runs first.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const term = new Terminal({
      convertEol: false,
      disableStdin: true,
      cursorBlink: false,
      fontSize: 12,
      fontFamily: "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
      scrollback: 5000,
      theme: TERMINAL_THEME,
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()
    termRef.current = term
    fitRef.current = fit

    term.onScroll(() => {
      const buf = term.buffer.active
      setFollow(buf.viewportY >= buf.baseY)
    })

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit()
      } catch {
        // container not measurable yet (e.g. mid collapse transition)
      }
    })
    resizeObserver.observe(el)

    let es: EventSource | null = null
    let backoffTimer: number | undefined
    let backoff = 1000
    let cancelled = false

    function connect() {
      if (cancelled) return
      setConn('connecting')
      es = new EventSource(`/api/agents/${encodeURIComponent(worker)}/tail`)
      es.onopen = () => {
        backoff = 1000
        setConn('open')
      }
      es.onmessage = (ev) => {
        let d: { kind: string; text: string }
        try {
          d = JSON.parse(ev.data)
        } catch {
          return
        }
        writeEvent(term, d.kind, d.text)
        if (followRef.current) term.scrollToBottom()
      }
      es.onerror = () => {
        es?.close()
        if (cancelled) return
        setConn('reconnecting')
        backoffTimer = window.setTimeout(connect, backoff)
        backoff = Math.min(backoff * 2, 30000)
      }
    }
    connect()

    return () => {
      cancelled = true
      es?.close()
      if (backoffTimer !== undefined) window.clearTimeout(backoffTimer)
      resizeObserver.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // xterm can't size itself while `hidden` — refit once the pane reappears.
  useEffect(() => {
    if (collapsed) return
    const id = requestAnimationFrame(() => {
      fitRef.current?.fit()
      const term = termRef.current
      if (term) term.refresh(0, term.rows - 1)
    })
    return () => cancelAnimationFrame(id)
  }, [collapsed])

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] text-sand">
          <span
            title={conn}
            className={cn(
              'h-1.5 w-1.5 shrink-0 rounded-full',
              conn === 'open' && 'bg-status-open',
              conn === 'connecting' && 'animate-pulse bg-sand',
              conn === 'reconnecting' && 'animate-pulse bg-status-blocked',
            )}
          />
          <span>{stats ? statsChips(stats) : `worker: ${worker}`}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              setFollow(true)
              termRef.current?.scrollToBottom()
            }}
            className={cn(
              'rounded-sm border border-ink-2 px-1.5 py-0.5 text-[11px] hover:border-rust/60',
              follow ? 'text-status-open' : 'text-sand',
            )}
          >
            {follow ? 'following' : 'follow tail'}
          </button>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-sm border border-ink-2 px-1.5 py-0.5 text-[11px] text-sand hover:border-rust/60"
          >
            {collapsed ? 'expand' : 'collapse'}
          </button>
        </div>
      </div>
      <div
        ref={containerRef}
        className={cn('min-h-0 flex-1 rounded-md border border-ink-2 bg-ink-1 p-1', collapsed && 'hidden')}
      />
    </div>
  )
}

function findWorkerStats(agents: AgentsResponse | null, ticket: Ticket): WorkerStats | null {
  if (!agents) return null
  const group = agents.groups[ticket.lane] ?? []
  return group.find((c) => c.id === ticket.id)?.worker ?? null
}

export function TerminalTab({ ticket, agents }: { ticket: Ticket; agents: AgentsResponse | null }) {
  if (!ticket.claimed_by) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-ink-2 p-6 text-center text-[12px] text-sand/60">
        <span>no live worker for this ticket</span>
        <span className="text-sand/40">status: {ticket.status}</span>
      </div>
    )
  }

  return <AgentTerminal key={ticket.claimed_by} worker={ticket.claimed_by} stats={findWorkerStats(agents, ticket)} />
}
