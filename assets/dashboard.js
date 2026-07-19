const root = document.getElementById("codex-task-dashboard-mockup");

const state = {
  snapshot: null,
  mode: "goal",
  query: "",
  projectFilter: "all",
  selectedTaskId: null,
};

const statusClass = {
  running: "run",
  attention: "wait",
  idle: "idle",
};

async function refreshSnapshot() {
  try {
    const response = await fetch("/api/snapshot", { cache: "no-store" });
    if (!response.ok) throw new Error(`snapshot ${response.status}`);
    state.snapshot = await response.json();
    state.selectedTaskId ??= state.snapshot.selectedTask?.id ?? state.snapshot.tasks?.[0]?.id ?? null;
    render();
  } catch (error) {
    console.error(error);
  }
}

function render() {
  if (!state.snapshot) return;
  renderTopline();
  renderMetrics();
  renderProjects();
  renderTasks();
  renderTimeline();
  renderInspector();
}

function renderTopline() {
  const { snapshot } = state;
  setText(".ctd-subtitle", `Local host · ${snapshot.projects.length} 个项目 · 20 秒刷新`);
  setText(".ctd-left-footer .ctd-health:nth-child(1) strong", `${snapshot.metrics.automationsActive} active`);
  setText(".ctd-left-footer .ctd-health:nth-child(2) strong", "Local Codex files");
  setText(".ctd-left-footer .ctd-health:nth-child(3) strong", formatTime(snapshot.generatedAt));
  setText(".ctd-stats .ctd-stat:nth-child(4) .ctd-stat-head span:nth-child(2)", snapshot.automations[0]?.nextLabel ?? "--:--");
  setText(".ctd-stats .ctd-stat:nth-child(4) .ctd-stat-note", `● ${snapshot.automations[0]?.name ?? "暂无自动化"}`);
}

function renderMetrics() {
  const { metrics } = state.snapshot;
  const values = root.querySelectorAll(".ctd-stat-value");
  if (values[0]) values[0].textContent = metrics.runningTasks;
  if (values[1]) values[1].textContent = metrics.plannedItems;
  if (values[2]) values[2].textContent = metrics.attentionTasks;
  if (values[3]) values[3].textContent = nextAutomationDelta(state.snapshot.automations[0]);
  setText(".ctd-stat.live .ctd-stat-note", `● ${metrics.totalTasks} 条最近任务`);
  setText(".ctd-stats .ctd-stat:nth-child(2) .ctd-stat-note", `● ${metrics.plannedItems} 个计划步骤`);
  setText(".ctd-stat.warn .ctd-stat-note", `● ${metrics.attentionTasks} 条需复核`);
  setText(".ctd-main > .ctd-section .ctd-pill", `● Last poll ${formatTime(state.snapshot.generatedAt)}`);
}

function renderProjects() {
  const list = root.querySelector(".ctd-project-list");
  if (!list) return;
  const projects = state.snapshot.projects.filter(projectMatches);
  list.innerHTML = projects.map((project, index) => `
    <button class="ctd-project ${index === 0 ? "active" : ""}" data-project-id="${escapeAttr(project.id)}">
      <div class="ctd-project-row">
        <div class="ctd-project-name">${escapeHtml(project.name)}</div>
        <span class="ctd-status ${project.attention ? "wait" : project.running ? "run" : "idle"}"><span class="ctd-dot ${project.attention ? "amber" : project.running ? "" : "blue"}"></span>${project.attention ? "需关注" : project.running ? "执行中" : "空闲"}</span>
      </div>
      <div class="ctd-path">${escapeHtml(project.path)}</div>
      <div class="ctd-mini-bars"><span></span><span></span><span></span></div>
      <div class="ctd-row-between ctd-small"><span>${project.tasks.length} 任务</span><span>${escapeHtml(relativeFromIso(project.updatedAt))}</span></div>
    </button>
  `).join("");
}

function renderTasks() {
  const tbody = root.querySelector(".ctd-live-table tbody");
  if (!tbody) return;
  const tasks = filteredTasks();
  tbody.innerHTML = tasks.map((task) => `
    <tr class="${task.id === state.selectedTaskId ? "selected" : ""}" data-task-id="${escapeAttr(task.id)}">
      <td>
        <div class="ctd-thread-title">
          <strong>${escapeHtml(task.title)}</strong>
          <span>${escapeHtml(task.projectName)} · ${escapeHtml(task.status)} · ${escapeHtml(task.updatedAgo)}</span>
        </div>
      </td>
      <td><span class="ctd-status ${statusClass[task.status] ?? "idle"}"><span class="ctd-dot ${task.status === "attention" ? "amber" : task.status === "idle" ? "blue" : ""}"></span>${escapeHtml(task.statusLabel)}</span></td>
      <td>${escapeHtml(task.latestTool)} ${escapeHtml(task.toolStatus)}</td>
      <td><div class="ctd-progress"><span style="width:${clamp(task.progress, 0, 100)}%"></span></div></td>
      <td><div class="ctd-feed">${escapeHtml(task.latestHeartbeat)}</div></td>
    </tr>
  `).join("");
}

