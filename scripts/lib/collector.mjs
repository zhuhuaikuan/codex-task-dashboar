import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

import { foldProgressEvents, progressLookupKeys, readProgressLedger } from "./progress-ledger.mjs";

const DEFAULT_LIMIT = 40;
const ACTIVE_WINDOW_MS = 45 * 60 * 1000;
const SESSION_HEAD_BYTES = 32 * 1024;
const SESSION_TAIL_BYTES = 96 * 1024;
const MAX_SESSION_LINE_CHARS = 24 * 1024;

export async function collectSnapshot(options = {}) {
  const codexHome = options.codexHome ?? path.join(os.homedir(), ".codex");
  const now = coerceDate(options.now ?? new Date());
  const limit = options.limit ?? DEFAULT_LIMIT;

  const [sessions, commandRecords, automations, progressEvents] = await Promise.all([
    collectSessions(codexHome, limit),
    collectCommandRecords(codexHome),
    collectAutomations(codexHome),
    readProgressLedger({ codexHome }),
  ]);

  const commandsByThread = groupLatestCommand(commandRecords);
  const progressReports = foldProgressEvents(progressEvents);
  const tasks = sessions.map((session) => normalizeTask(session, commandsByThread.get(session.id), now, progressReports));
  const projects = buildProjects(tasks);
  const scheduleRows = buildScheduleRows(projects, automations);
  const selectedTask = tasks[0] ?? null;
  const runningTasks = tasks.filter((task) => task.status === "running").length;
  const attentionTasks = tasks.filter((task) => task.status === "attention").length;

  return {
    generatedAt: now.toISOString(),
    source: {
      codexHome,
      sessions: sessions.length,
      processRecords: commandRecords.length,
      automations: automations.length,
      progressReports: progressReports.events.length,
    },
    metrics: {
      runningTasks,
      attentionTasks,
      totalTasks: tasks.length,
      automationsActive: automations.filter((automation) => automation.status === "ACTIVE").length,
      plannedItems: tasks.reduce((sum, task) => sum + task.planSteps.length, 0),
      selfReportedTasks: tasks.filter((task) => task.reportSource === "self-reported").length,
    },
    projects,
    tasks,
    selectedTask,
    scheduleRows,
    automations,
  };
}

export async function parseSessionFile(filePath, options = {}) {
  const stat = options.stat ?? await fs.stat(filePath);
  const text = options.text ?? await readSessionText(filePath, stat.size);
  const lines = text.split(/\r?\n/).filter(Boolean);
  const headerMeta = options.headerMeta ?? extractSessionMeta(text);
  const session = {
    id: headerMeta.id ?? sessionIdFromFile(filePath),
    cwd: headerMeta.cwd ?? "",
    createdAt: headerMeta.createdAt ?? null,
    updatedAt: null,
    title: "",
    latestHeartbeat: "",
    latestPhase: "",
    latestTool: "none",
    toolStatus: "idle",
    filePath,
  };

  for (const line of lines) {
    if (line.length > MAX_SESSION_LINE_CHARS) continue;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const payload = entry.payload ?? {};
    const timestamp = coerceDate(entry.timestamp ?? payload.timestamp);
    if (timestamp && (!session.updatedAt || timestamp > session.updatedAt)) {
      session.updatedAt = timestamp;
    }

    if (entry.type === "session_meta") {
      session.id = payload.session_id ?? payload.id ?? session.id;
      session.cwd = payload.cwd ?? session.cwd;
      session.createdAt = coerceDate(payload.timestamp) ?? session.createdAt;
      continue;
    }

    if (payload.type === "message" && payload.role === "user") {
      const textValue = messageText(payload);
      if (textValue && !textValue.startsWith("<environment_context>") && !session.title) {
        session.title = compact(textValue, 56);
      }
      continue;
    }

    if (payload.type === "message" && payload.role === "assistant") {
      const textValue = messageText(payload);
      if (textValue) {
        session.latestHeartbeat = compact(textValue, 180);
        session.latestPhase = payload.phase ?? session.latestPhase;
      }
      continue;
    }

    if (entry.type === "event_msg" && payload.type === "agent_message") {
      if (payload.message) {
        session.latestHeartbeat = compact(payload.message, 180);
        session.latestPhase = payload.phase ?? session.latestPhase;
      }
      continue;
    }

    if (payload.type === "function_call") {
      session.latestTool = payload.name ?? "tool";
      session.toolStatus = "running";
      continue;
    }

    if (payload.type === "function_call_output") {
      session.toolStatus = "completed";
      continue;
    }
  }

  session.title ||= fallbackTitle(session.cwd, session.id);
  session.projectName = projectName(session.cwd);
  session.createdAt ??= stat.birthtime;
  session.updatedAt ??= stat.mtime;
  return session;
}

