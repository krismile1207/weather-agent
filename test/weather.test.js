import test from "node:test";
import assert from "node:assert/strict";
import { fetchWeather, geocodeLocation } from "../server/weather.js";
import { PostgresMemoryAdapter } from "../server/memoryAdapter.js";
import { normalizeMemoryInput, streamWeatherAgent } from "../server/agent.js";

test("geocodeLocation 在无匹配地点时给出明确错误", async () => {
  const fakeFetch = async () => ({ ok: true, json: async () => ({ results: [] }) });
  await assert.rejects(() => geocodeLocation("不存在的地点", fakeFetch), /没有找到/);
});

test("fetchWeather 将第三方响应转换为稳定结构并限制预报天数", async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(String(url));
    if (String(url).includes("geocoding-api")) {
      return { ok: true, json: async () => ({ results: [{ name: "杭州", admin1: "浙江", country: "中国", latitude: 30.2, longitude: 120.2 }] }) };
    }
    return {
      ok: true,
      json: async () => ({
        timezone: "Asia/Shanghai",
        current: { time: "2026-10-14T12:00", temperature_2m: 24, apparent_temperature: 25, relative_humidity_2m: 60, precipitation: 0, weather_code: 0, wind_speed_10m: 8 },
        daily: { time: ["2026-10-14"], weather_code: [0], temperature_2m_max: [27], temperature_2m_min: [18], precipitation_probability_max: [10] },
      }),
    };
  };

  const result = await fetchWeather({ location: "杭州", days: 99 }, fakeFetch);
  assert.equal(result.location, "杭州，浙江，中国");
  assert.equal(result.current.condition, "晴朗");
  assert.equal(result.forecast[0].highC, 27);
  assert.match(calls[1], /forecast_days=7/);
});

test("长期记忆适配器按用户 ID 隔离命名空间", async () => {
  const records = new Map();
  const fakeStore = {
    async put(namespace, key, value) {
      records.set(`${namespace.join("/")}/${key}`, value);
    },
    async search(namespace) {
      const prefix = `${namespace.join("/")}/`;
      return [...records.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key: key.slice(prefix.length), value }));
    },
    async delete(namespace, key) {
      records.delete(`${namespace.join("/")}/${key}`);
    },
  };
  const adapter = new PostgresMemoryAdapter(fakeStore);
  await adapter.save("user-a", { content: "常住杭州", category: "home_location" });
  await adapter.save("user-b", { content: "常住北京", category: "home_location" });

  assert.deepEqual((await adapter.list("user-a")).map((item) => item.content), ["常住杭州"]);
  assert.deepEqual((await adapter.list("user-b")).map((item) => item.content), ["常住北京"]);
});

test("姓名记忆可跨会话复用，并在用户改名时替换旧称呼", async () => {
  const records = new Map();
  const fakeStore = {
    async put(namespace, key, value) {
      records.set(`${namespace.join("/")}/${key}`, value);
    },
    async search(namespace) {
      const prefix = `${namespace.join("/")}/`;
      return [...records.entries()]
        .filter(([key]) => key.startsWith(prefix))
        .map(([key, value]) => ({ key: key.slice(prefix.length), value }));
    },
    async delete(namespace, key) {
      records.delete(`${namespace.join("/")}/${key}`);
    },
  };
  const adapter = new PostgresMemoryAdapter(fakeStore);

  await adapter.save("user-a", {
    content: "用户希望被称为 Bob",
    category: "preferred_name",
  });
  const duplicate = await adapter.save("user-a", {
    content: "用户希望被称为 Bob",
    category: "preferred_name",
  });
  assert.equal(duplicate.created, false);
  assert.deepEqual((await adapter.list("user-a")).map((item) => item.content), [
    "用户希望被称为 Bob",
  ]);

  const renamed = await adapter.save("user-a", {
    content: "用户希望被称为 Alice",
    category: "preferred_name",
  });
  assert.equal(renamed.updated, true);
  assert.deepEqual((await adapter.list("user-a")).map((item) => item.content), [
    "用户希望被称为 Alice",
  ]);
});

test("模型把姓名误分类为 other 时由服务端纠正", () => {
  assert.equal(
    normalizeMemoryInput({ content: "用户名字是 Bob", category: "other" }).category,
    "preferred_name",
  );
  assert.equal(
    normalizeMemoryInput({ content: "用户偏好步行出行", category: "other" }).category,
    "other",
  );
});

test("流式 Agent 只输出最终回答片段，不暴露工具调用内容", async () => {
  let receivedOptions;
  const messageChunk = (content, extra = {}) => ({
    content,
    tool_calls: [],
    tool_call_chunks: [],
    getType: () => "ai",
    ...extra,
  });
  const fakeGraph = {
    async stream(_input, options) {
      receivedOptions = options;
      return (async function* generateChunks() {
        yield [messageChunk("工具结果"), { langgraph_node: "tools" }];
        yield [messageChunk("你"), { langgraph_node: "agent" }];
        yield [messageChunk("隐藏参数", { tool_calls: [{ name: "get_weather" }] }), { langgraph_node: "agent" }];
        yield [messageChunk("好"), { langgraph_node: "agent" }];
      })();
    },
  };

  const chunks = [];
  for await (const chunk of streamWeatherAgent(fakeGraph, {
    userId: "user-a",
    conversationId: "conversation-a",
    modelId: "ollama-local",
    message: "你好",
  })) {
    chunks.push(chunk);
  }

  assert.equal(chunks.join(""), "你好");
  assert.equal(receivedOptions.streamMode, "messages");
  assert.equal(receivedOptions.configurable.thread_id, "user-a:conversation-a");
});
