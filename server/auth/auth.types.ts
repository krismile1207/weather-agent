import type { Request } from "express";

/** JWT 验签后附加到请求对象的用户身份。 */
export interface AuthenticatedUser {
  /** 数据库用户主键，也是长期记忆的租户隔离键。 */
  id: string;
  /** 规范化为小写的登录邮箱。 */
  email: string;
  /** 用户注册时填写的展示昵称。 */
  name: string;
}

/** 登录和注册接口接受的字段。 */
export interface CredentialsInput {
  /** 注册时必填的展示昵称，长度为 2～30 个字符。 */
  name?: unknown;
  /** 登录邮箱。 */
  email?: unknown;
  /** 明文密码，仅用于本次校验，长度为 8～72 个字符。 */
  password?: unknown;
}

/** 已通过 AuthGuard 的 Express 请求。 */
export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
