import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard.js";
import { getPublicModels } from "../config.js";

interface PublicModel {
  /** 服务端模型目录中的稳定 ID。 */
  id: string;
  /** 前端下拉框显示的名称。 */
  label: string;
  /** 模型能力或运行位置的简短说明。 */
  description: string;
  /** 服务端是否具备调用该模型所需的配置。 */
  configured: boolean;
}

@Controller("models")
@UseGuards(AuthGuard)
export class ModelsController {
  @Get()
  list(): { models: PublicModel[] } {
    return { models: getPublicModels() };
  }
}
