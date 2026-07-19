import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { collectSnapshot, parseAutomationToml, parseSessionFile } from "../scripts/lib/collector.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHome = path.join(__dirname, "fixtures", "codex-home");
const now = new Date("2026-07-19T09:00:00.000Z");

describe("collector", () => {
  it("parses automation TOML without losing Chinese names", () => {
    const automation = parseAutomationToml(`status = "ACTIVE"\nname = "小说流水线每日上传复核"\nrrule = "FREQ=DAILY;BYHOUR=0;BYMINUTE=40;BYSECOND=0"\n`);

    assert.equal(automation.status, "ACTIVE");
    assert.equal(automation.name, "小说流水线每日上传复核");
    assert.equal(automation.nextLabel, "00:40");
  });

  it("collects projects, task heartbeats, commands, schedule rows, and metrics", async () => {
    const snapshot = await collectSnapshot({ codexHome: fixtureHome, now, limit: 10 });

    assert.equal(snapshot.metrics.runningTasks, 2);
    assert.equal(snapshot.metrics.automationsActive, 1);
    assert.equal(snapshot.projects.length, 3);
    assert.equal(snapshot.tasks.length, 3);
    assert.equal(snapshot.selectedTask.id, "thread-b");

    const novelTask = snapshot.tasks.find((task) => task.id === "thread-a");
    assert.equal(novelTask.projectName, "小说流水线");
    assert.equal(novelTask.latestCommand, "scripts\\Invoke-FanqieDailyUpload.ps1 -DryRun");
    assert.equal(novelTask.status, "running");
    assert.equal(novelTask.reportSource, "self-reported");
    assert.equal(novelTask.reportFreshness, "fresh");
    assert.equal(novelTask.lastReportAt, "2026-07-19T08:55:00.000Z");
    assert.equal(novelTask.goal, "Finish lightweight reporting");
    assert.equal(novelTask.progress, 88);
    assert.equal(novelTask.latestHeartbeat, "Self-reported checkpoint from the progress ledger.");
    assert.deepEqual(novelTask.planSteps, [
      { id: "step-1", label: "Create the progress ledger", state: "done" },
      { id: "step-2", label: "Merge report state into snapshots", state: "current" },
    ]);

    const packagingTask = snapshot.tasks.find((task) => task.id === "thread-b");
    assert.equal(packagingTask.status, "running");
    assert.equal(packagingTask.reportSource, "inferred");

    const confirmationTask = snapshot.tasks.find((task) => task.id === "thread-c");
    assert.equal(confirmationTask.confirmation.state, "open");
    assert.equal(confirmationTask.confirmation.type, "review");
    assert.match(confirmationTask.confirmation.prompt, /Please review/);
    assert.equal(confirmationTask.reportSource, "inferred");

    assert.equal(snapshot.confirmationQueue.length, 1);
    assert.equal(snapshot.confirmationQueue[0].taskId, "thread-c");
    assert.equal(snapshot.confirmationQueue[0].state, "open");

    assert.equal(snapshot.scheduleRows.length, 3);
    assert.equal(snapshot.automations[0].name, "小说流水线每日上传复核");
    assert.equal(snapshot.metrics.selfReportedTasks, 1);
    assert.equal(snapshot.metrics.confirmationTasks, 1);
  });

  it("marks inferred confirmation points as answered when the user replies later", async () => {
    const session = await parseSessionFile("rollout-2026-07-19T08-40-00-thread-d.jsonl", {
      stat: {
        birthtime: new Date("2026-07-19T08:40:00.000Z"),
        mtime: new Date("2026-07-19T08:47:00.000Z"),
        size: 1,
      },
      text: [
        JSON.stringify({
          timestamp: "2026-07-19T08:40:00.000Z",
          type: "session_meta",
          payload: { session_id: "thread-d", cwd: "E:\\Example", timestamp: "2026-07-19T08:40:00.000Z" },
        }),
        JSON.stringify({
          timestamp: "2026-07-19T08:41:00.000Z",
          type: "response_item",
          payload: { type: "message", role: "assistant", content: [{ text: "Please approve pushing these changes before I continue." }] },
        }),
        JSON.stringify({
          timestamp: "2026-07-19T08:42:00.000Z",
          type: "response_item",
          payload: { type: "message", role: "user", content: [{ text: "可以，继续。" }] },
        }),
      ].join("\n"),
    });

    assert.equal(session.confirmations.length, 1);
    assert.equal(session.confirmations[0].state, "answered");
    assert.equal(session.confirmations[0].type, "approval");
  });
});
