import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

function getExceptionStatus(exception: unknown): number {
  if (exception instanceof HttpException) return exception.getStatus();
  if (typeof exception === "object" && exception !== null && "status" in exception) {
    const status = Number((exception as { status?: unknown }).status);
    if (Number.isInteger(status) && status >= 400 && status <= 599) return status;
  }
  return HttpStatus.INTERNAL_SERVER_ERROR;
}

/**
 * 将内部异常转换为可以安全返回给浏览器的消息。
 * @param exception Nest HTTP 异常或领域层抛出的普通异常。
 */
export function getPublicErrorMessage(exception: unknown): string {
  const status = getExceptionStatus(exception);
  let message = exception instanceof Error ? exception.message : "请求失败";

  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === "string") {
      message = response;
    } else if (typeof response === "object" && response !== null && "message" in response) {
      const value = (response as { message?: string | string[] }).message;
      message = Array.isArray(value) ? value.join("；") : value || message;
    }
  }

  return status >= 500 && !message.includes("API Key")
    ? "服务暂时不可用，请稍后重试"
    : message;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const status = getExceptionStatus(exception);

    if (status >= 500) {
      const detail = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(detail);
    }
    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(status).json({ message: getPublicErrorMessage(exception) });
  }
}
