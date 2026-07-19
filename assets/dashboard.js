const root = document.getElementById("codex-task-dashboard-mockup");

const state = {
  snapshot: null,
  mode: "目标",
  query: "",
  projectFilter: "all",
  projectScoped: false,
  selectedProjectId: null,
  selectedTaskId: null,
  pollTimer: null,
};

const statusClass = {
  running: "run",
  attention: "wait",
  idle: "idle",
};

const statusDot = {
  running: "",
  attention: "amber",
  idle: "blue",
};

async function refreshSnapshot() {
  try {
    const response = await fetch("/api/snapshot", { cache: "no-store" });
    if (!response.ok) throw new Error(`snapshot ${response.status}`);
    state.snapshot = await response.json();
    reconcileSelection();
    render();
  } catch (error) {
    console.error(error);
    setText(".ctd-last-poll", "Snapshot unavailable");
  }
}

function reconcileSelection() {
  const { snapshot } = state;
  const taskIds = new Set(snapshot.tasks.map((task) => task.id));
  if (!state.selectedTaskId || !taskIds.has(state.selectedTaskId)) {
    state.selectedTaskId = snapshot.selectedTask?.id ?? snapshot.tasks[0]?.id ?? null;
  }

  const task = selectedTask();
  const projectIds = new Set(snapshot.projects.map((project) => project.id));
  if (task?.cwd && projectIds.has(task.cwd)) {
    state.selectedProjectId ??= task.cwd;
  }
  if (state.selectedProjectId && !projectIds.has(state.selectedProjectId)) {
    state.selectedProjectId = snapshot.projects[0]?.id ?? null;
  }
}

function render() {
  if (!state.snapshot) return;
  renderTopline();
  renderMetrics();
  renderProjects();
  renderTasks();
  renderConfirmationQueue();
  renderTimeline();
  renderInspector();
}

function renderTopline() {
  const { snapshot } = state;
  const totalProjects = snapshot.projects.length;
  const totalTasks = snapshot.metrics.totalTasks;
  setText(".ctd-subtitle", `Local host · ${totalProjects} 个项目 · 20 秒刷新`);
  setText(".ctd-project-count", `${snapshot.metrics.runningTasks} running`);
  setText(".ctd-left-footer .ctd-health:nth-child(1) strong", `${snapshot.metrics.automationsActive} active`);
  setText(".ctd-left-footer .ctd-health:nth-child(2) strong", `${snapshot.source.sessions} session files`);
  setText(".ctd-left-footer .ctd-health:nth-child(3) strong", formatTime(snapshot.generatedAt));
  setText(".ctd-stats .ctd-stat:nth-child(4) .ctd-stat-head span:nth-child(2)", snapshot.automations[0]?.nextLabel ?? "--:--");
  setText(".ctd-window-label", `${totalProjects} projects / ${totalTasks} tasks`);
}

function renderMetrics() {
  const { metrics } = state.snapshot;
  const values = root.querySelectorAll(".ctd-stat-value");
  if (values[0]) values[0].textContent = metrics.runningTasks;
  if (values[1]) values[1].textContent = metrics.plannedItems;
  if (values[2]) values[2].textContent = metrics.attentionTasks;
  if (values[3]) values[3].textContent = nextAutomationLabel(state.snapshot.automations[0]);

  setText(".ctd-stat.live .ctd-stat-note", `${metrics.totalTasks} 条本地任务快照`);
  setText(".ctd-stats .ctd-stat:nth-child(2) .ctd-stat-note", `${metrics.plannedItems} 个计划步骤`);
  setText(".ctd-stat.warn .ctd-stat-note", `${metrics.attentionTasks} 条需要关注 / ${metrics.confirmationTasks ?? 0} 待确认`);
  setText(".ctd-stats .ctd-stat:nth-child(4) .ctd-stat-note", state.snapshot.automations[0]?.name ?? "暂无自动化");
  setText(".ctd-last-poll", `Last poll ${formatTime(state.snapshot.generatedAt)}`);
}

