import crypto from "node:crypto";
import { Injectable } from "@nestjs/common";
import { ApiException, ResultCode } from "../common/api-response.js";
import { config, getModelConfig } from "../config.js";
import { DatabaseService } from "../database/database.service.js";
import type { Conversation } from "./conversation.types.js";

@Injectable()
export class ConversationsService {
  constructor(private readonly database: DatabaseService) {}

  async list(userId: string): Promise<Conversation[]> {
    const result = await this.database.query<Conversation>(
      `SELECT id, title, model_id AS "modelId", created_at AS "createdAt", updated_at AS "updatedAt"
       FROM weather_threads WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50`,
      [userId],
    );
    return result.rows;
  }

  async create(userId: string, requestedModelId: unknown): Promise<Conversation> {
    const modelId = String(requestedModelId || config.models[0].id);
    this.assertSupportedModel(modelId);
    const result = await this.database.query<Conversation>(
      `INSERT INTO weather_threads (id, user_id, model_id)
       VALUES ($1, $2, $3)
       RETURNING id, title, model_id AS "modelId", created_at AS "createdAt", updated_at AS "updatedAt"`,
      [crypto.randomUUID(), userId, modelId],
    );
    return result.rows[0];
  }

  async findOwned(userId: string, conversationId: string): Promise<Conversation | null> {
    const result = await this.database.query<Conversation>(
      `SELECT id, title, model_id AS "modelId"
       FROM weather_threads WHERE id = $1 AND user_id = $2`,
      [conversationId, userId],
    );
    return result.rows[0] || null;
  }

  async updateAfterChat(
    userId: string,
    conversationId: string,
    title: string,
    modelId: string,
  ): Promise<void> {
    await this.database.query(
      `UPDATE weather_threads SET title = $1, model_id = $2, updated_at = NOW()
       WHERE id = $3 AND user_id = $4`,
      [title, modelId, conversationId, userId],
    );
  }

  assertSupportedModel(modelId: string): void {
    try {
      getModelConfig(modelId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "不支持所选模型";
      throw new ApiException(ResultCode.BAD_REQUEST, message);
    }
  }
}