async function readSessionText(filePath, size) {
  const sampleSize = SESSION_HEAD_BYTES + SESSION_TAIL_BYTES;
  if (size <= sampleSize) {
    return fs.readFile(filePath, "utf8");
  }

  const file = await fs.open(filePath, "r");
  try {
    const head = Buffer.alloc(SESSION_HEAD_BYTES);
    const tail = Buffer.alloc(SESSION_TAIL_BYTES);
    const { bytesRead: headBytes } = await file.read(head, 0, head.length, 0);
    const { bytesRead: tailBytes } = await file.read(tail, 0, tail.length, Math.max(0, size - SESSION_TAIL_BYTES));

    const headText = head.toString("utf8", 0, headBytes);
    const rawTailText = tail.toString("utf8", 0, tailBytes);
    const firstTailBreak = rawTailText.indexOf("\n");
    const tailText = firstTailBreak === -1 ? rawTailText : rawTailText.slice(firstTailBreak + 1);
    return `${headText}\n${tailText}`;
  } finally {
    await file.close();
  }
}

function extractSessionMeta(text) {
  if (!text.includes("session_meta")) return {};
  return {
    id: jsonStringMatch(text, /"session_id"\s*:\s*"((?:\\.|[^"\\])*)"/)
      ?? jsonStringMatch(text, /"id"\s*:\s*"((?:\\.|[^"\\])*)"/),
    cwd: jsonStringMatch(text, /"cwd"\s*:\s*"((?:\\.|[^"\\])*)"/),
    createdAt: coerceDate(jsonStringMatch(text, /"timestamp"\s*:\s*"((?:\\.|[^"\\])*)"/)),
  };
}

function extractLatestTimestamp(text) {
  const matches = text.matchAll(/"timestamp"\s*:\s*"((?:\\.|[^"\\])*)"/g);
  let latest = null;
  for (const match of matches) {
    const date = coerceDate(jsonStringMatch(match[0], /"timestamp"\s*:\s*"((?:\\.|[^"\\])*)"/));
    if (date && (!latest || date > latest)) latest = date;
  }
  return latest;
}

function jsonStringMatch(text, pattern) {
  const match = text.match(pattern);
  if (!match) return null;
  try {
    return JSON.parse(`"${match[1]}"`);
  } catch {
    return match[1];
  }
}

