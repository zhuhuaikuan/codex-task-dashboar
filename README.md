# Codex Task Dashboard

Local dashboard plugin for watching Codex task activity across projects.

The UI intentionally follows the approved high-fidelity design at:

`C:\Users\IHOPE\.codex\visualizations\2026\07\19\019f798d-e2aa-7bb0-b7c7-5485d4292a6f\codex-task-dashboard.html`

## What It Shows

- Project-level task health and live-ish status counts
- Recent task heartbeats inferred from local Codex session files
- Goal/plan progress summaries and tasks that need attention
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

The dashboard infers status from recent heartbeats and command records. It does
not mutate Codex tasks.

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
