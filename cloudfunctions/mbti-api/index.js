const cloudbase = require("@cloudbase/node-sdk");

const app = cloudbase.init({
  env: cloudbase.SYMBOL_DEFAULT_ENV
});
const db = app.database();
const submissions = db.collection("submissions");
const RESULT_PATTERN = /^(E|I)(S|N)(T|F)(J|P)$/;
const PAGE_SIZE = 100;
const MAX_ROWS = 10000;

exports.main = async (event = {}) => {
  if (event.action === "submit") {
    return submitResult(event);
  }
  if (event.action === "list") {
    return listResults(event);
  }
  return { ok: false, error: "UNSUPPORTED_ACTION" };
};

async function submitResult(event) {
  const name = typeof event.name === "string"
    ? event.name.trim().replace(/\s+/g, " ")
    : "";
  const result = typeof event.result === "string"
    ? event.result.toUpperCase()
    : "";

  if (!name || name.length > 30 || !RESULT_PATTERN.test(result)) {
    return { ok: false, error: "INVALID_SUBMISSION" };
  }

  const response = await submissions.add({
    name,
    result,
    submittedAt: new Date()
  });

  return { ok: true, id: response.id };
}

async function listResults(event) {
  const configuredPassword = process.env.ADMIN_PASSWORD || "";
  const suppliedPassword = typeof event.password === "string" ? event.password : "";

  if (!configuredPassword) {
    return { ok: false, error: "ADMIN_PASSWORD_NOT_CONFIGURED" };
  }
  if (suppliedPassword !== configuredPassword) {
    return { ok: false, error: "INVALID_PASSWORD" };
  }

  const rows = [];
  while (rows.length < MAX_ROWS) {
    const response = await submissions
      .orderBy("submittedAt", "desc")
      .skip(rows.length)
      .limit(PAGE_SIZE)
      .get();
    const batch = Array.isArray(response.data) ? response.data : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return {
    ok: true,
    rows: rows.map((row) => ({
      id: row._id,
      name: row.name,
      result: row.result,
      submittedAt: toTimestamp(row.submittedAt)
    })),
    truncated: rows.length === MAX_ROWS
  };
}

function toTimestamp(value) {
  if (value instanceof Date) return value.getTime();
  if (value && typeof value === "object" && value.$date) {
    return new Date(value.$date).getTime();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}
