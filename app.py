#!/usr/bin/env python3
"""Lumen Mission Control — wq parallel-agent orchestration surface.
mctl.lumennode.uk · 127.0.0.1:8136 · CF Access Frank-only.
READS: queue.db mode=ro. WRITES: /home/lumen/bin/wq subprocess ONLY (atomicity,
leases, slocks, dedup, gates all stay enforced in the CLI). No LLM calls."""
import asyncio, json, os, re, sqlite3, subprocess, datetime, html, urllib.request
from pathlib import Path
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

WQ = "/home/lumen/bin/wq"
LANE_INIT = "/home/lumen/bin/wq-lane-init"
WQDIR = Path("/home/lumen/agents/work-queue")
DB = WQDIR / "queue.db"
REPORTS = WQDIR / "reports"
RUNS = WQDIR / "_runs"
GOV_STATE = Path("/home/lumen/foreman/state.json")
REGFILE = Path(__file__).resolve().parent / "projects.json"
# wq#744's collector writes here (not mission-control/, which that ticket's own
# "do not touch mission-control" constraint ruled out — see reports/wq744_mcv2_t4_telemetry.md).
FLEET_SNAPSHOT = Path("/home/lumen/telemetry/fleet_telemetry.json")
FLEET_STALE_S = 60  # 2x the collector's 30s timer cadence (T4 report's own guidance)
LANE_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")
REPORT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.(md|diff|txt)$")
WORKER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")
SENTINELS = ("TICKET_CLOSED", "BLOCKED", "CLAIM_ERROR")
# wq#768 T7: 52 blocked / 23 naming Frank|gate|approval is the audit's own count
# method (FLEET_OPS_AUDIT_2026-08-21.md F1) — mirrored here as the blocked-by-human
# classifier so the review queue's count is reproducible against that finding.
REVIEW_HUMAN_RE = re.compile(r"\b(frank|gate|approval)\b", re.I)
PROPOSALS_SUMMARY_URL = "http://127.0.0.1:8110/api/summary"

app = FastAPI(title="Lumen Mission Control", docs_url=None, redoc_url=None)

# v2 SPA (docs/REDESIGN_V2.md) — prebuilt ui/dist, mounted read-only at /v2.
# Legacy inline UI below stays at / for this rollout cycle.
UI_DIST = Path(__file__).resolve().parent / "ui" / "dist"
if UI_DIST.is_dir():
    app.mount("/v2", StaticFiles(directory=UI_DIST, html=True), name="mc-v2")

def ro():
    c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=10)
    c.row_factory = sqlite3.Row
    return c

def deps_met(c, deps):
    """Mirrors wq's own deps_met() (bin/wq) — a dep is met only if that
    ticket id exists and is status='done'. wq#660: read-only rendering check,
    no wq schema/logic change."""
    if not deps or not deps.strip():
        return True
    for d in [x.strip() for x in deps.split(",") if x.strip()]:
        r = c.execute("SELECT status FROM tasks WHERE id=?", (d,)).fetchone()
        if not r or r["status"] != "done":
            return False
    return True

_FMT = "%Y-%m-%d %H:%M:%S"
_AGING_DAYS = int(os.environ.get("WQ_AGING_DAYS", "7") or "7")

def mc_effective_pri(pri, status, gate, created_at):
    """wq#661: mirrors wq's effective_pri(). Computed read-only; never touches stored pri.
    Only open/unclaimed tickets are boosted. Blocked/gated tickets are excluded.
    Boost: +1 tier per WQ_AGING_DAYS days, capped at 1. Never goes below 1."""
    if status != "open":
        return pri
    if gate and str(gate).strip():
        return pri
    try:
        created = datetime.datetime.strptime(created_at, _FMT).replace(tzinfo=datetime.timezone.utc)
        days = (datetime.datetime.now(datetime.timezone.utc) - created).total_seconds() / 86400.0
    except (TypeError, ValueError):
        return pri
    boost = min(1, int(days / _AGING_DAYS))
    return max(1, pri - boost)

def mc_gate_met(gate):
    """Mirrors wq's own gate_met() (bin/wq) — a gate clause is 'path' or
    'path:exists'/'path:missing'; empty gate is always met. Read-only precondition
    check, no wq schema/logic change. Returns (ok, reason)."""
    if not gate or not gate.strip():
        return True, ""
    for clause in [x.strip() for x in gate.split(",") if x.strip()]:
        path, _, cond = clause.rpartition(":") if ":" in clause else (clause, "", "exists")
        path = path.strip(); cond = (cond or "exists").strip().lower()
        present = os.path.exists(path)
        if cond == "exists" and not present:
            return False, f"gate: {path} missing"
        if cond == "missing" and present:
            return False, f"gate: {path} present (must be absent)"
    return True, ""

def proposals_pending():
    """Server-side-only fetch of the Minerva proposals dashboard's pending count
    (wq#768 T7 scope item 4) — CF Access on propose.lumennode.uk is Frank-only,
    so the browser must never call it directly; this hits its loopback port
    instead. 'deploy_ready' is proposals-ui/app.py's ALLOWED_STATUS bucket a
    human PATCHes a proposal into before shipping/deferring/rejecting it — the
    closest thing that service exposes to "awaiting your decision". Fail-soft:
    None when the service is down or unreachable."""
    try:
        with urllib.request.urlopen(PROPOSALS_SUMMARY_URL, timeout=3) as r:
            data = json.loads(r.read())
        return data.get("deploy_ready", 0)
    except Exception:
        return None

def run(args, timeout=90):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return {"ok": p.returncode == 0, "code": p.returncode,
                "stdout": p.stdout.strip(), "stderr": p.stderr.strip()}
    except subprocess.TimeoutExpired:
        return {"ok": False, "code": -1, "stdout": "", "stderr": "timeout"}

def registry():
    try:
        return json.loads(REGFILE.read_text())
    except Exception:
        return {}

def dispatch_file(lane):
    name = "".join("_" if ch == "-" else ch.upper() for ch in lane) + "_DISPATCH.md"
    return WQDIR / name

def board_file(lane):
    r = registry().get(lane)
    if r and r.get("dir"):
        return Path(r["dir"]) / "docs" / "QUEUE_PROGRESS.md"
    return None

def read_text(p):
    try:
        if p and p.is_file():
            return {"text": p.read_text(errors="replace"),
                    "mtime": datetime.datetime.utcfromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%MZ"),
                    "path": str(p)}
    except Exception as e:
        return {"text": f"(read error: {e})", "mtime": "", "path": str(p)}
    return None

def governor_state():
    try:
        return json.loads(GOV_STATE.read_text())
    except Exception:
        return None

