# Codex Task Dashboard Design

## Goal

Build a personal Codex plugin that opens a local browser dashboard matching
`C:/Users/IHOPE/.codex/visualizations/2026/07/19/019f798d-e2aa-7bb0-b7c7-5485d4292a6f/codex-task-dashboard.html`.

The dashboard helps the user see Codex project task execution without watching
every task thread. It surfaces recent task heartbeats, inferred running status,
project grouping, goal/plan steps, local automations, and schedule-like spans.

## Product Shape

The primary surface is a dense operational console:

- Top command bar with brand, search, mode switch, filter, notification, and
  create-monitor controls.
- Left project rail sorted by activity.
- Center overview cards, live task table, and goal/schedule timeline.
- Right inspector for the selected task with attention state, goal, plan steps,
  recent heartbeat, recent command, and recommended actions.

The approved HTML is the visual source of truth. Implementation should preserve
its three-column shell, warm neutral palette, compact typography, table density,
semantic status colors, timeline anatomy, and inspector hierarchy.

## Data Sources

This first version runs locally and reads local Codex files:

- `~/.codex/sessions/**/*.jsonl` for thread metadata, user prompts, assistant
  heartbeats, and last activity timestamps.
- `~/.codex/process_manager/chat_processes.json` for recent command activity.
- `~/.codex/automations/**/automation.toml` for active/paused automation
  schedule hints.

Codex app thread tools such as `list_threads` and `wait_threads` are available
to agents but not directly callable from an ordinary static browser app. The
dashboard therefore uses local file inference, with clear stale/unknown states
instead of pretending to have privileged internal API access.

## Behavior

- `scripts/server.mjs` serves the dashboard and `/api/snapshot`.
- The browser polls `/api/snapshot` every 20 seconds.
- The data collector groups recent sessions by project path, infers active
  status from recent file activity and command records, extracts the latest
  assistant heartbeat, and creates deterministic progress estimates from thread
  state.
- The UI keeps the same layout as the approved design and updates only text,
  counts, rows, selected-task details, and schedule bars from live data.
- Controls are local: mode switching, project/status filtering, search, and row
  selection update the browser state without modifying Codex data.

## Acceptance Criteria

- The plugin validates with the plugin creator validator.
- `npm test` passes with unit tests for session parsing, automation parsing,
  snapshot aggregation, filtering, and HTML serving.
- The dashboard runs with `npm start` or `node scripts/server.mjs`.
- The browser screenshot is compared against the approved HTML screenshot at
  1440x980. Material visual differences are fixed unless they are necessary for
  live responsive data.
- No private raw command output beyond short command strings is exposed in the
  UI.

## Scope Boundaries

This version does not edit Codex tasks, create official Codex app connectors, or
call internal app-only thread APIs from the browser. It is a local observer and
launcher plugin.

