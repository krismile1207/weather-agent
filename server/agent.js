import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { MessagesAnnotation, StateGraph, START, END } from "@langchain/langgraph";
import { tool } from "langchain";
import { z } from "zod";
import { config, getModelConfig } from "./config.js";
import { fetchWeather } from "./weather.js";

const weatherTool = tool(
  async ({ location, days }) => JSON.stringify(await fetchWeather({ location, days })),
  {
    name: "get_weather",
    description: "查询全球城市或地区的实时天气与未来 1～7 天预报。涉及天气、温度、降水、出行穿衣时必须调用。",
    schema: z.object({
      location: z.string().min(1).describe("城市、区县或可识别的地点名称"),
      days: z.number().int().min(1).max(7).default(5).describe("需要预报的天数，1～7"),
    }),
  },
);

const rememberTool = tool(
  async () => "记忆已保存",
  {
    name: "remember_user_preference",
    description: "保存用户明确要求记住的姓名或昵称，以及未来可复用的稳定偏好或常用地点。姓名和昵称必须使用 preferred_name 分类。不要保存临时信息或敏感信息。",
    schema: z.object({
      content: z.string().min(1).max(500).describe("简洁、独立、可长期复用的记忆内容"),
      category: z
        .enum([
          "preferred_name",
          "home_location",
          "travel_preference",
          "clothing_preference",
          "other",
        ])
        .describe("姓名或昵称必须选择 preferred_name"),
    }),
  },
);

const modelCache = new Map();

function getChatModel(modelId) {
  if (modelCache.has(modelId)) return modelCache.get(modelId);
  const selected = getModelConfig(modelId);
  const isOllama = selected.provider === "ollama";
  // OpenAI 兼容客户端要求 apiKey 字段；Ollama 不鉴权，因此使用不会外发的占位值。
  const apiKey = isOllama ? "ollama" : process.env[selected.apiKeyEnv];
  if (!apiKey) {
    const error = new Error(`${selected.label} 尚未配置 API Key`);
    error.status = 503;
    throw error;
  }

  const model = new ChatOpenAI({
    model: selected.model,
    apiKey,
    temperature: 0.2,
    streaming: true,
    // 本地模型首次加载可能较慢，给予比云端请求更宽裕的超时时间。
    timeout: isOllama ? 120_000 : 30_000,
    maxRetries: 1,
    configuration: {
      baseURL: selected.baseURL || config.openAIBaseUrl,
    },
  }).bindTools([weatherTool, rememberTool]);
  modelCache.set(modelId, model);
  return model;
}

function isPreferredNameMemory({ content, category }) {
  if (category === "preferred_name") return true;
  return /姓名|名字|昵称|称呼|叫我|称为|name\s+is|call\s+me/i.test(String(content || ""));
}

export function normalizeMemoryInput(input) {
  return {
    ...input,
    // 小模型偶尔会把姓名错分为 other；服务端根据语义纠正，确保跨会话读取稳定。
    category: isPreferredNameMemory(input) ? "preferred_name" : input.category,
  };
}

function formatMemories(memories) {
  if (memories.length === 0) return "暂无长期记忆。";
  return memories
    .map((memory, index) => {
      const category = isPreferredNameMemory(memory) ? "preferred_name" : memory.category;
      return `${index + 1}. [${category || "other"}] ${memory.content}`;
    })
    .join("\n");
}

function extractText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return String(content || "");
  return content
    .filter((item) => item?.type === "text")
    .map((item) => item.text)
    .join("\n");
}

