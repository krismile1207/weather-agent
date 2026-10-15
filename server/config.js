import "dotenv/config";

const defaultOllamaBaseUrl =
  process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1";
const defaultOllamaModel = process.env.OLLAMA_MODEL || "qwen3.5:4b";

const defaultModels = [
  {
    // 使用稳定 ID，切换本地模型后已有会话仍能继续使用当前配置。
    id: "ollama-local",
    label: `Ollama · ${defaultOllamaModel}`,
    model: defaultOllamaModel,
    description: "本地推理 · 无需 API Key",
    provider: "ollama",
    baseURL: defaultOllamaBaseUrl,
  },
];

function parseModelCatalog(rawValue) {
  if (!rawValue) return defaultModels;

  try {
    const catalog = JSON.parse(rawValue);
    if (!Array.isArray(catalog) || catalog.length === 0) {
      throw new Error("必须是非空数组");
    }
    return catalog.map((item) => {
      const provider = item.provider || "openai-compatible";
      if (!item.id || !item.label || !item.model) {
        throw new Error("每个模型都必须包含 id、label、model");
      }
      if (provider !== "ollama" && !item.apiKeyEnv) {
        throw new Error("非 Ollama 模型必须包含 apiKeyEnv");
      }
      return {
        ...item,
        provider,
        // 自定义 Ollama 模型可以只改 model，未声明地址时复用统一的本地服务地址。
        baseURL:
          item.baseURL ||
          (provider === "ollama" ? defaultOllamaBaseUrl : undefined),
      };
    });
  } catch (error) {
    throw new Error(`MODEL_CATALOG_JSON 配置无效：${error.message}`);
  }
}

export const config = {
  port: Number(process.env.PORT || 3001),
  webOrigin: process.env.WEB_ORIGIN || "http://localhost:5173",
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET,
  nodeEnv: process.env.NODE_ENV || "development",
  openAIBaseUrl: process.env.OPENAI_BASE_URL || undefined,
  models: parseModelCatalog(process.env.MODEL_CATALOG_JSON),
};

export function validateConfig() {
  const missing = [];
  if (!config.databaseUrl) missing.push("DATABASE_URL");
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    missing.push("JWT_SECRET（至少 32 位）");
  }

  if (missing.length > 0) {
    throw new Error(`缺少必要环境变量：${missing.join("、")}`);
  }
}

export function getModelConfig(modelId) {
  const selected = config.models.find((item) => item.id === modelId);
  if (!selected) throw new Error("不支持所选模型");
  return selected;
}

export function getPublicModels() {
  return config.models.map(
    ({ id, label, description, provider, apiKeyEnv }) => ({
    id,
    label,
    description: description || "",
      // Ollama 无需真实 API Key；服务连通性在实际推理时由后端校验。
      configured:
        provider === "ollama" || Boolean(apiKeyEnv && process.env[apiKeyEnv]),
    }),
  );
}
