#!/usr/bin/env python3
"""wq#3771: /api/research read + approve/reject write paths, end to end against the
real wq CLI and foreman research/bridge.py — on a scratch copy of queue.db, never the
live one. Run: python3 tests/test_research_panel.py"""
import atexit, os, shutil, sqlite3, sys, tempfile, unittest
from pathlib import Path

LIVE_DB = "/home/lumen/agents/work-queue/queue.db"
TMP = tempfile.mkdtemp(prefix="mc-research-")
atexit.register(shutil.rmtree, TMP, True)
SCRATCH = os.path.join(TMP, "queue.db")

src = sqlite3.connect(f"file:{LIVE_DB}?mode=ro", uri=True)
dst = sqlite3.connect(SCRATCH)
src.backup(dst)
src.close(); dst.close()

# app.py, wq and bridge.py all read WQ_DB; set before import so every layer hits the copy.
os.environ["WQ_DB"] = SCRATCH
os.environ["WQ_NTFY_BIN"] = "/bin/true"
os.environ.pop("WQ_AGENT", None)

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from fastapi.testclient import TestClient  # noqa: E402
import app as mc  # noqa: E402

SHA = "ab" * 32


def add(title, status, prompt, marker=True):
    detail = "proposal text\nEvidence: foreman/research/evidence/x.json"
    if marker:
        detail += f"\nResearch-bridge: proposal_sha256={SHA} brief_id=-"
    c = sqlite3.connect(SCRATCH)
    cur = c.execute(
        "INSERT INTO tasks(lane,pri,title,detail,status,gate_type,decision_prompt,created_at) "
        "VALUES('build',2,?,?,?,'frank_decision',?,datetime('now'))",
        (title, detail, status, prompt))
    c.commit(); tid = cur.lastrowid; c.close()
    return tid


def row(tid):
    c = sqlite3.connect(SCRATCH); c.row_factory = sqlite3.Row
    r = c.execute("SELECT * FROM tasks WHERE id=?", (tid,)).fetchone(); c.close()
    return r


class ResearchPanel(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(mc.app)
        cls.approve_id = add("research: try X for Y", "pending_review", "Build X?")
        cls.reject_id = add("research: try Z", "pending_review", "Build Z?")
        cls.retry_id = add("research: decide failed", "frank_gated", None)
        # Same gate_type and status, no research prefix: e.g. a physical-task gate.
        cls.other_id = add("swap the PSU on node7", "pending_review", "Done yet?", marker=False)

    def test_1_list(self):
        d = self.client.get("/api/research").json()
        ids = {i["id"]: i for i in d["items"]}
        self.assertIn(self.approve_id, ids)
        self.assertIn(self.reject_id, ids)
        self.assertNotIn(self.other_id, ids)
        self.assertNotIn(self.retry_id, ids)
        self.assertEqual(ids[self.approve_id]["proposal"], "try X for Y")
        self.assertEqual(ids[self.approve_id]["decision_prompt"], "Build X?")
        self.assertIn("Evidence:", ids[self.approve_id]["detail"])
        self.assertIn(self.retry_id, [r["id"] for r in d["retry"]])

    def test_2_approve(self):
        r = self.client.post(f"/api/research/{self.approve_id}/approve", json={"text": "yes, go"}).json()
        self.assertTrue(r["ok"], r)
        t = row(self.approve_id)
        self.assertEqual(t["status"], "open")
        self.assertEqual(t["frank_response"], "yes, go")

    def test_3_reject(self):
        r = self.client.post(f"/api/research/{self.reject_id}/reject",
                             json={"text": "we already have Z", "reject_class": "already-solved"}).json()
        self.assertTrue(r["ok"], r)
        self.assertEqual(row(self.reject_id)["status"], "done")
        c = sqlite3.connect(SCRATCH)
        led = c.execute("SELECT title,reject_class,frank_reason FROM rejections "
                        "WHERE proposal_sha256=? ORDER BY id DESC LIMIT 1", (SHA,)).fetchone()
        c.close()
        self.assertEqual(led, ("try Z", "already-solved", "we already have Z"))

    def test_4_refusals_leave_rows_untouched(self):
        tid = add("research: refusal probe", "pending_review", "Q?")
        cases = [
            (f"/api/research/{tid}/reject", {"text": "no", "reject_class": "Bad Class"}),
            (f"/api/research/{tid}/reject", {"text": "no", "reject_class": ""}),
            (f"/api/research/{tid}/approve", {"text": "   "}),
            (f"/api/research/{self.other_id}/approve", {"text": "yes"}),
        ]
        for path, body in cases:
            with self.subTest(path=path, body=body):
                self.assertEqual(self.client.post(path, json=body).status_code, 400)
        self.assertEqual(row(tid)["status"], "pending_review")
        self.assertIsNone(row(tid)["frank_response"])
        self.assertEqual(row(self.other_id)["status"], "pending_review")
        self.assertIsNone(row(self.other_id)["frank_response"])

    def test_5_retry_row_refused_by_wq(self):
        r = self.client.post(f"/api/research/{self.retry_id}/approve", json={"text": "yes"}).json()
        self.assertFalse(r["ok"])
        self.assertEqual(row(self.retry_id)["status"], "frank_gated")


if __name__ == "__main__":
    unittest.main(verbosity=2)
