import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AuthGuard } from "./auth.guard.js";
import { AuthService } from "./auth.service.js";
import { CurrentUser } from "./current-user.decorator.js";
import type { AuthenticatedUser, CredentialsInput } from "./auth.types.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() input: CredentialsInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    const validationError = this.authService.validateCredentials(input, true);
    if (validationError) throw new BadRequestException(validationError);
    const user = await this.authService.register(input);
    this.authService.setSessionCookie(response, user);
    return { user };
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() input: CredentialsInput,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ user: AuthenticatedUser }> {
    const validationError = this.authService.validateCredentials(input, false);
    if (validationError) throw new BadRequestException(validationError);
    const user = await this.authService.verify(input);
    if (!user) throw new UnauthorizedException("邮箱或密码不正确");
    this.authService.setSessionCookie(response, user);
    return { user };
  }

  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Res({ passthrough: true }) response: Response): void {
    this.authService.clearSessionCookie(response);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@CurrentUser() user: AuthenticatedUser): { user: AuthenticatedUser } {
    return { user };
  }
}
