# Codex Task Dashboard

Local dashboard plugin for watching Codex task activity across projects.

The UI intentionally follows the approved high-fidelity design at:

`C:\Users\IHOPE\.codex\visualizations\2026\07\19\019f798d-e2aa-7bb0-b7c7-5485d4292a6f\codex-task-dashboard.html`

## What It Shows

- Project-level task health and live-ish status counts
- Recent task heartbeats inferred from local Codex session files
- Goal/plan progress summaries and tasks that need attention
- Lightweight self-reported progress from Codex tasks
- Confirmation points that need, received, or no longer need a user reply
- Local automation schedule signals
- A four-lane schedule view that matches the approved design proportions

## Launch

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\open-dashboard.ps1
```

Or run the server directly:

```powershell
npm start -- --port 57631
```

Then open `http://127.0.0.1:57631/`.

## Data Sources

The first version is a local observer. It reads:

- `%USERPROFILE%\.codex\sessions/**/*.jsonl`
- `%USERPROFILE%\.codex\process_manager\chat_processes.json`
- `%USERPROFILE%\.codex\automations/**/automation.toml`
- `%USERPROFILE%\.codex\task-dashboard\progress.jsonl`

The dashboard infers status from recent heartbeats and command records, then
overlays optional self-reported progress from the local progress ledger. It does
not mutate Codex tasks.

## Lightweight Progress Reports

Codex tasks can voluntarily append short progress events when state changes
meaningfully. This is intentionally not a fixed heartbeat timer.

```powershell
node scripts\report-progress.mjs --kind progress --thread-id thread-id --status running --progress 55 --summary "Merged progress reports into the snapshot."
```

When a task needs a user reply, report it explicitly:

```powershell
node scripts\report-progress.mjs --kind blocked --thread-id thread-id --status blocked --needs-user --needs-confirmation --confirmation-type approval --confirmation-prompt "Approve pushing this version?"
```

Resolve it after the user answers:

```powershell
node scripts\report-progress.mjs --kind progress --thread-id thread-id --status running --resolve-confirmation --confirmation-resolution "User approved pushing the version."
```

The dashboard also scans recent history for clear approval, review,
permission, choice, clarification, and credential requests. These appear as
`open`, `answered`, `resolved`, or `superseded` confirmation points.

## Verify

```powershell
npm test
python C:\Users\IHOPE\.codex\skills\.system\plugin-creator\scripts\validate_plugin.py C:\Users\IHOPE\plugins\codex-task-dashboard
```

## Repository

Target remote:

```text
git@gitee.com:zhuhuaikuan/codex-task-dashboar.git
```
