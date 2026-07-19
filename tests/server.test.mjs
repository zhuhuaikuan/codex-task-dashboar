import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { createDashboardServer } from "../scripts/server.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureHome = path.join(__dirname, "fixtures", "codex-home");

async function withServer(testBody) {
  const server = createDashboardServer({ codexHome: fixtureHome, now: new Date("2026-07-19T09:00:00.000Z") });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    await testBody(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

describe("server", () => {
  it("serves a JSON task snapshot", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/snapshot`);
      const snapshot = await response.json();

      assert.equal(response.status, 200);
      assert.equal(snapshot.metrics.runningTasks, 2);
      assert.equal(snapshot.tasks[0].projectName, "pianyu-v5");
    });
  });

  it("serves the dashboard HTML shell", async () => {
    await withServer(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/`);
      const html = await response.text();

      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type"), /text\/html/);
      assert.match(html, /Codex 任务总览/);
      assert.match(html, /dashboard\.js/);
    });
  });
});
