import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthService, SESSION_COOKIE_NAME } from "./auth.service.js";
import type { AuthenticatedRequest } from "./auth.types.js";

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const request = http.getRequest<AuthenticatedRequest>();
    const response = http.getResponse<Response>();
    const token = request.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token !== "string" || !token) throw new UnauthorizedException("请先登录");

    try {
      // 用户 ID 只信任服务端验签结果，避免客户端通过请求体越权读取他人记忆。
      request.user = this.authService.verifySession(token);
      return true;
    } catch {
      this.authService.clearSessionCookie(response);
      throw new UnauthorizedException("登录状态已失效，请重新登录");
    }
  }
}
