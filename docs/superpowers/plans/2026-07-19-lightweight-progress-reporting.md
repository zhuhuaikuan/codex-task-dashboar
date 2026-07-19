# Lightweight Progress Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add lightweight self-reported Codex progress and historical confirmation points to Codex Task Dashboard.

**Architecture:** Use an append-only local JSONL ledger under `.codex/task-dashboard/progress.jsonl`. The server snapshot collector folds ledger events, extracts clear confirmation points from session history, merges reported state over inferred task state, and the existing browser UI renders source/freshness/confirmation indicators without adding another service.

**Tech Stack:** Node.js ESM, `node:test`, local JSON/JSONL files, existing static HTML/CSS/JS dashboard.

---

### Task 1: Progress Ledger Parser And Writer

**Files:**
- Create: `scripts/lib/progress-ledger.mjs`
- Create: `scripts/report-progress.mjs`
- Create: `tests/progress-ledger.test.mjs`

- [ ] **Step 1: Write the failing ledger tests**

Create tests that append a valid event, reject missing task identity, skip corrupt and oversized lines, and fold later events over earlier events:

```js
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  appendProgressEvent,
  foldProgressEvents,
  readProgressLedger,
} from "../scripts/lib/progress-ledger.mjs";

async function tempHome() {
  return fs.mkdtemp(path.join(os.tmpdir(), "ctd-progress-"));
}

describe("progress ledger", () => {
  it("appends and reads a valid progress event", async () => {
    const codexHome = await tempHome();
    await appendProgressEvent({
      codexHome,
      event: {
        schemaVersion: "task-progress/v1",
        timestamp: "2026-07-19T09:10:00.000Z",
        kind: "progress",
        threadId: "thread-a",
        summary: "Merged reports into the snapshot.",
        status: "running",
        progress: 55,
      },
    });

    const events = await readProgressLedger({ codexHome });

    assert.equal(events.length, 1);
    assert.equal(events[0].threadId, "thread-a");
    assert.equal(events[0].progress, 55);
  });

  it("rejects events without a thread id or project title identity", async () => {
    const codexHome = await tempHome();

    await assert.rejects(
      appendProgressEvent({
        codexHome,
        event: {
          schemaVersion: "task-progress/v1",
          timestamp: "2026-07-19T09:10:00.000Z",
          kind: "progress",
        },
      }),
      /threadId or projectPath \+ taskTitle/,
    );
  });

  it("skips corrupt and oversized ledger lines", async () => {
    const codexHome = await tempHome();
    const ledger = path.join(codexHome, "task-dashboard", "progress.jsonl");
    await fs.mkdir(path.dirname(ledger), { recursive: true });
    await fs.writeFile(
      ledger,
      [
        "{bad json",
        "x".repeat(25000),
        JSON.stringify({
          schemaVersion: "task-progress/v1",
          timestamp: "2026-07-19T09:10:00.000Z",
          kind: "progress",
          threadId: "thread-b",
          progress: 30,
        }),
      ].join("\n"),
      "utf8",
    );

    const events = await readProgressLedger({ codexHome });

    assert.equal(events.length, 1);
    assert.equal(events[0].threadId, "thread-b");
  });

  it("folds progress events into current task state", () => {
    const folded = foldProgressEvents([
      {
        schemaVersion: "task-progress/v1",
        timestamp: "2026-07-19T09:00:00.000Z",
        kind: "task_started",
        threadId: "thread-c",
        goal: "Ship reporting",
        status: "planning",
        progress: 10,
      },
      {
        schemaVersion: "task-progress/v1",
        timestamp: "2026-07-19T09:05:00.000Z",
        kind: "blocked",
        threadId: "thread-c",
        status: "blocked",
        needsUser: true,
        needsConfirmation: true,
        confirmationType: "approval",
        confirmationPrompt: "Approve the implementation plan?",
      },
    ]);

    const report = folded.byThreadId.get("thread-c");

    assert.equal(report.goal, "Ship reporting");
    assert.equal(report.status, "blocked");
    assert.equal(report.progress, 10);
    assert.equal(report.confirmation.state, "open");
    assert.equal(report.confirmation.prompt, "Approve the implementation plan?");
  });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test tests/progress-ledger.test.mjs`

Expected: fail because `scripts/lib/progress-ledger.mjs` does not exist.

- [ ] **Step 3: Implement ledger helpers and CLI**

Implement `appendProgressEvent`, `readProgressLedger`, `foldProgressEvents`, CLI argument parsing, validation, size limits, and append-only writes.

