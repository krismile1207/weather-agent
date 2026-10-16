import test from "node:test";
import assert from "node:assert/strict";
import { api, streamApi } from "../src/api.js";

test("api 自动解包统一成功响应中的业务数据", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 200,
    msg: "操作成功",
    data: { status: "ok" },
    requestId: "request-success",
    timestamp: "2026-10-15T03:30:00.000Z",
  }), { status: 200, headers: { "Content-Type": "application/json" } });

  try {
    assert.deepEqual(await api("/api/health"), { status: "ok" });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("api 将 HTTP 状态、业务码和请求 ID 附加到错误对象", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    code: 401,
    msg: "请先登录",
    data: null,
    requestId: "request-error",
    timestamp: "2026-10-15T03:30:00.000Z",
  }), { status: 401, headers: { "Content-Type": "application/json" } });

  try {
    await assert.rejects(
      () => api("/api/auth/me"),
      (error) => {
        assert.equal(error.status, 401);
        assert.equal(error.code, 401);
        assert.equal(error.requestId, "request-error");
        return true;
      },
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("streamApi 保留独立的 delta 和 done 事件协议", async () => {
  const originalFetch = globalThis.fetch;
  const body = [
    JSON.stringify({ type: "delta", content: "你" }),
    JSON.stringify({ type: "delta", content: "好" }),
    JSON.stringify({
      type: "done",
      code: 200,
      title: "你好",
      requestId: "request-stream",
      timestamp: "2026-10-15T03:30:00.000Z",
    }),
    "",
  ].join("\n");
  globalThis.fetch = async () => new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/x-ndjson" },
  });

  try {
    const events = [];
    const done = await streamApi("/api/chat", {}, (event) => events.push(event));
    assert.equal(events.filter((event) => event.type === "delta").length, 2);
    assert.equal(done.code, 200);
    assert.equal(done.requestId, "request-stream");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
