const QUESTIONS = window.MBTI_QUESTIONS;
const SESSION_KEY = "mbti-test-session-v1";

const views = [...document.querySelectorAll(".view")];
const progressTrack = document.querySelector(".progress-track");
const nameDialog = document.querySelector("#name-dialog");
const nameInput = document.querySelector("#participant-name");
const nameMessage = document.querySelector("#name-message");
const answerList = document.querySelector("#answer-list");
const previousButton = document.querySelector("#previous-question");
const nextButton = document.querySelector("#next-question");
const submitButton = document.querySelector("#submit-result");
const submitStatus = document.querySelector("#submit-status");
const adminLoginPanel = document.querySelector("#admin-login-panel");
const adminDashboard = document.querySelector("#admin-dashboard");
const adminLoginMessage = document.querySelector("#admin-login-message");
const tableStatus = document.querySelector("#table-status");
const resultsBody = document.querySelector("#results-body");
const descriptionDialog = document.querySelector("#description-dialog");
const descriptionDialogType = document.querySelector("#description-dialog-type");
const descriptionDialogTitle = document.querySelector("#description-dialog-title");
const descriptionDialogSubtitle = document.querySelector("#description-dialog-subtitle");
const descriptionDialogBody = document.querySelector("#description-dialog-body");

let participantName = "";
let answers = Array(QUESTIONS.length).fill(null);
let currentQuestion = 0;
let currentResult = "";
let submitted = false;
let backendConfigured = false;
let adminPassword = "";
let submissionRows = [];
let autoAdvanceTimer = null;
let toastTimer = null;

document.querySelector("#year").textContent = new Date().getFullYear();
initializeBackend();
restoreSession();
bindEvents();

function initializeBackend() {
  const config = window.MBTI_CLOUDBASE_CONFIG;
  backendConfigured = Boolean(
    config &&
    typeof config.apiUrl === "string" &&
    /^https:\/\//.test(config.apiUrl)
  );
}

async function callMbtiApi(data) {
  if (!backendConfigured) throw new Error("CLOUDBASE_NOT_CONFIGURED");
  const response = await fetch(window.MBTI_CLOUDBASE_CONFIG.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const result = await response.json().catch(() => null);
  if (!result || result.ok !== true) {
    const error = new Error(result?.message || "CLOUD_FUNCTION_FAILED");
    error.code = response.status === 401 ? "ADMIN_PASSWORD_INVALID" : "CLOUD_FUNCTION_FAILED";
    throw error;
  }
  return result;
}

function bindEvents() {
  document.querySelector("#start-button").addEventListener("click", () => {
    nameMessage.textContent = "";
    nameInput.value = "";
    nameDialog.showModal();
    window.setTimeout(() => nameInput.focus(), 50);
  });
  document.querySelector("#dialog-close").addEventListener("click", () => nameDialog.close());
  nameDialog.addEventListener("click", (event) => {
    if (event.target === nameDialog) nameDialog.close();
  });
  document.querySelector("#name-form").addEventListener("submit", beginTest);
  document.querySelector("#home-button").addEventListener("click", showHome);
  document.querySelector("#admin-back").addEventListener("click", showHome);
  document.querySelector("#admin-entry").addEventListener("click", showAdmin);
  previousButton.addEventListener("click", () => moveQuestion(-1));
  nextButton.addEventListener("click", () => moveQuestion(1));
  document.querySelector("#review-answers").addEventListener("click", () => {
    currentQuestion = 0;
    showView("test");
    renderQuestion();
  });
  submitButton.addEventListener("click", submitResult);
  document.querySelector("#admin-login-form").addEventListener("submit", adminLogin);
  document.querySelector("#admin-logout").addEventListener("click", adminLogout);
  document.querySelector("#refresh-data").addEventListener("click", loadSubmissions);
  document.querySelector("#copy-csv").addEventListener("click", copyCsv);
  document.querySelector("#download-csv").addEventListener("click", downloadCsv);
  document.querySelector("#description-dialog-close").addEventListener("click", () => descriptionDialog.close());
  descriptionDialog.addEventListener("click", (event) => {
    if (event.target === descriptionDialog) descriptionDialog.close();
  });
  resultsBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mbti-type]");
    if (button) openDescription(button.dataset.mbtiType);
  });
  window.addEventListener("hashchange", () => {
    if (window.location.hash === "#admin") showAdmin(false);
  });
  document.addEventListener("keydown", handleAnswerShortcut);
}

function beginTest(event) {
  event.preventDefault();
  const cleanName = nameInput.value.trim().replace(/\s+/g, " ");
  if (!cleanName) {
    nameMessage.textContent = "请输入姓名后继续。";
    nameInput.focus();
    return;
  }
  if (cleanName.length > 30) {
    nameMessage.textContent = "姓名不能超过 30 个字符。";
    return;
  }

  participantName = cleanName;
  answers = Array(QUESTIONS.length).fill(null);
  currentQuestion = 0;
  currentResult = "";
  submitted = false;
  saveSession();
  nameDialog.close();
  showView("test");
  renderQuestion();
}