- [ ] **Step 4: Run ledger tests to verify GREEN**

Run: `node --test tests/progress-ledger.test.mjs`

Expected: pass.

### Task 2: Merge Self-Reported Progress Into Snapshots

**Files:**
- Modify: `scripts/lib/collector.mjs`
- Modify: `tests/collector.test.mjs`
- Create: `tests/fixtures/codex-home/task-dashboard/progress.jsonl`

- [ ] **Step 1: Write the failing snapshot merge test**

Add a fixture report for an existing `thread-a` and assert that reported goal,
plan, progress, status, heartbeat, and source metadata override inferred state.

- [ ] **Step 2: Run collector tests to verify RED**

Run: `node --test tests/collector.test.mjs`

Expected: fail because snapshots do not read the progress ledger.

- [ ] **Step 3: Merge folded progress reports**

Import `readProgressLedger` and `foldProgressEvents`, merge report state in
`normalizeTask`, add `reportSource`, `reportFreshness`, `lastReportAt`, and
increment metrics for self-reported and confirmation tasks.

- [ ] **Step 4: Run collector tests to verify GREEN**

Run: `node --test tests/collector.test.mjs`

Expected: pass.

### Task 3: Historical Confirmation Point Extraction

**Files:**
- Modify: `scripts/lib/collector.mjs`
- Modify: `tests/collector.test.mjs`
- Create: `tests/fixtures/codex-home/sessions/2026/07/19/rollout-2026-07-19T08-30-00-thread-c.jsonl`

- [ ] **Step 1: Write the failing confirmation extraction test**

Add a session fixture with an assistant request for approval and no later user
reply. Assert that the snapshot contains one open confirmation point with type
`approval`.

- [ ] **Step 2: Run collector tests to verify RED**

Run: `node --test tests/collector.test.mjs`

Expected: fail because sessions do not expose confirmation points.

- [ ] **Step 3: Implement high-precision confirmation extraction**

Track user and assistant message timestamps in `parseSessionFile`, detect clear
confirmation phrases, mark later-user replies as `answered`, and mark completed
tasks as `superseded`.

- [ ] **Step 4: Run collector tests to verify GREEN**

Run: `node --test tests/collector.test.mjs`

Expected: pass.

### Task 4: Dashboard Confirmation UI

**Files:**
- Modify: `assets/dashboard.html`
- Modify: `assets/dashboard.js`
- Modify: `tests/server.test.mjs`

- [ ] **Step 1: Write failing HTML contract tests**

Assert the HTML shell includes `.ctd-confirmation-queue`, confirmation styles,
and report source styles.

- [ ] **Step 2: Run server tests to verify RED**

Run: `node --test tests/server.test.mjs`

Expected: fail because the shell does not yet include those UI contracts.

- [ ] **Step 3: Render confirmation queue and selected-task confirmation**

Add a compact confirmation queue above the timeline, add source/freshness labels
to task rows, and update the right inspector attention block to show the latest
confirmation prompt and state.

- [ ] **Step 4: Run server tests to verify GREEN**

Run: `node --test tests/server.test.mjs`

Expected: pass.

### Task 5: Documentation, Version, Visual Verification, And Push

**Files:**
- Modify: `README.md`
- Modify: `README.en.md`
- Modify: `skills/task-dashboard/SKILL.md`
- Modify: `.codex-plugin/plugin.json`
- Modify: `assets/screenshot-dashboard.png`

- [ ] **Step 1: Document reporting usage**

Explain the ledger path, CLI examples, non-periodic reporting behavior, and
confirmation-point display.

- [ ] **Step 2: Bump plugin cache version**

Update `.codex-plugin/plugin.json` build metadata with the current timestamp.

- [ ] **Step 3: Run full verification**

Run:

```powershell
npm test
python C:\Users\IHOPE\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py C:\Users\IHOPE\plugins\codex-task-dashboard
```

Also verify `http://127.0.0.1:57631/` in the in-app browser and update
`assets/screenshot-dashboard.png`.

- [ ] **Step 4: Commit and push**

Commit with `feat: add lightweight progress reporting` and push `master` to
Gitee.

---

## Self-Review

- Spec coverage: ledger reporting, non-periodic updates, fallback inference,
  confirmation extraction, UI display, stale/fresh labels, and tests are covered.
- Placeholder scan: no plan step relies on TBD/TODO/fill-in language.
- Type consistency: the plan uses `task-progress/v1`, `needsConfirmation`,
  `confirmationType`, `confirmationPrompt`, `reportSource`, and
  `reportFreshness` consistently.
