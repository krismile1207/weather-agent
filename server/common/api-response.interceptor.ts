import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import type { Response } from "express";
import type { Observable } from "rxjs";
import { map } from "rxjs/operators";
import {
  createSuccessResponse,
  getRequestId,
  ResultCode,
  type ApiSuccessResponse,
  type RequestWithId,
} from "./api-response.js";

@Injectable()
export class ApiResponseInterceptor<T>
implements NestInterceptor<T, ApiSuccessResponse<T | null>> {
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiSuccessResponse<T | null>> {
    const http = context.switchToHttp();
    const request = http.getRequest<RequestWithId>();
    const response = http.getResponse<Response>();

    // 成功状态统一在此设置，Controller 不再分别维护 200、201 或 204。
    response.status(ResultCode.SUCCESS);
    return next.handle().pipe(
      map((data) => createSuccessResponse(data ?? null, getRequestId(request))),
    );
  }
}
