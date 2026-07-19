# Codex Task Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a personal Codex plugin with a local, high-fidelity dashboard that monitors Codex task sessions, progress heartbeats, and automation schedule signals.

**Architecture:** A Node ESM local server serves static dashboard assets and a JSON snapshot API. A focused collector module reads local Codex session JSONL files, process-manager command records, and automation TOML files, normalizes them into projects, tasks, metrics, schedule rows, and inspector data. The browser UI polls the API and renders the approved three-column dashboard design.

**Tech Stack:** Codex personal plugin scaffold, Node.js built-ins, ESM modules, `node:test`, HTML/CSS/vanilla JavaScript.

---

### Task 1: Plugin Metadata And Docs

**Files:**
- Modify: `C:/Users/IHOPE/plugins/codex-task-dashboard/.codex-plugin/plugin.json`
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/docs/superpowers/specs/2026-07-19-codex-task-dashboard-design.md`
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/docs/superpowers/plans/2026-07-19-codex-task-dashboard.md`

- [x] **Step 1: Update plugin manifest**

Set the plugin description, author, capabilities, brand color, and starter prompts.

- [x] **Step 2: Save approved design contract**

Record the approved high-fidelity HTML path, data sources, behavior, acceptance
criteria, and scope boundaries.

- [x] **Step 3: Save implementation plan**

Write this plan so implementation can be verified against concrete files and
commands.

### Task 2: TDD Data Collector

**Files:**
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/package.json`
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/tests/fixtures/codex-home/sessions/2026/07/19/rollout-2026-07-19T08-00-00-thread-a.jsonl`
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/tests/fixtures/codex-home/sessions/2026/07/19/rollout-2026-07-19T08-20-00-thread-b.jsonl`
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/tests/fixtures/codex-home/process_manager/chat_processes.json`
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/tests/fixtures/codex-home/automations/automation/automation.toml`
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/tests/collector.test.mjs`
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/scripts/lib/collector.mjs`

- [ ] **Step 1: Write failing tests**

Test that the collector returns metrics, grouped projects, task heartbeats,
selected-task inspector data, and automation schedule items from fixtures.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`

Expected: FAIL because `scripts/lib/collector.mjs` does not exist.

- [ ] **Step 3: Implement collector**

Implement `collectSnapshot({ codexHome, now, limit })`, `parseSessionFile`,
`parseAutomationToml`, and helper functions.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`

Expected: all collector tests pass.

### Task 3: TDD Server

**Files:**
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/tests/server.test.mjs`
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/scripts/server.mjs`

- [ ] **Step 1: Write failing tests**

Test that `/api/snapshot` returns JSON and `/` serves the dashboard HTML.

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test`

Expected: FAIL because `scripts/server.mjs` does not exist.

- [ ] **Step 3: Implement server**

Implement a dependency-injectable Node HTTP server with `createServer()` and CLI
startup behavior.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `npm test`

Expected: all collector and server tests pass.

### Task 4: High-Fidelity Dashboard UI

**Files:**
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/assets/dashboard.html`
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/assets/dashboard.css`
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/assets/dashboard.js`

- [ ] **Step 1: Implement approved shell**

Move the approved HTML/CSS visual system into production assets while preserving
the three-column 1440x980 desktop composition.

- [ ] **Step 2: Bind live data**

Use `dashboard.js` to fetch `/api/snapshot`, render metrics, project rows, task
rows, timeline bars, and right inspector details.

- [ ] **Step 3: Add local interactions**

Implement mode switching, search, filter buttons, project selection, and task
selection without changing Codex data.

- [ ] **Step 4: Verify tests still pass**

Run: `npm test`

Expected: all tests pass.

### Task 5: Plugin Skill And Launcher

**Files:**
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/skills/task-dashboard/SKILL.md`
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/scripts/open-dashboard.ps1`
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/README.md`

- [ ] **Step 1: Add plugin skill**

Document when to use the dashboard plugin and how to launch the local server.

- [ ] **Step 2: Add Windows launcher**

Start the Node server in a hidden PowerShell child process and open the dashboard
URL in the default browser.

- [ ] **Step 3: Add README**

Document install, launch, data sources, limitations, and verification commands.

- [ ] **Step 4: Validate plugin**

Run: `python C:/Users/IHOPE/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py C:/Users/IHOPE/plugins/codex-task-dashboard`

Expected: validation succeeds.

### Task 6: Browser Fidelity And Runtime Verification

**Files:**
- Create: `C:/Users/IHOPE/plugins/codex-task-dashboard/assets/screenshot-dashboard.png`

- [ ] **Step 1: Start local server**

Run: `npm start -- --port 57631`

Expected: server prints a local URL.

- [ ] **Step 2: Capture implementation screenshot**

Use Chrome/Playwright at 1440x980 and save the PNG under `assets/`.

- [ ] **Step 3: Compare against approved concept**

Use `view_image` on the approved concept PNG and the implementation screenshot.
Check copy, layout, table density, palette, typography, right inspector, and
timeline anatomy.

- [ ] **Step 4: Final verification**

Run `npm test`, plugin validation, and a fresh snapshot API request before
reporting completion.

