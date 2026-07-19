import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

import { collectSnapshot } from "./lib/collector.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(__dirname, "..");
const assetsRoot = path.join(pluginRoot, "assets");

export function createDashboardServer(options = {}) {
  const codexHome = options.codexHome ?? path.join(os.homedir(), ".codex");
  const now = options.now;

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? "/", "http://127.0.0.1");
      if (url.pathname === "/api/snapshot") {
        const snapshot = await collectSnapshot({ codexHome, now: now ?? new Date() });
        send(response, 200, JSON.stringify(snapshot), "application/json; charset=utf-8");
        return;
      }

      if (url.pathname === "/" || url.pathname === "/index.html") {
        send(response, 200, await readDashboardHtml(), "text/html; charset=utf-8");
        return;
      }

      if (url.pathname.startsWith("/assets/")) {
        await serveAsset(url.pathname, response);
        return;
      }

      send(response, 404, "Not found", "text/plain; charset=utf-8");
    } catch (error) {
      send(response, 500, JSON.stringify({ error: error.message }), "application/json; charset=utf-8");
    }
  });
}

async function readDashboardHtml() {
  const filePath = path.join(assetsRoot, "dashboard.html");
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Codex 任务总览</title>
  <link rel="stylesheet" href="/assets/dashboard.css">
</head>
<body>
  <main id="codex-task-dashboard-app">Codex 任务总览</main>
  <script type="module" src="/assets/dashboard.js"></script>
</body>
</html>`;
  }
}

async function serveAsset(urlPath, response) {
  const relative = decodeURIComponent(urlPath.replace(/^\/assets\//, ""));
  const filePath = path.resolve(assetsRoot, relative);
  if (!filePath.startsWith(assetsRoot)) {
    send(response, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }
  try {
    const body = await fs.readFile(filePath);
    send(response, 200, body, mimeType(filePath));
  } catch {
    send(response, 404, "Not found", "text/plain; charset=utf-8");
  }
}

function send(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(body);
}

function mimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".css") return "text/css; charset=utf-8";
  if (ext === ".js") return "text/javascript; charset=utf-8";
  if (ext === ".png") return "image/png";
  if (ext === ".svg") return "image/svg+xml; charset=utf-8";
  return "application/octet-stream";
}

function parseArgs(argv) {
  const args = { port: 57631, host: "127.0.0.1", codexHome: path.join(os.homedir(), ".codex") };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--port") args.port = Number(argv[++i]);
    if (arg === "--host") args.host = argv[++i];
    if (arg === "--codex-home") args.codexHome = argv[++i];
  }
  return args;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const server = createDashboardServer({ codexHome: args.codexHome });
  server.listen(args.port, args.host, () => {
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : args.port;
    console.log(`Codex Task Dashboard: http://${args.host}:${port}/`);
  });
}
