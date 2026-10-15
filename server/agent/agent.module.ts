import { Module } from "@nestjs/common";
import { AgentService } from "./agent.service.js";

@Module({
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