function renderTimeline() {
  const schedule = root.querySelector(".ctd-schedule");
  if (!schedule) return;
  schedule.innerHTML = state.snapshot.scheduleRows.map((row) => `
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
  if (!task) return;
  setText(".ctd-selected-title strong", task.title);
  setText(".ctd-selected-title .ctd-meta", task.cwd);
  setText(".ctd-right-head .ctd-status", `● ${task.statusLabel}`);
  setText(".ctd-right-head .ctd-small", `thread ${task.id.slice(0, 8)}...`);
  setText(".ctd-inspector-block.alert .ctd-small", task.status === "attention"
    ? "最近有活动但未发现运行中命令，建议读取最新 turn 或确认是否等待用户。"
    : "任务仍有运行迹象；若长时间无心跳，建议提醒或读取最新 turn。");

  const goalBlock = root.querySelectorAll(".ctd-inspector-block")[1];
  if (goalBlock) {
    goalBlock.innerHTML = `
      <h3>当前目标</h3>
      <div class="ctd-event"><div class="ctd-event-mark">1</div><div><strong>${escapeHtml(task.title)}</strong><br>${escapeHtml(task.goal)}</div></div>
      <div class="ctd-rule"></div>
      <div class="ctd-event"><div class="ctd-event-mark">2</div><div><strong>完成条件</strong><br>最近心跳进入 final 或用户明确确认完成。</div></div>
    `;
  }

  const stepsBlock = root.querySelectorAll(".ctd-inspector-block")[2];
  if (stepsBlock) {
    stepsBlock.innerHTML = `
      <div class="ctd-section-title" style="margin:0;">
        <h3>计划步骤</h3>
        <span class="ctd-small">${task.planSteps.filter((step) => step.state === "done").length} / ${task.planSteps.length}</span>
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

  const heartbeatBlock = root.querySelectorAll(".ctd-inspector-block")[3];
  if (heartbeatBlock) {
    heartbeatBlock.innerHTML = `
      <h3>最近心跳</h3>
      <div class="ctd-log">
        <div class="ctd-log-line"><strong>${escapeHtml(formatTime(task.updatedAt))}</strong><span>${escapeHtml(task.latestHeartbeat)}</span></div>
        <div class="ctd-log-line"><strong>${escapeHtml(task.toolStatus)}</strong><span>${escapeHtml(task.latestTool)}</span></div>
      </div>
    `;
  }

  const commandBlock = root.querySelectorAll(".ctd-inspector-block")[4];
  if (commandBlock) {
    commandBlock.innerHTML = `
      <h3>最近命令</h3>
      <div class="ctd-command-line">${escapeHtml(task.latestCommand || "No recent command recorded")}</div>
    `;
  }
}

function selectedTask() {
  return state.snapshot.tasks.find((task) => task.id === state.selectedTaskId) ?? state.snapshot.tasks[0] ?? null;
}

function filteredTasks() {
  return state.snapshot.tasks.filter((task) => {
    const query = state.query.trim().toLowerCase();
    if (!query) return true;
    return [task.title, task.projectName, task.cwd, task.latestHeartbeat].some((value) => String(value).toLowerCase().includes(query));
  });
}

function projectMatches(project) {
  if (state.projectFilter === "active") return project.running > 0;
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
    }

    const tab = event.target.closest(".ctd-project-tabs span");
    if (tab) {
      root.querySelectorAll(".ctd-project-tabs span").forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      state.projectFilter = tab.textContent.includes("活跃") ? "active" : tab.textContent.includes("排期") ? "schedule" : "all";
      renderProjects();
    }

    const row = event.target.closest("[data-task-id]");
    if (row) {
      state.selectedTaskId = row.dataset.taskId;
      renderTasks();
      renderInspector();
    }
  });

  const search = root.querySelector(".ctd-search");
  if (search) {
    search.setAttribute("contenteditable", "true");
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

function nextAutomationDelta(automation) {
  if (!automation?.nextLabel) return "--";
  return automation.nextLabel;
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
setInterval(refreshSnapshot, 20000);
