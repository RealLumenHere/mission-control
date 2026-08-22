# Lumen Mission Control — DESIGN

> **v2 (current console, wq#748 cutover):** the split-pane React/TS console lives at
> `/`, built from `ui/` per **[docs/REDESIGN_V2.md](REDESIGN_V2.md)** — that doc is
> the source of truth for the v2 stack, brand tokens, IA, and fleet telemetry. The
> rest of this file describes the original single-file dashboard, now served at
> `/legacy` for one rollout cycle, and the FastAPI backend + wq write-path both
> UIs share unchanged.

## Stack (boring on purpose)
Single-file FastAPI (app.py) + one vanilla-JS/CSS page, server port 127.0.0.1:8136,
uvicorn under systemd (lumen-mission-control.service), exact propose.lumennode.uk
chassis. No build step, no framework, no LLM calls. (v2 adds a Vite/React build for
`ui/dist`, served as a static SPA by the same FastAPI app — see REDESIGN_V2.md.)

## Data access
- READS: sqlite3 "file:/home/lumen/agents/work-queue/queue.db?mode=ro&immutable=0"
  (uri=True). Tables: tasks(id,lane,pri,title,detail,deps,status,claimed_by,
  claimed_at,done_at,notes,created_at,lease_expires,subsystems,gate),
  slocks(scope,holder,acquired_at,expires_at,note).
- WRITES: subprocess /home/lumen/bin/wq {add,edit,done,block,release} only.
  stdout/stderr surfaced verbatim to the UI (dedup refusals, gate messages etc.
  are FEATURES, not errors to hide).
- Lane creation: subprocess /home/lumen/bin/wq-lane-init <lane> <dir> "<desc>" [lock].
- Files: dispatch prompts /home/lumen/agents/work-queue/*_DISPATCH.md; boards
  resolved per-lane (project_dir/docs/QUEUE_PROGRESS.md — project_dir stored in
  a tiny mctl-local registry projects.json since wq has no lane→dir mapping);
  reports /home/lumen/agents/work-queue/reports/*.md (read-only, path-jailed).

## Routes
GET  /                     v2 SPA (ui/dist, see REDESIGN_V2.md) — split-pane console, mounted last as a static-file fallback
GET  /legacy               legacy dashboard below: lanes summary, active claims + lease countdowns, slocks, recent reports
GET  /lane/{lane}          deeplink redirect -> /#/lane/{lane} (v2 picks the hash up on load; legacy's own hash router also understood it)
GET  /api/state            JSON: lanes, tickets, slocks, now (single poll endpoint, 5s UI refresh)
GET  /api/lane/{lane}      JSON: tickets + dispatch text + board text (+ mtime)
GET  /api/report/{name}    report markdown (name jailed to reports dir, .md only)
GET  /reports              report browser
POST /api/ticket           wq add   (lane,pri,title,detail,deps,subsystems,gate)
POST /api/ticket/{id}/edit wq edit
POST /api/ticket/{id}/done wq done --notes
POST /api/ticket/{id}/block wq block reason
POST /api/ticket/{id}/release wq release
POST /api/project          wq-lane-init flow (validates dir exists; refuses clobber)
All POSTs return {ok, stdout, stderr} — CLI is the source of truth.

## Write-path rule (HARD)
No SQL writes to queue.db, ever, from this app. The ro connection cannot write
(mode=ro enforced by SQLite). Every mutation shells to wq so BEGIN IMMEDIATE
atomicity, lease reclaim, slock acquisition/release, title dedup, canonical
subsystem vocabulary, gate checks, and the user-lane claim refusal stay enforced
in ONE place. Markdown rendering is client-side (tiny renderer, textContent-safe).

## UI
Dark, Scribe/propose-family palette. Dashboard = immediately actionable (Frank's
Leantime complaint): lane cards with open/claimed/blocked/done counts, live
claims with lease countdowns, held slocks, latest reports. Lane page leads with
the dispatch prompt in a <pre> + one-click copy (navigator.clipboard with
execCommand fallback for non-secure contexts). Ticket rows expand to full detail
(the wq#470-472 style long-form prompts render whole). New-ticket form mirrors
wq add flags. New-project modal mirrors wq-lane-init args.

## Deploy
- /etc/systemd/system/lumen-mission-control.service (propose pattern, hardened).
- CF Access app for mctl.lumennode.uk created FIRST via API (copy propose:
  Frank-only email allow, auto_redirect, 24h) — verified BEFORE hostname added.
- cloudflared: .bak config.yml, insert mctl → localhost:8136, `cloudflared
  tunnel ingress validate`, restart, then verify vault.lumennode.uk still 302
  and mctl returns Access redirect (302 to lumenseyes.cloudflareaccess.com).
- Rollback: restore config.yml.bak + restart cloudflared; systemctl disable
  --now lumen-mission-control; delete Access app. queue.db untouched by design.
