import { ResultCode, type ErrorResultCode } from "../common/api-response.js";

/** 聊天接口接受的数据。 */
export interface ChatInput {
  /** 当前用户拥有的会话 UUID。 */
  conversationId?: unknown;
  /** 模型目录中的模型 ID。 */
  modelId?: unknown;
  /** 用户消息，去除首尾空白后长度必须为 1～2000。 */
  message?: unknown;
}

/** 服务端以 NDJSON 发送给前端的聊天流事件。 */
export type ChatStreamEvent =
  | {
      /** 增量文本事件。 */
      type: "delta";
      /** 本次生成的自然语言片段。 */
      content: string;
    }
  | {
      type: "done";
      /** 流正常结束时固定为 200。 */
      code: typeof ResultCode.SUCCESS;
      /** 根据首条用户消息生成的会话标题。 */
      title: string;
      /** 与响应头一致的请求追踪 ID。 */
      requestId: string;
      /** 流结束事件生成时的 ISO 8601 时间。 */
      timestamp: string;
    }
  | {
      type: "error";
      /** 流开始后发生错误时与 HTTP 语义一致的数字结果码。 */
      code: ErrorResultCode;
      /** 可以安全展示给用户的错误说明。 */
      msg: string;
      /** 与响应头一致的请求追踪 ID。 */
      requestId: string;
      /** 错误事件生成时的 ISO 8601 时间。 */
      timestamp: string;
    };