function renderQuestion() {
  window.clearTimeout(autoAdvanceTimer);
  const [prompt, optionA, optionB] = QUESTIONS[currentQuestion];
  const number = currentQuestion + 1;
  const percent = Math.round((number / QUESTIONS.length) * 100);

  document.querySelector("#question-number").textContent = String(number).padStart(2, "0");
  document.querySelector("#question-title").textContent = prompt;
  document.querySelector("#progress-label").textContent = `第 ${number} 题 / 共 ${QUESTIONS.length} 题`;
  document.querySelector("#progress-percent").textContent = `${percent}%`;
  document.querySelector("#progress-bar").style.width = `${percent}%`;
  progressTrack.setAttribute("aria-valuenow", String(number));

  answerList.replaceChildren(
    createAnswerButton("A", optionA),
    createAnswerButton("B", optionB)
  );
  previousButton.disabled = currentQuestion === 0;
  nextButton.hidden = !answers[currentQuestion] || currentQuestion === QUESTIONS.length - 1;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function createAnswerButton(letter, text) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "answer-button";
  button.dataset.answer = letter;
  button.setAttribute("aria-pressed", String(answers[currentQuestion] === letter));
  if (answers[currentQuestion] === letter) button.classList.add("is-selected");

  const letterNode = document.createElement("span");
  letterNode.className = "answer-letter";
  letterNode.textContent = letter;
  const textNode = document.createElement("span");
  textNode.className = "answer-text";
  textNode.textContent = text;
  button.append(letterNode, textNode);
  button.addEventListener("click", () => selectAnswer(letter));
  return button;
}

