import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { describe, it } from "node:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import {
  appendProgressEvent,
  foldProgressEvents,
  readProgressLedger,
} from "../scripts/lib/progress-ledger.mjs";

const execFileAsync = promisify(execFile);

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

  it("writes a report from the CLI", async () => {
    const codexHome = await tempHome();

    await execFileAsync(process.execPath, [
      "scripts/report-progress.mjs",
      "--codex-home",
      codexHome,
      "--kind",
      "progress",
      "--thread-id",
      "thread-cli",
      "--status",
      "running",
      "--progress",
      "42",
      "--summary",
      "CLI wrote a lightweight report.",
    ]);

    const events = await readProgressLedger({ codexHome });

    assert.equal(events.length, 1);
    assert.equal(events[0].threadId, "thread-cli");
    assert.equal(events[0].progress, 42);
    assert.equal(events[0].summary, "CLI wrote a lightweight report.");
  });
});