function renderProjects() {
  const list = root.querySelector(".ctd-project-list");
  if (!list) return;

  const projects = state.snapshot.projects.filter(projectMatches);
  if (!projects.length) {
    list.innerHTML = `<div class="ctd-small" style="padding:12px;">当前筛选下没有项目。</div>`;
    return;
  }

  list.innerHTML = projects.map((project) => {
    const active = project.id === state.selectedProjectId;
    const attention = project.attention > 0;
    const running = project.running > 0;
    const status = attention ? "需关注" : running ? "执行中" : "空闲";
    const taskCount = uniqueCount(project.tasks);

    return `
      <button type="button" class="ctd-project ${active ? "active" : ""}" data-project-id="${escapeAttr(project.id)}">
        <div class="ctd-project-row">
          <div class="ctd-project-name">${escapeHtml(project.name)}</div>
          <span class="ctd-status ${attention ? "wait" : running ? "run" : "idle"}"><span class="ctd-dot ${attention ? "amber" : running ? "" : "blue"}"></span>${status}</span>
        </div>
        <div class="ctd-path">${escapeHtml(project.path)}</div>
        <div class="ctd-mini-bars"><span></span><span></span><span></span></div>
        <div class="ctd-row-between ctd-small"><span>${taskCount} 任务</span><span>${escapeHtml(relativeFromIso(project.updatedAt))}</span></div>
      </button>
    `;
  }).join("");
}

