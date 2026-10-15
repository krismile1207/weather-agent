import path from "node:path";
import { Module } from "@nestjs/common";
import { ServeStaticModule } from "@nestjs/serve-static";
import { AgentModule } from "./agent/agent.module.js";
import { AuthModule } from "./auth/auth.module.js";
import { ChatModule } from "./chat/chat.module.js";
import { config } from "./config.js";
import { ConversationsModule } from "./conversations/conversations.module.js";
import { DatabaseModule } from "./database/database.module.js";
import { HealthModule } from "./health/health.module.js";
import { ModelsModule } from "./models/models.module.js";

const productionModules = config.nodeEnv === "production"
  ? [
      ServeStaticModule.forRoot({
        rootPath: path.resolve(process.cwd(), "dist"),
        // API 404 必须继续由 Nest 处理，不能回退为前端 index.html。
        exclude: /^\/api(?:\/|$)/,
      }),
    ]
  : [];

@Module({
  imports: [
    DatabaseModule,
    AgentModule,
    AuthModule,
    ConversationsModule,
    ChatModule,
    ModelsModule,
    HealthModule,
    ...productionModules,
  ],
})
export class AppModule {}
