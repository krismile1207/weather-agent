import crypto from "node:crypto";
import { HttpException } from "@nestjs/common";
import type { Request, Response } from "express";

/**
 * 参考若依 HttpStatus 集中维护的数字结果码。
 * 成功接口只使用 200；失败码同时作为 HTTP 状态码和响应体 code，避免两套状态不一致。
 */
export const ResultCode = {
  SUCCESS: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  UNSUPPORTED_MEDIA_TYPE: 415,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504,
} as const;

/** 响应体允许使用的数字结果码。 */
export type ResultCodeValue = (typeof ResultCode)[keyof typeof ResultCode];

/** 除成功码以外、可用于 ApiException 的错误结果码。 */
export type ErrorResultCode = Exclude<ResultCodeValue, typeof ResultCode.SUCCESS>;

/** 普通接口成功时的统一响应结构。 */
export interface ApiSuccessResponse<T> {
  /** 固定为 200，与若依 success 响应保持一致。 */
  code: typeof ResultCode.SUCCESS;
  /** 面向用户的操作结果说明。 */
  msg: "操作成功";
  /** Controller 返回的业务数据；无数据时为 null。 */
  data: T;
  /** 单次请求的追踪 ID，同时写入 X-Request-Id 响应头。 */
  requestId: string;
  /** 服务端生成响应时的 ISO 8601 时间。 */
  timestamp: string;
}

/** 普通接口失败时的统一响应结构。 */
export interface ApiErrorResponse {
  /** 与 HTTP 错误状态保持一致的数字结果码。 */
  code: ErrorResultCode;
  /** 可以安全展示给用户的错误说明。 */
  msg: string;
  /** 错误响应不携带业务数据。 */
  data: null;
  /** 单次请求的追踪 ID，用于关联服务端日志。 */
  requestId: string;
  /** 服务端生成响应时的 ISO 8601 时间。 */
  timestamp: string;
}

/** 经过请求 ID 中间件扩展后的 Express Request。 */
export interface RequestWithId extends Request {
  /** 本次请求的可信追踪 ID。 */
  requestId?: string;
}

/** 经过安全归一化、可直接返回给客户端的异常信息。 */
export interface ApiErrorDescriptor {
  /** 应写入 HTTP 响应的错误状态码。 */
  status: ErrorResultCode;
  /** 与 status 一致的响应体数字结果码。 */
  code: ErrorResultCode;
  /** 不包含调用栈和底层连接信息的用户提示。 */
  msg: string;
}

/**
 * 参考若依 ServiceException 的可控业务异常，由全局过滤器统一转换为响应。
 * @param code 数字错误码，同时决定 HTTP 状态码。
 * @param msg 可以安全返回给客户端的业务提示。
 */
export class ApiException extends HttpException {
  constructor(code: ErrorResultCode, msg: string) {
    super({ code, msg }, code);
  }
}

function isErrorResultCode(value: unknown): value is ErrorResultCode {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= ResultCode.BAD_REQUEST
    && value <= 599;
}

function getExceptionStatus(exception: unknown): ErrorResultCode {
  const rawStatus = exception instanceof HttpException
    ? exception.getStatus()
    : typeof exception === "object" && exception !== null && "status" in exception
      ? Number((exception as { status?: unknown }).status)
      : ResultCode.ERROR;
  return isErrorResultCode(rawStatus) ? rawStatus : ResultCode.ERROR;
}

/**
 * 读取或创建请求追踪 ID。仅接受有限字符的上游 ID，避免把任意请求头写回响应。
 * @param request 当前 Express 请求。
 */
export function getRequestId(request: RequestWithId): string {
  if (request.requestId) return request.requestId;
  const incoming = String(request.header("x-request-id") || "").trim();
  request.requestId = /^[A-Za-z0-9._:-]{1,128}$/.test(incoming)
    ? incoming
    : crypto.randomUUID();
  return request.requestId;
}

/**
 * 为请求和响应建立同一个追踪 ID。
 * @param request 当前 Express 请求。
 * @param response 当前 Express 响应。
 */
export function attachRequestId(request: RequestWithId, response: Response): string {
  const requestId = getRequestId(request);
  response.setHeader("X-Request-Id", requestId);
  return requestId;
}

/** 创建普通接口的若依风格成功响应。 */
export function createSuccessResponse<T>(data: T, requestId: string): ApiSuccessResponse<T> {
  return {
    code: ResultCode.SUCCESS,
    msg: "操作成功",
    data,
    requestId,
    timestamp: new Date().toISOString(),
  };
}

/** 创建普通接口或 Express 中间件使用的若依风格错误响应。 */
export function createErrorResponse(
  code: ErrorResultCode,
  msg: string,
  requestId: string,
): ApiErrorResponse {
  return {
    code,
    msg,
    data: null,
    requestId,
    timestamp: new Date().toISOString(),
  };
}

/**
 * 将 Nest 异常或普通运行时错误归一化为同值的 HTTP 状态码和响应体数字码。
 * @param exception Controller、Guard 或 Service 抛出的异常。
 */
export function resolveApiError(exception: unknown): ApiErrorDescriptor {
  const status = getExceptionStatus(exception);
  let msg = exception instanceof Error ? exception.message : "请求失败";

  if (exception instanceof HttpException) {
    const exceptionResponse = exception.getResponse();
    if (typeof exceptionResponse === "string") {
      msg = exceptionResponse;
    } else if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
      if ("msg" in exceptionResponse && typeof exceptionResponse.msg === "string") {
        msg = exceptionResponse.msg;
      } else if ("message" in exceptionResponse) {
        // 兼容 Nest 内置异常使用 message 字段或字符串数组的响应格式。
        const value = (exceptionResponse as { message?: string | string[] }).message;
        msg = Array.isArray(value) ? value.join("；") : value || msg;
      }
    }
  }

  // ApiException 的文案由业务代码显式声明；其他 5xx 可能包含数据库或上游连接细节。
  if (status >= ResultCode.ERROR && !(exception instanceof ApiException)) {
    msg = "服务暂时不可用，请稍后重试";
  }
  return { status, code: status, msg };
}
