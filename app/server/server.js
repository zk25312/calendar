/**
 * 日历标记 - 后端服务
 * 零依赖 Node.js 服务：静态页面 + 标记数据 API
 * 安装到 fnOS 后通过统一网关(app.sock)访问；本地开发用 PORT
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const PORT = process.env.PORT || 5001;
const SOCKET_PATH = process.env.SOCKET_PATH || "";
const GATEWAY_PREFIX = process.env.GATEWAY_PREFIX || "/app/calendar";
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const MARKS_FILE = path.join(DATA_DIR, "marks.json");
const STATIC_DIR = process.env.FRONTEND_DIST || path.join(__dirname, "public");
fs.mkdirSync(DATA_DIR, { recursive: true });
/* ---------- 标记数据存取（多设备共享标记数据） ---------- */
function loadDB() {
  try {
    if (fs.existsSync(MARKS_FILE)) {
      const data = JSON.parse(fs.readFileSync(MARKS_FILE, "utf8"));
      if (data && typeof data === "object" && data.marks) return data;
    }
  } catch (e) {
    console.error("load marks failed:", e.message);
  }
  return { marks: {}, version: 0 };
}
function saveDB(db) {
  db.version = (db.version || 0) + 1;
  const tmp = MARKS_FILE + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, MARKS_FILE);
}
function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}
/* ---------- API ---------- */
function handleApi(req, res, pathname) {
  // 读取全部标记（不同设备访问加载同一份数据）
  if (req.method === "GET" && pathname === "/api/marks") {
    const db = loadDB();
    return sendJson(res, 200, { marks: db.marks, version: db.version || 0 });
  }
  // 点击切换标记：点一下标记，再点一下取消
  if (req.method === "POST" && pathname === "/api/toggle") {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 65536) req.destroy();
    });
    req.on("end", () => {
      let date = "";
      try {
        const body = JSON.parse(raw || "{}");
        date = typeof body.date === "string" ? body.date : "";
      } catch (e) { /* ignore */ }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return sendJson(res, 400, { error: "invalid date, expect YYYY-MM-DD" });
      }
      const db = loadDB();
      if (db.marks[date]) {
        delete db.marks[date]; // 已标记 -> 取消
      } else {
        db.marks[date] = { t: Date.now() }; // 未标记 -> 标记
      }
      saveDB(db);
      sendJson(res, 200, { ok: true, marks: db.marks, version: db.version });
    });
    return;
  }
  sendJson(res, 404, { error: "not found" });
}
/* ---------- 静态文件 ---------- */
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};
function serveStatic(res, relPath) {
  let target = path.normalize(path.join(STATIC_DIR, relPath));
  if (!target.startsWith(path.normalize(STATIC_DIR))) {
    res.writeHead(400); return res.end("Bad Request");
  }
  if (relPath === "/" || relPath === "" || !fs.existsSync(target) || fs.statSync(target).isDirectory()) {
    // 仅对无扩展名的路径回退到 index.html；静态资源缺失直接404，避免把HTML当JS/CSS返回
    if (path.extname(relPath) === "") {
      target = path.join(STATIC_DIR, "index.html");
    } else {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 Not Found");
    }
  }
  if (!fs.existsSync(target)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("404 Not Found");
  }
  const ext = path.extname(target).toLowerCase();
  res.writeHead(200, {
    "Content-Type": MIME[ext] || "application/octet-stream",
    "Cache-Control": "no-cache",
  });
  fs.createReadStream(target).pipe(res);
}
/* ---------- HTTP 服务 ---------- */
const server = http.createServer((req, res) => {
  let pathname = decodeURIComponent((req.url || "/").split("?")[0]);
  // 兼容统一网关前缀与根路径两种访问方式
  if (pathname.startsWith(GATEWAY_PREFIX + "/")) {
    pathname = pathname.slice(GATEWAY_PREFIX.length);
  } else if (pathname === GATEWAY_PREFIX) {
    // 无斜杠访问时301重定向，保证页面内相对路径(style.css/app.js)正确解析
    res.writeHead(301, { Location: GATEWAY_PREFIX + "/" });
    return res.end();
  }
  if (pathname.startsWith("/api/")) {
    return handleApi(req, res, pathname);
  }
  return serveStatic(res, pathname);
});
if (SOCKET_PATH) {
  try { fs.rmSync(SOCKET_PATH, { force: true }); } catch (e) { /* ignore */ }
  server.listen(SOCKET_PATH, () => {
    console.log(`calendar server running on socket ${SOCKET_PATH}`);
  });
} else {
  server.listen(PORT, () => {
    console.log(`calendar server running at http://localhost:${PORT}`);
  });
}