import { Module } from "@nestjs/common";
import { AgentModule } from "../agent/agent.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { ConversationsController } from "./conversations.controller.js";
import { ConversationsService } from "./conversations.service.js";

@Module({
  imports: [AuthModule, AgentModule],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  exports: [ConversationsService],
})
export class ConversationsModule {}