# ---------- fleet (T5) ----------
# Static host classification + agent/slock->host mapping, per REDESIGN_V2.md's fleet
# telemetry section. Nothing here is derived from live SSH/config probing (CONSTRAINT:
# never SSH from the web app) — it's a small hand-maintained map, same spirit as the
# lane/dispatch file naming conventions above.
FLEET_CLASS_HOSTS = {
    "orchestrator": ["lumen"],
    # Mac Pro 6,1 boxes running local inference rungs (isis: Qwen3-32B, nephthys:
    # Qwen3-14B awareness/embeddings, khepri: RE/forensics bench, currently offline).
    "inference-mac": ["isis", "nephthys", "khepri"],
    "n100": ["bes", "maat", "sobek", "sia"],
    # hapi.blade_naming (lumen_state): hapi-1..hapi-N sequential, max 6/chassis. None
    # have booted yet (hapi-1 bringup still pending per hapi-1.bringup_eta) so none of
    # these appear in the telemetry snapshot's roster (built from tailscale_ip facts,
    # which a blade only gets once it boots) — synthesized as "parked" placeholders
    # below rather than left off the grid.
    "hapi": ["hapi-1", "hapi-2", "hapi-3", "hapi-4", "hapi-5", "hapi-6"],
}
FLEET_CLASS_LABELS = {
    "orchestrator": "Orchestrator",
    "inference-mac": "Inference (Mac Pro)",
    "n100": "N100 Fleet",
    "hapi": "Hapi Chassis (BC-250)",
    "other": "Other",
}
FLEET_CLASS_ORDER = ["orchestrator", "inference-mac", "n100", "hapi", "other"]
FLEET_HOST_CLASS = {h: c for c, hosts in FLEET_CLASS_HOSTS.items() for h in hosts}

def fleet_node_class(host):
    return FLEET_HOST_CLASS.get(host, "other")

def fleet_hosts_for_claim(lane, subsystems):
    """wq claim -> host(s). Per REDESIGN_V2.md: all claude -p workers run on Lumen
    (default), except the LPP/pokemon lane which drives gameboy directly, and litellm
    subsystem work which touches the local-inference rungs on isis/nephthys. The
    "litellm" subsystem tag doesn't distinguish which rung (see queue.db — tickets are
    tagged just "litellm", never "litellm-isis" etc.), so both are tagged rather than
    guessing one."""
    subs = {s.strip() for s in (subsystems or "").split(",") if s.strip()}
    if "litellm" in subs:
        return ["isis", "nephthys"]
    if lane == "pokemon":
        return ["gameboy"]
    return ["lumen"]

def fleet_hosts_for_scope(scope):
    """slock scope -> host(s), same reasoning as fleet_hosts_for_claim above."""
    if scope == "litellm" or scope.startswith("litellm-"):
        return ["isis", "nephthys"]
    if scope in ("lpp-tree", "lpp-repo"):
        return ["gameboy"]
    return ["lumen"]

def resolve_run(worker):
    """Map a wq claimed_by id to its _runs/<worker>.jsonl transcript, tolerating
    the registration suffix a session can grow after its spawn-time filename
    was fixed (e.g. claimed_by fleet10-a9889e-699609, file fleet10-a9889e.jsonl)."""
    direct = RUNS / f"{worker}.jsonl"
    if direct.is_file():
        return direct
    best = None
    for p in RUNS.glob("*.jsonl"):
        stem = p.stem
        if worker.startswith(stem) or stem.startswith(worker):
            if best is None or len(stem) > len(best.stem):
                best = p
    return best