export function parseAutomationToml(tomlText) {
  const fields = {};
  for (const rawLine of tomlText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_]+)\s*=\s*(.+)$/);
    if (!match) continue;
    fields[match[1]] = parseTomlValue(match[2]);
  }

  const rrule = String(fields.rrule ?? "");
  const hour = Number(rrule.match(/BYHOUR=(\d+)/)?.[1] ?? NaN);
  const minute = Number(rrule.match(/BYMINUTE=(\d+)/)?.[1] ?? NaN);
  const nextLabel = Number.isFinite(hour) && Number.isFinite(minute)
    ? `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
    : "scheduled";

  return {
    id: fields.id ?? fields.name ?? "automation",
    kind: fields.kind ?? "cron",
    name: fields.name ?? "Unnamed automation",
    prompt: fields.prompt ?? "",
    status: fields.status ?? "UNKNOWN",
    rrule,
    nextLabel,
    targetThreadId: fields.target_thread_id ?? null,
    createdAt: fields.created_at ?? null,
    updatedAt: fields.updated_at ?? null,
  };
}

async function collectSessions(codexHome, limit) {
  const sessionsRoot = path.join(codexHome, "sessions");
  const files = await listFiles(sessionsRoot, (file) => file.endsWith(".jsonl"));
  const sessionFiles = await Promise.all(
    files.map(async (file) => ({ file, stat: await fs.stat(file) })),
  );

  const latestCandidates = new Map();
  for (const { file, stat } of sessionFiles) {
    try {
      const text = await readSessionText(file, stat.size);
      const headerMeta = extractSessionMeta(text);
      const threadId = headerMeta.id ?? sessionIdFromFile(file);
      const updatedHint = extractLatestTimestamp(text) ?? stat.mtime;
      const previous = latestCandidates.get(threadId);
      if (!previous || updatedHint > previous.updatedHint) {
        latestCandidates.set(threadId, { file, stat, text, headerMeta, updatedHint });
      }
    } catch {
      // A live JSONL file can be mid-write. Skip it for this poll instead of
      // making the entire dashboard blank.
    }
  }

  const parsed = [];
  const candidates = [...latestCandidates.values()]
    .sort((a, b) => b.updatedHint - a.updatedHint)
    .slice(0, limit);
  for (const candidate of candidates) {
    try {
      parsed.push(await parseSessionFile(candidate.file, candidate));
    } catch {
      // Skip files that became unreadable after candidate discovery.
    }
  }
  return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
}

async function collectCommandRecords(codexHome) {
  const filePath = path.join(codexHome, "process_manager", "chat_processes.json");
  try {
    const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
    return Array.isArray(raw) ? raw : raw.value ?? [];
  } catch {
    return [];
  }
}

async function collectAutomations(codexHome) {
  const root = path.join(codexHome, "automations");
  const files = await listFiles(root, (file) => file.endsWith(".toml"));
  const automations = [];
  for (const file of files) {
    try {
      automations.push(parseAutomationToml(await fs.readFile(file, "utf8")));
    } catch {
      // Ignore unreadable automation files.
    }
  }
  return automations.sort((a, b) => String(a.nextLabel).localeCompare(String(b.nextLabel)));
}

function normalizeTask(session, latestCommand, now, progressReports) {
  const ageMs = now - session.updatedAt;
  const hasRunningCommand = Boolean(latestCommand?.processId || latestCommand?.osPid);
  const status = hasRunningCommand || ageMs <= ACTIVE_WINDOW_MS
    ? "running"
    : session.latestPhase === "final_answer"
      ? "idle"
      : "attention";
  const planSteps = inferPlanSteps(session, latestCommand, status);

  const task = {
    id: session.id,
    title: session.title,
    cwd: session.cwd,
    projectName: session.projectName,
    status,
    statusLabel: statusLabel(status),
    latestTool: latestCommand ? "command" : session.latestTool,
    toolStatus: latestCommand?.processId ? "running" : session.toolStatus,
    latestCommand: latestCommand?.command ?? "",
    latestHeartbeat: session.latestHeartbeat || "No assistant heartbeat recorded yet.",
    latestPhase: session.latestPhase,
    updatedAt: session.updatedAt.toISOString(),
    updatedAgo: relativeTime(now, session.updatedAt),
    progress: progressForTask(session, status, planSteps),
    planSteps,
    goal: inferGoal(session),
  };

  return mergeProgressReport(task, reportForTask(task, progressReports), now);
}

function reportForTask(task, progressReports) {
  if (!progressReports) return null;
  const keys = progressLookupKeys(task);
  return progressReports.byThreadId.get(keys.threadId)
    ?? progressReports.byProjectTaskKey.get(keys.projectTaskKey)
    ?? null;
}

function mergeProgressReport(task, report, now) {
  if (!report) {
    return {
      ...task,
      reportSource: "inferred",
      reportFreshness: "inferred",
      lastReportAt: null,
      reportedStatus: "",
      confirmation: null,
    };
  }

  const status = statusFromReport(report.status, task.status);
  return {
    ...task,
    status,
    statusLabel: statusLabel(status, report.status),
    reportSource: "self-reported",
    reportFreshness: freshnessForReport(report, now),
    lastReportAt: report.lastReportAt,
    reportedStatus: report.status || "",
    goal: report.goal || task.goal,
    planSteps: report.plan?.length ? report.plan : task.planSteps,
    progress: report.progress ?? task.progress,
    latestHeartbeat: report.summary || task.latestHeartbeat,
    confirmation: report.confirmation ?? null,
  };
}

function buildProjects(tasks) {
  const grouped = new Map();
  for (const task of tasks) {
    const key = task.cwd || task.projectName;
    if (!grouped.has(key)) {
      grouped.set(key, {
        id: key,
        name: task.projectName,
        path: task.cwd,
        tasks: [],
        running: 0,
        attention: 0,
        updatedAt: task.updatedAt,
      });
    }
    const project = grouped.get(key);
    project.tasks.push(task.id);
    if (task.status === "running") project.running += 1;
    if (task.status === "attention") project.attention += 1;
    if (task.updatedAt > project.updatedAt) project.updatedAt = task.updatedAt;
  }
  return [...grouped.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function buildScheduleRows(projects, automations) {
  const rows = projects.slice(0, 4).map((project, index) => ({
    id: project.id,
    name: project.name,
    subtitle: project.running ? "active task window" : "recent task window",
    bars: [{
      label: project.running ? "实时执行观察" : "最近活动",
      kind: project.attention ? "amber" : project.running ? "green" : "blue",
      left: 8 + index * 7,
      width: project.running ? 32 : 22,
    }],
  }));

  for (const automation of automations.filter((item) => item.status === "ACTIVE").slice(0, 2)) {
    const row = rows[0];
    if (row) {
      row.bars.push({
        label: `${automation.nextLabel} 自动化`,
        kind: "amber",
        left: 66,
        width: 18,
      });
    }
  }
  return rows;
}

function groupLatestCommand(records) {
  const latest = new Map();
  for (const record of records) {
    const id = record.conversationId;
    if (!id) continue;
    const previous = latest.get(id);
    if (!previous || Number(record.updatedAtMs ?? 0) > Number(previous.updatedAtMs ?? 0)) {
      latest.set(id, record);
    }
  }
  return latest;
}

async function listFiles(root, predicate) {
  const files = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (!predicate || predicate(fullPath)) {
        files.push(fullPath);
      }
    }
  }
  await walk(root);
  return files;
}

function parseTomlValue(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"');
  }
  if (/^\d+$/.test(trimmed)) {
    return Number(trimmed);
  }
  return trimmed;
}

function messageText(payload) {
  return (payload.content ?? [])
    .map((part) => part.text ?? part.message ?? "")
    .join(" ")
    .trim();
}

function compact(text, maxLength) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}...` : normalized;
}

function coerceDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function sessionIdFromFile(filePath) {
  return path.basename(filePath, ".jsonl").split("-").slice(-5).join("-");
}

function projectName(cwd) {
  if (!cwd) return "Unknown project";
  return path.basename(cwd.replace(/[\\/]+$/, ""));
}

function fallbackTitle(cwd, id) {
  return projectName(cwd) !== "Unknown project" ? projectName(cwd) : id;
}

function statusFromReport(reportedStatus, inferredStatus) {
  if (reportedStatus === "blocked" || reportedStatus === "waiting") return "attention";
  if (reportedStatus === "completed" || reportedStatus === "failed") return "idle";
  if (reportedStatus === "planning" || reportedStatus === "running" || reportedStatus === "verifying") return "running";
  return inferredStatus;
}

function freshnessForReport(report, now) {
  if (report.status === "completed" || report.status === "failed") return "complete";
  const reportedAt = coerceDate(report.lastReportAt);
  if (!reportedAt) return "unknown";
  const ageMs = Math.max(0, now - reportedAt);
  if (ageMs <= 45 * 60 * 1000) return "fresh";
  if (ageMs <= 3 * 60 * 60 * 1000) return "quiet";
  return "stale";
}

function statusLabel(status, reportedStatus = "") {
  if (reportedStatus === "planning") return "计划中";
  if (reportedStatus === "waiting") return "待回复";
  if (reportedStatus === "blocked") return "需确认";
  if (reportedStatus === "verifying") return "验证中";
  if (reportedStatus === "completed") return "已完成";
  if (reportedStatus === "failed") return "失败";
  return status === "running" ? "执行中" : status === "attention" ? "需关注" : "空闲";
}

function relativeTime(now, then) {
  const diffMs = Math.max(0, now - then);
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.round(hours / 24)} 天前`;
}

function inferPlanSteps(session, latestCommand, status) {
  const steps = [
    { label: "读取会话元数据", state: "done" },
    { label: "提取最近心跳", state: session.latestHeartbeat ? "done" : "pending" },
    { label: latestCommand ? "观察最近命令" : "等待下一步动作", state: latestCommand ? "current" : "pending" },
  ];
  if (status === "attention") {
    steps.push({ label: "建议读取最新 turn", state: "pending" });
  }
  return steps;
}

function inferGoal(session) {
  return session.title ? `完成任务：${session.title}` : `跟踪 ${session.projectName} 的 Codex 任务状态`;
}

function progressForTask(session, status, planSteps) {
  if (session.latestPhase === "final_answer") return 100;
  const doneCount = planSteps.filter((step) => step.state === "done").length;
  const base = Math.round((doneCount / Math.max(1, planSteps.length)) * 80);
  return status === "running" ? Math.max(base, 42) : Math.max(base, 22);
}
