import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AgentService } from "../agent/agent.service.js";
import { AuthGuard } from "../auth/auth.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import type { AuthenticatedUser } from "../auth/auth.types.js";
import { ApiException, ResultCode } from "../common/api-response.js";
import type { Conversation, CreateConversationInput } from "./conversation.types.js";
import { ConversationsService } from "./conversations.service.js";

@Controller("conversations")
@UseGuards(AuthGuard)
export class ConversationsController {
  constructor(
    private readonly conversations: ConversationsService,
    private readonly agent: AgentService,
  ) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<{ conversations: Conversation[] }> {
    return { conversations: await this.conversations.list(user.id) };
  }

  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() input: CreateConversationInput,
  ): Promise<{ conversation: Conversation }> {
    return { conversation: await this.conversations.create(user.id, input?.modelId) };
  }

  @Get(":id/messages")
  async messages(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<{ messages: unknown[] }> {
    const conversation = await this.conversations.findOwned(user.id, id);
    if (!conversation) {
      throw new ApiException(
        ResultCode.NOT_FOUND,
        "对话不存在",
      );
    }
    return { messages: await this.agent.getMessages(user.id, conversation.id) };
  }
}
