"use strict";

const assert = require("node:assert/strict");

const port = process.argv[2] || "9223";
const pageUrl = process.argv[3] || "http://127.0.0.1:8765/";

class CdpClient {
  constructor(socketUrl) {
    this.socket = new WebSocket(socketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject, timer } = this.pending.get(message.id);
        clearTimeout(timer);
        this.pending.delete(message.id);
        if (message.error) reject(new Error(message.error.message));
        else resolve(message.result);
        return;
      }
      const callbacks = this.listeners.get(message.method) || [];
      callbacks.splice(0).forEach((callback) => callback(message.params));
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  once(method) {
    return new Promise((resolve) => {
      const callbacks = this.listeners.get(method) || [];
      callbacks.push(resolve);
      this.listeners.set(method, callbacks);
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(client, expression) {
  const response = await client.call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) {
    throw new Error(response.exceptionDetails.exception?.description || "Browser evaluation failed");
  }
  return response.result.value;
}

async function main() {
  const targetResponse = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`,
    { method: "PUT" }
  );
  assert.equal(targetResponse.ok, true, "Chrome debugging target could not be created");
  const target = await targetResponse.json();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();

  try {
    await client.call("Page.enable");
    await client.call("Runtime.enable");
    const loaded = client.once("Page.loadEventFired");
    await client.call("Page.navigate", { url: pageUrl });
    await loaded;

    const desktop = await evaluate(client, `(() => {
      submissionRows = [{
        submittedAt: "2026-08-28T03:00:00.000Z",
        name: "测试用户",
        result: "INTJ"
      }];
      renderSubmissionTable();
      const button = document.querySelector('[data-mbti-type="INTJ"]');
      button.click();
      const dialog = document.querySelector('#description-dialog');
      return {
        buttonText: button.textContent,
        open: dialog.open,
        type: document.querySelector('#description-dialog-type').textContent,
        title: document.querySelector('#description-dialog-title').textContent,
        subtitle: document.querySelector('#description-dialog-subtitle').textContent,
        sectionHeadings: [...dialog.querySelectorAll('h3')].map((item) => item.textContent),
        paragraphCount: dialog.querySelectorAll('.description-dialog-body > p').length,
        tableCount: dialog.querySelectorAll('.description-content-table').length,
        firstTableText: dialog.querySelector('.description-content-table').textContent,
      };
    })()`);

    assert.equal(desktop.buttonText, "查看解析");
    assert.equal(desktop.open, true);
    assert.equal(desktop.type, "INTJ");
    assert.equal(desktop.title, "建筑师型人格");
    assert.match(desktop.subtitle, /Architect Personality/);
    assert.ok(desktop.sectionHeadings.includes("人格特征"));
    assert.ok(desktop.sectionHeadings.includes("职业规划"));
    assert.ok(desktop.paragraphCount > 20);
    assert.equal(desktop.tableCount, 2);
    assert.match(desktop.firstTableText, /人物或角色/);

    const closed = await evaluate(client, `(() => {
      document.querySelector('#description-dialog-close').click();
      return document.querySelector('#description-dialog').open;
    })()`);
    assert.equal(closed, false);

    await client.call("Emulation.setDeviceMetricsOverride", {
      width: 375,
      height: 812,
      deviceScaleFactor: 1,
      mobile: true,
    });
    const mobile = await evaluate(client, `new Promise((resolve) => {
      openDescription("ENFP");
      requestAnimationFrame(() => {
        const dialog = document.querySelector('#description-dialog');
        const rect = dialog.getBoundingClientRect();
        resolve({
          open: dialog.open,
          title: document.querySelector('#description-dialog-title').textContent,
          width: rect.width,
          height: rect.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        });
      });
    })`);
    assert.equal(mobile.open, true);
    assert.equal(mobile.title, "竞选者型人格");
    assert.ok(mobile.width <= mobile.viewportWidth - 20);
    assert.ok(mobile.height <= mobile.viewportHeight * 0.94);

    console.log(JSON.stringify({ desktop, mobile }, null, 2));
  } finally {
    await client.call("Page.close").catch(() => undefined);
    client.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
