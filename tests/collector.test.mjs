import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { collectSnapshot, parseAutomationToml } from "../scripts/lib/collector.mjs";

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
    assert.equal(snapshot.projects.length, 2);
    assert.equal(snapshot.tasks.length, 2);
    assert.equal(snapshot.selectedTask.id, "thread-b");

    const novelTask = snapshot.tasks.find((task) => task.id === "thread-a");
    assert.equal(novelTask.projectName, "小说流水线");
    assert.equal(novelTask.latestCommand, "scripts\\Invoke-FanqieDailyUpload.ps1 -DryRun");
    assert.equal(novelTask.status, "running");
    assert.match(novelTask.latestHeartbeat, /dry-run/);

    const packagingTask = snapshot.tasks.find((task) => task.id === "thread-b");
    assert.equal(packagingTask.status, "running");

    assert.equal(snapshot.scheduleRows.length, 2);
    assert.equal(snapshot.automations[0].name, "小说流水线每日上传复核");
  });
});
