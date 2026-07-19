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
- `%USERPROFILE%\.codex\task-dashboard\progress.jsonl`

It does not call private Codex app-only thread tools from the browser. Treat the
status as a local observer view with optional self-reported progress.

## Lightweight Progress Reporting

When this dashboard is being used to monitor active work, report progress at
meaningful state changes. Do not write timer-based heartbeats. Keep reports
short and never include secrets, long command output, or private file contents.

Use the helper from the plugin root:

```powershell
node scripts\report-progress.mjs --kind task_started --thread-id <thread-id> --status planning --progress 5 --summary "Started the task and drafted the first plan."
```

Report changed progress:

```powershell
node scripts\report-progress.mjs --kind progress --thread-id <thread-id> --status running --progress 55 --summary "Merged reported state into the snapshot."
```

Report a confirmation point that needs the user:

```powershell
node scripts\report-progress.mjs --kind blocked --thread-id <thread-id> --status blocked --needs-user --needs-confirmation --confirmation-type approval --confirmation-prompt "Approve pushing this version?"
```

Resolve the confirmation after the user replies:

```powershell
node scripts\report-progress.mjs --kind progress --thread-id <thread-id> --status running --resolve-confirmation --confirmation-resolution "User approved pushing the version."
```

Useful report moments:

- task start;
- plan update;
- step started or completed;
- user confirmation, permission, choice, clarification, or credentials needed;
- verification started;
- completion or failure.

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
