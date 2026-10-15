import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PostgresStore } from "@langchain/langgraph-checkpoint-postgres/store";
import { config } from "../config.js";
import {
  createWeatherGraph,
  getConversationMessages,
  streamWeatherAgent,
} from "../agent.js";
import { PostgresMemoryAdapter } from "../memoryAdapter.js";

/** 流式调用 Agent 所需的租户、会话和模型上下文。 */
export interface StreamAgentInput {
  /** 经服务端 JWT 验签得到的用户 ID。 */
  userId: string;
  /** 已校验归属于当前用户的会话 ID。 */
  conversationId: string;
  /** 服务端模型目录中的模型 ID。 */
  modelId: string;
  /** 长度已经过控制器校验的用户消息。 */
  message: string;
  /** 浏览器断开连接时用于终止本地推理。 */
  signal: AbortSignal | undefined;
}

@Injectable()
export class AgentService implements OnModuleInit, OnApplicationShutdown {
  private checkpointer: PostgresSaver | null = null;
  private store: PostgresStore | null = null;
  private graph: ReturnType<typeof createWeatherGraph> | null = null;

  async onModuleInit(): Promise<void> {
    // validateConfig 会在 Nest 创建模块前执行；这里的断言只补足 JS 配置模块的静态类型。
    const databaseUrl = config.databaseUrl as string;
    this.checkpointer = PostgresSaver.fromConnString(databaseUrl);
    this.store = PostgresStore.fromConnString(databaseUrl);
    // 两种迁移都具备幂等性：Checkpointer 保存会话状态，Store 保存跨会话长期记忆。
    await this.checkpointer.setup();
    await this.store.setup();
    const memoryAdapter = new PostgresMemoryAdapter(this.store);
    this.graph = createWeatherGraph({
      checkpointer: this.checkpointer,
      store: this.store,
      memoryAdapter,
    });
  }

  stream(input: StreamAgentInput): AsyncGenerator<string> {
    return streamWeatherAgent(this.getGraph(), input);
  }

  getMessages(userId: string, conversationId: string): Promise<unknown[]> {
    return getConversationMessages(this.getGraph(), { userId, conversationId });
  }

  async onApplicationShutdown(): Promise<void> {
    const storeWithStop = this.store as (PostgresStore & { stop?: () => Promise<void> }) | null;
    await Promise.allSettled([
      this.checkpointer?.end(),
      storeWithStop?.stop?.(),
    ]);
  }

  private getGraph(): ReturnType<typeof createWeatherGraph> {
    if (!this.graph) throw new Error("Agent 尚未完成初始化");
    return this.graph;
  }
}
