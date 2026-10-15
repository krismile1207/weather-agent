import crypto from "node:crypto";
import {
  ConflictException,
  Injectable,
} from "@nestjs/common";
import bcrypt from "bcryptjs";
import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Response } from "express";
import { config } from "../config.js";
import { DatabaseService } from "../database/database.service.js";
import type { AuthenticatedUser, CredentialsInput } from "./auth.types.js";

export const SESSION_COOKIE_NAME = "weather_agent_session";

interface UserRow extends AuthenticatedUser {
  password_hash: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly database: DatabaseService) {}

  validateCredentials(input: CredentialsInput, isRegistration = false): string | null {
    const email = this.normalizeEmail(input.email);
    const password = String(input.password || "");
    const name = String(input.name || "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "请输入有效的邮箱地址";
    if (password.length < 8 || password.length > 72) return "密码长度需为 8～72 位";
    if (isRegistration && (name.length < 2 || name.length > 30)) {
      return "昵称长度需为 2～30 位";
    }
    return null;
  }

  async register(input: CredentialsInput): Promise<AuthenticatedUser> {
    const id = crypto.randomUUID();
    const email = this.normalizeEmail(input.email);
    const name = String(input.name || "").trim();
    const passwordHash = await bcrypt.hash(String(input.password || ""), 12);

    try {
      const result = await this.database.query<AuthenticatedUser>(
        `INSERT INTO app_users (id, email, name, password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, email, name`,
        [id, email, name, passwordHash],
      );
      return result.rows[0];
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
        throw new ConflictException("该邮箱已注册");
      }
      throw error;
    }
  }

  async verify(input: CredentialsInput): Promise<AuthenticatedUser | null> {
    const result = await this.database.query<UserRow>(
      "SELECT id, email, name, password_hash FROM app_users WHERE email = $1",
      [this.normalizeEmail(input.email)],
    );
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(String(input.password || ""), user.password_hash))) {
      return null;
    }
    return { id: user.id, email: user.email, name: user.name };
  }

  setSessionCookie(response: Response, user: AuthenticatedUser): void {
    const token = jwt.sign(
      { sub: user.id, email: user.email, name: user.name },
      config.jwtSecret as string,
      { expiresIn: "7d", issuer: "weather-memory-agent", audience: "weather-agent-web" },
    );
    response.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: config.nodeEnv === "production",
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: "/",
    });
  }

  clearSessionCookie(response: Response): void {
    response.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  }

  verifySession(token: string): AuthenticatedUser {
    const payload = jwt.verify(token, config.jwtSecret as string, {
      issuer: "weather-memory-agent",
      audience: "weather-agent-web",
    });
    if (typeof payload === "string") throw new Error("登录凭证格式无效");
    return this.toUser(payload);
  }

  private normalizeEmail(email: unknown): string {
    return String(email || "").trim().toLowerCase();
  }

  private toUser(payload: JwtPayload): AuthenticatedUser {
    if (!payload.sub || typeof payload.email !== "string" || typeof payload.name !== "string") {
      throw new Error("登录凭证缺少用户信息");
    }
    return { id: payload.sub, email: payload.email, name: payload.name };
  }
}