function selectAnswer(letter) {
  answers[currentQuestion] = letter;
  submitted = false;
  saveSession();
  [...answerList.children].forEach((button) => {
    const selected = button.dataset.answer === letter;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  nextButton.hidden = currentQuestion === QUESTIONS.length - 1;

  autoAdvanceTimer = window.setTimeout(() => {
    if (currentQuestion === QUESTIONS.length - 1) {
      finishTest();
    } else {
      currentQuestion += 1;
      saveSession();
      renderQuestion();
    }
  }, 230);
}

function moveQuestion(direction) {
  window.clearTimeout(autoAdvanceTimer);
  const nextIndex = currentQuestion + direction;
  if (nextIndex < 0 || nextIndex >= QUESTIONS.length) return;
  currentQuestion = nextIndex;
  saveSession();
  renderQuestion();
}

function handleAnswerShortcut(event) {
  if (!document.querySelector("#test-view").classList.contains("is-active")) return;
  if (event.target.matches("input, textarea")) return;
  const key = event.key.toUpperCase();
  if (key === "A" || key === "B") selectAnswer(key);
  if (event.key === "ArrowLeft") moveQuestion(-1);
  if (event.key === "ArrowRight" && answers[currentQuestion]) {
    if (currentQuestion === QUESTIONS.length - 1) finishTest();
    else moveQuestion(1);
  }
}

function finishTest() {
  const firstMissing = answers.findIndex((answer) => !answer);
  if (firstMissing !== -1) {
    currentQuestion = firstMissing;
    renderQuestion();
    showToast("还有题目未作答，已为你定位。");
    return;
  }
  currentResult = calculateResult();
  document.querySelector("#result-type").textContent = currentResult;
  document.querySelector("#result-name").textContent = `${participantName}，这是你的性格偏好组合`;
  submitButton.disabled = submitted;
  submitButton.textContent = submitted ? "已提交" : "提交结果";
  submitStatus.className = "submit-status";
  submitStatus.textContent = submitted
    ? "结果已成功提交，请勿重复提交。"
    : "提交后，管理员将能看到你的姓名和测试结果。";
  if (submitted) submitStatus.classList.add("is-success");
  saveSession();
  showView("result");
}

function calculateResult() {
  const scores = { E: 0, I: 0, S: 0, N: 0, T: 0, F: 0, J: 0, P: 0 };
  QUESTIONS.forEach((question, index) => {
    const dimension = question[3];
    const letter = answers[index] === "A" ? dimension[0] : dimension[1];
    scores[letter] += 1;
  });
  return [
    scores.E > scores.I ? "E" : "I",
    scores.S > scores.N ? "S" : "N",
    scores.T > scores.F ? "T" : "F",
    scores.J > scores.P ? "J" : "P"
  ].join("");
}

async function submitResult() {
  if (submitted || submitButton.disabled) return;
  if (!backendConfigured) {
    setSubmitError("云端数据库尚未完成绑定，目前不能提交。管理员完成 CloudBase 配置后即可使用。");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "正在提交…";
  submitStatus.className = "submit-status";
  submitStatus.textContent = "正在安全保存你的结果，请稍候。";
  try {
    await callMbtiApi({
      action: "submit",
      name: participantName,
      result: currentResult
    });
    submitted = true;
    saveSession();
    submitButton.textContent = "已提交";
    submitStatus.textContent = "结果已成功提交，谢谢你的参与。";
    submitStatus.classList.add("is-success");
  } catch (error) {
    console.error("结果提交失败：", error);
    submitButton.disabled = false;
    submitButton.textContent = "重新提交";
    setSubmitError("提交失败，请检查网络后重试。");
  }
}

function setSubmitError(message) {
  submitStatus.textContent = message;
  submitStatus.className = "submit-status is-error";
}

function showView(name) {
  views.forEach((view) => view.classList.toggle("is-active", view.id === `${name}-view`));
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showHome() {
  history.replaceState(null, "", window.location.pathname + window.location.search);
  showView("welcome");
}

function showAdmin(updateHash = true) {
  if (updateHash && window.location.hash !== "#admin") history.pushState(null, "", "#admin");
  showView("admin");
  setAdminState(Boolean(adminPassword));
  if (adminPassword) loadSubmissions();
  else window.setTimeout(() => document.querySelector("#admin-password").focus(), 80);
}

async function adminLogin(event) {
  event.preventDefault();
  adminLoginMessage.textContent = "";
  if (!backendConfigured) {
    adminLoginMessage.textContent = "CloudBase 尚未完成配置，管理员后台暂不可用。";
    return;
  }
  const passwordInput = document.querySelector("#admin-password");
  const submit = event.currentTarget.querySelector("button[type='submit']");
  submit.disabled = true;
  submit.textContent = "正在验证…";
  try {
    const password = passwordInput.value;
    const result = await callMbtiApi({ action: "list", password });
    adminPassword = password;
    submissionRows = Array.isArray(result.rows) ? result.rows : [];
    passwordInput.value = "";
    setAdminState(true);
    renderSubmissionTable();
    tableStatus.textContent = submissionRows.length
      ? `已按提交时间从新到旧展示 ${submissionRows.length} 条记录。`
      : "目前还没有已提交的测试结果。";
  } catch (error) {
    console.error("管理员登录失败：", error.code || error.message);
    if (error.code === "ADMIN_PASSWORD_INVALID") {
      adminLoginMessage.textContent = "管理员密码不正确，请重新输入。";
    } else if (error.message === "管理员密码尚未配置") {
      adminLoginMessage.textContent = "云函数尚未配置管理员密码。";
    } else {
      adminLoginMessage.textContent = "登录失败，请检查网络后重试。";
    }
  } finally {
    submit.disabled = false;
    submit.textContent = "进入后台";
  }
}

async function adminLogout() {
  adminPassword = "";
  submissionRows = [];
  resultsBody.replaceChildren();
  setAdminState(false);
}

function setAdminState(isAdmin) {
  adminLoginPanel.hidden = isAdmin;
  adminDashboard.hidden = !isAdmin;
  if (!isAdmin) {
    document.querySelector("#submission-count").textContent = "0";
    tableStatus.textContent = "";
  }
}

async function loadSubmissions() {
  if (!backendConfigured || !adminPassword) return;
  tableStatus.textContent = "正在加载数据…";
  resultsBody.replaceChildren();
  try {
    const result = await callMbtiApi({ action: "list", password: adminPassword });
    submissionRows = Array.isArray(result.rows) ? result.rows : [];
    renderSubmissionTable();
    tableStatus.textContent = submissionRows.length
      ? `已按提交时间从新到旧展示 ${submissionRows.length} 条记录。`
      : "目前还没有已提交的测试结果。";
  } catch (error) {
    console.error("后台数据加载失败：", error);
    tableStatus.textContent = "数据加载失败，请检查网络、云函数和 CloudBase 配置。";
  }
}

function renderSubmissionTable() {
  document.querySelector("#submission-count").textContent = String(submissionRows.length);
  resultsBody.replaceChildren();
  if (!submissionRows.length) {
    const row = document.createElement("tr");
    row.className = "empty-row";
    const cell = document.createElement("td");
    cell.colSpan = 4;
    cell.textContent = "暂无提交记录";
    row.append(cell);
    resultsBody.append(row);
    return;
  }

  const fragment = document.createDocumentFragment();
  submissionRows.forEach((item) => {
    const row = document.createElement("tr");
    [
      formatTimestamp(item.submittedAt),
      item.name || "",
      item.result || ""
    ].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });

    const descriptionCell = document.createElement("td");
    descriptionCell.className = "analysis-action-cell";
    const descriptionButton = document.createElement("button");
    descriptionButton.className = "description-button";
    descriptionButton.type = "button";
    descriptionButton.dataset.mbtiType = item.result || "";
    descriptionButton.textContent = "查看解析";
    descriptionButton.setAttribute("aria-label", `查看 ${item.result || "该类型"} 的详细解析`);
    descriptionCell.append(descriptionButton);
    row.append(descriptionCell);
    fragment.append(row);
  });
  resultsBody.append(fragment);
}

function openDescription(mbtiType) {
  const description = window.MBTI_DESCRIPTIONS?.[mbtiType];
  if (!description) {
    showToast(`暂未找到 ${mbtiType || "该类型"} 的解析。`);
    return;
  }

  descriptionDialogType.textContent = mbtiType;
  descriptionDialogTitle.textContent = description.title;
  descriptionDialogSubtitle.textContent = description.subtitle;
  descriptionDialogBody.replaceChildren();

  const fragment = document.createDocumentFragment();
  description.blocks.forEach((block) => {
    if (block.type === "heading") {
      const heading = document.createElement(block.level === 1 ? "h3" : "h4");
      heading.textContent = block.text;
      fragment.append(heading);
      return;
    }
    if (block.type === "table") {
      fragment.append(renderDescriptionTable(block.rows));
      return;
    }
    const paragraph = document.createElement("p");
    paragraph.textContent = block.text;
    fragment.append(paragraph);
  });

  descriptionDialogBody.append(fragment);
  descriptionDialogBody.scrollTop = 0;
  descriptionDialog.showModal();
}

function renderDescriptionTable(rows) {
  const wrapper = document.createElement("div");
  wrapper.className = "description-table-wrap";
  const table = document.createElement("table");
  table.className = "description-content-table";
  const [headerRow = [], ...bodyRows] = Array.isArray(rows) ? rows : [];

  if (headerRow.length) {
    const head = document.createElement("thead");
    const row = document.createElement("tr");
    headerRow.forEach((value) => {
      const cell = document.createElement("th");
      cell.scope = "col";
      cell.textContent = value;
      row.append(cell);
    });
    head.append(row);
    table.append(head);
  }

  const body = document.createElement("tbody");
  bodyRows.forEach((values) => {
    const row = document.createElement("tr");
    values.forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.append(cell);
    });
    body.append(row);
  });
  table.append(body);
  wrapper.append(table);
  return wrapper;
}

