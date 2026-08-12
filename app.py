#!/usr/bin/env python3
"""Lumen Mission Control — wq parallel-agent orchestration surface.
mctl.lumennode.uk · 127.0.0.1:8136 · CF Access Frank-only.
READS: queue.db mode=ro. WRITES: /home/lumen/bin/wq subprocess ONLY (atomicity,
leases, slocks, dedup, gates all stay enforced in the CLI). No LLM calls."""
import json, re, sqlite3, subprocess, datetime, html
from pathlib import Path
from fastapi import FastAPI
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from pydantic import BaseModel

WQ = "/home/lumen/bin/wq"
LANE_INIT = "/home/lumen/bin/wq-lane-init"
WQDIR = Path("/home/lumen/agents/work-queue")
DB = WQDIR / "queue.db"
REPORTS = WQDIR / "reports"
REGFILE = Path(__file__).resolve().parent / "projects.json"
LANE_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,31}$")
REPORT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*\.(md|diff|txt)$")

app = FastAPI(title="Lumen Mission Control", docs_url=None, redoc_url=None)

def ro():
    c = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=10)
    c.row_factory = sqlite3.Row
    return c

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
            "recent_reports": [p.name for p in reports if p.is_file()]}

@app.get("/api/lane/{lane}")
def api_lane(lane: str, include_done: int = 0):
    if not LANE_RE.match(lane):
        return JSONResponse({"error": "bad lane"}, status_code=400)
    c = ro()
    q = "SELECT * FROM tasks WHERE lane=? ORDER BY CASE status WHEN 'claimed' THEN 0 WHEN 'open' THEN 1 WHEN 'blocked' THEN 2 ELSE 3 END, pri, id"
    rows = [dict(r) for r in c.execute(q, (lane,))]
    c.close()
    done = [r for r in rows if r["status"] == "done"]
    if not include_done:
        rows = [r for r in rows if r["status"] != "done"] + done[-8:]
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    return {"now": now, "lane": lane, "tickets": rows, "done_total": len(done),
            "dispatch": read_text(dispatch_file(lane)),
            "board": read_text(board_file(lane)),
            "project": registry().get(lane)}

@app.get("/api/report/{name}")
def api_report(name: str):
    if not REPORT_RE.match(name):
        return JSONResponse({"error": "bad name"}, status_code=400)
    p = (REPORTS / name).resolve()
    if not str(p).startswith(str(REPORTS.resolve()) + "/") or not p.is_file():
        return JSONResponse({"error": "not found"}, status_code=404)
    return read_text(p)

@app.get("/api/reports")
def api_reports():
    out = []
    for p in sorted(REPORTS.glob("*"), key=lambda x: x.stat().st_mtime, reverse=True):
        if p.is_file() and REPORT_RE.match(p.name):
            out.append({"name": p.name, "kb": round(p.stat().st_size / 1024, 1),
                        "mtime": datetime.datetime.utcfromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %H:%MZ")})
    return {"reports": out}


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
</style></head><body>
<header><h1><a href="#/">🛰 Mission Control</a></h1>
<a href="#/">Lanes</a><a href="#/reports">Reports</a>
<span class="ext"><a href="https://scribe.lumennode.uk" target="_blank">Scribe ↗</a> · <a href="https://propose.lumennode.uk" target="_blank">Proposals ↗</a> · <a href="https://bench.lumennode.uk" target="_blank">Bench ↗</a></span></header>
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
$("#main").innerHTML=h;}

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
async function lanePage(lane){
const s=await api("/api/lane/"+lane+(showDone?"?include_done=1":""));
if(location.hash!=="#/lane/"+lane)return;
let h=`<section><h2>Lane: ${esc(lane)}${s.project?` · <span class="muted">${esc(s.project.dir)} · lock ${esc(s.project.lock)}</span>`:""}</h2>`;
if(s.dispatch){
h+=`<div class="copybar"><button class="primary" id="copybtn">📋 Copy dispatch prompt</button><span class="ok" id="copyok">copied ✓</span><span class="muted">${esc(s.dispatch.path)} · ${esc(s.dispatch.mtime)}</span></div>`;
h+=`<pre id="dispatchtxt">${esc(s.dispatch.text)}</pre>`;
}else h+=`<div class="muted">No dispatch prompt for this lane yet (create via New project, or agents work it ad hoc).</div>`;
h+='</section><section><h2>Tickets</h2>';
h+=`<div class="row"><button class="small" onclick="newTicket('${esc(lane)}')">＋ Add ticket</button><button class="small" onclick="showDone=!showDone;render()">${showDone?"hide":"show all"} done (${s.done_total})</button></div>`;
if(!s.tickets.length)h+='<div class="muted">lane empty</div>';
else{h+='<table><tr><th>#</th><th>p</th><th>status</th><th>title</th><th>agent / lease</th></tr>';
for(const t of s.tickets){
h+=`<tr class="trow" onclick="document.getElementById('d${t.id}').classList.toggle('show')">
<td>${t.id}</td><td>${t.pri}</td><td><span class="badge b-${esc(t.status)}">${esc(t.status)}</span></td>
<td>${esc(t.title)}${t.gate?' <span class="muted">[gated]</span>':''}${t.subsystems?` <span class="muted">subs=${esc(t.subsystems)}</span>`:''}</td>
<td class="muted">${esc(t.claimed_by||"")}${t.status==="claimed"?" · "+leaseLeft(t.lease_expires,s.now):""}</td></tr>`;
h+=`<tr class="detail" id="d${t.id}"><td colspan="5"><pre>${esc(t.detail||"(no detail)")}</pre>`;
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
if(mLane){lanePage(mLane[1]);timer=setInterval(()=>lanePage(mLane[1]),5000)}
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
