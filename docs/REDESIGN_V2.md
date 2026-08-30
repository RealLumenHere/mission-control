# Mission Control v2 — Unified Split-Pane Command Console
Frank directive 2026-08-21. Orchestrator: claude-web (this doc is the single source of truth
for the v2 build; wq build-lane tickets reference it as docs/REDESIGN_V2.md).

## Mandate (Frank, verbatim intent)
Redesign the multi-page MC into a unified, high-density, split-pane command console.
Eliminate siloed navigation: agent reasoning, tool usage, and report generation in a single
pane of glass. Dark-mode, terminal-inspired aesthetic aligned with the Tiny Whale brand.

## Stack (locked)
- Core UI: React 18 + TypeScript + Vite, Tailwind CSS + shadcn/ui (dark primitives, Sheet drawer)
- Data grids: TanStack Table + TanStack Virtual (tickets + logs, no DOM lag)
- Metrics: Tremor (resource bars / node utilization)
- Terminal: xterm.js (live agent transcript streams)
- Backend: EXISTING FastAPI app.py — v2 is a static SPA it serves. No new auth surface
  (CF Access Frank-only unchanged). Writes stay wq-CLI-subprocess only. queue.db stays mode=ro.

## Brand tokens (from /home/lumen/projects/tiny-whale — grunge-whale, warm ink NOT blue-gray)
ink-0 #13110F (page bg) · ink-1 #1A1714 (panel) · ink-2 #221F1B (raised/line)
bone #E0D5C8 (primary text) · sand #D4B896 (dim text/labels)
rust #B5683C (accent/interactive) · sea #2D5F5E · sea-lt #4A7C6E (ok/positive)
status: open=sea-lt · claimed=sand/amber · blocked=#d05555 · open-dependent=sea · done=muted
Type: system mono stack (ui-monospace, 'JetBrains Mono' if locally vendored — NO CDN fonts).
Terminal-inspired: mono for data, dense 13px baseline, 1px ink-2 rules, minimal radius (4-6px).

## Information architecture
1. Persistent LEFT SIDEBAR (fixed, replaces top nav): lane filter list w/ open/blocked counts,
   governor session/weekly/fable limit bars (from /api/agents .governor), held slocks quick-view,
   external links (Scribe/Proposals/Bench/Chat) collapsed at bottom.
2. MAIN ARENA top: lane summary cards (open/claimed/blocked/done metrics) — clicking filters.
3. MAIN ARENA bottom: virtualized ticket list (TanStack) for the selected lane(s). Status tags
   color-coded incl. computed `open-dependent`. `blocked` and `open-dependent` tags get HOVER
   tooltips listing the blocker: unmet dep ids + titles + their statuses (no click needed).
   Sort: server order (status-group -> effective_pri -> age) default; column sort available.
4. X-RAY INSPECTOR: clicking a ticket slides a right Sheet drawer (no reload, no route change).
   Tabs: (a) Metadata — detail, deps (linked, status-badged), subsystems, gate, lease, notes;
   (b) Terminal — collapsible xterm.js pane streaming /api/agents/{claimed_by}/tail SSE
       (kind-colored: text/tool/result/done/denied), auto-reconnect, follow-tail toggle;
   (c) Reports — ticket notes `reports/*.md|.diff` rendered natively (md -> styled HTML,
       .diff -> syntax-colored diff view). Falls back to reports browser.
5. FLEET OVERVIEW pane (sidebar-switchable arena view, same shell — NOT a separate page):
   hardware grid of nodes + hapi chassis grouping; per-node Tremor gauges CPU / RAM / VRAM
   (VRAM only where amdgpu exposes it); tags: active agent leases + held slocks mapped to host.
   CROSS-FILTER: click node -> ticket workspace filters to tasks executing on it;
   click ticket -> its host highlights in the fleet grid.

## Fleet telemetry (net-new backend — nothing exists today; VM has plugs/HA only, no node CPU/RAM)
- Collector /home/lumen/bin/fleet-telemetry: SSH key-auth fanout from Lumen (roster from
  `lumen_state.py current`, ssh user=hostname convention, id_ed25519). Read-only sampling:
  /proc/stat (2-sample cpu%), /proc/meminfo, /sys/class/drm/card*/device/mem_info_vram_{used,total}
  where present, loadavg, uptime. NO new services/agents on fleet nodes. Fail-soft per node
  (down node = status:unreachable, never blocks the snapshot). ~30s cadence systemd timer on
  Lumen writing /home/lumen/mission-control/fleet_telemetry.json atomically (tmp+rename).
- /api/fleet: serves latest snapshot + staleness + agent->host mapping:
  wq fworker claims => host lumen (all claude -p workers run on Lumen);
  LPP/pokemon lane => gameboy; litellm rung subsystems => isis/nephthys per config;
  slock scope->host via a small static map in the endpoint (documented inline).
- Local Lumen sample is direct /proc read (no SSH-to-self).

## Rollout
- SPA source /home/lumen/mission-control/ui, build ui/dist, mounted at /v2 during build.
- Final ticket cuts /v2 -> / and keeps legacy inline UI at /legacy for one cycle.
- Service restart only at wiring points; healthz + /api smoke after every restart.

## Worker rules (every ticket)
- Branch via `lumen-pr start /home/lumen/mission-control <branch>` worktree; NEVER edit the
  primary tree directly; app.py edits serialize on subsystem `mc-app`, ui/ on `mc-ui`.
- Backup app.py sibling .bak before touching it. Test before deploy; ast/py_compile + curl smoke.
- npm install runs on Lumen only. Vendor nothing from CDNs at runtime (self-host all JS/fonts).
- GitHub-standards commit style (terse, single-focus, Refs: wq#N).
- Report to /home/lumen/agents/work-queue/reports/<ticket>_*.md; wq done --notes that path.
