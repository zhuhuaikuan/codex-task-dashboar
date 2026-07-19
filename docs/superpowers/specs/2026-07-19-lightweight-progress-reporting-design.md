# Lightweight Progress Reporting Design

## Goal

Add a lightweight way for Codex tasks to voluntarily report goal, plan, and
execution progress to Codex Task Dashboard.

The current dashboard is a passive observer: it reads local session files,
command records, and automation files, then infers task state. The new behavior
keeps that observer model, but adds an append-only local progress ledger that a
Codex task can write at important moments. Reports are intentionally
non-periodic: Codex should update the ledger when the state meaningfully changes,
not on a fixed heartbeat timer.

## Product Shape

The dashboard remains a local monitor. It should show whether a task has an
explicit self-report and when that report was last updated.

For tasks with reports, the inspector should prefer reported goal, plan,
current step, progress, blocked state, and completion state. For tasks without
reports, the existing inference continues to work exactly as before.

The user-facing distinction is:

- `self-reported`: Codex explicitly wrote the current task state.
- `inferred`: the dashboard estimated state from session logs and commands.
- `stale report`: the task has a report, but no meaningful update has arrived
  for a soft freshness window.

## Reporting Ledger

Use an append-only JSONL file:

```text
%USERPROFILE%\.codex\task-dashboard\progress.jsonl
```

Each line is one event. The collector folds events by `threadId` when available,
falling back to `projectPath + taskTitle` for local/manual usage.

Event schema:

```json
{
  "schemaVersion": "task-progress/v1",
  "eventId": "uuid-or-stable-id",
  "timestamp": "2026-07-19T11:30:00.000Z",
  "threadId": "optional-codex-thread-id",
  "projectPath": "E:\\Users\\IHOPE\\Documents\\Codex任务列表",
  "projectName": "Codex任务列表",
  "taskTitle": "Implement lightweight progress reporting",
  "kind": "task_started | plan_updated | step_started | step_completed | progress | blocked | unblocked | completed | failed | note",
  "status": "planning | running | waiting | blocked | verifying | completed | failed",
  "goal": "The task's current success target.",
  "summary": "Short human-readable progress note.",
  "progress": 55,
  "currentStepId": "step-2",
  "plan": [
    { "id": "step-1", "label": "Define ledger schema", "state": "done" },
    { "id": "step-2", "label": "Merge reports into snapshots", "state": "current" }
  ],
  "needsUser": false
}
```

Required fields are `schemaVersion`, `timestamp`, `kind`, and either `threadId`
or both `projectPath` and `taskTitle`. Other fields are optional and should be
merged only when present.

## Codex Reporting Behavior

Codex should write a report only at meaningful state changes:

- Task start: write the goal and initial plan.
- Plan changes: replace the reported plan with the current plan.
- Step transition: mark completed/current steps and update `currentStepId`.
- User attention needed: set `status: "blocked"` or `status: "waiting"` and
  `needsUser: true`.
- Verification: set `status: "verifying"` and summarize the checks.
- Completion: set `status: "completed"` and `progress: 100`.
- Failure or abandonment: set `status: "failed"` with a short reason.

Reports should stay short. They must not dump long command output, secrets,
private file contents, or unnecessary raw logs into the ledger.

## Components

Add a small reporting helper in implementation:

- `scripts/report-progress.mjs`: appends validated JSON events to the ledger.
- `scripts/lib/progress-ledger.mjs`: parses, validates, and folds progress
  events into per-task state.
- `scripts/lib/collector.mjs`: merges folded progress state into inferred task
  snapshots.
- `skills/task-dashboard/SKILL.md`: tells Codex how and when to report progress
  when the dashboard plugin is being used.

The helper should support command-line usage so any Codex task can update
progress without needing an MCP server:

```powershell
node scripts\report-progress.mjs --kind progress --status running --progress 55 --summary "Merged active report state into snapshot."
```

Plan updates may accept a JSON file path to avoid brittle shell quoting for
arrays.

## Data Flow

1. Codex starts or continues a task.
2. At a meaningful state change, Codex appends one JSON event to
   `progress.jsonl`.
3. `/api/snapshot` reads sessions, commands, automations, and folded progress
   reports.
4. The collector matches a report to a task.
5. Reported fields override inferred fields when the report is newer than the
   inferred session update or when it explicitly marks waiting, blocked,
   verifying, completed, or failed.
6. The dashboard renders the merged task with a source badge and last report
   age.

## Freshness

Because reports are non-periodic, lack of a recent update is not automatically
an error. Use a soft freshness label:

- Fresh: last self-report within 45 minutes.
- Quiet: last self-report between 45 minutes and 3 hours.
- Stale: last self-report older than 3 hours while the inferred task still
  appears active.

Completion reports do not become stale.

## Error Handling

- Missing ledger file means there are no self-reports.
- Invalid JSONL lines are skipped.
- Events with an unsupported `schemaVersion` are skipped.
- Oversized lines are skipped to protect dashboard performance.
- Concurrent append failures should surface as command errors to Codex, but must
  not break dashboard reads.
- The collector should never let a malformed report blank the dashboard.

## Testing

Add focused tests for:

- Appending a valid report event.
- Rejecting invalid or oversized report input.
- Folding multiple events into current task state.
- Merging reported goal, plan, progress, status, and blocked state into a
  snapshot.
- Falling back to existing inference when no report exists.
- Skipping corrupt ledger lines without failing `/api/snapshot`.

## Acceptance Criteria

- Existing passive dashboard behavior remains intact.
- A task can update its reported progress by appending one event.
- The dashboard shows reported goal, plan, status, progress, and last report age
  when available.
- The dashboard clearly labels self-reported state versus inferred state.
- `npm test` passes.
- The implementation does not require a long-running extra service beyond the
  existing dashboard server.

## Scope Boundaries

This design does not add a full MCP server, cross-device sync, user accounts, or
official Codex app internals. It does not attempt to force every Codex task to
report on a timer. Reporting remains voluntary and lightweight.
