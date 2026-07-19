---
name: task-dashboard
description: Open and use the local Codex Task Dashboard to monitor recent Codex threads, progress heartbeats, command activity, and automation schedule signals.
---

# Codex Task Dashboard

Use this skill when the user asks to open, inspect, monitor, or review Codex
task execution across projects.

## What It Does

The dashboard is a local browser app served by this plugin. It reads local Codex
state from:

- `%USERPROFILE%\.codex\sessions`
- `%USERPROFILE%\.codex\process_manager\chat_processes.json`
- `%USERPROFILE%\.codex\automations`

It does not call private Codex app-only thread tools from the browser. Treat the
status as an inferred local observer view.

## Open The Dashboard

From the plugin root:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\open-dashboard.ps1
```

For terminal-only use:

```powershell
npm start -- --port 57631
```

Then open:

```text
http://127.0.0.1:57631/
```

## Verification

Before claiming the plugin is working, run:

```powershell
npm test
python C:\Users\IHOPE\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py C:\Users\IHOPE\plugins\codex-task-dashboard
```

When visual fidelity matters, compare the current browser screenshot against:

```text
C:\Users\IHOPE\.codex\visualizations\2026\07\19\019f798d-e2aa-7bb0-b7c7-5485d4292a6f\codex-task-dashboard.png
```
