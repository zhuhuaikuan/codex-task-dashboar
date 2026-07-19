import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

export const PROGRESS_SCHEMA_VERSION = "task-progress/v1";
export const MAX_LEDGER_LINE_CHARS = 24 * 1024;

const VALID_KINDS = new Set([
  "task_started",
  "plan_updated",
  "step_started",
  "step_completed",
  "progress",
  "blocked",
  "unblocked",
  "completed",
  "failed",
  "note",
]);

const VALID_STATUSES = new Set([
  "planning",
  "running",
  "waiting",
  "blocked",
  "verifying",
  "completed",
  "failed",
]);

const VALID_STEP_STATES = new Set(["done", "current", "pending"]);

export function progressLedgerPath(codexHome = path.join(os.homedir(), ".codex")) {
  return path.join(codexHome, "task-dashboard", "progress.jsonl");
}

export async function appendProgressEvent({ codexHome, event, now = new Date() }) {
  const normalized = normalizeProgressEvent(event, { now, strict: true });
  const line = JSON.stringify(normalized);
  if (line.length > MAX_LEDGER_LINE_CHARS) {
    throw new Error(`progress event exceeds ${MAX_LEDGER_LINE_CHARS} characters`);
  }

  const filePath = progressLedgerPath(codexHome);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${line}\n`, "utf8");
  return normalized;
}

export async function readProgressLedger({ codexHome } = {}) {
  let text;
  try {
    text = await fs.readFile(progressLedgerPath(codexHome), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const events = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.length > MAX_LEDGER_LINE_CHARS) continue;

    try {
      events.push(normalizeProgressEvent(JSON.parse(line), { strict: false }));
    } catch {
      // A local ledger should never be able to blank the dashboard.
    }
  }

  return events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function foldProgressEvents(events = []) {
  const byThreadId = new Map();
  const byProjectTaskKey = new Map();
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  for (const event of sorted) {
    const key = event.threadId ? `thread:${event.threadId}` : projectTaskKey(event);
    if (!key) continue;

    const current = event.threadId
      ? byThreadId.get(event.threadId) ?? baseReport(event)
      : byProjectTaskKey.get(key) ?? baseReport(event);

    mergeReportEvent(current, event);

    if (event.threadId) byThreadId.set(event.threadId, current);
    if (projectTaskKey(event)) byProjectTaskKey.set(projectTaskKey(event), current);
  }

  return { byThreadId, byProjectTaskKey, events: sorted };
}

export function progressLookupKeys(task) {
  return {
    threadId: task?.id ?? "",
    projectTaskKey: projectTaskKey({
      projectPath: task?.cwd,
      taskTitle: task?.title,
    }),
  };
}

export function projectTaskKey(value) {
  if (!value?.projectPath || !value?.taskTitle) return "";
  return `project:${value.projectPath}\ntask:${value.taskTitle}`;
}

function normalizeProgressEvent(event, { now = new Date(), strict = true } = {}) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("progress event must be an object");
  }

  const normalized = {
    ...event,
    schemaVersion: event.schemaVersion ?? PROGRESS_SCHEMA_VERSION,
    eventId: cleanString(event.eventId) || crypto.randomUUID(),
    timestamp: normalizeTimestamp(event.timestamp, now),
    kind: cleanString(event.kind),
  };

  if (normalized.schemaVersion !== PROGRESS_SCHEMA_VERSION) {
    throw new Error(`unsupported progress schema: ${normalized.schemaVersion}`);
  }
  if (!VALID_KINDS.has(normalized.kind)) {
    throw new Error(`unsupported progress kind: ${normalized.kind || "missing"}`);
  }

  normalized.threadId = cleanString(event.threadId);
  normalized.projectPath = cleanString(event.projectPath);
  normalized.projectName = cleanString(event.projectName);
  normalized.taskTitle = cleanString(event.taskTitle);
  if (!normalized.threadId && !(normalized.projectPath && normalized.taskTitle)) {
    throw new Error("progress event requires threadId or projectPath + taskTitle");
  }

  normalized.status = cleanEnum(event.status, VALID_STATUSES);
  normalized.goal = cleanString(event.goal);
  normalized.summary = cleanString(event.summary);
  normalized.currentStepId = cleanString(event.currentStepId);
  normalized.confirmationType = cleanString(event.confirmationType);
  normalized.confirmationPrompt = cleanString(event.confirmationPrompt);
  normalized.confirmationResolution = cleanString(event.confirmationResolution);
  normalized.confirmationResolvedAt = event.confirmationResolvedAt
    ? normalizeTimestamp(event.confirmationResolvedAt, now)
    : null;

  if (event.progress !== undefined) {
    const progress = Number(event.progress);
    if (!Number.isFinite(progress)) {
      if (strict) throw new Error("progress must be a number");
      delete normalized.progress;
    } else {
      normalized.progress = clamp(Math.round(progress), 0, 100);
    }
  }

  if (event.needsUser !== undefined) normalized.needsUser = Boolean(event.needsUser);
  if (event.needsConfirmation !== undefined) {
    normalized.needsConfirmation = Boolean(event.needsConfirmation);
  }

  if (Array.isArray(event.confirmationChoices)) {
    normalized.confirmationChoices = event.confirmationChoices
      .map(cleanString)
      .filter(Boolean)
      .slice(0, 6);
  }

  if (Array.isArray(event.plan)) {
    normalized.plan = event.plan
      .map(normalizePlanStep)
      .filter((step) => step.id && step.label)
      .slice(0, 20);
  }

  return dropEmptyFields(normalized);
}

function normalizePlanStep(step, index) {
  const state = cleanEnum(step?.state, VALID_STEP_STATES) || "pending";
  return {
    id: cleanString(step?.id) || `step-${index + 1}`,
    label: cleanString(step?.label),
    state,
  };
}

function baseReport(event) {
  return {
    threadId: event.threadId ?? "",
    projectPath: event.projectPath ?? "",
    projectName: event.projectName ?? "",
    taskTitle: event.taskTitle ?? "",
    source: "self-reported",
    lastReportAt: event.timestamp,
    status: "",
    goal: "",
    summary: "",
    progress: null,
    currentStepId: "",
    plan: [],
    needsUser: false,
    confirmation: null,
  };
}

function mergeReportEvent(report, event) {
  report.lastReportAt = event.timestamp;
  for (const field of ["threadId", "projectPath", "projectName", "taskTitle", "status", "goal", "summary", "currentStepId"]) {
    if (event[field]) report[field] = event[field];
  }
  if (event.progress !== undefined) report.progress = event.progress;
  if (event.needsUser !== undefined) report.needsUser = event.needsUser;
  if (Array.isArray(event.plan)) report.plan = event.plan;

  if (event.needsConfirmation === true) {
    report.confirmation = {
      state: "open",
      type: event.confirmationType || "other",
      prompt: event.confirmationPrompt || event.summary || "User confirmation required.",
      choices: event.confirmationChoices ?? [],
      createdAt: event.timestamp,
      resolvedAt: null,
      resolution: "",
      source: "self-reported",
    };
    report.needsUser = true;
  }

  if (event.needsConfirmation === false && report.confirmation) {
    report.confirmation = {
      ...report.confirmation,
      state: "resolved",
      resolvedAt: event.confirmationResolvedAt ?? event.timestamp,
      resolution: event.confirmationResolution || event.summary || "Confirmation resolved.",
    };
  }

  if ((event.kind === "completed" || event.kind === "failed") && report.confirmation?.state === "open") {
    report.confirmation = {
      ...report.confirmation,
      state: "superseded",
      resolvedAt: event.timestamp,
      resolution: `${event.kind} report superseded this confirmation.`,
    };
  }
}

function normalizeTimestamp(value, fallbackDate) {
  const date = value ? new Date(value) : fallbackDate;
  if (Number.isNaN(date.getTime())) throw new Error("timestamp must be an ISO date");
  return date.toISOString();
}

function cleanString(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanEnum(value, validValues) {
  const text = cleanString(value);
  return validValues.has(text) ? text : "";
}

function dropEmptyFields(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => {
      if (entry === "" || entry === undefined) return false;
      if (Array.isArray(entry) && entry.length === 0) return false;
      return true;
    }),
  );
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
