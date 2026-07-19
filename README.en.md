# Codex Task Dashboard

Codex Task Dashboard is a personal Codex plugin that serves a local browser dashboard for monitoring project tasks, recent heartbeats, self-reported goal/plan progress, confirmation points, and automation schedule signals.

## Usage

```powershell
npm start -- --port 57631
```

Open `http://127.0.0.1:57631/`.

For Windows PowerShell convenience:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\open-dashboard.ps1
```

## Notes

- The dashboard reads local Codex files and does not mutate Codex tasks.
- Codex tasks can append lightweight progress events to `%USERPROFILE%\.codex\task-dashboard\progress.jsonl` with `node scripts\report-progress.mjs`.
- Confirmation points from reports or recent history are shown as `open`, `answered`, `resolved`, or `superseded`.
- The visual implementation follows the approved high-fidelity dashboard HTML under the user's Codex visualization directory.
- Tests cover the local collector and HTTP server behavior.
