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
  | { type: "delta"; content: string }
  | { type: "done"; title: string }
  | { type: "error"; message: string };