function formatTimestamp(timestamp) {
  if (!timestamp) return "时间同步中";
  const date = typeof timestamp.toDate === "function" ? timestamp.toDate() : new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false
  }).format(date);
}

function buildCsv() {
  const rows = [
    ["提交时间", "姓名", "结果", "解析标题"],
    ...submissionRows.map((item) => [
      formatTimestamp(item.submittedAt),
      item.name || "",
      item.result || "",
      window.MBTI_DESCRIPTIONS?.[item.result]?.title || "暂无解析"
    ])
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

async function copyCsv() {
  if (!submissionRows.length) {
    showToast("当前没有可复制的数据。");
    return;
  }
  const csv = buildCsv();
  try {
    await navigator.clipboard.writeText(csv);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = csv;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
  showToast("CSV 数据已复制到剪切板。");
}

function downloadCsv() {
  if (!submissionRows.length) {
    showToast("当前没有可导出的数据。");
    return;
  }
  const blob = new Blob(["\ufeff", buildCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const date = new Date().toISOString().slice(0, 10);
  link.href = url;
  link.download = `MBTI-测试结果-${date}.csv`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("CSV 文件已导出，可直接使用 Excel 打开。");
}

function saveSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({
      participantName, answers, currentQuestion, currentResult, submitted
    }));
  } catch (error) {
    console.warn("无法保存答题进度：", error);
  }
}

function restoreSession() {
  try {
    const data = JSON.parse(sessionStorage.getItem(SESSION_KEY));
    if (!data || typeof data.participantName !== "string" || !Array.isArray(data.answers)) return;
    if (data.answers.length !== QUESTIONS.length) return;
    participantName = data.participantName;
    answers = data.answers.map((answer) => answer === "A" || answer === "B" ? answer : null);
    currentQuestion = Math.min(Math.max(Number(data.currentQuestion) || 0, 0), QUESTIONS.length - 1);
    currentResult = typeof data.currentResult === "string" ? data.currentResult : "";
    submitted = Boolean(data.submitted);
    if (currentResult && answers.every(Boolean)) finishTest();
    else if (participantName && answers.some(Boolean)) {
      showView("test");
      renderQuestion();
    }
  } catch {
    sessionStorage.removeItem(SESSION_KEY);
  }
  if (window.location.hash === "#admin") showAdmin(false);
}

function showToast(message) {
  const toast = document.querySelector("#toast");
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
}