def worker_stats(path):
    turns = tools = 0
    sentinel = None
    last_ts = None
    finished = False
    cost = None
    try:
        with path.open(errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                t = d.get("type")
                if d.get("timestamp"):
                    last_ts = d["timestamp"]
                if t == "assistant":
                    content = (d.get("message") or {}).get("content") or []
                    real = False
                    for c in content:
                        ct = c.get("type")
                        if ct == "tool_use":
                            tools += 1; real = True
                        elif ct == "text":
                            real = True
                            txt = (c.get("text") or "").strip()
                            if txt in SENTINELS:
                                sentinel = txt
                    if real:
                        turns += 1
                elif t == "result":
                    finished = True
                    cost = d.get("total_cost_usd")
                    if d.get("num_turns") is not None:
                        turns = d["num_turns"]
    except Exception:
        pass
    st = path.stat()
    return {"turns": turns, "tools": tools, "cost": cost, "sentinel": sentinel,
            "finished": finished, "mtime": datetime.datetime.utcfromtimestamp(st.st_mtime).strftime("%Y-%m-%d %H:%MZ"),
            "kb": round(st.st_size / 1024, 1), "file": path.name}

def summarize_input(name, inp):
    if not isinstance(inp, dict):
        return str(inp)[:220]
    if name == "Bash" and "command" in inp:
        return inp["command"][:220]
    if "file_path" in inp:
        return inp["file_path"]
    return json.dumps(inp)[:220]

def render_event(d):
    """One transcript line -> a human-readable (kind, text) pair, or None to skip.
    Mirrors the assistant-text / [Tool] / result-block shape used in board-history
    transcript summaries; hook/thinking-token/init noise is dropped."""
    t = d.get("type")
    if t == "assistant":
        out = []
        for c in (d.get("message") or {}).get("content") or []:
            ct = c.get("type")
            if ct == "text" and c.get("text", "").strip():
                out.append(("text", c["text"].strip()))
            elif ct == "tool_use":
                out.append(("tool", f"[Tool] {c.get('name')}: {summarize_input(c.get('name'), c.get('input'))}"))
        return out
    if t == "user":
        out = []
        for c in (d.get("message") or {}).get("content") or []:
            if c.get("type") != "tool_result":
                continue
            content = c.get("content")
            if isinstance(content, list):
                content = "\n".join(b.get("text", "") for b in content if isinstance(b, dict))
            text = str(content or "")[:800]
            out.append(("result", ("[Error] " if c.get("is_error") else "") + text))
        return out
    if t == "result":
        cost = d.get("total_cost_usd")
        summary = (f"— run finished: {'ERROR' if d.get('is_error') else 'ok'}, "
                   f"{d.get('num_turns', '?')} turns, "
                   f"{'$%.3f' % cost if cost is not None else 'cost n/a'}, "
                   f"stop={d.get('stop_reason')}")
        return [("done", summary)]
    if t == "system" and d.get("subtype") == "permission_denied":
        return [("denied", f"[Denied] {d.get('message', '')[:300]}")]
    return None

def sse(obj):
    return f"data: {json.dumps(obj)}\n\n"


# ---------- read APIs ----------
@app.get("/api/state")
def api_state():
    c = ro()
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    lanes = {}
    for r in c.execute("SELECT lane,status,COUNT(*) n FROM tasks GROUP BY lane,status"):
        lanes.setdefault(r["lane"], {})[r["status"]] = r["n"]
    claims = [dict(r) for r in c.execute(
        "SELECT id,lane,pri,title,claimed_by,claimed_at,lease_expires,subsystems "
        "FROM tasks WHERE status='claimed' ORDER BY lease_expires")]
    slocks = [dict(r) for r in c.execute(
        "SELECT scope,holder,acquired_at,expires_at,note FROM slocks WHERE expires_at>=? ORDER BY scope", (now,))]
    c.close()
    reg = registry()
    reports = sorted(REPORTS.glob("*"), key=lambda p: p.stat().st_mtime, reverse=True)[:12]
    return {"now": now, "lanes": lanes, "claims": claims, "slocks": slocks,
            "projects": reg,
            "dispatch_lanes": [l for l in lanes if dispatch_file(l).is_file()],
            "recent_reports": [p.name for p in reports if p.is_file()],
            "proposals_pending": proposals_pending()}

@app.get("/api/review")
def api_review():
    """wq#768 T7 — REVIEW queue: surfaces work parked on a human decision.
    Aggregates read-only: blocked tickets whose notes name Frank/gate/approval
    (REVIEW_HUMAN_RE — mirrors FLEET_OPS_AUDIT_2026-08-21.md's own count method),
    the `user` lane in full (Frank-only by wq convention — wq claim refuses it),
    and open/claimed/blocked tickets with an unmet --gate precondition. A ticket
    that's merely open-dependent on another ticket's deps is NOT included — it's
    waiting on work, not on Frank. `downstream` is the other non-done tickets that
    list this one in their own deps, i.e. what a decision here unblocks."""
    c = ro()
    now_dt = datetime.datetime.now(datetime.timezone.utc)
    now = now_dt.strftime(_FMT)
    rows = [dict(r) for r in c.execute("SELECT * FROM tasks WHERE status != 'done'")]
    c.close()

    downstream = {}
    for r in rows:
        for d in [x.strip() for x in (r["deps"] or "").split(",") if x.strip()]:
            downstream.setdefault(d, []).append({"id": r["id"], "lane": r["lane"], "title": r["title"]})

    items = []
    for r in rows:
        kinds = []
        if r["lane"] == "user":
            kinds.append("user_lane")
        gate_ok, gate_reason = mc_gate_met(r["gate"])
        if r["gate"] and not gate_ok:
            kinds.append("gated")
        if r["status"] == "blocked" and REVIEW_HUMAN_RE.search(r["notes"] or ""):
            kinds.append("blocked_human")
        if not kinds:
            continue

        note_line = next((ln.strip() for ln in (r["notes"] or "").splitlines() if ln.strip()), "")
        reason = (note_line or
                  (gate_reason if "gated" in kinds else "") or
                  ("parked in user lane — Frank-only" if "user_lane" in kinds else "awaiting decision"))

        try:
            created = datetime.datetime.strptime(r["created_at"], _FMT).replace(tzinfo=datetime.timezone.utc)
            age_days = (now_dt - created).total_seconds() / 86400.0
        except (TypeError, ValueError):
            age_days = 0.0

        down = downstream.get(str(r["id"]), [])
        # cost-of-delay = (downstream blocked count x age); +1 so an isolated
        # item still ranks by age instead of collapsing to zero.
        cost = (len(down) + 1) * age_days

        items.append({
            "id": r["id"], "lane": r["lane"], "title": r["title"], "pri": r["pri"],
            "status": r["status"], "kinds": kinds, "reason": reason[:220],
            "notes": r["notes"], "gate": r["gate"], "created_at": r["created_at"],
            "age_days": round(age_days, 2),
            "downstream": down, "downstream_count": len(down),
            "cost_of_delay": round(cost, 2),
        })

    items.sort(key=lambda x: x["cost_of_delay"], reverse=True)
    return {"now": now, "items": items, "count": len(items)}

@app.get("/api/lane/{lane}")
def api_lane(lane: str, include_done: int = 0):
    if not LANE_RE.match(lane):
        return JSONResponse({"error": "bad lane"}, status_code=400)
    c = ro()
    # wq#661: fetch unsorted, compute effective_priority, sort in Python.
    # status-group (claimed < open < blocked < done) -> effective_priority -> age.
    q = "SELECT * FROM tasks WHERE lane=?"
    rows = [dict(r) for r in c.execute(q, (lane,))]
    for r in rows:
        r["deps_met"] = deps_met(c, r["deps"])
        r["effective_pri"] = mc_effective_pri(r.get("pri", 2), r.get("status", ""),
                                              r.get("gate", ""), r.get("created_at", ""))
    c.close()
    _STATUS_ORDER = {"claimed": 0, "open": 1, "blocked": 2, "done": 3}
    rows.sort(key=lambda r: (_STATUS_ORDER.get(r["status"], 3),
                             r["effective_pri"], r.get("created_at") or ""))
    done = [r for r in rows if r["status"] == "done"]
    if not include_done:
        rows = [r for r in rows if r["status"] != "done"] + done[-8:]
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    return {"now": now, "lane": lane, "tickets": rows, "done_total": len(done),
            "dispatch": read_text(dispatch_file(lane)),
            "board": read_text(board_file(lane)),
            "project": registry().get(lane)}

@app.get("/api/ticket/{tid}")
def api_ticket(tid: int):
    """Minimal single-ticket lookup — v2 X-Ray dep tooltips resolve dep ids
    (which may live in another lane) to a title+status without loading that
    lane's full ticket list. Read-only, same ro() cursor as everything else."""
    c = ro()
    r = c.execute("SELECT id,lane,title,status FROM tasks WHERE id=?", (tid,)).fetchone()
    c.close()
    if not r:
        return JSONResponse({"error": "not found"}, status_code=404)
    return dict(r)

@app.get("/api/report/{name}")
def api_report(name: str):
    if not REPORT_RE.match(name):
        return JSONResponse({"error": "bad name"}, status_code=400)
    p = (REPORTS / name).resolve()
    if not str(p).startswith(str(REPORTS.resolve()) + "/") or not p.is_file():
        return JSONResponse({"error": "not found"}, status_code=404)
    return read_text(p)

@app.get("/api/agents")
def api_agents():
    c = ro()
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    claims = [dict(r) for r in c.execute(
        "SELECT id,lane,pri,title,claimed_by,claimed_at,lease_expires,subsystems "
        "FROM tasks WHERE status='claimed' ORDER BY lane,lease_expires")]
    c.close()
    groups = {}
    for cl in claims:
        p = resolve_run(cl["claimed_by"]) if cl["claimed_by"] else None
        cl["worker"] = worker_stats(p) if p else None
        groups.setdefault(cl["lane"], []).append(cl)
    return {"now": now, "groups": groups, "governor": governor_state()}

@app.get("/api/agents/{worker}/tail")
async def api_agent_tail(worker: str, request: Request):
    if not WORKER_RE.match(worker):
        return JSONResponse({"error": "bad worker id"}, status_code=400)
    path = resolve_run(worker)
    if not path:
        return JSONResponse({"error": "no transcript for this worker"}, status_code=404)

    async def gen():
        buf = []
        with path.open(errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                ev = render_event(d)
                if ev:
                    buf.extend(ev)
            for kind, text in buf[-200:]:
                yield sse({"kind": kind, "text": text})
            yield sse({"kind": "sys", "text": "— live tail —"})
            pos = f.tell()
        while True:
            if await request.is_disconnected():
                return
            await asyncio.sleep(2)
            try:
                with path.open(errors="replace") as f:
                    f.seek(pos)
                    new = f.read()
                    pos = f.tell()
            except Exception:
                return
            for line in new.splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    d = json.loads(line)
                except Exception:
                    continue
                for kind, text in render_event(d) or []:
                    yield sse({"kind": kind, "text": text})

    return StreamingResponse(gen(), media_type="text/event-stream",
                              headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

@app.get("/api/reports")
def api_reports():
    out = []
    for p in sorted(REPORTS.glob("*"), key=lambda x: x.stat().st_mtime, reverse=True):
        if p.is_file() and REPORT_RE.match(p.name):
            out.append({"name": p.name, "kb": round(p.stat().st_size / 1024, 1),
                        "mtime": datetime.datetime.utcfromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%MZ")})
    return {"reports": out}

@app.get("/api/fleet")
def api_fleet():
    """Fleet Overview pane (T5). Read-only: serves wq#744's collector snapshot as-is,
    plus agent-lease/slock host tags computed from queue.db. CONSTRAINT: never SSH from
    the web app — a missing/unreadable snapshot is a graceful empty state, not an error."""
    now = datetime.datetime.now(datetime.timezone.utc)
    raw = None
    try:
        raw = json.loads(FLEET_SNAPSHOT.read_text())
    except Exception:
        raw = None

    generated_at = raw.get("generated_at") if raw else None
    staleness_s = None
    if generated_at:
        try:
            gen_dt = datetime.datetime.strptime(generated_at, "%Y-%m-%dT%H:%M:%SZ").replace(
                tzinfo=datetime.timezone.utc)
            staleness_s = round((now - gen_dt).total_seconds(), 1)
        except Exception:
            staleness_s = None
    stale = staleness_s is None or staleness_s > FLEET_STALE_S

    nodes = {host: dict(data) for host, data in (raw.get("nodes") or {}).items()} if raw else {}
    for slot in FLEET_CLASS_HOSTS["hapi"]:
        nodes.setdefault(slot, {"status": "parked"})
    for host, data in nodes.items():
        data["class"] = fleet_node_class(host)
        data["agents"] = []
        data["slocks"] = []

    c = ro()
    claims = [dict(r) for r in c.execute(
        "SELECT id,lane,title,claimed_by,subsystems FROM tasks WHERE status='claimed'")]
    now_s = now.strftime("%Y-%m-%d %H:%M:%S")
    slocks = [dict(r) for r in c.execute(
        "SELECT scope,holder,note FROM slocks WHERE expires_at>=? ORDER BY scope", (now_s,))]
    c.close()

    for cl in claims:
        for host in fleet_hosts_for_claim(cl["lane"], cl.get("subsystems")):
            if host in nodes:
                nodes[host]["agents"].append(
                    {"id": cl["id"], "lane": cl["lane"], "title": cl["title"], "claimed_by": cl["claimed_by"]})
    for sl in slocks:
        for host in fleet_hosts_for_scope(sl["scope"]):
            if host in nodes:
                nodes[host]["slocks"].append(
                    {"scope": sl["scope"], "holder": sl["holder"], "note": sl["note"]})

    groups = []
    for cls in FLEET_CLASS_ORDER:
        if cls == "other":
            hosts_in_class = sorted(h for h in nodes if fleet_node_class(h) == "other")
        else:
            hosts_in_class = [h for h in FLEET_CLASS_HOSTS[cls] if h in nodes]
        if hosts_in_class:
            groups.append({"class": cls, "label": FLEET_CLASS_LABELS[cls], "hosts": hosts_in_class})

    return {"generated_at": generated_at, "staleness_s": staleness_s, "stale": stale,
            "nodes": nodes, "groups": groups}


# ---------- write APIs (wq CLI subprocess ONLY — never SQL) ----------
class TicketNew(BaseModel):
    lane: str; title: str; detail: str = ""; pri: int = 2
    deps: str = ""; subsystems: str = ""; gate: str = ""; force: bool = False

class TicketEdit(BaseModel):
    title: str | None = None; detail: str | None = None; pri: int | None = None
    lane: str | None = None; status: str | None = None
    subsystems: str | None = None; gate: str | None = None; deps: str | None = None

class Reason(BaseModel):
    reason: str = ""; notes: str = ""

class ProjectNew(BaseModel):
    lane: str; project_dir: str; description: str; service_lock: str = ""

@app.post("/api/ticket")
def ticket_add(t: TicketNew):
    if not LANE_RE.match(t.lane):
        return JSONResponse({"ok": False, "stderr": "bad lane name"}, status_code=400)
    args = [WQ, "add", "--lane", t.lane, "--pri", str(t.pri), "--title", t.title]
    if t.detail: args += ["--detail", t.detail]
    if t.deps: args += ["--deps", t.deps]
    if t.subsystems: args += ["--subsystems", t.subsystems]
    if t.gate: args += ["--gate", t.gate]
    if t.force: args += ["--force"]
    return run(args)

@app.post("/api/ticket/{tid}/edit")
def ticket_edit(tid: int, t: TicketEdit):
    args = [WQ, "edit", str(tid)]
    for flag, val in (("--title", t.title), ("--detail", t.detail), ("--lane", t.lane),
                      ("--status", t.status), ("--subsystems", t.subsystems),
                      ("--gate", t.gate), ("--deps", t.deps)):
        if val is not None: args += [flag, val]
    if t.pri is not None: args += ["--pri", str(t.pri)]
    return run(args)

@app.post("/api/ticket/{tid}/done")
def ticket_done(tid: int, r: Reason):
    args = [WQ, "done", str(tid)]
    if r.notes: args += ["--notes", r.notes]
    return run(args)

@app.post("/api/ticket/{tid}/block")
def ticket_block(tid: int, r: Reason):
    if not r.reason.strip():
        return JSONResponse({"ok": False, "stderr": "reason required"}, status_code=400)
    return run([WQ, "block", str(tid), r.reason])

@app.post("/api/ticket/{tid}/release")
def ticket_release(tid: int):
    return run([WQ, "release", str(tid)])

@app.post("/api/project")
def project_new(p: ProjectNew):
    if not LANE_RE.match(p.lane):
        return JSONResponse({"ok": False, "stderr": "bad lane name (a-z0-9-)"}, status_code=400)
    d = Path(p.project_dir)
    if not d.is_absolute() or not d.is_dir():
        return JSONResponse({"ok": False, "stderr": f"project_dir must be an existing absolute dir: {p.project_dir}"}, status_code=400)
    args = [LANE_INIT, p.lane, str(d), p.description]
    if p.service_lock: args.append(p.service_lock)
    res = run(args)
    if res["ok"]:
        reg = registry()
        reg[p.lane] = {"dir": str(d), "desc": p.description,
                       "lock": p.service_lock or f"{p.lane}-service",
                       "created": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d")}
        REGFILE.write_text(json.dumps(reg, indent=1))
    return res

@app.get("/lane/{lane}")
def lane_deeplink(lane: str):
    return RedirectResponse(f"/#/lane/{lane}")

@app.get("/healthz")
def healthz():
    c = ro(); n = c.execute("SELECT COUNT(*) FROM tasks").fetchone()[0]; c.close()
    return {"ok": True, "tasks": n}

@app.get("/api/chat-sessions")
def api_chat_sessions():
    try:
        r = subprocess.run(
            ["tmux", "list-sessions", "-F",
             "#{session_name}\x09#{t:session_created}\x09#{session_windows}"],
            capture_output=True, text=True, timeout=5)
        sessions = []
        for line in r.stdout.splitlines():
            parts = line.split("\t", 2)
            if len(parts) == 3 and parts[0].startswith("lumen-chat-"):
                sessions.append({
                    "name": parts[0][len("lumen-chat-"):],
                    "created": parts[1],
                    "windows": int(parts[2]) if parts[2].isdigit() else 1,
                })
        return {"sessions": sessions, "chat_url": "https://chat.lumennode.uk"}
    except Exception as e:
        return {"sessions": [], "chat_url": "https://chat.lumennode.uk", "error": str(e)}


INDEX = r"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Mission Control</title><style>
:root{--bg:#0f1115;--panel:#171a21;--line:#2a2f3a;--txt:#d7dce4;--dim:#8a93a3;
--green:#3fb26f;--amber:#d9a441;--red:#d05555;--blue:#5a8fd6;--gray:#6b7280;--purple:#8b6fd0}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,sans-serif;background:var(--bg);color:var(--txt)}
a{color:var(--blue);text-decoration:none}a:hover{text-decoration:underline}
header{display:flex;gap:14px;align-items:baseline;padding:12px 18px;border-bottom:1px solid var(--line);position:sticky;top:0;background:var(--bg);z-index:5;flex-wrap:wrap}
header h1{font-size:17px;margin:0}header h1 a{color:var(--txt)}
header .ext{margin-left:auto;color:var(--dim);font-size:12px}
main{max-width:1200px;margin:0 auto;padding:16px}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:12px;cursor:pointer}
.card:hover{border-color:var(--blue)}
.card h3{margin:0 0 6px;font-size:15px}.card .cnt{display:flex;gap:10px;font-size:12px;color:var(--dim)}
.badge{display:inline-block;padding:1px 7px;border-radius:9px;font-size:11px;font-weight:600}
.b-open{background:#1d3324;color:var(--green)}.b-claimed{background:#33301d;color:var(--amber)}
.b-blocked{background:#331d1d;color:var(--red)}.b-done{background:#20242c;color:var(--gray)}
.b-rejected{background:#2a1d33;color:var(--purple)}
.b-open-dependent{background:#1d2a33;color:var(--blue)}
section{margin:22px 0}h2{font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--dim);margin:0 0 8px}
table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
th{color:var(--dim);font-size:12px}tr.trow{cursor:pointer}tr.trow:hover{background:#1a1e27}
pre{background:#0b0d11;border:1px solid var(--line);border-radius:8px;padding:12px;overflow:auto;white-space:pre-wrap;word-break:break-word;font:12.5px/1.5 ui-monospace,monospace}
code{background:#0b0d11;padding:1px 4px;border-radius:4px;font:12.5px ui-monospace,monospace}
button{background:#232836;color:var(--txt);border:1px solid var(--line);border-radius:6px;padding:6px 12px;cursor:pointer;font-size:13px}
button:hover{border-color:var(--blue)}button.primary{background:#1e3a5f;border-color:#2d5a94}
button.small{padding:2px 8px;font-size:11.5px}
input,select,textarea{background:#0b0d11;color:var(--txt);border:1px solid var(--line);border-radius:6px;padding:6px 8px;font:13px system-ui;width:100%}
textarea{font:12.5px ui-monospace,monospace;min-height:110px}
.row{display:flex;gap:8px;margin:6px 0;flex-wrap:wrap}.row>*{flex:1}.row .narrow{flex:0 0 90px}
.copybar{display:flex;align-items:center;gap:10px;margin:0 0 6px}
.copybar .ok{color:var(--green);font-size:12px;opacity:0;transition:opacity .3s}
.detail{display:none}.detail.show{display:table-row}.detail td{background:#12151c}
.muted{color:var(--dim);font-size:12px}
.lease-warn{color:var(--red);font-weight:600}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.6);display:none;align-items:flex-start;justify-content:center;padding:40px 12px;z-index:10;overflow:auto}
.modal.show{display:flex}.modal .box{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:18px;max-width:680px;width:100%}
.md h1,.md h2,.md h3{color:var(--txt);text-transform:none;letter-spacing:0}
.toast{position:fixed;bottom:16px;right:16px;background:#1d3324;color:var(--green);border:1px solid var(--green);border-radius:8px;padding:10px 14px;display:none;max-width:480px;white-space:pre-wrap;font-size:12.5px;z-index:20}
.toast.err{background:#331d1d;color:var(--red);border-color:var(--red)}
.gov{display:flex;gap:16px;flex-wrap:wrap;margin-bottom:16px}
.gbar{flex:1;min-width:150px}
.gbar .lbl{display:flex;justify-content:space-between;font-size:11.5px;color:var(--dim);margin-bottom:3px}
.gbar .track{background:#0b0d11;border:1px solid var(--line);border-radius:5px;height:8px;overflow:hidden}
.gbar .fill{height:100%;background:var(--green)}
.gbar .fill.warn{background:var(--amber)}.gbar .fill.crit{background:var(--red)}
.govflags{display:flex;gap:6px;align-items:center}
.flag{padding:2px 8px;border-radius:9px;font-size:11px;font-weight:600;background:#1d3324;color:var(--green)}
.flag.bad{background:#331d1d;color:var(--red)}
details.lanegrp{margin-bottom:14px;border:1px solid var(--line);border-radius:8px;padding:0 12px}
details.lanegrp summary{cursor:pointer;padding:10px 0;font-size:13px;text-transform:uppercase;letter-spacing:.05em;color:var(--dim)}
details.lanegrp summary b{color:var(--txt);text-transform:none;letter-spacing:0;font-size:14px}
.wcards{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px;padding-bottom:12px}
.wcard{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:11px;cursor:pointer}
.wcard:hover{border-color:var(--blue)}
.wcard h4{margin:0 0 4px;font-size:14px}.wcard .id{color:var(--dim);font-size:11.5px}
.wcard .stats{display:flex;gap:8px;flex-wrap:wrap;font-size:11.5px;color:var(--dim);margin-top:6px}
.wcard .sent{margin-top:4px}
.log{background:#0b0d11;border:1px solid var(--line);border-radius:8px;padding:10px;font:12.5px/1.5 ui-monospace,monospace;height:70vh;overflow:auto;white-space:pre-wrap;word-break:break-word}
.log .l-text{color:var(--txt)}.log .l-tool{color:var(--blue)}.log .l-result{color:var(--dim)}
.log .l-done{color:var(--green);font-weight:600}.log .l-denied{color:var(--red)}.log .l-sys{color:var(--dim);font-style:italic}
.log>div{padding:3px 0;border-bottom:1px solid #1b1f28}
</style></head><body>
<header><h1><a href="#/">🛰 Mission Control</a></h1>
<a href="#/">Lanes</a><a href="#/agents">Agents</a><a href="#/reports">Reports</a>
<span class="ext"><a href="https://scribe.lumennode.uk" target="_blank">Scribe ↗</a> · <a href="https://propose.lumennode.uk" target="_blank">Proposals ↗</a> · <a href="https://bench.lumennode.uk" target="_blank">Bench ↗</a> · <a href="https://chat.lumennode.uk" target="_blank">Chat ↗</a></span></header>
<main id="main">loading…</main>
<div class="modal" id="modal"><div class="box" id="modalbox"></div></div>
<div class="toast" id="toast"></div>
<script>
const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
let timer=null;
function toast(msg,err){const t=$("#toast");t.textContent=msg;t.className="toast"+(err?" err":"");t.style.display="block";setTimeout(()=>t.style.display="none",err?7000:3500)}
async function api(path,body){const r=await fetch(path,body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{});const j=await r.json();if(body){const out=[j.stdout,j.stderr].filter(Boolean).join("\n")||(j.ok?"ok":"failed");toast(out,!j.ok)}return j}
function md(t){let h=esc(t);h=h.replace(/```([\s\S]*?)```/g,(m,c)=>"<pre>"+c+"</pre>");
h=h.replace(/^### (.*)$/gm,"<h3>$1</h3>").replace(/^## (.*)$/gm,"<h2>$1</h2>").replace(/^# (.*)$/gm,"<h1>$1</h1>");
h=h.replace(/\*\*([^*\n]+)\*\*/g,"<b>$1</b>").replace(/`([^`\n]+)`/g,"<code>$1</code>");
h=h.replace(/^[-*] (.*)$/gm,"• $1").replace(/\n/g,"<br>");return h}
function leaseLeft(exp,now){if(!exp)return"";const ms=Date.parse(exp+"Z")-Date.parse(now.replace(" ","T")+"Z");if(isNaN(ms))return esc(exp);if(ms<0)return'<span class="lease-warn">EXPIRED</span>';const m=Math.floor(ms/60000);return(m<20?'<span class="lease-warn">':"")+(m>=60?Math.floor(m/60)+"h"+(m%60)+"m":m+"m")+(m<20?"</span>":"")+" left"}
function copyText(txt,el){const done=()=>{el.style.opacity=1;setTimeout(()=>el.style.opacity=0,1500)};
if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(done).catch(()=>fallback())}else fallback();
function fallback(){const ta=document.createElement("textarea");ta.value=txt;document.body.appendChild(ta);ta.select();document.execCommand("copy");ta.remove();done()}}
</script>
"""

INDEX += r"""<script>
async function dash(){
const s=await api("/api/state");if(location.hash&&location.hash!=="#/"&&!location.hash.startsWith("#/?"))return;
const lanes=Object.keys(s.lanes).sort();
let h='<section><h2>Lanes</h2><div class="cards">';
for(const l of lanes){const c=s.lanes[l];
h+=`<div class="card" onclick="location.hash='#/lane/${l}'"><h3>${esc(l)}${s.dispatch_lanes.includes(l)?' <span class="muted">📋</span>':''}</h3><div class="cnt">`;
for(const st of["open","claimed","blocked","done"])if(c[st])h+=`<span class="badge b-${st}">${c[st]} ${st}</span>`;
h+='</div></div>';}
h+='<div class="card" style="border-style:dashed" onclick="newProject()"><h3>＋ New project</h3><div class="muted">lane + dispatch prompt + board</div></div></div></section>';
h+='<section><h2>Active claims</h2>';
if(!s.claims.length)h+='<div class="muted">none — all lanes quiet</div>';
else{h+='<table><tr><th>#</th><th>lane</th><th>title</th><th>agent</th><th>lease</th><th>subsystems</th></tr>';
for(const c of s.claims)h+=`<tr class="trow" onclick="location.hash='#/lane/${esc(c.lane)}'"><td>${c.id}</td><td>${esc(c.lane)}</td><td>${esc(c.title)}</td><td>${esc(c.claimed_by)}</td><td>${leaseLeft(c.lease_expires,s.now)}</td><td class="muted">${esc(c.subsystems||"")}</td></tr>`;
h+='</table>';}h+='</section>';
h+='<section><h2>Held subsystem locks</h2>';
if(!s.slocks.length)h+='<div class="muted">none held</div>';
else{h+='<table><tr><th>scope</th><th>holder</th><th>expires</th><th>note</th></tr>';
for(const k of s.slocks)h+=`<tr><td>${esc(k.scope)}</td><td>${esc(k.holder)}</td><td>${leaseLeft(k.expires_at,s.now)}</td><td class="muted">${esc(k.note)}</td></tr>`;h+='</table>';}
h+='</section><section><h2>Recent reports</h2>';
h+=s.recent_reports.map(r=>`<a href="#/report/${esc(r)}">${esc(r)}</a>`).join(" · ")||'<span class="muted">none</span>';
h+='</section>';
h+=await chatSessionsSection();
$("#main").innerHTML=h;}

async function chatSessionsSection(){
const cs=await api("/api/chat-sessions").catch(()=>({sessions:[],chat_url:"https://chat.lumennode.uk"}));
let h='<section><h2>Claude Chat Sessions <a href="'+esc(cs.chat_url)+'" target="_blank" style="font-size:11px;text-transform:none;letter-spacing:0;margin-left:6px">Open terminal ↗</a></h2>';
if(cs.error)h+=`<div class="muted">error: ${esc(cs.error)}</div>`;
else if(!cs.sessions||!cs.sessions.length)h+='<div class="muted">no active sessions — <a href="'+esc(cs.chat_url)+'" target="_blank">open chat.lumennode.uk</a> to start one</div>';
else{h+='<table><tr><th>session</th><th>created</th><th>windows</th><th></th></tr>';
for(const s of cs.sessions)h+=`<tr><td><code>${esc(s.name)}</code></td><td class="muted">${esc(s.created)}</td><td class="muted">${esc(String(s.windows))}</td><td><a href="${esc(cs.chat_url)}" target="_blank" class="button small">attach</a></td></tr>`;
h+='</table>';}
h+='</section>';return h;}

function newProject(){
$("#modalbox").innerHTML=`<h2 style="margin-top:0">New project → parallel-agent lane</h2>
<div class="muted" style="margin-bottom:8px">Runs wq-lane-init: creates the lane's dispatch prompt, the project progress board, and lock names. Project dir must already exist on Lumen.</div>
<div class="row"><input id="p_lane" placeholder="lane (a-z0-9-)"><input id="p_lock" placeholder="service lock (optional, default <lane>-service)"></div>
<div class="row"><input id="p_dir" placeholder="/home/lumen/<project_dir> (must exist)"></div>
<div class="row"><input id="p_desc" placeholder="one-line project description (goes into the dispatch prompt)"></div>
<div class="row"><button class="primary" onclick="createProject()">Create lane</button><button onclick="$('#modal').classList.remove('show')">Cancel</button></div>
<pre id="p_out" style="display:none"></pre>`;
$("#modal").classList.add("show");}
async function createProject(){
const j=await api("/api/project",{lane:$("#p_lane").value.trim(),project_dir:$("#p_dir").value.trim(),description:$("#p_desc").value.trim(),service_lock:$("#p_lock").value.trim()});
const o=$("#p_out");o.style.display="block";o.textContent=[j.stdout,j.stderr].filter(Boolean).join("\n");
if(j.ok)setTimeout(()=>{$("#modal").classList.remove("show");location.hash="#/lane/"+$("#p_lane").value.trim()},1800);}
</script>
"""

INDEX += r"""<script>
let showDone=false;
let openDetails=new Set();
function toggleDetail(id){if(openDetails.has(id))openDetails.delete(id);else openDetails.add(id);document.getElementById('d'+id).classList.toggle('show')}
let numSort=0;let curLane=null;
function toggleNumSort(){numSort=numSort===0?1:(numSort===1?-1:0);if(curLane)lanePage(curLane)}
async function lanePage(lane){
curLane=lane;
const s=await api("/api/lane/"+lane+(showDone?"?include_done=1":""));
if(location.hash!=="#/lane/"+lane)return;
if(numSort)s.tickets=s.tickets.slice().sort((a,b)=>(a.id-b.id)*numSort);
let h=`<section><h2>Lane: ${esc(lane)}${s.project?` · <span class="muted">${esc(s.project.dir)} · lock ${esc(s.project.lock)}</span>`:""}</h2>`;
if(s.dispatch){
h+=`<div class="copybar"><button class="primary" id="copybtn">📋 Copy dispatch prompt</button><span class="ok" id="copyok">copied ✓</span><span class="muted">${esc(s.dispatch.path)} · ${esc(s.dispatch.mtime)}</span></div>`;
h+=`<pre id="dispatchtxt">${esc(s.dispatch.text)}</pre>`;
}else h+=`<div class="muted">No dispatch prompt for this lane yet (create via New project, or agents work it ad hoc).</div>`;
h+='</section><section><h2>Tickets</h2>';
h+=`<div class="row"><button class="small" onclick="newTicket('${esc(lane)}')">＋ Add ticket</button><button class="small" onclick="showDone=!showDone;render()">${showDone?"hide":"show all"} done (${s.done_total})</button></div>`;
if(!s.tickets.length)h+='<div class="muted">lane empty</div>';
else{h+=`<table><tr><th onclick="toggleNumSort()" style="cursor:pointer" title="click to sort by ticket #">#${numSort===1?" ▲":numSort===-1?" ▼":""}</th><th>p</th><th>status</th><th>title</th><th>agent / lease</th></tr>`;
for(const t of s.tickets){
const dispStatus=(t.status==="open"&&t.deps_met===false)?"open-dependent":t.status;
h+=`<tr class="trow" onclick="toggleDetail(${t.id})">
<td>${t.id}</td><td>${t.pri}</td><td><span class="badge b-${esc(dispStatus)}">${esc(dispStatus)}</span></td>
<td>${esc(t.title)}${t.gate?' <span class="muted">[gated]</span>':''}${t.subsystems?` <span class="muted">subs=${esc(t.subsystems)}</span>`:''}</td>
<td class="muted">${esc(t.claimed_by||"")}${t.status==="claimed"?" · "+leaseLeft(t.lease_expires,s.now):""}</td></tr>`;
h+=`<tr class="detail${openDetails.has(t.id)?" show":""}" id="d${t.id}"><td colspan="5"><pre>${esc(t.detail||"(no detail)")}</pre>`;
h+=`<div class="muted">priority: ${t.pri}</div>`;
if(t.notes)h+=`<div class="muted">notes: ${linkReport(t.notes)}</div>`;
if(t.deps)h+=`<div class="muted">deps: ${esc(t.deps)}</div>`;
h+=`<div class="row" style="margin-top:8px">`;
if(t.status!=="done")h+=`<button class="small" onclick="event.stopPropagation();act(${t.id},'done')">✓ done</button>
<button class="small" onclick="event.stopPropagation();act(${t.id},'block')">⛔ block</button>`;
if(t.status==="claimed"||t.status==="blocked")h+=`<button class="small" onclick="event.stopPropagation();act(${t.id},'release')">↩ release</button>`;
h+=`<button class="small" onclick="event.stopPropagation();editTicket(${t.id},'${esc(lane)}')">✎ edit</button></div></td></tr>`;}
h+='</table>';}h+='</section>';
if(s.board){h+=`<section><h2>Progress board <span class="muted">· ${esc(s.board.path)} · ${esc(s.board.mtime)}</span></h2><pre>${esc(s.board.text)}</pre></section>`;}
$("#main").innerHTML=h;
if(s.dispatch)$("#copybtn").onclick=()=>copyText(s.dispatch.text,$("#copyok"));}
function linkReport(n){const m=String(n).match(/^reports\/(.+)$/);return m?`<a href="#/report/${esc(m[1])}">${esc(n)}</a>`:esc(n)}
async function act(id,verb){
if(verb==="block"){const r=prompt("Block reason:");if(!r)return;await api(`/api/ticket/${id}/block`,{reason:r})}
else if(verb==="done"){const n=prompt("Notes (e.g. reports/<file>.md) — optional:")??"";await api(`/api/ticket/${id}/done`,{notes:n})}
else await api(`/api/ticket/${id}/${verb}`,{});
render();}
function newTicket(lane){
$("#modalbox").innerHTML=`<h2 style="margin-top:0">Add ticket → ${esc(lane)}</h2>
<div class="row"><input id="t_title" placeholder="title"><select id="t_pri" class="narrow"><option>1</option><option selected>2</option><option>3</option><option>4</option></select></div>
<div class="row"><textarea id="t_detail" placeholder="detail — full self-contained agent prompt: PROBLEM / SCOPE / DELIVER / CONSTRAINTS, report path, locks (see wq#470-472 as the bar)"></textarea></div>
<div class="row"><input id="t_deps" placeholder="deps (comma ids, optional)"><input id="t_subs" placeholder="subsystems (canonical, optional)"><input id="t_gate" placeholder="gate path[:exists|:missing] (optional)"></div>
<div class="row"><button class="primary" onclick="addTicket('${esc(lane)}')">Add</button><button onclick="$('#modal').classList.remove('show')">Cancel</button></div>`;
$("#modal").classList.add("show");}
async function addTicket(lane){
const j=await api("/api/ticket",{lane,title:$("#t_title").value,detail:$("#t_detail").value,pri:+$("#t_pri").value,deps:$("#t_deps").value,subsystems:$("#t_subs").value,gate:$("#t_gate").value});
if(j.ok){$("#modal").classList.remove("show");render()}}
async function editTicket(id,lane){
const s=await api("/api/lane/"+lane+"?include_done=1");const t=s.tickets.find(x=>x.id===id);if(!t)return;
$("#modalbox").innerHTML=`<h2 style="margin-top:0">Edit #${id}</h2>
<div class="row"><input id="e_title" value="${esc(t.title)}"><select id="e_pri" class="narrow">${[1,2,3,4].map(p=>`<option ${p===t.pri?"selected":""}>${p}</option>`).join("")}</select></div>
<div class="row"><textarea id="e_detail">${esc(t.detail||"")}</textarea></div>
<div class="row"><button class="primary" onclick="saveTicket(${id})">Save</button><button onclick="$('#modal').classList.remove('show')">Cancel</button></div>`;
$("#modal").classList.add("show");}
async function saveTicket(id){
const j=await api(`/api/ticket/${id}/edit`,{title:$("#e_title").value,detail:$("#e_detail").value,pri:+$("#e_pri").value});
if(j.ok){$("#modal").classList.remove("show");render()}}
</script>
"""

INDEX += r"""<script>
let tailSource=null;
function closeTail(){if(tailSource){tailSource.close();tailSource=null}}
function govBar(label,l){
if(!l)return `<div class="gbar"><div class="lbl"><span>${label}</span><span class="muted">n/a</span></div><div class="track"></div></div>`;
const pct=l.percent??0,cls=pct>=90?"crit":pct>=75?"warn":"";
return `<div class="gbar"><div class="lbl"><span>${label}</span><span>${pct}% used</span></div><div class="track"><div class="fill ${cls}" style="width:${Math.min(pct,100)}%"></div></div></div>`;}
async function agentsPage(){
const s=await api("/api/agents");if(location.hash!=="#/agents")return;
let h="";
if(s.governor){const g=s.governor,lim=g.limits||{};
h+='<div class="gov">'+govBar("session",lim.session)+govBar("weekly",lim.weekly_all)+govBar("fable",lim.fable_weekly_scoped);
h+=`<div class="govflags"><span class="flag ${g.stop_active?"bad":""}">${g.stop_active?"STOP ACTIVE":"stop clear"}</span><span class="flag ${g.stale?"bad":""}">${g.stale?"STALE":"fresh"}</span></div></div>`;
}else h+='<div class="muted" style="margin-bottom:14px">governor state unavailable</div>';
const lanes=Object.keys(s.groups).sort();
if(!lanes.length)h+='<div class="muted">no active claims</div>';
for(const lane of lanes){const cards=s.groups[lane];
h+=`<details class="lanegrp" open><summary><b>${esc(lane)}</b> <span class="muted">(${cards.length})</span></summary><div class="wcards">`;
for(const c of cards){const w=c.worker;
h+=`<div class="wcard" onclick="location.hash='#/agents/${encodeURIComponent(c.claimed_by||"")}'"><h4>#${c.id} ${esc(c.title)}</h4>
<div class="id">${esc(c.claimed_by||"(no claim id)")}</div><div class="muted">${leaseLeft(c.lease_expires,s.now)}</div>`;
if(w){h+=`<div class="stats"><span>${w.turns} turns</span><span>${w.tools} tools</span><span>${w.cost!=null?"$"+w.cost.toFixed(3):"running"}</span><span>${esc(w.mtime)}</span></div>`;
if(w.sentinel)h+=`<div class="sent badge ${w.sentinel==="TICKET_CLOSED"?"b-done":w.sentinel==="BLOCKED"?"b-blocked":"b-rejected"}">${esc(w.sentinel)}</div>`;
}else h+='<div class="muted stats">no transcript found</div>';
h+="</div>";}
h+="</div></details>";}
$("#main").innerHTML=h;}
async function agentTailPage(worker){
closeTail();
$("#main").innerHTML=`<div class="row"><button class="small" onclick="location.hash='#/agents'">← back</button><span class="muted" style="align-self:center">${esc(worker)}</span></div><div class="log" id="tailbox">connecting…</div>`;
const box=$("#tailbox");box.innerHTML="";
tailSource=new EventSource("/api/agents/"+encodeURIComponent(worker)+"/tail");
tailSource.onmessage=(e)=>{const d=JSON.parse(e.data);const div=document.createElement("div");
div.className="l-"+d.kind;div.textContent=d.text;box.appendChild(div);box.scrollTop=box.scrollHeight;};
}
</script>
"""

INDEX += r"""<script>
async function reportsPage(){
const s=await api("/api/reports");if(location.hash!=="#/reports")return;
let h='<section><h2>Reports</h2><table><tr><th>report</th><th>size</th><th>modified</th></tr>';
for(const r of s.reports)h+=`<tr class="trow" onclick="location.hash='#/report/${esc(r.name)}'"><td>${esc(r.name)}</td><td class="muted">${r.kb} KB</td><td class="muted">${esc(r.mtime)}</td></tr>`;
h+='</table></section>';$("#main").innerHTML=h;}
async function reportPage(name){
const s=await api("/api/report/"+encodeURIComponent(name));
let h=`<section><h2>${esc(name)} <span class="muted">· ${esc(s.mtime||"")}</span></h2>`;
h+=s.error?`<div class="muted">${esc(s.error)}</div>`:`<div class="md">${md(s.text)}</div>`;
h+='</section>';$("#main").innerHTML=h;}
function render(){
clearInterval(timer);const hash=location.hash||"#/";
const mLane=hash.match(/^#\/lane\/([a-z0-9-]+)$/);
const mRep=hash.match(/^#\/report\/(.+)$/);
const mAgent=hash.match(/^#\/agents\/(.+)$/);
if(!mAgent)closeTail();
if(mLane){lanePage(mLane[1]);timer=setInterval(()=>lanePage(mLane[1]),5000)}
else if(hash==="#/agents"){agentsPage();timer=setInterval(agentsPage,5000)}
else if(mAgent)agentTailPage(decodeURIComponent(mAgent[1]));
else if(hash==="#/reports")reportsPage();
else if(mRep)reportPage(decodeURIComponent(mRep[1]));
else{showDone=false;dash();timer=setInterval(dash,5000)}}
window.addEventListener("hashchange",render);
document.addEventListener("keydown",e=>{if(e.key==="Escape")$("#modal").classList.remove("show")});
render();
</script></body></html>"""

@app.get("/", response_class=HTMLResponse)
def index():
    return INDEX
