const http = require("http");
const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({
  env: cloudbase.SYMBOL_DEFAULT_ENV
});
const db = app.database();
const submissions = db.collection("submissions");

const ALLOWED_ORIGINS = new Set([
  "https://keyzhao0118.github.io",
  "http://127.0.0.1",
  "http://localhost"
]);

function normalizeOrigin(origin) {
  if (!origin) return "";
  try {
    const url = new URL(origin);
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
      return url.protocol + "//" + url.hostname;
    }
    return url.origin;
  } catch {
    return "";
  }
}

function corsHeaders(origin) {
  const normalized = normalizeOrigin(origin);
  const allowOrigin = ALLOWED_ORIGINS.has(normalized)
    ? origin
    : "https://keyzhao0118.github.io";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

function sendJson(res, statusCode, body, origin) {
  res.writeHead(statusCode, {
    ...corsHeaders(origin),
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 16 * 1024) {
        reject(new Error("请求内容过大"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("请求格式错误"));
      }
    });
    req.on("error", reject);
  });
}

function validateSubmission(name, result) {
  if (!name || typeof name !== "string" || name.trim().length > 30) {
    throw new Error("请输入不超过 30 个字符的姓名");
  }
  if (!/^[EI][SN][TF][JP]$/.test(result)) {
    throw new Error("MBTI 结果格式不正确");
  }
}

async function submitResult(payload) {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const result = payload.result;
  validateSubmission(name, result);
  await submissions.add({
    name,
    result,
    submittedAt: new Date()
  });
  return { ok: true };
}

function normalizeTimestamp(value) {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  if (typeof value.toDate === "function") return value.toDate().toISOString();
  if (typeof value.$date === "number") return new Date(value.$date).toISOString();
  return String(value);
}

async function listResults(payload) {
  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) {
    throw new Error("管理员密码尚未配置");
  }
  if (payload.password !== expectedPassword) {
    const error = new Error("管理员密码错误");
    error.statusCode = 401;
    throw error;
  }

  const rows = [];
  const pageSize = 100;
  const maxRows = 10000;
  for (let offset = 0; offset < maxRows; offset += pageSize) {
    const response = await submissions
      .orderBy("submittedAt", "desc")
      .skip(offset)
      .limit(pageSize)
      .get();
    const page = response.data || [];
    rows.push(
      ...page.map((item) => ({
        id: item._id,
        name: item.name,
        result: item.result,
        submittedAt: normalizeTimestamp(item.submittedAt)
      }))
    );
    if (page.length < pageSize) break;
  }

  return {
    ok: true,
    rows,
    truncated: rows.length >= maxRows
  };
}

async function handleRequest(req, res) {
  const origin = req.headers.origin || "";
  if (req.method === "OPTIONS") {
    res.writeHead(204, corsHeaders(origin));
    res.end();
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { ok: false, message: "仅支持 POST 请求" }, origin);
    return;
  }

  try {
    const payload = await readJson(req);
    let response;
    if (payload.action === "submit") {
      response = await submitResult(payload);
    } else if (payload.action === "list") {
      response = await listResults(payload);
    } else {
      throw new Error("未知操作");
    }
    sendJson(res, 200, response, origin);
  } catch (error) {
    sendJson(
      res,
      error.statusCode || 400,
      { ok: false, message: error.message || "请求失败" },
      origin
    );
  }
}

http.createServer(handleRequest).listen(9000, "0.0.0.0", () => {
  console.log("MBTI HTTP API listening on port 9000");
});
