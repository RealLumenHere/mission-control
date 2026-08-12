# Lumen Mission Control — REQUIREMENTS (assembled 2026-08-12)

Sources: past claude.ai sessions (0812 LPP audit, 0702 Leantime-replacement directive,
0626/0611 Leantime frustration sessions), Lumen episodic recall, session-start.md
ORCHESTRATOR RULE, live wq/wq-lane-init/_TEMPLATE_DISPATCH.md tooling, wq#470-472
as ticket-quality bar.

## Frank's stated wants (verbatim-derived, treat as hard)

1. "This next part can harness the power of multiple agents. Here is a prompt to
   get them started." — Frank must be HANDED the dispatch prompt, never dig for it.
   "it takes a second for him and minutes for me." → COPY BUTTON, top of lane page.
2. Log in and be immediately greeted with actionable state — no menu spelunking
   (root Leantime complaint: static tiles, dead landing page, empty task records
   with no context, no agent prompts, no status history).
3. Create a project in the browser → get a parallel-agent lane (the wq-lane-init
   flow: lane + dispatch file + progress board + lock names) without the CLI.
4. Live queue view per lane: open/claimed/blocked/done, claim holder, lease
   countdown, subsystems/gates visible. Add/edit/block/release/done from the UI.
5. Progress boards (docs/QUEUE_PROGRESS.md per project) rendered live.
6. Reports (/home/lumen/agents/work-queue/reports/*.md) rendered in-browser.
7. Low friction: exists so interactive Claude sessions stay low-context (the
   ORCHESTRATOR RULE, Frank directive 2026-08-12) and Frank orchestrates without
   the CLI.

## Hard constraints

- Queue WRITES only via `wq` CLI subprocess (add/edit/done/block/release) —
  preserves BEGIN IMMEDIATE atomicity, lease reclaim, slock enforcement,
  title-dedup, user-lane claim refusal. Direct SQL on queue.db is mode=ro ONLY.
- slock: read-only views, never bypass.
- No LLM calls. No paid APIs. No build pipeline (single-file FastAPI +
  vanilla JS, propose.lumennode.uk chassis).
- Deployment: 127.0.0.1 bind + cloudflared ingress + CF Access (Frank-only,
  copy propose policy: allow email fstupak.peace@gmail.com, Google SSO
  auto-redirect, 24h session). NEVER exposed unauthenticated.

## Scribe decision (Phase 1 survey)

Scribe (scribe.lumennode.uk, :8131, 194 tasks, pt CLI) is ALIVE and has a real
web UI — it IS the Leantime replacement for long-lived project/task tracking,
authoritative since 2026-07-16. Frank's residual "no Leantime replacement"
pain is specifically the AGENT-ORCHESTRATION surface: lanes, dispatch prompts,
claims/leases, boards, reports — none of which Scribe models.

DECISION: leave Scribe as-is for long-lived tasks; Mission Control is the
wq/parallel-agent orchestration surface. Integration = a persistent nav link to
scribe.lumennode.uk (and pokemon.lumennode.uk etc. where relevant). No writes
to Scribe's data. No sync (two ticket stores syncing = drift bugs; the two
systems answer different questions: "what should get done eventually" vs
"what are agents doing right now").

## Out of scope v1

- GitHub repo creation (Frank-gated ticket only; local git fine).
- Editing dispatch files from the UI (read+copy only; files are agent-authored).
- Writing to progress boards from the UI (append-only agent surface).
- Auth beyond CF Access (app trusts the tunnel; binds localhost).
