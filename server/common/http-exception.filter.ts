import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import {
  createErrorResponse,
  getRequestId,
  resolveApiError,
  type RequestWithId,
} from "./api-response.js";

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();
    const error = resolveApiError(exception);
    const requestId = getRequestId(request);

    if (error.status >= 500) {
      const detail = exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`[${requestId}] ${request.method} ${request.originalUrl}\n${detail}`);
    }
    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(error.status).json(
      createErrorResponse(error.code, error.msg, requestId),
    );
  }
}
