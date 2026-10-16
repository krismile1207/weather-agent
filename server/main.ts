import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { NextFunction, Response } from "express";
import cookieParser from "cookie-parser";
import express from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { AppModule } from "./app.module.js";
import {
  ResultCode,
  attachRequestId,
  createErrorResponse,
  getRequestId,
  type RequestWithId,
} from "./common/api-response.js";
import { config, validateConfig } from "./config.js";

async function bootstrap(): Promise<void> {
  validateConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    abortOnError: false,
    bodyParser: false,
  });

  app.setGlobalPrefix("api");
  app.enableCors({
    origin: config.webOrigin,
    credentials: true,
    exposedHeaders: ["X-Request-Id"],
  });
  app.enableShutdownHooks();

  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.set("trust proxy", 1);
  app.use((request: RequestWithId, response: Response, next: NextFunction) => {
    attachRequestId(request, response);
    next();
  });
  app.use(helmet({ contentSecurityPolicy: config.nodeEnv === "production" ? undefined : false }));
  app.use(express.json({ limit: "32kb" }));
  app.use(cookieParser());

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (request, response) => {
      const requestId = getRequestId(request as RequestWithId);
      response.status(ResultCode.TOO_MANY_REQUESTS).json(
        createErrorResponse(
          ResultCode.TOO_MANY_REQUESTS,
          "认证请求过于频繁，请稍后重试",
          requestId,
        ),
      );
    },
  });
  const chatLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (request, response) => {
      const requestId = getRequestId(request as RequestWithId);
      response.status(ResultCode.TOO_MANY_REQUESTS).json(
        createErrorResponse(
          ResultCode.TOO_MANY_REQUESTS,
          "聊天请求过于频繁，请稍后重试",
          requestId,
        ),
      );
    },
  });
  // 全局前缀不会改写底层 Express 的 URL，因此限流器使用浏览器实际请求路径。
  app.use("/api/auth/register", authLimiter);
  app.use("/api/auth/login", authLimiter);
  app.use("/api/chat", chatLimiter);

  await app.listen(config.port);
  Logger.log(`天气 Agent API 已启动：http://localhost:${config.port}`, "Bootstrap");
}

await bootstrap();
