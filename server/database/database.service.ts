import { Injectable, OnApplicationShutdown, OnModuleInit } from "@nestjs/common";
import pg, { type QueryResult, type QueryResultRow } from "pg";
import { config } from "../config.js";

const { Pool } = pg;

@Injectable()
export class DatabaseService implements OnModuleInit, OnApplicationShutdown {
  readonly pool = new Pool({
    connectionString: config.databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
  });

  async onModuleInit(): Promise<void> {
    // 业务表与 LangGraph 自动维护的表分开，方便后续独立迁移和审计。
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id UUID PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS weather_threads (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        title TEXT NOT NULL DEFAULT '新的天气对话',
        model_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS weather_threads_user_updated_idx
        ON weather_threads(user_id, updated_at DESC);
    `);
  }

  query<Row extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<Row>> {
    return this.pool.query<Row>(text, [...values]);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
