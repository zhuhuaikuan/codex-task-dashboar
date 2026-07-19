import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { appendProgressEvent, PROGRESS_SCHEMA_VERSION, progressLedgerPath } from "./lib/progress-ledger.mjs";

export async function reportProgressFromArgv(argv, options = {}) {
  const parsed = parseArgs(argv);
  const codexHome = parsed.codexHome ?? path.join(os.homedir(), ".codex");
  const event = {
    schemaVersion: PROGRESS_SCHEMA_VERSION,
    timestamp: parsed.timestamp ?? options.now?.toISOString() ?? new Date().toISOString(),
    kind: parsed.kind,
    threadId: parsed.threadId,
    projectPath: parsed.projectPath,
    projectName: parsed.projectName,
    taskTitle: parsed.taskTitle,
    status: parsed.status,
    goal: parsed.goal,
    summary: parsed.summary,
    progress: parsed.progress,
    currentStepId: parsed.currentStepId,
    needsUser: parsed.needsUser,
    needsConfirmation: parsed.needsConfirmation,
    confirmationType: parsed.confirmationType,
    confirmationPrompt: parsed.confirmationPrompt,
    confirmationChoices: parsed.confirmationChoices,
    confirmationResolvedAt: parsed.confirmationResolvedAt,
    confirmationResolution: parsed.confirmationResolution,
    plan: parsed.planPath ? JSON.parse(await fs.readFile(parsed.planPath, "utf8")) : undefined,
  };

  const written = await appendProgressEvent({ codexHome, event, now: options.now ?? new Date() });
  return {
    event: written,
    filePath: progressLedgerPath(codexHome),
  };
}

function parseArgs(argv) {
  const parsed = { confirmationChoices: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = argv[i + 1];
    switch (arg) {
      case "--codex-home":
        parsed.codexHome = value;
        i += 1;
        break;
      case "--timestamp":
        parsed.timestamp = value;
        i += 1;
        break;
      case "--kind":
        parsed.kind = value;
        i += 1;
        break;
      case "--thread-id":
        parsed.threadId = value;
        i += 1;
        break;
      case "--project-path":
        parsed.projectPath = value;
        i += 1;
        break;
      case "--project-name":
        parsed.projectName = value;
        i += 1;
        break;
      case "--task-title":
        parsed.taskTitle = value;
        i += 1;
        break;
      case "--status":
        parsed.status = value;
        i += 1;
        break;
      case "--goal":
        parsed.goal = value;
        i += 1;
        break;
      case "--summary":
        parsed.summary = value;
        i += 1;
        break;
      case "--progress":
        parsed.progress = Number(value);
        i += 1;
        break;
      case "--current-step-id":
        parsed.currentStepId = value;
        i += 1;
        break;
      case "--needs-user":
        parsed.needsUser = true;
        break;
      case "--needs-confirmation":
        parsed.needsConfirmation = true;
        break;
      case "--resolve-confirmation":
        parsed.needsConfirmation = false;
        break;
      case "--confirmation-type":
        parsed.confirmationType = value;
        i += 1;
        break;
      case "--confirmation-prompt":
        parsed.confirmationPrompt = value;
        i += 1;
        break;
      case "--confirmation-choice":
        parsed.confirmationChoices.push(value);
        i += 1;
        break;
      case "--confirmation-resolved-at":
        parsed.confirmationResolvedAt = value;
        i += 1;
        break;
      case "--confirmation-resolution":
        parsed.confirmationResolution = value;
        i += 1;
        break;
      case "--plan-json":
        parsed.planPath = value;
        i += 1;
        break;
      case "--help":
        parsed.help = true;
        break;
      default:
        throw new Error(`unknown argument: ${arg}`);
    }
  }

  if (parsed.help) {
    throw new Error(helpText());
  }

  return parsed;
}

function helpText() {
  return [
    "Usage: node scripts/report-progress.mjs --kind progress --thread-id <id> [options]",
    "",
    "Identity:",
    "  --thread-id <id>",
    "  --project-path <path> --task-title <title>",
    "",
    "State:",
    "  --status running|waiting|blocked|verifying|completed|failed",
    "  --progress <0-100>",
    "  --summary <text>",
    "  --goal <text>",
    "  --plan-json <file>",
    "",
    "Confirmation:",
    "  --needs-confirmation --confirmation-type approval --confirmation-prompt <text>",
    "  --resolve-confirmation --confirmation-resolution <text>",
  ].join("\n");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const result = await reportProgressFromArgv(process.argv.slice(2));
    console.log(`Wrote ${result.event.kind} report to ${result.filePath}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