function renderTasks() {
  const tbody = root.querySelector(".ctd-live-table tbody");
  if (!tbody) return;

  const tasks = filteredTasks();
  if (!tasks.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5"><div class="ctd-small" style="padding:14px;">当前筛选下没有任务。清空搜索或切换项目查看。</div></td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = tasks.slice(0, 8).map((task) => `
    <tr class="${task.id === state.selectedTaskId ? "selected" : ""}" data-task-id="${escapeAttr(task.id)}">
      <td>
        <div class="ctd-thread-title">
          <strong>${escapeHtml(task.title)}</strong>
          <span>${escapeHtml(task.projectName)} · ${escapeHtml(task.status)} · ${escapeHtml(task.updatedAgo)}</span>
        </div>
      </td>
      <td><span class="ctd-status ${statusClass[task.status] ?? "idle"}"><span class="ctd-dot ${statusDot[task.status] ?? "blue"}"></span>${escapeHtml(task.statusLabel)}</span></td>
      <td>${escapeHtml(task.latestTool)} ${escapeHtml(task.toolStatus)}</td>
      <td>
        <div class="ctd-progress-cell">
          <div class="ctd-progress"><span style="width:${clamp(task.progress, 0, 100)}%"></span></div>
          <span class="ctd-report-source ${escapeAttr(reportSourceClass(task))}">${escapeHtml(reportSourceLabel(task))}</span>
        </div>
      </td>
      <td><div class="ctd-feed">${escapeHtml(task.latestHeartbeat)}</div></td>
    </tr>
  `).join("");
}

function renderConfirmationQueue() {
  const queue = root.querySelector(".ctd-confirmation-queue");
  if (!queue) return;

  const items = state.snapshot.confirmationQueue ?? [];
  queue.classList.toggle("is-empty", !items.length);
  if (!items.length) {
    queue.innerHTML = "";
    return;
  }

  queue.innerHTML = items.slice(0, 4).map((item) => `
    <button type="button" class="ctd-confirmation-card ${escapeAttr(item.state)}" data-task-id="${escapeAttr(item.taskId)}">
      <div class="ctd-row-between">
        <strong>${escapeHtml(confirmationStateLabel(item.state))}</strong>
        <span class="ctd-pill"><span class="ctd-dot ${item.state === "open" ? "amber" : "blue"}"></span>${escapeHtml(confirmationTypeLabel(item.type))}</span>
      </div>
      <div class="ctd-confirmation-prompt">${escapeHtml(item.prompt)}</div>
      <div class="ctd-row-between ctd-small"><span>${escapeHtml(item.projectName)}</span><span>${escapeHtml(formatTime(item.createdAt))}</span></div>
    </button>
  `).join("");
}

function renderTimeline() {
  const schedule = root.querySelector(".ctd-schedule");
  if (!schedule) return;

  const rows = state.snapshot.scheduleRows.length
    ? state.snapshot.scheduleRows
    : state.snapshot.projects.slice(0, 4).map((project) => ({
      id: project.id,
      name: project.name,
      subtitle: "最近活动",
      bars: [],
    }));

  schedule.innerHTML = rows.slice(0, 4).map((row) => `
    <div class="ctd-lane">
      <div class="ctd-lane-name"><strong>${escapeHtml(row.name)}</strong><span>${escapeHtml(row.subtitle)}</span></div>
      <div class="ctd-lane-track">
        <div class="ctd-now"></div>
        ${row.bars.map((bar) => `<div class="ctd-bar ${escapeAttr(bar.kind)}" style="left:${clamp(bar.left, 0, 92)}%; width:${clamp(bar.width, 4, 90)}%;">${escapeHtml(bar.label)}</div>`).join("")}
      </div>
    </div>
  `).join("");
}

function renderInspector() {
  const task = selectedTask();
  const modeLabel = `${state.mode}模式`;
  setText(".ctd-inspector-mode", modeLabel);

  if (!task) {
    setText(".ctd-selected-title strong", "没有任务");
    setText(".ctd-selected-title .ctd-meta", "当前本地快照为空");
    return;
  }

  setText(".ctd-selected-title strong", task.title);
  setText(".ctd-selected-title .ctd-meta", task.cwd || task.projectName);
  const status = root.querySelector(".ctd-right-head .ctd-status");
  if (status) {
    status.className = `ctd-status ${statusClass[task.status] ?? "idle"}`;
    status.innerHTML = `<span class="ctd-dot ${statusDot[task.status] ?? "blue"}"></span>${escapeHtml(task.statusLabel)}`;
  }
  setText(".ctd-right-head .ctd-small", `thread ${task.id.slice(0, 8)}...`);

  const blocks = root.querySelectorAll(".ctd-inspector-block");
  renderAttentionBlock(blocks[0], task);
  renderGoalBlock(blocks[1], task);
  renderStepsBlock(blocks[2], task);
  renderHeartbeatBlock(blocks[3], task);
  renderCommandBlock(blocks[4], task);
  renderRecommendationBlock(blocks[5], task);
}

function renderAttentionBlock(block, task) {
  if (!block) return;
  const confirmation = task.confirmation;
  const hasOpenConfirmation = confirmation?.state === "open";
  block.className = `ctd-inspector-block ${hasOpenConfirmation || task.status === "attention" ? "alert" : ""}`;

  if (confirmation) {
    block.innerHTML = `
      <div class="ctd-section-title" style="margin:0;">
        <h3>${hasOpenConfirmation ? "待确认" : "确认记录"}</h3>
        <span class="ctd-pill"><span class="ctd-dot ${hasOpenConfirmation ? "amber" : "blue"}"></span>${escapeHtml(confirmationStateLabel(confirmation.state))}</span>
      </div>
      <div class="ctd-confirmation-prompt">${escapeHtml(confirmation.prompt)}</div>
      <div class="ctd-row-between ctd-small">
        <span>${escapeHtml(confirmationTypeLabel(confirmation.type))}</span>
        <span>${escapeHtml(formatTime(confirmation.createdAt))}</span>
      </div>
    `;
    return;
  }

  block.innerHTML = `
    <div class="ctd-section-title" style="margin:0;">
      <h3>注意事项</h3>
      <span class="ctd-pill"><span class="ctd-dot ${task.status === "attention" ? "amber" : ""}"></span>${task.status === "attention" ? "watch" : "live"}</span>
    </div>
    <div class="ctd-small">${task.status === "attention"
      ? "该任务最近没有新的运行痕迹，建议读取最新 turn 或确认是否在等用户。"
      : "该任务仍有近期心跳或命令记录，继续观察即可。"}</div>
  `;
}

function renderGoalBlock(block, task) {
  if (!block) return;
  const secondLabel = state.mode === "计划" ? "下一步" : state.mode === "排期" ? "排期依据" : "完成条件";
  const secondBody = state.mode === "计划"
    ? nextPlanStep(task)?.label ?? "暂无未完成计划步骤。"
    : state.mode === "排期"
      ? `${task.updatedAgo} 更新；进度 ${task.progress}%。`
      : "最新心跳进入 final 或用户明确确认后，才视为完成。";

  block.innerHTML = `
    <h3>${state.mode === "排期" ? "排期目标" : "当前目标"}</h3>
    <div class="ctd-event"><div class="ctd-event-mark">1</div><div><strong>${escapeHtml(task.projectName)}</strong><br>${escapeHtml(task.goal)}</div></div>
    <div class="ctd-rule"></div>
    <div class="ctd-event"><div class="ctd-event-mark">2</div><div><strong>${escapeHtml(secondLabel)}</strong><br>${escapeHtml(secondBody)}</div></div>
  `;
}

function renderStepsBlock(block, task) {
  if (!block) return;
  const done = task.planSteps.filter((step) => step.state === "done").length;
  block.innerHTML = `
    <div class="ctd-section-title" style="margin:0;">
      <h3>计划步骤</h3>
      <span class="ctd-small">${done} / ${task.planSteps.length}</span>
    </div>
    ${task.planSteps.map((step) => `
      <div class="ctd-plan-step">
        <span class="ctd-check ${step.state === "done" ? "" : "current"}">${step.state === "done" ? "✓" : "•"}</span>
        <span>${escapeHtml(step.label)}</span>
        <span>${step.state === "done" ? "完成" : step.state === "current" ? "进行中" : "待执行"}</span>
      </div>
    `).join("")}
  `;
}

function renderHeartbeatBlock(block, task) {
  if (!block) return;
  block.innerHTML = `
    <h3>最近心跳</h3>
    <div class="ctd-log">
      <div class="ctd-log-line"><strong>${escapeHtml(formatTime(task.updatedAt))}</strong><span>${escapeHtml(task.latestHeartbeat)}</span></div>
      <div class="ctd-log-line"><strong>${escapeHtml(task.toolStatus)}</strong><span>${escapeHtml(task.latestTool)}</span></div>
    </div>
  `;
}

function renderCommandBlock(block, task) {
  if (!block) return;
  block.innerHTML = `
    <h3>最近命令</h3>
    <div class="ctd-command-line">${escapeHtml(task.latestCommand || "No recent command recorded.")}</div>
  `;
}

function renderRecommendationBlock(block, task) {
  if (!block) return;
  const recommendation = task.status === "attention"
    ? ["读取最新 turn", "复核等待原因"]
    : task.toolStatus === "running"
      ? ["观察命令输出", "保留当前上下文"]
      : ["继续监控", "等待下一次心跳"];

  block.innerHTML = `
    <h3>推荐动作</h3>
    <div class="ctd-row-between"><span class="ctd-small">${escapeHtml(recommendation[0])}</span><span class="ctd-pill">primary</span></div>
    <div class="ctd-row-between"><span class="ctd-small">${escapeHtml(recommendation[1])}</span><span class="ctd-pill">next</span></div>
  `;
}

function selectedTask() {
  return state.snapshot?.tasks.find((task) => task.id === state.selectedTaskId)
    ?? filteredTasks()[0]
    ?? state.snapshot?.tasks[0]
    ?? null;
}

function filteredTasks() {
  if (!state.snapshot) return [];
  const query = state.query.trim().toLowerCase();
  return state.snapshot.tasks.filter((task) => {
    if (state.projectScoped && state.selectedProjectId && task.cwd !== state.selectedProjectId) return false;
    if (!query) return true;
    return [task.title, task.projectName, task.cwd, task.latestHeartbeat, task.latestCommand, task.confirmation?.prompt, task.reportSource]
      .some((value) => String(value ?? "").toLowerCase().includes(query));
  });
}

function projectMatches(project) {
  if (state.projectFilter === "active") return project.running > 0 || project.attention > 0;
  if (state.projectFilter === "schedule") return project.tasks.length > 0;
  return true;
}

function wireInteractions() {
  root.addEventListener("click", (event) => {
    const mode = event.target.closest(".ctd-toggle span");
    if (mode) {
      root.querySelectorAll(".ctd-toggle span").forEach((item) => item.classList.remove("active"));
      mode.classList.add("active");
      state.mode = mode.textContent.trim();
      renderInspector();
      return;
    }

    const tab = event.target.closest(".ctd-project-tabs span");
    if (tab) {
      root.querySelectorAll(".ctd-project-tabs span").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      state.projectFilter = tab.textContent.includes("活跃") ? "active" : tab.textContent.includes("排期") ? "schedule" : "all";
      renderProjects();
      return;
    }

    const project = event.target.closest("[data-project-id]");
    if (project) {
      state.selectedProjectId = project.dataset.projectId;
      state.projectScoped = true;
      const firstProjectTask = state.snapshot.tasks.find((task) => task.cwd === state.selectedProjectId);
      state.selectedTaskId = firstProjectTask?.id ?? state.selectedTaskId;
      renderProjects();
      renderTasks();
      renderInspector();
      return;
    }

    const row = event.target.closest("[data-task-id]");
    if (row) {
      state.selectedTaskId = row.dataset.taskId;
      const task = selectedTask();
      state.selectedProjectId = task?.cwd ?? state.selectedProjectId;
      state.projectScoped = true;
      renderProjects();
      renderTasks();
      renderInspector();
    }
  });

  const search = root.querySelector(".ctd-search");
  if (search) {
    search.setAttribute("contenteditable", "true");
    search.setAttribute("role", "searchbox");
    search.addEventListener("focus", () => {
      if (!state.query) search.querySelector("span")?.replaceChildren();
    });
    search.addEventListener("input", () => {
      state.query = search.textContent.replace("Ctrl K", "").trim();
      renderTasks();
    });
  }
}

function setText(selector, value) {
  const element = root.querySelector(selector);
  if (element) element.textContent = value;
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function relativeFromIso(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知";
  return date.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function nextAutomationLabel(automation) {
  return automation?.nextLabel ?? "--";
}

function nextPlanStep(task) {
  return task.planSteps.find((step) => step.state !== "done") ?? null;
}

function reportSourceClass(task) {
  const source = task.reportSource === "self-reported" ? "self" : "inferred";
  return `${source} ${task.reportFreshness ?? ""}`.trim();
}

function reportSourceLabel(task) {
  if (task.reportSource === "self-reported") {
    return `self · ${freshnessLabel(task.reportFreshness)}`;
  }
  return "inferred";
}

function freshnessLabel(value) {
  if (value === "fresh") return "fresh";
  if (value === "quiet") return "quiet";
  if (value === "stale") return "stale";
  if (value === "complete") return "complete";
  return "inferred";
}

function confirmationStateLabel(value) {
  if (value === "open") return "待确认";
  if (value === "answered") return "已回复";
  if (value === "resolved") return "已解决";
  if (value === "superseded") return "已覆盖";
  return "确认点";
}

function confirmationTypeLabel(value) {
  if (value === "approval") return "批准";
  if (value === "choice") return "选择";
  if (value === "clarification") return "澄清";
  if (value === "permission") return "授权";
  if (value === "credentials") return "凭证";
  if (value === "review") return "审阅";
  return "确认";
}

function uniqueCount(values) {
  return new Set(values ?? []).size;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

wireInteractions();
refreshSnapshot();
state.pollTimer = setInterval(refreshSnapshot, 20000);