export function createWeatherGraph({ checkpointer, store, memoryAdapter }) {
  async function callModel(state, runnableConfig) {
    const userId = runnableConfig.configurable.user_id;
    const modelId = runnableConfig.configurable.model_id;
    const memories = await memoryAdapter.list(userId);
    const systemPrompt = `你是“云迹”，一个严谨、友好的中文天气助手。

工作规则：
1. 天气问题必须调用 get_weather，不得凭空编造实时数据。
2. 回答应先给结论，再给温度、降水、风等关键依据；涉及出行时给可执行建议。
3. 时间和日期以天气工具返回地点的本地时区为准。
4. 用户用“记住”“以后叫我”等方式明确要求保存姓名、昵称、常住地、穿衣或出行偏好时，必须调用 remember_user_preference，不能只在文字中确认。姓名或昵称使用 preferred_name 分类，并把内容写成“用户希望被称为 Bob”这类可独立理解的表述。
5. 用户主动提供且明确要求记住的姓名或昵称允许保存；不得保存身份证号、账号密码、联系方式、健康信息等敏感信息，也不要保存临时行程。
6. 工具结果已确认保存时应直接答复，不得重复调用记忆工具。长期记忆清单是服务端提供的可信上下文；回答“我叫什么”等问题时，只要清单中有 preferred_name 或明确写有姓名、名字、昵称、称呼的旧记录，就必须直接据此回答，不得声称无法获取。
7. 不把长期记忆说成绝对事实；若与用户当前表达冲突，以当前表达为准。

该用户的长期记忆：
${formatMemories(memories)}`;

    const response = await getChatModel(modelId).invoke([
      new SystemMessage(systemPrompt),
      ...state.messages,
    ]);
    return { messages: [response] };
  }

  async function executeTools(state, runnableConfig) {
    const lastMessage = state.messages.at(-1);
    const toolCalls = lastMessage.tool_calls || [];
    const results = [];

    for (const toolCall of toolCalls) {
      try {
        let result;
        if (toolCall.name === "get_weather") {
          result = await weatherTool.invoke(toolCall.args);
        } else if (toolCall.name === "remember_user_preference") {
          const saved = await memoryAdapter.save(
            runnableConfig.configurable.user_id,
            normalizeMemoryInput(toolCall.args),
          );
          const action = saved.updated ? "已更新" : saved.created ? "已保存" : "已存在";
          result = `${action}长期记忆：${saved.content}`;
        } else {
          result = `未知工具：${toolCall.name}`;
        }
        results.push(new ToolMessage({ content: String(result), tool_call_id: toolCall.id }));
      } catch (error) {
        // 工具失败要作为可恢复信息返回模型，由模型向用户解释，而不是让整轮会话崩溃。
        results.push(new ToolMessage({
          content: `工具调用失败：${error.message}`,
          tool_call_id: toolCall.id,
        }));
      }
    }
    return { messages: results };
  }

  function routeAfterModel(state) {
    const lastMessage = state.messages.at(-1);
    return lastMessage?.tool_calls?.length ? "tools" : END;
  }

  return new StateGraph(MessagesAnnotation)
    .addNode("agent", callModel)
    .addNode("tools", executeTools)
    .addEdge(START, "agent")
    .addConditionalEdges("agent", routeAfterModel, ["tools", END])
    .addEdge("tools", "agent")
    .compile({ checkpointer, store });
}

export async function* streamWeatherAgent(
  graph,
  { userId, conversationId, modelId, message, signal },
) {
  const stream = await graph.stream(
    { messages: [new HumanMessage(message)] },
    {
      configurable: {
        // 组合用户与会话 ID，形成第二道租户隔离，防止不同用户碰巧使用同一会话 ID。
        thread_id: `${userId}:${conversationId}`,
        user_id: userId,
        model_id: modelId,
      },
      recursionLimit: 10,
      streamMode: "messages",
      signal,
    },
  );

  for await (const [messageChunk, metadata] of stream) {
    // 仅把 agent 的最终自然语言片段发给前端，隐藏工具调用参数和工具执行结果。
    if (metadata.langgraph_node !== "agent" || messageChunk.getType() !== "ai") {
      continue;
    }
    if (messageChunk.tool_calls?.length || messageChunk.tool_call_chunks?.length) {
      continue;
    }
    const text = extractText(messageChunk.content);
    if (text) yield text;
  }
}

export async function invokeWeatherAgent(graph, options) {
  let reply = "";
  for await (const chunk of streamWeatherAgent(graph, options)) reply += chunk;
  return reply;
}

export async function getConversationMessages(graph, { userId, conversationId }) {
  const snapshot = await graph.getState({
    configurable: { thread_id: `${userId}:${conversationId}` },
  });
  return (snapshot.values?.messages || [])
    .filter((message) => ["human", "ai"].includes(message.getType()))
    .filter((message) => message.getType() !== "ai" || !message.tool_calls?.length)
    .map((message) => ({
      id: message.id,
      role: message.getType() === "human" ? "user" : "assistant",
      content: extractText(message.content),
    }))
    .filter((message) => message.content);
}
