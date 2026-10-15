import {
  BadRequestException,
  Body,
  Controller,
  Logger,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AgentService } from "../agent/agent.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { getPublicErrorMessage } from "../common/http-exception.filter.js";
import { ConversationsService } from "../conversations/conversations.service.js";
import type { ChatInput, ChatStreamEvent } from "./chat.types.js";

@Controller("chat")
@UseGuards(AuthGuard)
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(
    private readonly agent: AgentService,
    private readonly conversations: ConversationsService,
  ) {}

  @Post()
  async chat(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: ChatInput,
    @Res() response: Response,
  ): Promise<void> {
    const conversationId = String(input?.conversationId || "");
    const modelId = String(input?.modelId || "");
    const message = String(input?.message || "").trim();
    if (!message || message.length > 2000) {
      throw new BadRequestException("消息长度需为 1～2000 字");
    }
    this.conversations.assertSupportedModel(modelId);
    const conversation = await this.conversations.findOwned(user.id, conversationId);
    if (!conversation) throw new NotFoundException("对话不存在");

    const abortController = new AbortController();
    response.on("close", () => {
      // 浏览器中断请求后立即停止本地推理，避免 Ollama 继续占用算力。
      if (!response.writableEnded) abortController.abort();
    });
    response.status(200);
    response.set({
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    });
    response.flushHeaders();

    try {
      for await (const content of this.agent.stream({
        userId: user.id,
        conversationId,
        modelId,
        message,
        signal: abortController.signal,
      })) {
        this.writeEvent(response, { type: "delta", content });
      }

      // 首条消息生成标题；后续仍允许切换模型，并把选择保留在会话列表中。
      const title = conversation.title === "新的天气对话"
        ? message.replace(/\s+/g, " ").slice(0, 28)
        : conversation.title;
      await this.conversations.updateAfterChat(user.id, conversationId, title, modelId);
      this.writeEvent(response, { type: "done", title });
      response.end();
    } catch (error) {
      const detail = error instanceof Error ? error.stack : String(error);
      this.logger.error(detail);
      if (!response.writableEnded) {
        this.writeEvent(response, { type: "error", message: getPublicErrorMessage(error) });
        response.end();
      }
    }
  }

  private writeEvent(response: Response, event: ChatStreamEvent): void {
    response.write(`${JSON.stringify(event)}\n`);
  }
}
