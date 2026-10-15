import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ConversationsModule } from "../conversations/conversations.module.js";
import { ChatController } from "./chat.controller.js";

@Module({
  imports: [AuthModule, AgentModule, ConversationsModule],
  controllers: [ChatController],
})
export class ChatModule {}
