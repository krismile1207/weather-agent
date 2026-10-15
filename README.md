# 云迹天气 Agent

一个可直接运行的全栈天气对话 Agent：前端使用 React + Ant Design，后端使用 NestJS + TypeScript + LangChain + LangGraph，只有登录用户可以使用。会话状态和按用户 ID 隔离的长期记忆均保存在 PostgreSQL。

## 功能

- 邮箱注册、登录、退出，密码使用 bcrypt 加密，登录凭证放在 HttpOnly Cookie 中。
- 默认使用本机 Ollama 模型，可在前端切换通过环境变量扩展的其他本地模型。
- 查询全球地点的实时天气与未来 1～7 天预报，无需额外天气 API Key。
- 对话回答使用 NDJSON 流式传输，Ollama 生成内容时前端实时追加显示。
- LangGraph Checkpointer 保存每个会话的上下文。
- LangGraph `PostgresStore` 作为长期记忆适配器，以 `userId` 命名空间隔离记忆。
- 自动记住用户明确要求保存的姓名、昵称、常住地、穿衣和出行偏好，并在新会话中复用。
- 响应式桌面/移动端界面、历史会话列表、Markdown 回答。

## 技术结构

```text
React + Ant Design
        │ HttpOnly Cookie / JSON API
NestJS（Auth / Conversations / Chat / Agent）+ JWT
        │
LangGraph StateGraph ── LangChain ── 本机 Ollama ── Open-Meteo 工具
        │
PostgresSaver（短期会话） + PostgresStore（长期记忆）
        │
PostgreSQL（用户、会话索引、图状态、长期记忆）
```

## 本地启动

需要 Node.js 20+、Docker，以及已启动的 Ollama。本项目默认使用支持工具调用的 `qwen3.5:4b`。

1. 创建环境变量：

   ```bash
   cp .env.example .env
   ```

   Windows PowerShell：

   ```powershell
   Copy-Item .env.example .env
   ```

2. 编辑 `.env`：

   - 把 `JWT_SECRET` 改成至少 32 位的随机字符串。
   - `OLLAMA_BASE_URL` 默认为 `http://127.0.0.1:11434/v1`。
   - `OLLAMA_MODEL` 填写本机已下载且支持工具调用的模型名。

3. 下载本地模型：

   ```bash
   ollama pull qwen3.5:4b
   ```

4. 启动 PostgreSQL 并安装依赖：

   ```bash
   docker compose up -d
   npm install
   ```

   项目数据库使用宿主机端口 `5434`，避免与本机已有 PostgreSQL 的默认 `5432` 端口冲突。

5. 启动开发环境：

   ```bash
   npm run dev
   ```

   浏览器打开 <http://localhost:5173>。

## 生产运行

```bash
npm run build
NODE_ENV=production npm start
```

Windows PowerShell：

```powershell
npm run build
$env:NODE_ENV = "production"
npm start
```

生产环境由 NestJS 的 Express 适配器同时提供 API 与 `dist` 静态文件。部署时应使用 HTTPS，并确保 NestJS 能访问 `OLLAMA_BASE_URL`；同时把 `WEB_ORIGIN`、`DATABASE_URL` 和 `JWT_SECRET` 放入平台的 Secret/环境变量服务。

## 后端模块

```text
server/
├─ main.ts                 Nest 应用启动、安全中间件和限流
├─ app.module.ts           根模块与生产静态资源配置
├─ auth/                   注册、登录、JWT Cookie 与 AuthGuard
├─ conversations/          会话归属、列表、创建与历史消息
├─ chat/                   Ollama NDJSON 流式聊天接口
├─ agent/                  LangGraph 生命周期与调用门面
├─ database/               PostgreSQL 连接池与业务表初始化
├─ models/                 前端可用模型目录
├─ health/                 数据库健康检查
└─ common/                 全局异常响应转换
```

## 自定义 Ollama 模型列表

使用 `MODEL_CATALOG_JSON` 配置前端可选的多个本地模型：

```json
[
  {
    "id": "ollama-qwen-4b",
    "label": "Qwen3.5 4B",
    "model": "qwen3.5:4b",
    "description": "快速 · 本地",
    "provider": "ollama"
  },
  {
    "id": "ollama-qwen-large",
    "label": "Qwen 大模型",
    "model": "qwen3:14b",
    "description": "更强推理 · 本地",
    "provider": "ollama",
    "baseURL": "http://127.0.0.1:11434/v1"
  }
]
```

列表中的模型需要先通过 `ollama pull <模型名>` 下载。若继续接入其他 OpenAI 兼容服务，则为对应条目配置 `apiKeyEnv` 和 `baseURL` 即可。

## 记忆边界

- 会话 ID 使用 `${userId}:${conversationId}` 组合生成，避免租户间碰撞。
- 长期记忆命名空间为 `["users", userId, "memories"]`。
- `userId` 仅来自服务端 JWT 验签，不接受客户端传入。
- Agent 仅在用户明确要求时保存姓名或昵称，也可保存稳定的地点、穿衣和出行偏好；系统提示明确禁止保存证件号、账号密码、联系方式和健康信息等敏感内容。

## 验证

```bash
npm test
npm run typecheck:server
npm run build
```
