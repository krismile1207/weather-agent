/** 会话列表和创建接口返回的公开字段。 */
export interface Conversation {
  /** 会话 UUID。 */
  id: string;
  /** 由首条消息生成的标题。 */
  title: string;
  /** 当前会话最近使用的服务端模型 ID。 */
  modelId: string;
  /** ISO 时间或 PostgreSQL 驱动返回的日期值。 */
  createdAt?: Date | string;
  /** ISO 时间或 PostgreSQL 驱动返回的日期值。 */
  updatedAt?: Date | string;
}

/** 创建会话接口接受的数据。 */
export interface CreateConversationInput {
  /** 可选模型 ID；省略时使用服务端默认模型。 */
  modelId?: unknown;
}
